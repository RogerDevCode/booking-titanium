#!/bin/bash
# ==============================================================================
# DD - Docker Down - Booking Titanium
# ==============================================================================
# Detiene todos los contenedores del docker-compose desde cualquier ubicación
# ==============================================================================

set -e

# Guardar directorio original
ORIGINAL_DIR="$(pwd)"

# Ruta al docker-compose
DOCKER_COMPOSE_DIR="/home/manager/Sync/docker-compose/n8n"

echo "🛑 Deteniendo docker-compose en $DOCKER_COMPOSE_DIR..."

# Cambiar al directorio docker-compose y ejecutar down
cd "$DOCKER_COMPOSE_DIR"
docker-compose down --remove-orphans

# Regresar al directorio original
cd "$ORIGINAL_DIR"

echo "✅ Contenedores detenidos. Directorio original: $ORIGINAL_DIR"
