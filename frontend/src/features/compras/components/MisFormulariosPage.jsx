import React, { useEffect, useState } from 'react';
import { getMisFormularios } from '../api/comprasApi';
import FscProcesoPanel from './FscProcesoPanel';
import ModalDetalleFsc from './ModalDetalleFsc';
import { tipoLabel, estadoLabel, colorPorTipo } from '../constants/estadosProceso';
import ResumenComprador from './ResumenComprador';

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
const fmtCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const thStyle = {
    padding: '9px 10px', textAlign: 'left', fontWeight: 600,
    color: '#475569', borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap', background: '#f8fafc', fontSize: 12,
};

// Mismo parseo/umbral que DiasBadge en features/abastecimiento/components/FormulariosPage.jsx
// (verde <5, amarillo 5-10, naranja 10-30, rojo >30) — para que el criterio de
// urgencia se vea igual en ambos módulos.
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

function DiasBadge({ dias }) {
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
// visible ese desfase en vez de dejarlo implícito: "Cerrado acá, pendiente
// en Panel SSO" cuando nuestro estado interno ya cerró pero el texto del
// Panel todavía no lo dice.
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

function EstadoGestionChip({ procesos }) {
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
                return (
                    <span key={p.id} title={p.titulo} style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                        fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                        background: color + '1f', color, border: `1px solid ${color}55`,
                    }}>
                        {tipoLabel(p.tipo_proceso)} · {estadoLabel(p.estado_proceso)}
                    </span>
                );
            })}
        </div>
    );
}

// Bandeja personalizada del comprador: todos sus FormularioFSCDerivado en
// estado 'AC' (bandeja "A Comprador" del Panel SSO), estén o no ya
// clasificados. Cada fila muestra su estado de gestión y abre el mismo panel
// lateral (FscProcesoPanel) para clasificar, enlazar Mercado Público y
// registrar avances — sin una pantalla/pestaña separada para "mis procesos".
export default function MisFormulariosPage() {
    const [tab, setTab] = useState('panel');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState({ results: [], count: 0 });
    const [cargando, setCargando] = useState(true);
    const [fscSeleccionado, setFscSeleccionado] = useState(null);
    const [fscVerId, setFscVerId] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => { setPage(1); }, [search, tab]);

    useEffect(() => {
        if (tab === 'panel') return undefined;
        let activo = true;
        setCargando(true);
        getMisFormularios({
            search: search || undefined, page, ordering: '-fecha_derivado',
            finalizados: tab === 'finalizados' ? 1 : undefined,
        })
            .then(({ data: res }) => {
                if (!activo) return;
                setData({ results: res.results ?? res, count: res.count ?? (res.results ?? res).length });
            })
            .catch(() => { if (activo) setData({ results: [], count: 0 }); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [tab, search, page, refreshKey]);

    const totalPaginas = Math.max(1, Math.ceil(data.count / 50));

    return (
        <div className="feature-page">
            <div className="page-header">
                <div className="page-title"><span className="page-title-icon">🗂️</span> Mis Formularios</div>
                <div className="page-subtitle">
                    Formularios de Solicitud de Compra derivados a tu cuenta. Clasifícalos en un Proceso de Compra,
                    enlaza la Licitación/Compra Ágil/OC real y ve registrando el avance.
                </div>
            </div>

            <div className="tabs-bar" style={{ marginBottom: 12 }}>
                <button className={`tab-btn ${tab === 'panel' ? 'active' : ''}`} onClick={() => setTab('panel')}>
                    🖥️ Panel
                </button>
                <button className={`tab-btn ${tab === 'activos' ? 'active' : ''}`} onClick={() => setTab('activos')}>
                    📋 Formularios
                </button>
                <button className={`tab-btn ${tab === 'finalizados' ? 'active' : ''}`} onClick={() => setTab('finalizados')}>
                    ✅ Formularios Finalizados
                </button>
            </div>

            {tab === 'panel' && (
                <ResumenComprador refreshKey={refreshKey} onGestionar={setFscSeleccionado} />
            )}

            {tab !== 'panel' && (
            <div className="card">
                <div className="card-header card-header-accent">
                    <span>{tab === 'finalizados' ? '✅' : '📋'}</span>
                    <span className="card-title">
                        {fmtN(data.count)} formulario(s) {tab === 'finalizados' ? 'con proceso finalizado' : ''}
                    </span>
                </div>

                <div style={{ padding: '12px 16px' }}>
                    <input
                        type="text"
                        placeholder="Buscar por folio, requerimiento, especificaciones o unidad…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, width: '100%', maxWidth: 420 }}
                    />
                </div>

                {cargando ? (
                    <div className="loading-spinner">Cargando…</div>
                ) : data.results.length === 0 ? (
                    <div className="loading-spinner">
                        {tab === 'finalizados' ? 'No tienes formularios con proceso finalizado todavía.' : 'No tienes formularios en la bandeja "A Comprador".'}
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>ID</th>
                                    <th style={thStyle}>Unidad Requirente</th>
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
                                {data.results.map((f, i) => (
                                    <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>
                                            {f.id_formulario || f.folio}
                                        </td>
                                        <td style={{ padding: '8px 10px', color: '#374151' }}>{f.unidad_requirente || '—'}</td>
                                        <td style={{ padding: '8px 10px', maxWidth: 300 }}>
                                            <div className="truncate-text" title={f.requerimiento}>{f.requerimiento || '—'}</div>
                                        </td>
                                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#374151' }}>{fmtCLP(f.monto_estimado)}</td>
                                        <td style={{ padding: '8px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>{f.fecha_derivado || '—'}</td>
                                        <td style={{ padding: '8px 10px' }}><DiasBadge dias={diasDesde(f.fecha_derivado)} /></td>
                                        <td style={{ padding: '8px 10px' }}><EstadoGestionChip procesos={f.procesos} /></td>
                                        <td style={{ padding: '8px 10px' }}><EstadoPanelChip procesos={f.procesos} estadoCompra={f.estado_compra} /></td>
                                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                <button type="button" className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }}
                                                        onClick={() => setFscVerId(f.id)}>
                                                    Ver
                                                </button>
                                                <button type="button" className="btn-primary" style={{ padding: '5px 12px', fontSize: 12 }}
                                                        onClick={() => setFscSeleccionado(f)}>
                                                    Gestionar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {totalPaginas > 1 && (
                    <div className="pagination-bar">
                        <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹ Anterior</button>
                        <span className="page-info">Página {page} de {totalPaginas} — {fmtN(data.count)} registro(s)</span>
                        <button className="page-btn" disabled={page >= totalPaginas} onClick={() => setPage(p => p + 1)}>Siguiente ›</button>
                    </div>
                )}
            </div>
            )}

            {fscSeleccionado && (
                <FscProcesoPanel
                    fsc={fscSeleccionado}
                    onCambiado={() => setRefreshKey(k => k + 1)}
                    onCerrar={() => setFscSeleccionado(null)}
                />
            )}

            {fscVerId && <ModalDetalleFsc fscId={fscVerId} onCerrar={() => setFscVerId(null)} />}
        </div>
    );
}
