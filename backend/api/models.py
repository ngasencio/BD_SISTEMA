from django.db import models

class Licitacion(models.Model):
    # Códigos
    codigo_licitacion = models.CharField(max_length=255, primary_key=True, db_column='CodigoLicitacion')
    Numero = models.CharField(max_length=255, blank=True, default='', db_column='Numero')
    Nombre = models.TextField(null=True, blank=True)
    CodigoEstado = models.IntegerField(null=True, blank=True)
    Estado = models.CharField(max_length=255, null=True, blank=True)
    Descripcion = models.TextField(null=True, blank=True)
    Tipo = models.CharField(max_length=255, null=True, blank=True)
    CodigoTipo = models.IntegerField(null=True, blank=True)
    
    # Etapas
    Etapas = models.IntegerField(null=True, blank=True)
    EstadoEtapas = models.CharField(max_length=255, null=True, blank=True)
    
    # Organismo
    C_CodigoOrganismo = models.CharField(max_length=255, null=True, blank=True)
    C_NombreOrganismo = models.CharField(max_length=255, null=True, blank=True)
    
    # Unidad
    C_RutUnidad = models.CharField(max_length=255, null=True, blank=True)
    C_CodigoUnidad = models.CharField(max_length=255, null=True, blank=True)
    C_Unidad = models.CharField(max_length=255, null=True, blank=True)
    C_DireccionUnidad = models.TextField(null=True, blank=True)
    C_ComunaUnidad = models.CharField(max_length=255, null=True, blank=True)
    C_RegionUnidad = models.CharField(max_length=255, null=True, blank=True)
    
    # Usuario/Contacto
    C_RutUsuario = models.CharField(max_length=255, null=True, blank=True)
    C_CodigoUsuario = models.CharField(max_length=255, null=True, blank=True)
    C_Usuario = models.CharField(max_length=255, null=True, blank=True)
    C_Cargo = models.CharField(max_length=255, null=True, blank=True)
    
    # Fechas
    FechaCreacion = models.DateTimeField(null=True, blank=True)
    FechaCierre = models.DateTimeField(null=True, blank=True)
    FechaInicio = models.DateTimeField(null=True, blank=True)
    FechaFinal = models.DateTimeField(null=True, blank=True)
    FechaPublicacion = models.DateTimeField(null=True, blank=True)
    FechaAdjudicacion = models.DateTimeField(null=True, blank=True)
    FechaEstimadaAdjudicacion = models.DateTimeField(null=True, blank=True)
    
    # Montos y Moneda
    Moneda = models.CharField(max_length=50, null=True, blank=True)
    MontoEstimado = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    FuenteFinanciamiento = models.CharField(max_length=255, null=True, blank=True)
    
    # Términos Contractuales
    TiempoDuracionContrato = models.IntegerField(null=True, blank=True)
    UnidadTiempoDuracion = models.IntegerField(null=True, blank=True)
    TipoDuracionContrato = models.CharField(max_length=255, null=True, blank=True)
    EsRenovable = models.BooleanField(default=False)
    ValorTiempoRenovacion = models.IntegerField(null=True, blank=True)
    PeriodoTiempoRenovacion = models.CharField(max_length=255, null=True, blank=True)
    
    # Adjudicación
    Adj_Tipo = models.IntegerField(null=True, blank=True)
    Adj_Fecha = models.DateTimeField(null=True, blank=True)
    Adj_Numero = models.CharField(max_length=255, null=True, blank=True)
    Adj_NumeroOferentes = models.IntegerField(null=True, blank=True)
    Adj_UrlActa = models.URLField(max_length=2000, null=True, blank=True)

    def __str__(self):
        return f"{self.codigo_licitacion} - {self.Nombre}"


