"""Panel «Resumen» de Mis Formularios — dos reglas pedidas el 2026-10-14.

1. «Notificaciones — Plazos Mercado Público»: una Compra Ágil en «Proveedor seleccionado»
   ya está resuelta, así que NO aparece (antes quedaba en verde «En plazo»). Las que
   siguen abiertas («Publicada») o cerradas sin tramitar sí.
2. «Proceso de Gestión — Gestión Interna»: cada FSC trae `dias_desde_derivacion`
   (Fecha Derivado → hoy) para que la UI muestre «N días — sin tramitar» a los que
   no tienen ninguna gestión (`n_procesos == 0`).
"""
from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from api.models import CompraAgilResumen, FormularioFSCDerivado, ProcesoCompra
from api.services import _calcular_compras_resumen


class ResumenCompradorSinTramitarTest(TestCase):
    def setUp(self):
        self.comprador = User.objects.create_user('comprador@x.cl', password='x')
        self.hoy = timezone.localdate()

    def _ca(self, codigo, estadoglosa, dias_cierre=-20):
        CompraAgilResumen.objects.create(
            codigocompraagil=codigo, estadoglosa=estadoglosa,
            fechacierre=timezone.now() + timedelta(days=dias_cierre),
        )
        return ProcesoCompra.objects.create(
            tipo_proceso=ProcesoCompra.COMPRA_AGIL, titulo=f'CA {codigo}',
            comprador=self.comprador, codigo_compra_agil=codigo,
        )

    def _resumen(self):
        return _calcular_compras_resumen(
            procesos_base=ProcesoCompra.objects.filter(comprador=self.comprador),
            fsc_abiertos_qs=FormularioFSCDerivado.objects.filter(estado='AC'),
            fsc_finalizados_qs=FormularioFSCDerivado.objects.none(),
        )

    def test_compra_agil_con_proveedor_seleccionado_no_aparece_en_alertas(self):
        sel = self._ca('1-1-COT26', 'Proveedor seleccionado')
        pub = self._ca('1-2-COT26', 'Publicada')
        cer = self._ca('1-3-COT26', 'Cerrada')
        ids = {a['proceso_id'] for a in self._resumen()['alertas']}
        self.assertNotIn(sel.id, ids)
        self.assertIn(pub.id, ids)
        self.assertIn(cer.id, ids)

    def test_publicada_sigue_siendo_vencido_y_el_kpi_no_cambia_por_la_resuelta(self):
        self._ca('1-1-COT26', 'Proveedor seleccionado')
        self._ca('1-2-COT26', 'Publicada', dias_cierre=15)
        r = self._resumen()
        self.assertEqual([a['urgencia'] for a in r['alertas']], ['vencido'])
        self.assertEqual(r['kpis']['alertas_vencidas'], 1)
        # La resuelta sigue contando como proceso activo y como «finalizado» en el pivote.
        self.assertEqual(r['kpis']['procesos_activos'], 2)
        self.assertEqual(r['pivote'][0]['finalizado'], 1)

    def test_gestion_interna_trae_dias_desde_la_derivacion(self):
        FormularioFSCDerivado.objects.create(
            folio=1, anho=2026, unidad_requirente='BIENESTAR', estado='AC',
            fecha_derivado=(self.hoy - timedelta(days=12)).isoformat(),
        )
        FormularioFSCDerivado.objects.create(
            folio=2, anho=2026, unidad_requirente='BIENESTAR', estado='AC',
            fecha_derivado=self.hoy.isoformat(),
        )
        FormularioFSCDerivado.objects.create(
            folio=3, anho=2026, unidad_requirente='BIENESTAR', estado='AC', fecha_derivado=None,
        )
        filas = self._resumen()['gestion_interna']
        dias = sorted((g['dias_desde_derivacion'] for g in filas), key=lambda d: (d is None, d))
        self.assertEqual(dias, [0, 12, None])
        self.assertTrue(all(g['n_procesos'] == 0 for g in filas))

    def test_fsc_con_gestion_manual_conserva_n_procesos(self):
        # Convenio Marco sin código de Mercado Público: sigue en Gestión Interna
        # pero con n_procesos = 1, que es lo que la UI usa para NO marcarlo «sin tramitar».
        from api.models import ProcesoCompraFormulario
        fsc = FormularioFSCDerivado.objects.create(
            folio=9, anho=2026, unidad_requirente='BIENESTAR', estado='AC',
            fecha_derivado=(self.hoy - timedelta(days=40)).isoformat(),
        )
        p = ProcesoCompra.objects.create(
            tipo_proceso=ProcesoCompra.CONVENIO_MARCO, titulo='CM', comprador=self.comprador)
        ProcesoCompraFormulario.objects.create(proceso=p, formulario_derivado=fsc)
        fila = self._resumen()['gestion_interna'][0]
        self.assertEqual(fila['n_procesos'], 1)
        self.assertEqual(fila['dias_desde_derivacion'], 40)
