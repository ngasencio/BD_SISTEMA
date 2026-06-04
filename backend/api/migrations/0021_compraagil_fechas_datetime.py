from django.db import migrations


FORWARD_SQL = """
-- Vaciar strings vacíos antes del ALTER para evitar errores de conversión
UPDATE api_compraagil_resumen SET FechaPublicacion  = NULL WHERE FechaPublicacion  = '';
UPDATE api_compraagil_resumen SET FechaCierre        = NULL WHERE FechaCierre        = '';
UPDATE api_compraagil_resumen SET FechaUltimoCambio  = NULL WHERE FechaUltimoCambio  = '';

-- Convertir TEXT → DATETIME (MariaDB parsea 'YYYY-MM-DD HH:MM' a '2026-03-31 12:09:00')
ALTER TABLE api_compraagil_resumen
    MODIFY COLUMN FechaPublicacion  DATETIME NULL,
    MODIFY COLUMN FechaCierre       DATETIME NULL,
    MODIFY COLUMN FechaUltimoCambio DATETIME NULL;
"""

REVERSE_SQL = """
ALTER TABLE api_compraagil_resumen
    MODIFY COLUMN FechaPublicacion  TEXT NULL,
    MODIFY COLUMN FechaCierre       TEXT NULL,
    MODIFY COLUMN FechaUltimoCambio TEXT NULL;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0020_add_performance_indexes'),
    ]

    operations = [
        migrations.RunSQL(sql=FORWARD_SQL, reverse_sql=REVERSE_SQL),
    ]
