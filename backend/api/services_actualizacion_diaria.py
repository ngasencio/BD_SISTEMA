"""Actualización COMPLETA, sin botones: Formularios FSC + Órdenes de Compra + Licitaciones
(+ Compra Ágil, que corre aparte por la noche).

Es lo que hacen, uno tras otro, «Actualizar desde el Panel» (Formularios), «Actualizar API»
(Órdenes de Compra), «Actualizar API» (Licitaciones) y «Actualizar API» (Compra Ágil), pensado
para correr desatendido desde tareas programadas de Windows
(`python manage.py actualizacion_completa [--solo compra_agil]`).

Decisiones (ver también `services_sync_formularios`, de donde sale el candado, el log y el
paso de Formularios):

- **Ventana de N días** (10 por defecto, `hoy-(N-1)` … `hoy`) para OC y Licitaciones. Los ETL
  solo descargan ese rango y lo integran a sus CSV maestros; la BD se carga desde el maestro
  completo. Re-descargar la ventana cada día deja pasar cambios de estado y recupera días que
  hayan fallado el día anterior. Lo que quede fuera de la ventana NO se recupera solo.
- **Etapas independientes**: si una falla no se detiene el resto; se reintenta por etapa y, al
  final, UN correo con el resumen si algo quedó mal.
- **Carga a BD atómica**: los `guardar_en_django` de OC/Licitaciones hacen
  `DELETE total + bulk_create` sin transacción, y el de OC además se traga los errores
  (`subir_maestros_a_django` los imprime y sigue). Acá se llaman dentro de `transaction.atomic()`
  y sin ese `try/except`: si algo falla, rollback y las tablas quedan como estaban.
  Compra Ágil es peor: `sincronizar_con_servidor` hace `DROP TABLE` + `to_sql` por tabla (DDL, no
  se puede revertir), con la clave de `root` escrita en el script y tragándose los errores. Acá
  las 5 tablas se cargan en tablas `__nuevo` y, solo si TODAS salieron bien, se intercambian
  con UN `RENAME TABLE` atómico: la web nunca ve una tabla a medias y un fallo no borra nada.
- **Sin novedades ≠ fallo**: si la API de Mercado Público responde pero no hay datos en el
  rango, se deja todo como está. Solo es fallo si la API no respondió.
- **Candado compartido** con los botones y con `sincronizar_formularios_fsc`, con latido
  (una actualización larga no se da por huérfana) y espera acotada si ya hay otra en curso.
"""
import contextlib
import importlib
import json
import re
import sys
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from . import services_sync_formularios as base

NOMBRE_LOG = 'actualizacion_diaria'
RUTA_API = base.DIR_BACKEND.parent / 'api'

# Las que corren varias veces al día. Compra Ágil NO va aquí: tarda más y su API es la más
# frágil, así que tiene su propia tarea nocturna (`--solo compra_agil`).
ETAPAS_DIARIAS = ('formularios', 'formularios_pac', 'ordenes_compra', 'licitaciones')
ETAPAS = ETAPAS_DIARIAS + ('compra_agil',)
ETIQUETAS = {
    'formularios': 'Formularios FSC (Panel SSO)',
    'formularios_pac': 'Formularios PAC (Panel SSO)',
    'ordenes_compra': 'Órdenes de Compra (Mercado Público)',
    'licitaciones': 'Licitaciones (Mercado Público)',
    'compra_agil': 'Compras Ágiles (Mercado Público)',
}

# Compra Ágil se actualiza desde una fecha fija hasta hoy (no es una ventana móvil).
COMPRA_AGIL_DESDE_DEFECTO = date(2026, 9, 1)
_TABLAS_COMPRA_AGIL = (
    ('Maestro_Resumen.csv', 'api_compraagil_resumen'),
    ('Maestro_Productos.csv', 'api_compraagil_productos'),
    ('Maestro_Proveedores.csv', 'api_compraagil_proveedores'),
    ('Maestro_Productos_Cotizados.csv', 'api_compraagil_productos_cotizados'),
    ('Maestro_Documentos.csv', 'api_compraagil_documentos'),
)
# Columnas del resumen que el ETL guarda como DATETIME (igual que `sincronizar_con_servidor`).
_COLS_FECHA_COMPRA_AGIL = (
    'FechaPublicacion', 'FechaCierre', 'FechaUltimoCambio',
    'FechaCierrePrimerLlamado', 'FechaCierreSegundoLlamado', 'FechaCancelacion',
)

# Módulo ETL y maestros de cada fuente de Mercado Público.
_MERCADO_PUBLICO = {
    'ordenes_compra': dict(modulo='OC_SSO_SERVER', tag='OC',
                           resumen='OC_Maestro_Resumen.csv', detalle='OC_Maestro_Detalles.csv'),
    'licitaciones': dict(modulo='LI_SSO_SERVER', tag='LI',
                         resumen='Maestro_Resumen.csv', detalle='Maestro_Detalle.csv'),
}


class ActualizacionFallida(Exception):
    """Al menos una etapa quedó con error. `resultados` trae el detalle de todas."""

    def __init__(self, mensaje, resultados):
        super().__init__(mensaje)
        self.resultados = resultados


