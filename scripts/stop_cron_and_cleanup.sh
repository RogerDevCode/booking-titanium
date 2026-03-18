#!/bin/bash
# Script para verificar y detener workflows CRON en n8n
# y listar eventos de Google Calendar de hoy
#
# Uso: ./scripts/stop_cron_and_cleanup.sh [--stop] [--list-events]

set -e

N8N_HOST="https://n8n.stax.ink"
N8N_API_KEY="${N8N_API_KEY:-}"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  STOP CRON & CLEANUP - Verificación y parada de workflows CRON           ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Función para listar workflows
list_workflows() {
    echo -e "${BLUE}🔍 Listando workflows en n8n...${NC}\n"
    
    if [ -z "$N8N_API_KEY" ]; then
        echo -e "${RED}❌ ERROR: N8N_API_KEY no configurada${NC}"
        echo "   Exporta tu API key: export N8N_API_KEY='tu-api-key'"
        exit 1
    fi
    
    # Listar todos los workflows
    curl -s -X GET "$N8N_HOST/api/v1/workflows" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        -H "Content-Type: application/json" | \
        jq -r '.data[] | select(.name | test("cron|sync|queue|retry"; "i")) | "\(.id) | \(.name) | Activo: \(.active)"' 2>/dev/null || \
    echo "Error listando workflows. Verifica API key y conexión."
}

# Función para desactivar workflow
deactivate_workflow() {
    local workflow_id=$1
    local workflow_name=$2
    
    echo -e "${YELLOW}   Desactivando: $workflow_name${NC}"
    
    curl -s -X POST "$N8N_HOST/api/v1/workflows/$workflow_id/deactivate" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        -H "Content-Type: application/json" > /dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}   ✅ DESACTIVADO: $workflow_name${NC}"
    else
        echo -e "${RED}   ❌ Error desactivando: $workflow_name${NC}"
    fi
}

# Función para activar workflow
activate_workflow() {
    local workflow_id=$1
    local workflow_name=$2
    
    echo -e "${YELLOW}   Activando: $workflow_name${NC}"
    
    curl -s -X POST "$N8N_HOST/api/v1/workflows/$workflow_id/activate" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        -H "Content-Type: application/json" > /dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}   ✅ ACTIVADO: $workflow_name${NC}"
    else
        echo -e "${RED}   ❌ Error activando: $workflow_name${NC}"
    fi
}

# Función para listar eventos de hoy desde la DB
list_today_bookings() {
    echo -e "${BLUE}📅 Bookings en base de datos para hoy ($(date +%Y-%m-%d)):${NC}\n"
    
    # Verificar conexión a DB
    if [ -f ".env" ]; then
        source .env
    fi
    
    if [ -n "$DATABASE_URL" ]; then
        PGPASSWORD="${DATABASE_URL##*@}" PGOPTIONS="-c timezone=-03" psql \
            -h "${DATABASE_URL##*//}" \
            -U "${DATABASE_URL#*://}" \
            -d "${DATABASE_URL%%/*}" \
            -c "SELECT id, provider_id, service_id, start_time, gcal_event_id, status 
                FROM bookings 
                WHERE start_time >= CURRENT_DATE 
                  AND start_time < CURRENT_DATE + INTERVAL '1 day'
                ORDER BY start_time;" 2>/dev/null || \
        echo "Error conectando a DB. Verifica DATABASE_URL."
    else
        echo -e "${RED}❌ DATABASE_URL no configurada${NC}"
        echo "   Para listar bookings, configura DATABASE_URL en .env"
    fi
    
    echo ""
}

