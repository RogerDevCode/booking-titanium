# 🔍 N8N Node Discovery & Workflow Upgrade

Herramientas para descubrir los node types instalados en tu instancia n8n
y actualizar/validar workflows contra esa fuente de verdad (SSOT).

## Arquitectura

discover_node_types.ts upgrade_workflow.ts
─────────────────────── ────────────────────
Docker container n8n Lee ssot-nodes.json
↓ ↓
Lee clases de nodos reales Para cada nodo del workflow:
↓ ↓
Extrae version[] completo ¿type existe?
• VersionedNodeType (IF, Switch, etc.) ¿typeVersion disponible?
• Regular NodeType (ManualTrigger, etc.) ↓
↓ FIX / UPGRADE / OK
Genera: ↓
• ssot-nodes.json (SSOT limpio) Valida post-upgrade:
• .n8n-node-types-cache.json (cache) estructura, conexiones,
huérfanos, contratos, etc.
↓
Escribe workflow actualizado

text


## Requisitos

| Requisito | Detalle |
|---|---|
| **Node.js** | v18+ (con `fetch` nativo) |
| **tsx** | `npm install -g tsx` o usar `npx tsx` |
| **Docker** | Container n8n running (método docker) |
| **.env** | `N8N_API_URL`, `N8N_API_KEY`, `N8N_ACCESS_TOKEN` |

### Variables de entorno (`.env`)

