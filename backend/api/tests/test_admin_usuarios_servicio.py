"""Servicio de administración de usuarios: ficha, guardado atómico, auditoría y jerarquía.

UsuarioPanel/Departamento/PertenenciaUsuario son managed=False: el runner de pruebas crea sus
tablas (core/test_runner.py).
"""
from unittest import mock

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase

from api.models import (
    AsignacionDepartamentoUsuario, AuditoriaAdmin, Departamento, Establecimiento, FormularioFSC,
    PerfilUsuario, PertenenciaUsuario, UsuarioPanel,
)
from api.services import resolver_alcance_gestor
from api.services_admin_usuarios import (
    ErrorAdministracion, aplicar_cambios_ficha, construir_arbol_organizacion, detalle_departamento,
    editar_departamento, listar_historial, listar_usuarios_panel, obtener_ficha_usuario,
    previsualizar_alcance_departamentos,
)


class BaseAdminTest(TestCase):
    def setUp(self):
        cache.clear()
        # `Establecimiento.id`=1 (lo usa data_departamento) y `codigo`=197 (lo usa el Panel).
        Establecimiento.objects.create(codigo=197, rut=1, dv='1', descripcion='DIRECCION SS OSORNO')
        Establecimiento.objects.create(codigo=198, rut=2, dv='2', descripcion='HOSPITAL PURRANQUE')
        self.raiz = Departamento.objects.create(
            descripcion='DEPARTAMENTO RAIZ', es_depto='SI', subdireccion_id=2, establecimiento_id=1)
        self.sub = Departamento.objects.create(
            descripcion='SUB DEPTO', parent_id=self.raiz.id, subdireccion_id=2, establecimiento_id=1)
        self.otro = Departamento.objects.create(
            descripcion='OTRO DEPARTAMENTO', es_depto='SI', subdireccion_id=3, establecimiento_id=1)

        self.admin = User.objects.create_user('admin@x.cl', 'admin@x.cl', 'x')
        PerfilUsuario.objects.create(user=self.admin, role='admin')

        self.panel = UsuarioPanel.objects.create(
            usuario='ANA.PEREZ', correo_electronico='ana@x.cl', alias='ANA PEREZ', activo='S',
            establecimiento_id=197, cargo='Enfermera', run='1-9')
        PertenenciaUsuario.objects.create(
            id_usuario=self.panel.id, tipo_dependencia='DEP', id_dependencia=self.raiz.id, id_subdireccion=2)
        self.ana = User.objects.create_user('ana@x.cl', 'ana@x.cl', 'x', first_name='Ana')
        PerfilUsuario.objects.create(user=self.ana, role='viewer', panel_id=self.panel.id, cargo='Enfermera')


class FichaTest(BaseAdminTest):
    def test_ficha_trae_cuenta_perfil_panel_y_organizacion(self):
        f = obtener_ficha_usuario(self.ana)
        self.assertEqual(f['cuenta']['username'], 'ana@x.cl')
        self.assertEqual(f['perfil']['role'], 'viewer')
        self.assertEqual(f['panel']['alias'], 'ANA PEREZ')
        org = f['organizacion']
        self.assertEqual(org['origen'], 'panel')
        self.assertEqual([d['id'] for d in org['departamentos_panel']], [self.raiz.id])
        self.assertEqual(org['departamentos_propios'], [])
        self.assertEqual(org['alcance']['n_departamentos_en_alcance'], 2)   # raíz + sub

    def test_ruta_muestra_la_jerarquia_completa(self):
        AsignacionDepartamentoUsuario.objects.create(user=self.ana, departamento_id=self.sub.id)
        f = obtener_ficha_usuario(self.ana)
        ruta = f['organizacion']['departamentos_propios'][0]['ruta']
        self.assertTrue(ruta.endswith('DEPARTAMENTO RAIZ › SUB DEPTO'), ruta)

    def test_usuario_sin_departamento_se_marca_como_ninguno(self):
        PertenenciaUsuario.objects.all().delete()
        f = obtener_ficha_usuario(self.ana)
        self.assertEqual(f['organizacion']['origen'], 'ninguno')
        self.assertIsNone(f['organizacion']['alcance'])
        self.assertTrue(f['organizacion']['motivo_sin_alcance'])

    def test_listar_usuarios_panel_indica_a_quien_estan_vinculados(self):
        libre = UsuarioPanel.objects.create(
            usuario='LIBRE', correo_electronico='l@x.cl', activo='S', establecimiento_id=1)
        filas = {f['id']: f for f in listar_usuarios_panel()}
        self.assertEqual(filas[self.panel.id]['vinculado_a'], 'ana@x.cl')
        self.assertIsNone(filas[libre.id]['vinculado_a'])


