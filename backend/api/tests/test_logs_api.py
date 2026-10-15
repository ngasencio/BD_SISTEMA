"""Administración › Logs: permisos, login, 403, errores no controlados y auditoría de rutas críticas."""
from unittest import mock

from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import OperationalError, transaction
from django.http import HttpResponse
from django.test import RequestFactory, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.middleware_logs import RegistroLogsMiddleware
from api.models import PerfilUsuario, RegistroLog
from api.services_logs import logs


def _cliente(user=None):
    cli = APIClient()
    cli.raise_request_exception = False   # un 500 llega como respuesta, no como excepción de la prueba
    if user is not None:
        cli.force_authenticate(user)
    return cli


def _usuario(nombre, rol, **kw):
    u = User.objects.create_user(nombre, f'{nombre}@x.cl', 'clave-correcta-1', **kw)
    PerfilUsuario.objects.create(user=u, role=rol)
    return u


class PermisosTest(TestCase):
    URLS = ['/api/logs/', '/api/logs/resumen/', '/api/logs/catalogo/', '/api/logs/salud/', '/api/logs/exportar/']

    def setUp(self):
        cache.clear()
        self.admin = _usuario('admin', 'admin')

    def test_sin_sesion_401(self):
        for url in self.URLS:
            with self.subTest(url=url):
                self.assertEqual(_cliente().get(url).status_code, 401)

    def test_solo_el_administrador_entra(self):
        for rol in ('viewer', 'abastecimiento', 'finanzas', 'comprador', 'jefatura', 'general', 'gestor_compras'):
            cli = _cliente(_usuario(f'u_{rol}', rol))
            for url in self.URLS:
                with self.subTest(rol=rol, url=url):
                    self.assertEqual(cli.get(url).status_code, 403)

    def test_administrador_200(self):
        cli = _cliente(self.admin)
        for url in self.URLS:
            with self.subTest(url=url):
                self.assertEqual(cli.get(url).status_code, 200)

    def test_es_solo_lectura(self):
        cli = _cliente(self.admin)
        self.assertEqual(cli.post('/api/logs/', {}, format='json').status_code, 405)
        r = RegistroLog.objects.create(category='AUTH', action='X')
        self.assertEqual(cli.delete(f'/api/logs/{r.id}/').status_code, 405)
        self.assertEqual(cli.patch(f'/api/logs/{r.id}/', {}, format='json').status_code, 405)


class ListaYDetalleTest(TestCase):
    def setUp(self):
        self.cli = _cliente(_usuario('admin', 'admin'))
        RegistroLog.objects.all().delete()
        for i in range(60):
            RegistroLog.objects.create(category='AUTH', level='INFO', action='LOGIN_SUCCESS',
                                       message=f'ingreso {i}', actor_username='ana')
        RegistroLog.objects.create(category='SYSTEM_ERROR', level='ERROR', action='DATABASE_ERROR',
                                   message='BD caída', metadata={'stack_trace': 'Traceback…', 'password': 'x'})

    def test_lista_paginada_sin_metadata(self):
        r = self.cli.get('/api/logs/')
        self.assertEqual(r.data['count'], 61)
        self.assertEqual(len(r.data['results']), 50)
        fila = r.data['results'][0]
        self.assertNotIn('metadata', fila)
        self.assertTrue(fila['timestamp'].endswith('Z'))     # UTC
        self.assertEqual(fila['accion_titulo'], 'Falla de base de datos')
        self.assertEqual(fila['categoria_etiqueta'], 'Errores y diagnóstico')

    def test_filtros_y_orden(self):
        r = self.cli.get('/api/logs/', {'category': 'SYSTEM_ERROR'})
        self.assertEqual(r.data['count'], 1)
        r = self.cli.get('/api/logs/', {'level': 'ERROR,CRITICAL', 'ordering': 'actor_username'})
        self.assertEqual(r.data['count'], 1)
        r = self.cli.get('/api/logs/', {'ordering': 'campo_inexistente; DROP TABLE'})
        self.assertEqual(r.status_code, 200)   # orden no permitido → el de siempre

    def test_detalle_trae_metadata_y_explicacion(self):
        error = RegistroLog.objects.get(action='DATABASE_ERROR')
        d = self.cli.get(f'/api/logs/{error.id}/').data
        self.assertIn('Traceback', d['metadata']['stack_trace'])
        self.assertIn('base de datos', d['explicacion'])
        self.assertIn('user_agent', d)

    def test_catalogo_explica_cada_accion(self):
        d = self.cli.get('/api/logs/catalogo/').data
        self.assertEqual({c['codigo'] for c in d['categorias']}, {'AUTH', 'AUDIT', 'SYSTEM_ERROR'})
        for a in d['acciones']:
            self.assertTrue(a['titulo'] and a['explicacion'], a['codigo'])

    def test_exportar_csv(self):
        r = self.cli.get('/api/logs/exportar/', {'category': 'SYSTEM_ERROR'})
        self.assertEqual(r.status_code, 200)
        texto = r.content.decode('utf-8')
        self.assertTrue(texto.startswith('﻿'))           # BOM: Excel abre bien las tildes
        self.assertIn('Qué ocurrió', texto)
        self.assertIn('BD caída', texto)
        self.assertNotIn('ingreso 1', texto)                  # respeta el filtro


