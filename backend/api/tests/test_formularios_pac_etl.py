"""Carga de Formularios PAC (cabeceras + carro) desde los reportes del Panel SS Osorno.

Los HTML de prueba reproducen las rarezas REALES de los reportes del 2026-10-14: `<td>` sin
cerrar, una fila con una celda de menos, `NA` en el identificador, `SELECCIONE...` como unidad
y mes, montos con puntos de miles. Nunca se toca el Panel.
"""
import tempfile
from datetime import date
from pathlib import Path

from django.test import SimpleTestCase, TestCase

from api import services_formularios_pac_etl as etl
from api.models import FormularioPAC, FormularioPACEstadoLog, FormularioPACProducto

COLS_CABECERA = [
    'id', 'fecha ficha', 'anho', 'accion proyecto', 'identificador proyecto', 'departamento',
    'cargo responsable', 'nombre responsable', 'anexo', 'correo', 'fecha autorizacion jefe',
    'nombre jefatura', 'nombre proyecto', 'tipo requerimiento', 'tipo proyecto',
    'recursos programaticos', 'rec prog justificacion', 'nombre programa',
    'descripcion adquisicion', 'objetivo adquisicion', 'excel adjunto', 'archivo post finanzas',
    'monto', 'estado', 'obs rechazo', 'fecha rechazo', 'solicitante',
]
COLS_CARRO = ['Folio', 'Establecimiento', 'Anho', 'Categoria', 'Producto', 'Monto', 'Cantidad',
              'Unidad', 'Item Presupuestario', 'Mes Ejecucion']
LINK = 'https://panel.ssosorno.cl/panel_documental/app/solicitudes_compras/plan_compras/'


def ficha(folio, anho=2026, estado='DC', monto='1.000.000', accion='Nuevo', ident='', depto='DEPARTAMENTO DE SALUD MENTAL',
          fecha='2026-03-04', rechazo=''):
    """Una fila de 27 celdas, en el orden del Panel."""
    return [
        str(folio), fecha, str(anho), accion, ident, depto,
        'Encargado', 'JUAN PEREZ', '645654', 'juan@redsalud.gob.cl', '2026-03-06',
        'MARIA JEFA', f'Proyecto {folio}', 'Adquisicion', 'Operacional',
        'NO', '', f'Programa {folio}', f'Descripción {folio}', f'Objetivo {folio}',
        LINK, LINK + 'finanzas/', monto, estado, 'Motivo' if rechazo else '', rechazo, 'JUAN PEREZ',
    ]


def html(columnas, filas, td_sin_cerrar=False):
    cierre = '' if td_sin_cerrar else '</td>'
    cab = ''.join(f'<th>{c}</th>' for c in columnas)
    cuerpo = ''.join(
        '<tr>' + ''.join(f"<td scope='row'>{c}{cierre}" for c in fila) + '</tr>' for fila in filas
    )
    return (f'<table id="TableDetailGeneral"><thead><tr>{cab}</tr></thead>'
            f'<tbody id="TablaDetail">{cuerpo}</tbody></table>')


class _ConArchivos:
    def setUp(self):
        super().setUp()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)

    def archivo(self, contenido, nombre='reporte.xls', codificacion='cp1252'):
        ruta = Path(self._tmp.name) / nombre
        ruta.write_bytes(contenido.encode(codificacion, errors='replace'))
        return ruta


