"""Reportes Word/PPT/PDF de PAC: Indicador 1 (/pac) y Cumplimiento Interno PAC (/pac-cumplimiento).

Cubre las correcciones de la auditoría del 2026-10-08: definición única del Indicador 1 (por monto,
cualquier proyecto PAC) con el PAC vigente como observación, reclasificación Dentro/Fuera tras cargar
un PAC, % de cumplimiento temporal medido solo sobre formularios, serie mensual por fichas (no ítems),
alertas con un único estado por proyecto, comparación al mismo corte y ranking con desempate.
"""
from datetime import date, datetime

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from api import plantillas_narrativas as N
from api import services as S
from api import services_reportes as R
from api import services_reportes_res188 as R188
from api.models import FormularioFSCDerivado as D
from api.models import OrdenCompra, PacProyectoMaestro, PlanerPAC


def _ficha(estado, fecha, id_proyecto='P-1'):
    return {'id_proyecto': id_proyecto, 'estado_ejecucion': estado, 'fecha_mas_proxima': fecha}


class DeduplicarResponsablesTest(SimpleTestCase):
    def test_une_mayusculas_tildes_y_forma_corta_pero_no_personas_distintas(self):
        nombres = ['ALEJANDRO NUÑEZ', 'Alejandro Nuñez', 'CATALINA VERA', 'Catalina Vera Castro',
                   'Claudia Vera', 'BRUNO OJEDA', 'Bruno Ojeda Alvarez']
        self.assertEqual(
            R._deduplicar_responsables(nombres),
            ['Alejandro Nuñez', 'Bruno Ojeda Alvarez', 'Catalina Vera Castro', 'Claudia Vera'],
        )

    def test_ignora_vacios(self):
        self.assertEqual(R._deduplicar_responsables(['', None, '  ', 'Ana Paz']), ['Ana Paz'])


class AlertasFichasTest(SimpleTestCase):
    """Las alertas reparten las fichas SIN formulario ni OC en listas que no se solapan."""

    def _fichas(self):
        def f(id_proyecto, estado, fecha, sub):
            return {**_ficha(estado, fecha, id_proyecto), 'subdireccion_nombre': sub}
        return [
            f('P1', 'ATRASADO', '2026-01-01', 'DIRECTOR'), f('P2', 'ATRASADO', '2026-03-01', 'SUBDIRECCION ADMINISTRATIVA'),
            f('P3', 'PENDIENTE', '2026-10-01', 'DIRECTOR'), f('P4', 'PENDIENTE', '2027-02-01', 'DIRECTOR'),
            f('P5', 'EJECUTADO', '2026-02-01', 'DIRECTOR'),
        ]

    def test_cada_ficha_sin_ejecutar_aparece_en_una_sola_lista(self):
        alertas = R._alertas_fichas(self._fichas())
        self.assertEqual([a['clave'] for a in alertas], ['ATRASADO', 'PENDIENTE'])  # sin lista de "sin fecha" si no hay
        ids = [i['id_proyecto'] for a in alertas for g in a['grupos'] for i in g['items']]
        self.assertEqual(sorted(ids), ['P1', 'P2', 'P3', 'P4'])  # la ejecutada no está, y ninguna se repite
        self.assertEqual([a['n'] for a in alertas], [2, 2])

    def test_agrupa_por_subdireccion_y_conserva_el_orden_por_fecha(self):
        atrasadas = R._alertas_fichas(self._fichas())[0]
        self.assertEqual([g['nombre'] for g in atrasadas['grupos']], ['DIRECTOR', 'SUBDIRECCION ADMINISTRATIVA'])
        pendientes = R._alertas_fichas(self._fichas())[1]
        self.assertEqual([i['fecha_mas_proxima'] for i in pendientes['grupos'][0]['items']], ['2026-10-01', '2027-02-01'])

    def test_fichas_sin_fecha_no_se_pierden(self):
        fichas = self._fichas() + [{**_ficha('SIN_FECHA', None, 'P6'), 'subdireccion_nombre': 'DIRECTOR'}]
        alertas = R._alertas_fichas(fichas)
        self.assertEqual([a['clave'] for a in alertas], ['ATRASADO', 'PENDIENTE', 'SIN_FECHA'])
        self.assertEqual(sum(a['n'] for a in alertas), 5)

    def test_listas_vacias_traen_mensaje(self):
        alertas = R._alertas_fichas([_ficha('EJECUTADO', '2026-02-01')])
        self.assertEqual([a['n'] for a in alertas], [0, 0])
        self.assertTrue(all(a['mensaje_vacio'] for a in alertas))

    def test_intro_suma_las_dos_listas(self):
        d = {'resumen_fichas': {'total': 561, 'ejecutadas': 337, 'pendientes': 43, 'atrasadas': 181, 'sin_fecha': 0}}
        texto = R._texto_intro_alertas(d, date(2026, 10, 8))
        self.assertIn('224 fichas', texto)
        self.assertIn('181 atrasadas', texto)
        self.assertIn('43 pendientes', texto)
        self.assertIn('08-10-2026', texto)


