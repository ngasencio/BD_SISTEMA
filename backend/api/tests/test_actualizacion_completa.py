"""Actualización diaria completa (comando `actualizacion_completa`): FSC + OC + Licitaciones.

Nada toca el Panel ni Mercado Público reales: las etapas se reemplazan por dobles (o el
módulo ETL por un módulo falso). Candado y logs van a un directorio temporal; el correo, a la
bandeja en memoria (settings_test).
"""
import json
import os
import tempfile
import time
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth.models import User
from django.core import mail
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from api import services_actualizacion_diaria as act
from api import services_sync_formularios as base
from api.models import PerfilUsuario
from api.tests.test_sincronizar_formularios_fsc import CREDENCIALES, _EntornoAislado

HOY = date(2026, 10, 13)


def _etapa_mp_ok(etapa, desde, hasta, registro):
    return 'OK', f'{etapa} listo'


@override_settings(**CREDENCIALES)
class OrquestacionTest(_EntornoAislado, SimpleTestCase):
    def _correr(self, **kw):
        kw.setdefault('hoy', HOY)
        kw.setdefault('espera_min', 0)
        return act.ejecutar_actualizacion_completa(**kw)

    def test_ventana_de_10_dias_incluye_hoy_y_orden_fsc_oc_licitaciones(self):
        with mock.patch.object(act, '_etapa_formularios', return_value=('OK', 'fsc')), \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=_etapa_mp_ok) as mp:
            resultados = self._correr()
        self.assertEqual([r.etapa for r in resultados], ['formularios', 'ordenes_compra', 'licitaciones'])
        etapa, desde, hasta = mp.call_args_list[0].args[:3]
        self.assertEqual((etapa, desde, hasta), ('ordenes_compra', date(2026, 10, 4), HOY))
        self.assertEqual((hasta - desde).days + 1, 10)
        self.assertEqual(mail.outbox, [])
        self.assertFalse(self.candado.exists())

    def test_dias_configurable(self):
        with mock.patch.object(act, '_etapa_formularios', return_value=('OK', '')), \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=_etapa_mp_ok) as mp:
            self._correr(dias=3)
        self.assertEqual(mp.call_args_list[0].args[1], date(2026, 10, 11))

    def test_una_etapa_falla_las_demas_corren_y_sale_un_solo_correo(self):
        def mp(etapa, desde, hasta, registro):
            if etapa == 'ordenes_compra':
                raise act.MercadoPublicoSinRespuesta('API caída (clave-secreta)')
            return 'OK', 'listo'

        with mock.patch.object(act, '_etapa_formularios', return_value=('OK', 'fsc')), \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=mp) as llamadas:
            with self.assertRaises(act.ActualizacionFallida) as ctx:
                self._correr(reintentos=2)

        estados = {r.etapa: r.estado for r in ctx.exception.resultados}
        self.assertEqual(estados, {'formularios': 'OK', 'ordenes_compra': 'ERROR', 'licitaciones': 'OK'})
        # OC reintentó 2 veces; licitaciones corrió igual después del fallo de OC.
        self.assertEqual([c.args[0] for c in llamadas.call_args_list],
                         ['ordenes_compra', 'ordenes_compra', 'licitaciones'])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Órdenes de Compra', mail.outbox[0].subject)
        self.assertNotIn('clave-secreta', mail.outbox[0].body)
        self.assertFalse(self.candado.exists())

    def test_reintento_exitoso_no_manda_correo(self):
        efectos = [RuntimeError('sin red'), ('OK', 'listo')]
        with mock.patch.object(act, '_etapa_formularios', side_effect=efectos) as fsc, \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=_etapa_mp_ok):
            resultados = self._correr(reintentos=3)
        self.assertEqual(fsc.call_count, 2)
        self.assertTrue(all(r.estado == 'OK' for r in resultados))
        self.assertEqual(mail.outbox, [])

    def test_sin_credenciales_no_reintenta(self):
        with override_settings(PANEL_SSO_PASSWORD=''), \
                mock.patch.object(act.base, '_ejecutar_una_vez') as fsc, \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=_etapa_mp_ok):
            with self.assertRaises(act.ActualizacionFallida):
                self._correr(reintentos=3)
        fsc.assert_not_called()

    def test_con_candado_ajeno_omite_sin_ejecutar(self):
        self.assertTrue(base.adquirir_candado('boton'))
        with mock.patch.object(act, '_etapa_formularios') as fsc, \
                mock.patch.object(act, '_etapa_mercado_publico') as mp:
            self.assertIsNone(self._correr(esperar_candado_min=0))
        fsc.assert_not_called()
        mp.assert_not_called()
        self.assertTrue(self.candado.exists())  # el candado ajeno no se toca

    def test_sin_correo(self):
        with mock.patch.object(act, '_etapa_formularios', side_effect=RuntimeError('x')), \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=_etapa_mp_ok):
            with self.assertRaises(act.ActualizacionFallida):
                self._correr(reintentos=1, avisar_por_correo=False)
        self.assertEqual(mail.outbox, [])

    def test_comando_solo_filtra_etapas_y_falla_con_codigo_de_error(self):
        with mock.patch.object(act, '_etapa_formularios') as fsc, \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=MercadoError()) as mp:
            with self.assertRaises(CommandError):
                call_command('actualizacion_completa', '--solo', 'licitaciones',
                             '--reintentos', '1', '--espera-min', '0')
        fsc.assert_not_called()
        self.assertEqual([c.args[0] for c in mp.call_args_list], ['licitaciones'])


