-- Activar suscripción de bienvenida para todos los usuarios existentes

UPDATE usuarios SET estado_suscripcion = TRUE WHERE estado_suscripcion = FALSE;

INSERT INTO suscripciones (usuario_id, plan_name, fecha_vigencia, estado_activo)
SELECT u.id, 'Plan Gratuito (Bienvenida)', NOW() + INTERVAL '30 days', TRUE
FROM usuarios u
LEFT JOIN suscripciones s ON s.usuario_id = u.id AND s.estado_activo = TRUE AND s.fecha_vigencia > NOW()
WHERE s.id IS NULL;

SELECT u.email, u.nombre, u.rol, u.estado_suscripcion, s.plan_name, s.estado_activo, s.fecha_vigencia
FROM usuarios u
LEFT JOIN suscripciones s ON s.usuario_id = u.id;
