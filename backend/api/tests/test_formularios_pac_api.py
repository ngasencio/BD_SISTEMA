"""Formularios PAC — servicios de cálculo y API de lectura.

Datos sintéticos, hoy fijo para que las antigüedades sean deterministas.
"""
from datetime import date, timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from api import services_formularios_pac as pac
from api.models import (
    Departamento, Establecimiento, FormularioPAC, FormularioPACEstadoLog, FormularioPACProducto,
    PacProyectoMaestro, PerfilUsuario, PlanerPAC, SsoSubdireccion,
)

HOY = date(2026, 10, 14)


def ficha(folio, estado='DC', anho=2026, accion='Nuevo', monto=1000, depto='DEPARTAMENTO DE SALUD MENTAL',
          fecha=None, **extra):
    return FormularioPAC.objects.create(
        folio=folio, anho=anho, estado=estado, accion_proyecto=accion, monto=monto, departamento=depto,
        fecha_ficha=fecha or date(2026, 3, 1), nombre_proyecto=f'Proyecto {folio}',
        tipo_proyecto='Operacional', tipo_requerimiento='Adquisicion', **extra)


def linea(folio, anho=2026, n=1, categoria='Alimentacion', producto='Abarrotes', monto=500,
          item='22.01.001 - Para Personas', mes=date(2026, 5, 1)):
    return FormularioPACProducto.objects.create(
        folio=folio, anho=anho, linea=n, categoria=categoria, producto=producto, monto=monto,
        cantidad=1, unidad='Unidad', item_presupuestario=item,
        mes_ejecucion=mes.strftime('%b-%y') if mes else None, mes_ejecucion_fecha=mes)


class UtilidadesTest(TestCase):
    def test_id_ficha(self):
        self.assertEqual(pac.generar_id_ficha_pac(1664, 2025), 'PAC-1664-25')
        self.assertEqual(pac.generar_id_ficha_pac(7, 2026), 'PAC-0007-26')
        self.assertIsNone(pac.generar_id_ficha_pac(None, 2026))

    def test_separar_item(self):
        self.assertEqual(pac.separar_item_presupuestario('22.04.001 - Materiales de Oficina'),
                         ('22.04.001', 'Materiales de Oficina', '22.04'))
        self.assertEqual(pac.separar_item_presupuestario('22.06.005.002 - MANTENCION'),
                         ('22.06.005.002', 'MANTENCION', '22.06'))
        for crudo in (None, '', '0', '2201', 'sin codigo'):
            self.assertEqual(pac.separar_item_presupuestario(crudo), (None, None, None), crudo)


