import datetime
import os

from django.contrib.auth.models import User
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import (
    Licitacion, DetalleLicitacion, Devengo, OrdenCompra, DetalleOrdenCompra,
    Proveedor, Comprador, BoletaGarantia, BoletaGarantiaAudit, Factura,
    PlanerPAC, CompraAgilResumen, CompraAgilDocumento,
    CompraAgilProducto, CompraAgilProductoCotizado, CompraAgilProveedor,
    RevisionOCCorregible, GestionContrato,
    FormularioFSC, FormularioFSCDerivado, FormularioFSCProducto,
    PerfilUsuario, Departamento, Establecimiento,
)
from .services import generar_id_formulario

ALLOWED_ADJUNTO_EXTENSIONS = ['.xlsx', '.xls', '.doc', '.docx', '.rar', '.pdf']


# =============================================================================
# Licitaciones
# =============================================================================

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
            'FechaCreacion', 'FechaPublicacion', 'FechaInicio', 'FechaFinal',
            'FechaCierre', 'FechaPubRespuestas',
            'FechaActoAperturaTecnica', 'FechaActoAperturaEconomica',
            'FechaSoporteFisico', 'FechaTiempoEvaluacion',
            'FechaVisitaTerreno', 'FechaEntregaAntecedentes',
            'FechaEstimadaAdjudicacion', 'FechaAdjudicacion', 'Adj_Fecha',
            'FechaEstimadaFirma', 'FechaInicioContrato',
            'Moneda', 'MontoEstimado', 'VisibilidadMonto', 'FuenteFinanciamiento',
            'TiempoDuracionContrato', 'TipoDuracionContrato', 'EsRenovable',
            'Adj_Tipo', 'Adj_Fecha', 'Adj_Numero', 'Adj_NumeroOferentes', 'Adj_UrlActa',
            'detalles',
        ]


class LicitacionCalendarioSerializer(serializers.ModelSerializer):
    """Serializer liviano para el Calendario — solo los campos que renderiza el componente."""
    class Meta:
        model = Licitacion
        fields = [
            'codigo_licitacion', 'Nombre', 'Estado', 'Tipo',
            'C_Usuario', 'C_Unidad',
            'MontoEstimado',
            # Las 17 fechas que mapea EVENT_CFG
            'FechaCreacion', 'FechaPublicacion', 'FechaInicio', 'FechaFinal',
            'FechaCierre', 'FechaPubRespuestas',
            'FechaActoAperturaTecnica', 'FechaActoAperturaEconomica',
            'FechaSoporteFisico', 'FechaTiempoEvaluacion',
            'FechaVisitaTerreno', 'FechaEntregaAntecedentes',
            'FechaEstimadaAdjudicacion', 'FechaAdjudicacion', 'Adj_Fecha',
            'FechaEstimadaFirma', 'FechaInicioContrato',
        ]


# =============================================================================
# Devengo
# =============================================================================

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


# =============================================================================
# Órdenes de Compra
# =============================================================================

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
            'DescripcionOC', 'LinkMP', 'EnlacePAC',
            'detalles',
        ]


# =============================================================================
# Módulo Garantías — Registro de Boletas
# =============================================================================

class MonthField(serializers.Field):
    """Acepta 'YYYY-MM' desde el frontend y almacena como primer día del mes."""

    def to_representation(self, value):
        if value:
            return value.strftime('%Y-%m')
        return None

    def to_internal_value(self, data):
        try:
            s = str(data).strip()
            if len(s) == 7 and s[4] == '-':
                year, month = s.split('-')
                return datetime.date(int(year), int(month), 1)
            # Acepta 'YYYY-MM-DD' también (por si acaso)
            return datetime.date.fromisoformat(s)
        except (ValueError, AttributeError):
            raise serializers.ValidationError('Use el formato YYYY-MM (ej. 2026-03).')


class ProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proveedor
        fields = ['rut', 'nombre']


class CompradorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comprador
        fields = ['id', 'nombre']


