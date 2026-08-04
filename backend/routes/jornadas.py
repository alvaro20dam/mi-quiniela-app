# -*- coding: utf-8 -*-
"""
Rutas de Jornadas — GET /api/jornadas/actual
Devuelve la jornada actualmente abierta para pronósticos junto con
todos sus partidos (SIN goles reales, para no dar ventaja al usuario).
"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from utils.db import query

jornadas_bp = Blueprint("jornadas", __name__, url_prefix="/api/jornadas")


@jornadas_bp.route("/actual", methods=["GET"])
@jwt_required()
def get_jornada_actual():
    """
    GET /api/jornadas/actual
    Requiere autenticación JWT.
    Devuelve la jornada en estado 'Abierta' con su lista de partidos.
    Los goles reales se omiten intencionalmente en esta respuesta.
    """
    liga_id = request.args.get('liga_id', 1, type=int)

    # ── Buscar la jornada actualmente abierta ────────────────────────────────
    jornada = query(
        """
        SELECT id, numero_jornada, fecha_limite_envio, estado
        FROM jornadas
        WHERE estado = 'Abierta' AND liga_id = %s
        ORDER BY numero_jornada ASC
        LIMIT 1
        """,
        (liga_id,),
        fetchone=True
    )

    if not jornada:
        return jsonify({"message": "No hay jornada abierta en este momento."}), 404

    jornada_id, numero_jornada, fecha_limite, estado = jornada

    # ── Obtener los partidos de esa jornada (sin goles reales) ───────────────
    partidos_rows = query(
        """
        SELECT id, equipo_local, equipo_visitante, fecha_partido, estado
        FROM partidos
        WHERE jornada_id = %s
        ORDER BY fecha_partido ASC
        """,
        (jornada_id,),
        fetchall=True
    )

    partidos = [
        {
            "id": str(row[0]),
            "equipo_local": row[1],
            "equipo_visitante": row[2],
            "fecha_partido": row[3].isoformat(),
            "estado": row[4],
            # Los goles reales NO se incluyen en esta respuesta (diseño intencional)
        }
        for row in (partidos_rows or [])
    ]

    return jsonify({
        "jornada": {
            "id": jornada_id,
            "numero_jornada": numero_jornada,
            "fecha_limite_envio": fecha_limite.isoformat(),
            "estado": estado,
            "total_partidos": len(partidos),
        },
        "partidos": partidos,
    }), 200


@jornadas_bp.route("/", methods=["GET"])
@jwt_required()
def list_jornadas():
    """
    GET /api/jornadas/
    Lista todas las jornadas con su estado (para administradores y vista histórica).
    """
    liga_id = request.args.get('liga_id', 1, type=int)
    rows = query(
        "SELECT id, numero_jornada, fecha_limite_envio, estado FROM jornadas WHERE liga_id = %s ORDER BY numero_jornada DESC",
        (liga_id,),
        fetchall=True
    )

    jornadas = [
        {
            "id": row[0],
            "numero_jornada": row[1],
            "fecha_limite_envio": row[2].isoformat(),
            "estado": row[3],
        }
        for row in (rows or [])
    ]

    return jsonify({"jornadas": jornadas}), 200


@jornadas_bp.route("/<jornada_id>", methods=["GET"])
@jwt_required()
def get_jornada_por_id(jornada_id):
    """
    GET /api/jornadas/<jornada_id>
    Devuelve una jornada específica con sus partidos.
    Los goles reales se incluyen sólo si el partido está Finalizado.
    """
    jornada = query(
        "SELECT id, numero_jornada, fecha_limite_envio, estado FROM jornadas WHERE id = %s",
        (jornada_id,), fetchone=True
    )
    if not jornada:
        return jsonify({"error": "Jornada no encontrada."}), 404

    jornada_id_db, numero_jornada, fecha_limite, estado = jornada

    partidos_rows = query(
        """
        SELECT id, equipo_local, equipo_visitante, fecha_partido, estado,
               goles_local_real, goles_visitante_real
        FROM partidos
        WHERE jornada_id = %s
        ORDER BY fecha_partido ASC
        """,
        (jornada_id_db,), fetchall=True
    )

    partidos = []
    for row in (partidos_rows or []):
        p = {
            "id": str(row[0]),
            "equipo_local": row[1],
            "equipo_visitante": row[2],
            "fecha_partido": row[3].isoformat(),
            "estado": row[4],
        }
        # Solo revelar goles reales si el partido ya terminó
        if row[4] == "Finalizado":
            p["goles_local_real"] = row[5]
            p["goles_visitante_real"] = row[6]
        partidos.append(p)

    return jsonify({
        "jornada": {
            "id": jornada_id_db,
            "numero_jornada": numero_jornada,
            "fecha_limite_envio": fecha_limite.isoformat(),
            "estado": estado,
            "total_partidos": len(partidos),
        },
        "partidos": partidos,
    }), 200
