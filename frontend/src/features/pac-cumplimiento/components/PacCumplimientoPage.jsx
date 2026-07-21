import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePacCumplimiento } from '../hooks/usePacCumplimiento';
import ResumenTab from './tabs/ResumenTab';
import JerarquiaTab from './tabs/JerarquiaTab';
import RankingsTab from './tabs/RankingsTab';
import CumplimientoTemporalTab from './tabs/CumplimientoTemporalTab';
import ReportesPanel from './tabs/ReportesPanel';

const ANIOS = [2026, 2025, 2024, 2023];

const TAB_TITLES = {
    resumen:   { title: 'Cumplimiento Interno PAC', subtitle: 'Dentro/Fuera del Plan Anual de Compras y comparativa histórica' },
    jerarquia: { title: 'Análisis Jerárquico', subtitle: 'Desglose por subdirección y departamento' },
    rankings:  { title: 'Rankings', subtitle: 'Mejores y peores departamentos / formularios' },
    temporal:  { title: 'Cumplimiento Temporal', subtitle: 'En fecha, atrasado y pendiente respecto a lo planificado' },
    reportes:  { title: 'Reportes', subtitle: 'Informe Word, presentación PPT y PDF mensual o trimestral' },
};

const TABS = [
    { key: 'resumen',   label: '📊 Resumen' },
    { key: 'jerarquia', label: '🏛️ Jerarquía' },
    { key: 'rankings',  label: '🏆 Rankings' },
    { key: 'temporal',  label: '📅 Cumplimiento Temporal' },
    { key: 'reportes',  label: '📥 Reportes' },
];

export default function PacCumplimientoPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get('tab') || 'resumen';
    const [anho, setAnho] = useState(2026);
    const [rankingTipo, setRankingTipo] = useState('depto');

    const {
        dentroFuera, temporal, jerarquia, rankings,
        temporalidadMensual, resumenSubdireccion, serieMensual,
        loading, error, refresh,
    } = usePacCumplimiento(anho, rankingTipo);

    const { title, subtitle } = TAB_TITLES[tab] ?? TAB_TITLES.resumen;

    const irATab = (key) => setSearchParams({ tab: key });

    return (
        <div className="feature-page">
            <div className="page-header">
                <div>
                    <div className="page-title"><span className="page-title-icon">📋</span> {title}</div>
                    <div className="page-subtitle">{subtitle}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <select
                        value={anho}
                        onChange={(e) => setAnho(Number(e.target.value))}
                        style={{ border: '1.5px solid #c8d3de', borderRadius: 7, padding: '5px 10px', fontSize: 13, fontFamily: 'Inter, sans-serif' }}
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
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                    ⚠️ {error}
                </div>
            )}

            {loading && (
                <div style={{ textAlign: 'center', padding: 60, color: '#7a8899', fontSize: 14 }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
                    Cargando datos del módulo PAC…
                </div>
            )}

            {!loading && (
                <>
                    {tab === 'resumen' && (
                        <ResumenTab
                            dentroFuera={dentroFuera}
                            temporalidadMensual={temporalidadMensual}
                            resumenSubdireccion={resumenSubdireccion}
                            serieMensual={serieMensual}
                            anho={anho}
                        />
                    )}
                    {tab === 'jerarquia' && <JerarquiaTab jerarquia={jerarquia} anho={anho} />}
                    {tab === 'rankings' && (
                        <RankingsTab rankings={rankings} rankingTipo={rankingTipo} onChangeTipo={setRankingTipo} anho={anho} />
                    )}
                    {tab === 'temporal' && <CumplimientoTemporalTab temporal={temporal} anho={anho} />}
                    {tab === 'reportes' && <ReportesPanel />}
                </>
            )}
        </div>
    );
}
