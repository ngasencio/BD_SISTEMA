"""
Carga el maestro histórico de proyectos PAC (OCPAC_Maestro.csv) hacia
data_pac_proyecto_maestro. Se usa para verificar si un FormularioFSCDerivado
está Dentro o Fuera del PAC, comparando su id_plan contra id_proyecto.

El CSV es generado por api/data/data_pac/consolidar_pac.py a partir de los
archivos PACxx.xlsx exportados desde Mercado Público — es un proceso manual,
no automatizado desde este comando.

Uso:
    python manage.py cargar_pac_maestro
    python manage.py cargar_pac_maestro --limpiar
    python manage.py cargar_pac_maestro /ruta/a/otro_maestro.csv
"""
import pathlib
import re

import pandas as pd
from django.core.management.base import BaseCommand, CommandError

from api.models import PacProyectoMaestro

RUTA_DEFECTO = (
    pathlib.Path(__file__).resolve().parents[4]
    / "api" / "data" / "data_pac" / "OCPAC_Maestro.csv"
)

_RE_ANHO = re.compile(r"-PC(\d{2})$", re.IGNORECASE)


def _anho_desde_id_proyecto(id_proyecto):
    m = _RE_ANHO.search(id_proyecto or "")
    return 2000 + int(m.group(1)) if m else None


class Command(BaseCommand):
    help = "Carga el maestro histórico de proyectos PAC (OCPAC_Maestro.csv) para el check Dentro/Fuera PAC"

    def add_arguments(self, parser):
        parser.add_argument(
            "archivo", type=str, nargs="?", default=str(RUTA_DEFECTO),
            help=f"Ruta al CSV (default: {RUTA_DEFECTO})",
        )
        parser.add_argument(
            "--limpiar", action="store_true",
            help="Eliminar registros existentes antes de cargar",
        )

    def handle(self, *args, **options):
        ruta = pathlib.Path(options["archivo"])
        if not ruta.exists():
            raise CommandError(f"No se encontró el archivo: {ruta}")

        if options["limpiar"]:
            n, _ = PacProyectoMaestro.objects.all().delete()
            self.stdout.write(f"Eliminados {n} registros previos")

        df = pd.read_csv(ruta, dtype=str, encoding="utf-8-sig")
        columnas_esperadas = {"ID Proyecto", "Nombre Proyecto", "OC Asociada PAC"}
        if not columnas_esperadas.issubset(df.columns):
            raise CommandError(
                f"Columnas esperadas {columnas_esperadas} no encontradas. "
                f"Columnas del archivo: {list(df.columns)}"
            )

        df = df.dropna(subset=["ID Proyecto"])

        nuevos, actualizados, omitidos = 0, 0, 0
        for _, row in df.iterrows():
            id_proyecto = str(row["ID Proyecto"]).strip()
            oc_asociada = str(row["OC Asociada PAC"]).strip() if pd.notna(row["OC Asociada PAC"]) else None
            if not id_proyecto:
                omitidos += 1
                continue
            nombre_proyecto = str(row["Nombre Proyecto"]).strip() if pd.notna(row.get("Nombre Proyecto")) else None
            _, creado = PacProyectoMaestro.objects.update_or_create(
                id_proyecto=id_proyecto,
                oc_asociada=oc_asociada,
                defaults={
                    "nombre_proyecto": nombre_proyecto,
                    "anho_pac": _anho_desde_id_proyecto(id_proyecto),
                },
            )
            if creado:
                nuevos += 1
            else:
                actualizados += 1

        total = PacProyectoMaestro.objects.count()
        proyectos_unicos = PacProyectoMaestro.objects.values("id_proyecto").distinct().count()
        self.stdout.write(self.style.SUCCESS(
            f"Maestro PAC cargado — {nuevos} nuevos, {actualizados} actualizados, {omitidos} omitidos. "
            f"Total filas: {total} ({proyectos_unicos} proyectos únicos)."
        ))
