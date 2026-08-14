# Índice compuesto sobre data_facturas(folio, emisor) — la tabla es managed=False
# (el ETL legacy la crea/reemplaza por su cuenta) pero RunSQL no depende de eso.
# Necesario para que el upsert incremental del módulo Facturas (update_or_create por
# folio+emisor) no haga table scans en cada fila.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0039_facturas_sync_log'),
    ]

    operations = [
        migrations.RunSQL(
            sql="CREATE INDEX idx_facturas_folio_emisor ON data_facturas (folio, emisor);",
            reverse_sql="DROP INDEX idx_facturas_folio_emisor ON data_facturas;",
        ),
    ]