class ConversionesTest(SimpleTestCase):
    def test_a_entero(self):
        self.assertEqual(etl.a_entero('108.183.000'), 108183000)
        self.assertEqual(etl.a_entero('-5.668.124'), -5668124)
        self.assertEqual(etl.a_entero('1.234,50'), 1234)
        self.assertEqual(etl.a_entero('0'), 0)
        self.assertIsNone(etl.a_entero('DC'))
        self.assertIsNone(etl.a_entero(''))
        self.assertIsNone(etl.a_entero(None))

    def test_a_fecha(self):
        self.assertEqual(etl.a_fecha('2026-03-04'), date(2026, 3, 4))
        self.assertEqual(etl.a_fecha('04-03-2026'), date(2026, 3, 4))
        self.assertIsNone(etl.a_fecha('0000-00-00'))
        self.assertIsNone(etl.a_fecha(''))

    def test_a_texto_descarta_vacios_y_placeholders(self):
        for v in ('', 'NA', 'nan', 'None', 'SELECCIONE...', '  seleccione...  ', None):
            self.assertIsNone(etl.a_texto(v), v)
        self.assertEqual(etl.a_texto('  Hola '), 'Hola')
        self.assertEqual(etl.a_texto('abcdef', 3), 'abc')

    def test_mes_ejecucion(self):
        self.assertEqual(etl.interpretar_mes_ejecucion('enero-25', 2025), ('enero-25', date(2025, 1, 1)))
        self.assertEqual(etl.interpretar_mes_ejecucion('Diciembre-24', 2025), ('Diciembre-24', date(2024, 12, 1)))
        # sin año → el de la ficha
        self.assertEqual(etl.interpretar_mes_ejecucion('Abril', 2026), ('Abril', date(2026, 4, 1)))
        self.assertEqual(etl.interpretar_mes_ejecucion('Septiembre-26', 2026)[1], date(2026, 9, 1))
        self.assertEqual(etl.interpretar_mes_ejecucion('SELECCIONE...', 2026), (None, None))
        self.assertEqual(etl.interpretar_mes_ejecucion('', 2026), (None, None))
        self.assertEqual(etl.interpretar_mes_ejecucion('trimestre', 2026), ('trimestre', None))

    def test_normalizar_cabecera(self):
        self.assertEqual(etl.normalizar_cabecera('Fecha Autorizacion Jefe'), 'fecha_autorizacion_jefe')
        self.assertEqual(etl.normalizar_cabecera('Item Presupuestario'), 'item_presupuestario')
        self.assertEqual(etl.normalizar_cabecera('Año'), 'ano')


class LecturaHtmlTest(_ConArchivos, SimpleTestCase):
    def test_td_sin_cerrar_se_lee_igual(self):
        ruta = self.archivo(html(COLS_CARRO, [['1', 'DSSO', '2026', 'Cat', 'Prod', '1.000', '2', 'Unidad', '22.04', 'enero-26']],
                                 td_sin_cerrar=True))
        cabeceras, filas = etl.leer_tabla_html(ruta)
        self.assertEqual(cabeceras[:3], ['folio', 'establecimiento', 'anho'])
        self.assertEqual(len(filas), 1)
        self.assertEqual(len(filas[0]), 10)
        self.assertEqual(filas[0][5], '1.000')

    def test_acentos_cp1252_y_utf8(self):
        fila = ['1', 'DSSO', '2026', 'Alimentación', 'Café', '1', '1', 'Unidad', '', 'enero-26']
        for codificacion in ('cp1252', 'utf-8'):
            ruta = self.archivo(html(COLS_CARRO, [fila]), codificacion=codificacion)
            _, filas = etl.leer_tabla_html(ruta)
            self.assertEqual(filas[0][3], 'Alimentación', codificacion)
            self.assertEqual(filas[0][4], 'Café', codificacion)

    def test_pagina_sin_tabla_es_reporte_invalido(self):
        ruta = self.archivo('<html><body>Iniciar sesión</body></html>')
        with self.assertRaises(etl.ReporteInvalido):
            etl.leer_tabla_html(ruta)


