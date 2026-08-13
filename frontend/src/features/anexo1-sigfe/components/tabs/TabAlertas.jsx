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
                <KpiCard title="Críticas" value={data.contadores.criticas} icon="🔴" colorVar="--color-danger" tip="Deuda flotante superior a $100.000.000 en el concepto." />
                <KpiCard title="Advertencias" value={data.contadores.advertencias} icon="🟡" colorVar="--color-warning" tip="Deuda flotante superior a $1.000.000 en el concepto." />
                <KpiCard title="Informativas" value={data.contadores.informativas} icon="ℹ️" colorVar="--color-accent" tip="Anomalías detectadas sin implicar necesariamente un riesgo (ej. gasto sin Ley asociada)." />
            </div>

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="table-gob">
                    <thead>
                        <tr>
                            <th>Severidad</th>
                            <th>Concepto</th>
                            <th>Tipo</th>
                            <th>Valor</th>
                            <th>Observación</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.alertas.length === 0 && (
                            <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--gob-gris4)' }}>Sin alertas para el período seleccionado.</td></tr>
                        )}
                        {data.alertas.map((a, i) => (
                            <tr key={i}>
                                <td><span className={`badge ${BADGE[a.severidad]}`}>{ETIQUETA[a.severidad]}</span></td>
                                <td>{a.concepto}</td>
                                <td>{a.tipo}</td>
                                <td className="td-monto" style={{ fontWeight: 600 }}>{fmtMoney(a.valor)}</td>
                                <td style={{ fontSize: 12, color: 'var(--gob-gris4)' }}>{a.observacion}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
