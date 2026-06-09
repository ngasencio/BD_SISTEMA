from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0025_formulariofsc_adj_campos'),
    ]

    operations = [
        migrations.AddField(
            model_name='formulariofsc',
            name='destino_actual',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='formulariofsc',
            name='item_presupuestario',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='formulariofsc',
            name='folio_requerimiento',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
    ]
