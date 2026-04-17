/**
 * @file features/finanzas/components/FinanzasDashboard.jsx
 * @description Dashboard Financiero: presupuesto ejecutado y estados de pago.
 */
import React from 'react';
import { useDevengoStats } from '../hooks/useDevengoStats';
import { KpiCard } from '../../abastecimiento/components/KpiCard';

const fmt = (num) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(num);

const pct = (v, total) => ((v / total) * 100).toFixed(1);

export const FinanzasDashboard = () => {
    const { stats, loading, error } = useDevengoStats();

    if (loading) return <div className="loading-spinner">Cargando finanzas...</div>;
    if (error) return <div className="error-message">Error: {error}</div>;
    if (!stats) return null;

    const { presupuesto_total, presupuesto_ejecutado, porcentaje_ejecucion,
        deuda_pendiente, estados_pago, monto_disponible_total } = stats;

    return (
        <div className="feature-page">
            <div className="page-header">
                <h1>Dashboard Financiero</h1>
            </div>

            {/* KPIs */}
            <section className="kpi-grid">
                <KpiCard
                    title="Presupuesto Total"
                    value={fmt(presupuesto_total)}
                    icon="🏦"
                    colorVar="--color-primary"
                />
                <KpiCard
                    title="Presupuesto Ejecutado"
                    value={fmt(presupuesto_ejecutado)}
                    subtitle={`${porcentaje_ejecucion}% del total`}
                    icon="📊"
                    colorVar="--color-success"
                />
                <KpiCard
                    title="Monto Disponible"
                    value={fmt(monto_disponible_total)}
                    icon="💳"
                    colorVar="--color-accent"
                />
                <KpiCard
                    title="Deuda Pendiente"
                    value={fmt(deuda_pendiente)}
                    icon="⏳"
                    colorVar="--color-warning"
                />
            </section>

            {/* Barra de ejecución */}
            <div className="card">
                <h3 className="card-title">Ejecución Presupuestaria</h3>
                <div className="progress-bar-wrapper">
                    <div
                        className="progress-bar-fill"
                        style={{ width: `${porcentaje_ejecucion}%` }}
                    />
                </div>
                <p className="progress-label">
                    {fmt(presupuesto_ejecutado)} ejecutados de {fmt(presupuesto_total)} ({porcentaje_ejecucion}%)
                </p>
            </div>

            {/* Tabla de estados de pago */}
            <div className="card">
                <h3 className="card-title">Estados de Pago</h3>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Tipo Documento</th>
                            <th>Monto Deuda</th>
                            <th>% del Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {estados_pago.map((row) => (
                            <tr key={row.estado}>
                                <td>{row.estado ?? '—'}</td>
                                <td>{fmt(row.monto)}</td>
                                <td>{presupuesto_total > 0 ? pct(row.monto, presupuesto_total) : 0}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
