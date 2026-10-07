"""Paso 5 del módulo Notificación: destinatarios (modo prueba / CC) y construcción del correo."""
from django.test import TestCase, override_settings

from api.models import PlanerPAC
from api.services_notificacion_plan import (
    agrupar_por_responsable, calcular_destinatarios, cargar_detalle_pac, construir_correo,
)

JEFES = [{'nombre': 'JEFA UNO', 'correo': 'jefa@x.cl'}, {'nombre': 'JEFE DOS', 'correo': 'JEFE2@x.cl'}]
PRUEBA = 'prueba@x.cl'


@override_settings(NOTIF_PLAN_DESTINO_PRUEBA=PRUEBA, NOTIF_PLAN_CC_JEFATURAS=True,
                   NOTIF_PLAN_RESUMEN_CC=['cristina@x.cl', 'sandra@x.cl'])
class DestinatariosTest(TestCase):
    @override_settings(NOTIF_PLAN_MODO_PRUEBA=True)
    def test_modo_prueba_envia_solo_al_destino_de_prueba_sin_copias(self):
        d = calcular_destinatarios('real@x.cl', JEFES)
        self.assertEqual((d['para'], d['cc']), ([PRUEBA], []))
        # Lo que habría pasado queda registrado, pero NO se usa para enviar.
        self.assertEqual(d['reales_para'], ['real@x.cl'])
        self.assertEqual(d['reales_cc'], ['jefa@x.cl', 'jefe2@x.cl'])    # las fijas NO van en cada correo
        self.assertTrue(d['modo_prueba'])

    @override_settings(NOTIF_PLAN_MODO_PRUEBA=True)
    def test_modo_prueba_no_exige_que_el_responsable_tenga_correo(self):
        d = calcular_destinatarios('', JEFES)
        self.assertEqual(d['para'], [PRUEBA])
        self.assertEqual(d['reales_para'], [])

    @override_settings(NOTIF_PLAN_MODO_PRUEBA=True, NOTIF_PLAN_DESTINO_PRUEBA='')
    def test_modo_prueba_sin_destino_valido_falla_en_vez_de_enviar_a_otro_lado(self):
        with self.assertRaises(ValueError):
            calcular_destinatarios('real@x.cl', JEFES)

    @override_settings(NOTIF_PLAN_MODO_PRUEBA=False)
    def test_modo_real_envia_al_responsable_con_copias(self):
        d = calcular_destinatarios('Real@X.cl', JEFES)
        self.assertEqual(d['para'], ['real@x.cl'])
        self.assertEqual(d['cc'], ['jefa@x.cl', 'jefe2@x.cl'])
        self.assertFalse(d['modo_prueba'])

    @override_settings(NOTIF_PLAN_MODO_PRUEBA=False, NOTIF_PLAN_CC_JEFATURAS=False)
    def test_interruptor_de_copias_apagado_no_copia_a_nadie_ni_siquiera_a_las_fijas(self):
        # NOTIF_PLAN_RESUMEN_CC solo recibe el correo resumen con el PDF, nunca cada aviso.
        d = calcular_destinatarios('real@x.cl', JEFES)
        self.assertEqual(d['cc'], [])

    @override_settings(NOTIF_PLAN_MODO_PRUEBA=False, NOTIF_PLAN_CC_JEFATURAS=False, NOTIF_PLAN_RESUMEN_CC=[])
    def test_sin_copias_configuradas_no_hay_cc(self):
        self.assertEqual(calcular_destinatarios('real@x.cl', JEFES)['cc'], [])

    @override_settings(NOTIF_PLAN_MODO_PRUEBA=False)
    def test_el_responsable_no_se_copia_a_si_mismo_ni_se_duplican_copias(self):
        d = calcular_destinatarios('jefa@x.cl', JEFES + [{'nombre': 'DUP', 'correo': 'JEFA@x.cl'}])
        self.assertNotIn('jefa@x.cl', d['cc'])
        self.assertEqual(len(d['cc']), len(set(d['cc'])))

    @override_settings(NOTIF_PLAN_MODO_PRUEBA=False)
    def test_modo_real_sin_correo_del_responsable_falla(self):
        with self.assertRaises(ValueError):
            calcular_destinatarios('', JEFES)
        with self.assertRaises(ValueError):
            calcular_destinatarios('no-es-correo', JEFES)

    @override_settings(NOTIF_PLAN_MODO_PRUEBA=False)
    def test_correos_invalidos_en_copias_se_descartan(self):
        d = calcular_destinatarios('real@x.cl', [{'nombre': 'X', 'correo': 'basura'}])
        self.assertNotIn('basura', d['cc'])

    def test_override_explicito_de_modo_prueba(self):
        self.assertTrue(calcular_destinatarios('real@x.cl', JEFES, modo_prueba=True)['modo_prueba'])


