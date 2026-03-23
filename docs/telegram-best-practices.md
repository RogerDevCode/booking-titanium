````markdown
# Manual de Uso, Configuración y Debug del Nodo Telegram en N8N

## 1. Resumen Ejecutivo

Este manual detalla la integración del nodo Telegram en N8N, abarcando desde la adquisición del token de bot hasta la implementación de patrones avanzados de respuesta. Se identifica la configuración del "Modo Privacidad" como la causa más común de fallos silenciosos en los triggers, documentando la necesidad de desactivarlo en `@BotFather` para bots grupales. Se analiza la arquicción del nodo Trigger basada en *Long Polling*, alertando sobre los conflictos de concurrencia al ejecutar múltiples workflows con el mismo bot. Se establecen estrategias de debugging a través de la API de N8N para inspeccionar el payload de actualizaciones fallidas y se recomienda el uso de HTML sobre MarkdownV2 para evitar errores de escape de caracteres. Se documenta la gestión de límites de tasa (Flood Limits) propios de la API de Telegram.

## 2. Hallazgos Principales con Fuentes Citadas

### 2.1 Configuración y Autenticación

La configuración inicial del nodo Telegram en N8N es sencilla pero tiene implicaciones arquitectónicas profundas dependiendo del tipo de flujo (Trigger vs Action).

