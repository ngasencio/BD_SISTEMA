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

    # Fechas adicionales del proceso
    FechaPubRespuestas          = models.DateTimeField(null=True, blank=True)
    FechaActoAperturaTecnica    = models.DateTimeField(null=True, blank=True)
    FechaActoAperturaEconomica  = models.DateTimeField(null=True, blank=True)
    FechaSoporteFisico          = models.DateTimeField(null=True, blank=True)
    FechaTiempoEvaluacion       = models.DateTimeField(null=True, blank=True)
    FechaEstimadaFirma          = models.DateTimeField(null=True, blank=True)
    FechaVisitaTerreno          = models.DateTimeField(null=True, blank=True)
    FechaEntregaAntecedentes    = models.DateTimeField(null=True, blank=True)
    FechaInicioContrato         = models.DateTimeField(null=True, blank=True)

    # Clasificación
    TipoConvocatoria = models.CharField(max_length=50, null=True, blank=True)

    # Detalle del proceso
    DiasCierreLicitacion    = models.IntegerField(null=True, blank=True)
    Informada               = models.IntegerField(null=True, blank=True)
    TomaRazon               = models.IntegerField(null=True, blank=True)
    EstadoPublicidadOfertas = models.IntegerField(null=True, blank=True)
    JustificacionPublicidad = models.TextField(null=True, blank=True)
    Contrato                = models.IntegerField(null=True, blank=True)
    Obras                   = models.IntegerField(null=True, blank=True)
    CantidadReclamos        = models.IntegerField(null=True, blank=True)
    UnidadTiempoEvaluacion  = models.IntegerField(null=True, blank=True)
    DireccionVisita         = models.TextField(null=True, blank=True)
    DireccionEntrega        = models.TextField(null=True, blank=True)
    Estimacion              = models.IntegerField(null=True, blank=True)
    VisibilidadMonto        = models.IntegerField(null=True, blank=True)
    JustificacionMonto      = models.TextField(null=True, blank=True)
    Tiempo                  = models.IntegerField(null=True, blank=True)
    UnidadTiempo            = models.IntegerField(null=True, blank=True)
    Modalidad               = models.CharField(max_length=255, null=True, blank=True)
    TipoPago                = models.IntegerField(null=True, blank=True)
    ObservacionContract     = models.TextField(null=True, blank=True)
    CodigoBIP               = models.CharField(max_length=255, null=True, blank=True)

    # Responsables
    Resp_Pago       = models.CharField(max_length=255, null=True, blank=True)
    Resp_Email_Pago = models.CharField(max_length=255, null=True, blank=True)
    Resp_Contrato   = models.CharField(max_length=255, null=True, blank=True)
    Resp_Email      = models.CharField(max_length=255, null=True, blank=True)
    Resp_Fono       = models.CharField(max_length=255, null=True, blank=True)

    # Condiciones de contratación
    ProhibicionContratacion       = models.IntegerField(null=True, blank=True)
    SubContratacion               = models.IntegerField(null=True, blank=True)
    ExtensionPlazo                = models.IntegerField(null=True, blank=True)
    EsBaseTipo                    = models.IntegerField(null=True, blank=True)
    UnidadTiempoContratoLicitacion = models.IntegerField(null=True, blank=True)

    # Columnas descriptivas (decodificación de códigos Mercado Público)
    DescripcionTipoLicitacion     = models.CharField(max_length=255, null=True, blank=True)
    DescripcionMoneda             = models.CharField(max_length=100, null=True, blank=True)
    DescripcionTipoConvocatoria   = models.CharField(max_length=100, null=True, blank=True)
    DescripcionEstimacion         = models.CharField(max_length=100, null=True, blank=True)
    DescripcionTipoPago           = models.CharField(max_length=255, null=True, blank=True)
    DescripcionUnidadTiempoEval   = models.CharField(max_length=100, null=True, blank=True)
    DescripcionUnidadTiempoDuracion = models.CharField(max_length=100, null=True, blank=True)
    DescripcionAdjTipo            = models.CharField(max_length=100, null=True, blank=True)
    Informada_Desc      = models.CharField(max_length=10, null=True, blank=True)
    TomaRazon_Desc      = models.CharField(max_length=10, null=True, blank=True)
    Contrato_Desc       = models.CharField(max_length=10, null=True, blank=True)
    Obras_Desc          = models.CharField(max_length=10, null=True, blank=True)
    VisibilidadMonto_Desc   = models.CharField(max_length=10, null=True, blank=True)
    SubContratacion_Desc    = models.CharField(max_length=10, null=True, blank=True)
    ExtensionPlazo_Desc     = models.CharField(max_length=10, null=True, blank=True)
    EsBaseTipo_Desc         = models.CharField(max_length=10, null=True, blank=True)
    EsRenovable_Desc        = models.CharField(max_length=10, null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['Estado'],           name='idx_li_estado'),
            models.Index(fields=['Tipo'],             name='idx_li_tipo'),
            models.Index(fields=['FechaPublicacion'], name='idx_li_fecha_pub'),
            models.Index(fields=['C_NombreOrganismo'],name='idx_li_organismo'),
        ]

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
    
    # Nuevas Columnas Agregadas
    LinkMP = models.URLField(max_length=500, null=True, blank=True)
    EnlacePAC = models.CharField(max_length=255, null=True, blank=True)
    ID_Proyecto = models.CharField(max_length=255, null=True, blank=True, db_column='ID_Proyecto')
    Nombre_Proyecto = models.CharField(max_length=500, null=True, blank=True)
    CodigoCompraAgil = models.CharField(max_length=100, null=True, blank=True)
    TipoCompraInterna = models.CharField(max_length=100, null=True, blank=True)
    TipoOCInterno = models.CharField(max_length=100, null=True, blank=True)

    # Columnas descriptivas (decodificación de códigos Mercado Público)
    DescripcionTipoOC    = models.CharField(max_length=255, null=True, blank=True)
    DescripcionMoneda    = models.CharField(max_length=100, null=True, blank=True)
    DescripcionDespacho  = models.CharField(max_length=255, null=True, blank=True)
    DescripcionFormaPago = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = 'api_ordencompra'
        indexes = [
            models.Index(fields=['EstadoOC'],          name='idx_oc_estado'),
            models.Index(fields=['FechaEnvio'],         name='idx_oc_fecha_envio'),
            models.Index(fields=['C_Unidad'],           name='idx_oc_unidad'),
            models.Index(fields=['EnlacePAC'],          name='idx_oc_enlace_pac'),
            models.Index(fields=['CodigoLicitacion'],   name='idx_oc_cod_licitacion'),
            models.Index(fields=['EstadoOC', 'FechaEnvio'], name='idx_oc_estado_fecha'),
        ]

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


