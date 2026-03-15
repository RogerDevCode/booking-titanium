#!/bin/bash

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

CONTAINER_NAME="n8n_titanium"
CREDS_DIR="$HOME/Sync/N8N Projects/credentials"

echo -e "${GREEN}🔑 Importando credenciales (Fix: Array Wrapper)...${NC}"
echo ""

# Verificar directorio
if [ ! -d "$CREDS_DIR" ]; then
    echo -e "${RED}❌ Directorio no existe: $CREDS_DIR${NC}"
    exit 1
fi

# Contar archivos
COUNT=$(ls -1 "$CREDS_DIR"/*.json 2>/dev/null | wc -l)
if [ "$COUNT" -eq 0 ]; then
    echo -e "${RED}❌ No hay archivos .json en: $CREDS_DIR${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Credenciales a importar ($COUNT):${NC}"
ls -lh "$CREDS_DIR"/*.json
echo ""

read -p "¿Importar estas credenciales? (s/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo -e "${YELLOW}❌ Cancelado${NC}"
    exit 0
fi

IMPORTED=0
FAILED=0

for file in "$CREDS_DIR"/*.json; do
    filename=$(basename "$file")
    echo -e "${YELLOW}   → Procesando: $filename${NC}"

    # FIX 1: Crear un JSON válido (Array) envolviendo el objeto
    # Usamos un heredoc para concatenar corchetes y el contenido del archivo
    # Esto envuelve { ... } dentro de [ ... ]

    # Metemos el JSON envuelto directamente al contenedor via stdin
    # Usamos 'cat' para leer y 'echo' para añadir corchetes
    (echo "["; cat "$file"; echo "]") | docker exec -i $CONTAINER_NAME sh -c 'cat > /tmp/import-cred.json'

    # FIX 2: Dar permisos (por si acaso)
    docker exec $CONTAINER_NAME chmod 644 /tmp/import-cred.json

    # Importar
    RESULT=$(docker exec $CONTAINER_NAME n8n import:credentials --input=/tmp/import-cred.json 2>&1)

    # Verificar resultado
    if echo "$RESULT" | grep -qi "successfully imported"; then
        ((IMPORTED++))
        echo -e "${GREEN}      ✓ Importado OK${NC}"
    else
        ((FAILED++))
        echo -e "${RED}      ✗ Error detectado${NC}"
        # Filtrar errores
        ERROR_MSG=$(echo "$RESULT" | grep -iE "error|failed" | grep -v "debug\|warn" | head -3)
        if [ ! -z "$ERROR_MSG" ]; then
             echo -e "${RED}        Razón: $ERROR_MSG${NC}"
        fi
    fi

    # Limpiar
    docker exec $CONTAINER_NAME rm -f /tmp/import-cred.json
done

# Resumen
echo ""
echo -e "${YELLOW}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ PROCESO FINALIZADO${NC}"
echo -e "${GREEN}   Importadas: $IMPORTED${NC}"
if [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}   Fallidas: $FAILED${NC}"
fi
echo -e "${YELLOW}════════════════════════════════════════${NC}"

# Verificación en DB (Corregido el error de sintaxis)
echo -e "${GREEN}📊 Verificando última entrada en DB...${NC}"
ENV_FILE="$HOME/Sync/docker-compose/n8n/.env"
if [ -f "$ENV_FILE" ]; then
    DB_USER=$(grep "^POSTGRES_USER=" "$ENV_FILE" | cut -d'=' -f2)
    DB_NAME=$(grep "^POSTGRES_DB=" "$ENV_FILE" | cut -d'=' -f2)

    if [ -n "$DB_USER" ] && [ -n "$DB_NAME" ]; then
        docker exec n8n_postgres psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT id, name, type FROM credentials_entity ORDER BY created_at DESC LIMIT 5;"
    else
        echo -e "${YELLOW}⚠️  No se pudo leer configuración de base de datos${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Archivo .env no encontrado${NC}"
fi
