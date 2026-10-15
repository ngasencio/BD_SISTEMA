"""Sincronización automática de Formularios FSC (comando `sincronizar_formularios_fsc`).

Nunca toca el Panel real ni envía correo real: `_ejecutar_una_vez` se reemplaza por un
doble y el correo va a la bandeja en memoria (settings_test). Los archivos de candado y de
log se escriben en un directorio temporal.
"""
import logging
import os
import tempfile
import time
from pathlib import Path
from unittest import mock

from django.contrib.auth.models import User
from django.core import mail
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from api import services_sync_formularios as svc
from api.models import PerfilUsuario

RESUMEN = {'nuevos': 3, 'actualizados': 10, 'eliminados': 1, 'total': 13}
CREDENCIALES = dict(PANEL_SSO_RUT='11111111', PANEL_SSO_DV='1', PANEL_SSO_PASSWORD='clave-secreta',
                    SYNC_FSC_AVISO_A=['aviso@test.local'])


class _EntornoAislado:
    """Redirige logs/candado a un directorio temporal y silencia el logger de archivo."""

    def setUp(self):
        super().setUp()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        from api import services_actualizacion_diaria as act
        parches = [
            mock.patch.object(svc, 'DIR_LOGS', Path(self._tmp.name)),
            mock.patch.object(svc, '_logger_archivo', return_value=logging.getLogger('test_sync_fsc')),
            # Doble por defecto de la etapa «Formularios PAC»: las pruebas de la actualización diaria
            # que no hablan de PAC no deben intentar abrir un Chrome real contra el Panel.
            mock.patch.object(act, '_etapa_formularios_pac', return_value=('OK', 'pac (doble)')),
            # Sin fotos antes/después de las tablas: estas pruebas no tienen base de datos.
            mock.patch.dict(act.informe.INSTANTANEAS, {}, clear=True),
        ]
        for p in parches:
            p.start()
            self.addCleanup(p.stop)
        self.candado = Path(self._tmp.name) / 'sincronizacion_fsc.lock'


class CandadoTest(_EntornoAislado, SimpleTestCase):
    def test_segundo_adquirir_falla_hasta_liberar(self):
        self.assertTrue(svc.adquirir_candado('automatico'))
        self.assertFalse(svc.adquirir_candado('boton'))
        svc.liberar_candado()
        self.assertFalse(self.candado.exists())
        self.assertTrue(svc.adquirir_candado('boton'))

    def test_candado_vencido_se_retoma(self):
        self.assertTrue(svc.adquirir_candado('automatico'))
        viejo = time.time() - (svc.CANDADO_VENCE_MIN + 5) * 60
        os.utime(self.candado, (viejo, viejo))
        self.assertTrue(svc.adquirir_candado('boton'))

    def test_no_libera_el_candado_de_otro_proceso(self):
        self.candado.write_text('999999\nautomatico\n2026-10-13T08:00:00\n', encoding='utf-8')
        svc.liberar_candado()
        self.assertTrue(self.candado.exists())


@override_settings(**CREDENCIALES)
class ComandoTest(_EntornoAislado, SimpleTestCase):
    def _correr(self, *args):
        call_command('sincronizar_formularios_fsc', *args, '--espera-min', '0')

    def test_exito_no_manda_correo_y_libera_candado(self):
        with mock.patch.object(svc, '_ejecutar_una_vez', return_value=RESUMEN) as sync:
            self._correr()
        self.assertEqual(sync.call_count, 1)
        self.assertEqual(mail.outbox, [])
        self.assertFalse(self.candado.exists())

    def test_reintenta_y_termina_bien(self):
        with mock.patch.object(svc, '_ejecutar_una_vez', side_effect=[RuntimeError('sin red'), RESUMEN]) as sync:
            self._correr('--reintentos', '3')
        self.assertEqual(sync.call_count, 2)
        self.assertEqual(mail.outbox, [])

    def test_falla_tras_reintentos_avisa_por_correo_y_sale_con_error(self):
        err = RuntimeError('El login al Panel no tuvo éxito (clave-secreta)')
        with mock.patch.object(svc, '_ejecutar_una_vez', side_effect=err) as sync:
            with self.assertRaises(CommandError):
                self._correr('--reintentos', '2')
        self.assertEqual(sync.call_count, 2)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['aviso@test.local'])
        self.assertIn('Falló la sincronización', mail.outbox[0].subject)
        # La contraseña jamás viaja en el correo.
        self.assertNotIn('clave-secreta', mail.outbox[0].body)
        self.assertFalse(self.candado.exists())

    def test_sin_correo_respeta_la_bandera(self):
        with mock.patch.object(svc, '_ejecutar_una_vez', side_effect=RuntimeError('x')):
            with self.assertRaises(CommandError):
                self._correr('--reintentos', '1', '--sin-correo')
        self.assertEqual(mail.outbox, [])

    def test_con_candado_tomado_se_omite_sin_ejecutar(self):
        self.assertTrue(svc.adquirir_candado('boton'))
        with mock.patch.object(svc, '_ejecutar_una_vez') as sync:
            self._correr()
        sync.assert_not_called()
        self.assertTrue(self.candado.exists())  # el candado ajeno no se toca

    def test_error_de_importacion_no_se_reintenta(self):
        with mock.patch.object(svc, '_ejecutar_una_vez', side_effect=ImportError('no selenium')) as sync:
            with self.assertRaises(CommandError):
                self._correr('--reintentos', '3')
        self.assertEqual(sync.call_count, 1)


class SinCredencialesTest(_EntornoAislado, SimpleTestCase):
    @override_settings(PANEL_SSO_RUT='', PANEL_SSO_DV='', PANEL_SSO_PASSWORD='', SYNC_FSC_AVISO_A=['aviso@test.local'])
    def test_sin_credenciales_falla_sin_reintentar_y_avisa(self):
        with mock.patch.object(svc, '_ejecutar_una_vez') as sync:
            with self.assertRaises(CommandError):
                call_command('sincronizar_formularios_fsc', '--espera-min', '0')
        sync.assert_not_called()
        self.assertEqual(len(mail.outbox), 1)


class BotonRespetaCandadoTest(_EntornoAislado, TestCase):
    def test_boton_responde_409_si_corre_la_sincronizacion_automatica(self):
        user = User.objects.create_user('abast@x.cl', password='x')
        PerfilUsuario.objects.create(user=user, role='abastecimiento')
        cli = APIClient()
        cli.force_authenticate(user)
        self.assertTrue(svc.adquirir_candado('automatico'))

        with mock.patch('api.views.threading.Thread') as hilo:
            resp = cli.post('/api/formularios/actualizar/', {'rut': '1', 'dv': '9', 'clave': 'x'}, format='json')

        self.assertEqual(resp.status_code, 409)
        self.assertIn('en curso', resp.json()['error'])
        hilo.assert_not_called()
