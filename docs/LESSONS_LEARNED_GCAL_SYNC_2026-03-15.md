# N8N & Google Calendar Sync - Lessons Learned (2026-03-15)

## 🛑 Lo que NO se debe hacer (Anti-Patrones)

1. **No omitir `start` y `end` en los nodos de Google Calendar (Create Event):** 
   - **Error:** Si se omiten los parámetros de tiempo (o se dejan vacíos/por defecto) en el nodo de Google Calendar, n8n asume silenciosamente `{{ $now }}`. Esto provoca que todas las reservas procesadas en batch o mediante el orchestrator se creen a la hora exacta de la ejecución, ignorando el `start_time` real de la reserva.
   - **Impacto:** Colisión masiva de eventos en el calendario, pérdida de consistencia con la base de datos.

2. **No levantar servidores locales para OAuth en puertos en uso (ej. 3000):**
   - **Error:** Al ejecutar scripts locales en TypeScript para obtener tokens de Google Calendar OAuth2, no se debe inicializar un `http.createServer` en el puerto 3000 si este ya está siendo utilizado por el servicio DAL (`dal_service`).
   - **Impacto:** Conflicto de puertos (`EADDRINUSE`) o intercepción de rutas (`Cannot GET /oauth2callback` retornado por el DAL en lugar de capturar el token).
   - **Regla:** NUNCA detener servicios de infraestructura en ejecución (como el DAL) para liberar un puerto sin la aprobación explícita del usuario. 

3. **No enviar payloads completos/contaminados al actualizar Workflows vía API (`PUT`):**
   - **Error:** Intentar actualizar un workflow enviando el objeto completo obtenido del `GET` (que incluye `id`, `createdAt`, `updatedAt`, `activeVersion`, etc.).
   - **Impacto:** La API de n8n v2.10.2+ rechaza la solicitud con `400 Bad Request: request/body must NOT have additional properties`.

## ✅ Lo que SÍ se debe hacer (Mejores Prácticas)

1. **Configuración Explícita y Dinámica en GCal:**
   - Extraer siempre las fechas del objeto de contexto idempotente (`ctx`).
   - Mapear explícitamente:
     - `start`: `={{ $('Generate Idempotency Key').first().json.ctx.start_time }}`
     - `end`: Construirlo dinámicamente si no viene explícito, sumando la duración (ej. `duration_minutes`) al `start_time`.

2. **Flujo OAuth2 CLI Seguro (Fallback Manual):**
   - Si el puerto del `redirect_uri` está ocupado, implementar un flujo de autenticación "Out-Of-Band" (OOB) o manual.
   - Generar la URL de autorización, pedir al usuario que la abra, y usar `readline` para que el usuario pegue manualmente la URL de redirección (que falla en el navegador) o el parámetro `code=` directamente en la terminal. Esto evita depender de servidores HTTP locales propensos a conflictos.

3. **Payloads Estrictos para `n8n_crud_agent.ts`:**
   - Al usar el método `PUT` para actualizar un workflow, limpiar el JSON y enviar exclusivamente las propiedades permitidas: `name`, `nodes`, `connections` y `settings`.

4. **Validación Cruzada Obligatoria:**
   - Tras ejecutar un script Seed o procesos masivos, validar SIEMPRE en dos capas:
     1. Que los registros existan en Neon DB (`public.bookings`).
     2. Que el script de extracción local de GCal retorne los eventos en los horarios correctos, verificando que no cayeron en la hora actual por error.