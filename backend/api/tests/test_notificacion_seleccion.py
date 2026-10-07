"""Paso 4 del módulo Notificación: selección de planes notificables y endpoints."""
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import (
    Departamento, NotificacionPlanEnvio, NotificacionPlanItem, NotificacionPlanLote,
    OrdenCompra, PacProyectoMaestro, PerfilUsuario, PlanerPAC, UsuarioPanel,
)
from api.services_notificacion_plan import (
    historial_notificaciones, listar_planes_notificables, listar_responsables_por_confirmar,
    resolver_seleccion,
)

CORREO_OK = 'nicolas.asencio@redsalud.gob.cl'
PASADO, FUTURO = '2020-03-01 00:00:00', '2099-06-01 00:00:00'


def _plan(id_proyecto, responsable, fecha, depto='DPTO UNO', monto='1000', nombre=None, item='Item'):
    return PlanerPAC.objects.create(
        id_proyecto=id_proyecto, nombre_proyecto=nombre or f'Proyecto {id_proyecto}', depto=depto,
        sub='DIRECCION', nombre_responsable=responsable, cargo_responsable='Encargada',
        fecha_inicio_compra=fecha, monto_total_item=monto, nombre_item=item, pac='2026')


class BaseNotifTest(TestCase):
    def setUp(self):
        cache.clear()
        self.depto = Departamento.objects.create(descripcion='DPTO UNO', es_depto='SI',
                                                 subdireccion_id=2, establecimiento_id=1)
        UsuarioPanel.objects.create(usuario='ana', alias='ANA PEREZ', correo_electronico='ana@x.cl',
                                    activo='S', establecimiento_id=1)
        UsuarioPanel.objects.create(usuario='bruno', alias='BRUNO OJEDA', correo_electronico='bruno@x.cl',
                                    activo='S', establecimiento_id=1)
        _plan('P-1', 'Ana Perez', PASADO, monto='500')                      # atrasado, correo exacto
        _plan('P-2', 'Ana Perez', FUTURO, monto='700')                      # pendiente
        _plan('P-3', 'Bruno Ojeda Alvarez', PASADO)                         # atrasado, correo sugerido
        _plan('P-4', 'Persona Desconocida', None)                           # sin fecha, sin correo
        _plan('P-5', 'Ana Perez', PASADO)                                   # lo dejamos ejecutado (OC)
        OrdenCompra.objects.create(codigo_oc='OC-5')
        PacProyectoMaestro.objects.create(id_proyecto='P-5', oc_asociada='OC-5', anho_pac=2026)


class ListadoTest(BaseNotifTest):
    def _listar(self, **kw):
        return listar_planes_notificables(anho=2026, **kw)

    def test_excluye_planes_ejecutados(self):
        ids = {r['id_proyecto'] for r in self._listar()['results']}
        self.assertEqual(ids, {'P-1', 'P-2', 'P-3', 'P-4'})

    def test_filtra_por_estado(self):
        ids = {r['id_proyecto'] for r in self._listar(estados=['ATRASADO'])['results']}
        self.assertEqual(ids, {'P-1', 'P-3'})
        ids = {r['id_proyecto'] for r in self._listar(estados=['PENDIENTE', 'SIN_FECHA'])['results']}
        self.assertEqual(ids, {'P-2', 'P-4'})

    def test_estado_invalido_se_ignora_y_no_deja_pasar_ejecutados(self):
        ids = {r['id_proyecto'] for r in self._listar(estados=['EJECUTADO'])['results']}
        self.assertNotIn('P-5', ids)

    def test_filtra_por_mes_de_fecha_de_compra(self):
        ids = {r['id_proyecto'] for r in self._listar(mes='2099-06')['results']}
        self.assertEqual(ids, {'P-2'})
        ids = {r['id_proyecto'] for r in self._listar(mes='2020-03')['results']}
        self.assertEqual(ids, {'P-1', 'P-3'})

    def test_mes_mal_formado_se_ignora(self):
        self.assertEqual(self._listar(mes='2020-13')['count'], 4)
        self.assertEqual(self._listar(mes="2020-03' OR 1=1")['count'], 4)

    def test_busqueda_por_texto_y_responsable(self):
        self.assertEqual({r['id_proyecto'] for r in self._listar(search='bruno')['results']}, {'P-3'})
        self.assertEqual(self._listar(responsable='ana perez')['count'], 2)

    def test_estado_de_correo_por_plan(self):
        por_id = {r['id_proyecto']: r for r in self._listar()['results']}
        self.assertEqual((por_id['P-1']['correo_estado'], por_id['P-1']['correo']), ('EXACTO', 'ana@x.cl'))
        self.assertEqual((por_id['P-3']['correo_estado'], por_id['P-3']['correo']), ('SUGERIDO', ''))
        self.assertEqual(por_id['P-4']['correo_estado'], 'SIN_CORREO')

    def test_filtro_con_y_sin_correo(self):
        self.assertEqual({r['id_proyecto'] for r in self._listar(correo='con')['results']}, {'P-1', 'P-2'})
        self.assertEqual({r['id_proyecto'] for r in self._listar(correo='sin')['results']}, {'P-3', 'P-4'})

    def test_kpis(self):
        k = self._listar()['kpis']
        self.assertEqual(k['planes'], 4)
        self.assertEqual(k['responsables'], 3)
        self.assertEqual(k['planes_con_correo'], 2)
        self.assertEqual(k['responsables_por_confirmar'], 2)
        self.assertEqual(k['planes_ya_notificados'], 0)
        self.assertEqual(k['monto_total'], 500 + 700 + 1000 + 1000)

    def test_paginacion(self):
        r = self._listar(page=2, page_size=3)
        self.assertEqual((r['count'], len(r['results'])), (4, 1))

    def test_departamento_vacio_no_significa_todo(self):
        self.assertEqual(self._listar(depto_ids=[])['count'], 0)
        self.assertEqual(self._listar(depto_ids=[self.depto.id])['count'], 4)
        self.assertEqual(self._listar(depto_ids=[self.depto.id + 999])['count'], 0)

    def test_fecha_de_compra_ordena_la_lista(self):
        fechas = [r['fecha_mas_proxima'] for r in self._listar()['results']]
        self.assertEqual(fechas, sorted(fechas, key=lambda f: (f is None, f or '')))


