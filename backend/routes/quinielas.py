# -*- coding: utf-8 -*-
"""
Rutas de Quinielas — POST /api/quinielas, GET /api/quinielas/ranking
Controlador principal del flujo de envío de pronósticos.

Validaciones implementadas (en orden estricto):
  1. Autenticación JWT válida.
  2. Suscripción activa y vigente del usuario.
  3. Jornada en estado 'Abierta'.
  4. Hora actual del servidor < fecha_limite_envio de la jornada.
  5. Pronósticos válidos para TODOS los partidos de la jornada.
  6. Goles pronosticados: enteros no negativos.
"""
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from utils.db import query
from utils.points_calculator import calcular_puntos_partido

quinielas_bp = Blueprint("quinielas", __name__, url_prefix="/api/quinielas")


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/quinielas — Enviar/actualizar quiniela semanal
# ─────────────────────────────────────────────────────────────────────────────
@quinielas_bp.route("/", methods=["POST"])
@jwt_required()
def submit_quiniela():
    """
    Permite a un usuario autenticado enviar o actualizar su quiniela
    para la jornada actualmente abierta.

    Body esperado (JSON):
    {
        "jornada_id": 1,
        "pronosticos": [
            {"partido_id": "uuid-...", "goles_local": 2, "goles_visitante": 1},
            ...
        ]
    }

    Devuelve HTTP 201 (creada) o HTTP 200 (actualizada).
    """
    current_user_id = get_jwt_identity()
    claims = get_jwt()

    if claims.get("rol") == "Administrador":
        return jsonify({
            "error": "Acceso denegado. Los administradores no participan en las quinielas."
        }), 403

    # ── Validación 1: Suscripción activa (del JWT claim + verificación en BD) ─
    suscripcion_activa_claim = claims.get("suscripcion_activa", False)
    if not suscripcion_activa_claim:
        return jsonify({
            "error": "Acceso denegado. Necesitas una suscripción activa para participar."
        }), 403

    # Doble verificación en BD (el claim puede estar desactualizado si la suscripción venció)
    suscripcion_valida = query(
        """
        SELECT 1 FROM suscripciones
        WHERE usuario_id = %s
          AND estado_activo = TRUE
          AND fecha_vigencia > NOW()
        LIMIT 1
        """,
        (current_user_id,), fetchone=True
    )
    if not suscripcion_valida:
        return jsonify({
            "error": "Acceso denegado. Tu suscripción ha vencido o está inactiva."
        }), 403

    # ── Parsear body ─────────────────────────────────────────────────────────
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Payload JSON requerido."}), 400

    jornada_id = data.get("jornada_id")
    pronosticos_input = data.get("pronosticos")

    if jornada_id is None:
        return jsonify({"error": "El campo 'jornada_id' es requerido."}), 400
    if not isinstance(pronosticos_input, list) or len(pronosticos_input) == 0:
        return jsonify({"error": "El campo 'pronosticos' debe ser una lista no vacía."}), 400

    # ── Validación 2: Jornada existe y está Abierta ──────────────────────────
    jornada = query(
        "SELECT id, numero_jornada, fecha_limite_envio, estado, liga_id FROM jornadas WHERE id = %s",
        (jornada_id,), fetchone=True
    )
    if not jornada:
        return jsonify({"error": "Jornada no encontrada."}), 404

    jornada_db_id, numero_jornada, fecha_limite, estado_jornada, liga_id = jornada

    if estado_jornada != "Abierta":
        return jsonify({
            "error": f"La jornada {numero_jornada} ya está cerrada y no admite más pronósticos."
        }), 400

    # ── Validación 3: Fecha límite del servidor ──────────────────────────────
    ahora_utc = datetime.now(timezone.utc)
    # Asegurar que fecha_limite tenga timezone info para comparación segura
    if fecha_limite.tzinfo is None:
        fecha_limite = fecha_limite.replace(tzinfo=timezone.utc)

    if ahora_utc >= fecha_limite:
        return jsonify({
            "error": (
                f"El plazo de envío para la jornada {numero_jornada} ha vencido. "
                f"La fecha límite era {fecha_limite.isoformat()}."
            )
        }), 400

    # ── Obtener todos los partidos obligatorios de la jornada ────────────────
    partidos_jornada = query(
        "SELECT id FROM partidos WHERE jornada_id = %s",
        (jornada_db_id,), fetchall=True
    )
    if not partidos_jornada:
        return jsonify({"error": "Esta jornada no tiene partidos configurados."}), 400

    ids_partidos_jornada = {str(row[0]) for row in partidos_jornada}

    # ── Validación 4: Pronósticos completos y válidos ────────────────────────
    ids_pronosticados = set()
    pronosticos_validados = []

    for idx, p in enumerate(pronosticos_input):
        partido_id = str(p.get("partido_id") or "")
        goles_local = p.get("goles_local")
        goles_visitante = p.get("goles_visitante")

        if not partido_id:
            return jsonify({"error": f"Pronóstico #{idx+1}: falta 'partido_id'."}), 400

        if partido_id not in ids_partidos_jornada:
            return jsonify({
                "error": f"El partido {partido_id} no pertenece a la jornada {numero_jornada}."
            }), 400

        if goles_local is None or goles_visitante is None:
            return jsonify({
                "error": f"Pronóstico para partido {partido_id}: los goles son requeridos."
            }), 400

        if not isinstance(goles_local, int) or not isinstance(goles_visitante, int):
            return jsonify({
                "error": f"Pronóstico para partido {partido_id}: los goles deben ser enteros."
            }), 400

        if goles_local < 0 or goles_visitante < 0:
            return jsonify({
                "error": f"Pronóstico para partido {partido_id}: los goles no pueden ser negativos."
            }), 400

        if partido_id in ids_pronosticados:
            return jsonify({
                "error": f"Pronóstico duplicado para el partido {partido_id}."
            }), 400

        ids_pronosticados.add(partido_id)
        pronosticos_validados.append({
            "partido_id": partido_id,
            "goles_local": goles_local,
            "goles_visitante": goles_visitante,
        })

    # Verificar que se hayan enviado pronósticos para TODOS los partidos
    partidos_faltantes = ids_partidos_jornada - ids_pronosticados
    if partidos_faltantes:
        return jsonify({
            "error": (
                f"Faltan pronósticos para {len(partidos_faltantes)} partido(s). "
                "Debes pronosticar todos los partidos de la jornada."
            )
        }), 400

    # ── Persistir: crear o actualizar la quiniela ────────────────────────────
    conn = _get_raw_conn()
    try:
        with conn.cursor() as cur:
            # ¿Ya existe una quiniela de este usuario para esta jornada?
            cur.execute(
                "SELECT id FROM quinielas WHERE usuario_id = %s AND jornada_id = %s",
                (current_user_id, jornada_db_id)
            )
            existing_quiniela = cur.fetchone()

            if existing_quiniela:
                quiniela_id = str(existing_quiniela[0])
                # Actualizar: eliminar pronósticos anteriores y reinsertar
                cur.execute(
                    "DELETE FROM pronosticos_detalle WHERE quiniela_id = %s",
                    (quiniela_id,)
                )
                created = False
            else:
                # Crear nueva cabecera de quiniela
                cur.execute(
                    """
                    INSERT INTO quinielas (usuario_id, jornada_id, puntos_totales, liga_id)
                    VALUES (%s, %s, 0, %s)
                    RETURNING id
                    """,
                    (current_user_id, jornada_db_id, liga_id)
                )
                quiniela_id = str(cur.fetchone()[0])
                created = True

            # Insertar pronósticos validados
            for p in pronosticos_validados:
                cur.execute(
                    """
                    INSERT INTO pronosticos_detalle
                        (quiniela_id, partido_id, goles_local_pronostico, goles_visitante_pronostico)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (quiniela_id, p["partido_id"], p["goles_local"], p["goles_visitante"])
                )

            conn.commit()

    except Exception as e:
        conn.rollback()
        return jsonify({"error": "Error interno al guardar la quiniela."}), 500

    status_code = 201 if created else 200
    action = "registrada" if created else "actualizada"

    return jsonify({
        "message": f"Quiniela {action} exitosamente para la jornada {numero_jornada}.",
        "quiniela_id": quiniela_id,
        "total_pronosticos": len(pronosticos_validados),
    }), status_code


def _get_raw_conn():
    """Obtiene la conexión cruda para transacciones manuales."""
    from utils.db import get_db
    return get_db()


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/quinielas/ranking — Tabla de clasificación
# ─────────────────────────────────────────────────────────────────────────────
@quinielas_bp.route("/ranking", methods=["GET"])
@jwt_required()
def get_ranking():
    """
    GET /api/quinielas/ranking?jornada_id=1
    Devuelve la tabla de clasificación de usuarios para una jornada específica
    o el ranking acumulado total si no se especifica jornada.
    """
    jornada_id = request.args.get("jornada_id")
    liga_id = request.args.get("liga_id", 1, type=int)

    if jornada_id:
        # Ranking de una jornada específica
        rows = query(
            """
            SELECT u.nombre, u.email, q.puntos_totales, q.fecha_registro,
                   RANK() OVER (ORDER BY q.puntos_totales DESC) AS posicion
            FROM quinielas q
            JOIN usuarios u ON u.id = q.usuario_id
            WHERE q.jornada_id = %s AND q.liga_id = %s
            ORDER BY q.puntos_totales DESC
            """,
            (jornada_id, liga_id), fetchall=True
        )
    else:
        # Ranking acumulado general (suma de todas las jornadas)
        rows = query(
            """
            SELECT u.nombre, u.email, SUM(q.puntos_totales) AS puntos_totales,
                   MAX(q.fecha_registro) AS ultima_participacion,
                   RANK() OVER (ORDER BY SUM(q.puntos_totales) DESC) AS posicion
            FROM quinielas q
            JOIN usuarios u ON u.id = q.usuario_id
            WHERE q.liga_id = %s
            GROUP BY u.id, u.nombre, u.email
            ORDER BY puntos_totales DESC
            """,
            (liga_id,), fetchall=True
        )

    ranking = [
        {
            "posicion": int(row[4]),
            "nombre": row[0],
            "email": row[1],
            "puntos_totales": int(row[2]),
            "fecha_registro": row[3].isoformat() if row[3] else None,
        }
        for row in (rows or [])
    ]

    return jsonify({"ranking": ranking, "total_participantes": len(ranking)}), 200


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/quinielas/mia?jornada_id=<id> — Quiniela del usuario para una jornada
# ─────────────────────────────────────────────────────────────────────────────
@quinielas_bp.route("/mia", methods=["GET"])
@jwt_required()
def get_mi_quiniela():
    """
    GET /api/quinielas/mia?jornada_id=<uuid>
    Devuelve los pronósticos del usuario autenticado para la jornada indicada.
    Permite repoblar el dashboard si ya envió una quiniela.
    """
    current_user_id = get_jwt_identity()
    jornada_id = request.args.get("jornada_id")

    if not jornada_id:
        return jsonify({"error": "El parámetro 'jornada_id' es requerido."}), 400

    # Buscar la quiniela del usuario para esa jornada
    quiniela = query(
        "SELECT id, puntos_totales, fecha_registro FROM quinielas WHERE usuario_id = %s AND jornada_id = %s",
        (current_user_id, jornada_id), fetchone=True
    )

    if not quiniela:
        return jsonify({"existe": False}), 404

    quiniela_id, puntos_totales, fecha_registro = quiniela

    # Obtener los pronósticos detallados
    detalles = query(
        """
        SELECT partido_id, goles_local_pronostico, goles_visitante_pronostico
        FROM pronosticos_detalle
        WHERE quiniela_id = %s
        """,
        (str(quiniela_id),), fetchall=True
    )

    pronosticos = [
        {
            "partido_id": str(row[0]),
            "goles_local": row[1],
            "goles_visitante": row[2],
        }
        for row in (detalles or [])
    ]

    return jsonify({
        "existe": True,
        "quiniela_id": str(quiniela_id),
        "puntos_totales": puntos_totales,
        "fecha_registro": fecha_registro.isoformat() if fecha_registro else None,
        "pronosticos": pronosticos,
    }), 200


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/quinielas/mis-quinielas — Historial de quinielas del usuario
# ─────────────────────────────────────────────────────────────────────────────
@quinielas_bp.route("/mis-quinielas", methods=["GET"])
@jwt_required()
def get_mis_quinielas():
    """
    GET /api/quinielas/mis-quinielas
    Devuelve el historial completo de quinielas enviadas por el usuario.
    Incluye detalle de pronósticos por partido con goles reales si disponibles.
    """
    current_user_id = get_jwt_identity()
    liga_id = request.args.get("liga_id", 1, type=int)

    # Obtener todas las quinielas del usuario con info de jornada
    quinielas_rows = query(
        """
        SELECT q.id, q.puntos_totales, q.fecha_registro,
               j.numero_jornada, j.estado AS estado_jornada, j.id AS jornada_id
        FROM quinielas q
        JOIN jornadas j ON j.id = q.jornada_id
        WHERE q.usuario_id = %s AND q.liga_id = %s
        ORDER BY j.numero_jornada DESC
        """,
        (current_user_id, liga_id), fetchall=True
    )

    if not quinielas_rows:
        return jsonify({"quinielas": [], "total": 0}), 200

    resultado = []
    for row in quinielas_rows:
        quiniela_id, puntos_totales, fecha_registro, num_jornada, estado_jornada, jornada_id = row

        # Obtener pronósticos con datos del partido y resultado real si está disponible
        detalles = query(
            """
            SELECT pd.partido_id, pd.goles_local_pronostico, pd.goles_visitante_pronostico,
                   p.equipo_local, p.equipo_visitante, p.fecha_partido, p.estado AS estado_partido,
                   p.goles_local_real, p.goles_visitante_real
            FROM pronosticos_detalle pd
            JOIN partidos p ON p.id = pd.partido_id
            WHERE pd.quiniela_id = %s
            ORDER BY p.fecha_partido ASC
            """,
            (str(quiniela_id),), fetchall=True
        )

        pronosticos = []
        for d in (detalles or []):
            pid, gl_pron, gv_pron, eq_local, eq_vis, fecha_p, est_p, gl_real, gv_real = d

            # Calcular puntos del partido si ya finalizó
            puntos_partido = None
            if est_p == 'Finalizado' and gl_real is not None and gv_real is not None:
                puntos_partido = calcular_puntos_partido(gl_pron, gv_pron, gl_real, gv_real)

            pronosticos.append({
                "partido_id": str(pid),
                "equipo_local": eq_local,
                "equipo_visitante": eq_vis,
                "fecha_partido": fecha_p.isoformat() if fecha_p else None,
                "estado_partido": est_p,
                "goles_local_pronostico": gl_pron,
                "goles_visitante_pronostico": gv_pron,
                "goles_local_real": gl_real,
                "goles_visitante_real": gv_real,
                "puntos_obtenidos": puntos_partido,
            })

        resultado.append({
            "quiniela_id": str(quiniela_id),
            "numero_jornada": num_jornada,
            "estado_jornada": estado_jornada,
            "jornada_id": str(jornada_id),
            "puntos_totales": puntos_totales or 0,
            "fecha_registro": fecha_registro.isoformat() if fecha_registro else None,
            "pronosticos": pronosticos,
        })

    return jsonify({"quinielas": resultado, "total": len(resultado)}), 200


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/quinielas/calcular/<jornada_id> — Motor de cálculo (Admin only)
# ─────────────────────────────────────────────────────────────────────────────
@quinielas_bp.route("/calcular/<int:jornada_id>", methods=["POST"])
@jwt_required()
def calcular_jornada(jornada_id):
    """
    POST /api/quinielas/calcular/<jornada_id>
    Solo accesible para usuarios con rol 'Administrador'.
    Ejecuta el motor de cálculo de puntos sobre todos los pronósticos
    de la jornada y actualiza los puntos_totales de cada quiniela.
    """
    claims = get_jwt()
    if claims.get("rol") != "Administrador":
        return jsonify({"error": "Acceso denegado. Solo administradores."}), 403

    # Verificar que la jornada existe y está Cerrada (lista para calcular)
    jornada = query(
        "SELECT id, numero_jornada, estado FROM jornadas WHERE id = %s",
        (jornada_id,), fetchone=True
    )
    if not jornada:
        return jsonify({"error": "Jornada no encontrada."}), 404

    jornada_db_id, numero_jornada, estado = jornada
    if estado == "Calculada":
        return jsonify({"message": f"La jornada {numero_jornada} ya fue calculada."}), 200
    if estado == "Abierta":
        return jsonify({"error": "La jornada debe estar Cerrada antes de calcular."}), 400

    # Obtener todos los partidos finalizados de la jornada con sus resultados reales
    partidos = query(
        """
        SELECT id, goles_local_real, goles_visitante_real
        FROM partidos
        WHERE jornada_id = %s AND estado = 'Finalizado'
        """,
        (jornada_db_id,), fetchall=True
    )

    if not partidos:
        return jsonify({"error": "No hay partidos finalizados en esta jornada."}), 400

    resultados_reales = {str(p[0]): (p[1], p[2]) for p in partidos}

    # Obtener todas las quinielas de la jornada
    quinielas = query(
        "SELECT id FROM quinielas WHERE jornada_id = %s",
        (jornada_db_id,), fetchall=True
    )

    actualizaciones = 0
    conn = _get_raw_conn()

    try:
        with conn.cursor() as cur:
            for (quiniela_id,) in (quinielas or []):
                # Obtener los pronósticos de esta quiniela
                cur.execute(
                    """
                    SELECT partido_id, goles_local_pronostico, goles_visitante_pronostico
                    FROM pronosticos_detalle
                    WHERE quiniela_id = %s
                    """,
                    (str(quiniela_id),)
                )
                pronosticos = cur.fetchall()

                puntos_totales = 0
                for partido_id, gl_pron, gv_pron in pronosticos:
                    resultado = resultados_reales.get(str(partido_id))
                    if resultado and resultado[0] is not None and resultado[1] is not None:
                        gl_real, gv_real = resultado
                        puntos = calcular_puntos_partido(gl_pron, gv_pron, gl_real, gv_real)
                        puntos_totales += puntos

                # Actualizar puntos en la cabecera de la quiniela
                cur.execute(
                    "UPDATE quinielas SET puntos_totales = %s WHERE id = %s",
                    (puntos_totales, str(quiniela_id))
                )
                actualizaciones += 1

            # Marcar la jornada como Calculada
            cur.execute(
                "UPDATE jornadas SET estado = 'Calculada' WHERE id = %s",
                (jornada_db_id,)
            )
            conn.commit()

    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Error durante el cálculo: {str(e)}"}), 500

    return jsonify({
        "message": f"Jornada {numero_jornada} calculada exitosamente.",
        "quinielas_actualizadas": actualizaciones,
    }), 200
