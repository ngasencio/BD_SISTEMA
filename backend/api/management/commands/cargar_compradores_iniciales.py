"""
Management command: cargar_compradores_iniciales

Carga el catálogo fijo de iniciales de comprador (código embebido en
OrdenCompra.NombreOC, ej. "F1-162-26-NAM") -> usuario del sistema.
Lista cerrada entregada por Abastecimiento -- NO se deriva de los nombres.

Uso:
    python manage.py cargar_compradores_iniciales
"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from api.models import CompradorInicial

# codigo -> username (identificador estable de auth.User; resuelto y verificado
# manualmente una sola vez al activar estas 16 cuentas con role='abastecimiento' —
# usar username en vez de first_name evita que una edición futura del nombre
# visible rompa la resolución en una re-ejecución del comando)
COMPRADORES = {
    'AVP': 'alicia.vidal@redsalud.gob.cl',
    'AAN': 'ariela.acevedo@redsalud.gob.cl',
    'CGL': 'cecilia.garay@redsalud.gob.cl',
    'DCR': 'daniela.cona@redsalud.gob.cl',
    'IVO': 'ivan.vargas@redsalud.gob.cl',
    'JOA': 'jacqueline.oyarzuna@redsalud.gob.cl',
    'LDA': 'lesly.diaz@redsalud.gob.cl',
    'MAR': 'miguel.aro@redsalud.gob.cl',
    'PLC': 'paulina.loncopan@redsalud.gob.cl',
    'RVM': 'rosae.vasquez@redsalud.gob.cl',
    'RUA': 'ruben.uribe@redsalud.gob.cl',
    'JFR': 'juan.rojelh@redsalud.gob.cl',
    'DJC': 'daniela.jarac@redsalud.gob.cl',
    'NAM': 'nicolas.asencio@redsalud.gob.cl',
    'LAF': 'luis.angulo@redsalud.gob.cl',
    'VMA': 'veronica.marquez.a@redsalud.gob.cl',
}


class Command(BaseCommand):
    help = 'Carga el catálogo fijo de iniciales de comprador -> usuario'

    def handle(self, *args, **options):
        creados = 0
        actualizados = 0
        no_encontrados = []

        for codigo, username in COMPRADORES.items():
            user = User.objects.filter(username=username).first()
            if not user:
                no_encontrados.append(f'{codigo} ({username})')
                continue

            _, creado = CompradorInicial.objects.update_or_create(
                codigo=codigo, defaults={'usuario': user},
            )
            if creado:
                creados += 1
            else:
                actualizados += 1
            self.stdout.write(f'  {codigo} -> {user.username}')

        self.stdout.write(self.style.SUCCESS(
            f'\nResumen: {creados} creados, {actualizados} actualizados.'
        ))
        if no_encontrados:
            self.stdout.write(self.style.WARNING(
                'No encontrados en auth.User (revisar first_name): ' + ', '.join(no_encontrados)
            ))
