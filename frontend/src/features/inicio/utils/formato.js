// Formato y reglas de presentación del Home (puras, sin React).

const nf = new Intl.NumberFormat('es-CL');
export const fmtN = (n) => nf.format(n ?? 0);

/** Monto en millones de pesos: 5878674692 → «$5.879 M». */
export const fmtMillones = (n) => `$${nf.format(Math.round((n ?? 0) / 1e6))} M`;

/** Porcentaje chileno con coma decimal: 77.58 → «77,6%». `null` → «—». */
export function fmtPct(n, decimales = 1) {
    if (n === null || n === undefined) return '—';
    return `${n.toFixed(decimales).replace('.', ',')}%`;
}

/** Nota 1.0-7.0 con coma decimal: 6.1 → «6,1». `null` (muestra insuficiente) → «s/n». */
export const fmtNota = (n) => (n === null || n === undefined ? 's/n' : n.toFixed(1).replace('.', ','));

/** Variación con signo: 4.4 → «+4,4%», -7.7 → «−7,7%» (signo menos tipográfico). `null` → «sin base». */
export function fmtVariacion(pct) {
    if (pct === null || pct === undefined) return 'sin base de comparación';
    const signo = pct > 0 ? '+' : pct < 0 ? '−' : '';
    return `${signo}${Math.abs(pct).toFixed(1).replace('.', ',')}%`;
}

/** Sentido de la variación para la flecha: 'sube' | 'baja' | 'igual'. No se juzga si es bueno o malo. */
export const sentidoVariacion = (pct) => (pct > 0 ? 'sube' : pct < 0 ? 'baja' : 'igual');

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const nombreMes = (m) => MESES[m - 1] || '';

/** «2026-10-07T12:36:30Z» o «2026-10-07» → «07-10-2026». Vacío → «—». */
export function fmtFechaCorta(iso) {
    if (!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : String(iso);
}

/** «2026-10-09» → «9 de octubre de 2026». */
export function fmtFechaLarga(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── A dónde lleva cada bloque ───────────────────────────────────────────────

const ROLES_FORMULARIOS_PAGINA = ['admin', 'abastecimiento', 'comprador', 'general'];

/** Pantalla de formularios que el rol puede abrir: la de Abastecimiento o el Panel de jefatura; `null` si ninguna. */
export function rutaFormularios(role) {
    if (ROLES_FORMULARIOS_PAGINA.includes(role)) return '/abastecimiento/formularios';
    if (role === 'jefatura') return '/compras/panel-formularios';
    return null;
}

// ─── Disposición de los paneles según los bloques que el rol recibe ──────────

/**
 * Filas del tablero: una lista de filas con sus paneles y el ancho de cada uno (en 12 columnas).
 * El gráfico mensual va siempre primero. Al lado: las bandejas de formularios si el rol las ve; si no,
 * la compra por modalidad. La deuda y lo que sobre pasan a la fila siguiente, sin dejar huecos.
 */
export function armarFilas({ formularios, deuda }) {
    const fila1 = [{ panel: 'mensual', cols: 8 }];
    const resto = [];
    if (formularios) {
        fila1.push({ panel: 'formularios', cols: 4 });
        if (deuda) resto.push('deuda');
        resto.push('modalidades');
    } else {
        fila1.push({ panel: 'modalidades', cols: 4 });
        if (deuda) resto.push('deuda');
    }
    const filas = [fila1];
    if (resto.length) filas.push(resto.map((panel) => ({ panel, cols: 12 / resto.length })));
    return filas;
}
