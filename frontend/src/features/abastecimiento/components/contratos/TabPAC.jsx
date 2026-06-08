import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { getContratosPAC, getContratosPACDetalleOC } from '../../api/contratosApi';
import { exportarPAC } from './exportUtils';

const fmt  = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
const fmtB = (n) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return fmt(n);
};

const ENLACE_CFG = {
    'Enlazada':    { label: '✅ Enlazada',    bg: '#f0fdf4', color: '#15803d' },
    'No Enlazada': { label: '⛔ No Enlazada', bg: '#fef2f2', color: '#dc2626' },
};
const enlaceCfg = (v) => ENLACE_CFG[v] || ENLACE_CFG['No Enlazada'];

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }) {
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '14px 18px',
            border: '1px solid #e2e8f0', flex: '1 1 150px', minWidth: 130,
            borderTop: `4px solid ${color}`, boxShadow: '0 1px 2px rgba(15,23,42,.04)',
        }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
        </div>
    );
}

// ── Tooltip informativo ───────────────────────────────────────────────────────
function InfoTooltip({ text }) {
    const [show, setShow] = useState(false);
    return (
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
              onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
            <span style={{ cursor: 'help', color: '#94a3b8', fontSize: 12, marginLeft: 4 }}>ⓘ</span>
            {show && (
                <span style={{
                    position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
                    background: '#1e293b', color: '#f8fafc', fontSize: 11, padding: '7px 11px',
                    borderRadius: 7, whiteSpace: 'pre-wrap', minWidth: 200, maxWidth: 300,
                    width: 'max-content', textAlign: 'left', zIndex: 300, lineHeight: 1.7,
                    boxShadow: '0 6px 20px rgba(0,0,0,.28)', pointerEvents: 'none',
                }}>
                    {text}
                </span>
            )}
        </span>
    );
}

