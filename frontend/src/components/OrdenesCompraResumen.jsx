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

// ─── Paginación ──────────────────────────────────────────────────────────────

function usePagination(total, pageSize) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return totalPages;
}

function Pagination({ page, setPage, pageSize, setPageSize, total }) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const end   = Math.min(page * pageSize, total);

    const btnBase = { padding: '3px 9px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, cursor: 'pointer', background: '#fff', color: '#475569', lineHeight: 1.4 };
    const btnDis  = { ...btnBase, cursor: 'not-allowed', color: '#cbd5e1' };
    const btnAct  = { ...btnBase, background: '#3b82f6', color: '#fff', fontWeight: 700, border: '1px solid #3b82f6' };

    // Ventana de páginas: hasta 5 botones centrados en la página actual
    const from  = Math.max(1, Math.min(page - 2, totalPages - 4));
    const to    = Math.min(totalPages, from + 4);
    const pages = Array.from({ length: to - from + 1 }, (_, i) => from + i);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: '#f8fafc', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#64748b', marginRight: 4 }}>Mostrar:</span>
            {[20, 50, 100].map(s => (
                <button key={s} onClick={() => { setPageSize(s); setPage(1); }}
                    style={pageSize === s ? btnAct : btnBase}>{s}</button>
            ))}
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>
                {start}–{end} de {total} registros
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                <button onClick={() => setPage(1)}              disabled={page === 1}          style={page === 1 ? btnDis : btnBase}>«</button>
                <button onClick={() => setPage(p => p - 1)}    disabled={page === 1}          style={page === 1 ? btnDis : btnBase}>‹</button>
                {pages.map(p => (
                    <button key={p} onClick={() => setPage(p)} style={p === page ? btnAct : btnBase}>{p}</button>
                ))}
                <button onClick={() => setPage(p => p + 1)}    disabled={page === totalPages} style={page === totalPages ? btnDis : btnBase}>›</button>
                <button onClick={() => setPage(totalPages)}    disabled={page === totalPages} style={page === totalPages ? btnDis : btnBase}>»</button>
            </div>
        </div>
    );
}

// ─── TAB GENERAL ─────────────────────────────────────────────────────────────

