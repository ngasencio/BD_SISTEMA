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
    
    # Nuevas Columnas Agregadas
    LinkMP = models.URLField(max_length=500, null=True, blank=True)
    EnlacePAC = models.CharField(max_length=255, null=True, blank=True)
    ID_Proyecto = models.CharField(max_length=255, null=True, blank=True, db_column='ID_Proyecto')
    CodigoCompraAgil = models.CharField(max_length=100, null=True, blank=True)
    TipoCompraInterna = models.CharField(max_length=100, null=True, blank=True)
    
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
