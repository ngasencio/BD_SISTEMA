// Piezas visuales de Abastecimiento › Formularios, sobre el sistema DV-UI.
// Estilos en ./formularios.css (prefijo .frm-); nada de colores literales en el JSX.
import { useState } from 'react';
import './formularios.css';
import { fmtN, infoEstado } from './shared';

// ─── Ayuda contextual (?) ────────────────────────────────────────────────────

export function InfoTooltip({ text }) {
    const [visible, setVisible] = useState(false);
    return (
        <span className="frm-tip" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
            <span className="frm-tip__icon">?</span>
            {visible && <span className="frm-tip__box" role="tooltip">{text}</span>}
        </span>
    );
}

// ─── Chips de estado ─────────────────────────────────────────────────────────

/** Bandeja de visación: chip neutro con punto del color de la bandeja (hay 9, demasiadas para variantes DV). */
export function EstadoChip({ codigo }) {
    const info = infoEstado(codigo);
    const titulo = info.persona ? `${info.nombre} (${info.persona})` : info.nombre;
    return (
        <span className="dv-chip frm-chip-neutral" title={titulo}>
            <span className="dv-chip__dot" style={{ color: info.color }} />
            {codigo || '—'}
        </span>
    );
}

/** Días transcurridos. DV-UI no tiene rojo de alarma: lo más grave usa ámbar con borde. */
export function DiasChip({ dias }) {
    if (dias === null || dias === undefined) return <span className="frm-muted">—</span>;
    const variante = dias > 10 ? 'warn' : dias > 5 ? 'watch' : 'ok';
    return (
        <span className={`dv-chip dv-chip--${variante}${dias > 30 ? ' is-critical' : ''}`}
              title={`${dias} día(s) desde la fecha de solicitud`}>
            {dias} d
        </span>
    );
}

/** ID del plan de compras que declara el formulario, o aviso de que no declara ninguno. */
export function PlanChip({ idPlan }) {
    if (!idPlan) return <span className="dv-chip dv-chip--none" title="El formulario no declara un ID de Plan de Compras">Sin plan</span>;
    return <span className="frm-id" title={`Plan de Compras: ${idPlan}`}>{idPlan}</span>;
}

/** Chip con variante DV explícita (ok | warn | watch | draft | none). */
export function Chip({ variante = 'none', children, title }) {
    return <span className={`dv-chip dv-chip--${variante}`} title={title}>{children}</span>;
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

/** Píldora de filtro. `color` tiñe el borde/texto activo; `punto` agrega un punto del mismo color. */
export function FiltroChip({ activo, color, punto, onClick, children, title }) {
    return (
        <button type="button" className={`frm-pill${activo ? ' is-active' : ''}`}
                style={color ? { '--frm-pill-color': color } : undefined} onClick={onClick} title={title}>
            {punto && <span className="frm-pill__dot" />}
            {children}
        </button>
    );
}

export function SearchBox({ value, onChange, placeholder }) {
    return (
        <div className="frm-search">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <circle cx="7" cy="7" r="4.6" /><path d="M10.5 10.5 14 14" />
            </svg>
            <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        </div>
    );
}

// ─── Tabla ───────────────────────────────────────────────────────────────────

/** Encabezado ordenable (orden del servidor: `campo` asc, `-campo` desc). */
export function SortTh({ label, campo, ordering, setOrdering, align, tip }) {
    const asc = ordering === campo;
    const desc = ordering === `-${campo}`;
    const activo = asc || desc;
    const alinear = align === 'right' ? ' is-num' : align === 'center' ? ' is-center' : '';
    return (
        <th className={`frm-th-sort${activo ? ' is-active' : ''}${alinear}`}
            onClick={() => setOrdering(asc ? `-${campo}` : campo)}
            aria-sort={asc ? 'ascending' : desc ? 'descending' : 'none'}>
            {label}
            <span className="frm-th-sort__arrow">{activo ? (desc ? '↓' : '↑') : '⇅'}</span>
            {tip && <InfoTooltip text={tip} />}
        </th>
    );
}

export function Pagination({ page, setPage, count, pageSize = 50 }) {
    const totalPaginas = Math.max(1, Math.ceil(count / pageSize));
    if (totalPaginas <= 1) return null;
    return (
        <nav className="frm-pagination" aria-label="Paginación">
            <button type="button" className="dv-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Anterior</button>
            <span className="frm-pagination__info">Página {page} de {totalPaginas} · {fmtN(count)} registro(s)</span>
            <button type="button" className="dv-btn" disabled={page >= totalPaginas} onClick={() => setPage((p) => p + 1)}>Siguiente ›</button>
        </nav>
    );
}

/** Fila única de estado (cargando / vacío) para el cuerpo de una tabla. */
export function FilaEstado({ colSpan, children, error }) {
    return (
        <tr>
            <td colSpan={colSpan} className={`frm-state${error ? ' frm-state--error' : ''}`}>{children}</td>
        </tr>
    );
}
