"""Notifica (campanita) a los Gestores de Compras los plazos de Mercado Público por vencer
o vencidos de los procesos de su departamento. Idempotente: no repite un mismo aviso en 14
días, así que es seguro programarlo a diario (cron / Programador de tareas):

    python manage.py notificar_plazos_gestores
"""
from django.core.management.base import BaseCommand

from api.services import generar_notificaciones_plazos_gestores


class Command(BaseCommand):
    help = 'Genera las notificaciones de plazos de Mercado Público para los Gestores de Compras.'

    def handle(self, *args, **options):
        creadas = generar_notificaciones_plazos_gestores()
        self.stdout.write(self.style.SUCCESS(f'{creadas} notificación(es) de plazo creada(s).'))