class Anexo1(models.Model):
    """Modelo para consolidado de Anexo 1"""
    nivel = models.CharField(max_length=50, null=True, blank=True)
    concepto_presupuestario = models.CharField(max_length=255, null=True, blank=True)
    ley_presupuestos = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    requerimiento = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    col_4 = models.CharField(max_length=255, null=True, blank=True)
    saldo_por_devengar = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    efectivo = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    deuda_flotante = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    ruta_jerarquica = models.TextField(null=True, blank=True)
    establecimiento = models.CharField(max_length=255, null=True, blank=True)
    fecha = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'tabla_anexo1'
        verbose_name = 'Anexo 1'
        verbose_name_plural = 'Anexos 1'

    def __str__(self):
        return f"{self.establecimiento} - {self.concepto_presupuestario} ({self.fecha})"


class SigfeAnexo1(models.Model):
    """Estado de Ejecución Presupuestaria - Anexo N°1, descargado por establecimiento y
    mes vía Selenium (api/data/data_anexo1/Sigfe_Descargas_Estado_ejecucion_presupuestaria.py)
    y consolidado con api/data/data_anexo1/consolidar_anexo1_sigfe.py.

    Reemplaza a Anexo1/tabla_anexo1 para datos nuevos (ese modelo queda intacto, sin
    relación, solo como respaldo histórico DSSO/HBO cargado a mano).

    A diferencia de Anexo1 (DELETE total + bulk_create), la sincronización acá es
    incremental por tramo: se borra e inserta solo el conjunto (codigo_ue, anho, mes)
    del archivo procesado, así reprocesar un mes no borra los demás.
    """
    codigo_ue = models.CharField('Código Unidad Ejecutora', max_length=20, db_index=True)
    nombre_establecimiento = models.CharField('Establecimiento', max_length=255)
    anho = models.IntegerField('Año', db_index=True)
    mes = models.IntegerField('Mes (1-12)', db_index=True)
    fecha_desde_tramo = models.DateField('Fecha Desde (tramo descargado)')
    fecha_hasta_tramo = models.DateField('Fecha Hasta (tramo descargado)')

    nivel = models.IntegerField('Nivel', null=True, blank=True)
    concepto_presupuestario = models.CharField('Concepto Presupuestario', max_length=500, null=True, blank=True)
    nivel_cruce = models.CharField('Nivel Cruce', max_length=100, null=True, blank=True)
    catalogo_cruce = models.CharField('Catálogo Cruce', max_length=500, null=True, blank=True)
    ruta_jerarquica = models.TextField('Ruta Jerárquica', null=True, blank=True)

    ley_presupuestos = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    requerimiento = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    saldo_por_aplicar = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    compromiso = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    saldo_por_comprometer = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    devengado = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    saldo_por_devengar = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    efectivo = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    deuda_flotante = models.DecimalField(max_digits=20, decimal_places=2, default=0)

    archivo_origen = models.CharField('Archivo Origen', max_length=500, null=True, blank=True)
    fecha_sync = models.DateTimeField('Última sincronización', auto_now=True)

    class Meta:
        db_table = 'api_sigfe_anexo1'
        verbose_name = 'SIGFE Anexo N°1'
        verbose_name_plural = 'SIGFE Anexo N°1'
        indexes = [
            models.Index(fields=['codigo_ue', 'anho', 'mes'], name='idx_sigfe_anexo1_ue_anho_mes'),
        ]

    def __str__(self):
        return f"{self.codigo_ue} {self.anho}-{self.mes:02d} - {self.concepto_presupuestario}"


# =============================================================================
# Módulo de Garantías — Registro de Boletas
# =============================================================================

BANCO_CHOICES = [
    ('Banco de Chile', 'Banco de Chile'),
    ('Santander-Chile', 'Santander-Chile'),
    ('BCI', 'BCI'),
    ('Scotiabank', 'Scotiabank'),
    ('Itau', 'Itau'),
    ('BICE', 'BICE'),
    ('Falabella', 'Falabella'),
    ('Ripley', 'Ripley'),
    ('Consorcio', 'Consorcio'),
    ('BTG Pactual', 'BTG Pactual'),
]

TIPO_DOC_CHOICES = [
    ('Boleta De Garantia', 'Boleta De Garantía'),
    ('Certificado De Fianza', 'Certificado De Fianza'),
    ('Poliza De Seguro', 'Póliza De Seguro'),
]

FORMATO_DOC_CHOICES = [
    ('Fisica', 'Física'),
    ('Electronica', 'Electrónica'),
]


class Proveedor(models.Model):
    """Tabla de proveedores del módulo de garantías (T_Proveedores)."""
    rut = models.CharField('RUT', max_length=20, primary_key=True)
    nombre = models.CharField('Nombre / Razón Social', max_length=255)

    class Meta:
        db_table = 'T_Proveedores'
        verbose_name = 'Proveedor'
        verbose_name_plural = 'Proveedores'
        ordering = ['nombre']

    def __str__(self):
        return f"{self.rut} — {self.nombre}"


class Comprador(models.Model):
    """Tabla de compradores del módulo de garantías (T_Comprador)."""
    nombre = models.CharField('Nombre', max_length=255)

    class Meta:
        db_table = 'T_Comprador'
        verbose_name = 'Comprador'
        verbose_name_plural = 'Compradores'
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class BoletaGarantia(models.Model):
    """Registro de Boletas / Garantías — tabla principal T_BoletaGarantia."""

    # Período (primer día del mes; se muestra como YYYY-MM en el frontend)
    mes_anio = models.DateField('Mes/Año')

    # Identificación del documento
    tipo_documento = models.CharField('Tipo de Documento', max_length=50, choices=TIPO_DOC_CHOICES)
    formato_documento = models.CharField('Formato Documento', max_length=20, choices=FORMATO_DOC_CHOICES)
    numero_documento = models.CharField('N° Documento', max_length=100)

    # Datos principales
    fecha_emision = models.DateField('Fecha Emisión de Documento')
    monto = models.DecimalField('Monto', max_digits=18, decimal_places=2)
    proveedor = models.ForeignKey(
        Proveedor, on_delete=models.PROTECT, related_name='boletas', verbose_name='Proveedor'
    )
    banco = models.CharField('Banco', max_length=50, choices=BANCO_CHOICES)

    # Licitación relacionada
    id_licitacion = models.CharField('ID Licitación', max_length=100, blank=True, default='')
    nombre_licitacion = models.TextField('Nombre Licitación', blank=True, default='')

    # Comprador responsable
    comprador = models.ForeignKey(
        Comprador, on_delete=models.PROTECT, related_name='boletas', verbose_name='Comprador'
    )

    # Fechas de proceso interno
    vigencia_garantia = models.DateField('Vigencia de Garantía')
    fecha_derivacion_abastecimiento = models.DateField(
        'Fecha Derivación a Abastecimiento', null=True, blank=True
    )
    depto_finanzas = models.DateField('Depto. Finanzas', null=True, blank=True)
    numero_memo = models.CharField('N° Memo Depto. Abast. Y Op.', max_length=100, blank=True, default='')
    fecha_despacho_finanzas = models.DateField('Fecha Despacho a Finanzas', null=True, blank=True)
    estado_trazabilidad = models.CharField('Estado Trazabilidad', max_length=50, blank=True, default='')

    # Archivo adjunto (Excel, Word o RAR)
    adjunto = models.FileField('Archivo Adjunto', upload_to='boletas/adjuntos/', null=True, blank=True)

    # Auditoría de registro
    creado_por = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='boletas_creadas', verbose_name='Creado por'
    )
    created_at = models.DateTimeField('Creado en', auto_now_add=True)
    updated_at = models.DateTimeField('Actualizado en', auto_now=True)

    class Meta:
        db_table = 'T_BoletaGarantia'
        verbose_name = 'Boleta de Garantía'
        verbose_name_plural = 'Boletas de Garantía'
        ordering = ['-vigencia_garantia', '-fecha_emision']
        indexes = [
            models.Index(fields=['-vigencia_garantia']),
            models.Index(fields=['-fecha_emision']),
            models.Index(fields=['tipo_documento']),
        ]

    def __str__(self):
        return f"{self.numero_documento} — {self.proveedor}"


