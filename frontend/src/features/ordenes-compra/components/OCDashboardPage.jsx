import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import * as XLSX from 'xlsx';
import { useOCDashboard } from '../hooks/useOCDashboard';
import { useActualizarOC } from '../hooks/useActualizarOC';

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

// ── Tab: Comparativo Anual ────────────────────────────────────────────────────

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const ANIO_COLORS = ['#10b981','#3b82f6','#94a3b8','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];
const TIPO_LABEL  = { AG:'Compra Ágil', CM:'Conv. Marco', TD:'Trato Directo', OC:'Licitación', SE:'Licitación', MC:'M. Cuantía' };

function anioColor(y, allYears) {
    return ANIO_COLORS[allYears.indexOf(y) % ANIO_COLORS.length];
}

function TabComparativoAnual({ rawOC }) {
    const availableYears = useMemo(() => {
        const s = new Set();
        rawOC.forEach(r => {
            const f = r.FechaEnvio || r.FechaCreacion;
            if (!f) return;
            const yr = new Date(f).getFullYear();
            if (!isNaN(yr)) s.add(yr.toString());
        });
        return [...s].sort((a, b) => b - a);
    }, [rawOC]);

    const [selYears, setSelYears] = useState([]);

    useEffect(() => {
        if (availableYears.length && selYears.length === 0)
            setSelYears(availableYears.slice(0, 3));
    }, [availableYears]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggle = y => setSelYears(prev =>
        prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y].sort((a, b) => b - a)
    );

    // Agrega por año × mes (excluye Canceladas)
    const stats = useMemo(() => {
        const r = {};
        selYears.forEach(y => {
            r[y] = Array.from({ length: 12 }, () => ({ total: 0, enlazadas: 0, neto: 0, sinPACNeto: 0 }));
        });
        rawOC.forEach(row => {
            const f = row.FechaEnvio || row.FechaCreacion;
            if (!f || row.EstadoOC === 'Cancelada') return;
            const y = new Date(f).getFullYear().toString();
            if (!r[y]) return;
            const m = new Date(f).getMonth();
            const neto = parseFloat(row.TotalNeto) || 0;
            r[y][m].total++;
            r[y][m].neto += neto;
            if (row.EnlacePAC === 'Enlazada') r[y][m].enlazadas++;
            else r[y][m].sinPACNeto += neto;
        });
        return r;
    }, [rawOC, selYears]);

    // Resumen anual
    const summary = useMemo(() =>
        selYears.map(y => {
            const ms = stats[y] || [];
            const total    = ms.reduce((s, m) => s + m.total, 0);
            const enlazadas = ms.reduce((s, m) => s + m.enlazadas, 0);
            const neto     = ms.reduce((s, m) => s + m.neto, 0);
            const sinPAC   = ms.reduce((s, m) => s + m.sinPACNeto, 0);
            return { y, total, enlazadas, pct: total ? enlazadas / total * 100 : 0, neto, sinPAC };
        }), [stats, selYears]);

    // Tipo OC por año (% apilado)
    const tipoChartData = useMemo(() => {
        const byYear = {};
        selYears.forEach(y => { byYear[y] = {}; });
        rawOC.forEach(row => {
            const f = row.FechaEnvio || row.FechaCreacion;
            if (!f || row.EstadoOC === 'Cancelada') return;
            const y = new Date(f).getFullYear().toString();
            if (!byYear[y]) return;
            const t = TIPO_LABEL[row.TipoOC] || row.TipoOC || 'Otro';
            byYear[y][t] = (byYear[y][t] || 0) + 1;
        });
        const tipos = [...new Set(selYears.flatMap(y => Object.keys(byYear[y])))];
        const TCOLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f97316'];
        return {
            labels: selYears,
            datasets: tipos.map((t, i) => ({
                label: t,
                data: selYears.map(y => {
                    const tot = Object.values(byYear[y]).reduce((s, v) => s + v, 0);
                    return tot ? Math.round((byYear[y][t] || 0) / tot * 100) : 0;
                }),
                backgroundColor: TCOLORS[i % TCOLORS.length],
                stack: 's',
            })),
        };
    }, [rawOC, selYears]);

    // Línea: % enlace mensual
    const lineData = useMemo(() => ({
        labels: MESES_CORTO,
        datasets: selYears.map(y => {
            const col = anioColor(y, availableYears);
            const ms  = stats[y] || [];
            return {
                label: y,
                data: ms.map(m => m.total ? Math.round(m.enlazadas / m.total * 100) : null),
                borderColor: col, backgroundColor: col + '18',
                tension: 0.35, pointRadius: 4, fill: false, spanGaps: true,
            };
        }),
    }), [stats, selYears, availableYears]);

    if (!rawOC.length) return (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>Sin datos disponibles</div>
    );

    return (
        <div className="oc-tab-content">
            <div className="oc-section-header">
                <div className="oc-section-title">Comparativo Anual</div>
                <div className="oc-section-sub">Evolución interanual de enlace PAC, montos y tipos de compra — excluye OC canceladas</div>
            </div>

            {/* Selector de años */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginRight: 4 }}>Comparar años:</span>
                {availableYears.map(y => {
                    const sel = selYears.includes(y);
                    const col = anioColor(y, availableYears);
                    return (
                        <button key={y} onClick={() => toggle(y)} style={{
                            padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            border: `2px solid ${col}`, background: sel ? col : '#fff', color: sel ? '#fff' : col,
                            transition: 'all 0.15s',
                        }}>{y}</button>
                    );
                })}
            </div>

            {/* KPI cards por año */}
            {selYears.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${selYears.length}, 1fr)`, gap: 12, marginBottom: 24 }}>
                    {summary.map(({ y, total, enlazadas, pct, neto, sinPAC }) => {
                        const col = anioColor(y, availableYears);
                        return (
                            <div key={y} style={{ background: '#fff', borderRadius: 10, padding: '14px 18px', border: `2px solid ${col}28`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                <div style={{ color: col, fontWeight: 800, fontSize: 17, marginBottom: 10 }}>{y}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    {[
                                        ['N° OC activas',  total.toLocaleString('es-CL'),  null],
                                        ['% Enlace PAC',   `${pct.toFixed(1)}%`,            pct >= 70 ? '#16a34a' : pct >= 50 ? '#ca8a04' : '#dc2626'],
                                        ['Monto Neto',     clpM(neto),                      null],
                                        ['Monto sin PAC',  clpM(sinPAC),                    '#dc2626'],
                                    ].map(([label, val, color]) => (
                                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                            <span style={{ color: '#64748b' }}>{label}</span>
                                            <span style={{ fontWeight: 700, color: color || '#1e293b' }}>{val}</span>
                                        </div>
                                    ))}
                                    <div style={{ background: '#f1f5f9', borderRadius: 3, height: 4, marginTop: 4 }}>
                                        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: col, borderRadius: 3, transition: 'width 0.5s' }} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {selYears.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>
                    Selecciona al menos un año para ver el comparativo
                </div>
            )}

            {/* Gráficos */}
            {selYears.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 24 }}>
                {/* Línea: tasa mensual */}
                <div style={{ background: '#fff', borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', marginBottom: 12 }}>Tasa de Enlace PAC mensual (%)</div>
                    <div style={{ height: 220 }}>
                        <Line data={lineData} options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: {
                                legend: { position: 'top', labels: { font: { size: 11 } } },
                                tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y ?? '—'}%` } },
                            },
                            scales: {
                                y: { min: 0, max: 100, ticks: { callback: v => `${v}%`, font: { size: 10 } }, grid: { color: '#f1f5f9' } },
                                x: { ticks: { font: { size: 11 } }, grid: { display: false } },
                            },
                        }} />
                    </div>
                </div>

                {/* Barras 100%: tipo de compra */}
                <div style={{ background: '#fff', borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', marginBottom: 12 }}>Distribución Tipo de Compra</div>
                    <div style={{ height: 220 }}>
                        <Bar data={tipoChartData} options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: {
                                legend: { position: 'top', labels: { font: { size: 10 }, boxWidth: 10 } },
                                tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y}%` } },
                            },
                            scales: {
                                x: { stacked: true, ticks: { font: { size: 12 } } },
                                y: { stacked: true, max: 100, ticks: { callback: v => `${v}%`, font: { size: 10 } }, grid: { color: '#f1f5f9' } },
                            },
                        }} />
                    </div>
                </div>
            </div>}

            {/* Tabla resumen mensual */}
            {selYears.length > 0 && <div style={{ background: '#fff', borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', marginBottom: 12 }}>Resumen Mensual</div>
                <div className="oc-table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Mes</th>
                                {selYears.map(y => (
                                    <React.Fragment key={y}>
                                        <th style={{ color: anioColor(y, availableYears), textAlign: 'right' }}>{y} · N°OC</th>
                                        <th style={{ color: anioColor(y, availableYears), textAlign: 'right' }}>{y} · % PAC</th>
                                        <th style={{ color: anioColor(y, availableYears), textAlign: 'right' }}>{y} · Neto</th>
                                    </React.Fragment>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {MESES_CORTO.map((mes, i) => {
                                const anyData = selYears.some(y => (stats[y]?.[i]?.total ?? 0) > 0);
                                if (!anyData) return null;
                                return (
                                    <tr key={mes}>
                                        <td style={{ fontWeight: 600, fontSize: 12 }}>{mes}</td>
                                        {selYears.map(y => {
                                            const m = stats[y]?.[i];
                                            const pct = m?.total ? (m.enlazadas / m.total * 100).toFixed(1) : null;
                                            const pctColor = pct !== null
                                                ? (parseFloat(pct) >= 70 ? '#16a34a' : parseFloat(pct) >= 50 ? '#ca8a04' : '#dc2626')
                                                : '#94a3b8';
                                            return (
                                                <React.Fragment key={y}>
                                                    <td style={{ textAlign: 'right', fontSize: 12 }}>{m?.total ?? '—'}</td>
                                                    <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: pctColor }}>{pct !== null ? `${pct}%` : '—'}</td>
                                                    <td style={{ textAlign: 'right', fontSize: 12 }}>{m?.neto ? clpM(m.neto) : '—'}</td>
                                                </React.Fragment>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>}
        </div>
    );
}

// ── Banner de actualización ETL ───────────────────────────────────────────────

function ocLogColor(line) {
    if (/✅|COMPLETADO|finalizada/.test(line)) return '#4ade80';
    if (/❌|Error/.test(line)) return '#f87171';
    if (/⚠️|Sin datos/.test(line)) return '#fbbf24';
    if (/✨/.test(line)) return '#a78bfa';
    if (/🔄|📊|🔗|🚀|>>>/.test(line)) return '#60a5fa';
    return '#94a3b8';
}

function OCStepIcon({ paso, pasoActual, status }) {
    const done = paso < pasoActual || status === 'completado';
    const active = paso === pasoActual && status === 'en_proceso';
    const err = status === 'error' && paso === pasoActual;
    if (err)    return <span style={{ color: '#ef4444', fontSize: 15 }}>✗</span>;
    if (done)   return <span style={{ color: '#22c55e', fontSize: 15 }}>✓</span>;
    if (active) return <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid #16a34a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'oc-etl-spin 0.8s linear infinite', verticalAlign: 'middle' }} />;
    return <span style={{ color: '#cbd5e1', fontSize: 14 }}>○</span>;
}

function OCProgressBar({ pct, active, color, indeterminate }) {
    return (
        <div style={{ background: '#e2e8f0', borderRadius: 4, height: 7, overflow: 'hidden', position: 'relative' }}>
            {indeterminate ? (
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '40%', background: color, borderRadius: 4, animation: 'oc-etl-indeterminate 1.4s ease-in-out infinite' }} />
            ) : (
                <div style={{
                    width: `${Math.max(2, pct)}%`, height: '100%', borderRadius: 4,
                    background: active && pct < 100
                        ? `repeating-linear-gradient(90deg,${color} 0,${color} 20px,${color}99 20px,${color}99 40px)`
                        : color,
                    backgroundSize: '40px 100%',
                    animation: active && pct < 100 ? 'oc-etl-stripes 0.6s linear infinite' : 'none',
                    transition: 'width 0.7s ease',
                }} />
            )}
        </div>
    );
}

function BannerActualizacionOC({ tarea, onCerrar }) {
    const logRef = useRef(null);
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [tarea.logs_recientes]);

    const puedesCerrar = ['completado', 'error'].includes(tarea.status);
    const colorH = tarea.status === 'error' ? '#dc2626' : tarea.status === 'completado' ? '#15803d' : '#15803d';

    const fmtF = iso => { if (!iso) return '?'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
    const fmtN = n => n != null ? Number(n).toLocaleString('es-CL') : null;

    const totalDias = tarea.total_dias || 0;
    const diasOk = tarea.dias_completados || 0;
    const ocsD = tarea.ocs_dia || 0;
    const totalOcsD = tarea.total_ocs_dia || 0;
    const pct1 = tarea.paso >= 2 || tarea.status === 'completado' ? 100 : (tarea.progreso_pct || 0);
    const pct2 = tarea.status === 'completado' ? 100 : (tarea.progreso_sync_pct || 0);
    const logs = tarea.logs_recientes || [];

    return (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1100, width: 400, background: '#fff', borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,0.22)', overflow: 'hidden', border: `2px solid ${colorH}` }}>
            <style>{`
                @keyframes oc-etl-spin { to { transform: rotate(360deg); } }
                @keyframes oc-etl-stripes { to { background-position: 40px 0; } }
                @keyframes oc-etl-indeterminate { 0%{left:-40%} 60%{left:100%} 100%{left:100%} }
            `}</style>

            {/* Cabecera */}
            <div style={{ background: colorH, padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {tarea.status === 'completado' ? '✅ Actualización OC completada'
                        : tarea.status === 'error' ? '❌ Error en actualización OC'
                        : <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.5)', borderTopColor: '#fff', borderRadius: '50%', animation: 'oc-etl-spin 0.8s linear infinite' }} /> Actualizando Órdenes de Compra</>}
                </div>
                {puedesCerrar && <button onClick={onCerrar} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>✕</button>}
            </div>

            {/* Cuerpo */}
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Rango */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
                    <span>📅 {fmtF(tarea.fecha_desde)} → {fmtF(tarea.fecha_hasta)}</span>
                    {totalDias > 0 && <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 10, padding: '2px 8px', fontWeight: 600, fontSize: 11 }}>{totalDias} día{totalDias !== 1 ? 's' : ''}</span>}
                </div>

                {/* Paso 1 */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
                        <span style={{ width: 18, textAlign: 'center', flexShrink: 0 }}><OCStepIcon paso={1} pasoActual={tarea.paso} status={tarea.status} /></span>
                        <span style={{ fontWeight: tarea.paso === 1 ? 700 : 500, color: tarea.paso >= 1 ? '#1e293b' : '#94a3b8' }}>Descarga de OC + enlace PAC</span>
                        {tarea.paso === 1 && totalDias > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{diasOk}/{totalDias}</span>}
                    </div>
                    {tarea.paso >= 1 && (
                        <>
                            <div style={{ paddingLeft: 26 }}><OCProgressBar pct={pct1} active={tarea.paso === 1} color="#16a34a" /></div>
                            {tarea.paso === 1 && (
                                <div style={{ paddingLeft: 26, marginTop: 4, fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontStyle: 'italic' }}>{tarea.paso_desc}</span>
                                    {totalOcsD > 0 && <span style={{ color: '#94a3b8' }}>{ocsD}/{totalOcsD} OCs</span>}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Paso 2 */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
                        <span style={{ width: 18, textAlign: 'center', flexShrink: 0 }}><OCStepIcon paso={2} pasoActual={tarea.paso} status={tarea.status} /></span>
                        <span style={{ fontWeight: tarea.paso === 2 ? 700 : 500, color: tarea.paso >= 2 ? '#1e293b' : '#94a3b8' }}>Sincronización con base de datos</span>
                    </div>
                    {tarea.paso >= 2 && (
                        <>
                            <div style={{ paddingLeft: 26 }}><OCProgressBar pct={pct2} active={tarea.paso === 2} color="#7c3aed" indeterminate={tarea.paso === 2 && pct2 === 0} /></div>
                            {tarea.paso === 2 && <div style={{ paddingLeft: 26, marginTop: 4, fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>{tarea.paso_desc}</div>}
                        </>
                    )}
                </div>

                {/* Log */}
                {logs.length > 0 && (
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Actividad reciente</div>
                        <div ref={logRef} style={{ background: '#0f172a', borderRadius: 7, padding: '8px 10px', maxHeight: 130, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#334155 #0f172a' }}>
                            {logs.map((line, i) => (
                                <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: ocLogColor(line), lineHeight: 1.6, wordBreak: 'break-all' }}>{line}</div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Resultados */}
                {tarea.status === 'completado' && (
                    <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 13px', fontSize: 12 }}>
                        <div style={{ fontWeight: 700, color: '#15803d', fontSize: 13, marginBottom: 7 }}>📊 Resultados</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#166534' }}>
                            {tarea.ocs_en_bd != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>🗄️ OC en base de datos</span><span style={{ fontWeight: 700 }}>{fmtN(tarea.ocs_en_bd)}</span></div>}
                            {tarea.detalles_en_bd != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>📋 Líneas de detalle</span><span style={{ fontWeight: 700 }}>{fmtN(tarea.detalles_en_bd)}</span></div>}
                            {tarea.pac_registros != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>🔗 Registros con PAC</span><span style={{ fontWeight: 700 }}>{fmtN(tarea.pac_registros)}</span></div>}
                        </div>
                        <div style={{ marginTop: 8, fontSize: 11, color: '#64748b', borderTop: '1px solid #dcfce7', paddingTop: 6 }}>Dashboard actualizado automáticamente</div>
                    </div>
                )}

                {/* Error */}
                {tarea.status === 'error' && (
                    <div style={{ background: '#fef2f2', borderRadius: 8, padding: '10px 13px' }}>
                        <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 12, marginBottom: 5 }}>Detalle del error:</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#b91c1c', wordBreak: 'break-all', whiteSpace: 'pre-wrap', maxHeight: 100, overflowY: 'auto' }}>{tarea.error}</div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
    { key: 'estrategico',  label: 'Estratégico',  icon: '📊' },
    { key: 'tactico',      label: 'Táctico',      icon: '📈' },
    { key: 'operativo',    label: 'Operativo',    icon: '📋' },
    { key: 'analitico',    label: 'Analítico',    icon: '🔍' },
    { key: 'comparativo',  label: 'Comparativo',  icon: '📅' },
];

export default function OCDashboardPage() {
    const [activeTab, setActiveTab] = useState('estrategico');
    const {
        rawOC, ocData, loadingOC, errorOC,
        anio, setAnio, unidad, setUnidad,
        years, unidades, refresh,
    } = useOCDashboard();

    const isLoading = loadingOC;

    // Modal de actualización
    const [showModal, setShowModal] = useState(false);
    const hoy = new Date();
    const hace7 = new Date(hoy); hace7.setDate(hoy.getDate() - 7);
    const [modalDesde, setModalDesde] = useState(hace7.toISOString().slice(0, 10));
    const [modalHasta, setModalHasta] = useState(hoy.toISOString().slice(0, 10));

    const { tarea: tareaOC, iniciando: iniciandoOC, iniciar: iniciarOC, cerrar: cerrarBannerOC } =
        useActualizarOC(refresh);

    const handleIniciarOC = () => { setShowModal(false); iniciarOC(modalDesde, modalHasta); };

    return (
        <div className="feature-page">

            {/* ── Modal selección de fechas ── */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>🔄 Actualizar Órdenes de Compra</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>Selecciona el rango de fechas a descargar desde Mercado Público.</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Desde</label>
                                <input type="date" className="filtro-input" style={{ width: '100%' }} value={modalDesde} onChange={e => setModalDesde(e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Hasta</label>
                                <input type="date" className="filtro-input" style={{ width: '100%' }} value={modalHasta} onChange={e => setModalHasta(e.target.value)} />
                            </div>
                        </div>
                        <p style={{ margin: '12px 0 0', fontSize: 11, color: '#94a3b8' }}>
                            Incluye: descarga diaria, integración en maestros, enlace PAC y sincronización con BD.
                        </p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowModal(false)} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 13, color: '#64748b', fontWeight: 600 }}>Cancelar</button>
                            <button onClick={handleIniciarOC} disabled={iniciandoOC || !modalDesde || !modalHasta}
                                style={{ padding: '8px 20px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: (iniciandoOC || !modalDesde || !modalHasta) ? 0.6 : 1 }}>
                                {iniciandoOC ? '⏳ Iniciando...' : '🚀 Actualizar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Banner flotante de progreso ── */}
            {tareaOC && <BannerActualizacionOC tarea={tareaOC} onCerrar={cerrarBannerOC} />}

            {/* ── Barra de tabs + filtros inline ── */}
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
                    {activeTab !== 'comparativo' && (
                        <>
                            <div className="oc-filter-group">
                                <span className="oc-filter-label-dark">Año</span>
                                <select className="oc-filter-select-light" value={anio} onChange={e => setAnio(e.target.value)}>
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                            <div className="oc-filter-group">
                                <span className="oc-filter-label-dark">Unidad</span>
                                <select className="oc-filter-select-light" style={{ maxWidth: 200 }} value={unidad} onChange={e => setUnidad(e.target.value)}>
                                    <option value="Todas">Todas las unidades</option>
                                    {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                        </>
                    )}
                    {/* Botón Actualizar API */}
                    <button
                        className="btn-actualizar-api"
                        onClick={() => setShowModal(true)}
                        disabled={!!tareaOC && ['iniciado', 'en_proceso'].includes(tareaOC.status)}
                        title="Descargar nuevas OC desde Mercado Público y sincronizar con BD"
                        style={{ marginLeft: 8 }}
                    >
                        {tareaOC && ['iniciado', 'en_proceso'].includes(tareaOC.status) ? '⏳ Actualizando...' : '🔄 Actualizar API'}
                    </button>
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
                        {activeTab === 'estrategico'  && <TabEstrategico data={ocData} anio={anio} />}
                        {activeTab === 'tactico'      && <TabTactico data={ocData} />}
                        {activeTab === 'operativo'    && <TabOperativo data={ocData} />}
                        {activeTab === 'analitico'    && <TabAnalitico data={ocData} anio={anio} unidad={unidad} />}
                        {activeTab === 'comparativo'  && <TabComparativoAnual rawOC={rawOC} />}
                    </>
                )}
            </div>
        </div>
    );
}
