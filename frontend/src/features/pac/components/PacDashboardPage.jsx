import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePacDashboard } from '../hooks/usePacDashboard';
import IndicadoresRes188Tab from './tabs/IndicadoresRes188Tab';
import OrdenesCompraTab from './tabs/OrdenesCompraTab';
import InformePDFTab from './tabs/InformePDFTab';

const ANIOS = [2024, 2025, 2026];

const TAB_TITLES = {
    indicadores: { title: 'Indicadores Res.188', subtitle: 'Cumplimiento regulatorio · Resolución Exenta N°188/2026' },
    ordenes:     { title: 'Análisis Órdenes de Compra', subtitle: 'Estadísticas y seguimiento de OC · Organismo 7296' },
    informe:     { title: 'Informe PDF', subtitle: 'Reporte consolidado para impresión' },
};

export default function PacDashboardPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get('tab') || 'indicadores';
    const [anio, setAnio] = useState(2026);

    const { indicadores, ocStats, ocProductos, caResumen, loading, error, refresh } = usePacDashboard(anio);

    const { title, subtitle } = TAB_TITLES[tab] ?? TAB_TITLES.indicadores;

    return (
        <div className="feature-page">
            <div className="page-header no-print">
                <div>
                    <div className="page-title">{title} {anio}</div>
                    <div className="page-subtitle">{subtitle}</div>
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
                    {tab === 'indicadores' && (
                        <IndicadoresRes188Tab indicadores={indicadores} caResumen={caResumen} />
                    )}
                    {tab === 'ordenes' && (
                        <OrdenesCompraTab ocStats={ocStats} ocProductos={ocProductos} />
                    )}
                    {tab === 'informe' && (
                        <InformePDFTab indicadores={indicadores} ocStats={ocStats} anio={anio} />
                    )}
                </>
            )}
        </div>
    );
}
