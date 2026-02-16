"""
Punto de entrada principal de la aplicacion FastAPI.

Este es el archivo "raiz" del backend. Aqui se:
1. Crea la instancia de la aplicacion FastAPI.
2. Configura los middlewares (CORS, rate limiting).
3. Registra todas las rutas (upload, convert, download).
4. Define el endpoint de health check.

Arquitectura de la aplicacion (patron MVC simplificado):
---------------------------------------------------------
    main.py (punto de entrada)
        |
        +-- routes/         (Controladores: reciben HTTP requests)
        |    +-- upload.py
        |    +-- convert.py
        |    +-- download.py
        |
        +-- services/       (Logica de negocio: procesan datos)
        |    +-- validator.py
        |    +-- s3.py
        |    +-- image_converter.py
        |    +-- document_converter.py
        |
        +-- models/         (Modelos: definen estructura de datos)
        |    +-- schemas.py
        |
        +-- config.py       (Configuracion centralizada)
        +-- limiter.py      (Rate limiting)

FastAPI es un framework web moderno para Python que:
- Genera documentacion automatica (Swagger UI en /docs)
- Valida datos de entrada automaticamente con Pydantic
- Soporta async/await para manejar muchas peticiones concurrentes
- Es uno de los frameworks Python mas rapidos (comparable a Node.js)

El flujo de una peticion HTTP es:
    Cliente -> CORS middleware -> Rate limiter -> Router -> Endpoint -> Respuesta
"""

# os: para leer variables de entorno (configuracion de CORS)
import os

# FastAPI: el framework web que usamos para crear la API REST.
# Es la alternativa moderna a Flask, con mejor rendimiento y
# validacion de datos integrada.
from fastapi import FastAPI

# CORSMiddleware: Middleware que maneja Cross-Origin Resource Sharing.
# CORS es un mecanismo de seguridad de los navegadores que bloquea
# peticiones HTTP entre dominios diferentes.
# Ejemplo: si tu frontend esta en http://localhost:5173 y tu backend
# en http://localhost:8000, el navegador bloquearia las peticiones
# por defecto. CORS permite configurar que origenes (dominios) pueden
# hacer peticiones a tu API.
from fastapi.middleware.cors import CORSMiddleware

# Importamos el handler de SlowAPI que genera respuestas HTTP 429
# (Too Many Requests) automaticamente cuando un cliente excede el limite.
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# Importamos nuestra instancia del limiter (configurada en limiter.py)
from app.limiter import limiter

# Importamos los routers de cada modulo de rutas.
# Cada router agrupa endpoints relacionados (Single Responsibility Principle).
# Esto mantiene el codigo organizado: upload.py solo tiene logica de subida,
# convert.py solo tiene logica de conversion, etc.
from app.routes.upload import router as upload_router
from app.routes.convert import router as convert_router
from app.routes.download import router as download_router

# ---------- Creacion de la aplicacion ----------

# FastAPI() crea la instancia principal de la app.
# El parametro `title` aparece en la documentacion automatica (Swagger UI)
# que puedes ver en http://localhost:8000/docs
app = FastAPI(title="Universal File Converter")

# ---------- Configuracion del Rate Limiter ----------

# Adjuntamos el limiter al estado de la app para que SlowAPI pueda
# acceder a el desde cualquier punto de la aplicacion.
# app.state es un objeto especial de Starlette (el framework base de FastAPI)
# que permite almacenar datos compartidos a nivel de aplicacion.
app.state.limiter = limiter

# Registramos el handler que se ejecuta cuando un cliente excede el limite.
# Cuando SlowAPI detecta que una IP excedio su limite, lanza la excepcion
# RateLimitExceeded. Este handler la captura y devuelve una respuesta
# HTTP 429 con un mensaje descriptivo, en lugar de un error 500 generico.
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------- Configuracion de CORS ----------

# Leemos los origenes permitidos desde una variable de entorno.
# En desarrollo: "http://localhost:5173" (el servidor de Vite/React)
# En produccion: "https://mi-dominio.com" (tu dominio real)
# Se pueden especificar multiples origenes separados por coma:
#   CORS_ORIGINS="https://app.com,https://admin.app.com"
#
# SEGURIDAD: NUNCA uses allow_origins=["*"] en produccion.
# Eso permitiria que CUALQUIER sitio web haga peticiones a tu API,
# lo cual es un riesgo de seguridad (ataques CSRF, robo de datos, etc.)
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

# Patron de diseno: Middleware
# Un middleware es codigo que se ejecuta ANTES y/o DESPUES de cada peticion.
# El flujo con CORS middleware es:
#   1. Llega peticion del navegador
#   2. CORS middleware verifica si el Origin esta permitido
#   3. Si esta permitido, agrega headers CORS a la respuesta
#   4. Si NO esta permitido, el navegador bloquea la respuesta
#
# allow_methods=["*"] permite todos los metodos HTTP (GET, POST, PUT, DELETE, etc.)
# allow_headers=["*"] permite todos los headers en las peticiones
# Nota: En un entorno mas estricto, limitarias estos a solo los metodos
# y headers que tu API realmente usa.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Health Check ----------

# El endpoint /api/health es un patron comun en aplicaciones web.
# Es usado por:
#   - Load balancers (AWS ALB/ELB) para verificar que el servidor esta vivo
#   - Sistemas de monitoreo (Datadog, CloudWatch) para alertas
#   - Kubernetes para liveness/readiness probes
#   - CI/CD pipelines para verificar deploys exitosos
#
# Si este endpoint responde 200 OK, sabemos que:
#   - El servidor esta corriendo
#   - FastAPI esta funcionando
#   - Las rutas estan registradas
# Un health check mas avanzado tambien verificaria la conexion a S3,
# base de datos, etc.
@app.get("/api/health")
async def health_check():
    """
    Endpoint de verificacion de salud del servidor.

    Retorna:
        dict: {"status": "ok"} si el servidor esta funcionando correctamente.
    """
    return {"status": "ok"}


# ---------- Registro de rutas ----------

# include_router() es como "montar" un grupo de endpoints en la app.
# Cada router trae sus propios endpoints, y al incluirlo aqui, FastAPI
# los registra como parte de la aplicacion principal.
#
# Esto sigue el principio de Separacion de Responsabilidades:
#   - main.py solo se encarga de CONFIGURAR la app
#   - Cada archivo de rutas se encarga de su propia logica
#
# El orden de inclusion NO afecta la funcionalidad, pero afecta el orden
# en que aparecen en la documentacion de Swagger (/docs).
app.include_router(upload_router)
app.include_router(convert_router)
app.include_router(download_router)
