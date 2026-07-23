-- Script para insertar datos de prueba (Jornadas y Partidos de La Liga)

-- Limpiar datos previos de partidos y jornadas (opcional, para evitar duplicados)
TRUNCATE partidos, jornadas CASCADE;

-- 1. INSERTAR JORNADAS
-- Jornada 1: Abierta, con límite de envío mañana
INSERT INTO jornadas (numero_jornada, fecha_limite_envio, estado)
VALUES (1, CURRENT_TIMESTAMP + INTERVAL '1 day', 'Abierta')
RETURNING id;

-- Jornada 2: Abierta, con límite de envío en 7 días
INSERT INTO jornadas (numero_jornada, fecha_limite_envio, estado)
VALUES (2, CURRENT_TIMESTAMP + INTERVAL '7 days', 'Abierta');

-- Jornada 3: Cerrada, plazo vencido hace 2 días (para probar visualización e histórico)
INSERT INTO jornadas (numero_jornada, fecha_limite_envio, estado)
VALUES (3, CURRENT_TIMESTAMP - INTERVAL '2 days', 'Cerrada');

-- 2. OBTENER EL ID DE LA JORNADA 1 E INSERTAR PARTIDOS DE PRUEBA
-- Usamos una consulta para insertar los partidos asociados al número de jornada correspondiente.
INSERT INTO partidos (jornada_id, equipo_local, equipo_visitante, fecha_partido, estado)
SELECT id, 'Real Madrid', 'Barcelona', CURRENT_TIMESTAMP + INTERVAL '12 hours', 'Programado'
FROM jornadas WHERE numero_jornada = 1;

INSERT INTO partidos (jornada_id, equipo_local, equipo_visitante, fecha_partido, estado)
SELECT id, 'Atlético de Madrid', 'Sevilla', CURRENT_TIMESTAMP + INTERVAL '14 hours', 'Programado'
FROM jornadas WHERE numero_jornada = 1;

INSERT INTO partidos (jornada_id, equipo_local, equipo_visitante, fecha_partido, estado)
SELECT id, 'Real Sociedad', 'Athletic Club', CURRENT_TIMESTAMP + INTERVAL '16 hours', 'Programado'
FROM jornadas WHERE numero_jornada = 1;

INSERT INTO partidos (jornada_id, equipo_local, equipo_visitante, fecha_partido, estado)
SELECT id, 'Valencia', 'Villarreal', CURRENT_TIMESTAMP + INTERVAL '18 hours', 'Programado'
FROM jornadas WHERE numero_jornada = 1;

INSERT INTO partidos (jornada_id, equipo_local, equipo_visitante, fecha_partido, estado)
SELECT id, 'Real Betis', 'Celta de Vigo', CURRENT_TIMESTAMP + INTERVAL '20 hours', 'Programado'
FROM jornadas WHERE numero_jornada = 1;

-- 3. INSERTAR PARTIDOS PARA JORNADA 2 (FUTURA)
INSERT INTO partidos (jornada_id, equipo_local, equipo_visitante, fecha_partido, estado)
SELECT id, 'Barcelona', 'Atlético de Madrid', CURRENT_TIMESTAMP + INTERVAL '6 days', 'Programado'
FROM jornadas WHERE numero_jornada = 2;

INSERT INTO partidos (jornada_id, equipo_local, equipo_visitante, fecha_partido, estado)
SELECT id, 'Villarreal', 'Real Madrid', CURRENT_TIMESTAMP + INTERVAL '6 days 2 hours', 'Programado'
FROM jornadas WHERE numero_jornada = 2;

-- 4. INSERTAR PARTIDOS PARA JORNADA 3 (YA CERRADA / FINALIZADOS CON MARCADOR REAL)
INSERT INTO partidos (jornada_id, equipo_local, equipo_visitante, fecha_partido, estado, goles_local_real, goles_visitante_real)
SELECT id, 'Sevilla', 'Real Betis', CURRENT_TIMESTAMP - INTERVAL '3 days', 'Finalizado', 2, 1
FROM jornadas WHERE numero_jornada = 3;

INSERT INTO partidos (jornada_id, equipo_local, equipo_visitante, fecha_partido, estado, goles_local_real, goles_visitante_real)
SELECT id, 'Celta de Vigo', 'Real Sociedad', CURRENT_TIMESTAMP - INTERVAL '3 days 2 hours', 'Finalizado', 0, 2
FROM jornadas WHERE numero_jornada = 3;
