#!/usr/bin/env bash
# =============================================================================
# 01-setup-aws.sh — Crear toda la infraestructura AWS para el File Converter
# =============================================================================
#
# Este script se ejecuta DESDE TU MÁQUINA LOCAL (no desde el servidor).
# Requiere: AWS CLI configurado (`aws configure`) con permisos de administrador.
#
# ¿Qué crea?
#   1. Key Pair SSH (.pem) para conectarte al servidor
#   2. Security Group con puertos 22 (SSH) y 80 (HTTP)
#   3. IAM Role con permisos mínimos para S3
#   4. Instance Profile (vincula el IAM Role al EC2)
#   5. S3 Bucket con Lifecycle Policy (auto-borrado a las 24h)
#   6. Instancia EC2 (t3.small, Ubuntu 22.04)
#
# Uso:
#   chmod +x deploy/01-setup-aws.sh
#   ./deploy/01-setup-aws.sh
#
# Al finalizar, imprime el comando SSH para conectarte al servidor.
# =============================================================================

set -euo pipefail  # Detener ejecución ante cualquier error

# -----------------------------------------------------------------------------
# CONFIGURACIÓN — Modifica estos valores si necesitas
# -----------------------------------------------------------------------------
REGION="us-east-1"
INSTANCE_TYPE="t3.small"           # Mínimo recomendado (LibreOffice necesita RAM)
KEY_NAME="file-converter-key"      # Nombre del key pair en AWS
KEY_FILE="./deploy/${KEY_NAME}.pem"  # Archivo local donde se guarda la llave privada
PROJECT_NAME="file-converter"      # Prefijo para nombrar recursos AWS

# AMI de Ubuntu 22.04 LTS en us-east-1 (actualizar si cambia la región)
# Puedes buscar AMIs actualizadas en: https://cloud-images.ubuntu.com/locator/ec2/
AMI_ID="ami-0c7217cdde317cfec"

# Obtener el Account ID de AWS para crear nombres únicos de bucket
# Cada bucket S3 debe tener un nombre GLOBALMENTE único en todo AWS
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET_NAME="${PROJECT_NAME}-bucket-${AWS_ACCOUNT_ID}"

echo "============================================="
echo " Desplegando Universal File Converter en AWS"
echo "============================================="
echo ""
echo "Región:     ${REGION}"
echo "Instancia:  ${INSTANCE_TYPE}"
echo "Bucket S3:  ${BUCKET_NAME}"
echo ""

# -----------------------------------------------------------------------------
# PASO 1: Crear Key Pair (llave SSH)
# -----------------------------------------------------------------------------
# Un Key Pair permite conectarte al EC2 por SSH sin contraseña.
# AWS guarda la llave pública; nosotros guardamos la privada (.pem).
# NUNCA commitees el archivo .pem a git.
echo "[1/6] Creando Key Pair SSH..."

if aws ec2 describe-key-pairs --key-names "${KEY_NAME}" --region "${REGION}" &>/dev/null; then
    echo "  → Key pair '${KEY_NAME}' ya existe, usando el existente."
else
    aws ec2 create-key-pair \
        --key-name "${KEY_NAME}" \
        --region "${REGION}" \
        --query 'KeyMaterial' \
        --output text > "${KEY_FILE}"

    # chmod 400 = solo el dueño puede leer. SSH rechaza llaves con permisos abiertos.
    chmod 400 "${KEY_FILE}"
    echo "  → Llave privada guardada en: ${KEY_FILE}"
fi

# -----------------------------------------------------------------------------
# PASO 2: Crear Security Group (firewall virtual)
# -----------------------------------------------------------------------------
# Un Security Group es un firewall que controla qué tráfico puede entrar/salir
# de tu instancia EC2. Por defecto TODO está bloqueado.
# Abrimos:
#   - Puerto 22 (SSH): para administrar el servidor
#   - Puerto 80 (HTTP): para que los usuarios accedan a la app
echo "[2/6] Creando Security Group..."

# Obtener el VPC por defecto (red virtual donde vive el EC2)
VPC_ID=$(aws ec2 describe-vpcs \
    --filters "Name=isDefault,Values=true" \
    --region "${REGION}" \
    --query 'Vpcs[0].VpcId' \
    --output text)

# Verificar si el security group ya existe
SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=${PROJECT_NAME}-sg" "Name=vpc-id,Values=${VPC_ID}" \
    --region "${REGION}" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "None")

