import React, { useCallback, useRef, useState } from 'react';
import { useAnexo1EstadoBD } from '../hooks/useAnexo1EstadoBD';
import { iniciarActualizacionAnexo1, estadoActualizacionAnexo1, cancelarActualizacionAnexo1 } from '../api/anexo1SigfeApi';
import MatrizEstadoBD from './MatrizEstadoBD';
import ModalActualizarAnexo1 from './ModalActualizarAnexo1';
import BannerActualizacionAnexo1 from './BannerActualizacionAnexo1';
import PanelCambiosAnexo1 from './PanelCambiosAnexo1';

const TABS = [
    { id: 'base-datos', label: '🗄️ Base de datos' },
    // Próximos tabs (reporte HTML) se agregan acá cuando estén listos.
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
                        if (data.diff) setPanelCambios(data.diff);
                    }
                }
            } catch {
                clearInterval(pollingRef.current);
            }
        }, 3000);
    }, [refresh]);

    const handleConfirmarActualizar = async ({ usuario, password, fechaDesde, fechaHasta }) => {
        setModalAbierto(false);
        if (iniciando) return;
        setIniciando(true);
        try {
            const { data } = await iniciarActualizacionAnexo1({ usuario, password, fechaDesde, fechaHasta });
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
                            padding: '9px 14px', background: '#fff', color: '#334155',
                            border: '1px solid #cbd5e1', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                        }}
                    >
                        {loading ? '⏳ Cargando...' : '🔄 Refrescar'}
                    </button>
                    <button
                        onClick={() => setModalAbierto(true)}
                        disabled={iniciando || enProceso}
                        style={{
                            padding: '9px 16px', background: enProceso ? '#94a3b8' : '#0ea5e9', color: '#fff',
                            border: 'none', borderRadius: 8, cursor: (iniciando || enProceso) ? 'not-allowed' : 'pointer',
                            fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                        }}
                    >
                        {enProceso ? '⚙️ Actualizando...' : '📥 Actualizar desde SIGFE'}
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 16 }}>
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
