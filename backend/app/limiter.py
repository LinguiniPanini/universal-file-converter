"""
Modulo de limitacion de tasa de peticiones (Rate Limiting).

Este modulo configura un "rate limiter" que restringe cuantas peticiones
puede hacer un mismo cliente (identificado por su IP) en un periodo de tiempo.

Por que necesitamos rate limiting?
----------------------------------
Sin rate limiting, un solo usuario (o un bot malicioso) podria:
1. Hacer miles de peticiones por segundo y saturar el servidor (ataque DoS).
2. Subir cientos de archivos para llenar nuestro almacenamiento S3.
3. Abusar del servicio de conversion consumiendo CPU excesiva.
4. Generar costos innecesarios en AWS (cada operacion S3 tiene un costo).

Como funciona?
--------------
Usamos la libreria SlowAPI, que es un wrapper de "limits" para FastAPI.
SlowAPI se integra como middleware: intercepta cada peticion ANTES de que
llegue a tu endpoint y verifica si esa IP ya excedio su limite.

Si el cliente excede el limite (ej: "10/minute" = 10 peticiones por minuto),
SlowAPI responde automaticamente con HTTP 429 (Too Many Requests) sin
siquiera ejecutar tu codigo del endpoint. Esto protege el servidor de
carga innecesaria.

Arquitectura: Patron Singleton implicito
-----------------------------------------
Creamos UNA instancia global de Limiter que es importada por todos los
archivos de rutas. Asi todas las rutas comparten el mismo estado de conteo.
"""

# SlowAPI es una libreria que adapta la popular libreria "limits" para
# funcionar con frameworks ASGI como FastAPI y Starlette.
# Limiter es la clase principal que lleva el conteo de peticiones por IP.
from slowapi import Limiter

# get_remote_address es una funcion utilitaria que extrae la direccion IP
# del cliente a partir del objeto Request. Esta IP se usa como "clave"
# para el rate limiting: cada IP tiene su propio contador independiente.
# Nota: En produccion con un reverse proxy (como Nginx o un load balancer
# de AWS), la IP real del cliente estaria en el header X-Forwarded-For.
# get_remote_address maneja esto automaticamente.
from slowapi.util import get_remote_address

# Creamos la instancia global del limitador.
# key_func=get_remote_address le dice al limiter: "identifica a cada
# cliente por su direccion IP". Otras opciones podrian ser:
#   - Por usuario autenticado (usando el token JWT)
#   - Por API key
#   - Por una combinacion de IP + endpoint
#
# Por defecto, SlowAPI almacena los contadores en memoria (dict interno).
# En produccion con multiples servidores, usarias Redis como backend
# para que todos los servidores compartan los contadores:
#   Limiter(key_func=get_remote_address, storage_uri="redis://localhost:6379")
limiter = Limiter(key_func=get_remote_address)