def MercadoError():
    return act.MercadoPublicoSinRespuesta('sin internet')


class CapturaStdoutTest(_EntornoAislado, SimpleTestCase):
    def test_detecta_como_termino_el_etl(self):
        cap = act._CapturaStdout(act.base._Registro(None, 'x'), '[OC]')
        cap.write('>>> EXTRACCIÓN SSO: 10/10/2026\n    Procesadas 10/50 OCs\r    Procesadas 50/50 OCs\r')
        cap.write('\n⚠️  API sin respuesta tras 5 intentos: timeout\n')
        self.assertFalse(cap.refresh_completo)
        self.assertEqual(cap.consultas_sin_respuesta, 1)
        cap.write('\n✨ PROCESO DE REFRESH COMPLETADO EXITOSAMENTE.\n')
        self.assertTrue(cap.refresh_completo)

    def test_marca_sin_novedades(self):
        cap = act._CapturaStdout(act.base._Registro(None, 'x'), '[LI]')
        cap.write('\n⚠️ No se encontraron nuevos datos en el rango seleccionado. Los Maestros no se tocarán.\n')
        self.assertTrue(cap.sin_novedades)
        self.assertFalse(cap.refresh_completo)


class EtapaMercadoPublicoTest(_EntornoAislado, TestCase):
    def _modulo(self, salida_refresh, guardar=None):
        tmp = Path(self._tmp.name)
        (tmp / 'OC_Maestro_Resumen.csv').write_text('CodigoOC;Nombre\nA;x\nB;y\n', encoding='utf-8-sig')
        (tmp / 'OC_Maestro_Detalles.csv').write_text('CodigoOC;Linea\nA;1\n', encoding='utf-8-sig')

        def refresh(desde, hasta, progress_callback=None):
            print(salida_refresh)

        self.guardar = guardar or mock.Mock(return_value=(2, 1))
        return SimpleNamespace(CARPETA_MAESTROS=tmp, refresh_base_datos=refresh, guardar_en_django=self.guardar)

    def _correr(self, modulo):
        registro = act.base._Registro(None, 'x')
        with mock.patch.object(act, '_importar_etl', return_value=modulo), \
                mock.patch.object(act, '_enlazar_fsc_oc', return_value='') as enlace:
            self.enlace = enlace
            return act._etapa_mercado_publico('ordenes_compra', date(2026, 10, 4), HOY, registro)

    def test_integra_y_carga_los_maestros(self):
        estado, detalle = self._correr(self._modulo('✨ PROCESO DE REFRESH COMPLETADO EXITOSAMENTE.'))
        self.assertEqual(estado, 'OK')
        self.assertIn('2 registros y 1 detalles', detalle)
        datos_res, datos_det = self.guardar.call_args.args
        self.assertEqual([r['CodigoOC'] for r in datos_res], ['A', 'B'])
        self.assertEqual(len(datos_det), 1)
        self.enlace.assert_called_once()

    def test_sin_novedades_no_toca_la_bd(self):
        estado, detalle = self._correr(self._modulo('⚠️ No se encontraron nuevos datos en el rango seleccionado.'))
        self.assertEqual(estado, 'SIN_NOVEDADES')
        self.guardar.assert_not_called()
        self.enlace.assert_not_called()

    def test_api_sin_respuesta_es_fallo_y_no_toca_la_bd(self):
        salida = '⚠️  API sin respuesta tras 5 intentos: timeout\n⚠️ No se encontraron nuevos datos en el rango'
        with self.assertRaises(act.MercadoPublicoSinRespuesta):
            self._correr(self._modulo(salida))
        self.guardar.assert_not_called()

    def test_carga_atomica_un_error_revierte_el_vaciado(self):
        User.objects.create_user('quedo@x.cl', password='x')

        def guardar_que_falla(res, det):
            User.objects.all().delete()  # el DELETE total que hacen los ETL...
            raise RuntimeError('bulk_create falló')  # ...y luego se cae a medias

        with self.assertRaises(RuntimeError):
            self._correr(self._modulo('✨ PROCESO DE REFRESH COMPLETADO EXITOSAMENTE.', guardar_que_falla))
        self.assertEqual(User.objects.filter(username='quedo@x.cl').count(), 1)


