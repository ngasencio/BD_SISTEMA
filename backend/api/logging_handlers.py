"""Puente entre el `logging` de Python y el registro de logs del sistema.

Cada `logger.error(...)` / `logger.exception(...)` que ya existe en `api.*` (ETL, estadísticas,
envíos de correo…) queda también como evento SYSTEM_ERROR visible en Administración › Logs,
sin tocar esos puntos de llamada. Se declara en `LOGGING` (settings.py).

Este módulo NO importa modelos ni servicios al cargarse: `LOGGING` se configura antes de que
Django cargue las apps."""
import logging
import os

# Los registros del propio sistema de logs y del respaldo jamás se reenvían (evita bucles).
_IGNORAR = ('bd_sistema.logs',)


class RegistroLogsHandler(logging.Handler):
    """Reenvía registros ERROR/CRITICAL a `services_logs.logs` (cola asíncrona, nunca lanza)."""

    def emit(self, record):
        try:
            if record.name.startswith(_IGNORAR):
                return
            from .services_logs import CRITICAL, ERROR, logs

            exc = record.exc_info[1] if record.exc_info and record.exc_info[1] else None
            nivel = CRITICAL if record.levelno >= logging.CRITICAL else ERROR
            texto = record.getMessage()
            # Convención del proyecto: «Error actualizando <módulo>» = falló una carga de datos (ETL).
            es_etl = texto.lower().startswith('error actualizando')
            logs.error(
                'ETL_FAILED' if es_etl else 'APP_ERROR',
                f'Falló una actualización de datos: {texto}.' if es_etl
                else f'Error registrado por el sistema en «{record.name}»: {texto}',
                nivel=nivel,
                exc=exc,
                metadata={
                    'logger': record.name, 'funcion': record.funcName,
                    'archivo': f'{os.path.basename(record.pathname)}:{record.lineno}',
                },
            )
        except Exception:
            # Un fallo al registrar nunca debe propagarse a quien estaba registrando.
            pass
