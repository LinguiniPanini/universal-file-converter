"""
Modulo de esquemas (schemas) de datos de la API.

Este archivo define la ESTRUCTURA EXACTA de los datos que entran y salen
de nuestra API, usando Pydantic. Es el "contrato" entre el frontend y
el backend: ambos lados saben exactamente que datos esperar.

Por que usar Pydantic?
----------------------
1. **Validacion automatica:** Si el frontend envia un campo con tipo
   incorrecto (ej: un string donde esperabas un int), Pydantic rechaza
   la peticion automaticamente con un error 422 (Unprocessable Entity)
   y un mensaje descriptivo. No necesitas escribir validacion manual.

2. **Documentacion automatica:** FastAPI usa estos schemas para generar
   la documentacion Swagger UI (/docs). Cada campo aparece documentado
   con su tipo y si es obligatorio u opcional.

3. **Serializacion/Deserializacion:** Pydantic convierte automaticamente
   entre JSON (lo que viaja por HTTP) y objetos Python (lo que usa tu codigo).

Patron de diseno: Data Transfer Objects (DTOs)
----------------------------------------------
Estos schemas son DTOs: objetos cuyo unico proposito es transportar datos
entre capas de la aplicacion. No contienen logica de negocio, solo definen
la estructura de los datos.

Flujo tipico:
    JSON del cliente -> Pydantic valida -> Objeto Python -> Tu logica -> Pydantic serializa -> JSON de respuesta
"""

# BaseModel es la clase base de Pydantic. Todos nuestros schemas heredan
# de ella para obtener validacion automatica, serializacion JSON, y
# generacion de JSON Schema (usado por Swagger UI).
from pydantic import BaseModel


class UploadResponse(BaseModel):
    """
    Schema de respuesta para el endpoint POST /api/upload.

    Se retorna al cliente despues de subir exitosamente un archivo.
    Contiene la informacion que el frontend necesita para:
    1. Mostrar al usuario que su archivo fue aceptado (filename, size)
    2. Solicitar la conversion (job_id es necesario para /api/convert)
    3. Mostrar el tipo detectado del archivo (mime_type)

    Atributos:
        job_id (str): Identificador unico (UUID v4) asignado al trabajo.
            Este ID es la "llave" que conecta la subida, conversion y
            descarga. Sin el, no puedes acceder al archivo.
        filename (str): Nombre del archivo sanitizado (sin rutas maliciosas).
        mime_type (str): Tipo MIME real detectado por magic bytes, NO el
            Content-Type enviado por el cliente (que podria ser falso).
        size (int): Tamano del archivo en bytes. Util para mostrar al
            usuario "Archivo subido: 2.3 MB".
    """
    job_id: str
    filename: str
    mime_type: str
    size: int


class ConvertRequest(BaseModel):
    """
    Schema de peticion para el endpoint POST /api/convert.

    Define lo que el cliente debe enviar para solicitar una conversion.

    Atributos:
        job_id (str): UUID del trabajo (obtenido de la respuesta de /api/upload).
            Identifica QUE archivo convertir.
        target_format (str): Tipo MIME del formato de salida deseado.
            Ejemplos: "image/png", "application/pdf", "text/markdown".
            Define A QUE formato convertir.
        options (dict): Opciones adicionales de conversion (opcional).
            Permite personalizar la conversion sin crear endpoints separados.
            Ejemplos:
                {"action": "compress", "quality": 50}  -> comprimir imagen
                {"action": "resize", "width": 800, "height": 600}  -> redimensionar
                {"action": "strip_metadata"}  -> eliminar metadatos EXIF
            Por defecto es un diccionario vacio {} (sin opciones extra).
    """
    job_id: str
    target_format: str
    # dict = {} significa que el campo es opcional con valor por defecto
    # de diccionario vacio. Si el cliente no envia "options", sera {}.
    options: dict = {}


class ConvertResponse(BaseModel):
    """
    Schema de respuesta para el endpoint POST /api/convert.

    Se retorna al cliente despues de completar la conversion exitosamente.

    Atributos:
        job_id (str): El mismo UUID del trabajo. El frontend lo usa para
            construir la URL de descarga: /api/download/{job_id}
        download_filename (str): Nombre del archivo convertido (ej: "converted.pdf").
            El frontend puede mostrarlo al usuario o usarlo como nombre
            sugerido de descarga.
        size (int): Tamano del archivo convertido en bytes. Util para
            mostrar al usuario cuanto peso el resultado y comparar con
            el original (ej: "Comprimido de 5MB a 1.2MB").
    """
    job_id: str
    download_filename: str
    size: int


class ErrorResponse(BaseModel):
    """
    Schema estandar para respuestas de error.

    Todas las respuestas de error de nuestra API siguen este formato.
    Esto es importante para que el frontend sepa SIEMPRE como interpretar
    un error, sin importar de que endpoint venga.

    Patron de diseno: Respuesta de error uniforme.
    En lugar de que cada endpoint retorne errores con formatos distintos,
    todos usan la misma estructura. El frontend solo necesita verificar
    response.detail para obtener el mensaje de error.

    Atributos:
        detail (str): Mensaje de error legible para el usuario.
            Ejemplos:
                "File size exceeds 50MB limit"
                "File type 'application/x-executable' is not allowed"
                "Conversion from 'image/png' to 'application/pdf' is not supported"
    """
    detail: str
