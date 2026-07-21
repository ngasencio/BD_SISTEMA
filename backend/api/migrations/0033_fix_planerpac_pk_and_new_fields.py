# Retrofita PlanerPAC: la tabla data_planerpac existe en la BD desde antes de Django
# (creada por un loader externo con pandas.to_sql) y nunca tuvo columna `id`/PK real,
# aunque la migración 0017 ya la declaraba como managed=False con `id` en el estado.
# Este cambio pasa el modelo a managed=True y agrega físicamente la PK vía RunSQL
# (Django no genera ALTER TABLE para un campo que su propio historial de migraciones
# ya daba por existente) + las 2 columnas nuevas (cantidad_oc, meses_envio_oc) + índice.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0032_add_sigfe_anexo1'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='planerpac',
            options={'managed': True},
        ),
        migrations.RunSQL(
            sql="ALTER TABLE data_planerpac ADD COLUMN id BIGINT AUTO_INCREMENT PRIMARY KEY FIRST",
            reverse_sql="ALTER TABLE data_planerpac DROP COLUMN id",
        ),
        migrations.AddField(
            model_name='planerpac',
            name='cantidad_oc',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='planerpac',
            name='meses_envio_oc',
            field=models.TextField(blank=True, null=True),
        ),
    ]
