"""
Sincroniza los Formularios FSC desde el Panel SS Osorno sin usar el botón del dashboard
(mismo ETL que «Actualizar desde el Panel»). Pensado para la tarea programada de Windows
`BD_SISTEMA_Sincronizar_FSC` (08:00 diario).

Credenciales: PANEL_SSO_RUT / PANEL_SSO_DV / PANEL_SSO_CLAVE en backend/.env.
Log: backend/logs/sincronizacion_fsc.log. Si falla tras los reintentos, avisa por correo
y termina con código 1 (Windows lo muestra como "último resultado" de la tarea).

Uso:
    python manage.py sincronizar_formularios_fsc
    python manage.py sincronizar_formularios_fsc --reintentos 5 --espera-min 5
    python manage.py sincronizar_formularios_fsc --sin-correo
"""
from django.core.management.base import BaseCommand, CommandError

from api.services_sync_formularios import SincronizacionFallida, apto_consola, ejecutar_sincronizacion


class Command(BaseCommand):
    help = "Sincroniza los Formularios FSC desde el Panel SS Osorno (sin botón, para tarea programada)"

    def add_arguments(self, parser):
        parser.add_argument('--reintentos', type=int, default=3,
                            help='Intentos totales antes de rendirse (default 3).')
        parser.add_argument('--espera-min', type=int, default=10,
                            help='Minutos de espera entre intentos (default 10).')
        parser.add_argument('--sin-correo', action='store_true',
                            help='No enviar correo de aviso si falla.')

    def handle(self, *args, **options):
        if options['reintentos'] < 1:
            raise CommandError('--reintentos debe ser >= 1')
        try:
            ejecutar_sincronizacion(
                reintentos=options['reintentos'],
                espera_min=max(options['espera_min'], 0),
                avisar_por_correo=not options['sin_correo'],
                salida=lambda m: self.stdout.write(apto_consola(m)),
            )
        except SincronizacionFallida as exc:
            raise CommandError(str(exc))
