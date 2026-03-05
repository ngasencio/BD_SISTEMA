import csv
import os
from dateutil import parser
from django.core.management.base import BaseCommand
from api.models import Licitacion, DetalleLicitacion
from django.conf import settings

class Command(BaseCommand):
    help = 'Importar datos de CSV de Licitaciones y Detalles a la base de datos'

    def handle(self, *args, **kwargs):
        resumen_path = r'c:\Users\usuario\Desktop\BD_SISTEMA\LICITACION_SSO_20260302_RESUMEN.csv'
        detalles_path = r'c:\Users\usuario\Desktop\BD_SISTEMA\LICITACION_SSO_20260302_DETALLES.csv'

        if not os.path.exists(resumen_path) or not os.path.exists(detalles_path):
            self.stdout.write(self.style.ERROR('No se encontraron los archivos CSV.'))
            return

        # Importar Licitacion
        self.stdout.write('Importando Licitaciones...')
        with open(resumen_path, newline='', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile, delimiter=';')
            licitaciones = []
            for row in reader:
                try:
                    lic = Licitacion(
                        CodigoLicitacion=row.get('CodigoLicitacion', ''),
                        Numero=row.get('Numero', None),
                        Nombre=row.get('Nombre', None),
                        CodigoEstado=int(row.get('CodigoEstado')) if row.get('CodigoEstado') else None,
                        Estado=row.get('Estado', None),
                        Descripcion=row.get('Descripcion', None),
                        Tipo=row.get('Tipo', None),
                        CodigoTipo=int(row.get('CodigoTipo')) if row.get('CodigoTipo') else None,
                        Etapas=int(row.get('Etapas')) if row.get('Etapas') else None,
                        EstadoEtapas=row.get('EstadoEtapas', None),
                        C_CodigoOrganismo=row.get('C_CodigoOrganismo', None),
                        C_NombreOrganismo=row.get('C_NombreOrganismo', None),
                        C_RutUnidad=row.get('C_RutUnidad', None),
                        C_CodigoUnidad=row.get('C_CodigoUnidad', None),
                        C_Unidad=row.get('C_Unidad', None),
                        C_DireccionUnidad=row.get('C_DireccionUnidad', None),
                        C_ComunaUnidad=row.get('C_ComunaUnidad', None),
                        C_RegionUnidad=row.get('C_RegionUnidad', None),
                        C_RutUsuario=row.get('C_RutUsuario', None),
                        C_CodigoUsuario=row.get('C_CodigoUsuario', None),
                        C_Usuario=row.get('C_Usuario', None),
                        C_Cargo=row.get('C_Cargo', None),
                        FechaCreacion=parser.parse(row['FechaCreacion']) if row.get('FechaCreacion') else None,
                        FechaCierre=parser.parse(row['FechaCierre']) if row.get('FechaCierre') else None,
                        FechaInicio=parser.parse(row['FechaInicio']) if row.get('FechaInicio') else None,
                        FechaFinal=parser.parse(row['FechaFinal']) if row.get('FechaFinal') else None,
                        FechaPublicacion=parser.parse(row['FechaPublicacion']) if row.get('FechaPublicacion') else None,
                        FechaAdjudicacion=parser.parse(row['FechaAdjudicacion']) if row.get('FechaAdjudicacion') else None,
                        FechaEstimadaAdjudicacion=parser.parse(row['FechaEstimadaAdjudicacion']) if row.get('FechaEstimadaAdjudicacion') else None,
                        Moneda=row.get('Moneda', None),
                        MontoEstimado=float(row['MontoEstimado'].replace(',', '.')) if row.get('MontoEstimado') else None,
                        FuenteFinanciamiento=row.get('FuenteFinanciamiento', None),
                        TiempoDuracionContrato=int(row['TiempoDuracionContrato']) if row.get('TiempoDuracionContrato') else None,
                        UnidadTiempoDuracion=int(row['UnidadTiempoDuracion']) if row.get('UnidadTiempoDuracion') else None,
                        TipoDuracionContrato=row.get('TipoDuracionContrato', None),
                        EsRenovable=(row.get('EsRenovable') == '1'),
                        ValorTiempoRenovacion=int(row['ValorTiempoRenovacion']) if row.get('ValorTiempoRenovacion') else None,
                        PeriodoTiempoRenovacion=row.get('PeriodoTiempoRenovacion', None),
                        Adj_Tipo=int(row['Adj_Tipo']) if row.get('Adj_Tipo') else None,
                        Adj_Fecha=parser.parse(row['Adj_Fecha']) if row.get('Adj_Fecha') else None,
                        Adj_Numero=row.get('Adj_Numero', None),
                        Adj_NumeroOferentes=int(row['Adj_NumeroOferentes']) if row.get('Adj_NumeroOferentes') else None,
                        Adj_UrlActa=row.get('Adj_UrlActa', None),
                    )
                    licitaciones.append(lic)
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f"Error procesando Licitacion {row.get('CodigoLicitacion')}: {e}"))
            
            Licitacion.objects.bulk_create(licitaciones, ignore_conflicts=True)
            self.stdout.write(self.style.SUCCESS(f'Importadas {len(licitaciones)} licitaciones.'))

        # Importar Detalles
        self.stdout.write('Importando Detalles...')
        with open(detalles_path, newline='', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile, delimiter=';')
            detalles = []
            for row in reader:
                try:
                    lic = Licitacion.objects.filter(CodigoLicitacion=row.get('CodigoLicitacion')).first()
                    if lic:
                        det = DetalleLicitacion(
                            CodigoLicitacion=lic,
                            Correlativo=int(row['Correlativo']) if row.get('Correlativo') else None,
                            CodigoProducto=row.get('CodigoProducto', None),
                            CodigoCategoria=row.get('CodigoCategoria', None),
                            Categoria=row.get('Categoria', None),
                            NombreProducto=row.get('NombreProducto', None),
                            DescripcionItem=row.get('DescripcionItem', None),
                            UnidadMedida=row.get('UnidadMedida', None),
                            Cantidad=float(row['Cantidad'].replace(',', '.')) if row.get('Cantidad') else None,
                            RutGanador=row.get('RutGanador', None),
                            NombreGanador=row.get('NombreGanador', None),
                            MontoUnitarioGanador=float(row['MontoUnitarioGanador'].replace(',', '.')) if row.get('MontoUnitarioGanador') else None,
                            CantidadAdjudicada=float(row['CantidadAdjudicada'].replace(',', '.')) if row.get('CantidadAdjudicada') else None,
                        )
                        detalles.append(det)
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f"Error procesando Detalle {row.get('CodigoProducto')}: {e}"))
            
            DetalleLicitacion.objects.bulk_create(detalles, ignore_conflicts=True)
            self.stdout.write(self.style.SUCCESS(f'Importados {len(detalles)} detalles.'))
            
        # Create a superuser for demo
        from django.contrib.auth.models import User
        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser('admin', 'admin@example.com', 'admin')
            self.stdout.write(self.style.SUCCESS('Superuser admin/admin created.'))

