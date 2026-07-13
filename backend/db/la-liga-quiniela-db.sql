-- Script SQL para la Base de Datos Relacional de la Quiniela (PostgreSQL)
-- Diseñado con restricciones de integridad relacional, índices de rendimiento y seguridad por defecto.

-- 1. EXTENSIÓN PARA UUID (Opcional, pero recomendado para identificadores seguros)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA DE USUARIOS
-- Almacena credenciales seguras y estado de acceso.
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,                -- Nombre público del jugador
    password_hash VARCHAR(255) NOT NULL,          -- Salted bcrypt hash (OWASP — nunca texto plano)
    rol VARCHAR(50) NOT NULL DEFAULT 'Cliente' CHECK (rol IN ('Administrador', 'Cliente')),
    estado_suscripcion BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimizar búsquedas y login (evita escaneo de tabla completa)
CREATE INDEX idx_usuarios_email ON usuarios(email);

-- 3. TABLA DE SUSCRIPCIONES
-- Controla los pagos y la vigencia del acceso premium.
CREATE TABLE suscripciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    plan_name VARCHAR(100) NOT NULL,
    fecha_vigencia TIMESTAMP WITH TIME ZONE NOT NULL,
    estado_activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_suscripciones_usuario ON suscripciones(usuario_id);

-- 4. TABLA DE JORNADAS (MATCHDAYS)
-- Representa las fechas semanales de La Liga.
CREATE TABLE jornadas (
    id SERIAL PRIMARY KEY,
    numero_jornada INT UNIQUE NOT NULL,
    fecha_limite_envio TIMESTAMP WITH TIME ZONE NOT NULL, -- Generalmente inicio del 1er partido de la jornada
    estado VARCHAR(50) NOT NULL DEFAULT 'Abierta' CHECK (estado IN ('Abierta', 'Cerrada', 'Calculada')),
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. TABLA DE PARTIDOS
-- Almacena los partidos correspondientes a cada jornada de La Liga.
CREATE TABLE partidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jornada_id INT NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
    equipo_local VARCHAR(100) NOT NULL,
    equipo_visitante VARCHAR(100) NOT NULL,
    fecha_partido TIMESTAMP WITH TIME ZONE NOT NULL,
    estado VARCHAR(50) NOT NULL DEFAULT 'Programado' CHECK (estado IN ('Programado', 'Finalizado')),
    goles_local_real INT DEFAULT NULL CHECK (goles_local_real >= 0),
    goles_visitante_real INT DEFAULT NULL CHECK (goles_visitante_real >= 0)
);

CREATE INDEX idx_partidos_jornada ON partidos(jornada_id);

-- 6. TABLA DE QUINIELAS (CABECERA)
-- Agrupa el lote semanal de pronósticos enviado por un usuario.
-- Restricción UNIQUE de usuario y jornada para evitar que un usuario envíe múltiples quinielas para la misma jornada.
CREATE TABLE quinielas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    jornada_id INT NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
    fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    puntos_totales INT NOT NULL DEFAULT 0,
    CONSTRAINT uq_usuario_jornada UNIQUE (usuario_id, jornada_id)
);

CREATE INDEX idx_quinielas_usuario ON quinielas(usuario_id);
CREATE INDEX idx_quinielas_jornada ON quinielas(jornada_id);

-- 7. TABLA DE PRONÓSTICOS DETALLE (DETALLE DE QUINIELA)
-- Almacena los marcadores pronosticados por el usuario para cada partido.
-- Restricción UNIQUE de quiniela y partido para que no existan duplicados de predicción.
CREATE TABLE pronosticos_detalle (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiniela_id UUID NOT NULL REFERENCES quinielas(id) ON DELETE CASCADE,
    partido_id UUID NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
    goles_local_pronostico INT NOT NULL CHECK (goles_local_pronostico >= 0),
    goles_visitante_pronostico INT NOT NULL CHECK (goles_visitante_pronostico >= 0),
    CONSTRAINT uq_quiniela_partido UNIQUE (quiniela_id, partido_id)
);

CREATE INDEX idx_detalle_quiniela ON pronosticos_detalle(quiniela_id);
CREATE INDEX idx_detalle_partido ON pronosticos_detalle(partido_id);
