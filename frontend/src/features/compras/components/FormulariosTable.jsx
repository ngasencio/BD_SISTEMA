import React from 'react';
import { tipoLabel, estadoLabel, colorPorTipo } from '../constants/estadosProceso';

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
const fmtCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const thStyle = {
    padding: '9px 10px', textAlign: 'left', fontWeight: 600,
    color: '#475569', borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap', background: '#f8fafc', fontSize: 12,
};

function parseFecha(str) {
    if (!str) return null;
    const formatos = [
        /^(\d{4})-(\d{2})-(\d{2})$/,
        /^(\d{2})-(\d{2})-(\d{4})$/,
        /^(\d{2})\/(\d{2})\/(\d{4})$/,
    ];
    let m;
    if ((m = str.match(formatos[0]))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = str.match(formatos[1]))) return new Date(+m[3], +m[2] - 1, +m[1]);
    if ((m = str.match(formatos[2]))) return new Date(+m[3], +m[2] - 1, +m[1]);
    return null;
}

function diasDesde(fechaStr) {
    const d = parseFecha(fechaStr);
    if (!d) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function DiasBadge({ dias }) {
    if (dias === null || dias === undefined) return <span style={{ color: '#94a3b8' }}>—</span>;
    const color = dias > 30 ? '#dc2626' : dias > 10 ? '#f97316' : dias > 5 ? '#f59e0b' : '#16a34a';
    const bg    = dias > 30 ? '#fef2f2' : dias > 10 ? '#fff7ed' : dias > 5 ? '#fffbeb' : '#f0fdf4';
    return (
        <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: bg, color, border: `1px solid ${color}40`, whiteSpace: 'nowrap',
        }}>
            {dias}d
        </span>
    );
}

// El Panel SSO es otra plataforma (Panel Documental SS Osorno) — su propio
// campo `estado_compra` ("Licitación - Proceso Finalizado", etc.) puede
// tardar hasta el próximo sync en reflejar que el comprador ya cerró el
// proceso ACÁ (Estado de Gestión = Proceso Finalizado). Esta columna hace
// visible ese desfase en vez de dejarlo implícito.
function panelCerrado(estadoCompra) {
    return /proceso finalizado/i.test(estadoCompra || '');
}

function EstadoPanelChip({ procesos, estadoCompra }) {
    const cerradoAca = (procesos || []).some(p => p.estado_proceso === 'FINALIZADO');
    const cerradoPanel = panelCerrado(estadoCompra);

    if (cerradoPanel) {
        return (
            <span title={estadoCompra} style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#f0fdf4', color: '#16a34a', border: '1px solid rgba(22,163,74,.3)', whiteSpace: 'nowrap' }}>
                ✅ Cerrado en Panel SSO
            </span>
        );
    }
    if (cerradoAca) {
        return (
            <span title="Este sistema ya marcó el proceso como Finalizado — el Panel SSO aún no lo refleja (se actualizará en el próximo sync de Formularios)." style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#fffbeb', color: '#b45309', border: '1px solid rgba(217,119,6,.3)', whiteSpace: 'nowrap' }}>
                ⏳ Pendiente en Panel SSO
            </span>
        );
    }
    return (
        <span style={{ fontSize: 12, color: '#94a3b8' }} title={estadoCompra || ''}>
            {estadoCompra || '—'}
        </span>
    );
}

// Resumen PAC por proceso, calculado por el backend con el mismo criterio
// que /fsc-oc-pac (calcular_estado_pac_proceso_oc en services.py).
const ESTADO_PAC_RESUMEN = {
    PAC_OK:       { label: 'PAC OK',       color: '#16a34a' },
    SIN_PAC:      { label: 'Sin PAC',      color: '#dc2626' },
    PAC_DISTINTO: { label: 'PAC distinto', color: '#ea580c' },
};

