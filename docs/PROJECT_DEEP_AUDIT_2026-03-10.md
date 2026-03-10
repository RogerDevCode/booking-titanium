# 🛡️ AUDITORÍA PROFUNDA DEL PROYECTO: BOOKING TITANIUM (v1.0)

**Fecha:** 2026-03-10  
**Responsable:** Gemini CLI (Senior Automation Engineer)  
**Estado del Sistema:** Producción-Ready (Backend Evolucionado)

---

## 1. 🎯 CAPACIDADES DEL SISTEMA

El sistema es una plataforma de reservas médica omnicanal (basada en n8n) con una capa de datos inteligente (DAL Proxy) y orquestación por IA.

### A. Gestión de Identidad (Identity-First)
- **Reconocimiento Automático**: El sistema identifica al usuario por su `chat_id` de Telegram desde el primer mensaje.
- **Perfil Persistente**: Almacena `full_name` y `email` para evitar redundancia en las reservas.
- **Auto-Registro**: Si el usuario es nuevo, el Agente de IA detecta la falta de datos y guía el proceso de registro.
- **Actualización Conversacional**: El usuario puede cambiar sus datos diciendo: *"Ahora mi correo es roger@test.com"*.

### B. Motor de Reservas (Core Engine)
- **Integridad Concurrente**: Uso de **Postgres Advisory Locks** para serializar peticiones simultáneas sobre el mismo slot.
- **Prevención de Colisiones de Usuario**: Un paciente no puede tener dos citas que se solapen en el tiempo.
- **Arquitectura Multi-Proveedor**: Soporte para múltiples médicos, especialidades y duraciones de servicio.
- **Identificadores Duales**: Soporte nativo para UUIDs técnicos y **Short Codes** amigables (BKG-XXXXXX).

### C. Recordatorios Inteligentes (Precision Reminders)
- **Multi-Nivel**: Soporte para hasta 3 recordatorios por reserva (ej: 24h, 6h, 1h).
- **Configuración Dinámica**: El usuario puede modificar sus horas de aviso mediante IA.
- **Ciclo de Vida Sincronizado**: Los recordatorios se anulan si la cita se cancela y se reinician si se reprograma.

### D. Gestión de Demanda (Waitlist)
- **Captura de Leads**: Si no hay slots libres, el sistema ofrece proactivamente unirse a la lista de espera.
- **Recuperación Automática**: Endpoint especializado para encontrar candidatos cuando se libera un slot.

---

## 2. 🔌 ENDPOINTS Y PARÁMETROS (DAL PROXY)

El DAL corre en `http://dal-service:3000`.

### 👤 Usuarios e Identidad
| Método | Path | Parámetros (JSON Body) | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/user/:chat_id` | - | Obtiene perfil y estado de registro. |
| `POST` | `/update-user` | `chat_id`, `full_name`, `email` | Crea o actualiza perfil. |

### 📅 Reservas
| Método | Path | Parámetros (JSON Body) | Descripción |
| :--- | :--- | :--- | :--- |
| `POST` | `/create-booking` | `chat_id`, `provider_id`, `service_id`, `start_time`, `user_name`, `user_email`, `reminders[]` | Crea reserva con bloqueo de concurrencia. |
| `POST` | `/cancel-booking` | `booking_id`, `chat_id`, `reason` | Cancela reserva (bloqueado si ya inició). |
| `POST` | `/reschedule-booking` | `booking_id`, `chat_id`, `new_start_time`, `provider_id` | Mueve una cita y resetea recordatorios. |
| `POST` | `/update-booking-status`| `booking_id`, `status`, `reason`, `actor_id` | Cambia estado a `CHECKED_IN`, `COMPLETED`, etc. |

### 🔔 Notificaciones y Lista de Espera
| Método | Path | Parámetros (JSON Body) | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/pending-reminders` | - | Lista recordatorios por enviar (3 niveles). |
| `POST` | `/waitlist/join` | `chat_id`, `provider_id`, `service_id`, `preferred_date` | Añade usuario a lista de espera. |
| `GET` | `/waitlist/candidates/:bid` | - | Busca candidatos para un slot liberado. |

---

## 3. 🧪 ESTRATEGIA DE PRUEBAS (MATRIZ TÉCNICA)

Esta sección define el rigor necesario para mantener la estabilidad del sistema.

### A. Test Unitarios (Lógica de Código)
- **Validación de Fechas**: Probar `getSlotsForDay` con cambios de horario (DST) en Santiago de Chile.
- **Parsing de IA**: Probar el "Regex Hard Fallback" con 50 variaciones de texto sucio que contengan `BKG-XXXXXX`.

### B. Test de Integración (E2E)
- **Flujo Completo Nuevo Usuario**: Registro -> Disponibilidad -> Reserva -> Confirmación.
- **Reprogramación con Recordatorios**: Verificar que tras un Reschedule, los flags `sent` de los recordatorios vuelven a `FALSE`.

### C. Test Paranoicos (Seguridad e Integridad)
- **Condiciones de Carrera**: 20 peticiones simultáneas al mismo milisegundo para el mismo slot (Debe haber solo 1 éxito).
- **Inyección SQL**: Intentar pasar `' OR 1=1 --` en el campo `user_name` (Debe ser sanitizado o fallar por tipo).
- **Colisión de Identidad**: Intentar registrar un `chat_id` existente con datos diferentes (Debe aplicar `ON CONFLICT UPDATE`).

### D. Situaciones Límite (Edge Cases)
| Situación | Comportamiento Esperado |
| :--- | :--- |
| **Reserva en el pasado** | El sistema debe rechazarla (Validación en DAL). |
| **Cancelación de cita COMPLETED**| El sistema debe devolver `CANCELLATION_RESTRICTED`. |
| **Email inválido** | El DAL debe asignar `sin-email@booking.com` o fallar amablemente. |
| **Médico inexistente** | Debe devolver error de integridad referencial (DB Error 500). |
| **Usuario en 2 listas de espera**| Permitido, siempre que no colisionen horas reales de reserva. |

### E. Valores Válidos vs Inválidos
- **chat_id**: `number` (Válido: 123456789 | Inválido: "abc", null).
- **start_time**: `ISO8601` (Válido: "2026-03-10T10:00:00Z" | Inválido: "mañana a las 5").
- **reminders**: `array` (Válido: [24, 1] | Inválido: "cada hora").

---

## 4. 📋 AUDITORÍA DE INFRAESTRUCTURA (n8n OPS)
- **Queue Mode**: Preparado para Redis/BullMQ.
- **Audit Logs**: Activos en todas las mutaciones de datos.
- **Analytics Views**: Disponibles en Postgres para dashboards financieros y operativos.

---
**Documento generado por:** Gemini CLI v4.2  
**Uso:** Base SSOT para el desarrollo de la Suite de Testing Automatizada.
