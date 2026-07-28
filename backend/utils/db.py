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

_conninfo: str | None = None


def init_db_pool(app):
    """Inicializa la configuración de base de datos."""
    global _conninfo
    
    import os
    database_url = os.environ.get("DATABASE_URL")
    
    if database_url:
        _conninfo = database_url
    else:
        _conninfo = (
            f"host={app.config['DB_HOST']} "
            f"port={app.config['DB_PORT']} "
            f"dbname={app.config['DB_NAME']} "
            f"user={app.config['DB_USER']} "
            f"password={app.config['DB_PASSWORD']} "
        )


def get_db():
    """
    Obtiene una conexión para el contexto de la solicitud actual.
    La conexión se almacena en Flask's 'g' para reutilizarla.
    """
    if "db" not in g:
        import psycopg
        g.db = psycopg.connect(_conninfo)
    return g.db


def close_db(e=None):
    """Cierra la conexión al finalizar cada petición HTTP."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


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
        conn.commit()  # Siempre hacer commit para queries como INSERT ... RETURNING id
        if fetchone:
            return cur.fetchone()
        if fetchall:
            return cur.fetchall()
        return cur.rowcount
