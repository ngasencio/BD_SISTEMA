"""
Actualización de datos SIN botones. Dos usos, dos tareas programadas de Windows:

  * `BD_SISTEMA_Actualizacion_Diaria` (08:00, 13:30, 17:30): Formularios FSC (Panel SSO) +
    Órdenes de Compra y Licitaciones (Mercado Público, últimos N días).
        python manage.py actualizacion_completa
  * `BD_SISTEMA_Actualizacion_CompraAgil` (01:00): Compras Ágiles desde una fecha fija
    (SYNC_COMPRA_AGIL_DESDE, hoy 2026-09-01) hasta hoy.
        python manage.py actualizacion_completa --solo compra_agil

Cada etapa es independiente y se reintenta sola; si alguna queda con error se envía UN correo
resumen y el comando termina con código 1. Log: backend/logs/actualizacion_diaria.log.

Otros usos:
    python manage.py actualizacion_completa --dias 15
    python manage.py actualizacion_completa --solo ordenes_compra licitaciones
    python manage.py actualizacion_completa --solo compra_agil --ca-desde 2026-01-01 --ca-hasta 2026-08-31
    python manage.py actualizacion_completa --sin-correo
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError

from api.services_actualizacion_diaria import (
    ETAPAS, ETAPAS_DIARIAS, ActualizacionFallida, ejecutar_actualizacion_completa,
)
from api.services_sync_formularios import apto_consola


class Command(BaseCommand):
    help = "Actualiza Formularios FSC, OC, Licitaciones y Compra Ágil (sin botones, para tareas programadas)"

    def add_arguments(self, parser):
        parser.add_argument('--dias', type=int, default=10,
                            help='Ventana de días hacia atrás (incluye hoy) para OC y Licitaciones (default 10).')
        parser.add_argument('--reintentos', type=int, default=3,
                            help='Intentos por etapa antes de rendirse (default 3).')
        parser.add_argument('--espera-min', type=int, default=5,
                            help='Minutos entre intentos de una misma etapa (default 5).')
        parser.add_argument('--solo', nargs='+', choices=ETAPAS, metavar='ETAPA',
                            help=f"Correr solo estas etapas ({', '.join(ETAPAS)}). Sin esto: "
                                 f"{', '.join(ETAPAS_DIARIAS)} (Compra Ágil tiene su propia tarea).")
        parser.add_argument('--ca-desde', type=str, default=None, metavar='YYYY-MM-DD',
                            help='Inicio del rango de Compra Ágil (default: SYNC_COMPRA_AGIL_DESDE, 2026-09-01).')
        parser.add_argument('--ca-hasta', type=str, default=None, metavar='YYYY-MM-DD',
                            help='Fin del rango de Compra Ágil (default: hoy). Con --ca-desde y/o --ca-hasta\n'
                                 'se procesan TODOS los días de ese rango, aunque ya figuren leídos.')
        parser.add_argument('--ca-hilos', type=int, default=None,
                            help='Días de Compra Ágil que se bajan a la vez (default SYNC_COMPRA_AGIL_HILOS, 6).')
        parser.add_argument('--ca-presupuesto-min', type=int, default=None,
                            help='Tope en minutos de la etapa Compra Ágil (default SYNC_COMPRA_AGIL_PRESUPUESTO_MIN, 360).')
        parser.add_argument('--esperar-candado-min', type=int, default=20,
                            help='Minutos a esperar si ya hay otra actualización en curso (default 20).')
        parser.add_argument('--sin-correo', action='store_true',
                            help='No enviar correo de aviso si algo falla.')

    def handle(self, *args, **options):
        if options['dias'] < 1:
            raise CommandError('--dias debe ser >= 1')
        if options['reintentos'] < 1:
            raise CommandError('--reintentos debe ser >= 1')
        ca_desde = ca_hasta = None
        for opcion, nombre in (('ca_desde', '--ca-desde'), ('ca_hasta', '--ca-hasta')):
            if options[opcion]:
                try:
                    valor = date.fromisoformat(options[opcion])
                except ValueError:
                    raise CommandError(f'{nombre} debe tener formato YYYY-MM-DD')
                if opcion == 'ca_desde':
                    ca_desde = valor
                else:
                    ca_hasta = valor
        if ca_desde and ca_hasta and ca_hasta < ca_desde:
            raise CommandError('--ca-hasta no puede ser anterior a --ca-desde')
        solo = set(options['solo'] or ETAPAS_DIARIAS)
        try:
            ejecutar_actualizacion_completa(
                dias=options['dias'],
                reintentos=options['reintentos'],
                espera_min=max(options['espera_min'], 0),
                etapas=tuple(e for e in ETAPAS if e in solo),
                avisar_por_correo=not options['sin_correo'],
                esperar_candado_min=max(options['esperar_candado_min'], 0),
                ca_desde=ca_desde,
                ca_hasta=ca_hasta,
                ca_hilos=options['ca_hilos'],
                ca_presupuesto_min=options['ca_presupuesto_min'],
                salida=lambda m: self.stdout.write(apto_consola(m)),
            )
        except ActualizacionFallida as exc:
            raise CommandError(str(exc))
