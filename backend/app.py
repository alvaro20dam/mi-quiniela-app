# -*- coding: utf-8 -*-
"""
Punto de entrada principal de la API — Flask Application Factory.
"""
from flask import Flask, jsonify
from flask_jwt_extended import JWTManager
from flask_cors import CORS

from config import get_config
from utils.db import init_db_pool, close_db
from routes.auth import auth_bp
from routes.jornadas import jornadas_bp
from routes.quinielas import quinielas_bp


def create_app(config_class=None):
    """
    Application Factory — permite instanciar la app con configuraciones
    diferentes para desarrollo, producción y testing (TDD).
    """
    app = Flask(__name__)

    # ── Configuración ────────────────────────────────────────────────────────
    cfg = config_class or get_config()
    app.config.from_object(cfg)

    # ── CORS — permitir localhost en cualquier puerto en desarrollo ──
    CORS(app, supports_credentials=True, origins=[
        r"http://localhost:\d+",
        r"http://127\.0\.0\.1:\d+",
    ])

    # ── JWT Manager ──────────────────────────────────────────────────────────
    jwt = JWTManager(app)

    @jwt.unauthorized_loader
    def unauthorized_callback(reason):
        return jsonify({"error": "Autenticación requerida.", "detail": reason}), 401

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Sesión expirada. Por favor inicia sesión nuevamente."}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(reason):
        return jsonify({"error": "Token inválido.", "detail": reason}), 422

    # ── Base de datos ────────────────────────────────────────────────────────
    init_db_pool(app)
    app.teardown_appcontext(close_db)

    # ── Blueprints (Rutas) ───────────────────────────────────────────────────
    app.register_blueprint(auth_bp)
    app.register_blueprint(jornadas_bp)
    app.register_blueprint(quinielas_bp)

    # ── Health check ─────────────────────────────────────────────────────────
    @app.route("/api/health", methods=["GET"])
    def health_check():
        return jsonify({"status": "ok", "service": "Quinielas La Liga API"}), 200

    return app


# ── Punto de entrada directo ─────────────────────────────────────────────────
if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=app.config.get("DEBUG", False))
