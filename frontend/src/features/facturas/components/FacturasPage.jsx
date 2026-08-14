import React, { useState, useCallback } from 'react';
import { useFacturasStats } from '../hooks/useFacturasStats';
import { useFacturasAnalisis } from '../hooks/useFacturasAnalisis';
import { useActualizarFacturas } from '../hooks/useActualizarFacturas';
import ModalActualizarFacturas from './ModalActualizarFacturas';
import BannerActualizacionFacturas from './BannerActualizacionFacturas';
import TabDatos from './TabDatos';

const TABS = [
    { id: 'datos', icono: '📊', label: 'Datos' },
];

export default function FacturasPage() {
    const [tab, setTab] = useState('datos');
    const [modalAbierto, setModalAbierto] = useState(false);

    const { data: stats, loading, error, refresh } = useFacturasStats();
    const { data: analisis, loading: analisisLoading, error: analisisError, refresh: refreshAnalisis } = useFacturasAnalisis();

    const refrescarTodo = useCallback(() => { refresh(); refreshAnalisis(); }, [refresh, refreshAnalisis]);
    const { tarea, iniciando, iniciar, cancelar, cerrar } = useActualizarFacturas(refrescarTodo);

    const enProceso = tarea?.status === 'iniciado' || tarea?.status === 'en_proceso';

    const handleConfirmar = (payload) => {
        setModalAbierto(false);
        iniciar(payload);
    };

    return (
        <div className="feature-page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div className="page-title"><span className="page-title-icon">🧾</span> Facturas</div>
                    <div className="page-subtitle">Facturas DIPRES/Acepta — Servicio de Salud Osorno</div>
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
                    {enProceso ? '⚙️' : '🔄'}
                    {enProceso ? 'Actualizando...' : 'Actualizar Dipres'}
                </button>
            </div>

            <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid #e5e7eb', flexWrap: 'wrap' }}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        className={`tab-btn${tab === t.id ? ' active' : ''}`}
                        onClick={() => setTab(t.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '8px 12px' }}
                    >
                        <span>{t.icono}</span> {t.label}
                    </button>
                ))}
            </div>

            {tab === 'datos' && (
                <TabDatos
                    stats={stats} loading={loading} error={error}
                    analisis={analisis} analisisLoading={analisisLoading} analisisError={analisisError}
                />
            )}

            {modalAbierto && (
                <ModalActualizarFacturas
                    onConfirmar={handleConfirmar}
                    onCerrar={() => setModalAbierto(false)}
                />
            )}

            <BannerActualizacionFacturas tarea={tarea} onCerrar={cerrar} onCancelar={cancelar} />
        </div>
    );
}
