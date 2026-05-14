import React, { useState, useMemo, useCallback } from 'react';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import * as XLSX from 'xlsx';
import { useOCDashboard } from '../hooks/useOCDashboard';
import { useAlertCount } from '../../../store/alertStore';

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

const ESTADO_DEV_COLORS = {
    'FINALIZADO_SIN_ERRORES': '#2e7d32',
    'BORRADOR': '#e65100',
    'MANUAL_SIGFE': '#1565c0',
    'EXTRA_PRESUPUESTARIO': '#7b1fa2',
    'FINALIZADO_CON_ERRORES': '#c62828',
    'ND_RECHAZADO_POR_REFERENCIA_NO_PROCESABLE': '#b71c1c',
    '': '#9e9e9e',
};

const ESTADO_DEV_LABELS = {
    'FINALIZADO_SIN_ERRORES': 'Finalizado OK',
    'BORRADOR': 'Borrador',
    'MANUAL_SIGFE': 'Manual SIGFE',
    'EXTRA_PRESUPUESTARIO': 'Extra Pres.',
    'FINALIZADO_CON_ERRORES': 'Con Errores',
    'ND_RECHAZADO_POR_REFERENCIA_NO_PROCESABLE': 'ND Rechazado',
    '': 'Sin devengo',
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

const DevBadge = ({ dev }) => {
    const cls = {
        'FINALIZADO_SIN_ERRORES': 'oc-dev-ok',
        'BORRADOR': 'oc-dev-borrador',
        'MANUAL_SIGFE': 'oc-dev-manual',
        'EXTRA_PRESUPUESTARIO': 'oc-dev-extra',
        'FINALIZADO_CON_ERRORES': 'oc-dev-error',
        'ND_RECHAZADO_POR_REFERENCIA_NO_PROCESABLE': 'oc-dev-error',
    }[dev] || 'oc-dev-none';
    return <span className={`oc-tarea-badge ${cls}`}>{ESTADO_DEV_LABELS[dev] || dev || 'Sin devengo'}</span>;
};

const TareaBadge = ({ tarea }) => (
    <span className="oc-tarea-badge" style={{ fontSize: '10px' }}>
        {(tarea || '—').replace(/_/g, ' ')}
    </span>
);

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

// ── Tab: Facturas ─────────────────────────────────────────────────────────────

const FACT_PAGE = 50;
const ALERTS_PAGE = 50;

function TabFacturas({ facturas }) {
    const [alertFilter, setAlertFilter] = useState('todas');
    const [searchAlerts, setSearchAlerts] = useState('');
    const [searchFact, setSearchFact] = useState('');
    const [pageAlerts, setPageAlerts] = useState(1);
    const [pageFact, setPageFact] = useState(1);
    const [timelineInput, setTimelineInput] = useState('');
    const [timelineResult, setTimelineResult] = useState(null);

    const sinRC    = useMemo(() => facturas.filter(r => r.folio_oc && !r.folio_rc), [facturas]);
    const borrador = useMemo(() => facturas.filter(r => r.estado_devengo === 'BORRADOR'), [facturas]);
    const pendiente = useMemo(() => facturas.filter(r => ['Valida_RC', 'Valida_OC_Plus', 'Error_Devengo', 'Referencia_no_registrada'].includes(r.tarea_actual)), [facturas]);
    const finOK    = useMemo(() => facturas.filter(r => r.estado_devengo === 'FINALIZADO_SIN_ERRORES'), [facturas]);

    const totalMonto = facturas.reduce((s, r) => s + (r.monto_total || 0), 0);
    const conRC      = facturas.filter(r => r.folio_rc).length;
    const conTicket  = facturas.filter(r => r.ticket_devengo).length;

    // Devengo donut data
    const devCounts = useMemo(() => {
        const c = {};
        facturas.forEach(r => { const k = r.estado_devengo || ''; c[k] = (c[k] || 0) + 1; });
        return c;
    }, [facturas]);

    const topEmisores = useMemo(() => {
        const s = sumBy(facturas, 'razon_social_emisor', 'monto_total');
        return Object.entries(s).sort((a, b) => b[1] - a[1]).slice(0, 10);
    }, [facturas]);

    // Alert rows
    const alertRows = useMemo(() => {
        let rows;
        if (alertFilter === 'sin_rc')             rows = sinRC;
        else if (alertFilter === 'reclamo')       rows = facturas.filter(r => r.estado_reclamo && r.estado_reclamo !== '');
        else if (alertFilter === 'devengo_error') rows = facturas.filter(r => ['FINALIZADO_CON_ERRORES', 'ND_RECHAZADO_POR_REFERENCIA_NO_PROCESABLE'].includes(r.estado_devengo));
        else if (alertFilter === 'proceso_incompleto') rows = pendiente;
        else rows = [...new Set([...sinRC, ...borrador, ...pendiente])];

        if (searchAlerts) {
            const q = searchAlerts.toLowerCase();
            rows = rows.filter(r =>
                (r.folio_oc || '').toLowerCase().includes(q) ||
                (r.razon_social_emisor || '').toLowerCase().includes(q) ||
                (r.tarea_actual || '').toLowerCase().includes(q)
            );
        }
        return rows;
    }, [facturas, alertFilter, searchAlerts, sinRC, borrador, pendiente]);

    const factRows = useMemo(() => {
        if (!searchFact) return facturas;
        const q = searchFact.toLowerCase();
        return facturas.filter(r =>
            (r.razon_social_emisor || '').toLowerCase().includes(q) ||
            (r.folio_oc || '').toLowerCase().includes(q) ||
            String(r.folio || '').includes(q) ||
            (r.emisor || '').toLowerCase().includes(q)
        );
    }, [facturas, searchFact]);

    const alertSlice = alertRows.slice((pageAlerts - 1) * ALERTS_PAGE, pageAlerts * ALERTS_PAGE);
    const factSlice  = factRows.slice((pageFact - 1) * FACT_PAGE, pageFact * FACT_PAGE);

    const exportAlerts = () => {
        const rows = [
            ['Folio OC', 'Tipo Doc', 'Folio Factura', 'Proveedor', 'RUT', 'Fecha Ingreso', 'Monto Total', 'Estado Devengo', 'Tarea Actual', 'Tiene RC', 'Ticket Devengo'],
            ...alertRows.map(r => [
                r.folio_oc || '', r.tipo_documento || '', r.folio || '',
                r.razon_social_emisor || '', r.emisor || '',
                r.fecha_ingreso ? r.fecha_ingreso.slice(0, 10) : '', r.monto_total || 0,
                r.estado_devengo || '', r.tarea_actual || '',
                r.folio_rc ? 'SI' : 'NO', r.ticket_devengo || '',
            ])
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Alertas_OC_sin_RC');
        XLSX.writeFile(wb, 'Alertas_OC_sin_RC.xlsx');
    };

    const exportFact = () => {
        const rows = [
            ['Tipo', 'Folio', 'Proveedor', 'RUT', 'Emisión', 'Neto', 'Exento', 'IVA', 'Total', 'OC', 'RC', 'Estado Devengo', 'Tarea', 'Reclamo', 'Ticket'],
            ...factRows.map(r => [
                r.tipo_documento || '', r.folio || '', r.razon_social_emisor || '', r.emisor || '',
                r.emision ? r.emision.slice(0, 10) : '', r.monto_neto || 0, r.monto_exento || 0,
                r.monto_iva || 0, r.monto_total || 0, r.folio_oc || '', r.folio_rc || '',
                r.estado_devengo || '', r.tarea_actual || '', r.estado_reclamo || '', r.ticket_devengo || '',
            ])
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Facturas');
        XLSX.writeFile(wb, 'Facturas_SSO.xlsx');
    };

    const buscarTimeline = useCallback(() => {
        const q = timelineInput.trim().toUpperCase();
        if (!q) return;
        const related = facturas.filter(r => (r.folio_oc || '').toUpperCase() === q);
        if (!related.length) {
            setTimelineResult({ found: false, q });
            return;
        }
        setTimelineResult({ found: true, q, facturas: related, first: related[0] });
    }, [timelineInput, facturas]);

    const devLabels = Object.keys(devCounts);
    const devVals   = devLabels.map(k => devCounts[k]);
    const devColors = devLabels.map(k => ESTADO_DEV_COLORS[k] || '#bbb');
    const devNice   = devLabels.map(k => ESTADO_DEV_LABELS[k] || k || 'Sin devengo');

    const alertPills = [
        { key: 'todas', label: 'Todas las alertas', cnt: null },
        { key: 'sin_rc', label: 'Sin RC', cnt: sinRC.length },
        { key: 'reclamo', label: 'Con reclamo', cnt: facturas.filter(r => r.estado_reclamo && r.estado_reclamo !== '').length },
        { key: 'devengo_error', label: 'Error devengo', cnt: facturas.filter(r => ['FINALIZADO_CON_ERRORES', 'ND_RECHAZADO_POR_REFERENCIA_NO_PROCESABLE'].includes(r.estado_devengo)).length },
        { key: 'proceso_incompleto', label: 'Proceso incompleto', cnt: pendiente.length },
    ];

    return (
        <div className="oc-tab-content">
            <div className="oc-section-header">
                <div className="oc-section-title">Seguimiento Logístico — Facturas</div>
                <div className="oc-section-sub">Trazabilidad OC → Recepción Conforme → Facturación → Devengo SIGFE</div>
            </div>

            {/* Alert KPIs */}
            <div className="oc-alert-grid">
                <div className="oc-alert-card c-rojo">
                    <div className="oc-alert-label">⚠ OC sin Recepción Conforme</div>
                    <div className="oc-alert-num">{sinRC.length}</div>
                    <div className="oc-alert-sub">Facturas con OC pero sin RC registrada</div>
                </div>
                <div className="oc-alert-card c-naranja">
                    <div className="oc-alert-label">⏳ Devengo en BORRADOR</div>
                    <div className="oc-alert-num">{borrador.length}</div>
                    <div className="oc-alert-sub">No han llegado a SIGFE</div>
                </div>
                <div className="oc-alert-card c-amarillo">
                    <div className="oc-alert-label">🔄 Proceso Pendiente</div>
                    <div className="oc-alert-num">{pendiente.length}</div>
                    <div className="oc-alert-sub">Valida_RC / Reclamo / Error</div>
                </div>
                <div className="oc-alert-card c-azul">
                    <div className="oc-alert-label">✅ Finalizadas OK</div>
                    <div className="oc-alert-num">{finOK.length}</div>
                    <div className="oc-alert-sub">FINALIZADO_SIN_ERRORES</div>
                </div>
            </div>

            <div className="oc-chart-grid-2" style={{ marginBottom: 16 }}>
                {/* KPIs facturación */}
                <div className="oc-chart-card">
                    <div className="oc-chart-title">KPIs de Facturación</div>
                    <div className="oc-chart-sub">Totales del período cargado</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                        {[
                            ['Total documentos', facturas.length],
                            ['Monto Total', clp(totalMonto)],
                            ['Con OC vinculada', `${facturas.filter(r => r.folio_oc).length}`],
                            ['Con RC registrada', `${conRC} (${facturas.length ? Math.round(conRC / facturas.length * 100) : 0}%)`],
                            ['Con ticket devengo', `${conTicket} (${facturas.length ? Math.round(conTicket / facturas.length * 100) : 0}%)`],
                            ['Reclamos activos', facturas.filter(r => r.estado_reclamo && r.estado_reclamo !== '').length],
                        ].map(([label, val]) => (
                            <div key={label} style={{ background: 'var(--color-surface)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--color-border)' }}>
                                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', color: '#8a9bb0', marginBottom: 4 }}>{label}</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gob-azul)' }}>{val}</div>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Devengo donut */}
                <div className="oc-chart-card">
                    <div className="oc-chart-title">Estado de Devengo SIGFE</div>
                    <div className="oc-chart-sub">Distribución por estado_devengo</div>
                    <Doughnut
                        data={{ labels: devNice, datasets: [{ data: devVals, backgroundColor: devColors, borderWidth: 2, borderColor: '#fff' }] }}
                        options={{ responsive: true, cutout: '60%', plugins: { legend: { position: 'right', labels: { font: { size: 10 }, padding: 8 } } } }}
                    />
                </div>
            </div>

            {/* Top Emisores */}
            <div className="oc-chart-card" style={{ marginBottom: 16 }}>
                <div className="oc-chart-title">Top 10 Emisores por Monto</div>
                <div className="oc-chart-sub">razon_social_emisor — monto_total acumulado</div>
                <Bar
                    data={{
                        labels: topEmisores.map(([p]) => p.length > 28 ? p.slice(0, 26) + '…' : p),
                        datasets: [{ label: 'Monto Total', data: topEmisores.map(([, v]) => +(v / 1_000_000).toFixed(1)), backgroundColor: 'rgba(77,163,199,0.7)', borderRadius: 4 }]
                    }}
                    options={{
                        indexAxis: 'y', responsive: true,
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` $${ctx.raw}M CLP` } } },
                        scales: { x: { ticks: { callback: v => `$${v}M` } } }
                    }}
                />
            </div>

            {/* Timeline buscador */}
            <div className="oc-chart-card" style={{ marginBottom: 16 }}>
                <div className="oc-chart-title">🔍 Historial de Orden de Compra</div>
                <div className="oc-chart-sub" style={{ marginBottom: 12 }}>Busca un código OC para ver su línea de tiempo: envío → RC → facturación → devengo SIGFE</div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <div className="oc-search-box" style={{ maxWidth: 420, flex: 1 }}>
                        <input type="text" placeholder="Ej: 1057532-433-AG26"
                            value={timelineInput}
                            onChange={e => setTimelineInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && buscarTimeline()} />
                    </div>
                    <button className="oc-btn-export" style={{ background: 'var(--gob-azul-mid)' }} onClick={buscarTimeline}>Ver historial</button>
                </div>
                {timelineResult && <TimelineResult result={timelineResult} />}
            </div>

            {/* Alert pills + tabla alertas */}
            <div className="oc-section-header" style={{ marginTop: 8 }}>
                <div className="oc-section-title" style={{ fontSize: 15, color: 'var(--color-danger)' }}>⚠ Facturas que requieren atención</div>
                <div className="oc-section-sub">OC sin RC · Reclamos activos · Devengo con errores · Procesos incompletos</div>
            </div>

            <div className="oc-pill-bar">
                {alertPills.map(p => (
                    <div key={p.key} className={`oc-pill${alertFilter === p.key ? ' active' : ''}`}
                        onClick={() => { setAlertFilter(p.key); setPageAlerts(1); }}>
                        {p.label}
                        {p.cnt !== null && <span className="oc-badge-num" style={{ background: 'rgba(198,40,40,.15)', color: '#c62828', marginLeft: 4 }}>{p.cnt}</span>}
                    </div>
                ))}
            </div>

            <div className="oc-search-row">
                <div className="oc-search-box">
                    <input type="text" placeholder="Buscar por OC, proveedor o tarea…" value={searchAlerts}
                        onChange={e => { setSearchAlerts(e.target.value); setPageAlerts(1); }} />
                </div>
                <button className="oc-btn-export" style={{ background: 'var(--color-danger)' }} onClick={exportAlerts}>📥 Exportar Alertas</button>
                <span className="oc-record-count">{alertRows.length} registros</span>
            </div>

            <div className="oc-table-wrap" style={{ marginBottom: 24 }}>
                <table>
                    <thead>
                        <tr>
                            <th>Folio OC</th><th>Tipo Doc.</th><th>Folio Factura</th><th>Proveedor</th>
                            <th>Fecha Ingreso</th><th>Monto Total</th><th>Estado Devengo</th><th>Tarea Actual</th><th>Ticket Devengo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {alertSlice.map(r => (
                            <tr key={`${r.id}-alert`} style={{ background: '#fff8f8' }}>
                                <td className="oc-mono" style={{ fontWeight: 700, color: 'var(--color-danger)' }}>{r.folio_oc || '—'}</td>
                                <td style={{ fontSize: 11 }}>{(r.tipo_documento || '—').replace(/_/g, ' ')}</td>
                                <td className="oc-mono">{r.folio || '—'}</td>
                                <td className="oc-truncate">{r.razon_social_emisor || '—'}</td>
                                <td className="oc-mono">{r.fecha_ingreso ? r.fecha_ingreso.slice(0, 10) : '—'}</td>
                                <td className="oc-mono">{clp(r.monto_total)}</td>
                                <td><DevBadge dev={r.estado_devengo} /></td>
                                <td><TareaBadge tarea={r.tarea_actual} /></td>
                                <td className="oc-mono" style={{ fontSize: 11 }}>{r.ticket_devengo || <span className="oc-em-dash">—</span>}</td>
                            </tr>
                        ))}
                        {!alertSlice.length && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#9aabb8' }}>Sin alertas para este filtro</td></tr>}
                    </tbody>
                </table>
                <Pagination total={alertRows.length} perPage={ALERTS_PAGE} current={pageAlerts} onChange={setPageAlerts} />
            </div>

            {/* Tabla general facturas */}
            <div className="oc-section-header" style={{ marginTop: 8 }}>
                <div className="oc-section-title" style={{ fontSize: 15 }}>Todas las Facturas</div>
                <div className="oc-section-sub">Registro completo con estado de cada etapa del proceso logístico</div>
            </div>
            <div className="oc-toolbar">
                <div className="oc-search-box">
                    <input type="text" placeholder="Buscar proveedor, OC, folio…" value={searchFact}
                        onChange={e => { setSearchFact(e.target.value); setPageFact(1); }} />
                </div>
                <button className="oc-btn-export" onClick={exportFact}>📥 Exportar Excel</button>
                <span className="oc-record-count">{factRows.length} registros</span>
            </div>
            <div className="oc-table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>#</th><th>Tipo</th><th>Folio</th><th>Proveedor</th><th>RUT</th>
                            <th>Emisión</th><th>Monto Total</th><th>OC Vinculada</th>
                            <th>RC</th><th>Estado Devengo</th><th>Tarea</th><th>Reclamo</th><th>Ver</th>
                        </tr>
                    </thead>
                    <tbody>
                        {factSlice.map((r, i) => (
                            <tr key={r.id} style={r.folio_oc && !r.folio_rc ? { background: '#fff8f8' } : {}}>
                                <td className="oc-mono">{(pageFact - 1) * FACT_PAGE + i + 1}</td>
                                <td style={{ fontSize: 10, fontWeight: 600, color: '#6b7c93' }}>{(r.tipo_documento || '—').replace(/_/g, ' ')}</td>
                                <td className="oc-mono">{r.folio || '—'}</td>
                                <td className="oc-truncate" style={{ maxWidth: 180 }}>{r.razon_social_emisor || '—'}</td>
                                <td className="oc-mono">{r.emisor || '—'}</td>
                                <td className="oc-mono">{r.emision ? r.emision.slice(0, 10) : '—'}</td>
                                <td className="oc-mono">{clp(r.monto_total)}</td>
                                <td className="oc-mono" style={{ fontSize: 11, color: r.folio_oc ? 'var(--gob-azul-light)' : '#ccc' }}>{r.folio_oc || '—'}</td>
                                <td>{r.folio_rc ? <span className="oc-badge oc-badge-conforme">✓ {r.folio_rc.slice(0, 12)}</span> : <span className="oc-badge oc-badge-cancelada">Sin RC</span>}</td>
                                <td><DevBadge dev={r.estado_devengo} /></td>
                                <td><TareaBadge tarea={r.tarea_actual} /></td>
                                <td>{r.estado_reclamo ? <span className="oc-badge oc-badge-cancelada" style={{ fontSize: 10 }}>{r.estado_reclamo.slice(0, 12)}</span> : <span className="oc-em-dash">—</span>}</td>
                                <td>{r.uri ? <a className="oc-link-pac" href={r.uri} target="_blank" rel="noreferrer">Ver</a> : '—'}</td>
                            </tr>
                        ))}
                        {!factSlice.length && <tr><td colSpan={13} style={{ textAlign: 'center', padding: 24, color: '#9aabb8' }}>Sin resultados</td></tr>}
                    </tbody>
                </table>
                <Pagination total={factRows.length} perPage={FACT_PAGE} current={pageFact} onChange={setPageFact} />
            </div>
        </div>
    );
}

function TimelineResult({ result }) {
    if (!result.found) {
        return (
            <div style={{ padding: 20, color: '#9aabb8', fontSize: 13 }}>
                No se encontraron facturas para la OC <strong>{result.q}</strong>.<br />
                <span style={{ fontSize: 11 }}>Verificá que el código es exacto.</span>
            </div>
        );
    }
    const { q, facturas, first: f } = result;
    const allOK = !!f.folio_rc && !!f.ticket_devengo && f.estado_devengo === 'FINALIZADO_SIN_ERRORES';
    const headerColor = allOK ? 'var(--color-success)' : 'var(--color-danger)';

    const hitos = [
        { label: 'Ingreso OC al Sistema', fecha: f.fecha_ingreso_oc, detalle: `Folio OC: ${f.folio_oc || q}`, done: !!f.fecha_ingreso_oc, color: '#3a6bc7' },
        { label: 'Recepción Conforme (RC)', fecha: f.fecha_ingreso_rc, detalle: f.folio_rc ? `RC: ${f.folio_rc}` : '⚠ Sin RC registrada', done: !!f.folio_rc, color: f.folio_rc ? '#2e7d32' : '#c62828', alert: !f.folio_rc },
        { label: `Facturación (${facturas.length} doc.)`, fecha: f.fecha_ingreso, detalle: facturas.map(ff => `Folio ${ff.folio} · ${clp(ff.monto_total)}`).join(' | '), done: true, color: '#e65100' },
        { label: 'Aceptación Factura', fecha: f.fecha_aceptacion, detalle: f.fecha_aceptacion ? 'Aceptada' : 'Pendiente', done: !!f.fecha_aceptacion, color: '#4da3c7' },
        { label: 'Devengo SIGFE', fecha: f.fecha_devengo, detalle: f.ticket_devengo ? `Ticket: ${f.ticket_devengo}` : (f.estado_devengo || 'Sin devengo'), done: !!f.ticket_devengo, color: f.estado_devengo === 'FINALIZADO_SIN_ERRORES' ? '#2e7d32' : '#e65100' },
    ];

    return (
        <div>
            <div style={{ background: allOK ? '#e8f5e9' : '#fff3e0', borderRadius: 8, padding: '12px 16px', marginBottom: 20, borderLeft: `4px solid ${headerColor}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>{allOK ? '✅' : '⚠'}</span>
                <div>
                    <div style={{ fontWeight: 700, color: headerColor }}>{allOK ? 'Proceso completo' : 'Proceso incompleto — revisar hitos marcados'}</div>
                    <div style={{ fontSize: 11, color: '#6b7c93' }}>OC: {q} · {facturas.length} factura(s) · {f.razon_social_emisor || '—'}</div>
                </div>
            </div>
            <div className="oc-tl-container">
                {hitos.map((h, idx) => (
                    <div key={idx} className="oc-tl-item">
                        <div className={`oc-tl-dot${h.done ? ' done' : ' pending'}`} style={{ '--dot-color': h.color }} />
                        <div className="oc-tl-date">{h.fecha ? h.fecha.slice(0, 16) : (h.done ? 'Fecha no registrada' : 'Pendiente')}</div>
                        <div className="oc-tl-title" style={{ color: h.alert ? 'var(--color-danger)' : '' }}>{h.label}{h.alert ? ' ⚠' : ''}</div>
                        <div className="oc-tl-detail">{h.detalle}</div>
                    </div>
                ))}
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
    { key: 'facturas',   label: 'Facturas',    icon: '🧾' },
];

export default function OCDashboardPage() {
    const [activeTab, setActiveTab] = useState('estrategico');
    const {
        ocData, rawFacturas,
        loadingOC, loadingFact,
        errorOC, errorFact,
        anio, setAnio,
        unidad, setUnidad,
        years, unidades,
    } = useOCDashboard();

    const { sinRC } = useAlertCount();
    const isLoading = loadingOC || loadingFact;

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
                            {t.key === 'facturas' && sinRC > 0 && (
                                <span className="oc-tab-alert-dot">{sinRC}</span>
                            )}
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
                {(errorOC || errorFact) && !isLoading && (
                    <div className="error-message">{errorOC || errorFact}</div>
                )}
                {!isLoading && !errorOC && (
                    <>
                        {activeTab === 'estrategico' && <TabEstrategico data={ocData} anio={anio} />}
                        {activeTab === 'tactico'     && <TabTactico data={ocData} />}
                        {activeTab === 'operativo'   && <TabOperativo data={ocData} />}
                        {activeTab === 'analitico'   && <TabAnalitico data={ocData} anio={anio} unidad={unidad} />}
                        {activeTab === 'facturas'    && <TabFacturas facturas={rawFacturas} />}
                    </>
                )}
            </div>
        </div>
    );
}