function TabGeneral({ data, searchTerm, setSearchTerm }) {
    const [pgPage, setPgPage] = useState(1);
    const [pgSize, setPgSize] = useState(20);
    useEffect(() => { setPgPage(1); }, [data.length, pgSize]);
    const pgSlice = data.slice((pgPage - 1) * pgSize, pgPage * pgSize);

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
                <SearchTable placeholder="🔍 Buscar nombre, código OC o proveedor…" value={searchTerm} onChange={setSearchTerm} count={data.length} total={data.length} />
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
                            {pgSlice.map(oc => (
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
                <Pagination page={pgPage} setPage={setPgPage} pageSize={pgSize} setPageSize={setPgSize} total={data.length} />
            </div>
        </div>
    );
}

// ─── TAB ESTADO ───────────────────────────────────────────────────────────────

const ESTADOS_CRITICOS = ['enviado a proveedor', 'enviada a proveedor', 'aceptada'];

function TabEstado({ data }) {
    const [estadoSeleccionado, setEstadoSeleccionado] = useState('');
    const [pgPage, setPgPage] = useState(1);
    const [pgSize, setPgSize] = useState(20);

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
                    <select className="filter-input" value={estadoSeleccionado} onChange={e => { setEstadoSeleccionado(e.target.value); setPgPage(1); }}>
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
                            {ocsFiltradas.slice((pgPage - 1) * pgSize, pgPage * pgSize).map(oc => (
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
                <Pagination page={pgPage} setPage={setPgPage} pageSize={pgSize} setPageSize={setPgSize} total={ocsFiltradas.length} />
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
    const [pgPage, setPgPage] = useState(1);
    const [pgSize, setPgSize] = useState(20);

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
                    <input type="checkbox" checked={soloConSugerencia} onChange={e => { setSoloConSugerencia(e.target.checked); setPgPage(1); }} />
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
                            {filtradas.slice((pgPage - 1) * pgSize, pgPage * pgSize).map(oc => (
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
                <Pagination page={pgPage} setPage={setPgPage} pageSize={pgSize} setPageSize={setPgSize} total={filtradas.length} />
            </div>
        </div>
    );
}

// ─── TAB NO ENLAZADAS ─────────────────────────────────────────────────────────

const ESTADOS_NE   = ['Enviada a proveedor', 'Aceptada', 'Recepción Conforme', 'Cancelada'];
const COLORS_NE    = ['#dc2626','#e0701e','#f59e0b','#6366f1','#3b82f6','#22c55e','#8b5cf6','#ec4899'];

function TabNoEnlazadas({ data }) {
    const [yearNE,        setYearNE]        = useState('');
    const [fechaDesde,    setFechaDesde]    = useState('');
    const [fechaHasta,    setFechaHasta]    = useState('');
    const [estadosActivos, setEstadosActivos] = useState(new Set(ESTADOS_NE));
    const [sortCol,       setSortCol]       = useState('TotalBruto');
    const [sortDir,       setSortDir]       = useState('desc');

    const years = useMemo(() => {
        const ys = new Set(data.map(oc => oc.FechaEnvio).filter(Boolean).map(d => new Date(d).getFullYear()));
        return [...ys].sort((a, b) => b - a);
    }, [data]);

    const toggleEstado = (e) => setEstadosActivos(prev => {
        const next = new Set(prev);
        next.has(e) ? next.delete(e) : next.add(e);
        return next;
    });

    // OC base con estados seleccionados (para calcular denominador del %)
    const baseActiva = useMemo(() =>
        data.filter(oc => estadosActivos.size === 0 || estadosActivos.has(oc.EstadoOC)),
        [data, estadosActivos]);

    // No Enlazadas con todos los filtros del tab
    const noEnlazadas = useMemo(() => baseActiva.filter(oc => {
        if (oc.EnlacePAC === 'Enlazada') return false;
        const f = oc.FechaEnvio;
        if (yearNE   && f && new Date(f).getFullYear() !== parseInt(yearNE)) return false;
        if (fechaDesde && f && f.slice(0, 10) < fechaDesde) return false;
        if (fechaHasta && f && f.slice(0, 10) > fechaHasta) return false;
        return true;
    }), [baseActiva, yearNE, fechaDesde, fechaHasta]);

    // ── KPIs ──────────────────────────────────────────────────────────────────
    const montoTotal = noEnlazadas
        .filter(oc => !oc.TipoMoneda || oc.TipoMoneda === 'CLP')
        .reduce((s, oc) => s + (Number(oc.TotalBruto) || 0), 0);

    const pctCant = baseActiva.length > 0
        ? ((noEnlazadas.length / baseActiva.length) * 100).toFixed(1) : 0;

    const tipoCountMap = noEnlazadas.reduce((acc, oc) => {
        const k = oc.DescripcionTipoOC || 'Sin tipo';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
    }, {});
    const topTipo = Object.entries(tipoCountMap).sort((a, b) => b[1] - a[1])[0] || ['—', 0];

    // ── Sección A: DescripcionTipoOC ──────────────────────────────────────────
    const tipoOCRows = useMemo(() => {
        const map = {};
        noEnlazadas.forEach(oc => {
            const k = oc.DescripcionTipoOC || 'Sin tipo';
            if (!map[k]) map[k] = { count: 0, monto: 0 };
            map[k].count++;
            if (!oc.TipoMoneda || oc.TipoMoneda === 'CLP') map[k].monto += Number(oc.TotalBruto) || 0;
        });
        return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
    }, [noEnlazadas]);

    const barTipoOC = {
        labels: tipoOCRows.map(([k]) => k),
        datasets: [{ label: 'N° OCs', data: tipoOCRows.map(([, v]) => v.count),
            backgroundColor: COLORS_NE, borderRadius: 4, indexAxis: 'y' }],
    };

    // ── Sección B: TipoOCInterno ───────────────────────────────────────────────
    const tipoInternoRows = useMemo(() => {
        const map = {};
        noEnlazadas.forEach(oc => {
            const k = oc.TipoOCInterno || 'Sin clasificar';
            if (!map[k]) map[k] = { count: 0, monto: 0 };
            map[k].count++;
            if (!oc.TipoMoneda || oc.TipoMoneda === 'CLP') map[k].monto += Number(oc.TotalBruto) || 0;
        });
        return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
    }, [noEnlazadas]);

    const donutInterno = {
        labels: tipoInternoRows.map(([k]) => k),
        datasets: [{ data: tipoInternoRows.map(([, v]) => v.count),
            backgroundColor: COLORS_NE, borderWidth: 0 }],
    };

    // ── Pivot: DescripcionTipoOC × TipoOCInterno ──────────────────────────────
    const { pivotRows, pivotCols, pivotMatrix, pivotMax } = useMemo(() => {
        const pivotRows = [...new Set(noEnlazadas.map(oc => oc.DescripcionTipoOC || 'Sin tipo'))].sort();
        const pivotCols = [...new Set(noEnlazadas.map(oc => oc.TipoOCInterno || 'Sin clasificar'))].sort();
        const m = {};
        noEnlazadas.forEach(oc => {
            const r = oc.DescripcionTipoOC || 'Sin tipo';
            const c = oc.TipoOCInterno || 'Sin clasificar';
            if (!m[r]) m[r] = {};
            m[r][c] = (m[r][c] || 0) + 1;
        });
        const pivotMax = Math.max(...Object.values(m).flatMap(row => Object.values(row)), 1);
        return { pivotRows, pivotCols, pivotMatrix: m, pivotMax };
    }, [noEnlazadas]);

    // ── Tendencia mensual ──────────────────────────────────────────────────────
    const tendenciaChart = useMemo(() => {
        const counts = Array(12).fill(0);
        noEnlazadas.forEach(oc => {
            if (oc.FechaEnvio) counts[new Date(oc.FechaEnvio).getMonth()]++;
        });
        return {
            labels: MESES,
            datasets: [{ label: 'OC No Enlazadas', data: counts,
                borderColor: '#dc2626', backgroundColor: '#dc262618',
                fill: true, tension: 0.35, pointBackgroundColor: '#dc2626', pointRadius: 4 }],
        };
    }, [noEnlazadas]);

    // ── Tabla detalle (sortable) ───────────────────────────────────────────────
    const toggleSort = (col) => {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('desc'); }
    };

    const sortedDetail = useMemo(() => [...noEnlazadas].sort((a, b) => {
        let va = a[sortCol], vb = b[sortCol];
        if (['TotalBruto', 'TotalNeto'].includes(sortCol)) { va = Number(va) || 0; vb = Number(vb) || 0; }
        else { va = (va || '').toString().toLowerCase(); vb = (vb || '').toString().toLowerCase(); }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ?  1 : -1;
        return 0;
    }), [noEnlazadas, sortCol, sortDir]);

    // ── Helpers de render ─────────────────────────────────────────────────────
    const SortTh = ({ col, label, align }) => (
        <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: align || 'left', whiteSpace: 'nowrap' }}
            onClick={() => toggleSort(col)}>
            {label} <span style={{ opacity: 0.5 }}>{sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
        </th>
    );

    const pctBar = (n, total, color) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3, minWidth: 60 }}>
                <div style={{ width: `${total > 0 ? (n / total * 100) : 0}%`, height: '100%', background: color, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 11, minWidth: 36, textAlign: 'right' }}>
                {total > 0 ? ((n / total) * 100).toFixed(1) : 0}%
            </span>
        </div>
    );

    const compactY = v => new Intl.NumberFormat('es-CL', { notation: 'compact', compactDisplay: 'short' }).format(v);
    const barOpts  = { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 10 } } }, y: { ticks: { font: { size: 10 } } } } };
    const lineOpts = { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1, callback: v => Number.isInteger(v) ? v : '' } } } };

    return (
        <div>
            {/* ── Filtros del tab ────────────────────────────────────────────── */}
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8,
                padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#9a3412', alignSelf: 'center' }}>Filtros:</span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Año</label>
                    <select className="filter-input" value={yearNE} onChange={e => setYearNE(e.target.value)} style={{ minWidth: 110 }}>
                        <option value="">Todos</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Desde (FechaEnvío)</label>
                    <input className="filter-input" type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Hasta</label>
                    <input className="filter-input" type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Estado OC</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {ESTADOS_NE.map(e => (
                            <label key={e} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                                <input type="checkbox" checked={estadosActivos.has(e)} onChange={() => toggleEstado(e)} />
                                <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                    background: estadoColor(e) + '20', color: estadoColor(e), border: `1px solid ${estadoColor(e)}40` }}>
                                    {e}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#9a3412', alignSelf: 'center' }}>
                    {noEnlazadas.length} OC fuera PAC
                </span>
            </div>

            {/* ── KPIs ────────────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
                <KpiCard label="OC No Enlazadas" value={noEnlazadas.length} sub={`de ${baseActiva.length} OC activas`} color="#dc2626" />
                <KpiCard label="% Fuera PAC" value={`${pctCant}%`} sub="por cantidad de OC" color="#e0701e" />
                <KpiCard label="Monto Fuera PAC (CLP)" value={fmtM(montoTotal)} sub="Suma TotalBruto CLP" color="#f59e0b" />
                <KpiCard label="Tipo más frecuente" value={topTipo[0]} sub={`${topTipo[1]} OCs`} color="#6366f1" />
            </div>

            {/* ── Sección A: Por DescripcionTipoOC ──────────────────────────── */}
            <h3 style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Por Tipo de Compra (DescripcionTipoOC)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <div className="card" style={{ overflow: 'hidden' }}>
                    <div className="card-header card-header-accent"><span>📋</span><span className="card-title">Resumen por Tipo OC</span></div>
                    <table className="table-gob" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Tipo de Compra</th>
                                <th style={{ textAlign: 'center' }}>N° OCs</th>
                                <th style={{ textAlign: 'right' }}>Monto Bruto</th>
                                <th>% del total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tipoOCRows.map(([tipo, v]) => (
                                <tr key={tipo}>
                                    <td style={{ fontSize: 12 }}>{tipo}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>{v.count}</td>
                                    <td style={{ textAlign: 'right', fontSize: 12 }}>{fmtM(v.monto)}</td>
                                    <td>{pctBar(v.count, noEnlazadas.length, '#dc2626')}</td>
                                </tr>
                            ))}
                            {tipoOCRows.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>Sin datos</td></tr>}
                        </tbody>
                    </table>
                </div>
                <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, fontFamily: 'Outfit,sans-serif' }}>OCs Fuera PAC por Tipo</div>
                    <div style={{ height: Math.max(tipoOCRows.length * 36 + 20, 160) }}>
                        {tipoOCRows.length > 0
                            ? <Bar data={barTipoOC} options={barOpts} />
                            : <p style={{ color: '#94a3b8', textAlign: 'center', paddingTop: 40 }}>Sin datos</p>}
                    </div>
                </div>
            </div>

            {/* ── Sección B: Por TipoOCInterno ──────────────────────────────── */}
            <h3 style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Por Tipo OC Interno
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <div className="card" style={{ overflow: 'hidden' }}>
                    <div className="card-header card-header-accent"><span>📋</span><span className="card-title">Resumen por Tipo Interno</span></div>
                    <table className="table-gob" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Tipo Interno</th>
                                <th style={{ textAlign: 'center' }}>N° OCs</th>
                                <th style={{ textAlign: 'right' }}>Monto Bruto</th>
                                <th>% del total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tipoInternoRows.map(([tipo, v]) => (
                                <tr key={tipo}>
                                    <td style={{ fontSize: 12 }}>{tipo}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>{v.count}</td>
                                    <td style={{ textAlign: 'right', fontSize: 12 }}>{fmtM(v.monto)}</td>
                                    <td>{pctBar(v.count, noEnlazadas.length, '#e0701e')}</td>
                                </tr>
                            ))}
                            {tipoInternoRows.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>Sin datos</td></tr>}
                        </tbody>
                    </table>
                </div>
                <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, fontFamily: 'Outfit,sans-serif' }}>OCs Fuera PAC por Tipo Interno</div>
                    <div style={{ height: 230 }}>
                        {tipoInternoRows.length > 0
                            ? <Doughnut data={donutInterno} options={{ maintainAspectRatio: false,
                                plugins: { legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } } } }} />
                            : <p style={{ color: '#94a3b8', textAlign: 'center', paddingTop: 60 }}>Sin datos</p>}
                    </div>
                </div>
            </div>

            {/* ── Matriz cruzada ─────────────────────────────────────────────── */}
            <h3 style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Matriz Cruzada: Tipo OC × Tipo Interno (N° OCs)
            </h3>
            <div className="card" style={{ overflowX: 'auto', marginBottom: 20 }}>
                {pivotRows.length > 0 ? (
                    <table className="table-gob" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ background: '#f8fafc', minWidth: 160 }}>Tipo de Compra</th>
                                {pivotCols.map(c => <th key={c} style={{ background: '#f8fafc', textAlign: 'center', fontSize: 11, minWidth: 90 }}>{c}</th>)}
                                <th style={{ background: '#fef2f2', textAlign: 'center', color: '#dc2626', fontWeight: 700 }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pivotRows.map(r => {
                                const rowTotal = pivotCols.reduce((s, c) => s + (pivotMatrix[r]?.[c] || 0), 0);
                                return (
                                    <tr key={r}>
                                        <td style={{ fontWeight: 600, fontSize: 12 }}>{r}</td>
                                        {pivotCols.map(c => {
                                            const val = pivotMatrix[r]?.[c] || 0;
                                            const intensity = val / pivotMax;
                                            const bg = val > 0 ? `rgba(220,38,38,${0.08 + intensity * 0.72})` : 'transparent';
                                            return (
                                                <td key={c} style={{ textAlign: 'center', background: bg,
                                                    color: intensity > 0.55 ? '#fff' : '#1e293b',
                                                    fontWeight: val > 0 ? 700 : 400, fontSize: 13 }}>
                                                    {val > 0 ? val : <span style={{ color: '#cbd5e1' }}>—</span>}
                                                </td>
                                            );
                                        })}
                                        <td style={{ textAlign: 'center', fontWeight: 700, background: '#fef2f2', color: '#dc2626' }}>{rowTotal}</td>
                                    </tr>
                                );
                            })}
                            <tr style={{ background: '#f8fafc' }}>
                                <td style={{ fontWeight: 700 }}>Total</td>
                                {pivotCols.map(c => {
                                    const t = pivotRows.reduce((s, r) => s + (pivotMatrix[r]?.[c] || 0), 0);
                                    return <td key={c} style={{ textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>{t}</td>;
                                })}
                                <td style={{ textAlign: 'center', fontWeight: 700, color: '#dc2626', background: '#fef2f2' }}>{noEnlazadas.length}</td>
                            </tr>
                        </tbody>
                    </table>
                ) : (
                    <p style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>Sin datos para la matriz</p>
                )}
            </div>

            {/* ── Tendencia mensual ──────────────────────────────────────────── */}
            <h3 style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Tendencia Mensual (FechaEnvío)
            </h3>
            <div className="card" style={{ padding: 16, marginBottom: 20 }}>
                <div style={{ height: 220 }}>
                    <Line data={tendenciaChart} options={lineOpts} />
                </div>
            </div>

            {/* ── Tabla detalle sortable ─────────────────────────────────────── */}
            <h3 style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Detalle — {noEnlazadas.length} OC Fuera PAC
            </h3>
            <div className="card">
                <div className="table-responsive">
                    <table className="table-gob">
                        <thead>
                            <tr>
                                <SortTh col="codigo_oc"       label="Código OC" />
                                <SortTh col="FechaEnvio"      label="F. Envío" />
                                <SortTh col="EstadoOC"        label="Estado" />
                                <SortTh col="C_Unidad"        label="Unidad" />
                                <SortTh col="P_Nombre"        label="Proveedor" />
                                <SortTh col="TotalBruto"      label="Monto Bruto" align="right" />
                                <SortTh col="DescripcionTipoOC" label="Tipo Compra" />
                                <SortTh col="TipoOCInterno"   label="Tipo Interno" />
                                <th>Link</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedDetail.map(oc => (
                                <tr key={oc.codigo_oc}>
                                    <td><strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{oc.codigo_oc}</strong></td>
                                    <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(oc.FechaEnvio)}</td>
                                    <td>
                                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                                            background: estadoColor(oc.EstadoOC) + '20', color: estadoColor(oc.EstadoOC),
                                            border: `1px solid ${estadoColor(oc.EstadoOC)}40` }}>
                                            {oc.EstadoOC || 'N/A'}
                                        </span>
                                    </td>
                                    <td style={{ maxWidth: 140 }}>
                                        <div className="truncate-text" title={oc.C_Unidad} style={{ fontSize: 11 }}>{oc.C_Unidad || '—'}</div>
                                    </td>
                                    <td style={{ maxWidth: 160 }}>
                                        <div className="truncate-text" title={oc.P_Nombre} style={{ fontSize: 12 }}>{oc.P_Nombre || '—'}</div>
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>
                                        {oc.TotalBruto ? fmt(Number(oc.TotalBruto), oc.TipoMoneda || 'CLP') : '—'}
                                    </td>
                                    <td style={{ fontSize: 11 }}>{oc.DescripcionTipoOC || oc.TipoOC || '—'}</td>
                                    <td>
                                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                                            background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>
                                            {oc.TipoOCInterno || 'Sin clasificar'}
                                        </span>
                                    </td>
                                    <td>
                                        {oc.LinkMP
                                            ? <a href={oc.LinkMP} target="_blank" rel="noreferrer"
                                                style={{ color: '#10b981', fontWeight: 700, textDecoration: 'none' }}>🔗 MP</a>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                </tr>
                            ))}
                            {sortedDetail.length === 0 && (
                                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
                                    No hay OC fuera PAC con los filtros seleccionados
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

const TABS = [
    { id: 'General',        icon: '📊' },
    { id: 'Estado',         icon: '⚠️' },
    { id: 'Enlace PAC',     icon: '🔗' },
    { id: 'OC Corregibles', icon: '🛠️' },
    { id: 'No Enlazadas',   icon: '🔴' },
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
            {activeTab === 'No Enlazadas'   && <TabNoEnlazadas data={ordenes} />}
        </div>
    );
}

export default OrdenesCompraResumen;
