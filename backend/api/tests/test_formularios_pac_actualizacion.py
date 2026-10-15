"""Actualización de Formularios PAC desde el Panel: botón (tarea + candado + cancelar + diff) y
etapa de la actualización diaria. Nada toca el Panel real ni abre Chrome: el extractor
`page_data_panel_pac.ejecutar_proceso_completo` y `base._ejecutar_pac_una_vez` se reemplazan.
"""
import logging
import sys
import tempfile
from datetime import date
from pathlib import Path
from unittest import mock

from django.contrib.auth.models import User
from django.core import mail
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from api import services_actualizacion_diaria as act
from api import services_formularios_pac as pac
from api import services_sync_formularios as base
from api import views
from api.models import FormularioPAC, PerfilUsuario
from api.tests.test_sincronizar_formularios_fsc import CREDENCIALES

RAIZ_DATA = Path(__file__).resolve().parents[3] / 'api' / 'data'
for sub in ('data_panel', 'data_formularios_pac'):
    if str(RAIZ_DATA / sub) not in sys.path:
        sys.path.insert(0, str(RAIZ_DATA / sub))
import page_data_panel_pac as panel_pac  # noqa: E402

HOY = date(2026, 10, 14)
RESUMEN = {'nuevos': 3, 'actualizados': 10, 'eliminados': 1, 'lineas_carro': 40, 'total': 53}


class _Aislado:
    """Candado y logs a un directorio temporal (sin doble de la etapa PAC: se prueba la real)."""

    def setUp(self):
        super().setUp()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        for p in (
            mock.patch.object(base, 'DIR_LOGS', Path(self._tmp.name)),
            mock.patch.object(base, '_logger_archivo', return_value=logging.getLogger('test_pac')),
        ):
            p.start()
            self.addCleanup(p.stop)
        self.candado = Path(self._tmp.name) / 'sincronizacion_fsc.lock'


def _ficha(folio, estado='P', fecha=date(2026, 3, 1), anho=2026):
    return FormularioPAC.objects.create(
        folio=folio, anho=anho, estado=estado, accion_proyecto='Nuevo', monto=100,
        departamento='DEPARTAMENTO X', nombre_proyecto=f'Proyecto {folio}', fecha_ficha=fecha)


# ─── Diff ─────────────────────────────────────────────────────────────────────

class DiffTest(TestCase):
    def test_categorias(self):
        _ficha(1, 'P')                      # pasará a DC
        _ficha(2, 'FR')                     # pasará a R
        _ficha(3, 'P')                      # se queda detenida
        _ficha(4, 'DC')                     # desaparece del Panel
        _ficha(5, 'AA')                     # pasará a FA (cambia, sigue en trámite)
        antes = pac.snapshot_fichas_pac(HOY)
        FormularioPAC.objects.filter(folio=1).update(estado='DC')
        FormularioPAC.objects.filter(folio=2).update(estado='R')
        FormularioPAC.objects.filter(folio=4).delete()
        FormularioPAC.objects.filter(folio=5).update(estado='FA')
        _ficha(6, 'DC')                     # nueva y ya aprobada
        _ficha(7, 'P', fecha=date(2026, 10, 12))   # nueva, reciente: no está detenida
        despues = pac.snapshot_fichas_pac(HOY)

        d = pac.diff_fichas_pac(antes, despues)
        folios = lambda k: sorted(x['folio'] for x in d[k])  # noqa: E731
        self.assertEqual(folios('nuevas'), [6, 7])
        self.assertEqual(folios('cambiaron_estado'), [1, 2, 5])
        self.assertEqual({x['folio']: x['estado_anterior'] for x in d['cambiaron_estado']}, {1: 'P', 2: 'FR', 5: 'AA'})
        self.assertEqual(folios('aprobadas'), [1, 6])
        self.assertEqual(folios('rechazadas'), [2])
        self.assertEqual(folios('eliminadas'), [4])
        self.assertEqual(folios('detenidas'), [3, 5])    # en trámite y con más de 10 días
        self.assertEqual(d['nuevas_count'], 2)

    def test_sin_cambios(self):
        _ficha(1, 'DC')
        snap = pac.snapshot_fichas_pac(HOY)
        d = pac.diff_fichas_pac(snap, snap)
        self.assertEqual([d[f'{k}_count'] for k in ('nuevas', 'cambiaron_estado', 'aprobadas', 'rechazadas', 'eliminadas')],
                         [0, 0, 0, 0, 0])

    def test_recorta_la_lista_pero_cuenta_todo(self):
        for i in range(1, 8):
            _ficha(i, 'P')
        d = pac.diff_fichas_pac({}, pac.snapshot_fichas_pac(HOY), limite=3)
        self.assertEqual((len(d['nuevas']), d['nuevas_count']), (3, 7))


