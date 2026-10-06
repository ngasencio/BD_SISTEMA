import React, { useState } from 'react';
import FeedActividad from './jefatura/FeedActividad';
import TablaSinGestion from './jefatura/TablaSinGestion';
import TabAvance from './jefatura/TabAvance';
import BusquedaPersonalizada from './jefatura/BusquedaPersonalizada';

// Panel de supervisión de jefatura sobre el módulo Gestión de Compras —
// contraparte de "Mis Formularios" pero con vista global (todos los
// compradores). 3 tabs: General (feed de actividad + sin gestionar),
// Avance (comparativa + KPIs) y Búsqueda Personalizada (mismo panel que
// ve un comprador, elegido por la jefatura desde un selector).
export default function PanelFormulariosPage() {
    const [tab, setTab] = useState('general');
    const [refreshKey, setRefreshKey] = useState(0);

    return (
        <div className="feature-page">
            <div className="page-header">
                <div className="page-title"><span className="page-title-icon">📊</span> Panel Formularios</div>
                <div className="page-subtitle">
                    Supervisión global de la gestión de compras: últimos movimientos, avance comparativo
                    por comprador y búsqueda personalizada.
                </div>
            </div>

            <div className="tabs-bar" style={{ marginBottom: 12 }}>
                <button className={`tab-btn ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>
                    🗞️ General
                </button>
                <button className={`tab-btn ${tab === 'avance' ? 'active' : ''}`} onClick={() => setTab('avance')}>
                    📈 Avance
                </button>
                <button className={`tab-btn ${tab === 'busqueda' ? 'active' : ''}`} onClick={() => setTab('busqueda')}>
                    🔍 Búsqueda Personalizada
                </button>
            </div>

            {tab === 'general' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 14, alignItems: 'start' }}>
                    <FeedActividad />
                    <TablaSinGestion refreshKey={refreshKey} onRefrescar={() => setRefreshKey((k) => k + 1)} />
                </div>
            )}
            {tab === 'avance' && <TabAvance />}
            {tab === 'busqueda' && <BusquedaPersonalizada />}
        </div>
    );
}
