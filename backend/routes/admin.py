# -*- coding: utf-8 -*-
"""
Rutas de Administración
Endpoints:
  GET  /api/admin/status               — Participación por jornada
  POST /api/admin/jornada/estado       — Cambiar estado de jornada
  GET  /api/admin/usuarios             — Listado global de usuarios + métricas suscripciones
  GET  /api/admin/historial            — Historial paginado de quinielas (todas las jornadas)
  POST /api/admin/usuario/suscripcion  — Activar / Desactivar suscripción de un usuario
"""
import math
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from utils.db import query

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def _require_admin():
    """Helper: devuelve True si el JWT tiene rol Administrador, False si no."""
    claims = get_jwt()
    return claims.get("rol") == "Administrador"


@admin_bp.route("/status", methods=["GET"])
@jwt_required()
def admin_status():
    """
    GET /api/admin/status?jornada_id=<id>
    Devuelve resumen de participación, quinielas enviadas por usuario con pronósticos detallados,
    y la lista completa de usuarios que aún no han hecho su quiniela.
    """
    claims = get_jwt()
    if claims.get("rol") != "Administrador":
        return jsonify({"error": "Acceso denegado. Se requieren permisos de Administrador."}), 403

    jornada_id = request.args.get("jornada_id")

    if jornada_id:
        jornada = query(
            "SELECT id, numero_jornada, fecha_limite_envio, estado FROM jornadas WHERE id = %s",
            (jornada_id,), fetchone=True
        )
    else:
        # Por defecto la jornada abierta o la más reciente
        jornada = query(
            """
            SELECT id, numero_jornada, fecha_limite_envio, estado FROM jornadas
            ORDER BY (CASE WHEN estado = 'Abierta' THEN 0 ELSE 1 END), numero_jornada DESC
            LIMIT 1
            """,
            fetchone=True
        )

    if not jornada:
        return jsonify({"error": "No se encontraron jornadas en el sistema."}), 404

    j_id, num_jornada, fecha_limite, estado = jornada

    # Obtener partidos de la jornada
    partidos = query(
        """
        SELECT id, equipo_local, equipo_visitante, fecha_partido, estado, goles_local_real, goles_visitante_real
        FROM partidos WHERE jornada_id = %s ORDER BY fecha_partido ASC
        """,
        (j_id,), fetchall=True
    )

    partidos_dict = {
        str(p[0]): {
            "id": str(p[0]),
            "equipo_local": p[1],
            "equipo_visitante": p[2],
            "fecha_partido": p[3].isoformat() if p[3] else None,
            "estado": p[4],
            "goles_local_real": p[5],
            "goles_visitante_real": p[6]
        }
        for p in (partidos or [])
    }

    # Obtener todos los usuarios de rol Cliente
    usuarios = query(
        "SELECT id, email, nombre, estado_suscripcion, fecha_registro FROM usuarios WHERE rol = 'Cliente' ORDER BY nombre ASC",
        fetchall=True
    )

    # Obtener todas las quinielas de esta jornada
    quinielas_rows = query(
        """
        SELECT q.id, q.usuario_id, q.puntos_totales, q.fecha_registro
        FROM quinielas q WHERE q.jornada_id = %s
        """,
        (j_id,), fetchall=True
    )

    quinielas_map = {}
    for q_row in (quinielas_rows or []):
        q_id, u_id, pts, f_reg = q_row

        # Pronósticos de esta quiniela
        pd_rows = query(
            "SELECT partido_id, goles_local_pronostico, goles_visitante_pronostico FROM pronosticos_detalle WHERE quiniela_id = %s",
            (str(q_id),), fetchall=True
        )
        pronosticos = [
            {
                "partido_id": str(pd[0]),
                "equipo_local": partidos_dict.get(str(pd[0]), {}).get("equipo_local", ""),
                "equipo_visitante": partidos_dict.get(str(pd[0]), {}).get("equipo_visitante", ""),
                "goles_local": pd[1],
                "goles_visitante": pd[2]
            }
            for pd in (pd_rows or [])
        ]

        quinielas_map[str(u_id)] = {
            "quiniela_id": str(q_id),
            "puntos_totales": pts,
            "fecha_envio": f_reg.isoformat() if f_reg else None,
            "pronosticos": pronosticos
        }

    participantes = []
    pendientes = []

    for u in (usuarios or []):
        uid_str = str(u[0])
        u_info = {
            "usuario_id": uid_str,
            "email": u[1],
            "nombre": u[2],
            "estado_suscripcion": u[3],
            "fecha_registro": u[4].isoformat() if u[4] else None
        }

        if uid_str in quinielas_map:
            u_info.update(quinielas_map[uid_str])
            participantes.append(u_info)
        else:
            pendientes.append(u_info)

    total_usuarios = len(usuarios or [])
    total_enviados = len(participantes)
    total_pendientes = len(pendientes)
    pct = round((total_enviados / total_usuarios * 100), 1) if total_usuarios > 0 else 0

    return jsonify({
        "jornada": {
            "id": j_id,
            "numero_jornada": num_jornada,
            "fecha_limite_envio": fecha_limite.isoformat() if fecha_limite else None,
            "estado": estado
        },
        "metricas": {
            "total_usuarios": total_usuarios,
            "total_enviados": total_enviados,
            "total_pendientes": total_pendientes,
            "porcentaje_participacion": pct
        },
        "partidos": list(partidos_dict.values()),
        "participantes": participantes,
        "pendientes": pendientes
    }), 200


