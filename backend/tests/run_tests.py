# -*- coding: utf-8 -*-
"""
Pruebas Unitarias TDD para el Motor de Puntuación de la Quiniela usando unittest de la biblioteca estándar de Python.
"""
import unittest
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.points_calculator import calcular_puntos_partido

class TestCalculadorPuntos(unittest.TestCase):

    def test_resultado_completo_cinco_puntos(self):
        """
        Test: Validar que acertar el marcador exacto otorga 5 puntos.
        Ejemplo: Pronóstico 2-1 vs Real 2-1 (Gana Local de forma idéntica)
        """
        puntos = calcular_puntos_partido(
            goles_local_pronostico=2,
            goles_visitante_pronostico=1,
            goles_local_real=2,
            goles_visitante_real=1
        )
        self.assertEqual(puntos, 5)

    def test_tendencia_con_punto_extra_goles_local_cuatro_puntos(self):
        """
        Test: Validar acierto de tendencia y goles del equipo local (pero no visitante).
        Ejemplo: Pronóstico 2-1 vs Real 2-0 (Gana Local, coincide el 2 de local, total 4 pts)
        """
        puntos = calcular_puntos_partido(
            goles_local_pronostico=2,
            goles_visitante_pronostico=1,
            goles_local_real=2,
            goles_visitante_real=0
        )
        self.assertEqual(puntos, 4)

    def test_tendencia_con_punto_extra_goles_visitante_cuatro_puntos(self):
        """
        Test: Validar acierto de tendencia y goles del equipo visitante (pero no local).
        Ejemplo: Pronóstico 0-1 vs Real 2-1? No, eso cambia la tendencia de ganador.
        Para mantener la tendencia de Gana Visitante (V):
        Pronóstico: 0-1 (Gana Visitante)
        Real: 0-2 (Gana Visitante)
        Coinciden los goles del local (0 == 0), por lo que recibe 3 (tendencia) + 1 (goles local) = 4 pts.
        """
        puntos = calcular_puntos_partido(
            goles_local_pronostico=0,
            goles_visitante_pronostico=1,
            goles_local_real=0,
            goles_visitante_real=2
        )
        self.assertEqual(puntos, 4)

    def test_resultado_ganador_tendencia_sola_tres_puntos(self):
        """
        Test: Validar acierto de tendencia únicamente sin coincidencia en goles individuales.
        Ejemplo: Pronóstico 3-1 vs Real 2-0 (Gana Local, pero ni 3==2 ni 1==0, total 3 pts)
        """
        puntos = calcular_puntos_partido(
            goles_local_pronostico=3,
            goles_visitante_pronostico=1,
            goles_local_real=2,
            goles_visitante_real=0
        )
        self.assertEqual(puntos, 3)

    def test_resultado_empate_tendencia_sola_tres_puntos(self):
        """
        Test: Validar acierto de tendencia en empate únicamente sin coincidencia en goles individuales.
        Ejemplo: Pronóstico 2-2 vs Real 1-1 (Empate, pero ni 2==1 ni 2==1, total 3 pts)
        """
        puntos = calcular_puntos_partido(
            goles_local_pronostico=2,
            goles_visitante_pronostico=2,
            goles_local_real=1,
            goles_visitante_real=1
        )
        self.assertEqual(puntos, 3)

    def test_tendencia_incorrecta_con_un_marcador_cero_puntos(self):
        """
        Test: Validar que si no se acierte el ganador/empate, se otorga 0 puntos,
        incluso si se acierten los goles de un equipo.
        Ejemplo: Pronóstico 1-1 vs Real 1-2 (Se predijo empate, fue victoria visitante. 
        Coincide el gol del local, pero la tendencia es errónea, total 0 pts)
        """
        puntos = calcular_puntos_partido(
            goles_local_pronostico=1,
            goles_visitante_pronostico=1,
            goles_local_real=1,
            goles_visitante_real=2
        )
        self.assertEqual(puntos, 0)

    def test_sin_aciertos_cero_puntos(self):
        """
        Test: Validar que si no se acierta nada se otorgan 0 puntos.
        Ejemplo: Pronóstico 2-0 vs Real 0-1 (Se predijo victoria local, fue victoria visitante)
        """
        puntos = calcular_puntos_partido(
            goles_local_pronostico=2,
            goles_visitante_pronostico=0,
            goles_local_real=0,
            goles_visitante_real=1
        )
        self.assertEqual(puntos, 0)

if __name__ == '__main__':
    unittest.main()