class LatidoCandadoTest(_EntornoAislado, SimpleTestCase):
    def test_renovar_candado_evita_que_se_dé_por_vencido(self):
        self.assertTrue(base.adquirir_candado('automatico'))
        viejo = time.time() - (base.CANDADO_VENCE_MIN + 5) * 60
        os.utime(self.candado, (viejo, viejo))
        base.renovar_candado()
        self.assertFalse(base.adquirir_candado('boton'))  # sigue vigente

    def test_renovar_no_toca_candado_ajeno(self):
        self.candado.write_text('999999\nautomatico\n2026-10-13T08:00:00\n', encoding='utf-8')
        viejo = time.time() - 3600
        os.utime(self.candado, (viejo, viejo))
        base.renovar_candado()
        self.assertAlmostEqual(self.candado.stat().st_mtime, viejo, delta=1)


class _ConexionFalsa:
    def __init__(self, motor):
        self.motor = motor

    def execute(self, sentencia, *a, **k):
        sql = str(sentencia)
        self.motor.log.append(sql)
        if 'information_schema' in sql:
            return [(t,) for t in self.motor.existentes]
        return mock.Mock()


class _MotorFalso:
    """Motor SQLAlchemy de mentira que solo anota las sentencias."""

    def __init__(self, existentes=()):
        self.log = []
        self.existentes = list(existentes)

    def begin(self):
        import contextlib

        @contextlib.contextmanager
        def _ctx():
            yield _ConexionFalsa(self)
        return _ctx()

    def dispose(self):
        pass


TABLAS_CA = [
    ('Maestro_Resumen.csv', 'api_compraagil_resumen'),
    ('Maestro_Productos.csv', 'api_compraagil_productos'),
    ('Maestro_Proveedores.csv', 'api_compraagil_proveedores'),
    ('Maestro_Productos_Cotizados.csv', 'api_compraagil_productos_cotizados'),
    ('Maestro_Documentos.csv', 'api_compraagil_documentos'),
]


