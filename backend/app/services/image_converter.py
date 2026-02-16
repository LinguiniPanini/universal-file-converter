"""
Modulo de conversion y manipulacion de imagenes.

Este servicio maneja TODAS las operaciones sobre imagenes:
1. Conversion de formato (PNG -> JPEG, JPEG -> WebP, etc.)
2. Compresion (reducir calidad/tamano)
3. Redimensionamiento (cambiar ancho x alto)
4. Eliminacion de metadata (EXIF, GPS, etc.)

Usamos Pillow (PIL Fork), la libreria de imagenes mas popular de Python.
Pillow soporta mas de 30 formatos de imagen y proporciona operaciones
de alto nivel sin necesidad de manipular pixels directamente.

Por que procesamos todo en memoria (bytes <-> BytesIO)?
-------------------------------------------------------
Nuestro flujo es: S3 -> bytes -> proceso -> bytes -> S3
Nunca escribimos archivos temporales al disco para imagenes porque:
1. Es mas rapido (RAM es ~1000x mas rapida que disco).
2. Es mas seguro (no dejamos archivos temporales que podrian filtrar datos).
3. BytesIO simula ser un archivo en disco (tiene .read(), .write(), .seek())
   pero todo esta en memoria.

Para documentos (DOCX, PDF) SI usamos archivos temporales porque las
herramientas externas (LibreOffice) los requieren. Ver document_converter.py.

Diccionarios de mapeo (MIME_TO_FORMAT, MIME_TO_EXT):
-----------------------------------------------------
Estos diccionarios traducen entre los diferentes "idiomas" de identificar
formatos:
- Tipos MIME: "image/png" (estandar HTTP/Internet)
- Nombres de formato Pillow: "PNG" (lo que Pillow espera en .save())
- Extensiones de archivo: ".png" (lo que ve el usuario)
"""

# io: modulo de la biblioteca estandar para manejar flujos de datos.
# BytesIO nos permite trabajar con bytes como si fueran un archivo.
import io

# PIL (Python Imaging Library) / Pillow: libreria para procesamiento de imagenes.
# Image es la clase principal que representa una imagen en memoria.
# Permite abrir, manipular y guardar imagenes en muchos formatos.
from PIL import Image

# ---------- Diccionarios de mapeo de formatos ----------

# Mapea tipo MIME -> nombre de formato que Pillow entiende.
# Pillow usa sus propios nombres internos para los formatos:
#   img.save(buffer, format="PNG")   # No "image/png"
#   img.save(buffer, format="JPEG")  # No "image/jpeg"
MIME_TO_FORMAT = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/webp": "WEBP",
}

# Mapea tipo MIME -> extension de archivo para el nombre de salida.
# Se usa para generar el nombre del archivo convertido.
# Ejemplo: si el target_mime es "image/jpeg", el archivo se llamara
# "converted.jpg"
MIME_TO_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}


def convert_image(data: bytes, source_mime: str, target_mime: str) -> bytes:
    """
    Convierte una imagen de un formato a otro.

    Flujo interno:
        bytes de entrada -> Image.open() -> conversion de modo si es necesario
        -> Image.save() al nuevo formato -> bytes de salida

    Parametros:
        data (bytes): Imagen original en bytes.
        source_mime (str): Tipo MIME de la imagen original (ej: "image/png").
            Actualmente no se usa directamente, pero se incluye por si en
            el futuro necesitamos logica especifica segun el formato origen.
        target_mime (str): Tipo MIME del formato destino (ej: "image/jpeg").

    Retorna:
        bytes: Imagen convertida en el nuevo formato.

    Nota sobre modos de color y conversion a JPEG:
        JPEG NO soporta transparencia (canal alpha). Si la imagen original
        tiene transparencia (modo RGBA, LA, o P con transparencia), debemos
        convertirla a RGB antes de guardar como JPEG. Si no hacemos esto,
        Pillow lanzara un error.
        Modos de color en Pillow:
            - RGB: 3 canales (Rojo, Verde, Azul) - lo estandar
            - RGBA: 4 canales (RGB + Alpha/transparencia)
            - LA: Escala de grises + Alpha
            - P: Paleta (imagen con un set limitado de colores, como GIFs)
            - L: Escala de grises (1 canal)
    """
    # Abrimos la imagen desde bytes usando BytesIO como intermediario.
    # Image.open() necesita un "file-like object" (algo con .read()),
    # y BytesIO convierte bytes crudos en un objeto tipo archivo.
    img = Image.open(io.BytesIO(data))

    # Si el formato destino es JPEG y la imagen tiene transparencia,
    # debemos convertir a RGB (3 canales sin alpha).
    # Sin esta conversion, img.save(format="JPEG") lanzaria:
    #   OSError: cannot write mode RGBA as JPEG
    if target_mime == "image/jpeg" and img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGB")

    # Obtenemos el nombre de formato que Pillow espera
    target_format = MIME_TO_FORMAT[target_mime]

    # Creamos un buffer en memoria donde Pillow escribira la imagen convertida
    buffer = io.BytesIO()

    # Guardamos la imagen en el nuevo formato.
    # Esto es donde ocurre la conversion real: Pillow decodifica los pixels
    # del formato original y los re-codifica en el formato destino.
    img.save(buffer, format=target_format)

    # getvalue() retorna todos los bytes escritos en el buffer.
    # Es como hacer .read() pero sin necesidad de hacer .seek(0) primero.
    return buffer.getvalue()