def _ficha(id_proyecto, nombre='Proyecto', estado='ATRASADO', fecha='2026-03-01', monto=1000, resp='Ana Perez'):
    return {'id_proyecto': id_proyecto, 'nombre_proyecto': nombre, 'depto_id': 1, 'depto_nombre': 'DPTO',
            'depto_texto': 'DPTO', 'nombre_responsable': resp, 'cargo_responsable': 'Encargada',
            'monto_total': monto, 'estado_ejecucion': estado, 'fecha_mas_proxima': fecha}


@override_settings(NOTIF_PLAN_DESTINO_PRUEBA=PRUEBA, NOTIF_PLAN_MODO_PRUEBA=True,
                   NOTIF_PLAN_URL_PANEL='https://panel.ssosorno.cl/panel_documental/login.php')
class ConstruirCorreoTest(TestCase):
    def setUp(self):
        PlanerPAC.objects.create(
            id_proyecto='P-1', nombre_proyecto='Proyecto uno', depto='DPTO UNO', sub='SUB UNO',
            unidad='UNIDAD UNO', unidad_compra='Bienes y Servicios', tipo_proyecto='Operacional',
            codigo_presupuestario='22.04', nombre_item='Silla', cantidad_items='3',
            monto_unitario_item='10000', monto_total_item='30000', fecha_inicio_compra='2026-05-01 00:00:00',
            nombre_responsable='Ana Perez', pac='2026')
        PlanerPAC.objects.create(
            id_proyecto='P-1', nombre_proyecto='Proyecto uno', nombre_item='Mesa', cantidad_items='1',
            monto_unitario_item='50000', monto_total_item='50000', fecha_inicio_compra='2026-02-01 00:00:00',
            pac='2026')

    def _correo(self, fichas, **kw):
        resol = {'Ana Perez': {'estado': 'EXACTO', 'correo': 'ana@x.cl', 'candidatos': []}}
        grupo = agrupar_por_responsable(fichas, resol)[0]
        dest = calcular_destinatarios('ana@x.cl', JEFES)
        detalle = cargar_detalle_pac([f['id_proyecto'] for f in fichas], 2026)
        return construir_correo(grupo, detalle, dest, 2026, JEFES, **kw)

    def test_detalle_trae_todos_los_items_ordenados_por_fecha(self):
        d = cargar_detalle_pac(['P-1'], 2026)['P-1']
        self.assertEqual([i['nombre'] for i in d['items']], ['Mesa', 'Silla'])    # 02/2026 antes que 05/2026
        self.assertEqual(d['items'][1]['total'], '$30.000')
        self.assertEqual(d['items'][1]['fecha'], '01/05/2026')
        self.assertEqual(d['codigo_presupuestario'], '22.04')

    def test_detalle_respeta_el_anho_del_pac(self):
        self.assertEqual(cargar_detalle_pac(['P-1'], 2025), {})

    def test_correo_incluye_los_datos_clave(self):
        c = self._correo([_ficha('P-1', 'Proyecto uno', monto=80000)])
        for esperado in ('P-1', 'Proyecto uno', '$80.000', 'Silla', 'Mesa', 'Bienes y Servicios',
                         'Atrasado', 'Ana Perez', 'panel.ssosorno.cl/panel_documental/login.php', 'cid:logo'):
            self.assertIn(esperado, c['html'], esperado)
            if esperado != 'cid:logo':
                self.assertIn(esperado, c['texto'], esperado)

    def test_asunto_y_banner_de_prueba(self):
        c = self._correo([_ficha('P-1')])
        self.assertTrue(c['asunto'].startswith('[PRUEBA] '))
        self.assertIn('MODO PRUEBA', c['html'])
        self.assertIn('ana@x.cl', c['html'])             # a quién habría ido en producción

    @override_settings(NOTIF_PLAN_MODO_PRUEBA=False)
    def test_sin_modo_prueba_no_hay_banner_ni_prefijo(self):
        resol = {'Ana Perez': {'estado': 'EXACTO', 'correo': 'ana@x.cl', 'candidatos': []}}
        grupo = agrupar_por_responsable([_ficha('P-1')], resol)[0]
        c = construir_correo(grupo, {}, calcular_destinatarios('ana@x.cl', JEFES), 2026, JEFES)
        self.assertNotIn('MODO PRUEBA', c['html'])
        self.assertFalse(c['asunto'].startswith('[PRUEBA]'))

    @override_settings(NOTIF_PLAN_MODO_PRUEBA=False, NOTIF_PLAN_CC_JEFATURAS=False, NOTIF_PLAN_RESUMEN_CC=['cristina@x.cl'])
    def test_no_menciona_jefaturas_que_no_van_en_copia(self):
        resol = {'Ana Perez': {'estado': 'EXACTO', 'correo': 'ana@x.cl', 'candidatos': []}}
        grupo = agrupar_por_responsable([_ficha('P-1')], resol)[0]
        c = construir_correo(grupo, {}, calcular_destinatarios('ana@x.cl', JEFES), 2026, JEFES)
        self.assertNotIn('JEFA UNO', c['html'])
        self.assertNotIn('Se envía copia', c['texto'])

    @override_settings(NOTIF_PLAN_MODO_PRUEBA=False, NOTIF_PLAN_CC_JEFATURAS=True, NOTIF_PLAN_RESUMEN_CC=[])
    def test_menciona_a_las_jefaturas_que_si_van_en_copia(self):
        resol = {'Ana Perez': {'estado': 'EXACTO', 'correo': 'ana@x.cl', 'candidatos': []}}
        grupo = agrupar_por_responsable([_ficha('P-1')], resol)[0]
        c = construir_correo(grupo, {}, calcular_destinatarios('ana@x.cl', JEFES), 2026, JEFES)
        self.assertIn('JEFA UNO', c['html'])
        self.assertIn('JEFE DOS', c['html'])

    def test_pluraliza_planes(self):
        uno = self._correo([_ficha('P-1')])
        dos = self._correo([_ficha('P-1'), _ficha('P-2')])
        self.assertIn('(1 plan)', uno['asunto'])
        self.assertIn('(2 planes)', dos['asunto'])

    def test_html_del_usuario_se_escapa(self):
        c = self._correo([_ficha('P-1', nombre='<script>alert(1)</script>', resp='Ana <b>Perez</b>')])
        self.assertNotIn('<script>alert(1)</script>', c['html'])
        self.assertIn('&lt;script&gt;', c['html'])

    def test_conteo_por_estado(self):
        c = self._correo([_ficha('P-1', estado='ATRASADO'), _ficha('P-2', estado='PENDIENTE'),
                          _ficha('P-3', estado='PENDIENTE'), _ficha('P-4', estado='SIN_FECHA', fecha=None)])
        self.assertIn('1 atrasado(s), 2 pendiente(s), 1 sin fecha', c['texto'])
        self.assertIn('Sin fecha', c['html'])

    def test_plan_sin_detalle_en_el_pac_no_rompe_el_correo(self):
        c = self._correo([_ficha('P-NO-EXISTE')])
        self.assertIn('P-NO-EXISTE', c['html'])


