"""Servicio central de logs: formato estándar, saneado de secretos, robustez y consultas."""
from datetime import datetime, timedelta
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.utils import timezone

from api import services_logs as sl
from api.models import PerfilUsuario, RegistroLog


class EscrituraYFormatoTest(TestCase):
    def test_log_auth_con_formato_estandar(self):
        sl.logs.auth('LOGIN_FAILED', 'Intento fallido', nivel='WARN', status_code=401, metadata={'x': 1})
        r = RegistroLog.objects.get()
        self.assertEqual((r.category, r.level, r.action), ('AUTH', 'WARN', 'LOGIN_FAILED'))
        self.assertEqual(r.actor_username, 'ANONYMOUS')      # sin sesión → ANONYMOUS
        self.assertIsNone(r.actor_id)
        self.assertEqual(r.metadata, {'x': 1})
        self.assertAlmostEqual(r.timestamp, timezone.now(), delta=timedelta(seconds=5))
        self.assertEqual(r.status_code, 401)

    def test_actor_autenticado_trae_id_usuario_y_rol(self):
        u = User.objects.create_user('ana@x.cl', password='x')
        PerfilUsuario.objects.create(user=u, role='jefatura')
        sl.logs.audit('USER_UPDATED', 'cambio', actor=u)
        r = RegistroLog.objects.get()
        self.assertEqual((r.actor_id, r.actor_username, r.actor_role, r.category), (u.id, 'ana@x.cl', 'jefatura', 'AUDIT'))

    def test_error_guarda_stack_trace_y_tipo(self):
        try:
            1 / 0
        except ZeroDivisionError as exc:
            sl.logs.error('UNHANDLED_EXCEPTION', 'Falló', exc=exc)
        r = RegistroLog.objects.get()
        self.assertEqual(r.category, 'SYSTEM_ERROR')
        self.assertEqual(r.metadata['tipo_excepcion'], 'ZeroDivisionError')
        self.assertIn('Traceback', r.metadata['stack_trace'])

    def test_mensaje_vacio_usa_el_titulo_del_catalogo(self):
        sl.logs.auth('LOGIN_SUCCESS')
        self.assertEqual(RegistroLog.objects.get().message, 'Inicio de sesión correcto')

    def test_nivel_invalido_cae_en_info(self):
        sl.logs.audit('ADMIN_ACTION', 'x', nivel='LOQUESEA')
        self.assertEqual(RegistroLog.objects.get().level, 'INFO')


class SaneadoTest(TestCase):
    def test_claves_sensibles_se_enmascaran_en_metadata(self):
        sl.logs.audit('ADMIN_ACTION', 'x', metadata={
            'password': 'secreta', 'clave': 'abc', 'Authorization': 'Bearer xyz', 'refresh': 'r',
            'anidado': {'api_key': 'k', 'ok': 'visible'}, 'lista': [{'token': 't'}],
        })
        m = RegistroLog.objects.get().metadata
        self.assertEqual(m['password'], '***')
        self.assertEqual(m['clave'], '***')
        self.assertEqual(m['Authorization'], '***')
        self.assertEqual(m['refresh'], '***')
        self.assertEqual(m['anidado'], {'api_key': '***', 'ok': 'visible'})
        self.assertEqual(m['lista'], [{'token': '***'}])

    def test_patrones_de_secreto_en_el_mensaje_y_el_stack(self):
        try:
            raise ValueError('falló con password=Nicolas2017# y token: abc.def')
        except ValueError as exc:
            sl.logs.error('APP_ERROR', 'Error con clave=hunter2 al conectar', exc=exc)
        r = RegistroLog.objects.get()
        for texto in (r.message, r.metadata['detalle'], r.metadata['stack_trace']):
            self.assertNotIn('hunter2', texto)
            self.assertNotIn('Nicolas2017', texto)
            self.assertNotIn('abc.def', texto)

    def test_textos_largos_caben_en_las_columnas(self):
        sl.logs.audit('A' * 200, 'm' * 5000, metadata={'t': 'x' * 50000})
        r = RegistroLog.objects.get()
        self.assertLessEqual(len(r.message), 500)
        self.assertLessEqual(len(r.action), 60)
        self.assertLessEqual(len(r.metadata['t']), 2000)


