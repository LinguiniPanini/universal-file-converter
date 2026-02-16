"""
Modulo de servicio para Amazon S3 (Simple Storage Service).

Este modulo encapsula TODA la comunicacion con AWS S3. Ningun otro archivo
del proyecto deberia llamar directamente a boto3 para operaciones S3;
todo pasa por este servicio. Esto sigue el principio de encapsulamiento
y facilita testear el codigo (solo necesitas mockear este servicio).

Que es Amazon S3?
-----------------
S3 es un servicio de almacenamiento de objetos en la nube de AWS. Piensa
en el como un "disco duro infinito" en internet donde puedes guardar
archivos (llamados "objetos") organizados en "buckets" (contenedores).

Conceptos clave de S3:
- **Bucket:** Contenedor de nivel superior. Como una carpeta raiz.
  Cada bucket tiene un nombre GLOBALMENTE unico en todo AWS.
- **Key (clave):** La "ruta" del archivo dentro del bucket.
  Ejemplo: "uploads/abc-123/foto.png"
  Aunque parece un path de carpetas, en realidad es una cadena plana.
  S3 NO tiene carpetas reales, solo simula la jerarquia con prefijos.
- **Object (objeto):** El archivo en si (datos + metadata).
- **Metadata:** Datos extra asociados al objeto (key-value pairs).
  Ejemplo: {"mime-type": "image/png"}. Almacenamos el tipo MIME aqui
  para no tener que re-detectarlo cuando lo necesitemos.

Estructura de keys en nuestro proyecto:
    uploads/{job_id}/{filename}     -> archivo original del usuario
    converted/{job_id}/{filename}   -> archivo despues de la conversion

Patron de diseno: Servicio + Singleton implicito
-------------------------------------------------
- Clase S3Service encapsula las operaciones (upload, download, delete, etc.)
- La instancia `s3_service` se crea una vez al importar el modulo.
- Permite inyeccion de dependencias: en tests, pasamos un mock client
  al constructor en vez de usar el cliente real de AWS.

Patron de diseno: Inyeccion de dependencias
-------------------------------------------
El constructor acepta un `client` opcional. Esto permite:
- En produccion: se usa el cliente real de boto3 (valor por defecto).
- En tests: se pasa un mock/stub que simula S3 sin hacer llamadas reales.
"""

# boto3 es el SDK oficial de AWS para Python.
# Permite interactuar con cualquier servicio de AWS (S3, EC2, Lambda, etc.)
# desde codigo Python. Internamente usa las credenciales configuradas en
# ~/.aws/credentials o en variables de entorno (AWS_ACCESS_KEY_ID,
# AWS_SECRET_ACCESS_KEY).
import boto3

# Importamos la configuracion para obtener el nombre del bucket y la region
from app.config import settings


