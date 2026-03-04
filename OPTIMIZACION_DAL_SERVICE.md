# 🚀 OPTIMIZACIÓN DEL DAL SERVICE
**Para:** NN_03_AI_Agent  
**Fecha:** 2026-03-04  
**Servicio:** `http://dal-service:3000`

---

## 📋 CONTEXTO

El DAL (Data Access Layer) service es el backend que el AI Agent consulta a través de 4 endpoints:

| Endpoint | Método | Función | Workflow que lo usa |
|----------|--------|---------|---------------------|
| `/availability` | POST | Consultar disponibilidad | DB_Get_Availability |
| `/find-next-available` | POST | Buscar próximo disponible | DB_Find_Next_Available |
| `/create-booking` | POST | Crear reserva | DB_Create_Booking |
| `/cancel-booking` | POST | Cancelar reserva | DB_Cancel_Booking |

**Problema:** Cada llamada HTTP desde n8n al DAL service suma 500-2000ms al tiempo total de respuesta del AI Agent.

---

## 🔍 DIAGNÓSTICO DEL DAL SERVICE

### Puntos de Dolor Identificados

```
AI Agent (n8n)
    ↓ HTTP Request (500-2000ms)
DAL Service:3000
    ├─→ Validación de input (50-100ms)
    ├─→ Conexión DB (100-500ms) ⚠️
    ├─→ Query SQL (200-800ms) ⚠️
    ├─→ Procesamiento (50-200ms)
    └─→ Serialización JSON (20-50ms)
```

**Cuellos de botella probables:**
1. Conexiones a DB no reutilizadas (sin connection pooling)
2. Consultas SQL sin índices adecuados
3. Sin caché de consultas frecuentes
4. HTTP sin keep-alive
5. N+1 queries en lógica de disponibilidad

---

## 🎯 ESTRATEGIAS DE OPTIMIZACIÓN

### NIVEL 1: Base de Datos (Impacto: 40-60%)

#### 1.1 Agregar Índices Estratégicos

**Tablas involucradas (inferidas):**
```sql
-- Tabla: bookings
CREATE INDEX IF NOT EXISTS idx_bookings_provider_date 
ON bookings(provider_id, service_id, start_time);

CREATE INDEX IF NOT EXISTS idx_bookings_status 
ON bookings(status, start_time);

CREATE INDEX IF NOT EXISTS idx_bookings_user 
ON bookings(user_id, start_time);

-- Tabla: providers (si existe)
CREATE INDEX IF NOT EXISTS idx_providers_active 
ON providers(id) WHERE active = true;

-- Tabla: services (si existe)
CREATE INDEX IF NOT EXISTS idx_services_active 
ON services(id) WHERE active = true;
```

**Verificación:**
```sql
-- Identificar queries lentos
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Verificar uso de índices
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes 
ORDER BY idx_scan ASC;
```

**Impacto esperado:**
- Queries de disponibilidad: 800ms → 50-100ms
- Queries de creación: 200ms → 20-50ms

---

#### 1.2 Connection Pooling

**Problema:** Si el DAL service abre una nueva conexión por cada request, agrega 100-300ms por llamada.

**Solución (ejemplos por tecnología):**

**Node.js + PostgreSQL (pg):**
```javascript
// ❌ SIN POOLING (lento)
const client = new Client(config);
await client.connect();
const result = await client.query(sql);
await client.end();

// ✅ CON POOLING (rápido)
const pool = new Pool({
  max: 20,                    // Máximo de conexiones
  min: 5,                     // Mínimo de conexiones ociosas
  idleTimeoutMillis: 30000,   // Cerrar ociosas después de 30s
  connectionTimeoutMillis: 2000,
});

// Reutilizar pool (singleton)
const result = await pool.query(sql, params);
```

**Python + SQLAlchemy:**
```python
# ✅ Configuración de engine con pooling
engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,        # Verificar conexión antes de usar
    pool_recycle=3600,         # Reciclar conexiones después de 1h
)
```

**Go + database/sql:**
```go
db.SetMaxOpenConns(25)
db.SetMaxIdleConns(5)
db.SetConnMaxLifetime(5 * time.Minute)
```

