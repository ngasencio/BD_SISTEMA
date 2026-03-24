import React, { useState, useEffect, useMemo } from 'react';
import {
    Chart as ChartJS,
    ArcElement,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import api from '../lib/axios';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (amount, currency = 'CLP') =>
    amount != null
        ? new Intl.NumberFormat('es-CL', { style: 'currency', currency }).format(amount)
        : '—';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('es-CL') : '—');

const daysSince = (dateStr) => {
    if (!dateStr) return null;
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const withIva = (bruto) => (bruto ? Number(bruto) * 1.19 : 0);

// Colores por estado
const ESTADO_COLORS = {
    'aceptada': '#22c55e',
    'enviado a proveedor': '#3b82f6',
    'enviada a proveedor': '#3b82f6',
    'cancelada': '#ef4444',
    'recepción conforme': '#8b5cf6',
    'recepcion conforme': '#8b5cf6',
    'default': '#94a3b8',
};
const estadoColor = (estado) =>
    ESTADO_COLORS[(estado || '').toLowerCase()] || ESTADO_COLORS.default;

// Badge de retraso
function DelayBadge({ days }) {
    if (days === null) return <span style={{ color: '#94a3b8' }}>Sin fecha</span>;
    if (days > 90)
        return <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>🔴 {days} días</span>;
    if (days > 45)
        return <span className="badge" style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d' }}>🟡 {days} días</span>;
    return <span className="badge" style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac' }}>🟢 {days} días</span>;
}

// KPI Card simple
function KpiCard({ label, value, sub, color }) {
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '16px 20px',
            border: '1px solid #e2e8f0', flex: '1 1 160px', minWidth: 150,
            borderTop: `4px solid ${color || '#3b82f6'}`,
        }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

// ─── TAB GENERAL ────────────────────────────────────────────────────────────

function TabGeneral({ data, searchTerm, setSearchTerm }) {
    // KPIs
    const totalOCs = data.length;
    const sumaNetoCLP = data
        .filter(oc => !oc.TipoMoneda || oc.TipoMoneda === 'CLP')
        .reduce((s, oc) => s + (Number(oc.TotalNeto) || 0), 0);
    const sumaBrutoCLP = data
        .filter(oc => !oc.TipoMoneda || oc.TipoMoneda === 'CLP')
        .reduce((s, oc) => s + (Number(oc.TotalBruto) || 0), 0);
    const sumaConIva = sumaBrutoCLP * 1.19;
    const conPAC = data.filter(oc => oc.EnlacePAC).length;
    const conLink = data.filter(oc => oc.LinkMP).length;

    // Gráfico: distribución por estado
    const estadoCounts = data.reduce((acc, oc) => {
        const e = oc.EstadoOC || 'Sin estado';
        acc[e] = (acc[e] || 0) + 1;
        return acc;
    }, {});
    const estadoLabels = Object.keys(estadoCounts);
    const doughnutData = {
        labels: estadoLabels,
        datasets: [{
            data: estadoLabels.map(e => estadoCounts[e]),
            backgroundColor: estadoLabels.map(e => estadoColor(e)),
            borderWidth: 2,
            borderColor: '#fff',
        }],
    };

    // Gráfico: monto bruto por estado (CLP)
    const montoPorEstado = data
        .filter(oc => !oc.TipoMoneda || oc.TipoMoneda === 'CLP')
        .reduce((acc, oc) => {
            const e = oc.EstadoOC || 'Sin estado';
            acc[e] = (acc[e] || 0) + (Number(oc.TotalBruto) || 0);
            return acc;
        }, {});
    const barLabels = Object.keys(montoPorEstado);
    const barData = {
        labels: barLabels,
        datasets: [{
            label: 'Monto Bruto (CLP)',
            data: barLabels.map(e => montoPorEstado[e]),
            backgroundColor: barLabels.map(e => estadoColor(e)),
            borderRadius: 6,
        }],
    };

    const barOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            y: {
                ticks: {
                    callback: (v) => new Intl.NumberFormat('es-CL', { notation: 'compact', compactDisplay: 'short' }).format(v),
                },
            },
        },
    };

    return (
        <div>
            {/* KPIs */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <KpiCard label="Total OCs" value={totalOCs} color="#3b82f6" />
                <KpiCard label="Monto Neto (CLP)" value={fmt(sumaNetoCLP)} sub="Suma de TotalNeto" color="#6366f1" />
                <KpiCard label="Monto Bruto (CLP)" value={fmt(sumaBrutoCLP)} sub="Suma de TotalBruto" color="#8b5cf6" />
                <KpiCard label="Monto Bruto + 19% IVA" value={fmt(sumaConIva)} sub="TotalBruto × 1.19" color="#ec4899" />
                <KpiCard label="Enlace PAC" value={`${conPAC} / ${totalOCs}`} sub={`${totalOCs - conPAC} sin enlace`} color="#f59e0b" />
                <KpiCard label="Con Link MP" value={conLink} color="#10b981" />
            </div>

            {/* Gráficos */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                <div className="card" style={{ flex: '0 0 300px' }}>
                    <div className="card-header card-header-accent">
                        <span>🥧</span>
                        <span className="card-title">Distribución por Estado</span>
                    </div>
                    <div style={{ padding: 16, height: 220 }}>
                        {estadoLabels.length > 0
                            ? <Doughnut data={doughnutData} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }} />
                            : <p style={{ color: '#94a3b8' }}>Sin datos</p>
                        }
                    </div>
                </div>
                <div className="card" style={{ flex: '1 1 400px' }}>
                    <div className="card-header card-header-accent">
                        <span>📊</span>
                        <span className="card-title">Monto Bruto por Estado (CLP)</span>
                    </div>
                    <div style={{ padding: 16, height: 220 }}>
                        {barLabels.length > 0
                            ? <Bar data={barData} options={barOptions} />
                            : <p style={{ color: '#94a3b8' }}>Sin datos</p>
                        }
                    </div>
                </div>
            </div>

            {/* Tabla */}
            <div className="card">
                <div className="card-header card-header-accent">
                    <span>📋</span>
                    <span className="card-title">Tabla Maestra de Órdenes de Compra</span>
                </div>
                <div className="filter-bar">
                    <input className="filter-input" type="text" placeholder="🔍 Buscar por nombre o código OC…"
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ minWidth: 240 }} />
                </div>
                <div className="table-responsive">
                    <table className="table-gob">
                        <thead>
                            <tr>
                                <th>Código OC</th>
                                <th>Nombre</th>
                                <th>Tipo</th>
                                <th>Estado</th>
                                <th>Proveedor</th>
                                <th>Fecha Envío</th>
                                <th style={{ textAlign: 'right' }}>Monto Bruto</th>
                                <th style={{ textAlign: 'right' }}>+ 19% IVA</th>
                                <th>PAC</th>
                                <th>Link MP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map(oc => (
                                <tr key={oc.codigo_oc}>
                                    <td><strong>{oc.codigo_oc}</strong></td>
                                    <td style={{ maxWidth: 260 }}>
                                        <div className="truncate-text" title={oc.NombreOC}>{oc.NombreOC}</div>
                                    </td>
                                    <td><span className="badge badge-gray">{oc.TipoOC}</span></td>
                                    <td>
                                        <span className="status-badge" style={{
                                            background: estadoColor(oc.EstadoOC) + '20',
                                            color: estadoColor(oc.EstadoOC),
                                            border: `1px solid ${estadoColor(oc.EstadoOC)}40`,
                                        }}>
                                            {oc.EstadoOC || 'N/A'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="truncate-text" title={oc.P_Nombre}>{oc.P_Nombre}</div>
                                    </td>
                                    <td>{fmtDate(oc.FechaEnvio)}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        {oc.TotalBruto ? fmt(Number(oc.TotalBruto), oc.TipoMoneda || 'CLP') : '—'}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        {oc.TotalBruto ? fmt(withIva(oc.TotalBruto), oc.TipoMoneda || 'CLP') : '—'}
                                    </td>
                                    <td>
                                        {oc.EnlacePAC
                                            ? <a href={oc.EnlacePAC} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>🔗 PAC</a>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td>
                                        {oc.LinkMP
                                            ? <a href={oc.LinkMP} target="_blank" rel="noreferrer" style={{ color: '#10b981' }}>🔗 MP</a>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                </tr>
                            ))}
                            {data.length === 0 && (
                                <tr>
                                    <td colSpan="10" style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>
                                        No se encontraron órdenes de compra
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── TAB ESTADO ─────────────────────────────────────────────────────────────

const ESTADOS_CRITICOS = ['enviado a proveedor', 'enviada a proveedor', 'aceptada'];

function TabEstado({ data }) {
    const [estadoSeleccionado, setEstadoSeleccionado] = useState('');

    // Conteo y monto por estado
    const porEstado = useMemo(() => {
        return data.reduce((acc, oc) => {
            const e = oc.EstadoOC || 'Sin estado';
            if (!acc[e]) acc[e] = { count: 0, bruto: 0 };
            acc[e].count++;
            acc[e].bruto += Number(oc.TotalBruto) || 0;
            return acc;
        }, {});
    }, [data]);

    // OCs críticas (Enviada a Proveedor o Aceptada) ordenadas por días de espera desc
    const ocsCriticas = useMemo(() =>
        data
            .filter(oc => ESTADOS_CRITICOS.includes((oc.EstadoOC || '').toLowerCase()))
            .map(oc => ({ ...oc, diasEspera: daysSince(oc.FechaEnvio) }))
            .sort((a, b) => (b.diasEspera || 0) - (a.diasEspera || 0)),
        [data]
    );

    const ocsFiltradas = useMemo(() => {
        if (!estadoSeleccionado) return ocsCriticas;
        return ocsCriticas.filter(oc => (oc.EstadoOC || '').toLowerCase() === estadoSeleccionado.toLowerCase());
    }, [ocsCriticas, estadoSeleccionado]);

    const totalCriticoBruto = ocsCriticas
        .filter(oc => !oc.TipoMoneda || oc.TipoMoneda === 'CLP')
        .reduce((s, oc) => s + (Number(oc.TotalBruto) || 0), 0);

    const rojas    = ocsCriticas.filter(oc => (oc.diasEspera || 0) > 90).length;
    const amarillas = ocsCriticas.filter(oc => (oc.diasEspera || 0) > 45 && (oc.diasEspera || 0) <= 90).length;
    const verdes   = ocsCriticas.filter(oc => (oc.diasEspera || 0) <= 45).length;

    const estados = Object.keys(porEstado).sort();

    return (
        <div>
            {/* KPIs por Estado */}
            <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Resumen por Estado
                </h3>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {estados.map(e => (
                        <div key={e} style={{
                            background: '#fff', borderRadius: 8, padding: '12px 16px',
                            border: '1px solid #e2e8f0', flex: '1 1 150px', minWidth: 140,
                            borderLeft: `4px solid ${estadoColor(e)}`,
                        }}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{e}</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: estadoColor(e) }}>{porEstado[e].count}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmt(porEstado[e].bruto)}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Sección: OCs pendientes de Recepción Conforme */}
            <div className="card">
                <div className="card-header" style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
                    <span>⚠️</span>
                    <span className="card-title" style={{ color: '#c2410c' }}>
                        OCs pendientes de Recepción Conforme
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
                        Estados: "Enviado a Proveedor" / "Aceptada"
                    </span>
                </div>

                {/* KPIs de retraso */}
                <div style={{ padding: '12px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9' }}>
                    <KpiCard label="Total pendientes" value={ocsCriticas.length} color="#f97316" />
                    <KpiCard
                        label="Monto Bruto pendiente (CLP)"
                        value={fmt(totalCriticoBruto)}
                        sub={`+ IVA: ${fmt(totalCriticoBruto * 1.19)}`}
                        color="#f97316"
                    />
                    <KpiCard label="🔴 Crítico (> 90 días)" value={rojas} color="#ef4444" />
                    <KpiCard label="🟡 Alerta (45–90 días)" value={amarillas} color="#f59e0b" />
                    <KpiCard label="🟢 Normal (≤ 45 días)" value={verdes} color="#22c55e" />
                </div>

                {/* Filtro de estado dentro de la sección crítica */}
                <div className="filter-bar">
                    <select className="filter-input" value={estadoSeleccionado} onChange={e => setEstadoSeleccionado(e.target.value)}>
                        <option value="">Todos los estados críticos</option>
                        <option value="Enviado a Proveedor">Enviado a Proveedor</option>
                        <option value="Aceptada">Aceptada</option>
                    </select>
                    <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>
                        {ocsFiltradas.length} OC(s) — ordenadas por días de espera
                    </span>
                </div>

                <div className="table-responsive">
                    <table className="table-gob">
                        <thead>
                            <tr>
                                <th>Código OC</th>
                                <th>Nombre</th>
                                <th>Estado</th>
                                <th>Proveedor</th>
                                <th>Fecha Envío</th>
                                <th>Días sin Recepción</th>
                                <th style={{ textAlign: 'right' }}>Monto Bruto</th>
                                <th style={{ textAlign: 'right' }}>+ 19% IVA</th>
                                <th>PAC</th>
                                <th>Link MP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ocsFiltradas.map(oc => (
                                <tr key={oc.codigo_oc} style={{
                                    background: (oc.diasEspera || 0) > 90 ? '#fef2f2' :
                                        (oc.diasEspera || 0) > 45 ? '#fffbeb' : '#fff',
                                }}>
                                    <td><strong>{oc.codigo_oc}</strong></td>
                                    <td style={{ maxWidth: 260 }}>
                                        <div className="truncate-text" title={oc.NombreOC}>{oc.NombreOC}</div>
                                    </td>
                                    <td>
                                        <span className="status-badge" style={{
                                            background: estadoColor(oc.EstadoOC) + '20',
                                            color: estadoColor(oc.EstadoOC),
                                            border: `1px solid ${estadoColor(oc.EstadoOC)}40`,
                                        }}>
                                            {oc.EstadoOC}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="truncate-text" title={oc.P_Nombre}>{oc.P_Nombre}</div>
                                    </td>
                                    <td>{fmtDate(oc.FechaEnvio)}</td>
                                    <td><DelayBadge days={oc.diasEspera} /></td>
                                    <td style={{ textAlign: 'right' }}>
                                        {oc.TotalBruto ? fmt(Number(oc.TotalBruto), oc.TipoMoneda || 'CLP') : '—'}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        {oc.TotalBruto ? fmt(withIva(oc.TotalBruto), oc.TipoMoneda || 'CLP') : '—'}
                                    </td>
                                    <td>
                                        {oc.EnlacePAC
                                            ? <a href={oc.EnlacePAC} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>🔗 PAC</a>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td>
                                        {oc.LinkMP
                                            ? <a href={oc.LinkMP} target="_blank" rel="noreferrer" style={{ color: '#10b981' }}>🔗 MP</a>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                </tr>
                            ))}
                            {ocsFiltradas.length === 0 && (
                                <tr>
                                    <td colSpan="10" style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>
                                        No hay OCs en este estado
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────

const TABS = ['General', 'Estado'];

export function OrdenesCompraResumen() {
    const [ordenes, setOrdenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('General');
    const [yearFilter, setYearFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        api.get('ordenes-compra/')
            .then(res => setOrdenes(res.data.results || res.data))
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    // Años disponibles desde FechaEnvio o FechaCreacion
    const years = useMemo(() => {
        const ys = new Set(
            ordenes
                .map(oc => oc.FechaEnvio || oc.FechaCreacion)
                .filter(Boolean)
                .map(d => new Date(d).getFullYear())
        );
        return [...ys].sort((a, b) => b - a);
    }, [ordenes]);

    // Filtrar por año + búsqueda global
    const filtered = useMemo(() => {
        return ordenes.filter(oc => {
            if (yearFilter) {
                const fecha = oc.FechaEnvio || oc.FechaCreacion;
                if (!fecha) return false;
                if (new Date(fecha).getFullYear() !== parseInt(yearFilter)) return false;
            }
            if (searchTerm) {
                const q = searchTerm.toLowerCase();
                return (
                    oc.NombreOC?.toLowerCase().includes(q) ||
                    oc.codigo_oc?.toLowerCase().includes(q) ||
                    oc.P_Nombre?.toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [ordenes, yearFilter, searchTerm]);

    if (loading) return <div style={{ padding: 30, textAlign: 'center' }}>Cargando datos...</div>;
    if (error)   return <div style={{ padding: 30, color: '#ef4444' }}>Error: {error}</div>;

    return (
        <div className="tab-view active" id="tab-resumen-oc">
            {/* Barra de filtros globales */}
            <div style={{
                display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                marginBottom: 16, background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 16px',
            }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#475569' }}>Filtros:</span>
                <select
                    className="filter-input"
                    value={yearFilter}
                    onChange={e => setYearFilter(e.target.value)}
                    style={{ minWidth: 130 }}
                >
                    <option value="">Todos los años</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <input
                    className="filter-input"
                    type="text"
                    placeholder="🔍 Nombre, código OC o proveedor…"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ minWidth: 240 }}
                />
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
                    {filtered.length} de {ordenes.length} OC(s)
                </span>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e2e8f0' }}>
                {TABS.map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '8px 20px',
                            background: activeTab === tab ? '#3b82f6' : 'transparent',
                            color: activeTab === tab ? '#fff' : '#64748b',
                            border: 'none',
                            borderRadius: '6px 6px 0 0',
                            fontWeight: activeTab === tab ? 600 : 400,
                            cursor: 'pointer',
                            fontSize: 14,
                            transition: 'all 0.15s',
                        }}
                    >
                        {tab === 'General' && '📊 '}
                        {tab === 'Estado'  && '⚠️ '}
                        {tab}
                    </button>
                ))}
            </div>

            {activeTab === 'General' && (
                <TabGeneral data={filtered} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
            )}
            {activeTab === 'Estado' && (
                <TabEstado data={filtered} />
            )}
        </div>
    );
}

export default OrdenesCompraResumen;
