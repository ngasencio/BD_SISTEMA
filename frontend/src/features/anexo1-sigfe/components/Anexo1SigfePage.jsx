import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useAnexo1EstadoBD } from '../hooks/useAnexo1EstadoBD';
import { iniciarActualizacionAnexo1, estadoActualizacionAnexo1, cancelarActualizacionAnexo1 } from '../api/anexo1SigfeApi';
import MatrizEstadoBD from './MatrizEstadoBD';
import ModalActualizarAnexo1 from './ModalActualizarAnexo1';
import BannerActualizacionAnexo1 from './BannerActualizacionAnexo1';
import PanelCambiosAnexo1 from './PanelCambiosAnexo1';
import FiltroEjecucion from './FiltroEjecucion';
import TabResumen from './tabs/TabResumen';
import TabGuiaSimple from './tabs/TabGuiaSimple';
import TabAlertas from './tabs/TabAlertas';
import TabSemaforo from './tabs/TabSemaforo';
import TabBurnRate from './tabs/TabBurnRate';
import TabDeudaFlotante from './tabs/TabDeudaFlotante';
import TabTendencias from './tabs/TabTendencias';
import TabFinanciero from './tabs/TabFinanciero';
import TabDetallado from './tabs/TabDetallado';
import TabExportar from './tabs/TabExportar';
import TabConciliacion from './tabs/TabConciliacion';

const TABS = [
    { id: 'base-datos', label: '🗄️ Base de datos' },
    { id: 'guia-simple', label: '🧭 Guía Rápida' },
    { id: 'resumen', label: '📊 Resumen Ejecutivo' },
    { id: 'detallado', label: '🔍 Análisis Detallado' },
    { id: 'tendencias', label: '📈 Histórico y Tendencias' },
    { id: 'alertas', label: '⚠️ Alertas' },
    { id: 'semaforo', label: '🚦 Semáforo de Cierre' },
    { id: 'burn-rate', label: '⚡ Burn Rate' },
    { id: 'deuda-flotante', label: '📉 Deuda Flotante' },
    { id: 'financiero', label: '📐 Análisis Financiero' },
    { id: 'conciliacion', label: '🔄 Conciliación N°3' },
    { id: 'exportar', label: '📤 Exportar Reporte' },
];