function EstadoGestionChip({ procesos, onVerProceso }) {
    if (!procesos || procesos.length === 0) {
        return (
            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>
                Sin clasificar
            </span>
        );
    }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {procesos.map(p => {
                const color = colorPorTipo(p.tipo_proceso);
                const pac = ESTADO_PAC_RESUMEN[p.estado_pac];
                return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span
                            title={onVerProceso ? `${p.titulo} — clic para ver el proceso` : p.titulo}
                            onClick={onVerProceso ? () => onVerProceso(p.id) : undefined}
                            role={onVerProceso ? 'button' : undefined}
                            style={{
                                display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                                fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                                background: color + '1f', color, border: `1px solid ${color}55`,
                                cursor: onVerProceso ? 'pointer' : 'default',
                            }}>
                            {tipoLabel(p.tipo_proceso)} · {estadoLabel(p.estado_proceso)}
                        </span>
                        {pac && (
                            <span title="Estado PAC de la(s) OC de este proceso" style={{
                                fontSize: 10.5, fontWeight: 700, color: pac.color, whiteSpace: 'nowrap',
                            }}>
                                · {pac.label}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// Tabla de FSC compartida entre "Mis Formularios" (comprador, acotada a
// request.user) y "Búsqueda Personalizada" (jefatura, acotada al comprador
// elegido en el selector) — mismas columnas, mismo criterio de urgencia por
// días, mismos chips de estado de gestión/Panel SSO.
// Props opcionales para el Gestor de Compras (solo lectura): `soloLectura` oculta "Gestionar",
// `mostrarComprador` agrega la columna del comprador asignado y `onVerProceso(id)` vuelve
// clickeables los chips de Estado de Gestión. Sin ellas la tabla se ve y actúa como siempre.
export default function FormulariosTable({
    data, cargando, emptyMessage, onVer, onGestionar,
    soloLectura = false, mostrarComprador = false, onVerProceso,
}) {
    if (cargando) {
        return <div className="loading-spinner">Cargando…</div>;
    }
    if (!data || data.length === 0) {
        return <div className="loading-spinner">{emptyMessage || 'Sin formularios para mostrar.'}</div>;
    }
    return (
        <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                    <tr>
                        <th style={thStyle}>ID</th>
                        <th style={thStyle}>Unidad Requirente</th>
                        {mostrarComprador && <th style={thStyle}>Comprador</th>}
                        <th style={thStyle}>Requerimiento</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Monto Estimado</th>
                        <th style={thStyle}>Fecha Derivado</th>
                        <th style={thStyle}>Días</th>
                        <th style={thStyle}>Estado de Gestión</th>
                        <th style={thStyle}>Estado Panel SSO</th>
                        <th style={thStyle}></th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((f, i) => (
                        <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>
                                {f.id_formulario || f.folio}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#374151' }}>{f.unidad_requirente || '—'}</td>
                            {mostrarComprador && (
                                <td style={{ padding: '8px 10px', color: '#374151', whiteSpace: 'nowrap' }}>{f.comprador || <span style={{ color: '#94a3b8' }}>Sin asignar</span>}</td>
                            )}
                            <td style={{ padding: '8px 10px', maxWidth: 300 }}>
                                <div className="truncate-text" title={f.requerimiento}>{f.requerimiento || '—'}</div>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#374151' }}>{fmtCLP(f.monto_estimado)}</td>
                            <td style={{ padding: '8px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>{f.fecha_derivado || '—'}</td>
                            <td style={{ padding: '8px 10px' }}><DiasBadge dias={diasDesde(f.fecha_derivado)} /></td>
                            <td style={{ padding: '8px 10px' }}><EstadoGestionChip procesos={f.procesos} onVerProceso={onVerProceso} /></td>
                            <td style={{ padding: '8px 10px' }}><EstadoPanelChip procesos={f.procesos} estadoCompra={f.estado_compra} /></td>
                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                    <button type="button" className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }}
                                            onClick={() => onVer?.(f.id)}>
                                        Ver
                                    </button>
                                    {!soloLectura && (
                                        <button type="button" className="btn-primary" style={{ padding: '5px 12px', fontSize: 12 }}
                                                onClick={() => onGestionar?.(f)}>
                                            Gestionar
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