**Impacto esperado:**
- Conexión DB: 100-300ms → 5-10ms (reutilizada)

---

#### 1.3 Optimizar Queries de Disponibilidad

**Query ineficiente (ejemplo):**
```sql
-- ❌ Lento: escanea toda la tabla
SELECT * FROM bookings 
WHERE provider_id = $1 
  AND service_id = $2 
  AND DATE(start_time) = $3;
```

**Query optimizado:**
```sql
-- ✅ Rápido: usa índice compuesto
SELECT id, start_time, end_time, status 
FROM bookings 
WHERE provider_id = $1 
  AND service_id = $2 
  AND start_time >= $3::date 
  AND start_time < ($3::date + INTERVAL '1 day')
  AND status != 'cancelled';
```

**Para find-next-available:**
```sql
-- ✅ Con LIMIT y ORDER BY optimizado
SELECT start_time 
FROM bookings 
WHERE provider_id = $1 
  AND service_id = $2 
  AND start_time > NOW() 
  AND status != 'cancelled'
ORDER BY start_time ASC 
LIMIT 1;
```

**Impacto esperado:**
- Disponibilidad: 500ms → 50ms
- Find-next: 800ms → 100ms

---

### NIVEL 2: Caché (Impacto: 60-80% para consultas repetidas)

#### 2.1 Caché en Memoria (Redis)

**Arquitectura:**
```
Request → ¿Cache Hit? → Sí → Retornar (5ms)
              ↓ No
              → DB Query → Cache Set → Retornar (100ms)
```

**Implementación (Node.js + Redis):**
```javascript
const Redis = require('ioredis');
const redis = new Redis('redis://redis-service:6379');

// GET /availability
async function getAvailability(provider_id, service_id, date) {
  const cacheKey = `availability:${provider_id}:${service_id}:${date}`;
  
  // Intentar caché primero
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Query a DB
  const result = await db.query(sql, [provider_id, service_id, date]);
  
  // Cachear por 5 minutos
  await redis.setex(cacheKey, 300, JSON.stringify(result));
  
  return result;
}

// POST /create-booking (invalidar caché)
async function createBooking(data) {
  const result = await db.insert('bookings', data);
  
  // Invalidar caché del día
  const pattern = `availability:${data.provider_id}:${data.service_id}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) await redis.del(...keys);
  
  return result;
}
```

**Configuración recomendada:**
| Endpoint | TTL | Razón |
|----------|-----|-------|
| `/availability` | 5 min | Datos volátiles pero no críticos |
| `/find-next-available` | 2 min | Alta volatilidad |
| `/create-booking` | N/A (invalidar) | Write operation |
| `/cancel-booking` | N/A (invalidar) | Write operation |

**Impacto esperado:**
- Consultas repetidas: 500ms → 5-10ms (95% más rápido)
- Hit rate típico: 60-80% en horarios pico

---

#### 2.2 Caché Local (si Redis no está disponible)

**Node.js + NodeCache:**
```javascript
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

app.get('/availability', async (req, res) => {
  const { provider_id, service_id, date } = req.query;
  const key = `avail:${provider_id}:${service_id}:${date}`;
  
  const cached = cache.get(key);
  if (cached) return res.json({ data: cached, cached: true });
  
  const data = await db.query(/* ... */);
  cache.set(key, data);
  
  res.json({ data, cached: false });
});
```

**Impacto:** Menor que Redis (no compartido entre instancias) pero mejor que nada.

---

### NIVEL 3: HTTP y Red (Impacto: 10-20%)

#### 3.1 HTTP Keep-Alive

**Problema:** Sin keep-alive, cada request abre nueva conexión TCP (3-way handshake = 1.5 RTT).

**Solución (Node.js + Express):**
```javascript
const express = require('express');
const app = express();

// ✅ Habilitar keep-alive
app.listen(3000, () => {
  console.log('DAL Service listening on port 3000');
});

