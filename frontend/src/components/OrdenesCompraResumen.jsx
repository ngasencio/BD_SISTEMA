import React, { useState, useEffect, useMemo } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import api from '../lib/axios';

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (amount, currency = 'CLP') =>
    amount != null
        ? new Intl.NumberFormat('es-CL', { style: 'currency', currency }).format(amount)
        : '—';

const fmtM = (n) => `$${((n ?? 0) / 1e6).toFixed(1)}M`;

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('es-CL') : '—');

const daysSince = (dateStr) => {
    if (!dateStr) return null;
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const ESTADO_COLORS = {
    'aceptada': '#22c55e',
    'enviado a proveedor': '#3b82f6',
    'enviada a proveedor': '#3b82f6',
    'cancelada': '#ef4444',
    'recepción conforme': '#8b5cf6',
    'recepcion conforme': '#8b5cf6',
    'default': '#94a3b8',
};
const estadoColor = (e) => ESTADO_COLORS[(e || '').toLowerCase()] || ESTADO_COLORS.default;

// ─── Componentes base ────────────────────────────────────────────────────────

function DelayBadge({ days }) {
    if (days === null) return <span style={{ color: '#94a3b8' }}>Sin fecha</span>;
    if (days > 90)
        return <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>🔴 {days}d</span>;
    if (days > 45)
        return <span className="badge" style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d' }}>🟡 {days}d</span>;
    return <span className="badge" style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac' }}>🟢 {days}d</span>;
}

function KpiCard({ label, value, sub, color = '#3b82f6' }) {
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '16px 20px',
            border: '1px solid #e2e8f0', flex: '1 1 160px', minWidth: 150,
            borderTop: `4px solid ${color}`,
        }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

function EnlaceBadge({ valor }) {
    if (!valor) return <span style={{ color: '#94a3b8' }}>—</span>;
    const enlazada = valor === 'Enlazada';
    return (
        <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10,
            fontWeight: 700,
            background: enlazada ? '#dcfce7' : '#fee2e2',
            color: enlazada ? '#16a34a' : '#dc2626',
            border: `1px solid ${enlazada ? '#bbf7d0' : '#fca5a5'}`,
        }}>
            {enlazada ? '✓ Enlazada' : '✗ No Enlazada'}
        </span>
    );
}

function SearchTable({ placeholder, value, onChange, count, total }) {
    return (
        <div style={{
            display: 'flex', gap: 10, alignItems: 'center', padding: '10px 16px',
            background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
        }}>
            <input
                className="filter-input"
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={e => onChange(e.target.value)}
                style={{ minWidth: 260 }}
            />
            {count !== undefined && (
                <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>
                    {count} de {total} registros
                </span>
            )}
        </div>
    );
}

// ─── TAB GENERAL ─────────────────────────────────────────────────────────────

