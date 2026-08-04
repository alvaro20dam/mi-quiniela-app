from flask import Blueprint, jsonify
from utils.db import query

ligas_bp = Blueprint('ligas', __name__, url_prefix='/api/ligas')

@ligas_bp.route('/', methods=['GET'])
def get_ligas_activas():
    """
    Obtiene la lista de ligas activas para mostrar en el frontend.
    """
    ligas = query(
        "SELECT id, nombre, codigo_api, pais, bandera_emoji FROM ligas WHERE activa = TRUE ORDER BY orden_display ASC",
        fetchall=True
    )
    
    if ligas is None:
        return jsonify({"error": "Error al obtener ligas"}), 500
        
    resultado = [
        {
            "id": row[0],
            "nombre": row[1],
            "codigo_api": row[2],
            "pais": row[3],
            "bandera_emoji": row[4]
        }
        for row in ligas
    ]
    
    return jsonify({"ligas": resultado}), 200