class ConfiguracionIncompleta(Exception):
    """Falta algo que reintentar no arregla (credenciales)."""


class MercadoPublicoSinRespuesta(Exception):
    """La API de Mercado Público no respondió (caída o PC sin internet)."""


@dataclass
class ResultadoEtapa:
    etapa: str
    estado: str  # OK | SIN_NOVEDADES | ERROR
    detalle: str = ''
    segundos: float = 0.0


# ─── Captura de la salida de los ETL ──────────────────────────────────────────

class _CapturaStdout:
    """Reemplaza sys.stdout durante un ETL: manda cada línea al log y detecta cómo terminó.

    Los ETL no devuelven resultado ni lanzan error ante una API caída: solo imprimen. Estas
    marcas son lo único que dice si el refresh integró datos, no encontró nada o no obtuvo
    respuesta de la API (los textos están en `OC_SSO_SERVER.py` / `LI_SSO_SERVER.py` /
    `AG_SSO_SERVER.py`).

    Además: da latido al candado (una actualización larga no se da por huérfana) y corta el
    ETL de inmediato si la API claramente está caída (varios fallos y ni un día logrado), para
    no gastar una hora en reintentar 40 días contra una API que no responde."""

    # Consultas que agotaron sus reintentos o que la API rechazó.
    _ERRORES_API = ('API sin respuesta', 'Falló página', 'Error de autenticación', 'API retornó error')
    # Detalle individual de Compra Ágil que falló: "[3/20] 1057532-12-COT26... ❌ Error"
    _RE_DETALLE_FALLIDO = re.compile(r'^\[\d+/\d+\].*❌ Error\s*$')
    UMBRAL_API_CAIDA = 6
    # Líneas que no aportan al log (cientos por día en Compra Ágil): se leen igual, no se escriben.
    _RE_RUIDO = re.compile(r'Obteniendo página|⊗ Código organismo|^[=─-]{5,}$|^\s*$')

    def __init__(self, registro, prefijo, umbral_caida=None):
        self._registro = registro
        self._prefijo = prefijo
        self._umbral_caida = umbral_caida or self.UMBRAL_API_CAIDA
        self._buf = ''
        self._lock = threading.Lock()  # los hilos de descarga también imprimen
        self._ultimo_latido = 0.0
        self.refresh_completo = False
        self.sin_novedades = False
        self.consultas_sin_respuesta = 0  # listado + detalle
        self.fallos_listado = 0           # el listado del día no se pudo leer completo
        self.detalles_fallidos = 0        # un detalle individual no se pudo bajar
        self.dias_ok = 0

    def write(self, texto):
        with self._lock:
            self._buf += texto
            while '\n' in self._buf:
                linea, self._buf = self._buf.split('\n', 1)
                self._linea(linea)
        return len(texto)

    def flush(self):
        pass

    def _linea(self, linea):
        # El avance in-place usa '\r': quedarse con el último tramo con contenido.
        tramos = [t for t in linea.split('\r') if t.strip()]
        linea = tramos[-1].strip() if tramos else ''
        if not linea:
            return
        if 'REFRESH COMPLETADO EXITOSAMENTE' in linea:
            self.refresh_completo = True
        elif 'No se encontraron nuevos datos' in linea:
            self.sin_novedades = True
        elif any(m in linea for m in self._ERRORES_API) or self._RE_DETALLE_FALLIDO.match(linea):
            self.consultas_sin_respuesta += 1
            # Un fallo de detalle llega pegado a su línea "[i/N] código..."; los de listado, no.
            if linea.startswith('['):
                self.detalles_fallidos += 1
            else:
                self.fallos_listado += 1
        elif 'Guardado en DIARIO' in linea or ('COMPLETADO EXITOSAMENTE' in linea and 'DÍA' in linea):
            self.dias_ok += 1
        if not self._RE_RUIDO.search(linea):
            self._registro.info(f'{self._prefijo} {linea}')

        ahora = time.monotonic()
        if ahora - self._ultimo_latido > 60:
            self._ultimo_latido = ahora
            base.renovar_candado()

        if self.consultas_sin_respuesta >= self._umbral_caida and self.dias_ok == 0:
            raise MercadoPublicoSinRespuesta(
                f'La API de Mercado Público no responde ({self.consultas_sin_respuesta} consultas '
                'fallidas y ningún día descargado); se corta sin esperar al resto del rango.')


# ─── Etapas ───────────────────────────────────────────────────────────────────

def _importar_etl(nombre):
    ruta = str(RUTA_API)
    if ruta not in sys.path:
        sys.path.insert(0, ruta)
    return importlib.import_module(nombre)