class SerieMensualFichasTest(SimpleTestCase):
    def test_cada_ficha_cuenta_una_vez_y_el_total_cuadra(self):
        fichas = [
            _ficha('EJECUTADO', '2026-01-10'), _ficha('ATRASADO', '2026-01-20'), _ficha('PENDIENTE', '2026-10-01'),
            _ficha('ATRASADO', '2025-12-01'),  # arrastre: fecha más próxima en otro año
            _ficha('SIN_FECHA', None),
        ]
        serie = R._serie_mensual_fichas(fichas, 2026)
        enero, octubre = serie['meses'][0], serie['meses'][9]
        self.assertEqual((enero['total'], enero['ejecutados'], enero['atrasados'], enero['pct_ejecutado']), (2, 1, 1, 50.0))
        self.assertEqual((octubre['total'], octubre['pendientes']), (1, 1))
        self.assertEqual((serie['fichas_otros_anios'], serie['fichas_sin_fecha']), (1, 1))
        self.assertEqual(sum(m['total'] for m in serie['meses']) + 1 + 1, len(fichas))
        self.assertIn('de arrastre', R._texto_serie_fichas(serie))


class SerieEnlaceIndicador1Test(SimpleTestCase):
    def test_pct_monto_enlazado(self):
        self.assertEqual(S._pct_monto_enlazado(75, 25), 75.0)
        self.assertEqual(S._pct_monto_enlazado(0, 0), 0.0)

    def test_primer_anio_con_enlace_ignora_anios_sin_proyectos_pac(self):
        hist = [{'anio': 2018, 'enlazadas': 0}, {'anio': 2019, 'enlazadas': 0}, {'anio': 2020, 'enlazadas': 6}]
        self.assertEqual(R188._primer_anio_con_enlace(hist), 2020)
        self.assertIsNone(R188._primer_anio_con_enlace([{'anio': 2018, 'enlazadas': 0}]))

    def test_serie_mensual_siempre_incluye_el_anio_del_informe(self):
        # Antes se tomaban los últimos 5 años con datos: para 2021 la línea resaltada quedaba fuera.
        anios = range(2018, 2027)
        self.assertEqual(R188._anios_comparables_mensual(anios, 2021, 2020), [2020, 2021])
        self.assertEqual(R188._anios_comparables_mensual(anios, 2026, 2020), [2022, 2023, 2024, 2025, 2026])
        self.assertEqual(R188._anios_comparables_mensual(anios, 2019, None), [2018, 2019])


