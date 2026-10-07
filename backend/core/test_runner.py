"""Runner de pruebas: además de las tablas normales, crea las de los modelos managed=False
(que las migraciones no crean porque en producción ya existen). Solo para core.settings_test."""
from django.apps import apps
from django.db import connections
from django.test.runner import DiscoverRunner


class RunnerTablasNoGestionadas(DiscoverRunner):
    def setup_databases(self, **kwargs):
        config = super().setup_databases(**kwargs)
        for alias in connections:
            conexion = connections[alias]
            with conexion.constraint_checks_disabled(), conexion.schema_editor() as editor:
                for modelo in apps.get_models():
                    meta = modelo._meta
                    if meta.managed or meta.proxy or meta.concrete_model is not modelo:
                        continue
                    editor.create_model(modelo)
        return config
