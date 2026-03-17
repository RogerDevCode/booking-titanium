# 🤖 HERRAMIENTAS AI PARA CREAR WORKFLOWS N8N

**Fecha:** 2026-03-17  
**Investigación:** Herramientas AI/LLM para crear workflows n8n paso a paso

---

## ✅ HERRAMIENTAS ENCONTRADAS

### 1. **MCP n8n Workflow Builder** (salacoste) ⭐⭐⭐⭐⭐

**GitHub:** [salacoste/mcp-n8n-workflow-builder](https://github.com/salacoste/mcp-n8n-workflow-builder)  
**Estado:** ✅ PRODUCCIÓN (v0.9.3, Dec 2025)  
**Stars:** 217 | **Forks:** 58

#### ¿Qué hace?
- ✅ Crea workflows n8n desde **lenguaje natural**
- ✅ Se integra con **Claude AI** y **Cursor IDE**
- ✅ 17 herramientas disponibles (crear, actualizar, ejecutar, debuggear)
- ✅ Soporte multi-instancia (dev, staging, production)

#### ¿Cómo funciona?

**Instalación:**
```bash
npm install -g @kernel.salacoste/n8n-workflow-builder
```

**Configuración en Cursor IDE** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "n8n-workflow-builder": {
      "command": "npx",
      "args": ["@kernel.salacoste/n8n-workflow-builder"]
    }
  }
}
```

**Configuración de entorno** (`.config.json`):
```json
{
  "environments": {
    "development": {
      "n8n_host": "http://localhost:5678",
      "n8n_api_key": "your_dev_api_key"
    },
    "production": {
      "n8n_host": "https://n8n.stax.ink",
      "n8n_api_key": "your_prod_api_key"
    }
  },
  "defaultEnv": "development"
}
```

#### Ejemplo de Uso

**Prompt en Cursor/Claude:**
```
Create a webhook workflow in staging that:
  - Receives POST requests at /customer-signup
  - Validates email and name fields
  - Sends welcome email via Gmail
  - Stores customer in PostgreSQL
```

**Resultado:** ✅ Workflow completo creado automáticamente

#### Herramientas Disponibles (17)

| Categoría | Herramientas |
|-----------|--------------|
| **Workflow** | `list_workflows`, `get_workflow`, `create_workflow`, `update_workflow`, `delete_workflow`, `activate_workflow`, `deactivate_workflow`, `execute_workflow` |
| **Executions** | `list_executions`, `get_execution`, `delete_execution`, `retry_execution` |
| **Tags** | `list_tags`, `get_tag`, `create_tag`, `update_tag`, `delete_tag` |
| **Credentials** | `get_credential_schema`, `list_credentials`, `get_credential`, `create_credential`, `update_credential`, `delete_credential` |

#### Limitaciones

| Limitación | Detalle |
|------------|---------|
| **Credential API** | `list_credentials` y `get_credential` bloqueados por seguridad |
| **Triggers** | Necesita triggers válidos (webhook, schedule) - `manualTrigger` NO reconocido |
| **Configuración** | `n8n_host` debe ser URL base (sin `/api/v1`) |
| **Versión** | Testeado principalmente con n8n v1.82.3+ |

---

### 2. **n8n-workflow-builder-mcp** (ifmelate) ⭐⭐⭐⭐

**GitHub:** [ifmelate/n8n-workflow-builder-mcp](https://github.com/ifmelate/n8n-workflow-builder-mcp)  
**Estado:** 🧪 EXPERIMENTAL (early development)  
**LobeHub:** [lobehub.com/zh/mcp/ifmelate-n8n-workflow-builder-mcp](https://lobehub.com/zh/mcp/ifmelate-n8n-workflow-builder-mcp)

#### ¿Qué hace?
- ✅ Crea workflows n8n desde **lenguaje natural**
- ✅ Integración con **Cursor IDE**
- ✅ Soporte para **123+ versiones de n8n**
- ✅ Auto-detección de versión
- ✅ Herramientas específicas para **AI/LangChain nodes**

#### ¿Cómo funciona?

**Instalación:**
```bash
npm install -g @ifmelate/n8n-workflow-builder-mcp
```

**Configuración en Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "n8n-workflow-builder": {
      "command": "npx",
      "args": ["@ifmelate/n8n-workflow-builder-mcp"],
      "env": {
        "N8N_API_URL": "https://n8n.stax.ink",
        "N8N_API_KEY": "your_api_key"
      }
    }
  }
}
```

#### Herramientas Disponibles