# Función para mostrar instrucciones
show_instructions() {
    echo ""
    echo "┌─────────────────────────────────────────────────────────────────────────┐"
    echo "│ INSTRUCCIONES PARA ELIMINAR EVENTOS DE GCALENDAR Y DETENER CRON        │"
    echo "├─────────────────────────────────────────────────────────────────────────┤"
    echo "│                                                                         │"
    echo "│ WORKFLOWS CRON A DETENER:                                               │"
    echo "│ 1. WF4_Sync_Engine (cada 15 min) - Sincroniza bookings → GCal          │"
    echo "│ 2. WF8_Booking_Queue_Worker (cada 30s) - Procesa bookings asíncronos   │"
    echo "│ 3. DLQ_Retry (cada 1 min) - Reintenta bookings fallidos                │"
    echo "│ 4. NN_05_Reminder_Cron (cada 15 min) - Recordatorios (NO GCal)         │"
    echo "│                                                                         │"
    echo "│ MÉTODOS PARA DETENER:                                                   │"
    echo "│                                                                         │"
    echo "│ A) Automático (recomendado):                                            │"
    echo "│    ./scripts/stop_cron_and_cleanup.sh --stop                            │"
    echo "│                                                                         │"
    echo "│ B) Manual desde n8n UI:                                                 │"
    echo "│    1. Ir a https://n8n.stax.ink/workflows                               │"
    echo "│    2. Buscar cada workflow por nombre                                   │"
    echo "│    3. Click en toggle para desactivar                                   │"
    echo "│                                                                         │"
    echo "│ C) Vía API:                                                             │"
    echo "│    curl -X POST https://n8n.stax.ink/api/v1/workflows/<ID>/deactivate \\│"
    echo "│      -H 'X-N8N-API-KEY: <tu-api-key>'                                   │"
    echo "│                                                                         │"
    echo "├─────────────────────────────────────────────────────────────────────────┤"
    echo "│ ELIMINAR EVENTOS DE GCALENDAR:                                          │"
    echo "│                                                                         │"
    echo "│ A) Manual desde Google Calendar:                                        │"
    echo "│    1. Ir a https://calendar.google.com                                  │"
    echo "│    2. Seleccionar calendario: dev.n8n.stax@gmail.com                    │"
    echo "│    3. Click en cada evento de hoy → Eliminar                            │"
    echo "│                                                                         │"
    echo "│ B) Vía Google Calendar API (requiere credenciales):                     │"
    echo "│    npx tsx scripts/gcal_cleanup_today.ts                                │"
    echo "│                                                                         │"
    echo "│ C) Vía n8n workflow:                                                    │"
    echo "│    curl -X POST https://n8n.stax.ink/webhook/gcal-delete-today          │"
    echo "│                                                                         │"
    echo "└─────────────────────────────────────────────────────────────────────────┘"
    echo ""
}

# Función principal para detener workflows
stop_all_cron() {
    echo -e "${RED}🛑 DETENIENDO todos los workflows CRON relacionados con GCal...${NC}\n"
    
    if [ -z "$N8N_API_KEY" ]; then
        echo -e "${RED}❌ ERROR: N8N_API_KEY no configurada${NC}"
        exit 1
    fi
    
    # Lista de workflows a detener (ID y nombre)
    # Nota: Los IDs reales pueden variar, hay que obtenerlos dinámicamente
    
    echo "Obteniendo lista de workflows..."
    
    # Obtener workflows activos que contienen 'cron', 'sync', 'queue', o 'retry' en el nombre
    local workflows=$(curl -s -X GET "$N8N_HOST/api/v1/workflows" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        -H "Content-Type: application/json" | \
        jq -r '.data[] | select(.active == true) | select(.name | test("cron|sync|queue|retry"; "i")) | "\(.id)|\(.name)"' 2>/dev/null)
    
    if [ -z "$workflows" ]; then
        echo "ℹ️  No se encontraron workflows CRON activos"
        return 0
    fi
    
    local count=0
    while IFS='|' read -r id name; do
        if [ -n "$id" ] && [ -n "$name" ]; then
            deactivate_workflow "$id" "$name"
            ((count++))
        fi
    done <<< "$workflows"
    
    echo ""
    echo -e "${GREEN}✅ Se desactivaron $count workflows${NC}\n"
}

# Main
case "${1:-}" in
    --stop)
        stop_all_cron
        list_today_bookings
        show_instructions
        ;;
    --list-events)
        list_today_bookings
        ;;
    --list-workflows)
        list_workflows
        ;;
    --help|-h)
        echo "Uso: $0 [--stop|--list-events|--list-workflows|--help]"
        echo ""
        echo "Opciones:"
        echo "  --stop          Detener todos los workflows CRON relacionados con GCal"
        echo "  --list-events   Listar bookings de hoy en la base de datos"
        echo "  --list-workflows Listar workflows en n8n"
        echo "  --help          Mostrar esta ayuda"
        ;;
    *)
        list_workflows
        list_today_bookings
        show_instructions
        ;;
esac