class StatsTest(TestCase):
    def setUp(self):
        ficha(1, 'DC', monto=1000)
        ficha(2, 'DC', monto=500, accion='Modificar')
        ficha(3, 'R', monto=9999)
        ficha(4, 'P', monto=200, depto='DEPARTAMENTO ATENCION PRIMARIA')
        ficha(5, 'AA', monto=300, depto='DEPARTAMENTO ATENCION PRIMARIA')
        ficha(6, 'DC', monto=None, accion='Eliminar')
        ficha(7, None, monto=50)
        ficha(8, 'DC', anho=2025, monto=700, fecha=date(2025, 6, 1))

    def test_kpis(self):
        k = pac.calcular_formularios_pac_stats(2026)['kpis']
        self.assertEqual(k['total_fichas'], 7)
        self.assertEqual(k['aprobadas'], 3)
        self.assertEqual(k['rechazadas'], 1)
        self.assertEqual(k['en_tramite'], 2)
        self.assertEqual(k['sin_estado'], 1)
        # vigente = todo menos las rechazadas: 1000+500+200+300+0+50
        self.assertEqual(k['monto_vigente'], 2050)
        self.assertEqual(k['monto_total'], 2050 + 9999)   # con la rechazada
        self.assertEqual(k['pct_aprobacion'], 75.0)   # 3 aprobadas de 4 resueltas

    def test_sin_filtro_de_anio_cuenta_todo_y_lista_anios(self):
        s = pac.calcular_formularios_pac_stats()
        self.assertEqual(s['kpis']['total_fichas'], 8)
        self.assertEqual(s['anios_disponibles'], [2026, 2025])

    def test_distribuciones(self):
        s = pac.calcular_formularios_pac_stats(2026)
        por_accion = {r['accion']: r for r in s['por_accion']}
        self.assertEqual(por_accion['Nuevo']['total'], 5)
        self.assertEqual(por_accion['Eliminar']['monto'], 0)
        por_estado = {r['estado']: r for r in s['por_estado']}
        self.assertEqual((por_estado['R']['monto'], por_estado['R']['monto_vigente']), (9999, 0))
        self.assertEqual((por_estado['DC']['monto'], por_estado['DC']['monto_vigente']), (1500, 1500))
        self.assertEqual([r['accion'] for r in s['por_accion']][:3], ['Nuevo', 'Modificar', 'Eliminar'])
        # los estados salen en el orden del flujo, con R al final
        self.assertEqual([r['estado'] for r in s['por_estado']], ['P', 'AA', 'DC', 'R', 'Sin estado'])
        self.assertEqual(s['por_mes'][0]['mes'], '2026-03')

    def test_departamentos_acota(self):
        s = pac.calcular_formularios_pac_stats(2026, departamentos=['DEPARTAMENTO ATENCION PRIMARIA'])
        self.assertEqual(s['kpis']['total_fichas'], 2)
        self.assertEqual(pac.calcular_formularios_pac_stats(2026, departamentos=[])['kpis']['total_fichas'], 0)

    def test_sin_datos_no_revienta(self):
        FormularioPAC.objects.all().delete()
        k = pac.calcular_formularios_pac_stats()['kpis']
        self.assertEqual((k['total_fichas'], k['pct_aprobacion']), (0, None))


class FlujoTest(TestCase):
    def test_nodos_en_orden_con_monto_y_antiguedad(self):
        ficha(1, 'P', monto=100, fecha=HOY - timedelta(days=30))
        ficha(2, 'P', monto=50, fecha=HOY - timedelta(days=10))
        ficha(3, 'FR', monto=70, fecha=HOY - timedelta(days=5))
        ficha(4, 'DC', monto=1000, fecha=HOY - timedelta(days=200))
        ficha(5, 'R', monto=999, fecha=HOY - timedelta(days=100))
        f = pac.calcular_formularios_pac_flujo(2026, hoy=HOY)
        self.assertEqual([n['codigo'] for n in f['estados_pipeline']], ['P', 'FR', 'FA', 'AA', 'DC'])
        por = {n['codigo']: n for n in f['estados_pipeline']}
        self.assertEqual((por['P']['cantidad'], por['P']['monto']), (2, 150))
        self.assertEqual(por['P']['dias_en_tramite_promedio'], 20.0)
        self.assertEqual(por['P']['dias_en_tramite_max'], 30)
        self.assertEqual(por['FA']['cantidad'], 0)
        self.assertIsNone(por['FA']['dias_en_tramite_promedio'])
        # DC es estado final: cuenta y suma, pero no tiene «días en trámite»
        self.assertEqual(por['DC']['cantidad'], 1)
        self.assertIsNone(por['DC']['dias_en_tramite_promedio'])
        self.assertEqual(f['rechazadas'], {'cantidad': 1, 'monto': 999})
        self.assertEqual(f['total_en_tramite'], 3)

    def test_dias_en_bandeja_solo_donde_se_conoce(self):
        a = ficha(1, 'P', fecha=HOY - timedelta(days=40))   # un solo registro de la 1ª carga → desconocido
        b = ficha(2, 'FR', fecha=HOY - timedelta(days=40))  # vio P y luego FR → conocido
        FormularioPACEstadoLog.objects.create(formulario=a, estado='P', fecha_registro=date(2026, 10, 1))
        FormularioPACEstadoLog.objects.create(formulario=b, estado='P', fecha_registro=date(2026, 10, 1))
        FormularioPACEstadoLog.objects.create(formulario=b, estado='FR', fecha_registro=date(2026, 10, 10))
        f = pac.calcular_formularios_pac_flujo(hoy=HOY)
        por = {n['codigo']: n for n in f['estados_pipeline']}
        self.assertIsNone(por['P']['dias_en_bandeja_promedio'])
        self.assertEqual(por['FR']['dias_en_bandeja_promedio'], 4.0)
        self.assertEqual(f['historial_disponible_desde'], '2026-10-01')

    def test_ficha_nueva_posterior_a_la_primera_carga_si_tiene_dias_en_bandeja(self):
        vieja = ficha(1, 'DC')
        nueva = ficha(2, 'P', fecha=HOY - timedelta(days=3))
        FormularioPACEstadoLog.objects.create(formulario=vieja, estado='DC', fecha_registro=date(2026, 10, 1))
        FormularioPACEstadoLog.objects.create(formulario=nueva, estado='P', fecha_registro=date(2026, 10, 12))
        por = {n['codigo']: n for n in pac.calcular_formularios_pac_flujo(hoy=HOY)['estados_pipeline']}
        self.assertEqual(por['P']['dias_en_bandeja_promedio'], 2.0)


