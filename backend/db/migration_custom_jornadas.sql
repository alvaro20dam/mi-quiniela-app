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
    logo_url      VARCHAR(255),
    activa        BOOLEAN NOT NULL DEFAULT TRUE,
    orden_display INT NOT NULL DEFAULT 99
);

-- Migrar la columna si la tabla ya existía con bandera_emoji
ALTER TABLE ligas ADD COLUMN IF NOT EXISTS logo_url VARCHAR(255);
ALTER TABLE ligas DROP COLUMN IF EXISTS bandera_emoji;

-- Insertar ligas por defecto si no existen
INSERT INTO ligas (nombre, codigo_api, pais, logo_url, orden_display)
VALUES
    ('La Liga',        'PD',  'España',     'https://flagcdn.com/es.svg', 1),
    ('Premier League', 'PL',  'Inglaterra', 'https://flagcdn.com/gb-eng.svg', 2),
    ('Bundesliga',     'BL1', 'Alemania',   'https://flagcdn.com/de.svg', 3),
    ('Serie A',        'SA',  'Italia',     'https://flagcdn.com/it.svg', 4),
    ('Ligue 1',        'FL1', 'Francia',    'https://flagcdn.com/fr.svg', 5),
    ('Eredivisie',     'DED', 'Países Bajos', 'https://flagcdn.com/nl.svg', 6),
    ('Primeira Liga',  'PPL', 'Portugal',   'https://flagcdn.com/pt.svg', 7),
    ('Campeonato Brasileiro', 'BSA', 'Brasil', 'https://flagcdn.com/br.svg', 8),
    ('Championship',   'ELC', 'Inglaterra', 'https://flagcdn.com/gb-eng.svg', 9),
    ('Champions League', 'CL', 'Europa',    'https://flagcdn.com/eu.svg', 10),
    ('Europa League',  'EL',  'Europa',     'https://flagcdn.com/eu.svg', 11),
    ('Copa Libertadores', 'CLI', 'Sudamérica', 'https://flagcdn.com/un.svg', 12),
    ('Eurocopa',       'EC',  'Europa',     'https://flagcdn.com/eu.svg', 13),
    ('Mundial',        'WC',  'Mundo',      'https://flagcdn.com/un.svg', 14)
ON CONFLICT (codigo_api) DO UPDATE SET logo_url = EXCLUDED.logo_url;

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