export default function Anexo1SigfePage() {
    const [tab, setTab] = useState('base-datos');
    const { data, loading, error, refresh } = useAnexo1EstadoBD();

    // ETL: modal de credenciales/fechas, banner de progreso, panel de cambios
    const [modalAbierto, setModalAbierto] = useState(false);
    const [iniciando, setIniciando] = useState(false);
    const [tarea, setTarea] = useState(null);
    const [panelCambios, setPanelCambios] = useState(null);
    const pollingRef = useRef(null);

    // Filtro compartido por los tabs de Análisis de Ejecución Presupuestaria +
    // contador que fuerza el re-fetch de todos los tabs cuando termina un ETL.
    const anhos = useMemo(() => {
        const set = new Set((data?.periodos || []).map((p) => parseInt(p.split('-')[0], 10)));
        return [...set].sort((a, b) => b - a);
    }, [data]);
    const [filtros, setFiltros] = useState({ ue: 'todas', anho: undefined, mesDesde: 1, mesHasta: 12, excluir3435: true });
    const filtrosConAnho = useMemo(
        () => ({ ...filtros, anho: filtros.anho || anhos[0] }),
        [filtros, anhos],
    );
    const [refreshKey, setRefreshKey] = useState(0);

    const iniciarPolling = useCallback((taskId) => {
        clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
            try {
                const { data } = await estadoActualizacionAnexo1(taskId);
                setTarea(data);
                if (['completado', 'error', 'cancelado'].includes(data.status)) {
                    clearInterval(pollingRef.current);
                    if (data.status === 'completado') {
                        refresh();
                        setRefreshKey((k) => k + 1);
                        if (data.diff) setPanelCambios(data.diff);
                    }
                }
            } catch {
                clearInterval(pollingRef.current);
            }
        }, 3000);
    }, [refresh]);

    const handleConfirmarActualizar = async ({ usuario, password, fechaDesde, fechaHasta, visible }) => {
        setModalAbierto(false);
        if (iniciando) return;
        setIniciando(true);
        try {
            const { data } = await iniciarActualizacionAnexo1({ usuario, password, fechaDesde, fechaHasta, visible });
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
        try {
            await cancelarActualizacionAnexo1(tarea.task_id);
        } catch {
            // ignorar — el próximo poll (o el estado forzado abajo) refleja el estado real
        }
        clearInterval(pollingRef.current);
        setTarea(prev => ({ ...prev, status: 'cancelado', paso_desc: 'Cancelado por el usuario.' }));
    };

    const enProceso = tarea && (tarea.status === 'en_proceso' || tarea.status === 'iniciado');

    return (
        <div className="feature-page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div className="page-title"><span className="page-title-icon">📑</span> Anexo N°1 — Estado de Ejecución Presupuestaria</div>
                    <div className="page-subtitle">
                        Cobertura de datos SIGFE por establecimiento y mes.
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        onClick={refresh}
                        disabled={loading}
                        style={{
                            padding: '9px 14px', background: 'var(--gob-blanco)', color: 'var(--gob-gris5)',
                            border: '1px solid var(--gob-gris3)', borderRadius: 'var(--radius)', cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'var(--font-body)',
                        }}
                    >
                        {loading ? '⏳ Cargando...' : '🔄 Refrescar'}
                    </button>
                    <button
                        onClick={() => setModalAbierto(true)}
                        disabled={iniciando || enProceso}
                        style={{
                            padding: '9px 16px', background: enProceso ? 'var(--gob-gris3)' : 'var(--gob-azul)', color: '#fff',
                            border: 'none', borderRadius: 'var(--radius)', cursor: (iniciando || enProceso) ? 'not-allowed' : 'pointer',
                            fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'var(--font-body)',
                        }}
                    >
                        {enProceso ? '⚙️ Actualizando...' : '📥 Actualizar desde SIGFE'}
                    </button>
                </div>
            </div>

            <div className="tabs-bar">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        className={`tab-btn ${tab === t.id ? 'active' : ''}`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'base-datos' && (
                <>
                    {loading && !data && <div className="loading-spinner">Cargando estado de la base de datos…</div>}
                    {error && <div className="error-message">{error}</div>}
                    {data && <MatrizEstadoBD data={data} />}
                </>
            )}

            {tab !== 'base-datos' && data && anhos.length > 0 && (
                <FiltroEjecucion
                    establecimientos={data.establecimientos}
                    anhos={anhos}
                    value={filtrosConAnho}
                    onChange={setFiltros}
                />
            )}

            {tab === 'guia-simple' && anhos.length > 0 && (
                <TabGuiaSimple filtros={filtrosConAnho} refreshKey={refreshKey} />
            )}
            {tab === 'resumen' && anhos.length > 0 && (
                <TabResumen filtros={filtrosConAnho} refreshKey={refreshKey} />
            )}
            {tab === 'detallado' && anhos.length > 0 && (
                <TabDetallado filtros={filtrosConAnho} refreshKey={refreshKey} />
            )}
            {tab === 'alertas' && anhos.length > 0 && (
                <TabAlertas filtros={filtrosConAnho} refreshKey={refreshKey} />
            )}
            {tab === 'semaforo' && anhos.length > 0 && (
                <TabSemaforo filtros={filtrosConAnho} refreshKey={refreshKey} />
            )}
            {tab === 'burn-rate' && anhos.length > 0 && (
                <TabBurnRate filtros={filtrosConAnho} refreshKey={refreshKey} />
            )}
            {tab === 'deuda-flotante' && anhos.length > 0 && (
                <TabDeudaFlotante filtros={filtrosConAnho} refreshKey={refreshKey} />
            )}
            {tab === 'tendencias' && anhos.length > 0 && (
                <TabTendencias filtros={filtrosConAnho} refreshKey={refreshKey} />
            )}
            {tab === 'financiero' && anhos.length > 0 && (
                <TabFinanciero filtros={filtrosConAnho} refreshKey={refreshKey} />
            )}
            {tab === 'conciliacion' && anhos.length > 0 && (
                <TabConciliacion filtros={filtrosConAnho} refreshKey={refreshKey} />
            )}
            {tab === 'exportar' && anhos.length > 0 && (
                <TabExportar filtros={filtrosConAnho} />
            )}

            {modalAbierto && (
                <ModalActualizarAnexo1 onConfirmar={handleConfirmarActualizar} onCerrar={() => setModalAbierto(false)} />
            )}
            {panelCambios && (
                <PanelCambiosAnexo1 diff={panelCambios} onCerrar={() => setPanelCambios(null)} />
            )}
            <BannerActualizacionAnexo1
                tarea={tarea}
                onCerrar={() => { clearInterval(pollingRef.current); setTarea(null); }}
                onCancelar={handleCancelar}
            />
        </div>
    );
}