@admin_bp.route("/jornada/estado", methods=["POST"])
@jwt_required()
def cambiar_estado_jornada():
    """
    POST /api/admin/jornada/estado
    Permite al administrador cambiar el estado de una jornada ('Abierta', 'Cerrada', 'Calculada').
    """
    claims = get_jwt()
    if claims.get("rol") != "Administrador":
        return jsonify({"error": "Acceso denegado. Se requieren permisos de Administrador."}), 403

    data = request.get_json(silent=True) or {}
    jornada_id = data.get("jornada_id")
    nuevo_estado = data.get("estado")

    if not jornada_id or nuevo_estado not in ["Abierta", "Cerrada", "Calculada"]:
        return jsonify({"error": "Parámetros inválidos. Estado debe ser 'Abierta', 'Cerrada' o 'Calculada'."}), 400

    query(
        "UPDATE jornadas SET estado = %s WHERE id = %s",
        (nuevo_estado, jornada_id)
    )

    return jsonify({"message": f"Estado de la jornada actualizado a '{nuevo_estado}'."}), 200


# ─────────────────────────────────────────────────────────────────────────────
# NUEVOS ENDPOINTS — Gestión de usuarios, historial global, toggle suscripción
# ─────────────────────────────────────────────────────────────────────────────

@admin_bp.route("/usuarios", methods=["GET"])
@jwt_required()
def admin_usuarios():
    """
    GET /api/admin/usuarios
    Devuelve la lista completa de usuarios (rol=Cliente) con su estado de suscripción,
    total de quinielas históricas y fecha de última quiniela.
    También incluye métricas globales de la app.
    """
    if not _require_admin():
        return jsonify({"error": "Acceso denegado."}), 403

    # Lista de usuarios clientes
    usuarios = query(
        """
        SELECT
            u.id,
            u.nombre,
            u.email,
            u.rol,
            u.estado_suscripcion,
            u.fecha_registro,
            COUNT(q.id)        AS total_quinielas,
            MAX(q.fecha_registro) AS ultima_quiniela
        FROM usuarios u
        LEFT JOIN quinielas q ON q.usuario_id = u.id
        WHERE u.rol = 'Cliente'
        GROUP BY u.id, u.nombre, u.email, u.rol, u.estado_suscripcion, u.fecha_registro
        ORDER BY u.nombre ASC
        """,
        fetchall=True
    )

    usuarios_list = []
    for u in (usuarios or []):
        uid, nombre, email, rol, suscripcion, f_reg, total_q, ultima_q = u
        usuarios_list.append({
            "id": str(uid),
            "nombre": nombre,
            "email": email,
            "rol": rol,
            "estado_suscripcion": bool(suscripcion),
            "fecha_registro": f_reg.isoformat() if f_reg else None,
            "total_quinielas": int(total_q) if total_q else 0,
            "ultima_quiniela": ultima_q.isoformat() if ultima_q else None
        })

    # Métricas globales
    total_usuarios = len(usuarios_list)
    suscritos = sum(1 for u in usuarios_list if u["estado_suscripcion"])
    no_suscritos = total_usuarios - suscritos
    total_quinielas_historicas = sum(u["total_quinielas"] for u in usuarios_list)

    jornadas_abiertas = query(
        "SELECT COUNT(*) FROM jornadas WHERE estado = 'Abierta'",
        fetchone=True
    )
    n_abiertas = int(jornadas_abiertas[0]) if jornadas_abiertas else 0

    return jsonify({
        "usuarios": usuarios_list,
        "metricas_globales": {
            "total_usuarios": total_usuarios,
            "suscritos": suscritos,
            "no_suscritos": no_suscritos,
            "total_quinielas_historicas": total_quinielas_historicas,
            "jornadas_abiertas": n_abiertas
        }
    }), 200