def compress_image(data: bytes, quality: int = 70) -> bytes:
    """
    Comprime una imagen reduciendo su calidad. Retorna JPEG.

    La compresion JPEG es "con perdida" (lossy): reduce el tamano del
    archivo descartando detalles que el ojo humano apenas nota.
    A menor calidad, menor tamano pero mas artefactos visuales.

    Guia de valores de quality:
        95: Practicamente sin perdida visible (~70% del tamano original)
        80: Buena calidad, reduccion significativa (~40% del tamano)
        70: Calidad aceptable para web (~30% del tamano) [nuestro default]
        50: Calidad baja, artefactos visibles (~20% del tamano)
        20: Calidad muy baja, solo para thumbnails (~10% del tamano)

    Parametros:
        data (bytes): Imagen original en bytes (cualquier formato soportado).
        quality (int): Nivel de calidad JPEG, de 1 (peor) a 95 (mejor).
            Default: 70 (buen balance calidad/tamano para web).

    Retorna:
        bytes: Imagen comprimida en formato JPEG.
    """
    img = Image.open(io.BytesIO(data))

    # Convertimos a RGB porque JPEG no soporta transparencia.
    # (Misma razon que en convert_image)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGB")

    buffer = io.BytesIO()

    # optimize=True le dice a Pillow que use una tabla de Huffman
    # optimizada para esta imagen especifica, lo cual reduce el tamano
    # unos bytes adicionales sin afectar la calidad. Es un poco mas lento
    # de comprimir, pero vale la pena.
    img.save(buffer, format="JPEG", quality=quality, optimize=True)
    return buffer.getvalue()


def resize_image(data: bytes, width: int, height: int) -> bytes:
    """
    Redimensiona una imagen a dimensiones exactas.

    ADVERTENCIA: No mantiene la proporcion (aspect ratio). Si la imagen
    original es 1920x1080 (16:9) y la redimensionas a 500x500, se vera
    "estirada". Para mantener proporcion, el frontend deberia calcular
    las dimensiones correctas antes de enviar la peticion.

    Parametros:
        data (bytes): Imagen original en bytes.
        width (int): Ancho deseado en pixeles.
        height (int): Alto deseado en pixeles.

    Retorna:
        bytes: Imagen redimensionada en el mismo formato original.
    """
    img = Image.open(io.BytesIO(data))

    # Image.LANCZOS es el algoritmo de redimensionamiento de mayor calidad
    # disponible en Pillow. Usa interpolacion sinc (basada en la funcion
    # matematica sinc) para calcular el color de cada nuevo pixel.
    # Alternativas (de menor a mayor calidad):
    #   Image.NEAREST  - Mas rapido, peor calidad (pixelado)
    #   Image.BILINEAR - Bueno para agrandar
    #   Image.BICUBIC  - Bueno en general
    #   Image.LANCZOS  - Mejor calidad, especialmente para reducir tamano
    img = img.resize((width, height), Image.LANCZOS)

    buffer = io.BytesIO()
    # Usamos img.format para mantener el formato original.
    # Si no se detecta (None), usamos PNG como fallback porque es
    # sin perdida y soporta transparencia.
    img.save(buffer, format=img.format or "PNG")
    return buffer.getvalue()


def strip_metadata(data: bytes) -> bytes:
    """
    Elimina TODA la metadata (EXIF, GPS, etc.) de una imagen.

    Por que eliminar metadata?
    --------------------------
    Las fotos de celulares y camaras incluyen metadata EXIF que puede
    contener informacion sensible:
    - Coordenadas GPS (donde se tomo la foto)
    - Fecha y hora exacta
    - Modelo de celular/camara
    - Orientacion, apertura, ISO, etc.

    Esto es un riesgo de privacidad si el usuario comparte la foto
    en internet sin darse cuenta de que contiene su ubicacion exacta.

    Tecnica utilizada:
    En vez de intentar borrar campo por campo del EXIF (lo cual es
    propenso a errores y podria dejar datos residuales), creamos una
    imagen NUEVA con los mismos pixeles pero SIN ninguna metadata.
    Esto garantiza una limpieza completa.

    Parametros:
        data (bytes): Imagen original con metadata.

    Retorna:
        bytes: Imagen identica visualmente pero sin ninguna metadata.
    """
    img = Image.open(io.BytesIO(data))

    # Creamos una imagen nueva del mismo modo (RGB, RGBA, etc.) y tamano.
    # Image.new() crea una imagen "limpia" sin metadata de ningun tipo.
    clean = Image.new(img.mode, img.size)

    # Copiamos los datos de pixeles de la imagen original a la nueva.
    # img.getdata() retorna una secuencia de tuplas de pixeles.
    # Ejemplo para RGB: [(255, 0, 0), (0, 255, 0), ...] (rojo, verde, ...)
    # putdata() coloca estos pixeles en la imagen limpia.
    # Resultado: misma imagen visual, cero metadata.
    clean.putdata(list(img.getdata()))

    buffer = io.BytesIO()
    # Guardamos en el formato original (o PNG si no se detecto)
    clean.save(buffer, format=img.format or "PNG")
    return buffer.getvalue()