ACCION_AUDIT_CHOICES = [
    ('ELIMINAR', 'Eliminación'),
    ('MODIFICAR', 'Modificación'),
]


class BoletaGarantiaAudit(models.Model):
    """Historial de auditoría: registros modificados o eliminados de BoletaGarantia."""
    accion = models.CharField(
        'Acción', max_length=10,
        choices=ACCION_AUDIT_CHOICES, default='ELIMINAR',
    )
    boleta_id = models.IntegerField('ID Boleta')
    numero_documento = models.CharField('N° Documento', max_length=100)
    # Para ELIMINAR: snapshot contiene los datos al momento de borrar.
    # Para MODIFICAR: snapshot_antes = estado ANTES, snapshot = estado DESPUÉS.
    snapshot_antes = models.JSONField('Datos antes del cambio', null=True, blank=True)
    snapshot = models.JSONField('Datos después del cambio (o al eliminar)')
    eliminado_por = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True,
        related_name='boletas_eliminadas', verbose_name='Usuario',
    )
    eliminado_en = models.DateTimeField('Fecha acción', auto_now_add=True)
    razon = models.TextField('Razón / Observación', blank=True, default='')

    class Meta:
        db_table = 'T_BoletaGarantia_Audit'
        verbose_name = 'Auditoría Boleta'
        verbose_name_plural = 'Auditoría Boletas'
        ordering = ['-eliminado_en']

    def __str__(self):
        return f"Boleta #{self.boleta_id} — {self.accion} el {self.eliminado_en}"


# =============================================================================
# OC Total — Red SSO Completa (multi-organismo)
# Tablas: api_ordencompra_total / api_detalleordencompra_total
# =============================================================================

class OrdenCompraTot(models.Model):
    """OC Total: consolida toda la Red SSO (todos los organismos)."""
    codigo_oc = models.CharField(max_length=255, primary_key=True, db_column='CodigoOC')

    # Identificación del organismo (diferenciador multi-establecimiento)
    CodigoOrganismo = models.CharField(max_length=50, null=True, blank=True)
    NombreOrganismo = models.CharField(max_length=255, null=True, blank=True)

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

    FechaCreacion = models.DateTimeField(null=True, blank=True)
    FechaEnvio = models.DateTimeField(null=True, blank=True)
    FechaAceptacion = models.DateTimeField(null=True, blank=True)
    FechaCancelacion = models.DateTimeField(null=True, blank=True)
    FechaUltimaModificacion = models.DateTimeField(null=True, blank=True)

    PromedioCalificacion = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    CantidadEvaluacion = models.IntegerField(null=True, blank=True)

    TotalNeto = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    PorcentajeIva = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    Impuestos = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    TotalBruto = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True, db_column='Total')

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
    LinkMP = models.URLField(max_length=500, null=True, blank=True)
    EnlacePAC = models.CharField(max_length=255, null=True, blank=True)
    ID_Proyecto = models.CharField(max_length=255, null=True, blank=True, db_column='ID_Proyecto')
    Nombre_Proyecto = models.CharField(max_length=500, null=True, blank=True)
    CodigoCompraAgil = models.CharField(max_length=100, null=True, blank=True)
    TipoCompraInterna = models.CharField(max_length=100, null=True, blank=True)
    TipoOCInterno = models.CharField(max_length=100, null=True, blank=True)
    DescripcionTipoOC = models.CharField(max_length=255, null=True, blank=True)
    DescripcionMoneda = models.CharField(max_length=100, null=True, blank=True)
    DescripcionDespacho = models.CharField(max_length=255, null=True, blank=True)
    DescripcionFormaPago = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = 'api_ordencompra_total'

    def __str__(self):
        return f"{self.codigo_oc} - {self.NombreOC}"


class DetalleOrdenCompraTot(models.Model):
    """Detalle de OC Total — líneas de ítems de toda la Red SSO."""
    orden_compra = models.ForeignKey(OrdenCompraTot, on_delete=models.CASCADE, related_name="detalles", db_column="CodigoOC_id")
    CodigoOrganismo = models.CharField(max_length=50, null=True, blank=True)
    NombreOrganismo = models.CharField(max_length=255, null=True, blank=True)
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
        db_table = 'api_detalleordencompra_total'

    def __str__(self):
        return f"{self.orden_compra_id} - {self.CodigoProducto}"