class CabecerasTest(_ConArchivos, TestCase):
    def cargar(self, filas, columnas=COLS_CABECERA, hoy=date(2026, 10, 14), **kw):
        return etl.sincronizar_cabeceras(self.archivo(html(columnas, filas, td_sin_cerrar=True)), hoy=hoy, **kw)

    def test_primera_carga_crea_fichas_y_log(self):
        r = self.cargar([
            ficha(2604, estado='DC', monto='108.183.000'),
            ficha(2605, estado='P', monto='', accion='Eliminar', ident='1057532-32-PC26'),
            ficha(2606, estado='R', rechazo='2026-03-13'),
        ])
        self.assertEqual((r['nuevos'], r['actualizados'], r['eliminados']), (3, 0, 0))
        a = FormularioPAC.objects.get(folio=2604, anho=2026)
        self.assertEqual(a.monto, 108183000)
        self.assertEqual(a.estado, 'DC')
        self.assertEqual(a.fecha_ficha, date(2026, 3, 4))
        self.assertEqual(a.fecha_autorizacion_jefe, date(2026, 3, 6))
        self.assertEqual(a.departamento, 'DEPARTAMENTO DE SALUD MENTAL')
        self.assertIsNone(a.identificador_proyecto)
        b = FormularioPAC.objects.get(folio=2605)
        self.assertEqual(b.accion_proyecto, 'Eliminar')
        self.assertIsNone(b.monto)
        self.assertEqual(b.identificador_proyecto, '1057532-32-PC26')
        c = FormularioPAC.objects.get(folio=2606)
        self.assertEqual(c.fecha_rechazo, date(2026, 3, 13))
        self.assertEqual(c.obs_rechazo, 'Motivo')
        self.assertEqual(FormularioPACEstadoLog.objects.count(), 3)
        self.assertTrue(all(l.fecha_registro == date(2026, 10, 14) for l in FormularioPACEstadoLog.objects.all()))

    def test_na_en_identificador_es_nulo_y_no_se_guardan_links(self):
        self.cargar([ficha(2604, ident='NA')])
        f = FormularioPAC.objects.get()
        self.assertIsNone(f.identificador_proyecto)
        self.assertFalse(any('plan_compras' in str(getattr(f, c.name) or '') for c in f._meta.fields))

    def test_segunda_carga_identica_no_cambia_nada(self):
        filas = [ficha(2604), ficha(2605, estado='P')]
        self.cargar(filas)
        r = self.cargar(filas, hoy=date(2026, 10, 15))
        self.assertEqual((r['nuevos'], r['actualizados'], r['sin_cambios'], r['eliminados']), (0, 0, 2, 0))
        self.assertEqual(FormularioPACEstadoLog.objects.count(), 2)  # sin filas de log nuevas

    def test_cambio_de_estado_actualiza_y_registra_transicion(self):
        self.cargar([ficha(2604, estado='P')])
        r = self.cargar([ficha(2604, estado='FR')], hoy=date(2026, 10, 20))
        self.assertEqual((r['nuevos'], r['actualizados']), (0, 1))
        f = FormularioPAC.objects.get()
        self.assertEqual(f.estado, 'FR')
        logs = list(f.historial_estados.order_by('id').values_list('estado', 'fecha_registro'))
        self.assertEqual(logs, [('P', date(2026, 10, 14)), ('FR', date(2026, 10, 20))])

    def test_ficha_ausente_se_elimina_solo_en_los_anios_del_archivo(self):
        self.cargar([ficha(1700, anho=2025, fecha='2025-05-01'), ficha(2604), ficha(2605)])
        # El nuevo reporte solo trae 2026 y le falta la 2605: la 2025 no se toca.
        r = self.cargar([ficha(2604)])
        self.assertEqual(r['eliminados'], 1)
        self.assertEqual(sorted(FormularioPAC.objects.values_list('folio', flat=True)), [1700, 2604])

    def test_borrar_la_ficha_borra_su_historial(self):
        self.cargar([ficha(2604), ficha(2605)])
        self.cargar([ficha(2604)])
        self.assertEqual(FormularioPACEstadoLog.objects.count(), 1)

    def test_guarda_contra_archivo_truncado(self):
        self.cargar([ficha(3000 + i) for i in range(30)])
        r = self.cargar([ficha(3000), ficha(3001)])
        self.assertTrue(r['borrado_omitido'])
        self.assertEqual(r['eliminados'], 0)
        self.assertEqual(FormularioPAC.objects.count(), 30)
        # con forzar sí borra
        r = self.cargar([ficha(3000), ficha(3001)], forzar=True)
        self.assertEqual(r['eliminados'], 28)
        self.assertEqual(FormularioPAC.objects.count(), 2)

    def test_fila_corta_se_realinea_con_los_links(self):
        # Le falta una celda de texto antes de los links (caso real: ficha 2310).
        corta = ficha(2310, estado='DC', monto='2.500.000')
        del corta[19]  # objetivo adquisicion
        r = self.cargar([corta, ficha(2311)])
        self.assertEqual(r['realineadas'], 1)
        f = FormularioPAC.objects.get(folio=2310)
        self.assertEqual(f.estado, 'DC')          # la cola quedó en su sitio
        self.assertEqual(f.monto, 2500000)
        self.assertEqual(f.solicitante, 'JUAN PEREZ')
        self.assertTrue(any('2310' in a and 'celda de texto' in a for a in r['advertencias']))

    def test_fila_ambigua_no_se_actualiza_ni_se_borra(self):
        self.cargar([ficha(2604, estado='P', monto='500')])
        mala = ficha(2604, estado='DC', monto='999')
        del mala[24]  # falta una celda DESPUÉS de los links: no se puede saber cuál
        r = self.cargar([mala, ficha(2605)])
        self.assertEqual(r['ambiguas'], 1)
        f = FormularioPAC.objects.get(folio=2604)
        self.assertEqual((f.estado, f.monto), ('P', 500))   # conserva lo anterior
        self.assertEqual(r['eliminados'], 0)
        self.assertTrue(FormularioPAC.objects.filter(folio=2605).exists())

    def test_estado_que_no_es_bandeja_queda_nulo(self):
        r = self.cargar([ficha(2604, estado='https://panel.ssosorno.cl/x')])
        self.assertIsNone(FormularioPAC.objects.get().estado)
        self.assertTrue(any('no es una bandeja' in a for a in r['advertencias']))

    def test_fila_sin_folio_se_descarta(self):
        r = self.cargar([ficha('', anho=2026), ficha(2605)])
        self.assertEqual(r['invalidas'], 1)
        self.assertEqual(FormularioPAC.objects.count(), 1)

    def test_columna_faltante_es_reporte_invalido(self):
        columnas = [c for c in COLS_CABECERA if c != 'estado']
        filas = [[v for v, c in zip(ficha(1), COLS_CABECERA) if c != 'estado']]
        with self.assertRaises(etl.ReporteInvalido) as cm:
            self.cargar(filas, columnas=columnas)
        self.assertIn('estado', str(cm.exception))

    def test_orden_distinto_de_columnas_se_resuelve_por_nombre(self):
        invertido = list(reversed(COLS_CABECERA))
        filas = [list(reversed(ficha(2604, estado='AA')))]
        self.cargar(filas, columnas=invertido)
        self.assertEqual(FormularioPAC.objects.get().estado, 'AA')