function TabGeneral({ data, searchTerm, setSearchTerm }) {
    const totalOCs = data.length;
    const sumaNetoCLP = data.filter(oc => !oc.TipoMoneda || oc.TipoMoneda === 'CLP')
        .reduce((s, oc) => s + (Number(oc.TotalNeto) || 0), 0);
    const sumaBrutoCLP = data.filter(oc => !oc.TipoMoneda || oc.TipoMoneda === 'CLP')
        .reduce((s, oc) => s + (Number(oc.TotalBruto) || 0), 0);
    const enlazadas = data.filter(oc => oc.EnlacePAC === 'Enlazada').length;
    const conLink = data.filter(oc => oc.LinkMP).length;

    const estadoCounts = data.reduce((acc, oc) => {
        const e = oc.EstadoOC || 'Sin estado';
        acc[e] = (acc[e] || 0) + 1;
        return acc;
    }, {});
    const estadoLabels = Object.keys(estadoCounts);
    const doughnutData = {
        labels: estadoLabels,
        datasets: [{ data: estadoLabels.map(e => estadoCounts[e]), backgroundColor: estadoLabels.map(e => estadoColor(e)), borderWidth: 2, borderColor: '#fff' }],
    };

    const montoPorEstado = data.filter(oc => !oc.TipoMoneda || oc.TipoMoneda === 'CLP')
        .reduce((acc, oc) => {
            const e = oc.EstadoOC || 'Sin estado';
            acc[e] = (acc[e] || 0) + (Number(oc.TotalBruto) || 0);
            return acc;
        }, {});
    const barLabels = Object.keys(montoPorEstado);
    const barData = {
        labels: barLabels,
        datasets: [{ label: 'Monto Bruto (CLP)', data: barLabels.map(e => montoPorEstado[e]), backgroundColor: barLabels.map(e => estadoColor(e)), borderRadius: 6 }],
    };
    const barOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: v => new Intl.NumberFormat('es-CL', { notation: 'compact', compactDisplay: 'short' }).format(v) } } },
    };

    return (
        <div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <KpiCard label="Total OC" value={totalOCs} color="#3b82f6" />
                <KpiCard label="Monto Neto (CLP)" value={fmt(sumaNetoCLP)} sub="Suma de TotalNeto" color="#6366f1" />
                <KpiCard label="Monto Bruto (CLP)" value={fmt(sumaBrutoCLP)} sub="Incluye IVA" color="#8b5cf6" />
                <KpiCard label="Enlazadas PAC" value={`${enlazadas} / ${totalOCs}`} sub={`${totalOCs - enlazadas} sin enlace`} color="#f59e0b" />
                <KpiCard label="Con Link MP" value={conLink} color="#10b981" />
            </div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                <div className="card" style={{ flex: '0 0 300px' }}>
                    <div className="card-header card-header-accent"><span>🥧</span><span className="card-title">Distribución por Estado</span></div>
                    <div style={{ padding: 16, height: 220 }}>
                        {estadoLabels.length > 0
                            ? <Doughnut data={doughnutData} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }} />
                            : <p style={{ color: '#94a3b8' }}>Sin datos</p>}
                    </div>
                </div>
                <div className="card" style={{ flex: '1 1 400px' }}>
                    <div className="card-header card-header-accent"><span>📊</span><span className="card-title">Monto Bruto por Estado (CLP)</span></div>
                    <div style={{ padding: 16, height: 220 }}>
                        {barLabels.length > 0 ? <Bar data={barData} options={barOptions} /> : <p style={{ color: '#94a3b8' }}>Sin datos</p>}
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header card-header-accent"><span>📋</span><span className="card-title">Tabla Maestra de Órdenes de Compra</span></div>
                <SearchTable placeholder="🔍 Buscar nombre, código OC o proveedor…" value={searchTerm} onChange={setSearchTerm} count={data.length} />
                <div className="table-responsive">
                    <table className="table-gob">
                        <thead>
                            <tr>
                                <th>Código OC</th><th>Nombre</th><th>Tipo</th><th>Estado</th>
                                <th>Proveedor</th><th>Fecha Envío</th>
                                <th style={{ textAlign: 'right' }}>Monto Bruto</th>
                                <th>EnlacePAC</th><th>Link MP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map(oc => (
                                <tr key={oc.codigo_oc}>
                                    <td><strong>{oc.codigo_oc}</strong></td>
                                    <td style={{ maxWidth: 260 }}><div className="truncate-text" title={oc.NombreOC}>{oc.NombreOC}</div></td>
                                    <td><span className="badge badge-gray">{oc.TipoOC}</span></td>
                                    <td>
                                        <span className="status-badge" style={{ background: estadoColor(oc.EstadoOC) + '20', color: estadoColor(oc.EstadoOC), border: `1px solid ${estadoColor(oc.EstadoOC)}40` }}>
                                            {oc.EstadoOC || 'N/A'}
                                        </span>
                                    </td>
                                    <td><div className="truncate-text" title={oc.P_Nombre}>{oc.P_Nombre}</div></td>
                                    <td>{fmtDate(oc.FechaEnvio)}</td>
                                    <td style={{ textAlign: 'right' }}>{oc.TotalBruto ? fmt(Number(oc.TotalBruto), oc.TipoMoneda || 'CLP') : '—'}</td>
                                    <td><EnlaceBadge valor={oc.EnlacePAC} /></td>
                                    <td>{oc.LinkMP ? <a href={oc.LinkMP} target="_blank" rel="noreferrer" style={{ color: '#10b981' }}>🔗 MP</a> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                                </tr>
                            ))}
                            {data.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>No se encontraron OC</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── TAB ESTADO ───────────────────────────────────────────────────────────────

const ESTADOS_CRITICOS = ['enviado a proveedor', 'enviada a proveedor', 'aceptada'];

function TabEstado({ data }) {
    const [estadoSeleccionado, setEstadoSeleccionado] = useState('');

    const porEstado = useMemo(() => data.reduce((acc, oc) => {
        const e = oc.EstadoOC || 'Sin estado';
        if (!acc[e]) acc[e] = { count: 0, bruto: 0 };
        acc[e].count++;
        acc[e].bruto += Number(oc.TotalBruto) || 0;
        return acc;
    }, {}), [data]);

    const ocsCriticas = useMemo(() =>
        data.filter(oc => ESTADOS_CRITICOS.includes((oc.EstadoOC || '').toLowerCase()))
            .map(oc => ({ ...oc, diasEspera: daysSince(oc.FechaEnvio) }))
            .sort((a, b) => (b.diasEspera || 0) - (a.diasEspera || 0)),
        [data]);

    const ocsFiltradas = useMemo(() =>
        estadoSeleccionado ? ocsCriticas.filter(oc => (oc.EstadoOC || '').toLowerCase() === estadoSeleccionado.toLowerCase()) : ocsCriticas,
        [ocsCriticas, estadoSeleccionado]);

    const totalCriticoBruto = ocsCriticas.filter(oc => !oc.TipoMoneda || oc.TipoMoneda === 'CLP').reduce((s, oc) => s + (Number(oc.TotalBruto) || 0), 0);
    const rojas     = ocsCriticas.filter(oc => (oc.diasEspera || 0) > 90).length;
    const amarillas = ocsCriticas.filter(oc => (oc.diasEspera || 0) > 45 && (oc.diasEspera || 0) <= 90).length;
    const verdes    = ocsCriticas.filter(oc => (oc.diasEspera || 0) <= 45).length;
    const estados   = Object.keys(porEstado).sort();

    return (
        <div>
            <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Resumen por Estado</h3>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {estados.map(e => (
                        <div key={e} style={{ background: '#fff', borderRadius: 8, padding: '12px 16px', border: '1px solid #e2e8f0', flex: '1 1 150px', minWidth: 140, borderLeft: `4px solid ${estadoColor(e)}` }}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{e}</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: estadoColor(e) }}>{porEstado[e].count}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmt(porEstado[e].bruto)}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="card">
                <div className="card-header" style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
                    <span>⚠️</span>
                    <span className="card-title" style={{ color: '#c2410c' }}>OC pendientes de Recepción Conforme</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>Estados: "Enviado a Proveedor" / "Aceptada"</span>
                </div>
                <div style={{ padding: '12px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9' }}>
                    <KpiCard label="Total pendientes" value={ocsCriticas.length} color="#f97316" />
                    <KpiCard label="Monto Bruto pendiente (CLP)" value={fmt(totalCriticoBruto)} color="#f97316" />
                    <KpiCard label="🔴 Crítico (> 90 días)" value={rojas} color="#ef4444" />
                    <KpiCard label="🟡 Alerta (45–90 días)" value={amarillas} color="#f59e0b" />
                    <KpiCard label="🟢 Normal (≤ 45 días)" value={verdes} color="#22c55e" />
                </div>
                <div className="filter-bar">
                    <select className="filter-input" value={estadoSeleccionado} onChange={e => setEstadoSeleccionado(e.target.value)}>
                        <option value="">Todos los estados críticos</option>
                        <option value="Enviado a Proveedor">Enviado a Proveedor</option>
                        <option value="Aceptada">Aceptada</option>
                    </select>
                    <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>{ocsFiltradas.length} OC(s)</span>
                </div>
                <div className="table-responsive">
                    <table className="table-gob">
                        <thead>
                            <tr>
                                <th>Código OC</th><th>Nombre</th><th>Estado</th><th>Proveedor</th>
                                <th>Fecha Envío</th><th>Días sin Recepción</th>
                                <th style={{ textAlign: 'right' }}>Monto Bruto</th>
                                <th>EnlacePAC</th><th>Link MP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ocsFiltradas.map(oc => (
                                <tr key={oc.codigo_oc} style={{ background: (oc.diasEspera || 0) > 90 ? '#fef2f2' : (oc.diasEspera || 0) > 45 ? '#fffbeb' : '#fff' }}>
                                    <td><strong>{oc.codigo_oc}</strong></td>
                                    <td style={{ maxWidth: 260 }}><div className="truncate-text" title={oc.NombreOC}>{oc.NombreOC}</div></td>
                                    <td><span className="status-badge" style={{ background: estadoColor(oc.EstadoOC) + '20', color: estadoColor(oc.EstadoOC), border: `1px solid ${estadoColor(oc.EstadoOC)}40` }}>{oc.EstadoOC}</span></td>
                                    <td><div className="truncate-text" title={oc.P_Nombre}>{oc.P_Nombre}</div></td>
                                    <td>{fmtDate(oc.FechaEnvio)}</td>
                                    <td><DelayBadge days={oc.diasEspera} /></td>
                                    <td style={{ textAlign: 'right' }}>{oc.TotalBruto ? fmt(Number(oc.TotalBruto), oc.TipoMoneda || 'CLP') : '—'}</td>
                                    <td><EnlaceBadge valor={oc.EnlacePAC} /></td>
                                    <td>{oc.LinkMP ? <a href={oc.LinkMP} target="_blank" rel="noreferrer" style={{ color: '#10b981' }}>🔗 MP</a> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                                </tr>
                            ))}
                            {ocsFiltradas.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>No hay OC en este estado</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── TAB ENLACE PAC ───────────────────────────────────────────────────────────

function TabEnlacePAC({ data }) {
    const [search, setSearch] = useState('');

    const enlazadas    = useMemo(() => data.filter(oc => oc.EnlacePAC === 'Enlazada'), [data]);
    const noEnlazadas  = useMemo(() => data.filter(oc => oc.EnlacePAC !== 'Enlazada'), [data]);
    const corregibles  = useMemo(() => noEnlazadas.filter(oc => oc.CodigoLicitacion), [noEnlazadas]);

    const totalNeto = data.filter(oc => !oc.TipoMoneda || oc.TipoMoneda === 'CLP').reduce((s, oc) => s + (Number(oc.TotalNeto) || 0), 0);
    const montoEnl  = enlazadas.filter(oc => !oc.TipoMoneda || oc.TipoMoneda === 'CLP').reduce((s, oc) => s + (Number(oc.TotalNeto) || 0), 0);
    const montoNoEnl = noEnlazadas.filter(oc => !oc.TipoMoneda || oc.TipoMoneda === 'CLP').reduce((s, oc) => s + (Number(oc.TotalNeto) || 0), 0);

    const pctCant  = data.length > 0 ? ((enlazadas.length / data.length) * 100).toFixed(1) : 0;
    const pctMonto = totalNeto > 0 ? ((montoEnl / totalNeto) * 100).toFixed(1) : 0;

    // Monthly evolution
    const mesMap = {};
    data.forEach(oc => {
        if (!oc.FechaEnvio) return;
        const m = new Date(oc.FechaEnvio).getMonth();
        if (!mesMap[m]) mesMap[m] = { enl: 0, noEnl: 0 };
        if (oc.EnlacePAC === 'Enlazada') mesMap[m].enl += Number(oc.TotalNeto) || 0;
        else mesMap[m].noEnl += Number(oc.TotalNeto) || 0;
    });
    const evolChart = {
        labels: MESES,
        datasets: [
            { label: 'Enlazada', data: Array.from({ length: 12 }, (_, i) => mesMap[i]?.enl ?? 0), backgroundColor: '#006FB3', borderRadius: 3 },
            { label: 'No Enlazada', data: Array.from({ length: 12 }, (_, i) => mesMap[i]?.noEnl ?? 0), backgroundColor: '#FE6565', borderRadius: 3 },
        ],
    };

    // Semestral
    const s1Enl  = enlazadas.filter(oc => oc.FechaEnvio && new Date(oc.FechaEnvio).getMonth() < 6).reduce((s, oc) => s + (Number(oc.TotalNeto) || 0), 0);
    const s2Enl  = enlazadas.filter(oc => oc.FechaEnvio && new Date(oc.FechaEnvio).getMonth() >= 6).reduce((s, oc) => s + (Number(oc.TotalNeto) || 0), 0);
    const s1NoEnl = noEnlazadas.filter(oc => oc.FechaEnvio && new Date(oc.FechaEnvio).getMonth() < 6).reduce((s, oc) => s + (Number(oc.TotalNeto) || 0), 0);
    const s2NoEnl = noEnlazadas.filter(oc => oc.FechaEnvio && new Date(oc.FechaEnvio).getMonth() >= 6).reduce((s, oc) => s + (Number(oc.TotalNeto) || 0), 0);
    const semChart = {
        labels: ['S1 (Ene–Jun)', 'S2 (Jul–Dic)'],
        datasets: [
            { label: 'Enlazada',    data: [s1Enl, s2Enl],    backgroundColor: '#006FB3', borderRadius: 3 },
            { label: 'No Enlazada', data: [s1NoEnl, s2NoEnl], backgroundColor: '#FE6565', borderRadius: 3 },
        ],
    };

    // No enlazadas por TipoCompraInterna
    const tcMap = noEnlazadas.reduce((acc, oc) => {
        const k = oc.TipoCompraInterna || 'Sin tipo';
        acc[k] = (acc[k] || 0) + (Number(oc.TotalNeto) || 0);
        return acc;
    }, {});
    const tcLabels = Object.keys(tcMap).sort((a, b) => tcMap[b] - tcMap[a]);
    const tcChart = {
        labels: tcLabels,
        datasets: [{ label: 'Monto', data: tcLabels.map(k => tcMap[k]), backgroundColor: '#E0701E', borderRadius: 3, indexAxis: 'y' }],
    };

    // No enlazadas por TipoOCInterno
    const tiMap = noEnlazadas.reduce((acc, oc) => {
        const k = oc.TipoOCInterno || 'Sin clasificar';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
    }, {});
    const tiLabels = Object.keys(tiMap).sort((a, b) => tiMap[b] - tiMap[a]);
    const tiChart = {
        labels: tiLabels,
        datasets: [{ data: tiLabels.map(k => tiMap[k]), backgroundColor: ['#006FB3','#2D717C','#E0701E','#FE6565','#6C5CE7','#22c55e','#f59e0b'], borderWidth: 0 }],
    };

    const chartOpts = (yCb) => ({
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 10 } } } },
        scales: { x: { ticks: { font: { size: 10 } } }, y: { ticks: { font: { size: 10 }, callback: yCb } } },
    });
    const compactCb = v => new Intl.NumberFormat('es-CL', { notation: 'compact', compactDisplay: 'short' }).format(v);

    // Tabla filtrada
    const tablaData = useMemo(() => {
        const s = search.toLowerCase();
        return noEnlazadas.filter(oc =>
            !s || oc.codigo_oc?.toLowerCase().includes(s) || oc.P_Nombre?.toLowerCase().includes(s) || oc.CodigoLicitacion?.toLowerCase().includes(s)
        ).sort((a, b) => (Number(b.TotalNeto) || 0) - (Number(a.TotalNeto) || 0));
    }, [noEnlazadas, search]);

    return (
        <div>
            {/* KPIs */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <KpiCard label="% Enlazadas (cant.)" value={`${pctCant}%`} sub={`${enlazadas.length} de ${data.length} OC`} color="#006FB3" />
                <KpiCard label="% Enlazado (monto)" value={`${pctMonto}%`} sub={`${fmtM(montoEnl)} de ${fmtM(totalNeto)}`} color="#2D717C" />
                <KpiCard label="Monto No Enlazado" value={fmtM(montoNoEnl)} sub={`${noEnlazadas.length} OC`} color="#FE6565" />
                <KpiCard label="OC Corregibles" value={corregibles.length} sub="No Enlazadas con CodigoLicitacion" color="#E0701E" />
            </div>

            {/* Gráficos */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
                <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, fontFamily: 'Outfit,sans-serif' }}>Evolución Mensual: Enlazada vs No Enlazada</div>
                    <div style={{ height: 210 }}><Bar data={evolChart} options={chartOpts(compactCb)} /></div>
                </div>
                <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, fontFamily: 'Outfit,sans-serif' }}>Comparativo Semestral</div>
                    <div style={{ height: 210 }}><Bar data={semChart} options={chartOpts(compactCb)} /></div>
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, fontFamily: 'Outfit,sans-serif' }}>No Enlazadas por Tipo Compra Interna</div>
                    <div style={{ height: 200 }}>
                        {tcLabels.length ? <Bar data={tcChart} options={{ ...chartOpts(compactCb), indexAxis: 'y', plugins: { legend: { display: false } } }} /> : <p style={{ color: '#94a3b8', textAlign: 'center', paddingTop: 60 }}>Sin datos</p>}
                    </div>
                </div>
                <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, fontFamily: 'Outfit,sans-serif' }}>No Enlazadas por Tipo OC Interno</div>
                    <div style={{ height: 200 }}>
                        {tiLabels.length ? <Doughnut data={tiChart} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 } } } } }} /> : <p style={{ color: '#94a3b8', textAlign: 'center', paddingTop: 60 }}>Sin datos</p>}
                    </div>
                </div>
            </div>

            {/* Tabla No Enlazadas */}
            <div className="card">
                <div className="card-header card-header-accent"><span>📋</span><span className="card-title">OC No Enlazadas ({noEnlazadas.length})</span></div>
                <SearchTable placeholder="🔍 OC, proveedor, licitación…" value={search} onChange={setSearch} count={tablaData.length} total={noEnlazadas.length} />
                <div className="table-responsive">
                    <table className="table-gob">
                        <thead>
                            <tr>
                                <th>Código OC</th><th>Nombre</th><th>Modalidad</th><th>Proveedor</th>
                                <th>CodigoLicitacion</th><th>F. Envío</th>
                                <th style={{ textAlign: 'right' }}>Monto Neto</th><th>Link MP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tablaData.slice(0, 100).map(oc => (
                                <tr key={oc.codigo_oc}>
                                    <td><strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{oc.codigo_oc}</strong></td>
                                    <td style={{ maxWidth: 200 }}><div className="truncate-text" title={oc.NombreOC}>{oc.NombreOC}</div></td>
                                    <td style={{ fontSize: 11 }}>{oc.DescripcionTipoOC || oc.TipoOC || '—'}</td>
                                    <td><div className="truncate-text" title={oc.P_Nombre}>{oc.P_Nombre}</div></td>
                                    <td>
                                        {oc.CodigoLicitacion
                                            ? <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#f0fdf4', color: '#15803d', padding: '2px 6px', borderRadius: 6, border: '1px solid #bbf7d0' }}>{oc.CodigoLicitacion}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td style={{ fontSize: 11, color: '#64748b' }}>{fmtDate(oc.FechaEnvio)}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(Number(oc.TotalNeto), oc.TipoMoneda || 'CLP')}</td>
                                    <td>{oc.LinkMP ? <a href={oc.LinkMP} target="_blank" rel="noreferrer" style={{ color: '#10b981' }}>🔗 MP</a> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                                </tr>
                            ))}
                            {tablaData.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Sin resultados</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── TAB OC CORREGIBLES ───────────────────────────────────────────────────────

function TabOCCorregibles({ data, proyectosMap }) {
    const [search, setSearch] = useState('');
    const [soloConSugerencia, setSoloConSugerencia] = useState(false);

    // OC no enlazadas con CodigoLicitacion
    const candidatas = useMemo(() =>
        data.filter(oc => oc.EnlacePAC !== 'Enlazada' && oc.CodigoLicitacion),
        [data]);

    // Enriquecer con sugerencias del mapa cross-year
    const enriquecidas = useMemo(() =>
        candidatas.map(oc => ({
            ...oc,
            sugerencias: proyectosMap[oc.CodigoLicitacion] || [],
        })),
        [candidatas, proyectosMap]);

    const conSugerencia   = enriquecidas.filter(oc => oc.sugerencias.length > 0);
    const sinSugerencia   = enriquecidas.filter(oc => oc.sugerencias.length === 0);
    const montoCorregible = enriquecidas.filter(oc => !oc.TipoMoneda || oc.TipoMoneda === 'CLP')
        .reduce((s, oc) => s + (Number(oc.TotalNeto) || 0), 0);

    const fuente = soloConSugerencia ? conSugerencia : enriquecidas;
    const filtradas = useMemo(() => {
        const s = search.toLowerCase();
        return fuente.filter(oc =>
            !s || oc.codigo_oc?.toLowerCase().includes(s)
                || oc.NombreOC?.toLowerCase().includes(s)
                || oc.CodigoLicitacion?.toLowerCase().includes(s)
                || oc.P_Nombre?.toLowerCase().includes(s)
        ).sort((a, b) => (Number(b.TotalNeto) || 0) - (Number(a.TotalNeto) || 0));
    }, [fuente, search]);

    return (
        <div>
            {/* KPIs */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <KpiCard label="No Enlazadas con Licitación" value={enriquecidas.length} sub="Candidatas a corrección" color="#E0701E" />
                <KpiCard label="Con ID Proyecto sugerido" value={conSugerencia.length} sub="Pueden enlazarse ahora" color="#22c55e" />
                <KpiCard label="Sin sugerencia" value={sinSugerencia.length} sub="Revisión manual necesaria" color="#94a3b8" />
                <KpiCard label="Monto corregible" value={fmtM(montoCorregible)} sub="CLP, excluye canceladas" color="#006FB3" />
            </div>

            {/* Info box */}
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 12, color: '#92400e' }}>
                <strong>¿Cómo funciona?</strong> Se muestran las OC "No Enlazadas" que tienen <code>CodigoLicitacion</code> registrado.
                Para cada una se busca en <strong>todos los años</strong> si otra OC con el mismo código de licitación ya tiene un <code>ID_Proyecto</code> asignado —
                ese proyecto se sugiere como candidato para el enlace. El número entre paréntesis <strong>(n)</strong> indica cuántas OC ya usan ese proyecto con esa licitación.
            </div>

            {/* Controles */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <input
                    className="filter-input"
                    type="text"
                    placeholder="🔍 Buscar OC, nombre, licitación, proveedor…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ minWidth: 300 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                    <input type="checkbox" checked={soloConSugerencia} onChange={e => setSoloConSugerencia(e.target.checked)} />
                    Solo con sugerencia de proyecto ({conSugerencia.length})
                </label>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{filtradas.length} registros</span>
            </div>

            {/* Tabla */}
            <div className="card">
                <div className="table-responsive">
                    <table className="table-gob">
                        <thead>
                            <tr>
                                <th>Código OC</th>
                                <th>Nombre OC</th>
                                <th>Tipo OC Interno</th>
                                <th>Tipo Compra Interna</th>
                                <th>CodigoLicitacion</th>
                                <th>Proveedor</th>
                                <th style={{ textAlign: 'right' }}>Monto Neto</th>
                                <th>ID Proyecto sugerido</th>
                                <th>Link MP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtradas.slice(0, 200).map(oc => (
                                <tr key={oc.codigo_oc} style={{ background: oc.sugerencias.length > 0 ? '#f0fdf4' : '#fff' }}>
                                    <td><strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{oc.codigo_oc}</strong></td>
                                    <td style={{ maxWidth: 220 }}><div className="truncate-text" title={oc.NombreOC} style={{ fontSize: 12 }}>{oc.NombreOC}</div></td>
                                    <td style={{ fontSize: 11 }}>{oc.TipoOCInterno || '—'}</td>
                                    <td style={{ fontSize: 11 }}>{oc.TipoCompraInterna || '—'}</td>
                                    <td>
                                        <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '2px 6px', borderRadius: 6, border: '1px solid #bfdbfe' }}>
                                            {oc.CodigoLicitacion}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: 11 }}><div className="truncate-text" title={oc.P_Nombre}>{oc.P_Nombre}</div></td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 12 }}>{fmt(Number(oc.TotalNeto), oc.TipoMoneda || 'CLP')}</td>
                                    <td>
                                        {oc.sugerencias.length > 0
                                            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                {oc.sugerencias.map((s, i) => (
                                                    <span key={i} style={{
                                                        display: 'inline-block', padding: '2px 7px', borderRadius: 10, fontSize: 10,
                                                        fontWeight: 700, background: '#dcfce7', color: '#15803d',
                                                        border: '1px solid #bbf7d0', whiteSpace: 'nowrap',
                                                    }}>
                                                        {s.id_proyecto} <span style={{ opacity: 0.7 }}>({s.n})</span>
                                                    </span>
                                                ))}
                                              </div>
                                            : <span style={{ color: '#94a3b8', fontSize: 11 }}>Sin sugerencia</span>}
                                    </td>
                                    <td>{oc.LinkMP ? <a href={oc.LinkMP} target="_blank" rel="noreferrer" style={{ color: '#10b981' }}>🔗 MP</a> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                                </tr>
                            ))}
                            {filtradas.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Sin resultados</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

const TABS = [
    { id: 'General',      icon: '📊' },
    { id: 'Estado',       icon: '⚠️' },
    { id: 'Enlace PAC',   icon: '🔗' },
    { id: 'OC Corregibles', icon: '🛠️' },
];

export function OrdenesCompraResumen() {
    const [ordenes, setOrdenes] = useState([]);
    const [proyectosMap, setProyectosMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('General');
    const [yearFilter, setYearFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        Promise.all([
            api.get('ordenes-compra/raw_all/'),
            api.get('ordenes-compra/proyectos-licitacion/'),
        ])
            .then(([ocRes, mapRes]) => {
                setOrdenes(ocRes.data);
                setProyectosMap(mapRes.data);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    const years = useMemo(() => {
        const ys = new Set(ordenes.map(oc => oc.FechaEnvio || oc.FechaCreacion).filter(Boolean).map(d => new Date(d).getFullYear()));
        return [...ys].sort((a, b) => b - a);
    }, [ordenes]);

    const filtered = useMemo(() => ordenes.filter(oc => {
        if (yearFilter) {
            const fecha = oc.FechaEnvio || oc.FechaCreacion;
            if (!fecha) return false;
            if (new Date(fecha).getFullYear() !== parseInt(yearFilter)) return false;
        }
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            return oc.NombreOC?.toLowerCase().includes(q) || oc.codigo_oc?.toLowerCase().includes(q) || oc.P_Nombre?.toLowerCase().includes(q);
        }
        return true;
    }), [ordenes, yearFilter, searchTerm]);

    if (loading) return <div style={{ padding: 30, textAlign: 'center' }}>Cargando datos...</div>;
    if (error)   return <div style={{ padding: 30, color: '#ef4444' }}>Error: {error}</div>;

    return (
        <div className="tab-view active" id="tab-resumen-oc">
            {/* Filtros globales */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 16px' }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#475569' }}>Filtros:</span>
                <select className="filter-input" value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={{ minWidth: 130 }}>
                    <option value="">Todos los años</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <input className="filter-input" type="text" placeholder="🔍 Nombre, código OC o proveedor…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ minWidth: 240 }} />
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{filtered.length} de {ordenes.length} OC(s)</span>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e2e8f0' }}>
                {TABS.map(({ id, icon }) => (
                    <button key={id} onClick={() => setActiveTab(id)} style={{
                        padding: '8px 20px',
                        background: activeTab === id ? '#3b82f6' : 'transparent',
                        color: activeTab === id ? '#fff' : '#64748b',
                        border: 'none', borderRadius: '6px 6px 0 0',
                        fontWeight: activeTab === id ? 600 : 400,
                        cursor: 'pointer', fontSize: 14, transition: 'all 0.15s',
                    }}>
                        {icon} {id}
                    </button>
                ))}
            </div>

            {activeTab === 'General'        && <TabGeneral data={filtered} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />}
            {activeTab === 'Estado'         && <TabEstado data={filtered} />}
            {activeTab === 'Enlace PAC'     && <TabEnlacePAC data={filtered} />}
            {activeTab === 'OC Corregibles' && <TabOCCorregibles data={filtered} proyectosMap={proyectosMap} />}
        </div>
    );
}

export default OrdenesCompraResumen;
