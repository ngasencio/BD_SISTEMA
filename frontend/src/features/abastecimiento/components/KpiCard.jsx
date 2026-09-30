/**
 * @file features/abastecimiento/components/KpiCard.jsx
 * @description Tarjeta KPI reutilizable, usada en Abastecimiento y en Anexo N°1.
 */
import React, { useState } from 'react';

const COLOR_CLASS = {
    '--color-primary':  'kpi-azul',
    '--color-success':  'kpi-verde',
    '--color-warning':  'kpi-amarillo',
    '--color-danger':   'kpi-rojo',
    '--color-accent':   'kpi-celeste',
};

// `tip` acepta dos formatos:
//   - texto plano  -> tooltip simple vía CSS ([data-tip]:hover::after en index.css)
//   - "Título||Descripción||Fórmula" (fórmula opcional) -> tooltip enriquecido,
//     mismo formato data-tip usado en el reporte Anexo N°3 (anexo3_reporte_sigfe.html)
// Se distingue por la presencia de "||" — así ningún KpiCard existente (decenas
// de usos con texto plano en Abastecimiento/Contratos/PAC) cambia de comportamiento.
function parseTipEnriquecido(tip) {
    if (!tip || !tip.includes('||')) return null;
    const [titulo, descripcion, formula] = tip.split('||');
    return { titulo: (titulo || '').trim(), descripcion: (descripcion || '').trim(), formula: formula?.trim() || null };
}

function KpiTooltipEnriquecido({ titulo, descripcion, formula }) {
    const [visible, setVisible] = useState(false);
    return (
        <span
            style={{ position: 'absolute', top: 10, right: 12 }}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            <span style={{ cursor: 'help', color: 'var(--gob-gris4)', fontSize: 13, fontWeight: 700 }}>ⓘ</span>
            {visible && (
                <div style={{
                    position: 'absolute', top: '135%', right: 0, width: 240, zIndex: 50,
                    background: 'var(--gob-gris5)', color: '#fff', borderRadius: 8,
                    padding: '10px 12px', fontSize: 11, lineHeight: 1.5,
                    boxShadow: 'var(--shadow-md)', pointerEvents: 'none', textAlign: 'left',
                }}>
                    <div style={{
                        fontWeight: 700, fontSize: 11.5, marginBottom: 4,
                        borderBottom: '1px solid rgba(255,255,255,.15)', paddingBottom: 4,
                    }}>
                        {titulo}
                    </div>
                    <div>{descripcion}</div>
                    {formula && (
                        <div style={{
                            marginTop: 6, padding: '4px 7px', background: 'rgba(255,255,255,.1)',
                            borderRadius: 5, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#93c5fd',
                        }}>
                            {formula}
                        </div>
                    )}
                </div>
            )}
        </span>
    );
}

export const KpiCard = ({ title, value, subtitle, icon, colorVar = '--color-primary', trend, tip }) => {
    const colorClass = COLOR_CLASS[colorVar] ?? 'kpi-azul';
    const tipEnriquecido = parseTipEnriquecido(tip);
    return (
        <div className={`kpi-card ${colorClass}`} style={{ position: 'relative' }} {...(tip && !tipEnriquecido ? { 'data-tip': tip } : {})}>
            {tipEnriquecido && <KpiTooltipEnriquecido {...tipEnriquecido} />}
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
