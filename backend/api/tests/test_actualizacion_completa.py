"""Actualización diaria completa (comando `actualizacion_completa`): FSC + OC + Licitaciones.

Nada toca el Panel ni Mercado Público reales: las etapas se reemplazan por dobles (o el
módulo ETL por un módulo falso). Candado y logs van a un directorio temporal; el correo, a la
bandeja en memoria (settings_test).
"""
import os
import time
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth.models import User
from django.core import mail
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from api import services_actualizacion_diaria as act
from api import services_sync_formularios as base
from api.models import PerfilUsuario
from api.tests.test_sincronizar_formularios_fsc import CREDENCIALES, _EntornoAislado

HOY = date(2026, 10, 13)


def _etapa_mp_ok(etapa, desde, hasta, registro):
    return 'OK', f'{etapa} listo'


@override_settings(**CREDENCIALES)
class OrquestacionTest(_EntornoAislado, SimpleTestCase):
    def _correr(self, **kw):
        kw.setdefault('hoy', HOY)
        kw.setdefault('espera_min', 0)
        return act.ejecutar_actualizacion_completa(**kw)

    def test_ventana_de_10_dias_incluye_hoy_y_orden_fsc_oc_licitaciones(self):
        with mock.patch.object(act, '_etapa_formularios', return_value=('OK', 'fsc')), \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=_etapa_mp_ok) as mp:
            resultados = self._correr()
        self.assertEqual([r.etapa for r in resultados], ['formularios', 'ordenes_compra', 'licitaciones'])
        etapa, desde, hasta = mp.call_args_list[0].args[:3]
        self.assertEqual((etapa, desde, hasta), ('ordenes_compra', date(2026, 10, 4), HOY))
        self.assertEqual((hasta - desde).days + 1, 10)
        self.assertEqual(mail.outbox, [])
        self.assertFalse(self.candado.exists())

    def test_dias_configurable(self):
        with mock.patch.object(act, '_etapa_formularios', return_value=('OK', '')), \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=_etapa_mp_ok) as mp:
            self._correr(dias=3)
        self.assertEqual(mp.call_args_list[0].args[1], date(2026, 10, 11))

    def test_una_etapa_falla_las_demas_corren_y_sale_un_solo_correo(self):
        def mp(etapa, desde, hasta, registro):
            if etapa == 'ordenes_compra':
                raise act.MercadoPublicoSinRespuesta('API caída (clave-secreta)')
            return 'OK', 'listo'

        with mock.patch.object(act, '_etapa_formularios', return_value=('OK', 'fsc')), \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=mp) as llamadas:
            with self.assertRaises(act.ActualizacionFallida) as ctx:
                self._correr(reintentos=2)

        estados = {r.etapa: r.estado for r in ctx.exception.resultados}
        self.assertEqual(estados, {'formularios': 'OK', 'ordenes_compra': 'ERROR', 'licitaciones': 'OK'})
        # OC reintentó 2 veces; licitaciones corrió igual después del fallo de OC.
        self.assertEqual([c.args[0] for c in llamadas.call_args_list],
                         ['ordenes_compra', 'ordenes_compra', 'licitaciones'])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Órdenes de Compra', mail.outbox[0].subject)
        self.assertNotIn('clave-secreta', mail.outbox[0].body)
        self.assertFalse(self.candado.exists())

    def test_reintento_exitoso_no_manda_correo(self):
        efectos = [RuntimeError('sin red'), ('OK', 'listo')]
        with mock.patch.object(act, '_etapa_formularios', side_effect=efectos) as fsc, \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=_etapa_mp_ok):
            resultados = self._correr(reintentos=3)
        self.assertEqual(fsc.call_count, 2)
        self.assertTrue(all(r.estado == 'OK' for r in resultados))
        self.assertEqual(mail.outbox, [])

    def test_sin_credenciales_no_reintenta(self):
        with override_settings(PANEL_SSO_PASSWORD=''), \
                mock.patch.object(act.base, '_ejecutar_una_vez') as fsc, \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=_etapa_mp_ok):
            with self.assertRaises(act.ActualizacionFallida):
                self._correr(reintentos=3)
        fsc.assert_not_called()

    def test_con_candado_ajeno_omite_sin_ejecutar(self):
        self.assertTrue(base.adquirir_candado('boton'))
        with mock.patch.object(act, '_etapa_formularios') as fsc, \
                mock.patch.object(act, '_etapa_mercado_publico') as mp:
            self.assertIsNone(self._correr(esperar_candado_min=0))
        fsc.assert_not_called()
        mp.assert_not_called()
        self.assertTrue(self.candado.exists())  # el candado ajeno no se toca

    def test_sin_correo(self):
        with mock.patch.object(act, '_etapa_formularios', side_effect=RuntimeError('x')), \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=_etapa_mp_ok):
            with self.assertRaises(act.ActualizacionFallida):
                self._correr(reintentos=1, avisar_por_correo=False)
        self.assertEqual(mail.outbox, [])

    def test_comando_solo_filtra_etapas_y_falla_con_codigo_de_error(self):
        with mock.patch.object(act, '_etapa_formularios') as fsc, \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=MercadoError()) as mp:
            with self.assertRaises(CommandError):
                call_command('actualizacion_completa', '--solo', 'licitaciones',
                             '--reintentos', '1', '--espera-min', '0')
        fsc.assert_not_called()
        self.assertEqual([c.args[0] for c in mp.call_args_list], ['licitaciones'])


def MercadoError():
    return act.MercadoPublicoSinRespuesta('sin internet')


