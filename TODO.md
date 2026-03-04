# Plan de Escalamiento: Booking Titanium 🚀

Este documento detalla la hoja de ruta estratégica para escalar la arquitectura del sistema de reservas basado en n8n, basándose en los estándares cloud-native y las directrices del proyecto (GEMINI.md).

---

## 🏗️ Fase 1: Escalamiento de Infraestructura (n8n Queue Mode)

**Objetivo:** Separar el procesamiento de webhooks síncronos (rápidos) de la ejecución de flujos pesados (IA, Base de Datos, APIs externas) para evitar timeouts y bloqueos en el hilo principal bajo alta concurrencia.

- [ ] Modificar `docker-compose.yml` para introducir Redis como broker de mensajes.
- [ ] Configurar un contenedor `n8n-main` dedicado exclusivamente al enrutamiento de UI y webhooks entrantes.
- [ ] Desplegar contenedores `n8n-worker` (basados en BullMQ) para procesar las ejecuciones de los workflows en background.
- [ ] Validar que los webhooks (ej. Telegram) sigan respondiendo `200 OK` instantáneamente mientras el procesamiento ocurre asíncronamente.
- [ ] Revisar y configurar la retención de datos de ejecución en Postgres para prevenir el crecimiento descontrolado de la base de datos bajo alta carga.

## 🧠 Fase 2: Escalamiento Inteligente (Adopción profunda de MCP)

**Objetivo:** Dotar al Agente de IA (`NN_03_AI_Agent.json`) de mayor autonomía y flexibilidad migrando del enrutamiento tradicional (Condicionales lógicos) a llamadas a herramientas nativas Model Context Protocol (MCP).

- [ ] Habilitar y configurar el servidor MCP nativo de n8n (`n8n-io/mcp`) en Settings → AI → MCP Servers (según `OBLIGATORIO_06`).
- [ ] Refactorizar flujos de Base de Datos (`DB_Create_Booking.json`, `DB_Find_Next_Available.json`, `DB_Get_Availability.json`, `DB_Reschedule_Booking.json`, `DB_Cancel_Booking.json`) para exponerlos como herramientas (Tools) MCP documentadas.
- [ ] Refactorizar flujos de servicios externos (`GCAL_Create_Event.json`, `GCAL_Delete_Event.json`, `GMAIL_Send_Confirmation.json`) para exposición MCP.
- [ ] Actualizar el prompt y la configuración del Agente (`NN_03_AI_Agent.json`) para que utilice estas herramientas de forma autónoma en lugar de depender de branches (switch/if) rígidos.
- [ ] Realizar pruebas (testing E2E) para garantizar que el LLM comprende los esquemas de entrada/salida (*Standard Contracts*) de las nuevas herramientas.

## 🌐 Fase 3: Escalamiento de Negocio (Arquitectura Omnicanal)

**Objetivo:** Desacoplar el sistema de mensajería (actualmente altamente dependiente de Telegram) para soportar múltiples interfaces (WhatsApp, Webchat, Voice) sin alterar la lógica de negocio subyacente.

- [ ] Diseñar un **Adapter Pattern** creando un workflow enrutador agnóstico `NN_04_Omnichannel_Router.json`.
- [ ] Refactorizar `NN_01_Booking_Gateway.json` para normalizar las cargas útiles entrantes (payloads) de diferentes canales a un formato de mensaje único interno.
- [ ] Crear el canal de salida de WhatsApp (ej. `NN_04_WhatsApp_Sender.json`) y asegurar que cumple con los *Standard Contracts*.
- [ ] Actualizar `NN_00_Global_Error_Handler.json` para que pueda notificar errores de forma inteligente al canal de origen correspondiente.

## 🛡️ Fase 4: Rendimiento y Resiliencia (Circuit Breakers / Rate Limits)

**Objetivo:** Proteger el sistema contra ataques repetitivos, abusos de uso (que consumen créditos LLM) y caídas de APIs de terceros (como Google Calendar).

- [ ] Implementar un manejador de caché (ej. nodo Redis) delante de `DB_Get_Availability.json` para evitar sobrecargar la base de datos PostgreSQL con peticiones repetitivas de solo lectura.
- [ ] Aplicar **Rate Limiting** (límites de tasa) a nivel de API Gateway / Nginx o dentro del propio nodo de entrada `NN_01_Booking_Gateway.json` para mitigar SPAM / abusos persistentes.
- [ ] Implementar patrones **Watchdog** (Timeout y Retry logic con *backoff exponencial*) en todos los nodos `HTTP Request` que interactúen con APIs externas (cumplimiento estricto de `OBLIGATORIO_05`).
- [ ] Auditar e instalar *Circuit Breakers* para pausar gracefully los workflows de sincronización externa si se detecta una caída continua de Google Calendar o Gmail.
