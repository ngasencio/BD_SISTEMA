"""
Script para extraer RAW_DATA del HTML y cargar en Django.

Uso:
    python manage.py import_from_html --file "ruta/al/archivo.html"
"""
import re, json
from decimal import Decimal, InvalidOperation
from datetime import datetime, date
from django.core.management.base import BaseCommand
from api.models import Devengo


class Command(BaseCommand):
    help = 'Importa registros de devengo desde el JSON embebido en el HTML del dashboard'

    def add_arguments(self, parser):
        parser.add_argument('--file', type=str, required=True, help='Ruta al archivo HTML')
        parser.add_argument('--clear', action='store_true', help='Limpiar tabla antes de importar')

    def handle(self, *args, **options):
        filepath = options['file']

        if options['clear']:
            count = Devengo.objects.count()
            Devengo.objects.all().delete()
            self.stdout.write(self.style.WARNING(f'Tabla limpiada: {count} registros eliminados'))

        self.stdout.write(f'Leyendo HTML: {filepath}')

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            self.stderr.write(self.style.ERROR(f'Error abriendo archivo: {e}'))
            return

        # Extraer el array RAW_DATA: localizar corchete de apertura y hacer bracket-matching
        idx = content.find('const RAW_DATA')
        if idx < 0:
            self.stderr.write(self.style.ERROR('No se encontró RAW_DATA en el HTML'))
            return

        start = content.find('[', idx)
        if start < 0:
            self.stderr.write(self.style.ERROR('No se encontró el array de datos'))
            return

        # Bracket matching para encontrar el cierre del array
        depth = 0
        end = start
        for i, ch in enumerate(content[start:]):
            if ch == '[': depth += 1
            elif ch == ']':
                depth -= 1
                if depth == 0:
                    end = start + i + 1
                    break

        self.stdout.write(f'RAW_DATA encontrado ({end - start:,} bytes), limpiando y parseando…')

        arr_text = content[start:end]
        # Limpiar caracteres de control inválidos en JSON (excepto \n \r que son permitidos)
        arr_text = ''.join(c if (c >= ' ' or c in '\n\r') else ' ' for c in arr_text)

        try:
            raw = json.loads(arr_text)
        except json.JSONDecodeError as e:
            self.stderr.write(self.style.ERROR(f'Error parseando JSON: {e}'))
            # Intentar con reemplazo más agresivo
            try:
                import ast
                arr_text2 = re.sub(r'[\x00-\x1f\x7f]', ' ', arr_text)
                raw = json.loads(arr_text2)
            except Exception as e2:
                self.stderr.write(self.style.ERROR(f'Error segundo intento: {e2}'))
                return

        self.stdout.write(f'Total registros en RAW_DATA: {len(raw)}')

        # Mapeo de campos del JSON al modelo
        # JSON fields: ue, prov, td, fc, cc, c01, c04, cp, n1, v, d, c
        imported = 0
        errors = 0
        batch = []
        BATCH_SIZE = 500

        for i, item in enumerate(raw):
            try:
                cp = item.get('cp', '')
                n1 = item.get('n1', '')
                n2 = item.get('n2', '')

                obj = Devengo(
                    codigo_ue=item.get('ue', ''),
                    principal=item.get('prov', ''),
                    tipo_documento=item.get('td', ''),
                    catalogo_01=item.get('c01', ''),
                    catalogo_04=item.get('c04', ''),
                    concepto_presupuestario=cp,
                    # n1 y n2 van al campo catálogos adicionales: guardamos en catalogo_02
                    catalogo_02=n1,
                    catalogo_03=n2,
                    monto_vigente=Decimal(str(item.get('v', 0) or 0)),
                    monto_disponible=Decimal(str(item.get('d', 0) or 0)),
                    monto_consumido=Decimal(str(item.get('c', 0) or 0)),
                    id_chile_compra=str(item.get('cc', '')) if item.get('cc') else None,
                    archivo_origen='html_embed',
                )

                # Fecha conforme
                fc = item.get('fc', '')
                if fc:
                    try:
                        obj.fecha_conforme = datetime.strptime(fc.strip(), '%Y-%m-%d').date()
                    except ValueError:
                        pass

                batch.append(obj)

                if len(batch) >= BATCH_SIZE:
                    Devengo.objects.bulk_create(batch, ignore_conflicts=True)
                    imported += len(batch)
                    self.stdout.write(f'  → {imported} registros importados…')
                    batch = []

            except Exception as e:
                errors += 1
                if errors <= 5:
                    self.stderr.write(f'  Error en item {i}: {e}')

        if batch:
            Devengo.objects.bulk_create(batch, ignore_conflicts=True)
            imported += len(batch)

        self.stdout.write(self.style.SUCCESS(
            f'\n✅ Importación desde HTML completada: {imported} registros, {errors} errores.'
        ))