class BoletaGarantiaSerializer(serializers.ModelSerializer):
    mes_anio = MonthField()
    proveedor_nombre = serializers.CharField(source='proveedor.nombre', read_only=True)
    comprador_nombre = serializers.CharField(source='comprador.nombre', read_only=True)
    creado_por_username = serializers.CharField(source='creado_por.username', read_only=True)
    adjunto_url = serializers.SerializerMethodField()

    class Meta:
        model = BoletaGarantia
        fields = [
            'id',
            'mes_anio',
            'tipo_documento',
            'formato_documento',
            'numero_documento',
            'fecha_emision',
            'monto',
            'proveedor',
            'proveedor_nombre',
            'banco',
            'id_licitacion',
            'nombre_licitacion',
            'comprador',
            'comprador_nombre',
            'vigencia_garantia',
            'fecha_derivacion_abastecimiento',
            'depto_finanzas',
            'numero_memo',
            'fecha_despacho_finanzas',
            'estado_trazabilidad',
            'adjunto',
            'adjunto_url',
            'creado_por',
            'creado_por_username',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['creado_por', 'created_at', 'updated_at']
        extra_kwargs = {
            'adjunto': {'write_only': True, 'required': False},
        }

    def to_internal_value(self, data):
        """Convierte cadenas vacías en None solo para campos que aceptan NULL (fechas/archivos)."""
        if hasattr(data, 'copy'):
            data = data.copy()
        
        # Solo estos campos deben ser None si están vacíos. 
        # Los CharFields (como numero_memo) prefieren "" en lugar de None.
        to_none_fields = [
            'fecha_derivacion_abastecimiento', 
            'depto_finanzas', 
            'fecha_despacho_finanzas', 
            'adjunto'
        ]
        
        for field in to_none_fields:
            if field in data and data[field] == '':
                data[field] = None
                
        return super().to_internal_value(data)

    def get_adjunto_url(self, obj):
        if obj.adjunto:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.adjunto.url)
            return obj.adjunto.url
        return None

    def validate_adjunto(self, value):
        if value:
            ext = os.path.splitext(value.name)[1].lower()
            if ext not in ALLOWED_ADJUNTO_EXTENSIONS:
                allowed = ', '.join(ALLOWED_ADJUNTO_EXTENSIONS)
                raise serializers.ValidationError(
                    f'Extensión no permitida. Solo se aceptan: {allowed}'
                )
            if value.size > 10 * 1024 * 1024:
                raise serializers.ValidationError('El archivo no puede superar los 10 MB.')
        return value


class FacturaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Factura
        fields = [
            'id', 'tipo_documento', 'folio', 'emisor', 'razon_social_emisor',
            'emision', 'monto_neto', 'monto_exento', 'monto_iva', 'monto_total',
            'estado_acepta', 'estado_sii', 'uri',
            'estado_reclamo', 'fecha_reclamo', 'mensaje_reclamo',
            'estado_devengo', 'codigo_devengo',
            'folio_oc', 'fecha_ingreso_oc',
            'folio_rc', 'fecha_ingreso_rc',
            'ticket_devengo', 'folio_sigfe',
            'tarea_actual', 'fecha_ingreso', 'fecha_aceptacion', 'fecha_devengo',
            'tipo_flujo',
        ]


class BoletaGarantiaAuditSerializer(serializers.ModelSerializer):
    usuario_username = serializers.CharField(
        source='eliminado_por.username', read_only=True
    )

    class Meta:
        model = BoletaGarantiaAudit
        fields = [
            'id', 'accion', 'boleta_id', 'numero_documento',
            'snapshot_antes', 'snapshot',
            'usuario_username', 'eliminado_en', 'razon',
        ]


# =============================================================================
# PAC / Compras Ágiles
# =============================================================================

class PlanerPACSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlanerPAC
        fields = '__all__'


class CompraAgilResumenSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompraAgilResumen
        fields = '__all__'


class CompraAgilCalendarioSerializer(serializers.ModelSerializer):
    """Serializer liviano para el Calendario de Compra Ágil."""
    class Meta:
        model = CompraAgilResumen
        fields = [
            'codigocompraagil', 'nombre', 'estadoglosa',
            'unidadcompra', 'presupuestoestimado',
            'fechapublicacion', 'fechacierre', 'fechaultimocambio',
        ]


class CompraAgilDocumentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompraAgilDocumento
        fields = '__all__'


class CompraAgilProductoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompraAgilProducto
        fields = '__all__'


class CompraAgilProductoCotizadoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompraAgilProductoCotizado
        fields = '__all__'


class CompraAgilProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompraAgilProveedor
        fields = '__all__'


# =============================================================================
# Revisión OC Corregibles
# =============================================================================