class PersonasDistintasTest(BaseNotifTest):
    def test_dos_formas_de_escribir_a_la_misma_persona_cuentan_una_vez(self):
        _plan('P-6', 'Ana  PEREZ', PASADO)       # misma persona que 'Ana Perez', escrita distinto
        r = listar_planes_notificables(anho=2026)
        self.assertEqual(r['kpis']['responsables'], 3)        # Ana, Beto, Persona Desconocida (no 4)
        from api.services_notificacion_plan import previsualizar_lote
        prev = previsualizar_lote({'anho': 2026, 'ids': ['P-1', 'P-2', 'P-6']}, None)
        self.assertEqual(len(prev['enviables']), 1)           # un solo correo para Ana
        self.assertEqual(prev['enviables'][0]['planes'], 3)


class HistorialTest(BaseNotifTest):
    def _enviar(self, id_proyecto, prueba, estado='ENVIADO'):
        lote = NotificacionPlanLote.objects.create(modo_prueba=prueba, anho=2026)
        envio = NotificacionPlanEnvio.objects.create(
            lote=lote, nombre_responsable='Ana Perez', estado=estado,
            enviado_en=timezone.now() if estado == 'ENVIADO' else None)
        NotificacionPlanItem.objects.create(envio=envio, id_proyecto=id_proyecto, anho=2026)

    def test_envio_real_marca_notificado_y_filtra(self):
        self._enviar('P-1', prueba=False)
        r = listar_planes_notificables(anho=2026)
        fila = next(x for x in r['results'] if x['id_proyecto'] == 'P-1')
        self.assertEqual(fila['notificado_veces'], 1)
        self.assertIsNotNone(fila['ultimo_envio'])
        self.assertEqual(r['kpis']['planes_ya_notificados'], 1)
        self.assertEqual({x['id_proyecto'] for x in listar_planes_notificables(
            anho=2026, notificado='si')['results']}, {'P-1'})
        self.assertNotIn('P-1', {x['id_proyecto'] for x in listar_planes_notificables(
            anho=2026, notificado='no')['results']})

    def test_envio_de_prueba_no_cuenta_como_notificado(self):
        self._enviar('P-1', prueba=True)
        fila = next(x for x in listar_planes_notificables(anho=2026)['results'] if x['id_proyecto'] == 'P-1')
        self.assertEqual((fila['notificado_veces'], fila['pruebas_veces']), (0, 1))

    def test_envio_fallido_no_cuenta(self):
        self._enviar('P-1', prueba=False, estado='ERROR')
        self.assertEqual(historial_notificaciones(['P-1']), {})


class ResponsablesPendientesTest(BaseNotifTest):
    def test_lista_solo_los_que_necesitan_confirmacion(self):
        filas = listar_responsables_por_confirmar(anho=2026)
        self.assertEqual({f['nombre_responsable'] for f in filas},
                         {'Bruno Ojeda Alvarez', 'Persona Desconocida'})
        bruno = next(f for f in filas if f['nombre_responsable'] == 'Bruno Ojeda Alvarez')
        self.assertEqual(bruno['candidatos'][0]['correo'], 'bruno@x.cl')
        self.assertEqual(bruno['planes'], 1)


