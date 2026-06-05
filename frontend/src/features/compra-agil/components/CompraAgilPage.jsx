import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useCompraAgil } from '../hooks/useCompraAgil';
import { useActualizarCompraAgil } from '../hooks/useActualizarCompraAgil';
import ResumenTab from './tabs/ResumenTab';
import AhorroTab from './tabs/AhorroTab';
import ComprasTable from './tabs/ComprasTable';
import ProveedoresTab from './tabs/ProveedoresTab';
import ComparativaTab from './tabs/ComparativaTab';
import CalendarioTab from './tabs/CalendarioTab';
import { generarPDFCompraAgil } from '../utils/pdfExport';
import { getCompraAgilAnios } from '../api/compraAgilApi';

const TABS = [
    { id: 'resumen', label: '📊 Resumen' },
    { id: 'ahorro', label: '💰 Ahorro' },
    { id: 'compras', label: '🛒 Compras Ágiles' },
    { id: 'proveedores', label: '🏢 Proveedores' },
    { id: 'comparativa', label: '📈 Comparativa' },
    { id: 'calendario', label: '📅 Calendario' },
];

// ── Helpers visuales ETL ─────────────────────────────────────────────────────

const CA_COLOR = '#0ea5e9';

function caLogColor(line) {
    if (/✅|COMPLETADO/.test(line)) return '#4ade80';
    if (/⊗|❌/.test(line))         return '#f87171';
    if (/⚠️/.test(line))           return '#fbbf24';
    if (/✨/.test(line))            return '#a78bfa';
    if (/🔄|📊|🔗|🚀|💾/.test(line)) return '#60a5fa';
    return '#94a3b8';
}

const CA_ESTADO_PAL = {
    'proveedor_seleccionado': { bg: '#dcfce7', color: '#15803d' },
    'oc_emitida':             { bg: '#cffafe', color: '#0e7490' },
    'publicada':              { bg: '#dbeafe', color: '#1d4ed8' },
    'cerrada':                { bg: '#f1f5f9', color: '#475569' },
    'desierta':               { bg: '#ffedd5', color: '#c2410c' },
    'cancelada':              { bg: '#fee2e2', color: '#dc2626' },
};

function CAEstadoBadge({ estado }) {
    const key = (estado || '').toLowerCase().trim();
    const s = CA_ESTADO_PAL[key] || { bg: '#f1f5f9', color: '#475569' };
    return (
        <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {estado || '—'}
        </span>
    );
}

