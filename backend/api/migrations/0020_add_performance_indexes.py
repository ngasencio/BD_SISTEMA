"""
Migration 0020 — Performance indexes

Managed tables (Django-generated SQL):
  - api_licitacion:   Estado, Tipo, FechaPublicacion, C_NombreOrganismo
  - api_ordencompra:  EstadoOC, FechaEnvio, C_Unidad, EnlacePAC,
                      CodigoLicitacion, (EstadoOC+FechaEnvio) compound

Unmanaged tables (RunSQL — Django won't generate ALTER TABLE for managed=False):
  - api_compraagil_resumen:   estadoglosa, fechapublicacion, unidadcompra
  - api_compraagil_proveedores: codigocompraagil
  - api_compraagil_productos:   codigocompraagil
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0019_add_nombre_proyecto_ordencompra'),
    ]

    operations = [
        # ── Licitacion ──────────────────────────────────────────────────────────
        migrations.AddIndex(
            model_name='licitacion',
            index=models.Index(fields=['Estado'], name='idx_li_estado'),
        ),
        migrations.AddIndex(
            model_name='licitacion',
            index=models.Index(fields=['Tipo'], name='idx_li_tipo'),
        ),
        migrations.AddIndex(
            model_name='licitacion',
            index=models.Index(fields=['FechaPublicacion'], name='idx_li_fecha_pub'),
        ),
        migrations.AddIndex(
            model_name='licitacion',
            index=models.Index(fields=['C_NombreOrganismo'], name='idx_li_organismo'),
        ),

        # ── OrdenCompra ─────────────────────────────────────────────────────────
        migrations.AddIndex(
            model_name='ordencompra',
            index=models.Index(fields=['EstadoOC'], name='idx_oc_estado'),
        ),
        migrations.AddIndex(
            model_name='ordencompra',
            index=models.Index(fields=['FechaEnvio'], name='idx_oc_fecha_envio'),
        ),
        migrations.AddIndex(
            model_name='ordencompra',
            index=models.Index(fields=['C_Unidad'], name='idx_oc_unidad'),
        ),
        migrations.AddIndex(
            model_name='ordencompra',
            index=models.Index(fields=['EnlacePAC'], name='idx_oc_enlace_pac'),
        ),
        migrations.AddIndex(
            model_name='ordencompra',
            index=models.Index(fields=['CodigoLicitacion'], name='idx_oc_cod_licitacion'),
        ),
        migrations.AddIndex(
            model_name='ordencompra',
            index=models.Index(fields=['EstadoOC', 'FechaEnvio'], name='idx_oc_estado_fecha'),
        ),

        # ── Tablas managed=False — RunSQL ────────────────────────────────────────
        migrations.RunSQL(
            sql=[
                # Compra Ágil Resumen
                "CREATE INDEX IF NOT EXISTS idx_ca_res_estadoglosa "
                "  ON api_compraagil_resumen (EstadoGlosa(50));",
                "CREATE INDEX IF NOT EXISTS idx_ca_res_fechapub "
                "  ON api_compraagil_resumen (FechaPublicacion(20));",
                "CREATE INDEX IF NOT EXISTS idx_ca_res_unidad "
                "  ON api_compraagil_resumen (UnidadCompra(80));",
                # Compra Ágil Proveedores
                "CREATE INDEX IF NOT EXISTS idx_ca_prov_codigo "
                "  ON api_compraagil_proveedores (CodigoCompraAgil(50));",
                # Compra Ágil Productos
                "CREATE INDEX IF NOT EXISTS idx_ca_prod_codigo "
                "  ON api_compraagil_productos (CodigoCompraAgil(50));",
            ],
            reverse_sql=[
                "DROP INDEX IF EXISTS idx_ca_res_estadoglosa  ON api_compraagil_resumen;",
                "DROP INDEX IF EXISTS idx_ca_res_fechapub     ON api_compraagil_resumen;",
                "DROP INDEX IF EXISTS idx_ca_res_unidad       ON api_compraagil_resumen;",
                "DROP INDEX IF EXISTS idx_ca_prov_codigo      ON api_compraagil_proveedores;",
                "DROP INDEX IF EXISTS idx_ca_prod_codigo      ON api_compraagil_productos;",
            ],
        ),
    ]