@admin_bp.route("/historial", methods=["GET"])
@jwt_required()
def admin_historial():
    """
    GET /api/admin/historial?page=1&per_page=20&jornada_id=<id>&search=<texto>
    Devuelve el historial paginado de todas las quinielas (todas las jornadas).
    Filtrable por jornada_id y por nombre/email de usuario.
    """
    if not _require_admin():
        return jsonify({"error": "Acceso denegado."}), 403

    page      = max(1, int(request.args.get("page", 1)))
    per_page  = min(100, max(5, int(request.args.get("per_page", 20))))
    jornada_f = request.args.get("jornada_id", "").strip()
    search    = request.args.get("search", "").strip().lower()

    offset = (page - 1) * per_page

    # Construir filtros dinámicos
    filters = []
    params  = []

    if jornada_f:
        filters.append("q.jornada_id = %s")
        params.append(jornada_f)

    if search:
        filters.append("(LOWER(u.nombre) LIKE %s OR LOWER(u.email) LIKE %s)")
        params.extend([f"%{search}%", f"%{search}%"])

    where_sql = ("WHERE " + " AND ".join(filters)) if filters else ""

    # Total de registros para paginación
    count_row = query(
        f"""
        SELECT COUNT(*)
        FROM quinielas q
        JOIN usuarios u ON u.id = q.usuario_id
        JOIN jornadas j ON j.id = q.jornada_id
        {where_sql}
        """,
        tuple(params), fetchone=True
    )
    total = int(count_row[0]) if count_row else 0
    total_pages = math.ceil(total / per_page) if total > 0 else 1

    # Registros de la página
    rows = query(
        f"""
        SELECT
            q.id,
            j.numero_jornada,
            u.nombre,
            u.email,
            q.puntos_totales,
            q.fecha_registro
        FROM quinielas q
        JOIN usuarios u ON u.id = q.usuario_id
        JOIN jornadas j ON j.id = q.jornada_id
        {where_sql}
        ORDER BY j.numero_jornada DESC, q.puntos_totales DESC, q.fecha_registro ASC
        LIMIT %s OFFSET %s
        """,
        tuple(params) + (per_page, offset), fetchall=True
    )

    historial = []
    for r in (rows or []):
        qid, num_jornada, nombre, email, puntos, fecha = r
        historial.append({
            "quiniela_id": str(qid),
            "numero_jornada": num_jornada,
            "nombre": nombre,
            "email": email,
            "puntos_totales": puntos if puntos is not None else 0,
            "fecha_envio": fecha.isoformat() if fecha else None
        })

    return jsonify({
        "historial": historial,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": total_pages
        }
    }), 200


