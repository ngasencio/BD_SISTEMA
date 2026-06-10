"""
Management command: import_panel_users

Importa los usuarios activos de data_usuario_panel a auth.User + PerfilUsuario.

Uso:
    python manage.py import_panel_users              # importa nuevos, no toca existentes
    python manage.py import_panel_users --update     # actualiza cargo/run/establecimiento
    python manage.py import_panel_users --dry-run    # solo muestra qué haría
"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import PerfilUsuario, UsuarioPanel


class Command(BaseCommand):
    help = 'Importa usuarios activos del Panel SSO (data_usuario_panel) a auth.User'

    def add_arguments(self, parser):
        parser.add_argument('--update',  action='store_true', help='Actualiza campos de perfil en usuarios existentes')
        parser.add_argument('--dry-run', action='store_true', help='Solo muestra qué haría, sin escribir en DB')

    def handle(self, *args, **options):
        update  = options['update']
        dry_run = options['dry_run']

        panel_users = UsuarioPanel.objects.filter(activo='S')
        total   = panel_users.count()
        creados = 0
        actualizados = 0
        omitidos = 0

        self.stdout.write(f'Panel SSO usuarios activos: {total}')
        if dry_run:
            self.stdout.write(self.style.WARNING('  [DRY-RUN] No se escribirá nada en la base de datos'))

        with transaction.atomic():
            for pu in panel_users:
                username = pu.correo_electronico.strip().lower()
                if not username:
                    omitidos += 1
                    continue

                existing = User.objects.filter(username=username).first()

                if existing:
                    if update:
                        if not dry_run:
                            perfil, _ = PerfilUsuario.objects.get_or_create(user=existing)
                            perfil.panel_id           = pu.id
                            perfil.establecimiento_id = pu.establecimiento_id
                            perfil.cargo              = pu.cargo or ''
                            perfil.run                = pu.run or ''
                            perfil.save()
                            # Actualiza nombre si está vacío
                            nombre = pu.alias or pu.usuario or ''
                            if not existing.first_name and nombre:
                                existing.first_name = nombre[:150]
                                existing.save(update_fields=['first_name'])
                        actualizados += 1
                        try:
                            self.stdout.write(f'  ACTUALIZADO: {username}')
                        except UnicodeEncodeError:
                            self.stdout.write('  ACTUALIZADO: (usuario con caracteres especiales)')
                    else:
                        omitidos += 1
                    continue

                # Usuario nuevo
                nombre = (pu.alias or pu.usuario or '').strip()[:150]
                password_inicial = pu.usuario.strip() if pu.usuario else username

                if not dry_run:
                    user = User.objects.create_user(
                        username   = username,
                        email      = username,
                        password   = password_inicial,
                        first_name = nombre,
                        is_active  = True,
                    )
                    PerfilUsuario.objects.create(
                        user               = user,
                        role               = 'viewer',
                        panel_id           = pu.id,
                        establecimiento_id = pu.establecimiento_id,
                        cargo              = pu.cargo or '',
                        run                = pu.run or '',
                    )

                creados += 1
                try:
                    self.stdout.write(f'  CREADO: {username}')
                except UnicodeEncodeError:
                    self.stdout.write(f'  CREADO: (usuario con caracteres especiales)')

            if dry_run:
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS(
            f'\nResumen: {creados} creados, {actualizados} actualizados, {omitidos} omitidos'
        ))
        if creados > 0 and not dry_run:
            self.stdout.write(self.style.WARNING(
                'IMPORTANTE: todos los usuarios creados tienen role=viewer y '
                'contraseña = columna "usuario" del Panel SSO.\n'
                'Asigna roles desde /admin/usuarios antes de comunicarlo.'
            ))
