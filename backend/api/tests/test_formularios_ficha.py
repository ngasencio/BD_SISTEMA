"""Ficha completa de un FSC (botón 'Ver' de Abastecimiento › Formularios).

Cubre `services.calcular_formulario_ficha` y `GET /api/formularios/ficha/`: la ficha junta el
formulario (Solicitudes y Derivados comparten modal), su gemela de la otra tabla, el carro de
productos del tipo correcto, el historial de bandejas, el proceso de compra y las OC enlazadas.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from api import services as S
from api.models import (
    FormularioFSC, FormularioFSCDerivado, FormularioFSCEstadoLog, FormularioFSCProducto,
    FscOcLink, OrdenCompra, PerfilUsuario, ProcesoCompra, ProcesoCompraFormulario,
    ProcesoCompraOrdenCompra,
)

FORMULARIO_1 = 'Formulario Solicitud de Compra Nro 1'
CLAVE = dict(folio=5, anho=2026, unidad_requirente='UNIDAD DE PRUEBA', fecha_solicitud='2026-03-02')


def _usuario(username, role):
    u = User.objects.create_user(username=username, password='x')
    PerfilUsuario.objects.create(user=u, role=role)
    return u


def _fsc(**extra):
    datos = dict(
        formulario=FORMULARIO_1, estado='AC', destino_actual='SANDRA ESPINOZA', usuario_requirente='ANA PAZ',
        requerimiento='Insumos de curación', monto_estimado=500000, id_plan='PC26-1', **CLAVE,
    )
    return FormularioFSC.objects.create(**{**datos, **extra})


def _derivado(**extra):
    datos = dict(
        formulario=FORMULARIO_1, estado='AC', usuario_requirente='ANA PAZ', requerimiento='Insumos de curación',
        monto_estimado=500000, id_plan='PC26-1', comprador='ALICIA VIDAL', estado_compra='En proceso',
        fecha_derivado='2026-03-10', dentro_fuera_pac='DENTRO', **CLAVE,
    )
    return FormularioFSCDerivado.objects.create(**{**datos, **extra})


def _oc(codigo='1234-5-CM26', **extra):
    return OrdenCompra.objects.create(
        codigo_oc=codigo, NombreOC='F1-005-26-NAM', EstadoOC='Aceptada', P_Nombre='PROVEEDOR SPA',
        TotalBruto=Decimal('119000'), EnlacePAC='Enlazada', ID_Proyecto='PC26-1', **extra,
    )


class FichaServicioTest(TestCase):
    def setUp(self):
        self.fsc = _fsc()
        self.der = _derivado()
        FormularioFSCEstadoLog.objects.create(formulario=self.fsc, estado='DC', fecha_registro=date(2026, 3, 5))
        FormularioFSCEstadoLog.objects.create(formulario=self.fsc, estado='AC', fecha_registro=date(2026, 3, 10))
        FormularioFSCProducto.objects.create(folio=5, anho=2026, tipo_formulario=1, categoria='Insumos', producto='Gasa', monto=1000, cantidad=2)
        # Mismo folio y año pero OTRO tipo de formulario: no debe mezclarse en el carro.
        FormularioFSCProducto.objects.create(folio=5, anho=2026, tipo_formulario=2, categoria='Servicios', producto='Aseo', monto=9, cantidad=1)

    def test_desde_derivado_junta_datos_de_ambas_tablas(self):
        f = S.calcular_formulario_ficha('derivado', self.der.id)
        self.assertEqual(f['id_formulario'], 'F1-005-26')
        self.assertTrue(f['es_derivado'])
        self.assertEqual(f['derivado_id'], self.der.id)
        self.assertEqual(f['fsc_id'], self.fsc.id)
        self.assertEqual(f['comprador'], 'ALICIA VIDAL')
        self.assertEqual(f['estado_compra'], 'En proceso')
        self.assertEqual(f['dentro_fuera_pac'], 'DENTRO')
        self.assertEqual(f['destino_actual'], 'SANDRA ESPINOZA')  # solo vive en la tabla de Solicitudes

    def test_desde_solicitud_derivada_tambien_trae_lo_del_derivado(self):
        f = S.calcular_formulario_ficha('solicitud', self.fsc.id)
        self.assertTrue(f['es_derivado'])
        self.assertEqual(f['comprador'], 'ALICIA VIDAL')
        self.assertEqual(f['fecha_derivado'], '2026-03-10')

    def test_solicitud_sin_derivar_deja_vacio_lo_propio_del_derivado(self):
        FormularioFSCDerivado.objects.all().delete()
        f = S.calcular_formulario_ficha('solicitud', self.fsc.id)
        self.assertFalse(f['es_derivado'])
        self.assertIsNone(f['comprador'])
        self.assertIsNone(f['dentro_fuera_pac'])
        self.assertEqual((f['enlaces_oc'], f['procesos']), ([], []))

    def test_departamento_y_subdireccion_salen_del_organigrama_aunque_no_este_derivado(self):
        FormularioFSCDerivado.objects.all().delete()
        mapa = {'UNIDAD DE PRUEBA': {'nombre_depto': 'Depto. de Pruebas', 'nombre_subdireccion': 'Subdirección Administrativa'}}
        f = S.calcular_formulario_ficha('solicitud', self.fsc.id, mapa)
        self.assertEqual((f['departamento'], f['subdireccion']), ('Depto. de Pruebas', 'Subdirección Administrativa'))

    def test_sin_organigrama_departamento_y_subdireccion_quedan_vacios(self):
        FormularioFSCDerivado.objects.all().delete()
        f = S.calcular_formulario_ficha('solicitud', self.fsc.id)
        self.assertEqual((f['departamento'], f['subdireccion']), (None, None))

    def test_carro_solo_con_productos_del_tipo_del_formulario(self):
        f = S.calcular_formulario_ficha('derivado', self.der.id)
        self.assertEqual([p['producto'] for p in f['productos']], ['Gasa'])

    def test_historial_de_bandejas_en_orden_cronologico(self):
        f = S.calcular_formulario_ficha('solicitud', self.fsc.id)
        self.assertEqual([(h['estado'], h['fecha']) for h in f['historial_estados']],
                         [('DC', '2026-03-05'), ('AC', '2026-03-10')])

    def test_gemela_no_se_confunde_con_otro_formulario_del_mismo_folio(self):
        # Mismo folio y año, otra unidad: es OTRO formulario, no la gemela.
        otro = _derivado(unidad_requirente='OTRA UNIDAD', comprador='OTRO COMPRADOR')
        f = S.calcular_formulario_ficha('solicitud', self.fsc.id)
        self.assertEqual(f['derivado_id'], self.der.id)
        self.assertNotEqual(f['derivado_id'], otro.id)

    def test_oc_enlazada_trae_resumen_y_estado_pac(self):
        oc = _oc()
        FscOcLink.objects.create(formulario_derivado=self.der, orden_compra=oc, confianza='ALTA', estado='CONFIRMADO')
        [e] = S.calcular_formulario_ficha('derivado', self.der.id)['enlaces_oc']
        self.assertEqual(e['codigo_oc'], '1234-5-CM26')
        self.assertEqual(e['estado'], 'CONFIRMADO')
        self.assertEqual(e['estado_pac'], 'PAC_OK')  # la OC está enlazada al mismo PAC que declara el FSC
        self.assertEqual(e['oc']['proveedor'], 'PROVEEDOR SPA')
        self.assertEqual(e['oc']['total_bruto'], 119000.0)

    def test_oc_enlazada_que_ya_no_esta_en_la_tabla_no_rompe_la_ficha(self):
        # El ETL de OC borra y recrea la tabla: el enlace sobrevive aunque la OC aún no esté.
        FscOcLink.objects.create(formulario_derivado=self.der, orden_compra_id='NO-EXISTE', confianza='MEDIA', estado='SUGERIDO')
        [e] = S.calcular_formulario_ficha('derivado', self.der.id)['enlaces_oc']
        self.assertEqual(e['codigo_oc'], 'NO-EXISTE')
        self.assertIsNone(e['oc'])

    def test_proceso_de_compra_con_sus_oc(self):
        oc = _oc()
        comprador = _usuario('alicia', 'comprador')
        proceso = ProcesoCompra.objects.create(tipo_proceso='COMPRA_AGIL', titulo='Insumos 2026', comprador=comprador)
        ProcesoCompraFormulario.objects.create(proceso=proceso, formulario_derivado=self.der)
        ProcesoCompraOrdenCompra.objects.create(proceso=proceso, orden_compra=oc)
        [p] = S.calcular_formulario_ficha('derivado', self.der.id)['procesos']
        self.assertEqual(p['titulo'], 'Insumos 2026')
        self.assertEqual(p['tipo_proceso'], 'Compra Ágil')
        self.assertEqual([o['codigo_oc'] for o in p['ordenes_compra']], ['1234-5-CM26'])

    def test_id_inexistente_lanza_does_not_exist(self):
        with self.assertRaises(FormularioFSCDerivado.DoesNotExist):
            S.calcular_formulario_ficha('derivado', 999999)
        with self.assertRaises(FormularioFSC.DoesNotExist):
            S.calcular_formulario_ficha('solicitud', 999999)


class FichaVistaTest(TestCase):
    URL = '/api/formularios/ficha/'

    def setUp(self):
        self.fsc = _fsc()
        self.cli = APIClient()
        self.cli.force_authenticate(_usuario('abast', 'abastecimiento'))

    def test_responde_200_con_la_ficha(self):
        r = self.cli.get(self.URL, {'origen': 'solicitud', 'id': self.fsc.id})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['id_formulario'], 'F1-005-26')

    def test_origen_por_defecto_es_solicitud(self):
        self.assertEqual(self.cli.get(self.URL, {'id': self.fsc.id}).status_code, 200)

    def test_parametros_invalidos_dan_400(self):
        self.assertEqual(self.cli.get(self.URL).status_code, 400)
        self.assertEqual(self.cli.get(self.URL, {'id': 'abc'}).status_code, 400)
        self.assertEqual(self.cli.get(self.URL, {'id': self.fsc.id, 'origen': 'otro'}).status_code, 400)

    def test_id_inexistente_da_404(self):
        self.assertEqual(self.cli.get(self.URL, {'origen': 'derivado', 'id': 999999}).status_code, 404)

    def test_el_id_de_una_tabla_no_se_interpreta_en_la_otra(self):
        # Solo existe la fila de Solicitudes: pedirla como 'derivado' no la encuentra.
        self.assertEqual(self.cli.get(self.URL, {'origen': 'derivado', 'id': self.fsc.id}).status_code, 404)

    def test_sin_rol_de_abastecimiento_da_403(self):
        cli = APIClient()
        cli.force_authenticate(_usuario('visita', 'viewer'))
        self.assertEqual(cli.get(self.URL, {'id': self.fsc.id}).status_code, 403)

    def test_anonimo_da_401(self):
        self.assertEqual(APIClient().get(self.URL, {'id': self.fsc.id}).status_code, 401)
