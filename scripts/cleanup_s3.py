"""
Script de limpieza automatica de objetos antiguos en S3.

Este script elimina archivos de S3 que tienen mas de 1 hora de antiguedad.
Esta disenado para ejecutarse periodicamente via un cron job cada 15 minutos.

Por que necesitamos limpieza automatica?
-----------------------------------------
Nuestro convertidor de archivos genera objetos temporales en S3:
- Archivos originales subidos (uploads/)
- Archivos convertidos (converted/)

Si no los borramos, se acumularian infinitamente y generarian costos
crecientes en AWS. S3 cobra por almacenamiento ($0.023 USD/GB/mes en
us-east-1), asi que miles de archivos temporales abandonados aumentarian
los costos innecesariamente.

Alternativas de limpieza:
-------------------------
1. **Este script + cron:** Simple, flexible, control total.
   Desventaja: requiere un servidor para ejecutar el cron.

2. **S3 Lifecycle Rules:** Reglas nativas de AWS que eliminan objetos
   automaticamente despues de X dias. Se configuran en la consola de AWS
   o via CloudFormation/Terraform. Ventaja: no requiere servidor.
   Desventaja: granularidad minima de 1 dia (no horas).

3. **AWS Lambda + EventBridge:** Una funcion serverless que se ejecuta
   periodicamente. Ventaja: no requiere servidor, mas preciso que
   Lifecycle Rules. Desventaja: mas complejo de configurar.

Para este proyecto academico, usamos la opcion 1 por simplicidad.

Que es un cron job?
--------------------
Cron es un programador de tareas de Unix/Linux que ejecuta comandos
automaticamente en intervalos regulares. La configuracion (crontab) seria:
    */15 * * * * cd /ruta/proyecto && python scripts/cleanup_s3.py
Esto significa: "cada 15 minutos, ejecuta este script".

Estructura del crontab: minuto hora dia_mes mes dia_semana
    */15 = "cada 15 minutos"
    *    = "todos los valores" (cada hora, cada dia, etc.)

Que es la paginacion en S3?
----------------------------
S3 puede contener millones de objetos, pero list_objects_v2 solo retorna
hasta 1000 objetos por llamada (limit de la API de AWS). El "paginator"
maneja esto automaticamente haciendo multiples llamadas y concatenando
los resultados. Sin el, podriamos perder objetos si hay mas de 1000.

Uso:
    python scripts/cleanup_s3.py

Requisitos:
    - Credenciales AWS configuradas (aws configure o variables de entorno)
    - Permiso s3:ListBucket y s3:DeleteObject en el bucket
"""

# boto3: SDK de AWS para Python.
# Lo importamos directamente (no usamos nuestro S3Service) porque este
# script es independiente de la app FastAPI. Podria ejecutarse en un
# servidor diferente, en un Lambda, o manualmente desde tu laptop.
import boto3

# datetime y timezone: para calcular la edad de cada objeto.
# timedelta: para definir la edad maxima permitida.
from datetime import datetime, timezone, timedelta

# Nombre del bucket (hardcodeado porque este script es independiente
# de la configuracion de la app). En un proyecto mas robusto, esto
# vendria de una variable de entorno o argumento de linea de comandos.
BUCKET = "file-converter-bucket"

# Edad maxima de un objeto antes de ser eliminado: 1 hora.
# Usamos timedelta para representar duraciones de forma legible.
# timedelta(hours=1) es mas claro que 3600 (segundos).
MAX_AGE = timedelta(hours=1)


def cleanup():
    """
    Recorre TODOS los objetos del bucket y elimina los que tienen
    mas de MAX_AGE (1 hora) de antiguedad.

    Flujo:
    1. Crea un cliente S3
    2. Obtiene la hora actual en UTC
    3. Itera sobre TODOS los objetos del bucket (usando paginacion)
    4. Para cada objeto, calcula su edad (ahora - fecha_de_creacion)
    5. Si la edad > MAX_AGE, elimina el objeto

    Por que usamos UTC (timezone.utc)?
    ----------------------------------
    S3 retorna las fechas en UTC (Coordinated Universal Time).
    Si usaramos datetime.now() sin timezone (hora local), la comparacion
    de fechas seria incorrecta si el servidor esta en otra zona horaria.
    Siempre compara "UTC con UTC" para evitar bugs de timezone.

    Nota sobre idempotencia:
    Este script es SEGURO de ejecutar multiples veces. Si un objeto
    ya fue borrado, S3 simplemente ignora el delete (no lanza error).
    """
    # Creamos un cliente S3 fresco. Este script no reutiliza la instancia
    # de la app porque se ejecuta como proceso independiente.
    s3 = boto3.client("s3")

    # Obtenemos la hora actual en UTC para calcular edades.
    now = datetime.now(timezone.utc)

    # get_paginator crea un "paginador" que maneja automaticamente
    # la paginacion de la API de S3. Sin el, list_objects_v2 retorna
    # maximo 1000 objetos por llamada. El paginator hace llamadas
    # adicionales automaticamente hasta obtener TODOS los objetos.
    paginator = s3.get_paginator("list_objects_v2")

    # paginate() retorna un iterador de "paginas". Cada pagina es un
    # dict con "Contents" (lista de objetos) y otros campos.
    for page in paginator.paginate(Bucket=BUCKET):
        # page.get("Contents", []) retorna la lista de objetos de esta
        # pagina, o una lista vacia si el bucket esta vacio.
        for obj in page.get("Contents", []):
            # Calculamos la edad del objeto.
            # obj["LastModified"] es un datetime con timezone UTC
            # (proporcionado por AWS). La resta de dos datetimes con
            # timezone retorna un timedelta.
            age = now - obj["LastModified"]

            # Si el objeto es mas viejo que MAX_AGE, lo eliminamos.
            if age > MAX_AGE:
                s3.delete_object(Bucket=BUCKET, Key=obj["Key"])
                # Imprimimos para tener un log de lo que se borro.
                # En produccion usarias logging en vez de print.
                print(f"Deleted: {obj['Key']} (age: {age})")


# Este bloque se ejecuta SOLO cuando corres el script directamente:
#   python scripts/cleanup_s3.py
# NO se ejecuta si importas este modulo desde otro archivo:
#   from scripts.cleanup_s3 import cleanup  # no ejecuta cleanup()
#
# Este patron es una convencion de Python que permite reutilizar
# funciones del script via import sin ejecutar la logica principal.
if __name__ == "__main__":
    cleanup()