class SeleccionTest(BaseNotifTest):
    def _ids(self, **seleccion):
        return {f['id_proyecto'] for f in resolver_seleccion({'anho': 2026, **seleccion})}

    def test_por_ids(self):
        self.assertEqual(self._ids(ids=['P-1', 'P-2']), {'P-1', 'P-2'})

    def test_un_id_ejecutado_o_inexistente_se_ignora(self):
        self.assertEqual(self._ids(ids=['P-5', 'NO-EXISTE', 'P-1']), {'P-1'})

    def test_ids_vacio_no_selecciona_nada(self):
        self.assertEqual(self._ids(ids=[]), set())

    def test_todos_los_filtrados_con_exclusiones(self):
        self.assertEqual(self._ids(filtros={'estados': ['ATRASADO']}, excluir=['P-3']), {'P-1'})

    def test_todos_los_filtrados_por_correo(self):
        self.assertEqual(self._ids(filtros={'correo': 'con'}), {'P-1', 'P-2'})

    def test_se_acota_al_alcance(self):
        self.assertEqual({f['id_proyecto'] for f in resolver_seleccion(
            {'anho': 2026, 'ids': ['P-1']}, depto_ids=[])}, set())


@override_settings(NOTIF_PLAN_USUARIOS=[CORREO_OK])
class EndpointsTest(BaseNotifTest):
    def setUp(self):
        super().setUp()
        self.notificador = User.objects.create_user('nico', email=CORREO_OK, password='x')
        PerfilUsuario.objects.create(user=self.notificador, role='admin')
        self.otro_admin = User.objects.create_user('otro', email='otro@redsalud.gob.cl', password='x')
        PerfilUsuario.objects.create(user=self.otro_admin, role='admin')
        self.client = APIClient()

    URLS_GET = ('/api/gestor-compras/notificacion/planes/',
                '/api/gestor-compras/notificacion/responsables-pendientes/')

    def test_sin_login_es_401(self):
        for url in self.URLS_GET:
            self.assertEqual(self.client.get(url).status_code, 401, url)

    def test_otro_admin_recibe_403_en_todos_los_endpoints(self):
        self.client.force_authenticate(self.otro_admin)
        for url in self.URLS_GET:
            self.assertEqual(self.client.get(url).status_code, 403, url)
        r = self.client.post('/api/gestor-compras/notificacion/confirmar-correo/',
                             {'nombre_responsable': 'X', 'correo': 'a@x.cl'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_notificador_lista_planes(self):
        self.client.force_authenticate(self.notificador)
        r = self.client.get('/api/gestor-compras/notificacion/planes/', {'anho': 2026, 'estado': 'ATRASADO'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual({x['id_proyecto'] for x in r.data['results']}, {'P-1', 'P-3'})
        self.assertIn('kpis', r.data)

    def test_filtros_invalidos_no_rompen(self):
        self.client.force_authenticate(self.notificador)
        r = self.client.get('/api/gestor-compras/notificacion/planes/',
                            {'anho': 'abc', 'page': 'x', 'page_size': '-5', 'correo': 'zzz', 'mes': "' OR 1=1"})
        self.assertEqual(r.status_code, 200)

    def test_confirmar_correo_y_luego_queda_confirmado(self):
        self.client.force_authenticate(self.notificador)
        r = self.client.post('/api/gestor-compras/notificacion/confirmar-correo/',
                             {'nombre_responsable': 'Persona Desconocida', 'correo': 'persona@x.cl'}, format='json')
        self.assertEqual(r.status_code, 200)
        r = self.client.get('/api/gestor-compras/notificacion/planes/', {'anho': 2026})
        p4 = next(x for x in r.data['results'] if x['id_proyecto'] == 'P-4')
        self.assertEqual((p4['correo_estado'], p4['correo']), ('CONFIRMADO', 'persona@x.cl'))

    def test_confirmar_correo_invalido_es_400(self):
        self.client.force_authenticate(self.notificador)
        r = self.client.post('/api/gestor-compras/notificacion/confirmar-correo/',
                             {'nombre_responsable': 'Persona', 'correo': 'no-es-correo'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_mi_alcance_informa_si_puede_notificar(self):
        self.client.force_authenticate(self.notificador)
        self.assertTrue(self.client.get('/api/gestor-compras/mi-alcance/').data['puede_notificar'])
        self.client.force_authenticate(self.otro_admin)
        self.assertFalse(self.client.get('/api/gestor-compras/mi-alcance/').data['puede_notificar'])
