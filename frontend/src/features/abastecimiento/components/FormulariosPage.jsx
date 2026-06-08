import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    getFormulariosStats, getFormularios, getFormulariosDerivados, getFormulariosProductos,
    iniciarActualizacionFormularios, estadoActualizacionFormularios, cancelarActualizacionFormularios,
} from '../api/formulariosApi';
import { KpiCard } from './KpiCard';

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
const fmtCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

// ─── Banner de progreso ETL ───────────────────────────────────────────────────

function BannerFormularios({ tarea, onCerrar, onCancelar }) {
    if (!tarea) return null;
    const completado = tarea.status === 'completado';
    const error      = tarea.status === 'error';
    const enProceso  = tarea.status === 'en_proceso' || tarea.status === 'iniciado';
    const color = completado ? '#16a34a' : error ? '#dc2626' : '#0ea5e9';

    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
            background: '#1e1e2e', border: `2px solid ${color}`,
            borderRadius: 12, padding: '16px 20px', width: 380,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)', fontFamily: 'monospace',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ color, fontWeight: 700, fontSize: 13 }}>
                    {completado ? '✅ Actualización completada' : error ? '❌ Error' : '🔄 Actualizando Formularios FSC...'}
                </span>
                <button onClick={onCerrar} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ background: '#374151', borderRadius: 4, height: 6, marginBottom: 10 }}>
                <div style={{ width: `${tarea.progreso_pct || (completado ? 100 : enProceso ? 15 : 0)}%`, background: color, height: '100%', borderRadius: 4, transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ color: '#d1d5db', fontSize: 12, marginBottom: 8 }}>{tarea.paso_desc}</div>
            {tarea.total_cargados > 0 && (
                <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 6 }}>
                    {fmtN(tarea.total_cargados)} registros cargados
                </div>
            )}
            {tarea.logs_recientes?.length > 0 && (
                <div style={{ background: '#111827', borderRadius: 6, padding: '6px 8px', maxHeight: 100, overflowY: 'auto', fontSize: 10, color: '#4ade80', lineHeight: 1.5 }}>
                    {tarea.logs_recientes.map((l, i) => <div key={i}>&gt; {l}</div>)}
                </div>
            )}
            {error && <div style={{ color: '#fca5a5', fontSize: 11, marginTop: 8 }}>{tarea.error}</div>}
            {enProceso && (
                <button onClick={onCancelar} style={{ marginTop: 10, width: '100%', padding: '6px', background: '#374151', border: '1px solid #6b7280', borderRadius: 6, color: '#d1d5db', cursor: 'pointer', fontSize: 12 }}>
                    Cancelar
                </button>
            )}
        </div>
    );
}

// ─── Modal de credenciales del Panel SS Osorno ────────────────────────────────