const thStyle = { padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc', fontSize: 12, cursor: 'pointer', userSelect: 'none' };
const tdStyle = { padding: '7px 10px', color: '#374151', fontSize: 12 };

// Encabezado de columna ordenable — soporta orden numérico (mayor↔menor) y alfabético (A↔Z)
function ThSort({ col, label, sort, onSort, align, tip }) {
    const active = sort.col === col;
    const arrow = active ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ' ⇅';
    return (
        <th onClick={() => onSort(col)} title="Click para ordenar"
            style={{ ...thStyle, textAlign: align || 'left', color: active ? '#7c3aed' : thStyle.color, background: active ? '#f5f3ff' : thStyle.background }}>
            {label}
            <span style={{ color: active ? '#7c3aed' : '#cbd5e1', fontWeight: 700 }}>{arrow}</span>
            {tip && <InfoTooltip text={tip} />}
        </th>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-TAB 1: RESUMEN (vista por contrato — funcionalidad original)
// ══════════════════════════════════════════════════════════════════════════════
const STACK_BAR_OPTS = (yLabel) => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${new Intl.NumberFormat('es-CL').format(ctx.raw)} OC` } },
    },
    scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, precision: 0 }, title: { display: !!yLabel, text: yLabel, font: { size: 11 } } },
    },
});

// ══════════════════════════════════════════════════════════════════════════════
// SUB-TAB 1: RESUMEN (vista por contrato + KPIs + gráficos de evolución)
// ══════════════════════════════════════════════════════════════════════════════
function TabResumen({ data, detalle }) {
    const [sort, setSort] = useState({ col: 'n_oc_total', dir: 'desc' });
    const [busqueda, setBusqueda] = useState('');
    const [expandida, setExpandida] = useState(null);
    const [anioMensual, setAnioMensual] = useState('');

    const { resumen, kpis, pivot_anio_estado, pivot_mes_estado } = data;

    const toggleSort = (col) => setSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
    const arrow = (col) => sort.col === col ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '';

    const filtrado = resumen.filter(r =>
        !busqueda ||
        r.nombre_contrato.toLowerCase().includes(busqueda.toLowerCase()) ||
        r.numero_contrato.toLowerCase().includes(busqueda.toLowerCase())
    );

    const sorted = [...filtrado].sort((a, b) => {
        const mul = sort.dir === 'asc' ? 1 : -1;
        if (['n_oc_total', 'n_oc_enlazada', 'n_oc_no_enlazada', 'pct_enlazada', 'monto_contrato'].includes(sort.col))
            return mul * ((a[sort.col] ?? 0) - (b[sort.col] ?? 0));
        return mul * String(a[sort.col] ?? '').localeCompare(String(b[sort.col] ?? ''), 'es', { sensitivity: 'base' });
    });

    // ── Gráfico anual (barras apiladas Enlazada / No Enlazada) ──
    const anualChart = useMemo(() => {
        if (!pivot_anio_estado?.length) return null;
        return {
            labels: pivot_anio_estado.map(r => String(r.anio || '—')),
            datasets: [
                { label: '✅ Enlazada', data: pivot_anio_estado.map(r => r.Enlazada), backgroundColor: '#16a34a', borderRadius: 4, stack: 'enlace' },
                { label: '⛔ No Enlazada', data: pivot_anio_estado.map(r => r['No Enlazada']), backgroundColor: '#dc2626', borderRadius: 4, stack: 'enlace' },
            ],
        };
    }, [pivot_anio_estado]);

    // ── Gráfico mensual: por año específico, o agregado Ene–Dic across todos los años ──
    const aniosDisponibles = useMemo(
        () => [...new Set((pivot_mes_estado || []).map(r => r.anio))].sort((a, b) => b - a),
        [pivot_mes_estado]
    );

    const mensualChart = useMemo(() => {
        if (!pivot_mes_estado?.length) return null;
        const MES_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        if (anioMensual) {
            const filas = pivot_mes_estado.filter(r => String(r.anio) === anioMensual);
            const porMes = Array.from({ length: 12 }, (_, i) => {
                const f = filas.find(r => r.mes === i + 1);
                return { Enlazada: f?.Enlazada || 0, 'No Enlazada': f?.['No Enlazada'] || 0 };
            });
            return {
                labels: MES_LABELS,
                datasets: [
                    { label: '✅ Enlazada', data: porMes.map(m => m.Enlazada), backgroundColor: '#16a34a', borderRadius: 4, stack: 'enlace' },
                    { label: '⛔ No Enlazada', data: porMes.map(m => m['No Enlazada']), backgroundColor: '#dc2626', borderRadius: 4, stack: 'enlace' },
                ],
            };
        }
        // Agregado: suma de todos los años por mes-calendario (patrón estacional)
        const acumulado = Array.from({ length: 12 }, () => ({ Enlazada: 0, 'No Enlazada': 0 }));
        pivot_mes_estado.forEach(r => {
            if (r.mes >= 1 && r.mes <= 12) {
                acumulado[r.mes - 1].Enlazada += r.Enlazada;
                acumulado[r.mes - 1]['No Enlazada'] += r['No Enlazada'];
            }
        });
        return {
            labels: MES_LABELS,
            datasets: [
                { label: '✅ Enlazada', data: acumulado.map(m => m.Enlazada), backgroundColor: '#16a34a', borderRadius: 4, stack: 'enlace' },
                { label: '⛔ No Enlazada', data: acumulado.map(m => m['No Enlazada']), backgroundColor: '#dc2626', borderRadius: 4, stack: 'enlace' },
            ],
        };
    }, [pivot_mes_estado, anioMensual]);

    const cardStyle = { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* KPIs */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <KpiCard label="% Enlazado Global" value={`${kpis.pct_enlazado_global}%`} color="#16a34a" sub="de todas las OC" />
                <KpiCard label="100% Enlazados"    value={fmtN(kpis.contratos_100pct_enlazados)} color="#16a34a" sub="contratos" />
                <KpiCard label="Parcialmente enlazados" value={fmtN(kpis.contratos_parcialmente_enlazados)} color="#f59e0b" sub="con OC enlazadas y sin enlazar" />
                <KpiCard label="Sin PAC"           value={fmtN(kpis.contratos_sin_pac)} color="#dc2626" sub="contratos con OC y sin enlace" />
                <KpiCard label="Sin OC en sistema" value={fmtN(kpis.contratos_sin_oc)} color="#6b7280" sub="contratos sin OC encontrada" />
            </div>
            {detalle?.kpis && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <KpiCard label="💰 Monto OC enlazado" value={fmtB(detalle.kpis.monto_enlazado)} color="#16a34a" sub="con trazabilidad PAC confirmada" />
                    <KpiCard label="💸 Monto OC sin enlazar" value={fmtB(detalle.kpis.monto_no_enlazado)} color="#dc2626" sub="exposición sin trazabilidad PAC" />
                </div>
            )}

            {/* Gráficos de evolución */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={cardStyle}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        📅 Evolución anual — Enlazadas vs No Enlazadas
                        <InfoTooltip text="Cuenta las OC enviadas cada año y cuántas quedaron con un Código PAC asociado. Permite ver si la disciplina de enlace mejora o empeora con el tiempo." />
                    </div>
                    <div style={{ height: 260 }}>
                        {anualChart ? <Bar data={anualChart} options={STACK_BAR_OPTS('N° de OC')} /> : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 12 }}>Sin datos suficientes para graficar.</div>
                        )}
                    </div>
                </div>

                <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                            🗓️ Evolución mensual — Enlazadas vs No Enlazadas
                            <InfoTooltip text={'Selecciona un año para ver su evolución mes a mes, o deja "Todos los años" para ver el patrón estacional acumulado (útil para detectar meses de alta actividad o bajo enlace, p.ej. cierres de año).'} />
                        </div>
                        <select value={anioMensual} onChange={e => setAnioMensual(e.target.value)}
                            style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11 }}>
                            <option value="">Todos los años (patrón estacional)</option>
                            {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    <div style={{ height: 260 }}>
                        {mensualChart ? <Bar data={mensualChart} options={STACK_BAR_OPTS('N° de OC')} /> : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 12 }}>Sin datos suficientes para graficar.</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Controles tabla */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input
                    type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar contrato..."
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
                />
                <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{sorted.length} contratos</span>
            </div>

            {/* Tabla maestra */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f0fdf4' }}>
                                <th style={{ width: 32 }} />
                                {[
                                    { col: 'numero_contrato', label: 'N° Contrato' },
                                    { col: 'nombre_contrato', label: 'Nombre' },
                                    { col: 'estado_contrato', label: 'Estado' },
                                    { col: 'monto_contrato', label: 'Monto' },
                                    { col: 'n_oc_total', label: 'N° OC Total' },
                                    { col: 'n_oc_enlazada', label: 'Enlazadas' },
                                    { col: 'n_oc_no_enlazada', label: 'No Enlazadas' },
                                    { col: 'pct_enlazada', label: '% Enlazado' },
                                ].map(({ col, label }) => (
                                    <th key={col} onClick={() => toggleSort(col)}
                                        style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #d1fae5', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                                        {label}{arrow(col)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((r, i) => (
                                <React.Fragment key={r.numero_contrato}>
                                    <tr
                                        style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: expandida === i ? '#f0fdf4' : 'transparent' }}
                                        onClick={() => setExpandida(expandida === i ? null : i)}
                                    >
                                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
                                            {r.proyectos?.length > 0 ? (expandida === i ? '▾' : '▸') : ''}
                                        </td>
                                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12 }}>{r.numero_contrato}</td>
                                        <td style={{ padding: '8px 10px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.nombre_contrato}>{r.nombre_contrato}</td>
                                        <td style={{ padding: '8px 10px', fontSize: 12, color: '#6b7280' }}>{r.estado_contrato}</td>
                                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmt(r.monto_contrato)}</td>
                                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmtN(r.n_oc_total)}</td>
                                        <td style={{ padding: '8px 10px', color: r.n_oc_enlazada > 0 ? '#15803d' : '#9ca3af', fontWeight: 600 }}>{fmtN(r.n_oc_enlazada)}</td>
                                        <td style={{ padding: '8px 10px', color: r.n_oc_no_enlazada > 0 ? '#dc2626' : '#9ca3af', fontWeight: 600 }}>{fmtN(r.n_oc_no_enlazada)}</td>
                                        <td style={{ padding: '8px 10px' }}>
                                            {r.n_oc_total > 0 ? (
                                                <div>
                                                    <div style={{ background: '#f3f4f6', borderRadius: 3, height: 8, width: 80, display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }}>
                                                        <div style={{ width: `${r.pct_enlazada}%`, background: r.pct_enlazada === 100 ? '#16a34a' : r.pct_enlazada >= 50 ? '#f59e0b' : '#dc2626', height: '100%', borderRadius: 3 }} />
                                                    </div>
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: r.pct_enlazada === 100 ? '#15803d' : r.pct_enlazada >= 50 ? '#b45309' : '#dc2626' }}>
                                                        {r.pct_enlazada}%
                                                    </span>
                                                </div>
                                            ) : <span style={{ color: '#9ca3af', fontSize: 12 }}>Sin OC</span>}
                                        </td>
                                    </tr>
                                    {expandida === i && r.proyectos?.length > 0 && (
                                        <tr>
                                            <td colSpan={9} style={{ background: '#f0fdf4', padding: '8px 16px 12px 40px', borderBottom: '1px solid #d1fae5' }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                                                    Detalle por ID Proyecto y Año
                                                </div>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                    <thead>
                                                        <tr style={{ background: '#d1fae5' }}>
                                                            {['ID Proyecto', 'Nombre Proyecto', 'Año', 'Enlazadas', 'No Enlazadas', '% Enlazado'].map(h => (
                                                                <th key={h} style={{ padding: '5px 10px', textAlign: 'left', color: '#065f46', fontWeight: 600, borderBottom: '1px solid #a7f3d0' }}>{h}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {r.proyectos.sort((a, b) => (b.anio || 0) - (a.anio || 0)).map((p, j) => {
                                                            const total = p.enlazadas + p.no_enlazadas;
                                                            const pct = total > 0 ? ((p.enlazadas / total) * 100).toFixed(0) : 0;
                                                            return (
                                                                <tr key={j} style={{ borderBottom: '1px solid #ecfdf5' }}>
                                                                    <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: '#065f46', fontWeight: 600 }}>{p.ID_Proyecto}</td>
                                                                    <td style={{ padding: '5px 10px', color: '#374151' }}>{p.Nombre_Proyecto || '—'}</td>
                                                                    <td style={{ padding: '5px 10px', color: '#374151' }}>{p.anio || '—'}</td>
                                                                    <td style={{ padding: '5px 10px', color: '#15803d', fontWeight: 600 }}>{fmtN(p.enlazadas)}</td>
                                                                    <td style={{ padding: '5px 10px', color: p.no_enlazadas > 0 ? '#dc2626' : '#9ca3af', fontWeight: 600 }}>{fmtN(p.no_enlazadas)}</td>
                                                                    <td style={{ padding: '5px 10px', fontWeight: 600, color: pct === '100' ? '#15803d' : pct >= 50 ? '#b45309' : '#dc2626' }}>
                                                                        {pct}%
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-TAB 2: BUSCADOR OC ↔ PAC (tabla plana a nivel de OC)
// ══════════════════════════════════════════════════════════════════════════════
function TabBuscador({ detalle }) {
    const [busqueda, setBusqueda] = useState('');
    const [filtroEnlace, setFiltroEnlace] = useState('');
    const [filtroAnio, setFiltroAnio] = useState('');
    const [filtroUnidad, setFiltroUnidad] = useState('');
    const [sort, setSort] = useState({ col: 'fecha_envio', dir: 'desc' });

    const [busquedaLic, setBusquedaLic] = useState('');
    const [licSeleccionada, setLicSeleccionada] = useState('');

    const { filas, kpis, licitaciones } = detalle;

    const anios = useMemo(() => [...new Set(filas.map(f => f.anio).filter(Boolean))].sort((a, b) => b - a), [filas]);
    const unidades = useMemo(() => [...new Set(filas.map(f => f.unidad).filter(Boolean))].sort(), [filas]);

    const filtradas = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return filas.filter(f => {
            if (filtroEnlace && f.enlace_pac !== filtroEnlace) return false;
            if (filtroAnio && String(f.anio) !== filtroAnio) return false;
            if (filtroUnidad && f.unidad !== filtroUnidad) return false;
            if (!q) return true;
            return (
                f.codigo_pac.toLowerCase().includes(q) ||
                f.codigo_oc.toLowerCase().includes(q) ||
                f.codigo_licitacion.toLowerCase().includes(q) ||
                f.numero_contrato.toLowerCase().includes(q) ||
                f.nombre_contrato.toLowerCase().includes(q) ||
                f.nombre_proyecto.toLowerCase().includes(q)
            );
        });
    }, [filas, busqueda, filtroEnlace, filtroAnio, filtroUnidad]);

    const toggleSort = (col) => setSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));

    const ordenadas = useMemo(() => [...filtradas].sort((a, b) => {
        const mul = sort.dir === 'asc' ? 1 : -1;
        if (['total_bruto', 'anio'].includes(sort.col)) return mul * ((a[sort.col] ?? 0) - (b[sort.col] ?? 0));
        return mul * String(a[sort.col] ?? '').localeCompare(String(b[sort.col] ?? ''), 'es', { sensitivity: 'base' });
    }), [filtradas, sort]);

    // Explorador por licitación — lista filtrada + registro seleccionado
    const licitacionesFiltradas = useMemo(() => {
        const q = busquedaLic.trim().toLowerCase();
        if (!q) return licitaciones;
        return licitaciones.filter(l =>
            l.codigo_licitacion.toLowerCase().includes(q) ||
            l.numero_contrato.toLowerCase().includes(q) ||
            l.nombre_contrato.toLowerCase().includes(q)
        );
    }, [licitaciones, busquedaLic]);

    const lic = licitaciones.find(l => l.codigo_licitacion === licSeleccionada) || null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* KPIs */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <KpiCard label="Total OC ligadas a contratos" value={fmtN(kpis.total_oc)} color="#7c3aed" />
                <KpiCard label="✅ Enlazadas"    value={fmtN(kpis.total_enlazadas)} color="#16a34a" sub={`${kpis.total_oc > 0 ? ((kpis.total_enlazadas / kpis.total_oc) * 100).toFixed(0) : 0}% del total`} />
                <KpiCard label="⛔ No enlazadas" value={fmtN(kpis.total_no_enlazadas)} color="#dc2626" />
                <KpiCard label="Códigos PAC distintos" value={fmtN(kpis.total_codigos_pac)} color="#0ea5e9" />
                <KpiCard label="Licitaciones con OC" value={fmtN(kpis.total_licitaciones)} color="#f59e0b" />
            </div>

            {/* ── Explorador por Código de Licitación ─────────────────────────── */}
            <div className="card" style={{ border: '1px solid #ddd6fe', background: 'linear-gradient(180deg,#faf5ff 0%,#ffffff 60px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 16 }}>🧭</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#5b21b6' }}>Explorador por Código de Licitación</span>
                    <InfoTooltip text={'Busca una licitación por su código, contrato o nombre.\nAl seleccionarla verás de inmediato qué Códigos PAC quedaron enlazados a sus Órdenes de Compra y cuántas OC tiene cada uno — la pregunta típica "¿qué PAC tiene esta licitación?" respondida en un clic.'} />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input value={busquedaLic} onChange={e => { setBusquedaLic(e.target.value); setLicSeleccionada(''); }}
                        placeholder="Filtrar por código de licitación, N° contrato o nombre..."
                        style={{ flex: '1 1 260px', padding: '9px 12px', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 13, background: '#fff' }} />
                    <select value={licSeleccionada} onChange={e => setLicSeleccionada(e.target.value)}
                        style={{ flex: '2 1 380px', padding: '9px 12px', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                        <option value="">— Seleccione una licitación para ver su detalle —</option>
                        {licitacionesFiltradas.slice(0, 400).map(l => (
                            <option key={l.codigo_licitacion} value={l.codigo_licitacion}>
                                {l.codigo_licitacion} · Contrato {l.numero_contrato} — {l.nombre_contrato ? l.nombre_contrato.slice(0, 50) : 'Sin nombre'} [{l.n_oc} OC · {l.n_codigos_pac} cód. PAC]
                            </option>
                        ))}
                    </select>
                </div>

                {!lic && (
                    <div style={{ marginTop: 12, fontSize: 11, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>💡</span> {fmtN(licitacionesFiltradas.length)} licitaciones disponibles — selecciona una para ver sus Códigos PAC enlazados y el total de OC por código.
                    </div>
                )}

                {lic && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #ddd6fe' }}>
                        {/* Resumen de la licitación seleccionada */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'stretch', marginBottom: 14 }}>
                            <div style={{ flex: '1 1 260px', background: '#fff', border: '1px solid #ede9fe', borderRadius: 10, padding: '12px 16px' }}>
                                <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 4 }}>Licitación seleccionada</div>
                                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#5b21b6', fontSize: 15 }}>{lic.codigo_licitacion}</div>
                                <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
                                    Contrato <strong>{lic.numero_contrato}</strong> — {lic.nombre_contrato || 'Sin nombre'}
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Estado: {lic.estado_contrato || '—'}</div>
                            </div>
                            <KpiCard label="OC de esta licitación" value={fmtN(lic.n_oc)} color="#7c3aed" />
                            <KpiCard label="✅ Enlazadas" value={fmtN(lic.n_enlazada)} color="#16a34a" sub={`${lic.n_oc > 0 ? ((lic.n_enlazada / lic.n_oc) * 100).toFixed(0) : 0}% del total`} />
                            <KpiCard label="⛔ No enlazadas" value={fmtN(lic.n_no_enlazada)} color="#dc2626" />
                            <KpiCard label="Monto total OC" value={fmtB(lic.monto_total)} color="#0ea5e9" />
                        </div>

                        {/* Códigos PAC enlazados — chips/cards dinámicos */}
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            🏷️ Códigos PAC enlazados a esta licitación
                            <InfoTooltip text="Cada tarjeta es un Código PAC distinto encontrado entre las OC de esta licitación, con el conteo de cuántas OC apuntan a él y cuántas de esas ya están marcadas como Enlazadas." />
                            <span style={{ fontWeight: 400, color: '#94a3b8' }}>({lic.n_codigos_pac})</span>
                        </div>
                        {lic.codigos_pac.length === 0 ? (
                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 16px', fontSize: 12, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 8 }}>
                                ⛔ Ninguna OC de esta licitación tiene un Código PAC asociado todavía.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                {lic.codigos_pac.map(cp => {
                                    const pct = cp.n_oc > 0 ? Math.round((cp.n_enlazada / cp.n_oc) * 100) : 0;
                                    return (
                                        <div key={cp.codigo_pac} style={{
                                            flex: '1 1 220px', minWidth: 200, background: '#fff', border: '1px solid #e2e8f0',
                                            borderLeft: '4px solid #0e7490', borderRadius: 10, padding: '10px 14px',
                                            boxShadow: '0 1px 2px rgba(15,23,42,.04)',
                                        }}>
                                            <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0e7490', fontSize: 14 }}>{cp.codigo_pac}</div>
                                            <div style={{ fontSize: 11, color: '#64748b', margin: '3px 0 8px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cp.nombre_proyecto}>
                                                {cp.nombre_proyecto || 'Sin nombre de proyecto'}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 11, color: '#374151' }}>
                                                    <strong>{fmtN(cp.n_oc)}</strong> OC vinculadas
                                                </span>
                                                <span style={{ background: '#f0fdf4', color: '#15803d', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>
                                                    {fmtN(cp.n_enlazada)} enlazadas
                                                </span>
                                            </div>
                                            <div style={{ background: '#f3f4f6', borderRadius: 3, height: 6, marginTop: 7, overflow: 'hidden' }}>
                                                <div style={{ width: `${pct}%`, background: pct === 100 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#dc2626', height: '100%' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Buscador + filtros tabla general */}
            <div className="card">
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar por código PAC, N° OC, código de licitación, N° contrato o proyecto..."
                        style={{ flex: '1 1 280px', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
                    <select value={filtroEnlace} onChange={e => setFiltroEnlace(e.target.value)}
                        style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12 }}>
                        <option value="">Todos los enlaces</option>
                        <option value="Enlazada">✅ Enlazada</option>
                        <option value="No Enlazada">⛔ No Enlazada</option>
                    </select>
                    <select value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)}
                        style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12 }}>
                        <option value="">Todos los años</option>
                        {anios.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <select value={filtroUnidad} onChange={e => setFiltroUnidad(e.target.value)}
                        style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, maxWidth: 220 }}>
                        <option value="">Todas las unidades</option>
                        {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtN(ordenadas.length)} OC · click en columnas para ordenar ↓ ↑</span>
                </div>
            </div>

            {/* Tabla plana */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr>
                                <ThSort col="codigo_oc" label="N° OC" sort={sort} onSort={toggleSort} />
                                <ThSort col="fecha_envio" label="Fecha envío" sort={sort} onSort={toggleSort} />
                                <ThSort col="codigo_licitacion" label="Licitación" sort={sort} onSort={toggleSort} tip="Código de la licitación de Mercado Público que originó el contrato y, en cascada, esta Orden de Compra." />
                                <ThSort col="numero_contrato" label="Contrato" sort={sort} onSort={toggleSort} />
                                <ThSort col="codigo_pac" label="Código PAC" sort={sort} onSort={toggleSort} />
                                <ThSort col="nombre_proyecto" label="Proyecto PAC" sort={sort} onSort={toggleSort} />
                                <ThSort col="unidad" label="Unidad" sort={sort} onSort={toggleSort} />
                                <ThSort col="total_bruto" label="Monto OC" sort={sort} onSort={toggleSort} align="right" />
                                <ThSort col="enlace_pac" label="Enlace" sort={sort} onSort={toggleSort} />
                            </tr>
                        </thead>
                        <tbody>
                            {ordenadas.length === 0 && (
                                <tr><td colSpan={9} style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Sin resultados para los filtros aplicados.</td></tr>
                            )}
                            {ordenadas.map((f, i) => {
                                const cfg = enlaceCfg(f.enlace_pac);
                                return (
                                    <tr key={f.codigo_oc} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                        <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#7c3aed', fontWeight: 600 }}>
                                            {f.link_mp ? <a href={f.link_mp} target="_blank" rel="noreferrer" style={{ color: '#7c3aed' }}>{f.codigo_oc}</a> : f.codigo_oc}
                                        </td>
                                        <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#64748b' }}>{f.fecha_envio || '—'}</td>
                                        <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#5b21b6' }}>
                                            {f.codigo_licitacion ? (
                                                <button onClick={() => { setLicSeleccionada(f.codigo_licitacion); setBusquedaLic(''); }}
                                                    title="Ver detalle de esta licitación en el explorador"
                                                    style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontFamily: 'monospace', color: '#5b21b6', cursor: 'pointer', fontWeight: 600 }}>
                                                    {f.codigo_licitacion}
                                                </button>
                                            ) : '—'}
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontWeight: 600 }}>{f.numero_contrato}</div>
                                            <div style={{ fontSize: 10, color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.nombre_contrato}>{f.nombre_contrato}</div>
                                        </td>
                                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, color: f.codigo_pac ? '#0e7490' : '#cbd5e1' }}>{f.codigo_pac || '—'}</td>
                                        <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.nombre_proyecto}>{f.nombre_proyecto || '—'}</td>
                                        <td style={{ ...tdStyle, color: '#64748b' }}>{f.unidad || '—'}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtB(f.total_bruto)}</td>
                                        <td style={tdStyle}>
                                            <span style={{ background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>{cfg.label}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-TAB 3: DETALLE POR CÓDIGO PAC (vista cruzada)
// ══════════════════════════════════════════════════════════════════════════════
function TabDetallePAC({ detalle }) {
    const [seleccionado, setSeleccionado] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [sort, setSort] = useState({ col: 'fecha_envio', dir: 'desc' });

    const { codigos_pac, filas } = detalle;

    const codigosFiltrados = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return codigos_pac;
        return codigos_pac.filter(p => p.codigo_pac.toLowerCase().includes(q) || p.nombre_proyecto.toLowerCase().includes(q));
    }, [codigos_pac, busqueda]);

    const pac = codigos_pac.find(p => p.codigo_pac === seleccionado) || null;
    const ocVinculadas = useMemo(
        () => seleccionado ? filas.filter(f => f.codigo_pac === seleccionado) : [],
        [filas, seleccionado]
    );

    const toggleSort = (col) => setSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
    const ordenadas = useMemo(() => [...ocVinculadas].sort((a, b) => {
        const mul = sort.dir === 'asc' ? 1 : -1;
        if (['total_bruto', 'anio'].includes(sort.col)) return mul * ((a[sort.col] ?? 0) - (b[sort.col] ?? 0));
        return mul * String(a[sort.col] ?? '').localeCompare(String(b[sort.col] ?? ''), 'es', { sensitivity: 'base' });
    }), [ocVinculadas, sort]);

    const contratosInvolucrados = useMemo(() => pac ? [...new Set(ocVinculadas.map(f => f.numero_contrato))] : [], [pac, ocVinculadas]);
    const licitacionesInvolucradas = useMemo(() => pac ? [...new Set(ocVinculadas.map(f => f.codigo_licitacion).filter(Boolean))] : [], [pac, ocVinculadas]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Banner de instrucciones de uso */}
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 18 }}>💡</span>
                <div style={{ fontSize: 12, color: '#9a3412', lineHeight: 1.6 }}>
                    <strong>¿Cómo usar esta vista?</strong> Es la dirección inversa del Buscador: en lugar de partir de un contrato u OC, partes
                    de un <strong>Código PAC (ID Proyecto)</strong> y descubres <em>dónde y cuántas veces</em> se usó en todo el sistema —
                    útil cuando un mismo proyecto del Plan Anual de Compras se reparte entre varios contratos, licitaciones u OC distintas
                    y necesitas comprobar la trazabilidad completa de ese código.
                    <br />Escribe parte del código o del nombre del proyecto en el buscador, selecciona uno de la lista y revisa el cruce: cuántas
                    OC lo referencian, cuántas ya están enlazadas, en qué contratos y licitaciones aparece, y el detalle fila por fila (ordenable por columna).
                </div>
            </div>

            {/* Selector */}
            <div className="card">
                <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🔍 Seleccionar código PAC para ver su cruce completo
                    <InfoTooltip text="La lista muestra primero los códigos PAC con más OC vinculadas. Filtra escribiendo el código o parte del nombre del proyecto." />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setSeleccionado(''); }}
                        placeholder="Filtrar lista de códigos PAC por código o nombre de proyecto..."
                        style={{ flex: '1 1 220px', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
                    <select value={seleccionado} onChange={e => setSeleccionado(e.target.value)}
                        style={{ flex: '2 1 360px', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                        <option value="">— Seleccione un código PAC —</option>
                        {codigosFiltrados.map(p => (
                            <option key={p.codigo_pac} value={p.codigo_pac}>
                                {p.codigo_pac} — {p.nombre_proyecto ? p.nombre_proyecto.slice(0, 60) : 'Sin nombre'} [{p.n_oc} OC · {p.n_contratos} contratos · {p.n_enlazada}/{p.n_oc} enlazadas]
                            </option>
                        ))}
                    </select>
                    <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center', whiteSpace: 'nowrap' }}>{fmtN(codigosFiltrados.length)} códigos PAC</span>
                </div>
            </div>

            {!seleccionado && (
                <div style={{ background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🏷️</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#64748b' }}>Selecciona un código PAC para ver dónde quedó vinculado</div>
                    <div style={{ fontSize: 12 }}>Muestra todas las OC, contratos y licitaciones asociadas a ese código en todo el sistema — útil cuando un mismo proyecto PAC se reparte entre varios contratos.</div>
                </div>
            )}

            {pac && (
                <>
                    {/* KPIs del código */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <KpiCard label="Código PAC" value={pac.codigo_pac} color="#0e7490" sub={pac.nombre_proyecto || 'Sin nombre de proyecto'} />
                        <KpiCard label="OC vinculadas" value={fmtN(pac.n_oc)} color="#7c3aed" sub={`${pac.n_enlazada} marcadas como enlazadas`} />
                        <KpiCard label="% Enlazado" value={`${pac.n_oc > 0 ? Math.round((pac.n_enlazada / pac.n_oc) * 100) : 0}%`} color={pac.n_enlazada === pac.n_oc ? '#16a34a' : pac.n_enlazada > 0 ? '#f59e0b' : '#dc2626'} />
                        <KpiCard label="Contratos involucrados" value={fmtN(pac.n_contratos)} color="#0ea5e9" />
                        <KpiCard label="Licitaciones involucradas" value={fmtN(licitacionesInvolucradas.length)} color="#f59e0b" />
                        <KpiCard label="Monto total OC" value={fmtB(pac.monto_total)} color="#16a34a" />
                        <KpiCard label="Años de actividad" value={pac.anios.length > 0 ? pac.anios.join(', ') : '—'} color="#6b7280" />
                    </div>

                    {/* Resumen de contratos y licitaciones donde aparece */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 280px', background: '#fff', border: '1px solid #e0f2fe', borderLeft: '4px solid #0ea5e9', borderRadius: 10, padding: '12px 16px' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 6 }}>📑 Contratos donde aparece este código</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {contratosInvolucrados.map(nc => (
                                    <span key={nc} style={{ background: '#f0f9ff', color: '#0369a1', fontSize: 11, fontFamily: 'monospace', fontWeight: 600, padding: '3px 9px', borderRadius: 20, border: '1px solid #bae6fd' }}>{nc}</span>
                                ))}
                            </div>
                        </div>
                        <div style={{ flex: '1 1 280px', background: '#fff', border: '1px solid #fef3c7', borderLeft: '4px solid #f59e0b', borderRadius: 10, padding: '12px 16px' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', marginBottom: 6 }}>📋 Licitaciones donde aparece este código</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {licitacionesInvolucradas.length > 0 ? licitacionesInvolucradas.map(cl => (
                                    <span key={cl} style={{ background: '#fffbeb', color: '#b45309', fontSize: 11, fontFamily: 'monospace', fontWeight: 600, padding: '3px 9px', borderRadius: 20, border: '1px solid #fde68a' }}>{cl}</span>
                                )) : <span style={{ fontSize: 11, color: '#94a3b8' }}>Sin código de licitación registrado en las OC vinculadas.</span>}
                            </div>
                        </div>
                    </div>

                    {/* Tabla cruzada */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px 4px', fontSize: 13, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                            🔗 OC, contratos y licitaciones vinculados a {pac.codigo_pac}
                            <InfoTooltip text="Cada fila es una Orden de Compra que referenció este Código PAC. Click en los encabezados para ordenar de mayor a menor, menor a mayor, o alfabéticamente." />
                            <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}>({fmtN(ordenadas.length)} OC)</span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
                                <thead>
                                    <tr>
                                        <ThSort col="codigo_oc" label="N° OC" sort={sort} onSort={toggleSort} />
                                        <ThSort col="nombre_oc" label="Nombre OC" sort={sort} onSort={toggleSort} />
                                        <ThSort col="fecha_envio" label="Fecha envío" sort={sort} onSort={toggleSort} />
                                        <ThSort col="codigo_licitacion" label="Licitación" sort={sort} onSort={toggleSort} />
                                        <ThSort col="numero_contrato" label="Contrato" sort={sort} onSort={toggleSort} />
                                        <ThSort col="estado_contrato" label="Estado contrato" sort={sort} onSort={toggleSort} />
                                        <ThSort col="unidad" label="Unidad" sort={sort} onSort={toggleSort} />
                                        <ThSort col="anio" label="Año" sort={sort} onSort={toggleSort} align="right" />
                                        <ThSort col="total_bruto" label="Monto OC" sort={sort} onSort={toggleSort} align="right" />
                                        <ThSort col="estado_oc" label="Estado OC" sort={sort} onSort={toggleSort} />
                                        <ThSort col="enlace_pac" label="Enlace PAC" sort={sort} onSort={toggleSort} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {ordenadas.map((f, i) => {
                                        const cfg = enlaceCfg(f.enlace_pac);
                                        return (
                                            <tr key={f.codigo_oc} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#7c3aed', fontWeight: 600 }}>
                                                    {f.link_mp ? <a href={f.link_mp} target="_blank" rel="noreferrer" style={{ color: '#7c3aed' }}>{f.codigo_oc}</a> : f.codigo_oc}
                                                </td>
                                                <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.nombre_oc}>{f.nombre_oc || '—'}</td>
                                                <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#64748b' }}>{f.fecha_envio || '—'}</td>
                                                <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#5b21b6' }}>{f.codigo_licitacion || '—'}</td>
                                                <td style={tdStyle}>
                                                    <div style={{ fontWeight: 600 }}>{f.numero_contrato}</div>
                                                    <div style={{ fontSize: 10, color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.nombre_contrato}>{f.nombre_contrato}</div>
                                                </td>
                                                <td style={{ ...tdStyle, color: '#64748b' }}>{f.estado_contrato || '—'}</td>
                                                <td style={{ ...tdStyle, color: '#64748b' }}>{f.unidad || '—'}</td>
                                                <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b' }}>{f.anio || '—'}</td>
                                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtB(f.total_bruto)}</td>
                                                <td style={{ ...tdStyle, color: '#64748b' }}>{f.estado_oc || '—'}</td>
                                                <td style={tdStyle}>
                                                    <span style={{ background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>{cfg.label}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export function TabPAC({ filtros }) {
    const [data, setData]       = useState(null);
    const [detalle, setDetalle] = useState(null);
    const [loading, setLoading] = useState(true);
    const [subTab, setSubTab]   = useState('resumen');

    const cargar = useCallback(() => {
        setLoading(true);
        Promise.all([
            getContratosPAC(filtros),
            getContratosPACDetalleOC(filtros),
        ])
            .then(([rPac, rDet]) => { setData(rPac.data); setDetalle(rDet.data); })
            .catch(() => { setData(null); setDetalle(null); })
            .finally(() => setLoading(false));
    }, [JSON.stringify(filtros)]);

    useEffect(() => { cargar(); }, [cargar]);

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⏳ Cargando cruce PAC...</div>;
    if (!data || !detalle) return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⚠️ Error al cargar datos.</div>;

    const SUB_TABS = [
        { id: 'resumen',  label: '📊 Resumen' },
        { id: 'buscador', label: `🔍 Buscador OC ↔ PAC (${fmtN(detalle.kpis.total_oc)})` },
        { id: 'detalle',  label: `🏷️ Detalle por Código PAC (${fmtN(detalle.kpis.total_codigos_pac)})` },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {SUB_TABS.map(t => (
                        <button key={t.id} onClick={() => setSubTab(t.id)} style={{
                            padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: subTab === t.id ? 700 : 400,
                            color: subTab === t.id ? '#7c3aed' : '#64748b',
                            borderBottom: subTab === t.id ? '2px solid #7c3aed' : '2px solid transparent',
                            marginBottom: -2,
                        }}>
                            {t.label}
                        </button>
                    ))}
                </div>
                <button onClick={() => exportarPAC(data)}
                    style={{ padding: '6px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, fontSize: 12, color: '#15803d', cursor: 'pointer', fontWeight: 600, marginBottom: 4 }}>
                    📥 Excel
                </button>
            </div>

            {subTab === 'resumen'  && <TabResumen data={data} detalle={detalle} />}
            {subTab === 'buscador' && <TabBuscador detalle={detalle} />}
            {subTab === 'detalle'  && <TabDetallePAC detalle={detalle} />}
        </div>
    );
}