class AlertasTest(TestCase):
    def test_solo_en_tramite_y_sobre_el_umbral_ordenadas(self):
        ficha(1, 'P', fecha=HOY - timedelta(days=45))
        ficha(2, 'FR', fecha=HOY - timedelta(days=12))
        ficha(3, 'AA', fecha=HOY - timedelta(days=5))     # bajo el umbral
        ficha(4, 'DC', fecha=HOY - timedelta(days=300))   # final: no alerta
        ficha(5, 'R', fecha=HOY - timedelta(days=300))    # rechazada: no alerta
        r = pac.calcular_formularios_pac_alertas(2026, dias_min=10, hoy=HOY)
        self.assertEqual(r['count'], 2)
        self.assertEqual([x['folio'] for x in r['results']], [1, 2])
        self.assertEqual(r['results'][0]['id_ficha'], 'PAC-0001-26')
        self.assertEqual(r['results'][0]['dias'], 45)
        self.assertEqual(pac.calcular_formularios_pac_alertas(2026, dias_min=0, hoy=HOY)['count'], 3)


class CarroTest(TestCase):
    def setUp(self):
        ficha(1, 'DC', monto=1000)
        ficha(2, 'P', monto=300, depto='DEPARTAMENTO ATENCION PRIMARIA')
        ficha(3, 'R', monto=800)
        ficha(4, 'DC', accion='Eliminar', monto=None)
        linea(1, n=1, categoria='Alimentacion', producto='Abarrotes', monto=600, item='22.01.001 - Para Personas')
        linea(1, n=2, categoria='Alimentacion', producto='Abarrotes', monto=400, item='22.01.001 - Para Personas',
              mes=date(2026, 6, 1))
        linea(2, categoria='Oficina', producto='Resmas', monto=300, item='0', mes=None)
        linea(3, categoria='Oficina', producto='Rechazado', monto=800)
        linea(99, categoria='Oficina', producto='Huerfana', monto=123)   # sin cabecera

    def test_excluye_rechazadas_y_huerfanas_por_defecto(self):
        c = pac.calcular_formularios_pac_carro(2026)
        self.assertEqual(c['totales']['n_lineas'], 3)
        self.assertEqual(c['totales']['monto'], 1300)
        self.assertEqual(c['totales']['n_fichas'], 2)
        self.assertEqual(c['totales']['lineas_sin_ficha'], 1)
        self.assertEqual(c['totales']['lineas_sin_item'], 1)
        self.assertEqual(c['totales']['lineas_sin_mes'], 1)
        cats = {r['categoria']: r for r in c['por_categoria']}
        self.assertEqual(cats['Alimentacion']['monto'], 1000)
        self.assertEqual(cats['Alimentacion']['n_lineas'], 2)
        self.assertEqual(c['por_categoria'][0]['categoria'], 'Alimentacion')   # ordenado por monto
        self.assertNotIn('Rechazado', [r['producto'] for r in c['top_productos']])

    def test_item_y_mes(self):
        c = pac.calcular_formularios_pac_carro(2026)
        items = {r['codigo']: r for r in c['por_item']}
        self.assertEqual(items['22.01.001']['monto'], 1000)
        self.assertEqual(items['22.01.001']['nombre'], 'Para Personas')
        self.assertEqual(items['Sin ítem']['monto'], 300)
        self.assertEqual({r['codigo']: r['monto'] for r in c['por_subtitulo']}, {'22.01': 1000, 'Sin ítem': 300})
        meses = [r['mes'] for r in c['por_mes']]
        self.assertEqual(meses, ['2026-05', '2026-06', 'Sin mes'])   # «Sin mes» siempre al final

    def test_filtros_de_ficha(self):
        c = pac.calcular_formularios_pac_carro(2026, estados=['R'])
        self.assertEqual(c['totales']['monto'], 800)
        c = pac.calcular_formularios_pac_carro(2026, departamentos=['DEPARTAMENTO ATENCION PRIMARIA'])
        self.assertEqual(c['totales']['monto'], 300)
        self.assertEqual(c['totales']['lineas_sin_ficha'], 0)   # con filtro no se informa
        c = pac.calcular_formularios_pac_carro(2026, acciones=['Eliminar'])
        self.assertEqual(c['totales']['n_lineas'], 0)


