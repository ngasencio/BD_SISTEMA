/**
 * @file features/abastecimiento/components/KpiCard.jsx
 * @description Tarjeta KPI reutilizable para el dashboard de abastecimiento.
 */
import React from 'react';

export const KpiCard = ({ title, value, subtitle, icon, colorVar = '--color-primary', trend }) => {
    return (
        <div className="kpi-card" style={{ '--accent': `var(${colorVar})` }}>
            {icon && <span className="kpi-icon">{icon}</span>}
            <div className="kpi-body">
                <p className="kpi-title">{title}</p>
                <p className="kpi-value">{value}</p>
                {subtitle && <p className="kpi-subtitle">{subtitle}</p>}
                {trend !== undefined && (
                    <span className={`kpi-trend ${trend >= 0 ? 'positive' : 'negative'}`}>
                        {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
                    </span>
                )}
            </div>
        </div>
    );
};
