"""
Actualización diaria COMPLETA sin botones: Formularios FSC (Panel SSO) + Órdenes de Compra
y Licitaciones (Mercado Público, últimos N días). Es lo que lanza la tarea programada de
Windows `BD_SISTEMA_Actualizacion_Diaria` (08:00).

Cada etapa es independiente y se reintenta sola; si alguna queda con error se envía UN correo
resumen y el comando termina con código 1. Log: backend/logs/actualizacion_diaria.log.

Uso:
    python manage.py actualizacion_completa
    python manage.py actualizacion_completa --dias 15
    python manage.py actualizacion_completa --solo ordenes_compra licitaciones
    python manage.py actualizacion_completa --sin-correo
"""
from django.core.management.base import BaseCommand, CommandError

from api.services_actualizacion_diaria import (
    ETAPAS, ActualizacionFallida, ejecutar_actualizacion_completa,
)
from api.services_sync_formularios import apto_consola


class Command(BaseCommand):
    help = "Actualiza Formularios FSC, Órdenes de Compra y Licitaciones (sin botones, para tarea programada)"

    def add_arguments(self, parser):
        parser.add_argument('--dias', type=int, default=10,
                            help='Ventana de días hacia atrás (incluye hoy) para OC y Licitaciones (default 10).')
        parser.add_argument('--reintentos', type=int, default=3,
                            help='Intentos por etapa antes de rendirse (default 3).')
        parser.add_argument('--espera-min', type=int, default=5,
                            help='Minutos entre intentos de una misma etapa (default 5).')
        parser.add_argument('--solo', nargs='+', choices=ETAPAS, metavar='ETAPA',
                            help=f"Correr solo estas etapas ({', '.join(ETAPAS)}).")
        parser.add_argument('--esperar-candado-min', type=int, default=20,
                            help='Minutos a esperar si ya hay otra actualización en curso (default 20).')
        parser.add_argument('--sin-correo', action='store_true',
                            help='No enviar correo de aviso si algo falla.')

    def handle(self, *args, **options):
        if options['dias'] < 1:
            raise CommandError('--dias debe ser >= 1')
        if options['reintentos'] < 1:
            raise CommandError('--reintentos debe ser >= 1')
        solo = set(options['solo'] or ETAPAS)
        try:
            ejecutar_actualizacion_completa(
                dias=options['dias'],
                reintentos=options['reintentos'],
                espera_min=max(options['espera_min'], 0),
                etapas=tuple(e for e in ETAPAS if e in solo),
                avisar_por_correo=not options['sin_correo'],
                esperar_candado_min=max(options['esperar_candado_min'], 0),
                salida=lambda m: self.stdout.write(apto_consola(m)),
            )
        except ActualizacionFallida as exc:
            raise CommandError(str(exc))