class SerieMensualPorMontoYCantidadTest(SimpleTestCase):
    """Gráficos mensuales multi-año: misma serie por monto y por cantidad de OC, con color fijo por año."""

    @staticmethod
    def _mensual():
        filas = []
        for anio in (2024, 2025, 2026):
            for mes in range(1, 11 if anio == 2026 else 13):
                filas.append({'anio': anio, 'mes': mes, 'total': 10, 'enlazadas': 5, 'pct_enlace': 50.0 + mes,
                              'pct_enlace_monto': 20.0 + mes, 'monto_enlazado': 1.0, 'monto_no_enlazado': 1.0})
        return filas

    def test_cada_anio_tiene_siempre_el_mismo_color(self):
        # Los colores históricos del informe (2022-2026) se conservan y no dependen de la ventana de años graficada.
        self.assertEqual([R188._color_anio(a) for a in range(2022, 2027)],
                         ['#1e3a5f', '#38b2bd', '#16a34a', '#d97706', '#dc2626'])
        self.assertEqual(R188._color_anio(2025), R188._color_anio(2025))
        self.assertEqual(len({R188._color_anio(a) for a in range(2022, 2028)}), 6)   # sin repetidos en ventana
        self.assertEqual(len({R188._color_anio(a) for a in range(2023, 2028)}), 5)   # tampoco al avanzar de año

    def test_el_color_no_cambia_entre_el_grafico_de_monto_y_el_de_cantidad(self):
        # Se comprueba sobre las líneas realmente dibujadas, no sobre la paleta.
        import matplotlib.pyplot as plt
        usados = {}
        original = plt.subplots

        def espiar(*a, **k):
            fig, ax = original(*a, **k)
            usados['ax'] = ax
            return fig, ax
        plt.subplots = espiar
        try:
            colores = {}
            for nombre, fn in (('monto', R188._grafico_mensual_monto), ('cantidad', R188._grafico_mensual_cantidad)):
                fn(self._mensual(), 2026, 2020, (2026, 10))
                colores[nombre] = {l.get_label(): l.get_color() for l in usados['ax'].get_lines() if not l.get_label().startswith('_')}
        finally:
            plt.subplots = original
        for anio in ('2024', '2025', '2026'):
            self.assertEqual(colores['monto'][anio], colores['cantidad'][anio])
            self.assertEqual(colores['monto'][anio], R188._color_anio(int(anio)))

    def test_mes_en_curso_solo_si_su_punto_esta_en_el_grafico(self):
        mensual = self._mensual()
        self.assertEqual(R188._mes_en_curso_visible(mensual, 2026, 2020, date(2026, 10, 8)), (2026, 10))
        self.assertIsNone(R188._mes_en_curso_visible(mensual, 2026, 2020, date(2026, 12, 8)))   # sin datos de diciembre
        self.assertIsNone(R188._mes_en_curso_visible(mensual, 2025, 2020, date(2026, 10, 8)))   # 2026 no se dibuja en el informe 2025
        self.assertIsNone(R188._mes_en_curso_visible(mensual, 2026, 2020, date(2026, 1, 5)))    # enero: no hay tramo que unir

    def test_los_dos_graficos_se_generan(self):
        for fn in (R188._grafico_mensual_monto, R188._grafico_mensual_cantidad):
            self.assertTrue(fn(self._mensual(), 2026, 2020, (2026, 10)).getvalue().startswith(b'\x89PNG'))
            self.assertTrue(fn(self._mensual(), 2026, 2020).getvalue().startswith(b'\x89PNG'))   # sin mes en curso
            self.assertIsNone(fn([], 2026, 2020))