class CargaCompraAgilAtomicaTest(_EntornoAislado, SimpleTestCase):
    def _modulo(self):
        tmp = Path(self._tmp.name)
        for archivo, _ in TABLAS_CA:
            (tmp / archivo).write_text(
                'CodigoCompraAgil;FechaCierre\nCA-1;2026-09-02 10:00\nCA-2;\n', encoding='utf-8-sig')
        return SimpleNamespace(CARPETA_MAESTROS=tmp)

    def _a_sql(self, motor, to_sql_falla_en=None):
        orden = {'n': 0}

        def to_sql(df_self, nombre, **kw):
            orden['n'] += 1
            if to_sql_falla_en and orden['n'] == to_sql_falla_en:
                raise RuntimeError('MySQL server has gone away')
            motor.log.append(f'to_sql:{nombre}')

        return mock.patch('pandas.DataFrame.to_sql', autospec=True, side_effect=to_sql)

    def test_intercambia_las_5_tablas_con_un_solo_rename(self):
        motor = _MotorFalso(existentes=[t for _, t in TABLAS_CA])
        with self._a_sql(motor):
            cargadas = act._subir_compra_agil(self._modulo(), act.base._Registro(None, 'x'), engine=motor)

        self.assertEqual(set(cargadas), {t for _, t in TABLAS_CA})
        self.assertEqual(cargadas['api_compraagil_resumen'], 2)
        renames = [q for q in motor.log if q.startswith('RENAME TABLE')]
        self.assertEqual(len(renames), 1)
        for _, tabla in TABLAS_CA:
            self.assertIn(f'`{tabla}` TO `{tabla}__viejo`', renames[0])
            self.assertIn(f'`{tabla}__nuevo` TO `{tabla}`', renames[0])
        # El intercambio ocurre DESPUÉS de preparar las 5, y las viejas se borran al final.
        i_rename = motor.log.index(renames[0])
        self.assertEqual(sum(1 for q in motor.log[:i_rename] if q.startswith('to_sql:')), 5)
        self.assertTrue(any('DROP TABLE IF EXISTS `api_compraagil_resumen__viejo`' in q
                            for q in motor.log[i_rename + 1:]))

    def test_si_una_tabla_falla_no_se_toca_ninguna_vigente(self):
        motor = _MotorFalso(existentes=[t for _, t in TABLAS_CA])
        with self._a_sql(motor, to_sql_falla_en=3):
            with self.assertRaises(RuntimeError):
                act._subir_compra_agil(self._modulo(), act.base._Registro(None, 'x'), engine=motor)
        self.assertFalse([q for q in motor.log if q.startswith('RENAME')])
        # Solo se borraron las tablas de preparación (__nuevo / restos __viejo), nunca las vigentes.
        borrados = [q for q in motor.log if q.startswith('DROP TABLE')]
        self.assertTrue(borrados)
        self.assertTrue(all('__nuevo' in q or '__viejo' in q for q in borrados))

    def test_primera_vez_sin_tablas_previas_solo_renombra_las_nuevas(self):
        motor = _MotorFalso(existentes=[])
        with self._a_sql(motor):
            act._subir_compra_agil(self._modulo(), act.base._Registro(None, 'x'), engine=motor)
        rename = [q for q in motor.log if q.startswith('RENAME TABLE')][0]
        self.assertIn('`api_compraagil_resumen__nuevo` TO `api_compraagil_resumen`', rename)
        self.assertNotIn('__viejo', rename)  # no había nada que respaldar


