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
    const { stats, loading, isMock } = useDevengoStats();

    if (loading) return <div className="loading-spinner">Cargando finanzas...</div>;
    if (!stats) return null;

    const { presupuesto_total, presupuesto_ejecutado, porcentaje_ejecucion,
        deuda_pendiente, estados_pago, monto_disponible_total } = stats;

    return (
        <div className="feature-page">
            <div className="page-header">
                <h1>Dashboard Financiero</h1>
                {isMock && <span className="badge badge-warning">Datos de demostración</span>}
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
                            <th>Estado</th>
                            <th>Cantidad</th>
                            <th>Monto</th>
                            <th>% del Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {estados_pago.map((row) => (
                            <tr key={row.estado}>
                                <td><span className={`badge badge-${row.estado.toLowerCase().replace(' ', '-')}`}>{row.estado}</span></td>
                                <td>{row.cantidad}</td>
                                <td>{fmt(row.monto)}</td>
                                <td>{pct(row.monto, presupuesto_total)}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
