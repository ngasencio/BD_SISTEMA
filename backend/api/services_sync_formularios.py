"""Sincronización de los Formularios FSC desde el Panel SS Osorno SIN pasar por el botón.

Es lo mismo que hace «Actualizar desde el Panel» (descarga Selenium + upsert), pensado
para correr desatendido desde una tarea programada de Windows
(`python manage.py sincronizar_formularios_fsc`). Agrega lo que un clic humano no necesita:

- **Candado en archivo** compartido con el botón: la guarda "ya hay una actualización en
  curso" del botón vive en la memoria del servidor y no ve a este proceso aparte; sin
  candado, un clic a las 08:00 podría correr dos sincronizaciones a la vez (el upsert no
  tiene clave única en BD y duplicaría filas).
- **Reintentos**: el PC puede arrancar antes que MariaDB/red; reintenta antes de rendirse.
- **Log** rotativo en `backend/logs/sincronizacion_fsc.log` (nadie mira la consola).
- **Correo de aviso** si falla tras los reintentos (el SMTP ya está configurado).

Credenciales: `settings.PANEL_SSO_RUT/DV/PASSWORD` (vienen del `.env`).
"""
import logging
import os
import sys
import time
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path

from django.conf import settings
from django.core.mail import send_mail

DIR_BACKEND = Path(__file__).resolve().parents[1]
RUTA_DATA_PANEL = DIR_BACKEND.parent / 'api' / 'data' / 'data_panel'
RUTA_DATA_FORMULARIOS_PAC = DIR_BACKEND.parent / 'api' / 'data' / 'data_formularios_pac'
DIR_LOGS = DIR_BACKEND / 'logs'

# Una sincronización normal toma minutos; pasado este tiempo el candado se considera
# huérfano (proceso muerto / reinicio del servidor) y se puede retomar.
CANDADO_VENCE_MIN = 90


class SincronizacionFallida(Exception):
    """No se pudo sincronizar (el mensaje ya viene sin la contraseña)."""


# ─── Candado ──────────────────────────────────────────────────────────────────

def _ruta_candado():
    return DIR_LOGS / 'sincronizacion_fsc.lock'


def _candado_vencido(ruta):
    try:
        return (time.time() - ruta.stat().st_mtime) > CANDADO_VENCE_MIN * 60
    except FileNotFoundError:
        return True


