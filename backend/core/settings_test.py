"""Settings SOLO para pruebas automáticas: SQLite en memoria, sin migraciones.

La base real (MariaDB) no sirve para `manage.py test`: varias migraciones dependen de tablas
`managed=False` (api_compraagil_resumen, data_usuario_panel...) que no existen en una base
vacía. Acá las tablas salen de los modelos (sin migraciones) y las `managed=False` las crea
`api.tests.base.crear_tablas_no_gestionadas()`.

Uso:  python manage.py test api.tests --settings=core.settings_test
"""
from .settings import *  # noqa: F401,F403


class _SinMigraciones(dict):
    def __contains__(self, item):
        return True

    def __getitem__(self, item):
        return None


MIGRATION_MODULES = _SinMigraciones()
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.dummy.DummyCache'}}
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
# Los correos de prueba van a la bandeja en memoria de Django, nunca a un SMTP real.
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
EMAIL_HOST_USER = 'remitente@test.local'
DEFAULT_FROM_EMAIL = 'remitente@test.local'
TEST_RUNNER = 'core.test_runner.RunnerTablasNoGestionadas'
NOTIF_PLAN_PAUSA_SEG = 0
