import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    getContratosStats,
    iniciarActualizacionContratos,
    estadoActualizacionContratos,
    cancelarActualizacionContratos,
} from '../api/contratosApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', {
        style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
    }).format(n ?? 0);

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

const pct = (n) => `${(n ?? 0).toFixed(1)}%`;

// ─── Banner de progreso ────────────────────────────────────────────────────────

function BannerContratos({ tarea, onCerrar, onCancelar }) {
    if (!tarea) return null;

    const completado = tarea.status === 'completado';
    const error      = tarea.status === 'error';
    const enProceso  = tarea.status === 'en_proceso' || tarea.status === 'iniciado';

    const color = completado ? '#16a34a' : error ? '#dc2626' : '#7c3aed';

    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
            background: '#1e1e2e', border: `2px solid ${color}`,
            borderRadius: 12, padding: '16px 20px', width: 380,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            fontFamily: 'monospace',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ color, fontWeight: 700, fontSize: 13 }}>
                    {completado ? '✅ Carga completada' : error ? '❌ Error' : '🔄 Cargando contratos...'}
                </span>
                <button
                    onClick={onCerrar}
                    style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16 }}
                >✕</button>
            </div>

            <div style={{ background: '#374151', borderRadius: 4, height: 6, marginBottom: 10 }}>
                <div style={{
                    width: `${tarea.progreso_pct || (completado ? 100 : enProceso ? 40 : 0)}%`,
                    background: color, height: '100%', borderRadius: 4,
                    transition: 'width 0.3s ease',
                }} />
            </div>

            <div style={{ color: '#d1d5db', fontSize: 12, marginBottom: 8 }}>
                {tarea.paso_desc}
            </div>

            {tarea.total_registros > 0 && (
                <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 6 }}>
                    {tarea.total_cargados > 0
                        ? `${fmtN(tarea.total_cargados)} / ${fmtN(tarea.total_registros)} contratos cargados`
                        : `${fmtN(tarea.total_registros)} contratos encontrados`}
                </div>
            )}

            {tarea.archivo_nombre && (
                <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 6 }}>
                    Archivo: {tarea.archivo_nombre}
                </div>
            )}

            {tarea.logs_recientes?.length > 0 && (
                <div style={{
                    background: '#111827', borderRadius: 6, padding: '6px 8px',
                    maxHeight: 80, overflowY: 'auto', fontSize: 10,
                    color: '#4ade80', lineHeight: 1.5,
                }}>
                    {tarea.logs_recientes.map((l, i) => (
                        <div key={i}>&gt; {l}</div>
                    ))}
                </div>
            )}

            {error && (
                <div style={{ color: '#fca5a5', fontSize: 11, marginTop: 8 }}>
                    {tarea.error}
                </div>
            )}

            {enProceso && (
                <button
                    onClick={onCancelar}
                    style={{
                        marginTop: 10, width: '100%', padding: '6px',
                        background: '#374151', border: '1px solid #6b7280',
                        borderRadius: 6, color: '#d1d5db', cursor: 'pointer',
                        fontSize: 12,
                    }}
                >
                    Cancelar
                </button>
            )}
        </div>
    );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ titulo, valor, subtitulo, color = '#7c3aed', icono }) {
    return (
        <div className="kpi-card" style={{ borderTop: `3px solid ${color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{titulo}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{valor}</div>
                    {subtitulo && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{subtitulo}</div>}
                </div>
                {icono && <span style={{ fontSize: 24, opacity: 0.6 }}>{icono}</span>}
            </div>
        </div>
    );
}

// ─── Barra horizontal ─────────────────────────────────────────────────────────

function BarChart({ datos, labelKey, valueKey, color = '#7c3aed', fmtVal = fmtN }) {
    if (!datos?.length) return <div style={{ color: '#9ca3af', fontSize: 13 }}>Sin datos</div>;
    const max = Math.max(...datos.map(d => d[valueKey] || 0));
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {datos.map((d, i) => (
                <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: '#374151' }}>{d[labelKey]}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>
                            {fmtVal(d[valueKey])}
                        </span>
                    </div>
                    <div style={{ background: '#f3f4f6', borderRadius: 3, height: 8 }}>
                        <div style={{
                            width: `${max > 0 ? (d[valueKey] / max) * 100 : 0}%`,
                            background: color, height: '100%', borderRadius: 3,
                            transition: 'width 0.4s ease',
                        }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
    return (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 14 }}>
                Carga los datos primero con el botón <strong>Actualizar desde Excel</strong>.
            </div>
        </div>
    );
}

// ─── Tab: Resumen ─────────────────────────────────────────────────────────────

function TabResumen({ stats }) {
    if (!stats || stats.vacio) {
        return (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 16, marginBottom: 8 }}>Sin datos de contratos</div>
                <div style={{ fontSize: 13 }}>
                    Usa el botón <strong>Actualizar desde Excel</strong> para cargar los contratos<br />
                    desde el archivo descargado de Mercado Público.
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
                <KpiCard titulo="Total Contratos"           valor={fmtN(stats.total)}             icono="📋" color="#7c3aed" />
                <KpiCard titulo="Vigentes"                  valor={fmtN(stats.vigentes)}           subtitulo="En ejecución / Ampliado" icono="✅" color="#16a34a" />
                <KpiCard titulo="Terminados"                valor={fmtN(stats.terminados)}         subtitulo={`${pct(stats.terminados / stats.total * 100)} del total`} icono="🏁" color="#6b7280" />
                <KpiCard titulo="Monto Total"               valor={fmt(stats.monto_total)}         icono="💰" color="#0ea5e9" />
                <KpiCard titulo="Monto Ejecutado"           valor={fmt(stats.monto_ejecutado)}     subtitulo={`${pct(stats.pct_ejecutado)} ejecutado`} icono="📊" color="#f59e0b" />
                <KpiCard titulo="Garantías por Vencer"      valor={fmtN(stats.con_garantias_por_vencer)} icono="⚠️" color={stats.con_garantias_por_vencer > 0 ? '#f59e0b' : '#6b7280'} />
                <KpiCard titulo="Garantías Vencidas"        valor={fmtN(stats.con_garantias_vencidas)}   icono="🔴" color={stats.con_garantias_vencidas > 0 ? '#dc2626' : '#6b7280'} />
                <KpiCard titulo="Con Sanciones"             valor={fmtN(stats.con_sanciones)}      icono="⚡" color={stats.con_sanciones > 0 ? '#ef4444' : '#6b7280'} />
            </div>

            <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#374151' }}>
                    Avance de Ejecución — Monto Total
                </div>
                <div style={{ background: '#f3f4f6', borderRadius: 8, height: 20, position: 'relative' }}>
                    <div style={{
                        width: `${stats.pct_ejecutado}%`,
                        background: 'linear-gradient(90deg, #16a34a, #4ade80)',
                        height: '100%', borderRadius: 8,
                        transition: 'width 0.5s ease',
                    }} />
                    <span style={{
                        position: 'absolute', left: '50%', top: '50%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: 11, fontWeight: 700, color: '#111827',
                    }}>
                        {pct(stats.pct_ejecutado)} ejecutado
                    </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Ejecutado: {fmt(stats.monto_ejecutado)}</span>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Total: {fmt(stats.monto_total)}</span>
                </div>
            </div>
        </div>
    );
}

// ─── Tab: Por Estado ──────────────────────────────────────────────────────────

function TabEstado({ stats }) {
    if (!stats || stats.vacio) return <EmptyState />;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: '#374151' }}>
                    Contratos por Estado
                </div>
                <BarChart datos={stats.por_estado} labelKey="estado_contrato" valueKey="total" color="#7c3aed" />
            </div>
            <div className="card">
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: '#374151' }}>
                    Monto por Estado (CLP)
                </div>
                <BarChart datos={stats.por_estado} labelKey="estado_contrato" valueKey="monto" color="#0ea5e9" fmtVal={fmt} />
            </div>
        </div>
    );
}

// ─── Tab: Por Tipo ─────────────────────────────────────────────────────────────

function TabTipo({ stats }) {
    if (!stats || stats.vacio) return <EmptyState />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div className="card">
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: '#374151' }}>Por Categoría</div>
                    <BarChart datos={stats.por_categoria} labelKey="categoria_contrato" valueKey="total" color="#16a34a" />
                </div>
                <div className="card">
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: '#374151' }}>Por Tipo de Ejecución</div>
                    <BarChart datos={stats.por_ejecucion} labelKey="ejecucion_contrato" valueKey="total" color="#f59e0b" />
                </div>
            </div>
            <div className="card">
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: '#374151' }}>Por Tipo de Contrato (Top 15)</div>
                <BarChart datos={stats.por_tipo?.slice(0, 15)} labelKey="tipo_contrato" valueKey="total" color="#7c3aed" />
            </div>
            <div className="card">
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: '#374151' }}>Por Unidad Requirente</div>
                <BarChart datos={stats.por_unidad} labelKey="unidad_requirente" valueKey="total" color="#0ea5e9" />
            </div>
        </div>
    );
}

// ─── Tab: Garantías ───────────────────────────────────────────────────────────

function TabGarantias({ stats }) {
    if (!stats || stats.vacio) return <EmptyState />;

    const ninguna =
        stats.con_garantias_por_vencer === 0 &&
        stats.con_garantias_vencidas === 0 &&
        stats.con_sanciones === 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <KpiCard titulo="Garantías por Vencer" valor={fmtN(stats.con_garantias_por_vencer)} subtitulo="contratos afectados" icono="⚠️" color={stats.con_garantias_por_vencer > 0 ? '#f59e0b' : '#6b7280'} />
                <KpiCard titulo="Garantías Vencidas"   valor={fmtN(stats.con_garantias_vencidas)}   subtitulo="contratos afectados" icono="🔴" color={stats.con_garantias_vencidas > 0 ? '#dc2626' : '#6b7280'} />
                <KpiCard titulo="Con Sanciones"         valor={fmtN(stats.con_sanciones)}            subtitulo="contratos afectados" icono="⚡" color={stats.con_sanciones > 0 ? '#ef4444' : '#6b7280'} />
            </div>

            {ninguna && (
                <div className="card" style={{ textAlign: 'center', padding: 32, color: '#16a34a' }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>Sin alertas activas</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                        No se detectaron contratos con garantías vencidas ni sanciones solicitadas.
                    </div>
                </div>
            )}

            <div className="card" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
                <div style={{ fontSize: 12, color: '#92400e' }}>
                    <strong>Nota:</strong> Los datos provienen del archivo Excel de Mercado Público.
                    Actualiza periódicamente para mantener la información vigente.
                </div>
            </div>
        </div>
    );
}

// ─── Página principal ──────────────────────────────────────────────────────────

const TABS = [
    { id: 'resumen',   label: 'Resumen',              icono: '📊' },
    { id: 'estado',    label: 'Por Estado',            icono: '📈' },
    { id: 'tipo',      label: 'Por Tipo y Categoría',  icono: '🗂️' },
    { id: 'garantias', label: 'Garantías y Sanciones', icono: '🛡️' },
];

export function GestionContratosPage() {
    const [tab, setTab]               = useState('resumen');
    const [stats, setStats]           = useState(null);
    const [loadingStats, setLoadingStats] = useState(false);
    const [tarea, setTarea]           = useState(null);
    const [iniciando, setIniciando]   = useState(false);
    const pollingRef                  = useRef(null);

    const cargarStats = useCallback(async () => {
        setLoadingStats(true);
        try {
            const { data } = await getContratosStats();
            setStats(data);
        } catch {
            setStats({ vacio: true, total: 0 });
        } finally {
            setLoadingStats(false);
        }
    }, []);

    useEffect(() => {
        cargarStats();
        return () => clearInterval(pollingRef.current);
    }, [cargarStats]);

    const iniciarPolling = useCallback((taskId) => {
        clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
            try {
                const { data } = await estadoActualizacionContratos(taskId);
                setTarea(data);
                if (data.status === 'completado') {
                    clearInterval(pollingRef.current);
                    cargarStats();
                } else if (data.status === 'error' || data.status === 'cancelado') {
                    clearInterval(pollingRef.current);
                }
            } catch {
                clearInterval(pollingRef.current);
            }
        }, 2000);
    }, [cargarStats]);

    const handleActualizar = async () => {
        if (iniciando) return;
        setIniciando(true);
        try {
            const { data } = await iniciarActualizacionContratos();
            setTarea({ status: 'iniciado', paso: 0, paso_desc: 'Iniciando...', progreso_pct: 0, logs_recientes: [] });
            iniciarPolling(data.task_id);
        } catch (err) {
            alert(err.response?.data?.error || 'Error al iniciar la actualización.');
        } finally {
            setIniciando(false);
        }
    };

    const handleCancelar = async () => {
        if (!tarea?.task_id) return;
        try { await cancelarActualizacionContratos(tarea.task_id); } catch { /* ignorar */ }
        clearInterval(pollingRef.current);
        setTarea(prev => ({ ...prev, status: 'cancelado', paso_desc: 'Cancelado por el usuario.' }));
    };

    const handleCerrarBanner = () => {
        clearInterval(pollingRef.current);
        setTarea(null);
    };

    const enProceso = tarea?.status === 'iniciado' || tarea?.status === 'en_proceso';

    return (
        <div className="feature-page">
            {/* ── Cabecera ── */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div className="page-title">
                        <span className="page-title-icon">📋</span>
                        Gestión de Contratos
                    </div>
                    <div className="page-subtitle">
                        Contratos vigentes e históricos del Servicio de Salud Osorno — Mercado Público
                    </div>
                </div>

                <button
                    onClick={handleActualizar}
                    disabled={iniciando || enProceso}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '9px 18px',
                        background: enProceso ? '#6b21a8' : '#7c3aed',
                        color: '#fff', border: 'none', borderRadius: 8,
                        fontSize: 13, fontWeight: 600,
                        cursor: (iniciando || enProceso) ? 'not-allowed' : 'pointer',
                        opacity: iniciando ? 0.7 : 1,
                        whiteSpace: 'nowrap',
                    }}
                >
                    {enProceso ? '⚙️' : '🔄'}
                    {enProceso ? 'Cargando...' : 'Actualizar desde Excel'}
                </button>
            </div>

            {/* ── Aviso sin datos ── */}
            {stats?.vacio && !enProceso && (
                <div style={{
                    background: '#faf5ff', border: '1px solid #c4b5fd',
                    borderRadius: 8, padding: '12px 16px', marginBottom: 20,
                    display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                }}>
                    <span style={{ fontSize: 20 }}>ℹ️</span>
                    <div>
                        <strong>Sin datos cargados.</strong> Descarga primero el archivo Excel desde
                        Mercado Público usando <code>descargar_contratos_sso_selenium.py</code>,
                        luego haz clic en <strong>Actualizar desde Excel</strong>.
                    </div>
                </div>
            )}

            {/* ── Tabs ── */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e5e7eb' }}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        className={`tab-btn${tab === t.id ? ' active' : ''}`}
                        onClick={() => setTab(t.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                    >
                        <span>{t.icono}</span> {t.label}
                    </button>
                ))}
            </div>

            {/* ── Contenido ── */}
            {loadingStats ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
                    Cargando datos...
                </div>
            ) : (
                <>
                    {tab === 'resumen'   && <TabResumen   stats={stats} />}
                    {tab === 'estado'    && <TabEstado    stats={stats} />}
                    {tab === 'tipo'      && <TabTipo      stats={stats} />}
                    {tab === 'garantias' && <TabGarantias stats={stats} />}
                </>
            )}

            {/* ── Banner ETL ── */}
            <BannerContratos
                tarea={tarea}
                onCerrar={handleCerrarBanner}
                onCancelar={handleCancelar}
            />
        </div>
    );
}

export default GestionContratosPage;
