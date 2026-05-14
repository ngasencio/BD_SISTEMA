/**
 * @file features/abastecimiento/components/AbastecimientoDashboard.jsx
 * @description Dashboard principal de Abastecimiento.
 * Muestra KPIs de FSC, distribución PAC y métricas de Mercado Público.
 */
import React from 'react';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { KpiCard } from './KpiCard';
import { PacDonut } from './PacDonut';

const fmt = (num) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(num);

export const AbastecimientoDashboard = () => {
    const { stats, loading, isMock } = useDashboardStats();

    if (loading) return <div className="loading-spinner">Cargando dashboard...</div>;
    if (!stats) return null;

    const { total_formularios, dentro_pac, fuera_pac, mercado_publico } = stats;

    return (
        <div className="feature-page">
            <div className="page-header">
                <h1>Dashboard Abastecimiento</h1>
                {isMock && (
                    <span className="badge badge-warning">Datos de demostración</span>
                )}
            </div>

            {/* KPIs Principales */}
            <section className="kpi-grid">
                <KpiCard
                    title="Total Formularios Anuales"
                    value={total_formularios.toLocaleString('es-CL')}
                    subtitle="FSC procesados en el año"
                    icon="📋"
                    colorVar="--color-primary"
                />
                <KpiCard
                    title="Dentro del PAC"
                    value={`${dentro_pac.porcentaje}%`}
                    subtitle={`${dentro_pac.count.toLocaleString('es-CL')} formularios`}
                    icon="✅"
                    colorVar="--color-success"
                />
                <KpiCard
                    title="Fuera del PAC"
                    value={`${fuera_pac.porcentaje}%`}
                    subtitle={`${fuera_pac.count.toLocaleString('es-CL')} formularios`}
                    icon="⚠️"
                    colorVar="--color-warning"
                />
                <KpiCard
                    title="Monto Adjudicado"
                    value={fmt(mercado_publico.monto_total_adjudicado)}
                    subtitle="Mercado Público"
                    icon="💰"
                    colorVar="--color-accent"
                />
            </section>

            {/* Segunda fila */}
            <section className="dashboard-grid-2col">
                {/* Gráfico PAC */}
                <div className="card">
                    <h3 className="card-title">Distribución PAC vs No PAC</h3>
                    <PacDonut
                        dentroPac={dentro_pac.porcentaje}
                        fueraPac={fuera_pac.porcentaje}
                    />
                </div>

                {/* Métricas Mercado Público */}
                <div className="card">
                    <h3 className="card-title">Mercado Público</h3>
                    <div className="stat-list">
                        <div className="stat-row">
                            <span>Licitaciones Activas</span>
                            <strong>{mercado_publico.licitaciones_activas}</strong>
                        </div>
                        <div className="stat-row">
                            <span>Adjudicadas</span>
                            <strong>{mercado_publico.licitaciones_adjudicadas}</strong>
                        </div>
                        <div className="stat-row">
                            <span>Proveedores Activos</span>
                            <strong>{mercado_publico.proveedores_activos}</strong>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};