def _etapa_formularios(registro):
    rut = str(getattr(settings, 'PANEL_SSO_RUT', '') or '').strip()
    dv = str(getattr(settings, 'PANEL_SSO_DV', '') or '').strip()
    clave = str(getattr(settings, 'PANEL_SSO_PASSWORD', '') or '').strip()
    if not (rut and dv and clave):
        raise ConfiguracionIncompleta('Faltan PANEL_SSO_RUT / PANEL_SSO_DV / PANEL_SSO_CLAVE en backend/.env.')
    r = base._ejecutar_una_vez(rut, dv, clave, registro)
    return 'OK', (f"{r.get('nuevos', 0)} nuevos, {r.get('actualizados', 0)} actualizados, "
                  f"{r.get('eliminados', 0)} eliminados ({r.get('total', 0)} procesados)")


def _etapa_formularios_pac(registro):
    rut = str(getattr(settings, 'PANEL_SSO_RUT', '') or '').strip()
    dv = str(getattr(settings, 'PANEL_SSO_DV', '') or '').strip()
    clave = str(getattr(settings, 'PANEL_SSO_PASSWORD', '') or '').strip()
    if not (rut and dv and clave):
        raise ConfiguracionIncompleta('Faltan PANEL_SSO_RUT / PANEL_SSO_DV / PANEL_SSO_CLAVE en backend/.env.')
    r = base._ejecutar_pac_una_vez(rut, dv, clave, registro)
    return 'OK', (f"{r.get('nuevos', 0)} fichas nuevas, {r.get('actualizados', 0)} actualizadas, "
                  f"{r.get('eliminados', 0)} eliminadas; {r.get('lineas_carro', 0)} líneas de carro")


def _subir_maestros_atomico(modulo, cfg, registro):
    """Carga los maestros completos a la BD en UNA transacción (ver docstring del módulo)."""
    import numpy as np
    import pandas as pd
    from django.db import close_old_connections, transaction

    carpeta = Path(modulo.CARPETA_MAESTROS)
    rutas = [carpeta / cfg['resumen'], carpeta / cfg['detalle']]
    for ruta in rutas:
        if not ruta.exists():
            raise FileNotFoundError(f'No existe el maestro {ruta.name} en {carpeta}.')

    datos = [
        pd.read_csv(ruta, sep=';', encoding='utf-8-sig', dtype=str).replace({np.nan: None}).to_dict('records')
        for ruta in rutas
    ]
    registro.info(f"[{cfg['tag']}] Cargando {len(datos[0])} registros y {len(datos[1])} detalles "
                  "a la BD (transacción única)...")
    close_old_connections()
    with contextlib.redirect_stdout(_CapturaStdout(registro, f"[{cfg['tag']}]")):
        with transaction.atomic():
            return modulo.guardar_en_django(datos[0], datos[1])


def _enlazar_fsc_oc(registro):
    """Igual que el botón de OC: reengancha FSC↔OC con la nueva foto. Nunca tumba la etapa."""
    try:
        from django.db import close_old_connections
        from .services import recalcular_fsc_oc_matching

        close_old_connections()
        recalcular_fsc_oc_matching(
            _avisar=lambda **kw: kw.get('log') and registro.info(f"[enlace FSC-OC] {kw['log']}"))
        return ''
    except Exception as exc:
        registro.error(f'Enlace FSC-OC falló (la carga de OC sí quedó): {base._sin_secreto(exc)}')
        return ' — OJO: el enlace FSC-OC falló (ver log)'


def _crear_engine_bd():
    """Engine SQLAlchemy con el usuario de la APLICACIÓN (settings.DATABASES), no con el `root`
    escrito en `AG_SSO_SERVER.py`."""
    from sqlalchemy import create_engine, text

    db = settings.DATABASES['default']
    clave = db.get('PASSWORD') or ''
    auth = f"{db['USER']}:{urllib.parse.quote_plus(clave)}@" if clave else f"{db['USER']}@"
    ultimo = None
    for dialecto in ('mysql+mysqldb', 'mysql+pymysql'):
        try:
            engine = create_engine(
                f"{dialecto}://{auth}{db['HOST']}:{db['PORT']}/{db['NAME']}?charset=utf8mb4",
                pool_pre_ping=True)
            with engine.connect() as conn:
                conn.execute(text('SELECT 1'))
            return engine
        except Exception as exc:
            ultimo = exc
    texto = str(ultimo)
    raise RuntimeError(
        'No se pudo conectar a MariaDB con el usuario de la aplicación: '
        + (texto.replace(clave, '***') if clave else texto))