class GuardadoTest(BaseAdminTest):
    def test_cuenta_perfil_y_panel_en_un_solo_guardado_con_auditoria(self):
        f = aplicar_cambios_ficha(self.admin, self.ana, {
            'cuenta': {'first_name': 'Anita', 'is_active': False},
            'perfil': {'role': 'gestor_compras', 'cargo': 'Jefa de Enfermería'},
            'panel': {'cargo': 'JEFA ENFERMERIA', 'activo': 'n'},
        })
        self.ana.refresh_from_db()
        self.assertEqual(self.ana.first_name, 'Anita')
        self.assertFalse(self.ana.is_active)
        self.assertEqual(f['perfil']['role'], 'gestor_compras')
        self.panel.refresh_from_db()
        self.assertEqual(self.panel.cargo, 'JEFA ENFERMERIA')
        self.assertEqual(self.panel.activo, 'N')

        por_entidad = {a.entidad: a for a in AuditoriaAdmin.objects.all()}
        self.assertEqual(set(por_entidad), {'cuenta', 'perfil', 'panel'})
        self.assertEqual(por_entidad['cuenta'].cambios['first_name'], ['Ana', 'Anita'])
        self.assertEqual(por_entidad['perfil'].cambios['role'], ['viewer', 'gestor_compras'])
        self.assertEqual(por_entidad['panel'].cambios['activo'], ['S', 'N'])
        self.assertEqual(por_entidad['panel'].actor_nombre, 'admin@x.cl')
        self.assertEqual(por_entidad['panel'].usuario_afectado_id, self.ana.id)

    def test_la_contrasena_cambia_pero_nunca_queda_en_la_auditoria(self):
        aplicar_cambios_ficha(self.admin, self.ana, {'cuenta': {'password': 'NuevaClave123'}})
        self.ana.refresh_from_db()
        self.assertTrue(self.ana.check_password('NuevaClave123'))
        registro = AuditoriaAdmin.objects.get(entidad='cuenta')
        self.assertEqual(registro.cambios, {'password': ['—', 'actualizada']})
        self.assertNotIn('NuevaClave123', str(registro.cambios))

    def test_contrasena_vacia_no_cambia_nada(self):
        antes = self.ana.password
        aplicar_cambios_ficha(self.admin, self.ana, {'cuenta': {'password': ''}})
        self.ana.refresh_from_db()
        self.assertEqual(self.ana.password, antes)
        self.assertEqual(AuditoriaAdmin.objects.count(), 0)

    def test_contrasena_corta_se_rechaza(self):
        with self.assertRaises(ErrorAdministracion) as cm:
            aplicar_cambios_ficha(self.admin, self.ana, {'cuenta': {'password': '123'}})
        self.assertIn('password', cm.exception.detalle['cuenta'])

    def test_si_una_seccion_falla_no_se_guarda_ninguna(self):
        with self.assertRaises(ErrorAdministracion):
            aplicar_cambios_ficha(self.admin, self.ana, {
                'cuenta': {'first_name': 'Cambiado'},
                'panel': {'run': 'x' * 40},          # excede 15
            })
        self.ana.refresh_from_db()
        self.assertEqual(self.ana.first_name, 'Ana')
        self.assertEqual(AuditoriaAdmin.objects.count(), 0)

    def test_sin_cambios_reales_no_audita(self):
        aplicar_cambios_ficha(self.admin, self.ana, {
            'cuenta': {'first_name': 'Ana'}, 'panel': {'cargo': 'Enfermera'},
        })
        self.assertEqual(AuditoriaAdmin.objects.count(), 0)

    def test_campo_no_editable_se_rechaza_en_vez_de_ignorarse(self):
        with self.assertRaises(ErrorAdministracion) as cm:
            aplicar_cambios_ficha(self.admin, self.ana, {'cuenta': {'is_superuser': True}})
        self.assertIn('is_superuser', cm.exception.detalle['cuenta'])
        with self.assertRaises(ErrorAdministracion) as cm:
            aplicar_cambios_ficha(self.admin, self.ana, {'panel': {'id': 5}})
        self.assertIn('id', cm.exception.detalle['panel'])
        with self.assertRaises(ErrorAdministracion):
            aplicar_cambios_ficha(self.admin, self.ana, {'seccion_rara': {}})

    def test_validaciones_del_panel(self):
        casos = [
            ({'activo': 'X'}, 'activo'),
            ({'correo_electronico': 'no-es-correo'}, 'correo_electronico'),
            ({'usuario': ''}, 'usuario'),
            ({'establecimiento_id': 'abc'}, 'establecimiento_id'),
            ({'establecimiento_id': 999}, 'establecimiento_id'),
            ({'establecimiento_id': 2}, 'establecimiento_id'),   # un `id`, no un código del Panel
        ]
        for cambios, campo in casos:
            with self.subTest(campo=campo, cambios=cambios):
                with self.assertRaises(ErrorAdministracion) as cm:
                    aplicar_cambios_ficha(self.admin, self.ana, {'panel': cambios})
                self.assertIn(campo, cm.exception.detalle['panel'])

    def test_el_establecimiento_del_panel_se_valida_por_codigo(self):
        f = aplicar_cambios_ficha(self.admin, self.ana, {'panel': {'establecimiento_id': 198}})
        self.assertEqual(f['panel']['establecimiento_id'], 198)

    def test_panel_exige_cuenta_vinculada(self):
        self.ana.perfil.panel_id = None
        self.ana.perfil.save()
        with self.assertRaises(ErrorAdministracion) as cm:
            aplicar_cambios_ficha(self.admin, self.ana, {'panel': {'cargo': 'X'}})
        self.assertIn('panel', cm.exception.detalle)

    def test_username_duplicado_da_mensaje_legible(self):
        with self.assertRaises(ErrorAdministracion) as cm:
            aplicar_cambios_ficha(self.admin, self.ana, {'cuenta': {'username': 'admin@x.cl'}})
        self.assertEqual(cm.exception.detalle['cuenta']['username'], 'Ya existe otro registro con este valor.')

    def test_revincular_al_panel(self):
        otro_panel = UsuarioPanel.objects.create(
            usuario='LIBRE', correo_electronico='l@x.cl', activo='S', establecimiento_id=1)
        f = aplicar_cambios_ficha(self.admin, self.ana, {'perfil': {'panel_id': otro_panel.id}})
        self.assertEqual(f['perfil']['panel_id'], otro_panel.id)
        self.assertEqual(f['panel']['correo_electronico'], 'l@x.cl')

    def test_panel_id_inexistente_u_ocupado_se_rechaza(self):
        with self.assertRaises(ErrorAdministracion) as cm:
            aplicar_cambios_ficha(self.admin, self.ana, {'perfil': {'panel_id': 99999}})
        self.assertIn('panel_id', cm.exception.detalle['perfil'])

        otra = User.objects.create_user('otra@x.cl', 'otra@x.cl', 'x')
        PerfilUsuario.objects.create(user=otra, role='viewer')
        with self.assertRaises(ErrorAdministracion) as cm:
            aplicar_cambios_ficha(self.admin, otra, {'perfil': {'panel_id': self.panel.id}})
        self.assertIn('ana@x.cl', cm.exception.detalle['perfil']['panel_id'])

    def test_establecimiento_vacio_llega_como_null_no_como_error(self):
        self.ana.perfil.establecimiento_id = 1
        self.ana.perfil.save()
        f = aplicar_cambios_ficha(self.admin, self.ana, {'perfil': {'establecimiento_id': ''}})
        self.assertIsNone(f['perfil']['establecimiento_id'])

    def test_rol_invalido_se_rechaza(self):
        with self.assertRaises(ErrorAdministracion) as cm:
            aplicar_cambios_ficha(self.admin, self.ana, {'perfil': {'role': 'dios'}})
        self.assertIn('role', cm.exception.detalle['perfil'])

    def test_un_administrador_no_puede_desactivarse_ni_quitarse_el_rol(self):
        with self.assertRaises(ErrorAdministracion):
            aplicar_cambios_ficha(self.admin, self.admin, {'cuenta': {'is_active': False}})
        with self.assertRaises(ErrorAdministracion):
            aplicar_cambios_ficha(self.admin, self.admin, {'perfil': {'role': 'viewer'}})
        # Sí puede editar otros datos propios.
        aplicar_cambios_ficha(self.admin, self.admin, {'perfil': {'cargo': 'TIC'}})
        self.assertEqual(PerfilUsuario.objects.get(user=self.admin).cargo, 'TIC')


