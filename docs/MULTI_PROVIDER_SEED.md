# Multi-Provider Discovery - Documentación Completa

**Fecha:** 2026-03-05  
**Estado:** ✅ Implementado  
**Base de Datos:** Neon Tech (PostgreSQL 17)

---

## 📋 Problema Original

**Observación:** El sistema parecía estar diseñado para un solo proveedor por especialidad. Solo "Médico General" tenía múltiples opciones, lo que limitaba la funcionalidad de la IA para preguntar preferencias al usuario.

**Causa:** La base de datos no estaba poblada con múltiples proveedores por especialidad, impidiendo que la lógica de "multi-opción" se activara.

---

## ✅ Solución Implementada

### 1. Script de Seed (`seed_multi_provider.ts`)

**Propósito:** Poblar la base de datos con múltiples proveedores por especialidad.

**Ubicación:** `scripts-ts/seed_multi_provider.ts`

**Datos de semilla:**

| Especialidad | Proveedores | Duración | Buffer |
|--------------|-------------|----------|--------|
| Médico General | Dr. Roberto García, Dra. María López, Dr. Carlos Mendoza | 30 min | 15 min |
| Pediatría | Dra. Ana Rodríguez, Dr. Luis Fernández, Dra. Carmen Silva | 40 min | 15 min |
| Cardiología | Dr. Jorge Ramírez, Dra. Patricia Torres, Dr. Miguel Ángel Díaz | 45 min | 15 min |
| Dermatología | Dra. Sofía Herrera, Dr. Andrés Morales, Dra. Isabel Vargas | 30 min | 15 min |
| Ginecología | Dra. Laura Jiménez, Dra. Patricia Ruiz | 40 min | 15 min |
| Traumatología | Dr. Fernando Castro, Dr. Ricardo Ortiz | 45 min | 15 min |

**Horarios estándar:** Lunes a Viernes
- Mañana: 09:00 - 13:00
- Tarde: 15:00 - 19:00

### 2. Script de Verificación (`verify_seed_multi_provider.ts`)

**Propósito:** Validar que el seed se aplicó correctamente.

**Ubicación:** `scripts-ts/verify_seed_multi_provider.ts`

**Validaciones:**
- ✅ Cada especialidad tiene ≥2 proveedores
- ✅ Todos los proveedores tienen horarios
- ✅ No hay proveedores duplicados
- ✅ Estadísticas generales

### 3. Schema de Base de Datos (`database/schema.sql`)

**Propósito:** Documentación completa de la estructura de la BD.

**Tablas principales:**
- `providers` - Profesionales de la salud
- `services` - Servicios/Especialidades
- `provider_services` - Relación muchos-a-muchos
- `provider_schedules` - Horarios de atención
- `bookings` - Reservas

**Vistas útiles:**
- `v_availability_by_specialty` - Disponibilidad por especialidad
- `v_upcoming_bookings` - Próximas reservas confirmadas

---

## 🚀 Uso

### Ejecutar Seed (Dry-Run)

```bash
# Ver qué se haría sin aplicar cambios
cd "/home/manager/Sync/N8N Projects/booking-titanium"
npx tsx scripts-ts/seed_multi_provider.ts --dry-run
```

### Ejecutar Seed (Aplicar)

```bash
# Aplicar cambios en la base de datos
cd "/home/manager/Sync/N8N Projects/booking-titanium"
npx tsx scripts-ts/seed_multi_provider.ts
```

### Verificar Seed

```bash
# Validar que todo se aplicó correctamente
cd "/home/manager/Sync/N8N Projects/booking-titanium"
npx tsx scripts-ts/verify_seed_multi_provider.ts
```

---

## 📊 Resultado Esperado

Después de ejecutar el seed, la IA podrá:

1. **Mostrar múltiples opciones** cuando un usuario pregunte por una especialidad:
   ```
   Usuario: "Quiero reservar una cita con Pediatría"
   
   IA: "Para Pediatría tenemos disponibles:
        1. Dra. Ana Rodríguez
        2. Dr. Luis Fernández
        3. Dra. Carmen Silva
        
        ¿Con cuál profesional prefieres agendar?"
   ```

2. **Preguntar preferencia** antes de buscar disponibilidad

3. **Buscar por proveedor específico** una vez seleccionada la preferencia

---

## 🔍 Verificación en la Base de Datos

### Query: Proveedores por Especialidad

```sql
SELECT 
    s.name AS especialidad,
    COUNT(DISTINCT ps.provider_id) AS proveedores_count,
    string_agg(DISTINCT p.name, ', ') AS proveedores
FROM public.services s
JOIN public.provider_services ps ON s.id = ps.service_id
JOIN public.providers p ON ps.provider_id = p.id
WHERE p.is_active = TRUE
GROUP BY s.name
ORDER BY s.name;
```

### Query: Horarios por Proveedor

```sql
SELECT 
    p.name AS proveedor,
    s.name AS especialidad,
    psch.day_of_week,
    psch.start_time,
    psch.end_time
FROM public.providers p
JOIN public.provider_services ps ON p.id = ps.provider_id
JOIN public.services s ON ps.service_id = s.id
JOIN public.provider_schedules psch ON p.id = psch.provider_id
WHERE p.is_active = TRUE
ORDER BY s.name, p.name, psch.day_of_week;
```

---

## 🛠️ Mantenimiento

### Agregar Nuevo Proveedor

Editar `scripts-ts/seed_multi_provider.ts` y agregar a `SPECIALTIES_DATA`:

```typescript
const SPECIALTIES_DATA = {
    'Nueva Especialidad': [
        // ... existentes
        { name: 'Dr. Nuevo Profesional', is_active: true },
    ],
};
```

Luego re-ejecutar:
```bash
npx tsx scripts-ts/seed_multi_provider.ts
```

El script es **idempotente**: no duplicará registros existentes.

### Eliminar Proveedor

```sql
-- Marcar como inactivo (recomendado)
UPDATE public.providers 
SET is_active = FALSE 
WHERE name = 'Dr. Nombre Apellido';

-- O eliminar físicamente (cascada a provider_services y schedules)
DELETE FROM public.providers 
WHERE name = 'Dr. Nombre Apellido';
```

---

## 📝 Historial

| Fecha | Cambio |
|-------|--------|
| 2026-03-05 | Creación del script `seed_multi_provider.ts` |
| 2026-03-05 | Creación del script `verify_seed_multi_provider.ts` |
| 2026-03-05 | Documentación completa del schema en `database/schema.sql` |
| 2026-03-05 | Actualización de `scripts-ts/README.md` |

---

## 🔗 Referencias

- **Script Seed:** `scripts-ts/seed_multi_provider.ts`
- **Script Verificación:** `scripts-ts/verify_seed_multi_provider.ts`
- **Schema DB:** `database/schema.sql`
- **DAL Server:** `scripts-ts/dal_server.ts`
- **README Scripts:** `scripts-ts/README.md`

---

## ✅ Checklist de Verificación

- [ ] Seed ejecutado exitosamente
- [ ] Verificación sin errores
- [ ] Todas las especialidades tienen ≥2 proveedores
- [ ] Todos los proveedores tienen horarios
- [ ] No hay duplicados
- [ ] Workflows de `DB_Get_Providers_By_Service` funcionan
- [ ] Workflows de `DB_Get_Services` funcionan
- [ ] IA muestra múltiples opciones al usuario
- [ ] IA pregunta preferencia correctamente

---

**FIN DE LA DOCUMENTACIÓN**