class FichaTest(TestCase):
    def test_ficha_completa(self):
        f = ficha(10, 'DC', monto=1000, accion='Modificar', identificador_proyecto='1057532-32-PC26',
                  obs_rechazo=None, nombre_responsable='JUAN PEREZ')
        otra = ficha(11, 'R', accion='Modificar', identificador_proyecto='1057532-32-PC26', monto=5,
                     fecha=date(2026, 2, 1))
        linea(10, n=1, monto=600)
        linea(10, n=2, monto=400)
        FormularioPACEstadoLog.objects.create(formulario=f, estado='P', fecha_registro=date(2026, 9, 1))
        FormularioPACEstadoLog.objects.create(formulario=f, estado='DC', fecha_registro=date(2026, 9, 20))
        PlanerPAC.objects.create(id_proyecto='1057532-32-PC26', nombre_proyecto='Plan X', monto_total_item='700',
                                 depto='DEPARTAMENTO DE SALUD MENTAL')
        PlanerPAC.objects.create(id_proyecto='1057532-32-PC26', nombre_proyecto='Plan X', monto_total_item='300')

        r = pac.calcular_formulario_pac_ficha(f.pk, mapa_organigrama={}, hoy=HOY)
        self.assertEqual(r['ficha']['id_ficha'], 'PAC-0010-26')
        self.assertEqual(r['ficha']['accion_proyecto'], 'Modificar')
        self.assertEqual([p['linea'] for p in r['productos']], [1, 2])
        self.assertEqual(r['carro'], {'n_lineas': 2, 'suma_lineas': 1000, 'cuadra_con_monto': True, 'diferencia': 0})
        self.assertEqual([h['estado'] for h in r['historial_estados']], ['P', 'DC'])
        self.assertEqual(r['proyecto_plan']['en_plan_vigente'], True)
        self.assertEqual(r['proyecto_plan']['monto_total'], 1000.0)
        self.assertEqual(r['proyecto_plan']['n_items'], 2)
        self.assertEqual([x['id'] for x in r['fichas_del_mismo_proyecto']], [otra.pk])
        self.assertIsNone(r['organigrama'])

    def test_carro_que_no_cuadra_y_proyecto_fuera_del_plan(self):
        f = ficha(20, 'DC', monto=1000, identificador_proyecto='1057532-1-PC25')
        linea(20, monto=900)
        PacProyectoMaestro.objects.create(id_proyecto='1057532-1-PC25', nombre_proyecto='Maestro X', anho_pac=2025)
        r = pac.calcular_formulario_pac_ficha(f.pk, mapa_organigrama={}, hoy=HOY)
        self.assertEqual(r['carro']['cuadra_con_monto'], False)
        self.assertEqual(r['carro']['diferencia'], 100)
        self.assertEqual(r['proyecto_plan']['en_plan_vigente'], False)
        self.assertEqual(r['proyecto_plan']['en_maestro'], True)
        self.assertEqual(r['proyecto_plan']['nombre_proyecto'], 'Maestro X')

    def test_ficha_sin_carro_ni_proyecto(self):
        f = ficha(30, 'DC', accion='Eliminar', monto=None)
        r = pac.calcular_formulario_pac_ficha(f.pk, mapa_organigrama={}, hoy=HOY)
        self.assertIsNone(r['carro']['cuadra_con_monto'])
        self.assertEqual(r['productos'], [])
        self.assertIsNone(r['proyecto_plan'])

    def test_no_existe(self):
        with self.assertRaises(FormularioPAC.DoesNotExist):
            pac.calcular_formulario_pac_ficha(99999, mapa_organigrama={})


