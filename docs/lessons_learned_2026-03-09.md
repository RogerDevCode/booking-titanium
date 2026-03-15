# 🧠 LECCIONES APRENDIDAS - BOOKING TITANIUM (2026-03-09)

## 🎯 RESUMEN DE APRENDIZAJE
Hoy se consolidó la arquitectura del asistente integrando soporte para **Short IDs (BKG-XXXXXX)** y perfeccionando el flujo de **Reschedule**. Se identificaron cuellos de botella en la propagación de contexto y en la conectividad de red de Docker.

---

## 🚫 LO QUE NUNCA DEBES HACER (ANTI-PATRONES)

1.  **NUNCA perder el `chat_id` en el Normalizer:**
    *   *Error:* Sobrescribir el JSON de entrada en un Code node intermedio sin incluir los campos originales.
    *   *Consecuencia:* Las ramas posteriores (como Lookup o Cancel) fallan por falta de identificador de usuario.
    *   *Solución:* Hacer siempre `... cleanInput` o `... $input.first().json` al retornar el objeto.

2.  **NUNCA confiar en el Passthrough implícito para sub-workflows complejos:**
    *   *Error:* Pasar el objeto `$json` directamente a un sub-workflow esperando que los nombres de campos coincidan mágicamente.
    *   *Consecuencia:* Errores de "Missing required fields" en la base de datos (ej: `start_time` vs `new_start_time`).
    *   *Solución:* Usar un nodo **"Prepare Create Input"** que mapee explícitamente el contrato de salida al contrato de entrada del sub-workflow.

3.  **NUNCA dejar el parsing del LLM sin "Hard Fallback":**
    *   *Error:* Confiar ciegamente en que el LLM siempre responderá un JSON válido.
    *   *Consecuencia:* El error `JSON_INVALID` detiene el flujo incluso si la información está presente en el texto.
    *   *Solución:* Implementar **Regex Hard Fallback** para extraer UUIDs o códigos `BKG-XXXX` directamente del texto bruto si el JSON falla.

4.  **NUNCA ignorar los Aliases de Docker Network:**
    *   *Error:* Reconstruir el contenedor DAL sin asignarle el alias de red (`dal-service`).
    *   *Consecuencia:* n8n pierde la conexión ("connection established error") porque no puede resolver el hostname.
    *   *Solución:* Asegurar que el comando de reconexión incluya `--alias dal-service`.

---

## 🚀 ACELERADORES DE TRABAJO (MEJORES PRÁCTICAS)

*   **Switch de Modelos para Debugging:** Si el modelo 70B alcanza el rate limit, bajar a **Llama 3.1 8B Instant** para probar conectividad y lógica de flujos. La velocidad es 10x mayor para iteraciones rápidas.
*   **Limpieza de TS en Docker:** Si el `Dockerfile.dal` falla, revisar variables no usadas (`TS6133`). El compilador en el contenedor es más estricto que el local.
*   **Suite de Integración Unificada:** Mantener un único script `system_integration_test.ts` con todos los casos de uso. Es la única forma de garantizar que un fix en una rama no rompió otra.
*   **Standard Contract (O02) Everywhere:** Asegurar que cada sub-workflow nuevo (`DB_Get_User_Bookings`) nazca con el nodo de salida estandarizado. Esto ahorra horas de mapeo en el Agente Pipeline.

---

## 🛠️ ESTADO TÉCNICO AL CIERRE
*   **Modelo:** Llama 3.3 70B (Producción).
*   **DAL:** Endpoint `/user-bookings` activo y verificado.
*   **Test Suite:** 8/8 Scenarios PASSED.
*   **Short ID:** Soporte 100% funcional en Create, Cancel, Reschedule y Lookup.
