"""Revisión de salud del servidor (base de datos, disco, cola de logs) para una tarea programada.

    python manage.py chequear_salud

Lo anómalo queda registrado como RESOURCE_ALERT en Administración › Logs (una alerta por recurso
cada 30 minutos como máximo). Termina con código 1 si hay algo CRÍTICO, útil para el programador
de tareas de Windows."""
from django.core.management.base import BaseCommand

from api.services_logs import calcular_salud, vaciar_cola

_ICONO = {'ok': 'OK      ', 'atencion': 'ATENCION', 'critico': 'CRITICO '}


class Command(BaseCommand):
    help = 'Revisa base de datos, disco y registro de logs; deja constancia de lo anómalo.'

    def handle(self, *args, **opts):
        salud = calcular_salud(registrar_alertas=True)
        for r in salud['revisiones']:
            self.stdout.write(f'[{_ICONO.get(r["estado"], r["estado"])}] {r["titulo"]}: {r["detalle"]}')
        vaciar_cola(5)   # el proceso termina: que las alertas alcancen a escribirse
        if salud['estado'] == 'critico':
            raise SystemExit(1)