def _subir_compra_agil(modulo, registro, engine=None):
    """Carga los 5 maestros de Compra Ágil sin dejar nunca una tabla a medias.

    Cada tabla se escribe primero en `<tabla>__nuevo` con el mismo `to_sql` del ETL (mismo
    esquema); solo si las 5 salieron bien se intercambian con UN `RENAME TABLE` (atómico
    entre todas) y recién entonces se borran las viejas. Si algo falla antes del intercambio,
    las tablas vigentes ni se tocan. Devuelve {tabla: n_filas}."""
    import pandas as pd
    from sqlalchemy import text

    carpeta = Path(modulo.CARPETA_MAESTROS)
    propio = engine is None
    engine = engine or _crear_engine_bd()
    tablas = [t for _, t in _TABLAS_COMPRA_AGIL]
    cargadas = {}
    try:
        with engine.begin() as conn:  # restos de una corrida anterior caída
            for tabla in tablas:
                conn.execute(text(f'DROP TABLE IF EXISTS `{tabla}__nuevo`'))
                conn.execute(text(f'DROP TABLE IF EXISTS `{tabla}__viejo`'))

        for archivo, tabla in _TABLAS_COMPRA_AGIL:
            ruta = carpeta / archivo
            if not ruta.exists():
                registro.warning(f'[CA] {archivo} no existe; {tabla} se deja como está.')
                continue
            df = pd.read_csv(ruta, sep=';', encoding='utf-8-sig', dtype=str)
            if tabla == 'api_compraagil_resumen':
                for col in _COLS_FECHA_COMPRA_AGIL:
                    if col in df.columns:
                        df[col] = pd.to_datetime(df[col], format='%Y-%m-%d %H:%M', errors='coerce')
            df.to_sql(f'{tabla}__nuevo', con=engine, if_exists='fail', index=False, chunksize=500)
            cargadas[tabla] = len(df)
            registro.info(f'[CA] {tabla}: {len(df)} registros preparados')

        if not cargadas:
            raise FileNotFoundError(f'No hay maestros de Compra Ágil en {carpeta}.')

        with engine.begin() as conn:
            existentes = {r[0] for r in conn.execute(text(
                'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()'))}
            movimientos = []
            for tabla in cargadas:
                if tabla in existentes:
                    movimientos.append(f'`{tabla}` TO `{tabla}__viejo`')
                movimientos.append(f'`{tabla}__nuevo` TO `{tabla}`')
            conn.execute(text('RENAME TABLE ' + ', '.join(movimientos)))
        registro.info('[CA] Tablas intercambiadas en la BD (RENAME atómico).')

        try:
            with engine.begin() as conn:
                for tabla in cargadas:
                    conn.execute(text(f'DROP TABLE IF EXISTS `{tabla}__viejo`'))
        except Exception as exc:  # solo ocupa espacio; el próximo intento las limpia
            registro.warning(f'[CA] No se pudieron borrar las tablas __viejo: {base._sin_secreto(exc)}')
        return cargadas
    except Exception:
        with contextlib.suppress(Exception):
            with engine.begin() as conn:
                for tabla in tablas:
                    conn.execute(text(f'DROP TABLE IF EXISTS `{tabla}__nuevo`'))
        raise
    finally:
        if propio:
            engine.dispose()


def _decidir_tras_refresh(captura, desde, hasta):
    """None = el refresh integró datos (hay que cargarlos); ('SIN_NOVEDADES', texto) = la API
    respondió pero no había nada nuevo (la BD no se toca); lanza si la API no respondió."""
    if captura.refresh_completo:
        return None
    if captura.consultas_sin_respuesta:
        raise MercadoPublicoSinRespuesta(
            f'La API de Mercado Público no respondió ({captura.consultas_sin_respuesta} consulta(s) '
            f'fallidas) y no se integró nada del {desde:%d-%m-%Y} al {hasta:%d-%m-%Y}.')
    return 'SIN_NOVEDADES', f'Sin novedades del {desde:%d-%m-%Y} al {hasta:%d-%m-%Y}; la BD no se tocó.'


# Compra Ágil: la API tarda ~1 s por ítem listado y ~10 s por detalle (≈5 min por día en serie,
# medido 2026-10-14), así que NO se re-descarga todo el rango cada noche. Se lleva el registro de
# los días ya leídos completos y cada noche solo se hace (a) un repaso de los últimos días, que
# aún pueden cambiar, y (b) lo que falte del rango desde el piso fijo (histórico, o días que una
# caída dejó sin leer), lo más reciente primero. Los días de un bloque se bajan en paralelo (la
# API tolera 4-6 pedidos simultáneos sin degradarse, medido) y se integran con el ETL original.
# Ojo: unas pocas compras ágiles dan 504 SIEMPRE al pedir su detalle (el backend de la API no lo
# arma en <29 s, pasa también pedido solo): cada una cuesta ~3 min de reintentos y no se puede
# corregir desde acá; se informan como "sueltas sin bajar".
DIAS_REPASO_COMPRA_AGIL = 3        # incluye hoy: se repasan siempre (cambian de estado)
HILOS_COMPRA_AGIL = 6
PRESUPUESTO_COMPRA_AGIL_MIN = 360  # pasado esto no se empiezan bloques nuevos (01:00 → ~07:00)
DIAS_RECIENTES_COMPRA_AGIL = 30    # lo pendiente de este tramo va primero (más relevante)
SUBIR_CADA_MIN = 60                # una corrida larga publica su avance a la BD cada tanto


def _ca_numero(nombre, defecto):
    try:
        return int(getattr(settings, nombre, None) or defecto)
    except (TypeError, ValueError):
        return defecto


def _a_rangos(dias):
    """{fechas} → [[inicio, fin], ...] de tramos consecutivos, ordenados."""
    rangos = []
    for d in sorted(dias):
        if rangos and (d - rangos[-1][1]).days == 1:
            rangos[-1][1] = d
        else:
            rangos.append([d, d])
    return rangos


