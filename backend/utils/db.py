# -*- coding: utf-8 -*-
"""
Pool de conexiones a PostgreSQL usando psycopg v3.
psycopg v3 es el sucesor oficial de psycopg2 y tiene soporte nativo
para Python 3.13+ con wheels precompilados (sin necesidad de compilar).

Diferencias clave con psycopg2:
  - Import: `import psycopg` (no `psycopg2`)
  - Pool:   `psycopg_pool.ConnectionPool` (paquete separado `psycopg-pool`)
  - Cursor: retorna Row objects (acceso por índice igual que psycopg2)
  - autocommit: disponible a nivel de conexión
"""
from psycopg_pool import ConnectionPool
from flask import g

_connection_pool: ConnectionPool | None = None


def init_db_pool(app):
    """Inicializa el pool de conexiones usando la configuración de Flask."""
    global _connection_pool
    
    import os
    database_url = os.environ.get("DATABASE_URL")
    
    if database_url:
        # Render external URLs sometimes require sslmode=require but don't include it in the URL
        if "render.com" in database_url and "sslmode" not in database_url:
            if "?" in database_url:
                database_url += "&sslmode=require"
            else:
                database_url += "?sslmode=require"
        conninfo = database_url
    else:
        conninfo = (
            f"host={app.config['DB_HOST']} "
            f"port={app.config['DB_PORT']} "
            f"dbname={app.config['DB_NAME']} "
            f"user={app.config['DB_USER']} "
            f"password={app.config['DB_PASSWORD']} "
            f"{'sslmode=require' if app.config.get('FLASK_ENV') == 'production' else ''}"
        )

    _connection_pool = ConnectionPool(conninfo, min_size=1, max_size=10, open=True)


def get_db():
    """
    Obtiene una conexión del pool para el contexto de la solicitud actual.
    La conexión se almacena en Flask's 'g' para reutilizarla dentro de la misma petición.
    """
    if "db" not in g:
        g.db = _connection_pool.getconn()
    return g.db


def close_db(e=None):
    """Devuelve la conexión al pool al finalizar cada petición HTTP."""
    db = g.pop("db", None)
    if db is not None:
        _connection_pool.putconn(db)


def query(sql: str, params: tuple = None, fetchone: bool = False, fetchall: bool = False):
    """
    Ejecuta una consulta SQL de forma segura usando parámetros preparados
    para prevenir inyección SQL (SQL Injection).

    Args:
        sql: Consulta SQL con placeholders (%s).
        params: Tupla de parámetros a sustituir de forma segura.
        fetchone: True para obtener solo una fila.
        fetchall: True para obtener todas las filas.

    Returns:
        Resultado de la consulta o None.
    """
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute(sql, params)
        if fetchone:
            return cur.fetchone()
        if fetchall:
            return cur.fetchall()
        conn.commit()
        return cur.rowcount
