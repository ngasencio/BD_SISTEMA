"""Endpoints de administración de usuarios: solo `admin`, contrato de respuesta y errores."""
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import (
    AsignacionDepartamentoUsuario, AuditoriaAdmin, Departamento, Establecimiento, PerfilUsuario,
    PertenenciaUsuario, UsuarioPanel,
)


def _cliente(user):
    cli = APIClient()
    cli.force_authenticate(user)
    return cli


class AdminUsuariosApiTest(TestCase):
    def setUp(self):
        cache.clear()
        Establecimiento.objects.create(codigo=1, rut=1, dv='1', descripcion='DIRECCION SS OSORNO')
        self.raiz = Departamento.objects.create(
            descripcion='DEPARTAMENTO RAIZ', es_depto='SI', subdireccion_id=2, establecimiento_id=1)
        self.sub = Departamento.objects.create(
            descripcion='SUB DEPTO', parent_id=self.raiz.id, subdireccion_id=2, establecimiento_id=1)

        self.admin = User.objects.create_user('admin@x.cl', 'admin@x.cl', 'x')
        PerfilUsuario.objects.create(user=self.admin, role='admin')
        self.panel = UsuarioPanel.objects.create(
            usuario='ANA', correo_electronico='ana@x.cl', alias='ANA', activo='S', establecimiento_id=1)
        PertenenciaUsuario.objects.create(
            id_usuario=self.panel.id, tipo_dependencia='DEP', id_dependencia=self.raiz.id, id_subdireccion=2)
        self.ana = User.objects.create_user('ana@x.cl', 'ana@x.cl', 'x')
        PerfilUsuario.objects.create(user=self.ana, role='gestor_compras', panel_id=self.panel.id)
        self.cli = _cliente(self.admin)

    # ---- permisos ----
    def _urls(self):
        u = self.ana.id
        d = self.raiz.id
        return [
            ('get',   f'/api/usuarios/{u}/ficha/'),
            ('patch', f'/api/usuarios/{u}/ficha/'),
            ('post',  f'/api/usuarios/{u}/previsualizar-alcance/'),
            ('get',   f'/api/usuarios/{u}/historial/'),
            ('get',   '/api/organizacion/arbol/'),
            ('get',   '/api/organizacion/usuarios-panel/'),
            ('get',   f'/api/organizacion/departamentos/{d}/'),
            ('patch', f'/api/organizacion/departamentos/{d}/'),
            ('get',   f'/api/organizacion/departamentos/{d}/historial/'),
        ]

    def test_sin_sesion_401(self):
        anon = APIClient()
        for metodo, url in self._urls():
            with self.subTest(url=url):
                self.assertEqual(getattr(anon, metodo)(url, {}, format='json').status_code, 401)

    def test_solo_el_administrador_entra(self):
        for rol in ('viewer', 'abastecimiento', 'finanzas', 'comprador', 'jefatura', 'general', 'gestor_compras'):
            u = User.objects.create_user(f'u_{rol}@x.cl', password='x')
            PerfilUsuario.objects.create(user=u, role=rol)
            cli = _cliente(u)
            for metodo, url in self._urls():
                with self.subTest(rol=rol, url=url):
                    self.assertEqual(getattr(cli, metodo)(url, {}, format='json').status_code, 403)
        self.assertEqual(AsignacionDepartamentoUsuario.objects.count(), 0)

    # ---- ficha ----
    def test_get_ficha(self):
        r = self.cli.get(f'/api/usuarios/{self.ana.id}/ficha/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['perfil']['role'], 'gestor_compras')
        self.assertEqual(r.data['organizacion']['origen'], 'panel')
        self.assertTrue(r.data['organizacion']['es_gestor'])
        self.assertNotIn('password', r.data['cuenta'])

    def test_ficha_de_usuario_inexistente_404(self):
        self.assertEqual(self.cli.get('/api/usuarios/99999/ficha/').status_code, 404)

    def test_patch_ficha_guarda_todo_y_devuelve_la_ficha_nueva(self):
        r = self.cli.patch(f'/api/usuarios/{self.ana.id}/ficha/', {
            'cuenta': {'last_name': 'Pérez'},
            'panel': {'cargo': 'Jefa'},
            'departamentos': [self.sub.id],
        }, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['cuenta']['last_name'], 'Pérez')
        self.assertEqual(r.data['panel']['cargo'], 'Jefa')
        self.assertEqual(r.data['organizacion']['origen'], 'propio')
        self.assertEqual(r.data['organizacion']['departamentos_propios_ids'], [self.sub.id])

        h = self.cli.get(f'/api/usuarios/{self.ana.id}/historial/')
        self.assertEqual(h.status_code, 200)
        self.assertEqual({x['entidad'] for x in h.data}, {'cuenta', 'panel', 'asignacion'})
        self.assertEqual(h.data[0]['actor'], 'admin@x.cl')

    def test_patch_con_error_devuelve_400_con_errores_por_seccion_y_campo(self):
        r = self.cli.patch(f'/api/usuarios/{self.ana.id}/ficha/', {
            'cuenta': {'first_name': 'NoDebeGuardarse'},
            'panel': {'activo': 'Z', 'run': 'x' * 30},
        }, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('activo', r.data['errores']['panel'])
        self.assertIn('run', r.data['errores']['panel'])
        self.assertTrue(r.data['detail'])
        self.ana.refresh_from_db()
        self.assertEqual(self.ana.first_name, '')

    def test_patch_con_cuerpo_invalido(self):
        r = self.cli.patch(f'/api/usuarios/{self.ana.id}/ficha/', ['no', 'es', 'dict'], format='json')
        self.assertEqual(r.status_code, 400)

    def test_el_administrador_no_puede_quitarse_el_rol(self):
        r = self.cli.patch(f'/api/usuarios/{self.admin.id}/ficha/', {'perfil': {'role': 'viewer'}}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('role', r.data['errores']['perfil'])

    def test_endpoints_viejos_siguen_funcionando(self):
        r = self.cli.patch(f'/api/usuarios/{self.ana.id}/', {'perfil': {'role': 'viewer'}}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.cli.get('/api/usuarios/').status_code, 200)

    # ---- los caminos rápidos de la lista también quedan auditados y protegidos ----
    def test_patch_clasico_deja_auditoria(self):
        self.cli.patch(f'/api/usuarios/{self.ana.id}/', {'is_active': False}, format='json')
        self.cli.patch(f'/api/usuarios/{self.ana.id}/', {'perfil': {'role': 'finanzas'}}, format='json')
        h = {a.entidad: a for a in AuditoriaAdmin.objects.filter(usuario_afectado=self.ana)}
        self.assertEqual(h['cuenta'].cambios, {'is_active': [True, False]})
        self.assertEqual(h['perfil'].cambios, {'role': ['gestor_compras', 'finanzas']})
        self.assertEqual(h['perfil'].actor_nombre, 'admin@x.cl')

    def test_patch_clasico_sin_cambios_no_audita(self):
        self.cli.patch(f'/api/usuarios/{self.ana.id}/', {'perfil': {'role': 'gestor_compras'}}, format='json')
        self.assertEqual(AuditoriaAdmin.objects.count(), 0)

    def test_patch_clasico_protege_al_propio_administrador(self):
        r = self.cli.patch(f'/api/usuarios/{self.admin.id}/', {'perfil': {'role': 'viewer'}}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.cli.patch(f'/api/usuarios/{self.admin.id}/', {'is_active': False}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(PerfilUsuario.objects.get(user=self.admin).role, 'admin')
        self.assertEqual(AuditoriaAdmin.objects.count(), 0)

    def test_alta_y_baja_quedan_registradas(self):
        r = self.cli.post('/api/usuarios/', {
            'username': 'nueva@x.cl', 'email': 'nueva@x.cl', 'password': 'Clave1234',
            'perfil': {'role': 'viewer'},
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        alta = AuditoriaAdmin.objects.get(objeto_etiqueta='nueva@x.cl')
        self.assertEqual(alta.cambios['cuenta'], [None, 'creada'])
        self.assertNotIn('Clave1234', str(alta.cambios))

        self.assertEqual(self.cli.delete(f"/api/usuarios/{r.data['id']}/").status_code, 204)
        baja = AuditoriaAdmin.objects.filter(objeto_etiqueta='nueva@x.cl').order_by('-id').first()
        self.assertEqual(baja.cambios['cuenta'], ['existía', 'eliminada'])
        self.assertIsNone(baja.usuario_afectado_id)   # la cuenta ya no existe; la etiqueta queda

    # ---- previsualizar ----
    def test_previsualizar_alcance(self):
        r = self.cli.post(f'/api/usuarios/{self.ana.id}/previsualizar-alcance/',
                          {'departamentos': [self.raiz.id]}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['n_departamentos_en_alcance'], 2)
        self.assertEqual(r.data['departamentos'][0]['sub_departamentos'], ['SUB DEPTO'])

    def test_previsualizar_con_departamento_inexistente_400(self):
        r = self.cli.post(f'/api/usuarios/{self.ana.id}/previsualizar-alcance/',
                          {'departamentos': [99999]}, format='json')
        self.assertEqual(r.status_code, 400)

    # ---- organización ----
    def test_arbol_y_usuarios_panel(self):
        arbol = self.cli.get('/api/organizacion/arbol/')
        self.assertEqual(arbol.status_code, 200)
        self.assertEqual(arbol.data[0]['departamentos'][0]['id'], self.raiz.id)
        panel = self.cli.get('/api/organizacion/usuarios-panel/')
        self.assertEqual(panel.status_code, 200)
        self.assertEqual(panel.data[0]['vinculado_a'], 'ana@x.cl')

    def test_editar_departamento_y_su_historial(self):
        url = f'/api/organizacion/departamentos/{self.sub.id}/'
        g = self.cli.get(url)
        self.assertEqual(g.status_code, 200)
        self.assertIn('impacto', g.data)

        r = self.cli.patch(url, {'descripcion': 'SUB RENOMBRADO'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['descripcion'], 'SUB RENOMBRADO')
        self.assertIsNone(r.data['reclasificacion'])

        h = self.cli.get(url + 'historial/')
        self.assertEqual(h.data[0]['cambios']['descripcion'], ['SUB DEPTO', 'SUB RENOMBRADO'])

    def test_editar_departamento_errores(self):
        url = f'/api/organizacion/departamentos/{self.raiz.id}/'
        r = self.cli.patch(url, {'parent_id': self.sub.id}, format='json')   # ciclo
        self.assertEqual(r.status_code, 400)
        self.assertIn('parent_id', r.data['errores']['departamento'])
        self.assertEqual(self.cli.get('/api/organizacion/departamentos/99999/').status_code, 404)
        self.assertEqual(self.cli.patch('/api/organizacion/departamentos/99999/',
                                        {'descripcion': 'x'}, format='json').status_code, 404)