class DetalleLicitacion(models.Model):
    licitacion = models.ForeignKey(Licitacion, on_delete=models.CASCADE, related_name="detalles", db_column="CodigoLicitacion_id")
    Correlativo = models.IntegerField(null=True, blank=True)
    CodigoProducto = models.CharField(max_length=255, null=True, blank=True)
    CodigoCategoria = models.CharField(max_length=255, null=True, blank=True)
    Categoria = models.TextField(null=True, blank=True)
    NombreProducto = models.TextField(null=True, blank=True)
    DescripcionItem = models.TextField(null=True, blank=True)
    UnidadMedida = models.CharField(max_length=255, null=True, blank=True)
    Cantidad = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    RutGanador = models.CharField(max_length=255, null=True, blank=True)
    NombreGanador = models.CharField(max_length=255, null=True, blank=True)
    MontoUnitarioGanador = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    CantidadAdjudicada = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f"{self.licitacion.codigo_licitacion} - {self.CodigoProducto}"


class Devengo(models.Model):
    """Modelo para registros de devengo — Control de Deuda (Anexo N°3)"""
    codigo_ue = models.CharField('Código Unidad Ejecutora', max_length=255)
    folio = models.CharField('Folio', max_length=100, null=True, blank=True)
    titulo = models.CharField('Título', max_length=500, null=True, blank=True)
    tipo_presupuesto = models.CharField('Tipo Presupuesto', max_length=255, null=True, blank=True)
    moneda_presupuestaria = models.CharField('Moneda Presupuestaria', max_length=100, null=True, blank=True)
    principal = models.CharField('Principal (Proveedor)', max_length=500, null=True, blank=True)
    principal_relacionado = models.CharField('Principal Relacionado', max_length=500, null=True, blank=True)
    moneda_documento = models.CharField('Moneda Documento', max_length=100, null=True, blank=True)
    tipo_cambio = models.DecimalField('Tipo Cambio', max_digits=12, decimal_places=4, null=True, blank=True)
    tipo_documento = models.CharField('Tipo Documento', max_length=255, null=True, blank=True)
    numero_documento = models.CharField('Número Documento', max_length=255, null=True, blank=True)
    fecha_documento = models.DateField('Fecha Documento', null=True, blank=True)
    fecha_conforme = models.DateField('Fecha Conforme', null=True, blank=True)
    id_chile_compra = models.CharField('Id Chile Compra', max_length=255, null=True, blank=True)
    fecha_ingreso = models.DateField('Fecha Ingreso/Recepción', null=True, blank=True)
    catalogo_01 = models.CharField('Catálogo 01', max_length=500, null=True, blank=True)
    catalogo_02 = models.CharField('Catálogo 02', max_length=500, null=True, blank=True)
    catalogo_03 = models.CharField('Catálogo 03', max_length=500, null=True, blank=True)
    catalogo_04 = models.CharField('Catálogo 04', max_length=500, null=True, blank=True)
    catalogo_05 = models.CharField('Catálogo 05', max_length=500, null=True, blank=True)
    concepto_presupuestario = models.CharField('Concepto Presupuestario', max_length=500, null=True, blank=True)
    monto_vigente = models.DecimalField('Monto Vigente', max_digits=20, decimal_places=2, default=0)
    monto_disponible = models.DecimalField('Monto Disponible', max_digits=20, decimal_places=2, default=0)
    monto_consumido = models.DecimalField('Monto Consumido', max_digits=20, decimal_places=2, default=0)
    archivo_origen = models.CharField('Archivo Origen', max_length=500, null=True, blank=True)

    class Meta:
        db_table = 'devengo'
        verbose_name = 'Devengo'
        verbose_name_plural = 'Devengos'
        ordering = ['-monto_disponible']
        indexes = [
            models.Index(fields=['-monto_disponible']),
            models.Index(fields=['codigo_ue']),
            models.Index(fields=['principal']),
            models.Index(fields=['tipo_documento']),
            models.Index(fields=['concepto_presupuestario']),
            models.Index(fields=['codigo_ue', '-monto_disponible']),
        ]

    def __str__(self):
        return f"{self.codigo_ue} - {self.principal} - ${self.monto_disponible}"