class RobustezTest(TestCase):
    def test_un_fallo_al_guardar_nunca_propaga(self):
        with mock.patch.object(RegistroLog.objects, 'bulk_create', side_effect=RuntimeError('BD caída')), \
                mock.patch.object(RegistroLog, 'save', side_effect=RuntimeError('BD caída')), \
                self.assertLogs('bd_sistema.logs', level='ERROR') as cap:
            sl.logs.auth('LOGIN_FAILED', 'no debe lanzar')          # no lanza
        self.assertTrue(any('LOG_NO_GUARDADO' in l for l in cap.output))   # quedó en el respaldo
        self.assertEqual(RegistroLog.objects.count(), 0)

    def test_un_error_construyendo_el_registro_no_propaga(self):
        with mock.patch.object(sl, '_construir', side_effect=RuntimeError('boom')), \
                self.assertLogs('bd_sistema.logs', level='ERROR'):
            sl.logs.error('APP_ERROR', 'x')   # no lanza

    def test_una_fila_invalida_no_se_lleva_a_las_demas(self):
        buenas = [RegistroLog(category='AUTH', action='A', message='ok') for _ in range(2)]
        mala = RegistroLog(category='AUTH', action='B', message='x', ip_address='no-es-ip')
        original_save = RegistroLog.save

        def save(self_, *a, **k):
            if self_.action == 'B':
                raise RuntimeError('fila inválida')
            return original_save(self_, *a, **k)

        with mock.patch.object(RegistroLog.objects, 'bulk_create', side_effect=RuntimeError('lote')), \
                mock.patch.object(RegistroLog, 'save', save), \
                self.assertLogs('bd_sistema.logs', level='ERROR'):
            sl._guardar_lote([buenas[0], mala, buenas[1]])
        self.assertEqual(sorted(RegistroLog.objects.values_list('action', flat=True)), ['A', 'A'])

    @override_settings(LOGS_ASYNC=True, LOGS_COLA_MAX=1)
    def test_modo_asincrono_escribe_en_segundo_plano_sin_bloquear(self):
        # El hilo escritor usa su propia conexión; con SQLite en memoria no ve la BD de la prueba,
        # así que aquí solo se verifica el contrato: encola, devuelve al instante y no lanza.
        sl._cola = None
        sl._hilo = None
        with mock.patch.object(sl, '_guardar_lote') as guardar:
            sl.logs.auth('LOGIN_SUCCESS', 'async')
            sl.vaciar_cola(3)
        guardar.assert_called_once()
        lote = guardar.call_args.args[0]
        self.assertEqual(lote[0].action, 'LOGIN_SUCCESS')
        self.assertTrue(guardar.call_args.kwargs.get('en_hilo_propio'))
        sl._cola = None
        sl._hilo = None


class IpTest(TestCase):
    def _req(self, **meta):
        return mock.Mock(META=meta)

    def test_ip_directa(self):
        self.assertEqual(sl.obtener_ip(self._req(REMOTE_ADDR='10.8.1.5')), '10.8.1.5')

    def test_forwarded_for_se_ignora_si_no_viene_de_proxy_confiable(self):
        r = self._req(REMOTE_ADDR='10.8.1.5', HTTP_X_FORWARDED_FOR='1.2.3.4')
        self.assertEqual(sl.obtener_ip(r), '10.8.1.5')   # falseable: no se respeta

    def test_forwarded_for_se_respeta_desde_proxy_confiable(self):
        r = self._req(REMOTE_ADDR='127.0.0.1', HTTP_X_FORWARDED_FOR='10.8.7.7, 127.0.0.1')
        self.assertEqual(sl.obtener_ip(r), '10.8.7.7')

    def test_ip_invalida_es_none(self):
        self.assertIsNone(sl.obtener_ip(self._req(REMOTE_ADDR='basura')))


