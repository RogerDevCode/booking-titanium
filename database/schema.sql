-- ============================================================================
-- BOOKING TITANIUM - DATABASE SCHEMA
-- ============================================================================
-- Propósito: Estructura completa de la base de datos
-- Entorno: Neon Tech (PostgreSQL 17)
-- Última actualización: 2026-03-05
-- ============================================================================

-- ============================================================================
-- 1. TABLA: PROVIDERS (Profesionales de la salud)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.providers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_providers_active ON public.providers(is_active);
CREATE INDEX IF NOT EXISTS idx_providers_name ON public.providers(name);

COMMENT ON TABLE public.providers IS 'Profesionales de la salud que prestan servicios';
COMMENT ON COLUMN public.providers.id IS 'ID único del proveedor';
COMMENT ON COLUMN public.providers.name IS 'Nombre completo del profesional';
COMMENT ON COLUMN public.providers.is_active IS 'Estado activo/inactivo del proveedor';

-- ============================================================================
-- 2. TABLA: SERVICES (Servicios/Especialidades)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.services (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    duration_min INTEGER NOT NULL DEFAULT 30,
    buffer_min INTEGER NOT NULL DEFAULT 15,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_name ON public.services(name);

COMMENT ON TABLE public.services IS 'Servicios médicos/especialidades disponibles';
COMMENT ON COLUMN public.services.id IS 'ID único del servicio';
COMMENT ON COLUMN public.services.name IS 'Nombre del servicio/especialidad';
COMMENT ON COLUMN public.services.duration_min IS 'Duración estándar de la consulta (minutos)';
COMMENT ON COLUMN public.services.buffer_min IS 'Tiempo de descanso entre consultas (minutos)';

-- ============================================================================
-- 3. TABLA: PROVIDER_SERVICES (Relación muchos-a-muchos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.provider_services (
    provider_id INTEGER NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_services_provider ON public.provider_services(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_services_service ON public.provider_services(service_id);

COMMENT ON TABLE public.provider_services IS 'Relación muchos-a-muchos entre proveedores y servicios';
COMMENT ON COLUMN public.provider_services.provider_id IS 'ID del proveedor';
COMMENT ON COLUMN public.provider_services.service_id IS 'ID del servicio';

-- ============================================================================
-- 4. TABLA: PROVIDER_SCHEDULES (Horarios de atención)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.provider_schedules (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_schedule_valid CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_provider_schedules_provider ON public.provider_schedules(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_schedules_day ON public.provider_schedules(day_of_week);

COMMENT ON TABLE public.provider_schedules IS 'Horarios de atención de cada proveedor';
COMMENT ON COLUMN public.provider_schedules.id IS 'ID único del horario';
COMMENT ON COLUMN public.provider_schedules.provider_id IS 'ID del proveedor';
COMMENT ON COLUMN public.provider_schedules.day_of_week IS 'Día de la semana (0=Domingo, 1=Lunes, ..., 6=Sábado)';
COMMENT ON COLUMN public.provider_schedules.start_time IS 'Hora de inicio del turno';
COMMENT ON COLUMN public.provider_schedules.end_time IS 'Hora de fin del turno';

-- ============================================================================
-- 5. TABLA: BOOKINGS (Reservas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id INTEGER NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
    service_id INTEGER NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    user_id BIGINT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'COMPLETED')),
    short_code TEXT NOT NULL UNIQUE,
    reminder_1_hours INTEGER NOT NULL DEFAULT 24,
    reminder_2_hours INTEGER NOT NULL DEFAULT 2,
    reminder_1_sent BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_2_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_provider ON public.bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service ON public.bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_start_time ON public.bookings(start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_short_code ON public.bookings(short_code);
CREATE INDEX IF NOT EXISTS idx_bookings_reminder_1 ON public.bookings(reminder_1_sent, start_time) WHERE status = 'CONFIRMED' AND reminder_1_sent = FALSE;
CREATE INDEX IF NOT EXISTS idx_bookings_reminder_2 ON public.bookings(reminder_2_sent, start_time) WHERE status = 'CONFIRMED' AND reminder_2_sent = FALSE;

COMMENT ON TABLE public.bookings IS 'Reservas de servicios médicos';
COMMENT ON COLUMN public.bookings.id IS 'ID único de la reserva (UUID)';
COMMENT ON COLUMN public.bookings.provider_id IS 'ID del proveedor';
COMMENT ON COLUMN public.bookings.service_id IS 'ID del servicio';
COMMENT ON COLUMN public.bookings.user_id IS 'ID del usuario (Telegram chat_id)';
COMMENT ON COLUMN public.bookings.start_time IS 'Fecha y hora de inicio de la reserva';
COMMENT ON COLUMN public.bookings.end_time IS 'Fecha y hora de fin de la reserva';
COMMENT ON COLUMN public.bookings.status IS 'Estado de la reserva';
COMMENT ON COLUMN public.bookings.short_code IS 'Código corto único para referencia del usuario';
COMMENT ON COLUMN public.bookings.reminder_1_hours IS 'Horas antes para enviar recordatorio 1';
COMMENT ON COLUMN public.bookings.reminder_2_hours IS 'Horas antes para enviar recordatorio 2';
COMMENT ON COLUMN public.bookings.reminder_1_sent IS 'Flag: recordatorio 1 enviado';
COMMENT ON COLUMN public.bookings.reminder_2_sent IS 'Flag: recordatorio 2 enviado';

-- ============================================================================
-- 6. VISTAS ÚTILES
-- ============================================================================

-- Vista: Disponibilidad de proveedores por especialidad
CREATE OR REPLACE VIEW public.v_availability_by_specialty AS
SELECT 
    s.id AS service_id,
    s.name AS service_name,
    s.duration_min,
    s.buffer_min,
    p.id AS provider_id,
    p.name AS provider_name,
    ps.provider_id,
    COUNT(DISTINCT psch.id) AS schedule_count
FROM public.services s
JOIN public.provider_services ps ON s.id = ps.service_id
JOIN public.providers p ON ps.provider_id = p.id
LEFT JOIN public.provider_schedules psch ON p.id = psch.provider_id
WHERE p.is_active = TRUE
GROUP BY s.id, s.name, s.duration_min, s.buffer_min, p.id, p.name, ps.provider_id
ORDER BY s.name, p.name;

COMMENT ON VIEW public.v_availability_by_specialty IS 'Vista de disponibilidad: proveedores por especialidad con sus horarios';

-- Vista: Próximas reservas confirmadas
CREATE OR REPLACE VIEW public.v_upcoming_bookings AS
SELECT 
    b.id,
    b.short_code,
    p.name AS provider_name,
    s.name AS service_name,
    b.user_id,
    b.start_time,
    b.end_time,
    b.status,
    b.reminder_1_sent,
    b.reminder_2_sent
FROM public.bookings b
JOIN public.providers p ON b.provider_id = p.id
JOIN public.services s ON b.service_id = s.id
WHERE b.status = 'CONFIRMED'
AND b.start_time >= NOW()
ORDER BY b.start_time ASC;

COMMENT ON VIEW public.v_upcoming_bookings IS 'Vista de reservas confirmadas futuras con detalles';

-- ============================================================================
-- 7. TRIGGERS: Updated_at timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_providers_updated_at
    BEFORE UPDATE ON public.providers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_services_updated_at
    BEFORE UPDATE ON public.services
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_bookings_updated_at
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 8. DATOS INICIALES (SEED)
-- ============================================================================
-- Para poblar la base de datos con múltiples proveedores por especialidad,
-- ejecutar: npx tsx scripts-ts/seed_multi_provider.ts
-- ============================================================================
