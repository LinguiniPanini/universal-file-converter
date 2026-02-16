"""
Modulo de ruta para conversion de archivos.

Este archivo define el endpoint POST /api/convert, que es el SEGUNDO paso
en el flujo del convertidor:

    1. POST /api/upload   -> Sube archivo original
    2. POST /api/convert  -> Convierte a nuevo formato  [ESTE ARCHIVO]
    3. GET  /api/download  -> Descarga archivo convertido

Este es el endpoint mas COMPLEJO de la API porque:
1. Descarga el archivo original de S3
2. Detecta el tipo de conversion necesaria
3. Enruta al conversor correcto (imagenes vs documentos)
4. Sube el resultado a S3
5. Retorna los datos del archivo convertido

Patron de diseno: Strategy Pattern (simplificado)
--------------------------------------------------
El endpoint actua como un "dispatcher" que selecciona la estrategia
de conversion correcta basandose en el tipo MIME de origen y destino.
En vez de tener un solo metodo gigante con toda la logica, delegamos
a funciones especializadas:
    - convert_image() para conversiones entre formatos de imagen
    - compress_image() para compresion JPEG
    - resize_image() para redimensionamiento
    - strip_metadata() para eliminar EXIF
    - markdown_to_pdf() para Markdown -> PDF
    - docx_to_pdf() para Word -> PDF
    - pdf_to_markdown() para PDF -> Markdown

Seguridad implementada:
-----------------------
- Validacion de UUID: Verifica que el job_id tenga formato UUID valido
  antes de usarlo en consultas a S3 (previene injection attacks).
- Rate limiting: Maximo 10 conversiones por minuto por IP.
- Fallback de deteccion: Si la metadata de S3 no tiene el tipo MIME,
  lo re-detecta con python-magic.
"""

# re: modulo de expresiones regulares. Lo usamos para validar el formato UUID.
import re

# python-magic: como fallback para deteccion de tipo MIME.
# Normalmente usamos la metadata de S3, pero si por alguna razon
# no esta disponible, re-detectamos el tipo MIME con magic bytes.
import magic  # fallback only

from fastapi import APIRouter, HTTPException

# Request de Starlette: necesario para el rate limiter
from starlette.requests import Request

from app.limiter import limiter
from app.models.schemas import ConvertRequest, ConvertResponse

# Importamos todas las funciones de conversion de imagenes
from app.services.image_converter import (
    MIME_TO_EXT,
    compress_image,
    convert_image,
    resize_image,
    strip_metadata,
)

# Importamos todas las funciones de conversion de documentos
from app.services.document_converter import (
    docx_to_pdf,
    markdown_to_pdf,
    pdf_to_markdown,
)

from app.services.s3 import s3_service

router = APIRouter()

# ---------- Constantes de validacion y enrutamiento ----------

# Patron de expresion regular para validar UUIDs v4.
# Formato: 8-4-4-4-12 caracteres hexadecimales (0-9, a-f)
# Ejemplo valido: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
# Ejemplo invalido: "no-es-un-uuid", "../../hack"
#
# SEGURIDAD: Validamos el job_id ANTES de usarlo en la consulta a S3.
# Si no validamos, un atacante podria enviar un job_id malicioso como
# "../../admin/secrets" que podria manipular la key de S3.
# Al forzar formato UUID, solo permitimos caracteres seguros (hex + guiones).
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)

# Conjuntos (sets) de tipos MIME agrupados por categoria.
# Los usamos para determinar QUE conversor usar segun el tipo de archivo.
# Sets son ideales para verificar membresìa (operacion "in") con O(1).
IMAGE_MIMES = {"image/png", "image/jpeg", "image/webp"}
DOC_MIMES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/markdown",
    "text/plain",
}

# Mapea tipo MIME de destino a extension de archivo para el nombre de salida.
# Ejemplo: si target_mime es "application/pdf", el archivo se llama "converted.pdf"
TARGET_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "text/markdown": ".md",
}


