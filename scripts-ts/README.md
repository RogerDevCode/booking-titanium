# scripts-ts/ - Indice Maestro

24+ scripts TypeScript. Ejecutar con `npx tsx script.ts [args]`.

## Migración desde Python

Este directorio contiene la migración completa de los scripts Python originales en `scripts-py/` a TypeScript. Los siguientes archivos fueron migrados:

### Core Modules (Migrated from Python)

| Script Python Original | Script TypeScript | Descripción |
|------------------------|-------------------|-------------|
| `n8n_crud_agent.py` | `n8n-crud-agent.ts` | Clase `N8NCrudAgent` con toda la funcionalidad CRUD para n8n |
| `qwen_n8n_plugin.py` | `qwen-n8n-plugin.ts` | Plugin interface para Qwen |
| `utils.py` | `utils.ts` | Funciones utilitarias |

### Demo and Test Scripts (Migrated from Python)

| Script Python Original | Script TypeScript | Descripción |
|------------------------|-------------------|-------------|
| `demo_crud.py` | `demo-crud.ts` | Demostración de operaciones CRUD |
| `example_usage.py` | `example-usage.ts` | Ejemplo de uso básico |
| `qwen_n8n_integration_demo.py` | `qwen-n8n-integration-demo.ts` | Demo de integración con Qwen |
| `test_n8n_crud_agent.py` | `test-n8n-crud-agent.ts` | Tests unitarios completos |
| `test_publish_unpublish.py` | `test-publish-unpublish.ts` | Tests para publish/unpublish |

## Configuración

| Script | Descripción |
|--------|-------------|
| `config.ts` | Config centralizada (`N8NConfig`, `WORKFLOW_IDS`) |
| `n8n-crud-agent.ts` | Agente CRUD para operaciones con n8n |

## N8N API - Lectura

| Script | Descripción | Parámetros |
|--------|-------------|------------|
| `n8n_read_list.ts` | Lista workflows | `--active`, `--format` |
| `n8n_read_get.ts` | Obtiene workflow | `--id ID` |
| `n8n_read_export.ts` | Exporta a JSON | `--id ID --output file.json` |
| `n8n_read_executions.ts` | Lista ejecuciones | `--workflow ID --limit N` |

## N8N API - Escrita/Activación

| Script | Descripción | Parámetros |
|--------|-------------|------------|
| `n8n_create_from_file.ts` | Crea desde JSON | `--file workflow.json` |
| `n8n_update_from_file.ts` | Actualiza | `--id ID --file workflow.json --activate` |
| `n8n_update_activate.ts` | Activa | `--id ID` |
| `n8n_update_deactivate.ts` | Desactiva | `--id ID` |
| `n8n_delete.ts` | Elimina | `--id ID` |
| `n8n_push.ts` | Push múltiples | Directorio `workflows/` |

## Deployment/Upload

| Script | Descripción | Parámetros |
|--------|-------------|------------|
| `upload_all_workflows.ts` | Sube todos | `--activate` |
| `activate_workflows.ts` | Activa específicos | `--ids "id1,id2"` |
| `activate_all_workflows.ts` | Activa todos | - |

## Validación

| Script | Descripción |
|--------|-------------|
| `validate_all_workflows.ts` | Valida todos los workflows |
| `workflow_validator.ts` | Validador de workflows |

## Varios

| Script | Descripción |
|--------|-------------|
| `auto_layout.ts` | Auto layout nodos |
| `create_wipe.ts` | Crea workflow wipe |
| `find_orphans.ts` | Encuentra registros orphans |
| `get_exec_ts.ts` | Timestamps ejecución |
| `parse_exec.ts` | Parsea output |
| `peek_exec.ts` | Observa ejecución |
| `read_exec_25407.ts` | Lee ejecución específica |
| `watchdog.ts` | Watchdog para tests |

## Tests y Demos

| Script | Descripción |
|--------|-------------|
| `demo-crud.ts` | Demo de operaciones CRUD |
| `example-usage.ts` | Ejemplo de uso |
| `test-n8n-crud-agent.ts` | Suite de tests completa |
| `test-publish-unpublish.ts` | Tests de publish/unpublish |
| `qwen-n8n-integration-demo.ts` | Demo de integración |
| `utils.ts` | Utilidades varias |

---

## Uso

```bash
cd scripts-ts
npx tsx script.ts [params]
```

## Ejecutar Tests

```bash
# Ejecutar todos los tests
npx tsx test-n8n-crud-agent.ts

# Ejecutar tests de publish/unpublish
npx tsx test-publish-unpublish.ts
```

## Configuración de API Key

> **IMPORTANTE:** Las API keys se manejan centralmente en el archivo `.env` padre.

Los scripts buscan las API keys en el siguiente orden:

1. Variables de ambiente: `N8N_API_KEY` o `N8N_ACCESS_TOKEN`
2. Archivo `.env` local: `scripts-ts/.env`

### Cargar API Key

Para cargar la API key en tu sesión de shell:

```bash
# Desde el directorio n8n
source ./get-n8n-apikey.sh

# O desde scripts-ts
source ../get-n8n-apikey.sh
```

### Actualizar API Key

Cuando regeneres la API key en n8n:

1. Actualiza solo el archivo `.env` padre: `/home/manager/Sync/docker-compose/n8n/.env`
2. Ejecuta el script de actualización para propagar los cambios:

   ```bash
   cd /home/manager/Sync/docker-compose/n8n
   ./update-mcp-configs.sh
   ```

Esto actualizará automáticamente todas las configuraciones de MCP (Qwen CLI, Kilo-Code, etc.).

## Métodos Disponibles en N8NCrudAgent

La clase `N8NCrudAgent` proporciona los siguientes métodos:

- `listWorkflows()` - Obtener todos los workflows
- `listActiveWorkflows()` - Obtener solo workflows activos
- `getWorkflowById(id)` - Obtener workflow específico
- `createWorkflow(data)` - Crear nuevo workflow
- `updateWorkflow(id, data)` - Actualizar workflow existente
- `deleteWorkflow(id)` - Eliminar workflow
- `activateWorkflow(id)` - Activar (publicar) workflow
- `deactivateWorkflow(id)` - Desactivar (unpublic) workflow
- `publishWorkflow(id)` - Alias para activate
- `unpublishWorkflow(id)` - Alias para deactivate
- `executeWorkflow(id)` - Ejecutar workflow manualmente
- `getExecutions(workflowId, limit)` - Obtener ejecuciones del workflow
- `getExecutionById(id)` - Obtener ejecución específica

## Ejemplos de Uso

### Usando el CRUD Agent Directamente

```typescript
import { N8NCrudAgent } from './n8n-crud-agent';

const agent = new N8NCrudAgent('https://n8n.stax.ink');
const workflows = await agent.listWorkflows();
```

### Usando el Plugin de Qwen

```typescript
import { qwenN8nPlugin } from './qwen-n8n-plugin';

const result = await qwenN8nPlugin('list_workflows');
```

### Usando las Utilidades

```typescript
import { listWorkflowsSimple, activateWorkflowSimple } from './utils';

await listWorkflowsSimple();
await activateWorkflowSimple('workflow-id');
```
