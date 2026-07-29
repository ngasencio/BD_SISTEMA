export const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

export const fmtCLP = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

export const fmtCompacto = (n) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return fmtCLP(n);
};

export const colorPct = (pct) => (pct == null ? '#94a3b8' : pct >= 70 ? '#15803d' : pct >= 40 ? '#b45309' : '#dc2626');
