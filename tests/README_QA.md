# 🧪 QA Test Suite — Booking Titanium

Suite completa de tests de QA basada en el documento [PROJECT_DEEP_AUDIT_2026-03-10.md](../docs/PROJECT_DEEP_AUDIT_2026-03-10.md).

---

## 📋 Descripción

Esta suite de tests está diseñada para validar el sistema de reservas médicas desde una perspectiva de **QA Analyst**, enfocándose en:

1. **Edge Cases** (Situaciones Límite)
2. **Paranoid Tests** (Seguridad e Integridad)
3. **Capacity Tests** (Reservar todo un día)
4. **Concurrency Tests** (Condiciones de carrera)
5. **Integration Tests** (Flujo completo E2E)

---

## 🚀 Quick Start

### 1. Sembrar Base de Datos

```bash
# Limpia datos de test anteriores y prepara BD
npx tsx scripts-ts/seed_qa_database.ts --clean
```

### 2. Ejecutar Tests

```bash
# Ejecutar suite completa
npx jest tests/qa-edge-cases.test.ts --testTimeout=120000 --forceExit --verbose

# Ejecutar tests específicos por categoría
npx jest tests/qa-edge-cases.test.ts -t "Edge Cases"
npx jest tests/qa-edge-cases.test.ts -t "Paranoid"
npx jest tests/qa-edge-cases.test.ts -t "Capacity"
npx jest tests/qa-edge-cases.test.ts -t "Concurrency"
npx jest tests/qa-edge-cases.test.ts -t "Integration"
```

### 3. Generar Reporte

```bash
# Copiar output del test al archivo de reporte
npx jest tests/qa-edge-cases.test.ts --verbose > test-output.txt

# Editar QA_TEST_REPORT_TEMPLATE.md y pegar resultados
```

---

## 📁 Archivos

| Archivo | Descripción |
|---------|-------------|
| `qa-edge-cases.test.ts` | Suite principal de tests QA |
| `seed_qa_database.ts` | Script para preparar BD para tests |
| `QA_TEST_REPORT_TEMPLATE.md` | Plantilla de reporte QA |
| `README_QA.md` | Este archivo |

---

## 🎯 Categorías de Tests

### 1. Edge Cases (8 tests)

