"""Pruebas del módulo Notificación del Plan de Compras (ver services_notificacion_plan.py)."""
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from api.models import PerfilUsuario
from api.services_notificacion_plan import usuario_puede_notificar_plan

CORREO_OK = 'nicolas.asencio@redsalud.gob.cl'


def _usuario(username, email='', role='admin', superuser=False):
    u = User.objects.create_user(username=username, email=email, password='x', is_superuser=superuser)
    PerfilUsuario.objects.create(user=u, role=role)
    return u


@override_settings(NOTIF_PLAN_USUARIOS=[CORREO_OK])
class AccesoNotificacionTest(TestCase):
    def test_correo_autorizado_pasa(self):
        self.assertTrue(usuario_puede_notificar_plan(_usuario('a', CORREO_OK)))

    def test_correo_en_mayusculas_pasa(self):
        self.assertTrue(usuario_puede_notificar_plan(_usuario('a', CORREO_OK.upper())))

    def test_username_con_forma_de_correo_pasa(self):
        # La cuenta importada del Panel SSO usa el correo como username y puede no tener email.
        self.assertTrue(usuario_puede_notificar_plan(_usuario(CORREO_OK, '')))

    def test_otro_admin_no_pasa(self):
        self.assertFalse(usuario_puede_notificar_plan(_usuario('b', 'otra@redsalud.gob.cl')))

    def test_superusuario_ajeno_no_pasa(self):
        # Capacidad nominal: ni siquiera un superusuario sin el correo autorizado.
        self.assertFalse(usuario_puede_notificar_plan(_usuario('c', 'otra@redsalud.gob.cl', superuser=True)))

    def test_anonimo_no_pasa(self):
        from django.contrib.auth.models import AnonymousUser
        self.assertFalse(usuario_puede_notificar_plan(AnonymousUser()))
        self.assertFalse(usuario_puede_notificar_plan(None))

    def test_sin_correo_no_pasa(self):
        self.assertFalse(usuario_puede_notificar_plan(_usuario('d', '')))

    @override_settings(NOTIF_PLAN_USUARIOS=[])
    def test_lista_vacia_no_deja_pasar_a_nadie(self):
        self.assertFalse(usuario_puede_notificar_plan(_usuario('e', CORREO_OK)))
