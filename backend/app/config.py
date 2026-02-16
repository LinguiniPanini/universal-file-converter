"""
Modulo de configuracion centralizada de la aplicacion.

Este archivo define TODAS las constantes y configuraciones que el backend
necesita para funcionar. Centralizar la configuracion en un solo lugar
es una buena practica de ingenieria de software por varias razones:

1. **Principio DRY (Don't Repeat Yourself):** Si el nombre del bucket S3
   estuviera hardcodeado en 10 archivos distintos y necesitaras cambiarlo,
   tendrias que modificar 10 archivos. Con este modulo, solo cambias uno.

2. **Configuracion por entorno:** Usamos variables de entorno (os.getenv)
   para que la misma aplicacion pueda correr en desarrollo, staging y
   produccion con diferentes valores SIN cambiar el codigo fuente.
   Ejemplo: en desarrollo el bucket se llama "file-converter-bucket",
   pero en produccion podria llamarse "prod-file-converter-2024".

3. **Seguridad:** Las credenciales y configuraciones sensibles NUNCA deben
   estar hardcodeadas en el codigo. Las variables de entorno permiten
   inyectarlas de forma segura (via Docker, AWS ECS, etc.).

Patron de diseno utilizado: **Singleton implicito**
La instancia `settings` se crea UNA sola vez al importar este modulo.
Python cachea los modulos importados, asi que cada archivo que haga
`from app.config import settings` recibira la MISMA instancia.
Esto garantiza que toda la app use la misma configuracion.
"""

# os es el modulo de la biblioteca estandar de Python para interactuar
# con el sistema operativo. Lo usamos aqui para leer variables de entorno.
import os


class Settings:
    """
    Clase que encapsula toda la configuracion de la aplicacion.

    Usamos una clase (en vez de simples variables globales) porque:
    - Agrupa logicamente todas las configuraciones relacionadas.
    - Permite que en tests podamos crear una instancia con valores custom.
    - Es mas facil de documentar y mantener.

    Nota: Podriamos haber usado pydantic-settings (BaseSettings) que ofrece
    validacion automatica de tipos y carga de .env files. Para este proyecto
    usamos una clase simple por claridad didactica.
    """

    # ---------- Configuracion de AWS S3 ----------

    # Nombre del bucket de S3 donde almacenamos los archivos.
    # Un "bucket" en S3 es como un contenedor de nivel superior (piensa en
    # el como una carpeta raiz en la nube). Cada proyecto suele tener su
    # propio bucket.
    # os.getenv("S3_BUCKET", "file-converter-bucket") significa:
    #   - Busca la variable de entorno S3_BUCKET
    #   - Si no existe, usa "file-converter-bucket" como valor por defecto
    S3_BUCKET: str = os.getenv("S3_BUCKET", "file-converter-bucket")

    # Region de AWS donde esta nuestro bucket.
    # AWS tiene centros de datos en todo el mundo (us-east-1 = Virginia, USA).
    # Es importante que el bucket y la app esten en la misma region para
    # minimizar latencia y costos de transferencia de datos.
    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")

    # ---------- Limites de archivos ----------

    # Tamano maximo de archivo permitido: 50 MB.
    # La expresion 50 * 1024 * 1024 convierte 50 MB a bytes:
    #   50 MB * 1024 KB/MB * 1024 bytes/KB = 52,428,800 bytes
    # Usamos bytes porque asi es como Python mide el tamano de los datos
    # en memoria (len(data) retorna bytes).
    #
    # Por que 50MB? Es un balance entre:
    #   - Permitir archivos utiles (documentos, imagenes de alta resolucion)
    #   - No permitir que un usuario sature el servidor con archivos enormes
    #   - Mantener tiempos de procesamiento razonables
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50 MB

    # ---------- Tipos MIME permitidos ----------

    # Diccionario que mapea tipos MIME a sus extensiones de archivo validas.
    #
    # MIME (Multipurpose Internet Mail Extensions) es un estandar que
    # identifica el tipo de contenido de un archivo. Ejemplo:
    #   "image/png" = es una imagen en formato PNG
    #   "application/pdf" = es un documento PDF
    #
    # La estructura es: { "tipo_mime": [".ext1", ".ext2"] }
    # Un tipo MIME puede tener multiples extensiones validas (ej: .jpg y .jpeg
    # son ambas extensiones validas para image/jpeg).
    #
    # SEGURIDAD: Este diccionario actua como una "lista blanca" (whitelist).
    # Solo aceptamos los tipos de archivo que EXPLICITAMENTE listamos aqui.
    # Cualquier otro tipo (como .exe, .bat, .sh) sera rechazado.
    # Este enfoque es mas seguro que una "lista negra" (blacklist) porque
    # si olvidamos agregar un tipo peligroso a una lista negra, pasa sin
    # filtro. Con una lista blanca, lo que no esta listado, no entra.
    ALLOWED_MIME_TYPES: dict[str, list[str]] = {
        # Formatos de imagen
        "image/png": [".png"],
        "image/jpeg": [".jpg", ".jpeg"],
        "image/webp": [".webp"],

        # Formatos de documento
        "application/pdf": [".pdf"],
        # DOCX es el formato moderno de Word (basado en XML comprimido).
        # Su tipo MIME es largo porque sigue el estandar OpenXML de Microsoft.
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],

        # Markdown: Tanto "text/markdown" como "text/plain" pueden
        # corresponder a archivos .md. Esto es porque no todos los sistemas
        # detectan Markdown como su propio tipo MIME; algunos lo reportan
        # simplemente como texto plano.
        "text/markdown": [".md"],
        "text/plain": [".md"],
    }

    # ---------- Prefijos de S3 (estructura de carpetas) ----------

    # En S3 no existen "carpetas" reales como en un sistema de archivos.
    # Lo que llamamos "carpetas" son simplemente prefijos en el nombre
    # del objeto (key). Ejemplo:
    #   Key: "uploads/abc-123/foto.png"
    #   Prefijo: "uploads/"  ->  simula una carpeta "uploads"
    #
    # Separamos archivos originales y convertidos en prefijos distintos
    # para mantener el orden y facilitar operaciones como limpieza
    # automatica (el script cleanup_s3.py puede borrar solo "uploads/"
    # o solo "converted/" si fuera necesario).

    # Prefijo para archivos originales subidos por el usuario
    UPLOAD_PREFIX: str = "uploads"

    # Prefijo para archivos ya convertidos, listos para descargar
    CONVERTED_PREFIX: str = "converted"


# Instancia unica de configuracion (patron Singleton implicito).
# Al importar este modulo, Python ejecuta esta linea UNA sola vez
# y la cachea. Todos los modulos que importen `settings` obtendran
# la misma instancia.
settings = Settings()