class OrganigramaTest(TestCase):
    def setUp(self):
        Establecimiento.objects.create(codigo=1, rut=1, dv='1', descripcion='DIRECCION SS OSORNO')
        SsoSubdireccion.objects.create(subdireccion_id=4, nombre='SUBDIRECCION ADMINISTRATIVA')
        self.salud = Departamento.objects.create(
            descripcion='DEPARTAMENTO DE SALUD MENTAL', subdireccion_id=4, es_depto='SI', establecimiento_id=1)
        self.ayekan = Departamento.objects.create(
            descripcion='AYEKAN', subdireccion_id=4, parent_id=self.salud.id, establecimiento_id=1)
        self.aps = Departamento.objects.create(
            descripcion='DEPARTAMENTO ATENCION PRIMARIA', subdireccion_id=4, es_depto='SI', establecimiento_id=1)
        ficha(1, depto='DEPARTAMENTO DE SALUD MENTAL')
        ficha(2, depto='AYEKAN')
        ficha(3, depto='DEPARTAMENTO ATENCION PRIMARIA')
        ficha(4, depto='UNIDAD QUE NO EXISTE')

    def test_subdepartamento_se_agrupa_en_su_departamento_raiz(self):
        mapa = pac.mapa_departamento_organigrama()
        self.assertEqual(mapa['AYEKAN']['depto_id'], self.salud.id)
        self.assertEqual(mapa['DEPARTAMENTO DE SALUD MENTAL']['nombre_subdireccion'], 'SUBDIRECCION ADMINISTRATIVA')
        self.assertIsNone(mapa['UNIDAD QUE NO EXISTE'])

    def test_arbol_con_conteos_y_sin_clasificar(self):
        arbol = pac.calcular_formularios_pac_organigrama()['subdirecciones']
        sub = next(s for s in arbol if s['subdireccion_id'] == 4)
        self.assertEqual(sub['total'], 3)
        deptos = {d['depto_id']: d['total'] for d in sub['departamentos']}
        self.assertEqual(deptos[self.salud.id], 2)   # la ficha de AYEKAN suma al raíz
        sin = next(s for s in arbol if s['subdireccion_id'] is None)
        self.assertEqual(sin['total'], 1)

    def test_traduccion_del_filtro(self):
        mapa = pac.mapa_departamento_organigrama()
        self.assertIsNone(pac.departamentos_de_organigrama(mapa))
        self.assertCountEqual(
            pac.departamentos_de_organigrama(mapa, depto=str(self.salud.id)),
            ['DEPARTAMENTO DE SALUD MENTAL', 'AYEKAN'])
        self.assertEqual(
            sorted(pac.departamentos_de_organigrama(mapa, subdireccion='4')),
            ['AYEKAN', 'DEPARTAMENTO ATENCION PRIMARIA', 'DEPARTAMENTO DE SALUD MENTAL'])
        self.assertEqual(pac.departamentos_de_organigrama(mapa, sin_clasificar=True), ['UNIDAD QUE NO EXISTE'])


def _cliente(role, username=None):
    u = User.objects.create_user(username=username or f'u_{role}', password='x')
    PerfilUsuario.objects.create(user=u, role=role)
    c = APIClient()
    c.force_authenticate(u)
    return c