class AgruparTest(TestCase):
    def test_un_grupo_por_responsable_ordenado_por_fecha(self):
        fichas = [_ficha('A2', resp='Ana', fecha='2026-05-01'), _ficha('B1', resp='Beto'),
                  _ficha('A1', resp='Ana', fecha='2026-01-01'), _ficha('A3', resp='Ana', fecha=None)]
        grupos = agrupar_por_responsable(fichas, {})
        self.assertEqual([g['nombre'] for g in grupos], ['Ana', 'Beto'])
        self.assertEqual([f['id_proyecto'] for f in grupos[0]['fichas']], ['A1', 'A2', 'A3'])
        self.assertEqual(grupos[0]['monto_total'], 3000)
        self.assertEqual(grupos[0]['resolucion']['estado'], 'SIN_CORREO')


class PersonaConVariantesTest(TestCase):
    """Una persona escrita de varias formas en el PAC debe recibir UN solo correo."""

    def _res(self, correo):
        return {'estado': 'EXACTO', 'correo': correo, 'candidatos': []}

    def test_variantes_con_el_mismo_correo_se_unen(self):
        fichas = [_ficha('A1', resp='Yuvit Garcia-Chacur', fecha='2026-05-01'),
                  _ficha('A2', resp='Yuvit García-Chacur', fecha='2026-01-01'),
                  _ficha('A3', resp='Yuvit García-Chacur', fecha='2026-02-01')]
        res = {'Yuvit Garcia-Chacur': self._res('y@x.cl'), 'Yuvit García-Chacur': self._res('y@x.cl')}
        grupos = agrupar_por_responsable(fichas, res)
        self.assertEqual(len(grupos), 1)
        self.assertEqual([f['id_proyecto'] for f in grupos[0]['fichas']], ['A2', 'A3', 'A1'])
        self.assertEqual(grupos[0]['nombre'], 'Yuvit García-Chacur')      # la variante con más planes
        self.assertEqual(grupos[0]['monto_total'], 3000)

    def test_personas_distintas_no_se_unen(self):
        fichas = [_ficha('A1', resp='Ana'), _ficha('B1', resp='Beto')]
        res = {'Ana': self._res('ana@x.cl'), 'Beto': self._res('beto@x.cl')}
        self.assertEqual(len(agrupar_por_responsable(fichas, res)), 2)

    def test_sin_correo_resuelto_se_agrupa_por_nombre_normalizado(self):
        fichas = [_ficha('A1', resp='Zoe Núñez'), _ficha('A2', resp='zoe nunez'), _ficha('B1', resp='Otra')]
        grupos = agrupar_por_responsable(fichas, {})
        self.assertEqual(sorted(len(g['fichas']) for g in grupos), [1, 2])

    def test_un_correo_no_resuelto_no_une_a_dos_personas_distintas(self):
        fichas = [_ficha('A1', resp='Ana'), _ficha('B1', resp='Beto')]
        sugerido = {'estado': 'SUGERIDO', 'correo': '', 'candidatos': []}
        self.assertEqual(len(agrupar_por_responsable(fichas, {'Ana': sugerido, 'Beto': sugerido})), 2)