@admin_bp.route("/historial/csv", methods=["GET"])
@jwt_required()
def admin_historial_csv():
    """
    GET /api/admin/historial/csv?jornada_id=<id>&search=<texto>
    Exporta TODO el historial (sin paginar) en formato CSV.
    """
    if not _require_admin():
        return jsonify({"error": "Acceso denegado."}), 403

    from flask import Response
    import csv, io

    jornada_f = request.args.get("jornada_id", "").strip()
    search    = request.args.get("search", "").strip().lower()

    filters = []
    params  = []

    if jornada_f:
        filters.append("q.jornada_id = %s")
        params.append(jornada_f)

    if search:
        filters.append("(LOWER(u.nombre) LIKE %s OR LOWER(u.email) LIKE %s)")
        params.extend([f"%{search}%", f"%{search}%"])

    where_sql = ("WHERE " + " AND ".join(filters)) if filters else ""

    rows = query(
        f"""
        SELECT
            j.numero_jornada,
            u.nombre,
            u.email,
            q.puntos_totales,
            q.fecha_registro
        FROM quinielas q
        JOIN usuarios u ON u.id = q.usuario_id
        JOIN jornadas j ON j.id = q.jornada_id
        {where_sql}
        ORDER BY j.numero_jornada DESC, q.puntos_totales DESC
        """,
        tuple(params), fetchall=True
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Jornada", "Nombre", "Email", "Puntos", "Fecha Envío"])

    for r in (rows or []):
        num_jornada, nombre, email, puntos, fecha = r
        writer.writerow([
            f"Jornada {num_jornada}",
            nombre,
            email,
            puntos if puntos is not None else 0,
            fecha.strftime("%Y-%m-%d %H:%M") if fecha else ""
        ])

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=historial_quinielas.csv",
            "Content-Type": "text/csv; charset=utf-8"
        }
    )


@admin_bp.route("/usuario/suscripcion", methods=["POST"])
@jwt_required()
def toggle_suscripcion():
    """
    POST /api/admin/usuario/suscripcion
    Body: { "usuario_id": "<uuid>", "activar": true/false }
    Activa o desactiva la suscripción de un usuario específico.
    """
    if not _require_admin():
        return jsonify({"error": "Acceso denegado."}), 403

    data = request.get_json(silent=True) or {}
    usuario_id = data.get("usuario_id")
    activar    = data.get("activar")  # bool

    if not usuario_id or activar is None:
        return jsonify({"error": "Parámetros requeridos: usuario_id y activar (bool)."}), 400

    # Verificar que el usuario existe y es Cliente
    usuario = query(
        "SELECT id, nombre, email FROM usuarios WHERE id = %s AND rol = 'Cliente'",
        (usuario_id,), fetchone=True
    )
    if not usuario:
        return jsonify({"error": "Usuario no encontrado o no es un Cliente."}), 404

    nuevo_estado = bool(activar)

    query(
        "UPDATE usuarios SET estado_suscripcion = %s WHERE id = %s",
        (nuevo_estado, usuario_id)
    )

    # Si se activa: insertar registro en suscripciones (30 días desde hoy)
    if nuevo_estado:
        query(
            """
            INSERT INTO suscripciones (usuario_id, plan, fecha_inicio, fecha_fin, activa)
            VALUES (%s, 'Activado por Admin', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', TRUE)
            """,
            (usuario_id,)
        )

    accion = "activada" if nuevo_estado else "desactivada"
    return jsonify({
        "message": f"Suscripción {accion} para {usuario[1]} ({usuario[2]}).",
        "usuario_id": usuario_id,
        "estado_suscripcion": nuevo_estado
    }), 200