| Herramienta | Propósito |
|-------------|-----------|
| `create_workflow` | Crear workflow nuevo |
| `list_workflows` | Listar workflows existentes |
| `get_workflow_details` | Obtener detalles de workflow |
| `add_node` | Agregar nodo al workflow |
| `edit_node` | Editar nodo existente |
| `delete_node` | Eliminar nodo |
| `add_connection` | Conectar nodos |
| `add_ai_connections` | Conectar componentes AI (LangChain) |
| `list_available_nodes` | Listar nodos disponibles |
| `get_n8n_version_info` | Obtener información de versión |

#### Limitaciones

| Limitación | Detalle |
|------------|---------|
| **Estado** | Early development - produce JSON para copiar a n8n |
| **Parámetros** | Puede generar parámetros incorrectos desde LLM |
| **Conexiones** | Problemas ocasionales entre nodos |
| **Nodos** | No todos los tipos de nodos están testeado |
| **Prompt** | Sensible a claridad del prompt inicial |

---

### 3. **n8n AI Workflow Builder** (n8n oficial) ⭐⭐⭐

**Estado:** 🧪 INTEGRADO en n8n (feature experimental)

#### ¿Qué hace?
- ✅ Genera workflows desde prompts de lenguaje natural
- ✅ Integrado directamente en n8n UI
- ✅ Usa node type registry para identificar nodos requeridos

#### Ejemplo

**Prompt:**
```
Fetch GitHub issues and post to Slack
```

**Resultado:**
- Identifica nodos necesarios: GitHub, Slack
- Genera workflow JSON
- Permite editar antes de activar

#### Limitaciones
- Feature experimental
- No disponible en todas las instancias
- Limitado a nodos básicos

---

### 4. **n8n Atom + Antigravity** ⭐⭐⭐⭐

