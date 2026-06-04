import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { OrdenesCompraResumen } from '../components/OrdenesCompraResumen';
import { useActualizarOC } from '../features/ordenes-compra/hooks/useActualizarOC';

// ─── Helpers visuales ────────────────────────────────────────────────────────

const clpFmt = n => {
    const num = parseFloat(String(n).replace(/[^0-9.-]/g, ''));
    if (isNaN(num)) return n || '—';
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(num);
};

const fmtIso = iso => {
    if (!iso) return '—';
    const s = iso.split('T')[0];
    const [y, m, d] = s.split('-');
    return d && m && y ? `${d}/${m}/${y}` : iso;
};

const ESTADO_PALETA = {
    'Aceptada':           { bg: '#dcfce7', color: '#15803d' },
    'Enviada':            { bg: '#dbeafe', color: '#1d4ed8' },
    'Recepcion Conforme': { bg: '#cffafe', color: '#0e7490' },
    'Cancelada':          { bg: '#fee2e2', color: '#dc2626' },
    'Pendiente':          { bg: '#ffedd5', color: '#c2410c' },
};

function EstadoBadge({ estado }) {
    const s = ESTADO_PALETA[estado] || { bg: '#f1f5f9', color: '#475569' };
    return (
        <span style={{ background: s.bg, color: s.color, padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {estado || '—'}
        </span>
    );
}

// ─── Tabla OC Nuevas ─────────────────────────────────────────────────────────

function TablaNuevas({ rows }) {
    const TH = ({ children, right }) => (
        <th style={{ padding: '9px 8px', textAlign: right ? 'right' : 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc', fontSize: 12 }}>
            {children}
        </th>
    );
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
                <tr>
                    <TH>Código OC</TH>
                    <TH>Tipo</TH>
                    <TH>Estado</TH>
                    <TH>Proveedor</TH>
                    <TH>Unidad</TH>
                    <TH right>Monto</TH>
                    <TH>F. Envío</TH>
                </tr>
            </thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={r.codigo} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '7px 8px', fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.codigo}</td>
                        <td style={{ padding: '7px 8px', color: '#64748b', fontSize: 11 }}>{r.tipo || '—'}</td>
                        <td style={{ padding: '7px 8px' }}><EstadoBadge estado={r.estado} /></td>
                        <td style={{ padding: '7px 8px', color: '#374151', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.proveedor}>{r.proveedor || '—'}</td>
                        <td style={{ padding: '7px 8px', color: '#6b7280', fontSize: 11, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.unidad}>{r.unidad || '—'}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#374151', fontWeight: 500, whiteSpace: 'nowrap' }}>{clpFmt(r.total)}</td>
                        <td style={{ padding: '7px 8px', color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtIso(r.fecha)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ─── Tabla OC Cambiadas ───────────────────────────────────────────────────────

function TablaCambiadas({ rows }) {
    const TH = ({ children, right }) => (
        <th style={{ padding: '9px 8px', textAlign: right ? 'right' : 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc', fontSize: 12 }}>
            {children}
        </th>
    );
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
                <tr>
                    <TH>Código OC</TH>
                    <TH>Estado anterior</TH>
                    <TH></TH>
                    <TH>Estado nuevo</TH>
                    <TH>Proveedor</TH>
                    <TH>Unidad</TH>
                    <TH right>Monto</TH>
                </tr>
            </thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={r.codigo} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '7px 8px', fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.codigo}</td>
                        <td style={{ padding: '7px 8px' }}><EstadoBadge estado={r.estado_anterior} /></td>
                        <td style={{ padding: '7px 8px', color: '#94a3b8', fontSize: 14, fontWeight: 700 }}>→</td>
                        <td style={{ padding: '7px 8px' }}><EstadoBadge estado={r.estado_nuevo} /></td>
                        <td style={{ padding: '7px 8px', color: '#374151', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.proveedor}>{r.proveedor || '—'}</td>
                        <td style={{ padding: '7px 8px', color: '#6b7280', fontSize: 11, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.unidad}>{r.unidad || '—'}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#374151', fontWeight: 500, whiteSpace: 'nowrap' }}>{clpFmt(r.total)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ─── Panel lateral de cambios ─────────────────────────────────────────────────

function PanelCambiosOC({ diff, fechaDesde, fechaHasta, onCerrar }) {
    const [tab, setTab]       = useState(diff?.nuevas_count > 0 ? 'nuevas' : 'cambiadas');
    const [search, setSearch] = useState('');

    const lista = tab === 'nuevas' ? (diff?.nuevas || []) : (diff?.cambiadas || []);

    const filtrada = useMemo(() => {
        if (!search) return lista;
        const q = search.toLowerCase();
        return lista.filter(r =>
            (r.codigo    || '').toLowerCase().includes(q) ||
            (r.proveedor || '').toLowerCase().includes(q) ||
            (r.nombre    || '').toLowerCase().includes(q)
        );
    }, [lista, search]);

    const visibles = filtrada.slice(0, 300);

    return (
        <>
            {/* Overlay */}
            <div
                onClick={onCerrar}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1200, animation: 'panel-fade 0.2s ease' }}
            />

            {/* Panel */}
            <div style={{
                position: 'fixed', top: 0, right: 0, bottom: 0, width: 660,
                background: '#fff', zIndex: 1201,
                display: 'flex', flexDirection: 'column',
                boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
                animation: 'panel-slide 0.25s ease',
            }}>
                <style>{`
                    @keyframes panel-fade  { from{opacity:0} to{opacity:1} }
                    @keyframes panel-slide { from{transform:translateX(100%)} to{transform:translateX(0)} }
                    .oc-panel-tr:hover { background: #f0fdf4 !important; }
                `}</style>

                {/* Header */}
                <div style={{ background: '#15803d', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>📊 Cambios detectados en Órdenes de Compra</div>
                        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>
                            {fmtIso(fechaDesde)} → {fmtIso(fechaHasta)}
                        </div>
                    </div>
                    <button onClick={onCerrar} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 15, borderRadius: 6, padding: '4px 12px', fontWeight: 700 }}>✕</button>
                </div>

                {/* Resumen chips */}
                <div style={{ padding: '12px 20px', background: '#f0fdf4', borderBottom: '1px solid #dcfce7', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                    <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 8, padding: '5px 14px', fontSize: 13, fontWeight: 700 }}>
                        📥 {diff?.nuevas_count || 0} OC nuevas
                    </span>
                    <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 8, padding: '5px 14px', fontSize: 13, fontWeight: 700 }}>
                        🔄 {diff?.cambiadas_count || 0} cambiaron estado
                    </span>
                    {diff?.total_antes != null && (
                        <span style={{ fontSize: 12, color: '#64748b', marginLeft: 4 }}>
                            Antes: <strong>{(diff.total_antes).toLocaleString('es-CL')}</strong>
                            {diff.total_despues != null && <> → Ahora: <strong>{(diff.total_despues).toLocaleString('es-CL')}</strong></>} OC
                        </span>
                    )}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', paddingLeft: 20, flexShrink: 0 }}>
                    {[
                        { key: 'nuevas',    label: `📥 Nuevas (${diff?.nuevas_count || 0})` },
                        { key: 'cambiadas', label: `🔄 Cambiaron de estado (${diff?.cambiadas_count || 0})` },
                    ].map(t => (
                        <button key={t.key} onClick={() => { setTab(t.key); setSearch(''); }}
                            style={{
                                padding: '11px 18px', background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
                                color: tab === t.key ? '#15803d' : '#64748b',
                                borderBottom: tab === t.key ? '2px solid #15803d' : '2px solid transparent',
                                marginBottom: -2,
                            }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Buscador */}
                <div style={{ padding: '12px 20px 8px', flexShrink: 0 }}>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14 }}>🔍</span>
                        <input
                            type="text"
                            placeholder="Buscar por código, proveedor o nombre..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }}
                        />
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
                            <div style={{ fontSize: 32, marginBottom: 8 }}>{search ? '🔍' : tab === 'nuevas' ? '📥' : '🔄'}</div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>
                                {search
                                    ? 'Sin resultados para la búsqueda'
                                    : tab === 'nuevas'
                                        ? 'No se encontraron OC nuevas en este rango'
                                        : 'No hubo cambios de estado en OC existentes'}
                            </div>
                        </div>
                    ) : tab === 'nuevas' ? (
                        <TablaNuevas rows={visibles} />
                    ) : (
                        <TablaCambiadas rows={visibles} />
                    )}

                    {filtrada.length > 300 && (
                        <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: '#94a3b8', borderTop: '1px solid #f1f5f9', marginTop: 8 }}>
                            Mostrando los primeros 300 de {filtrada.length} resultados. Usa el buscador para filtrar.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
                    <button
                        onClick={onCerrar}
                        style={{ width: '100%', padding: '13px', borderRadius: 8, background: '#15803d', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
                    >
                        ✅ Cerrar y actualizar dashboard
                    </button>
                </div>
            </div>
        </>
    );
}

// ─── Banner de progreso ETL ───────────────────────────────────────────────────

function ocLogColor(line) {
    if (/✅|COMPLETADO|finalizada/.test(line)) return '#4ade80';
    if (/❌|Error/.test(line))                 return '#f87171';
    if (/⚠️|Sin datos/.test(line))             return '#fbbf24';
    if (/✨/.test(line))                        return '#a78bfa';
    if (/🔄|📊|🔗|🚀|>>>/.test(line))          return '#60a5fa';
    return '#94a3b8';
}

function OCStepIcon({ paso, pasoActual, status }) {
    const done   = paso < pasoActual || status === 'completado';
    const active = paso === pasoActual && status === 'en_proceso';
    const err    = status === 'error' && paso === pasoActual;
    if (err)    return <span style={{ color: '#ef4444', fontSize: 15 }}>✗</span>;
    if (done)   return <span style={{ color: '#22c55e', fontSize: 15 }}>✓</span>;
    if (active) return <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid #15803d', borderTopColor: 'transparent', borderRadius: '50%', animation: 'oc-spin 0.8s linear infinite', verticalAlign: 'middle' }} />;
    return <span style={{ color: '#cbd5e1', fontSize: 14 }}>○</span>;
}

function OCBar({ pct, active, color, indeterminate }) {
    return (
        <div style={{ background: '#e2e8f0', borderRadius: 4, height: 7, overflow: 'hidden', position: 'relative' }}>
            {indeterminate ? (
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '40%', background: color, borderRadius: 4, animation: 'oc-indet 1.4s ease-in-out infinite' }} />
            ) : (
                <div style={{
                    width: `${Math.max(2, pct)}%`, height: '100%', borderRadius: 4,
                    background: active && pct < 100
                        ? `repeating-linear-gradient(90deg,${color} 0,${color} 20px,${color}99 20px,${color}99 40px)`
                        : color,
                    backgroundSize: '40px 100%',
                    animation: active && pct < 100 ? 'oc-stripes 0.6s linear infinite' : 'none',
                    transition: 'width 0.7s ease',
                }} />
            )}
        </div>
    );
}

function BannerOC({ tarea, onVerCambios, onCerrar }) {
    const logRef = useRef(null);
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [tarea.logs_recientes]);

    const puedesCerrar = ['completado', 'error'].includes(tarea.status);
    const colorH = tarea.status === 'error' ? '#dc2626' : '#15803d';

    const fmtF = iso => { if (!iso) return '?'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

    const totalDias = tarea.total_dias || 0;
    const diasOk    = tarea.dias_completados || 0;
    const ocsD      = tarea.ocs_dia || 0;
    const totalOcsD = tarea.total_ocs_dia || 0;
    const pct1 = tarea.paso >= 2 || tarea.status === 'completado' ? 100 : (tarea.progreso_pct || 0);
    const pct2 = tarea.status === 'completado' ? 100 : (tarea.progreso_sync_pct || 0);
    const logs = tarea.logs_recientes || [];
    const diff = tarea.diff || {};
    const hayDiff = diff.nuevas_count > 0 || diff.cambiadas_count > 0;

    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1100,
            width: 400, background: '#fff', borderRadius: 14,
            boxShadow: '0 16px 48px rgba(0,0,0,0.22)', overflow: 'hidden',
            border: `2px solid ${colorH}`,
        }}>
            <style>{`
                @keyframes oc-spin    { to { transform: rotate(360deg); } }
                @keyframes oc-stripes { to { background-position: 40px 0; } }
                @keyframes oc-indet   { 0%{left:-40%} 60%{left:100%} 100%{left:100%} }
            `}</style>

            {/* Cabecera */}
            <div style={{ background: colorH, padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {tarea.status === 'completado'
                        ? '✅ Actualización completada'
                        : tarea.status === 'error'
                            ? '❌ Error en actualización'
                            : <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.5)', borderTopColor: '#fff', borderRadius: '50%', animation: 'oc-spin 0.8s linear infinite' }} /> Actualizando Órdenes de Compra</>}
                </div>
                {puedesCerrar && (
                    <button onClick={onCerrar} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>✕</button>
                )}
            </div>

            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Rango */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
                    <span>📅 {fmtF(tarea.fecha_desde)} → {fmtF(tarea.fecha_hasta)}</span>
                    {totalDias > 0 && <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 10, padding: '2px 8px', fontWeight: 600, fontSize: 11 }}>{totalDias} día{totalDias !== 1 ? 's' : ''}</span>}
                </div>

                {/* Paso 1 */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
                        <span style={{ width: 18, textAlign: 'center', flexShrink: 0 }}><OCStepIcon paso={1} pasoActual={tarea.paso} status={tarea.status} /></span>
                        <span style={{ fontWeight: tarea.paso === 1 ? 700 : 500, color: tarea.paso >= 1 ? '#1e293b' : '#94a3b8' }}>Descarga de OC + enlace PAC</span>
                        {tarea.paso === 1 && totalDias > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b', fontWeight: 600 }}>{diasOk}/{totalDias} días</span>}
                    </div>
                    {tarea.paso >= 1 && (
                        <>
                            <div style={{ paddingLeft: 26 }}><OCBar pct={pct1} active={tarea.paso === 1} color="#16a34a" /></div>
                            {tarea.paso === 1 && (
                                <div style={{ paddingLeft: 26, marginTop: 4, fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontStyle: 'italic' }}>{tarea.paso_desc}</span>
                                    {totalOcsD > 0 && <span style={{ color: '#94a3b8' }}>{ocsD}/{totalOcsD} OCs</span>}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Paso 2 */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
                        <span style={{ width: 18, textAlign: 'center', flexShrink: 0 }}><OCStepIcon paso={2} pasoActual={tarea.paso} status={tarea.status} /></span>
                        <span style={{ fontWeight: tarea.paso === 2 ? 700 : 500, color: tarea.paso >= 2 ? '#1e293b' : '#94a3b8' }}>Sincronización con base de datos</span>
                    </div>
                    {tarea.paso >= 2 && (
                        <>
                            <div style={{ paddingLeft: 26 }}><OCBar pct={pct2} active={tarea.paso === 2} color="#7c3aed" indeterminate={tarea.paso === 2 && pct2 === 0} /></div>
                            {tarea.paso === 2 && <div style={{ paddingLeft: 26, marginTop: 4, fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>{tarea.paso_desc}</div>}
                        </>
                    )}
                </div>

                {/* Log terminal */}
                {logs.length > 0 && (
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Actividad reciente</div>
                        <div ref={logRef} style={{ background: '#0f172a', borderRadius: 7, padding: '8px 10px', maxHeight: 120, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#334155 #0f172a' }}>
                            {logs.map((line, i) => (
                                <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: ocLogColor(line), lineHeight: 1.6, wordBreak: 'break-all' }}>{line}</div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Resultado completado */}
                {tarea.status === 'completado' && (
                    <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 13px' }}>
                        <div style={{ fontWeight: 700, color: '#15803d', fontSize: 13, marginBottom: 8 }}>📊 Sincronización completada</div>

                        {/* Chips de resumen */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            {diff.nuevas_count > 0 && (
                                <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>
                                    📥 {diff.nuevas_count} nuevas
                                </span>
                            )}
                            {diff.cambiadas_count > 0 && (
                                <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>
                                    🔄 {diff.cambiadas_count} cambiaron estado
                                </span>
                            )}
                            {!hayDiff && (
                                <span style={{ color: '#64748b', fontSize: 12 }}>Sin cambios detectados en este rango</span>
                            )}
                        </div>

                        {diff.total_despues != null && (
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
                                Total en BD: <strong style={{ color: '#15803d' }}>{(diff.total_despues).toLocaleString('es-CL')}</strong> OC
                                {diff.total_antes != null && diff.total_antes !== diff.total_despues && (
                                    <span style={{ marginLeft: 6, color: '#94a3b8' }}>(antes: {(diff.total_antes).toLocaleString('es-CL')})</span>
                                )}
                            </div>
                        )}

                        {/* Botón ver cambios */}
                        <button onClick={onVerCambios}
                            style={{ width: '100%', padding: '9px', borderRadius: 7, border: '1.5px solid #15803d', background: '#fff', color: '#15803d', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            📋 Ver todos los cambios
                            <span style={{ background: '#15803d', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>
                                {(diff.nuevas_count || 0) + (diff.cambiadas_count || 0)}
                            </span>
                            <span>→</span>
                        </button>
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

// ─── Modal de fechas ──────────────────────────────────────────────────────────

function ModalFechasOC({ onIniciar, onCancelar, iniciando }) {
    const hoy   = new Date();
    const hace7 = new Date(hoy); hace7.setDate(hoy.getDate() - 7);
    const [desde, setDesde] = useState(hace7.toISOString().slice(0, 10));
    const [hasta, setHasta] = useState(hoy.toISOString().slice(0, 10));

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 390, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>🔄 Actualizar Órdenes de Compra</h3>
                <p style={{ margin: '0 0 18px', fontSize: 13, color: '#64748b' }}>Descarga desde Mercado Público, integra maestros, enlaza PAC y sincroniza con BD.</p>

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
                        <span>1️⃣  Descarga diaria de OC (Organismo 7296)</span>
                        <span>2️⃣  Integración en maestros + enlace PAC</span>
                        <span>3️⃣  Sincronización con base de datos</span>
                        <span>4️⃣  Reporte de cambios detectados</span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                    <button onClick={onCancelar} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 13, color: '#64748b', fontWeight: 600 }}>Cancelar</button>
                    <button onClick={() => onIniciar(desde, hasta)} disabled={iniciando || !desde || !hasta}
                        style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: '#15803d', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: (iniciando || !desde || !hasta) ? 0.6 : 1 }}>
                        {iniciando ? '⏳ Iniciando...' : '🚀 Iniciar actualización'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Página principal ─────────────────────────────────────────────────────────

const TABS = [{ id: 'resumen', label: '🏠 Resumen OC' }];

export default function OrdenesCompraDashboard() {
    const [activeTab, setActiveTab]   = useState('resumen');
    const [showModal, setShowModal]   = useState(false);
    const [showPanel, setShowPanel]   = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // Al completar el ETL → abre el panel de cambios automáticamente
    const handleCompletado = useCallback(() => setShowPanel(true), []);

    const { tarea, iniciando, iniciar, cerrar } = useActualizarOC(handleCompletado);

    // Cerrar panel + banner y recargar tabla
    const handleCerrarPanel = useCallback(() => {
        setShowPanel(false);
        cerrar();
        setRefreshKey(k => k + 1);
    }, [cerrar]);

    // Cerrar sólo el banner (sin refrescar)
    const handleCerrarBanner = useCallback(() => {
        cerrar();
        setRefreshKey(k => k + 1);
    }, [cerrar]);

    const enProceso = !!tarea && ['iniciado', 'en_proceso'].includes(tarea.status);

    return (
        <>
            {/* Modal de fechas */}
            {showModal && (
                <ModalFechasOC
                    iniciando={iniciando}
                    onIniciar={(d, h) => { setShowModal(false); iniciar(d, h); }}
                    onCancelar={() => setShowModal(false)}
                />
            )}

            {/* Panel lateral de cambios */}
            {showPanel && tarea?.diff && (
                <PanelCambiosOC
                    diff={tarea.diff}
                    fechaDesde={tarea.fecha_desde}
                    fechaHasta={tarea.fecha_hasta}
                    onCerrar={handleCerrarPanel}
                />
            )}

            {/* Banner flotante (visible mientras no esté el panel abierto) */}
            {tarea && !showPanel && (
                <BannerOC
                    tarea={tarea}
                    onVerCambios={() => setShowPanel(true)}
                    onCerrar={handleCerrarBanner}
                />
            )}

            {/* Encabezado */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div className="page-title">
                        <span className="page-title-icon">🛍️</span> Órdenes de Compra — Mercado Público
                    </div>
                    <div className="page-subtitle">
                        Organismo: SERVICIO DE SALUD OSORNO · Registros de Compras Directas y otros
                    </div>
                </div>
                <button
                    className="btn-actualizar-api"
                    onClick={() => setShowModal(true)}
                    disabled={enProceso}
                    title="Descargar OC desde Mercado Público, integrar maestros, enlazar PAC y sincronizar BD"
                >
                    {enProceso ? '⏳ Actualizando...' : '🔄 Actualizar API'}
                </button>
            </div>

            {/* Tabs */}
            <div className="tabs-bar">
                {TABS.map(tab => (
                    <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="tab-container">
                {activeTab === 'resumen' && <OrdenesCompraResumen key={refreshKey} />}
            </div>
        </>
    );
}
