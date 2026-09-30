"""Reemplaza el esquema de unicidad de DevengoSigfeAnual: de row_hash (hash de
TODO el contenido, incl. saldo vivo) a doc_key (hash de la identidad del
documento, sin saldo vivo).

Antes, cada cambio de Monto Vigente/Disponible/Consumido/Vigente Insumo/Tipo
de Cambio/Fecha Conforme/Fecha Ingreso del MISMO documento real (típicamente
porque se pagó parcial o totalmente entre una sincronización SIGFE y otra)
generaba una fila NUEVA en vez de actualizar la existente — la vieja nunca se
borraba. Confirmado en producción: ~10% de las 53.424 filas eran snapshots
repetidos del mismo documento, y sumas como "Monto Disponible" (deuda
pendiente, el KPI central del reporte Anexo N°3) quedaban muy por debajo de
la realidad porque se promediaban/licuaban saldos de distintos momentos en
el tiempo en vez de reflejar solo el más reciente.

Esta migración:
  1. Agrega doc_key (nullable) y quita la unicidad de row_hash.
  2. Calcula doc_key para cada fila a partir de sus propios campos de
     identidad (no requiere re-descargar nada de SIGFE).
  3. Para cada grupo de filas que resuelve al mismo doc_key, conserva SOLO la
     de fecha_sync más reciente (el snapshot más nuevo = el saldo real
     vigente) y borra el resto.
  4. Deja doc_key como NOT NULL + UNIQUE, listo para que
     consolidar_devengo_anual.py haga upsert por esa llave en cada
     sincronización futura.

Ver api/data/data_devengo/consolidar_devengo_anual.py (fecha_iso_para_hash,
calcular_doc_key, CAMPOS_IDENTIDAD) para la función equivalente usada por el
ETL — replicada aquí en migración porque las migraciones no deben depender
de código fuera del paquete Django."""
import hashlib
from collections import defaultdict

from django.db import migrations, models


# Debe coincidir EXACTO con CAMPOS_IDENTIDAD de consolidar_devengo_anual.py:
# todos los campos de negocio del documento, excepto los de saldo vivo
# (montos, tipo_cambio, fecha_conforme, fecha_ingreso) y los de metadata
# (archivo_origen, row_hash, doc_key, fecha_sync, id).
CAMPOS_IDENTIDAD = [
    "codigo_ue", "folio", "titulo", "tipo_presupuesto", "moneda_presupuestaria",
    "principal", "principal_relacionado", "moneda_documento", "tipo_documento",
    "numero_documento", "fecha_documento", "id_chile_compra", "fecha_emision",
    "catalogo_01", "catalogo_02", "catalogo_03", "catalogo_04", "catalogo_05",
    "catalogo_06", "concepto_presupuestario", "insumo",
]
CAMPOS_FECHA_IDENTIDAD = {"fecha_documento", "fecha_emision"}


def _valor_a_texto(val) -> str:
    if val is None:
        return ""
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    return str(val).strip()


def _fecha_iso_para_hash(val) -> str:
    if val is None:
        return ""
    if hasattr(val, "date") and callable(getattr(val, "date")):
        val = val.date()
    return val.isoformat()


def _calcular_doc_key(fila: dict) -> str:
    partes = []
    for campo in CAMPOS_IDENTIDAD:
        val = fila.get(campo)
        if campo in CAMPOS_FECHA_IDENTIDAD:
            partes.append(_fecha_iso_para_hash(val))
        else:
            partes.append(_valor_a_texto(val))
    return hashlib.sha256("|".join(partes).encode("utf-8")).hexdigest()


def poblar_doc_key_y_dedupe(apps, schema_editor):
    DevengoSigfeAnual = apps.get_model("api", "DevengoSigfeAnual")

    campos_query = ["id", "fecha_sync"] + CAMPOS_IDENTIDAD
    grupos = defaultdict(list)  # doc_key -> [(id, fecha_sync), ...]

    for fila in DevengoSigfeAnual.objects.values(*campos_query).iterator(chunk_size=5000):
        dk = _calcular_doc_key(fila)
        grupos[dk].append((fila["id"], fila["fecha_sync"]))

    ids_a_borrar = []
    actualizaciones = []  # objetos livianos solo con id + doc_key
    for dk, filas in grupos.items():
        # Se queda con la de fecha_sync más reciente (saldo más vigente);
        # ante empate exacto, con el id mayor (fila insertada después).
        filas_ordenadas = sorted(filas, key=lambda t: (t[1], t[0]), reverse=True)
        sobreviviente_id = filas_ordenadas[0][0]
        for fid, _ in filas_ordenadas[1:]:
            ids_a_borrar.append(fid)
        actualizaciones.append(DevengoSigfeAnual(id=sobreviviente_id, doc_key=dk))

    print(f"\n  [migración 0044] {len(grupos)} documentos únicos detectados.")
    print(f"  [migración 0044] {len(ids_a_borrar)} filas duplicadas (snapshots viejos) a eliminar.")

    # Borrar en lotes para no exceder límites de la conexión.
    LOTE = 2000
    for i in range(0, len(ids_a_borrar), LOTE):
        DevengoSigfeAnual.objects.filter(id__in=ids_a_borrar[i:i + LOTE]).delete()

    DevengoSigfeAnual.objects.bulk_update(actualizaciones, ["doc_key"], batch_size=500)

    total = DevengoSigfeAnual.objects.count()
    print(f"  [migración 0044] Dedupe completo. Filas finales en la tabla: {total}")


def noop_reversa(apps, schema_editor):
    # No hay forma de "reconstruir" las filas borradas — la reversa solo
    # limpia doc_key para dejar el esquema como estaba antes de esta
    # migración (row_hash sigue siendo el hash de contenido completo).
    DevengoSigfeAnual = apps.get_model("api", "DevengoSigfeAnual")
    DevengoSigfeAnual.objects.update(doc_key=None)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0043_procesocompra_alter_perfilusuario_role_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="devengosigfeanual",
            name="doc_key",
            field=models.CharField(
                max_length=64, null=True, editable=False,
                verbose_name="Llave del documento (identidad, sin saldo vivo)",
            ),
        ),
        migrations.AlterField(
            model_name="devengosigfeanual",
            name="row_hash",
            field=models.CharField(
                max_length=64, editable=False, db_index=True,
                verbose_name="Hash de fila (contenido completo)",
            ),
        ),
        migrations.RunPython(poblar_doc_key_y_dedupe, noop_reversa),
        migrations.AlterField(
            model_name="devengosigfeanual",
            name="doc_key",
            field=models.CharField(
                max_length=64, unique=True, editable=False,
                verbose_name="Llave del documento (identidad, sin saldo vivo)",
            ),
        ),
    ]
