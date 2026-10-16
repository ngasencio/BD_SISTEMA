"""Recuperación de contraseña por correo (login › «¿Olvidaste tu contraseña?»).

Cubre: envío del código, código expirado, código incorrecto, límite de intentos, cambio exitoso y
login posterior con la nueva contraseña; además que no se revele si un correo existe, que el código
no se devuelva ni se guarde en claro, y que ningún secreto llegue a Administración › Logs.

    python manage.py test api.tests.test_recuperacion_clave --settings=core.settings_test
"""
import re
from datetime import timedelta
from unittest import mock

from django.contrib.auth.models import User
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import RecuperacionContrasena, RegistroLog
from api.services_recuperacion_clave import (
    MENSAJE_CODIGO_INVALIDO, MENSAJE_GENERICO, MENSAJE_TOKEN_INVALIDO, generar_codigo,
)

CLAVE_VIEJA = 'clave-vieja-Segura-1'
CLAVE_NUEVA = 'Nueva-clave-Segura-2026'
SOLICITAR = '/api/auth/recuperar/solicitar/'
VERIFICAR = '/api/auth/recuperar/verificar/'
RESTABLECER = '/api/auth/recuperar/restablecer/'
LOGIN = '/api/auth/login/'


class Base(TestCase):
    def setUp(self):
        self.cli = APIClient()
        self.cli.raise_request_exception = False
        self.ana = User.objects.create_user('ana', 'ana@redsalud.gob.cl', CLAVE_VIEJA, first_name='Ana', last_name='Pérez')

    # — atajos —
    def pedir(self, email='ana@redsalud.gob.cl'):
        return self.cli.post(SOLICITAR, {'email': email}, format='json')

    def codigo_del_ultimo_correo(self):
        m = re.search(r'tu código de verificación es:\s+(\d{6})', mail.outbox[-1].body, re.I)
        self.assertIsNotNone(m, mail.outbox[-1].body)
        return m.group(1)

    def verificar(self, codigo, email='ana@redsalud.gob.cl'):
        return self.cli.post(VERIFICAR, {'email': email, 'codigo': codigo}, format='json')

    def restablecer(self, token, password=CLAVE_NUEVA, confirmacion=None):
        return self.cli.post(RESTABLECER, {
            'token': token, 'password': password,
            'password_confirm': password if confirmacion is None else confirmacion}, format='json')

    def verificado(self):
        """Pide un código y lo verifica: devuelve el token para definir la clave."""
        self.assertEqual(self.pedir().status_code, 200)
        r = self.verificar(self.codigo_del_ultimo_correo())
        self.assertEqual(r.status_code, 200, r.data)
        return r.data['token']

    def en(self, segundos):
        """Reloj del servidor adelantado `segundos` (para probar vencimientos sin esperar)."""
        return mock.patch('django.utils.timezone.now', return_value=timezone.now() + timedelta(seconds=segundos))

    def login(self, clave, usuario='ana'):
        return self.cli.post(LOGIN, {'username': usuario, 'password': clave}, format='json')


# ─── 1. Envío del código ──────────────────────────────────────────────────────

