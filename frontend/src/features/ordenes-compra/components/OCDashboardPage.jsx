import React, { useState, useMemo, useCallback } from 'react';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import * as XLSX from 'xlsx';
import { useOCDashboard } from '../hooks/useOCDashboard';

// ── Helpers ───────────────────────────────────────────────────────────────────

const clp = n =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const clpM = n => `$${((n ?? 0) / 1_000_000).toFixed(1)}M`;

const fmtDate = s => {
    if (!s) return '—';
    // Handles both ISO (YYYY-MM-DD) and DD-MM-YYYY
    if (s.includes('T') || /^\d{4}-/.test(s)) {
        const d = new Date(s);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }
    return s.slice(0, 10); // DD-MM-YYYY already formatted
};

const diffDays = s => {
    if (!s) return null;
    const ts = s.includes('T') || /^\d{4}-/.test(s) ? new Date(s) : new Date(s.split('-').reverse().join('-'));
    return Math.floor((Date.now() - ts.getTime()) / 86_400_000);
};

const groupBy = (arr, key) => arr.reduce((acc, r) => {
    const k = r[key] ?? 'Sin dato';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
}, {});

const sumBy = (arr, keyGroup, keySum) => arr.reduce((acc, r) => {
    const k = r[keyGroup] ?? 'Sin dato';
    acc[k] = (acc[k] || 0) + (r[keySum] || 0);
    return acc;
}, {});

// ── Colors & badges ───────────────────────────────────────────────────────────

const ESTADO_OC_COLORS = {
    'Aceptada': '#2e7d32',
    'Enviada': '#1565c0',
    'Recepcion Conforme': '#00838f',
    'Cancelada': '#c62828',
    'Pendiente': '#e65100',
};


const BadgeEstado = ({ estado }) => {
    const cls = {
        'Aceptada': 'oc-badge-aceptada',
        'Enviada': 'oc-badge-enviada',
        'Recepcion Conforme': 'oc-badge-conforme',
        'Cancelada': 'oc-badge-cancelada',
        'Pendiente': 'oc-badge-pendiente',
    }[estado] || 'oc-badge-pendiente';
    return <span className={`oc-badge ${cls}`}>{estado}</span>;
};

const DelayBadge = ({ fechaEnvio }) => {
    const dias = diffDays(fechaEnvio);
    if (dias === null) return <span className="oc-em-dash">—</span>;
    if (dias < 15) return <span className="oc-badge oc-badge-aldia">{dias}d · Al día</span>;
    if (dias <= 30) return <span className="oc-badge oc-badge-seguimiento">{dias}d · Seguimiento</span>;
    if (dias <= 60) return <span className="oc-badge oc-badge-atrasado">{dias}d · Atrasado</span>;
    return <span className="oc-badge oc-badge-critico">{dias}d · Crítico</span>;
};


// ── Pagination ─────────────────────────────────────────────────────────────────

function Pagination({ total, perPage, current, onChange }) {
    const pages = Math.ceil(total / perPage);
    if (pages <= 1) return null;
    const range = [];
    const delta = 2;
    for (let i = Math.max(1, current - delta); i <= Math.min(pages, current + delta); i++) range.push(i);

    return (
        <div className="oc-pagination">
            <button className="oc-page-btn" disabled={current === 1} onClick={() => onChange(current - 1)}>‹</button>
            {range[0] > 1 && <><button className="oc-page-btn" onClick={() => onChange(1)}>1</button><span className="oc-page-ellipsis">…</span></>}
            {range.map(p => (
                <button key={p} className={`oc-page-btn${p === current ? ' active' : ''}`} onClick={() => onChange(p)}>{p}</button>
            ))}
            {range[range.length - 1] < pages && <><span className="oc-page-ellipsis">…</span><button className="oc-page-btn" onClick={() => onChange(pages)}>{pages}</button></>}
            <button className="oc-page-btn" disabled={current === pages} onClick={() => onChange(current + 1)}>›</button>
        </div>
    );
}

// ── Tab: Estratégico ──────────────────────────────────────────────────────────

