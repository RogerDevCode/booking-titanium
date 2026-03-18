# n8n_activate_workflow.ts

## Propósito

Script complementario para activar/desactivar workflows en n8n. Se usa **junto con el MCP** que no puede cambiar el estado `active` directamente.

## ¿Por qué existe este script?

El MCP server (`n8n-workflow-builder`) tiene estas capacidades:

| Operación | MCP | Script | Notas |
|-----------|-----|--------|-------|
| `create_workflow` | ✅ Sí | ❌ No | MCP crea directamente |
| `get_workflow` | ✅ Sí | ❌ No | MCP lee directamente |
| `update_workflow` | ✅ Sí | ❌ No | MCP actualiza directamente |
| `delete_workflow` | ✅ Sí | ❌ No | MCP borra directamente |
| `list_workflows` | ✅ Sí | ❌ No | MCP lista directamente |
| `activate_workflow` | ❌ No | ✅ Sí | **Solo script** |
| `deactivate_workflow` | ❌ No | ✅ Sí | **Solo script** |

**Conclusión:** El script es **exclusivamente para activación/desactivación**. Todo lo demás se hace con MCP.

## Uso

### Help
```bash
npx tsx scripts-ts/n8n_activate_workflow.ts --help
```

### Activar por ID
```bash
npx tsx scripts-ts/n8n_activate_workflow.ts --id 3qjxakUfnVlfvlwj --activate
```

### Activar por nombre
```bash
npx tsx scripts-ts/n8n_activate_workflow.ts --name "Diagnostic Test" --activate
```

### Desactivar
```bash
npx tsx scripts-ts/n8n_activate_workflow.ts --name "Diagnostic Test" --deactivate
```

## Flujo de Trabajo Recomendado

```
┌─────────────────────────────────────────────────────────────┐
│  MCP (90%) + Script (10%)                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. MCP: create_workflow                                    │
│     → Crear workflow con nodos y conexiones                 │
│                                                              │
│  2. MCP: get_workflow                                       │
│     → Verificar estructura                                  │
│                                                              │
│  3. SCRIPT: n8n_activate_workflow.ts --activate             │
│     → Activar workflow                                      │
│                                                              │
│  4. MCP: get_workflow                                       │
│     → Confirmar active: true                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Comparación de Métodos

### Método 1: MCP Directo (RECOMENDADO para creación/edición)

```bash
# Crear workflow
mcp__n8n-workflow-builder__create_workflow --name "My WF" --nodes [...] --connections [...]

# Actualizar workflow
mcp__n8n-workflow-builder__update_workflow --id <id> --nodes [...] --connections [...]

# Activar (requiere script)
npx tsx scripts-ts/n8n_activate_workflow.ts --id <id> --activate
```

**Ventajas:**
- ✅ Conversacional - describes lo que quieres
- ✅ Sin archivos intermedios
- ✅ Rápido para cambios pequeños
- ✅ Integrado con Qwen Code

**Desventajas:**
- ❌ No puede activar workflows

### Método 2: n8n_push_v2.ts (Para deploy masivo)

```bash
npx tsx scripts-ts/n8n_push_v2.ts --name "My WF" --file workflows/my_wf.json --activate
```

**Ventajas:**
- ✅ Upload masivo desde archivos locales
- ✅ Validación pre-upload
- ✅ Sync con workflow_activation_order.json

**Desventajas:**
- ❌ Requiere archivos JSON locales
- ❌ Más lento para cambios pequeños
- ❌ No activa realmente (strips `active` field)

### Método 3: UI Web (Para publish final)

```
1. Abrir n8n.stax.ink
2. Navegar al workflow
3. Click "Publish"
```

**Ventajas:**
- ✅ Registro completo de webhooks
- ✅ Visual - ves lo que cambias

**Desventajas:**
- ❌ Manual - no automatizable
- ❌ Lento para múltiples workflows

El script lee de `.env` en el root del proyecto:

```env
N8N_API_URL=https://n8n.stax.ink
X_N8N_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

O usa overrides por línea de comandos:
```bash
npx tsx scripts-ts/n8n_activate_workflow.ts \
  --url https://n8n.stax.ink \
  --api-key YOUR_API_KEY \
  --name "Workflow Name" \
  --activate
```

## Limitaciones Conocidas

### 1. Activar ≠ Publicar (n8n v2.x)

En n8n v2.0+, hay una diferencia entre:
- **Activate (API)**: Setea `active: true` en DB
- **Publish (UI)**: Activa + registra webhooks en servicios externos

**Workaround**: Después de activar vía API, hacer clic en "Publish" en la UI para workflows con webhooks.

Ref: [GitHub Issue #551](https://github.com/czlonkowski/n8n-mcp/issues/551)

### 2. Nombres duplicados

Si hay múltiples workflows con el mismo nombre, el script:
1. Lista todos los matches
2. Usa el más reciente (por `updatedAt`)
3. Muestra advertencia con los IDs encontrados

**Recomendación**: Usar `--id` cuando haya duplicados.

## Exit Codes

| Código | Significado |
|--------|-------------|
| 0 | Éxito |
| 1 | Error (workflow no encontrado, error de API, etc.) |

## Ejemplos de Casos de Uso

### Caso 1: Activar después de deploy
```bash
# 1. Deploy con n8n_push_v2.ts
npx tsx scripts-ts/n8n_push_v2.ts --name WF2_Booking_Orchestrator --file workflows/WF2.json

# 2. Activar
npx tsx scripts-ts/n8n_activate_workflow.ts --name WF2_Booking_Orchestrator --activate
```

### Caso 2: Desactivar antes de mantenimiento
```bash
# Desactivar temporalmente
npx tsx scripts-ts/n8n_activate_workflow.ts --name NN_01_Booking_Gateway --deactivate

# ... hacer cambios ...

# Reactivar
npx tsx scripts-ts/n8n_activate_workflow.ts --name NN_01_Booking_Gateway --activate
```

### Caso 3: Toggle rápido para testing
```bash
# Desactivar
npx tsx scripts-ts/n8n_activate_workflow.ts --id 3qjxakUfnVlfvlwj -d

# Activar
npx tsx scripts-ts/n8n_activate_workflow.ts --id 3qjxakUfnVlfvlwj -a
```

## Technical Details

### Endpoint usado
```
POST /api/v1/workflows/{id}/activate
POST /api/v1/workflows/{id}/deactivate
```

### Response exitosa
```json
{
  "id": "workflow-id",
  "name": "Workflow Name",
  "active": true,
  "updatedAt": "2026-03-18T14:00:00.000Z"
}
```

### Response con error (validación)
```json
{
  "message": "Cannot publish workflow: 2 nodes have configuration issues:\n\nNode \"Postgres\":\n - Missing required credential: postgres"
}
```

## Véase también

- `scripts-ts/n8n_push_v2.ts` - Deploy completo de workflows
- `scripts-ts/n8n_crud_agent.ts` - CRUD operations vía MCP
- [n8n API Documentation](https://docs.n8n.io/api/)
- [GitHub Issue #21614](https://github.com/n8n-io/n8n/issues/21614) - Webhook registration