def adquirir_candado(origen):
    """Toma el candado de forma atómica. True si lo obtuvo, False si otra sincronización
    lo tiene. `origen`: 'automatico' | 'boton' (solo informativo)."""
    DIR_LOGS.mkdir(parents=True, exist_ok=True)
    ruta = _ruta_candado()
    for _ in range(2):
        try:
            fd = os.open(str(ruta), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            if not _candado_vencido(ruta):
                return False
            try:
                ruta.unlink()
            except FileNotFoundError:
                pass
            except OSError:
                return False
            continue
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(f"{os.getpid()}\n{origen}\n{datetime.now().isoformat(timespec='seconds')}\n")
        return True
    return False


def liberar_candado():
    """Suelta el candado solo si lo tomó este proceso (no pisa el de otro)."""
    ruta = _ruta_candado()
    try:
        pid = ruta.read_text(encoding='utf-8').splitlines()[0].strip()
        if pid == str(os.getpid()):
            ruta.unlink()
    except (OSError, IndexError):
        pass


def renovar_candado():
    """Latido: actualiza la fecha del candado propio para que una actualización larga
    (varias etapas) no sea tomada por huérfana al pasar CANDADO_VENCE_MIN."""
    ruta = _ruta_candado()
    try:
        if ruta.read_text(encoding='utf-8').splitlines()[0].strip() == str(os.getpid()):
            os.utime(ruta, None)
    except (OSError, IndexError):
        pass


def describir_candado():
    """Texto corto de quién tiene el candado, para mostrar en el 409 del botón."""
    try:
        _, origen, desde = _ruta_candado().read_text(encoding='utf-8').splitlines()[:3]
        quien = 'la sincronización automática' if origen == 'automatico' else 'otro usuario'
        return f"{quien}, iniciada {desde.replace('T', ' ')}"
    except (OSError, ValueError):
        return 'sin detalle'


# ─── Log ──────────────────────────────────────────────────────────────────────

def _logger_archivo(nombre='sincronizacion_fsc'):
    logger = logging.getLogger(f'sync_{nombre}')
    if not logger.handlers:
        DIR_LOGS.mkdir(parents=True, exist_ok=True)
        h = RotatingFileHandler(
            DIR_LOGS / f'{nombre}.log', maxBytes=1_000_000, backupCount=5, encoding='utf-8')
        h.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
        logger.addHandler(h)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return logger


class _Registro:
    """Escribe al archivo de log y, si se entregó `salida`, también a la consola."""

    def __init__(self, salida=None, nombre='sincronizacion_fsc'):
        self._log = _logger_archivo(nombre)
        self._salida = salida

    def _emitir(self, nivel, msg):
        getattr(self._log, nivel)(msg)
        if self._salida:
            try:
                self._salida(msg)
            except Exception:  # la consola nunca debe tumbar la sincronización
                pass

    def info(self, msg):
        self._emitir('info', msg)

    def warning(self, msg):
        self._emitir('warning', msg)

    def error(self, msg):
        self._emitir('error', msg)


def apto_consola(texto):
    """Los emojis del ETL rompen la consola cp1252 de Windows: se reemplazan, no se lanzan."""
    codificacion = getattr(sys.stdout, 'encoding', None) or 'utf-8'
    return str(texto).encode(codificacion, 'replace').decode(codificacion)


# ─── Ejecución ────────────────────────────────────────────────────────────────

def _sin_secreto(texto):
    clave = getattr(settings, 'PANEL_SSO_PASSWORD', '')
    texto = str(texto)
    return texto.replace(clave, '***') if clave else texto


def _ejecutar_una_vez(rut, dv, clave, registro):
    """Un intento: verifica la BD, descarga los 3 reportes y los carga."""
    from django.db import close_old_connections, connection

    close_old_connections()
    connection.ensure_connection()  # MariaDB (XAMPP) caído → OperationalError → reintento

    ruta = str(RUTA_DATA_PANEL)
    if ruta not in sys.path:
        sys.path.insert(0, ruta)
    import page_data_panel

    def _cb(paso=None, paso_desc=None, progreso_pct=None, log=None):
        mensaje = log or paso_desc
        if mensaje:
            registro.info(mensaje)

    return page_data_panel.ejecutar_proceso_completo(rut, dv, clave, progress_callback=_cb)


def _ejecutar_pac_una_vez(rut, dv, clave, registro):
    """Un intento de la sincronización de Formularios PAC (mismo Panel, otros 2 reportes)."""
    from django.db import close_old_connections, connection

    close_old_connections()
    connection.ensure_connection()

    ruta = str(RUTA_DATA_FORMULARIOS_PAC)
    if ruta not in sys.path:
        sys.path.insert(0, ruta)
    import page_data_panel_pac

    def _cb(paso=None, paso_desc=None, progreso_pct=None, log=None):
        mensaje = log or paso_desc
        if mensaje:
            registro.info(mensaje)

    return page_data_panel_pac.ejecutar_proceso_completo(rut, dv, clave, progress_callback=_cb)


def _destinatarios_aviso():
    return list(getattr(settings, 'SYNC_FSC_AVISO_A', None) or getattr(settings, 'NOTIF_PLAN_USUARIOS', []))


def _avisar_fallo(motivo, intentos, registro):
    destinos = _destinatarios_aviso()
    if not destinos:
        registro.warning('No hay destinatarios configurados para avisar el fallo (SYNC_FSC_AVISO_A).')
        return
    cuerpo = (
        "La sincronización automática de Formularios FSC desde el Panel SS Osorno NO se completó.\n\n"
        f"Fecha: {datetime.now():%d-%m-%Y %H:%M}\n"
        f"Intentos: {intentos}\n"
        f"Motivo: {motivo}\n\n"
        "Qué revisar: que el PC servidor tenga internet y XAMPP/MariaDB encendido; que la "
        "clave del Panel (PANEL_SSO_CLAVE en backend/.env) siga vigente; y las capturas en "
        "api/data/data_panel/debug/. Detalle completo en backend/logs/sincronizacion_fsc.log.\n\n"
        "Mientras tanto se puede sincronizar a mano con el botón «Actualizar desde el Panel»."
    )
    try:
        send_mail(
            '[BD_SISTEMA] Falló la sincronización automática de Formularios FSC',
            cuerpo, None, destinos, fail_silently=False,
        )
        registro.info(f"Aviso de fallo enviado a: {', '.join(destinos)}")
    except Exception as exc:  # el aviso nunca debe ocultar el error original
        registro.error(f"No se pudo enviar el aviso por correo: {_sin_secreto(exc)}")


def ejecutar_sincronizacion(reintentos=3, espera_min=10, avisar_por_correo=True, salida=None):
    """Sincroniza FSC con reintentos. Devuelve el resumen del ETL, o `None` si se omitió
    porque ya hay otra sincronización en curso. Lanza `SincronizacionFallida` si no pudo."""
    registro = _Registro(salida)
    rut = str(getattr(settings, 'PANEL_SSO_RUT', '') or '').strip()
    dv = str(getattr(settings, 'PANEL_SSO_DV', '') or '').strip()
    clave = str(getattr(settings, 'PANEL_SSO_PASSWORD', '') or '').strip()

    if not (rut and dv and clave):
        motivo = 'Faltan PANEL_SSO_RUT / PANEL_SSO_DV / PANEL_SSO_CLAVE en backend/.env.'
        registro.error(motivo)
        if avisar_por_correo:
            _avisar_fallo(motivo, 0, registro)
        raise SincronizacionFallida(motivo)

    if not adquirir_candado('automatico'):
        registro.warning(f"Omitida: ya hay una sincronización en curso ({describir_candado()}).")
        return None

    try:
        registro.info(f"[INICIO] Sincronización automática de Formularios FSC (hasta {reintentos} intento(s)).")
        ultimo = None
        for intento in range(1, reintentos + 1):
            try:
                resumen = _ejecutar_una_vez(rut, dv, clave, registro)
            except ImportError as exc:  # entorno roto: reintentar no lo arregla
                ultimo = exc
                registro.error(f"Intento {intento}/{reintentos}: {_sin_secreto(exc)}")
                break
            except Exception as exc:
                ultimo = exc
                registro.error(f"Intento {intento}/{reintentos} falló: {_sin_secreto(exc)}")
                if intento < reintentos:
                    registro.info(f"Reintentando en {espera_min} min...")
                    time.sleep(espera_min * 60)
                continue
            registro.info(
                f"[OK] Sincronización completa: {resumen.get('nuevos', 0)} nuevos, "
                f"{resumen.get('actualizados', 0)} actualizados, "
                f"{resumen.get('eliminados', 0)} eliminados ({resumen.get('total', 0)} procesados).")
            return resumen

        motivo = _sin_secreto(ultimo)
        registro.error(f"[ERROR] Sincronización fallida: {motivo}")
        if avisar_por_correo:
            _avisar_fallo(motivo, reintentos, registro)
        raise SincronizacionFallida(motivo)
    finally:
        liberar_candado()
