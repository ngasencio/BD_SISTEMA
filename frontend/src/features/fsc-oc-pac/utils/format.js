export const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

export const fmtCLP = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

export const fmtCompacto = (n) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return fmtCLP(n);
};

export const ESTADO_LABEL = {
    CONFIRMADO: 'Confirmado',
    PENDIENTE_MEDIA: 'Pendiente (Media)',
    PENDIENTE_BAJA: 'Pendiente (Baja)',
    RECHAZADO_TOTAL: 'Rechazado',
    SIN_MATCH: 'Sin candidata',
};

// dv-chip solo trae 5 variantes con propósito (ok/warn/watch/draft/none) — sin
// rojo de alarma a propósito, es la paleta institucional del sistema DV-UI.
export const ESTADO_CHIP = {
    CONFIRMADO: 'ok',
    PENDIENTE_MEDIA: 'watch',
    PENDIENTE_BAJA: 'draft',
    RECHAZADO_TOTAL: 'none',
    SIN_MATCH: 'none',
};

// Mantenidos por compatibilidad con estilos inline no migrados todavía.
export const ESTADO_COLOR = {
    CONFIRMADO: '#1B7A45',
    PENDIENTE_MEDIA: '#836618',
    PENDIENTE_BAJA: '#6A7486',
    RECHAZADO_TOTAL: '#8A94A6',
    SIN_MATCH: '#8A94A6',
};

export const CONFIANZA_LABEL = {
    ALTA: 'Alta',
    MEDIA: 'Media',
    BAJA_SUGERIDA: 'Baja (sugerida)',
    MANUAL: 'Manual',
};

export const CONFIANZA_CHIP = {
    ALTA: 'ok',
    MEDIA: 'watch',
    BAJA_SUGERIDA: 'draft',
    MANUAL: 'warn',
};

export const PAC_ESTADO_LABEL = {
    PAC_OK: 'PAC OK',
    SIN_PAC: 'Sin PAC en la OC',
    PAC_DISTINTO: 'PAC distinto',
};

export const PAC_ESTADO_CHIP = {
    PAC_OK: 'ok',
    SIN_PAC: 'warn',
    PAC_DISTINTO: 'watch',
};

// Mantenidos por compatibilidad con estilos inline no migrados todavía.
export const PAC_ESTADO_COLOR = {
    PAC_OK: '#1B7A45',
    SIN_PAC: '#AC6A1C',
    PAC_DISTINTO: '#836618',
};
