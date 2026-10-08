"""Alertas, Historial y Compras Conjuntas devuelven el ID corto (Fn-XXX-AA) y el id de la fila.

Con eso la UI muestra el mismo identificador en todas las pestañas y puede abrir la ficha completa
(`formularios/ficha/`) desde cualquier vista, sin una consulta extra para averiguar a qué fila corresponde.
"""
from django.test import TestCase

from api import services as S
from api.models import FormularioFSC, FormularioFSCProducto

TIPO_1 = 'Formulario Solicitud de Compra Nro 1'


def _fsc(folio, estado, **extra):
    datos = dict(
        folio=folio, anho=2026, formulario=TIPO_1, estado=estado, unidad_requirente=f'UNIDAD {folio}',
        usuario_requirente='ANA PAZ', fecha_solicitud='2020-01-01', monto_estimado=100000, requerimiento='Insumos',
    )
    return FormularioFSC.objects.create(**{**datos, **extra})


class IdsEnVistasTest(TestCase):
    def test_alertas_trae_id_formulario_e_id(self):
        f = _fsc(5, 'FA')
        [fila] = S.calcular_formularios_alertas(dias_min=10)['results']
        self.assertEqual(fila['id'], f.id)
        self.assertEqual(fila['id_formulario'], 'F1-005-26')

    def test_historial_trae_id_formulario(self):
        f = _fsc(7, 'AC')
        FormularioFSCProducto.objects.create(folio=7, anho=2026, tipo_formulario=1, producto='Gasa', monto=1000, cantidad=2)
        [fila] = S.calcular_formularios_historial()
        self.assertEqual(fila['id'], f.id)
        self.assertEqual(fila['id_formulario'], 'F1-007-26')
        self.assertEqual(len(fila['productos']), 1)

    def test_compras_conjuntas_trae_el_id_de_cada_nodo_y_de_los_formularios_de_los_grupos(self):
        a, b = _fsc(10, 'DC'), _fsc(11, 'AA')
        for folio in (10, 11):
            FormularioFSCProducto.objects.create(folio=folio, anho=2026, tipo_formulario=1, categoria='Insumos',
                                                  producto='Gasa', item_presupuestario='22.04.004 - Materiales', monto=500, cantidad=1)
        datos = S.calcular_formularios_unificacion(anho=2026)
        self.assertEqual({n['id'] for n in datos['nodos']}, {a.id, b.id})
        [grupo] = datos['grupos']
        self.assertEqual({f['id'] for f in grupo['formularios']}, {a.id, b.id})
        [item] = datos['grupos_productos']
        self.assertEqual({f['id'] for c in item['categorias'] for f in c['formularios']}, {a.id, b.id})
