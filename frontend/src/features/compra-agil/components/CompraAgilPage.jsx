import React, { useState, useRef, useEffect, useCallback } from 'react';
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

// ── Helpers del banner ──────────────────────────────────────────────────────

function getLogColor(line) {
    if (/✅|COMPLETADO/.test(line)) return '#4ade80';
    if (/⊗|❌/.test(line)) return '#f87171';
    if (/⚠️/.test(line)) return '#fbbf24';
    if (/✨/.test(line)) return '#a78bfa';
    if (/🔄|📊|🔗|🚀|💾/.test(line)) return '#60a5fa';
    return '#94a3b8';
}

function CASpinner() {
    return (
        <span style={{
            display: 'inline-block', width: 12, height: 12,
            border: '2px solid rgba(255,255,255,0.5)', borderTopColor: '#fff',
            borderRadius: '50%', animation: 'ca-spin 0.8s linear infinite',
            verticalAlign: 'middle', flexShrink: 0,
        }} />
    );
}

function StepIcon({ paso, pasoActual, status }) {
    const done = paso < pasoActual || status === 'completado';
    const active = paso === pasoActual && status === 'en_proceso';
    const hasError = status === 'error' && paso === pasoActual;
    if (hasError) return <span style={{ color: '#ef4444', fontSize: 15, lineHeight: 1 }}>✗</span>;
    if (done) return <span style={{ color: '#22c55e', fontSize: 15, lineHeight: 1 }}>✓</span>;
    if (active) return (
        <span style={{
            display: 'inline-block', width: 13, height: 13,
            border: '2px solid #2563eb', borderTopColor: 'transparent',
            borderRadius: '50%', animation: 'ca-spin 0.8s linear infinite',
            verticalAlign: 'middle',
        }} />
    );
    return <span style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1 }}>○</span>;
}

function ProgressBar({ pct, active, color, indeterminate }) {
    const stripeColor = color + '99';
    return (
        <div style={{ background: '#e2e8f0', borderRadius: 4, height: 7, overflow: 'hidden', position: 'relative' }}>
            {indeterminate ? (
                <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%', width: '40%',
                    background: color, borderRadius: 4,
                    animation: 'ca-indeterminate 1.4s ease-in-out infinite',
                }} />
            ) : (
                <div style={{
                    width: `${Math.max(2, pct)}%`, height: '100%', borderRadius: 4,
                    background: active && pct < 100
                        ? `repeating-linear-gradient(90deg, ${color} 0, ${color} 20px, ${stripeColor} 20px, ${stripeColor} 40px)`
                        : color,
                    backgroundSize: '40px 100%',
                    animation: active && pct < 100 ? 'ca-stripes 0.6s linear infinite' : 'none',
                    transition: 'width 0.7s ease',
                }} />
            )}
        </div>
    );
}

