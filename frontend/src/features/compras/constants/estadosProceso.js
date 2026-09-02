// Espejo 1:1 de ESTADOS_POR_TIPO_PROCESO / ProcesoCompra.ESTADO_PROCESO_CHOICES en
// backend/api/services.py y models.py — si el backend cambia, actualizar acá también.
// Único lugar del frontend que sabe qué estado es válido para qué tipo de proceso.

export const TIPOS_PROCESO = [
    { value: 'LICITACION',          label: 'Licitación',              color: '#1d4ed8', icon: '📜' },
    { value: 'COMPRA_AGIL',          label: 'Compra Ágil',             color: '#0ea5e9', icon: '⚡' },
    { value: 'CONVENIO_MARCO',       label: 'Convenio Marco',          color: '#7c3aed', icon: '🤝' },
    { value: 'TRATO_DIRECTO',        label: 'Trato Directo',           color: '#d97706', icon: '🎯' },
    { value: 'ORDEN_COMPRA_DIRECTA', label: 'Orden de Compra Directa', color: '#15803d', icon: '📦' },
];

export const ESTADO_LABELS = {
    RECEPCIONADO:                 'Recepcionado por Comprador',
    LIC_PUBLICACION:              'Publicación',
    REVISION_COMPRADOR:           'En Revisión Comprador',
    LIC_REVISION_BASES_REFERENTE: 'Revisión Bases Referente',
    LIC_PENDIENTE_AUT_REFERENTE:  'Pendiente Autorización Referente',
    LIC_PREPARACION_INFORME_EVAL: 'Preparación Informe de Evaluación',
    LIC_EVALUACION_OFERTAS:       'Evaluación Ofertas',
    LIC_ADJUDICACION_DESERCION:   'Adjudicación o Deserción',
    LIC_SEGUNDO_LLAMADO:          'Segundo Llamado',
    LIC_SUSCRIPCION_CONTRATO:     'Suscripción de Contrato',
    LIC_EN_EJECUCION:             'En Ejecución',
    OC_ENVIADA:                   'O/C Enviada',
    CA_PUBLICADA:                 'Publicada',
    CA_ENVIADA_REFERENTE:         'Enviada a Referente',
    TD_TRAMITACION_RESOLUCION:    'En Tramitación de Resolución que Autoriza',
    OCD_GESTIONANDO_ENVIO:        'Gestionando el Envío de las Distintas OC',
    FINALIZADO:                   'Proceso Finalizado',
    OTROS:                        'Otros',
    RECHAZADO:                    'Rechazado',
};

export const ESTADOS_POR_TIPO_PROCESO = {
    LICITACION: [
        'RECEPCIONADO', 'LIC_PUBLICACION', 'REVISION_COMPRADOR', 'LIC_REVISION_BASES_REFERENTE',
        'LIC_PENDIENTE_AUT_REFERENTE', 'LIC_PREPARACION_INFORME_EVAL', 'LIC_EVALUACION_OFERTAS',
        'LIC_ADJUDICACION_DESERCION', 'LIC_SEGUNDO_LLAMADO', 'LIC_SUSCRIPCION_CONTRATO',
        'LIC_EN_EJECUCION', 'OC_ENVIADA', 'FINALIZADO', 'OTROS', 'RECHAZADO',
    ],
    COMPRA_AGIL: [
        'RECEPCIONADO', 'CA_PUBLICADA', 'REVISION_COMPRADOR', 'CA_ENVIADA_REFERENTE',
        'OC_ENVIADA', 'FINALIZADO', 'OTROS', 'RECHAZADO',
    ],
    CONVENIO_MARCO: ['RECEPCIONADO', 'FINALIZADO', 'OTROS', 'RECHAZADO'],
    TRATO_DIRECTO: ['RECEPCIONADO', 'TD_TRAMITACION_RESOLUCION', 'FINALIZADO', 'RECHAZADO'],
    ORDEN_COMPRA_DIRECTA: ['RECEPCIONADO', 'OCD_GESTIONANDO_ENVIO', 'FINALIZADO', 'RECHAZADO'],
};

export const ESTADO_COLOR = (codigo) => {
    if (codigo === 'FINALIZADO') return '#16a34a';
    if (codigo === 'RECHAZADO') return '#dc2626';
    if (codigo === 'RECEPCIONADO') return '#94a3b8';
    if (codigo === 'OTROS') return '#64748b';
    return '#d97706'; // en trámite
};

export const tipoLabel = (value) => TIPOS_PROCESO.find(t => t.value === value)?.label || value;
export const estadoLabel = (codigo) => ESTADO_LABELS[codigo] || codigo;
