import React, { useState, useEffect } from 'react';

// Helpers de presentación del tab Solicitudes — copia deliberada de los de
// features/abastecimiento/components/FormulariosPage.jsx (privados de ese archivo, que
// además llama a endpoints de Abastecimiento que el gestor no puede usar). Si cambia el
// criterio visual allá (colores por bandeja, umbrales de días), actualizar acá también.

export const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
export const fmtCLP = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

export function parseFecha(str) {
    if (!str) return null;
    let m;
    if ((m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = str.match(/^(\d{2})-(\d{2})-(\d{4})$/))) return new Date(+m[3], +m[2] - 1, +m[1]);
    if ((m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) return new Date(+m[3], +m[2] - 1, +m[1]);
    return null;
}

export function diasDesde(fechaStr) {
    const d = parseFecha(fechaStr);
    return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null;
}

const RE_TIPO_FORMULARIO = /Nro\s*(\d+)/i;
export const parseTipoFormulario = (texto) => {
    const m = texto?.match(RE_TIPO_FORMULARIO);
    return m ? Number(m[1]) : null;
};

// Bandejas de visación del FSC (orden del pipeline P → AC; R = rechazado).
export const PIPELINE_ORDEN = ['P', 'FR', 'FA', 'ASDA', 'ADIR', 'AA', 'DC', 'AC'];

export const ESTADO_FSC_INFO = {
    P:    { nombre: 'Pendiente Firma',            persona: null,                  color: '#d97706' },
    FR:   { nombre: 'Revisor Finanzas',           persona: 'Christian Jaramillo', color: '#2563eb' },
    FA:   { nombre: 'Jefatura Finanzas',          persona: 'Rodrigo Martínez',    color: '#4f46e5' },
    ASDA: { nombre: 'Subdirector Administrativo', persona: null,                  color: '#7c3aed' },
    ADIR: { nombre: 'Director SSO',               persona: null,                  color: '#a21caf' },
    AA:   { nombre: 'Jefatura Abastecimiento',    persona: 'Cristina Flores',     color: '#0891b2' },
    DC:   { nombre: 'Jefatura Subdepto',          persona: 'Sandra Espinoza',     color: '#1d4ed8' },
    AC:   { nombre: 'Compradores',                persona: null,                  color: '#15803d' },
    R:    { nombre: 'Rechazados',                 persona: null,                  color: '#b91c1c' },
};

export function EstadoFSCBadge({ codigo }) {
    const info = ESTADO_FSC_INFO[codigo] || { nombre: codigo || 'Sin estado', persona: null, color: '#94a3b8' };
    return (
        <span
            title={info.persona ? `${info.nombre} (${info.persona})` : info.nombre}
            style={{
                display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                whiteSpace: 'nowrap', background: `${info.color}20`, color: info.color, border: `1px solid ${info.color}50`,
            }}
        >
            {codigo || '—'}
        </span>
    );
}

export function DiasBadge({ dias, compact }) {
    if (dias === null || dias === undefined) return <span style={{ color: '#94a3b8' }}>—</span>;
    const color = dias > 30 ? '#dc2626' : dias > 10 ? '#f97316' : dias > 5 ? '#f59e0b' : '#16a34a';
    const bg = dias > 30 ? '#fef2f2' : dias > 10 ? '#fff7ed' : dias > 5 ? '#fffbeb' : '#f0fdf4';
    return (
        <span style={{
            display: 'inline-block', padding: compact ? '1px 7px' : '2px 10px', borderRadius: 20,
            fontSize: compact ? 10 : 11, fontWeight: 700, background: bg, color,
            border: `1px solid ${color}40`, whiteSpace: 'nowrap',
        }}>
            {dias}d
        </span>
    );
}

export function PacBadge({ idPlan }) {
    const tiene = Boolean(idPlan);
    return (
        <span
            title={tiene ? `Plan de Compras: ${idPlan}` : 'Sin ID de Plan de Compras'}
            style={{
                display: 'inline-block', padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                whiteSpace: 'nowrap', background: tiene ? '#f0fdf4' : '#fef2f2', color: tiene ? '#16a34a' : '#dc2626',
                border: `1px solid ${tiene ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}`,
            }}
        >
            {tiene ? '✓' : '✕'}
        </span>
    );
}

export function InfoTooltip({ text }) {
    const [show, setShow] = useState(false);
    return (
        <span
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
        >
            <span style={{
                cursor: 'help', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #94a3b8', color: '#94a3b8',
                fontSize: 9, fontWeight: 700, lineHeight: 1, marginLeft: 4, userSelect: 'none', flexShrink: 0,
            }}>?</span>
            {show && (
                <span style={{
                    position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
                    background: '#1e293b', color: '#f8fafc', fontSize: 11, padding: '7px 11px', borderRadius: 7,
                    whiteSpace: 'normal', minWidth: 200, maxWidth: 280, width: 'max-content', textAlign: 'left',
                    zIndex: 200, lineHeight: 1.7, boxShadow: '0 6px 20px rgba(0,0,0,.28)', pointerEvents: 'none',
                }}>
                    {text}
                </span>
            )}
        </span>
    );
}

export function FiltroChip({ activo, color, onClick, children, title }) {
    return (
        <button onClick={onClick} title={title} style={{
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: activo ? 700 : 400,
            border: activo ? `2px solid ${color || '#7c3aed'}` : '1px solid #e2e8f0',
            background: activo ? (color ? `${color}15` : '#ede9fe') : '#fff',
            color: activo ? (color || '#7c3aed') : '#64748b', cursor: 'pointer', transition: 'all 0.15s',
        }}>
            {children}
        </button>
    );
}

export const thStyle = {
    padding: '9px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap', background: '#f8fafc', fontSize: 12, cursor: 'pointer', userSelect: 'none',
};

export function SortableTh({ label, campo, ordering, setOrdering, align, title: tip }) {
    const asc = ordering === campo;
    const desc = ordering === `-${campo}`;
    const activo = asc || desc;
    return (
        <th
            onClick={() => setOrdering(asc ? `-${campo}` : campo)}
            title={tip || `Ordenar por ${label}`}
            style={{ ...thStyle, textAlign: align || 'left', color: activo ? '#7c3aed' : thStyle.color, background: activo ? '#f5f3ff' : thStyle.background }}
        >
            {label}
            <span style={{ color: activo ? '#7c3aed' : '#cbd5e1', fontWeight: 700 }}>{activo ? (desc ? ' ↓' : ' ↑') : ' ⇅'}</span>
            {tip && <InfoTooltip text={tip} />}
        </th>
    );
}

export function BarraPaginacion({ page, setPage, count, pageSize = 50 }) {
    const totalPaginas = Math.max(1, Math.ceil(count / pageSize));
    if (totalPaginas <= 1) return null;
    return (
        <div className="pagination-bar">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Anterior</button>
            <span className="page-info">Página {page} de {totalPaginas} — {fmtN(count)} registro(s)</span>
            <button className="page-btn" disabled={page >= totalPaginas} onClick={() => setPage((p) => p + 1)}>Siguiente ›</button>
        </div>
    );
}

// Tabla con búsqueda + orden + paginación del lado del servidor.
export function useListaServidor(fetcher, ordenInicial, filtros) {
    const [search, setSearch] = useState('');
    const [ordering, setOrdering] = useState(ordenInicial);
    const [page, setPage] = useState(1);
    const [data, setData] = useState({ results: [], count: 0 });
    const [cargando, setCargando] = useState(true);
    const filtrosKey = JSON.stringify(filtros || {});

    useEffect(() => { setPage(1); }, [search, ordering, filtrosKey]);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        fetcher({ search: search || undefined, ordering, page, ...(filtros || {}) })
            .then(({ data: res }) => {
                if (!activo) return;
                const results = res.results ?? res;
                setData({ results, count: res.count ?? results.length });
            })
            .catch(() => { if (activo) setData({ results: [], count: 0 }); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, ordering, page, filtrosKey]);

    return { search, setSearch, ordering, setOrdering, page, setPage, data, cargando };
}
