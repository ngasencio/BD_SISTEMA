"""El rol `gestor_compras` NO tiene notificaciones (decisión del usuario, 2026-10-13).

- El endpoint de la campanita le responde 403 (el frontend ni la muestra).
- No se le generan avisos nuevos aunque el evento afecte a su departamento.
- El resto de los roles conserva la campanita tal cual.
"""
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import (
    ComprasNotificacion, Departamento, FormularioFSC, FormularioFSCDerivado, PerfilUsuario,
    PertenenciaUsuario, ProcesoCompra, ProcesoCompraFormulario,
)
from api.services import JEFATURA_ABASTECIMIENTO_USERNAMES, _notificar_jefaturas, resolver_alcance_gestor

URLS_GET = ['/api/compras-notificaciones/', '/api/compras-notificaciones/no-leidas/']
URL_POST = '/api/compras-notificaciones/marcar-todas-leidas/'


def _usuario(username, role, **perfil):
    u = User.objects.create_user(username, password='x')
    PerfilUsuario.objects.create(user=u, role=role, **perfil)
    return u


def _cliente(user):
    cli = APIClient()
    cli.force_authenticate(user)
    return cli


class EndpointCampanitaTest(TestCase):
    def test_gestor_recibe_403_en_toda_la_campanita(self):
        cli = _cliente(_usuario('gestor@x.cl', 'gestor_compras'))
        for url in URLS_GET:
            with self.subTest(url=url):
                self.assertEqual(cli.get(url).status_code, 403)
        self.assertEqual(cli.post(URL_POST, {}, format='json').status_code, 403)

    def test_no_puede_marcar_ni_leer_una_notificacion_suya_antigua(self):
        gestor = _usuario('gestor@x.cl', 'gestor_compras')
        n = ComprasNotificacion.objects.create(
            destinatario=gestor, tipo=ComprasNotificacion.FSC_BANDEJA, mensaje='aviso antiguo')
        cli = _cliente(gestor)
        self.assertEqual(cli.get(f'/api/compras-notificaciones/{n.id}/').status_code, 403)
        self.assertEqual(cli.patch(f'/api/compras-notificaciones/{n.id}/', {'leida': True}, format='json').status_code, 403)
        n.refresh_from_db()
        self.assertFalse(n.leida)

    def test_el_resto_de_los_roles_conserva_la_campanita(self):
        for rol in ('admin', 'jefatura', 'comprador', 'viewer', 'abastecimiento', 'general', 'finanzas'):
            cli = _cliente(_usuario(f'{rol}@x.cl', rol))
            for url in URLS_GET:
                with self.subTest(rol=rol, url=url):
                    self.assertEqual(cli.get(url).status_code, 200)
            with self.subTest(rol=rol, url='marcar-todas'):
                self.assertEqual(cli.post(URL_POST, {}, format='json').status_code, 200)

    def test_cada_usuario_sigue_viendo_solo_las_suyas(self):
        jefa = _usuario('jefa@x.cl', 'jefatura')
        otra = _usuario('otra@x.cl', 'jefatura')
        ComprasNotificacion.objects.create(destinatario=jefa, tipo=ComprasNotificacion.CAMBIO_ESTADO, mensaje='mía')
        ComprasNotificacion.objects.create(destinatario=otra, tipo=ComprasNotificacion.CAMBIO_ESTADO, mensaje='ajena')
        r = _cliente(jefa).get('/api/compras-notificaciones/')
        self.assertEqual([n['mensaje'] for n in r.data], ['mía'])


class SinAvisosAGestoresTest(TestCase):
    """Un evento de un proceso cuyo FSC pertenece al departamento del gestor avisa a la jefatura
    de Abastecimiento y a NADIE más: antes también llegaba al gestor."""

    def setUp(self):
        cache.clear()
        self.depto = Departamento.objects.create(
            descripcion='DEPARTAMENTO PRUEBA', es_depto='SI', subdireccion_id=2, establecimiento_id=1)
        # Existe un FSC de esa unidad: así la unidad entra en el alcance del gestor (y el aviso
        # le habría llegado antes de retirar las notificaciones).
        FormularioFSC.objects.create(folio=1, anho=2026, unidad_requirente='DEPARTAMENTO PRUEBA')
        self.fsc = FormularioFSCDerivado.objects.create(
            folio=1, anho=2026, unidad_requirente='DEPARTAMENTO PRUEBA')

        self.gestor = _usuario('gestor@x.cl', 'gestor_compras', panel_id=901)
        PertenenciaUsuario.objects.create(
            id_usuario=901, tipo_dependencia='DEP', id_dependencia=self.depto.id, id_subdireccion=2)
        self.jefatura = _usuario(JEFATURA_ABASTECIMIENTO_USERNAMES[0], 'jefatura')
        self.comprador = _usuario('comprador@x.cl', 'comprador')

        self.proceso = ProcesoCompra.objects.create(
            tipo_proceso=ProcesoCompra.LICITACION, titulo='Proceso de prueba', comprador=self.comprador)
        ProcesoCompraFormulario.objects.create(proceso=self.proceso, formulario_derivado=self.fsc)

    def test_precondicion_el_departamento_esta_en_el_alcance_del_gestor(self):
        self.assertEqual(resolver_alcance_gestor(self.gestor)['unidades'], ['DEPARTAMENTO PRUEBA'])

    def test_el_evento_avisa_a_la_jefatura_y_no_al_gestor(self):
        _notificar_jefaturas(ComprasNotificacion.CAMBIO_ESTADO, self.proceso, 'El proceso cambió de estado.')
        self.assertEqual(ComprasNotificacion.objects.filter(destinatario=self.jefatura).count(), 1)
        self.assertEqual(ComprasNotificacion.objects.filter(destinatario=self.gestor).count(), 0)
        self.assertEqual(ComprasNotificacion.objects.count(), 1)
