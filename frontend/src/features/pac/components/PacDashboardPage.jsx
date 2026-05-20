import React, { useState } from 'react';
import { usePacDashboard } from '../hooks/usePacDashboard';
import IndicadoresRes188Tab from './tabs/IndicadoresRes188Tab';
import OrdenesCompraTab from './tabs/OrdenesCompraTab';
import InformePDFTab from './tabs/InformePDFTab';

const TABS = [
    { id: 'indicadores', label: '📊 Indicadores Res.188' },
    { id: 'ordenes', label: '🛍️ Órdenes de Compra' },
    { id: 'informe', label: '🖨️ Informe PDF' },
];

const ANIOS = [2024, 2025, 2026];

export default function PacDashboardPage() {
    const [tab, setTab] = useState('indicadores');
    const [anio, setAnio] = useState(2026);
    const { indicadores, ocStats, caResumen, loading, error, refresh } = usePacDashboard(anio);

    return (
        <div className="feature-page">
            <div className="page-header no-print">
                <div>
                    <div className="page-title">Dashboard PAC {anio}</div>
                    <div className="page-subtitle">Resolución Exenta N°188/2026 · Organismo 7296</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <select
                        value={anio}
                        onChange={(e) => setAnio(Number(e.target.value))}
                        style={{ border: '1.5px solid #c8d3de', borderRadius: 7, padding: '5px 10px', fontSize: 13, fontFamily: 'Inter, sans-serif' }}
                    >
                        {ANIOS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <button className="btn btn-secondary" onClick={refresh} disabled={loading}>
                        {loading ? '⏳ Cargando...' : '🔄 Actualizar'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="alert alert-error no-print" style={{ marginBottom: 16 }}>
                    ⚠️ {error}
                </div>
            )}

            {loading && (
                <div style={{ textAlign: 'center', padding: 60, color: '#7a8899', fontSize: 14 }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
                    Cargando datos PAC…
                </div>
            )}

            {!loading && (
                <>
                    {/* Tab bar (no se imprime) */}
                    <div className="pac-tab-bar no-print">
                        {TABS.map((t) => (
                            <button
                                key={t.id}
                                className={`pac-tab-btn ${tab === t.id ? 'active' : ''}`}
                                onClick={() => setTab(t.id)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {tab === 'indicadores' && (
                        <IndicadoresRes188Tab indicadores={indicadores} caResumen={caResumen} />
                    )}
                    {tab === 'ordenes' && (
                        <OrdenesCompraTab ocStats={ocStats} />
                    )}
                    {tab === 'informe' && (
                        <InformePDFTab indicadores={indicadores} ocStats={ocStats} anio={anio} />
                    )}
                </>
            )}
        </div>
    );
}