function TabEstrategico({ data, anio }) {
    const total = data.length;
    const monto = data.reduce((s, r) => s + (r.TotalBruto || 0), 0);
    const conPAC = data.filter(r => r.EnlacePAC).length;
    const pctPAC = total ? Math.round(conPAC / total * 100) : 0;
    const cancel = data.filter(r => r.EstadoOC === 'Cancelada').length;

    const countsByEstado = groupBy(data, 'EstadoOC');
    const donutLabels = Object.keys(countsByEstado);
    const donutValues = donutLabels.map(l => countsByEstado[l]);
    const donutColors = donutLabels.map(l => ESTADO_OC_COLORS[l] || '#9e9e9e');

    const sumsByUnidad = sumBy(data, 'C_Unidad', 'TotalBruto');
    const topUnidades = Object.entries(sumsByUnidad).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return (
        <div className="oc-tab-content">
            <div className="oc-section-header">
                <div className="oc-section-title">Resumen Estratégico</div>
                <div className="oc-section-sub">Indicadores clave de gestión de Órdenes de Compra — {anio}</div>
            </div>

            <div className="oc-kpi-grid">
                <div className="oc-kpi-card c-azul">
                    <div className="oc-kpi-label">Total OCs</div>
                    <div className="oc-kpi-value">{total.toLocaleString('es-CL')}</div>
                    <div className="oc-kpi-sub">Órdenes en el período</div>
                    <div className="oc-kpi-icon">📄</div>
                </div>
                <div className="oc-kpi-card c-verde">
                    <div className="oc-kpi-label">Monto Total Bruto</div>
                    <div className="oc-kpi-value" style={{ fontSize: '18px' }}>{total ? clp(monto) : '—'}</div>
                    <div className="oc-kpi-sub">Suma TotalBruto CLP</div>
                    <div className="oc-kpi-icon">💰</div>
                </div>
                <div className="oc-kpi-card c-celeste">
                    <div className="oc-kpi-label">% Vinculadas PAC</div>
                    <div className="oc-kpi-value">{pctPAC}%</div>
                    <div className="oc-kpi-sub">{conPAC} de {total} OCs</div>
                    <div className="oc-kpi-icon">🔗</div>
                </div>
                <div className="oc-kpi-card c-rojo">
                    <div className="oc-kpi-label">OCs Canceladas</div>
                    <div className="oc-kpi-value">{cancel}</div>
                    <div className="oc-kpi-sub">{total ? Math.round(cancel / total * 100) : 0}% del total</div>
                    <div className="oc-kpi-icon">❌</div>
                </div>
            </div>

            <div className="oc-pac-card">
                <div className="oc-pac-big">{pctPAC}%</div>
                <div className="oc-pac-right">
                    <div className="oc-pac-label">Cobertura Plan Anual de Compras</div>
                    <div style={{ fontSize: '20px', fontWeight: 700 }}>{conPAC} de {total} órdenes vinculadas al PAC</div>
                    <div style={{ fontSize: '13px', opacity: 0.8, marginTop: 4 }}>Las OCs con EnlacePAC están vinculadas al Plan Anual de Compras institucional</div>
                    <div className="oc-pac-bar-bg"><div className="oc-pac-bar-fill" style={{ width: `${pctPAC}%` }} /></div>
                </div>
            </div>

            <div className="oc-chart-grid-2">
                <div className="oc-chart-card">
                    <div className="oc-chart-title">Distribución por Estado</div>
                    <div className="oc-chart-sub">Cantidad de OCs según estado actual</div>
                    <Doughnut
                        data={{ labels: donutLabels, datasets: [{ data: donutValues, backgroundColor: donutColors, borderWidth: 2, borderColor: '#fff' }] }}
                        options={{
                            responsive: true, cutout: '65%',
                            plugins: {
                                legend: { position: 'right', labels: { font: { family: 'Inter', size: 11 }, padding: 10 } },
                                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw / total * 100)}%)` } }
                            }
                        }}
                    />
                </div>
                <div className="oc-chart-card">
                    <div className="oc-chart-title">Top 10 — Monto por Unidad Compradora</div>
                    <div className="oc-chart-sub">Monto bruto acumulado en millones CLP</div>
                    <Bar
                        data={{
                            labels: topUnidades.map(([u]) => u.length > 20 ? u.slice(0, 18) + '…' : u),
                            datasets: [{ data: topUnidades.map(([, v]) => +(v / 1_000_000).toFixed(1)), backgroundColor: 'rgba(42,82,152,0.75)', borderRadius: 4, label: 'Monto Bruto (M CLP)' }]
                        }}
                        options={{
                            indexAxis: 'y', responsive: true,
                            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` $${ctx.raw}M CLP` } } },
                            scales: { x: { ticks: { callback: v => `$${v}M`, font: { size: 10 } } }, y: { ticks: { font: { size: 11 } } } }
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

// ── Tab: Táctico ──────────────────────────────────────────────────────────────

function TabTactico({ data }) {
    const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const byMes = useMemo(() => {
        const arr = Array.from({ length: 12 }, () => ({ cant: 0, monto: 0, pac: 0 }));
        data.forEach(r => {
            const f = r.FechaEnvio || r.FechaCreacion;
            if (!f) return;
            const m = new Date(f).getMonth();
            if (m >= 0 && m < 12) {
                arr[m].cant++;
                arr[m].monto += r.TotalBruto || 0;
                if (r.EnlacePAC) arr[m].pac++;
            }
        });
        return arr;
    }, [data]);

    const pctPAC = byMes.map(m => m.cant ? Math.round(m.pac / m.cant * 100) : 0);

    const topUnidades = useMemo(() => {
        const sums = {};
        data.forEach(r => {
            const u = r.C_Unidad || 'Sin unidad';
            if (!sums[u]) sums[u] = { neto: 0, bruto: 0 };
            sums[u].neto += r.TotalNeto || 0;
            sums[u].bruto += r.TotalBruto || 0;
        });
        return Object.entries(sums).sort((a, b) => b[1].bruto - a[1].bruto).slice(0, 8);
    }, [data]);

    const topProveedores = useMemo(() => {
        const sums = sumBy(data, 'P_Nombre', 'TotalBruto');
        return Object.entries(sums).sort((a, b) => b[1] - a[1]).slice(0, 10);
    }, [data]);

    return (
        <div className="oc-tab-content">
            <div className="oc-section-header">
                <div className="oc-section-title">Análisis Táctico</div>
                <div className="oc-section-sub">Tendencias temporales y comparación entre unidades y proveedores</div>
            </div>

            <div className="oc-chart-card" style={{ marginBottom: 16 }}>
                <div className="oc-chart-title">Evolución Mensual</div>
                <div className="oc-chart-sub">Cantidad de OCs y monto bruto mensual</div>
                <Line
                    data={{
                        labels: MESES,
                        datasets: [
                            { label: 'Cantidad OCs', data: byMes.map(m => m.cant), yAxisID: 'y1', borderColor: '#2a5298', backgroundColor: 'rgba(42,82,152,0.08)', borderWidth: 2.5, tension: 0.4, fill: true, pointRadius: 4 },
                            { label: 'Monto Bruto (M)', data: byMes.map(m => +(m.monto / 1_000_000).toFixed(1)), yAxisID: 'y2', borderColor: '#e65100', borderWidth: 2, tension: 0.4, fill: false, borderDash: [5, 3], pointRadius: 3 },
                            { label: '% PAC', data: pctPAC, yAxisID: 'y2', borderColor: '#4da3c7', borderWidth: 1.5, tension: 0.4, fill: false, borderDash: [2, 4], pointRadius: 2 },
                        ]
                    }}
                    options={{
                        responsive: true,
                        plugins: { tooltip: { callbacks: { label: ctx => ctx.datasetIndex === 1 ? ` $${ctx.raw}M CLP` : ctx.datasetIndex === 2 ? ` ${ctx.raw}% PAC` : ` ${ctx.raw} OCs` } } },
                        scales: { y1: { position: 'left' }, y2: { position: 'right', grid: { display: false } } }
                    }}
                />
            </div>

            <div className="oc-chart-grid-2">
                <div className="oc-chart-card">
                    <div className="oc-chart-title">Neto vs Bruto por Unidad (Top 8)</div>
                    <div className="oc-chart-sub">Comparación IVA implícito por unidad compradora</div>
                    <Bar
                        data={{
                            labels: topUnidades.map(([u]) => u.length > 16 ? u.slice(0, 14) + '…' : u),
                            datasets: [
                                { label: 'Neto', data: topUnidades.map(([, v]) => +(v.neto / 1_000_000).toFixed(1)), backgroundColor: 'rgba(42,82,152,0.7)', borderRadius: 3 },
                                { label: 'Bruto', data: topUnidades.map(([, v]) => +(v.bruto / 1_000_000).toFixed(1)), backgroundColor: 'rgba(77,163,199,0.55)', borderRadius: 3 },
                            ]
                        }}
                        options={{
                            responsive: true,
                            plugins: { tooltip: { callbacks: { label: ctx => ` $${ctx.raw}M CLP` } } },
                            scales: { y: { ticks: { callback: v => `$${v}M` } } }
                        }}
                    />
                </div>
                <div className="oc-chart-card">
                    <div className="oc-chart-title">Top 10 Proveedores por Monto</div>
                    <div className="oc-chart-sub">Monto bruto acumulado en millones CLP</div>
                    <Bar
                        data={{
                            labels: topProveedores.map(([p]) => p.length > 22 ? p.slice(0, 20) + '…' : p),
                            datasets: [{ label: 'Monto Bruto', data: topProveedores.map(([, v]) => +(v / 1_000_000).toFixed(1)), backgroundColor: 'rgba(42,82,152,0.75)', borderRadius: 4 }]
                        }}
                        options={{
                            indexAxis: 'y', responsive: true,
                            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` $${ctx.raw}M CLP` } } },
                            scales: { x: { ticks: { callback: v => `$${v}M` } } }
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

// ── Tab: Operativo ─────────────────────────────────────────────────────────────

const OP_PAGE = 50;

function TabOperativo({ data }) {
    const [estadoFiltro, setEstadoFiltro] = useState('todas');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    const filtered = useMemo(() => {
        let d = data;
        if (estadoFiltro !== 'todas') d = d.filter(r => r.EstadoOC === estadoFiltro);
        if (search) {
            const q = search.toLowerCase();
            d = d.filter(r => (r.codigo_oc || '').toLowerCase().includes(q) || (r.P_Nombre || '').toLowerCase().includes(q));
        }
        return d;
    }, [data, estadoFiltro, search]);

    const slice = filtered.slice((page - 1) * OP_PAGE, page * OP_PAGE);

    const pills = [
        { key: 'todas', label: 'Todas' },
        { key: 'Enviada', label: 'Enviada' },
        { key: 'Aceptada', label: 'Aceptada' },
        { key: 'Pendiente', label: 'Pendiente' },
        { key: 'Cancelada', label: 'Cancelada' },
        { key: 'Recepcion Conforme', label: 'Rec. Conforme' },
    ];

    return (
        <div className="oc-tab-content">
            <div className="oc-section-header">
                <div className="oc-section-title">Gestión Operativa</div>
                <div className="oc-section-sub">Seguimiento de órdenes activas y alertas de demora</div>
            </div>

            <div className="oc-pill-bar">
                {pills.map(p => (
                    <div key={p.key} className={`oc-pill${estadoFiltro === p.key ? ' active' : ''}`}
                        onClick={() => { setEstadoFiltro(p.key); setPage(1); }}>
                        {p.label}
                    </div>
                ))}
            </div>

            <div className="oc-search-row">
                <div className="oc-search-box">
                    <input type="text" placeholder="Buscar código OC o proveedor…" value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }} />
                </div>
                <span className="oc-record-count">{filtered.length} registros</span>
            </div>

            <div className="oc-table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Código OC</th><th>Nombre OC</th><th>Estado</th><th>Unidad</th>
                            <th>Proveedor</th><th>Fecha Envío</th><th>Monto Bruto</th><th>Días</th><th>PAC</th>
                        </tr>
                    </thead>
                    <tbody>
                        {slice.map(r => (
                            <tr key={r.codigo_oc}>
                                <td><a className="oc-link" href={r.LinkMP} target="_blank" rel="noreferrer">{r.codigo_oc}</a></td>
                                <td className="oc-truncate">{r.NombreOC || '—'}</td>
                                <td><BadgeEstado estado={r.EstadoOC} /></td>
                                <td>{r.C_Unidad || '—'}</td>
                                <td className="oc-truncate">{r.P_Nombre || '—'}</td>
                                <td className="oc-mono">{fmtDate(r.FechaEnvio)}</td>
                                <td className="oc-mono">{clp(r.TotalBruto)}</td>
                                <td><DelayBadge fechaEnvio={r.FechaEnvio} /></td>
                                <td>{r.EnlacePAC ? <a className="oc-link-pac" href={r.EnlacePAC} target="_blank" rel="noreferrer">Ver PAC</a> : <span className="oc-em-dash">—</span>}</td>
                            </tr>
                        ))}
                        {!slice.length && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#9aabb8' }}>Sin resultados</td></tr>}
                    </tbody>
                </table>
                <Pagination total={filtered.length} perPage={OP_PAGE} current={page} onChange={setPage} />
            </div>
        </div>
    );
}

// ── Tab: Analítico ─────────────────────────────────────────────────────────────

const AN_PAGE = 50;

function TabAnalitico({ data, anio, unidad }) {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    const filtered = useMemo(() => {
        if (!search) return data;
        const q = search.toLowerCase();
        return data.filter(r =>
            (r.codigo_oc || '').toLowerCase().includes(q) ||
            (r.NombreOC || '').toLowerCase().includes(q) ||
            (r.P_Nombre || '').toLowerCase().includes(q) ||
            (r.P_Rut || '').toLowerCase().includes(q) ||
            (r.EstadoOC || '').toLowerCase().includes(q)
        );
    }, [data, search]);

    const slice = filtered.slice((page - 1) * AN_PAGE, page * AN_PAGE);

    const exportExcel = () => {
        const rows = [
            ['Código OC', 'Nombre', 'Tipo', 'Estado', 'Unidad', 'Proveedor', 'RUT', 'Fecha Envío', 'Monto Neto', 'Monto Bruto', 'Enlace PAC', 'Link MP'],
            ...filtered.map(r => [
                r.codigo_oc || '', r.NombreOC || '', r.TipoOC || '', r.EstadoOC || '',
                r.C_Unidad || '', r.P_Nombre || '', r.P_Rut || '',
                fmtDate(r.FechaEnvio), r.TotalNeto || 0, r.TotalBruto || 0,
                r.EnlacePAC || '', r.LinkMP || '',
            ])
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [16, 30, 18, 14, 24, 28, 14, 12, 14, 14, 50, 50].map(w => ({ wch: w }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `OC_${anio}_${unidad === 'Todas' ? 'Todas' : unidad.slice(0, 15)}`);
        XLSX.writeFile(wb, `OC_SSO_${anio}.xlsx`);
    };

    return (
        <div className="oc-tab-content">
            <div className="oc-section-header">
                <div className="oc-section-title">Tabla Analítica Completa</div>
                <div className="oc-section-sub">Todos los registros con exportación a Excel</div>
            </div>

            <div className="oc-toolbar">
                <div className="oc-search-box">
                    <input type="text" placeholder="Buscar en todas las columnas…" value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }} />
                </div>
                <button className="oc-btn-export" onClick={exportExcel}>📥 Exportar Excel</button>
                <span className="oc-record-count">Mostrando {Math.min(filtered.length, AN_PAGE * page)} de {filtered.length} registros</span>
            </div>

            <div className="oc-table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>#</th><th>Código OC</th><th>Nombre</th><th>Tipo</th><th>Estado</th>
                            <th>Unidad</th><th>Proveedor</th><th>RUT</th><th>Fecha Envío</th>
                            <th>Monto Neto</th><th>Monto Bruto</th><th>Enlace PAC</th><th>Link MP</th>
                        </tr>
                    </thead>
                    <tbody>
                        {slice.map((r, i) => (
                            <tr key={r.codigo_oc}>
                                <td className="oc-mono">{(page - 1) * AN_PAGE + i + 1}</td>
                                <td><a className="oc-link" href={r.LinkMP} target="_blank" rel="noreferrer">{r.codigo_oc}</a></td>
                                <td className="oc-truncate" style={{ maxWidth: 200 }}>{r.NombreOC || '—'}</td>
                                <td style={{ fontSize: 11 }}>{r.TipoOC || '—'}</td>
                                <td><BadgeEstado estado={r.EstadoOC} /></td>
                                <td>{r.C_Unidad || '—'}</td>
                                <td className="oc-truncate" style={{ maxWidth: 180 }}>{r.P_Nombre || '—'}</td>
                                <td className="oc-mono">{r.P_Rut || '—'}</td>
                                <td className="oc-mono">{fmtDate(r.FechaEnvio)}</td>
                                <td className="oc-mono">{clp(r.TotalNeto)}</td>
                                <td className="oc-mono">{clp(r.TotalBruto)}</td>
                                <td>{r.EnlacePAC ? <a className="oc-link-pac" href={r.EnlacePAC} target="_blank" rel="noreferrer">Ver PAC</a> : <span className="oc-em-dash">—</span>}</td>
                                <td>{r.LinkMP ? <a className="oc-link-pac" href={r.LinkMP} target="_blank" rel="noreferrer">Ver OC</a> : <span className="oc-em-dash">—</span>}</td>
                            </tr>
                        ))}
                        {!slice.length && <tr><td colSpan={13} style={{ textAlign: 'center', padding: 24, color: '#9aabb8' }}>Sin resultados</td></tr>}
                    </tbody>
                </table>
                <Pagination total={filtered.length} perPage={AN_PAGE} current={page} onChange={setPage} />
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
    { key: 'estrategico', label: 'Estratégico', icon: '📊' },
    { key: 'tactico',     label: 'Táctico',     icon: '📈' },
    { key: 'operativo',  label: 'Operativo',   icon: '📋' },
    { key: 'analitico',  label: 'Analítico',   icon: '🔍' },
];

export default function OCDashboardPage() {
    const [activeTab, setActiveTab] = useState('estrategico');
    const {
        ocData,
        loadingOC,
        errorOC,
        anio, setAnio,
        unidad, setUnidad,
        years, unidades,
    } = useOCDashboard();

    const isLoading = loadingOC;

    return (
        <div className="feature-page">

            {/* ── Barra de tabs + filtros inline (Opción B) ── */}
            <div className="oc-tabbar">
                <div className="oc-tabbar-tabs">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            className={`oc-tab-btn${activeTab === t.key ? ' active' : ''}`}
                            onClick={() => setActiveTab(t.key)}
                        >
                            <span className="oc-tab-icon">{t.icon}</span>
                            <span>{t.label}</span>
                        </button>
                    ))}
                </div>

                <div className="oc-tabbar-filters">
                    <div className="oc-filter-group">
                        <span className="oc-filter-label-dark">Año</span>
                        <select
                            className="oc-filter-select-light"
                            value={anio}
                            onChange={e => setAnio(e.target.value)}
                        >
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div className="oc-filter-group">
                        <span className="oc-filter-label-dark">Unidad</span>
                        <select
                            className="oc-filter-select-light"
                            style={{ maxWidth: 220 }}
                            value={unidad}
                            onChange={e => setUnidad(e.target.value)}
                        >
                            <option value="Todas">Todas las unidades</option>
                            {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* ── Contenido del tab activo ── */}
            <div className="oc-tab-body">
                {isLoading && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', flexDirection: 'column', gap: 12 }}>
                        <div className="loading-spinner" />
                        <div style={{ color: '#6b7c93', fontSize: 13 }}>Cargando datos…</div>
                    </div>
                )}
                {errorOC && !isLoading && (
                    <div className="error-message">{errorOC}</div>
                )}
                {!isLoading && !errorOC && (
                    <>
                        {activeTab === 'estrategico' && <TabEstrategico data={ocData} anio={anio} />}
                        {activeTab === 'tactico'     && <TabTactico data={ocData} />}
                        {activeTab === 'operativo'   && <TabOperativo data={ocData} />}
                        {activeTab === 'analitico'   && <TabAnalitico data={ocData} anio={anio} unidad={unidad} />}
                    </>
                )}
            </div>
        </div>
    );
}
