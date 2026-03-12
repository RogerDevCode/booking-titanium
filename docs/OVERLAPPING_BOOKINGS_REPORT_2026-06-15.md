# 🚨 REPORTE DE SOLAPAMIENTOS - 2026-06-15

**Fecha:** 2026-03-12  
**Descubierto por:** Script `check-overlapping-bookings.ts`  
**Severidad:** CRÍTICA

---

## 📊 RESUMEN

| Métrica | Valor |
|---------|-------|
| **Fecha afectada** | 2026-06-15 |
| **Total reservas** | 10 |
| **Solapamientos** | 45 |
| **Provider afectado** | 1 |
| **Slot afectado** | 10:00-11:00 UTC-3 |
| **Usuarios afectados** | 10 (Tester 0-9) |

---

## 🔍 DETALLE DEL PROBLEMA

**Todas las 10 reservas están en el MISMO slot:**

```
Slot: 10:00-11:00 (60 minutos)
Provider: 1
Status: CONFIRMED

Reservas:
  - Tester 0: BKG-VUES7F
  - Tester 1: BKG-YVZ9YD
  - Tester 2: BKG-BPQV36
  - Tester 3: BKG-L5TYDW
  - Tester 4: BKG-28JUMT
  - Tester 5: BKG-WG3VYL
  - Tester 6: BKG-K94NC5
  - Tester 7: BKG-GU5NZJ
  - Tester 8: BKG-3SPGUW
  - Tester 9: BKG-X67Y9R
```

**Cálculo de solapamientos:**
- 10 reservas en el mismo slot = C(10,2) = 45 pares solapados

---

## 🎯 COMPARACIÓN CON SEED V2

| Sistema | Fecha | Reservas | Solapamientos | Estado |
|---------|-------|----------|---------------|--------|
| **SEED v2** | 2026-03-13 | 8 | 0 | ✅ OK |
| **Testers** | 2026-06-15 | 10 | 45 | ❌ FAIL |

**Diferencia clave:** SEED v2 usa slots únicos (09:00, 10:00, 11:00, etc.)

---

## 🚨 CAUSA RAÍZ

1. **Sin validación de slot disponible** en el DAL
2. **Sin `pg_advisory_xact_lock`** para prevenir concurrencia
3. **Test sin control de horarios** - todos los testers reservaron a las 10:00

---

## 💡 SOLUCIONES RECOMENDADAS

### 1. Implementar Advisory Lock en DAL

```sql
-- En DB_Create_Booking o create-booking endpoint
SELECT pg_advisory_xact_lock(
  hashtext('provider_' || provider_id || '_slot_' || start_time)
);

-- Luego verificar disponibilidad
SELECT COUNT(*) FROM bookings 
WHERE provider_id = $1 
  AND start_time = $2
  AND status = 'CONFIRMED';

-- Si COUNT > 0, retornar error SLOT_OCCUPIED
```

### 2. Validación de Slot Único

```typescript
// En el DAL o Code node
const existing = await db.query(`
  SELECT id FROM bookings 
  WHERE provider_id = $1 
    AND DATE(start_time AT TIME ZONE 'UTC' AT TIME ZONE '-03:00') = DATE($2 AT TIME ZONE 'UTC' AT TIME ZONE '-03:00')
    AND EXTRACT(HOUR FROM (start_time AT TIME ZONE 'UTC' AT TIME ZONE '-03:00')) = EXTRACT(HOUR FROM ($2 AT TIME ZONE 'UTC' AT TIME ZONE '-03:00'))
    AND status = 'CONFIRMED'
`, [provider_id, start_time]);

if (existing.rowCount > 0) {
  return { success: false, error_code: 'SLOT_OCCUPIED' };
}
```

### 3. Limpiar Reservas de Test

```bash
# Eliminar reservas de testers solapadas
npx tsx scripts-ts/clean_seed.ts

# O específicamente para 2026-06-15
DELETE FROM bookings 
WHERE DATE(start_time AT TIME ZONE 'UTC' AT TIME ZONE '-03:00') = '2026-06-15'
  AND user_id IN (SELECT chat_id FROM users WHERE full_name LIKE 'Tester %');
```

### 4. Test Automatizado de Solapamientos

```bash
# Agregar al CI/CD
npx tsx scripts-ts/check-overlapping-bookings.ts 2026-06-15

# Debe retornar: 0 solapamientos
```

---

## 📋 ACCIONES INMEDIATAS

- [ ] Limpiar reservas solapadas (2026-06-15)
- [ ] Implementar `pg_advisory_xact_lock` en DAL
- [ ] Agregar validación de slot único
- [ ] Testear con múltiples usuarios concurrentes
- [ ] Agregar check de solapamientos al CI/CD

---

## 🔧 SCRIPT DE VERIFICACIÓN

```bash
# Verificar solapamientos para cualquier fecha
npx tsx scripts-ts/check-overlapping-bookings.ts YYYY-MM-DD

# Ejemplo:
npx tsx scripts-ts/check-overlapping-bookings.ts 2026-06-15
# Esperado: 0 solapamientos
```

---

**Generado por:** Qwen Code  
**Timestamp:** 2026-03-12T19:30:00-03:00  
**Script:** `scripts-ts/check-overlapping-bookings.ts`