Basado en [PROJECT_DEEP_AUDIT_2026-03-10.md](../docs/PROJECT_DEEP_AUDIT_2026-03-10.md#situaciones-límite-edge-cases):

| Test | Descripción | Criterio de Éxito |
|------|-------------|-------------------|
| Reserva en el pasado | Intenta reservar con `start_time < NOW()` | Debe rechazar |
| Cancelación COMPLETED | Intenta cancelar cita ya completada | Debe rechazar con `CANCELLATION_RESTRICTED` |
| Email inválido | Envía email con formato inválido | Debe manejar gracefulmente |
| Email vacío | Envía email vacío | Debe asignar fallback |
| Médico inexistente | Usa `provider_id` que no existe | Debe fallar gracefulmente |
| Servicio inexistente | Usa `service_id` que no existe | Debe retornar slots vacíos |
| Múltiples waitlists | Usuario se une a 2 listas de espera | Debe permitir (sin colisión) |

---

### 2. Paranoid Tests (6 tests)

Basado en [PROJECT_DEEP_AUDIT_2026-03-10.md](../docs/PROJECT_DEEP_AUDIT_2026-03-10.md#test-paranoicos-seguridad-e-integridad):

| Test | Descripción | Criterio de Éxito |
|------|-------------|-------------------|
| SQL Injection (name) | Intenta inyectar `' OR 1=1 --` en nombre | Debe sanitizar o rechazar |
| SQL Injection (email) | Intenta inyectar `'; DROP TABLE --` en email | Debe sanitizar o rechazar |
| Colisión de identidad | Registra mismo `chat_id` con datos diferentes | Debe hacer `ON CONFLICT UPDATE` |
| chat_id inválido | Envía `chat_id` como string | Debe rechazar |
| start_time inválido | Envía "mañana a las 5" | Debe rechazar |
| reminders inválido | Envía reminders como string | Debe manejar gracefulmente |

---

### 3. Capacity Test (1 test)

**Objetivo:** Reservar TODOS los slots disponibles de un día y verificar que el sistema responde correctamente a una nueva reserva.

| Paso | Descripción | Criterio de Éxito |
|------|-------------|-------------------|
| 1 | Obtener disponibilidad del día | Debe retornar N slots |
| 2 | Reservar todos los slots | Debe crear N reservas |
| 3 | Intentar reserva adicional | Debe fallar con `SLOT_OCCUPIED` |
| 4 | Verificar disponibilidad | Debe retornar 0 slots |

**Métrica Clave:** El sistema DEBE mantener integridad bajo 100% de ocupación.

---

### 4. Concurrency Tests (2 tests)

Basado en [PROJECT_DEEP_AUDIT_2026-03-10.md](../docs/PROJECT_DEEP_AUDIT_2026-03-10.md#condiciones-de-carrera):

#### Test 4.1: Múltiples peticiones al mismo slot

| Métrica | Valor Esperado |
|---------|----------------|
| Peticiones simultáneas | 10 |
| Éxitos | **Exactamente 1** |
| Fallos | ≥ 9 |
| Error code | `SLOT_OCCUPIED` |

**Mecanismo:** Postgres Advisory Locks deben serializar el acceso.

#### Test 4.2: Múltiples peticiones a find-next-available

| Métrica | Valor Esperado |
|---------|----------------|
| Peticiones simultáneas | 5 |
| Éxitos | 5 |
| Consistencia | Todas reciben misma fecha |

---

### 5. Integration Test (1 test)

**Flujo Completo E2E:**

```
Registro → Disponibilidad → Reserva → Verificación → Cancelación
```

| Paso | Endpoint | Método |
|------|----------|--------|
| 1. Registro | `/update-user` | POST |
| 2. Disponibilidad | `/availability` | POST |
| 3. Reserva | `/create-booking` | POST |
| 4. Verificación | `/user-bookings/:chat_id` | GET |
| 5. Cancelación | `/cancel-booking` | POST |

---

## 📊 Generación de Reporte

### Formato del Reporte

El archivo [QA_TEST_REPORT_TEMPLATE.md](./QA_TEST_REPORT_TEMPLATE.md) incluye:

- ✅ Resumen ejecutivo
- ✅ Resultados por categoría
- ✅ Métricas detalladas
- ✅ Hallazgos críticos (P0, P1, P2)
- ✅ Recomendaciones
- ✅ Checklist pre-ejecución

### Ejemplo de Output

```bash
PASS tests/qa-edge-cases.test.ts
  📋 QA-EDGE-01: Situaciones Límite
    Edge Case 1.1: Reserva en el pasado
      ✓ RECHAZA reserva con start_time en el pasado (23 ms)
      ✓ RECHAZA reserva para hoy en hora ya pasada (18 ms)
    ...

Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
Snapshots:   0 total
Time:        5.234 s
```

---

## 🔧 Configuración Requerida

### Variables de Ambiente (.env)

```bash
# N8N Configuration
N8N_API_URL=https://n8n.stax.ink
N8N_API_KEY=your-api-key

# DAL Service
DAL_SERVICE_URL=http://dal-service:3000

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname
# O
REMOTE_NEON_DB_URL=postgresql://user:pass@neon-db-host:5432/dbname

# Telegram (para tests E2E)
TELEGRAM_ID=5391760292
```

### Dependencias

```json
{
  "devDependencies": {
    "@types/jest": "^30.0.0",
    "@types/pg": "^8.18.0",
    "dotenv": "^17.3.1",
    "jest": "^30.2.0",
    "ts-jest": "^29.4.6",
    "typescript": "^5.9.3"
  },
  "dependencies": {
    "pg": "^8.18.0",
    "luxon": "^3.7.1"
  }
}
```

---

## 🚨 Solución de Problemas

### Error: "Database not seeded"

```bash
# Ejecutar seed script
npx tsx scripts-ts/seed_qa_database.ts --clean
```

### Error: "Cannot connect to DAL"

```bash
# Verificar que DAL service esté corriendo
curl http://dal-service:3000/health

# O verificar variables de ambiente
echo $DAL_SERVICE_URL
```

### Error: "No providers found"

```bash
# Ejecutar seed multi-provider
npx tsx scripts-ts/seed_multi_provider.ts
```

### Error: "Timeout exceeded"

```bash
# Aumentar timeout
npx jest tests/qa-edge-cases.test.ts --testTimeout=180000
```

---

## 📈 Métricas de Calidad

### Cobertura de Tests

| Categoría | Tests | % del Total |
|-----------|-------|-------------|
| Edge Cases | 8 | 44% |
| Paranoid | 6 | 33% |
| Capacity | 1 | 6% |
| Concurrency | 2 | 11% |
| Integration | 1 | 6% |
| **TOTAL** | **18** | **100%** |

### Criterios de Aceptación

- ✅ **100%** de tests deben pasar
- ✅ **0** hallazgos P0 (críticos)
- ✅ **≤ 3** hallazgos P1 (mayores)
- ✅ Concurrency test: exactamente 1 éxito
- ✅ Capacity test: 100% de ocupación manejada

---

## 🔗 Referencias

- [PROJECT_DEEP_AUDIT_2026-03-10.md](../docs/PROJECT_DEEP_AUDIT_2026-03-10.md) - Documento base
- [GEMINI.md](../GEMINI.md) - Estándares del proyecto
- [TODO.md](../TODO.md) - Roadmap de testing
- [scripts-ts/README.md](../scripts-ts/README.md) - Scripts disponibles

---

## 📝 Buenas Prácticas

1. **Siempre ejecutar `--clean` antes de tests** para evitar contaminación de datos
2. **Usar chat_ids offset** (TELEGRAM_ID + 1000+) para aislar tests
3. **Cleanup automático** en `afterEach` o `afterAll`
4. **No modificar tests en producción** sin revisión
5. **Documentar hallazgos** en el reporte inmediatamente

---

**Última Actualización:** 2026-03-10  
**Responsable:** QA Team  
**Estado:** ✅ Listo para Ejecución