def _leer_cubiertos_ca(ruta):
    """Días ya leídos completos. Acepta el formato nuevo ({"cubiertos": [[ini, fin], ...]}) y el
    anterior ({"piso", "completo_hasta"}). Ilegible o inexistente: ninguno."""
    try:
        datos = json.loads(ruta.read_text(encoding='utf-8'))
        if 'cubiertos' in datos:
            tramos = [(date.fromisoformat(a), date.fromisoformat(b)) for a, b in datos['cubiertos']]
        else:
            tramos = [(date.fromisoformat(datos['piso']), date.fromisoformat(datos['completo_hasta']))]
    except (OSError, ValueError, KeyError, TypeError):
        return set()
    cubiertos = set()
    for ini, fin in tramos:
        for i in range((fin - ini).days + 1):
            cubiertos.add(ini + timedelta(days=i))
    return cubiertos


def _guardar_cubiertos_ca(ruta, cubiertos, registro):
    try:
        ruta.write_text(
            json.dumps({'cubiertos': [[a.isoformat(), b.isoformat()] for a, b in _a_rangos(cubiertos)]}),
            encoding='utf-8')
    except OSError as exc:
        registro.warning(f'[CA] No se pudo guardar el avance en {ruta.name}: {exc}')


def _planificar_bloques_ca(piso, hasta, cubiertos, repaso, tamano):
    """Bloques de días a procesar: los últimos `repaso` días (siempre) + los no cubiertos del
    rango [piso, hasta], en grupos de `tamano`. Orden: primero lo de los últimos
    `DIAS_RECIENTES_COMPRA_AGIL` días (de más nuevo a más viejo: recupera una caída reciente) y
    después el histórico, de más antiguo a más nuevo."""
    n = (hasta - piso).days + 1
    if n <= 0:
        return []
    ventana = {hasta - timedelta(days=i) for i in range(max(repaso, 1))}
    pendientes = [d for d in (piso + timedelta(days=i) for i in range(n)) if d not in cubiertos or d in ventana]
    corte = hasta - timedelta(days=DIAS_RECIENTES_COMPRA_AGIL)
    orden = (sorted((d for d in pendientes if d >= corte), reverse=True)
             + sorted(d for d in pendientes if d < corte))
    return [orden[i:i + tamano] for i in range(0, len(orden), tamano)]


class _EnrutadorStdout:
    """sys.stdout es global al proceso: con varios días bajando a la vez, cada hilo debe escribir
    en SU captura o las líneas (y los marcadores de error) se mezclan."""

    def __init__(self, defecto):
        self._defecto = defecto
        self._por_hilo = {}

    def asignar(self, captura):
        self._por_hilo[threading.get_ident()] = captura

    def liberar(self):
        self._por_hilo.pop(threading.get_ident(), None)

    def write(self, texto):
        return self._por_hilo.get(threading.get_ident(), self._defecto).write(texto)

    def flush(self):
        pass


def _bajar_bloque_ca(modulo, dias, hilos, registro):
    """Baja los `dias` en paralelo (un `procesar_dia` por hilo) y los integra al maestro con el
    `refresh_base_datos` original. Devuelve {limpios, con_datos, integrado, fallos_listado,
    detalles_fallidos, omitidos}. `limpios` = días cuyo listado se leyó completo."""
    router = _EnrutadorStdout(_CapturaStdout(registro, '[CA]', umbral_caida=10 ** 9))
    contadores = {'ok': 0, 'fallos': 0}
    cerrojo = threading.Lock()

    def _uno(dia):
        with cerrojo:
            if contadores['fallos'] >= 4 and contadores['ok'] == 0:
                return dia, None  # la API no responde: no seguir gastando minutos
        captura = _CapturaStdout(registro, f'[CA {dia:%d-%m}]', umbral_caida=10 ** 9)
        router.asignar(captura)
        try:
            hubo, error = bool(modulo.procesar_dia(dia, modo_actualizar=True)), None
        except Exception as exc:
            hubo, error = False, exc
        finally:
            router.liberar()
        with cerrojo:
            contadores['ok' if (hubo or (error is None and captura.fallos_listado == 0)) else 'fallos'] += 1
        return dia, {'hubo': hubo, 'captura': captura, 'error': error}

    resultados = {}
    with contextlib.redirect_stdout(router):
        with ThreadPoolExecutor(max_workers=max(1, min(hilos, len(dias)))) as ex:
            for dia, r in ex.map(_uno, dias):
                resultados[dia] = r

    con_datos = {d for d, r in resultados.items() if r and r['hubo']}
    integrado = False
    if con_datos:
        # El ETL original descarga y luego integra; acá la descarga ya se hizo en paralelo, así
        # que durante la integración `procesar_dia` solo confirma los días que bajaron datos.
        original = modulo.procesar_dia
        modulo.procesar_dia = lambda fecha, *a, **k: fecha in con_datos
        captura = _CapturaStdout(registro, '[CA]', umbral_caida=10 ** 9)
        try:
            with contextlib.redirect_stdout(captura):
                modulo.refresh_base_datos(min(dias), max(dias))
        finally:
            modulo.procesar_dia = original
        integrado = captura.refresh_completo
        if not integrado:
            raise RuntimeError('El ETL de Compra Ágil no pudo integrar los días descargados al maestro '
                               f"({min(dias):%d-%m-%Y} al {max(dias):%d-%m-%Y}); ver el log.")

    listos = [r for r in resultados.values() if r]
    return {
        'limpios': {d for d, r in resultados.items()
                    if r and r['error'] is None and r['captura'].fallos_listado == 0},
        'con_datos': con_datos,
        'integrado': integrado,
        'fallos_listado': sum(r['captura'].fallos_listado for r in listos) + sum(1 for r in listos if r['error']),
        'detalles_fallidos': sum(r['captura'].detalles_fallidos for r in listos),
        'omitidos': [d for d, r in resultados.items() if r is None],
    }