// Configurar timeout de keep-alive
server.keepAliveTimeout = 65000;  // 65 segundos
server.headersTimeout = 66000;    // 66 segundos
```

**En n8n (HTTP Request node):**
```json
{
  "name": "Call DAL Proxy",
  "parameters": {
    "method": "POST",
    "url": "http://dal-service:3000/availability",
    "options": {
      "timeout": 5000,
      "enableKeepAlive": true
    }
  }
}
```

**Impacto esperado:**
- Conexión TCP: 50-100ms → 0ms (reutilizada)

---

#### 3.2 Compresión Gzip

**Configuración (Node.js + Express):**
```javascript
const compression = require('compression');
app.use(compression({
  level: 6,           // Nivel de compresión (1-9)
  threshold: 1024,    // Solo comprimir si > 1KB
}));
```

**Impacto:**
- Payload 10KB → 2-3KB (70% reducción)
- Importante si las respuestas son grandes

---

#### 3.3 Optimizar Serialización JSON

**Problema:** Serializar objetos grandes o con muchas propiedades innecesarias.

**Solución:**
```javascript
// ❌ Retorna todo el objeto
const bookings = await db.query('SELECT * FROM bookings WHERE...');
res.json(bookings);

// ✅ Retorna solo lo necesario
const bookings = await db.query(`
  SELECT id, start_time, end_time, status 
  FROM bookings 
  WHERE...
`);

// Mapear a formato mínimo
const availability = bookings.rows.map(b => ({
  slot: b.start_time,
  available: b.status !== 'booked'
}));

res.json({ data: availability });
```

**Impacto:**
- Payload: 50KB → 5KB (90% reducción)
- Tiempo de serialización: 50ms → 5ms

---

### NIVEL 4: Lógica de Negocio (Impacto: 20-40%)

#### 4.1 Evitar N+1 Queries

**Problema común:**
```javascript
// ❌ N+1: 1 query para listar + N queries para cada item
const bookings = await db.query('SELECT * FROM bookings WHERE date = $1', [date]);

for (const booking of bookings.rows) {
  const provider = await db.query('SELECT * FROM providers WHERE id = $1', [booking.provider_id]);
  const service = await db.query('SELECT * FROM services WHERE id = $1', [booking.service_id]);
}
```

**Solución:**
```javascript
// ✅ Single query con JOIN
const bookings = await db.query(`
  SELECT 
    b.id, b.start_time, b.end_time, b.status,
    p.name as provider_name,
    s.name as service_name
  FROM bookings b
  JOIN providers p ON b.provider_id = p.id
  JOIN services s ON b.service_id = s.id
  WHERE b.date = $1
`, [date]);
```

**Impacto:**
- 100 bookings: 101 queries → 1 query
- Tiempo: 5000ms → 100ms

---

#### 4.2 Pre-computar Disponibilidad

**Para endpoints de disponibilidad:**

**Estrategia:**
```javascript
// Job programado (cada hora o cada 10 min)
async function precomputeAvailability() {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  
  for (const provider of providers) {
    for (const service of services) {
      const availability = await calculateAvailability(provider.id, service.id, today, tomorrow);
      
      // Guardar en tabla de caché materializada
      await db.query(`
        INSERT INTO availability_cache (provider_id, service_id, date, slots, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (provider_id, service_id, date) 
        DO UPDATE SET slots = $4, updated_at = NOW()
      `, [provider.id, service.id, today, JSON.stringify(availability)]);
    }
  }
}

// Endpoint optimizado
app.get('/availability', async (req, res) => {
  const { provider_id, service_id, date } = req.query;
  
  // Leer de caché materializada (sin cálculos)
  const cached = await db.query(`
    SELECT slots FROM availability_cache 
    WHERE provider_id = $1 AND service_id = $2 AND date = $3
  `, [provider_id, service_id, date]);
  
  res.json({ data: cached.rows[0]?.slots || [] });
});
```

**Impacto:**
- Cálculo en tiempo real: 500ms → Lectura: 10ms

---

#### 4.3 Usar Materialized Views (PostgreSQL)

**Para consultas complejas de disponibilidad:**
```sql
-- Crear vista materializada
CREATE MATERIALIZED VIEW mv_daily_availability AS
SELECT 
  p.id as provider_id,
  s.id as service_id,
  DATE(b.start_time) as date,
  COUNT(*) FILTER (WHERE b.status = 'available') as available_slots,
  COUNT(*) FILTER (WHERE b.status = 'booked') as booked_slots
