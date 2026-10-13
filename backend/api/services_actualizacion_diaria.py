"""Actualización diaria COMPLETA, sin botones: Formularios FSC + Órdenes de Compra + Licitaciones.

Es lo que hacen, uno tras otro, «Actualizar desde el Panel» (Formularios), «Actualizar API»
(Órdenes de Compra) y «Actualizar API» (Licitaciones), pensado para correr desatendido desde
una tarea programada de Windows (`python manage.py actualizacion_completa`).

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
- **Sin novedades ≠ fallo**: si la API de Mercado Público responde pero no hay datos en el
  rango, se deja todo como está. Solo es fallo si la API no respondió.
- **Candado compartido** con los botones y con `sincronizar_formularios_fsc`, con latido
  (una actualización larga no se da por huérfana) y espera acotada si ya hay otra en curso.
"""
import contextlib
import importlib
import sys
import threading
import time
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from . import services_sync_formularios as base

NOMBRE_LOG = 'actualizacion_diaria'
RUTA_API = base.DIR_BACKEND.parent / 'api'

ETAPAS = ('formularios', 'ordenes_compra', 'licitaciones')
ETIQUETAS = {
    'formularios': 'Formularios FSC (Panel SSO)',
    'ordenes_compra': 'Órdenes de Compra (Mercado Público)',
    'licitaciones': 'Licitaciones (Mercado Público)',
}

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
    respuesta de la API (los textos están en `OC_SSO_SERVER.py` / `LI_SSO_SERVER.py`)."""

    def __init__(self, registro, prefijo):
        self._registro = registro
        self._prefijo = prefijo
        self._buf = ''
        self._lock = threading.Lock()  # los hilos de descarga también imprimen
        self.refresh_completo = False
        self.sin_novedades = False
        self.consultas_sin_respuesta = 0

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
        elif 'API sin respuesta' in linea:
            self.consultas_sin_respuesta += 1
        self._registro.info(f'{self._prefijo} {linea}')


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


def _etapa_mercado_publico(etapa, desde, hasta, registro):
    cfg = _MERCADO_PUBLICO[etapa]
    modulo = _importar_etl(cfg['modulo'])
    captura = _CapturaStdout(registro, f"[{cfg['tag']}]")
    ultimo_latido = [0.0]

    def _on_progress(fecha, codigo, done, total):
        ahora = time.monotonic()
        if ahora - ultimo_latido[0] > 60:
            ultimo_latido[0] = ahora
            base.renovar_candado()

    with contextlib.redirect_stdout(captura):
        modulo.refresh_base_datos(desde, hasta, progress_callback=_on_progress)

    if not captura.refresh_completo:
        if captura.consultas_sin_respuesta:
            raise MercadoPublicoSinRespuesta(
                f'La API de Mercado Público no respondió ({captura.consultas_sin_respuesta} consulta(s) '
                f'agotaron sus reintentos) y no se integró nada del {desde:%d-%m-%Y} al {hasta:%d-%m-%Y}.')
        return 'SIN_NOVEDADES', f'Sin novedades del {desde:%d-%m-%Y} al {hasta:%d-%m-%Y}; la BD no se tocó.'

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


def _correr_etapa(etapa, desde, hasta, reintentos, espera_min, registro):
    etiqueta = ETIQUETAS[etapa]
    registro.info(f'[ETAPA] {etiqueta}')
    inicio = time.monotonic()

    def _una_vez():
        if etapa == 'formularios':
            return _etapa_formularios(registro)
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


def _avisar_fallos(resultados, desde, hasta, registro):
    destinos = base._destinatarios_aviso()
    if not destinos:
        registro.warning('No hay destinatarios configurados para avisar el fallo (SYNC_FSC_AVISO_A).')
        return
    malas = [ETIQUETAS[r.etapa] for r in resultados if r.estado == 'ERROR']
    lineas = [f'- {ETIQUETAS[r.etapa]}: {r.estado} — {r.detalle}' for r in resultados]
    cuerpo = (
        'La actualización automática diaria de BD_SISTEMA terminó con errores.\n\n'
        f'Fecha: {timezone.localtime():%d-%m-%Y %H:%M}\n'
        f'Ventana de Órdenes de Compra y Licitaciones: {desde:%d-%m-%Y} al {hasta:%d-%m-%Y}\n\n'
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


def ejecutar_actualizacion_completa(dias=10, reintentos=3, espera_min=5, etapas=ETAPAS,
                                    avisar_por_correo=True, salida=None, esperar_candado_min=20,
                                    hoy=None):
    """Corre las etapas en orden. Devuelve la lista de `ResultadoEtapa`, o `None` si se omitió
    porque otra actualización siguió en curso tras la espera. Lanza `ActualizacionFallida`
    (con los resultados) si alguna etapa quedó con error — después de correr TODAS."""
    registro = base._Registro(salida, NOMBRE_LOG)
    hasta = hoy or timezone.localdate()
    desde = hasta - timedelta(days=max(dias, 1) - 1)

    if not _tomar_candado(registro, esperar_candado_min):
        registro.warning(f'Omitida: sigue habiendo una actualización en curso ({base.describir_candado()}).')
        return None

    try:
        registro.info(
            f"[INICIO] Actualización completa ({', '.join(etapas)}). Ventana OC/Licitaciones: "
            f'{desde:%d-%m-%Y} al {hasta:%d-%m-%Y} ({dias} días). Hasta {reintentos} intento(s) por etapa.')
        resultados = []
        for etapa in etapas:
            resultados.append(_correr_etapa(etapa, desde, hasta, reintentos, espera_min, registro))
            base.renovar_candado()

        fallidas = [r for r in resultados if r.estado == 'ERROR']
        total_s = sum(r.segundos for r in resultados)
        registro.info(f"[FIN] {len(resultados) - len(fallidas)}/{len(resultados)} etapas sin error en {total_s:.0f} s.")
        if fallidas:
            if avisar_por_correo:
                _avisar_fallos(resultados, desde, hasta, registro)
            raise ActualizacionFallida(
                'Etapas con error: ' + '; '.join(f'{ETIQUETAS[r.etapa]} ({r.detalle})' for r in fallidas),
                resultados)
        return resultados
    finally:
        base.liberar_candado()
