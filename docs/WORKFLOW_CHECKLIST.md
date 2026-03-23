# Workflow Checklist (Leaf to Root)

| # | M1 | M2 | M3 | M4 | Workflow Name | Ext. Trigger | Calls Others | Leaf? | Root? | Notes |
|---|:---:|:---:|:---:|:---:|---|---|---|---|---|---|
| 1 | [ ] | [ ] | [ ] | [ ] | BB_00_Config | yes | no | yes | yes | |
| 2 | [ ] | [ ] | [ ] | [ ] | CB_01_Check_State | yes | no | yes | yes | |
| 3 | [ ] | [ ] | [ ] | [ ] | CB_02_Record_Result | yes | no | yes | yes | |
| 4 | [ ] | [ ] | [ ] | [ ] | DB_Cancel_Booking | yes | no | yes | yes | |
| 5 | [ ] | [ ] | [ ] | [ ] | DB_Create_Booking | yes | no | yes | yes | |
| 6 | [ ] | [ ] | [ ] | [ ] | DB_Find_Next_Available | yes | no | yes | yes | |
| 7 | [ ] | [ ] | [ ] | [ ] | DB_Get_Availability | yes | no | yes | yes | |
| 8 | [ ] | [ ] | [ ] | [ ] | DB_Get_Providers_By_Service | yes | no | yes | yes | |
| 9 | [ ] | [ ] | [ ] | [ ] | DB_Get_Providers | yes | no | yes | yes | |
| 10 | [ ] | [ ] | [ ] | [ ] | DB_Get_Services | yes | no | yes | yes | |
| 11 | [ ] | [ ] | [ ] | [ ] | DB_Reschedule_Booking | yes | no | yes | yes | |
| 12 | [ ] | [ ] | [ ] | [ ] | DLQ_01_Add_Entry | yes | no | yes | yes | |
| 13 | [ ] | [ ] | [ ] | [ ] | DLQ_02_Get_Status | yes | no | yes | yes | |
| 14 | [ ] | [ ] | [ ] | [ ] | FRONTEND_Landing_Page | yes | no | yes | yes | |
| 15 | [ ] | [ ] | [ ] | [ ] | GCAL_Delete_Event | yes | no | yes | yes | |
| 16 | [ ] | [ ] | [ ] | [ ] | GMAIL_Send_Confirmation | yes | no | yes | yes | |
| 17 | [ ] | [ ] | [ ] | [ ] | NN_01_Booking_Gateway | yes | no | yes | yes | |
| 18 | [ ] | [ ] | [ ] | [ ] | NN_02_Message_Parser | yes | no | yes | yes | |
| 19 | [ ] | [ ] | [ ] | [ ] | NN_03_AI_Agent | yes | no | yes | yes | |
| 20 | [ ] | [ ] | [ ] | [ ] | NN_03-B_Pipeline_Agent | yes | no | yes | yes | |
| 21 | [ ] | [ ] | [ ] | [ ] | NN_04_Telegram_Sender | yes | no | yes | yes | |
| 22 | [ ] | [ ] | [ ] | [ ] | NN_05_Reminder_Cron | yes | no | yes | yes | |
| 23 | [ ] | [ ] | [ ] | [ ] | RAG_01_Document_Ingestion | yes | no | yes | yes | |
| 24 | [ ] | [ ] | [ ] | [ ] | RAG_02_Document_Retrieval | yes | no | yes | yes | |
| 25 | [ ] | [ ] | [ ] | [ ] | SEED_01_Daily_Provisioning | yes | no | yes | yes | |
| 26 | [ ] | [ ] | [ ] | [ ] | SEED_01_Process_Slot | no | no | yes | no | |
| 27 | [ ] | [ ] | [ ] | [ ] | WF1_Booking_API_Gateway | yes | no | yes | yes | |
| 28 | [ ] | [ ] | [ ] | [ ] | WF2_Booking_Orchestrator | yes | no | yes | yes | |
| 29 | [ ] | [ ] | [ ] | [ ] | WF3_Availability_Service | yes | no | yes | yes | |
| 30 | [ ] | [ ] | [ ] | [ ] | WF5_GCal_Collision_Check | yes | no | yes | yes | |
| 31 | [ ] | [ ] | [ ] | [ ] | WF6_Rollback_Workflow | yes | no | yes | yes | |
| 32 | [ ] | [ ] | [ ] | [ ] | WF7_Distributed_Lock_System | yes | no | yes | yes | |
