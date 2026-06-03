import React, { useState, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

const SEMAFORO_CONFIG = {
    rojo:     { color: '#e74c3c', bg: '#ffeaea', label: 'Urgente',     emoji: '🔴' },
    amarillo: { color: '#f39c12', bg: '#fff8e1', label: 'Atención',    emoji: '🟡' },
    verde:    { color: '#27ae60', bg: '#eafaf1', label: 'En plazo',    emoji: '🟢' },
};

function SortButton({ col, sortCol, sortDir, onSort }) {
    const active = sortCol === col;
    return (
        <button
            onClick={() => onSort(col)}
            style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                color: active ? '#1a3d71' : '#aaa', fontWeight: active ? 700 : 400, fontSize: '11px',
            }}
            title={`Ordenar por ${col}`}
        >
            {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </button>
    );
}

function useSortTable(data, defaultCol = '', defaultDir = 'asc') {
    const [sortCol, setSortCol] = useState(defaultCol);
    const [sortDir, setSortDir] = useState(defaultDir);

    const onSort = (col) => {
        if (sortCol === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(col);
            setSortDir('asc');
        }
    };

    const sorted = useMemo(() => {
        if (!sortCol) return data;
        return [...data].sort((a, b) => {
            const va = a[sortCol] ?? '';
            const vb = b[sortCol] ?? '';
            if (typeof va === 'number' && typeof vb === 'number') {
                return sortDir === 'asc' ? va - vb : vb - va;
            }
            return sortDir === 'asc'
                ? String(va).localeCompare(String(vb), 'es')
                : String(vb).localeCompare(String(va), 'es');
        });
    }, [data, sortCol, sortDir]);

    return { sorted, sortCol, sortDir, onSort };
}