class CapturaStdoutTest(_EntornoAislado, SimpleTestCase):
    def test_detecta_como_termino_el_etl(self):
        cap = act._CapturaStdout(act.base._Registro(None, 'x'), '[OC]')
        cap.write('>>> EXTRACCIÓN SSO: 10/10/2026\n    Procesadas 10/50 OCs\r    Procesadas 50/50 OCs\r')
        cap.write('\n⚠️  API sin respuesta tras 5 intentos: timeout\n')
        self.assertFalse(cap.refresh_completo)
        self.assertEqual(cap.consultas_sin_respuesta, 1)
        cap.write('\n✨ PROCESO DE REFRESH COMPLETADO EXITOSAMENTE.\n')
        self.assertTrue(cap.refresh_completo)

    def test_marca_sin_novedades(self):
        cap = act._CapturaStdout(act.base._Registro(None, 'x'), '[LI]')
        cap.write('\n⚠️ No se encontraron nuevos datos en el rango seleccionado. Los Maestros no se tocarán.\n')
        self.assertTrue(cap.sin_novedades)
        self.assertFalse(cap.refresh_completo)


class EtapaMercadoPublicoTest(_EntornoAislado, TestCase):
    def _modulo(self, salida_refresh, guardar=None):
        tmp = Path(self._tmp.name)
        (tmp / 'OC_Maestro_Resumen.csv').write_text('CodigoOC;Nombre\nA;x\nB;y\n', encoding='utf-8-sig')
        (tmp / 'OC_Maestro_Detalles.csv').write_text('CodigoOC;Linea\nA;1\n', encoding='utf-8-sig')

        def refresh(desde, hasta, progress_callback=None):
            print(salida_refresh)

        self.guardar = guardar or mock.Mock(return_value=(2, 1))
        return SimpleNamespace(CARPETA_MAESTROS=tmp, refresh_base_datos=refresh, guardar_en_django=self.guardar)

    def _correr(self, modulo):
        registro = act.base._Registro(None, 'x')
        with mock.patch.object(act, '_importar_etl', return_value=modulo), \
                mock.patch.object(act, '_enlazar_fsc_oc', return_value='') as enlace:
            self.enlace = enlace
            return act._etapa_mercado_publico('ordenes_compra', date(2026, 10, 4), HOY, registro)

    def test_integra_y_carga_los_maestros(self):
        estado, detalle = self._correr(self._modulo('✨ PROCESO DE REFRESH COMPLETADO EXITOSAMENTE.'))
        self.assertEqual(estado, 'OK')
        self.assertIn('2 registros y 1 detalles', detalle)
        datos_res, datos_det = self.guardar.call_args.args
        self.assertEqual([r['CodigoOC'] for r in datos_res], ['A', 'B'])
        self.assertEqual(len(datos_det), 1)
        self.enlace.assert_called_once()

    def test_sin_novedades_no_toca_la_bd(self):
        estado, detalle = self._correr(self._modulo('⚠️ No se encontraron nuevos datos en el rango seleccionado.'))
        self.assertEqual(estado, 'SIN_NOVEDADES')
        self.guardar.assert_not_called()
        self.enlace.assert_not_called()

    def test_api_sin_respuesta_es_fallo_y_no_toca_la_bd(self):
        salida = '⚠️  API sin respuesta tras 5 intentos: timeout\n⚠️ No se encontraron nuevos datos en el rango'
        with self.assertRaises(act.MercadoPublicoSinRespuesta):
            self._correr(self._modulo(salida))
        self.guardar.assert_not_called()

    def test_carga_atomica_un_error_revierte_el_vaciado(self):
        User.objects.create_user('quedo@x.cl', password='x')

        def guardar_que_falla(res, det):
            User.objects.all().delete()  # el DELETE total que hacen los ETL...
            raise RuntimeError('bulk_create falló')  # ...y luego se cae a medias

        with self.assertRaises(RuntimeError):
            self._correr(self._modulo('✨ PROCESO DE REFRESH COMPLETADO EXITOSAMENTE.', guardar_que_falla))
        self.assertEqual(User.objects.filter(username='quedo@x.cl').count(), 1)


class LatidoCandadoTest(_EntornoAislado, SimpleTestCase):
    def test_renovar_candado_evita_que_se_dé_por_vencido(self):
        self.assertTrue(base.adquirir_candado('automatico'))
        viejo = time.time() - (base.CANDADO_VENCE_MIN + 5) * 60
        os.utime(self.candado, (viejo, viejo))
        base.renovar_candado()
        self.assertFalse(base.adquirir_candado('boton'))  # sigue vigente

    def test_renovar_no_toca_candado_ajeno(self):
        self.candado.write_text('999999\nautomatico\n2026-10-13T08:00:00\n', encoding='utf-8')
        viejo = time.time() - 3600
        os.utime(self.candado, (viejo, viejo))
        base.renovar_candado()
        self.assertAlmostEqual(self.candado.stat().st_mtime, viejo, delta=1)


class BotonesOCyLicitacionesRespetanCandadoTest(_EntornoAislado, TestCase):
    def _cliente(self):
        user = User.objects.create_user('abast@x.cl', password='x')
        PerfilUsuario.objects.create(user=user, role='abastecimiento')
        cli = APIClient()
        cli.force_authenticate(user)
        return cli

    def test_oc_y_licitaciones_responden_409_si_hay_otra_actualizacion(self):
        cli = self._cliente()
        self.assertTrue(base.adquirir_candado('automatico'))
        cuerpo = {'fecha_desde': '2026-10-01', 'fecha_hasta': '2026-10-13'}
        for url in ('/api/ordenes-compra/actualizar/', '/api/licitaciones/actualizar/'):
            with self.subTest(url=url), mock.patch('api.views.threading.Thread') as hilo:
                resp = cli.post(url, cuerpo, format='json')
                self.assertEqual(resp.status_code, 409)
                self.assertIn('en curso', resp.json()['error'])
                hilo.assert_not_called()