FROM bookings b
JOIN providers p ON b.provider_id = p.id
JOIN services s ON b.service_id = s.id
GROUP BY p.id, s.id, DATE(b.start_time);

-- Índice en la vista
CREATE INDEX idx_mv_availability_lookup 
ON mv_daily_availability(provider_id, service_id, date);

-- Refresh programado (cada hora)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_availability;
```

**Query optimizado:**
```sql
-- En vez de calcular en tiempo real
SELECT * FROM mv_daily_availability 
WHERE provider_id = $1 AND service_id = $2 AND date = $3;
```

**Impacto:**
- Query complejo: 800ms → Vista materializada: 20ms

---

### NIVEL 5: Infraestructura (Impacto: variable)

#### 5.1 Red Docker Optimizada

**Verificar configuración de red:**
```yaml
# docker-compose.yml
services:
  n8n:
    networks:
      - booking-network
  
  dal-service:
    networks:
      - booking-network
  
  postgres:
    networks:
      - booking-network

networks:
  booking-network:
    driver: bridge
    # Opcional: configurar DNS más rápido
    driver_opts:
      com.docker.network.driver.mtu: 1450
```

**Verificar latencia de red:**
```bash
# Desde contenedor n8n
docker exec -it n8n-container ping dal-service
# Debería ser < 1ms en red local

# Verificar resolución DNS
docker exec -it n8n-container nslookup dal-service
```

---

#### 5.2 Recursos del DAL Service

**Monitorear:**
```bash
# Uso de CPU
docker stats dal-service-container

# Uso de memoria
docker exec dal-service-container free -m

# Logs de errores
docker logs dal-service-container --tail 100
```

**Ajustar si es necesario:**
```yaml
# docker-compose.yml
services:
  dal-service:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

---

## 📊 PLAN DE IMPLEMENTACIÓN

### Fase 1: Quick Wins (2-4 horas)

| Tarea | Tiempo | Impacto |
|-------|--------|---------|
| Agregar índices en DB | 30 min | 40-60% |
| Configurar connection pooling | 1 hora | 20-30% |
| Habilitar HTTP keep-alive | 30 min | 10-15% |
| Optimizar queries SQL | 1 hora | 30-50% |

**Total estimado:** 3-4 horas  
**Mejora esperada:** 50-70% en latencia de HTTP Requests

---

### Fase 2: Caché (4-6 horas)

| Tarea | Tiempo | Impacto |
|-------|--------|---------|
| Implementar Redis | 2 horas | 60-80% (cache hits) |
| Invalidación de caché | 2 horas | Consistencia de datos |
| TTL por endpoint | 1 hora | Optimización de memoria |
| Testing de carga | 1 hora | Validación |

**Total estimado:** 6 horas  
**Mejora esperada:** 80-90% para consultas repetidas

---

### Fase 3: Optimizaciones Avanzadas (1-2 días)

| Tarea | Tiempo | Impacto |
|-------|--------|---------|
| Pre-computar disponibilidad | 4 horas | 90-95% |
| Materialized views | 4 horas | 85-90% |
| Evitar N+1 queries | 2 horas | 50-70% |
| Compresión gzip | 1 hora | 10-20% |

**Total estimado:** 1-2 días  
**Mejora esperada:** 90%+ en endpoints de lectura

---

## 🔧 CHECKLIST DE IMPLEMENTACIÓN

### Base de Datos
- [ ] Ejecutar `EXPLAIN ANALYZE` en queries críticos
- [ ] Crear índices compuestos (provider_id, service_id, date)
- [ ] Configurar connection pooling (max: 20, min: 5)
- [ ] Habilitar `pg_stat_statements` para monitoreo
- [ ] Verificar que queries usen índices (no seq scans)

### Caché
- [ ] Desplegar Redis (o alternativa: Memcached)
- [ ] Implementar caché para `/availability` (TTL: 5 min)
- [ ] Implementar caché para `/find-next-available` (TTL: 2 min)
- [ ] Invalidar caché en `/create-booking` y `/cancel-booking`
- [ ] Monitorear hit rate (objetivo: >60%)

### HTTP/Red
- [ ] Habilitar keep-alive en DAL service
- [ ] Configurar timeout en n8n HTTP Request nodes (5s)
- [ ] Habilitar compresión gzip
- [ ] Verificar latencia de red (<1ms entre contenedores)

