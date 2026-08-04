# -*- coding: utf-8 -*-
"""
Rutas de Autenticación — POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout
Implementado bajo las directrices OWASP Top 10:
  - A02: Salted bcrypt hash para contraseñas (nunca texto plano)
  - A07: Mensajes de error genéricos para evitar enumeración de cuentas
  - A05: Sesión via JWT en HttpOnly Cookie (configurado en config.py)
"""
import bcrypt
from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    jwt_required,
    unset_jwt_cookies,
    set_access_cookies,
    get_jwt_identity,
)
from utils.db import query

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

# ─── Mensaje genérico OWASP — evita enumeración de usuarios ─────────────────
_MSG_CREDENCIALES_INVALIDAS = "Usuario y/o contraseña incorrectos."
_MSG_EMAIL_EN_USO = "No se pudo completar el registro. Intente con otro correo."


@auth_bp.route("/register", methods=["POST"])
def register():
    """
    Registra un nuevo usuario.
    Validaciones: email único, contraseña mínima de 8 caracteres.
    Almacena un salted bcrypt hash — NUNCA la contraseña en texto plano.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Payload JSON requerido."}), 400

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    nombre = (data.get("nombre") or "").strip()

    # ── Validaciones de entrada ──────────────────────────────────────────────
    if not email or "@" not in email:
        return jsonify({"error": "Correo electrónico inválido."}), 400
    if len(password) < 8:
        return jsonify({"error": "La contraseña debe tener al menos 8 caracteres."}), 400
    if not nombre:
        return jsonify({"error": "El nombre es requerido."}), 400

    # ── Verificar si el email ya existe ─────────────────────────────────────
    existing = query(
        "SELECT id FROM usuarios WHERE email = %s",
        (email,), fetchone=True
    )
    if existing:
        # Mensaje genérico — no revelar que el email ya existe (OWASP A07)
        return jsonify({"error": _MSG_EMAIL_EN_USO}), 409

    # ── Hash de contraseña con bcrypt (salted, cost factor 12) ──────────────
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12))

    # ── Crear usuario con suscripción inactiva por defecto ─────────
    user_result = query(
        """
        INSERT INTO usuarios (email, nombre, password_hash, rol, estado_suscripcion)
        VALUES (%s, %s, %s, 'Cliente', FALSE)
        RETURNING id
        """,
        (email, nombre, password_hash.decode("utf-8")),
        fetchone=True
    )

    return jsonify({"message": "Registro exitoso. Contacta al administrador para activar tu suscripción."}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    Autenticación de usuario.
    Devuelve un JWT en una HttpOnly Cookie (nunca expuesto a JavaScript).
    Usa el mismo mensaje de error para usuario no encontrado y contraseña incorrecta
    para prevenir ataques de enumeración de cuentas (OWASP A07).
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Payload JSON requerido."}), 400

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": _MSG_CREDENCIALES_INVALIDAS}), 401

    # ── Buscar usuario ───────────────────────────────────────────────────────
    user = query(
        "SELECT id, nombre, password_hash, rol, estado_suscripcion FROM usuarios WHERE email = %s",
        (email,), fetchone=True
    )

    # ── Verificar contraseña con bcrypt (tiempo constante para evitar timing attacks) ──
    # Se verifica incluso si el usuario no existe (dummy hash) para evitar timing attacks
    _DUMMY_HASH = b"$2b$12$dummy.hash.used.to.prevent.timing.attacks.here.padding"
    stored_hash = user[2].encode("utf-8") if user else _DUMMY_HASH
    password_valid = bcrypt.checkpw(password.encode("utf-8"), stored_hash)

    if not user or not password_valid:
        # Mismo mensaje independientemente de si el usuario existe o la contraseña es incorrecta
        return jsonify({"error": _MSG_CREDENCIALES_INVALIDAS}), 401

    # ── Crear JWT y enviarlo en HttpOnly Cookie ──────────────────────────────
    identity = str(user[0])
    additional_claims = {
        "rol": user[3],
        "nombre": user[1],
        "suscripcion_activa": user[4],
    }
    access_token = create_access_token(identity=identity, additional_claims=additional_claims)

    response = jsonify({
        "message": "Login exitoso.",
        "usuario": {
            "nombre": user[1],
            "rol": user[3],
            "suscripcion_activa": user[4],
        }
    })
    set_access_cookies(response, access_token)
    return response, 200


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    """Invalida la sesión eliminando la JWT cookie del cliente."""
    response = jsonify({"message": "Sesión cerrada correctamente."})
    unset_jwt_cookies(response)
    return response, 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """Devuelve la información del usuario autenticado."""
    current_user_id = get_jwt_identity()
    user = query(
        "SELECT id, email, nombre, rol, estado_suscripcion, fecha_registro FROM usuarios WHERE id = %s",
        (current_user_id,), fetchone=True
    )
    if not user:
        return jsonify({"error": "Usuario no encontrado."}), 404

    return jsonify({
        "id": str(user[0]),
        "email": user[1],
        "nombre": user[2],
        "rol": user[3],
        "suscripcion_activa": user[4],
        "fecha_registro": user[5].isoformat() if user[5] else None,
    }), 200


from datetime import datetime, timezone

@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    """
    Restablece la contraseña utilizando un token válido.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Payload JSON requerido."}), 400

    token = data.get("token")
    new_password = data.get("new_password")

    if not token or not new_password:
        return jsonify({"error": "Token y nueva contraseña son requeridos."}), 400

    if len(new_password) < 8:
        return jsonify({"error": "La nueva contraseña debe tener al menos 8 caracteres."}), 400

    # Buscar usuario con ese token
    user = query(
        "SELECT id, reset_token_expires FROM usuarios WHERE reset_token = %s",
        (token,), fetchone=True
    )

    if not user:
        return jsonify({"error": "Enlace de recuperación inválido o expirado."}), 400

    user_id, expires = user

    # Verificar expiración
    if not expires or expires < datetime.now(timezone.utc):
        return jsonify({"error": "El enlace de recuperación ha expirado. Solicite uno nuevo al administrador."}), 400

    # Encriptar nueva contraseña
    password_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt(rounds=12))

    # Actualizar contraseña y limpiar token
    query(
        "UPDATE usuarios SET password_hash = %s, reset_token = NULL, reset_token_expires = NULL WHERE id = %s",
        (password_hash.decode("utf-8"), str(user_id))
    )

    return jsonify({"message": "Contraseña restablecida correctamente. Ya puede iniciar sesión."}), 200
