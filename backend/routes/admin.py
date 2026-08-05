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
from flask import current_app
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)  # Suprimir advertencias SSL en desarrollo
from datetime import datetime, timezone, timedelta
import secrets
import os
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
    liga_id = request.args.get("liga_id", 1, type=int)

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
            WHERE liga_id = %s
            ORDER BY (CASE WHEN estado = 'Abierta' THEN 0 ELSE 1 END), numero_jornada DESC
            LIMIT 1
            """,
            (liga_id,), fetchone=True
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
    Permite al administrador cambiar el estado de una jornada.

    Transiciones permitidas:
      Abierta  → Cerrada   (cerrar para que no se acepten más quinielas)
      Cerrada  → Abierta   (reabrir si se cerró por error)

    ⚠️ La transición → 'Calculada' NO está permitida desde aquí.
       Solo el motor de cálculo (/api/quinielas/calcular/<id>) puede marcar
       una jornada como Calculada, garantizando que los puntos se computen.
    """
    claims = get_jwt()
    if claims.get("rol") != "Administrador":
        return jsonify({"error": "Acceso denegado. Se requieren permisos de Administrador."}), 403

    data = request.get_json(silent=True) or {}
    jornada_id = data.get("jornada_id")
    nuevo_estado = data.get("estado")

    if not jornada_id:
        return jsonify({"error": "El campo 'jornada_id' es requerido."}), 400

    # 'Calculada' solo puede establecerse a través del motor de cálculo
    if nuevo_estado == "Calculada":
        return jsonify({
            "error": (
                "No puedes marcar la jornada como 'Calculada' directamente. "
                "Usa el botón '🧮 Calcular Puntos' para ejecutar el motor de cálculo, "
                "que calculará los puntos de todos los participantes y luego marcará "
                "la jornada como Calculada automáticamente."
            )
        }), 400

    if nuevo_estado not in ["Abierta", "Cerrada"]:
        return jsonify({"error": "Estado inválido. Solo se permite 'Abierta' o 'Cerrada' desde este endpoint."}), 400

    # Verificar que la jornada existe y obtener su estado actual
    jornada = query(
        "SELECT id, numero_jornada, estado FROM jornadas WHERE id = %s",
        (jornada_id,), fetchone=True
    )
    if not jornada:
        return jsonify({"error": "Jornada no encontrada."}), 404

    _, numero_jornada, estado_actual = jornada

    # Validar transiciones lógicas
    if estado_actual == "Calculada":
        return jsonify({
            "error": f"La jornada {numero_jornada} ya fue calculada y no puede reabrirse ni cerrarse."
        }), 400

    if estado_actual == nuevo_estado:
        return jsonify({
            "message": f"La jornada {numero_jornada} ya está en estado '{nuevo_estado}'."
        }), 200

    query(
        "UPDATE jornadas SET estado = %s WHERE id = %s",
        (nuevo_estado, jornada_id)
    )

    accion = "cerrada" if nuevo_estado == "Cerrada" else "abierta"
    return jsonify({
        "message": f"Jornada {numero_jornada} {accion} exitosamente.",
        "estado_anterior": estado_actual,
        "estado_nuevo": nuevo_estado
    }), 200


