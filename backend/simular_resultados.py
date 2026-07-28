import sys
import random
import os
import psycopg
sys.path.append('c:\\Users\\admin\\Desktop\\mi-quiniela-app\\backend')
from config import Config

def simular_resultados():
    conninfo = f"host={Config.DB_HOST} port={Config.DB_PORT} dbname={Config.DB_NAME} user={Config.DB_USER} password={Config.DB_PASSWORD}"
    conn = psycopg.connect(conninfo)
    with conn.cursor() as cur:
        # Find the most recently closed or open jornada
        cur.execute("SELECT id, numero_jornada FROM jornadas ORDER BY id DESC LIMIT 1")
        jornada = cur.fetchone()
        if not jornada:
            print("No hay jornadas en la base de datos.")
            return

        jornada_id = jornada[0]
        numero_jornada = jornada[1]

        print(f"Simulando resultados para la Jornada {numero_jornada} (ID: {jornada_id})...")

        cur.execute("SELECT id, equipo_local, equipo_visitante FROM partidos WHERE jornada_id = %s", (jornada_id,))
        partidos = cur.fetchall()

        for p in partidos:
            goles_local = random.randint(0, 4)
            goles_visitante = random.randint(0, 3)
            cur.execute(
                "UPDATE partidos SET goles_local_real = %s, goles_visitante_real = %s, estado = 'Finalizado' WHERE id = %s",
                (goles_local, goles_visitante, p[0])
            )
            print(f" - {p[1]} {goles_local} - {goles_visitante} {p[2]}")
        
        conn.commit()
    conn.close()
    print("¡Resultados simulados correctamente!")

if __name__ == '__main__':
    simular_resultados()