class AvanceAnualPorCantidadTest(SimpleTestCase):
    """Sección "% Enlace PAC por cantidad de OC": gráfico de líneas + tabla de avance + texto explicativo."""

    @staticmethod
    def _fila(anio, enlazadas, total, pct_monto):
        return {'anio': anio, 'enlazadas': enlazadas, 'total_oc': total, 'pct_enlace': round(enlazadas / total * 100, 1),
                'pct_enlace_monto': pct_monto, 'monto_enlazado': 1.0, 'monto_no_enlazado': 1.0}

    def _hist(self):
        return [self._fila(2023, 100, 400, 40.0), self._fila(2024, 200, 400, 45.0),
                self._fila(2025, 180, 400, 50.0), self._fila(2026, 300, 400, 85.0)]

    def test_tabla_trae_los_datos_y_la_variacion_en_puntos(self):
        t = R188._tabla_avance_cantidad(self._hist(), 2026)
        self.assertEqual(t.encabezados[-1], 'Variación vs año anterior')
        self.assertEqual(t.filas[0], ['2023', '100', '300', '400', '25.0%', '—'])
        self.assertEqual(t.filas[1][-2:], ['50.0%', '+25.0 pp'])
        self.assertEqual(t.filas[2][-1], '-5.0 pp')                       # retroceso con signo
        self.assertEqual(t.filas[3][0], '2026 (en curso)')               # el año en curso se rotula
        self.assertEqual(t.filas[3][2], '100')                           # OC no enlazadas = total - enlazadas

    def test_texto_principal_dice_desde_donde_partio_y_donde_esta(self):
        texto = R188._parrafo_avance_cantidad(self._hist())
        self.assertIn('pasó de 25.0% en 2023 (100 de 400 OC) a 75.0% en 2026 (300 de 400 OC)', texto)
        self.assertIn('un alza de 30.0 puntos porcentuales respecto a 2025 (45.0%)', texto)

    def test_lectura_del_avance_mayor_salto_retrocesos_y_comparacion_con_monto(self):
        nota = R188._nota_avance_cantidad(self._hist(), 2026)
        self.assertIn('El mayor avance anual fue entre 2025 y 2026 (+30.0 puntos porcentuales)', nota)
        self.assertIn('Hubo retrocesos respecto al año anterior en 2025', nota)
        self.assertIn('por monto el enlace es 85.0% (+10.0 puntos porcentuales', nota)
        self.assertIn('montos mayores', nota)                             # monto% > cantidad% => enlazadas más grandes
        self.assertIn('2026 está en curso', nota)
        self.assertNotIn('está en curso', R188._nota_avance_cantidad(self._hist(), 2027))

    def test_un_solo_anio_no_inventa_variaciones(self):
        hist = [self._fila(2026, 300, 400, 75.0)]
        self.assertIn('Aún no hay otro año', R188._parrafo_avance_cantidad(hist))
        self.assertNotIn('retrocesos', R188._nota_avance_cantidad(hist, 2026))
        self.assertIsNone(R188._parrafo_avance_cantidad([]))

    def test_lista_de_anios(self):
        self.assertEqual(R188._lista_anios([2023]), '2023')
        self.assertEqual(R188._lista_anios([2023, 2025]), '2023 y 2025')
        self.assertEqual(R188._lista_anios([2022, 2023, 2025]), '2022, 2023 y 2025')

    def test_el_grafico_de_lineas_por_cantidad_se_genera(self):
        self.assertTrue(R188._grafico_comparativo_anual_pct_cantidad(self._hist()).getvalue().startswith(b'\x89PNG'))
        self.assertIsNone(R188._grafico_comparativo_anual_pct_cantidad([]))


class NarrativaTest(SimpleTestCase):
    KPIS_T = {'formularios_evaluados': 164, 'en_fecha': 46, 'formularios_atrasados': 118, 'pct_en_fecha_formularios': 28.0}
    FICHAS = {'total': 561, 'ejecutadas': 337, 'pendientes': 43, 'atrasadas': 181, 'sin_fecha': 0}

    def test_cumplimiento_temporal_habla_solo_de_formularios(self):
        texto = N.parrafo_cumplimiento_temporal('3er trimestre de 2026', self.KPIS_T, self.FICHAS, 2026)
        self.assertIn('164 formularios Dentro PAC', texto)
        self.assertIn('46 (28.0%)', texto)
        self.assertNotIn('442', texto)  # antes mezclaba 164 formularios con 278 proyectos sin formulario
        self.assertIn('224 de las 561 fichas', texto)  # los proyectos van aparte, como fichas
        self.assertIn('durante el 3er trimestre de 2026', texto)

    def test_sin_formularios_comparables_no_falla(self):
        kpis = {'formularios_evaluados': 0, 'en_fecha': 0, 'formularios_atrasados': 0, 'pct_en_fecha_formularios': None}
        self.assertIn('no registra formularios Dentro PAC', N.parrafo_cumplimiento_temporal('octubre de 2026', kpis))
        self.assertIn('No hubo formularios Dentro PAC', N.parrafo_conclusiones('octubre de 2026', {'pct_dentro': 80.0}, kpis))

    def test_resumen_ejecutivo_gramatica(self):
        kpis = {'total': 235, 'dentro': 199, 'fuera': 36, 'pct_dentro': 84.7, 'monto_dentro': 1, 'monto_fuera': 1}
        comparativa = {'periodo_anterior': {'variacion_pp': 4.4}, 'mismo_periodo_anho_anterior': {'variacion_pp': -2.0}}
        texto = N.parrafo_resumen_ejecutivo('3er trimestre de 2026', kpis, comparativa)
        self.assertIn('Durante el 3er trimestre de 2026', texto)
        self.assertIn('respecto al período anterior y una baja de 2.0', texto)
        self.assertNotIn('respecto a el', texto)
        self.assertNotIn('lo que representa', texto)  # ya no repite "representa"
        self.assertIn('Durante octubre de 2026', N.parrafo_resumen_ejecutivo('octubre de 2026', kpis, comparativa))

    def test_nota_empates_ranking(self):
        ranking = {'mejores': [{'score': 100.0}] * 15, 'empatados_en_maximo': 70,
                   'peores': [{'score': 0.0}] * 15, 'empatados_en_minimo': 15}
        self.assertIn('70 formularios comparten el puntaje 100', R._nota_empates_ranking(ranking, True))
        self.assertIsNone(R._nota_empates_ranking(ranking, False))  # no hay empates que aclarar