class AsignacionTest(BaseAdminTest):
    def setUp(self):
        super().setUp()
        self.ana.perfil.role = 'gestor_compras'
        self.ana.perfil.save()
        for unidad in ('DEPARTAMENTO RAIZ', 'SUB DEPTO', 'OTRO DEPARTAMENTO'):
            FormularioFSC.objects.create(folio=1, anho=2026, unidad_requirente=unidad)

    def test_asignar_departamento_reemplaza_al_del_panel(self):
        f = aplicar_cambios_ficha(self.admin, self.ana, {'departamentos': [self.otro.id]})
        self.assertEqual(f['organizacion']['origen'], 'propio')
        self.assertEqual(f['organizacion']['departamentos_propios_ids'], [self.otro.id])
        self.assertEqual(resolver_alcance_gestor(self.ana)['unidades'], ['OTRO DEPARTAMENTO'])

        registro = AuditoriaAdmin.objects.get(entidad='asignacion')
        self.assertEqual(registro.cambios['departamentos'][1], ['OTRO DEPARTAMENTO'])
        self.assertEqual(registro.cambios['departamentos'][0], ['(la del Panel SSO)'])
        self.assertEqual(AsignacionDepartamentoUsuario.objects.get().asignado_por_id, self.admin.id)

    def test_lista_vacia_vuelve_a_la_del_panel(self):
        aplicar_cambios_ficha(self.admin, self.ana, {'departamentos': [self.otro.id]})
        f = aplicar_cambios_ficha(self.admin, self.ana, {'departamentos': []})
        self.assertEqual(f['organizacion']['origen'], 'panel')
        self.assertEqual(AsignacionDepartamentoUsuario.objects.count(), 0)

    def test_cambio_de_asignacion_se_ve_de_inmediato_pese_a_la_cache(self):
        with self.settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}):
            cache.clear()
            self.assertEqual(resolver_alcance_gestor(self.ana)['origen'], 'panel')   # queda en cache
            aplicar_cambios_ficha(self.admin, self.ana, {'departamentos': [self.otro.id]})
            self.assertEqual(resolver_alcance_gestor(self.ana)['origen'], 'propio')
            cache.clear()

    def test_ids_invalidos_se_rechazan(self):
        for malo in (None, 'x', [99999], ['abc'], [True]):
            with self.subTest(malo=malo):
                with self.assertRaises(ErrorAdministracion) as cm:
                    aplicar_cambios_ficha(self.admin, self.ana, {'departamentos': malo})
                self.assertIn('departamentos', cm.exception.detalle)

    def test_repetidos_se_colapsan(self):
        aplicar_cambios_ficha(self.admin, self.ana, {'departamentos': [self.otro.id, self.otro.id, str(self.otro.id)]})
        self.assertEqual(AsignacionDepartamentoUsuario.objects.count(), 1)

    def test_previsualizar_coincide_con_lo_que_vera_el_gestor(self):
        prev = previsualizar_alcance_departamentos([self.raiz.id])
        aplicar_cambios_ficha(self.admin, self.ana, {'departamentos': [self.raiz.id]})
        real = resolver_alcance_gestor(self.ana)
        self.assertEqual(prev['n_departamentos_en_alcance'], len(real['depto_ids']))
        self.assertEqual(prev['n_unidades'], len(real['unidades']))
        self.assertEqual(prev['n_formularios'], 2)   # RAIZ + SUB

    def test_previsualizar_vacio(self):
        self.assertEqual(previsualizar_alcance_departamentos([])['n_formularios'], 0)
        with self.assertRaises(ErrorAdministracion):
            previsualizar_alcance_departamentos([99999])


