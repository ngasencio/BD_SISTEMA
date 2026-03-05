from django.db import models

class Licitacion(models.Model):
    # Códigos
    CodigoLicitacion = models.CharField(max_length=255, primary_key=True)
    Numero = models.CharField(max_length=255, null=True, blank=True)
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
        return f"{self.CodigoLicitacion} - {self.Nombre}"


class DetalleLicitacion(models.Model):
    CodigoLicitacion = models.ForeignKey(Licitacion, on_delete=models.CASCADE, related_name="detalles")
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
        return f"{self.CodigoLicitacion.CodigoLicitacion} - {self.CodigoProducto}"