class ConsultasTest(TestCase):
    def setUp(self):
        ahora = timezone.now()
        datos = [
            ('AUTH', 'WARN', 'LOGIN_FAILED', 'ana', '10.0.0.1', ahora - timedelta(hours=2)),
            ('AUTH', 'INFO', 'LOGIN_SUCCESS', 'beto', '10.0.0.2', ahora - timedelta(hours=1)),
            ('AUDIT', 'INFO', 'USER_UPDATED', 'admin', '10.0.0.3', ahora - timedelta(days=3)),
            ('SYSTEM_ERROR', 'ERROR', 'DATABASE_ERROR', 'ANONYMOUS', None, ahora - timedelta(minutes=5)),
        ]
        for cat, niv, acc, actor, ip, ts in datos:
            RegistroLog.objects.create(category=cat, level=niv, action=acc, actor_username=actor,
                                       ip_address=ip, message=f'{acc} de {actor}', timestamp=ts)

    def _f(self, **p):
        return list(sl.aplicar_filtros(RegistroLog.objects.all(), p).values_list('action', flat=True))

    def test_filtros(self):
        self.assertEqual(sorted(self._f(category='AUTH')), ['LOGIN_FAILED', 'LOGIN_SUCCESS'])
        self.assertEqual(self._f(level='ERROR,CRITICAL'), ['DATABASE_ERROR'])
        self.assertEqual(self._f(action='USER_UPDATED'), ['USER_UPDATED'])
        self.assertEqual(self._f(actor='ana'), ['LOGIN_FAILED'])
        self.assertEqual(self._f(ip='10.0.0.2'), ['LOGIN_SUCCESS'])
        self.assertEqual(self._f(q='beto'), ['LOGIN_SUCCESS'])

    def test_filtro_de_categoria_o_nivel_desconocido_se_ignora(self):
        self.assertEqual(len(self._f(category='NOPE', level='XX')), 4)

    def test_filtro_por_fechas_usa_el_dia_de_Chile(self):
        RegistroLog.objects.all().delete()
        # 23:30 del 10-mar en Chile ya es 11-mar en UTC: el filtro debe usar el día local.
        RegistroLog.objects.create(category='AUTH', action='DENTRO',
                                   timestamp=timezone.make_aware(datetime(2026, 3, 10, 23, 30)))
        RegistroLog.objects.create(category='AUTH', action='FUERA',
                                   timestamp=timezone.make_aware(datetime(2026, 3, 11, 0, 30)))
        self.assertEqual(self._f(desde='2026-03-10', hasta='2026-03-10'), ['DENTRO'])
        self.assertEqual(sorted(self._f(desde='2026-03-10', hasta='2026-03-11')), ['DENTRO', 'FUERA'])

    def test_resumen_cuenta_24h_y_arma_serie(self):
        r = sl.calcular_resumen(dias=7)
        k = r['kpis_24h']
        self.assertEqual(k['total'], 3)                      # el de hace 3 días queda fuera de 24 h
        self.assertEqual(k['logins_fallidos'], 1)
        self.assertEqual(k['logins_exitosos'], 1)
        self.assertEqual(k['errores'], 1)
        self.assertEqual(len(r['serie']), 7)
        self.assertEqual(sum(s['AUDIT'] for s in r['serie']), 1)   # el cambio de hace 3 días
        self.assertEqual(r['top_ips_fallidas'], [{'ip': '10.0.0.1', 'intentos': 1}])
        self.assertEqual(r['ultimo_error']['action'], 'DATABASE_ERROR')

    def test_resumen_de_un_dia_es_por_hora(self):
        r = sl.calcular_resumen(dias=1)
        self.assertEqual((r['serie_por'], len(r['serie'])), ('hora', 24))

    def test_retencion_borra_solo_lo_antiguo(self):
        RegistroLog.objects.create(category='AUTH', action='VIEJO', timestamp=timezone.now() - timedelta(days=400))
        self.assertEqual(sl.limpiar_logs(dias=180), 1)
        self.assertFalse(RegistroLog.objects.filter(action='VIEJO').exists())
        self.assertEqual(RegistroLog.objects.count(), 4)
        with self.assertRaises(ValueError):
            sl.limpiar_logs(dias=0)


class SaludTest(TestCase):
    def test_salud_ok_en_condiciones_normales(self):
        s = sl.calcular_salud(registrar_alertas=False)
        claves = {r['clave']: r['estado'] for r in s['revisiones']}
        self.assertEqual(claves['base_datos'], 'ok')
        self.assertIn(claves['disco'], ('ok', 'atencion', 'critico'))

    def test_disco_casi_lleno_es_critico_y_deja_alerta(self):
        uso = mock.Mock(total=1000, free=20, used=980)    # 2 % libre
        with mock.patch.object(sl.shutil, 'disk_usage', return_value=uso):
            s = sl.calcular_salud(registrar_alertas=True)
        disco = next(r for r in s['revisiones'] if r['clave'] == 'disco')
        self.assertEqual(disco['estado'], 'critico')
        self.assertEqual(s['estado'], 'critico')
        a = RegistroLog.objects.get(action='RESOURCE_ALERT')
        self.assertEqual((a.level, a.category), ('CRITICAL', 'SYSTEM_ERROR'))


class ClasificacionTest(TestCase):
    def test_clasifica_excepciones(self):
        from django.db import OperationalError, ProgrammingError
        self.assertEqual(sl.clasificar_excepcion(OperationalError('x'))[:2], ('DATABASE_ERROR', 'CRITICAL'))
        self.assertEqual(sl.clasificar_excepcion(ProgrammingError('x'))[:2], ('DATABASE_ERROR', 'ERROR'))
        self.assertEqual(sl.clasificar_excepcion(ConnectionError('x'))[0], 'EXTERNAL_SERVICE_ERROR')
        self.assertEqual(sl.clasificar_excepcion(KeyError('x'))[0], 'UNHANDLED_EXCEPTION')
