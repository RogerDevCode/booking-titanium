-- LIMPIEZA (DROP) en orden inverso de dependencias
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS provider_exceptions CASCADE;
DROP TABLE IF EXISTS provider_schedules CASCADE;
DROP TABLE IF EXISTS provider_services CASCADE;
DROP TABLE IF EXISTS providers CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS timezones CASCADE;

-- 1. Soporte
CREATE TABLE timezones (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    utc_offset_minutes INT NOT NULL
);

CREATE TABLE users (
    chat_id BIGINT PRIMARY KEY,
    email TEXT UNIQUE,
    full_name TEXT,
    timezone_id INT REFERENCES timezones(id) DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Servicios y Proveedores
CREATE TABLE services (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    duration_min INT NOT NULL DEFAULT 30,
    buffer_min INT NOT NULL DEFAULT 10,
    min_lead_booking_hours INT NOT NULL DEFAULT 2,
    min_lead_cancel_hours INT NOT NULL DEFAULT 2
);

CREATE TABLE providers (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    gcal_calendar_id TEXT NOT NULL DEFAULT 'primary',
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE provider_services (
    provider_id INT REFERENCES providers(id) ON DELETE CASCADE,
    service_id INT REFERENCES services(id) ON DELETE CASCADE,
    PRIMARY KEY (provider_id, service_id)
);

-- 3. Agendas y Excepciones
CREATE TABLE provider_schedules (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_id INT REFERENCES providers(id) ON DELETE CASCADE,
    day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    UNIQUE(provider_id, day_of_week)
);

CREATE TABLE provider_exceptions (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_id INT REFERENCES providers(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    is_available BOOLEAN DEFAULT FALSE,
    reason TEXT
);

-- 4. Reservas
CREATE TABLE bookings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    provider_id INT NOT NULL REFERENCES providers(id),
    service_id INT NOT NULL REFERENCES services(id),
    user_id BIGINT NOT NULL REFERENCES users(chat_id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    gcal_event_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('CONFIRMED', 'CANCELLED', 'RESCHEDULED')) DEFAULT 'CONFIRMED',
    reminder_1_hours INT DEFAULT 24,
    reminder_2_hours INT DEFAULT 2,
    reminder_1_sent BOOLEAN DEFAULT FALSE,
    reminder_2_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. SIEMBRA (SEED)
INSERT INTO timezones (name, display_name, utc_offset_minutes) VALUES 
('UTC', 'Universal Coordinated Time', 0),
('America/Santiago', 'Chile (Santiago)', -180),
('America/Bogota', 'Colombia (Bogotá)', -300);

INSERT INTO services (name, duration_min, buffer_min) VALUES ('Consulta Médica', 30, 10);
INSERT INTO providers (name, email, gcal_calendar_id) VALUES ('Dr. Roger Gallegos', 'baba.orere@gmail.com', 'primary');
INSERT INTO provider_services (provider_id, service_id) VALUES (1, 1);

INSERT INTO provider_schedules (provider_id, day_of_week, start_time, end_time)
SELECT 1, d, '09:00', '17:00' FROM generate_series(1, 5) d;
