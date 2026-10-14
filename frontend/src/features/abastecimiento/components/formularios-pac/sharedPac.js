// Utilidades puras de Abastecimiento › Formularios PAC (sin JSX, testeables con `npm test`).

// ─── Bandejas de visación de una ficha PAC ───────────────────────────────────
// Recorrido: P → FR → FA → AA → DC. DC es el estado FINAL (ficha aprobada, no hay comprador);
// R (rechazada) es una rama lateral. No se informa «persona» por bandeja: a diferencia del FSC,
// no está confirmado quién atiende cada una para las fichas PAC.

export const PIPELINE_PAC = ['P', 'FR', 'FA', 'AA', 'DC'];
export const ESTADOS_EN_TRAMITE_PAC = ['P', 'FR', 'FA', 'AA'];
export const ESTADOS_VIGENTES_PAC = [...PIPELINE_PAC];

export const ESTADO_PAC_INFO = {
    P:  { nombre: 'Pendiente Firma',         color: '#d97706', detalle: 'La ficha espera la firma de la jefatura del departamento.' },
    FR: { nombre: 'Revisor Finanzas',        color: '#2563eb', detalle: 'En revisión de Finanzas.' },
    FA: { nombre: 'Jefatura Finanzas',       color: '#4f46e5', detalle: 'Esperando la autorización de la jefatura de Finanzas.' },
    AA: { nombre: 'Jefatura Abastecimiento', color: '#0891b2', detalle: 'Esperando la autorización de la jefatura de Abastecimiento.' },
    DC: { nombre: 'Aprobada',                color: '#15803d', detalle: 'Visación completa: la ficha quedó aprobada (estado final).' },
    R:  { nombre: 'Rechazada',               color: '#b91c1c', detalle: 'La ficha fue rechazada en alguna bandeja.' },
};

export const infoEstadoPac = (codigo) =>
    ESTADO_PAC_INFO[codigo] || { nombre: codigo || 'Sin estado', color: '#8A94A6', detalle: '' };

export const esEnTramitePac = (codigo) => ESTADOS_EN_TRAMITE_PAC.includes(codigo);

// ─── Acción de la ficha ──────────────────────────────────────────────────────

export const ACCIONES_PAC = ['Nuevo', 'Modificar', 'Eliminar'];

export const ACCION_PAC_INFO = {
    Nuevo:     { variante: 'ok',    detalle: 'Propone un proyecto nuevo en el plan.' },
    Modificar: { variante: 'watch', detalle: 'Cambia un proyecto que ya está en el plan.' },
    Eliminar:  { variante: 'none',  detalle: 'Quita un proyecto del plan.' },
};

// ─── Alcance del análisis de carro ───────────────────────────────────────────

export const ALCANCES_CARRO = [
    { id: 'vigentes',   label: 'Vigentes', hint: 'En trámite y aprobadas (sin las rechazadas)', estados: ESTADOS_VIGENTES_PAC },
    { id: 'aprobadas',  label: 'Aprobadas', hint: 'Solo fichas en DC', estados: ['DC'] },
    { id: 'tramite',    label: 'En trámite', hint: 'P, FR, FA y AA', estados: ESTADOS_EN_TRAMITE_PAC },
    { id: 'rechazadas', label: 'Rechazadas', hint: 'Solo fichas en R', estados: ['R'] },
    { id: 'todas',      label: 'Todas', hint: 'Todas las bandejas', estados: [...PIPELINE_PAC, 'R'] },
];

export const estadosDeAlcance = (id) =>
    (ALCANCES_CARRO.find((a) => a.id === id) || ALCANCES_CARRO[0]).estados;

// ─── Filtros globales ────────────────────────────────────────────────────────

/** Subdirección/Departamento seleccionados → parámetros del backend (`sin_clasificar` tiene su propio valor). */
export function paramsOrganigrama(subdireccionSel, deptoSel) {
    if (subdireccionSel === 'sin_clasificar') return { sin_clasificar: 1 };
    if (deptoSel) return { depto: deptoSel };
    if (subdireccionSel) return { subdireccion: subdireccionSel };
    return {};
}

/** Filtros globales de la página (año + organigrama) listos para cualquier endpoint. */
export function paramsFiltrosPac({ anio, subdireccionSel, deptoSel } = {}) {
    return { ...(anio ? { anho: anio } : {}), ...paramsOrganigrama(subdireccionSel, deptoSel) };
}

// ─── Formato ─────────────────────────────────────────────────────────────────

/** Nombre a mostrar de una ficha: su proyecto o, si no lo trae (las de eliminación), el proyecto del plan al que apunta. */
export function tituloFichaPac(f) {
    const nombre = (f?.nombre_proyecto || '').trim();
    if (nombre) return nombre;
    const ident = (f?.identificador_proyecto || '').trim();
    return ident ? `Proyecto del plan ${ident}` : '';
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-05' → 'mayo 2026'. Valores que no son un mes ('Sin mes') pasan tal cual. */
export function fmtMesIso(iso) {
    const m = /^(\d{4})-(\d{2})$/.exec(iso || '');
    if (!m) return iso || '—';
    const nombre = MESES[Number(m[2]) - 1];
    return nombre ? `${nombre} ${m[1]}` : iso;
}

/** Monto grande en millones de pesos: 70887008513 → '$ 70.887 M'. Menos de 1 M se muestra completo. */
export function fmtMillones(n) {
    const v = Number(n) || 0;
    const abs = Math.abs(v);
    const fmt = (x) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(x);
    if (abs >= 1_000_000) return `${v < 0 ? '-' : ''}$ ${fmt(abs / 1_000_000)} M`;
    return `${v < 0 ? '-' : ''}$ ${fmt(abs)}`;
}

/** Porcentaje de `parte` sobre `total` con 1 decimal; null si no se puede calcular. */
export function pctDe(parte, total) {
    const t = Number(total);
    if (!t) return null;
    return Math.round((Number(parte) / t) * 1000) / 10;
}

/** Ancho (0-100) de una barra respecto del mayor valor de la serie; nunca negativo ni NaN. */
export function anchoBarra(valor, maximo) {
    const m = Math.abs(Number(maximo)) || 0;
    if (!m) return 0;
    return Math.max(0, Math.min(100, (Math.abs(Number(valor) || 0) / m) * 100));
}

/** Ordena el historial de bandejas y calcula los días que pasó en cada una (hasta la siguiente o hasta hoy). */
export function bandejasPacConDias(historial, hoy = new Date()) {
    const filas = [...(historial || [])].sort((a, b) => String(a.fecha_registro).localeCompare(String(b.fecha_registro)));
    return filas.map((h, i) => {
        const desde = new Date(`${h.fecha_registro}T00:00:00`);
        const siguiente = filas[i + 1];
        const hasta = siguiente ? new Date(`${siguiente.fecha_registro}T00:00:00`) : hoy;
        const dias = Number.isNaN(desde.getTime()) ? null : Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 86400000));
        return { estado: h.estado, fecha: h.fecha_registro, dias, actual: !siguiente };
    });
}