if [ "${SG_ID}" = "None" ] || [ -z "${SG_ID}" ]; then
    SG_ID=$(aws ec2 create-security-group \
        --group-name "${PROJECT_NAME}-sg" \
        --description "Security group para Universal File Converter" \
        --vpc-id "${VPC_ID}" \
        --region "${REGION}" \
        --query 'GroupId' \
        --output text)

    # Regla: permitir SSH (puerto 22) desde cualquier IP
    # En producción real, limitarías esto a TU IP: --cidr "tu.ip/32"
    aws ec2 authorize-security-group-ingress \
        --group-id "${SG_ID}" \
        --protocol tcp \
        --port 22 \
        --cidr "0.0.0.0/0" \
        --region "${REGION}"

    # Regla: permitir HTTP (puerto 80) desde cualquier IP
    aws ec2 authorize-security-group-ingress \
        --group-id "${SG_ID}" \
        --protocol tcp \
        --port 80 \
        --cidr "0.0.0.0/0" \
        --region "${REGION}"

    echo "  → Security Group creado: ${SG_ID}"
else
    echo "  → Security Group ya existe: ${SG_ID}"
fi

# -----------------------------------------------------------------------------
# PASO 3: Crear IAM Role (permisos para el EC2)
# -----------------------------------------------------------------------------
# Un IAM Role es como una "identidad" que le damos al EC2.
# En vez de guardar Access Keys en el servidor (inseguro), le asignamos
# un Role que le da permisos específicos automáticamente.
#
# Principio de Menor Privilegio: solo damos los permisos MÍNIMOS necesarios.
# Este role SOLO puede hacer operaciones en el bucket específico.
echo "[3/6] Creando IAM Role..."

ROLE_NAME="${PROJECT_NAME}-ec2-role"

# Trust Policy: define QUIÉN puede asumir este role (en este caso, EC2)
TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}'

# Verificar si el role ya existe
if aws iam get-role --role-name "${ROLE_NAME}" &>/dev/null; then
    echo "  → IAM Role '${ROLE_NAME}' ya existe."
else
    aws iam create-role \
        --role-name "${ROLE_NAME}" \
        --assume-role-policy-document "${TRUST_POLICY}" \
        --description "Role para EC2 del File Converter - acceso S3 minimo" \
        --output text --query 'Role.Arn'

    echo "  → IAM Role creado: ${ROLE_NAME}"
fi

# S3 Policy: define QUÉ puede hacer el role (solo operaciones en nuestro bucket)
S3_POLICY="{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {
      \"Effect\": \"Allow\",
      \"Action\": [
        \"s3:PutObject\",
        \"s3:GetObject\",
        \"s3:DeleteObject\",
        \"s3:ListBucket\",
        \"s3:HeadObject\"
      ],
      \"Resource\": [
        \"arn:aws:s3:::${BUCKET_NAME}\",
        \"arn:aws:s3:::${BUCKET_NAME}/*\"
      ]
    }
  ]
}"

POLICY_NAME="${PROJECT_NAME}-s3-policy"

# Adjuntar la política al role (inline policy)
aws iam put-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-name "${POLICY_NAME}" \
    --policy-document "${S3_POLICY}" 2>/dev/null || true

echo "  → Política S3 adjuntada al role."

# -----------------------------------------------------------------------------
# PASO 4: Crear Instance Profile
# -----------------------------------------------------------------------------
# Un Instance Profile es el "contenedor" que permite asignar un IAM Role
# a una instancia EC2. Es un paso intermedio requerido por AWS.
# Role → Instance Profile → EC2
echo "[4/6] Creando Instance Profile..."

PROFILE_NAME="${PROJECT_NAME}-profile"

if aws iam get-instance-profile --instance-profile-name "${PROFILE_NAME}" &>/dev/null; then
    echo "  → Instance Profile '${PROFILE_NAME}' ya existe."
else
    aws iam create-instance-profile \
        --instance-profile-name "${PROFILE_NAME}"

    aws iam add-role-to-instance-profile \
        --instance-profile-name "${PROFILE_NAME}" \
        --role-name "${ROLE_NAME}"

    echo "  → Instance Profile creado y role adjuntado."

    # Esperar a que AWS propague el Instance Profile (puede tardar unos segundos)
    echo "  → Esperando propagación de IAM (15 segundos)..."
    sleep 15
fi