class EnvioDelCodigoTest(Base):
    def test_envia_un_correo_con_un_codigo_de_6_digitos(self):
        r = self.pedir()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        correo = mail.outbox[0]
        self.assertEqual(correo.to, ['ana@redsalud.gob.cl'])
        codigo = self.codigo_del_ultimo_correo()
        self.assertRegex(codigo, r'^\d{6}$')
        self.assertIn('5 minutos', correo.body)
        html = correo.alternatives[0][0]
        self.assertIn(codigo, html)
        self.assertIn('Content-ID: <logo>', correo.message().as_string())    # el logo viaja incrustado

    def test_el_codigo_nunca_se_devuelve_al_cliente(self):
        r = self.pedir()
        self.assertNotIn(self.codigo_del_ultimo_correo(), str(r.data) + r.content.decode())
        self.assertEqual(set(r.data), {'detail', 'vigencia_segundos', 'reenvio_segundos'})

    def test_en_la_base_solo_queda_el_hash_y_vence_a_los_5_minutos(self):
        self.pedir()
        codigo = self.codigo_del_ultimo_correo()
        s = RecuperacionContrasena.objects.get()
        self.assertNotIn(codigo, s.codigo_hash)
        self.assertEqual(len(s.codigo_hash), 64)
        self.assertEqual(s.expira_en - s.creado_en, timedelta(minutes=5))
        self.assertEqual((s.usuario_id, s.intentos), (self.ana.pk, 0))

    def test_codigos_aleatorios_con_ceros_a_la_izquierda(self):
        with mock.patch('api.services_recuperacion_clave.secrets.randbelow', return_value=4921):
            self.assertEqual(generar_codigo(), '004921')
        self.assertGreater(len({generar_codigo() for _ in range(50)}), 40)    # no es constante

    def test_el_correo_no_distingue_mayusculas_ni_espacios(self):
        self.assertEqual(self.pedir('  ANA@RedSalud.gob.CL ').status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_correo_inexistente_responde_igual_y_no_envia_nada(self):
        existente, inexistente = self.pedir(), self.pedir('nadie@redsalud.gob.cl')
        self.assertEqual((existente.status_code, existente.data), (inexistente.status_code, inexistente.data))
        self.assertEqual(existente.data['detail'], MENSAJE_GENERICO)
        self.assertEqual(len(mail.outbox), 1)                      # solo el de ana
        self.assertEqual(RecuperacionContrasena.objects.count(), 1)

    def test_cuenta_desactivada_responde_igual_y_no_envia(self):
        self.ana.is_active = False
        self.ana.save()
        r = self.pedir()
        self.assertEqual((r.status_code, r.data['detail']), (200, MENSAJE_GENERICO))
        self.assertEqual((len(mail.outbox), RecuperacionContrasena.objects.count()), (0, 0))

    def test_correo_compartido_por_dos_cuentas_activas_no_envia(self):
        User.objects.create_user('ana2', 'ana@redsalud.gob.cl', 'otra-clave-123')
        r = self.pedir()
        self.assertEqual((r.status_code, r.data['detail']), (200, MENSAJE_GENERICO))
        self.assertEqual(len(mail.outbox), 0)
        self.assertIn('más de una cuenta', RegistroLog.objects.get(action='PASSWORD_RESET_REQUESTED').message)

    def test_si_un_username_es_el_correo_desempata_cuando_el_correo_esta_repetido(self):
        # Caso real: «nasencio» y «nicolas.asencio@…» comparten el mismo correo. Quien escribe el correo
        # usa el de username igual al correo; el código llega y la clave cambia SOLO en esa cuenta.
        correo = 'nicolas.asencio@redsalud.gob.cl'
        antiguo = User.objects.create_user('nasencio', correo, 'clave-antigua-123')
        actual = User.objects.create_user(correo, correo, 'clave-actual-123')
        self.assertEqual(self.pedir(correo).status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [correo])
        r = self.verificar(self.codigo_del_ultimo_correo(), email=correo)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.restablecer(r.data['token']).status_code, 200)
        actual.refresh_from_db()
        antiguo.refresh_from_db()
        self.assertTrue(actual.check_password(CLAVE_NUEVA))
        self.assertTrue(antiguo.check_password('clave-antigua-123'))     # la otra cuenta no se toca
        self.assertEqual(self.login(CLAVE_NUEVA, usuario=correo).status_code, 200)

    def test_el_codigo_va_al_correo_registrado_no_al_que_se_tecleo(self):
        # El username de ingreso es un correo, pero el registrado en la cuenta es otro: se usa el registrado.
        User.objects.create_user('carla@redsalud.gob.cl', 'carla.perez@redsalud.gob.cl', 'clave-carla-123')
        self.pedir('carla@redsalud.gob.cl')
        self.assertEqual([m.to for m in mail.outbox], [['carla.perez@redsalud.gob.cl']])

    def test_username_desactivado_no_cae_en_otra_cuenta_con_ese_correo(self):
        User.objects.create_user('ana@redsalud.gob.cl', 'otro@redsalud.gob.cl', 'x-clave-123', is_active=False)
        self.pedir('ana@redsalud.gob.cl')     # existe una cuenta activa (ana) con ESE correo, pero el login es de la inactiva
        self.assertEqual(len(mail.outbox), 0)
        self.assertIn('desactivada', RegistroLog.objects.get(action='PASSWORD_RESET_REQUESTED').message)

    def test_correo_mal_escrito_es_400(self):
        for malo in ('', 'sin-arroba', 'a@', None, 123):
            with self.subTest(email=malo):
                self.assertEqual(self.cli.post(SOLICITAR, {'email': malo}, format='json').status_code, 400)
        self.assertEqual(self.cli.post(SOLICITAR, {}, format='json').status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_un_token_vencido_guardado_en_el_navegador_no_rompe_el_flujo(self):
        # DRF autentica antes de mirar permisos: sin `authentication_classes([])` esto sería un 401.
        self.cli.credentials(HTTP_AUTHORIZATION='Bearer token.viejo.o.invalido')
        self.assertEqual(self.pedir().status_code, 200)

    def test_pedir_otro_codigo_antes_de_tiempo_no_envia_otro_correo(self):
        primero = self.pedir()
        segundo = self.pedir()
        self.assertEqual(primero.data, segundo.data)               # no revela que hubo un límite
        self.assertEqual(len(mail.outbox), 1)

    def test_un_codigo_nuevo_invalida_el_anterior(self):
        self.pedir()
        viejo = self.codigo_del_ultimo_correo()
        with override_settings(RECUPERACION_REENVIO_SEG=0):
            self.pedir()
        nuevo = self.codigo_del_ultimo_correo()
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(self.verificar(viejo).status_code, 400)   # aunque fuese correcto, ya no sirve
        self.assertEqual(self.verificar(nuevo).status_code, 200)

    def test_tope_de_codigos_por_hora_por_cuenta(self):
        with override_settings(RECUPERACION_REENVIO_SEG=0, RECUPERACION_MAX_POR_HORA_USUARIO=2):
            for _ in range(4):
                self.assertEqual(self.pedir().status_code, 200)
        self.assertEqual(len(mail.outbox), 2)

    def test_tope_de_codigos_por_hora_por_ip(self):
        for n in range(3):
            User.objects.create_user(f'u{n}', f'u{n}@redsalud.gob.cl', 'clave-123-xyz')
        with override_settings(RECUPERACION_MAX_POR_HORA_IP=2):
            for n in range(3):
                self.pedir(f'u{n}@redsalud.gob.cl')
        self.assertEqual(len(mail.outbox), 2)

    def test_si_falla_el_correo_la_respuesta_es_la_misma_y_no_se_castiga_al_usuario(self):
        with mock.patch('django.core.mail.EmailMultiAlternatives.send', side_effect=OSError('SMTP caído')):
            r = self.pedir()
        self.assertEqual((r.status_code, r.data['detail']), (200, MENSAJE_GENERICO))
        self.assertEqual(RecuperacionContrasena.objects.count(), 0)    # no cuenta para la espera entre códigos
        self.assertEqual(RegistroLog.objects.filter(action='EXTERNAL_SERVICE_ERROR').count(), 1)
        self.pedir()                                                    # puede reintentar de inmediato
        self.assertEqual(len(mail.outbox), 1)


# ─── 2. Verificación del código ───────────────────────────────────────────────

class VerificacionDelCodigoTest(Base):
    def test_codigo_correcto_entrega_un_token_y_se_consume(self):
        self.pedir()
        codigo = self.codigo_del_ultimo_correo()
        r = self.verificar(codigo)
        self.assertEqual(r.status_code, 200)
        self.assertGreater(len(r.data['token']), 30)
        s = RecuperacionContrasena.objects.get()
        self.assertIsNotNone(s.verificado_en)
        self.assertEqual(s.codigo_hash, '')                          # el código ya no existe en la base
        self.assertNotIn(r.data['token'], s.token_hash)               # y el token solo queda como hash
        # Invalidado tras un uso exitoso: el mismo código no vale dos veces.
        again = self.verificar(codigo)
        self.assertEqual((again.status_code, again.data['detail']), (400, MENSAJE_CODIGO_INVALIDO))

    def test_el_codigo_acepta_espacios_y_guion_como_se_copia_del_correo(self):
        self.pedir()
        c = self.codigo_del_ultimo_correo()
        self.assertEqual(self.verificar(f'{c[:3]} {c[3:]}').status_code, 200)

    def test_codigo_incorrecto(self):
        self.pedir()
        correcto = self.codigo_del_ultimo_correo()
        malo = '000000' if correcto != '000000' else '111111'
        r = self.verificar(malo)
        self.assertEqual((r.status_code, r.data['detail']), (400, MENSAJE_CODIGO_INVALIDO))
        self.assertNotIn('token', r.data)
        self.assertEqual(RecuperacionContrasena.objects.get().intentos, 1)
        self.assertEqual(self.verificar(correcto).status_code, 200)   # el correcto aún sirve (queda margen)

    def test_codigo_con_formato_invalido_no_gasta_intentos(self):
        self.pedir()
        for raro in ('', '12345', '1234567', 'abcdef', '12 34 5a', None, 123456.0):
            with self.subTest(codigo=raro):
                self.assertEqual(self.verificar(raro).status_code, 400)
        self.assertEqual(RecuperacionContrasena.objects.get().intentos, 0)

    def test_codigo_expirado_aunque_sea_correcto(self):
        self.pedir()
        codigo = self.codigo_del_ultimo_correo()
        with self.en(5 * 60 + 1):                                     # 5 min y 1 s después
            r = self.verificar(codigo)
        self.assertEqual((r.status_code, r.data['detail']), (400, MENSAJE_CODIGO_INVALIDO))
        self.assertNotIn('token', r.data)
        self.assertIsNone(RecuperacionContrasena.objects.get().verificado_en)
        self.assertIn('venció', RegistroLog.objects.get(action='PASSWORD_RESET_FAILED').message)

    def test_dentro_de_la_vigencia_el_codigo_sirve(self):
        self.pedir()
        codigo = self.codigo_del_ultimo_correo()
        with self.en(5 * 60 - 5):                                     # 4 min 55 s
            self.assertEqual(self.verificar(codigo).status_code, 200)

    def test_un_codigo_vencido_se_reemplaza_pidiendo_uno_nuevo(self):
        self.pedir()
        with self.en(6 * 60):
            self.pedir()                                              # ya pasó la espera entre códigos
            self.assertEqual(self.verificar(self.codigo_del_ultimo_correo()).status_code, 200)

    def test_limite_de_intentos_inutiliza_el_codigo_aunque_luego_se_acierte(self):
        self.pedir()
        correcto = self.codigo_del_ultimo_correo()
        malo = '000000' if correcto != '000000' else '111111'
        for _ in range(5):
            self.assertEqual(self.verificar(malo).status_code, 400)
        r = self.verificar(correcto)                                  # el 6.º intento, con el código bueno
        self.assertEqual((r.status_code, r.data['detail']), (400, MENSAJE_CODIGO_INVALIDO))
        self.assertNotIn('token', r.data)
        s = RecuperacionContrasena.objects.get()
        self.assertEqual(s.intentos, 5)                               # el tope no se supera
        self.assertIsNone(s.verificado_en)
        self.assertIsNotNone(s.invalidado_en)

    def test_tras_agotar_intentos_un_codigo_nuevo_funciona(self):
        self.pedir()
        malo = '000000' if self.codigo_del_ultimo_correo() != '000000' else '111111'
        for _ in range(5):
            self.verificar(malo)
        with override_settings(RECUPERACION_REENVIO_SEG=0):
            self.pedir()
        self.assertEqual(self.verificar(self.codigo_del_ultimo_correo()).status_code, 200)

    def test_el_limite_de_intentos_es_configurable(self):
        with override_settings(RECUPERACION_MAX_INTENTOS=2):
            self.pedir()
            correcto = self.codigo_del_ultimo_correo()
            malo = '000000' if correcto != '000000' else '111111'
            self.verificar(malo)
            self.verificar(malo)
            self.assertEqual(self.verificar(correcto).status_code, 400)

    def test_los_fallos_no_revelan_si_el_correo_existe(self):
        self.pedir()
        correcto = self.codigo_del_ultimo_correo()
        malo = '000000' if correcto != '000000' else '111111'
        casos = [
            self.verificar(malo),                                      # correo real, código malo
            self.verificar(malo, email='nadie@redsalud.gob.cl'),       # correo inexistente
            self.verificar(correcto, email='nadie@redsalud.gob.cl'),   # código ajeno en correo inexistente
        ]
        for _ in range(5):
            self.verificar(malo)                                       # y agotado, para el mismo correo real
        casos.append(self.verificar(correcto))
        self.assertEqual({(c.status_code, c.data['detail']) for c in casos}, {(400, MENSAJE_CODIGO_INVALIDO)})

    def test_un_codigo_no_sirve_para_otra_cuenta(self):
        User.objects.create_user('beto', 'beto@redsalud.gob.cl', 'clave-beto-123')
        self.pedir()
        self.pedir('beto@redsalud.gob.cl')
        codigo_ana = re.search(r'es:\s+(\d{6})', mail.outbox[0].body).group(1)
        self.assertEqual(self.verificar(codigo_ana, email='beto@redsalud.gob.cl').status_code, 400)

    def test_verificar_sin_haber_pedido_codigo(self):
        r = self.verificar('123456')
        self.assertEqual((r.status_code, r.data['detail']), (400, MENSAJE_CODIGO_INVALIDO))


# ─── 3. Contraseña nueva y login posterior ────────────────────────────────────

class ContrasenaNuevaTest(Base):
    def test_flujo_completo_y_login_con_la_nueva_contrasena(self):
        self.assertEqual(self.login(CLAVE_VIEJA).status_code, 200)
        token = self.verificado()
        r = self.restablecer(token)
        self.assertEqual(r.status_code, 200, r.data)
        # La clave vieja ya no entra y la nueva sí (login real por el endpoint JWT).
        self.assertEqual(self.login(CLAVE_VIEJA).status_code, 401)
        entrada = self.login(CLAVE_NUEVA)
        self.assertEqual(entrada.status_code, 200)
        self.assertIn('access', entrada.data)
        self.ana.refresh_from_db()
        self.assertTrue(self.ana.check_password(CLAVE_NUEVA))
        self.assertNotIn(CLAVE_NUEVA, self.ana.password)               # se guarda hasheada

    def test_el_token_es_de_un_solo_uso(self):
        token = self.verificado()
        self.assertEqual(self.restablecer(token).status_code, 200)
        r = self.restablecer(token, password='Otra-clave-Segura-77')
        self.assertEqual((r.status_code, r.data['detail']), (400, MENSAJE_TOKEN_INVALIDO))
        self.assertEqual(self.login(CLAVE_NUEVA).status_code, 200)     # no se pudo pisar de nuevo

    def test_token_inventado_o_vacio(self):
        for token in ('inventado', '', None, 'x' * 500):
            with self.subTest(token=token):
                r = self.restablecer(token)
                self.assertEqual((r.status_code, r.data['detail']), (400, MENSAJE_TOKEN_INVALIDO))
        self.assertEqual(self.login(CLAVE_VIEJA).status_code, 200)

    def test_el_token_vence(self):
        token = self.verificado()
        with self.en(10 * 60 + 1):
            r = self.restablecer(token)
        self.assertEqual((r.status_code, r.data['detail']), (400, MENSAJE_TOKEN_INVALIDO))
        self.assertEqual(self.login(CLAVE_VIEJA).status_code, 200)

    def test_sin_verificar_el_codigo_no_hay_token(self):
        self.pedir()
        # Intentar saltarse la verificación con el código en el lugar del token no sirve.
        self.assertEqual(self.restablecer(self.codigo_del_ultimo_correo()).status_code, 400)
        self.assertEqual(self.login(CLAVE_VIEJA).status_code, 200)

    def test_las_contrasenas_deben_coincidir_y_se_puede_reintentar(self):
        token = self.verificado()
        r = self.restablecer(token, confirmacion='otra-distinta-123')
        self.assertEqual(r.status_code, 400)
        self.assertIn('password_confirm', r.data['errores'])
        self.assertEqual(self.login(CLAVE_VIEJA).status_code, 200)     # no cambió nada
        self.assertEqual(self.restablecer(token).status_code, 200)     # el token sobrevivió al error

    def test_se_aplican_las_reglas_de_contrasena_del_proyecto(self):
        token = self.verificado()
        # Cada una rompe una regla de AUTH_PASSWORD_VALIDATORS: corta, solo números, común, parecida al correo.
        for debil in ('corta1', '12345678901', 'password', 'qwertyuiop', 'ana@redsalud.gob.cl1'):
            with self.subTest(clave=debil):
                r = self.restablecer(token, password=debil)
                self.assertEqual(r.status_code, 400)
                self.assertTrue(r.data['errores']['password'])
        self.assertEqual(self.login(CLAVE_VIEJA).status_code, 200)     # ninguna cambió la clave
        self.assertEqual(self.restablecer(token).status_code, 200)     # y el token seguía vivo

    def test_campos_vacios(self):
        token = self.verificado()
        r = self.cli.post(RESTABLECER, {'token': token}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('password', r.data['errores'])

    def test_cambiar_la_clave_deja_sin_efecto_otros_codigos_pendientes(self):
        token = self.verificado()
        with override_settings(RECUPERACION_REENVIO_SEG=0):
            self.pedir()                                               # otro código pendiente
        codigo_pendiente = self.codigo_del_ultimo_correo()
        # El código nuevo reemplazó a la verificación anterior: su token ya no vale.
        self.assertEqual(self.restablecer(token).status_code, 400)
        token2 = self.verificar(codigo_pendiente).data['token']
        self.assertEqual(self.restablecer(token2).status_code, 200)
        self.assertFalse(RecuperacionContrasena.objects.filter(
            usado_en__isnull=True, invalidado_en__isnull=True).exists())

    def test_cuenta_desactivada_a_mitad_del_flujo(self):
        token = self.verificado()
        self.ana.is_active = False
        self.ana.save()
        self.assertEqual(self.restablecer(token).status_code, 400)
        self.ana.refresh_from_db()
        self.assertTrue(self.ana.check_password(CLAVE_VIEJA))

    def test_endpoints_solo_aceptan_post(self):
        for url in (SOLICITAR, VERIFICAR, RESTABLECER):
            self.assertEqual(self.cli.get(url).status_code, 405)


# ─── Registro en Administración › Logs ────────────────────────────────────────

class RegistroDeLogsTest(Base):
    def test_cada_paso_queda_registrado_sin_secretos(self):
        self.pedir()
        codigo = self.codigo_del_ultimo_correo()
        self.verificar('000000' if codigo != '000000' else '111111')
        token = self.verificar(codigo).data['token']
        self.restablecer(token)
        acciones = list(RegistroLog.objects.order_by('id').values_list('action', flat=True))
        self.assertEqual(acciones, ['PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_FAILED',
                                    'PASSWORD_RESET_VERIFIED', 'PASSWORD_CHANGED'])
        self.assertTrue(all(l.category == 'AUTH' for l in RegistroLog.objects.all()))
        self.assertEqual(RegistroLog.objects.get(action='PASSWORD_RESET_FAILED').level, 'WARN')
        for l in RegistroLog.objects.all():
            blob = f'{l.message} {l.metadata} {l.path} {l.user_agent}'
            for secreto in (codigo, token, CLAVE_NUEVA, CLAVE_VIEJA, 'ana@redsalud.gob.cl'):
                self.assertNotIn(secreto, blob, l.action)             # ni código, token, claves ni el correo completo

    def test_un_correo_inexistente_deja_rastro_para_el_administrador(self):
        self.pedir('nadie@redsalud.gob.cl')
        l = RegistroLog.objects.get(action='PASSWORD_RESET_REQUESTED')
        self.assertEqual(l.level, 'WARN')
        self.assertIn('no existe una cuenta', l.message)
        self.assertEqual(l.actor_username, 'ANONYMOUS')
        self.assertNotIn('nadie@', l.message)                          # correo enmascarado
