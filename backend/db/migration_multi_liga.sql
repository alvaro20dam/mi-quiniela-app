-- =============================================================================
-- Migración: Multi-Liga
-- Descripción: Agrega soporte para múltiples ligas (La Liga, Premier League,
--              Bundesliga, Serie A) sin romper los datos existentes.
-- Ejecutar en: Supabase → SQL Editor
-- Orden: SIEMPRE ejecutar ANTES de desplegar el nuevo backend.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1: Crear la tabla maestra de ligas
-- -----------------------------------------------------------------------------
CREATE TABLE ligas (
    id            SERIAL PRIMARY KEY,
    nombre        VARCHAR(100) NOT NULL,
    codigo_api    VARCHAR(10)  NOT NULL UNIQUE, -- Código de football-data.org (PD, PL, BL1, SA)
    pais          VARCHAR(100) NOT NULL,
    bandera_emoji VARCHAR(10),
    activa        BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE = oculta en la app sin borrarla
    orden_display INT NOT NULL DEFAULT 99         -- Orden en el dropdown de la UI
);


-- -----------------------------------------------------------------------------
-- PASO 2: Insertar las 4 ligas decididas
-- -----------------------------------------------------------------------------
INSERT INTO ligas (nombre, codigo_api, pais, bandera_emoji, orden_display) VALUES
    ('La Liga',        'PD',  'España',     '🇪🇸', 1),
    ('Premier League', 'PL',  'Inglaterra', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 2),
    ('Bundesliga',     'BL1', 'Alemania',   '🇩🇪', 3),
    ('Serie A',        'SA',  'Italia',     '🇮🇹', 4);


-- -----------------------------------------------------------------------------
-- PASO 3: Migrar la tabla `jornadas`
-- Estrategia: agregar la columna como nullable → migrar datos → hacerla obligatoria
-- Esto evita errores de constraint durante la migración.
-- -----------------------------------------------------------------------------

-- 3a. Agregar columna (nullable temporalmente)
ALTER TABLE jornadas
    ADD COLUMN liga_id INT REFERENCES ligas(id) ON DELETE CASCADE;

-- 3b. Asignar La Liga (id=1) a todas las jornadas existentes
UPDATE jornadas SET liga_id = 1 WHERE liga_id IS NULL;

-- 3c. Hacer obligatoria la columna
ALTER TABLE jornadas ALTER COLUMN liga_id SET NOT NULL;

-- 3d. Eliminar el UNIQUE anterior (solo numero_jornada)
--     y reemplazarlo por (numero_jornada + liga_id)
--     Así, La Liga y Premier pueden tener su propia "Jornada 5" sin conflicto.
ALTER TABLE jornadas DROP CONSTRAINT IF EXISTS jornadas_numero_jornada_key;
ALTER TABLE jornadas
    ADD CONSTRAINT uq_jornada_liga UNIQUE (numero_jornada, liga_id);

-- 3e. Índice de rendimiento para filtrar jornadas por liga
CREATE INDEX idx_jornadas_liga ON jornadas(liga_id);


-- -----------------------------------------------------------------------------
-- PASO 4: Migrar la tabla `quinielas`
-- Denormalización intencional: guardar liga_id en quinielas evita un JOIN
-- extra con jornadas en cada consulta de ranking (mejora rendimiento).
-- -----------------------------------------------------------------------------

-- 4a. Agregar columna (nullable temporalmente)
ALTER TABLE quinielas
    ADD COLUMN liga_id INT REFERENCES ligas(id);

-- 4b. Asignar La Liga (id=1) a todas las quinielas existentes
UPDATE quinielas SET liga_id = 1 WHERE liga_id IS NULL;

-- 4c. Hacer obligatoria la columna
ALTER TABLE quinielas ALTER COLUMN liga_id SET NOT NULL;

-- 4d. Índice de rendimiento para filtrar rankings por liga
CREATE INDEX idx_quinielas_liga ON quinielas(liga_id);


-- -----------------------------------------------------------------------------
-- VERIFICACIÓN: Ejecuta estas queries para confirmar que la migración fue exitosa
-- -----------------------------------------------------------------------------

-- Debe mostrar las 4 ligas:
-- SELECT * FROM ligas ORDER BY orden_display;

-- Debe mostrar todas las jornadas con liga_id = 1:
-- SELECT id, numero_jornada, liga_id FROM jornadas ORDER BY numero_jornada;

-- Debe mostrar todas las quinielas con liga_id = 1:
-- SELECT id, liga_id FROM quinielas LIMIT 10;
