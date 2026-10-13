"""Alcance del Gestor de Compras con la capa propia de asignación de departamento.

`AsignacionDepartamentoUsuario` (la asigna un administrador) prevalece sobre la pertenencia
del Panel SSO (`data_pertenencia_usuario`); sin filas propias el comportamiento es el de siempre.
Departamento/PertenenciaUsuario son managed=False: el runner de pruebas crea sus tablas
(core/test_runner.py).
"""
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings

from api.models import (
    AsignacionDepartamentoUsuario, Departamento, FormularioFSC, PerfilUsuario, PertenenciaUsuario,
)
from api.services import invalidar_cache_alcance_gestor, resolver_alcance_gestor

CACHE_LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


class AlcanceGestorAsignacionTest(TestCase):
    def setUp(self):
        cache.clear()
        # Raíz con un sub-departamento colgando; y un departamento aparte.
        self.raiz = Departamento.objects.create(
            descripcion='DPTO RAIZ', es_depto='SI', parent_id=None, subdireccion_id=2, establecimiento_id=1)
        self.sub = Departamento.objects.create(
            descripcion='SUB DPTO', es_depto='NO', parent_id=self.raiz.id, subdireccion_id=2, establecimiento_id=1)
        self.otro = Departamento.objects.create(
            descripcion='OTRO DPTO', es_depto='SI', parent_id=None, subdireccion_id=3, establecimiento_id=1)
        for unidad in ('DPTO RAIZ', 'SUB DPTO', 'OTRO DPTO'):
            FormularioFSC.objects.create(folio=1, anho=2026, unidad_requirente=unidad)

        self.admin = User.objects.create_user('admin@x.cl', password='x')
        PerfilUsuario.objects.create(user=self.admin, role='admin')
        self.gestor = User.objects.create_user('gestor@x.cl', password='x')
        PerfilUsuario.objects.create(user=self.gestor, role='gestor_compras', panel_id=900)
        # El Panel lo tiene en la raíz.
        PertenenciaUsuario.objects.create(
            id_usuario=900, tipo_dependencia='DEP', id_dependencia=self.raiz.id, id_subdireccion=2)

    def _asignar(self, *deptos):
        for d in deptos:
            AsignacionDepartamentoUsuario.objects.create(
                user=self.gestor, departamento_id=d.id if hasattr(d, 'id') else d, asignado_por=self.admin)

    def test_sin_asignacion_propia_vale_la_del_panel(self):
        a = resolver_alcance_gestor(self.gestor)
        self.assertEqual(a['origen'], 'panel')
        self.assertEqual(set(a['depto_ids']), {self.raiz.id, self.sub.id})
        self.assertEqual(set(a['unidades']), {'DPTO RAIZ', 'SUB DPTO'})

    def test_la_asignacion_propia_prevalece_sobre_el_panel(self):
        self._asignar(self.otro)
        a = resolver_alcance_gestor(self.gestor)
        self.assertEqual(a['origen'], 'propio')
        self.assertEqual(a['depto_ids'], [self.otro.id])
        # Nada de lo que tenía en el Panel sigue visible.
        self.assertEqual(a['unidades'], ['OTRO DPTO'])

    def test_asignar_un_subdepartamento_ve_solo_ese(self):
        self._asignar(self.sub)
        a = resolver_alcance_gestor(self.gestor)
        self.assertEqual(a['depto_ids'], [self.sub.id])
        self.assertEqual(a['unidades'], ['SUB DPTO'])

    def test_asignar_la_raiz_incluye_a_sus_descendientes(self):
        PertenenciaUsuario.objects.all().delete()
        self._asignar(self.raiz)
        a = resolver_alcance_gestor(self.gestor)
        self.assertEqual(set(a['depto_ids']), {self.raiz.id, self.sub.id})
        self.assertEqual(a['departamentos'][0]['sub_departamentos'], ['SUB DPTO'])

    def test_varios_departamentos_asignados(self):
        self._asignar(self.sub, self.otro)
        a = resolver_alcance_gestor(self.gestor)
        self.assertEqual(set(a['depto_ids']), {self.sub.id, self.otro.id})
        self.assertEqual(set(a['unidades']), {'SUB DPTO', 'OTRO DPTO'})

    def test_asignacion_a_un_departamento_inexistente_no_vuelve_al_panel(self):
        self._asignar(99999)
        a = resolver_alcance_gestor(self.gestor)
        self.assertEqual(a['depto_ids'], [])
        self.assertEqual(a['unidades'], [])
        self.assertEqual(a['origen'], None)
        self.assertIn('ya no existen', a['motivo'])

    def test_sin_panel_pero_con_asignacion_propia_tiene_alcance(self):
        self.gestor.perfil.panel_id = None
        self.gestor.perfil.save()
        sin = resolver_alcance_gestor(self.gestor)
        self.assertEqual(sin['depto_ids'], [])
        self.assertIn('Panel SSO', sin['motivo'])

        self._asignar(self.otro)
        con = resolver_alcance_gestor(self.gestor)
        self.assertEqual(con['depto_ids'], [self.otro.id])

    def test_el_administrador_no_se_ve_afectado_por_su_propia_asignacion(self):
        AsignacionDepartamentoUsuario.objects.create(user=self.admin, departamento_id=self.otro.id)
        a = resolver_alcance_gestor(self.admin)
        self.assertTrue(a['todos'])
        self.assertEqual(a['origen'], 'todos')

    @override_settings(CACHES=CACHE_LOCMEM)
    def test_invalidar_cache_hace_visible_el_cambio_de_inmediato(self):
        cache.clear()
        antes = resolver_alcance_gestor(self.gestor)
        self.assertEqual(antes['origen'], 'panel')

        self._asignar(self.otro)
        # Sin invalidar, el resultado de 60 s sigue siendo el viejo.
        self.assertEqual(resolver_alcance_gestor(self.gestor)['origen'], 'panel')

        invalidar_cache_alcance_gestor(self.gestor.id)
        despues = resolver_alcance_gestor(self.gestor)
        self.assertEqual(despues['origen'], 'propio')
        self.assertEqual(despues['depto_ids'], [self.otro.id])
        cache.clear()

    def test_eliminar_al_usuario_borra_sus_asignaciones(self):
        self._asignar(self.otro)
        self.gestor.delete()
        self.assertEqual(AsignacionDepartamentoUsuario.objects.count(), 0)
