import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from config import get_config
import psycopg

config = get_config()
conn = psycopg.connect(
    host=config.DB_HOST,
    port=config.DB_PORT,
    dbname=config.DB_NAME,
    user=config.DB_USER,
    password=config.DB_PASSWORD
)
cur = conn.cursor()
try:
    cur.execute("ALTER TABLE jornadas ALTER COLUMN numero_jornada DROP NOT NULL;")
    conn.commit()
    print("Columna numero_jornada modificada a DROP NOT NULL con exito.")
except Exception as e:
    conn.rollback()
    print(f"Error: {e}")
finally:
    conn.close()