**Medium:** [n8n Atom + Antigravity: Vibe Building Workflow](https://medium.com/@phamduckhanh2411/n8n-atom-antigravity-vibe-building-workflow-feel-like-vibe-coding-43514d7617bf)

#### ¿Qué hace?
- ✅ Combina n8n Atom con Antigravity o Cursor
- ✅ Describe workflows en lenguaje natural
- ✅ AI genera workflow JSON
- ✅ Iteración rápida

#### Flujo de Trabajo

1. **Describir** workflow en lenguaje natural
2. **AI genera** JSON del workflow
3. **Iterar** con prompts adicionales
4. **Exportar** a n8n

---

## 📊 COMPARATIVA DE HERRAMIENTAS

| Herramienta | Estado | Integración | Lenguaje Natural | Multi-Instancia | AI Nodes |
|-------------|--------|-------------|------------------|-----------------|----------|
| **salacoste MCP** | ✅ Producción | Claude, Cursor | ✅ Sí | ✅ Sí | ⚠️ Básico |
| **ifmelate MCP** | 🧪 Experimental | Cursor | ✅ Sí | ⚠️ Limitado | ✅ LangChain |
| **n8n AI Builder** | 🧪 Experimental | n8n UI | ✅ Sí | ❌ No | ⚠️ Básico |
| **Atom + Antigravity** | ✅ Producción | Cursor, Antigravity | ✅ Sí | ⚠️ Manual | ✅ Sí |

---

## 🎯 RECOMENDACIÓN PARA WF2 v4.0

### Herramienta Recomendada: **salacoste/mcp-n8n-workflow-builder** ⭐⭐⭐⭐⭐

**Razones:**
1. ✅ **Producción** (v0.9.3, 217 stars)
2. ✅ **17 herramientas** completas
3. ✅ **Multi-instancia** (dev, staging, production)
4. ✅ **Cursor IDE** integration
5. ✅ **Documentación completa** (38+ páginas)
6. ✅ **Soporte activo** (último update Dec 2025)

---

## 📝 IMPLEMENTACIÓN PARA WF2 v4.0

### Paso 1: Instalar MCP Server

```bash
npm install -g @kernel.salacoste/n8n-workflow-builder
```

### Paso 2: Configurar en Cursor

**Archivo:** `.cursor/mcp.json` (en root del proyecto)
```json
{
  "mcpServers": {
    "n8n-workflow-builder": {
      "command": "npx",
      "args": ["@kernel.salacoste/n8n-workflow-builder"],
      "env": {
        "N8N_CONFIG_FILE": "/home/manager/Sync/N8N_Projects/booking-titanium/.n8n-mcp-config.json"
      }
    }
  }
}
```

### Paso 3: Configurar Entorno

**Archivo:** `.n8n-mcp-config.json`
```json
{
  "environments": {
    "production": {
      "n8n_host": "https://n8n.stax.ink",
      "n8n_api_key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "n8n_subdomain": "stax"
    }
  },
  "defaultEnv": "production"
}
```

### Paso 4: Crear WF2 v4.0 con AI

**Prompt en Cursor/Claude:**
```
Create a webhook workflow in production called "WF2_Booking_Orchestrator_v4" that:

1. Receives POST requests at /booking-orchestrator-v4
2. Validates input (provider_id, service_id, start_time required)
3. Checks idempotency in PostgreSQL (bookings table)
4. If duplicate, returns existing booking
5. If not duplicate:
   - Acquires lock in booking_locks table
   - Checks circuit breaker status
   - Checks availability in bookings table
   - Creates Google Calendar event
   - Creates booking in PostgreSQL
   - Releases lock
6. Returns Standard Contract Output:
   { success, error_code, error_message, data, _meta }

Use these node versions:
- Code v2
- IF v2.3
- Postgres v2.6
- Google Calendar v1.3
- Webhook v2.1

PostgreSQL credentials:
- Host: ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech
- Database: neondb
- User: neondb_owner

Google Calendar:
- Email: dev.n8n.stax@gmail.com

Tags: production, booking, v4
```

### Paso 5: Refinar con Prompts Adicionales

```
Add error handling to all database nodes with onError: continueErrorOutput

Add a Release Lock node that runs on error paths

Add Standard Contract Output formatting to all error responses
```

### Paso 6: Activar Workflow

```
Activate workflow "WF2_Booking_Orchestrator_v4" and verify webhook is registered
```

---

## 🔧 COMANDOS DE EJEMPLO

### Listar Workflows Existentes
```
> List all active workflows in production
```

### Crear Workflow Nuevo
```
> Create a webhook workflow that receives bookings and stores in DB
```

### Debuggear Workflow
```
> Debug workflow WF2_Booking_Orchestrator_v4 - check node connections
```

### Actualizar Workflow
```
> Add error handling nodes to workflow WF2_Booking_Orchestrator_v4
```

### Ejecutar Workflow
```
> Execute workflow WF2_Booking_Orchestrator_v4 with test payload
```

---

## ⚠️ CONSIDERACIONES IMPORTANTES

### 1. **Queue Mode Bug**
- ⚠️ MCP server puede crear el workflow correctamente
- ⚠️ Pero queue mode bug puede causar runData null al ejecutar
- ✅ WF2 v4.0 (todo interno) debería evitar este bug

### 2. **Validación Manual**
- ✅ MCP server crea workflow
- ⚠️ **Siempre validar** nodos y conexiones manualmente
- ⚠️ Testear en development antes de production

### 3. **Credenciales**
- ⚠️ MCP server NO puede listar credenciales existentes (seguridad)
- ✅ Necesitas conocer IDs de credenciales de antemano
- ✅ O crear credenciales nuevas vía MCP

### 4. **Triggers**
- ⚠️ `manualTrigger` NO reconocido por n8n API v1.82.3+
- ✅ Usar webhook o schedule triggers

---

## 📚 RECURSOS ADICIONALES

### Documentación Oficial
- [salacoste/mcp-n8n-workflow-builder Docs](https://salacoste.github.io/mcp-n8n-workflow-builder/)
- [GitHub Repository](https://github.com/salacoste/mcp-n8n-workflow-builder)
- [npm Package](https://www.npmjs.com/package/@kernel.salacoste/n8n-workflow-builder)

### Tutoriales
- [n8n Atom + Antigravity Tutorial](https://medium.com/@phamduckhanh2411/n8n-atom-antigravity-vibe-building-workflow-feel-like-vibe-coding-43514d7617bf)
- [n8n AI Workflow Builder Architecture](https://medium.com/@rajveer.rathod1301/inside-n8ns-ai-workflow-builder-a-complete-architecture-deep-dive-f2eeb2d57ec8)

### Comunidad
- [n8n Community - AI Builders](https://community.n8n.io/tag/ai-builder)
- [n8n Discord - MCP Channel](https://discord.n8n.io/)

---

## 🎯 CONCLUSIÓN

**¿Existe herramienta para crear workflows n8n con AI?**

✅ **SÍ - MCP n8n Workflow Builder (salacoste)**

**Características:**
- ✅ Crea workflows desde lenguaje natural
- ✅ Integración con Cursor IDE y Claude AI
- ✅ 17 herramientas disponibles
- ✅ Multi-instancia (dev, staging, production)
- ✅ Producción (v0.9.3, 217 stars)

**Recomendado para WF2 v4.0:**
- ✅ Seguir guía de implementación arriba
- ✅ Usar prompts detallados (como ejemplo)
- ✅ Validar manualmente antes de activar
- ✅ Testear en development primero

---

**Estado:** ✅ HERRAMIENTA ENCONTRADA  
**Próximo paso:** Instalar MCP server y crear WF2 v4.0 con AI  
**Responsable:** Equipo de Automatización