# ─── Tarea del botón ──────────────────────────────────────────────────────────

class TareaTest(_Aislado, TestCase):
    def _tarea(self):
        views._tareas_actualizacion_formularios_pac['t1'] = {
            'status': 'iniciado', 'paso': 0, 'paso_desc': '', 'error': None,
            'logs_recientes': [], 'total_cargados': 0, 'progreso_pct': 0,
        }
        self.addCleanup(views._tareas_actualizacion_formularios_pac.clear)
        return views._tareas_actualizacion_formularios_pac['t1']

    def test_exito_calcula_diff_y_completa(self):
        _ficha(1, 'P')
        tarea = self._tarea()

        def falso(rut, dv, clave, progress_callback=None):
            progress_callback(log='Descargando...', progreso_pct=30)
            FormularioPAC.objects.filter(folio=1).update(estado='DC')   # lo que haría la carga
            _ficha(2, 'P')
            return RESUMEN

        with mock.patch.object(panel_pac, 'ejecutar_proceso_completo', side_effect=falso) as ejecutar:
            views._ejecutar_actualizacion_formularios_pac('t1', '11111111', '1', 'clave')
        ejecutar.assert_called_once()
        self.assertEqual(ejecutar.call_args.args[:3], ('11111111', '1', 'clave'))
        self.assertEqual(tarea['status'], 'completado')
        self.assertEqual(tarea['progreso_pct'], 100)
        self.assertEqual(tarea['total_cargados'], 53)
        self.assertIn('3 fichas nuevas', tarea['paso_desc'])
        self.assertIn('Descargando...', tarea['logs_recientes'])
        self.assertEqual(tarea['diff']['aprobadas_count'], 1)
        self.assertEqual(tarea['diff']['nuevas_count'], 1)

    def test_error_queda_registrado(self):
        tarea = self._tarea()
        with mock.patch.object(panel_pac, 'ejecutar_proceso_completo', side_effect=RuntimeError('login falló')):
            views._ejecutar_actualizacion_formularios_pac('t1', 'r', 'd', 'c')
        self.assertEqual(tarea['status'], 'error')
        self.assertIn('login falló', tarea['error'])

    def test_cancelar_corta_en_el_siguiente_aviso_y_no_se_pisa_a_completado(self):
        tarea = self._tarea()

        def falso(rut, dv, clave, progress_callback=None):
            progress_callback(log='paso 1')
            tarea['status'] = 'cancelado'          # el usuario aprieta «Cancelar» durante la descarga
            progress_callback(log='paso 2')         # → debe cortar acá
            raise AssertionError('no debió seguir después de cancelar')

        with mock.patch.object(panel_pac, 'ejecutar_proceso_completo', side_effect=falso):
            views._ejecutar_actualizacion_formularios_pac('t1', 'r', 'd', 'c')
        self.assertEqual(tarea['status'], 'cancelado')
        self.assertNotIn('diff', tarea)

    def test_cancelar_despues_de_terminar_la_carga_no_declara_exito(self):
        tarea = self._tarea()

        def falso(rut, dv, clave, progress_callback=None):
            tarea['status'] = 'cancelado'
            return RESUMEN                           # terminó justo cuando cancelaron

        with mock.patch.object(panel_pac, 'ejecutar_proceso_completo', side_effect=falso):
            views._ejecutar_actualizacion_formularios_pac('t1', 'r', 'd', 'c')
        self.assertEqual(tarea['status'], 'cancelado')


