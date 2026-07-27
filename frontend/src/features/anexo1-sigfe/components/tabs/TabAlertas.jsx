import React from 'react';
import { KpiCard } from '../../../abastecimiento/components/KpiCard';
import { useAnexo1Fetch } from '../../hooks/useAnexo1Fetch';
import { fetchAlertasAnexo1 } from '../../api/anexo1SigfeApi';
import { paramsBase } from './filtrosParams';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const BADGE = { critica: 'badge--danger', advertencia: 'badge--warning', info: 'badge--info' };
const ETIQUETA = { critica: '🔴 Crítica', advertencia: '🟡 Advertencia', info: 'ℹ️ Informativa' };

export default function TabAlertas({ filtros, refreshKey }) {
    const { data, loading, error } = useAnexo1Fetch(
        fetchAlertasAnexo1, paramsBase(filtros), refreshKey, 'No se pudo cargar Alertas y Anomalías.',
    );

    if (loading && !data) return <div className="loading-spinner">Cargando Alertas y Anomalías…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data) return null;

    return (
        <div>
            <div className="kpi-grid" style={{ marginBottom: 20 }}>
                <KpiCard title="Críticas" value={data.contadores.criticas} icon="🔴" colorVar="--color-danger" />
                <KpiCard title="Advertencias" value={data.contadores.advertencias} icon="🟡" colorVar="--color-warning" />
                <KpiCard title="Informativas" value={data.contadores.informativas} icon="ℹ️" colorVar="--color-accent" />
            </div>

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {['Severidad', 'Concepto', 'Tipo', 'Valor', 'Observación'].map((h) => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11.5, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.alertas.length === 0 && (
                            <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Sin alertas para el período seleccionado.</td></tr>
                        )}
                        {data.alertas.map((a, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '9px 12px' }}><span className={`badge ${BADGE[a.severidad]}`}>{ETIQUETA[a.severidad]}</span></td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5 }}>{a.concepto}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5 }}>{a.tipo}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(a.valor)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12, color: '#64748b' }}>{a.observacion}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
