#!/bin/bash

# ==========================================================
# BATCH UPGRADE SCRIPT
# Ejecuta upgrade_workflow.ts sobre todos los workflows
# y detiene el proceso si encuentra un error.
# ==========================================================

# 1. Configuración de seguridad:
# -e: Detiene el script si un comando fallla (exit code != 0).
# -u: Trata variables no definidas como error.
#set -e

# 2. Definición de rutas y flags
SCRIPT_PATH="/home/manager/Sync/N8N Projects/booking-titanium/scripts-ts/down-val-and-set-nodes/upgrade_workflow.ts"
SSOT_FILE="/home/manager/Sync/N8N Projects/booking-titanium/scripts-ts/down-val-and-set-nodes/ssot-nodes.json"
WORKFLOW_DIR="/home/manager/Sync/N8N Projects/booking-titanium/workflows"

# Flags adicionales (puedes descomentar --dry-run para prueba segura)
# FLAGS="--dry-run"
FLAGS="--backup"  # Recomendado: crea .bak antes de sobrescribir
#FLAGS="--dry-run"

echo "🚀 Iniciando proceso masivo de actualización..."
echo "📄 Fuente de verdad (SSOT): $SSOT_FILE"
echo "📂 Directorio: $WORKFLOW_DIR"
echo "⚙️  Comando: npx tsx $SCRIPT_PATH [FILE] --ssot $SSOT_FILE $FLAGS"
echo "------------------------------------------------------------"

# 3. Verificar prerequisitos
if [ ! -f "$SSOT_FILE" ]; then
    echo "❌ ERROR CRÍTICO: No se encuentra el archivo SSOT '$SSOT_FILE'."
    echo "   Por favor, ejecuta primero el discovery:"
    echo "   npx tsx scripts-ts/node-tools/discover_node_types.ts --file ssot-nodes.json"
    exit 1
fi

if [ ! -f "$SCRIPT_PATH" ]; then
    echo "❌ ERROR CRÍTICO: No se encuentra el script '$SCRIPT_PATH'."
    echo "   Verifica que la ruta sea correcta."
    exit 1
fi

# 4. Bucle para procesar cada archivo JSON
# Se usa un patrón para evitar problemas con espacios en nombres,
# aunque en workflows JSON no suele haberlos.
find "$WORKFLOW_DIR" -maxdepth 1 -name "*.json" -print0 | while IFS= read -r -d '' file; do

    echo ""
    echo "⏳ Procesando: $file"

    # Ejecutamos el comando.
    # Si este comando fallla (return code 1 o 2), 'set -e' detiene todo el script.
    npx tsx "$SCRIPT_PATH" "$file" --ssot "$SSOT_FILE" $FLAGS

    echo "✅ Éxito: $file"

done

echo "------------------------------------------------------------"
echo "🎉 Proceso completado: Todos los workflows fueron procesados sin errores."