class RevisionOCCorregibleSerializer(serializers.ModelSerializer):
    class Meta:
        model = RevisionOCCorregible
        fields = '__all__'
        read_only_fields = ['revisado_por', 'fecha_revision']


# =============================================================================
# Gestión de Contratos
# =============================================================================

class GestionContratoSerializer(serializers.ModelSerializer):
    class Meta:
        model = GestionContrato
        fields = '__all__'


# =============================================================================
# Formularios FSC (Panel SS Osorno)
# =============================================================================

class FormularioFSCSerializer(serializers.ModelSerializer):
    id_formulario = serializers.SerializerMethodField()

    class Meta:
        model = FormularioFSC
        fields = '__all__'

    def get_id_formulario(self, obj):
        return generar_id_formulario(obj.folio, obj.anho, formulario_texto=obj.formulario)


class FormularioFSCDerivadoSerializer(serializers.ModelSerializer):
    id_formulario = serializers.SerializerMethodField()

    class Meta:
        model = FormularioFSCDerivado
        fields = '__all__'

    def get_id_formulario(self, obj):
        return generar_id_formulario(obj.folio, obj.anho, formulario_texto=obj.formulario)


class FormularioFSCProductoSerializer(serializers.ModelSerializer):
    id_formulario = serializers.SerializerMethodField()

    class Meta:
        model = FormularioFSCProducto
        fields = '__all__'

    def get_id_formulario(self, obj):
        return generar_id_formulario(obj.folio, obj.anho, tipo_formulario=obj.tipo_formulario)


# =============================================================================
# Módulo Usuarios
# =============================================================================

class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    """JWT con claims de rol, cargo y establecimiento."""
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        try:
            p = user.perfil
            token['role']               = p.role
            token['cargo']              = p.cargo or ''
            token['establecimiento_id'] = p.establecimiento_id
            token['panel_id']           = p.panel_id
        except Exception:
            token['role']               = 'admin' if user.is_superuser else 'viewer'
            token['cargo']              = ''
            token['establecimiento_id'] = None
            token['panel_id']           = None
        token['nombre'] = user.get_full_name() or user.username
        token['email']  = user.email
        return token


class PerfilUsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PerfilUsuario
        fields = ['role', 'panel_id', 'establecimiento_id', 'cargo', 'run']


class UserAdminSerializer(serializers.ModelSerializer):
    """Serializer para admin: CRUD completo de usuarios con perfil embebido."""
    perfil        = PerfilUsuarioSerializer(required=False)
    password      = serializers.CharField(write_only=True, required=False)
    establecimiento_nombre = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'is_active', 'is_staff', 'is_superuser',
            'date_joined', 'last_login',
            'password', 'perfil', 'establecimiento_nombre',
        ]
        read_only_fields = ['date_joined', 'last_login', 'is_staff', 'is_superuser']

    def get_establecimiento_nombre(self, obj):
        try:
            eid = obj.perfil.establecimiento_id
            if eid:
                est = Establecimiento.objects.filter(id=eid).first()
                return est.nombre_corto or est.descripcion if est else None
        except Exception:
            pass
        return None

    def create(self, validated_data):
        perfil_data = validated_data.pop('perfil', {})
        password    = validated_data.pop('password', None)
        user        = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        PerfilUsuario.objects.create(user=user, **perfil_data)
        return user

    def update(self, instance, validated_data):
        perfil_data = validated_data.pop('perfil', None)
        password    = validated_data.pop('password', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        if password:
            instance.set_password(password)
        instance.save()
        if perfil_data is not None:
            perfil, _ = PerfilUsuario.objects.get_or_create(user=instance)
            for attr, val in perfil_data.items():
                setattr(perfil, attr, val)
            perfil.save()
        return instance


class UserMeSerializer(serializers.ModelSerializer):
    """Serializer para /me: el usuario edita solo su email y contraseña."""
    perfil       = PerfilUsuarioSerializer(read_only=True)
    password_new = serializers.CharField(write_only=True, required=False, min_length=8)

    class Meta:
        model  = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name',
                  'is_active', 'date_joined', 'last_login', 'perfil', 'password_new']
        read_only_fields = ['id', 'username', 'is_active', 'date_joined', 'last_login']

    def update(self, instance, validated_data):
        password_new = validated_data.pop('password_new', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        if password_new:
            instance.set_password(password_new)
        instance.save()
        return instance


class DepartamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Departamento
        fields = '__all__'


class EstablecimientoSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Establecimiento
        fields = '__all__'
