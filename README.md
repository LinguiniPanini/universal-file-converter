# Universal File Converter

Aplicacion web full-stack para conversion de archivos entre formatos de imagen y documento, desplegada en AWS con almacenamiento temporal en S3.

**Stack:** Python (FastAPI) · React (Vite) · AWS (EC2 + S3) · Nginx

> Proyecto academico — ITESO, Desarrollo de Software

---

## Tabla de Contenidos

- [Descripcion del Proyecto](#descripcion-del-proyecto)
- [Arquitectura](#arquitectura)
- [Flujo de Datos](#flujo-de-datos)
- [Tech Stack y Justificacion](#tech-stack-y-justificacion)
- [Conversiones Soportadas](#conversiones-soportadas)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Seguridad](#seguridad)
- [API Endpoints](#api-endpoints)
- [Instalacion y Ejecucion Local](#instalacion-y-ejecucion-local)
- [Despliegue en AWS](#despliegue-en-aws)
- [Testing](#testing)
- [Decisiones de Diseno](#decisiones-de-diseno)
- [Mejoras Futuras (V2)](#mejoras-futuras-v2)

---

## Descripcion del Proyecto

Universal File Converter es una aplicacion web que permite a los usuarios subir archivos, seleccionar un formato de salida y descargar el archivo convertido. El flujo se divide en tres pasos claros (patron **Wizard/Stepper**):

1. **Upload** — El usuario sube un archivo (drag & drop o seleccion manual)
2. **Convert** — Selecciona el formato de destino y opciones (compresion, metadata)
3. **Download** — Descarga el archivo convertido

La aplicacion procesa conversiones de forma sincrona en el servidor, almacena archivos temporalmente en S3 (auto-borrado en 1 hora via cron + 24 horas via Lifecycle Policy), y esta disenada para 1-10 usuarios concurrentes.

---

## Arquitectura

### Vista General (EC2)

```
┌─────────────────────────────────────────────────────────┐
│                      EC2 Instance                       │
│                                                         │
│  ┌──────────┐    ┌──────────────────┐    ┌──────────┐  │
│  │  React   │    │   FastAPI         │    │  boto3   │  │
│  │  (Vite   │───>│                   │───>│  S3      │  │
│  │  build)  │    │  /api/upload      │    │  Client  │  │
│  │  served  │    │  /api/convert     │    │          │  │
│  │  by      │    │  /api/download/id │    └──────────┘  │
│  │  Nginx)  │    │                   │          │       │
│  └──────────┘    │  ┌─────────────┐  │          v       │
│                  │  │ Conversion  │  │    ┌──────────┐  │
│                  │  │ Engine      │  │    │   AWS     │  │
│                  │  └─────────────┘  │    │   S3     │  │
│                  └──────────────────┘    │  Bucket  │  │
│                                          └──────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Arquitectura de Despliegue (AWS)

```
┌─────────────────────────────────────────────────────────┐
│                    AWS us-east-1                         │
│                                                         │
│  ┌──────────────────┐    ┌──────────────────────────┐  │
│  │  Security Group   │    │  IAM Instance Profile    │  │
│  │  SSH:22, HTTP:80  │    │  S3 permissions only     │  │
│  └────────┬─────────┘    └────────────┬─────────────┘  │
│           │                           │                 │
│           v                           v                 │
│  ┌─────────────────────────────────────┐                │
│  │        EC2 (t3.small)               │                │
│  │  ┌──────────┐  ┌────────────────┐   │                │
│  │  │  Nginx   │  │ systemd svc    │   │                │
│  │  │  :80     │──│ uvicorn :8000  │   │                │
│  │  └──────────┘  └────────────────┘   │                │
│  │  ┌──────────────────────────────┐   │                │
│  │  │  Cron: cleanup_s3.py /15min  │   │                │
│  │  └──────────────────────────────┘   │                │
│  └─────────────────────────────────────┘                │
│                                                         │
│  ┌──────────────────────────────────────┐               │
│  │  S3 Bucket                           │               │
│  │  - Public access blocked             │               │
│  │  - Lifecycle: auto-delete 24h        │               │
│  │  - Cron: cleanup objects > 1h        │               │
│  └──────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

### Arquitectura del Backend (MVC simplificado)

```
main.py (punto de entrada)
    │
    ├── routes/              Controladores: reciben HTTP requests
    │    ├── upload.py       POST /api/upload
    │    ├── convert.py      POST /api/convert
    │    └── download.py     GET  /api/download/{job_id}
    │
    ├── services/            Logica de negocio
    │    ├── validator.py    Validacion MIME + extension + tamano
    │    ├── s3.py           Cliente S3 (singleton)
    │    ├── image_converter.py    Pillow: PNG/JPEG/WebP
    │    └── document_converter.py LibreOffice/WeasyPrint/pdfplumber
    │
    ├── models/
    │    └── schemas.py      DTOs con Pydantic (UploadResponse, ConvertRequest, etc.)
    │
    ├── config.py            Configuracion centralizada (singleton implicito)
    └── limiter.py           Rate limiting compartido (slowapi)
```

---

## Flujo de Datos

```
Usuario arrastra archivo
        │
        v
  POST /api/upload (multipart/form-data)
        │
        ├── Lee MAX_SIZE + 1 bytes (early rejection)
        ├── Sanitiza filename (os.path.basename)
        ├── Valida MIME type (magic bytes, NO Content-Type)
        ├── Genera UUID v4 (job_id)
        └── Sube a S3: uploads/{uuid}/{filename}
              │
              v
        Retorna: { job_id, filename, mime_type, size }
              │
              v
  POST /api/convert (JSON body)
        │
        ├── Valida job_id (regex UUID)
        ├── Descarga original de S3
        ├── Lee MIME de metadata S3 (fallback: magic bytes)
        ├── Enruta al conversor: Strategy Pattern
        │     ├── image ↔ image:  Pillow
        │     ├── compress:       Pillow (JPEG quality)
        │     ├── resize:         Pillow
        │     ├── strip metadata: Pillow (EXIF removal)
        │     ├── MD → PDF:       markdown → HTML → WeasyPrint
        │     ├── DOCX → PDF:     LibreOffice headless
        │     └── PDF → MD:       pdfplumber
        └── Sube resultado a S3: converted/{uuid}/converted.ext
              │
              v
        Retorna: { job_id, download_filename, size }
              │
              v
  GET /api/download/{job_id}
        │
        ├── Valida job_id (regex UUID)
        ├── Busca en S3: converted/{job_id}/
        └── Retorna: Response(bytes, Content-Disposition: attachment)
```

### Limpieza Automatica

Los archivos en S3 se eliminan por dos mecanismos complementarios:

| Mecanismo | Frecuencia | Umbral | Por que |
|---|---|---|---|
| Cron job (`scripts/cleanup_s3.py`) | Cada 15 minutos | > 1 hora | Limpieza agresiva para reducir costos |
| S3 Lifecycle Policy | Automatico AWS | > 24 horas | Red de seguridad (minimo de S3 es 1 dia) |

---

## Tech Stack y Justificacion

### Backend

| Tecnologia | Proposito | Por que esta y no otra |
|---|---|---|
| **Python 3** | Lenguaje principal | Ecosistema maduro para procesamiento de archivos (Pillow, pdfplumber, WeasyPrint) |
| **FastAPI** | Framework web | Async nativo, validacion automatica con Pydantic, documentacion Swagger auto-generada. Mas rapido que Flask |
| **Pillow** | Conversion de imagenes | Libreria estandar de Python para manipulacion de imagenes. Soporta PNG, JPEG, WebP |
| **LibreOffice** | DOCX → PDF | Unica opcion gratuita y confiable para conversion Word a PDF en servidor Linux |
| **WeasyPrint** | Markdown → PDF | Convierte HTML a PDF con buen soporte de CSS. Markdown se convierte primero a HTML |
| **pdfplumber** | PDF → Markdown | Extrae texto de PDFs preservando estructura. Mas preciso que PyPDF2 para texto |
| **python-magic** | Deteccion MIME | Lee magic bytes del archivo (no confia en extension ni Content-Type) |
| **boto3** | Cliente AWS S3 | SDK oficial de AWS para Python |
| **slowapi** | Rate limiting | Wrapper de `limits` para FastAPI. Previene abuso (10 req/min por IP) |
| **uvicorn** | Servidor ASGI | Servidor de produccion para FastAPI, con soporte async |

### Frontend

| Tecnologia | Proposito | Por que esta y no otra |
|---|---|---|
| **React 19** | Framework UI | Componentes reutilizables, hooks, ecosistema masivo |
| **Vite** | Build tool | 10-100x mas rapido que Webpack en desarrollo (ES modules nativos) |
| **Tailwind CSS 4** | Estilos | Utility-first: estilos en el markup, sin archivos CSS separados. Purga CSS no usado |
| **Framer Motion** | Animaciones | API declarativa para animaciones complejas (AnimatePresence, spring physics) |
| **shadcn/ui** | Componentes base | Componentes accesibles (Radix UI) con Tailwind. Se copian al proyecto, no son dependencia |
| **Axios** | HTTP client | Interceptors, cancelacion, mejor API que fetch nativo |
| **react-dropzone** | Drag & drop | Zona de arrastre accesible con validacion de tipos |
| **Sonner** | Notificaciones toast | Ligera, animada, sin dependencias pesadas |

### Infraestructura

| Tecnologia | Proposito | Por que esta y no otra |
|---|---|---|
| **AWS EC2** (t3.small) | Servidor | 2 vCPU + 2 GB RAM. t3.micro insuficiente para LibreOffice headless |
| **AWS S3** | Almacenamiento temporal | Escalable, barato ($0.023/GB/mes), Lifecycle Policies nativas |
| **Nginx** | Reverse proxy | Sirve React build en `/`, proxea `/api/` a uvicorn:8000. Headers de seguridad |
| **systemd** | Gestion de procesos | Auto-restart si uvicorn falla, inicia al boot, logs con journalctl |
| **IAM Instance Profile** | Autenticacion AWS | El EC2 obtiene credenciales S3 automaticamente, sin access keys en el servidor |

---

## Conversiones Soportadas

### Imagenes (Pillow)

| Entrada | Salida | Opciones adicionales |
|---|---|---|
| PNG | JPEG, WebP | Compresion, resize, strip metadata |
| JPEG | PNG, WebP | Compresion, resize, strip metadata |
| WebP | PNG, JPEG | Compresion, resize, strip metadata |

### Documentos

| Entrada | Salida | Motor | Notas |
|---|---|---|---|
| DOCX (Word) | PDF | LibreOffice headless | Requiere `libreoffice-writer` instalado |
| Markdown (.md) | PDF | markdown → HTML → WeasyPrint | Soporta sintaxis Markdown estandar |
| PDF | Markdown (.md) | pdfplumber | Extraccion de texto (no OCR) |

### Operaciones sobre Imagenes

| Operacion | Descripcion | Parametros |
|---|---|---|
| Compresion | Reduce calidad para menor tamano (salida JPEG) | `quality`: 1-100 (default: 70) |
| Resize | Redimensiona a dimensiones especificas | `width`, `height` (pixels) |
| Strip Metadata | Elimina datos EXIF (GPS, camara, etc.) | Ninguno |

---

## Estructura del Proyecto

```
universal-file-converter/
│
├── backend/                      # API Python (FastAPI)
│   ├── app/
│   │   ├── main.py               # Punto de entrada, CORS, rate limiter, routers
│   │   ├── config.py             # Configuracion centralizada (Settings singleton)
│   │   ├── limiter.py            # Instancia compartida de slowapi
│   │   ├── routes/
│   │   │   ├── upload.py         # POST /api/upload — validacion y subida a S3
│   │   │   ├── convert.py        # POST /api/convert — Strategy Pattern de conversion
│   │   │   └── download.py       # GET /api/download/{id} — streaming desde S3
│   │   ├── services/
│   │   │   ├── validator.py      # Validacion MIME (magic bytes) + extension + tamano
│   │   │   ├── s3.py             # S3Service singleton (upload, download, metadata)
│   │   │   ├── image_converter.py    # Pillow: convert, compress, resize, strip EXIF
│   │   │   └── document_converter.py # LibreOffice, WeasyPrint, pdfplumber
│   │   └── models/
│   │       └── schemas.py        # DTOs Pydantic (UploadResponse, ConvertRequest, etc.)
│   ├── tests/                    # 30 tests en 7 archivos
│   │   ├── conftest.py           # Fixtures: moto mock S3, cliente async
│   │   ├── test_upload_route.py
│   │   ├── test_convert_route.py
│   │   ├── test_download_route.py
│   │   ├── test_image_converter.py
│   │   ├── test_document_converter.py
│   │   ├── test_s3.py
│   │   ├── test_validator.py
│   │   ├── test_health.py
│   │   └── generate_fixtures.py  # Script para regenerar fixtures de prueba
│   ├── test_fixtures/            # Archivos binarios de prueba (PNG, JPEG, PDF, etc.)
│   └── requirements.txt
│
├── frontend/                     # React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── App.jsx               # Orquestador wizard (3 pasos con AnimatePresence)
│   │   ├── main.jsx              # Entry point React
│   │   ├── index.css             # Tailwind base + custom theme (glassmorphism)
│   │   ├── api/                  # Funciones Axios para comunicarse con el backend
│   │   ├── components/
│   │   │   ├── AnimatedBackground.jsx  # Fondo con blobs flotantes en pastel
│   │   │   ├── StepIndicator.jsx       # Barra de progreso visual (3 pasos)
│   │   │   ├── UploadStep.jsx          # Paso 1: drag & drop + barra de progreso
│   │   │   ├── DropZone.jsx            # Zona de arrastre con animacion ripple
│   │   │   ├── ConvertStep.jsx         # Paso 2: grid de formatos con stagger
│   │   │   ├── FormatCard.jsx          # Tarjeta de formato con tilt 3D
│   │   │   └── DownloadStep.jsx        # Paso 3: confetti + boton magnetico
│   │   ├── lib/                  # Utilidades (cn para Tailwind merge)
│   │   └── assets/
│   ├── components.json           # Configuracion shadcn/ui
│   ├── vite.config.js            # Proxy de desarrollo (/api → localhost:8000)
│   └── package.json
│
├── nginx/
│   └── file-converter.conf       # Reverse proxy: / → React, /api/ → FastAPI
│
├── deploy/
│   ├── 01-setup-aws.sh           # Paso 1 (local): crea EC2, S3, IAM, SG
│   └── 02-setup-server.sh        # Paso 2 (SSH): instala deps, configura systemd
│
├── scripts/
│   └── cleanup_s3.py             # Cron job: borra objetos S3 > 1 hora
│
├── docs/plans/                   # Documentos de diseno e implementacion
│
├── CLAUDE.md                     # Contexto del proyecto para Claude Code
└── .gitignore
```

---

## Seguridad

La seguridad se implementa en **multiples capas** (defensa en profundidad):

| Capa | Proteccion | Implementacion |
|---|---|---|
| **Validacion MIME** | Detecta tipo real del archivo, no la extension | `python-magic` lee magic bytes (primeros bytes del archivo) |
| **Whitelist estricta** | Solo acepta tipos permitidos | Diccionario `ALLOWED_MIME_TYPES` en `config.py` — lo que no esta, se rechaza |
| **Limite de tamano** | Previene DoS por archivos gigantes | Lee `MAX_SIZE + 1` bytes y rechaza si excede (early rejection, no carga todo en memoria) |
| **Sanitizacion de filename** | Previene path traversal | `os.path.basename("../../etc/passwd")` → `"passwd"` |
| **Validacion de UUID** | Previene inyeccion en keys S3 | Regex `^[0-9a-f]{8}-...$` antes de cualquier operacion S3 |
| **Rate limiting** | Previene abuso | `slowapi`: 10 requests/minuto por IP en upload y convert |
| **IAM Instance Profile** | Sin credenciales en el servidor | EC2 obtiene permisos S3 via IAM Role, no hay access keys |
| **S3 public block** | Impide acceso publico al bucket | Los 4 settings de bloqueo publico activados |
| **Procesamiento aislado** | Previene ejecucion de codigo embebido | Archivos se procesan en `tempfile`, se borran inmediatamente |
| **CORS configurado** | Controla origenes permitidos | Variable `CORS_ORIGINS`, nunca se usa `"*"` |
| **Headers Nginx** | Previene MIME sniffing y clickjacking | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` |

---

## API Endpoints

La documentacion interactiva (Swagger UI) esta disponible en `/docs` cuando el backend esta corriendo.

### `GET /api/health`

Verificacion de salud del servidor.

**Respuesta:** `{"status": "ok"}`

### `POST /api/upload`

Sube un archivo para conversion.

**Content-Type:** `multipart/form-data`

| Campo | Tipo | Descripcion |
|---|---|---|
| `file` | binary | Archivo a convertir (max 50 MB) |

**Respuesta exitosa (200):**
```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "foto.png",
  "mime_type": "image/png",
  "size": 153600
}
```

**Errores:** `400` tipo no permitido · `413` tamano excedido · `429` rate limit

### `POST /api/convert`

Convierte un archivo previamente subido.

**Content-Type:** `application/json`

```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "target_format": "image/jpeg",
  "options": { "action": "compress", "quality": 50 }
}
```

**Respuesta exitosa (200):**
```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "download_filename": "converted.jpg",
  "size": 45200
}
```

**Errores:** `400` job_id invalido o conversion no soportada · `404` archivo no encontrado · `429` rate limit · `500` error de conversion

### `GET /api/download/{job_id}`

Descarga el archivo convertido.

**Respuesta:** Archivo binario con header `Content-Disposition: attachment`

**Errores:** `400` job_id invalido · `404` archivo no encontrado · `500` error de descarga

---

## Instalacion y Ejecucion Local

### Prerequisitos

- Python 3.10+
- Node.js 20 LTS
- LibreOffice (`libreoffice-writer`) — solo si necesitas conversion DOCX → PDF
- `libmagic` — para deteccion MIME con python-magic

```bash
# Ubuntu/Debian
sudo apt install libreoffice-writer libmagic1

# Arch Linux
sudo pacman -S libreoffice-still libmagic

# macOS
brew install libmagic libreoffice
```

### Backend

```bash
cd backend

# Crear entorno virtual
python -m venv venv
source venv/bin/activate    # Linux/macOS
# venv\Scripts\activate     # Windows

# Instalar dependencias
pip install -r requirements.txt

# Iniciar servidor de desarrollo
uvicorn app.main:app --reload
```

El backend estara disponible en `http://localhost:8000`. La documentacion Swagger esta en `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

El frontend estara disponible en `http://localhost:5173`. El proxy de Vite redirige `/api` a `localhost:8000` automaticamente.

### Variables de Entorno

| Variable | Default | Descripcion |
|---|---|---|
| `S3_BUCKET` | `file-converter-bucket` | Nombre del bucket S3 |
| `AWS_REGION` | `us-east-1` | Region de AWS |
| `CORS_ORIGINS` | `http://localhost:5173` | Origenes permitidos (separados por coma) |

> **Nota:** Para desarrollo local necesitas credenciales AWS configuradas (`aws configure`) o puedes usar [LocalStack](https://localstack.cloud/) para emular S3 localmente.

---

## Despliegue en AWS

El despliegue usa un enfoque de **2 scripts** para separar responsabilidades:

### Paso 1 — Crear infraestructura (desde tu maquina local)

```bash
# Requiere AWS CLI configurado con permisos de administrador
chmod +x deploy/01-setup-aws.sh
./deploy/01-setup-aws.sh
```

Este script crea:
1. **Key Pair SSH** — llave `.pem` para conectarte al servidor
2. **Security Group** — firewall con puertos 22 (SSH) y 80 (HTTP)
3. **IAM Role** — permisos minimos para S3 (principio de menor privilegio)
4. **Instance Profile** — vincula el IAM Role al EC2
5. **S3 Bucket** — con Lifecycle Policy (auto-borrado 24h) y bloqueo publico
6. **Instancia EC2** — t3.small con Ubuntu 22.04

La configuracion se guarda en `deploy/.env.deploy` (gitignored).

### Paso 2 — Configurar el servidor (por SSH en el EC2)

```bash
ssh -i deploy/file-converter-key.pem ubuntu@<IP_PUBLICA>

# En el servidor:
git clone https://github.com/LinguiniPanini/universal-file-converter.git ~/file-converter
cd ~/file-converter
chmod +x deploy/02-setup-server.sh
sudo S3_BUCKET=<bucket> CORS_ORIGINS=http://<IP> bash deploy/02-setup-server.sh
```

Este script instala y configura:
- Python 3, Node.js 20, LibreOffice, libmagic
- Entorno virtual + dependencias pip
- Build del frontend (`npm run build`)
- Nginx como reverse proxy
- systemd service para uvicorn (auto-restart, inicia al boot)
- Cron job para limpieza de S3 cada 15 minutos

### Comandos utiles en el servidor

```bash
sudo systemctl status file-converter    # Estado del backend
journalctl -u file-converter -f         # Stream de logs
sudo systemctl restart file-converter   # Reiniciar backend
sudo systemctl reload nginx             # Recargar Nginx
```

---

## Testing

El proyecto tiene **30 tests** distribuidos en 7 archivos, cubriendo rutas, servicios y validacion.

### Ejecutar tests

```bash
cd backend
source venv/bin/activate
python -m pytest -v
```

### Estructura de tests

| Archivo | Que prueba | Tecnica |
|---|---|---|
| `test_upload_route.py` | Endpoint `/api/upload` | Mock de `s3_service` via `@patch` |
| `test_convert_route.py` | Endpoint `/api/convert` | Mock de `s3_service` + conversores |
| `test_download_route.py` | Endpoint `/api/download` | Mock de `s3_service` |
| `test_image_converter.py` | Pillow: convert, compress, resize, strip | Fixtures binarias reales |
| `test_document_converter.py` | MD→PDF, DOCX→PDF, PDF→MD | `@pytest.mark.skipif` si no hay LibreOffice |
| `test_s3.py` | S3Service: upload, download, list, delete | `moto` mock (`@mock_aws`) |
| `test_validator.py` | Validacion MIME, extension, tamano | Fixtures binarias + datos sinteticos |
| `test_health.py` | Health check `/api/health` | Request directo |

### Herramientas de testing

- **pytest** — framework de testing
- **httpx** — cliente HTTP async para probar endpoints FastAPI
- **moto** — mock de servicios AWS (S3 completo en memoria, decorador `@mock_aws`)
- **pytest-asyncio** — soporte para tests async
- **Fixtures binarias** — archivos reales en `test_fixtures/` (generados por `generate_fixtures.py`)

---

## Decisiones de Diseno

### 1. Procesamiento sincrono vs asincrono

**Decision:** Procesamiento sincrono (el endpoint `/api/convert` bloquea hasta completar).

**Justificacion:** Para 1-10 usuarios concurrentes, la complejidad de un sistema de colas (Celery + Redis/RabbitMQ) no se justifica. El procesamiento sincrono simplifica el flujo (3 endpoints lineales) y facilita el debugging. En V2 con mas usuarios, se migraria a procesamiento con colas.

### 2. S3 como almacenamiento temporal (no filesystem local)

**Decision:** Todos los archivos pasan por S3, no se almacenan en disco del EC2.

**Justificacion:** Si el servidor se reconstruye o escala horizontalmente (multiples EC2), los archivos estarian disponibles desde cualquier instancia. S3 tambien ofrece Lifecycle Policies para auto-borrado y durabilidad 99.999999999% (11 nueves).

### 3. Deteccion MIME por magic bytes (no por extension)

**Decision:** Usamos `python-magic` para leer los primeros bytes del archivo y detectar el tipo real.

**Justificacion:** Un atacante puede renombrar `malware.exe` a `foto.png`. El Content-Type HTTP tambien es manipulable por el cliente. Los magic bytes son la unica fuente confiable del tipo real de un archivo.

### 4. IAM Instance Profile vs Access Keys

**Decision:** El EC2 obtiene credenciales via IAM Instance Profile, no hay access keys en el servidor.

**Justificacion:** Las access keys son credenciales estaticas que pueden filtrarse (en codigo, logs, o si el servidor es comprometido). El Instance Profile proporciona credenciales temporales que AWS rota automaticamente, siguiendo el principio de menor privilegio.

### 5. Despliegue en 2 scripts vs Docker/Terraform

**Decision:** Dos scripts bash (`01-setup-aws.sh` + `02-setup-server.sh`) en vez de Docker Compose o Terraform.

**Justificacion:** Para un proyecto academico con un solo servidor, scripts bash son mas transparentes y educativos. El estudiante ve exactamente que comandos se ejecutan. Docker y Terraform agregan capas de abstraccion que, aunque valiosas en produccion, oscurecen el aprendizaje de los conceptos subyacentes (IAM, Security Groups, systemd, Nginx).

### 6. Frontend como wizard de 3 pasos vs interfaz unica

**Decision:** La UI se divide en 3 pasos secuenciales (Upload → Convert → Download) con transiciones animadas.

**Justificacion:** Patron Wizard/Stepper para reducir carga cognitiva. Cada paso muestra solo los controles relevantes. Las animaciones con Framer Motion (AnimatePresence, spring physics) dan retroalimentacion visual del progreso.

### 7. Comentarios extensivos en espanol

**Decision:** Todo el codigo tiene comentarios detallados en espanol explicando el "por que", no solo el "que".

**Justificacion:** Este es un proyecto educativo. Los comentarios sirven como material de aprendizaje, explicando patrones de diseno (Singleton, Strategy, DTOs), decisiones de seguridad, y conceptos de ingenieria de software.

---

## Mejoras Futuras (V2)

| Mejora | Descripcion | Tecnologia sugerida |
|---|---|---|
| PDF → DOCX | Conversion inversa de PDF a Word editable | `pdf2docx` |
| OCR | Reconocimiento optico de caracteres en imagenes/PDFs | Tesseract + `pytesseract` |
| Batch conversion | Subir un ZIP con multiples archivos | Celery + Redis para procesamiento asincrono |
| Watermarks | Agregar marcas de agua a PDFs | PyPDF2 |
| HTTPS/SSL | Cifrado en transito | Let's Encrypt + certbot |
| Resize en UI | Exponer redimensionamiento en el frontend | El backend ya lo soporta |
| Preview | Vista previa del archivo antes de convertir | `react-pdf`, thumbnails generados en backend |
