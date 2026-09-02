"""
Management command: cargar_compradores_compras

Carga el catálogo del módulo Gestión de Compras: 1) ComprasCompradorPerfil
(nombre completo tal cual aparece en FormularioFSCDerivado.comprador -> usuario),
y 2) asigna el rol 'comprador'/'jefatura' en PerfilUsuario a cada persona.

Lista cerrada verificada contra la BD real (distinct de FormularioFSCDerivado.comprador
con >0 formularios) y contra auth.User (match exacto por nombre completo) el
2026-09-01 -- no se deriva automáticamente, se mantiene a mano igual criterio que
cargar_compradores_iniciales.py.

Uso:
    python manage.py cargar_compradores_compras
"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import ComprasCompradorPerfil, PerfilUsuario

# nombre tal cual en FormularioFSCDerivado.comprador -> username de auth.User
COMPRADORES = {
    'ALICIA VIDAL':       'alicia.vidal@redsalud.gob.cl',
    'MIGUEL ARO':          'miguel.aro@redsalud.gob.cl',
    'NICOLAS ASENCIO':     'nicolas.asencio@redsalud.gob.cl',
    'IVAN VARGAS':         'ivan.vargas@redsalud.gob.cl',
    'DANIELA CONA':        'daniela.cona@redsalud.gob.cl',
    'RUBEN URIBE':         'ruben.uribe@redsalud.gob.cl',
    'JACQUELINE OYARZUN':  'jacqueline.oyarzuna@redsalud.gob.cl',
}

# Jefaturas -- no aparecen como 'comprador' en FSC derivados (o si aparecen, además
# reciben el rol jefatura), reciben solo el rol de PerfilUsuario, sin fila en
# ComprasCompradorPerfil salvo que también compren (caso de Nicolás Asencio, ya
# cubierto arriba).
JEFATURAS_USERNAMES = [
    'cristina.flores@redsalud.gob.cl',
    'sandrap.espinoza@redsalud.gob.cl',
    'nicolas.asencio@redsalud.gob.cl',
]


class Command(BaseCommand):
    help = 'Carga el catálogo de compradores del módulo Compras y asigna roles comprador/jefatura'

    def handle(self, *args, **options):
        creados = 0
        actualizados = 0
        no_encontrados = []
        roles_asignados = 0

        with transaction.atomic():
            for nombre_comprador, username in COMPRADORES.items():
                user = User.objects.filter(username=username).first()
                if not user:
                    no_encontrados.append(f'{nombre_comprador} ({username})')
                    continue

                _, creado = ComprasCompradorPerfil.objects.update_or_create(
                    nombre_comprador=nombre_comprador, defaults={'usuario': user, 'activo': True},
                )
                if creado:
                    creados += 1
                else:
                    actualizados += 1
                self.stdout.write(f'  {nombre_comprador} -> {user.username}')

                perfil, _ = PerfilUsuario.objects.get_or_create(user=user, defaults={'role': 'comprador'})
                if perfil.role not in ('comprador', 'jefatura', 'admin'):
                    perfil.role = 'comprador'
                    perfil.save(update_fields=['role'])
                    roles_asignados += 1

            for username in JEFATURAS_USERNAMES:
                user = User.objects.filter(username=username).first()
                if not user:
                    no_encontrados.append(f'jefatura ({username})')
                    continue
                perfil, _ = PerfilUsuario.objects.get_or_create(user=user, defaults={'role': 'jefatura'})
                if perfil.role != 'admin':
                    perfil.role = 'jefatura'
                    perfil.save(update_fields=['role'])
                    roles_asignados += 1
                self.stdout.write(f'  jefatura -> {user.username} (role={perfil.role})')

        self.stdout.write(self.style.SUCCESS(
            f'\nResumen: {creados} creados, {actualizados} actualizados, '
            f'{roles_asignados} roles asignados/actualizados.'
        ))
        if no_encontrados:
            self.stdout.write(self.style.WARNING(
                'No encontrados en auth.User: ' + ', '.join(no_encontrados)
            ))
