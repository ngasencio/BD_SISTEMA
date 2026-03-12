from rest_framework import serializers
from .models import Licitacion, DetalleLicitacion, Devengo, OrdenCompra, DetalleOrdenCompra


class DetalleLicitacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DetalleLicitacion
        fields = [
            'id', 'licitacion', 'Correlativo', 'CodigoProducto', 'CodigoCategoria',
            'Categoria', 'NombreProducto', 'DescripcionItem', 'UnidadMedida',
            'Cantidad', 'RutGanador', 'NombreGanador', 'MontoUnitarioGanador',
            'CantidadAdjudicada',
        ]


class LicitacionSerializer(serializers.ModelSerializer):
    detalles = DetalleLicitacionSerializer(many=True, read_only=True)

    class Meta:
        model = Licitacion
        fields = [
            'codigo_licitacion', 'Numero', 'Nombre', 'CodigoEstado', 'Estado',
            'Descripcion', 'Tipo', 'CodigoTipo', 'Etapas', 'EstadoEtapas',
            'C_CodigoOrganismo', 'C_NombreOrganismo', 'C_Unidad', 'C_ComunaUnidad',
            'C_RegionUnidad', 'C_Usuario',
            'FechaCreacion', 'FechaCierre', 'FechaPublicacion', 'FechaAdjudicacion',
            'Moneda', 'MontoEstimado', 'FuenteFinanciamiento',
            'TiempoDuracionContrato', 'TipoDuracionContrato', 'EsRenovable',
            'Adj_Tipo', 'Adj_Fecha', 'Adj_Numero', 'Adj_NumeroOferentes', 'Adj_UrlActa',
            'detalles',
        ]


class DevengoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Devengo
        fields = [
            'id', 'codigo_ue', 'folio', 'titulo', 'tipo_presupuesto',
            'moneda_presupuestaria', 'principal', 'principal_relacionado',
            'moneda_documento', 'tipo_cambio', 'tipo_documento', 'numero_documento',
            'fecha_documento', 'fecha_conforme', 'id_chile_compra', 'fecha_ingreso',
            'catalogo_01', 'catalogo_02', 'catalogo_03', 'catalogo_04', 'catalogo_05',
            'concepto_presupuestario', 'monto_vigente', 'monto_disponible',
            'monto_consumido', 'archivo_origen',
        ]


class DetalleOrdenCompraSerializer(serializers.ModelSerializer):
    class Meta:
        model = DetalleOrdenCompra
        fields = [
            'id', 'orden_compra', 'Correlativo', 'CodigoCategoria', 'Categoria',
            'CodigoProducto', 'Producto', 'EspecificacionComprador',
            'EspecificacionProveedor', 'Cantidad', 'Unidad', 'PrecioNeto',
            'TotalImpuestos', 'TotalLinea',
        ]


class OrdenCompraSerializer(serializers.ModelSerializer):
    detalles = DetalleOrdenCompraSerializer(many=True, read_only=True)

    class Meta:
        model = OrdenCompra
        fields = [
            'codigo_oc', 'NombreOC', 'CodigoEstado', 'EstadoOC', 'CodigoLicitacion',
            'TipoOC', 'TipoMoneda', 'Financiamiento', 'FormaPago',
            'FechaCreacion', 'FechaEnvio', 'FechaAceptacion', 'FechaCancelacion',
            'FechaUltimaModificacion',
            'TotalNeto', 'PorcentajeIva', 'Impuestos', 'TotalBruto',
            'C_CodigoUnidad', 'C_Unidad', 'C_RutUnidad', 'C_Region',
            'P_Codigo', 'P_Nombre', 'P_Rut', 'P_Region',
            'DescripcionOC', 'LinkMP',
            'detalles',
        ]
