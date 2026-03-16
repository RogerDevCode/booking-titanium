#!/bin/bash
# ==============================================================================
# DU - Docker Up - Booking Titanium
# ==============================================================================
# Inicia el docker-compose en background y regresa al directorio original
# ==============================================================================

set -e

# Guardar directorio original
ORIGINAL_DIR="$(pwd)"

# Ruta al docker-compose (SSOT)
DOCKER_COMPOSE_DIR="/home/manager/Sync/N8N_Projects/booking-titanium/docker-compose"

echo "🚀 Iniciando docker-compose en $DOCKER_COMPOSE_DIR..."

# Cambiar al directorio docker-compose y ejecutar up en background
cd "$DOCKER_COMPOSE_DIR"
docker-compose up -d

# Regresar al directorio original
cd "$ORIGINAL_DIR"

echo "✅ Contenedores iniciados. Directorio original: $ORIGINAL_DIR"
