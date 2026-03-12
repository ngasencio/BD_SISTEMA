"""
Comando de gestión para importar Licitaciones y Detalles desde CSV.

Uso:
    python manage.py import_csv --resumen /ruta/RESUMEN.csv --detalles /ruta/DETALLES.csv
"""
import csv
import os

from dateutil import parser
from django.core.management.base import BaseCommand, CommandError

from api.models import DetalleLicitacion, Licitacion


class Command(BaseCommand):
    help = 'Importar datos de CSV de Licitaciones y Detalles a la base de datos'

    def add_arguments(self, parser_arg):
        parser_arg.add_argument(
            '--resumen',
            type=str,
            required=True,
            help='Ruta al archivo CSV de resumen de licitaciones',
        )
        parser_arg.add_argument(
            '--detalles',
            type=str,
            required=True,
            help='Ruta al archivo CSV de detalles de licitaciones',
        )

    def handle(self, *args, **options):
        resumen_path = options['resumen']
        detalles_path = options['detalles']

        if not os.path.exists(resumen_path):
            raise CommandError(f'Archivo de resumen no encontrado: {resumen_path}')
        if not os.path.exists(detalles_path):
            raise CommandError(f'Archivo de detalles no encontrado: {detalles_path}')

        self._importar_licitaciones(resumen_path)
        self._importar_detalles(detalles_path)

    def _parse_fecha(self, valor):
        """Parsea una fecha de forma segura; retorna None si está vacía o es inválida."""
        if not valor or not str(valor).strip():
            return None
        try:
            return parser.parse(valor)
        except (ValueError, TypeError):
            return None

    def _parse_int(self, valor):
        """Convierte a int de forma segura."""
        try:
            return int(valor) if valor else None
        except (ValueError, TypeError):
            return None

    def _parse_float(self, valor):
        """Convierte a float aceptando tanto '.' como ',' como separador decimal."""
        try:
            return float(str(valor).replace(',', '.')) if valor else None
        except (ValueError, TypeError):
            return None

    def _importar_licitaciones(self, path):
        self.stdout.write('Importando Licitaciones...')
        licitaciones = []
        errores = 0

        with open(path, newline='', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                codigo = row.get('CodigoLicitacion', '').strip()
                if not codigo:
                    continue
                try:
                    licitaciones.append(Licitacion(
                        codigo_licitacion=codigo,
                        Numero=row.get('Numero') or '',
                        Nombre=row.get('Nombre'),
                        CodigoEstado=self._parse_int(row.get('CodigoEstado')),
                        Estado=row.get('Estado'),
                        Descripcion=row.get('Descripcion'),
                        Tipo=row.get('Tipo'),
                        CodigoTipo=self._parse_int(row.get('CodigoTipo')),
                        Etapas=self._parse_int(row.get('Etapas')),
                        EstadoEtapas=row.get('EstadoEtapas'),
                        C_CodigoOrganismo=row.get('C_CodigoOrganismo'),
                        C_NombreOrganismo=row.get('C_NombreOrganismo'),
                        C_RutUnidad=row.get('C_RutUnidad'),
                        C_CodigoUnidad=row.get('C_CodigoUnidad'),
                        C_Unidad=row.get('C_Unidad'),
                        C_DireccionUnidad=row.get('C_DireccionUnidad'),
                        C_ComunaUnidad=row.get('C_ComunaUnidad'),
                        C_RegionUnidad=row.get('C_RegionUnidad'),
                        C_RutUsuario=row.get('C_RutUsuario'),
                        C_CodigoUsuario=row.get('C_CodigoUsuario'),
                        C_Usuario=row.get('C_Usuario'),
                        C_Cargo=row.get('C_Cargo'),
                        FechaCreacion=self._parse_fecha(row.get('FechaCreacion')),
                        FechaCierre=self._parse_fecha(row.get('FechaCierre')),
                        FechaInicio=self._parse_fecha(row.get('FechaInicio')),
                        FechaFinal=self._parse_fecha(row.get('FechaFinal')),
                        FechaPublicacion=self._parse_fecha(row.get('FechaPublicacion')),
                        FechaAdjudicacion=self._parse_fecha(row.get('FechaAdjudicacion')),
                        FechaEstimadaAdjudicacion=self._parse_fecha(row.get('FechaEstimadaAdjudicacion')),
                        Moneda=row.get('Moneda'),
                        MontoEstimado=self._parse_float(row.get('MontoEstimado')),
                        FuenteFinanciamiento=row.get('FuenteFinanciamiento'),
                        TiempoDuracionContrato=self._parse_int(row.get('TiempoDuracionContrato')),
                        UnidadTiempoDuracion=self._parse_int(row.get('UnidadTiempoDuracion')),
                        TipoDuracionContrato=row.get('TipoDuracionContrato'),
                        EsRenovable=(row.get('EsRenovable') == '1'),
                        ValorTiempoRenovacion=self._parse_int(row.get('ValorTiempoRenovacion')),
                        PeriodoTiempoRenovacion=row.get('PeriodoTiempoRenovacion'),
                        Adj_Tipo=self._parse_int(row.get('Adj_Tipo')),
                        Adj_Fecha=self._parse_fecha(row.get('Adj_Fecha')),
                        Adj_Numero=row.get('Adj_Numero'),
                        Adj_NumeroOferentes=self._parse_int(row.get('Adj_NumeroOferentes')),
                        Adj_UrlActa=row.get('Adj_UrlActa'),
                    ))
                except Exception as e:
                    errores += 1
                    self.stdout.write(self.style.WARNING(
                        f'Error en Licitacion {codigo}: {e}'
                    ))

        Licitacion.objects.bulk_create(licitaciones, ignore_conflicts=True)
        self.stdout.write(self.style.SUCCESS(
            f'Licitaciones importadas: {len(licitaciones)} OK, {errores} errores.'
        ))

    def _importar_detalles(self, path):
        self.stdout.write('Importando Detalles...')
        detalles = []
        errores = 0

        with open(path, newline='', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                codigo_lic = row.get('CodigoLicitacion', '').strip()
                if not codigo_lic:
                    continue
                try:
                    lic = Licitacion.objects.filter(codigo_licitacion=codigo_lic).first()
                    if not lic:
                        continue
                    detalles.append(DetalleLicitacion(
                        licitacion=lic,
                        Correlativo=self._parse_int(row.get('Correlativo')),
                        CodigoProducto=row.get('CodigoProducto'),
                        CodigoCategoria=row.get('CodigoCategoria'),
                        Categoria=row.get('Categoria'),
                        NombreProducto=row.get('NombreProducto'),
                        DescripcionItem=row.get('DescripcionItem'),
                        UnidadMedida=row.get('UnidadMedida'),
                        Cantidad=self._parse_float(row.get('Cantidad')),
                        RutGanador=row.get('RutGanador'),
                        NombreGanador=row.get('NombreGanador'),
                        MontoUnitarioGanador=self._parse_float(row.get('MontoUnitarioGanador')),
                        CantidadAdjudicada=self._parse_float(row.get('CantidadAdjudicada')),
                    ))
                except Exception as e:
                    errores += 1
                    self.stdout.write(self.style.WARNING(
                        f'Error en Detalle (licitacion={codigo_lic}): {e}'
                    ))

        DetalleLicitacion.objects.bulk_create(detalles, ignore_conflicts=True)
        self.stdout.write(self.style.SUCCESS(
            f'Detalles importados: {len(detalles)} OK, {errores} errores.'
        ))