class S3Service:
    """
    Servicio que encapsula todas las operaciones con Amazon S3.

    Responsabilidades:
    - Subir archivos originales (upload)
    - Subir archivos convertidos (upload_converted)
    - Obtener metadata de objetos (get_metadata)
    - Descargar archivos (download)
    - Eliminar archivos (delete)

    Atributos:
        client: Cliente de boto3 para S3. Es el objeto que realmente
            hace las llamadas HTTP a la API de AWS.
        bucket (str): Nombre del bucket donde almacenamos todo.
    """

    def __init__(self, client=None):
        """
        Inicializa el servicio S3.

        Parametros:
            client: Cliente de boto3 opcional. Si no se proporciona,
                se crea uno nuevo usando la region de la configuracion.

        Patron de diseno: Inyeccion de Dependencias (Dependency Injection)
        En vez de crear el cliente internamente siempre, permitimos que
        el caller lo pase. Esto es FUNDAMENTAL para testing:

            # En produccion (usa AWS real):
            service = S3Service()

            # En tests (usa un mock):
            mock_client = MagicMock()
            service = S3Service(client=mock_client)
        """
        # `client or boto3.client(...)` usa el operador "or" de Python:
        # Si client es None (falsy), evalua y retorna la segunda expresion.
        # Si client tiene valor (truthy), lo usa directamente.
        self.client = client or boto3.client("s3", region_name=settings.AWS_REGION)
        self.bucket = settings.S3_BUCKET

    def upload(self, data: bytes, job_id: str, filename: str, metadata: dict | None = None) -> str:
        """
        Sube el archivo ORIGINAL del usuario a S3.

        Construye un key con el formato: uploads/{job_id}/{filename}
        Ejemplo: "uploads/a1b2c3d4-e5f6-7890-abcd-ef1234567890/foto.png"

        El job_id actua como "carpeta" unica para cada trabajo, evitando
        colisiones de nombres (dos usuarios pueden subir "foto.png" y
        ambas se almacenan en keys diferentes gracias al UUID).

        Parametros:
            data (bytes): Contenido del archivo en bytes.
            job_id (str): UUID unico del trabajo de conversion.
            filename (str): Nombre del archivo (sanitizado).
            metadata (dict | None): Metadata adicional para almacenar con
                el objeto. Usamos esto para guardar el tipo MIME detectado
                y no tener que re-detectarlo despues.
                S3 almacena metadata como headers HTTP personalizados
                (x-amz-meta-*), por lo que los keys deben ser strings
                simples sin caracteres especiales.

        Retorna:
            str: El key (ruta) del objeto en S3.
        """
        # Construimos el key concatenando prefijo, job_id y filename.
        # Esto crea una estructura jerarquica en S3:
        #   uploads/
        #       job-id-1/
        #           foto.png
        #       job-id-2/
        #           documento.pdf
        key = f"{settings.UPLOAD_PREFIX}/{job_id}/{filename}"

        # Preparamos los parametros para put_object.
        # put_object sube un objeto a S3 en una sola llamada HTTP.
        # Para archivos grandes (>5GB), se usaria multipart upload,
        # pero nuestro limite es 50MB, asi que put_object es suficiente.
        params = {"Bucket": self.bucket, "Key": key, "Body": data}

        # Solo agregamos metadata si fue proporcionada.
        # En S3, la metadata es un diccionario de strings key-value que
        # se almacena junto con el objeto. AWS lo guarda como headers
        # HTTP personalizados (ej: x-amz-meta-mime-type: image/png).
        if metadata:
            params["Metadata"] = metadata

        # put_object() hace una peticion HTTP PUT a la API de S3.
        # AWS autentica la peticion usando las credenciales configuradas.
        self.client.put_object(**params)
        return key

    def upload_converted(self, data: bytes, job_id: str, filename: str) -> str:
        """
        Sube el archivo CONVERTIDO a S3.

        Similar a upload(), pero usa el prefijo "converted/" en vez de "uploads/".
        Esto permite distinguir facilmente entre archivos originales y convertidos.

        Parametros:
            data (bytes): Contenido del archivo convertido en bytes.
            job_id (str): UUID del trabajo (el mismo de la subida original).
            filename (str): Nombre del archivo convertido (ej: "converted.pdf").

        Retorna:
            str: El key del objeto convertido en S3.
        """
        key = f"{settings.CONVERTED_PREFIX}/{job_id}/{filename}"
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)
        return key

    def get_metadata(self, key: str) -> dict:
        """
        Obtiene la metadata de un objeto sin descargar su contenido.

        Usa head_object() que es una peticion HTTP HEAD: retorna solo
        los headers (incluyendo metadata) sin el body. Es MUCHO mas
        rapido y barato que descargar el archivo completo.

        Caso de uso: Necesitamos saber el tipo MIME del archivo original
        para decidir que conversor usar, pero no necesitamos los datos
        del archivo todavia.

        Parametros:
            key (str): Key (ruta) del objeto en S3.

        Retorna:
            dict: Diccionario con la metadata del objeto.
                  Ejemplo: {"mime-type": "image/png"}
                  Retorna {} si no hay metadata.
        """
        # head_object hace un HTTP HEAD request.
        # Es como GET pero sin descargar el body.
        # Cuesta ~10x menos que un GET en terminos de pricing de AWS.
        response = self.client.head_object(Bucket=self.bucket, Key=key)
        # .get("Metadata", {}) retorna la metadata o un dict vacio
        # si no existe. Usamos .get() en vez de ["Metadata"] para
        # evitar un KeyError si AWS no incluye el campo.
        return response.get("Metadata", {})

    def download(self, key: str) -> bytes:
        """
        Descarga un archivo completo de S3.

        Parametros:
            key (str): Key (ruta) del objeto en S3.

        Retorna:
            bytes: Contenido completo del archivo.

        Nota: Este metodo carga TODO el archivo en memoria. Para archivos
        muy grandes, seria mejor usar streaming (response["Body"].iter_chunks()).
        Pero como nuestro limite es 50MB, cargar en memoria es aceptable
        para la mayoria de servidores.
        """
        # get_object retorna un dict con el body como un StreamingBody.
        # response["Body"] es un objeto que permite leer los datos.
        # .read() lee TODOS los bytes de una vez.
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        return response["Body"].read()

    def delete(self, key: str) -> None:
        """
        Elimina un objeto de S3.

        S3 no tiene "papelera de reciclaje" por defecto. Una vez que
        borras un objeto, desaparece permanentemente (a menos que
        tengas versionamiento habilitado en el bucket).

        Parametros:
            key (str): Key (ruta) del objeto a eliminar.

        Nota: delete_object NO lanza error si el objeto no existe.
        AWS diseño la API asi intencionalmente (idempotencia):
        puedes llamar delete varias veces sin efectos secundarios.
        """
        self.client.delete_object(Bucket=self.bucket, Key=key)


# Instancia global del servicio S3 (Singleton implicito).
# Todos los modulos que importen s3_service compartiran esta misma instancia,
# lo cual es deseable porque:
#   1. El cliente de boto3 reutiliza conexiones HTTP (connection pooling).
#   2. No tiene sentido crear multiples clientes al mismo bucket.
#   3. Facilita mockear S3 en tests (solo hay un punto de inyeccion).
s3_service = S3Service()
