import React, { useState, useEffect } from 'react';
import api from '../api';
import { Doughnut, Bar } from 'react-chartjs-2';
import { daysBetween } from '../utils';

export default function ResumenSect({ stats }) {
    const [licitaciones, setLicitaciones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filters
    const [estadoFilter, setEstadoFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        setLoading(true);
        let url = 'licitaciones/';
        if (estadoFilter) {
            url += `?Estado=${estadoFilter}`;
        }

        api.get(url)
            .then(res => {
                let results = res.data.results || res.data;
                if (searchTerm) {
                    results = results.filter(lic => lic.Nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || lic.CodigoLicitacion?.toLowerCase().includes(searchTerm.toLowerCase()));
                }
                setLicitaciones(results);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [estadoFilter, searchTerm]);

    return (
        <div className="tab-view active" id="tab-resumen">
            <div className="alert alert-warning">
                <span className="alert-icon">⚠️</span>
                <div><strong>Aviso:</strong> Datos actualizados dinámicamente desde el backend.</div>
            </div>

            {/* KPIs */}
            {stats && (
                <div className="kpi-grid">
                    <div className="kpi-card kpi-azul">
                        <span className="kpi-icon">📋</span>
                        <div className="kpi-label">Total Licitaciones</div>
                        <div className="kpi-value">{stats.total}</div>
                        <div className="kpi-meta">En Base de Datos</div>
                    </div>
                    <div className="kpi-card kpi-amarillo">
                        <span className="kpi-icon">🔒</span>
                        <div className="kpi-label">Estado Cerrada</div>
                        <div className="kpi-value">{stats.cerradas}</div>
                        <div className="kpi-meta">Licitaciones cerradas</div>
                    </div>
                    <div className="kpi-card kpi-celeste">
                        <span className="kpi-icon">🧩</span>
                        <div className="kpi-label">Compradores</div>
                        <div className="kpi-value">{stats.compradores}</div>
                        <div className="kpi-meta">Responsables únicos</div>
                    </div>
                    <div className="kpi-card kpi-rojo">
                        <span className="kpi-icon">💰</span>
                        <div className="kpi-label">Monto Total Estimado</div>
                        <div className="kpi-value">${stats.monto_total || 0}</div>
                        <div className="kpi-meta">CLP</div>
                    </div>
                </div>
            )}

            {/* Tabla */}
            <div className="card" style={{ marginBottom: '18px' }}>
                <div className="card-header card-header-accent">
                    <span style={{ fontSize: '16px' }}>📋</span>
                    <span className="card-title">Tabla Maestra de Licitaciones</span>
                </div>

                <div className="filter-bar">
                    <input className="filter-input" type="text" placeholder="🔍 Buscar por nombre o código…"
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ minWidth: '240px' }} />
                    <select className="filter-input" value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)}>
                        <option value="">Todos los estados</option>
                        <option value="Cerrada">Cerrada</option>
                        <option value="Publicada">Publicada</option>
                        <option value="Adjudicada">Adjudicada</option>
                    </select>
                </div>

                <div className="table-responsive">
                    {error && <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>}
                    {loading ? <div style={{ padding: '20px' }}>Cargando datos...</div> :
                        <table className="table-gob" id="main-table">
                            <thead>
                                <tr>
                                    <th>Código Licitación</th>
                                    <th>Nombre</th>
                                    <th>Tipo</th>
                                    <th>Estado</th>
                                    <th>Comprador</th>
                                    <th>Publicación</th>
                                    <th>Cierre Ofertas</th>
                                </tr>
                            </thead>
                            <tbody>
                                {licitaciones.length === 0 ? (
                                    <tr><td colSpan="7" style={{ textAlign: 'center' }}>No hay resultados</td></tr>
                                ) : (
                                    licitaciones.map(lic => (
                                        <tr key={lic.CodigoLicitacion}>
                                            <td className="td-mono">{lic.CodigoLicitacion}</td>
                                            <td><span title={lic.Nombre} style={{ maxWidth: '230px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lic.Nombre}</span></td>
                                            <td><span className="tag tag-azul">{lic.Tipo}</span></td>
                                            <td><span className="tag tag-gris">{lic.Estado}</span></td>
                                            <td style={{ fontSize: '12px' }}>{lic.C_Usuario}</td>
                                            <td style={{ fontFamily: '"Roboto Mono",monospace', fontSize: '11px' }}>{new Date(lic.FechaPublicacion).toLocaleDateString()}</td>
                                            <td style={{ fontFamily: '"Roboto Mono",monospace', fontSize: '11px' }}>{new Date(lic.FechaCierre).toLocaleDateString()}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    }
                </div>
            </div>

            {/* Charts */}
            <div className="grid-2" style={{ marginTop: '18px' }}>
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>📊</span>
                        <span className="card-title">Distribución por Estado</span>
                    </div>
                    <div className="card-body">
                        <div className="chart-wrap">
                            <Doughnut
                                data={{
                                    labels: ['Cerrada', 'Publicada', 'Adjudicada', 'En Evaluación'],
                                    datasets: [{
                                        data: [
                                            licitaciones.filter(l => l.Estado === 'Cerrada').length,
                                            licitaciones.filter(l => l.Estado === 'Publicada').length,
                                            licitaciones.filter(l => l.Estado === 'Adjudicada').length,
                                            licitaciones.filter(l => l.Estado === 'En Evaluación').length
                                        ],
                                        backgroundColor: ['#aab8cc', '#6bccd6', '#27ae60', '#f39c12'],
                                        borderWidth: 2, borderColor: '#fff'
                                    }]
                                }}
                                options={{ plugins: { legend: { labels: { color: '#6c757d', font: { size: 11, family: 'Roboto' } } } }, cutout: '60%' }}
                            />
                        </div>
                    </div>
                </div>
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>⏱️</span>
                        <span className="card-title">Ciclo de Vida Promedio (días)</span>
                    </div>
                    <div className="card-body">
                        <div className="chart-wrap">
                            <Bar
                                data={{
                                    labels: ['Creación → Publicación', 'Publicación → Cierre', 'Cierre → Adj. Estimada'],
                                    datasets: [{
                                        label: 'Días promedio',
                                        data: [
                                            Math.round(licitaciones.reduce((acc, l) => acc + (l.FechaCreacion && l.FechaPublicacion ? daysBetween(l.FechaCreacion, l.FechaPublicacion) : 0), 0) / (licitaciones.length || 1)),
                                            Math.round(licitaciones.reduce((acc, l) => acc + (l.FechaPublicacion && l.FechaCierre ? daysBetween(l.FechaPublicacion, l.FechaCierre) : 0), 0) / (licitaciones.length || 1)),
                                            Math.round(licitaciones.reduce((acc, l) => acc + (l.FechaCierre && l.FechaEstimadaAdjudicacion ? daysBetween(l.FechaCierre, l.FechaEstimadaAdjudicacion) : 0), 0) / (licitaciones.length || 1)),
                                        ],
                                        backgroundColor: ['rgba(26,61,113,0.7)', 'rgba(107,204,214,0.7)', 'rgba(243,156,18,0.7)'],
                                        borderRadius: 4, borderWidth: 0,
                                    }]
                                }}
                                options={{
                                    plugins: { legend: { display: false } },
                                    scales: {
                                        y: { ticks: { color: '#6c757d', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                                        x: { ticks: { color: '#6c757d', font: { size: 10 } }, grid: { display: false } }
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