class Factura(models.Model):
    tipo = models.SmallIntegerField(null=True, blank=True)
    tipo_documento = models.CharField(max_length=60, null=True, blank=True)
    folio = models.BigIntegerField(null=True, blank=True)
    emisor = models.CharField(max_length=30, null=True, blank=True)
    razon_social_emisor = models.CharField(max_length=200, null=True, blank=True)
    receptor = models.CharField(max_length=30, null=True, blank=True)
    publicacion = models.CharField(max_length=30, null=True, blank=True)
    emision = models.CharField(max_length=30, null=True, blank=True)
    monto_neto = models.BigIntegerField(null=True, blank=True)
    monto_exento = models.BigIntegerField(null=True, blank=True)
    monto_iva = models.BigIntegerField(null=True, blank=True)
    monto_total = models.BigIntegerField(null=True, blank=True)
    impuestos = models.TextField(null=True, blank=True)
    estado_acepta = models.CharField(max_length=100, null=True, blank=True)
    estado_sii = models.CharField(max_length=100, null=True, blank=True)
    estado_intercambio = models.CharField(max_length=100, null=True, blank=True)
    informacion_intercambio = models.TextField(null=True, blank=True)
    uri = models.TextField(null=True, blank=True)
    referencias = models.TextField(null=True, blank=True)
    fecha_nar = models.CharField(max_length=30, null=True, blank=True)
    estado_nar = models.CharField(max_length=100, null=True, blank=True)
    uri_nar = models.TextField(null=True, blank=True)
    mensaje_nar = models.TextField(null=True, blank=True)
    uri_arm = models.TextField(null=True, blank=True)
    fecha_arm = models.CharField(max_length=30, null=True, blank=True)
    fmapago = models.CharField(max_length=30, null=True, blank=True)
    dirrecep = models.CharField(max_length=200, null=True, blank=True)
    cmnarecep = models.CharField(max_length=200, null=True, blank=True)
    ciudadrecep = models.CharField(max_length=200, null=True, blank=True)
    controller = models.TextField(null=True, blank=True)
    fecha_vencimiento = models.CharField(max_length=30, null=True, blank=True)
    estado_cesion = models.CharField(max_length=100, null=True, blank=True)
    url_correo_cesion = models.TextField(null=True, blank=True)
    fecha_recepcion_sii = models.CharField(max_length=50, null=True, blank=True)
    estado_reclamo = models.CharField(max_length=100, null=True, blank=True)
    fecha_reclamo = models.CharField(max_length=30, null=True, blank=True)
    mensaje_reclamo = models.TextField(null=True, blank=True)
    estado_devengo = models.CharField(max_length=100, null=True, blank=True)
    codigo_devengo = models.CharField(max_length=30, null=True, blank=True)
    folio_oc = models.CharField(max_length=60, null=True, blank=True)
    fecha_ingreso_oc = models.CharField(max_length=30, null=True, blank=True)
    folio_rc = models.CharField(max_length=80, null=True, blank=True)
    fecha_ingreso_rc = models.CharField(max_length=30, null=True, blank=True)
    ticket_devengo = models.CharField(max_length=30, null=True, blank=True)
    folio_sigfe = models.CharField(max_length=30, null=True, blank=True)
    tarea_actual = models.CharField(max_length=100, null=True, blank=True)
    area_transaccional = models.CharField(max_length=30, null=True, blank=True)
    fecha_ingreso = models.CharField(max_length=30, null=True, blank=True)
    fecha_aceptacion = models.CharField(max_length=30, null=True, blank=True)
    fecha_devengo = models.CharField(max_length=30, null=True, blank=True)
    devengoaut = models.CharField(max_length=100, null=True, blank=True)
    tipo_flujo = models.CharField(max_length=100, null=True, blank=True)
    estado_revisado = models.CharField(max_length=100, null=True, blank=True)
    rut_usuario_resp = models.CharField(max_length=30, null=True, blank=True)
    nombre_usuario_resp = models.CharField(max_length=200, null=True, blank=True)

    class Meta:
        db_table = 'data_facturas'
        managed = False

    def __str__(self):
        return f"Factura {self.folio} — {self.razon_social_emisor}"


class FacturaSyncLog(models.Model):
    """Historial de corridas del ETL DIPRES/Acepta (módulo Facturas). Alimenta el tab
    'Datos' con la fecha de última actualización — Factura no tiene un campo propio
    de auditoría y es managed=False, así que esta tabla nueva lo suple sin tocarla."""
    ESTADOS = [
        ('completado', 'Completado'),
        ('error', 'Error'),
        ('cancelado', 'Cancelado'),
    ]

    fecha_ejecucion = models.DateTimeField(auto_now_add=True)
    fecha_desde = models.DateField()
    fecha_hasta = models.DateField()
    registros_leidos = models.IntegerField(default=0)
    registros_nuevos = models.IntegerField(default=0)
    registros_actualizados = models.IntegerField(default=0)
    estado = models.CharField(max_length=20, choices=ESTADOS)
    error_mensaje = models.TextField(null=True, blank=True)
    usuario = models.CharField(max_length=150, blank=True)

    class Meta:
        db_table = 'data_facturas_sync_log'
        ordering = ['-fecha_ejecucion']

    def __str__(self):
        return f"Sync {self.fecha_ejecucion:%Y-%m-%d %H:%M} — {self.estado}"


# ─── PAC / COMPRAS ÁGILES (managed=False — tablas existentes) ────────────────

class PlanerPAC(models.Model):
    unidad_compra = models.TextField(blank=True, null=True)
    id_proyecto = models.TextField(blank=True, null=True)
    codigo_presupuestario = models.TextField(blank=True, null=True)
    nombre_proyecto = models.TextField(blank=True, null=True)
    cantidad_items = models.TextField(blank=True, null=True)
    nombre_item = models.TextField(blank=True, null=True)
    monto_unitario_item = models.TextField(blank=True, null=True)
    monto_total_item = models.TextField(blank=True, null=True)
    nombre_responsable = models.TextField(blank=True, null=True)
    cargo_responsable = models.TextField(blank=True, null=True)
    fecha_inicio_compra = models.TextField(blank=True, null=True)
    depto = models.TextField(blank=True, null=True)
    sub = models.TextField(blank=True, null=True)
    unidad = models.TextField(blank=True, null=True)
    tipo_proyecto = models.TextField(blank=True, null=True)
    pac = models.TextField(blank=True, null=True)
    cantidad_oc = models.TextField(blank=True, null=True)
    meses_envio_oc = models.TextField(blank=True, null=True)

    class Meta:
        managed = True
        db_table = 'data_planerpac'

    def __str__(self):
        return f"{self.id_proyecto} — {self.nombre_proyecto}"


class PacProyectoMaestro(models.Model):
    """Maestro histórico de proyectos PAC (desde OCPAC_Maestro.csv, multi-año PC20-PC26+).

    Usado para verificar si un FormularioFSCDerivado.id_plan corresponde a un
    proyecto real del PAC (columna dentro_fuera_pac). Distinto de PlanerPAC:
    este maestro es solo existencia histórica del proyecto, no trae fechas ni
    montos ni jerarquía — eso vive en PlanerPAC (año vigente).
    """
    id_proyecto = models.CharField(max_length=100, db_index=True)
    nombre_proyecto = models.TextField(blank=True, null=True)
    oc_asociada = models.CharField(max_length=100, blank=True, null=True)
    anho_pac = models.IntegerField(blank=True, null=True, db_index=True)

    class Meta:
        db_table = 'data_pac_proyecto_maestro'

    def __str__(self):
        return f"{self.id_proyecto} — {self.oc_asociada}"


class SsoSubdireccion(models.Model):
    """Nombres de subdirección para Departamento.subdireccion_id (hoja 'subdireccion'
    de mapa_sso.xlsx) — Departamento (data_departamento, módulo Usuarios) ya trae el
    id pero no el nombre. Solo cubre establecimiento_id=1 (Dirección SS Osorno,
    subdireccion_id 2-5); los otros 6 establecimientos (hospitales de red) tienen su
    propio rango de subdireccion_id no solapado y sin nombre — services.py los agrupa
    por Establecimiento.descripcion en su lugar (ver calcular_pac_jerarquia)."""
    subdireccion_id = models.IntegerField(primary_key=True)
    nombre = models.CharField(max_length=255)

    class Meta:
        db_table = 'data_sso_subdireccion'

    def __str__(self):
        return self.nombre