@router.post("/api/convert", response_model=ConvertResponse)
@limiter.limit("10/minute")
async def convert_file(request: Request, req: ConvertRequest):
    """
    Endpoint para convertir un archivo previamente subido.

    Flujo detallado:
    1. Valida el formato del job_id (debe ser UUID)
    2. Busca y descarga el archivo original de S3
    3. Obtiene el tipo MIME del archivo original (metadata o magic bytes)
    4. Selecciona el conversor adecuado segun source_mime -> target_mime
    5. Ejecuta la conversion
    6. Sube el resultado a S3
    7. Retorna ConvertResponse con job_id, download_filename, size

    Parametros:
        request (Request): Objeto HTTP request (requerido por SlowAPI).
        req (ConvertRequest): Body JSON con job_id, target_format, y options.
            FastAPI automaticamente parsea el JSON del body y lo valida
            contra el schema ConvertRequest.

    Retorna:
        ConvertResponse: JSON con job_id, download_filename, size.

    Raises:
        HTTPException(400): Si el job_id no es un UUID valido, o la
            conversion solicitada no esta soportada.
        HTTPException(404): Si el archivo no se encuentra en S3.
        HTTPException(500): Si la conversion falla por un error interno.
    """

    # --- Paso 1: Validar formato del job_id ---
    # SEGURIDAD: Verificamos que el job_id sea un UUID valido antes de
    # usarlo en la consulta a S3. Esto previene inyeccion de paths maliciosos.
    if not UUID_PATTERN.match(req.job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID format")

    # --- Paso 2: Descargar el archivo original de S3 ---
    try:
        # Construimos el prefijo para buscar el archivo en S3.
        # Usamos list_objects_v2 con Prefix porque no sabemos el nombre
        # exacto del archivo (el usuario pudo haberlo llamado de cualquier forma).
        # El prefijo "uploads/{job_id}/" matchea todos los objetos bajo ese "directorio".
        key = f"uploads/{req.job_id}/"
        objects = s3_service.client.list_objects_v2(
            Bucket=s3_service.bucket, Prefix=key
        )

        # list_objects_v2 retorna "Contents" solo si hay objetos que matcheen.
        # Si no hay match, "Contents" no existe en la respuesta.
        if "Contents" not in objects or not objects["Contents"]:
            raise HTTPException(status_code=404, detail="File not found")

        # Tomamos el primer (y en teoria unico) archivo bajo este prefijo.
        # En nuestro diseno, cada job_id tiene exactamente un archivo original.
        file_key = objects["Contents"][0]["Key"]
        data = s3_service.download(file_key)
    except HTTPException:
        # Re-lanzamos HTTPExceptions que nosotros mismos generamos
        # para que no sean capturadas por el except Exception generico.
        raise
    except Exception as e:
        # Cualquier otro error (ej: S3 no disponible, error de red)
        # se convierte en un 404 con el mensaje de error.
        raise HTTPException(status_code=404, detail=f"File not found: {e}")

    # --- Paso 3: Obtener tipo MIME del archivo original ---
    # Primero intentamos obtener el tipo MIME de la metadata de S3
    # (fue guardada en el upload). Esto es mas rapido y confiable
    # porque ya lo validamos durante la subida.
    metadata = s3_service.get_metadata(file_key)
    source_mime = metadata.get("mime-type")
    if not source_mime:
        # Fallback: si la metadata no tiene el tipo MIME (ej: el objeto
        # fue subido por otro medio), lo re-detectamos con magic bytes.
        # Esto es una medida de resiliencia: la app sigue funcionando
        # incluso si la metadata se pierde.
        source_mime = magic.from_buffer(data, mime=True)

    target_mime = req.target_format
    options = req.options

    # --- Paso 4: Enrutar al conversor correcto ---
    # Este bloque implementa un patron similar al "Strategy Pattern":
    # segun la combinacion de source_mime + target_mime + options,
    # delegamos a la funcion de conversion apropiada.
    #
    # El orden de los elif es IMPORTANTE:
    # 1. Primero verificamos conversiones de imagen a imagen
    # 2. Luego acciones especiales de imagen (compress, resize, strip_metadata)
    # 3. Despues conversiones de documentos
    # 4. Finalmente, si nada matchea, retornamos error 400
    try:
        # Conversion de imagen a imagen (ej: PNG -> JPEG, WebP -> PNG)
        if source_mime in IMAGE_MIMES and target_mime in IMAGE_MIMES:
            result = convert_image(data, source_mime, target_mime)

        # Compresion de imagen (reduce calidad para menor tamano)
        elif source_mime in IMAGE_MIMES and options.get("action") == "compress":
            result = compress_image(data, quality=options.get("quality", 70))
            # La compresion siempre produce JPEG (porque es el formato
            # con mejor soporte de compresion con perdida)
            target_mime = "image/jpeg"

        # Redimensionamiento de imagen
        elif source_mime in IMAGE_MIMES and options.get("action") == "resize":
            result = resize_image(data, options["width"], options["height"])
            # Mantenemos el formato original (el usuario solo quiere cambiar tamano)
            target_mime = source_mime

        # Eliminacion de metadata EXIF (GPS, camara, etc.)
        elif source_mime in IMAGE_MIMES and options.get("action") == "strip_metadata":
            result = strip_metadata(data)
            # Mantenemos el formato original
            target_mime = source_mime

        # Markdown/Texto plano -> PDF
        elif source_mime in ("text/markdown", "text/plain") and target_mime == "application/pdf":
            result = markdown_to_pdf(data)

        # DOCX (Word) -> PDF
        elif source_mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" and target_mime == "application/pdf":
            result = docx_to_pdf(data)

        # PDF -> Markdown (extraccion de texto)
        elif source_mime == "application/pdf" and target_mime == "text/markdown":
            result = pdf_to_markdown(data)

        # Conversion no soportada
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Conversion from '{source_mime}' to '{target_mime}' is not supported",
            )
    except HTTPException:
        # Re-lanzamos nuestras propias excepciones HTTP
        raise
    except Exception as e:
        # Cualquier error inesperado durante la conversion
        # (ej: imagen corrupta, LibreOffice no instalado)
        # se convierte en HTTP 500 con el mensaje de error.
        raise HTTPException(status_code=500, detail=f"Conversion failed: {e}")

    # --- Paso 5: Generar nombre de archivo y subir resultado ---
    # Determinamos la extension del archivo de salida segun el tipo MIME.
    # .get() con default ".bin" es un fallback para tipos no mapeados
    # (aunque en teoria no deberia llegar aqui un tipo no mapeado).
    ext = TARGET_EXTENSIONS.get(target_mime, ".bin")
    output_filename = f"converted{ext}"

    # Subimos el archivo convertido a S3 bajo el prefijo "converted/"
    s3_service.upload_converted(result, req.job_id, output_filename)

    # --- Paso 6: Retornar respuesta ---
    return ConvertResponse(
        job_id=req.job_id,
        download_filename=output_filename,
        size=len(result),
    )
