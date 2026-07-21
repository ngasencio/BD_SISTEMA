"""
Carga los nombres de subdirección (hoja 'subdireccion' de mapa_sso.xlsx) hacia
data_sso_subdireccion. Solo esto — los departamentos YA existen en el sistema
(Departamento / data_departamento, cargados por el módulo de Usuarios desde el
Panel SSO) con mejor cobertura que un maestro propio, así que no se duplican acá.

data_sso_subdireccion solo resuelve el NOMBRE de Departamento.subdireccion_id
para establecimiento_id=1 (Dirección SS Osorno, IDs 2-5 — los 4 capítulos del
informe institucional). Los otros 6 establecimientos (hospitales de red) se
agrupan por Establecimiento.descripcion en su lugar (ver services.py).

Uso:
    python manage.py cargar_jerarquia_sso
    python manage.py cargar_jerarquia_sso --limpiar
    python manage.py cargar_jerarquia_sso /ruta/a/otro_mapa_sso.xlsx
"""
import pathlib

import pandas as pd
from django.core.management.base import BaseCommand, CommandError

from api.models import SsoSubdireccion

RUTA_DEFECTO = (
    pathlib.Path(__file__).resolve().parents[4]
    / "api" / "data" / "data_jerarquia_panel" / "mapa_sso.xlsx"
)


class Command(BaseCommand):
    help = "Carga los nombres de subdirección (Dirección SS Osorno) desde mapa_sso.xlsx"

    def add_arguments(self, parser):
        parser.add_argument(
            "archivo", type=str, nargs="?", default=str(RUTA_DEFECTO),
            help=f"Ruta al archivo .xlsx (default: {RUTA_DEFECTO})",
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
            n, _ = SsoSubdireccion.objects.all().delete()
            self.stdout.write(f"Eliminadas {n} subdirecciones previas")

        xl = pd.ExcelFile(ruta)
        if "subdireccion" not in xl.sheet_names:
            raise CommandError(f"El archivo debe tener hoja 'subdireccion'. Hojas encontradas: {xl.sheet_names}")

        df = xl.parse("subdireccion", header=0, dtype=str)
        df.columns = ["subdireccion_id", "nombre"][:len(df.columns)]
        df = df.dropna(subset=["subdireccion_id"])

        nuevas, actualizadas = 0, 0
        for _, row in df.iterrows():
            _, creado = SsoSubdireccion.objects.update_or_create(
                subdireccion_id=int(float(row["subdireccion_id"])),
                defaults={"nombre": str(row["nombre"]).strip() if pd.notna(row.get("nombre")) else ""},
            )
            nuevas += creado
            actualizadas += not creado

        self.stdout.write(self.style.SUCCESS(
            f"Subdirecciones: {nuevas} nuevas, {actualizadas} actualizadas (total {SsoSubdireccion.objects.count()})."
        ))
