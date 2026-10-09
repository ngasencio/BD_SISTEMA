"""Home (Inicio): tablero ejecutivo «¿Cómo vamos en el año?» — `services_inicio` y `GET /api/inicio/resumen/`.

Las cifras salen de las mismas funciones que /pac, Formularios y el Anexo N°3; aquí se prueba lo propio del Home:
la comparación contra el mismo corte del año anterior, la agrupación por modalidad y, sobre todo, que cada rol
reciba SOLO los bloques que puede abrir en su módulo de origen.
"""
from datetime import date, datetime
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api import services_inicio as SI
from api.models import (
    DevengoSigfeAnual, FormularioFSC, FormularioFSCDerivado, OrdenCompra, PerfilUsuario,
)

HOY = date(2026, 10, 9)


def _fecha(anio, mes, dia):
    return timezone.make_aware(datetime(anio, mes, dia, 12, 0))


def _oc(codigo, anio, mes, dia, neto, estado='Aceptada', modalidad='Licitación'):
    return OrdenCompra.objects.create(
        codigo_oc=codigo, FechaEnvio=_fecha(anio, mes, dia), TotalNeto=Decimal(neto), EstadoOC=estado, TipoCompraInterna=modalidad,
    )


def _usuario(username, role, superuser=False):
    u = User.objects.create_user(username=username, password='x', is_superuser=superuser)
    PerfilUsuario.objects.create(user=u, role=role)
    return u


class CorteComparableTest(SimpleTestCase):
    def test_año_en_curso_se_compara_al_mismo_dia_del_año_anterior(self):
        self.assertEqual(SI.corte_comparable(2026, date(2026, 10, 9)), (date(2026, 10, 9), date(2025, 10, 9)))

    def test_29_de_febrero_cae_al_28_si_el_año_anterior_no_es_bisiesto(self):
        self.assertEqual(SI.corte_comparable(2028, date(2028, 2, 29))[1], date(2027, 2, 28))

    def test_año_cerrado_compara_año_completo_contra_año_completo(self):
        self.assertEqual(SI.corte_comparable(2025, date(2026, 10, 9)), (date(2025, 12, 31), date(2024, 12, 31)))

    def test_variacion_porcentual_y_sin_base(self):
        self.assertEqual(SI.variacion_pct(150, 100), 50.0)
        self.assertEqual(SI.variacion_pct(50, 100), -50.0)
        self.assertIsNone(SI.variacion_pct(10, 0))
        self.assertIsNone(SI.variacion_pct(10, None))


class BloqueOcTest(TestCase):
    def setUp(self):
        # 2026 (hasta el corte del 9-oct): 2 válidas + 1 cancelada (no cuenta).
        _oc('A', 2026, 3, 10, 1000, modalidad='Licitación')
        _oc('B', 2026, 3, 20, 500, modalidad='Compra Ágil')
        _oc('X', 2026, 4, 1, 9999, estado='Cancelada')
        # 2025: una antes del corte (cuenta al mismo corte) y otra en diciembre (solo en la serie mensual completa).
        _oc('C', 2025, 3, 15, 800, modalidad='Licitación')
        _oc('D', 2025, 12, 5, 700, modalidad='Convenio Marco')

    def test_totales_excluyen_canceladas(self):
        oc = SI._bloque_oc(2026, HOY)
        self.assertEqual((oc['cantidad'], oc['monto_neto']), (2, 1500.0))

    def test_compara_contra_el_mismo_corte_y_no_contra_el_año_completo(self):
        oc = SI._bloque_oc(2026, HOY)
        self.assertEqual(oc['anterior'], {'cantidad': 1, 'monto_neto': 800.0})  # la de diciembre queda fuera del corte
        self.assertEqual(oc['var_monto_pct'], 87.5)
        self.assertEqual(oc['var_cantidad_pct'], 100.0)

    def test_serie_mensual_muestra_el_año_anterior_completo(self):
        mensual = {m['mes']: m for m in SI._bloque_oc(2026, HOY)['mensual']}
        self.assertEqual(len(mensual), 12)
        self.assertEqual((mensual[3]['actual'], mensual[3]['cantidad_actual']), (1500.0, 2))
        self.assertEqual((mensual[3]['anterior'], mensual[12]['anterior']), (800.0, 700.0))
        self.assertEqual(mensual[12]['actual'], 0)

    def test_mes_en_curso_solo_para_el_año_actual(self):
        self.assertEqual(SI._bloque_oc(2026, HOY)['mes_en_curso'], 10)
        self.assertIsNone(SI._bloque_oc(2025, HOY)['mes_en_curso'])

    def test_modalidades_ordenadas_por_monto_con_otras_agrupando_lo_no_principal(self):
        _oc('E', 2026, 5, 2, 300, modalidad='SE')
        _oc('F', 2026, 5, 3, 100, modalidad=None)
        modalidades = {m['modalidad']: m for m in SI._bloque_oc(2026, HOY)['modalidades']}
        self.assertEqual(modalidades['Otras'], {'modalidad': 'Otras', 'cantidad': 2, 'monto': 300.0 + 100.0})
        self.assertEqual(list(modalidades)[0], 'Licitación')  # la de mayor monto primero


