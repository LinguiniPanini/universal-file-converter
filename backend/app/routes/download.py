"""
Modulo de ruta para descarga de archivos convertidos.

Este archivo define el endpoint GET /api/download/{job_id}, que es el
TERCER y ultimo paso en el flujo del convertidor:

    1. POST /api/upload   -> Sube archivo original
    2. POST /api/convert  -> Convierte a nuevo formato
    3. GET  /api/download  -> Descarga archivo convertido  [ESTE ARCHIVO]

Este es el endpoint mas SIMPLE de los tres porque solo necesita:
1. Validar el job_id
2. Buscar el archivo convertido en S3
3. Retornarlo como descarga

Conceptos HTTP importantes:
----------------------------
- **Content-Disposition: attachment**: Este header HTTP le dice al navegador
  que debe DESCARGAR el archivo en vez de intentar mostrarlo en la pagina.
  Sin este header, el navegador podria intentar abrir un PDF en una pestana
  nueva o mostrar una imagen inline.

- **media_type: application/octet-stream**: Este tipo MIME generico le dice
  al navegador "estos son datos binarios, no intentes interpretarlos".
  Es el tipo MIME mas seguro para descargas porque evita que el navegador
  ejecute contenido potencialmente peligroso.

- **Path parameter {job_id}**: En la URL "/api/download/{job_id}", el
  {job_id} es un parametro de ruta (path parameter). FastAPI lo extrae
  automaticamente de la URL y lo pasa como argumento a la funcion.
  Ejemplo: GET /api/download/abc-123 -> job_id = "abc-123"

Seguridad implementada:
-----------------------
- Validacion de UUID: Igual que en convert.py, para prevenir path traversal.
- Solo archivos convertidos: Busca en "converted/" (no en "uploads/"),
  asi el usuario no puede descargar archivos de otros usuarios.
"""

# re: para validar el formato UUID del job_id
import re

from fastapi import APIRouter, HTTPException

# Response: clase de FastAPI/Starlette que permite construir respuestas
# HTTP personalizadas con control total sobre headers, media type, y body.
# La usamos en vez de retornar un dict porque necesitamos headers especiales
# (Content-Disposition) y retornar bytes crudos en vez de JSON.
from fastapi.responses import Response

from app.services.s3 import s3_service

router = APIRouter()

# Patron UUID: mismo regex que en convert.py.
# Lo duplicamos aqui en vez de importarlo porque:
# 1. Cada modulo es independiente y auto-contenido
# 2. No crea una dependencia circular entre routes
# 3. Es una constante simple, no logica duplicada
# En un proyecto mas grande, lo pondriamos en un modulo utils/ compartido.
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


@router.get("/api/download/{job_id}")
async def download_file(job_id: str):
    """
    Endpoint para descargar un archivo convertido.

    El job_id viene como parametro en la URL (path parameter).
    FastAPI lo extrae automaticamente y lo pasa como argumento.

    Flujo detallado:
    1. Valida que job_id tenga formato UUID
    2. Busca archivos bajo "converted/{job_id}/" en S3
    3. Descarga el archivo
    4. Retorna como respuesta HTTP con headers de descarga

    Parametros:
        job_id (str): UUID del trabajo, extraido de la URL.
            Ejemplo: Si la URL es /api/download/abc-123, job_id = "abc-123"

    Retorna:
        Response: Respuesta HTTP con:
            - content: Los bytes del archivo
            - media_type: "application/octet-stream" (descarga binaria)
            - Content-Disposition: header que fuerza descarga con nombre de archivo

    Raises:
        HTTPException(400): Si el job_id no es un UUID valido.
        HTTPException(404): Si no se encuentra un archivo convertido para ese job_id.
        HTTPException(500): Si hay un error al descargar de S3.

    Nota: Este endpoint NO tiene rate limiting porque las descargas
    son menos peligrosas que los uploads/conversiones (no consumen CPU
    de conversion ni almacenamiento adicional). Sin embargo, en produccion
    podrias agregar rate limiting para prevenir descargas masivas automatizadas.
    """

    # --- Paso 1: Validar formato del job_id ---
    # SEGURIDAD: Misma validacion que en convert.py.
    # Previene que un atacante envie paths maliciosos como job_id.
    if not UUID_PATTERN.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID format")

    try:
        # --- Paso 2: Buscar el archivo convertido en S3 ---
        # Buscamos bajo el prefijo "converted/{job_id}/" para encontrar
        # el archivo convertido. Similar al patron usado en convert.py.
        key_prefix = f"converted/{job_id}/"
        objects = s3_service.client.list_objects_v2(
            Bucket=s3_service.bucket, Prefix=key_prefix
        )

        # Verificamos que exista al menos un archivo bajo este prefijo.
        # Si el usuario no ha convertido el archivo aun (o el job_id no existe),
        # "Contents" no estara en la respuesta.
        if "Contents" not in objects or not objects["Contents"]:
            raise HTTPException(status_code=404, detail="Converted file not found")

        # --- Paso 3: Descargar el archivo ---
        # Tomamos el primer archivo encontrado y extraemos su nombre.
        file_key = objects["Contents"][0]["Key"]
        # split("/")[-1] extrae el nombre del archivo del key de S3.
        # Ejemplo: "converted/abc-123/converted.pdf" -> "converted.pdf"
        filename = file_key.split("/")[-1]
        data = s3_service.download(file_key)

        # --- Paso 4: Retornar como descarga ---
        # Construimos una respuesta HTTP personalizada:
        return Response(
            # content: Los bytes crudos del archivo (no JSON)
            content=data,
            # media_type: "application/octet-stream" es el tipo MIME generico
            # para datos binarios. Le dice al navegador "esto es un archivo
            # para descargar, no para mostrar".
            media_type="application/octet-stream",
            headers={
                # Content-Disposition: "attachment" fuerza la descarga.
                # filename="..." sugiere el nombre del archivo al navegador.
                # Las comillas alrededor del filename son importantes para
                # manejar nombres con espacios o caracteres especiales.
                "Content-Disposition": f'attachment; filename="{filename}"'
            },
        )
    except HTTPException:
        # Re-lanzamos nuestras propias excepciones HTTP
        raise
    except Exception as e:
        # Cualquier error inesperado (ej: S3 no disponible)
        # se convierte en HTTP 500.
        raise HTTPException(status_code=500, detail=f"Download failed: {e}")
