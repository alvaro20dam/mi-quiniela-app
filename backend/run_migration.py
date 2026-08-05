import os
from app import create_app
from utils.db import get_db

def apply():
    app = create_app()
    with app.app_context():
        print("Applying migration_custom_jornadas.sql...")
        filepath = os.path.join("db", "migration_custom_jornadas.sql")
        with open(filepath, "r", encoding="utf-8") as f:
            sql = f.read()
            
        conn = get_db()
        with conn.cursor() as cur:
            # psycopg execute can handle multiple statements if they are separated by ;
            # Although some drivers prefer execute_script or equivalent, psycopg 3 execute 
            # handles multi-statement queries correctly.
            cur.execute(sql)
            conn.commit()
        print("Migration applied successfully.")

if __name__ == "__main__":
    apply()