class OrdenCompra(models.Model):
    codigo_oc = models.CharField(max_length=255, primary_key=True, db_column='CodigoOC')
    NombreOC = models.TextField(null=True, blank=True)
    CodigoEstado = models.IntegerField(null=True, blank=True)
    EstadoOC = models.CharField(max_length=255, null=True, blank=True)
    CodigoLicitacion = models.CharField(max_length=255, null=True, blank=True)
    TipoOC = models.CharField(max_length=255, null=True, blank=True)
    TipoMoneda = models.CharField(max_length=50, null=True, blank=True)
    Financiamiento = models.CharField(max_length=255, null=True, blank=True)
    FormaPago = models.CharField(max_length=255, null=True, blank=True)
    TipoDespacho = models.CharField(max_length=255, null=True, blank=True)
    Pais = models.CharField(max_length=255, null=True, blank=True)
    
    # Fechas
    FechaCreacion = models.DateTimeField(null=True, blank=True)
    FechaEnvio = models.DateTimeField(null=True, blank=True)
    FechaAceptacion = models.DateTimeField(null=True, blank=True)
    FechaCancelacion = models.DateTimeField(null=True, blank=True)
    FechaUltimaModificacion = models.DateTimeField(null=True, blank=True)
    
    # Evaluacion
    PromedioCalificacion = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    CantidadEvaluacion = models.IntegerField(null=True, blank=True)
    
    # Montos
    TotalNeto = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    PorcentajeIva = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    Impuestos = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    TotalBruto = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True, db_column='Total')
    
    # Comprador
    C_CodigoUnidad = models.CharField(max_length=255, null=True, blank=True)
    C_Unidad = models.CharField(max_length=255, null=True, blank=True)
    C_RutUnidad = models.CharField(max_length=50, null=True, blank=True)
    C_Actividad = models.CharField(max_length=255, null=True, blank=True)
    C_Direccion = models.TextField(null=True, blank=True)
    C_Comuna = models.CharField(max_length=255, null=True, blank=True)
    C_Region = models.CharField(max_length=255, null=True, blank=True)
    C_Contacto = models.CharField(max_length=255, null=True, blank=True)
    C_Cargo = models.CharField(max_length=255, null=True, blank=True)
    C_Email = models.CharField(max_length=255, null=True, blank=True)
    
    # Proveedor
    P_Codigo = models.CharField(max_length=255, null=True, blank=True)
    P_Nombre = models.CharField(max_length=255, null=True, blank=True)
    P_Rut = models.CharField(max_length=50, null=True, blank=True)
    P_Actividad = models.TextField(null=True, blank=True)
    P_Direccion = models.TextField(null=True, blank=True)
    P_Comuna = models.CharField(max_length=255, null=True, blank=True)
    P_Region = models.CharField(max_length=255, null=True, blank=True)
    P_Contacto = models.CharField(max_length=255, null=True, blank=True)
    P_Cargo = models.CharField(max_length=255, null=True, blank=True)
    P_Email = models.CharField(max_length=255, null=True, blank=True)
    
    DescripcionOC = models.TextField(null=True, blank=True)
    
    class Meta:
        db_table = 'api_ordencompra'

    def __str__(self):
        return f"{self.codigo_oc} - {self.NombreOC}"

class DetalleOrdenCompra(models.Model):
    orden_compra = models.ForeignKey(OrdenCompra, on_delete=models.CASCADE, related_name="detalles", db_column="CodigoOC_id")
    Correlativo = models.IntegerField(null=True, blank=True)
    CodigoCategoria = models.CharField(max_length=255, null=True, blank=True)
    Categoria = models.TextField(null=True, blank=True)
    CodigoProducto = models.CharField(max_length=255, null=True, blank=True)
    Producto = models.TextField(null=True, blank=True)
    EspecificacionComprador = models.TextField(null=True, blank=True)
    EspecificacionProveedor = models.TextField(null=True, blank=True)
    Cantidad = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    Unidad = models.CharField(max_length=255, null=True, blank=True)
    PrecioNeto = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    TotalImpuestos = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    TotalLinea = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = 'api_detalleordencompra'

    def __str__(self):
        return f"{self.orden_compra.codigo_oc} - {self.CodigoProducto}"
