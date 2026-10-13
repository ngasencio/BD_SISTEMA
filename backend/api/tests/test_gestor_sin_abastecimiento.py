"""El rol `gestor_compras` NO ve el módulo Abastecimiento: solo su propio «Gestor de Compras».

Licitaciones, Órdenes de Compra, PAC (Res.188) y Compra Ágil estaban abiertos a cualquier usuario
autenticado; ahora el backend los rechaza (403) para el gestor, igual que ya lo hacía con
/pac-cumplimiento/*. El resto de los roles sigue como antes.
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import PerfilUsuario

# GET de las vistas de los 4 módulos. El permiso se evalúa antes que la vista, así que para el
# gestor basta con que respondan 403 sin tocar la base.
GET_ABASTECIMIENTO = [
    # Licitaciones
    '/api/licitaciones/', '/api/detalles/', '/api/dashboard/stats/',
    '/api/licitaciones/anos/', '/api/licitaciones/ahorro-stats/', '/api/licitaciones/gestion-stats/',
    '/api/licitaciones/calendario/', '/api/licitaciones/anos-calendario/',
    # Órdenes de Compra
    '/api/ordenes-compra/', '/api/ordenes-compra-detalles/', '/api/ordenes-compra/raw_all/',
    '/api/ordenes-compra/proyectos-licitacion/', '/api/ordenes-compra-detalles/por-oc/',
    # PAC (Res.188)
    '/api/planer-pac/', '/api/pac/indicadores-res188/', '/api/pac/oc-stats/', '/api/pac/oc-productos/',
    '/api/pac/reporte/word/', '/api/pac/reporte/ppt/', '/api/pac/reporte/pdf/',
    # Compra Ágil
    '/api/compraagil-resumen/', '/api/compraagil-productos/', '/api/compraagil-proveedores/',
    '/api/compraagil/ahorro-stats/', '/api/compraagil/anios/', '/api/compraagil/comparativa/',
    '/api/compraagil/patrones/', '/api/compraagil/calendario/', '/api/compraagil/anos-calendario/',
]

# Actualizaciones (ETL) y descargas: el gestor tampoco puede dispararlas.
POST_ABASTECIMIENTO = [
    '/api/licitaciones/actualizar/', '/api/ordenes-compra/actualizar/', '/api/compraagil/actualizar/',
    '/api/licitaciones/descarga-ofertas/',
    '/api/licitaciones/actualizar-cancelar/abc/', '/api/ordenes-compra/actualizar-cancelar/abc/',
    '/api/compraagil/actualizar-cancelar/abc/',
]

# Listados simples: con tablas vacías responden 200 para cualquier rol que no sea el gestor.
LISTADOS_SIMPLES = [
    '/api/licitaciones/', '/api/ordenes-compra/', '/api/planer-pac/', '/api/compraagil-resumen/',
]


def _cliente(role, username=None):
    u = User.objects.create_user(username=username or f'u_{role}', password='x')
    PerfilUsuario.objects.create(user=u, role=role)
    cli = APIClient()
    cli.force_authenticate(u)
    return cli


class GestorSinAbastecimientoTest(TestCase):
    def test_gestor_recibe_403_en_los_datos_de_abastecimiento(self):
        cli = _cliente('gestor_compras')
        for url in GET_ABASTECIMIENTO:
            with self.subTest(url=url):
                self.assertEqual(cli.get(url).status_code, 403)

    def test_gestor_no_puede_lanzar_actualizaciones_ni_descargas(self):
        cli = _cliente('gestor_compras')
        for url in POST_ABASTECIMIENTO:
            with self.subTest(url=url):
                self.assertEqual(cli.post(url, {}, format='json').status_code, 403)

    def test_gestor_sigue_entrando_a_su_propio_modulo(self):
        cli = _cliente('gestor_compras')
        r = cli.get('/api/gestor-compras/mi-alcance/')
        self.assertEqual(r.status_code, 200)

    def test_el_resto_de_los_roles_conserva_el_acceso(self):
        for role in ('viewer', 'abastecimiento', 'finanzas', 'comprador', 'jefatura', 'general', 'admin'):
            cli = _cliente(role)
            for url in LISTADOS_SIMPLES:
                with self.subTest(role=role, url=url):
                    self.assertEqual(cli.get(url).status_code, 200)
            User.objects.filter(username=f'u_{role}').delete()

    def test_anonimo_sigue_sin_entrar(self):
        self.assertEqual(APIClient().get('/api/licitaciones/').status_code, 401)
