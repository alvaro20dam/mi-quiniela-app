-- =============================================================================
-- Migración: Jornadas Personalizadas (Mixed Leagues)
-- Descripción: Permite crear jornadas mezclando partidos de diferentes ligas.
--              Elimina la dependencia de una liga específica para cada jornada.
-- =============================================================================

-- 1. Limpiar datos de prueba para evitar conflictos de constraints
TRUNCATE TABLE jornadas CASCADE;

-- 2. Asegurar que la tabla ligas existe (si no se corrió la migración anterior)
CREATE TABLE IF NOT EXISTS ligas (
    id            SERIAL PRIMARY KEY,
    nombre        VARCHAR(100) NOT NULL,
    codigo_api    VARCHAR(10)  NOT NULL UNIQUE,
    pais          VARCHAR(100) NOT NULL,
    bandera_emoji VARCHAR(10),
    activa        BOOLEAN NOT NULL DEFAULT TRUE,
    orden_display INT NOT NULL DEFAULT 99
);

-- Insertar ligas por defecto si no existen
INSERT INTO ligas (nombre, codigo_api, pais, bandera_emoji, orden_display)
VALUES
    ('La Liga',        'PD',  'España',     '🇪🇸', 1),
    ('Premier League', 'PL',  'Inglaterra', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 2),
    ('Bundesliga',     'BL1', 'Alemania',   '🇩🇪', 3),
    ('Serie A',        'SA',  'Italia',     '🇮🇹', 4),
    ('Ligue 1',        'FL1', 'Francia',    '🇫🇷', 5),
    ('Eredivisie',     'DED', 'Países Bajos', '🇳🇱', 6),
    ('Primeira Liga',  'PPL', 'Portugal',   '🇵🇹', 7),
    ('Campeonato Brasileiro', 'BSA', 'Brasil', '🇧🇷', 8),
    ('Championship',   'ELC', 'Inglaterra', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 9),
    ('Champions League', 'CL', 'Europa',    '🇪🇺', 10),
    ('Europa League',  'EL',  'Europa',     '🇪🇺', 11),
    ('Copa Libertadores', 'CLI', 'Sudamérica', '🌎', 12),
    ('Eurocopa',       'EC',  'Europa',     '🇪🇺', 13),
    ('Mundial',        'WC',  'Mundo',      '🌎', 14)
ON CONFLICT (codigo_api) DO NOTHING;

-- 3. Modificar la tabla 'jornadas'
-- Si liga_id existía (por migration_multi_liga.sql), lo eliminamos
ALTER TABLE jornadas DROP COLUMN IF EXISTS liga_id;

-- Agregar columna 'nombre' para el nombre personalizado de la jornada
ALTER TABLE jornadas ADD COLUMN IF NOT EXISTS nombre VARCHAR(100);
UPDATE jornadas SET nombre = 'Jornada ' || numero_jornada WHERE nombre IS NULL;
ALTER TABLE jornadas ALTER COLUMN nombre SET NOT NULL;

-- Cambiar constraints de unicidad: numero_jornada ya no necesita ser único, usaremos 'nombre'
ALTER TABLE jornadas DROP CONSTRAINT IF EXISTS jornadas_numero_jornada_key;
ALTER TABLE jornadas DROP CONSTRAINT IF EXISTS uq_jornada_liga;
ALTER TABLE jornadas ADD CONSTRAINT jornadas_nombre_key UNIQUE (nombre);

-- 4. Modificar la tabla 'partidos'
-- Agregamos liga_id para saber a qué liga pertenece cada partido
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS liga_id INT REFERENCES ligas(id) ON DELETE CASCADE;

-- 5. Modificar la tabla 'quinielas'
-- Eliminar liga_id si existía
ALTER TABLE quinielas DROP COLUMN IF EXISTS liga_id;