class CarroTest(_ConArchivos, TestCase):
    def cargar(self, filas, **kw):
        return etl.sincronizar_carro(self.archivo(html(COLS_CARRO, filas, td_sin_cerrar=True)), **kw)

    @staticmethod
    def linea(folio, anho=2026, prod='Resma', monto='10.000', cant='2', unidad='Unidad', item='22.04.001 - Materiales', mes='mayo-26'):
        return [str(folio), 'DSSO', str(anho), 'Articulos de Oficina', prod, monto, cant, unidad, item, mes]

    def test_carga_lineas_con_orden_y_mes(self):
        r = self.cargar([
            self.linea(100, prod='A'), self.linea(100, prod='B', mes='SELECCIONE...', unidad='SELECCIONE...'),
            self.linea(101, prod='C', item='', mes='Abril'),
        ])
        self.assertEqual((r['cargadas'], r['fichas'], r['invalidas']), (3, 2, 0))
        a, b = FormularioPACProducto.objects.filter(folio=100).order_by('linea')
        self.assertEqual((a.linea, a.producto, a.monto, a.cantidad), (1, 'A', 10000, 2))
        self.assertEqual(a.mes_ejecucion_fecha, date(2026, 5, 1))
        self.assertEqual((b.linea, b.mes_ejecucion, b.mes_ejecucion_fecha, b.unidad), (2, None, None, None))
        c = FormularioPACProducto.objects.get(folio=101)
        self.assertIsNone(c.item_presupuestario)
        self.assertEqual(c.mes_ejecucion_fecha, date(2026, 4, 1))   # sin año → el de la ficha

    def test_lineas_identicas_se_conservan(self):
        self.cargar([self.linea(100), self.linea(100), self.linea(100)])
        self.assertEqual(FormularioPACProducto.objects.filter(folio=100).count(), 3)

    def test_recarga_reemplaza_sin_duplicar(self):
        self.cargar([self.linea(100), self.linea(100, prod='B')])
        r = self.cargar([self.linea(100, prod='Z')])
        self.assertEqual(r['previas'], 2)
        self.assertEqual(list(FormularioPACProducto.objects.values_list('producto', flat=True)), ['Z'])

    def test_no_toca_anios_que_el_archivo_no_trae(self):
        self.cargar([self.linea(50, anho=2024), self.linea(100, anho=2026)])
        self.cargar([self.linea(100, anho=2026, prod='nuevo'), self.linea(101, anho=2026)])
        self.assertEqual(FormularioPACProducto.objects.filter(anho=2024).count(), 1)
        self.assertEqual(FormularioPACProducto.objects.filter(anho=2026).count(), 2)

    def test_linea_corta_se_descarta_y_se_informa(self):
        corta = self.linea(100)[:-1]
        r = self.cargar([self.linea(100), corta])
        self.assertEqual((r['cargadas'], r['invalidas']), (1, 1))
        self.assertTrue(r['advertencias'])

    def test_archivo_truncado_no_modifica_nada(self):
        self.cargar([self.linea(i) for i in range(1, 11)])
        with self.assertRaises(etl.ReporteInvalido):
            self.cargar([self.linea(1)])
        self.assertEqual(FormularioPACProducto.objects.count(), 10)
        self.cargar([self.linea(1)], forzar=True)
        self.assertEqual(FormularioPACProducto.objects.count(), 1)

    def test_archivo_sin_lineas_validas_no_borra(self):
        self.cargar([self.linea(1)])
        with self.assertRaises(etl.ReporteInvalido):
            self.cargar([['', 'DSSO', '', 'x', 'y', '1', '1', 'u', '', '']])
        self.assertEqual(FormularioPACProducto.objects.count(), 1)


