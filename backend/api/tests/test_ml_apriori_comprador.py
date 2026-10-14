"""`calcular_apriori_comprador` (FP-Growth por unidad compradora) debe tener el trabajo acotado.

Incidente 2026-10-14: tras sincronizar Compra Ágil la tabla quedó con 5 unidades
compradoras y cientos de productos cada una. Con `min_support=0.05` el soporte mínimo
era 1 unidad, así que CADA combinación de productos de una unidad era "frecuente"
(C(858,4) ≈ 2×10^10) y mlxtend la materializaba entera: 6 hilos de `runserver`
llegaron a 17 GB de RAM y el servidor quedó inutilizable. Estas pruebas fijan que el
resultado sea acotado sin importar la forma de los datos.
"""
import string
import time
from itertools import product

from django.test import TestCase

from api import ml_services
from api.ml_services import calcular_apriori_comprador
from api.models import CompraAgilProducto, CompraAgilResumen


def _nombres(n):
    """n nombres alfabéticos distintos (preprocesar_texto descarta dígitos)."""
    letras = string.ascii_lowercase
    return [f'articulo{a}{b}{c}x' for a, b, c in product(letras, repeat=3)][:n]


def _cargar(unidades, productos_por_unidad, compartidos=0):
    """`unidades` unidades con una CA cada una; las primeras `compartidos` posiciones
    de producto son comunes a todas (el caso que disparaba la explosión)."""
    n_propios = productos_por_unidad - compartidos
    nombres = _nombres(compartidos + unidades * n_propios)
    comunes = nombres[:compartidos]
    k = 0
    for u in range(unidades):
        codigo = f'CA-{u}'
        CompraAgilResumen.objects.create(codigocompraagil=codigo, unidadcompra=f'UNIDAD {u}')
        desde = compartidos + u * n_propios
        for nombre in comunes + nombres[desde:desde + n_propios]:
            k += 1
            CompraAgilProducto.objects.create(
                codigocompraagil=codigo, codigoproducto=f'P{k}', nombre=nombre)


class AprioriCompradorAcotadoTest(TestCase):
    def test_pocas_unidades_con_cientos_de_productos_compartidos_no_explota(self):
        # 5 unidades × 250 productos, todos compartidos entre las 5: sin cotas serían
        # ~C(250,4) ≈ 1.6×10^8 itemsets frecuentes.
        _cargar(unidades=5, productos_por_unidad=250, compartidos=250)
        t = time.time()
        r = calcular_apriori_comprador(0.05)
        self.assertLess(time.time() - t, 60)
        self.assertEqual(r['n_unidades'], 5)
        self.assertEqual(r['n_productos_vocab'], 250)
        self.assertLessEqual(r['n_productos_analizados'], ml_services._FPGROWTH_MAX_ITEMS)
        self.assertIn('advertencia', r)
        self.assertLessEqual(len(r['frecuentes']), 20)
        for f in r['frecuentes']:
            self.assertLessEqual(len(f['productos']), ml_services._FPGROWTH_MAX_LEN)

    def test_un_patron_que_solo_aparece_en_una_unidad_no_cuenta(self):
        # Cada unidad con productos propios y nada en común: ningún patrón se repite.
        _cargar(unidades=4, productos_por_unidad=30, compartidos=0)
        r = calcular_apriori_comprador(0.05)
        self.assertEqual(r['frecuentes'], [])
        self.assertIn('advertencia', r)

    def test_patron_real_entre_unidades_sigue_detectandose(self):
        # 4 unidades que comparten 3 productos + algunos propios.
        _cargar(unidades=4, productos_por_unidad=10, compartidos=3)
        r = calcular_apriori_comprador(0.5)
        self.assertTrue(r['frecuentes'])
        mejor = r['frecuentes'][0]
        self.assertEqual(len(mejor['productos']), 3)
        self.assertEqual(mejor['n_unidades'], 4)
        self.assertNotIn('advertencia', r)

    def test_sin_datos_devuelve_advertencia(self):
        r = calcular_apriori_comprador(0.05)
        self.assertEqual(r['frecuentes'], [])
        self.assertIn('advertencia', r)