class BloquesYRolesTest(TestCase):
    URL = '/api/inicio/resumen/'

    def setUp(self):
        hoy = date.today()
        _oc('A', hoy.year, 1, 1, 1000)
        FormularioFSC.objects.create(folio=1, anho=hoy.year, estado='P', formulario='Formulario Solicitud de Compra Nro 1')
        FormularioFSC.objects.create(folio=2, anho=hoy.year, estado='AC', formulario='Formulario Solicitud de Compra Nro 1')
        FormularioFSC.objects.create(folio=3, anho=hoy.year, estado='R', formulario='Formulario Solicitud de Compra Nro 1')
        for i, (dfp, monto) in enumerate([('DENTRO', 100), ('DENTRO', 100), ('DENTRO', 100), ('FUERA', 100)]):
            FormularioFSCDerivado.objects.create(
                folio=10 + i, anho=hoy.year, fecha_derivado=f'{hoy.year}-01-05', dentro_fuera_pac=dfp, monto_estimado=monto,
                estado='AC', unidad_requirente=f'U{i}',
            )
        for i, (ue, deuda) in enumerate([('1638001 Direccion del Servicio', 600), ('1638002 Hospital de Osorno', 400)]):
            DevengoSigfeAnual.objects.create(
                codigo_ue=ue, monto_disponible=Decimal(deuda), monto_vigente=Decimal(deuda * 2), row_hash=f'r{i}', doc_key=f'd{i}',
            )

    def _get(self, role, **params):
        cli = APIClient()
        cli.force_authenticate(User.objects.filter(username=f'u_{role}').first() or _usuario(f'u_{role}', role))
        return cli.get(self.URL, params)

    def test_viewer_solo_recibe_compras_y_pac(self):
        r = self._get('viewer')
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data['formularios'])
        self.assertIsNone(r.data['deuda'])
        self.assertEqual(r.data['oc']['cantidad'], 1)
        self.assertIn('enlace_pct', r.data['pac'])

    def test_abastecimiento_recibe_formularios_pero_no_deuda(self):
        r = self._get('abastecimiento')
        self.assertIsNotNone(r.data['formularios'])
        self.assertIsNone(r.data['deuda'])

    def test_jefatura_ve_formularios_y_no_deuda(self):
        r = self._get('jefatura')
        self.assertIsNotNone(r.data['formularios'])
        self.assertIsNone(r.data['deuda'])

    def test_finanzas_recibe_deuda_pero_no_formularios(self):
        r = self._get('finanzas')
        self.assertIsNone(r.data['formularios'])
        self.assertEqual(r.data['deuda']['total'], 1000.0)

    def test_admin_recibe_todo(self):
        r = self._get('admin')
        self.assertIsNotNone(r.data['formularios'])
        self.assertIsNotNone(r.data['deuda'])

    def test_el_gestor_de_compras_tiene_su_propio_panel(self):
        self.assertEqual(self._get('gestor_compras').status_code, 403)

    def test_anonimo_no_entra(self):
        self.assertEqual(APIClient().get(self.URL).status_code, 401)

    def test_formularios_por_bandeja_actual(self):
        f = self._get('admin').data['formularios']
        bandejas = {b['codigo']: b['cantidad'] for b in f['bandejas']}
        self.assertEqual((bandejas['P'], bandejas['AC'], bandejas['DC']), (1, 1, 0))
        self.assertEqual([b['codigo'] for b in f['bandejas']], ['P', 'FR', 'FA', 'ASDA', 'ADIR', 'AA', 'DC', 'AC'])
        self.assertEqual((f['rechazados'], f['total'], f['derivados']), (1, 3, 4))

    def test_deuda_por_unidad_ejecutora_separa_codigo_y_nombre(self):
        d = self._get('finanzas').data['deuda']
        self.assertEqual(d['por_ue'][0], {'codigo': '1638001', 'nombre': 'Direccion del Servicio', 'deuda': 600.0})
        self.assertEqual(d['n_documentos'], 2)

    def test_deuda_coincide_con_la_funcion_original_del_anexo_3(self):
        from api import services as S
        original = S.obtener_kpis_devengo(DevengoSigfeAnual.objects.all(), solo_deuda=True)
        d = SI._bloque_deuda()
        self.assertEqual(d['total'], original['kpis']['deuda_total'])
        self.assertEqual(d['pct_pendiente'], original['kpis']['pct_pendiente'])
        self.assertEqual(d['n_documentos'], original['kpis']['n_registros'])
        self.assertEqual([(u['codigo'] + ' ' + u['nombre'], u['deuda']) for u in d['por_ue']], [(u['ue'], u['deuda']) for u in original['por_ue']])

    def test_la_deuda_ignora_documentos_sin_saldo(self):
        DevengoSigfeAnual.objects.create(codigo_ue='1638003 Hospital Puerto Octay', monto_disponible=Decimal(0), row_hash='z', doc_key='z')
        self.assertEqual([u['codigo'] for u in SI._bloque_deuda()['por_ue']], ['1638001', '1638002'])

    def test_dentro_fuera_pac_y_nota(self):
        df = self._get('viewer').data['pac']['dentro_fuera']
        self.assertEqual((df['total'], df['dentro'], df['fuera'], df['pct_dentro']), (4, 3, 1, 75.0))
        self.assertEqual(df['nota'], 5.5)  # 1 + 6 × 0,75 (cantidad y monto coinciden)

    def test_anio_invalido_cae_al_año_en_curso(self):
        hoy = date.today().year
        for malo in ('abc', '1999', str(hoy + 1)):
            self.assertEqual(self._get('viewer', anio=malo).data['anio'], hoy, malo)

    def test_lista_los_años_con_ordenes_hasta_hoy(self):
        _oc('Z', date.today().year - 1, 1, 1, 10)
        self.assertEqual(self._get('viewer').data['anios_disponibles'], [date.today().year - 1, date.today().year])