class ReclasificarDentroFueraTest(TestCase):
    def setUp(self):
        PlanerPAC.objects.create(id_proyecto='A-1-PC26', pac='2026')
        PacProyectoMaestro.objects.create(id_proyecto='B-1-PC25', anho_pac=2025)
        self.stale_a_dentro = D.objects.create(folio=1, anho=2026, id_plan='A-1-PC26', dentro_fuera_pac=D.FUERA)
        self.maestro_a_dentro = D.objects.create(folio=2, anho=2026, id_plan='B-1-PC25', dentro_fuera_pac=D.FUERA)
        self.a_fuera = D.objects.create(folio=3, anho=2026, id_plan='Z-9-PC20', dentro_fuera_pac=D.DENTRO)
        self.sin_plan = D.objects.create(folio=4, anho=2026, id_plan=None, dentro_fuera_pac=D.DENTRO)
        self.sin_cambio = D.objects.create(folio=5, anho=2026, id_plan='A-1-PC26', dentro_fuera_pac=D.DENTRO)

    def _estados(self):
        return {f.folio: D.objects.get(pk=f.pk).dentro_fuera_pac for f in
                (self.stale_a_dentro, self.maestro_a_dentro, self.a_fuera, self.sin_plan, self.sin_cambio)}

    def test_dry_run_informa_sin_guardar(self):
        antes = self._estados()
        r = S.reclasificar_dentro_fuera_pac(dry_run=True)
        self.assertEqual((r['a_dentro'], r['a_fuera'], r['actualizados']), (2, 2, 4))
        self.assertEqual(self._estados(), antes)

    def test_aplica_la_regla_y_es_idempotente(self):
        # Caso real del 2026-10-08: se cargó un PAC nuevo y los formularios quedaron con la clasificación vieja.
        S.reclasificar_dentro_fuera_pac()
        self.assertEqual(self._estados(), {1: D.DENTRO, 2: D.DENTRO, 3: D.FUERA, 4: D.FUERA, 5: D.DENTRO})
        self.assertEqual(S.reclasificar_dentro_fuera_pac(dry_run=True)['actualizados'], 0)