def _etapa_compra_agil(piso, hasta, registro, forzar_rango=False, presupuesto_min=None, hilos=None,
                       repaso=None, hoy=None):
    """Actualiza Compra Ágil dentro de [piso, hasta] (piso fijo; ver comentario del módulo).

    Normal: procesa los días no leídos del rango + el repaso (`api/CA_DSSO/estado_actualizacion.json`
    lleva los días ya leídos completos). forzar_rango=True (--ca-desde/--ca-hasta): procesa TODOS
    los días del rango aunque figuren leídos; igual registra los que salgan completos."""
    presupuesto_min = presupuesto_min or _ca_numero('SYNC_COMPRA_AGIL_PRESUPUESTO_MIN', PRESUPUESTO_COMPRA_AGIL_MIN)
    hilos = hilos or _ca_numero('SYNC_COMPRA_AGIL_HILOS', HILOS_COMPRA_AGIL)
    repaso = repaso or _ca_numero('SYNC_COMPRA_AGIL_DIAS_REPASO', DIAS_REPASO_COMPRA_AGIL)

    hoy_local = hoy or timezone.localdate()
    modulo = _importar_etl('AG_SSO_SERVER')
    ruta_estado = Path(modulo.CARPETA_BASE) / 'estado_actualizacion.json'
    cubiertos = _leer_cubiertos_ca(ruta_estado)
    bloques = _planificar_bloques_ca(piso, hasta, set() if forzar_rango else cubiertos,
                                     1 if forzar_rango else repaso, hilos * 2)
    total_dias = sum(len(b) for b in bloques)
    registro.info(f'[CA] {total_dias} día(s) por procesar entre {piso:%d-%m-%Y} y {hasta:%d-%m-%Y} '
                  f'en {len(bloques)} bloque(s), {hilos} en paralelo, tope {presupuesto_min} min.')

    t0 = time.monotonic()
    ultima_subida = t0
    sin_subir = 0
    integrados = 0
    procesados = 0
    detalles_fallidos = 0
    parcial = None
    error_api = None
    cargadas = None
    for n, dias in enumerate(bloques):
        if n and time.monotonic() - t0 > presupuesto_min * 60:
            parcial = (f'se agotó el tiempo ({presupuesto_min} min); quedan {total_dias - procesados} '
                       'día(s) por leer, sigue la próxima noche')
            break
        try:
            r = _bajar_bloque_ca(modulo, dias, hilos, registro)
        except MercadoPublicoSinRespuesta as exc:
            error_api, parcial = exc, 'la API dejó de responder'
            break
        procesados += len(dias)
        detalles_fallidos += r['detalles_fallidos']
        if r['integrado']:
            integrados += 1
            sin_subir += 1
        nuevos = {d for d in r['limpios'] if d < hoy_local}  # hoy aún puede cambiar
        if nuevos - cubiertos:
            cubiertos |= nuevos
            _guardar_cubiertos_ca(ruta_estado, cubiertos, registro)
        base.renovar_candado()
        registro.info(f"[CA] Bloque {n + 1}/{len(bloques)} ({min(dias):%d-%m} al {max(dias):%d-%m}): "
                      f"{len(r['con_datos'])} día(s) con datos, {len(r['limpios'])} leídos completos, "
                      f"{r['fallos_listado']} fallo(s) de listado.")
        if not r['limpios'] and not r['integrado']:  # ningún día salió: la API no está respondiendo
            error_api = MercadoPublicoSinRespuesta(
                f"La API de Mercado Público no respondió en el bloque {min(dias):%d-%m-%Y} al "
                f"{max(dias):%d-%m-%Y} ({r['fallos_listado']} fallo(s) de listado).")
            parcial = f'la API no respondió en el bloque {min(dias):%d-%m-%Y} al {max(dias):%d-%m-%Y}'
            break
        if sin_subir and time.monotonic() - ultima_subida >= SUBIR_CADA_MIN * 60:
            cargadas = _subir_compra_agil(modulo, registro)  # publica el avance de una corrida larga
            ultima_subida, sin_subir = time.monotonic(), 0

    if not integrados:
        if error_api:
            raise error_api
        return 'SIN_NOVEDADES', (f'Sin novedades del {piso:%d-%m-%Y} al {hasta:%d-%m-%Y}; '
                                 'la BD no se tocó.')

    if sin_subir or cargadas is None:
        base.renovar_candado()
        cargadas = _subir_compra_agil(modulo, registro)
    otras = ', '.join(f"{t.replace('api_compraagil_', '')}: {n}" for t, n in cargadas.items()
                      if t != 'api_compraagil_resumen')
    detalle = (f"{cargadas.get('api_compraagil_resumen', 0)} compras ágiles en la BD "
               f"({procesados} día(s) procesados; {otras})")
    pendientes = [d for d in (piso + timedelta(days=i) for i in range((hasta - piso).days + 1))
                  if d not in cubiertos and d < hoy_local]
    if pendientes:
        detalle += f'; faltan {len(pendientes)} día(s) por leer del rango desde {piso:%d-%m-%Y}'
    else:
        detalle += f'; rango {piso:%d-%m-%Y} al {hasta:%d-%m-%Y} completo'
    if detalles_fallidos:
        detalle += f'; {detalles_fallidos} detalle(s) sueltos sin bajar'
    if parcial:
        detalle += f' — PARCIAL: {parcial}'
    return 'OK', detalle


