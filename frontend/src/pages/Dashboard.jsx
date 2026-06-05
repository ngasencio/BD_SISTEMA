import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../lib/axios';
import ResumenSect from '../components/ResumenSect';
import CalendarioSect from '../components/CalendarioSect';
import FinancieroSect from '../components/FinancieroSect';
import CategoriasSect from '../components/CategoriasSect';
import ReportesSect from '../components/ReportesSect';
import GestionSect from '../components/GestionSect';
import AhorroSect from '../components/AhorroSect';
import { useActualizarLicitaciones } from '../features/licitaciones/hooks/useActualizarLicitaciones';

// ─── Helpers visuales ETL ─────────────────────────────────────────────────────

const clpLI = n => {
    const num = parseFloat(String(n).replace(/[^0-9.-]/g, ''));
    if (isNaN(num) || num === 0) return '—';
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(num);
};

const fmtIsoLI = iso => {
    if (!iso || iso === 'None') return '—';
    const s = iso.split('T')[0];
    const [y, m, d] = s.split('-');
    return d && m && y ? `${d}/${m}/${y}` : '—';
};

const LI_ESTADO_PAL = {
    'Adjudicada':   { bg: '#dcfce7', color: '#15803d' },
    'Publicada':    { bg: '#dbeafe', color: '#1d4ed8' },
    'Cerrada':      { bg: '#f1f5f9', color: '#475569' },
    'Revocada':     { bg: '#fee2e2', color: '#dc2626' },
    'Desierta (o art. 3 ó 9 Ley 19.886)': { bg: '#ffedd5', color: '#c2410c' },
};

