"""Quitar un proceso de compra del formulario (botón 🗑 de «Gestionar» en Mis Formularios).

Bug original (2026-10-14): tras «quitar el enlace con Mercado Público» el proceso quedaba
vivo y sin código, y la UI solo dibujaba los botones cuando había código — no existía
ninguna forma de sacarlo del formulario. `quitar_formulario_de_proceso` es esa salida:

- Un solo formulario en el proceso → el proceso se elimina completo.
- Compra conjunta → solo se suelta ese formulario; el proceso sigue para los demás.
- Revierte los FscOcLink que creó la vía de procesos, y nunca una confirmación real.
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import (
    ComprasNotificacion, FormularioFSCDerivado, FscOcLink, OrdenCompra, PerfilUsuario,
    ProcesoCompra, ProcesoCompraEstadoLog, ProcesoCompraFormulario, ProcesoCompraOrdenCompra,
)
from api.services import quitar_formulario_de_proceso


def _usuario(username, role):
    u = User.objects.create_user(username, password='x')
    PerfilUsuario.objects.create(user=u, role=role)
    return u


def _cliente(user):
    cli = APIClient()
    cli.force_authenticate(user)
    return cli


def _url(proceso):
    return f'/api/compras-procesos/{proceso.id}/quitar-formulario/'


class QuitarFormularioDeProcesoTest(TestCase):
    def setUp(self):
        self.comprador = _usuario('comprador@x.cl', 'comprador')
        self.fsc = FormularioFSCDerivado.objects.create(folio=132, anho=2026, unidad_requirente='BIENESTAR')
        self.otro_fsc = FormularioFSCDerivado.objects.create(folio=133, anho=2026, unidad_requirente='BIENESTAR')

    def _proceso(self, *fscs, titulo='F1-485-26-NAM / EPP PARA PERSONAL', **kw):
        p = ProcesoCompra.objects.create(
            tipo_proceso=ProcesoCompra.COMPRA_AGIL, titulo=titulo, comprador=self.comprador, **kw)
        for f in fscs:
            ProcesoCompraFormulario.objects.create(proceso=p, formulario_derivado=f)
        ProcesoCompraEstadoLog.objects.create(
            proceso=p, estado_anterior=None, estado_nuevo='RECEPCIONADO', usuario=self.comprador)
        return p

    def test_proceso_sin_codigo_con_un_formulario_se_elimina_completo(self):
        # El caso reportado: Compra Ágil sin código, sin OC, un solo formulario.
        p = self._proceso(self.fsc)
        res = quitar_formulario_de_proceso(p.id, self.fsc.id, self.comprador)
        self.assertEqual(res, {'proceso_eliminado': True})
        self.assertFalse(ProcesoCompra.objects.filter(pk=p.id).exists())
        self.assertFalse(ProcesoCompraEstadoLog.objects.filter(proceso_id=p.id).exists())
        # El formulario en sí no se toca.
        self.assertTrue(FormularioFSCDerivado.objects.filter(pk=self.fsc.id).exists())

    def test_compra_conjunta_solo_suelta_el_formulario(self):
        p = self._proceso(self.fsc, self.otro_fsc)
        res = quitar_formulario_de_proceso(p.id, self.fsc.id, self.comprador)
        self.assertEqual(res, {'proceso_eliminado': False})
        self.assertTrue(ProcesoCompra.objects.filter(pk=p.id).exists())
        self.assertEqual(
            list(ProcesoCompraFormulario.objects.filter(proceso=p).values_list('formulario_derivado_id', flat=True)),
            [self.otro_fsc.id],
        )

    def test_el_otro_proceso_del_mismo_formulario_no_se_toca(self):
        p1 = self._proceso(self.fsc, titulo='Primero')
        p2 = self._proceso(self.fsc, titulo='Segundo')
        quitar_formulario_de_proceso(p1.id, self.fsc.id, self.comprador)
        self.assertFalse(ProcesoCompra.objects.filter(pk=p1.id).exists())
        self.assertTrue(ProcesoCompra.objects.filter(pk=p2.id).exists())
        self.assertTrue(ProcesoCompraFormulario.objects.filter(proceso=p2, formulario_derivado=self.fsc).exists())

    def test_formulario_que_no_esta_en_el_proceso_lanza_does_not_exist(self):
        p = self._proceso(self.fsc)
        with self.assertRaises(ProcesoCompraFormulario.DoesNotExist):
            quitar_formulario_de_proceso(p.id, self.otro_fsc.id, self.comprador)
        self.assertTrue(ProcesoCompra.objects.filter(pk=p.id).exists())

    def test_elimina_tambien_los_avisos_del_proceso(self):
        p = self._proceso(self.fsc)
        ComprasNotificacion.objects.create(
            destinatario=self.comprador, proceso=p, tipo=ComprasNotificacion.NUEVO_PROCESO, mensaje='x')
        quitar_formulario_de_proceso(p.id, self.fsc.id, self.comprador)
        self.assertFalse(ComprasNotificacion.objects.filter(proceso_id=p.id).exists())


class QuitarFormularioYEnlacesOcTest(TestCase):
    """Los FscOcLink que creó la vía de procesos se revierten; los reales, no."""

    def setUp(self):
        self.comprador = _usuario('comprador@x.cl', 'comprador')
        self.fsc = FormularioFSCDerivado.objects.create(folio=132, anho=2026, unidad_requirente='BIENESTAR')
        self.oc_auto = OrdenCompra.objects.create(codigo_oc='OC-AUTO')
        self.oc_real = OrdenCompra.objects.create(codigo_oc='OC-REAL')
        self.proceso = ProcesoCompra.objects.create(
            tipo_proceso=ProcesoCompra.LICITACION, titulo='Con OC', comprador=self.comprador)
        ProcesoCompraFormulario.objects.create(proceso=self.proceso, formulario_derivado=self.fsc)
        for oc in (self.oc_auto, self.oc_real):
            ProcesoCompraOrdenCompra.objects.create(proceso=self.proceso, orden_compra=oc)

    def _link(self, oc, desde_proceso):
        return FscOcLink.objects.create(
            formulario_derivado=self.fsc, orden_compra=oc, confianza=FscOcLink.MANUAL,
            estado=FscOcLink.CONFIRMADO, creado_desde_proceso=desde_proceso)

    def test_revierte_el_link_automatico_y_conserva_el_confirmado_a_mano(self):
        self._link(self.oc_auto, True)
        self._link(self.oc_real, False)
        quitar_formulario_de_proceso(self.proceso.id, self.fsc.id, self.comprador)
        self.assertFalse(FscOcLink.objects.filter(orden_compra_id='OC-AUTO').exists())
        self.assertTrue(FscOcLink.objects.filter(orden_compra_id='OC-REAL').exists())
        # Las OC no se tocan, y su vínculo con el proceso desaparece con el proceso.
        self.assertTrue(OrdenCompra.objects.filter(codigo_oc='OC-AUTO').exists())
        self.assertFalse(ProcesoCompraOrdenCompra.objects.filter(proceso_id=self.proceso.id).exists())

    def test_conserva_el_link_si_otro_proceso_del_mismo_formulario_sigue_con_esa_oc(self):
        self._link(self.oc_auto, True)
        otro = ProcesoCompra.objects.create(
            tipo_proceso=ProcesoCompra.COMPRA_AGIL, titulo='Otro', comprador=self.comprador)
        ProcesoCompraFormulario.objects.create(proceso=otro, formulario_derivado=self.fsc)
        ProcesoCompraOrdenCompra.objects.create(proceso=otro, orden_compra=self.oc_auto)
        quitar_formulario_de_proceso(self.proceso.id, self.fsc.id, self.comprador)
        self.assertTrue(FscOcLink.objects.filter(orden_compra_id='OC-AUTO').exists())


class QuitarFormularioApiTest(TestCase):
    def setUp(self):
        self.dueno = _usuario('dueno@x.cl', 'comprador')
        self.ajeno = _usuario('ajeno@x.cl', 'comprador')
        self.admin = _usuario('admin@x.cl', 'admin')
        self.fsc = FormularioFSCDerivado.objects.create(folio=132, anho=2026, unidad_requirente='BIENESTAR')
        self.proceso = ProcesoCompra.objects.create(
            tipo_proceso=ProcesoCompra.COMPRA_AGIL, titulo='Sin código', comprador=self.dueno)
        ProcesoCompraFormulario.objects.create(proceso=self.proceso, formulario_derivado=self.fsc)

    def test_el_dueno_elimina_su_proceso(self):
        r = _cliente(self.dueno).post(_url(self.proceso), {'formulario_id': self.fsc.id}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data, {'proceso_eliminado': True})
        self.assertFalse(ProcesoCompra.objects.filter(pk=self.proceso.id).exists())

    def test_admin_puede_quitar_el_proceso_de_otro_comprador(self):
        # El caso real: nicolas.asencio (admin) gestionando desde Panel Formularios.
        r = _cliente(self.admin).post(_url(self.proceso), {'formulario_id': self.fsc.id}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(ProcesoCompra.objects.filter(pk=self.proceso.id).exists())

    def test_un_comprador_no_puede_tocar_el_proceso_de_otro(self):
        r = _cliente(self.ajeno).post(_url(self.proceso), {'formulario_id': self.fsc.id}, format='json')
        self.assertEqual(r.status_code, 404)
        self.assertTrue(ProcesoCompra.objects.filter(pk=self.proceso.id).exists())

    def test_formulario_id_ausente_o_invalido_es_400(self):
        cli = _cliente(self.dueno)
        for cuerpo in ({}, {'formulario_id': 'abc'}, {'formulario_id': ''}):
            with self.subTest(cuerpo=cuerpo):
                self.assertEqual(cli.post(_url(self.proceso), cuerpo, format='json').status_code, 400)
        self.assertTrue(ProcesoCompra.objects.filter(pk=self.proceso.id).exists())

    def test_formulario_ajeno_al_proceso_es_404(self):
        otro = FormularioFSCDerivado.objects.create(folio=999, anho=2026, unidad_requirente='X')
        r = _cliente(self.dueno).post(_url(self.proceso), {'formulario_id': otro.id}, format='json')
        self.assertEqual(r.status_code, 404)
        self.assertTrue(ProcesoCompra.objects.filter(pk=self.proceso.id).exists())

    def test_sin_rol_de_compras_es_403(self):
        viewer = _usuario('viewer@x.cl', 'viewer')
        r = _cliente(viewer).post(_url(self.proceso), {'formulario_id': self.fsc.id}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertTrue(ProcesoCompra.objects.filter(pk=self.proceso.id).exists())
