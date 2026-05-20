import React, { useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const SUB_TABS = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'estado', label: 'Por Estado' },
    { id: 'pac', label: 'Cruce PAC' },
    { id: 'unidad', label: 'Por Unidad' },
    { id: 'leadtime', label: 'Lead Time' },
    { id: 'monetario', label: 'Monetario' },
    { id: 'proveedores', label: 'Proveedores' },
    { id: 'historico', label: 'Evolución' },
];

const CHART_COLORS = ['#006FB3', '#2D717C', '#E0701E', '#FE6565', '#6C5CE7', '#22c55e', '#f59e0b', '#8b5cf6'];

function ResumenPanel({ data }) {
    if (!data) return null;
    const { resumen, por_estado, por_tipo } = data;

    const estadoData = {
        labels: por_estado.slice(0, 6).map((r) => r.estado || 'Sin estado'),
        datasets: [{
            data: por_estado.slice(0, 6).map((r) => r.monto),
            backgroundColor: CHART_COLORS,
            borderWidth: 0,
        }],
    };

    return (
        <div>
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
                <div className="kpi-card">
                    <div className="kpi-label">Total OC</div>
                    <div className="kpi-value">{resumen.total_oc.toLocaleString('es-CL')}</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">Monto Neto</div>
                    <div className="kpi-value">{fmt(resumen.monto_total)}</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">Monto Bruto</div>
                    <div className="kpi-value">{fmt(resumen.monto_bruto)}</div>
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="card" style={{ padding: 16 }}>
                    <div style={{ fontWeight: 700, fontFamily: 'Outfit, sans-serif', marginBottom: 12 }}>Monto por Estado</div>
                    <div style={{ height: 220 }}>
                        <Doughnut data={estadoData} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }} />
                    </div>
                </div>
                <div className="card" style={{ padding: 16 }}>
                    <div style={{ fontWeight: 700, fontFamily: 'Outfit, sans-serif', marginBottom: 12 }}>Por Tipo de OC</div>
                    <table className="data-table">
                        <thead><tr><th>Tipo</th><th>Descripción</th><th>Cant.</th><th>Monto</th></tr></thead>
                        <tbody>
                            {por_tipo.map((r, i) => (
                                <tr key={i}>
                                    <td><span className="badge badge-blue">{r.tipo}</span></td>
                                    <td>{r.descripcion || '—'}</td>
                                    <td>{r.cantidad}</td>
                                    <td>{fmt(r.monto)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function EstadoPanel({ data }) {
    if (!data) return null;
    const { por_estado } = data;
    const chartData = {
        labels: por_estado.map((r) => r.estado || 'Sin estado'),
        datasets: [
            { label: 'Monto Neto', data: por_estado.map((r) => r.monto), backgroundColor: '#006FB3' },
            { label: 'Cantidad', data: por_estado.map((r) => r.cantidad), backgroundColor: '#2D717C', yAxisID: 'y1' },
        ],
    };
    return (
        <div>
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ height: 260 }}>
                    <Bar data={chartData} options={{
                        maintainAspectRatio: false,
                        scales: {
                            y: { title: { display: true, text: 'Monto CLP' } },
                            y1: { position: 'right', title: { display: true, text: 'Cantidad' }, grid: { drawOnChartArea: false } },
                        },
                    }} />
                </div>
            </div>
            <div className="card" style={{ overflowX: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>Estado</th><th>Cantidad</th><th>Monto Neto</th></tr></thead>
                    <tbody>
                        {por_estado.map((r, i) => (
                            <tr key={i}>
                                <td>{r.estado || '—'}</td>
                                <td>{r.cantidad.toLocaleString('es-CL')}</td>
                                <td>{fmt(r.monto)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function CrucePACPanel({ data }) {
    if (!data) return null;
    const { cruce_pac } = data;
    const total = cruce_pac.reduce((s, r) => s + r.monto, 0);
    return (
        <div>
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
                {cruce_pac.map((r, i) => (
                    <div key={i} className="kpi-card">
                        <div className="kpi-label">{r.enlace || 'Sin enlace'}</div>
                        <div className="kpi-value">{fmt(r.monto)}</div>
                        <div style={{ fontSize: 11, color: '#7a8899', marginTop: 4 }}>
                            {r.cantidad} OC · {total > 0 ? ((r.monto / total) * 100).toFixed(1) : 0}%
                        </div>
                    </div>
                ))}
            </div>
            <div className="card" style={{ overflowX: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>Enlace PAC</th><th>Cantidad OC</th><th>Monto Neto</th><th>% del Total</th></tr></thead>
                    <tbody>
                        {cruce_pac.map((r, i) => (
                            <tr key={i}>
                                <td>
                                    <span className={`badge ${r.enlace === 'Enlazada' ? 'badge-green' : 'badge-gray'}`}>
                                        {r.enlace || 'Sin enlace'}
                                    </span>
                                </td>
                                <td>{r.cantidad.toLocaleString('es-CL')}</td>
                                <td>{fmt(r.monto)}</td>
                                <td>{total > 0 ? ((r.monto / total) * 100).toFixed(1) : 0}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function UnidadPanel({ data }) {
    if (!data) return null;
    const { por_unidad } = data;
    const chartData = {
        labels: por_unidad.map((r) => r.unidad || 'Sin unidad'),
        datasets: [{ label: 'Monto Neto', data: por_unidad.map((r) => r.monto), backgroundColor: CHART_COLORS[0] }],
    };
    return (
        <div>
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ height: 300 }}>
                    <Bar data={chartData} options={{ maintainAspectRatio: false, indexAxis: 'y' }} />
                </div>
            </div>
            <div className="card" style={{ overflowX: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>Unidad Compradora</th><th>Cantidad</th><th>Monto Neto</th></tr></thead>
                    <tbody>
                        {por_unidad.map((r, i) => (
                            <tr key={i}>
                                <td>{r.unidad || '—'}</td>
                                <td>{r.cantidad}</td>
                                <td>{fmt(r.monto)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function LeadTimePanel({ data }) {
    if (!data) return null;
    const { lead_time } = data;
    const chartData = {
        labels: lead_time.map((r) => r.unidad || 'Sin unidad'),
        datasets: [{ label: 'Días promedio', data: lead_time.map((r) => r.avg_dias), backgroundColor: '#E0701E' }],
    };
    return (
        <div>
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ height: 280 }}>
                    <Bar data={chartData} options={{ maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }} />
                </div>
            </div>
            <div className="card" style={{ overflowX: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>Unidad</th><th>Días promedio</th><th>N° OC</th></tr></thead>
                    <tbody>
                        {lead_time.map((r, i) => (
                            <tr key={i}>
                                <td>{r.unidad || '—'}</td>
                                <td>{r.avg_dias}</td>
                                <td>{r.n}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function MonetarioPanel({ data }) {
    if (!data) return null;
    const { evolucion_mensual } = data;
    const labels = evolucion_mensual.map((r) => MESES[(r.mes || 1) - 1]);
    const chartData = {
        labels,
        datasets: [
            { label: 'Monto Neto', data: evolucion_mensual.map((r) => r.monto), borderColor: '#006FB3', backgroundColor: 'rgba(0,111,179,.1)', fill: true, tension: .3 },
        ],
    };
    return (
        <div>
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontFamily: 'Outfit, sans-serif', marginBottom: 12 }}>Evolución mensual — Monto OC</div>
                <div style={{ height: 260 }}>
                    <Line data={chartData} options={{ maintainAspectRatio: false }} />
                </div>
            </div>
            <div className="card" style={{ overflowX: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>Mes</th><th>Cantidad</th><th>Monto Neto</th></tr></thead>
                    <tbody>
                        {evolucion_mensual.map((r, i) => (
                            <tr key={i}>
                                <td>{MESES[(r.mes || 1) - 1]}</td>
                                <td>{r.cantidad}</td>
                                <td>{fmt(r.monto)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ProveedoresPanel({ data }) {
    if (!data) return null;
    const { top_proveedores } = data;
    const chartData = {
        labels: top_proveedores.slice(0, 10).map((r) => r.nombre || r.rut || '—'),
        datasets: [{ label: 'Monto Neto', data: top_proveedores.slice(0, 10).map((r) => r.monto), backgroundColor: '#6C5CE7' }],
    };
    return (
        <div>
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ height: 280 }}>
                    <Bar data={chartData} options={{ maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }} />
                </div>
            </div>
            <div className="card" style={{ overflowX: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>Proveedor</th><th>RUT</th><th>Cantidad OC</th><th>Monto Neto</th></tr></thead>
                    <tbody>
                        {top_proveedores.map((r, i) => (
                            <tr key={i}>
                                <td>{r.nombre || '—'}</td>
                                <td>{r.rut || '—'}</td>
                                <td>{r.cantidad}</td>
                                <td>{fmt(r.monto)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function EvolucionPanel({ data }) {
    if (!data) return null;
    const { evolucion_mensual } = data;
    const acumulado = [];
    let acc = 0;
    evolucion_mensual.forEach((r) => { acc += r.monto; acumulado.push(acc); });

    const chartData = {
        labels: evolucion_mensual.map((r) => MESES[(r.mes || 1) - 1]),
        datasets: [
            { label: 'Mensual', data: evolucion_mensual.map((r) => r.monto), backgroundColor: 'rgba(0,111,179,.6)', type: 'bar' },
            { label: 'Acumulado', data: acumulado, borderColor: '#E0701E', fill: false, tension: .3, type: 'line', yAxisID: 'y1' },
        ],
    };
    return (
        <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, fontFamily: 'Outfit, sans-serif', marginBottom: 12 }}>Gasto Mensual vs Acumulado</div>
            <div style={{ height: 300 }}>
                <Bar data={chartData} options={{
                    maintainAspectRatio: false,
                    scales: {
                        y: { title: { display: true, text: 'Mensual CLP' } },
                        y1: { position: 'right', title: { display: true, text: 'Acumulado' }, grid: { drawOnChartArea: false } },
                    },
                }} />
            </div>
        </div>
    );
}

export default function OrdenesCompraTab({ ocStats }) {
    const [subTab, setSubTab] = useState('resumen');

    const panels = {
        resumen: <ResumenPanel data={ocStats} />,
        estado: <EstadoPanel data={ocStats} />,
        pac: <CrucePACPanel data={ocStats} />,
        unidad: <UnidadPanel data={ocStats} />,
        leadtime: <LeadTimePanel data={ocStats} />,
        monetario: <MonetarioPanel data={ocStats} />,
        proveedores: <ProveedoresPanel data={ocStats} />,
        historico: <EvolucionPanel data={ocStats} />,
    };

    return (
        <div className="pac-tab-content">
            <div className="pac-sub-tabs">
                {SUB_TABS.map((t) => (
                    <button
                        key={t.id}
                        className={`pac-sub-tab-btn ${subTab === t.id ? 'active' : ''}`}
                        onClick={() => setSubTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <div style={{ marginTop: 16 }}>
                {panels[subTab]}
            </div>
        </div>
    );
}