class ApiTest(TestCase):
    def setUp(self):
        Establecimiento.objects.create(codigo=1, rut=1, dv='1', descripcion='DIRECCION SS OSORNO')
        SsoSubdireccion.objects.create(subdireccion_id=4, nombre='SUBDIRECCION ADMINISTRATIVA')
        self.salud = Departamento.objects.create(
            descripcion='DEPARTAMENTO DE SALUD MENTAL', subdireccion_id=4, es_depto='SI', establecimiento_id=1)
        self.aps = Departamento.objects.create(
            descripcion='DEPARTAMENTO ATENCION PRIMARIA', subdireccion_id=4, es_depto='SI', establecimiento_id=1)
        self.f1 = ficha(1, 'DC', monto=1000)
        self.f2 = ficha(2, 'P', monto=200, depto='DEPARTAMENTO ATENCION PRIMARIA', accion='Modificar')
        self.f3 = ficha(3, 'R', monto=300, anho=2025, fecha=date(2025, 5, 1))
        linea(1, n=1, monto=600)
        linea(1, n=2, monto=400, categoria='Oficina', producto='Resmas')
        linea(2, monto=200, categoria='Oficina', producto='Lapices')
        linea(3, anho=2025, monto=300)
        linea(77, monto=50)   # sin cabecera
        self.cli = _cliente('abastecimiento')

    def test_roles(self):
        for rol, esperado in (('admin', 200), ('abastecimiento', 200), ('comprador', 200), ('general', 200),
                              ('gestor_compras', 403), ('viewer', 403), ('finanzas', 403), ('jefatura', 403)):
            with self.subTest(rol=rol):
                c = _cliente(rol, f'u_{rol}_x')
                for url in ('/api/formularios-pac/stats/', '/api/formularios-pac-fichas/',
                            '/api/formularios-pac/flujo/', '/api/formularios-pac/alertas/',
                            '/api/formularios-pac/organigrama/', '/api/formularios-pac/carro/',
                            '/api/formularios-pac-productos/'):
                    self.assertEqual(c.get(url).status_code, esperado, url)

    def test_sin_token_401(self):
        self.assertEqual(APIClient().get('/api/formularios-pac/stats/').status_code, 401)
        self.assertEqual(APIClient().get('/api/formularios-pac-fichas/').status_code, 401)

    def test_lista_de_fichas(self):
        r = self.cli.get('/api/formularios-pac-fichas/', {'anho': 2026, 'ordering': 'folio'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['count'], 2)
        primero = r.data['results'][0]
        self.assertEqual(primero['id_ficha'], 'PAC-0001-26')
        self.assertEqual(primero['n_lineas'], 2)
        self.assertNotIn('descripcion_adquisicion', primero)   # los textos largos solo en la ficha
        self.assertIsNone(primero['dias_en_tramite'])          # DC: trámite terminado
        self.assertIsNotNone(r.data['results'][1]['dias_en_tramite'])  # P: en trámite

    def test_filtros_y_busqueda(self):
        g = self.cli.get
        self.assertEqual(g('/api/formularios-pac-fichas/', {'estado': 'P,R'}).data['count'], 2)
        self.assertEqual(g('/api/formularios-pac-fichas/', {'accion_proyecto': 'Modificar'}).data['count'], 1)
        self.assertEqual(g('/api/formularios-pac-fichas/', {'search': 'ATENCION PRIMARIA'}).data['count'], 1)
        self.assertEqual(g('/api/formularios-pac-fichas/', {'search': '3'}).data['count'] >= 1, True)
        self.assertEqual(g('/api/formularios-pac-fichas/', {'ordering': '-monto'}).data['results'][0]['folio'], 1)
        self.assertEqual(g('/api/formularios-pac-fichas/', {'ordering': '-n_lineas'}).data['results'][0]['folio'], 1)

    def test_filtro_organigrama(self):
        g = self.cli.get
        r = g('/api/formularios-pac-fichas/', {'depto': self.aps.id})
        self.assertEqual([f['folio'] for f in r.data['results']], [2])
        r = g('/api/formularios-pac-fichas/', {'subdireccion': 4})
        self.assertEqual(r.data['count'], 3)
        self.assertEqual(g('/api/formularios-pac-fichas/', {'depto': 99999}).data['count'], 0)
        # el mismo filtro acota las demás vistas
        self.assertEqual(g('/api/formularios-pac/stats/', {'depto': self.aps.id}).data['kpis']['total_fichas'], 1)
        self.assertEqual(g('/api/formularios-pac/flujo/', {'depto': self.aps.id}).data['total_en_tramite'], 1)

    def test_stats_flujo_alertas_organigrama(self):
        g = self.cli.get
        self.assertEqual(g('/api/formularios-pac/stats/', {'anho': 2026}).data['kpis']['total_fichas'], 2)
        flujo = g('/api/formularios-pac/flujo/', {'anho': 2026}).data
        self.assertEqual([n['codigo'] for n in flujo['estados_pipeline']], ['P', 'FR', 'FA', 'AA', 'DC'])
        self.assertEqual(g('/api/formularios-pac/alertas/', {'dias_min': 'x'}).status_code, 200)
        org = g('/api/formularios-pac/organigrama/').data
        self.assertTrue(any(s['subdireccion_id'] == 4 for s in org['subdirecciones']))

    def test_carro(self):
        c = self.cli.get('/api/formularios-pac/carro/', {'anho': 2026}).data
        self.assertEqual(c['totales']['monto'], 1200)
        self.assertEqual(c['totales']['lineas_sin_ficha'], 1)
        r = self.cli.get('/api/formularios-pac/carro/', {'anho': 2026, 'estado': 'P'}).data
        self.assertEqual(r['totales']['monto'], 200)

    def test_productos_con_ficha_y_filtros(self):
        g = self.cli.get
        r = g('/api/formularios-pac-productos/', {'anho': 2026, 'ordering': 'folio,linea'})
        self.assertEqual(r.data['count'], 4)
        con = [x for x in r.data['results'] if x['folio'] == 1][0]
        self.assertEqual(con['ficha']['id_ficha'], 'PAC-0001-26')
        self.assertEqual(con['ficha']['estado'], 'DC')
        huerfana = [x for x in r.data['results'] if x['folio'] == 77][0]
        self.assertIsNone(huerfana['ficha'])
        self.assertEqual(g('/api/formularios-pac-productos/', {'anho': 2026, 'con_ficha': 1}).data['count'], 3)
        self.assertEqual(g('/api/formularios-pac-productos/', {'estado': 'P'}).data['count'], 1)
        self.assertEqual(g('/api/formularios-pac-productos/', {'depto': self.aps.id}).data['count'], 1)
        self.assertEqual(g('/api/formularios-pac-productos/', {'categoria': 'Oficina', 'anho': 2026}).data['count'], 2)
        self.assertEqual(g('/api/formularios-pac-productos/', {'mes': '2026-05', 'anho': 2026}).data['count'], 4)
        self.assertEqual(g('/api/formularios-pac-productos/', {'mes': '2026-13'}).data['count'], 0)
        self.assertEqual(g('/api/formularios-pac-productos/', {'search': 'Lapices'}).data['count'], 1)

    def test_ficha_endpoint(self):
        g = self.cli.get
        r = g('/api/formularios-pac/ficha/', {'id': self.f1.pk})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['ficha']['id_ficha'], 'PAC-0001-26')
        self.assertEqual(len(r.data['productos']), 2)
        self.assertEqual(g('/api/formularios-pac/ficha/', {'id': 'abc'}).status_code, 400)
        self.assertEqual(g('/api/formularios-pac/ficha/').status_code, 400)
        self.assertEqual(g('/api/formularios-pac/ficha/', {'id': 99999}).status_code, 404)

    def test_las_vistas_fsc_siguen_igual(self):
        # el refactor del organigrama no debe cambiar Formularios FSC
        self.assertEqual(self.cli.get('/api/formularios/organigrama/').status_code, 200)
        self.assertEqual(self.cli.get('/api/formularios-fsc/', {'depto': 1}).status_code, 200)
