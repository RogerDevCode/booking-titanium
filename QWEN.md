sigue las intrucciones en GEMINI.md

## Qwen Added Memories
- WF2_Booking_Orchestrator v2.0.0 está en desarrollo - workflow ID actual: ZgiDJcBT61v43NvN. Webhook minimal funciona, pero el workflow completo falla antes de ejecutar (sin resultData). Problema probable: configuración de nodos Postgres/HTTP Request o credenciales. Error handler actualizado para skip rollback cuando no hay IDs válidos.