class OrquestacionTest(_ConArchivos, TestCase):
    def test_cargar_formularios_pac_resumen_y_progreso(self):
        cab = self.archivo(html(COLS_CABECERA, [ficha(2604), ficha(2605, estado='P')], True), 'cab.xls')
        car = self.archivo(html(COLS_CARRO, [CarroTest.linea(2604), CarroTest.linea(2605)], True), 'car.xls')
        mensajes = []
        r = etl.cargar_formularios_pac({'cabecera': cab, 'carro': car},
                                       progress_callback=lambda **kw: mensajes.append(kw), hoy=date(2026, 10, 14))
        self.assertEqual((r['nuevos'], r['actualizados'], r['eliminados'], r['lineas_carro']), (2, 0, 0, 2))
        self.assertEqual(r['total'], 4)
        self.assertEqual(mensajes[-1]['progreso_pct'], 100)

    def test_sin_archivos(self):
        with self.assertRaises(FileNotFoundError):
            etl.cargar_formularios_pac({})

    def test_solo_cabecera(self):
        cab = self.archivo(html(COLS_CABECERA, [ficha(2604)], True))
        r = etl.cargar_formularios_pac({'cabecera': cab})
        self.assertEqual((r['nuevos'], r['lineas_carro']), (1, 0))
        self.assertEqual(FormularioPACProducto.objects.count(), 0)


class ReportesRealesTest(TestCase):
    """Regresión contra los reportes reales del 2026-10-14 (si siguen en la raíz del repo)."""
    RAIZ = Path(__file__).resolve().parents[3]
    CAB = RAIZ / 'total_pac_anho_14102026-151007.xls'
    CAR = RAIZ / 'total_carro_pac_14102026-151025.xls'

    def setUp(self):
        if not (self.CAB.exists() and self.CAR.exists()):
            self.skipTest('Reportes reales no presentes en la raíz del repo.')

    def test_conteos_y_cuadre(self):
        r = etl.cargar_formularios_pac({'cabecera': self.CAB, 'carro': self.CAR}, hoy=date(2026, 10, 14))
        self.assertEqual(FormularioPAC.objects.count(), 1114)
        self.assertEqual(FormularioPACProducto.objects.count(), 7634)
        self.assertEqual(r['cabeceras']['realineadas'], 1)
        self.assertEqual(r['cabeceras']['invalidas'], 0)
        self.assertEqual(r['carro']['invalidas'], 0)
        self.assertEqual(r['cabeceras']['anhos'], [2025, 2026])
        # la ficha corrida del reporte real quedó bien
        f = FormularioPAC.objects.get(folio=2310, anho=2025)
        self.assertEqual((f.estado, f.monto), ('DC', 2500000))
        self.assertEqual(FormularioPAC.objects.filter(estado='DC').count(), 905)  # 904 + la realineada
        # ninguna ficha quedó con un «estado» que no sea bandeja
        self.assertFalse(FormularioPAC.objects.exclude(estado__isnull=True).exclude(estado__in=['P', 'FR', 'FA', 'AA', 'DC', 'R']).exists())
        # montos: la suma del carro coincide con la cabecera en la inmensa mayoría de fichas
        from django.db.models import Sum
        suma = {(a, b): s for a, b, s in
                FormularioPACProducto.objects.values_list('folio', 'anho').annotate(s=Sum('monto')).order_by()}
        con_carro = [(c, suma[(c.folio, c.anho)]) for c in FormularioPAC.objects.filter(monto__isnull=False)
                     if (c.folio, c.anho) in suma]
        iguales = sum(1 for c, s in con_carro if c.monto == s)
        self.assertGreater(iguales / len(con_carro), 0.98)
        # idempotente
        r2 = etl.cargar_formularios_pac({'cabecera': self.CAB, 'carro': self.CAR}, hoy=date(2026, 10, 14))
        self.assertEqual((r2['nuevos'], r2['actualizados'], r2['eliminados']), (0, 0, 0))
        self.assertEqual(FormularioPACProducto.objects.count(), 7634)