class CompraAgilResumen(models.Model):
    codigocompraagil = models.TextField(db_column='CodigoCompraAgil', primary_key=True)
    nombre = models.TextField(db_column='Nombre', blank=True, null=True)
    descripcion = models.TextField(db_column='Descripcion', blank=True, null=True)
    estadoid = models.TextField(db_column='EstadoID', blank=True, null=True)
    estadocodigo = models.TextField(db_column='EstadoCodigo', blank=True, null=True)
    estadoglosa = models.TextField(db_column='EstadoGlosa', blank=True, null=True)
    convocatoriaestado = models.TextField(db_column='ConvocatoriaEstado', blank=True, null=True)
    fechapublicacion = models.DateTimeField(db_column='FechaPublicacion', blank=True, null=True)
    fechacierre = models.DateTimeField(db_column='FechaCierre', blank=True, null=True)
    fechaultimocambio = models.DateTimeField(db_column='FechaUltimoCambio', blank=True, null=True)
    presupuestoestimado = models.TextField(db_column='PresupuestoEstimado', blank=True, null=True)
    montodisponibleclp = models.TextField(db_column='MontoDisponibleCLP', blank=True, null=True)
    oc_codigo = models.TextField(db_column='OC_Codigo', blank=True, null=True)
    unidadcompra = models.TextField(db_column='UnidadCompra', blank=True, null=True)
    totalofertasrecibidas = models.TextField(db_column='TotalOfertasRecibidas', blank=True, null=True)
    totalproveedorescotizando = models.TextField(db_column='TotalProveedoresCotizando', blank=True, null=True)
    motivodesierta = models.TextField(db_column='MotivoDesierta', blank=True, null=True)
    motivocancelacion = models.TextField(db_column='MotivoCancelacion', blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'api_compraagil_resumen'

    def __str__(self):
        return f"CA {self.codigocompraagil} — {self.nombre}"


class CompraAgilDocumento(models.Model):
    codigocompraagil = models.TextField(db_column='CodigoCompraAgil', blank=True, null=True)
    iddocumento = models.TextField(db_column='IDDocumento', primary_key=True)
    nombredocumento = models.TextField(db_column='NombreDocumento', blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'api_compraagil_documentos'


class CompraAgilProducto(models.Model):
    codigocompraagil = models.TextField(db_column='CodigoCompraAgil', blank=True, null=True)
    codigoproducto = models.TextField(db_column='CodigoProducto', primary_key=True)
    nombre = models.TextField(db_column='Nombre', blank=True, null=True)
    descripcion = models.TextField(db_column='Descripcion', blank=True, null=True)
    cantidad = models.TextField(db_column='Cantidad', blank=True, null=True)
    unidadmedida = models.TextField(db_column='UnidadMedida', blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'api_compraagil_productos'


class CompraAgilProductoCotizado(models.Model):
    codigocompraagil = models.TextField(db_column='CodigoCompraAgil', blank=True, null=True)
    rutproveedor = models.TextField(db_column='RutProveedor', primary_key=True)
    codigoproducto = models.TextField(db_column='CodigoProducto', blank=True, null=True)
    nombreproducto = models.TextField(db_column='NombreProducto', blank=True, null=True)
    descripcion = models.TextField(db_column='Descripcion', blank=True, null=True)
    cantidad = models.TextField(db_column='Cantidad', blank=True, null=True)
    preciounitario = models.TextField(db_column='PrecioUnitario', blank=True, null=True)
    montototalproducto = models.TextField(db_column='MontoTotalProducto', blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'api_compraagil_productos_cotizados'


class CompraAgilProveedor(models.Model):
    codigocompraagil = models.TextField(db_column='CodigoCompraAgil', blank=True, null=True)
    rutproveedor = models.TextField(db_column='RutProveedor', primary_key=True)
    razonsocial = models.TextField(db_column='RazonSocial', blank=True, null=True)
    esemt = models.TextField(db_column='EsEMT', blank=True, null=True)
    estadocotizacionid = models.TextField(db_column='EstadoCotizacionID', blank=True, null=True)
    proveedorseleccionado = models.TextField(db_column='ProveedorSeleccionado', blank=True, null=True)
    estadoporcomprador = models.TextField(db_column='EstadoPorComprador', blank=True, null=True)
    idordencompra = models.TextField(db_column='IDOrdenCompra', blank=True, null=True)
    fechacreacion = models.TextField(db_column='FechaCreacion', blank=True, null=True)
    valorneto = models.TextField(db_column='ValorNeto', blank=True, null=True)
    montototal = models.TextField(db_column='MontoTotal', blank=True, null=True)
    porcentajeimpuesto = models.TextField(db_column='PorcentajeImpuesto', blank=True, null=True)
    totalproductoscotizados = models.TextField(db_column='TotalProductosCotizados', blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'api_compraagil_proveedores'

    def __str__(self):
        return f"{self.codigocompraagil} — {self.razonsocial}"


# =============================================================================
# Módulo de Revisión OC Corregibles
# =============================================================================

class RevisionOCCorregible(models.Model):
    RESULTADO_CHOICES = [
        ('Enlazada',    'Enlazada'),
        ('No Enlazada', 'No Enlazada'),
        ('Pendiente',   'Pendiente'),
    ]
    MOTIVO_CHOICES = [
        ('Planificación no informada en el Plan de Compras',             'Planificación no informada en el Plan de Compras'),
        ('Emergencia o Urgencia Sanitaria Imprevista',                   'Emergencia o Urgencia Sanitaria Imprevista'),
        ('Asignación Extraordinaria de Fondos o Ajuste Presupuestario',  'Asignación Extraordinaria de Fondos o Ajuste Presupuestario'),
        ('Cambio en las Prioridades del Plan Estratégico Institucional', 'Cambio en las Prioridades del Plan Estratégico Institucional'),
        ('Quiebre de Stock por Factores de Mercado Externos',            'Quiebre de Stock por Factores de Mercado Externos'),
    ]

    codigo_oc            = models.CharField(max_length=255)
    revisado_por         = models.CharField(max_length=150)
    fecha_revision       = models.DateTimeField(auto_now_add=True)
    resultado            = models.CharField(max_length=20, choices=RESULTADO_CHOICES)
    id_proyecto_asignado = models.CharField(max_length=255, null=True, blank=True)
    motivo_no_enlace     = models.CharField(max_length=255, null=True, blank=True, choices=MOTIVO_CHOICES)
    observaciones        = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'revision_oc_corregible'
        ordering = ['-fecha_revision']

    def __str__(self):
        return f"{self.codigo_oc} — {self.resultado} ({self.revisado_por})"


# =============================================================================
# Módulo Gestión de Contratos (Mercado Público — Contratos SSO)
# =============================================================================

class GestionContrato(models.Model):
    numero_contrato             = models.CharField(max_length=100, primary_key=True)
    nombre_contrato             = models.TextField(blank=True, null=True)
    id_licitacion_oc            = models.CharField(max_length=100, blank=True, null=True)
    rut_organismo               = models.CharField(max_length=30, blank=True, null=True)
    nombre_organismo            = models.TextField(blank=True, null=True)
    ejecucion_contrato          = models.CharField(max_length=150, blank=True, null=True)
    categoria_contrato          = models.CharField(max_length=100, blank=True, null=True)
    tipo_contrato               = models.CharField(max_length=150, blank=True, null=True)
    unidad_requirente           = models.CharField(max_length=200, blank=True, null=True)
    unidad_moneda               = models.CharField(max_length=20, blank=True, null=True)
    monto_contrato              = models.BigIntegerField(null=True, blank=True)
    monto_ejecutado             = models.BigIntegerField(null=True, blank=True)
    monto_por_ejecutar          = models.BigIntegerField(null=True, blank=True)
    fecha_inicio                = models.CharField(max_length=20, blank=True, null=True)
    fecha_termino               = models.CharField(max_length=20, blank=True, null=True)
    estado_contrato             = models.CharField(max_length=100, blank=True, null=True)
    garantias_hitos_incumplidos = models.IntegerField(null=True, blank=True)
    garantias_por_vencer        = models.IntegerField(null=True, blank=True)
    garantias_vencidas          = models.IntegerField(null=True, blank=True)
    garantias_cobradas          = models.IntegerField(null=True, blank=True)
    sanciones_solicitadas       = models.IntegerField(null=True, blank=True)
    sanciones_aplicadas         = models.IntegerField(null=True, blank=True)
    dias_vigencia               = models.IntegerField(null=True, blank=True)
    dias_restantes              = models.IntegerField(null=True, blank=True)
    evaluacion                  = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        db_table = 'data_gestioncontratos'
        ordering = ['-monto_contrato']
        indexes = [
            models.Index(fields=['estado_contrato'],    name='idx_cont_estado'),
            models.Index(fields=['categoria_contrato'], name='idx_cont_categoria'),
            models.Index(fields=['unidad_requirente'],  name='idx_cont_unidad'),
            models.Index(fields=['id_licitacion_oc'],   name='idx_cont_licitacion_oc'),
        ]

    def __str__(self):
        return f"{self.numero_contrato} — {self.nombre_contrato}"


class FormularioFSC(models.Model):
    """Formulario Solicitud de Compra (FSC) — reporte 'total_fsc_anho' del Panel SS Osorno."""
    fecha_solicitud             = models.CharField(max_length=20, blank=True, null=True)
    folio                       = models.IntegerField(db_index=True)
    formulario                  = models.CharField(max_length=200, blank=True, null=True)
    anho                        = models.IntegerField(db_index=True)
    unidad_requirente           = models.CharField(max_length=200, blank=True, null=True, db_index=True)
    usuario_requirente          = models.CharField(max_length=200, blank=True, null=True)
    anexo                       = models.IntegerField(null=True, blank=True)
    correo                      = models.CharField(max_length=200, blank=True, null=True)
    encargado                   = models.CharField(max_length=200, blank=True, null=True)
    jefe                        = models.CharField(max_length=200, blank=True, null=True)
    requerimiento               = models.TextField(blank=True, null=True)
    fecha_entrega               = models.CharField(max_length=20, blank=True, null=True)
    objetivo_compra             = models.TextField(blank=True, null=True)
    especificaciones_tecnicas   = models.TextField(blank=True, null=True)
    cotizacion                  = models.CharField(max_length=200, blank=True, null=True)
    monto_estimado              = models.BigIntegerField(null=True, blank=True)
    moneda                      = models.CharField(max_length=20, blank=True, null=True)
    tipo_monto                  = models.CharField(max_length=50, blank=True, null=True)
    plan_anual                  = models.CharField(max_length=50, blank=True, null=True)
    id_plan                     = models.CharField(max_length=100, blank=True, null=True)
    justificacion               = models.TextField(blank=True, null=True)
    validacion_tecnica          = models.CharField(max_length=50, blank=True, null=True)
    unidad_validadora           = models.CharField(max_length=200, blank=True, null=True)
    justificacion_no_validacion = models.TextField(blank=True, null=True)
    fuente_financiamiento       = models.CharField(max_length=200, blank=True, null=True)
    estado                      = models.CharField(max_length=20, blank=True, null=True, db_index=True)
    adj_espec_tecnicas          = models.TextField(blank=True, null=True)
    adj_cotizacion              = models.TextField(blank=True, null=True)
    adj_validacion              = models.TextField(blank=True, null=True)
    adj_form_justificacion      = models.TextField(blank=True, null=True)
    destino_actual              = models.TextField(blank=True, null=True)
    item_presupuestario         = models.CharField(max_length=200, blank=True, null=True)
    folio_requerimiento         = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        db_table = 'data_formularios_fsc'
        indexes = [models.Index(fields=['anho', 'estado'])]
        ordering = ['-anho', '-folio']

    def __str__(self):
        return f"FSC {self.folio}/{self.anho} — {self.unidad_requirente}"


class FormularioFSCDerivado(models.Model):
    """FSC derivado a comprador — reporte 'total_fsc_anho_derivadas' del Panel SS Osorno (superset de columnas de FormularioFSC)."""
    fecha_solicitud             = models.CharField(max_length=20, blank=True, null=True)
    folio                       = models.IntegerField(db_index=True)
    formulario                  = models.CharField(max_length=200, blank=True, null=True)
    anho                        = models.IntegerField(db_index=True)
    unidad_requirente           = models.CharField(max_length=200, blank=True, null=True, db_index=True)
    usuario_requirente          = models.CharField(max_length=200, blank=True, null=True)
    anexo                       = models.IntegerField(null=True, blank=True)
    correo                      = models.CharField(max_length=200, blank=True, null=True)
    encargado                   = models.CharField(max_length=200, blank=True, null=True)
    jefe                        = models.CharField(max_length=200, blank=True, null=True)
    requerimiento               = models.TextField(blank=True, null=True)
    fecha_entrega               = models.CharField(max_length=20, blank=True, null=True)
    objetivo_compra             = models.TextField(blank=True, null=True)
    especificaciones_tecnicas   = models.TextField(blank=True, null=True)
    cotizacion                  = models.CharField(max_length=200, blank=True, null=True)
    monto_estimado              = models.BigIntegerField(null=True, blank=True)
    moneda                      = models.CharField(max_length=20, blank=True, null=True)
    tipo_monto                  = models.CharField(max_length=50, blank=True, null=True)
    plan_anual                  = models.CharField(max_length=50, blank=True, null=True)
    id_plan                     = models.CharField(max_length=100, blank=True, null=True)
    justificacion               = models.TextField(blank=True, null=True)
    validacion_tecnica          = models.CharField(max_length=50, blank=True, null=True)
    unidad_validadora           = models.CharField(max_length=200, blank=True, null=True)
    justificacion_no_validacion = models.TextField(blank=True, null=True)
    fuente_financiamiento       = models.CharField(max_length=200, blank=True, null=True)
    estado                      = models.CharField(max_length=20, blank=True, null=True, db_index=True)
    fecha_derivado              = models.CharField(max_length=20, blank=True, null=True)
    comprador                   = models.CharField(max_length=200, blank=True, null=True)
    estado_compra               = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    item_presupuestario         = models.CharField(max_length=200, blank=True, null=True)
    folio_requerimiento         = models.CharField(max_length=200, blank=True, null=True)
    adj_espec_tecnicas          = models.TextField(blank=True, null=True)
    adj_cotizacion              = models.TextField(blank=True, null=True)
    adj_validacion              = models.TextField(blank=True, null=True)
    adj_form_justificacion      = models.TextField(blank=True, null=True)

    # --- Módulo PAC: clasificación calculada en cada sync de page_data_panel.py ---
    DENTRO, FUERA = 'DENTRO', 'FUERA'
    DENTRO_FUERA_CHOICES = [(DENTRO, 'Dentro del PAC'), (FUERA, 'Fuera del PAC')]
    dentro_fuera_pac = models.CharField(
        max_length=10, choices=DENTRO_FUERA_CHOICES, blank=True, null=True, db_index=True,
        help_text='Verificado contra PacProyectoMaestro (id_plan), no contra el campo autodeclarado plan_anual.',
    )
    sso_departamento = models.ForeignKey(
        'Departamento', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='formularios_derivados', db_constraint=False,
        help_text='Resuelto por match normalizado de unidad_requirente contra Departamento '
                   '(data_departamento, módulo Usuarios — mejor cobertura que un maestro propio). '
                   'Null = "Sin Clasificar". db_constraint=False: Departamento es managed=False '
                   '(tabla externa, id es int(11) vs bigint aquí) — no se fuerza FK física.',
    )

    class Meta:
        db_table = 'data_formularios_fsc_derivados'
        indexes = [models.Index(fields=['anho', 'estado_compra'])]
        ordering = ['-anho', '-folio']

    def __str__(self):
        return f"FSC derivado {self.folio}/{self.anho} — {self.comprador}"


class FormularioFSCEstadoLog(models.Model):
    """Historial de bandejas de visación por las que pasa un FSC.

    El Panel SSO solo expone el estado *actual* (campo `estado` en FormularioFSC),
    no su historial de cambios. Esta tabla la construye el ETL desde 2026-06-08:
    en cada sincronización compara el estado vigente contra el último registrado
    aquí y, si cambió (o es la primera vez que se ve el formulario), agrega una
    fila nueva con la fecha de detección. Así, con el tiempo, se puede calcular
    cuántos días estuvo un FSC en cada bandeja — algo imposible de reconstruir
    retroactivamente.
    """
    formulario    = models.ForeignKey(FormularioFSC, related_name='historial_estados', on_delete=models.CASCADE)
    estado        = models.CharField(max_length=20, db_index=True)
    fecha_registro = models.DateField(db_index=True)

    class Meta:
        db_table = 'data_formularios_fsc_estado_log'
        ordering = ['formulario_id', 'fecha_registro']
        indexes = [models.Index(fields=['formulario', 'fecha_registro'])]

    def __str__(self):
        return f"FSC {self.formulario_id} → {self.estado} ({self.fecha_registro})"


class FormularioFSCProducto(models.Model):
    """Líneas de producto del carro de compra FSC — reporte 'total_carro_fsc' del Panel SS Osorno."""
    folio                = models.IntegerField(db_index=True)
    tipo_formulario      = models.IntegerField(null=True, blank=True, db_column='t_form')
    anho                 = models.IntegerField(db_index=True)
    categoria            = models.CharField(max_length=200, blank=True, null=True)
    producto             = models.TextField(blank=True, null=True)
    monto                = models.BigIntegerField(null=True, blank=True)
    cantidad             = models.IntegerField(null=True, blank=True)
    descripcion          = models.TextField(blank=True, null=True)
    item_presupuestario  = models.CharField(max_length=300, blank=True, null=True)

    class Meta:
        db_table = 'data_formularios_fsc_productos'
        indexes = [models.Index(fields=['anho', 'folio'])]
        ordering = ['-anho', '-folio']

    def __str__(self):
        return f"Producto FSC {self.folio}/{self.anho} — {self.producto}"


# =============================================================================
# Módulo Usuarios — Panel SSO (read-only proxies + perfil gestionado)
# =============================================================================

class UsuarioPanel(models.Model):
    """Proxy read-only de data_usuario_panel — fuente de verdad del Panel SSO."""
    usuario              = models.CharField(max_length=100)
    correo_electronico   = models.CharField(max_length=150)
    descripcion          = models.CharField(max_length=150, blank=True, null=True)
    activo               = models.CharField(max_length=1)
    establecimiento_id   = models.IntegerField()
    alias                = models.CharField(max_length=150, blank=True, null=True)
    run                  = models.CharField(max_length=15, blank=True, null=True)
    cargo                = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        db_table = 'data_usuario_panel'
        managed  = False

    def __str__(self):
        return self.correo_electronico


class Departamento(models.Model):
    """Proxy read-only de data_departamento."""
    descripcion          = models.CharField(max_length=200, blank=True, null=True)
    subdireccion_id      = models.IntegerField(blank=True, null=True)
    estado_id            = models.IntegerField(blank=True, null=True)
    fecha_mod            = models.DateField(blank=True, null=True)
    nombre_corto         = models.CharField(max_length=20, blank=True, null=True)
    tipo_establecimiento = models.CharField(max_length=50, blank=True, null=True)
    parent_id            = models.IntegerField(blank=True, null=True)
    es_depto             = models.CharField(max_length=5, blank=True, null=True)
    establecimiento_id   = models.IntegerField(blank=True, null=True)

    class Meta:
        db_table = 'data_departamento'
        managed  = False
        ordering = ['descripcion']

    def __str__(self):
        return self.nombre_corto or self.descripcion or str(self.id)


class Establecimiento(models.Model):
    """Proxy read-only de data_establecimiento."""
    codigo       = models.IntegerField()
    padre_id     = models.IntegerField(blank=True, null=True)
    rut          = models.IntegerField()
    dv           = models.CharField(max_length=1)
    descripcion  = models.CharField(max_length=200)
    nombre_corto = models.CharField(max_length=50, blank=True, null=True)
    comuna_id    = models.IntegerField(blank=True, null=True)
    estado_id    = models.IntegerField(blank=True, null=True)
    ubicacion    = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        db_table = 'data_establecimiento'
        managed  = False
        ordering = ['descripcion']

    def __str__(self):
        return self.nombre_corto or self.descripcion


class PertenenciaUsuario(models.Model):
    """Proxy read-only de data_pertenencia_usuario."""
    id_usuario      = models.IntegerField()
    tipo_dependencia = models.CharField(max_length=10)
    id_dependencia  = models.IntegerField()
    id_subdireccion = models.IntegerField()

    class Meta:
        db_table = 'data_pertenencia_usuario'
        managed  = False

    def __str__(self):
        return f"Usuario {self.id_usuario} → dep {self.id_dependencia}"


class PerfilUsuario(models.Model):
    """Extiende auth.User con rol de sistema y vínculo al Panel SSO."""
    ROLES = [
        ('admin',           'Administrador'),
        ('abastecimiento',  'Abastecimiento'),
        ('finanzas',        'Finanzas'),
        ('general',         'General (Todos los módulos)'),
        ('viewer',          'Visualizador'),
    ]

    user               = models.OneToOneField(
        'auth.User', on_delete=models.CASCADE, related_name='perfil'
    )
    role               = models.CharField(max_length=50, choices=ROLES, default='viewer', db_index=True)
    panel_id           = models.IntegerField(null=True, blank=True)
    establecimiento_id = models.IntegerField(null=True, blank=True)
    cargo              = models.CharField(max_length=200, blank=True, null=True)
    run                = models.CharField(max_length=15, blank=True, null=True)

    class Meta:
        db_table = 'api_perfil_usuario'

    def __str__(self):
        return f"{self.user.username} — {self.role}"


class DevengoSigfeAnual(models.Model):
    """Histórico consolidado de 'Disponibilidad de Devengos Presupuestarios' (SIGFE),
    descargado por establecimiento vía Selenium (api/data/data_devengo/) y sincronizado
    de forma incremental — no se reemplaza el contenido completo en cada corrida, se
    hace upsert por row_hash para acumular el histórico anual sin duplicar filas."""
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
    fecha_emision = models.DateTimeField('Fecha Emisión', null=True, blank=True)
    fecha_ingreso = models.DateField('Fecha Ingreso/Recepción', null=True, blank=True)
    catalogo_01 = models.CharField('Catálogo 01', max_length=500, null=True, blank=True)
    catalogo_02 = models.CharField('Catálogo 02', max_length=500, null=True, blank=True)
    catalogo_03 = models.CharField('Catálogo 03', max_length=500, null=True, blank=True)
    catalogo_04 = models.CharField('Catálogo 04', max_length=500, null=True, blank=True)
    catalogo_05 = models.CharField('Catálogo 05', max_length=500, null=True, blank=True)
    catalogo_06 = models.CharField('Catálogo 06', max_length=500, null=True, blank=True)
    concepto_presupuestario = models.CharField('Concepto Presupuestario', max_length=500, null=True, blank=True)
    monto_vigente = models.DecimalField('Monto Vigente', max_digits=20, decimal_places=2, default=0)
    monto_disponible = models.DecimalField('Monto Disponible', max_digits=20, decimal_places=2, default=0)
    monto_consumido = models.DecimalField('Monto Consumido', max_digits=20, decimal_places=2, default=0)
    insumo = models.CharField('Insumo', max_length=500, null=True, blank=True)
    monto_vigente_insumo = models.DecimalField('Monto Vigente Insumo', max_digits=20, decimal_places=2, null=True, blank=True)
    archivo_origen = models.CharField('Archivo Origen', max_length=500, null=True, blank=True)
    row_hash = models.CharField('Hash de fila', max_length=64, unique=True, editable=False)
    fecha_sync = models.DateTimeField('Última sincronización', auto_now=True)

    class Meta:
        db_table = 'api_sigfe_devengo_anual'
        verbose_name = 'Devengo SIGFE Anual'
        verbose_name_plural = 'Devengos SIGFE Anual'
        ordering = ['-fecha_documento']
        indexes = [
            models.Index(fields=['codigo_ue']),
            models.Index(fields=['tipo_documento']),
            models.Index(fields=['concepto_presupuestario']),
            models.Index(fields=['fecha_documento']),
            models.Index(fields=['codigo_ue', 'fecha_documento']),
        ]

    def __str__(self):
        return f"{self.codigo_ue} - {self.numero_documento} - ${self.monto_vigente}"


class ConceptoJerarquia(models.Model):
    """Jerarquía de conceptos presupuestarios (5 niveles) usada para agrupar
    Devengo/DevengoSigfeAnual por Subtítulo→Ítem→Asignación→Sub-asignación→Detalle
    en el reporte de Anexo N°3. Se carga una vez desde un Excel de referencia
    (702 conceptos, prácticamente estático) vía 'manage.py cargar_jerarquia'.

    N1 (2 chars)  = Subtítulo       (ej: 21 GASTOS EN PERSONAL)
    N2 (4 chars)  = Ítem            (ej: 2101 Personal de Planta)
    N3 (7 chars)  = Asignación      (ej: 2101001 Sueldos y Sobresueldos)
    N4 (10 chars) = Sub-asignación  (ej: 2101001001 Sueldos Bases)
    N5 (12 chars) = Detalle         (ej: 210100100101 Sueldo B Planta L 15076)
    """
    codigo = models.CharField('Código', max_length=12, unique=True)
    descripcion = models.CharField('Descripción completa', max_length=255)
    nivel = models.SmallIntegerField('Nivel (1-5)')

    n1_codigo = models.CharField('Código N1', max_length=2, blank=True, default='')
    n1_desc = models.CharField('Subtítulo (N1)', max_length=100, blank=True, default='')
    n2_codigo = models.CharField('Código N2', max_length=4, blank=True, default='')
    n2_desc = models.CharField('Ítem (N2)', max_length=100, blank=True, default='')
    n3_codigo = models.CharField('Código N3', max_length=7, blank=True, default='')
    n3_desc = models.CharField('Asignación (N3)', max_length=150, blank=True, default='')
    n4_codigo = models.CharField('Código N4', max_length=10, blank=True, default='')
    n4_desc = models.CharField('Sub-asignación (N4)', max_length=200, blank=True, default='')
    n5_codigo = models.CharField('Código N5', max_length=12, blank=True, default='')
    n5_desc = models.CharField('Detalle (N5)', max_length=255, blank=True, default='')

    class Meta:
        db_table = 'concepto_jerarquia'
        verbose_name = 'Concepto Presupuestario (Jerarquía)'
        verbose_name_plural = 'Conceptos Presupuestarios (Jerarquía)'
        ordering = ['codigo']
        indexes = [
            models.Index(fields=['n1_codigo']),
            models.Index(fields=['n2_codigo']),
            models.Index(fields=['n3_codigo']),
        ]

    def __str__(self):
        return f"N{self.nivel} | {self.descripcion}"