```env
N8N_API_URL=https://n8n.stax.ink
N8N_API_KEY=tu-api-key
N8N_ACCESS_TOKEN=tu-access-token

1. discover_node_types.ts

Descubre todos los node types instalados en tu instancia n8n,
incluyendo versiones disponibles, displayName y grupo.
Métodos de descubrimiento
Método	Cómo funciona	Ventaja
docker (recomendado)	docker cp + docker exec node script.js	Lee inst.nodeVersions directamente — 100% real
api	GET /rest/node-types via HTTP	No requiere acceso Docker
auto (default)	Intenta docker → api	Mejor de ambos mundos
Patrones de nodos soportados

text

VersionedNodeType (IF, Switch, Code, HttpRequest, Postgres, etc.)
  → inst.nodeVersions = { 1: ClassV1, 2: ClassV2, 2.1: ClassV2_1, ... }
  → Captura TODAS las versiones disponibles

Regular NodeType (ManualTrigger, ErrorTrigger, etc.)
  → inst.description.version = number | number[]
  → Captura version array o single version

Uso

Bash

# Auto: intenta docker → api
npx tsx scripts-ts/node-tools/discover_node_types.ts

# Docker con container específico
npx tsx scripts-ts/node-tools/discover_node_types.ts \
  --method docker \
  --container n8n_titanium

# Docker + verbose (ver paths, errores de carga, stats)
npx tsx scripts-ts/node-tools/discover_node_types.ts \
  --method docker \
  --verbose

# Guardar SSOT en path custom
npx tsx scripts-ts/node-tools/discover_node_types.ts \
  --file scripts-ts/node-tools/ssot-nodes.json

# Solo API (sin Docker)
npx tsx scripts-ts/node-tools/discover_node_types.ts \
  --method api

# Discovery + diff inmediato contra un workflow
npx tsx scripts-ts/node-tools/discover_node_types.ts \
  --diff workflows/BB_01_Gateway.json

Flags
Flag	Default	Descripción
--method <docker|api|auto>	auto	Método de descubrimiento
--container <name>	n8n_titanium	Nombre del container Docker
--file <path>	ssot-nodes.json	Path del archivo SSOT de salida
--diff <workflow.json>	—	Comparar workflow contra lo descubierto
--verbose	—	Detalles de paths, errores, stats
--help	—	Mostrar ayuda
Output: ssot-nodes.json

JSON

{
  "_meta": {
    "generatedAt": "2025-01-15T10:30:00.000Z",
    "n8nVersion": "2.10.2",
    "n8nUrl": "https://n8n.stax.ink",
    "method": "docker cp+exec (n8n_titanium)",
    "container": "n8n_titanium",
    "totalNodes": 387
  },
  "nodes": [
    {
      "type": "n8n-nodes-base.if",
      "displayName": "IF",
      "latestVersion": 2.3,
      "availableVersions": [1, 2, 2.1, 2.2, 2.3],
      "group": ["transform"]
    },
    {
      "type": "n8n-nodes-base.code",
      "displayName": "Code",
      "latestVersion": 2,
      "availableVersions": [1, 2],
      "group": ["transform"]
    },
    {
      "type": "n8n-nodes-base.httpRequest",
      "displayName": "HTTP Request",
      "latestVersion": 4.2,
      "availableVersions": [1, 2, 3, 4, 4.1, 4.2],
      "group": ["output"]
    }
  ]
}

Output: --diff

text

══════════════════════════════════════════════════════════════
  DIFF: BB_01_Gateway
══════════════════════════════════════════════════════════════

  ✖ BAD VERSION    [Check Valid?] n8n-nodes-base.if v1 → disponibles: [1, 2, 2.1, 2.2, 2.3]
  ⚠ UPGRADEABLE    [Build Query] n8n-nodes-base.code v1 → v2
  ✔ OK             [Webhook] n8n-nodes-base.webhook v2

══════════════════════════════════════════════════════════════
  OK: 8  │  UPGRADE: 2  │  ERROR: 1
══════════════════════════════════════════════════════════════

2. upgrade_workflow.ts

Lee el SSOT generado por discover_node_types.ts y actualiza cada nodo
del workflow a su latestVersion. Luego ejecuta validaciones completas.
Proceso

text

1. Lee ssot-nodes.json
2. Para cada nodo del workflow:
   • typeVersion NO existe en availableVersions → FIX a latestVersion
   • typeVersion < latestVersion (--target latest) → UPGRADE
   • typeVersion == latestVersion → OK (sin cambios)
3. Validación post-upgrade (14 checks)
4. Escribe archivo actualizado

Uso

Bash

# Prerequisito: generar el SSOT
npx tsx scripts-ts/node-tools/discover_node_types.ts \
  --file ssot-nodes.json

# ═══ MODO SEGURO: ver qué cambiaría sin tocar nada ═══
npx tsx scripts-ts/node-tools/upgrade_workflow.ts \
  workflows/BB_01_Gateway.json \
  --dry-run

# ═══ UPGRADE con backup (.bak) ═══
npx tsx scripts-ts/node-tools/upgrade_workflow.ts \
  workflows/BB_01_Gateway.json \
  --backup

# ═══ SOLO FIX versiones inválidas (no upgradar las válidas) ═══
npx tsx scripts-ts/node-tools/upgrade_workflow.ts \
  workflows/BB_01_Gateway.json \
  --target current

# ═══ UPGRADE a latest (default) ═══
npx tsx scripts-ts/node-tools/upgrade_workflow.ts \
  workflows/BB_01_Gateway.json \
  --target latest

# ═══ BATCH: todos los workflows ═══
npx tsx scripts-ts/node-tools/upgrade_workflow.ts \
  workflows/*.json \
  --dry-run

npx tsx scripts-ts/node-tools/upgrade_workflow.ts \
  workflows/*.json \
  --backup

# ═══ SSOT custom ═══
npx tsx scripts-ts/node-tools/upgrade_workflow.ts \
  workflows/BB_01_Gateway.json \
  --ssot /path/to/custom-ssot.json

Flags
Flag	Default	Descripción
--ssot <file>	ssot-nodes.json	Archivo SSOT de discover_node_types.ts
--dry-run	—	Muestra cambios sin escribir archivo
--backup	—	Crea .bak antes de sobrescribir
--target latest	latest	Actualizar todo a latestVersion
--target current	—	Solo corregir versiones inválidas
--verbose	—	Detalles extra
--help	—	Mostrar ayuda
--target latest vs --target current
Versión en workflow	Disponibles	--target latest	--target current
v1 (no existe)	[2, 2.1, 2.3]	✖ FIX → v2.3	✖ FIX → v2.3
v2 (válida, no latest)	[2, 2.1, 2.3]	⬆ UPGRADE → v2.3	✔ OK (no toca)
v2.3 (latest)	[2, 2.1, 2.3]	✔ OK	✔ OK
Validaciones post-upgrade (14 checks)
#	Check	Severidad
1	Estructura JSON (name, nodes, connections)	FATAL/ERROR
2	Campos requeridos por nodo	ERROR
3	Nombres duplicados	ERROR
4	IDs duplicados	ERROR
5	Versiones vs SSOT (post-upgrade)	ERROR
6	Conexiones rotas	ERROR
7	Nodos huérfanos / islas	WARN/ERROR
8	Ciclos en el grafo	WARN
9	Triple Entry Pattern (OBLIGATORIO_01)	WARN
10	Standard Contract heurístico (OBLIGATORIO_02)	WARN
11	Webhook paths prohibidos (PROHIBIDO_07)	ERROR
12	Nodos deshabilitados	INFO
13	Credenciales malformadas	WARN
14	Nodos terminales sin contrato	WARN
Output ejemplo

text

══════════════════════════════════════════════════════════════
  UPGRADE: BB_01_Gateway
══════════════════════════════════════════════════════════════
  Archivo:  workflows/BB_01_Gateway.json
  Nodos:    12
  Target:   latest
  Modo:     WRITE + BACKUP

  ─── VERSION UPGRADES ───

  ✖ FIX      [Check Valid?] if v1 → v2.3 (versión no existía)
  ⬆ UPGRADE  [Build Query] code v2 → v2.2
  ⬆ UPGRADE  [Fetch Data] httpRequest v4.1 → v4.2
  ✔ OK       9 nodo(s) ya en latest

  Resumen: 1 fixed + 2 upgraded + 9 ok = 3 cambios

  ─── VALIDACIÓN POST-UPGRADE ───

  FATAL: 0  │  ERROR: 0  │  WARN: 1  │  INFO: 2

  ─── TRIPLE_ENTRY ───
    ⚠ WARN  Faltan: Execute Workflow Trigger.

══════════════════════════════════════════════════════════════
  Backup: workflows/BB_01_Gateway.json.bak
  ✔ 3 nodo(s) actualizado(s) → workflows/BB_01_Gateway.json
══════════════════════════════════════════════════════════════

Exit codes
Código	Significado
0	OK (con o sin warnings)
1	Errores de validación pendientes
2	Fatal (SSOT no encontrado, JSON inválido)
Flujo recomendado

Bash

# ═══ PASO 1: Descubrir lo instalado ═══
npx tsx scripts-ts/node-tools/discover_node_types.ts \
  --method docker \
  --container n8n_titanium \
  --file ssot-nodes.json

# ═══ PASO 2: Revisar qué cambiaría (dry run) ═══
npx tsx scripts-ts/node-tools/upgrade_workflow.ts \
  workflows/*.json \
  --dry-run

# ═══ PASO 3: Aplicar con backup ═══
npx tsx scripts-ts/node-tools/upgrade_workflow.ts \
  workflows/*.json \
  --backup

# ═══ PASO 4: Validar resultado ═══
npx tsx scripts-ts/validate_workflow.ts \
  workflows/*.json

# ═══ PASO 5: Subir a n8n ═══
npx tsx scripts-ts/n8n_push_v2.ts \
  --name "BB_01_Gateway" \
  --file workflows/BB_01_Gateway.json \
  --activate

Estructura de archivos

text

scripts-ts/
├── node-tools/
│   ├── README.md                    ← Este archivo
│   ├── discover_node_types.ts       ← Discovery de node types
│   └── upgrade_workflow.ts          ← Upgrade + validación
│
├── validate_workflow.ts             ← Validador standalone
├── n8n_push_v2.ts                   ← Push workflows a n8n
└── ...

ssot-nodes.json                      ← SSOT generado (gitignore)
.n8n-node-types-cache.json           ← Cache interno (gitignore)

.gitignore

Agregar estos archivos generados:

gitignore

# Node discovery cache + SSOT
ssot-nodes.json
.n8n-node-types-cache.json
*.bak

Troubleshooting
Docker exec falla

Bash

# Verificar container
docker ps | grep n8n

# Test rápido
docker exec n8n_titanium node -e "console.log('OK')"

# Verbose para diagnosticar
npx tsx scripts-ts/node-tools/discover_node_types.ts --method docker --verbose

SSOT no encontrado

Bash

# Generar primero
npx tsx scripts-ts/node-tools/discover_node_types.ts --file ssot-nodes.json

# Verificar que existe
ls -la ssot-nodes.json

propertyValues[itemName] is not iterable

Este error ocurre cuando un nodo tiene typeVersion incompatible
con tu versión de n8n. Solución:

Bash

# Fix automático
npx tsx scripts-ts/node-tools/upgrade_workflow.ts \
  workflows/problematic_workflow.json \
  --backup

Ref: GitHub issue #14775