### Lógica de Negocio
- [ ] Auditar queries N+1
- [ ] Pre-computar disponibilidad (job programado)
- [ ] Evaluar materialized views para consultas complejas
- [ ] Optimizar serialización JSON (solo campos necesarios)

### Monitoreo
- [ ] Configurar logging de tiempos de respuesta
- [ ] Alertas si latencia > 500ms
- [ ] Dashboard de hit rate de caché
- [ ] Monitoreo de conexiones DB activas

---

## 📈 MÉTRICAS DE ÉXITO

### Antes de Optimización (Línea Base)
| Endpoint | Latencia Actual |
|----------|-----------------|
| `/availability` | 500-800ms |
| `/find-next-available` | 600-1000ms |
| `/create-booking` | 300-500ms |
| `/cancel-booking` | 200-400ms |

### Después de Optimización (Objetivos)
| Endpoint | Fase 1 | Fase 2 | Fase 3 |
|----------|--------|--------|--------|
| `/availability` | 200ms | 50ms | 20ms |
| `/find-next-available` | 300ms | 80ms | 30ms |
| `/create-booking` | 200ms | 150ms | 100ms |
| `/cancel-booking` | 150ms | 100ms | 80ms |

---

## 🧪 TESTING DE CARGA

### Script de Benchmark (Node.js)
```javascript
const http = require('http');

async function benchmark(endpoint, payload, iterations = 100) {
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    
    await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'dal-service',
        port: 3000,
        path: endpoint,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          times.push(Date.now() - start);
          resolve();
        });
      });
      
      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });
  }
  
  const avg = times.reduce((a, b) => a + b) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
  
  console.log(`${endpoint}:`);
  console.log(`  Avg: ${avg}ms, Min: ${min}ms, Max: ${max}ms, P95: ${p95}ms`);
}

// Ejecutar benchmarks
benchmark('/availability', { provider_id: 1, service_id: 1, date: '2026-03-04' });
benchmark('/find-next-available', { provider_id: 1, service_id: 1 });
```

### Comandos de Verificación
```bash
# Verificar índices
EXPLAIN ANALYZE SELECT * FROM bookings 
WHERE provider_id = 1 AND service_id = 1 AND start_time >= '2026-03-04';

# Verificar caché (Redis)
redis-cli KEYS 'availability:*'
redis-cli INFO stats | grep keyspace_hits

# Verificar conexiones activas
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
```

---

## ⚠️ RIESGOS Y MITIGACIONES

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Índices duplicados o innecesarios | Media | Bajo | Testing con EXPLAIN ANALYZE antes de crear |
| Caché con datos desactualizados | Alta | Alto | TTL corto + invalidación en writes |
| Connection pool muy grande | Media | Medio | Monitorear memoria, ajustar dinámicamente |
| Keep-alive con timeouts incorrectos | Baja | Bajo | Seguir recomendaciones (65s keep-alive, 66s headers) |
| Pre-computar consume muchos recursos | Media | Medio | Ejecutar en horarios de baja demanda |

---

## 📚 REFERENCIAS TÉCNICAS

### PostgreSQL
- Indexing: `postgresql.org/docs/current/indexes.html`
- Connection pooling: `postgresql.org/docs/current/libpq-pooling.html`
- Materialized views: `postgresql.org/docs/current/rules-materializedviews.html`
- pg_stat_statements: `postgresql.org/docs/current/pgstatstatements.html`

### Redis
- Caching patterns: `redis.io/docs/manual/programming/caching/`
- Data structures: `redis.io/docs/data-types/`
- Expiration: `redis.io/commands/expire/`

### Node.js
- pg pool: `node-postgres.com/features/pooling`
- Express performance: `expressjs.com/en/advanced/best-practice-performance.html`
- Compression: `npmjs.com/package/compression`

### n8n
- HTTP Request node: `docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/`
- Best practices: `docs.n8n.io/hosting/scaling/scaling/`

---

**Documento elaborado:** 2026-03-04  
**Próxima revisión:** Después de implementar Fase 1  
**Responsable:** Backend Engineering Team
