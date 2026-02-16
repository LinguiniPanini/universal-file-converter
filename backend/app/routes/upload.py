"""
Modulo de ruta para subida de archivos (upload).

Este archivo define el endpoint POST /api/upload, que es el PRIMER paso
en el flujo del convertidor:

    1. POST /api/upload   -> Sube archivo original     [ESTE ARCHIVO]
    2. POST /api/convert  -> Convierte a nuevo formato
    3. GET  /api/download  -> Descarga archivo convertido

Responsabilidades de este endpoint:
1. Recibir el archivo del cliente (multipart/form-data)
2. Validar tamano ANTES de cargar todo en memoria (defensa temprana)
3. Sanitizar el nombre del archivo (prevencion de ataques de path traversal)
4. Validar el tipo de archivo (magic bytes + extension)
5. Generar un UUID unico para este trabajo (job_id)
6. Subir el archivo a S3
7. Retornar los datos del trabajo al cliente

Seguridad implementada:
-----------------------
- Lectura parcial: Lee MAX_FILE_SIZE + 1 bytes para detectar archivos
  gigantes sin cargarlos completamente en memoria.
- Sanitizacion de filename: Usa os.path.basename() para prevenir
  path traversal (ej: "../../etc/passwd" -> "passwd").
- Validacion por magic bytes: No confia en el Content-Type HTTP.
- Rate limiting: Maximo 10 uploads por minuto por IP.
- UUID v4: Identificadores impredecibles para cada trabajo.
"""

# os: usado para os.path.basename() que sanitiza el nombre del archivo
import os

# uuid: genera identificadores unicos universales (UUID v4).
# UUID v4 usa numeros aleatorios, lo que los hace impredecibles.
# Ejemplo: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
# Hay 2^122 (~5.3 x 10^36) UUIDs posibles, haciendo colisiones
# practicamente imposibles.
import uuid

# APIRouter: permite agrupar endpoints relacionados.
# File: marcador de FastAPI para indicar que un parametro viene como
#   multipart/form-data (un archivo subido).
# HTTPException: para retornar errores HTTP con codigo y mensaje.
# UploadFile: wrapper de FastAPI alrededor del archivo subido que
#   proporciona metodos async (read, seek, etc.) y metadata (filename,
#   content_type, etc.).
from fastapi import APIRouter, File, HTTPException, UploadFile

# Request de Starlette: necesario para el rate limiter.
# SlowAPI necesita acceso al objeto Request para extraer la IP del cliente.
from starlette.requests import Request

from app.config import settings
from app.limiter import limiter
from app.models.schemas import UploadResponse
from app.services.s3 import s3_service
from app.services.validator import validate_file

# Creamos un router para agrupar los endpoints de upload.
# En main.py se "monta" este router en la app con app.include_router().
# Esto permite separar la logica en archivos distintos (modularidad).
router = APIRouter()


@router.post("/api/upload", response_model=UploadResponse)
@limiter.limit("10/minute")
async def upload_file(request: Request, file: UploadFile = File(...)):
    """
    Endpoint para subir un archivo al servidor.

    Flujo detallado:
    1. Recibe archivo via HTTP POST (multipart/form-data)
    2. Lee hasta MAX_FILE_SIZE + 1 bytes (para detectar archivos muy grandes)
    3. Sanitiza el nombre del archivo
    4. Valida tipo MIME y extension
    5. Genera UUID unico (job_id)
    6. Sube a S3 con metadata del tipo MIME
    7. Retorna UploadResponse con job_id, filename, mime_type, size

    Parametros:
        request (Request): Objeto de peticion HTTP. Requerido por SlowAPI
            para extraer la IP del cliente y aplicar rate limiting.
            Nota: No lo usamos directamente, pero DEBE estar en la firma
            de la funcion para que SlowAPI funcione.
        file (UploadFile): Archivo subido por el cliente. File(...) indica
            que es OBLIGATORIO (el "..." es la forma de Pydantic/FastAPI
            de decir "este campo es requerido").

    Retorna:
        UploadResponse: JSON con job_id, filename, mime_type, size.

    Raises:
        HTTPException(413): Si el archivo excede el tamano maximo.
        HTTPException(400): Si el archivo no pasa la validacion.
        HTTPException(429): Si el cliente excede el rate limit (manejado por SlowAPI).

    Decoradores:
        @router.post: Registra este endpoint para peticiones HTTP POST.
            response_model=UploadResponse le dice a FastAPI:
            - Valida que la respuesta tenga la estructura correcta
            - Genera documentacion en Swagger con este schema
            - Serializa automaticamente el objeto a JSON
        @limiter.limit("10/minute"): Permite maximo 10 llamadas por
            minuto por IP. Si se excede, retorna HTTP 429.
    """

    # --- Paso 1: Leer el archivo de forma segura ---
    # Leemos MAX_FILE_SIZE + 1 bytes en vez del archivo completo.
    # Por que +1? Si logramos leer mas de MAX_FILE_SIZE bytes, sabemos
    # que el archivo es demasiado grande. De esta forma, nunca cargamos
    # un archivo de 10GB completo en memoria; a lo mucho leemos 50MB + 1 byte.
    # Esto es una tecnica de defensa llamada "early rejection" o "fail fast".
    data = await file.read(settings.MAX_FILE_SIZE + 1)
    if len(data) > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File size exceeds {settings.MAX_FILE_SIZE // (1024 * 1024)}MB limit",
        )

    # --- Paso 2: Sanitizar el nombre del archivo ---
    # os.path.basename() extrae solo el nombre del archivo, eliminando
    # cualquier ruta. Esto previene ataques de "path traversal":
    #   "../../etc/passwd" -> "passwd"
    #   "/root/.ssh/id_rsa" -> "id_rsa"
    #   "normal_file.png" -> "normal_file.png"
    #
    # Sin esta sanitizacion, un atacante podria intentar escribir archivos
    # en ubicaciones arbitrarias del servidor (aunque S3 mitiga esto tambien,
    # es mejor prevenir en todas las capas: defensa en profundidad).
    safe_filename = os.path.basename(file.filename or "unknown")

    # --- Paso 3: Validar el archivo ---
    # validate_file verifica: tamano, tipo MIME (magic bytes), y extension.
    # Si falla, retorna un ValidationResult con is_valid=False y un error.
    result = validate_file(data, safe_filename)
    if not result.is_valid:
        raise HTTPException(status_code=400, detail=result.error)

    # --- Paso 4: Generar identificador unico ---
    # uuid.uuid4() genera un UUID version 4 (basado en numeros aleatorios).
    # Lo convertimos a string para usarlo en S3 keys y URLs.
    # Este job_id es lo que conecta upload -> convert -> download.
    # Sin el, el usuario no puede acceder a su archivo.
    job_id = str(uuid.uuid4())

    # --- Paso 5: Subir a S3 ---
    # Subimos el archivo con metadata del tipo MIME detectado.
    # Guardamos el tipo MIME en metadata de S3 para no tener que
    # re-detectarlo cuando el usuario solicite la conversion.
    # La metadata se almacena como headers HTTP en S3 (x-amz-meta-*).
    s3_service.upload(data, job_id, safe_filename, metadata={"mime-type": result.mime_type})

    # --- Paso 6: Retornar respuesta ---
    # FastAPI automaticamente convierte este objeto Pydantic a JSON.
    # El response_model=UploadResponse en el decorador asegura que
    # la respuesta tenga exactamente los campos esperados.
    return UploadResponse(
        job_id=job_id,
        filename=safe_filename,
        mime_type=result.mime_type,
        size=len(data),
    )