function LIEstadoBadge({ estado }) {
    const s = LI_ESTADO_PAL[estado] || { bg: '#f1f5f9', color: '#475569' };
    return (
        <span style={{ background: s.bg, color: s.color, padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {estado || '—'}
        </span>
    );
}

function TablaNuevasLI({ rows }) {
    const TH = ({ c, right }) => (
        <th style={{ padding: '9px 8px', textAlign: right ? 'right' : 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', fontSize: 12, whiteSpace: 'nowrap' }}>{c}</th>
    );
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr><TH c="Código" /><TH c="Nombre" /><TH c="Tipo" /><TH c="Estado" /><TH c="Unidad" /><TH c="Monto Est." right /><TH c="Cierre" /></tr></thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={r.codigo} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '7px 8px', fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.codigo}</td>
                        <td style={{ padding: '7px 8px', color: '#1e293b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.nombre}>{r.nombre || '—'}</td>
                        <td style={{ padding: '7px 8px', color: '#64748b', fontSize: 11 }}>{r.tipo || '—'}</td>
                        <td style={{ padding: '7px 8px' }}><LIEstadoBadge estado={r.estado} /></td>
                        <td style={{ padding: '7px 8px', color: '#6b7280', fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.unidad}>{r.unidad || '—'}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#374151', fontWeight: 500, whiteSpace: 'nowrap' }}>{clpLI(r.monto)}</td>
                        <td style={{ padding: '7px 8px', color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtIsoLI(r.fecha_cierre)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function TablaCambiadasLI({ rows }) {
    const TH = ({ c, right }) => (
        <th style={{ padding: '9px 8px', textAlign: right ? 'right' : 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', fontSize: 12, whiteSpace: 'nowrap' }}>{c}</th>
    );
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr><TH c="Código" /><TH c="Nombre" /><TH c="Antes" /><TH c="" /><TH c="Ahora" /><TH c="Unidad" /><TH c="Monto Est." right /></tr></thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={r.codigo} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '7px 8px', fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.codigo}</td>
                        <td style={{ padding: '7px 8px', color: '#1e293b', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.nombre}>{r.nombre || '—'}</td>
                        <td style={{ padding: '7px 8px' }}><LIEstadoBadge estado={r.estado_anterior} /></td>
                        <td style={{ padding: '7px 8px', color: '#94a3b8', fontSize: 14, fontWeight: 700 }}>→</td>
                        <td style={{ padding: '7px 8px' }}><LIEstadoBadge estado={r.estado_nuevo} /></td>
                        <td style={{ padding: '7px 8px', color: '#6b7280', fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.unidad}>{r.unidad || '—'}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#374151', fontWeight: 500, whiteSpace: 'nowrap' }}>{clpLI(r.monto)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ─── Panel lateral de cambios en Licitaciones ─────────────────────────────────

function PanelCambiosLI({ diff, fechaDesde, fechaHasta, onCerrar }) {
    const [tab, setTab]       = useState(() => diff?.adjudicadas_count > 0 ? 'adjudicadas' : diff?.nuevas_count > 0 ? 'nuevas' : 'cambiadas');
    const [search, setSearch] = useState('');

    const lista = tab === 'nuevas' ? (diff?.nuevas || []) : tab === 'adjudicadas' ? (diff?.adjudicadas || []) : (diff?.cambiadas || []);

    const filtrada = useMemo(() => {
        if (!search) return lista;
        const q = search.toLowerCase();
        return lista.filter(r =>
            (r.codigo || '').toLowerCase().includes(q) ||
            (r.nombre || '').toLowerCase().includes(q) ||
            (r.unidad || '').toLowerCase().includes(q)
        );
    }, [lista, search]);

    const visibles = filtrada.slice(0, 300);

    const TABS_PANEL = [
        { key: 'nuevas',      label: `📥 Nuevas (${diff?.nuevas_count || 0})` },
        { key: 'cambiadas',   label: `🔄 Cambiaron (${diff?.cambiadas_count || 0})` },
        { key: 'adjudicadas', label: `🏆 Adjudicadas (${diff?.adjudicadas_count || 0})` },
    ];

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1200, animation: 'li-fade 0.2s ease' }} />
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 680, background: '#fff', zIndex: 1201, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)', animation: 'li-slide 0.25s ease' }}>
                <style>{`
                    @keyframes li-fade  { from{opacity:0} to{opacity:1} }
                    @keyframes li-slide { from{transform:translateX(100%)} to{transform:translateX(0)} }
                `}</style>

                {/* Header */}
                <div style={{ background: '#1d4ed8', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>📄 Cambios detectados en Licitaciones</div>
                        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>{fmtIsoLI(fechaDesde)} → {fmtIsoLI(fechaHasta)}</div>
                    </div>
                    <button onClick={onCerrar} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 15, borderRadius: 6, padding: '4px 12px', fontWeight: 700 }}>✕</button>
                </div>

                {/* Resumen chips */}
                <div style={{ padding: '12px 20px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                    <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 8, padding: '5px 14px', fontSize: 13, fontWeight: 700 }}>📥 {diff?.nuevas_count || 0} nuevas</span>
                    <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 8, padding: '5px 14px', fontSize: 13, fontWeight: 700 }}>🔄 {diff?.cambiadas_count || 0} cambiaron</span>
                    {(diff?.adjudicadas_count || 0) > 0 && (
                        <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 8, padding: '5px 14px', fontSize: 13, fontWeight: 700 }}>🏆 {diff.adjudicadas_count} adjudicadas</span>
                    )}
                    {diff?.total_antes != null && (
                        <span style={{ fontSize: 12, color: '#64748b', marginLeft: 4 }}>
                            Antes: <strong>{(diff.total_antes).toLocaleString('es-CL')}</strong>
                            {diff.total_despues != null && <> → Ahora: <strong>{(diff.total_despues).toLocaleString('es-CL')}</strong></>}
                        </span>
                    )}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', paddingLeft: 20, flexShrink: 0 }}>
                    {TABS_PANEL.map(t => (
                        <button key={t.key} onClick={() => { setTab(t.key); setSearch(''); }}
                            style={{ padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.key ? 700 : 400, color: tab === t.key ? '#1d4ed8' : '#64748b', borderBottom: tab === t.key ? '2px solid #1d4ed8' : '2px solid transparent', marginBottom: -2 }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Buscador */}
                <div style={{ padding: '12px 20px 8px', flexShrink: 0 }}>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14 }}>🔍</span>
                        <input type="text" placeholder="Buscar por código, nombre o unidad..."
                            value={search} onChange={e => setSearch(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }} />
                    </div>
                    {search && (
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>
                            {filtrada.length} resultado{filtrada.length !== 1 ? 's' : ''} de {lista.length}
                            <button onClick={() => setSearch('')} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>✕ Limpiar</button>
                        </div>
                    )}
                </div>

                {/* Tabla con scroll */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', minHeight: 0 }}>
                    {visibles.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>{search ? '🔍' : tab === 'nuevas' ? '📥' : tab === 'adjudicadas' ? '🏆' : '🔄'}</div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>
                                {search ? 'Sin resultados para la búsqueda'
                                    : tab === 'nuevas' ? 'No se encontraron licitaciones nuevas'
                                    : tab === 'adjudicadas' ? 'No hubo adjudicaciones en este rango'
                                    : 'No hubo cambios de estado'}
                            </div>
                        </div>
                    ) : tab === 'nuevas' ? (
                        <TablaNuevasLI rows={visibles} />
                    ) : (
                        <TablaCambiadasLI rows={visibles} />
                    )}
                    {filtrada.length > 300 && (
                        <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: '#94a3b8', borderTop: '1px solid #f1f5f9', marginTop: 8 }}>
                            Mostrando los primeros 300 de {filtrada.length} resultados.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
                    <button onClick={onCerrar} style={{ width: '100%', padding: '13px', borderRadius: 8, background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                        ✅ Cerrar y actualizar dashboard
                    </button>
                </div>
            </div>
        </>
    );
}

// ─── Banner flotante de progreso ETL ─────────────────────────────────────────

function liLogColor(line) {
    if (/✅|COMPLETADO|finalizada/.test(line)) return '#4ade80';
    if (/❌|Error/.test(line))                 return '#f87171';
    if (/⚠️|Sin licitaciones/.test(line))     return '#fbbf24';
    if (/✨/.test(line))                        return '#a78bfa';
    if (/🔄|📊|🔗|🚀|>>>/.test(line))          return '#60a5fa';
    return '#94a3b8';
}

function LIStepIcon({ paso, pasoActual, status }) {
    const done   = paso < pasoActual || status === 'completado';
    const active = paso === pasoActual && status === 'en_proceso';
    const err    = status === 'error' && paso === pasoActual;
    if (err)    return <span style={{ color: '#ef4444', fontSize: 15 }}>✗</span>;
    if (done)   return <span style={{ color: '#22c55e', fontSize: 15 }}>✓</span>;
    if (active) return <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid #1d4ed8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'li-spin 0.8s linear infinite', verticalAlign: 'middle' }} />;
    return <span style={{ color: '#cbd5e1', fontSize: 14 }}>○</span>;
}

function LIBar({ pct, active, color, indeterminate }) {
    return (
        <div style={{ background: '#e2e8f0', borderRadius: 4, height: 7, overflow: 'hidden', position: 'relative' }}>
            {indeterminate ? (
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '40%', background: color, borderRadius: 4, animation: 'li-indet 1.4s ease-in-out infinite' }} />
            ) : (
                <div style={{
                    width: `${Math.max(2, pct)}%`, height: '100%', borderRadius: 4,
                    background: active && pct < 100
                        ? `repeating-linear-gradient(90deg,${color} 0,${color} 20px,${color}99 20px,${color}99 40px)`
                        : color,
                    backgroundSize: '40px 100%',
                    animation: active && pct < 100 ? 'li-stripes 0.6s linear infinite' : 'none',
                    transition: 'width 0.7s ease',
                }} />
            )}
        </div>
    );
}

function BannerLI({ tarea, onVerCambios, onCerrar, onCancelar }) {
    const logRef = useRef(null);
    const [confirmando, setConfirmando] = useState(false);
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [tarea.logs_recientes]);

    const enProceso = ['iniciado', 'en_proceso'].includes(tarea.status);
    const colorH = tarea.status === 'error' ? '#dc2626' : tarea.status === 'cancelado' ? '#64748b' : '#1d4ed8';

    const handleXClick = () => { if (enProceso) setConfirmando(true); else onCerrar(); };
    const handleConfirmar = async () => { setConfirmando(false); await onCancelar(); };
    const fmtF = iso => { if (!iso) return '?'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

    const totalDias  = tarea.total_dias || 0;
    const diasOk     = tarea.dias_completados || 0;
    const licsD      = tarea.lics_dia || 0;
    const totalLicsD = tarea.total_lics_dia || 0;
    const pct1 = tarea.paso >= 2 || tarea.status === 'completado' ? 100 : (tarea.progreso_pct || 0);
    const pct2 = tarea.status === 'completado' ? 100 : (tarea.progreso_sync_pct || 0);
    const logs = tarea.logs_recientes || [];
    const diff = tarea.diff || {};
    const totalCambios = (diff.nuevas_count || 0) + (diff.cambiadas_count || 0);

    return (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1100, width: 400, background: '#fff', borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,0.22)', overflow: 'hidden', border: `2px solid ${colorH}` }}>
            <style>{`
                @keyframes li-spin    { to { transform: rotate(360deg); } }
                @keyframes li-stripes { to { background-position: 40px 0; } }
                @keyframes li-indet   { 0%{left:-40%} 60%{left:100%} 100%{left:100%} }
            `}</style>

            {/* Diálogo de confirmación de cancelación */}
            {confirmando && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.88)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14 }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: '22px 20px', textAlign: 'center', width: 300, margin: '0 16px' }}>
                        <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 6 }}>¿Detener la actualización?</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 18, lineHeight: 1.5 }}>Se interrumpirá el proceso en curso. Los datos descargados hasta ahora se descartarán.</div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button onClick={() => setConfirmando(false)} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 13, color: '#64748b', fontWeight: 600 }}>No, continuar</button>
                            <button onClick={handleConfirmar} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Sí, detener</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cabecera */}
            <div style={{ background: colorH, padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {tarea.status === 'completado' ? '✅ Actualización completada'
                        : tarea.status === 'cancelado' ? '⛔ Actualización cancelada'
                        : tarea.status === 'error'    ? '❌ Error en actualización'
                        : <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.5)', borderTopColor: '#fff', borderRadius: '50%', animation: 'li-spin 0.8s linear infinite' }} /> Actualizando Licitaciones</>}
                </div>
                <button onClick={handleXClick} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Rango */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
                    <span>📅 {fmtF(tarea.fecha_desde)} → {fmtF(tarea.fecha_hasta)}</span>
                    {totalDias > 0 && <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 10, padding: '2px 8px', fontWeight: 600, fontSize: 11 }}>{totalDias} día{totalDias !== 1 ? 's' : ''}</span>}
                </div>

                {/* Paso 1 */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
                        <span style={{ width: 18, textAlign: 'center', flexShrink: 0 }}><LIStepIcon paso={1} pasoActual={tarea.paso} status={tarea.status} /></span>
                        <span style={{ fontWeight: tarea.paso === 1 ? 700 : 500, color: tarea.paso >= 1 ? '#1e293b' : '#94a3b8' }}>Descarga e integración de maestros</span>
                        {tarea.paso === 1 && totalDias > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b', fontWeight: 600 }}>{diasOk}/{totalDias}</span>}
                    </div>
                    {tarea.paso >= 1 && (
                        <>
                            <div style={{ paddingLeft: 26 }}><LIBar pct={pct1} active={tarea.paso === 1} color="#1d4ed8" /></div>
                            {tarea.paso === 1 && (
                                <div style={{ paddingLeft: 26, marginTop: 4, fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontStyle: 'italic' }}>{tarea.paso_desc}</span>
                                    {totalLicsD > 0 && <span style={{ color: '#94a3b8' }}>{licsD}/{totalLicsD} lics.</span>}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Paso 2 */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
                        <span style={{ width: 18, textAlign: 'center', flexShrink: 0 }}><LIStepIcon paso={2} pasoActual={tarea.paso} status={tarea.status} /></span>
                        <span style={{ fontWeight: tarea.paso === 2 ? 700 : 500, color: tarea.paso >= 2 ? '#1e293b' : '#94a3b8' }}>Sincronización con base de datos</span>
                    </div>
                    {tarea.paso >= 2 && (
                        <>
                            <div style={{ paddingLeft: 26 }}><LIBar pct={pct2} active={tarea.paso === 2} color="#7c3aed" indeterminate={tarea.paso === 2 && pct2 === 0} /></div>
                            {tarea.paso === 2 && <div style={{ paddingLeft: 26, marginTop: 4, fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>{tarea.paso_desc}</div>}
                        </>
                    )}
                </div>

                {/* Log terminal */}
                {logs.length > 0 && (
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Actividad reciente</div>
                        <div ref={logRef} style={{ background: '#0f172a', borderRadius: 7, padding: '8px 10px', maxHeight: 110, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#334155 #0f172a' }}>
                            {logs.map((line, i) => (
                                <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: liLogColor(line), lineHeight: 1.6, wordBreak: 'break-all' }}>{line}</div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Resultado completado */}
                {tarea.status === 'completado' && (
                    <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 13px' }}>
                        <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 13, marginBottom: 8 }}>📊 Sincronización completada</div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            {(diff.nuevas_count || 0) > 0 && <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>📥 {diff.nuevas_count} nuevas</span>}
                            {(diff.cambiadas_count || 0) > 0 && <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>🔄 {diff.cambiadas_count} cambiaron</span>}
                            {(diff.adjudicadas_count || 0) > 0 && <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>🏆 {diff.adjudicadas_count} adjudicadas</span>}
                            {totalCambios === 0 && <span style={{ color: '#64748b', fontSize: 12 }}>Sin cambios detectados</span>}
                        </div>
                        {diff.total_despues != null && (
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
                                Total en BD: <strong style={{ color: '#1d4ed8' }}>{(diff.total_despues).toLocaleString('es-CL')}</strong> licitaciones
                            </div>
                        )}
                        <button onClick={onVerCambios} style={{ width: '100%', padding: '9px', borderRadius: 7, border: '1.5px solid #1d4ed8', background: '#fff', color: '#1d4ed8', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            📋 Ver todos los cambios
                            <span style={{ background: '#1d4ed8', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{totalCambios}</span>
                            <span>→</span>
                        </button>
                    </div>
                )}

                {/* Cancelado */}
                {tarea.status === 'cancelado' && (
                    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 13px', textAlign: 'center' }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>⛔</div>
                        <div style={{ fontWeight: 600, color: '#475569', fontSize: 13 }}>Actualización cancelada</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>El proceso fue detenido por el usuario.</div>
                    </div>
                )}

                {/* Error */}
                {tarea.status === 'error' && (
                    <div style={{ background: '#fef2f2', borderRadius: 8, padding: '10px 13px' }}>
                        <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 12, marginBottom: 5 }}>Detalle del error:</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#b91c1c', wordBreak: 'break-all', whiteSpace: 'pre-wrap', maxHeight: 100, overflowY: 'auto' }}>{tarea.error}</div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Modal de fechas para Licitaciones ───────────────────────────────────────

function ModalFechasLI({ onIniciar, onCancelar, iniciando }) {
    const hoy   = new Date();
    const hace7 = new Date(hoy); hace7.setDate(hoy.getDate() - 7);
    const [desde, setDesde] = useState(hace7.toISOString().slice(0, 10));
    const [hasta, setHasta] = useState(hoy.toISOString().slice(0, 10));

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 390, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>🔄 Actualizar Licitaciones</h3>
                <p style={{ margin: '0 0 18px', fontSize: 13, color: '#64748b' }}>Descarga desde Mercado Público, integra maestros y sincroniza con la base de datos.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Desde</label>
                        <input type="date" className="filtro-input" style={{ width: '100%' }} value={desde} onChange={e => setDesde(e.target.value)} />
                    </div>
                    <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Hasta</label>
                        <input type="date" className="filtro-input" style={{ width: '100%' }} value={hasta} onChange={e => setHasta(e.target.value)} />
                    </div>
                </div>
                <div style={{ margin: '14px 0 0', padding: '10px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
                    <div style={{ fontWeight: 600, color: '#475569', marginBottom: 5 }}>Pasos que se ejecutarán:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span>1️⃣  Descarga diaria de licitaciones (Organismo 7296)</span>
                        <span>2️⃣  Integración en maestros + enriquecimiento</span>
                        <span>3️⃣  Sincronización con base de datos</span>
                        <span>4️⃣  Reporte de cambios: nuevas, adjudicadas, estado</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                    <button onClick={onCancelar} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 13, color: '#64748b', fontWeight: 600 }}>Cancelar</button>
                    <button onClick={() => onIniciar(desde, hasta)} disabled={iniciando || !desde || !hasta}
                        style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: (iniciando || !desde || !hasta) ? 0.6 : 1 }}>
                        {iniciando ? '⏳ Iniciando...' : '🚀 Iniciar actualización'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
    { id: 'resumen',    label: '🏠 Resumen' },
    { id: 'gestion',    label: '🚦 Gestión' },
    { id: 'ahorro',     label: '💰 Ahorro' },
    { id: 'calendario', label: '📅 Calendario' },
    { id: 'financiero', label: '📊 Financiero' },
    { id: 'categorias', label: '🗂️ Categorías' },
    { id: 'reportes',   label: '🖨️ Reportes PDF' },
];

const ESTADOS_DISPLAY = {
    'Adjudicada':                              'Adjudicada',
    'Publicada':                               'Publicada',
    'Cerrada':                                 'Cerrada',
    'Revocada':                                'Revocada',
    'Desierta (o art. 3 ó 9 Ley 19.886)':    'Desierta',
};

export default function Dashboard() {
    const [activeTab, setActiveTab] = useState('resumen');
    const [stats, setStats] = useState(null);
    const [licitaciones, setLicitaciones] = useState([]);
    const [detalles, setDetalles] = useState([]);
    const [anosDisponibles, setAnosDisponibles] = useState([]);

    // Filtros globales
    const [filtroAnio, setFiltroAnio] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('');

    // Tabs con carga lazy
    const [gestionData, setGestionData] = useState(null);
    const [ahorroData, setAhorroData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingGestion, setLoadingGestion] = useState(false);
    const [loadingAhorro, setLoadingAhorro] = useState(false);
    const [gestionFailed, setGestionFailed] = useState(false);
    const [ahorroFailed, setAhorroFailed] = useState(false);

    // ETL — Actualización desde dashboard
    const [showModal, setShowModal]   = useState(false);
    const [showPanel, setShowPanel]   = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // Al completar el ETL → abre automáticamente el panel de cambios
    const handleCompletado = useCallback(() => setShowPanel(true), []);
    const { tarea, iniciando, iniciar, cancelar, cerrar } = useActualizarLicitaciones(handleCompletado);

    // Cerrar panel + banner y recargar datos
    const handleCerrarPanel = useCallback(() => {
        setShowPanel(false);
        cerrar();
        setRefreshKey(k => k + 1);
    }, [cerrar]);

    const handleCerrarBanner = useCallback(() => {
        cerrar();
        setRefreshKey(k => k + 1);
    }, [cerrar]);

    const enProceso = !!tarea && ['iniciado', 'en_proceso'].includes(tarea.status);

    // Carga los años disponibles una sola vez al montar
    useEffect(() => {
        api.get('licitaciones/anos/')
            .then(res => setAnosDisponibles(res.data || []))
            .catch(() => {});
    }, []);

    // Re-fetch principal cuando cambian los filtros
    useEffect(() => {
        setLoading(true);
        const qs = new URLSearchParams({ limit: 1000 });
        if (filtroAnio)   qs.append('anio', filtroAnio);
        if (filtroEstado) qs.append('Estado', filtroEstado);

        const qsDet = new URLSearchParams({ limit: 5000 });
        if (filtroAnio) qsDet.append('anio', filtroAnio);

        const statsQs = new URLSearchParams();
        if (filtroAnio)   statsQs.append('anio', filtroAnio);
        if (filtroEstado) statsQs.append('Estado', filtroEstado);

        Promise.all([
            api.get(`dashboard/stats/?${statsQs}`),
            api.get(`licitaciones/?${qs}`),
            api.get(`detalles/?${qsDet}`),
        ]).then(([sRes, lRes, dRes]) => {
            setStats(sRes.data);
            setLicitaciones(lRes.data.results || lRes.data);
            setDetalles(dRes.data.results || dRes.data);
            setLoading(false);
        }).catch(err => {
            console.error('Error fetching data:', err);
            setLoading(false);
        });

        // Al cambiar filtros, resetear tabs lazy para que se recarguen con los nuevos params
        setGestionData(null);
        setAhorroData(null);
        setGestionFailed(false);
        setAhorroFailed(false);
    }, [filtroAnio, filtroEstado, refreshKey]);

    // Carga lazy Gestión
    useEffect(() => {
        if (activeTab === 'gestion' && !gestionData && !loadingGestion && !gestionFailed) {
            setLoadingGestion(true);
            const qs = filtroAnio ? `?anio=${filtroAnio}` : '';
            api.get(`licitaciones/gestion-stats/${qs}`)
                .then(res => setGestionData(res.data))
                .catch(err => {
                    console.error('Error gestion-stats:', err);
                    setGestionFailed(true);
                })
                .finally(() => setLoadingGestion(false));
        }
    }, [activeTab, gestionData, loadingGestion, gestionFailed, filtroAnio]);

    // Carga lazy Ahorro
    useEffect(() => {
        if (activeTab === 'ahorro' && !ahorroData && !loadingAhorro && !ahorroFailed) {
            setLoadingAhorro(true);
            const qs = filtroAnio ? `?anio=${filtroAnio}` : '';
            api.get(`licitaciones/ahorro-stats/${qs}`)
                .then(res => setAhorroData(res.data))
                .catch(err => {
                    console.error('Error ahorro-stats:', err);
                    setAhorroFailed(true);
                })
                .finally(() => setLoadingAhorro(false));
        }
    }, [activeTab, ahorroData, loadingAhorro, ahorroFailed, filtroAnio]);

    return (
        <>
            {/* Modal de fechas */}
            {showModal && (
                <ModalFechasLI
                    iniciando={iniciando}
                    onIniciar={(d, h) => { setShowModal(false); iniciar(d, h); }}
                    onCancelar={() => setShowModal(false)}
                />
            )}

            {/* Panel lateral de cambios */}
            {showPanel && tarea?.diff && (
                <PanelCambiosLI
                    diff={tarea.diff}
                    fechaDesde={tarea.fecha_desde}
                    fechaHasta={tarea.fecha_hasta}
                    onCerrar={handleCerrarPanel}
                />
            )}

            {/* Banner flotante (oculto cuando el panel está abierto) */}
            {tarea && !showPanel && (
                <BannerLI
                    tarea={tarea}
                    onVerCambios={() => setShowPanel(true)}
                    onCerrar={handleCerrarBanner}
                    onCancelar={cancelar}
                />
            )}

            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div className="page-title">
                        <span className="page-title-icon">📄</span> Licitaciones — Mercado Público
                    </div>
                    <div className="page-subtitle">
                        Organismo: SERVICIO DE SALUD OSORNO · Código 7296 · Región de los Lagos
                        {' · '}{stats?.total ?? '…'} licitaciones
                        {filtroAnio ? ` en ${filtroAnio}` : ''}
                        {filtroEstado ? ` · ${ESTADOS_DISPLAY[filtroEstado] || filtroEstado}` : ''}
                    </div>
                </div>
                <button
                    className="btn-actualizar-api"
                    onClick={() => setShowModal(true)}
                    disabled={enProceso}
                    title="Descargar licitaciones desde Mercado Público, integrar maestros y sincronizar con BD"
                >
                    {enProceso ? '⏳ Actualizando...' : '🔄 Actualizar API'}
                </button>
            </div>

            {/* ── Barra de filtros global ── */}
            <div className="filter-bar" style={{ marginBottom: '0', padding: '10px 0 8px', flexWrap: 'wrap', gap: '8px' }}>
                {/* Filtro Año */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: '#666', fontWeight: 600 }}>Año:</span>
                    <button
                        className={`tab-btn${!filtroAnio ? ' active' : ''}`}
                        style={{ fontSize: '12px', padding: '3px 10px' }}
                        onClick={() => setFiltroAnio('')}
                    >
                        Todos
                    </button>
                    {anosDisponibles.map(a => (
                        <button
                            key={a}
                            className={`tab-btn${filtroAnio === String(a) ? ' active' : ''}`}
                            style={{ fontSize: '12px', padding: '3px 10px' }}
                            onClick={() => setFiltroAnio(String(a))}
                        >
                            {a}
                        </button>
                    ))}
                </div>

                {/* Filtro Estado */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#666', fontWeight: 600 }}>Estado:</span>
                    <select
                        className="filter-input"
                        value={filtroEstado}
                        onChange={e => setFiltroEstado(e.target.value)}
                        style={{ minWidth: '160px', fontSize: '12px' }}
                    >
                        <option value="">Todos los estados</option>
                        {Object.entries(ESTADOS_DISPLAY).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                        ))}
                    </select>
                </div>

                {/* Indicador de filtro activo */}
                {(filtroAnio || filtroEstado) && (
                    <button
                        onClick={() => { setFiltroAnio(''); setFiltroEstado(''); }}
                        style={{
                            background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: '12px',
                            color: '#e74c3c', fontSize: '11px', padding: '3px 10px', cursor: 'pointer',
                        }}
                    >
                        ✕ Limpiar filtros
                    </button>
                )}
            </div>

            <div className="tabs-bar">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="loading-spinner">Cargando licitaciones…</div>
            ) : (
                <div className="tab-container">
                    {activeTab === 'resumen'    && <ResumenSect stats={stats} licitaciones={licitaciones} />}
                    {activeTab === 'gestion'    && <GestionSect gestionData={gestionData} loading={loadingGestion} />}
                    {activeTab === 'ahorro'     && <AhorroSect ahorroData={ahorroData} loading={loadingAhorro} />}
                    {activeTab === 'calendario' && <CalendarioSect />}
                    {activeTab === 'financiero' && <FinancieroSect licitaciones={licitaciones} detalles={detalles} />}
                    {activeTab === 'categorias' && <CategoriasSect detalles={detalles} />}
                    {activeTab === 'reportes'   && <ReportesSect licitaciones={licitaciones} />}
                </div>
            )}
        </>
    );
}