class HistorialTest(BaseAdminTest):
    def test_historial_por_usuario_mas_reciente_primero(self):
        aplicar_cambios_ficha(self.admin, self.ana, {'cuenta': {'first_name': 'Uno'}})
        aplicar_cambios_ficha(self.admin, self.ana, {'cuenta': {'first_name': 'Dos'}})
        h = listar_historial(usuario_id=self.ana.id)
        self.assertEqual([x['cambios']['first_name'][1] for x in h], ['Dos', 'Uno'])
        self.assertEqual(h[0]['entidad_etiqueta'], 'Cuenta de acceso')
        self.assertEqual(listar_historial(usuario_id=self.admin.id), [])


class JerarquiaTest(BaseAdminTest):
    def test_arbol_agrupa_por_rama_y_anida_sub_departamentos(self):
        arbol = construir_arbol_organizacion()
        rama2 = next(r for r in arbol if r['subdireccion_id'] == 2)
        raiz = next(d for d in rama2['departamentos'] if d['id'] == self.raiz.id)
        self.assertEqual([h['id'] for h in raiz['hijos']], [self.sub.id])
        self.assertTrue(raiz['es_depto'])
        # El departamento de otra subdirección va en su propia rama.
        rama3 = next(r for r in arbol if r['subdireccion_id'] == 3)
        self.assertEqual([d['id'] for d in rama3['departamentos']], [self.otro.id])

    def test_los_hospitales_se_agrupan_en_una_sola_rama(self):
        Establecimiento.objects.create(id=7, codigo=7, rut=7, dv='7', descripcion='HOSPITAL BASE')
        for sub in (26, 27, 28):
            Departamento.objects.create(descripcion=f'UNIDAD {sub}', subdireccion_id=sub, establecimiento_id=7)
        ramas = [r for r in construir_arbol_organizacion() if r['establecimiento_id'] == 7]
        self.assertEqual(len(ramas), 1)
        self.assertEqual(ramas[0]['nombre'], 'HOSPITAL BASE')
        self.assertEqual(len(ramas[0]['departamentos']), 3)
        self.assertIsNone(ramas[0]['subdireccion_id'])

    def test_arbol_no_pierde_nodos_con_ciclo(self):
        a = Departamento.objects.create(descripcion='A', subdireccion_id=4, establecimiento_id=1)
        b = Departamento.objects.create(descripcion='B', parent_id=a.id, subdireccion_id=4, establecimiento_id=1)
        Departamento.objects.filter(id=a.id).update(parent_id=b.id)   # A↔B, ninguno es raíz

        def ids(nodos):
            for n in nodos:
                yield n['id']
                yield from ids(n['hijos'])
        todos = set(ids(d for r in construir_arbol_organizacion() for d in r['departamentos']))
        self.assertTrue({a.id, b.id} <= todos)

    def test_detalle_informa_el_impacto(self):
        FormularioFSC.objects.create(folio=1, anho=2026, unidad_requirente='Departamento  Raíz')
        AsignacionDepartamentoUsuario.objects.create(user=self.ana, departamento_id=self.raiz.id)
        d = detalle_departamento(self.raiz.id)
        self.assertEqual(d['impacto']['n_sub_departamentos'], 1)
        self.assertEqual(d['impacto']['n_usuarios_panel'], 1)
        self.assertEqual(d['impacto']['n_usuarios_asignados'], 1)
        self.assertEqual(d['impacto']['n_formularios'], 1)   # calza normalizando tildes/espacios

    def test_renombrar_audita_y_actualiza(self):
        r = editar_departamento(self.admin, self.sub.id, {'descripcion': 'SUB RENOMBRADO', 'nombre_corto': 'SR'})
        self.assertEqual(r['descripcion'], 'SUB RENOMBRADO')
        self.assertEqual(r['cambios']['descripcion'], ['SUB DEPTO', 'SUB RENOMBRADO'])
        a = AuditoriaAdmin.objects.get(entidad='departamento')
        self.assertEqual(a.objeto_id, str(self.sub.id))
        self.assertIsNone(a.usuario_afectado_id)

    def test_mover_a_otro_padre(self):
        r = editar_departamento(self.admin, self.sub.id, {'parent_id': self.otro.id, 'subdireccion_id': 3})
        self.assertEqual(r['parent_id'], self.otro.id)
        self.assertIn('SUB DEPTO', r['ruta'])
        self.assertIn('OTRO DEPARTAMENTO', r['ruta'])

    def test_al_mover_hereda_subdireccion_y_establecimiento_del_padre(self):
        # `otro` está en la subdirección 3; sin heredarla, `sub` (subdir 2) quedaría "huérfano".
        r = editar_departamento(self.admin, self.sub.id, {'parent_id': self.otro.id})
        self.assertEqual(r['subdireccion_id'], 3)
        self.assertIn('OTRO DEPARTAMENTO', r['ruta'])
        # Si el administrador la indica explícitamente, se respeta.
        r = editar_departamento(self.admin, self.sub.id, {'parent_id': self.raiz.id, 'subdireccion_id': 9})
        self.assertEqual(r['subdireccion_id'], 9)

    def test_arbol_expone_subdireccion_y_establecimiento_por_nodo(self):
        rama = next(r for r in construir_arbol_organizacion() if r['subdireccion_id'] == 2)
        raiz = next(d for d in rama['departamentos'] if d['id'] == self.raiz.id)
        self.assertEqual((raiz['subdireccion_id'], raiz['establecimiento_id']), (2, 1))

    def test_no_permite_ciclos_ni_padre_propio_ni_inexistente(self):
        for padre in (self.sub.id, 99999):   # sub no puede colgar de sí mismo ni de un inexistente
            with self.subTest(padre=padre):
                with self.assertRaises(ErrorAdministracion) as cm:
                    editar_departamento(self.admin, self.sub.id, {'parent_id': padre})
                self.assertIn('parent_id', cm.exception.detalle['departamento'])
        # raiz como hija de su propio descendiente = ciclo
        with self.assertRaises(ErrorAdministracion) as cm:
            editar_departamento(self.admin, self.raiz.id, {'parent_id': self.sub.id})
        self.assertIn('ciclo', cm.exception.detalle['departamento']['parent_id'])

    def test_nombre_obligatorio_y_campo_desconocido(self):
        with self.assertRaises(ErrorAdministracion):
            editar_departamento(self.admin, self.sub.id, {'descripcion': '  '})
        with self.assertRaises(ErrorAdministracion):
            editar_departamento(self.admin, self.sub.id, {'estado_id': 9})

    def test_es_depto_vacio_queda_null(self):
        editar_departamento(self.admin, self.raiz.id, {'es_depto': ''})
        self.assertIsNone(Departamento.objects.get(id=self.raiz.id).es_depto)

    def test_departamento_inexistente_da_404(self):
        with self.assertRaises(ErrorAdministracion) as cm:
            editar_departamento(self.admin, 99999, {'descripcion': 'x'})
        self.assertEqual(cm.exception.status, 404)

    def test_reclasificar_solo_si_se_pide_y_hubo_cambios(self):
        with mock.patch('api.services_admin_usuarios.reclasificar_dentro_fuera_pac',
                        return_value={'actualizados': 3}) as rec:
            editar_departamento(self.admin, self.sub.id, {'descripcion': 'NUEVO'})
            rec.assert_not_called()
            r = editar_departamento(self.admin, self.sub.id, {'descripcion': 'NUEVO 2'}, reclasificar=True)
            rec.assert_called_once()
            self.assertEqual(r['reclasificacion'], {'actualizados': 3})
            rec.reset_mock()
            editar_departamento(self.admin, self.sub.id, {'descripcion': 'NUEVO 2'}, reclasificar=True)
            rec.assert_not_called()   # sin cambios reales no hace falta
