import React, { useState } from 'react';
import { Doughnut } from 'react-chartjs-2';

export default function CategoriasSect({ detalles }) {
    const [openItems, setOpenItems] = useState({});

    const toggleOpen = (id) => {
        setOpenItems(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const buildTree = () => {
        const t = {};
        detalles.forEach(d => {
            const p = d.Categoria ? d.Categoria.split('/').map(x => x.trim()) : ['Sin categoría'];
            const l1 = p[0] || 'Sin categoría';
            const l2 = p[1] || 'General';
            const l3 = p[2] || d.NombreProducto;
            if (!t[l1]) t[l1] = {};
            if (!t[l1][l2]) t[l1][l2] = [];
            t[l1][l2].push(l3);
        });
        return t;
    };

    const tree = buildTree();

    const chartData = {
        labels: Object.keys(tree).map(k => k.split(' ').slice(0, 3).join(' ') + '…'),
        datasets: [{
            data: Object.values(tree).map(v => Object.values(v).flat().length),
            backgroundColor: ['rgba(26,61,113,0.75)', 'rgba(107,204,214,0.75)'],
            borderWidth: 2, borderColor: '#fff'
        }]
    };

    return (
        <div className="tab-view active" id="tab-categorias">
            <div className="grid-7030">
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>🗂️</span>
                        <span className="card-title">Jerarquía de Categorías de Productos</span>
                        <span className="card-subtitle">Haga clic en una categoría para expandir sus niveles</span>
                    </div>
                    <div className="card-body">
                        {Object.entries(tree).map(([l1, l2m], idx) => {
                            const tot = Object.values(l2m).flat().length;
                            const id = 'ci-' + idx;
                            const isOpen = openItems[id];

                            return (
                                <div className={`cat-l1 ${isOpen ? 'open' : ''}`} key={id} style={{ marginBottom: '10px' }}>
                                    <div className="cat-l1-hdr" onClick={() => toggleOpen(id)}>
                                        <span className="cat-l1-name">📁 {l1}</span>
                                        <span className="cat-l1-count">{tot} ítem{tot > 1 ? 's' : ''}</span>
                                        <span style={{ fontSize: '10px', color: 'var(--gob-gris4)', marginLeft: '6px' }}>▼</span>
                                    </div>
                                    <div className="cat-l2-list" style={{ display: isOpen ? 'block' : 'none' }}>
                                        {Object.entries(l2m).map(([l2, l3a]) => (
                                            <div className="cat-l2" key={l2}>
                                                <div className="cat-l2-name">📂 {l2}</div>
                                                <div className="cat-l3-list">
                                                    {l3a.map((l3, l3idx) => (
                                                        <div className="cat-l3" key={l3idx}>{l3}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div>
                    <div className="card" style={{ marginBottom: '16px' }}>
                        <div className="card-header card-header-accent">
                            <span style={{ fontSize: '16px' }}>📊</span>
                            <span className="card-title">Distribución Nivel 1</span>
                        </div>
                        <div className="card-body">
                            <div className="chart-wrap">
                                <Doughnut data={chartData} options={{ plugins: { legend: { labels: { color: '#6c757d', font: { size: 10 } } } }, cutout: '55%' }} />
                            </div>
                        </div>
                    </div>
                    <div className="card">
                        <div className="card-header card-header-accent">
                            <span style={{ fontSize: '16px' }}>🔢</span>
                            <span className="card-title">Estadísticas</span>
                        </div>
                        <div className="card-body">
                            <div className="progress-row"><div className="progress-label">Equipamiento Médico</div><div className="progress-track"><div className="progress-fill" style={{ width: '75%' }}></div></div><div className="progress-val">3</div></div>
                            <div className="progress-row"><div className="progress-label">Tecnologías TI</div><div className="progress-track"><div className="progress-fill celeste" style={{ width: '25%' }}></div></div><div className="progress-val">1</div></div>
                            <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--gob-gris4)' }}>
                                Total categorías nivel 1: <strong style={{ color: 'var(--gob-azul)' }}>{Object.keys(tree).length}</strong> ·
                                Nivel 2: <strong style={{ color: 'var(--gob-azul)' }}>{Object.values(tree).reduce((a, v) => a + Object.keys(v).length, 0)}</strong> ·
                                Ítems: <strong style={{ color: 'var(--gob-azul)' }}>{detalles.length}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
