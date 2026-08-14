export const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

export const fmtCLP = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

export const fmtCLPCorto = (n) => {
    const v = n ?? 0;
    if (Math.abs(v) >= 1e6) {
        return `$${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(v / 1e6)} MM`;
    }
    return fmtCLP(v);
};

export const fmtFechaHora = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const fmtFecha = (iso) => {
    if (!iso) return '—';
    return new Date(`${iso}T00:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// periodo: "YYYY-MM" -> "Ene 26"
export const fmtPeriodo = (periodo) => {
    if (!periodo || periodo.length !== 7) return periodo || '—';
    const [anio, mes] = periodo.split('-');
    const idx = parseInt(mes, 10) - 1;
    if (idx < 0 || idx > 11) return periodo;
    return `${MESES_CORTOS[idx]} ${anio.slice(2)}`;
};

// "nota_de_credito_electronica" -> "Nota De Credito Electronica"
export const humanizarSlug = (raw) => {
    if (!raw) return 'Sin especificar';
    return String(raw).replace(/_/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
};
