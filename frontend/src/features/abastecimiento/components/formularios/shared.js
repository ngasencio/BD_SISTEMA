// Utilidades puras compartidas por Abastecimiento › Formularios (sin JSX).

export const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
export const fmtCLP = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

// ─── Fechas ──────────────────────────────────────────────────────────────────
// El Panel SSO entrega las fechas como texto: normalmente YYYY-MM-DD, a veces DD-MM-YYYY o DD/MM/YYYY.

export function parseFecha(str) {
    if (!str) return null;
    let m;
    if ((m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = String(str).match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/))) return new Date(+m[3], +m[2] - 1, +m[1]);
    return null;
}

export function diasDesde(fechaStr) {
    const d = parseFecha(fechaStr);
    if (!d) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/** Fecha para mostrar en pantalla: DD-MM-AAAA. Si no se puede interpretar, devuelve el texto original. */
export function fmtFecha(str) {
    if (!str) return '—';
    const d = parseFecha(str);
    if (!d) return String(str);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getFullYear()}`;
}

/** Días entre dos fechas (texto o Date). null si alguna no es interpretable. */
export function diasEntre(desde, hasta) {
    const a = desde instanceof Date ? desde : parseFecha(desde);
    const b = hasta instanceof Date ? hasta : parseFecha(hasta);
    if (!a || !b) return null;
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

const RE_TIPO_FORMULARIO = /Nro\s*(\d+)/i;
export const parseTipoFormulario = (texto) => {
    const m = texto?.match(RE_TIPO_FORMULARIO);
    return m ? Number(m[1]) : null;
};

// ─── Bandejas de visación FSC ────────────────────────────────────────────────

export const ESTADO_FSC_INFO = {
    P:    { nombre: 'Pendiente Firma',            persona: null,                   color: '#d97706' },
    FR:   { nombre: 'Revisor Finanzas',           persona: 'Christian Jaramillo',  color: '#2563eb' },
    FA:   { nombre: 'Jefatura Finanzas',          persona: 'Rodrigo Martínez',     color: '#4f46e5' },
    ASDA: { nombre: 'Subdirector Administrativo', persona: null,                   color: '#7c3aed' },
    ADIR: { nombre: 'Director SSO',               persona: null,                   color: '#a21caf' },
    AA:   { nombre: 'Jefatura Abastecimiento',    persona: 'Cristina Flores',      color: '#0891b2' },
    DC:   { nombre: 'Jefatura Subdepto',          persona: 'Sandra Espinoza',      color: '#1d4ed8' },
    AC:   { nombre: 'Compradores',                persona: null,                   color: '#15803d' },
    R:    { nombre: 'Rechazados',                 persona: null,                   color: '#b91c1c' },
};

export const infoEstado = (codigo) =>
    ESTADO_FSC_INFO[codigo] || { nombre: codigo || 'Sin estado', persona: null, color: '#8A94A6' };

// ─── Datos derivados de la ficha (los usan el modal y la impresión) ───────────

const ORDEN_ENLACE = { CONFIRMADO: 0, SUGERIDO: 2, RECHAZADO: 3 };

/**
 * Todas las OC asociadas al formulario en una sola lista: las enlazadas por el sistema
 * (`enlaces_oc`) y las que el comprador vinculó a su proceso (`procesos[].ordenes_compra`)
 * y que no estén ya entre las primeras. Una OC enlazada cuyo registro aún no está en la
 * tabla de OC (el ETL la recrea en cada sync) se informa igual, sin datos de resumen.
 */
export function ocsDeLaFicha(f) {
    const filas = [];
    const vistas = new Set();
    (f?.enlaces_oc || []).forEach((e) => {
        vistas.add(e.codigo_oc);
        filas.push({
            codigo: e.codigo_oc, oc: e.oc, via: 'enlace', linkId: e.link_id,
            estadoEnlace: e.estado, confianza: e.confianza, estadoPac: e.estado_pac,
            descartada: e.estado === 'RECHAZADO', motivoRechazo: e.motivo_rechazo,
        });
    });
    (f?.procesos || []).forEach((p) => {
        (p.ordenes_compra || []).forEach((oc) => {
            if (vistas.has(oc.codigo_oc)) return;
            vistas.add(oc.codigo_oc);
            filas.push({ codigo: oc.codigo_oc, oc, via: 'proceso', proceso: p.titulo, estadoEnlace: null, descartada: false });
        });
    });
    return filas.sort((a, b) => {
        const ra = a.via === 'proceso' ? 1 : (ORDEN_ENLACE[a.estadoEnlace] ?? 4);
        const rb = b.via === 'proceso' ? 1 : (ORDEN_ENLACE[b.estadoEnlace] ?? 4);
        return ra - rb;
    });
}

/** Cuenta las OC de `ocsDeLaFicha`: confirmadas (o vinculadas por el comprador a su proceso), sugeridas por confirmar y descartadas. */
export function resumenOcs(ocs) {
    return {
        confirmadas: ocs.filter((o) => o.via === 'proceso' || o.estadoEnlace === 'CONFIRMADO').length,
        sugeridas: ocs.filter((o) => o.via !== 'proceso' && o.estadoEnlace === 'SUGERIDO').length,
        descartadas: ocs.filter((o) => o.descartada).length,
    };
}

/** Historial de bandejas con los días que estuvo en cada una (la última cuenta hasta hoy). */
export function bandejasConDias(historial) {
    const h = historial || [];
    return h.map((it, i) => ({
        ...it,
        dias: diasEntre(it.fecha, i + 1 < h.length ? h[i + 1].fecha : new Date()),
        actual: i === h.length - 1,
    }));
}

// ─── Colores DV-UI para gráficos (D3 / Chart.js no resuelven `var(--…)` en canvas ni en `color + '33'`) ───

/** Valor hexadecimal actual de un token `--dv-*`; `respaldo` si no hay documento (pruebas) o el token no existe. */
export function dvColor(token, respaldo = '#8A94A6') {
    if (typeof document === 'undefined') return respaldo;
    const valor = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return valor || respaldo;
}

/** Paleta categórica (10 colores) para agrupar por código de ítem, partiendo de los colores de grupo de DV-UI. */
export function paletaGrupos() {
    return [
        ['--dv-group-1', '#0F69B4'], ['--dv-group-2', '#009B8A'], ['--dv-group-3', '#C97F2B'], ['--dv-group-4', '#6B4FA0'],
        ['--dv-ok', '#1B7A45'], ['--dv-scale-high', '#0A4A80'], ['--dv-warn', '#AC6A1C'], ['--dv-watch', '#836618'],
        ['--dv-scale-low', '#8A5518'], ['--dv-navy-soft', '#1B3D63'],
    ].map(([token, respaldo]) => dvColor(token, respaldo));
}

// ─── Estado del enlace FSC ↔ OC (mismo vocabulario que /fsc-oc-pac) ───────────

export const CONFIANZA_ENLACE = {
    ALTA: 'Alta', MEDIA: 'Media', BAJA_SUGERIDA: 'Baja', MANUAL: 'Manual',
};
export const ESTADO_ENLACE = {
    CONFIRMADO: { label: 'Confirmado', variante: 'ok' },
    SUGERIDO:   { label: 'Sugerido',   variante: 'watch' },
    RECHAZADO:  { label: 'Descartado', variante: 'none' },
};
export const ESTADO_PAC_ENLACE = {
    PAC_OK:       { label: 'PAC coincide',   variante: 'ok' },
    PAC_DISTINTO: { label: 'PAC distinto',   variante: 'warn' },
    SIN_PAC:      { label: 'OC sin PAC',     variante: 'warn' },
};