class LoginTest(TestCase):
    def setUp(self):
        cache.clear()
        self.u = _usuario('ana', 'viewer')
        self.cli = _cliente()

    def _login(self, usuario, clave):
        return self.cli.post('/api/auth/login/', {'username': usuario, 'password': clave}, format='json')

    def test_login_correcto_se_registra(self):
        r = self._login('ana', 'clave-correcta-1')
        self.assertEqual(r.status_code, 200)
        self.assertIn('access', r.data)
        l = RegistroLog.objects.get(action='LOGIN_SUCCESS')
        self.assertEqual((l.category, l.level, l.actor_username, l.actor_role), ('AUTH', 'INFO', 'ana', 'viewer'))
        self.assertEqual(l.ip_address, '127.0.0.1')

    def test_clave_incorrecta_se_registra_y_la_respuesta_no_cambia(self):
        r = self._login('ana', 'mala')
        self.assertEqual(r.status_code, 401)
        self.assertNotIn('no existe', str(r.data).lower())     # no revela si el usuario existe
        l = RegistroLog.objects.get(action='LOGIN_FAILED')
        self.assertEqual((l.level, l.actor_username, l.status_code), ('WARN', 'ANONYMOUS', 401))
        self.assertEqual(l.metadata['motivo'], 'la contraseña es incorrecta')
        self.assertTrue(l.metadata['usuario_existe'])
        self.assertIn('«ana»', l.message)

    def test_usuario_inexistente_se_enmascara(self):
        # Alguien puede haber escrito su contraseña en el campo usuario: no debe quedar en el log.
        self._login('MiClaveSecreta2026', 'x')
        l = RegistroLog.objects.get(action='LOGIN_FAILED')
        self.assertNotIn('MiClaveSecreta2026', l.message)
        self.assertNotIn('MiClaveSecreta2026', str(l.metadata))
        self.assertFalse(l.metadata['usuario_existe'])

    def test_cuenta_desactivada(self):
        self.u.is_active = False
        self.u.save()
        self.assertEqual(self._login('ana', 'clave-correcta-1').status_code, 401)
        self.assertEqual(RegistroLog.objects.filter(action='LOGIN_INACTIVE_ACCOUNT').count(), 1)

    def test_ninguna_contrasena_queda_guardada(self):
        self._login('ana', 'clave-correcta-1')
        self._login('ana', 'intento-erroneo-77')
        for r in RegistroLog.objects.all():
            blob = f'{r.message} {r.metadata} {r.path} {r.user_agent}'
            self.assertNotIn('clave-correcta-1', blob)
            self.assertNotIn('intento-erroneo-77', blob)

    def test_fuerza_bruta_avisa_sin_bloquear(self):
        for _ in range(5):
            self._login('ana', 'mala')
        alerta = RegistroLog.objects.filter(action='BRUTE_FORCE_SUSPECTED')
        self.assertEqual(alerta.count(), 2)    # una por IP y otra por usuario al llegar a 5
        self.assertEqual(alerta.first().level, 'CRITICAL')
        # No hay bloqueo: la clave correcta sigue entrando.
        self.assertEqual(self._login('ana', 'clave-correcta-1').status_code, 200)

    def test_peticion_sin_credenciales_no_cuenta_como_intento(self):
        self.assertEqual(self.cli.post('/api/auth/login/', {}, format='json').status_code, 400)
        self.assertEqual(RegistroLog.objects.filter(category='AUTH').count(), 0)

    def test_si_el_log_falla_el_login_funciona(self):
        with mock.patch('api.urls.registrar_login_exitoso', side_effect=RuntimeError('boom')):
            self.assertEqual(self._login('ana', 'clave-correcta-1').status_code, 200)


