/**
 * @file features/abastecimiento/components/KpiCard.jsx
 * @description Tarjeta KPI reutilizable para el dashboard de abastecimiento.
 */
import React from 'react';

const COLOR_CLASS = {
    '--color-primary':  'kpi-azul',
    '--color-success':  'kpi-verde',
    '--color-warning':  'kpi-amarillo',
    '--color-danger':   'kpi-rojo',
    '--color-accent':   'kpi-celeste',
};

export const KpiCard = ({ title, value, subtitle, icon, colorVar = '--color-primary', trend }) => {
    const colorClass = COLOR_CLASS[colorVar] ?? 'kpi-azul';
    return (
        <div className={`kpi-card ${colorClass}`}>
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