function BannerActualizacion({ tarea, onCerrar }) {
    const logRef = useRef(null);

    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [tarea.logs_recientes]);

    const puedesCerrar = ['completado', 'error'].includes(tarea.status);
    const colorHeader = tarea.status === 'error' ? '#dc2626'
        : tarea.status === 'completado' ? '#16a34a'
        : '#1d4ed8';

    const fmtFecha = (iso) => {
        if (!iso) return '?';
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    };

    const totalDias = tarea.total_dias || 0;
    const diasOk = tarea.dias_completados || 0;
    const pct1 = tarea.paso >= 2 || tarea.status === 'completado' ? 100 : (tarea.progreso_pct || 0);
    const pct2 = tarea.status === 'completado' ? 100 : (tarea.progreso_sync_pct || 0);
    const logs = tarea.logs_recientes || [];

    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1100,
            width: 390, background: '#fff', borderRadius: 14,
            boxShadow: '0 16px 48px rgba(0,0,0,0.22)', overflow: 'hidden',
            border: `2px solid ${colorHeader}`,
        }}>
            <style>{`
                @keyframes ca-spin { to { transform: rotate(360deg); } }
                @keyframes ca-stripes { to { background-position: 40px 0; } }
                @keyframes ca-indeterminate {
                    0% { left: -40%; } 60% { left: 100%; } 100% { left: 100%; }
                }
            `}</style>

            {/* ── Cabecera ── */}
            <div style={{ background: colorHeader, padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontWeight: 700, fontSize: 13 }}>
                    {tarea.status === 'completado' ? '✅ Actualización completada'
                        : tarea.status === 'error' ? '❌ Error en actualización'
                        : <><CASpinner /> Actualizando Compra Ágil</>}
                </div>
                {puedesCerrar && (
                    <button onClick={onCerrar} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, borderRadius: 4, padding: '2px 7px', fontWeight: 700, lineHeight: 1.4 }}>✕</button>
                )}
            </div>

            {/* ── Cuerpo ── */}
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Rango de fechas */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
                    <span>📅 {fmtFecha(tarea.fecha_desde)} → {fmtFecha(tarea.fecha_hasta)}</span>
                    {totalDias > 0 && (
                        <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 10, padding: '2px 8px', fontWeight: 600, fontSize: 11 }}>
                            {totalDias} día{totalDias !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {/* ── Paso 1 ── */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
                        <span style={{ width: 18, textAlign: 'center', flexShrink: 0 }}>
                            <StepIcon paso={1} pasoActual={tarea.paso} status={tarea.status} />
                        </span>
                        <span style={{ fontWeight: tarea.paso === 1 ? 700 : 500, color: tarea.paso >= 1 ? '#1e293b' : '#94a3b8' }}>
                            Descarga y enlace de OC
                        </span>
                        {tarea.paso === 1 && totalDias > 0 && (
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {diasOk}/{totalDias}
                            </span>
                        )}
                    </div>
                    {tarea.paso >= 1 && (
                        <>
                            <div style={{ paddingLeft: 26 }}>
                                <ProgressBar pct={pct1} active={tarea.paso === 1} color="#2563eb" />
                            </div>
                            {tarea.paso === 1 && (
                                <div style={{ paddingLeft: 26, marginTop: 4, fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontStyle: 'italic' }}>{tarea.paso_desc}</span>
                                    {tarea.dia_actual && <span style={{ color: '#94a3b8' }}>→ {tarea.dia_actual}</span>}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ── Paso 2 ── */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
                        <span style={{ width: 18, textAlign: 'center', flexShrink: 0 }}>
                            <StepIcon paso={2} pasoActual={tarea.paso} status={tarea.status} />
                        </span>
                        <span style={{ fontWeight: tarea.paso === 2 ? 700 : 500, color: tarea.paso >= 2 ? '#1e293b' : '#94a3b8' }}>
                            Sincronización con base de datos
                        </span>
                        {tarea.paso === 2 && tarea.tablas_sync > 0 && (
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {tarea.tablas_sync}/5 tablas
                            </span>
                        )}
                    </div>
                    {tarea.paso >= 2 && (
                        <>
                            <div style={{ paddingLeft: 26 }}>
                                <ProgressBar
                                    pct={pct2}
                                    active={tarea.paso === 2}
                                    color="#7c3aed"
                                    indeterminate={tarea.paso === 2 && pct2 === 0}
                                />
                            </div>
                            {tarea.paso === 2 && tarea.ultima_tabla_sync && (
                                <div style={{ paddingLeft: 26, marginTop: 4, fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                                    {tarea.ultima_tabla_sync}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ── Log en tiempo real ── */}
                {logs.length > 0 && (
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
                            Actividad reciente
                        </div>
                        <div
                            ref={logRef}
                            style={{
                                background: '#0f172a', borderRadius: 7, padding: '8px 10px',
                                maxHeight: 130, overflowY: 'auto',
                                scrollbarWidth: 'thin', scrollbarColor: '#334155 #0f172a',
                            }}
                        >
                            {logs.map((line, i) => (
                                <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: getLogColor(line), lineHeight: 1.6, wordBreak: 'break-all' }}>
                                    {line}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Resultados finales ── */}
                {tarea.status === 'completado' && (
                    <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 13px', fontSize: 12 }}>
                        <div style={{ fontWeight: 700, color: '#15803d', marginBottom: 7, fontSize: 13 }}>📊 Resultados</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#166534' }}>
                            {tarea.maestro_resumen_total != null && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>🗄️ Registros en maestro</span>
                                    <span style={{ fontWeight: 700 }}>{tarea.maestro_resumen_total}</span>
                                </div>
                            )}
                            {tarea.oc_encontradas != null && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>🔗 OC vinculadas</span>
                                    <span style={{ fontWeight: 700 }}>
                                        {tarea.oc_encontradas}{tarea.oc_total_ps ? `/${tarea.oc_total_ps}` : ''}
                                    </span>
                                </div>
                            )}
                            {tarea.tablas_sync > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>✅ Tablas sincronizadas</span>
                                    <span style={{ fontWeight: 700 }}>{tarea.tablas_sync}/5</span>
                                </div>
                            )}
                        </div>
                        <div style={{ marginTop: 8, fontSize: 11, color: '#64748b', borderTop: '1px solid #dcfce7', paddingTop: 6 }}>
                            Dashboard actualizado automáticamente
                        </div>
                    </div>
                )}

                {/* ── Error ── */}
                {tarea.status === 'error' && (
                    <div style={{ background: '#fef2f2', borderRadius: 8, padding: '10px 13px' }}>
                        <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 12, marginBottom: 5 }}>Detalle del error:</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#b91c1c', wordBreak: 'break-all', whiteSpace: 'pre-wrap', maxHeight: 100, overflowY: 'auto' }}>
                            {tarea.error}
                        </div>
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

    // Fechas para el modal de actualización — por defecto los últimos 7 días
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

    const { tarea: tareaActualizacion, iniciando: iniciandoActualizacion, iniciar: iniciarActualizacion, cerrar: cerrarBanner } =
        useActualizarCompraAgil(refresh);

    const handleIniciarActualizacion = () => {
        setShowModalActualizar(false);
        iniciarActualizacion(modalFechaDesde, modalFechaHasta);
    };

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
            {/* ── Encabezado ── */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 className="page-title">Compra Ágil</h1>
                    <p className="page-subtitle">
                        Análisis de compras por convenio marco — Organismo 7296
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        className="btn-actualizar-api"
                        onClick={() => setShowModalActualizar(true)}
                        disabled={!!tareaActualizacion && ['iniciado', 'en_proceso'].includes(tareaActualizacion.status)}
                        title="Descargar nuevos datos desde Mercado Público y sincronizar"
                    >
                        {tareaActualizacion && ['iniciado', 'en_proceso'].includes(tareaActualizacion.status)
                            ? '⏳ Actualizando...'
                            : '🔄 Actualizar API'}
                    </button>
                    <button
                        className="btn-pdf"
                        onClick={handleExportarPDF}
                        disabled={generandoPDF || loadingStats}
                        title="Generar reporte PDF completo con los filtros activos"
                    >
                        {generandoPDF ? '⏳ Generando...' : '🖨️ Reporte PDF'}
                    </button>
                </div>
            </div>

            {/* ── Modal selección de fechas para actualización ── */}
            {showModalActualizar && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>🔄 Actualizar datos de Compra Ágil</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>Selecciona el rango de fechas a descargar desde Mercado Público.</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Desde</label>
                                <input type="date" className="filtro-input" style={{ width: '100%' }}
                                    value={modalFechaDesde} onChange={e => setModalFechaDesde(e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Hasta</label>
                                <input type="date" className="filtro-input" style={{ width: '100%' }}
                                    value={modalFechaHasta} onChange={e => setModalFechaHasta(e.target.value)} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowModalActualizar(false)}
                                style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                                Cancelar
                            </button>
                            <button onClick={handleIniciarActualizacion}
                                disabled={iniciandoActualizacion || !modalFechaDesde || !modalFechaHasta}
                                style={{ padding: '8px 20px', borderRadius: 7, border: 'none', background: '#0ea5e9', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: (iniciandoActualizacion || !modalFechaDesde || !modalFechaHasta) ? 0.6 : 1 }}>
                                {iniciandoActualizacion ? '⏳ Iniciando...' : '🚀 Actualizar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Banner flotante de progreso ETL ── */}
            {tareaActualizacion && (
                <BannerActualizacion tarea={tareaActualizacion} onCerrar={cerrarBanner} />
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