# -----------------------------------------------------------------------------
# PASO 5: Crear S3 Bucket con Lifecycle Policy
# -----------------------------------------------------------------------------
# El bucket almacena archivos temporales (uploads y conversiones).
# La Lifecycle Policy los borra automáticamente después de 1 día.
# Esto ahorra costos y evita acumular datos de usuarios.
echo "[5/6] Creando S3 Bucket..."

if aws s3api head-bucket --bucket "${BUCKET_NAME}" --region "${REGION}" &>/dev/null; then
    echo "  → Bucket '${BUCKET_NAME}' ya existe."
else
    aws s3api create-bucket \
        --bucket "${BUCKET_NAME}" \
        --region "${REGION}"

    echo "  → Bucket creado: ${BUCKET_NAME}"
fi

# Lifecycle Policy: borrar todos los objetos después de 1 día
# El mínimo de S3 es 1 día. Para limpieza más agresiva (1 hora), usamos
# el script cleanup_s3.py vía cron.
aws s3api put-bucket-lifecycle-configuration \
    --bucket "${BUCKET_NAME}" \
    --lifecycle-configuration '{
        "Rules": [
            {
                "ID": "auto-delete-temp-files",
                "Status": "Enabled",
                "Filter": {},
                "Expiration": {
                    "Days": 1
                }
            }
        ]
    }'

echo "  → Lifecycle Policy configurada (auto-borrado a las 24h)."

# Bloquear acceso público al bucket (seguridad)
aws s3api put-public-access-block \
    --bucket "${BUCKET_NAME}" \
    --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "  → Acceso público bloqueado."

# -----------------------------------------------------------------------------
# PASO 6: Lanzar instancia EC2
# -----------------------------------------------------------------------------
# Creamos una instancia t3.small con Ubuntu 22.04.
# t3.small tiene 2 vCPU y 2 GB RAM — suficiente para LibreOffice headless.
# t3.micro (free tier) tiene solo 1 GB RAM y puede quedarse corta.
echo "[6/6] Lanzando instancia EC2..."

INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "${AMI_ID}" \
    --instance-type "${INSTANCE_TYPE}" \
    --key-name "${KEY_NAME}" \
    --security-group-ids "${SG_ID}" \
    --iam-instance-profile "Name=${PROFILE_NAME}" \
    --region "${REGION}" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${PROJECT_NAME}}]" \
    --query 'Instances[0].InstanceId' \
    --output text)

echo "  → Instancia lanzada: ${INSTANCE_ID}"
echo "  → Esperando a que esté lista..."

# Esperar a que la instancia esté en estado "running"
aws ec2 wait instance-running \
    --instance-ids "${INSTANCE_ID}" \
    --region "${REGION}"

# Obtener la IP pública
PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids "${INSTANCE_ID}" \
    --region "${REGION}" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

echo ""
echo "============================================="
echo " ¡INFRAESTRUCTURA CREADA EXITOSAMENTE!"
echo "============================================="
echo ""
echo " Instancia EC2:  ${INSTANCE_ID}"
echo " IP Pública:     ${PUBLIC_IP}"
echo " S3 Bucket:      ${BUCKET_NAME}"
echo " Región:         ${REGION}"
echo ""
echo " Para conectarte por SSH:"
echo "   ssh -i ${KEY_FILE} ubuntu@${PUBLIC_IP}"
echo ""
echo " Después de conectarte, ejecuta el script de configuración:"
echo "   # Primero, clona tu repositorio en el servidor"
echo "   git clone <tu-repo-url> ~/file-converter"
echo "   cd ~/file-converter"
echo "   # Luego ejecuta:"
echo "   chmod +x deploy/02-setup-server.sh"
echo "   sudo S3_BUCKET=${BUCKET_NAME} CORS_ORIGINS=http://${PUBLIC_IP} bash deploy/02-setup-server.sh"
echo ""
echo " Una vez configurado, abre en tu navegador:"
echo "   http://${PUBLIC_IP}"
echo ""
echo "============================================="

# Guardar la configuración para referencia
cat > "./deploy/.env.deploy" << EOF
# Archivo de referencia — NO commitear a git
# Generado por 01-setup-aws.sh el $(date)
INSTANCE_ID=${INSTANCE_ID}
PUBLIC_IP=${PUBLIC_IP}
BUCKET_NAME=${BUCKET_NAME}
REGION=${REGION}
KEY_FILE=${KEY_FILE}
SG_ID=${SG_ID}
ROLE_NAME=${ROLE_NAME}
EOF

echo ""
echo " Configuración guardada en: ./deploy/.env.deploy"
echo " (Este archivo NO se commitea a git)"