class IndicadorUnoTest(TestCase):
    def setUp(self):
        PlanerPAC.objects.create(id_proyecto='NUEVO-1-PC26', pac='2026')
        fecha = timezone.make_aware(datetime(2026, 3, 10, 12, 0))

        def oc(codigo, monto, enlace, proyecto, estado='Aceptada'):
            OrdenCompra.objects.create(
                codigo_oc=codigo, TotalNeto=monto, EnlacePAC=enlace, ID_Proyecto=proyecto,
                EstadoOC=estado, FechaEnvio=fecha, TipoOC='SE',
            )
        oc('A', 600, 'Enlazada', 'NUEVO-1-PC26')    # proyecto del plan vigente
        oc('B', 200, 'Enlazada', 'VIEJO-1-PC24')    # arrastre: enlazada a un proyecto que ya no está en el plan
        oc('C', 200, 'No Enlazada', None)
        oc('D', 999, 'Enlazada', 'NUEVO-1-PC26', estado='Cancelada')  # canceladas no cuentan

    def test_indicador_1_exige_que_el_proyecto_este_en_el_plan(self):
        # Definición ORIGINAL restituida: solo cuentan las OC enlazadas a un proyecto de PlanerPAC.
        ind = S.calcular_indicadores_res188(2026)
        self.assertEqual(ind['i1'], 60.0)                 # 600 / 1000 (la OC enlazada a VIEJO-1-PC24 no cuenta)
        self.assertEqual(ind['monto_enlazado_pac'], 600.0)
        self.assertEqual((ind['cantidad_oc'], ind['cantidad_enlazadas']), (3, 1))
        self.assertEqual(ind['total_oc'], 1000.0)         # sigue siendo un MONTO (el dashboard lo muestra en CLP)
        self.assertTrue(ind['plan_del_anio_cargado'])

    def test_cualquier_proyecto_pac_es_solo_un_dato_adicional(self):
        ind = S.calcular_indicadores_res188(2026)
        self.assertEqual(ind['i1_cualquier_pac'], 80.0)   # (600 + 200) / 1000
        self.assertEqual(ind['monto_enlazado_cualquier_pac'], 800.0)
        self.assertEqual(ind['cantidad_enlazadas_cualquier_pac'], 2)
        # el Score del dashboard usa i1 (60), nunca el dato adicional
        self.assertNotEqual(ind['i1'], ind['i1_cualquier_pac'])

    def test_anio_sin_plan_cargado_se_marca(self):
        OrdenCompra.objects.create(
            codigo_oc='E', TotalNeto=500, EnlacePAC='Enlazada', ID_Proyecto='X-1-PC25', EstadoOC='Aceptada',
            FechaEnvio=timezone.make_aware(datetime(2025, 5, 2, 12, 0)),
        )
        ind = S.calcular_indicadores_res188(2025)
        self.assertEqual(ind['i1'], 0.0)                  # PlanerPAC solo trae 2026: el proyecto de 2025 no está
        self.assertEqual(ind['i1_cualquier_pac'], 100.0)
        self.assertFalse(ind['plan_del_anio_cargado'])    # el informe avisa que no es comparable

    def _datos_informe(self):
        """`calcular_oc_stats` usa SQL de MariaDB (MONTH()/YEAR()) y no corre sobre SQLite: se arma su
        salida a mano (con los mismos campos) y los indicadores sí salen del ORM real."""
        def fila_anual(anio, enl, no_enl, n_enl, n_total):
            return {'anio': anio, 'total_oc': n_total, 'enlazadas': n_enl, 'monto_total': enl + no_enl,
                    'monto_enlazado': enl, 'monto_no_enlazado': no_enl,
                    'pct_enlace': round(n_enl / n_total * 100, 1), 'pct_enlace_monto': S._pct_monto_enlazado(enl, no_enl)}
        oc = {
            'evolucion_enlace': [{'mes': 3, 'enlazada': 800.0, 'no_enlazada': 200.0, 'cantidad_enlazada': 2, 'cantidad_no_enlazada': 1}],
            'historico_enlace_anual': [fila_anual(2025, 50.0, 50.0, 5, 10), fila_anual(2026, 800.0, 200.0, 2, 3)],
            'historico_enlace_mensual': [
                {'anio': 2026, 'mes': 3, 'total': 3, 'enlazadas': 2, 'pct_enlace': 66.7, 'pct_enlace_monto': 80.0,
                 'monto_enlazado': 800.0, 'monto_no_enlazado': 200.0}],
            'no_enlazadas_tipo_oc': [{'tipo_oc': 'Compra Ágil', 'cantidad': 1, 'monto': 200.0}],
            'matriz_tipo_oc_interno': {'filas': [], 'columnas': [], 'datos': {}, 'insight': None},
            'corregidas': {'total_revisiones': 0, 'enlazadas_revisiones': 0, 'oc_unicas_corregidas': 0,
                           'sincronizadas': 0, 'esperando_sync': 0},
        }
        return {'anio': 2026, 'hoy': date(2026, 10, 8), 'indicadores': S.calcular_indicadores_res188(2026),
                'oc': oc, 'primer_anio_enlace': R188._primer_anio_con_enlace(oc['historico_enlace_anual'])}

    def test_el_informe_muestra_el_indicador_original_y_declara_la_observacion(self):
        datos = self._datos_informe()
        secciones = R188._construir_secciones(datos)
        resumen = secciones[0]
        self.assertEqual(R188._pct_ind1(datos), 60.0)
        self.assertIn('60.0%', resumen.parrafo)
        self.assertNotIn('80.0%', resumen.parrafo)        # el 80% solo va como observación
        filas = {f[0]: f[1] for f in resumen.tabla.filas}
        self.assertEqual(filas['N° de OC del año (sin canceladas)'], '3')
        self.assertEqual(filas['N° de OC enlazadas a proyectos del PAC vigente'], '1')
        self.assertEqual(filas['% Compras dentro del PAC (Ind.1, por monto)'], '60.0%')
        self.assertEqual(filas['Observación: % con cualquier proyecto PAC (incluye PAC de años anteriores)'], '80.0% ($800)')
        self.assertIn('cualquier proyecto PAC', resumen.nota)
        self.assertIn('80.0%', resumen.nota)
        self.assertIn('2025 fue 50.0%', resumen.nota)     # variación en la misma base de las series
        self.assertIn('CUALQUIER proyecto PAC', secciones[1].parrafo)  # la sección mensual aclara qué es "Enlazada" en las series

    def test_el_informe_incluye_la_seccion_por_cantidad_junto_a_la_de_monto(self):
        secciones = R188._construir_secciones(self._datos_informe())
        titulos = [s.titulo for s in secciones]
        i_monto = titulos.index('Comparativo Anual — % Enlace PAC (histórico institucional)')
        i_cant = titulos.index('Comparativo Anual — % Enlace PAC por cantidad de OC')
        self.assertEqual(i_cant, i_monto + 1)                             # va justo después de la de monto
        s = secciones[i_cant]
        self.assertIsNotNone(s.graficos[0].imagen)                        # gráfico de líneas
        self.assertEqual([f[0] for f in s.tabla.filas], ['2025', '2026 (en curso)'])
        self.assertIn('Lectura del avance', s.nota)
        self.assertEqual(secciones[i_monto].tabla.encabezados[-1], '% Enlace (monto)')  # la de monto ya no repite el % por cantidad

    def test_el_informe_trae_la_serie_mensual_por_monto_y_por_cantidad(self):
        secciones = R188._construir_secciones(self._datos_informe())
        titulos = [s.titulo for s in secciones]
        i_monto = titulos.index('% Enlace Mensual — Comparativo con Años Anteriores (por monto)')
        self.assertEqual(titulos[i_monto + 1], '% Enlace Mensual — Comparativo con Años Anteriores (por cantidad de OC)')
        for s in secciones[i_monto:i_monto + 2]:
            self.assertIsNotNone(s.graficos[0].imagen)
        self.assertIn('mismos colores', secciones[i_monto + 1].parrafo)

    def test_el_informe_avisa_si_el_plan_del_anio_no_esta_cargado(self):
        datos = self._datos_informe()
        datos['indicadores'] = {**datos['indicadores'], 'plan_del_anio_cargado': False}
        self.assertIn('no está cargado', R188._parrafo_resumen_ejecutivo(datos))


class RankingFormulariosTest(TestCase):
    def setUp(self):
        PlanerPAC.objects.create(id_proyecto='A-1-PC26', pac='2026', fecha_inicio_compra='2026-03-01')

        def fsc(folio, dentro, monto):
            D.objects.create(
                folio=folio, anho=2026, fecha_derivado='2026-03-10', monto_estimado=monto,
                id_plan='A-1-PC26' if dentro else None, dentro_fuera_pac=D.DENTRO if dentro else D.FUERA,
            )
        fsc(1, True, 100)
        fsc(2, True, 900)
        fsc(3, False, 50)
        fsc(4, False, 700)

    def test_empates_se_ordenan_por_monto_y_las_listas_no_se_solapan(self):
        rk = S.calcular_pac_rankings(anho=2026, tipo='formulario')
        self.assertEqual([f['folio'] for f in rk['mejores']], [2, 1])   # puntaje 100: primero el de mayor monto
        self.assertEqual([f['folio'] for f in rk['peores']], [4, 3])    # puntaje 0: primero el de mayor monto
        self.assertEqual((rk['empatados_en_maximo'], rk['empatados_en_minimo']), (2, 2))
        self.assertFalse({f['id'] for f in rk['mejores']} & {f['id'] for f in rk['peores']})