@admin_bp.route("/jornada/<int:jornada_id>", methods=["DELETE"])
@jwt_required()
def eliminar_jornada(jornada_id):
    """
    DELETE /api/admin/jornada/<id>
    Permite al administrador eliminar una jornada y toda su información en cascada.
    """
    if not _require_admin():
        return jsonify({"error": "Acceso denegado. Se requieren permisos de Administrador."}), 403

    jornada = query("SELECT id, numero_jornada FROM jornadas WHERE id = %s", (jornada_id,), fetchone=True)
    if not jornada:
        return jsonify({"error": "La jornada no existe."}), 404

    try:
        # PostgreSQL CASCADE se encargará de borrar partidos, quinielas y pronósticos,
        # pero como no tenemos ON DELETE CASCADE configurado en el schema original,
        # lo borramos manualmente en orden inverso para asegurar integridad referencial.
        
        # Eliminar pronósticos_detalle (via quiniela_id o partido_id)
        query(
            "DELETE FROM pronosticos_detalle WHERE partido_id IN (SELECT id FROM partidos WHERE jornada_id = %s)",
            (jornada_id,)
        )
        
        # Eliminar quinielas
        query("DELETE FROM quinielas WHERE jornada_id = %s", (jornada_id,))
        
        # Eliminar partidos
        query("DELETE FROM partidos WHERE jornada_id = %s", (jornada_id,))
        
        # Eliminar jornada
        query("DELETE FROM jornadas WHERE id = %s", (jornada_id,))

        return jsonify({"message": f"Jornada {jornada[1]} eliminada con éxito."}), 200
    except Exception as e:
        return jsonify({"error": f"Error eliminando la jornada: {str(e)}"}), 500



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
            INSERT INTO suscripciones (usuario_id, plan_name, fecha_vigencia, estado_activo)
            VALUES (%s, 'Activado por Admin', CURRENT_DATE + INTERVAL '30 days', TRUE)
            """,
            (usuario_id,)
        )

    accion = "activada" if nuevo_estado else "desactivada"
    return jsonify({
        "message": f"Suscripción {accion} para {usuario[1]} ({usuario[2]}).",
        "usuario_id": usuario_id,
        "estado_suscripcion": nuevo_estado
    }), 200

@admin_bp.route("/partidos/buscar", methods=["GET"])
@jwt_required()
def buscar_partidos():
    """
    GET /api/admin/partidos/buscar?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
    Busca partidos en el rango de fechas en la API externa.
    """
    if not _require_admin():
        return jsonify({"error": "Acceso denegado."}), 403

    date_from = request.args.get("dateFrom")
    date_to = request.args.get("dateTo")

    if not date_from or not date_to:
        return jsonify({"error": "Parámetros 'dateFrom' y 'dateTo' son requeridos."}), 400

    api_token = current_app.config.get("FOOTBALL_API_TOKEN")
    if not api_token:
        return jsonify({"error": "FOOTBALL_API_TOKEN no está configurado en el backend."}), 500

    # Ligas soportadas en nuestra base de datos (códigos API)
    ligas_db = query("SELECT id, codigo_api, nombre, logo_url FROM ligas WHERE activa = TRUE", fetchall=True)
    ligas_map = {row[1]: {"id": row[0], "nombre": row[2], "bandera": row[3]} for row in ligas_db}
    codigos_api = ",".join(ligas_map.keys())

    url = f"https://api.football-data.org/v4/matches?competitions={codigos_api}&dateFrom={date_from}&dateTo={date_to}"
    headers = {"X-Auth-Token": api_token}

    try:
        resp = requests.get(url, headers=headers, verify=False, timeout=15)
        if resp.status_code != 200:
            return jsonify({"error": f"Error de la API externa: {resp.status_code} - {resp.text}"}), 502
        
        matches_data = resp.json()
        matches = matches_data.get("matches", [])
        
        # Format the response
        formatted_matches = []
        for m in matches:
            comp_code = m["competition"]["code"]
            if comp_code in ligas_map:
                formatted_matches.append({
                    "id_api": m["id"],
                    "equipo_local": m["homeTeam"]["name"],
                    "equipo_visitante": m["awayTeam"]["name"],
                    "fecha_partido": m["utcDate"],
                    "liga_id": ligas_map[comp_code]["id"],
                    "liga_nombre": ligas_map[comp_code]["nombre"],
                    "liga_bandera": ligas_map[comp_code]["bandera"],
                    "estado": m["status"]
                })
        
        return jsonify({"partidos": formatted_matches}), 200

    except Exception as e:
        return jsonify({"error": f"Error procesando la búsqueda: {str(e)}"}), 500

@admin_bp.route("/jornadas/personalizada", methods=["POST"])
@jwt_required()
def crear_jornada_personalizada():
    """
    POST /api/admin/jornadas/personalizada
    Body: { "nombre": "Semana 1", "partidos": [ { equipo_local, equipo_visitante, fecha_partido, liga_id }, ... exactly 10 ] }
    """
    if not _require_admin():
        return jsonify({"error": "Acceso denegado."}), 403

    data = request.get_json(silent=True) or {}
    nombre = data.get("nombre", "Quiniela Semanal").strip()
    partidos = data.get("partidos", [])

    if not nombre:
        return jsonify({"error": "El nombre de la jornada es requerido."}), 400

    if not isinstance(partidos, list) or len(partidos) != 10:
        return jsonify({"error": "Debe proporcionar exactamente 10 partidos para la jornada."}), 400

    try:
        # Verificar que el nombre no exista
        existing = query("SELECT id FROM jornadas WHERE nombre = %s", (nombre,), fetchone=True)
        if existing:
            return jsonify({"error": f"Ya existe una jornada con el nombre '{nombre}'."}), 409

        # Calcular fecha límite: el inicio del primer partido cronológicamente
        fechas = [datetime.fromisoformat(p["fecha_partido"].replace("Z", "+00:00")) for p in partidos]
        fecha_limite = min(fechas)

        # Insertar jornada
        jornada_row = query(
            "INSERT INTO jornadas (nombre, fecha_limite_envio, estado) VALUES (%s, %s, 'Abierta') RETURNING id",
            (nombre, fecha_limite),
            fetchone=True
        )
        jornada_id = jornada_row[0]

        # Insertar partidos
        for p in partidos:
            query(
                "INSERT INTO partidos (jornada_id, equipo_local, equipo_visitante, fecha_partido, estado, liga_id) VALUES (%s, %s, %s, %s, 'Programado', %s)",
                (jornada_id, p["equipo_local"], p["equipo_visitante"], datetime.fromisoformat(p["fecha_partido"].replace("Z", "+00:00")), p["liga_id"])
            )

        return jsonify({"message": f"Jornada '{nombre}' creada exitosamente con 10 partidos."}), 201

    except Exception as e:
        return jsonify({"error": f"Error al crear la jornada: {str(e)}"}), 500

@admin_bp.route("/db-test", methods=["GET"])
def db_test():
    import os
    db_url = os.environ.get("DATABASE_URL", "NOT_SET")
    # Hide password
    import re
    safe_url = re.sub(r":([^:@]+)@", ":XXXXX@", db_url) if db_url != "NOT_SET" else db_url
    
    try:
        import psycopg
        # Intentar conexión directa con timeout corto
        conn = psycopg.connect(db_url, connect_timeout=3)
        conn.close()
        return jsonify({"status": "SUCCESS", "url": safe_url})
    except Exception as e:
        return jsonify({"status": "ERROR", "url": safe_url, "error": str(e)})

@admin_bp.route("/jornada/actualizar-resultados", methods=["POST"])
@jwt_required()
def actualizar_resultados():
    """
    POST /api/admin/jornada/actualizar-resultados
    Body: { "jornada_id": 1 }
    Consulta la API y actualiza los marcadores reales de los partidos finalizados en esa jornada.
    """
    if not _require_admin():
        return jsonify({"error": "Acceso denegado."}), 403

    data = request.get_json(silent=True) or {}
    jornada_id = data.get("jornada_id")

    if not jornada_id:
        return jsonify({"error": "Parámetro 'jornada_id' es requerido."}), 400

    jornada = query("SELECT nombre FROM jornadas WHERE id = %s", (jornada_id,), fetchone=True)
    if not jornada:
        return jsonify({"error": "La jornada especificada no existe."}), 404

    # Buscar el rango de fechas de los partidos de la jornada
    partidos_db = query("SELECT equipo_local, equipo_visitante, fecha_partido FROM partidos WHERE jornada_id = %s", (jornada_id,), fetchall=True)
    if not partidos_db:
        return jsonify({"error": "No hay partidos en esta jornada."}), 404
        
    fechas = [p[2] for p in partidos_db]
    date_from = min(fechas).strftime("%Y-%m-%d")
    date_to = max(fechas).strftime("%Y-%m-%d")

    # Ligas
    ligas_db = query("SELECT codigo_api FROM ligas WHERE activa = TRUE", fetchall=True)
    codigos_api = ",".join([row[0] for row in ligas_db])

    api_token = current_app.config.get("FOOTBALL_API_TOKEN")
    if not api_token:
        return jsonify({"error": "FOOTBALL_API_TOKEN no está configurado en el backend."}), 500

    url = f"https://api.football-data.org/v4/matches?competitions={codigos_api}&dateFrom={date_from}&dateTo={date_to}"
    headers = {"X-Auth-Token": api_token}

    try:
        resp = requests.get(url, headers=headers, verify=False, timeout=15)
        if resp.status_code != 200:
            return jsonify({"error": f"Error de la API externa: {resp.status_code} - {resp.text}"}), 502
        
        matches_data = resp.json()
        matches = matches_data.get("matches", [])
        
        if not matches:
            return jsonify({"error": f"No se encontraron partidos en la API para las fechas de la jornada."}), 404
            
        actualizados = 0
        for m in matches:
            if m.get("status") == "FINISHED":
                equipo_local = m["homeTeam"]["name"]
                
                score = m.get("score", {}).get("fullTime", {})
                goles_local = score.get("home")
                goles_visitante = score.get("away")
                
                if goles_local is not None and goles_visitante is not None:
                    res = query(
                        """
                        UPDATE partidos 
                        SET estado = 'Finalizado', goles_local_real = %s, goles_visitante_real = %s 
                        WHERE jornada_id = %s AND equipo_local = %s AND estado != 'Finalizado'
                        """,
                        (goles_local, goles_visitante, jornada_id, equipo_local)
                    )
                    # query returns rowcount or None
                    if res and res > 0:
                        actualizados += res
                    
        return jsonify({
            "message": f"Se sincronizaron los resultados. Partidos finalizados y actualizados: {actualizados}."
        }), 200

    except Exception as e:
        return jsonify({"error": f"Error procesando la actualización: {str(e)}"}), 500


@admin_bp.route("/usuarios/<uuid:user_id>/generate-reset-link", methods=["POST"])
@jwt_required()
def generate_reset_link(user_id):
    """
    POST /api/admin/usuarios/<user_id>/generate-reset-link
    Genera un token de reseteo para el usuario y devuelve el enlace.
    """
    if not _require_admin():
        return jsonify({"error": "Acceso denegado."}), 403

    usuario = query("SELECT id FROM usuarios WHERE id = %s", (str(user_id),), fetchone=True)
    if not usuario:
        return jsonify({"error": "Usuario no encontrado."}), 404

    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=24)

    query(
        "UPDATE usuarios SET reset_token = %s, reset_token_expires = %s WHERE id = %s",
        (token, expires, str(user_id))
    )

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:8000").rstrip("/")
    reset_url = f"{frontend_url}/reset-password.html?token={token}"

    return jsonify({
        "message": "Enlace de recuperación generado.",
        "reset_link": reset_url
    }), 200

