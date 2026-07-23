-- FASE 4: Ingresar resultados reales y cerrar jornada 1

-- Marcar partidos como Finalizados con resultados reales
UPDATE partidos SET estado='Finalizado', goles_local_real=2, goles_visitante_real=1
WHERE id='6d4ca082-6d2e-4834-a031-a1f9988cb5c4';

UPDATE partidos SET estado='Finalizado', goles_local_real=1, goles_visitante_real=0
WHERE id='ec321175-8548-4990-b735-962c947a5c3b';

UPDATE partidos SET estado='Finalizado', goles_local_real=0, goles_visitante_real=0
WHERE id='ce95a893-e9fa-43b1-804b-a3db41db30f6';

UPDATE partidos SET estado='Finalizado', goles_local_real=1, goles_visitante_real=2
WHERE id='24f274c1-01d1-459d-bfd1-cefd97bdeb9f';

UPDATE partidos SET estado='Finalizado', goles_local_real=2, goles_visitante_real=0
WHERE id='e3f9740e-13c6-4354-a657-e3dc111c4bc4';

-- Cerrar la jornada
UPDATE jornadas SET estado='Cerrada' WHERE numero_jornada=1;

-- Verificar resultados
SELECT equipo_local, equipo_visitante, estado, goles_local_real, goles_visitante_real
FROM partidos WHERE jornada_id=1 ORDER BY fecha_partido;

SELECT id, numero_jornada, estado FROM jornadas ORDER BY numero_jornada;
