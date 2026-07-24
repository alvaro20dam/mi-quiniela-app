# -*- coding: utf-8 -*-
"""
Configuración centralizada y segura de la aplicación.
Todas las claves sensibles se leen desde variables de entorno (.env).
NUNCA commites credenciales en código fuente.
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '.env'))

class Config:
    # ─── Flask ──────────────────────────────────────────────────────────────
    SECRET_KEY = os.environ.get("SECRET_KEY", "cambia-esto-en-produccion-ahora")
    DEBUG = os.environ.get("FLASK_DEBUG", "False").lower() == "true"

    # ─── JWT (Flask-JWT-Extended) ────────────────────────────────────────────
    # Tokens transmitidos como HttpOnly Cookies (nunca expuestos a JS)
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "jwt-secret-super-seguro-cambia-esto")
    JWT_TOKEN_LOCATION = ["cookies"]
    JWT_COOKIE_SECURE = os.environ.get("JWT_COOKIE_SECURE", "False").lower() == "true"
    JWT_COOKIE_HTTPONLY = True          # Mitiga XSS — JS no puede leer la cookie
    JWT_COOKIE_SAMESITE = "None" if os.environ.get("FLASK_ENV", "development") == "production" else "Lax"
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)
    # Desactivar CSRF temporalmente porque Vercel no puede leer cookies de Render
    JWT_COOKIE_CSRF_PROTECT = False

    # ─── Base de Datos ───────────────────────────────────────────────────────
    DB_HOST = os.environ.get("DB_HOST", "localhost")
    DB_PORT = os.environ.get("DB_PORT", "5432")
    DB_NAME = os.environ.get("DB_NAME", "quiniela_db")
    DB_USER = os.environ.get("DB_USER", "quiniela_user")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "")

    # ─── bcrypt ──────────────────────────────────────────────────────────────
    BCRYPT_ROUNDS = 12  # Factor de coste para bcrypt salted hash (OWASP recomienda ≥12)

    # ─── External APIs ───────────────────────────────────────────────────────
    FOOTBALL_API_TOKEN = os.environ.get("FOOTBALL_API_TOKEN", "")


class DevelopmentConfig(Config):
    DEBUG = True
    JWT_COOKIE_SECURE = False   # En desarrollo no tenemos HTTPS obligatorio


class ProductionConfig(Config):
    DEBUG = False
    JWT_COOKIE_SECURE = True    # En producción HTTPS es obligatorio


config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
}

def get_config():
    env = os.environ.get("FLASK_ENV", "development")
    return config_map.get(env, DevelopmentConfig)
