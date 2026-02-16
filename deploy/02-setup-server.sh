#!/usr/bin/env bash
# =============================================================================
# 02-setup-server.sh — Configurar el servidor EC2 con la aplicación
# =============================================================================
#
# Este script se ejecuta DENTRO DEL SERVIDOR EC2 (después de conectarte por SSH).
#
# ¿Qué hace?
#   1. Instala dependencias del sistema (Python, Node.js, Nginx, LibreOffice)
#   2. Configura el backend (venv, requirements, systemd service)
#   3. Construye el frontend (npm build, copia a /var/www/)
#   4. Configura Nginx (reverse proxy)
#   5. Configura el cron de limpieza de S3
#   6. Inicia todos los servicios
#
# Uso (desde el EC2, después de clonar el repo):
#   sudo S3_BUCKET=tu-bucket CORS_ORIGINS=http://tu-ip bash deploy/02-setup-server.sh
#
# Variables de entorno requeridas:
#   S3_BUCKET     — Nombre del bucket S3 (lo imprime 01-setup-aws.sh)
#   CORS_ORIGINS  — Origen permitido para CORS (http://tu-ip-publica)
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Verificar que se ejecuta como root (necesario para instalar paquetes)
# -----------------------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: Este script debe ejecutarse con sudo."
    echo "Uso: sudo S3_BUCKET=mi-bucket CORS_ORIGINS=http://mi-ip bash deploy/02-setup-server.sh"
    exit 1
fi

# Verificar variables de entorno requeridas
: "${S3_BUCKET:?ERROR: Variable S3_BUCKET no definida}"
: "${CORS_ORIGINS:?ERROR: Variable CORS_ORIGINS no definida}"

# Detectar el directorio del proyecto (donde está este script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"

echo "============================================="
echo " Configurando servidor para File Converter"
echo "============================================="
echo ""
echo " Proyecto:     ${PROJECT_DIR}"
echo " S3 Bucket:    ${S3_BUCKET}"
echo " CORS Origins: ${CORS_ORIGINS}"
echo ""

# -----------------------------------------------------------------------------
# PASO 1: Instalar dependencias del sistema
# -----------------------------------------------------------------------------
# Actualizamos el índice de paquetes y luego instalamos:
#   - python3, pip, venv: para el backend FastAPI
#   - nodejs, npm: para construir el frontend React
#   - nginx: servidor web / reverse proxy
#   - libreoffice-writer: conversión DOCX → PDF (modo headless, sin GUI)
#   - libmagic1: librería C que python-magic usa para detectar tipos MIME
echo "[1/6] Instalando dependencias del sistema..."

# DEBIAN_FRONTEND=noninteractive evita que los paquetes pidan input interactivo
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    nginx \
    libreoffice-writer \
    libmagic1

# Instalar Node.js 20 LTS desde el repositorio oficial de NodeSource.
# Ubuntu incluye una versión vieja de Node; necesitamos una reciente para Vite.
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
    echo "  → Instalando Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo "  → Python: $(python3 --version)"
echo "  → Node:   $(node --version)"
echo "  → npm:    $(npm --version)"
echo "  → Nginx:  $(nginx -v 2>&1)"

# -----------------------------------------------------------------------------
# PASO 2: Configurar el backend
# -----------------------------------------------------------------------------
# Creamos un entorno virtual (venv) para aislar las dependencias de Python.
# Esto evita conflictos con los paquetes del sistema.
echo "[2/6] Configurando backend Python..."

cd "${PROJECT_DIR}/backend"

# Crear entorno virtual si no existe
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# Activar venv e instalar dependencias
# El "source" carga las variables de entorno del venv en la sesión actual
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

echo "  → Backend configurado en: ${PROJECT_DIR}/backend"

# Generar test fixtures (imágenes de prueba) si no existen
if [ ! -f "${PROJECT_DIR}/backend/test_fixtures/sample.png" ]; then
    source venv/bin/activate
    python tests/generate_fixtures.py
    deactivate
    echo "  → Test fixtures generados."
fi

# -----------------------------------------------------------------------------
# PASO 3: Construir el frontend
# -----------------------------------------------------------------------------
# El frontend React se "compila" (build) a archivos estáticos HTML/CSS/JS.
# Estos archivos estáticos son los que Nginx sirve a los usuarios.
# En desarrollo usamos `npm run dev` (con hot reload), pero en producción
# servimos el build estático (más rápido, optimizado, minificado).
echo "[3/6] Construyendo frontend React..."

cd "${PROJECT_DIR}/frontend"
npm install
npm run build

