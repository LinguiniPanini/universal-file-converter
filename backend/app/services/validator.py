"""
Modulo de validacion de archivos.

Este servicio es la PRIMERA linea de defensa contra archivos maliciosos.
Verifica tres cosas antes de aceptar un archivo:
1. Que no exceda el tamano maximo (50MB)
2. Que su tipo MIME real (detectado por magic bytes) sea permitido
3. Que la extension del archivo coincida con su tipo MIME real

Por que no confiamos en el Content-Type del request HTTP?
---------------------------------------------------------
Porque el cliente puede enviarlo como quiera. Un atacante podria enviar
un ejecutable (.exe) con Content-Type: image/png. Por eso usamos
python-magic, que lee los primeros bytes del archivo (magic bytes /
file signature) para determinar el tipo real.

Que son los "magic bytes"?
--------------------------
Cada formato de archivo tiene una "firma" unica en sus primeros bytes:
    - PNG: empieza con 89 50 4E 47 (los bytes hexadecimales)
    - JPEG: empieza con FF D8 FF
    - PDF: empieza con 25 50 44 46 (que es "%PDF" en ASCII)
La libreria python-magic lee estos bytes y los compara contra una base
de datos de firmas conocidas. Es el mismo mecanismo que usa el comando
`file` de Linux.

Por que validar TAMBIEN la extension?
--------------------------------------
Porque un atacante podria renombrar "virus.exe" a "virus.png". En ese
caso, los magic bytes revelarian que es un ejecutable (no coincide con
la extension .png) y lo rechazariamos. La doble validacion
(magic bytes + extension) es una practica de defensa en profundidad.

Patron de diseno: Resultado como dataclass
------------------------------------------
En vez de retornar una tupla o lanzar excepciones, usamos una dataclass
ValidationResult que encapsula:
    - is_valid: booleano (paso la validacion o no?)
    - mime_type: el tipo detectado (util para el caller)
    - error: mensaje de error (vacio si es valido)
Esto facilita el manejo de errores en el caller sin try/except.
"""

# dataclass es un decorador de Python 3.7+ que genera automaticamente
# __init__, __repr__, __eq__ y otros metodos especiales para clases
# que principalmente almacenan datos. Evita escribir boilerplate.
from dataclasses import dataclass

# python-magic: libreria que detecta tipos MIME usando libmagic (la misma
# libreria C que usa el comando `file` de Linux). Es mucho mas confiable
# que mirar la extension del archivo o confiar en el Content-Type HTTP.
import magic

# Importamos la configuracion para acceder a MAX_FILE_SIZE y ALLOWED_MIME_TYPES
from app.config import settings


@dataclass
class ValidationResult:
    """
    Resultado de la validacion de un archivo.

    Usamos un dataclass en vez de un simple booleano porque el caller
    necesita saber no solo SI fallo, sino POR QUE fallo y cual es el
    tipo MIME detectado.

    Atributos:
        is_valid (bool): True si el archivo paso todas las validaciones.
        mime_type (str): Tipo MIME real detectado por magic bytes.
            Se retorna incluso si la validacion falla, para que el caller
            pueda incluirlo en el mensaje de error.
        error (str): Descripcion del error si is_valid es False.
            Esta vacio ("") si is_valid es True.
    """
    is_valid: bool
    mime_type: str = ""
    error: str = ""


def validate_file(data: bytes, filename: str) -> ValidationResult:
    """
    Valida un archivo por su tipo MIME real (magic bytes) y tamano.

    Realiza tres validaciones en orden de costo computacional
    (de mas barato a mas caro):

    1. Tamano: Solo compara un entero (O(1), instantaneo)
    2. Tipo MIME: Lee los primeros bytes del archivo (muy rapido)
    3. Extension: Compara strings (instantaneo)

    Este orden es intencional: si el archivo es demasiado grande, no
    gastamos tiempo detectando su tipo MIME.

    Parametros:
        data (bytes): Contenido completo del archivo en bytes.
        filename (str): Nombre del archivo (ya sanitizado por el caller).
            Se usa para extraer la extension y validarla.

    Retorna:
        ValidationResult: Objeto con is_valid, mime_type, y error.

    Ejemplos:
        >>> validate_file(b"\\x89PNG...", "foto.png")
        ValidationResult(is_valid=True, mime_type="image/png", error="")

        >>> validate_file(b"MZ...", "virus.png")  # .exe renombrado
        ValidationResult(is_valid=False, mime_type="application/x-dosexec",
                        error="File type 'application/x-dosexec' is not allowed")
    """

    # --- Validacion 1: Tamano del archivo ---
    # Verificamos PRIMERO el tamano porque es la operacion mas barata
    # (solo comparar un entero) y evita procesar archivos enormes.
    if len(data) > settings.MAX_FILE_SIZE:
        return ValidationResult(
            is_valid=False,
            error=f"File size exceeds {settings.MAX_FILE_SIZE // (1024 * 1024)}MB limit",
        )

    # --- Validacion 2: Tipo MIME real (magic bytes) ---
    # magic.from_buffer() lee los primeros bytes del archivo y los compara
    # con su base de datos de firmas para determinar el tipo real.
    # El parametro mime=True indica que queremos el tipo MIME (ej: "image/png")
    # en vez de la descripcion larga (ej: "PNG image data, 800 x 600, ...").
    mime_type = magic.from_buffer(data, mime=True)

    # Verificamos si el tipo MIME detectado esta en nuestra lista blanca.
    # Si no esta, el archivo no es de un tipo que soportemos.
    if mime_type not in settings.ALLOWED_MIME_TYPES:
        return ValidationResult(
            is_valid=False,
            mime_type=mime_type,
            error=f"File type '{mime_type}' is not allowed",
        )

    # --- Validacion 3: Concordancia extension <-> tipo MIME ---
    # Extraemos la extension del nombre del archivo.
    # rsplit(".", 1) divide desde la derecha, maximo 1 vez:
    #   "foto.png"     -> ["foto", "png"]     -> ".png"
    #   "mi.foto.jpg"  -> ["mi.foto", "jpg"]  -> ".jpg"
    #   "sin_extension" -> ["sin_extension"]   -> "" (no tiene punto)
    # Esto previene ataques donde alguien sube "malware.exe" renombrado
    # como "malware.png". Los magic bytes dirian "application/x-dosexec"
    # pero la extension diria ".png". Esa discrepancia = archivo rechazado.
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    allowed_extensions = settings.ALLOWED_MIME_TYPES[mime_type]
    if ext not in allowed_extensions:
        return ValidationResult(
            is_valid=False,
            mime_type=mime_type,
            error=f"Extension '{ext}' does not match detected type '{mime_type}'",
        )

    # Si llegamos aqui, el archivo paso las 3 validaciones exitosamente.
    return ValidationResult(is_valid=True, mime_type=mime_type)