# ─── Endpoints del botón ──────────────────────────────────────────────────────

def _cliente(role, username=None):
    u = User.objects.create_user(username=username or f'u_{role}', password='x')
    PerfilUsuario.objects.create(user=u, role=role)
    c = APIClient()
    c.force_authenticate(u)
    return c


class EndpointsTest(_Aislado, TestCase):
    def setUp(self):
        super().setUp()
        self.addCleanup(views._tareas_actualizacion_formularios_pac.clear)
        self.cli = _cliente('abastecimiento')
        self.cuerpo = {'rut': '11111111', 'dv': '1', 'clave': 'secreta'}

    def test_iniciar_registra_la_tarea_y_lanza_el_hilo(self):
        with mock.patch.object(views, '_lanzar_hilo_sync') as lanzar:
            r = self.cli.post('/api/formularios-pac/actualizar/', self.cuerpo, format='json')
        self.assertEqual(r.status_code, 200)
        task_id = r.data['task_id']
        lanzar.assert_called_once()
        self.assertEqual(lanzar.call_args.args[0], views._ejecutar_actualizacion_formularios_pac)
        self.assertEqual(lanzar.call_args.args[1], (task_id, '11111111', '1', 'secreta'))
        self.assertTrue(self.candado.exists())   # tomó el candado compartido
        base.liberar_candado()

        e = self.cli.get(f'/api/formularios-pac/actualizar-estado/{task_id}/')
        self.assertEqual(e.status_code, 200)
        self.assertEqual(e.data['status'], 'iniciado')
        self.assertNotIn('clave', str(e.data))

    def test_faltan_credenciales(self):
        for cuerpo in ({}, {'rut': '1', 'dv': '1'}, {'rut': '', 'dv': '1', 'clave': 'x'}):
            r = self.cli.post('/api/formularios-pac/actualizar/', cuerpo, format='json')
            self.assertEqual(r.status_code, 400, cuerpo)
        self.assertFalse(self.candado.exists())

    def test_409_si_hay_otra_actualizacion(self):
        self.assertTrue(base.adquirir_candado('automatico'))
        with mock.patch('api.views.threading.Thread') as hilo:
            r = self.cli.post('/api/formularios-pac/actualizar/', self.cuerpo, format='json')
        self.assertEqual(r.status_code, 409)
        self.assertIn('en curso', r.json()['error'])
        hilo.assert_not_called()

    def test_409_si_ya_hay_una_tarea_pac_en_curso(self):
        views._tareas_actualizacion_formularios_pac['x'] = {'status': 'en_proceso'}
        r = self.cli.post('/api/formularios-pac/actualizar/', self.cuerpo, format='json')
        self.assertEqual(r.status_code, 409)

    def test_estado_y_cancelar_de_tarea_inexistente(self):
        self.assertEqual(self.cli.get('/api/formularios-pac/actualizar-estado/nada/').status_code, 404)
        self.assertEqual(self.cli.post('/api/formularios-pac/actualizar-cancelar/nada/').status_code, 404)

    def test_cancelar_tarea_en_curso(self):
        views._tareas_actualizacion_formularios_pac['t9'] = {
            'status': 'en_proceso', 'paso': 1, 'paso_desc': '', 'error': None}
        r = self.cli.post('/api/formularios-pac/actualizar-cancelar/t9/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(views._tareas_actualizacion_formularios_pac['t9']['status'], 'cancelado')
        # ya no está en curso
        self.assertEqual(self.cli.post('/api/formularios-pac/actualizar-cancelar/t9/').status_code, 409)

    def test_solo_roles_de_abastecimiento(self):
        for rol, esperado in (('admin', 200), ('comprador', 200), ('gestor_compras', 403), ('viewer', 403),
                              ('jefatura', 403), ('finanzas', 403)):
            c = _cliente(rol, f'u_{rol}_act')
            with mock.patch.object(views, '_lanzar_hilo_sync'):
                r = c.post('/api/formularios-pac/actualizar/', self.cuerpo, format='json')
            self.assertEqual(r.status_code, esperado, rol)
            base.liberar_candado()
            views._tareas_actualizacion_formularios_pac.clear()


# ─── Etapa de la actualización diaria ─────────────────────────────────────────

@override_settings(**CREDENCIALES)
class EtapaDiariaTest(_Aislado, SimpleTestCase):
    def _correr(self, **kw):
        kw.setdefault('hoy', HOY)
        kw.setdefault('espera_min', 0)
        return act.ejecutar_actualizacion_completa(**kw)

    def test_la_etapa_esta_en_la_tanda_diaria_justo_despues_de_fsc(self):
        self.assertEqual(act.ETAPAS.index('formularios_pac'), act.ETAPAS.index('formularios') + 1)
        self.assertIn('formularios_pac', act.ETAPAS_BASE)
        self.assertIn('formularios_pac', act.ETIQUETAS)

    def test_etapa_usa_las_credenciales_y_resume(self):
        with mock.patch.object(base, '_ejecutar_pac_una_vez', return_value=RESUMEN) as una:
            estado, detalle, extra = act._etapa_formularios_pac(mock.Mock())
        self.assertEqual(una.call_args.args[:3], ('11111111', '1', 'clave-secreta'))
        self.assertEqual(estado, 'OK')
        self.assertIn('3 fichas nuevas', detalle)
        self.assertIn('40 líneas de carro', detalle)
        self.assertIn(('Líneas de carro cargadas', 40), extra['resumen'])

    def test_sin_credenciales_no_reintenta(self):
        with override_settings(PANEL_SSO_PASSWORD=''), \
                mock.patch.object(base, '_ejecutar_pac_una_vez') as una, \
                mock.patch.object(act, '_etapa_formularios', return_value=('OK', '')):
            with self.assertRaises(act.ActualizacionFallida) as ctx:
                self._correr(etapas=('formularios', 'formularios_pac'), reintentos=3)
        una.assert_not_called()
        self.assertEqual({r.etapa: r.estado for r in ctx.exception.resultados},
                         {'formularios': 'OK', 'formularios_pac': 'ERROR'})

    def test_si_pac_falla_las_demas_siguen_y_sale_un_correo(self):
        def mp(etapa, desde, hasta, registro):
            return 'OK', 'listo'

        with mock.patch.object(act, '_etapa_formularios', return_value=('OK', 'fsc')), \
                mock.patch.object(base, '_ejecutar_pac_una_vez', side_effect=RuntimeError('Panel caído')), \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=mp) as llamadas:
            with self.assertRaises(act.ActualizacionFallida) as ctx:
                self._correr(reintentos=1)
        estados = {r.etapa: r.estado for r in ctx.exception.resultados}
        self.assertEqual(estados, {'formularios': 'OK', 'formularios_pac': 'ERROR',
                                   'ordenes_compra': 'OK', 'licitaciones': 'OK'})
        self.assertEqual([c.args[0] for c in llamadas.call_args_list], ['ordenes_compra', 'licitaciones'])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('PAC ERROR', mail.outbox[0].subject)
        self.assertFalse(self.candado.exists())

    def test_solo_pac_por_comando(self):
        from django.core.management import call_command
        with mock.patch.object(base, '_ejecutar_pac_una_vez', return_value=RESUMEN) as una, \
                mock.patch.object(act, '_etapa_formularios') as fsc, \
                mock.patch.object(act, '_etapa_mercado_publico') as mp:
            call_command('actualizacion_completa', '--solo', 'formularios_pac', '--sin-correo')
        una.assert_called_once()
        fsc.assert_not_called()
        mp.assert_not_called()