export default function GestionSect({ gestionData, loading }) {
    const [filtroComprador, setFiltroComprador] = useState('');
    const [filtroSemaforo, setFiltroSemaforo] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('');
    const [busqueda, setBusqueda] = useState('');

    const kpis = gestionData?.kpis || {};
    const licitaciones = gestionData?.licitaciones || [];
    const porComprador = gestionData?.por_comprador || [];

    const compradores = useMemo(() =>
        [...new Set(licitaciones.map(l => l.comprador).filter(Boolean))].sort(),
        [licitaciones]
    );

    const filtradas = useMemo(() => licitaciones.filter(l => {
        if (filtroComprador && l.comprador !== filtroComprador) return false;
        if (filtroSemaforo && l.semaforo !== filtroSemaforo) return false;
        if (filtroEstado && l.estado !== filtroEstado) return false;
        if (busqueda) {
            const q = busqueda.toLowerCase();
            if (!l.nombre?.toLowerCase().includes(q) && !l.codigo_licitacion?.toLowerCase().includes(q)) return false;
        }
        return true;
    }), [licitaciones, filtroComprador, filtroSemaforo, filtroEstado, busqueda]);

    const { sorted, sortCol, sortDir, onSort } = useSortTable(filtradas, 'semaforo', 'asc');

    // Gráfico por comprador
    const chartCompradorData = useMemo(() => {
        const labels = porComprador.slice(0, 10).map(c => c.comprador);
        return {
            labels,
            datasets: [
                {
                    label: 'Alertas Rojo',
                    data: porComprador.slice(0, 10).map(c => c.alertas_rojo),
                    backgroundColor: 'rgba(231,76,60,0.8)',
                    borderRadius: 4,
                },
                {
                    label: 'Alertas Amarillo',
                    data: porComprador.slice(0, 10).map(c => c.alertas_amarillo),
                    backgroundColor: 'rgba(243,156,18,0.8)',
                    borderRadius: 4,
                },
                {
                    label: 'En plazo',
                    data: porComprador.slice(0, 10).map(c => c.total - c.alertas_rojo - c.alertas_amarillo),
                    backgroundColor: 'rgba(39,174,96,0.8)',
                    borderRadius: 4,
                },
            ],
        };
    }, [porComprador]);

    if (loading) return <div className="loading-spinner">Cargando gestión de licitaciones...</div>;

    if (!gestionData) return (
        <div className="card" style={{ padding: '32px', textAlign: 'center', color: '#888' }}>
            No hay datos de gestión disponibles.
        </div>
    );

    return (
        <div className="tab-view active">

            {/* KPIs */}
            <div className="kpi-grid">
                <div className="kpi-card kpi-azul">
                    <span className="kpi-icon">📢</span>
                    <div className="kpi-label">Publicadas</div>
                    <div className="kpi-value">{kpis.total_publicadas ?? 0}</div>
                    <div className="kpi-meta">En recepción de ofertas</div>
                </div>
                <div className="kpi-card kpi-celeste">
                    <span className="kpi-icon">🔍</span>
                    <div className="kpi-label">En Evaluación</div>
                    <div className="kpi-value">{kpis.total_cerradas ?? 0}</div>
                    <div className="kpi-meta">Ofertas cerradas, en evaluación</div>
                </div>
                <div className="kpi-card kpi-rojo">
                    <span className="kpi-icon">🔴</span>
                    <div className="kpi-label">Alertas Urgentes</div>
                    <div className="kpi-value">{kpis.alertas_rojo ?? 0}</div>
                    <div className="kpi-meta">Menos de 3 días o vencidas</div>
                </div>
                <div className="kpi-card kpi-amarillo">
                    <span className="kpi-icon">🟡</span>
                    <div className="kpi-label">Alertas Atención</div>
                    <div className="kpi-value">{kpis.alertas_amarillo ?? 0}</div>
                    <div className="kpi-meta">Menos de 7 días</div>
                </div>
            </div>

            {/* Gráfico por comprador */}
            {porComprador.length > 0 && (
                <div className="card" style={{ marginBottom: '18px' }}>
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>👤</span>
                        <span className="card-title">Estado por Comprador</span>
                    </div>
                    <div className="card-body">
                        <div className="chart-wrap" style={{ maxHeight: '280px' }}>
                            <Bar
                                data={chartCompradorData}
                                options={{
                                    indexAxis: 'y',
                                    plugins: {
                                        legend: { position: 'bottom', labels: { color: '#6c757d', font: { size: 11 } } },
                                    },
                                    scales: {
                                        x: { stacked: true, ticks: { color: '#6c757d', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                                        y: { stacked: true, ticks: { color: '#333', font: { size: 10 } }, grid: { display: false } },
                                    },
                                    responsive: true,
                                    maintainAspectRatio: false,
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Tabla de licitaciones activas */}
            <div className="card">
                <div className="card-header card-header-accent">
                    <span style={{ fontSize: '16px' }}>📋</span>
                    <span className="card-title">Licitaciones Activas</span>
                    <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#888' }}>
                        {filtradas.length} de {licitaciones.length}
                    </span>
                </div>

                <div className="filter-bar">
                    <input
                        className="filter-input"
                        type="text"
                        placeholder="🔍 Buscar por nombre o código…"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        style={{ minWidth: '220px' }}
                    />
                    <select className="filter-input" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
                        <option value="">Todos los estados</option>
                        <option value="Publicada">Publicada</option>
                        <option value="Cerrada">Cerrada</option>
                    </select>
                    <select className="filter-input" value={filtroSemaforo} onChange={e => setFiltroSemaforo(e.target.value)}>
                        <option value="">Todos los semáforos</option>
                        <option value="rojo">🔴 Urgente</option>
                        <option value="amarillo">🟡 Atención</option>
                        <option value="verde">🟢 En plazo</option>
                    </select>
                    <select className="filter-input" value={filtroComprador} onChange={e => setFiltroComprador(e.target.value)}>
                        <option value="">Todos los compradores</option>
                        {compradores.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                <div className="table-responsive">
                    <table className="table-gob">
                        <thead>
                            <tr>
                                <th>
                                    Estado&nbsp;
                                    <SortButton col="semaforo" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                                </th>
                                <th>
                                    Código&nbsp;
                                    <SortButton col="codigo_licitacion" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                                </th>
                                <th>Nombre</th>
                                <th>
                                    Comprador&nbsp;
                                    <SortButton col="comprador" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                                </th>
                                <th>
                                    Proceso&nbsp;
                                    <SortButton col="estado" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                                </th>
                                <th>
                                    Fecha Cierre&nbsp;
                                    <SortButton col="fecha_cierre" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                                </th>
                                <th>
                                    Fecha Est. Adj.&nbsp;
                                    <SortButton col="fecha_estimada_adjudicacion" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                                </th>
                                <th>
                                    Días&nbsp;
                                    <SortButton col="dias_para_cierre" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                                </th>
                                <th>Alerta</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.length === 0 ? (
                                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: '#888' }}>Sin licitaciones activas con los filtros seleccionados</td></tr>
                            ) : sorted.map(lic => {
                                const cfg = SEMAFORO_CONFIG[lic.semaforo] || SEMAFORO_CONFIG.verde;
                                const diasMostrar = lic.dias_para_cierre ?? lic.dias_para_adjudicacion;
                                return (
                                    <tr key={lic.codigo_licitacion} style={{ borderLeft: `3px solid ${cfg.color}` }}>
                                        <td>
                                            <span style={{
                                                background: cfg.bg, color: cfg.color,
                                                padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                            }}>
                                                {cfg.emoji} {cfg.label}
                                            </span>
                                        </td>
                                        <td className="td-mono" style={{ fontSize: '11px' }}>{lic.codigo_licitacion}</td>
                                        <td>
                                            <span title={lic.nombre} style={{
                                                maxWidth: '200px', display: 'block',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>
                                                {lic.nombre}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '12px' }}>{lic.comprador}</td>
                                        <td>
                                            <span className={`tag ${lic.estado === 'Publicada' ? 'tag-azul' : 'tag-gris'}`}>
                                                {lic.estado}
                                            </span>
                                        </td>
                                        <td style={{ fontFamily: '"Roboto Mono",monospace', fontSize: '11px' }}>
                                            {lic.fecha_cierre || '—'}
                                        </td>
                                        <td style={{ fontFamily: '"Roboto Mono",monospace', fontSize: '11px' }}>
                                            {lic.fecha_estimada_adjudicacion || '—'}
                                        </td>
                                        <td style={{ textAlign: 'center', fontWeight: 700, color: cfg.color }}>
                                            {diasMostrar !== null && diasMostrar !== undefined
                                                ? (diasMostrar < 0 ? `+${Math.abs(diasMostrar)}d venc.` : `${diasMostrar}d`)
                                                : '—'}
                                        </td>
                                        <td style={{ fontSize: '11px', color: '#666', maxWidth: '160px' }}>
                                            {lic.descripcion_semaforo}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Resumen por comprador */}
            {porComprador.length > 0 && (
                <div className="card" style={{ marginTop: '18px' }}>
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>📊</span>
                        <span className="card-title">Resumen por Comprador</span>
                    </div>
                    <div className="table-responsive">
                        <table className="table-gob">
                            <thead>
                                <tr>
                                    <th>Comprador</th>
                                    <th>Total activas</th>
                                    <th>Publicadas</th>
                                    <th>En evaluación</th>
                                    <th>🔴 Urgente</th>
                                    <th>🟡 Atención</th>
                                </tr>
                            </thead>
                            <tbody>
                                {porComprador.map(c => (
                                    <tr key={c.comprador}>
                                        <td style={{ fontWeight: 600 }}>{c.comprador}</td>
                                        <td style={{ textAlign: 'center' }}>{c.total}</td>
                                        <td style={{ textAlign: 'center' }}>{c.publicadas}</td>
                                        <td style={{ textAlign: 'center' }}>{c.cerradas}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            {c.alertas_rojo > 0
                                                ? <span style={{ color: '#e74c3c', fontWeight: 700 }}>{c.alertas_rojo}</span>
                                                : <span style={{ color: '#aaa' }}>—</span>}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {c.alertas_amarillo > 0
                                                ? <span style={{ color: '#f39c12', fontWeight: 700 }}>{c.alertas_amarillo}</span>
                                                : <span style={{ color: '#aaa' }}>—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