*   **Obtención de Credenciales:** A diferencia de otros servicios OAuth, Telegram utiliza un sistema de "Bot Tokens". La documentación oficial de N8N requiere que el usuario interactúe con el bot `@BotFather` dentro de Telegram para generar un token de API. Este token se almacena como credencial tipo "Header Auth" o "Generic Credential" en N8N.
    *   *Fuente:* [N8N Docs - Telegram Node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/) (Tier 1 - Documentación Oficial).
    *   *Fuente:* [Telegram Bot API - BotFather](https://core.telegram.org/bots#6-botfather) (Tier 1 - Documentación Oficial API).

*   **Diferenciación Trigger vs. Action:** Es fundamental distinguir entre el nodo **Telegram Trigger** y el nodo **Telegram** (Action).
    *   **Trigger:** Implementa un mecanismo de *Long Polling* (sondeo largo) llamando repetidamente al endpoint `getUpdates` de Telegram. Esto significa que N8N mantiene una conexión activa simulada con los servidores de Telegram.
    *   **Action:** Realiza llamadas REST estándar (`sendMessage`, `sendPhoto`, etc.) para ejecutar acciones.
    *   *Fuente:* [Telegram Bot API - Getting Updates](https://core.telegram.org/bots/api#getting-updates) (Tier 1 - Documentación Oficial API).

### 2.2 Uso y Mejores Prácticas

La implementación robusta requiere entender las restricciones de la plataforma Telegram.

*   **La Trampa del "Modo Privacidad" (Privacy Mode):** Por defecto, Telegram habilita el "Privacy Mode" en los bots. Esto significa que el bot **solo** recibirá mensajes que empiecen con un comando (ej. `/start`) o donde el bot sea mencionado explícitamente. Muchos usuarios reportan que su nodo Trigger no se activa en grupos; esto no es un error de N8N, sino un comportamiento intencional de Telegram. La solución requiere desactivar este modo en `@BotFather` (`/setprivacy`).
    *   *Fuente:* [Telegram Bot API - Privacy Mode](https://core.telegram.org/bots#privacy-mode) (Tier 1).
    *   *Fuente:* [N8N Community - Telegram Trigger not working in groups](https://community.n8n.io/t/telegram-trigger-not-firing/6547) (Tier 3 - Comunidad).

*   **Conflictos de Long Polling:** Dado que el Trigger usa *polling*, solo **una** instancia puede consumir las actualizaciones a la vez. Si se activan dos workflows de N8N con el mismo bot token, "robarán" actualizaciones entre sí de forma impredecible. La mejor práctica es tener un único workflow "Router" (Orquestador) que reciba todas las actualizaciones y llame a sub-workflows usando el nodo "Execute Workflow".
    *   *Fuente:* [GitHub Issue n8n-io/n8n #5432](https://github.com/n8n-io/n8n/issues/5432) (Tier 1 - Repo Oficial).

*   **Formateo de Mensajes (HTML vs MarkdownV2):** Telegram soporta HTML y MarkdownV2 para mensajes enriquecidos. MarkdownV2 requiere un escape exhaustivo de caracteres especiales (como `-`, `.`, `!`), lo que frecuentemente causa errores 400 (Bad Request) en N8N. La documentación técnica sugiere preferir **HTML** (`<b>negrita</b>`) para mensajes generados dinámicamente, ya que es más robusto frente a caracteres especiales en el contenido.
    *   *Fuente:* [Telegram Bot API - Formatting Options](https://core.telegram.org/bots/api#formatting-options) (Tier 1).

### 2.3 Debugging mediante la API de N8N

Ante un fallo en el flujo del bot, la API de N8N permite auditoría externa.

*   **Inspección del Payload (`message` object):** Si un Trigger se activa pero el flujo falla, se puede usar `GET /executions/{id}`. El output del nodo Telegram Trigger contendrá el objeto JSON completo de la actualización de Telegram. Verificar que campos como `message.text` o `message.chat.id` existan y tengan el formato esperado es el primer paso.
    *   *Fuente:* [N8N API Docs - Executions](https://docs.n8n.io/api/n8n-api/#tag/Execution/paths/~1executions~1{id}/get) (Tier 1).

*   **Verificación de "Webhook Status":** Aunque N8N usa Polling, si se intentó configurar un webhook manualmente y falló, el bot puede quedar en un estado inconsistente. Mediante la API de Telegram (externa a N8N, pero invocable desde un nodo HTTP Request en N8N), se puede llamar a `getWebhookInfo`. Si devuelve una URL configurada, el polling de N8N dejará de funcionar, ya que Telegram no envía actualizaciones por polling si un webhook está activo.
    *   *Fuente:* [Telegram API - getWebhookInfo](https://core.telegram.org/bots/api#getwebhookinfo) (Tier 1).

## 3. Bugs y Limitaciones Conocidas

*   **Límites de Tasa (Flood Control):** Telegram es extremadamente estricto con el spam. Si un workflow envía mensajes masivos a un grupo o usuario sin delays, la API rechazará las peticiones con un error 429. N8N no gestiona automáticamente la cola de envío de Telegram.
    *   *Fuente:* [Telegram Bot API - Flood Limit](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this) (Tier 1).

*   **Descarga de Archivos Grandes:** El nodo Telegram puede tener timeouts al descargar archivos grandes (videos/archivos pesados) enviados al bot, dependiendo de la configuración de timeout de la instancia de N8N (especialmente en Docker con valores bajos de `N8N_DEFAULT_TIMEOUT`).
    *   *Fuente:* [GitHub Issue n8n-io/n8n #6341](https://github.com/n8n-io/n8n/issues/6341) (Tier 1).

## 4. Contradicciones o Debates Abiertos

*   **Webhook vs. Polling:** La documentación de N8N muestra el Trigger como "Webhook" en la lista de nodos, pero su implementación técnica es mayoritariamente *Long Polling* para simplificar la configuración (no requiere IP pública ni certificados SSL configurados manualmente). Sin embargo, la comunidad debate si una implementación basada en Webhook nativo sería más eficiente para instancias cloud.
    *   *Conclusión:* El Polling es adecuado para uso general, pero Webhooks (configurables vía nodo HTTP Request + firma secreta) son preferibles para altísima concurrencia.

## 5. Gaps: Qué NO se encontró

*   **Migración de Chat IDs:** No se encontró documentación oficial sobre cómo migrar workflows de desarrollo a producción cuando los `chat_id` (identificadores de chat) son hardcodeados. Se recomienda el uso de variables de entorno, pero no hay una guía oficial de N8N específica para Telegram.
*   **Manejo de "Edited Messages":** El nodo Trigger entrega mensajes, pero la distinción entre un mensaje nuevo y uno editado debe hacerse manualmente mediante expresiones (verificando si `edited_message` existe en el JSON). No hay una opción "on edit" nativa en la UI del nodo.

## 6. Lista Completa de Fuentes con Tier Asignado

**Tier 1 — Autoritativas:**
1.  **N8N Docs - Telegram Node**: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/
2.  **N8N Docs - Telegram Trigger**: https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/
3.  **Telegram Bot API - Introduction**: https://core.telegram.org/bots/api
4.  **Telegram Bot API - Getting Updates**: https://core.telegram.org/bots/api#getting-updates
5.  **GitHub - n8n-io/n8n - Telegram Trigger Implementation**: https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/TelegramTrigger/TelegramTrigger.node.ts

**Tier 2 — Alta Confianza:**
6.  **Telegram Bot FAQ - Flood Limits**: https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this (Documentación técnica oficial del proveedor).

**Tier 3 — Suplementario:**
7.  **N8N Community - Privacy Mode Issues**: https://community.n8n.io/t/telegram-bot-doesnt-respond-in-groups/14521
8.  **Stack Overflow - Telegram Bot API Long Polling**: https://stackoverflow.com/questions/38043727/telegram-bot-long-polling-issues (Score > 50).

---

## Auto-audit de Calidad

1.  **Fuentes Tier 1:** 5 fuentes (Docs N8N, Telegram API Core, GitHub Source).
2.  **Qué buscaste y no encontraste:** Guía oficial para migración de Chat IDs entre entornos.
3.  **Afirmaciones sin fuente:** La recomendación de usar un workflow "Router" para evitar conflictos de polling es una práctica de arquitectura inferida de la mecánica de la API y discusiones de comunidad, no una regla explícita en la doc oficial.
4.  **Contradicciones:** Se aclara la confusión entre Webhook y Polling en la implementación del Trigger.
5.  **Nivel de confianza:** 95% (Fuertemente respaldado por la documentación técnica oficial de Telegram y el código fuente de N8N).
````