class MiddlewareTest(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = _usuario('admin', 'admin')
        self.ana = _usuario('ana', 'gestor_compras')

    def test_403_queda_como_acceso_denegado(self):
        r = _cliente(self.ana).get('/api/usuarios/')
        self.assertEqual(r.status_code, 403)
        l = RegistroLog.objects.get(action='ACCESS_DENIED')
        self.assertEqual((l.category, l.level, l.actor_username, l.actor_role), ('AUTH', 'WARN', 'ana', 'gestor_compras'))
        self.assertEqual((l.http_method, l.path, l.status_code), ('GET', '/api/usuarios/', 403))
        self.assertIn('sin tener permiso', l.message)

    def test_401_no_genera_ruido(self):
        _cliente().get('/api/usuarios/')
        self.assertEqual(RegistroLog.objects.count(), 0)

    def test_lecturas_normales_no_se_registran(self):
        _cliente(self.admin).get('/api/usuarios/')
        self.assertEqual(RegistroLog.objects.count(), 0)

    def test_excepcion_no_controlada_queda_con_stack_trace(self):
        with mock.patch('api.views_logs.calcular_resumen', side_effect=RuntimeError('algo se rompió')):
            r = _cliente(self.admin).get('/api/logs/resumen/')
        self.assertEqual(r.status_code, 500)
        l = RegistroLog.objects.get(category='SYSTEM_ERROR')
        self.assertEqual((l.action, l.level, l.actor_username), ('UNHANDLED_EXCEPTION', 'ERROR', 'admin'))
        self.assertIn('RuntimeError', l.metadata['stack_trace'])
        self.assertIn('/api/logs/resumen/', l.message)
        self.assertEqual(RegistroLog.objects.filter(action='SERVER_ERROR_RESPONSE').count(), 0)   # sin duplicar

    def test_falla_de_base_de_datos_es_critica(self):
        with mock.patch('api.views_logs.calcular_resumen', side_effect=OperationalError('server has gone away')):
            _cliente(self.admin).get('/api/logs/resumen/')
        l = RegistroLog.objects.get(category='SYSTEM_ERROR')
        self.assertEqual((l.action, l.level), ('DATABASE_ERROR', 'CRITICAL'))

    def test_5xx_devuelto_a_mano_se_registra(self):
        mw = RegistroLogsMiddleware(lambda request: HttpResponse(status=502))
        resp = mw(RequestFactory().get('/api/algo/'))
        self.assertEqual(resp.status_code, 502)
        self.assertEqual(RegistroLog.objects.get().action, 'SERVER_ERROR_RESPONSE')

    def test_fuera_de_api_no_hace_nada(self):
        mw = RegistroLogsMiddleware(lambda request: HttpResponse(status=500))
        mw(RequestFactory().get('/gestion-sso/login'))
        self.assertEqual(RegistroLog.objects.count(), 0)

    def test_un_fallo_del_registro_no_rompe_la_respuesta(self):
        mw = RegistroLogsMiddleware(lambda request: HttpResponse(status=403))
        with mock.patch.object(logs, 'auth', side_effect=RuntimeError('boom')):
            self.assertEqual(mw(RequestFactory().get('/api/algo/')).status_code, 403)

    def test_ip_y_user_agent_quedan_en_el_registro(self):
        cli = _cliente(self.ana)
        cli.get('/api/usuarios/', HTTP_USER_AGENT='Mozilla/5.0 (Prueba)', REMOTE_ADDR='10.8.4.20')
        l = RegistroLog.objects.get(action='ACCESS_DENIED')
        self.assertEqual((l.ip_address, l.user_agent), ('10.8.4.20', 'Mozilla/5.0 (Prueba)'))


class AuditoriaDeRutasCriticasTest(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = _usuario('admin', 'admin')
        self.ana = _usuario('ana', 'viewer')
        self.cli = _cliente(self.admin)

    def _patch(self, url, datos):
        with self.captureOnCommitCallbacks(execute=True):
            return self.cli.patch(url, datos, format='json', REMOTE_ADDR='10.8.4.9')

    def test_cambio_de_rol_deja_antes_y_despues_con_ip(self):
        r = self._patch(f'/api/usuarios/{self.ana.id}/', {'perfil': {'role': 'finanzas'}})
        self.assertEqual(r.status_code, 200)
        l = RegistroLog.objects.get(action='ROLE_CHANGED')
        self.assertEqual((l.category, l.actor_username, l.ip_address), ('AUDIT', 'admin', '10.8.4.9'))
        self.assertEqual(l.metadata['cambios'], {'role': ['viewer', 'finanzas']})
        self.assertIn('admin cambió el rol de ana', l.message)
        # El detalle ya lo dio el servicio: la línea genérica no se repite.
        self.assertEqual(RegistroLog.objects.filter(action='ADMIN_ACTION').count(), 0)

    def test_desactivar_cuenta_queda_en_seguridad_y_en_actividad(self):
        self._patch(f'/api/usuarios/{self.ana.id}/', {'is_active': False})
        self.assertEqual(RegistroLog.objects.get(action='ACCOUNT_DEACTIVATED').category, 'AUTH')
        self.assertEqual(RegistroLog.objects.get(action='USER_UPDATED').category, 'AUDIT')

    def test_cambio_de_contrasena_no_guarda_la_clave(self):
        self._patch(f'/api/usuarios/{self.ana.id}/ficha/', {'cuenta': {'password': 'NuevaClave-9999'}})
        l = RegistroLog.objects.get(action='PASSWORD_CHANGED')
        self.assertEqual((l.category, l.actor_username), ('AUTH', 'admin'))
        for r in RegistroLog.objects.all():
            self.assertNotIn('NuevaClave-9999', f'{r.message} {r.metadata}')

    def test_alta_y_baja_de_usuario(self):
        with self.captureOnCommitCallbacks(execute=True):
            r = self.cli.post('/api/usuarios/', {'username': 'nuevo@x.cl', 'email': 'nuevo@x.cl',
                                                 'password': 'Clave-12345', 'perfil': {'role': 'viewer'}}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertIn('creó la cuenta de nuevo@x.cl', RegistroLog.objects.get(action='USER_CREATED').message)
        with self.captureOnCommitCallbacks(execute=True):
            self.cli.delete(f'/api/usuarios/{r.data["id"]}/')
        self.assertEqual(RegistroLog.objects.get(action='USER_DELETED').actor_username, 'admin')

    def test_operacion_rechazada_deja_la_linea_generica(self):
        r = self._patch(f'/api/usuarios/{self.admin.id}/', {'perfil': {'role': 'viewer'}})   # se quita su propio rol
        self.assertEqual(r.status_code, 400)
        l = RegistroLog.objects.get(action='ADMIN_ACTION')
        self.assertEqual((l.level, l.status_code, l.actor_username), ('WARN', 400, 'admin'))
        self.assertIn('rechazado por datos inválidos', l.message)
        self.assertEqual(RegistroLog.objects.filter(action='ROLE_CHANGED').count(), 0)

    def test_cambio_revertido_no_aparece_como_realizado(self):
        from api.services_admin_usuarios import auditar_baja_usuario
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            try:
                with transaction.atomic():
                    auditar_baja_usuario(self.admin, self.ana)
                    raise RuntimeError('la transacción se revierte')
            except RuntimeError:
                pass
        self.assertEqual(callbacks, [])
        self.assertEqual(RegistroLog.objects.filter(action='USER_DELETED').count(), 0)

    def test_previsualizar_no_se_audita(self):
        self.cli.post(f'/api/usuarios/{self.ana.id}/previsualizar-alcance/', {'departamentos': []}, format='json')
        self.assertEqual(RegistroLog.objects.filter(action='ADMIN_ACTION').count(), 0)

    def test_cambio_de_clave_propia(self):
        cli = _cliente(self.ana)
        r = cli.patch('/api/auth/me/', {'password_new': 'OtraClave-2026'}, format='json')
        self.assertEqual(r.status_code, 200)
        l = RegistroLog.objects.get(action='PASSWORD_CHANGED')
        self.assertEqual(l.actor_username, 'ana')
        self.assertNotIn('OtraClave-2026', f'{l.message} {l.metadata}')


class LoggingHandlerTest(TestCase):
    def test_logger_error_del_backend_llega_al_registro(self):
        import logging
        try:
            raise ValueError('clave=secretaza falló')
        except ValueError:
            logging.getLogger('api.views').exception('Error actualizando órdenes de compra')
        l = RegistroLog.objects.get(action='ETL_FAILED')
        self.assertEqual((l.category, l.level), ('SYSTEM_ERROR', 'ERROR'))
        self.assertIn('órdenes de compra', l.message)
        self.assertNotIn('secretaza', l.metadata['stack_trace'])

    def test_logger_error_generico_es_error_de_aplicacion(self):
        import logging
        logging.getLogger('api.services').error('ML clusters error: %s', 'sin datos')
        self.assertEqual(RegistroLog.objects.get().action, 'APP_ERROR')

    def test_warning_no_se_reenvia(self):
        import logging
        logging.getLogger('api.services').warning('solo una advertencia')
        self.assertEqual(RegistroLog.objects.count(), 0)


class ComandosTest(TestCase):
    def test_limpiar_logs_y_simulacion(self):
        from datetime import timedelta
        from django.core.management import call_command
        from io import StringIO
        RegistroLog.objects.create(category='AUTH', action='VIEJO', timestamp=timezone.now() - timedelta(days=300))
        RegistroLog.objects.create(category='AUTH', action='NUEVO')
        out = StringIO()
        call_command('limpiar_logs', '--dias', '180', '--simular', stdout=out)
        self.assertIn('1 registro', out.getvalue())
        self.assertEqual(RegistroLog.objects.count(), 2)
        call_command('limpiar_logs', '--dias', '180', stdout=out)
        self.assertEqual(list(RegistroLog.objects.values_list('action', flat=True)), ['NUEVO'])

    def test_chequear_salud_imprime_el_estado(self):
        from django.core.management import call_command
        from io import StringIO
        out = StringIO()
        try:
            call_command('chequear_salud', stdout=out)
        except SystemExit:
            pass   # crítico real del equipo de pruebas (disco): no es lo que se verifica aquí
        self.assertIn('Base de datos', out.getvalue())
