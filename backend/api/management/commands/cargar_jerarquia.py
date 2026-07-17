"""
Carga la jerarquía de conceptos presupuestarios (5 niveles) desde el Excel de
referencia hacia la tabla concepto_jerarquia. El Excel trae 2 columnas
("Nivel" y "Concepto Presupuestario") y cada fila es un único concepto en
formato "CODIGO DESCRIPCION" (ej: "2101001 Sueldos y Sobresueldos").

Uso:
    python manage.py cargar_jerarquia
    python manage.py cargar_jerarquia --limpiar
    python manage.py cargar_jerarquia /ruta/a/otro_archivo.xlsx --limpiar
"""
import pathlib

import openpyxl
from django.core.management.base import BaseCommand, CommandError

from api.models import ConceptoJerarquia

# Longitud de código por nivel (N1=2, N2=4, N3=7, N4=10, N5=12)
NIVEL_LEN = {1: 2, 2: 4, 3: 7, 4: 10, 5: 12}

RUTA_DEFECTO = (
    pathlib.Path(__file__).resolve().parents[4]
    / "api" / "data" / "data_jerarquia_presupuestaria" / "jerarquia_concepto_presupuestario.xlsx"
)


class Command(BaseCommand):
    help = "Carga jerarquía presupuestaria (5 niveles) desde Excel (Nivel + Concepto Presupuestario)"

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
            n, _ = ConceptoJerarquia.objects.all().delete()
            self.stdout.write(f"Eliminados {n} registros previos")

        wb = openpyxl.load_workbook(str(ruta), read_only=True, data_only=True)
        ws = wb.active
        filas = list(ws.iter_rows(min_row=2, values_only=True))  # saltar encabezado
        wb.close()

        # Paso 1: diccionario código -> concepto completo (para resolver ancestros)
        code_full = {}
        entradas = []
        for nivel_raw, concepto_raw in filas:
            if not nivel_raw or not concepto_raw:
                continue
            nivel = int(nivel_raw)
            concepto = str(concepto_raw).strip()
            codigo = concepto.split(" ", 1)[0].strip()
            if not codigo.isdigit():
                self.stderr.write(f"  [ADVERTENCIA] Fila con código no numérico, se omite: {concepto!r}")
                continue
            code_full[codigo] = concepto
            entradas.append((codigo, concepto, nivel))

        # Paso 2: para cada concepto, resolver sus ancestros por prefijo del código
        objs = []
        for codigo, concepto, nivel in entradas:
            data = {
                "codigo": codigo, "descripcion": concepto, "nivel": nivel,
                "n1_codigo": "", "n1_desc": "",
                "n2_codigo": "", "n2_desc": "",
                "n3_codigo": "", "n3_desc": "",
                "n4_codigo": "", "n4_desc": "",
                "n5_codigo": "", "n5_desc": "",
            }
            data[f"n{nivel}_codigo"] = codigo
            data[f"n{nivel}_desc"] = concepto

            for anc_nivel in range(1, nivel):
                anc_len = NIVEL_LEN[anc_nivel]
                prefijo = codigo[:anc_len]
                if prefijo in code_full:
                    data[f"n{anc_nivel}_codigo"] = prefijo
                    data[f"n{anc_nivel}_desc"] = code_full[prefijo]

            objs.append(ConceptoJerarquia(**data))

        ConceptoJerarquia.objects.bulk_create(objs, ignore_conflicts=True, batch_size=200)
        self.stdout.write(self.style.SUCCESS(
            f"Cargados {len(objs)} conceptos presupuestarios (5 niveles). Total en tabla: {ConceptoJerarquia.objects.count()}"
        ))
