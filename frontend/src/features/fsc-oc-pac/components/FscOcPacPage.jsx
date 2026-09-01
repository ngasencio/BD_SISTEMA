import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../styles/dv-ui.css';
import { useFscOcPac } from '../hooks/useFscOcPac';
import { recalcularMatching } from '../api/fscOcPacApi';
import ResumenTab from './tabs/ResumenTab';
import PivoteTab from './tabs/PivoteTab';
import RevisionTab from './tabs/RevisionTab';
import DetalleTab from './tabs/DetalleTab';
import CompraAgilTab from './tabs/CompraAgilTab';
import CorregidasTab from './tabs/CorregidasTab';
import ImpactoTab from './tabs/ImpactoTab';

const ANIOS = [null, 2026, 2025, 2024, 2023, 2022];

const TAB_TITLES = {
    resumen:    { title: 'Enlace FSC-OC-PAC', subtitle: 'Cuántos Formularios Dentro-PAC ya tienen su Orden de Compra enlazada' },
    pivote:     { title: 'Jerarquía de Enlace', subtitle: 'Cobertura de enlace por Subdirección / Departamento' },
    revision:   { title: 'Revisión Pendientes', subtitle: 'Confirmar, rechazar o enlazar a mano las candidatas sugeridas' },
    corregidas: { title: 'Corregidas', subtitle: 'Registro de OC enlazadas a mano a su PAC vía Formularios FSC, y su estado de sincronización' },
    impacto:    { title: 'Impacto', subtitle: 'Cuánto están subiendo el indicador de enlace PAC las dos vías de corrección manual: Licitación y Formularios' },
    detalle:    { title: 'Explorador FSC-OC', subtitle: 'Tabla completa de enlaces, filtrable y exportable' },
    compraagil: { title: 'Enlace Compra Ágil', subtitle: 'Cobertura OC ↔ Compra Ágil vía CodigoCompraAgil (ya poblado por el ETL)' },
};

const TABS = [
    { key: 'resumen',    label: '📊 Resumen' },
    { key: 'pivote',     label: '🏛️ Jerarquía' },
    { key: 'revision',   label: '📝 Revisión Pendientes' },
    { key: 'corregidas', label: '✅ Corregidas' },
    { key: 'impacto',    label: '📈 Impacto' },
    { key: 'detalle',    label: '📋 Detalle' },
    { key: 'compraagil', label: '⚡ Compra Ágil' },
];

export default function FscOcPacPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get('tab') || 'resumen';
    const [anho, setAnho] = useState(null);
    const [recalculando, setRecalculando] = useState(false);

    const { resumen, pendientes, pivote, compraAgil, loading, error, refresh } = useFscOcPac(anho);
    const { title, subtitle } = TAB_TITLES[tab] ?? TAB_TITLES.resumen;
    const totalPendientes = (pendientes?.enlace_pendiente?.length ?? 0) + (pendientes?.pac_pendiente?.length ?? 0);

    const irATab = (key) => setSearchParams({ tab: key });

    const handleRecalcular = async () => {
        setRecalculando(true);
        try {
            await recalcularMatching();
            await refresh();
        } catch (err) {
            alert(err.response?.data?.error || 'Error al recalcular el enlace.');
        } finally {
            setRecalculando(false);
        }
    };

    return (
        <div className="feature-page" style={{ fontFamily: 'var(--dv-font)' }}>
            <div className="page-header">
                <div>
                    <div className="page-title"><span className="page-title-icon">🔗</span> {title}</div>
                    <div className="page-subtitle">{subtitle}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <select className="dv-select" value={anho ?? ''} onChange={(e) => setAnho(e.target.value ? Number(e.target.value) : null)}>
                        {ANIOS.map((a) => <option key={a ?? 'todos'} value={a ?? ''}>{a ?? 'Todos los años'}</option>)}
                    </select>
                    <button className="dv-btn" onClick={refresh} disabled={loading}>
                        {loading ? '⏳ Cargando...' : '🔄 Actualizar'}
                    </button>
                    <button className="dv-btn dv-btn--primary" onClick={handleRecalcular} disabled={recalculando} title="Recalcula el matching automático (ALTA/MEDIA/BAJA) sin pisar decisiones ya revisadas">
                        {recalculando ? '⏳ Recalculando...' : '🧮 Recalcular enlace'}
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 18, borderBottom: '1px solid var(--dv-line)', flexWrap: 'wrap' }}>
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        className={`tab-btn ${tab === t.key ? 'active' : ''}`}
                        onClick={() => irATab(t.key)}
                    >
                        {t.label}
                        {t.key === 'revision' && totalPendientes > 0 && (
                            <span style={{
                                marginLeft: 6, background: 'var(--dv-warn)', color: '#fff', borderRadius: 999,
                                fontSize: 10, padding: '1px 7px', fontWeight: 700,
                            }}>
                                {totalPendientes}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {error && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                    ⚠️ {error}
                </div>
            )}

            {loading && (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--dv-ink-3)', fontSize: 14 }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
                    Cargando datos del módulo…
                </div>
            )}

            {!loading && (
                <>
                    {tab === 'resumen' && <ResumenTab resumen={resumen} />}
                    {tab === 'pivote' && <PivoteTab pivote={pivote} />}
                    {tab === 'revision' && <RevisionTab pendientes={pendientes} onCambio={refresh} />}
                    {tab === 'corregidas' && <CorregidasTab />}
                    {tab === 'impacto' && <ImpactoTab />}
                    {tab === 'detalle' && <DetalleTab anho={anho} />}
                    {tab === 'compraagil' && <CompraAgilTab compraAgil={compraAgil} />}
                </>
            )}
        </div>
    );
}
