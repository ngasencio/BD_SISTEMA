import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePacDashboard } from '../hooks/usePacDashboard';
import ResumenIndicadoresTab from './tabs/ResumenIndicadoresTab';
import OrdenesCompraTab from './tabs/OrdenesCompraTab';
import ReportesTab from './tabs/ReportesTab';

const ANIOS = [2024, 2025, 2026];

const TABS = [
    { key: 'resumen', label: '📊 Resumen' },
    { key: 'oc', label: '🧾 Órdenes de Compra' },
    { key: 'reportes', label: '📥 Reportes' },
];

export default function PacDashboardPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get('tab') || 'resumen';
    const [anio, setAnio] = useState(2026);

    const { indicadores, ocStats, loading, error, refresh } = usePacDashboard(anio);

    const irATab = (key) => setSearchParams({ tab: key });

    return (
        <div className="feature-page">
            <div className="pac-page-hero">
                <div className="pac-page-hero-icon">📅</div>
                <div>
                    <div className="pac-page-hero-title">Gestión PAC {anio} · Indicadores Res.188</div>
                    <div className="pac-page-hero-sub">Organismo 7296 · Servicio de Salud Osorno</div>
                </div>
                <div className="pac-page-hero-actions no-print">
                    <select
                        value={anio}
                        onChange={(e) => setAnio(Number(e.target.value))}
                        className="pac-page-hero-select"
                    >
                        {ANIOS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <button className="btn btn-secondary" onClick={refresh} disabled={loading}>
                        {loading ? '⏳ Cargando...' : '🔄 Actualizar'}
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 18, borderBottom: '1px solid #e2e8f0' }}>
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        className={`tab-btn ${tab === t.key ? 'active' : ''}`}
                        onClick={() => irATab(t.key)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {error && (
                <div className="alert alert-warning" style={{ marginBottom: 16 }}>
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
                    {tab === 'resumen' && <ResumenIndicadoresTab indicadores={indicadores} anio={anio} />}
                    {tab === 'oc' && <OrdenesCompraTab indicadores={indicadores} ocStats={ocStats} anio={anio} />}
                    {tab === 'reportes' && <ReportesTab />}
                </>
            )}
        </div>
    );
}