function CAStepIcon({ paso, pasoActual, status }) {
    const done   = paso < pasoActual || status === 'completado';
    const active = paso === pasoActual && status === 'en_proceso';
    const err    = status === 'error' && paso === pasoActual;
    if (err)    return <span style={{ color: '#ef4444', fontSize: 15 }}>✗</span>;
    if (done)   return <span style={{ color: '#22c55e', fontSize: 15 }}>✓</span>;
    if (active) return <span style={{ display: 'inline-block', width: 13, height: 13, border: `2px solid ${CA_COLOR}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'ca-spin 0.8s linear infinite', verticalAlign: 'middle' }} />;
    return <span style={{ color: '#cbd5e1', fontSize: 14 }}>○</span>;
}

function CABar({ pct, active, color, indeterminate }) {
    return (
        <div style={{ background: '#e2e8f0', borderRadius: 4, height: 7, overflow: 'hidden', position: 'relative' }}>
            {indeterminate ? (
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '40%', background: color, borderRadius: 4, animation: 'ca-indet 1.4s ease-in-out infinite' }} />
            ) : (
                <div style={{
                    width: `${Math.max(2, pct)}%`, height: '100%', borderRadius: 4,
                    background: active && pct < 100
                        ? `repeating-linear-gradient(90deg,${color} 0,${color} 20px,${color}99 20px,${color}99 40px)`
                        : color,
                    backgroundSize: '40px 100%',
                    animation: active && pct < 100 ? 'ca-stripes 0.6s linear infinite' : 'none',
                    transition: 'width 0.7s ease',
                }} />
            )}
        </div>
    );
}

// ── Tablas del panel ──────────────────────────────────────────────────────────

const clpCA = n => {
    const num = parseFloat(String(n).replace(/[^0-9.-]/g, ''));
    if (isNaN(num) || num === 0) return '—';
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(num);
};

const fmtDtCA = s => {
    if (!s || s === 'None') return '—';
    const base = s.split('T')[0];
    const [y, m, d] = base.split('-');
    return d && m && y ? `${d}/${m}/${y}` : '—';
};

function TH({ c, right }) {
    return <th style={{ padding: '9px 8px', textAlign: right ? 'right' : 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', fontSize: 12, whiteSpace: 'nowrap' }}>{c}</th>;
}

function TablaNuevasCA({ rows }) {
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr><TH c="Código CA" /><TH c="Estado" /><TH c="Unidad" /><TH c="Presupuesto" right /><TH c="Cierre" /><TH c="Ofertas" right /></tr></thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={r.codigo} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '7px 8px', fontFamily: 'monospace', fontSize: 11, color: '#0ea5e9', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.codigo}</td>
                        <td style={{ padding: '7px 8px' }}><CAEstadoBadge estado={r.estado} /></td>
                        <td style={{ padding: '7px 8px', color: '#64748b', fontSize: 11, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.unidad}>{r.unidad || '—'}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#374151', whiteSpace: 'nowrap' }}>{clpCA(r.monto)}</td>
                        <td style={{ padding: '7px 8px', color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDtCA(r.cierre)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#64748b', fontSize: 11 }}>{r.ofertas || '—'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function TablaCambiadasCA({ rows }) {
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr><TH c="Código CA" /><TH c="Antes" /><TH c="" /><TH c="Ahora" /><TH c="Unidad" /><TH c="Presupuesto" right /></tr></thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={r.codigo} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '7px 8px', fontFamily: 'monospace', fontSize: 11, color: '#0ea5e9', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.codigo}</td>
                        <td style={{ padding: '7px 8px' }}><CAEstadoBadge estado={r.estado_anterior} /></td>
                        <td style={{ padding: '7px 8px', color: '#94a3b8', fontSize: 14, fontWeight: 700 }}>→</td>
                        <td style={{ padding: '7px 8px' }}><CAEstadoBadge estado={r.estado_nuevo} /></td>
                        <td style={{ padding: '7px 8px', color: '#64748b', fontSize: 11, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.unidad}>{r.unidad || '—'}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#374151', whiteSpace: 'nowrap' }}>{clpCA(r.monto)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function TablaOCVinculadasCA({ rows }) {
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr><TH c="Código CA" /><TH c="Estado" /><TH c="OC Vinculada" /><TH c="Unidad" /><TH c="Presupuesto" right /></tr></thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={r.codigo} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '7px 8px', fontFamily: 'monospace', fontSize: 11, color: '#0ea5e9', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.codigo}</td>
                        <td style={{ padding: '7px 8px' }}><CAEstadoBadge estado={r.estado} /></td>
                        <td style={{ padding: '7px 8px', fontFamily: 'monospace', fontSize: 11, color: '#15803d', fontWeight: 600 }}>{r.oc_codigo || '—'}</td>
                        <td style={{ padding: '7px 8px', color: '#64748b', fontSize: 11, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.unidad}>{r.unidad || '—'}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#374151', whiteSpace: 'nowrap' }}>{clpCA(r.monto)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ── Panel lateral de cambios en Compra Ágil ───────────────────────────────────

function PanelCambiosCA({ diff, fechaDesde, fechaHasta, onCerrar }) {
    const [tab, setTab]       = useState(() => diff?.oc_vinculadas_count > 0 ? 'oc' : diff?.nuevas_count > 0 ? 'nuevas' : 'cambiadas');
    const [search, setSearch] = useState('');

    const lista = tab === 'nuevas' ? (diff?.nuevas || []) : tab === 'oc' ? (diff?.oc_vinculadas || []) : (diff?.cambiadas || []);

    const filtrada = useMemo(() => {
        if (!search) return lista;
        const q = search.toLowerCase();
        return lista.filter(r =>
            (r.codigo  || '').toLowerCase().includes(q) ||
            (r.unidad  || '').toLowerCase().includes(q) ||
            (r.oc_codigo || '').toLowerCase().includes(q)
        );
    }, [lista, search]);

    const visibles = filtrada.slice(0, 300);

    const TABS_PANEL = [
        { key: 'nuevas',    label: `📥 Nuevas (${diff?.nuevas_count || 0})` },
        { key: 'cambiadas', label: `🔄 Cambiaron (${diff?.cambiadas_count || 0})` },
        { key: 'oc',        label: `🔗 OC Vinculadas (${diff?.oc_vinculadas_count || 0})` },
    ];

    const fmtF = iso => { if (!iso) return '?'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1200, animation: 'ca-panel-fade 0.2s ease' }} />
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 660, background: '#fff', zIndex: 1201, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)', animation: 'ca-panel-slide 0.25s ease' }}>
                <style>{`
                    @keyframes ca-panel-fade  { from{opacity:0} to{opacity:1} }
                    @keyframes ca-panel-slide { from{transform:translateX(100%)} to{transform:translateX(0)} }
                `}</style>

                {/* Header */}
                <div style={{ background: CA_COLOR, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>🛒 Cambios detectados en Compra Ágil</div>
                        <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>{fmtF(fechaDesde)} → {fmtF(fechaHasta)}</div>
                    </div>
                    <button onClick={onCerrar} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 15, borderRadius: 6, padding: '4px 12px', fontWeight: 700 }}>✕</button>
                </div>

                {/* Chips resumen */}
                <div style={{ padding: '12px 20px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                    <span style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: 8, padding: '5px 14px', fontSize: 13, fontWeight: 700 }}>📥 {diff?.nuevas_count || 0} nuevas</span>
                    <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 8, padding: '5px 14px', fontSize: 13, fontWeight: 700 }}>🔄 {diff?.cambiadas_count || 0} cambiaron</span>
                    {(diff?.oc_vinculadas_count || 0) > 0 && (
                        <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 8, padding: '5px 14px', fontSize: 13, fontWeight: 700 }}>🔗 {diff.oc_vinculadas_count} OC vinculadas</span>
                    )}
                    {diff?.total_antes != null && (
                        <span style={{ fontSize: 12, color: '#64748b', marginLeft: 4 }}>
                            Antes: <strong>{(diff.total_antes).toLocaleString('es-CL')}</strong>
                            {diff.total_despues != null && <> → Ahora: <strong>{(diff.total_despues).toLocaleString('es-CL')}</strong></>}
                        </span>
                    )}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', paddingLeft: 20, flexShrink: 0 }}>
                    {TABS_PANEL.map(t => (
                        <button key={t.key} onClick={() => { setTab(t.key); setSearch(''); }}
                            style={{ padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.key ? 700 : 400, color: tab === t.key ? CA_COLOR : '#64748b', borderBottom: tab === t.key ? `2px solid ${CA_COLOR}` : '2px solid transparent', marginBottom: -2 }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Buscador */}
                <div style={{ padding: '12px 20px 8px', flexShrink: 0 }}>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14 }}>🔍</span>
                        <input type="text" placeholder="Buscar por código, unidad u OC..."
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

                {/* Tabla */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', minHeight: 0 }}>
                    {visibles.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>{search ? '🔍' : tab === 'nuevas' ? '📥' : tab === 'oc' ? '🔗' : '🔄'}</div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>
                                {search ? 'Sin resultados'
                                    : tab === 'nuevas' ? 'No hay Compras Ágiles nuevas'
                                    : tab === 'oc' ? 'No hay OC recién vinculadas'
                                    : 'No hubo cambios de estado'}
                            </div>
                        </div>
                    ) : tab === 'nuevas' ? (
                        <TablaNuevasCA rows={visibles} />
                    ) : tab === 'oc' ? (
                        <TablaOCVinculadasCA rows={visibles} />
                    ) : (
                        <TablaCambiadasCA rows={visibles} />
                    )}
                    {filtrada.length > 300 && (
                        <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: '#94a3b8', borderTop: '1px solid #f1f5f9', marginTop: 8 }}>
                            Mostrando los primeros 300 de {filtrada.length} resultados.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
                    <button onClick={onCerrar} style={{ width: '100%', padding: '13px', borderRadius: 8, background: CA_COLOR, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                        ✅ Cerrar y actualizar dashboard
                    </button>
                </div>
            </div>
        </>
    );
}

// ── Banner de progreso ETL ─────────────────────────────────────────────────────

function BannerActualizacion({ tarea, onVerCambios, onCerrar, onCancelar }) {
    const logRef = useRef(null);
    const [confirmando, setConfirmando] = useState(false);

    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [tarea.logs_recientes]);

    const enProceso   = ['iniciado', 'en_proceso'].includes(tarea.status);
    const colorH = tarea.status === 'error' ? '#dc2626'
        : tarea.status === 'cancelado' ? '#64748b'
        : tarea.status === 'completado' ? '#0369a1'
        : CA_COLOR;

    const handleXClick = () => {
        if (enProceso) { setConfirmando(true); }
        else { onCerrar(); }
    };

    const handleConfirmarCancelar = async () => {
        setConfirmando(false);
        await onCancelar();
    };

    const fmtF = iso => { if (!iso) return '?'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

    const totalDias = tarea.total_dias || 0;
    const diasOk    = tarea.dias_completados || 0;
    const pct1 = tarea.paso >= 2 || tarea.status === 'completado' ? 100 : (tarea.progreso_pct || 0);
    const pct2 = tarea.status === 'completado' ? 100 : (tarea.progreso_sync_pct || 0);
    const logs = tarea.logs_recientes || [];
    const diff = tarea.diff || {};
    const totalCambios = (diff.nuevas_count || 0) + (diff.cambiadas_count || 0) + (diff.oc_vinculadas_count || 0);

    return (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1100, width: 400, background: '#fff', borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,0.22)', overflow: 'hidden', border: `2px solid ${colorH}`, position: 'fixed' }}>
            <style>{`
                @keyframes ca-spin    { to { transform: rotate(360deg); } }
                @keyframes ca-stripes { to { background-position: 40px 0; } }
                @keyframes ca-indet   { 0%{left:-40%} 60%{left:100%} 100%{left:100%} }
            `}</style>

            {/* Diálogo de confirmación de cancelación */}
            {confirmando && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.88)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14 }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: '22px 20px', textAlign: 'center', width: 300, margin: '0 16px' }}>
                        <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 6 }}>¿Detener la actualización?</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 18, lineHeight: 1.5 }}>
                            Se interrumpirá el proceso en curso. Los datos descargados hasta ahora se descartarán.
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button onClick={() => setConfirmando(false)} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                                No, continuar
                            </button>
                            <button onClick={handleConfirmarCancelar} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                                Sí, detener
                            </button>
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
                        : <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.5)', borderTopColor: '#fff', borderRadius: '50%', animation: 'ca-spin 0.8s linear infinite' }} /> Actualizando Compra Ágil</>}
                </div>
                <button onClick={handleXClick} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Rango */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
                    <span>📅 {fmtF(tarea.fecha_desde)} → {fmtF(tarea.fecha_hasta)}</span>
                    {totalDias > 0 && <span style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: 10, padding: '2px 8px', fontWeight: 600, fontSize: 11 }}>{totalDias} día{totalDias !== 1 ? 's' : ''}</span>}
                </div>

                {/* Paso 1 */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
                        <span style={{ width: 18, textAlign: 'center', flexShrink: 0 }}><CAStepIcon paso={1} pasoActual={tarea.paso} status={tarea.status} /></span>
                        <span style={{ fontWeight: tarea.paso === 1 ? 700 : 500, color: tarea.paso >= 1 ? '#1e293b' : '#94a3b8' }}>Descarga y enlace de OC</span>
                        {tarea.paso === 1 && totalDias > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b', fontWeight: 600 }}>{diasOk}/{totalDias}</span>}
                    </div>
                    {tarea.paso >= 1 && (
                        <>
                            <div style={{ paddingLeft: 26 }}><CABar pct={pct1} active={tarea.paso === 1} color={CA_COLOR} /></div>
                            {tarea.paso === 1 && (
                                <div style={{ paddingLeft: 26, marginTop: 4, fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontStyle: 'italic' }}>{tarea.paso_desc}</span>
                                    {tarea.dia_actual && <span style={{ color: '#94a3b8' }}>→ {tarea.dia_actual}</span>}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Paso 2 */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
                        <span style={{ width: 18, textAlign: 'center', flexShrink: 0 }}><CAStepIcon paso={2} pasoActual={tarea.paso} status={tarea.status} /></span>
                        <span style={{ fontWeight: tarea.paso === 2 ? 700 : 500, color: tarea.paso >= 2 ? '#1e293b' : '#94a3b8' }}>Sincronización con base de datos</span>
                        {tarea.paso === 2 && tarea.tablas_sync > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b', fontWeight: 600 }}>{tarea.tablas_sync}/5</span>}
                    </div>
                    {tarea.paso >= 2 && (
                        <>
                            <div style={{ paddingLeft: 26 }}><CABar pct={pct2} active={tarea.paso === 2} color="#7c3aed" indeterminate={tarea.paso === 2 && pct2 === 0} /></div>
                            {tarea.paso === 2 && tarea.ultima_tabla_sync && <div style={{ paddingLeft: 26, marginTop: 4, fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>{tarea.ultima_tabla_sync}</div>}
                        </>
                    )}
                </div>

                {/* Log terminal */}
                {logs.length > 0 && (
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Actividad reciente</div>
                        <div ref={logRef} style={{ background: '#0f172a', borderRadius: 7, padding: '8px 10px', maxHeight: 110, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#334155 #0f172a' }}>
                            {logs.map((line, i) => (
                                <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: caLogColor(line), lineHeight: 1.6, wordBreak: 'break-all' }}>{line}</div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Resultado completado */}
                {tarea.status === 'completado' && (
                    <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '10px 13px' }}>
                        <div style={{ fontWeight: 700, color: '#0369a1', fontSize: 13, marginBottom: 8 }}>📊 Sincronización completada</div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            {(diff.nuevas_count || 0) > 0 && <span style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>📥 {diff.nuevas_count} nuevas</span>}
                            {(diff.cambiadas_count || 0) > 0 && <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>🔄 {diff.cambiadas_count} cambiaron</span>}
                            {(diff.oc_vinculadas_count || 0) > 0 && <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>🔗 {diff.oc_vinculadas_count} OC vinculadas</span>}
                            {totalCambios === 0 && <span style={{ color: '#64748b', fontSize: 12 }}>Sin cambios detectados</span>}
                        </div>
                        {diff.total_despues != null && (
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
                                Total en BD: <strong style={{ color: '#0369a1' }}>{(diff.total_despues).toLocaleString('es-CL')}</strong> compras ágiles
                            </div>
                        )}
                        <button onClick={onVerCambios} style={{ width: '100%', padding: '9px', borderRadius: 7, border: `1.5px solid ${CA_COLOR}`, background: '#fff', color: CA_COLOR, cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            📋 Ver todos los cambios
                            <span style={{ background: CA_COLOR, color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{totalCambios}</span>
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

// Hook de debounce: retarda la actualización de un valor N ms
function useDebounce(value, delay = 400) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

export default function CompraAgilPage() {
    const [tab, setTab] = useState('resumen');
    const [anio, setAnio] = useState('');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [generandoPDF, setGenerandoPDF] = useState(false);
    const [anosDisponibles, setAnosDisponibles] = useState([]);
    const [showModalActualizar, setShowModalActualizar] = useState(false);
    const [showPanel, setShowPanel]                   = useState(false);

    // Fechas para el modal — por defecto los últimos 7 días
    const hoy = new Date();
    const hace7 = new Date(hoy); hace7.setDate(hoy.getDate() - 7);
    const [modalFechaDesde, setModalFechaDesde] = useState(hace7.toISOString().slice(0, 10));
    const [modalFechaHasta, setModalFechaHasta] = useState(hoy.toISOString().slice(0, 10));

    // Los filtros para la API usan debounce — los inputs se actualizan al instante
    // pero las llamadas a la API esperan 400ms desde el último cambio
    const fechaDesdeDebounced = useDebounce(fechaDesde, 400);
    const fechaHastaDebounced = useDebounce(fechaHasta, 400);

    useEffect(() => {
        getCompraAgilAnios()
            .then(({ data }) => setAnosDisponibles(data))
            .catch(() => setAnosDisponibles([]));
    }, []);

    const filtros = { fechaDesde: fechaDesdeDebounced, fechaHasta: fechaHastaDebounced };
    const { stats, loadingStats, errorStats, compras, loadingCompras, errorCompras, proveedores, loadingProveedores, refresh } =
        useCompraAgil(filtros);

    // Al completar → abre el panel de cambios automáticamente
    const handleCompletadoCA = useCallback(() => setShowPanel(true), []);

    const { tarea: tareaActualizacion, iniciando: iniciandoActualizacion, iniciar: iniciarActualizacion, cancelar: cancelarActualizacion, cerrar: cerrarTarea } =
        useActualizarCompraAgil(handleCompletadoCA);

    // Cerrar panel + banner → refresca el dashboard
    const handleCerrarPanel = useCallback(() => {
        setShowPanel(false);
        cerrarTarea();
        refresh();
    }, [cerrarTarea, refresh]);

    // Cerrar solo el banner (sin abrir el panel)
    const handleCerrarBanner = useCallback(() => {
        cerrarTarea();
        refresh();
    }, [cerrarTarea, refresh]);

    const handleIniciarActualizacion = () => {
        setShowModalActualizar(false);
        iniciarActualizacion(modalFechaDesde, modalFechaHasta);
    };

    const enProceso = !!tareaActualizacion && ['iniciado', 'en_proceso'].includes(tareaActualizacion.status);

    const chartsRef = useRef({});

    // Al seleccionar año → llena el rango de fechas automáticamente
    const handleAnioChange = (value) => {
        setAnio(value);
        if (value) {
            setFechaDesde(`${value}-01-01`);
            setFechaHasta(`${value}-12-31`);
        } else {
            setFechaDesde('');
            setFechaHasta('');
        }
    };

    // Si el usuario edita manualmente las fechas → desvincula el año
    const handleFechaDesdeChange = (value) => {
        setFechaDesde(value);
        setAnio('');
    };

    const handleFechaHastaChange = (value) => {
        setFechaHasta(value);
        setAnio('');
    };

    const handleLimpiarFiltros = () => {
        setAnio('');
        setFechaDesde('');
        setFechaHasta('');
    };

    const handleExportarPDF = async () => {
        if (!stats) return;
        setGenerandoPDF(true);
        try {
            await generarPDFCompraAgil({
                stats,
                compras,
                proveedores,
                filtros: { fechaDesde, fechaHasta, anio },
                chartsRef: chartsRef.current,
            });
        } finally {
            setGenerandoPDF(false);
        }
    };

    const hayFiltros = fechaDesde || fechaHasta || anio;

    return (
        <div className="feature-page">
            {/* ── Panel lateral de cambios ── */}
            {showPanel && tareaActualizacion?.diff && (
                <PanelCambiosCA
                    diff={tareaActualizacion.diff}
                    fechaDesde={tareaActualizacion.fecha_desde}
                    fechaHasta={tareaActualizacion.fecha_hasta}
                    onCerrar={handleCerrarPanel}
                />
            )}

            {/* ── Banner flotante (oculto cuando el panel está abierto) ── */}
            {tareaActualizacion && !showPanel && (
                <BannerActualizacion
                    tarea={tareaActualizacion}
                    onVerCambios={() => setShowPanel(true)}
                    onCerrar={handleCerrarBanner}
                    onCancelar={cancelarActualizacion}
                />
            )}

            {/* ── Encabezado ── */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 className="page-title">Compra Ágil</h1>
                    <p className="page-subtitle">Análisis de compras por convenio marco — Organismo 7296</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn-actualizar-api" onClick={() => setShowModalActualizar(true)} disabled={enProceso}
                        title="Descargar nuevos datos desde Mercado Público y sincronizar">
                        {enProceso ? '⏳ Actualizando...' : '🔄 Actualizar API'}
                    </button>
                    <button className="btn-pdf" onClick={handleExportarPDF} disabled={generandoPDF || loadingStats}
                        title="Generar reporte PDF completo con los filtros activos">
                        {generandoPDF ? '⏳ Generando...' : '🖨️ Reporte PDF'}
                    </button>
                </div>
            </div>

            {/* ── Modal de fechas ── */}
            {showModalActualizar && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 390, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>🔄 Actualizar Compra Ágil</h3>
                        <p style={{ margin: '0 0 18px', fontSize: 13, color: '#64748b' }}>Descarga desde Mercado Público, integra maestros y sincroniza con la base de datos.</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Desde</label>
                                <input type="date" className="filtro-input" style={{ width: '100%' }} value={modalFechaDesde} onChange={e => setModalFechaDesde(e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Hasta</label>
                                <input type="date" className="filtro-input" style={{ width: '100%' }} value={modalFechaHasta} onChange={e => setModalFechaHasta(e.target.value)} />
                            </div>
                        </div>
                        <div style={{ margin: '14px 0 0', padding: '10px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
                            <div style={{ fontWeight: 600, color: '#475569', marginBottom: 5 }}>Pasos que se ejecutarán:</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <span>1️⃣  Descarga diaria de Compras Ágiles (SSO, Región Los Lagos)</span>
                                <span>2️⃣  Integración en maestros + enlace de OC</span>
                                <span>3️⃣  Sincronización con base de datos (5 tablas)</span>
                                <span>4️⃣  Reporte de cambios: nuevas, estado, OC vinculadas</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowModalActualizar(false)} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 13, color: '#64748b', fontWeight: 600 }}>Cancelar</button>
                            <button onClick={handleIniciarActualizacion} disabled={iniciandoActualizacion || !modalFechaDesde || !modalFechaHasta}
                                style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: CA_COLOR, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: (iniciandoActualizacion || !modalFechaDesde || !modalFechaHasta) ? 0.6 : 1 }}>
                                {iniciandoActualizacion ? '⏳ Iniciando...' : '🚀 Iniciar actualización'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Filtros globales ── */}
            <div className="card filtro-global-bar">
                <div className="filtro-global-inner">
                    {/* Selector de año */}
                    <div className="filtro-group">
                        <span className="filtro-label">📆 Año:</span>
                        <div className="anio-selector">
                            <button
                                className={`anio-btn${!anio ? ' active' : ''}`}
                                onClick={() => handleAnioChange('')}
                            >
                                Todos
                            </button>
                            {anosDisponibles.map(a => (
                                <button
                                    key={a}
                                    className={`anio-btn${anio === String(a) ? ' active' : ''}`}
                                    onClick={() => handleAnioChange(String(a))}
                                >
                                    {a}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Separador */}
                    <div className="filtro-separator" />

                    {/* Rango de fechas */}
                    <span className="filtro-label">📅 Período:</span>
                    <div className="filtro-group">
                        <label>Desde</label>
                        <input
                            type="date"
                            className="filtro-input"
                            value={fechaDesde}
                            onChange={e => handleFechaDesdeChange(e.target.value)}
                        />
                    </div>
                    <div className="filtro-group">
                        <label>Hasta</label>
                        <input
                            type="date"
                            className="filtro-input"
                            value={fechaHasta}
                            onChange={e => handleFechaHastaChange(e.target.value)}
                        />
                    </div>

                    {hayFiltros && (
                        <button className="btn-limpiar" onClick={handleLimpiarFiltros}>
                            ✕ Limpiar
                        </button>
                    )}
                    {hayFiltros && (
                        <span className="filtro-activo-badge">
                            {anio ? `Año ${anio}` : `${fechaDesde || '…'} → ${fechaHasta || '…'}`}
                        </span>
                    )}
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className="tabs-bar">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        className={`tab-btn${tab === t.id ? ' active' : ''}`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── Contenido de tabs ── */}
            {errorStats && (
                <div className="error-message" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <span>⚠️ {errorStats}</span>
                    <button
                        onClick={() => refresh()}
                        style={{ padding: '4px 14px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#dc2626', fontWeight: 600 }}
                    >
                        🔄 Reintentar
                    </button>
                </div>
            )}

            {tab === 'resumen' && (
                <ResumenTab stats={stats} loading={loadingStats} chartsRef={chartsRef} />
            )}
            {tab === 'ahorro' && (
                <AhorroTab stats={stats} loading={loadingStats} chartsRef={chartsRef} />
            )}
            {tab === 'compras' && (
                <ComprasTable
                    compras={compras}
                    loading={loadingCompras}
                    error={errorCompras}
                    filtros={filtros}
                />
            )}
            {tab === 'proveedores' && (
                <ProveedoresTab
                    stats={stats}
                    loading={loadingStats || loadingProveedores}
                />
            )}
            {tab === 'comparativa' && (
                <ComparativaTab />
            )}
            {tab === 'calendario' && (
                <CalendarioTab />
            )}
        </div>
    );
}
