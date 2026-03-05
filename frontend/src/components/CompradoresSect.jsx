import React from 'react';
import { daysBetween } from '../utils';
import { Bar } from 'react-chartjs-2';

export default function CompradoresSect({ licitaciones }) {
    const buyers = {};
    licitaciones.forEach(l => {
        if (!buyers[l.C_Usuario]) buyers[l.C_Usuario] = { nombre: l.C_Usuario, cargo: l.C_Cargo, lics: [] };
        buyers[l.C_Usuario].lics.push(l);
    });

    const buyersList = Object.values(buyers);
    const names = Object.keys(buyers).map(k => { const p = k.split(' '); return p[0] + ' ' + p.slice(-1)[0]; });

    const chartData = {
        labels: names,
        datasets: [{
            data: buyersList.map(b => b.lics.length),
            backgroundColor: ['rgba(26,61,113,0.75)', 'rgba(107,204,214,0.75)'],
            borderRadius: 5, borderWidth: 0
        }]
    };

    const chartOptions = {
        plugins: { legend: { display: false } },
        scales: {
            y: { ticks: { color: '#6c757d', font: { size: 10 }, stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { ticks: { color: '#6c757d', font: { size: 11 } }, grid: { display: false } }
        }
    };

    return (
        <div className="tab-view active" id="tab-compradores">
            <div className="grid-2" style={{ marginBottom: '18px' }}>
                <div>
                    <div className="section-lbl">Perfil de Compradores Responsables</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
                        {buyersList.map(b => {
                            const ini = b.nombre.split(' ').map(x => x[0]).slice(0, 2).join('');
                            const diasT = b.lics.reduce((a, l) => {
                                if (l.FechaPublicacion && l.FechaCierre) {
                                    return a + daysBetween(l.FechaPublicacion, l.FechaCierre);
                                }
                                return a;
                            }, 0);
                            const licsConFecha = b.lics.filter(l => l.FechaPublicacion && l.FechaCierre).length;
                            const dias = licsConFecha > 0 ? Math.round(diasT / licsConFecha) : 0;

                            return (
                                <div className="buyer-card" key={b.nombre}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                        <div className="buyer-avatar">{ini}</div>
                                        <div>
                                            <div className="buyer-name">{b.nombre}</div>
                                            <div className="buyer-role">{b.cargo}</div>
                                        </div>
                                    </div>
                                    <div className="buyer-stats-grid">
                                        <div className="buyer-stat"><div className="buyer-stat-label">Licitaciones</div><div className="buyer-stat-value">{b.lics.length}</div></div>
                                        <div className="buyer-stat"><div className="buyer-stat-label">Días prom.</div><div className="buyer-stat-value">{dias}</div></div>
                                        <div className="buyer-stat"><div className="buyer-stat-label">Cerradas</div><div className="buyer-stat-value">{b.lics.filter(x => x.Estado === 'Cerrada').length}</div></div>
                                        <div className="buyer-stat"><div className="buyer-stat-label">Tipo</div><div className="buyer-stat-value" style={{ fontSize: '14px' }}>LE</div></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>📊</span>
                        <span className="card-title">Licitaciones por Comprador</span>
                    </div>
                    <div className="card-body">
                        <div className="chart-wrap">
                            <Bar data={chartData} options={chartOptions} />
                        </div>
                    </div>
                </div>
            </div>
            <div className="card">
                <div className="card-header card-header-accent">
                    <span style={{ fontSize: '16px' }}>📐</span>
                    <span className="card-title">Análisis de Tiempos por Etapa</span>
                    <span className="card-subtitle">Días entre hitos clave del proceso licitatorio</span>
                </div>
                <div className="card-body">
                    {buyersList.map(b => {
                        const l = b.lics[0];
                        const t1 = (l?.FechaCreacion && l?.FechaPublicacion) ? daysBetween(l.FechaCreacion, l.FechaPublicacion) : 0;
                        const t2 = (l?.FechaPublicacion && l?.FechaCierre) ? daysBetween(l.FechaPublicacion, l.FechaCierre) : 0;
                        const t3 = (l?.FechaCierre && l?.FechaEstimadaAdjudicacion) ? daysBetween(l.FechaCierre, l.FechaEstimadaAdjudicacion) : 0;

                        return (
                            <div style={{ marginBottom: '22px' }} key={b.nombre}>
                                <div style={{ fontFamily: '"Roboto Slab",serif', fontSize: '13px', fontWeight: 600, color: 'var(--gob-azul)', marginBottom: '12px' }}>👤 {b.nombre}</div>
                                <div className="progress-row">
                                    <div className="progress-label">Creación → Publicación</div>
                                    <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, (t1 / 90) * 100)}%` }}></div></div>
                                    <div className="progress-val">{t1} días</div>
                                </div>
                                <div className="progress-row">
                                    <div className="progress-label">Publicación → Cierre Ofertas</div>
                                    <div className="progress-track"><div className="progress-fill celeste" style={{ width: `${Math.min(100, (t2 / 30) * 100)}%` }}></div></div>
                                    <div className="progress-val">{t2} días</div>
                                </div>
                                <div className="progress-row">
                                    <div className="progress-label">Cierre → Adj. Estimada</div>
                                    <div className="progress-track"><div className="progress-fill amarillo" style={{ width: `${Math.min(100, (t3 / 60) * 100)}%` }}></div></div>
                                    <div className="progress-val">{t3} días</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
