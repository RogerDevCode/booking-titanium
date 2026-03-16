sigue las intrucciones en GEMINI.md

## Qwen Added Memories
- WF2_Booking_Orchestrator v2.0.0 está en desarrollo - workflow ID actual: ZgiDJcBT61v43NvN. Webhook minimal funciona, pero el workflow completo falla antes de ejecutar (sin resultData). Problema probable: configuración de nodos Postgres/HTTP Request o credenciales. Error handler actualizado para skip rollback cuando no hay IDs válidos.
- WEBHOOKS ACTIVOS (n8n.stax.ink/webhook/):
- NN_00_Global_Error_Handler: nn-00-global-error
- NN_02_Message_Parser: nn-02-booking-parser-test
- NN_03_AI_Agent: nn-03-ai-agent
- NN_04_Telegram_Sender: nn-04-telegram-sender-v2
- DB_Get_Availability: db-get-availability-test
- DB_Create_Booking: db-create-booking-test
- DB_Cancel_Booking: db-cancel-booking-test
- DB_Reschedule_Booking: db-reschedule-booking
- DB_Find_Next_Available: db-find-next-available
- GCAL_Create_Event: gcal-create-event
- GCAL_Delete_Event: gcal-delete-event
- GMAIL_Send_Confirmation: gmail-send-confirmation
- NN_03-B_Pipeline_Agent: nn-03-b-pipeline
- NN_03-C_Agent_V3: nn-03-c-agent
- BB_00_Config: bb-00-config
- FRONTEND_Landing_Page: titanium-landing
- WF1_Booking_API_Gateway: book-appointment
- WF2_Booking_Orchestrator: booking-orchestrator
- WF3_Availability_Service: check-availability
- WF4_Sync_Engine: sync-repair-manual
- WF4_Sync_Engine_Event_Driven: gcal-sync-trigger
- WF5_GCal_Collision_Check: gcal-collision-check
- WF6_Rollback_Workflow: rollback-booking
- WF7_Distributed_Lock_System: acquire-lock
- CB_01_Check_State: circuit-breaker/check
- CB_02_Record_Result: circuit-breaker/record
- DLQ_01_Add_Entry: dlq/add
- DLQ_02_Get_Status: dlq/status
- DLQ_Retry: (sin webhook)
- TEST_GCal_Connection: test-gcal
- TEST_GCal_Minimal: test-gcal-minimal
- Diagnostic_Test: test-diagnostic
- WF2_Booking_Orchestrator HTTP Request calls (webhooks internos):
1. Check Availability → https://n8n.stax.ink/webhook/db-get-availability-test (WF3: DB_Get_Availability)
2. Acquire Lock → https://n8n.stax.ink/webhook/acquire-lock (WF7: Distributed_Lock_System)
3. Check Circuit Breaker → https://n8n.stax.ink/webhook/circuit-breaker/check (CB_01_Check_State)
4. Record GCal Success → https://n8n.stax.ink/webhook/circuit-breaker/record (CB_02_Record_Result)

WF1_Booking_API_Gateway → llama a WF2: booking-orchestrator

DLQ_Retry → llama a WF2: booking-orchestrator

WF2_Error_Handler → llama a WF6: rollback-booking
