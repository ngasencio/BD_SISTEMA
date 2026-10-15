"""Retención del registro de logs (Administración › Logs).

    python manage.py limpiar_logs              # borra lo anterior a LOGS_RETENCION_DIAS (180)
    python manage.py limpiar_logs --dias 90
    python manage.py limpiar_logs --dias 90 --simular

Pensado para una tarea programada semanal. Borra en lotes pequeños para no bloquear la tabla."""
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from api.models import RegistroLog
from api.services_logs import limpiar_logs


class Command(BaseCommand):
    help = 'Elimina registros de logs más antiguos que N días (retención).'

    def add_arguments(self, parser):
        parser.add_argument('--dias', type=int, default=None,
                            help=f'Días a conservar (por defecto {settings.LOGS_RETENCION_DIAS}).')
        parser.add_argument('--simular', action='store_true', help='Solo informa cuántos borraría.')

    def handle(self, *args, **opts):
        dias = opts['dias'] if opts['dias'] is not None else settings.LOGS_RETENCION_DIAS
        if dias < 1:
            raise CommandError('--dias debe ser al menos 1.')
        if opts['simular']:
            n = RegistroLog.objects.filter(timestamp__lt=timezone.now() - timedelta(days=dias)).count()
            self.stdout.write(f'Se eliminarían {n} registro(s) con más de {dias} días (simulación).')
            return
        n = limpiar_logs(dias)
        self.stdout.write(self.style.SUCCESS(f'Eliminados {n} registro(s) con más de {dias} días.'))