class PlanificacionCompraAgilTest(SimpleTestCase):
    def test_pendientes_son_los_no_cubiertos_mas_el_repaso_lo_reciente_primero(self):
        cubiertos = {date(2026, 9, 1) + timedelta(days=i) for i in range(10)}  # 1 al 10
        bloques = act._planificar_bloques_ca(date(2026, 9, 1), date(2026, 9, 20), cubiertos, 3, 7)
        self.assertEqual([[d.day for d in b] for b in bloques],
                         [[20, 19, 18, 17, 16, 15, 14], [13, 12, 11]])

    def test_lo_reciente_va_primero_y_el_historico_de_antiguo_a_nuevo(self):
        bloques = act._planificar_bloques_ca(date(2026, 1, 1), date(2026, 9, 20), set(), 3, 4)
        plano = [d for b in bloques for d in b]
        self.assertEqual(len(plano), 263)  # 1-ene al 20-sep, ninguno cubierto
        self.assertEqual(plano[0], date(2026, 9, 20))
        reciente = [d for d in plano if d >= date(2026, 8, 21)]            # últimos 30 días
        self.assertEqual(plano[:len(reciente)], sorted(reciente, reverse=True))
        historico = plano[len(reciente):]
        self.assertEqual(historico[0], date(2026, 1, 1))                   # enero primero (el hueco)
        self.assertEqual(historico, sorted(historico))
        self.assertTrue(all(len(b) == 4 for b in bloques[:-1]))

    def test_con_todo_cubierto_solo_queda_el_repaso(self):
        cubiertos = {date(2026, 9, 1) + timedelta(days=i) for i in range(19)}  # 1 al 19
        bloques = act._planificar_bloques_ca(date(2026, 9, 1), date(2026, 9, 20), cubiertos, 3, 7)
        self.assertEqual([[d.day for d in b] for b in bloques], [[20, 19, 18]])

    def test_piso_futuro_no_planifica_nada(self):
        self.assertEqual(act._planificar_bloques_ca(date(2026, 11, 1), HOY, set(), 3, 7), [])

    def test_rangos_consecutivos(self):
        dias = {date(2026, 9, 1), date(2026, 9, 2), date(2026, 9, 4)}
        self.assertEqual(act._a_rangos(dias), [[date(2026, 9, 1), date(2026, 9, 2)],
                                               [date(2026, 9, 4), date(2026, 9, 4)]])

    def test_lee_formato_nuevo_anterior_y_basura(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / 'estado.json'
            self.assertEqual(act._leer_cubiertos_ca(ruta), set())  # no existe
            ruta.write_text('{basura', encoding='utf-8')
            self.assertEqual(act._leer_cubiertos_ca(ruta), set())
            ruta.write_text(json.dumps({'piso': '2026-09-01', 'completo_hasta': '2026-09-03'}), encoding='utf-8')
            self.assertEqual(len(act._leer_cubiertos_ca(ruta)), 3)  # formato anterior
            ruta.write_text(json.dumps({'cubiertos': [['2026-01-01', '2026-01-31'], ['2026-09-01', '2026-09-02']]}),
                            encoding='utf-8')
            self.assertEqual(len(act._leer_cubiertos_ca(ruta)), 33)


class EtapaCompraAgilTest(_EntornoAislado, SimpleTestCase):
    OK = '✨ PROCESO DE REFRESH COMPLETADO EXITOSAMENTE.'

    def _etapa(self, hasta=date(2026, 9, 2), piso=date(2026, 8, 25), hoy=None, con_datos=(), fallo_listado=(),
               forzar=False, presupuesto_min=390, hilos=3, estado=None, detalle_fallido=()):
        tmp = Path(self._tmp.name)
        if estado is not None:
            (tmp / 'estado_actualizacion.json').write_text(json.dumps(estado), encoding='utf-8')
        self.descargados = []     # días que realmente se pidieron a la API
        self.integraciones = []   # (desde, hasta, días con datos) por cada refresh original

        m = SimpleNamespace(CARPETA_BASE=tmp, CARPETA_MAESTROS=tmp)

        def procesar_dia(dia, modo_actualizar=False):
            self.descargados.append(dia)
            if dia in fallo_listado:
                print('⚠️  API sin respuesta tras 5 intentos: HTTP Error 504: Gateway Timeout')
                return False
            if dia in detalle_fallido:
                print('   [1/2] 1057532-12-COT26... ⚠️  API sin respuesta tras 5 intentos: timed out')
                print('❌ Error')
            if dia in con_datos:
                print(f'✨ DÍA {dia:%Y%m%d} COMPLETADO EXITOSAMENTE.')
                return True
            print('   ℹ️  No hay Compras Ágiles con cambios')
            return False

        def refresh(a, b):
            hubo, d = [], a
            while d <= b:
                if m.procesar_dia(d, modo_actualizar=True):
                    hubo.append(d)
                d += timedelta(days=1)
            self.integraciones.append((a, b, hubo))
            print(self.OK if hubo else '⚠️  No se encontraron nuevos datos del SSO en el rango seleccionado.')

        m.procesar_dia, m.refresh_base_datos = procesar_dia, refresh
        registro = act.base._Registro(None, 'x')
        with mock.patch.object(act, '_importar_etl', return_value=m), \
                mock.patch.object(act, '_subir_compra_agil',
                                  return_value={'api_compraagil_resumen': 120,
                                                'api_compraagil_productos': 300}) as subir:
            self.subir = subir
            return act._etapa_compra_agil(piso, hasta, registro, forzar_rango=forzar,
                                          presupuesto_min=presupuesto_min, hilos=hilos, repaso=3,
                                          hoy=hoy or hasta)

    def _estado_guardado(self):
        ruta = Path(self._tmp.name) / 'estado_actualizacion.json'
        return json.loads(ruta.read_text(encoding='utf-8')) if ruta.exists() else None

    def test_historico_baja_todo_el_rango_en_paralelo_e_integra_con_el_etl_original(self):
        estado, detalle = self._etapa(con_datos={date(2026, 8, 30), date(2026, 9, 1)})
        self.assertEqual(estado, 'OK')
        self.assertEqual(sorted(self.descargados),
                         [date(2026, 8, 25) + timedelta(days=i) for i in range(9)])  # 25-ago al 2-sep
        # El refresh original integra por bloque y NO vuelve a descargar (usa lo ya bajado).
        self.assertEqual(len(self.descargados), 9)
        integrados = {d for _, _, hubo in self.integraciones for d in hubo}
        self.assertEqual(integrados, {date(2026, 8, 30), date(2026, 9, 1)})
        self.assertIn('120 compras ágiles', detalle)
        self.assertIn('completo', detalle)
        self.subir.assert_called_once()
        # Todos los días leídos quedan cubiertos, salvo hoy (puede cambiar).
        self.assertEqual(self._estado_guardado(), {'cubiertos': [['2026-08-25', '2026-09-01']]})

    def test_reanuda_y_solo_baja_el_repaso_si_ya_esta_todo_cubierto(self):
        estado = {'cubiertos': [['2026-08-25', '2026-08-31']]}
        self._etapa(estado=estado, con_datos={date(2026, 9, 1)})
        self.assertEqual(sorted(self.descargados), [date(2026, 8, 31), date(2026, 9, 1), date(2026, 9, 2)])

    def test_sin_novedades_no_carga_pero_deja_los_dias_cubiertos(self):
        estado, _ = self._etapa()
        self.assertEqual(estado, 'SIN_NOVEDADES')
        self.subir.assert_not_called()
        self.assertEqual(self._estado_guardado(), {'cubiertos': [['2026-08-25', '2026-09-01']]})

    def test_un_dia_con_fallo_de_listado_queda_pendiente_y_los_demas_avanzan(self):
        estado, _ = self._etapa(con_datos={date(2026, 8, 30)}, fallo_listado={date(2026, 8, 28)})
        self.assertEqual(estado, 'OK')
        self.assertEqual(self._estado_guardado(),
                         {'cubiertos': [['2026-08-25', '2026-08-27'], ['2026-08-29', '2026-09-01']]})

    def test_fallos_de_detalle_sueltos_se_informan_y_no_frenan_el_avance(self):
        estado, detalle = self._etapa(con_datos={date(2026, 8, 30)}, detalle_fallido={date(2026, 8, 30)})
        self.assertEqual(estado, 'OK')
        self.assertIn('1 detalle(s) sueltos', detalle)
        self.assertEqual(self._estado_guardado(), {'cubiertos': [['2026-08-25', '2026-09-01']]})

    def test_api_caida_corta_y_no_toca_la_bd(self):
        todos = {date(2026, 8, 25) + timedelta(days=i) for i in range(9)}
        with self.assertRaises(act.MercadoPublicoSinRespuesta):
            self._etapa(fallo_listado=todos)
        self.subir.assert_not_called()
        self.assertIsNone(self._estado_guardado())
        self.assertLess(len(self.descargados), 9)  # dejó de pedir días al ver que no responde

    def test_rango_puntual_procesa_todo_y_registra_los_dias_leidos(self):
        previo = {'cubiertos': [['2026-08-25', '2026-08-30']]}
        self._etapa(forzar=True, estado=previo, con_datos={date(2026, 8, 26)},
                    fallo_listado={date(2026, 8, 27)})
        self.assertEqual(len(self.descargados), 9)  # incluso los días que figuraban cubiertos
        # Mantiene lo previo (el 27 ya estaba cubierto) y suma lo nuevo que salió completo.
        self.assertEqual(self._estado_guardado(), {'cubiertos': [['2026-08-25', '2026-09-01']]})

    def test_rango_que_termina_en_el_pasado_si_cubre_su_ultimo_dia(self):
        # --ca-hasta 31-ago con "hoy" = 2-sep: el 31 ya terminó, queda cubierto.
        self._etapa(piso=date(2026, 8, 29), hasta=date(2026, 8, 31), hoy=date(2026, 9, 2), forzar=True)
        self.assertEqual(self._estado_guardado(), {'cubiertos': [['2026-08-29', '2026-08-31']]})

    def test_presupuesto_de_tiempo_deja_parcial_y_sube_lo_hecho(self):
        # presupuesto negativo = "ya se pasó" desde el primer bloque (el reloj de Windows tiene
        # ~15 ms de resolución y los bloques falsos toman 0 ms: 0 no es confiable).
        estado, detalle = self._etapa(con_datos={date(2026, 9, 1)}, presupuesto_min=-1)
        self.assertEqual(estado, 'OK')
        self.assertIn('PARCIAL', detalle)
        self.assertIn('sigue la próxima noche', detalle)
        self.assertEqual(len(self.descargados), 6)  # un solo bloque (2 × hilos = 6) y corta
        self.subir.assert_called_once()
        self.assertEqual(self._estado_guardado(), {'cubiertos': [['2026-08-28', '2026-09-01']]})

    def test_linea_de_error_ajena_no_se_cuenta(self):
        cap = act._CapturaStdout(act.base._Registro(None, 'x'), '[CA]')
        cap.write('   ❌ Error en api_compraagil_resumen: algo\n')
        self.assertEqual(cap.consultas_sin_respuesta, 0)

    def test_clasifica_fallo_de_listado_y_de_detalle(self):
        cap = act._CapturaStdout(act.base._Registro(None, 'x'), '[CA]', umbral_caida=99)
        cap.write('⚠️  Falló página 4\n')
        cap.write('⚠️  API sin respuesta tras 5 intentos: x\n')
        cap.write('[3/20] 1057532-12-COT26... ❌ Error\n')
        self.assertEqual((cap.fallos_listado, cap.detalles_fallidos), (2, 1))

    def test_el_ruido_no_va_al_log_pero_se_sigue_leyendo(self):
        cap = act._CapturaStdout(act.base._Registro(None, 'x'), '[CA]')
        self.assertTrue(cap._RE_RUIDO.search('   📄 Obteniendo página 3/114...'))
        self.assertTrue(cap._RE_RUIDO.search('[7/1140] 1063538-2211-COT26... ⊗ Código organismo (1063538)'))
        self.assertFalse(cap._RE_RUIDO.search('✨ DÍA 20261010 COMPLETADO EXITOSAMENTE.'))


@override_settings(**CREDENCIALES, SYNC_COMPRA_AGIL_DESDE='2026-09-01')
class OrquestacionCompraAgilTest(_EntornoAislado, SimpleTestCase):
    def test_por_defecto_no_incluye_compra_agil(self):
        with mock.patch.object(act, '_etapa_formularios', return_value=('OK', '')), \
                mock.patch.object(act, '_etapa_mercado_publico', side_effect=_etapa_mp_ok), \
                mock.patch.object(act, '_etapa_compra_agil') as ca:
            resultados = act.ejecutar_actualizacion_completa(hoy=HOY, espera_min=0)
        ca.assert_not_called()
        self.assertNotIn('compra_agil', [r.etapa for r in resultados])

    def test_solo_compra_agil_va_de_la_fecha_fija_hasta_hoy(self):
        with mock.patch.object(act, '_etapa_formularios') as fsc, \
                mock.patch.object(act, '_etapa_mercado_publico') as mp, \
                mock.patch.object(act, '_etapa_compra_agil', return_value=('OK', 'listo')) as ca:
            resultados = act.ejecutar_actualizacion_completa(etapas=('compra_agil',), hoy=HOY, espera_min=0)
        fsc.assert_not_called()
        mp.assert_not_called()
        self.assertEqual(ca.call_args.args[:2], (date(2026, 9, 1), HOY))
        self.assertEqual([r.etapa for r in resultados], ['compra_agil'])

    def test_fecha_de_inicio_configurable_por_parametro_y_por_settings(self):
        with mock.patch.object(act, '_etapa_compra_agil', return_value=('OK', '')) as ca:
            act.ejecutar_actualizacion_completa(etapas=('compra_agil',), hoy=HOY, espera_min=0,
                                                ca_desde=date(2026, 10, 1))
            self.assertEqual(ca.call_args.args[0], date(2026, 10, 1))
            with override_settings(SYNC_COMPRA_AGIL_DESDE='2026-09-15'):
                act.ejecutar_actualizacion_completa(etapas=('compra_agil',), hoy=HOY, espera_min=0)
            self.assertEqual(ca.call_args.args[0], date(2026, 9, 15))

    def test_rango_puntual_fuerza_el_rango_y_el_configurado_no(self):
        with mock.patch.object(act, '_etapa_compra_agil', return_value=('OK', '')) as ca:
            act.ejecutar_actualizacion_completa(etapas=('compra_agil',), hoy=HOY, espera_min=0)
            self.assertFalse(ca.call_args.kwargs['forzar_rango'])
            act.ejecutar_actualizacion_completa(etapas=('compra_agil',), hoy=HOY, espera_min=0,
                                                ca_desde=date(2026, 10, 1))
            self.assertTrue(ca.call_args.kwargs['forzar_rango'])

    def test_fecha_invalida_en_settings_cae_al_valor_por_defecto(self):
        with override_settings(SYNC_COMPRA_AGIL_DESDE='no-es-fecha'):
            self.assertEqual(act.compra_agil_desde_configurado(), date(2026, 9, 1))

    def test_comando_solo_compra_agil(self):
        with mock.patch.object(act, '_etapa_compra_agil', return_value=('OK', 'listo')) as ca, \
                mock.patch.object(act, '_etapa_formularios') as fsc:
            call_command('actualizacion_completa', '--solo', 'compra_agil', '--ca-desde', '2026-09-10')
        fsc.assert_not_called()
        self.assertEqual(ca.call_args.args[0], date(2026, 9, 10))

    def test_comando_rechaza_fecha_mal_escrita(self):
        with self.assertRaises(CommandError):
            call_command('actualizacion_completa', '--solo', 'compra_agil', '--ca-desde', '01-09-2026')


class BotonesOCyLicitacionesRespetanCandadoTest(_EntornoAislado, TestCase):
    def _cliente(self):
        user = User.objects.create_user('abast@x.cl', password='x')
        PerfilUsuario.objects.create(user=user, role='abastecimiento')
        cli = APIClient()
        cli.force_authenticate(user)
        return cli

    def test_oc_licitaciones_y_compra_agil_responden_409_si_hay_otra_actualizacion(self):
        cli = self._cliente()
        self.assertTrue(base.adquirir_candado('automatico'))
        cuerpo = {'fecha_desde': '2026-10-01', 'fecha_hasta': '2026-10-13'}
        for url in ('/api/ordenes-compra/actualizar/', '/api/licitaciones/actualizar/',
                    '/api/compraagil/actualizar/'):
            with self.subTest(url=url), mock.patch('api.views.threading.Thread') as hilo:
                resp = cli.post(url, cuerpo, format='json')
                self.assertEqual(resp.status_code, 409)
                self.assertIn('en curso', resp.json()['error'])
                hilo.assert_not_called()
