# Plan de Estabilización del Sistema: Booking Titanium (2026-03-01)

## 📊 Estado Actual
El sistema tiene la mayoría de los componentes funcionando, pero la orquestación principal (`NN_01`) ha perdido robustez y la integración con Telegram (`NN_04`) está fallando o desconectada. Se observa desincronización entre las versiones locales y del servidor.

## 🧠 Análisis de Lógica de Negocio y Mejores Prácticas
### 1. Industria de Booking (Best Practices)
- **Atomicidad:** Una reserva no está confirmada hasta que el calendario (GCal) y la base de datos (Postgres) estén sincronizados.
- **Notificación Proactiva:** El usuario debe recibir feedback inmediato (Telegram) de cada estado (procesando, éxito, error).
- **Manejo de Conflictos:** El sistema debe validar disponibilidad *justo antes* de intentar la inserción (Double Check).

### 2. Estándares n8n (Comunidad & Oficial)
- **Validation Sandwich:** `[Pre-Validate] -> [Operation] -> [Post-Validate]`.
- **Standard Contract:** Todas las salidas deben seguir el esquema `{success: boolean, data: {}, error_code: string}`.
- **Triple Entry Pattern:** Soporte para Manual, Webhook y Execute Workflow en cada root workflow.
- **Error Handling:** Cada nodo crítico debe tener `Continue on Fail` y un nodo de formateo de error posterior.

## 🚀 Plan de Acción (Checklist)

### Fase 1: Sincronización e Integridad
- [ ] **Sincronizar NN_01:** Fusionar la versión del servidor (que tiene validación) con la versión local (que tiene flujos de negocio) para crear una versión definitiva "Robusta V3".
- [ ] **Validar IDs:** Asegurar que todos los nodos `Execute Workflow` apunten a los IDs actuales confirmados.
- [ ] **Standard Contract:** Verificar que `NN_02`, `NN_03` y `NN_04` retornen el contrato estándar.

### Fase 2: Robustez y Conectividad
- [ ] **Integración Final de NN_04:** Asegurar que `NN_01` llame a `NN_04` al final de cada rama (`CREATE`, `CANCEL`, `ERROR`).
- [ ] **Pruebas de Caracteres Especiales:** Implementar sanitización en `NN_04` para evitar que caracteres como `_`, `*`, `[` rompan el parse_mode de Telegram.
- [ ] **Validation Sandwich en NN_01:** Añadir nodos de validación antes y después de cada llamada a sub-workflow.

### Fase 3: Certificación (Testing)
- [ ] **Test de Integración (Jest):** Ejecutar `tests/nn01_booking_gateway.test.ts` (si existe) o crear un script de prueba que cubra éxito y error.
- [ ] **Certificación en Servidor:** Realizar 3 pruebas manuales desde Telegram y verificar logs de ejecución.

### Fase 4: Limpieza
- [ ] **Eliminar Archivos Temporales:** Borrar todos los scripts `fix_*.js` y `exec_*.json` creados durante la sesión.

## 📝 Observaciones
- La versión más reciente y completa se construirá a partir de `scripts-ts/nn01_server_v3.json` inyectando la lógica de negocio de `workflows/NN_01_Booking_Gateway.json`.
- Se usará el script `scripts-ts/n8n-crud-agent.ts` para subir la versión final al servidor una vez aprobada.

---
*¿Aprobar este plan para proceder con la Fase 1?*