# Crear directorio de destino y copiar el build
mkdir -p /var/www/file-converter
cp -r dist/* /var/www/file-converter/

echo "  → Frontend desplegado en: /var/www/file-converter/"

# -----------------------------------------------------------------------------
# PASO 4: Crear servicio systemd para el backend
# -----------------------------------------------------------------------------
# systemd es el sistema de inicio de Linux. Un "service" es un proceso
# que systemd mantiene corriendo automáticamente.
#
# ¿Por qué systemd y no simplemente `uvicorn &`?
# - Se reinicia automáticamente si la app crashea
# - Se inicia automáticamente al reiniciar el servidor
# - Gestiona logs centralizados (journalctl)
# - Maneja variables de entorno de forma segura
echo "[4/6] Creando servicio systemd..."

# Crear archivo de servicio
# [Unit]: metadatos y dependencias
# [Service]: cómo ejecutar la app
# [Install]: cuándo iniciar (multi-user.target = cuando el sistema está listo)
cat > /etc/systemd/system/file-converter.service << EOF
[Unit]
Description=Universal File Converter - FastAPI Backend
After=network.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=${PROJECT_DIR}/backend

# Variables de entorno para la aplicación
# El EC2 obtiene credenciales AWS automáticamente via el IAM Instance Profile
# NO necesitamos AWS_ACCESS_KEY_ID ni AWS_SECRET_ACCESS_KEY
Environment=S3_BUCKET=${S3_BUCKET}
Environment=AWS_REGION=us-east-1
Environment=CORS_ORIGINS=${CORS_ORIGINS}

# Comando para iniciar la app
# --host 0.0.0.0: escuchar en todas las interfaces (no solo localhost)
# --port 8000: puerto interno (Nginx redirige el 80 aquí)
# --workers 2: número de procesos (1 por CPU core es buena regla)
ExecStart=${PROJECT_DIR}/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2

# Reiniciar automáticamente si la app falla
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Recargar systemd para que reconozca el nuevo servicio
systemctl daemon-reload
# Habilitar para que inicie en cada boot
systemctl enable file-converter
# Iniciar ahora
systemctl start file-converter

echo "  → Servicio creado y iniciado."
echo "  → Ver logs: journalctl -u file-converter -f"

# -----------------------------------------------------------------------------
# PASO 5: Configurar Nginx
# -----------------------------------------------------------------------------
# Nginx actúa como "reverse proxy":
#   - Recibe TODAS las requests HTTP en el puerto 80
#   - Las requests a / sirven los archivos estáticos del frontend
#   - Las requests a /api/ las reenvía al backend (puerto 8000)
#
# ¿Por qué no exponer FastAPI directamente al puerto 80?
# - Nginx maneja conexiones estáticas mucho más eficientemente
# - Nginx agrega headers de seguridad
# - Nginx limita el tamaño de uploads (capa extra de protección)
# - En producción agregarías HTTPS (SSL/TLS) aquí
echo "[5/6] Configurando Nginx..."

# Copiar nuestra configuración al directorio de Nginx
cp "${PROJECT_DIR}/nginx/file-converter.conf" /etc/nginx/sites-available/file-converter

# Eliminar el sitio default de Nginx (el "Welcome to Nginx" page)
rm -f /etc/nginx/sites-enabled/default

# Crear symlink para habilitar nuestro sitio
# Nginx lee de sites-enabled/, que son symlinks a sites-available/
ln -sf /etc/nginx/sites-available/file-converter /etc/nginx/sites-enabled/file-converter

# Verificar que la configuración es válida (sin errores de sintaxis)
nginx -t

# Recargar Nginx (sin downtime, a diferencia de restart)
systemctl reload nginx

echo "  → Nginx configurado y recargado."

# -----------------------------------------------------------------------------
# PASO 6: Configurar cron job de limpieza
# -----------------------------------------------------------------------------
# Cron es el programador de tareas de Linux.
# Cada 15 minutos ejecutamos cleanup_s3.py para borrar archivos con más de 1h.
#
# ¿Por qué cron además del S3 Lifecycle Policy?
# El Lifecycle Policy de S3 tiene un mínimo de 1 día. Nuestro cron borra
# archivos con más de 1 hora, dando una limpieza más agresiva.
echo "[6/6] Configurando cron de limpieza S3..."

# Crear el crontab entry
# Formato: minuto hora día mes díaSemana comando
# */15 = "cada 15 minutos"
CRON_CMD="*/15 * * * * S3_BUCKET=${S3_BUCKET} ${PROJECT_DIR}/backend/venv/bin/python ${PROJECT_DIR}/scripts/cleanup_s3.py >> /var/log/file-converter-cleanup.log 2>&1"

# Agregar al crontab del usuario ubuntu (sin duplicar si ya existe)
(crontab -u ubuntu -l 2>/dev/null | grep -v "cleanup_s3.py"; echo "${CRON_CMD}") | crontab -u ubuntu -

echo "  → Cron configurado: limpieza cada 15 minutos."

# -----------------------------------------------------------------------------
# ¡LISTO!
# -----------------------------------------------------------------------------
echo ""
echo "============================================="
echo " ¡SERVIDOR CONFIGURADO EXITOSAMENTE!"
echo "============================================="
echo ""
echo " La aplicación está corriendo en:"
echo "   ${CORS_ORIGINS}"
echo ""
echo " Comandos útiles:"
echo "   Ver estado:     sudo systemctl status file-converter"
echo "   Ver logs:       journalctl -u file-converter -f"
echo "   Reiniciar app:  sudo systemctl restart file-converter"
echo "   Reiniciar nginx: sudo systemctl reload nginx"
echo ""
echo " Estructura en el servidor:"
echo "   App:      ${PROJECT_DIR}/"
echo "   Frontend: /var/www/file-converter/"
echo "   Nginx:    /etc/nginx/sites-available/file-converter"
echo "   Servicio: /etc/systemd/system/file-converter.service"
echo "   Logs:     journalctl -u file-converter"
echo ""
echo "============================================="