def _etapa_mercado_publico(etapa, desde, hasta, registro):
    cfg = _MERCADO_PUBLICO[etapa]
    modulo = _importar_etl(cfg['modulo'])
    captura = _CapturaStdout(registro, f"[{cfg['tag']}]")

    with contextlib.redirect_stdout(captura):
        modulo.refresh_base_datos(desde, hasta)

    sin_cambios = _decidir_tras_refresh(captura, desde, hasta)
    if sin_cambios:
        return sin_cambios

    base.renovar_candado()
    n_principal, n_detalle = _subir_maestros_atomico(modulo, cfg, registro)
    detalle = f'{n_principal} registros y {n_detalle} detalles en la BD'
    if captura.consultas_sin_respuesta:
        detalle += f' ({captura.consultas_sin_respuesta} consulta(s) sin respuesta; la ventana las reintenta mañana)'
    if etapa == 'ordenes_compra':
        detalle += _enlazar_fsc_oc(registro)
    return 'OK', detalle


# ─── Orquestación ─────────────────────────────────────────────────────────────

def _con_reintentos(etiqueta, fn, reintentos, espera_min, registro):
    ultimo = None
    for intento in range(1, reintentos + 1):
        try:
            return fn()
        except (ConfiguracionIncompleta, ImportError):
            raise  # reintentar no lo arregla
        except Exception as exc:
            ultimo = exc
            registro.error(f'{etiqueta}: intento {intento}/{reintentos} falló: {base._sin_secreto(exc)}')
            if intento < reintentos:
                registro.info(f'{etiqueta}: reintentando en {espera_min} min...')
                time.sleep(espera_min * 60)
                base.renovar_candado()
    raise ultimo


def _correr_etapa(etapa, desde, hasta, reintentos, espera_min, registro, forzar_ca=False,
                  opciones_ca=None):
    etiqueta = ETIQUETAS[etapa]
    registro.info(f'[ETAPA] {etiqueta}')
    inicio = time.monotonic()

    def _una_vez():
        if etapa == 'formularios':
            return _etapa_formularios(registro)
        if etapa == 'formularios_pac':
            return _etapa_formularios_pac(registro)
        if etapa == 'compra_agil':
            return _etapa_compra_agil(desde, hasta, registro, forzar_rango=forzar_ca,
                                      **(opciones_ca or {}))
        return _etapa_mercado_publico(etapa, desde, hasta, registro)

    try:
        estado, detalle = _con_reintentos(etiqueta, _una_vez, reintentos, espera_min, registro)
    except Exception as exc:
        estado, detalle = 'ERROR', base._sin_secreto(exc) or exc.__class__.__name__
    resultado = ResultadoEtapa(etapa, estado, detalle, time.monotonic() - inicio)
    registro_nivel = registro.error if estado == 'ERROR' else registro.info
    registro_nivel(f'[{estado}] {etiqueta}: {detalle} ({resultado.segundos:.0f} s)')
    return resultado


def _tomar_candado(registro, esperar_min):
    """Obtiene el candado; si hay otra actualización en curso espera hasta `esperar_min`."""
    limite = time.monotonic() + max(esperar_min, 0) * 60
    avisado = False
    while True:
        if base.adquirir_candado('automatico'):
            return True
        if time.monotonic() >= limite:
            return False
        if not avisado:
            registro.info(f'Hay otra actualización en curso ({base.describir_candado()}); '
                          f'espero hasta {esperar_min} min a que termine...')
            avisado = True
        time.sleep(30)


