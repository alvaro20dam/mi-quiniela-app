# -*- coding: utf-8 -*-
"""
Motor de Cálculo de Puntos para la Quiniela Semanal de La Liga.
Estructurado bajo estándares limpios y modularidad para integrarse en la lógica de negocio.
"""

def calcular_puntos_partido(goles_local_pronostico: int, goles_visitante_pronostico: int, 
                             goles_local_real: int, goles_visitante_real: int) -> int:
    """
    Calcula los puntos obtenidos por un usuario en un partido individual de la Quiniela.
    
    Reglas de negocio:
    - 5 puntos: Acierto de resultado completo (marcador exacto).
    - 4 puntos: Acierto de tendencia/ganador Y acierto de goles de AL MENOS UNO de los dos equipos (3 pts + 1 pt extra).
    - 3 puntos: Acierto de tendencia/ganador únicamente (sin acertar marcador ni goles individuales).
    - 0 puntos: Sin acierto de tendencia/ganador (independientemente de si coincide algún gol).
    """
    # 1. Determinar tendencia real (L = Local, V = Visitante, E = Empate)
    if goles_local_real > goles_visitante_real:
        tendencia_real = "L"
    elif goles_local_real < goles_visitante_real:
        tendencia_real = "V"
    else:
        tendencia_real = "E"
        
    # 2. Determinar tendencia pronosticada
    if goles_local_pronostico > goles_visitante_pronostico:
        tendencia_pronostico = "L"
    elif goles_local_pronostico < goles_visitante_pronostico:
        tendencia_pronostico = "V"
    else:
        tendencia_pronostico = "E"
        
    # 3. Evaluar reglas de puntuación
    if tendencia_real != tendencia_pronostico:
        # Si no se acierta la tendencia, se obtienen 0 puntos obligatoriamente
        return 0
        
    # Si se acierta la tendencia:
    # Caso A: Acierto de resultado completo (Marcador Exacto) -> 5 puntos
    if goles_local_pronostico == goles_local_real and goles_visitante_pronostico == goles_visitante_real:
        return 5
        
    # Caso B: Acierto de tendencia + goles exactos de al menos un equipo -> 4 puntos (3 tendencia + 1 extra)
    if goles_local_pronostico == goles_local_real or goles_visitante_pronostico == goles_visitante_real:
        return 4
        
    # Caso C: Acierto de tendencia sola (sin coincidencia de goles individuales) -> 3 puntos
    return 3