function ModalCredenciales({ onConfirmar, onCerrar }) {
    const [rut, setRut] = useState('');
    const [dv, setDv] = useState('');
    const [clave, setClave] = useState('');

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 360, boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
                <h3 style={{ margin: '0 0 6px' }}>Acceso al Panel SS Osorno</h3>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 16px' }}>
                    Ingrese sus credenciales para descargar los reportes FSC. No se almacenan en el servidor.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input placeholder="RUT (sin DV)" value={rut} onChange={e => setRut(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }} />
                    <input placeholder="DV" value={dv} onChange={e => setDv(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }} />
                    <input placeholder="Contraseña" type="password" value={clave} onChange={e => setClave(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                    <button onClick={onCerrar} style={{ padding: '8px 14px', background: '#f3f4f6', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
                    <button
                        onClick={() => onConfirmar({ rut, dv, clave })}
                        disabled={!rut || !dv || !clave}
                        style={{ padding: '8px 14px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6, cursor: (!rut || !dv || !clave) ? 'not-allowed' : 'pointer', opacity: (!rut || !dv || !clave) ? 0.6 : 1 }}
                    >
                        Iniciar descarga
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Tabla simple de resultados ───────────────────────────────────────────────

function TablaFormularios({ columnas, filas, vacio }) {
    if (vacio) return <div className="loading-spinner">Sin datos para mostrar.</div>;
    return (
        <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                    <tr>
                        {columnas.map(c => (
                            <th key={c.key} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>{c.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {filas.map((f, i) => (
                        <tr key={f.id ?? i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            {columnas.map(c => (
                                <td key={c.key} style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                                    {c.render ? c.render(f) : (f[c.key] ?? '—')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Definición de tabs ───────────────────────────────────────────────────────

const TABS = [
    { id: 'solicitudes', label: 'Solicitudes (FSC)', icono: '📝' },
    { id: 'derivados',   label: 'Derivados a Comprador', icono: '➡️' },
    { id: 'productos',   label: 'Carro de Productos', icono: '🛒' },
];

const COLS_SOLICITUDES = [
    { key: 'folio', label: 'Folio' },
    { key: 'anho', label: 'Año' },
    { key: 'fecha_solicitud', label: 'Fecha Solicitud' },
    { key: 'unidad_requirente', label: 'Unidad Requirente' },
    { key: 'usuario_requirente', label: 'Usuario' },
    { key: 'monto_estimado', label: 'Monto Estimado', render: (f) => fmtCLP(f.monto_estimado) },
    { key: 'estado', label: 'Estado' },
];

const COLS_DERIVADOS = [
    { key: 'folio', label: 'Folio' },
    { key: 'anho', label: 'Año' },
    { key: 'fecha_derivado', label: 'Fecha Derivado' },
    { key: 'unidad_requirente', label: 'Unidad Requirente' },
    { key: 'comprador', label: 'Comprador' },
    { key: 'monto_estimado', label: 'Monto Estimado', render: (f) => fmtCLP(f.monto_estimado) },
    { key: 'estado_compra', label: 'Estado Compra' },
];

const COLS_PRODUCTOS = [
    { key: 'folio', label: 'Folio' },
    { key: 'anho', label: 'Año' },
    { key: 'categoria', label: 'Categoría' },
    { key: 'producto', label: 'Producto' },
    { key: 'cantidad', label: 'Cantidad' },
    { key: 'monto', label: 'Monto', render: (f) => fmtCLP(f.monto) },
    { key: 'item_presupuestario', label: 'Item Presupuestario' },
];

// ─── Página principal ─────────────────────────────────────────────────────────

export function FormulariosPage() {
    const [tab, setTab]                 = useState('solicitudes');
    const [stats, setStats]             = useState(null);
    const [filas, setFilas]             = useState([]);
    const [cargandoFilas, setCargandoFilas] = useState(false);
    const [tarea, setTarea]             = useState(null);
    const [iniciando, setIniciando]     = useState(false);
    const [modalAbierto, setModalAbierto] = useState(false);
    const pollingRef                    = useRef(null);

    const cargarStats = useCallback(async () => {
        try {
            const { data } = await getFormulariosStats();
            setStats(data);
        } catch { /* ignorar */ }
    }, []);

    useEffect(() => { cargarStats(); }, [cargarStats]);

    useEffect(() => {
        let activo = true;
        setCargandoFilas(true);
        const fetchers = {
            solicitudes: getFormularios,
            derivados: getFormulariosDerivados,
            productos: getFormulariosProductos,
        };
        fetchers[tab]({ ordering: '-folio' })
            .then(({ data }) => { if (activo) setFilas(data.results ?? data); })
            .catch(() => { if (activo) setFilas([]); })
            .finally(() => { if (activo) setCargandoFilas(false); });
        return () => { activo = false; };
    }, [tab]);

    useEffect(() => () => clearInterval(pollingRef.current), []);

    const iniciarPolling = useCallback((taskId) => {
        clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
            try {
                const { data } = await estadoActualizacionFormularios(taskId);
                setTarea(data);
                if (['completado', 'error', 'cancelado'].includes(data.status)) {
                    clearInterval(pollingRef.current);
                    if (data.status === 'completado') cargarStats();
                }
            } catch {
                clearInterval(pollingRef.current);
            }
        }, 2000);
    }, [cargarStats]);

    const handleConfirmarCredenciales = async ({ rut, dv, clave }) => {
        setModalAbierto(false);
        if (iniciando) return;
        setIniciando(true);
        try {
            const { data } = await iniciarActualizacionFormularios({ rut, dv, clave });
            setTarea({ status: 'iniciado', task_id: data.task_id, paso: 0, paso_desc: 'Iniciando...', progreso_pct: 0, logs_recientes: [] });
            iniciarPolling(data.task_id);
        } catch (err) {
            alert(err.response?.data?.error || 'Error al iniciar la actualización.');
        } finally {
            setIniciando(false);
        }
    };

    const handleCancelar = async () => {
        if (!tarea?.task_id) return;
        try { await cancelarActualizacionFormularios(tarea.task_id); } catch { /* ignorar */ }
        clearInterval(pollingRef.current);
        setTarea(prev => ({ ...prev, status: 'cancelado', paso_desc: 'Cancelado por el usuario.' }));
    };

    const enProceso = tarea?.status === 'iniciado' || tarea?.status === 'en_proceso';
    const kpis = stats?.kpis;

    return (
        <div className="feature-page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div className="page-title"><span className="page-title-icon">📋</span> Formularios FSC</div>
                    <div className="page-subtitle">Formularios Solicitud de Compra — Panel Documental SS Osorno</div>
                </div>
                <button
                    onClick={() => setModalAbierto(true)}
                    disabled={iniciando || enProceso}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '9px 18px',
                        background: enProceso ? '#0369a1' : '#0ea5e9',
                        color: '#fff', border: 'none', borderRadius: 8,
                        fontSize: 13, fontWeight: 600,
                        cursor: (iniciando || enProceso) ? 'not-allowed' : 'pointer',
                        opacity: iniciando ? 0.7 : 1, whiteSpace: 'nowrap',
                    }}
                >
                    {enProceso ? '⚙️ Actualizando...' : '🔄 Actualizar desde Panel'}
                </button>
            </div>

            {kpis && (
                <section className="kpi-grid">
                    <KpiCard
                        title="Total Formularios"
                        value={fmtN(kpis.total_formularios)}
                        subtitle="FSC registrados"
                        icon="📋"
                        colorVar="--color-primary"
                    />
                    <KpiCard
                        title="Derivados a Comprador"
                        value={fmtN(kpis.total_derivados)}
                        subtitle={`${kpis.pct_derivados}% del total`}
                        icon="➡️"
                        colorVar="--color-accent"
                    />
                    <KpiCard
                        title="Monto Total Estimado"
                        value={fmtCLP(kpis.monto_total_estimado)}
                        subtitle="Suma de solicitudes FSC"
                        icon="💰"
                        colorVar="--color-success"
                    />
                    <KpiCard
                        title="Estados de Compra"
                        value={fmtN(stats.por_estado_compra?.length ?? 0)}
                        subtitle="Categorías distintas"
                        icon="🏷️"
                        colorVar="--color-warning"
                    />
                </section>
            )}

            <div style={{ display: 'flex', gap: 6, marginTop: 20, marginBottom: 14, borderBottom: '1px solid #e5e7eb' }}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`tab-btn ${tab === t.id ? 'active' : ''}`}
                    >
                        <span style={{ marginRight: 6 }}>{t.icono}</span>{t.label}
                    </button>
                ))}
            </div>

            <div className="card">
                {cargandoFilas ? (
                    <div className="loading-spinner">Cargando datos...</div>
                ) : (
                    <TablaFormularios
                        columnas={tab === 'solicitudes' ? COLS_SOLICITUDES : tab === 'derivados' ? COLS_DERIVADOS : COLS_PRODUCTOS}
                        filas={filas}
                        vacio={filas.length === 0}
                    />
                )}
            </div>

            {modalAbierto && (
                <ModalCredenciales onConfirmar={handleConfirmarCredenciales} onCerrar={() => setModalAbierto(false)} />
            )}

            <BannerFormularios
                tarea={tarea}
                onCerrar={() => { clearInterval(pollingRef.current); setTarea(null); }}
                onCancelar={handleCancelar}
            />
        </div>
    );
}