def _avisar_fallos(resultados, rango, registro):
    destinos = base._destinatarios_aviso()
    if not destinos:
        registro.warning('No hay destinatarios configurados para avisar el fallo (SYNC_FSC_AVISO_A).')
        return
    malas = [ETIQUETAS[r.etapa] for r in resultados if r.estado == 'ERROR']
    lineas = [f'- {ETIQUETAS[r.etapa]}: {r.estado} — {r.detalle}' for r in resultados]
    cuerpo = (
        'La actualización automática de BD_SISTEMA terminó con errores.\n\n'
        f'Fecha: {timezone.localtime():%d-%m-%Y %H:%M}\n'
        f'Rango: {rango}\n\n'
        'Resultado por etapa:\n' + '\n'.join(lineas) + '\n\n'
        'Las etapas con error NO modificaron sus datos (la carga a la BD es transaccional); '
        'las demás sí se aplicaron. Detalle completo en backend/logs/actualizacion_diaria.log.\n\n'
        'Qué revisar: internet y XAMPP/MariaDB encendidos en el PC servidor; vigencia de la '
        'clave del Panel (PANEL_SSO_CLAVE en backend/.env). Mientras tanto se puede actualizar '
        'a mano con los botones de cada módulo.'
    )
    try:
        send_mail(f"[BD_SISTEMA] Actualización diaria con errores: {', '.join(malas)}",
                  cuerpo, None, destinos, fail_silently=False)
        registro.info(f"Aviso de fallo enviado a: {', '.join(destinos)}")
    except Exception as exc:  # el aviso nunca debe ocultar el error original
        registro.error(f'No se pudo enviar el aviso por correo: {base._sin_secreto(exc)}')


def compra_agil_desde_configurado():
    """Inicio del rango de Compra Ágil: `SYNC_COMPRA_AGIL_DESDE` (.env, YYYY-MM-DD) o 2026-09-01."""
    texto = str(getattr(settings, 'SYNC_COMPRA_AGIL_DESDE', '') or '').strip()
    try:
        return date.fromisoformat(texto) if texto else COMPRA_AGIL_DESDE_DEFECTO
    except ValueError:
        return COMPRA_AGIL_DESDE_DEFECTO


def ejecutar_actualizacion_completa(dias=10, reintentos=3, espera_min=5, etapas=ETAPAS_DIARIAS,
                                    avisar_por_correo=True, salida=None, esperar_candado_min=20,
                                    hoy=None, ca_desde=None, ca_hasta=None, ca_hilos=None,
                                    ca_presupuesto_min=None):
    """Corre las etapas en orden. Devuelve la lista de `ResultadoEtapa`, o `None` si se omitió
    porque otra actualización siguió en curso tras la espera. Lanza `ActualizacionFallida`
    (con los resultados) si alguna etapa quedó con error — después de correr TODAS.

    `dias`: ventana móvil de OC y Licitaciones. Compra Ágil: rango [piso fijo, hoy] y solo se
    procesa lo que falte + el repaso. `ca_desde`/`ca_hasta` (rango puntual, a mano) fuerzan
    procesar TODOS los días de ese rango (hasta = hoy si no se indica)."""
    registro = base._Registro(salida, NOMBRE_LOG)
    hasta = hoy or timezone.localdate()
    desde = hasta - timedelta(days=max(dias, 1) - 1)
    ca_forzado = ca_desde is not None or ca_hasta is not None  # rango pedido a mano
    ca_desde = ca_desde or compra_agil_desde_configurado()
    ca_hasta = ca_hasta or hasta

    if not _tomar_candado(registro, esperar_candado_min):
        registro.warning(f'Omitida: sigue habiendo una actualización en curso ({base.describir_candado()}).')
        return None

    try:
        rangos = []
        if any(e in etapas for e in ('ordenes_compra', 'licitaciones')):
            rangos.append(f'OC/Licitaciones {desde:%d-%m-%Y} al {hasta:%d-%m-%Y} ({dias} días)')
        if 'compra_agil' in etapas:
            rangos.append(f'Compra Ágil {ca_desde:%d-%m-%Y} al {ca_hasta:%d-%m-%Y}')
        registro.info(
            f"[INICIO] Actualización ({', '.join(etapas)}). Rango: {'; '.join(rangos) or '-'}. "
            f'Hasta {reintentos} intento(s) por etapa.')
        resultados = []
        for etapa in etapas:
            es_ca = etapa == 'compra_agil'
            resultados.append(_correr_etapa(etapa, ca_desde if es_ca else desde, ca_hasta if es_ca else hasta,
                                            reintentos, espera_min, registro, forzar_ca=ca_forzado,
                                            opciones_ca={'hilos': ca_hilos, 'hoy': hasta,
                                                         'presupuesto_min': ca_presupuesto_min}))
            base.renovar_candado()

        fallidas = [r for r in resultados if r.estado == 'ERROR']
        total_s = sum(r.segundos for r in resultados)
        registro.info(f"[FIN] {len(resultados) - len(fallidas)}/{len(resultados)} etapas sin error en {total_s:.0f} s.")
        if fallidas:
            if avisar_por_correo:
                _avisar_fallos(resultados, '; '.join(rangos) or '-', registro)
            raise ActualizacionFallida(
                'Etapas con error: ' + '; '.join(f'{ETIQUETAS[r.etapa]} ({r.detalle})' for r in fallidas),
                resultados)
        return resultados
    finally:
        base.liberar_candado()
