import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import { getContratosFinanciero, getContratosOCDetalle } from '../../api/contratosApi';
import { exportarFinanciero, exportarOCDetalle } from './exportUtils';
import { RadiografiaContrato, calcularRadiografia } from './RadiografiaContrato';

const fmt = (n) =>
    n == null ? '—' :
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
const fmtB = (n) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return fmt(n);
};

// ── Configuraciones badge ─────────────────────────────────────────────────────
const RECONCILIACION_CFG = {
    cuadrado:         { label: '🟢 Cuadrado',      bg: '#f0fdf4', color: '#15803d', chartColor: 'rgba(22,163,74,0.8)' },
    diferencia_menor: { label: '🟡 Dif. menor',    bg: '#fffbeb', color: '#b45309', chartColor: 'rgba(234,179,8,0.8)' },
    revisar:          { label: '🔴 Revisar',        bg: '#fef2f2', color: '#dc2626', chartColor: 'rgba(220,38,38,0.8)' },
    sin_datos:        { label: '⬜ Sin OC',         bg: '#f9fafb', color: '#6b7280', chartColor: 'rgba(156,163,175,0.7)' },
    sin_ejecutado:    { label: '⚪ Sin ejecutado',  bg: '#f9fafb', color: '#9ca3af', chartColor: 'rgba(203,213,225,0.8)' },
};

const ALERTA_CFG = {
    critico:  { label: '🔴 Crítico',   sub: '< 3 meses',  color: '#dc2626', chartColor: 'rgba(220,38,38,0.8)' },
    urgente:  { label: '🟠 Urgente',   sub: '< 6 meses',  color: '#ea580c', chartColor: 'rgba(234,88,12,0.8)'  },
    atencion: { label: '🟡 Atención',  sub: '< 12 meses', color: '#b45309', chartColor: 'rgba(234,179,8,0.8)'  },
    ok:       { label: '🟢 OK',        sub: '≥ 12 meses', color: '#15803d', chartColor: 'rgba(22,163,74,0.8)'  },
    sin_datos:{ label: '— Sin datos',  sub: 'Sin OC',     color: '#9ca3af', chartColor: 'rgba(156,163,175,0.6)'},
};

// ── Tooltip ───────────────────────────────────────────────────────────────────
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
                    width: 'max-content', textAlign: 'left', zIndex: 200, lineHeight: 1.7,
                    boxShadow: '0 6px 20px rgba(0,0,0,.28)', pointerEvents: 'none',
                }}>
                    {text}
                </span>
            )}
        </span>
    );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, tooltip }) {
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '14px 18px',
            border: '1px solid #e2e8f0', flex: '1 1 140px', minWidth: 130,
            borderTop: `4px solid ${color}`,
            boxShadow: '0 1px 2px rgba(15,23,42,.04)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                {label}{tooltip && <InfoTooltip text={tooltip} />}
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
        </div>
    );
}

// calcularRadiografia y RadiografiaContrato → importados desde ./RadiografiaContrato

// ── FilaExpandida ─────────────────────────────────────────────────────────────
function FilaExpandida({ idLic, contratoData }) {
    const [detalle, setDetalle] = useState(null);
    const [loading, setLoading] = useState(true);
    const [ocExpandida, setOcExpandida] = useState(null);

    useEffect(() => {
        if (!idLic) { setLoading(false); return; }
        getContratosOCDetalle(idLic)
            .then(r => setDetalle(r.data))
            .catch(() => setDetalle(null))
            .finally(() => setLoading(false));
    }, [idLic]);

    const mc  = contratoData.monto_contrato  || 0;
    const me  = contratoData.monto_ejecutado || 0;
    const mpe = contratoData.monto_por_ejecutar;
    const moOC = contratoData.suma_bruto_oc;

    return (
        <tr>
            <td colSpan={10} style={{ padding: 0, background: '#faf5ff' }}>
                <div style={{ padding: '16px 20px', borderTop: '1px solid #c4b5fd', borderBottom: '1px solid #e5e7eb' }}>
                    {/* KPIs mini */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 10, marginBottom: 14 }}>
                        {[
                            { label: 'Monto Contrato',     valor: fmt(mc),                          color: '#7c3aed' },
                            { label: 'Monto Ejecutado',    valor: fmt(me),                          color: '#0ea5e9' },
                            { label: 'Por Ejecutar',       valor: mpe != null ? fmt(mpe) : 'N/D',   color: '#f59e0b' },
                            { label: 'Monto OC (sistema)', valor: moOC != null ? fmt(moOC) : '—',   color: '#16a34a' },
                        ].map(kpi => (
                            <div key={kpi.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 13px', borderTop: `3px solid ${kpi.color}` }}>
                                <div style={{ fontSize: 10, color: '#6b7280' }}>{kpi.label}</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{kpi.valor}</div>
                            </div>
                        ))}
                    </div>

                    {/* Radiografía de salud */}
                    <RadiografiaContrato r={contratoData} />

                    {!idLic ? (
                        <div style={{ color: '#9ca3af', fontSize: 12 }}>Sin código de licitación — no se pueden buscar OC.</div>
                    ) : loading ? (
                        <div style={{ color: '#9ca3af', fontSize: 12 }}>⏳ Cargando órdenes de compra...</div>
                    ) : !detalle ? (
                        <div style={{ color: '#ef4444', fontSize: 12 }}>Error al cargar OC.</div>
                    ) : (
                        <>
                            {detalle.proyectos.length > 0 && (
                                <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                                    {detalle.proyectos.map(p => (
                                        <div key={p.ID_Proyecto} style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 8, padding: '5px 11px', fontSize: 12 }}>
                                            <span style={{ fontWeight: 600, color: '#6d28d9' }}>{p.ID_Proyecto}</span>
                                            {p.Nombre_Proyecto && <span style={{ color: '#7c3aed' }}> — {p.Nombre_Proyecto}</span>}
                                            <span style={{ color: '#6b7280', marginLeft: 7 }}>{p.n_oc} OC · {fmt(p.suma_bruto)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#4c1d95', padding: '5px 0' }}>
                                    {detalle.oc.length} OC encontradas
                                </span>
                                <div style={{ flex: 1 }} />
                                <button onClick={() => exportarOCDetalle(idLic, detalle)}
                                    style={{ padding: '4px 10px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, fontSize: 11, color: '#15803d', cursor: 'pointer' }}>
                                    📥 Excel
                                </button>
                            </div>
                            {detalle.oc.length === 0 ? (
                                <div style={{ color: '#9ca3af', fontSize: 12, padding: '8px 0' }}>Sin OC en sistema para esta licitación.</div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ background: '#ede9fe' }}>
                                                {['', 'Código OC', 'Estado', 'Total Bruto', 'Total Neto', 'Fecha', 'Proveedor', 'Enlace PAC', 'ID Proyecto'].map(h => (
                                                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#4c1d95', borderBottom: '2px solid #c4b5fd', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detalle.oc.map((oc, i) => (
                                                <React.Fragment key={oc.codigo_oc}>
                                                    <tr style={{ borderBottom: '1px solid #f3f4f6', background: ocExpandida === i ? '#faf5ff' : i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                        <td style={{ padding: '5px 8px' }}>
                                                            {oc.productos.length > 0 && (
                                                                <button onClick={() => setOcExpandida(ocExpandida === i ? null : i)}
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#7c3aed' }}>
                                                                    {ocExpandida === i ? '▾' : '▸'}
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: '#7c3aed', fontWeight: 600 }}>
                                                            {oc.LinkMP ? <a href={oc.LinkMP} target="_blank" rel="noreferrer" style={{ color: '#7c3aed' }}>{oc.codigo_oc}</a> : oc.codigo_oc}
                                                        </td>
                                                        <td style={{ padding: '5px 8px' }}>
                                                            <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: oc.EstadoOC === 'Recepción Conforme' ? '#f0fdf4' : '#fef3c7', color: oc.EstadoOC === 'Recepción Conforme' ? '#15803d' : '#92400e' }}>{oc.EstadoOC}</span>
                                                        </td>
                                                        <td style={{ padding: '5px 8px', fontWeight: 600 }}>{fmt(oc.TotalBruto)}</td>
                                                        <td style={{ padding: '5px 8px', color: '#6b7280' }}>{fmt(oc.TotalNeto)}</td>
                                                        <td style={{ padding: '5px 8px', color: '#6b7280', whiteSpace: 'nowrap' }}>{oc.FechaEnvio}</td>
                                                        <td style={{ padding: '5px 8px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={oc.P_Nombre}>{oc.P_Nombre}</td>
                                                        <td style={{ padding: '5px 8px' }}>
                                                            <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: oc.EnlacePAC === 'Enlazada' ? '#f0fdf4' : '#fef2f2', color: oc.EnlacePAC === 'Enlazada' ? '#15803d' : '#dc2626' }}>{oc.EnlacePAC || '—'}</span>
                                                        </td>
                                                        <td style={{ padding: '5px 8px', fontSize: 11 }}>
                                                            {oc.ID_Proyecto && <span style={{ color: '#7c3aed', fontWeight: 600 }}>{oc.ID_Proyecto}</span>}
                                                            {oc.Nombre_Proyecto && <div style={{ fontSize: 10, color: '#6b7280' }}>{oc.Nombre_Proyecto}</div>}
                                                        </td>
                                                    </tr>
                                                    {ocExpandida === i && oc.productos.length > 0 && (
                                                        <tr>
                                                            <td colSpan={9} style={{ background: '#fdf4ff', padding: '0 16px 10px 36px' }}>
                                                                <div style={{ fontSize: 11, fontWeight: 600, color: '#6d28d9', paddingTop: 6, marginBottom: 5 }}>Líneas de productos ({oc.productos.length})</div>
                                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                                                    <thead>
                                                                        <tr style={{ background: '#ede9fe' }}>
                                                                            {['Cód. Cat.', 'Categoría', 'Cód. Prod.', 'Producto', 'Cant.', 'Precio Neto', 'Total'].map(h => (
                                                                                <th key={h} style={{ padding: '4px 7px', textAlign: 'left', color: '#4c1d95', fontWeight: 600 }}>{h}</th>
                                                                            ))}
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {oc.productos.map((p, j) => (
                                                                            <tr key={j} style={{ borderBottom: '1px solid #e9d5ff' }}>
                                                                                <td style={{ padding: '3px 7px', fontFamily: 'monospace', fontSize: 10 }}>{p.CodigoCategoria}</td>
                                                                                <td style={{ padding: '3px 7px' }}>{p.Categoria}</td>
                                                                                <td style={{ padding: '3px 7px', fontFamily: 'monospace', fontSize: 10 }}>{p.CodigoProducto}</td>
                                                                                <td style={{ padding: '3px 7px' }}>{p.Producto}</td>
                                                                                <td style={{ padding: '3px 7px', textAlign: 'right' }}>{fmtN(p.Cantidad)}</td>
                                                                                <td style={{ padding: '3px 7px', textAlign: 'right' }}>{fmt(p.PrecioNeto)}</td>
                                                                                <td style={{ padding: '3px 7px', textAlign: 'right', fontWeight: 600 }}>{fmt(p.TotalLinea)}</td>
                                                                            </tr>
                                                                        ))}
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
                            )}
                        </>
                    )}
                </div>
            </td>
        </tr>
    );
}

// ── Tab principal ─────────────────────────────────────────────────────────────
export function TabFinanciero({ filtros }) {
    const [data, setData]         = useState(null);
    const [loading, setLoading]   = useState(true);
    const [expandida, setExpandida] = useState(null);
    const [sort, setSort]         = useState({ col: 'monto_contrato', dir: 'desc' });
    const [busqueda, setBusqueda] = useState('');
    const [filtroReconcil, setFiltroReconcil] = useState('');
    const [filtroAlerta, setFiltroAlerta]     = useState('');
    const [tabVista, setTabVista] = useState('resumen');

    const cargar = useCallback(() => {
        setLoading(true);
        setExpandida(null);
        getContratosFinanciero(filtros)
            .then(r => setData(r.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [JSON.stringify(filtros)]);

    useEffect(() => { cargar(); }, [cargar]);

    // ── KPIs calculados ──
    const kpis = useMemo(() => {
        if (!data) return null;
        const total_contratos = data.length;
        const total_monto = data.reduce((s, r) => s + (r.monto_contrato || 0), 0);
        const total_ejecutado = data.reduce((s, r) => s + (r.monto_ejecutado || 0), 0);
        const total_por_ejecutar = data.reduce((s, r) => s + (r.monto_por_ejecutar != null ? r.monto_por_ejecutar : 0), 0);
        const pct_ejecutado = total_monto > 0 ? (total_ejecutado / total_monto) * 100 : 0;
        const criticos = data.filter(r => r.alerta === 'critico').length;
        const a_revisar = data.filter(r => r.reconciliacion === 'revisar').length;
        const sin_oc = data.filter(r => r.reconciliacion === 'sin_datos').length;
        const con_oc = data.filter(r => r.reconciliacion !== 'sin_datos').length;
        return { total_contratos, total_monto, total_ejecutado, total_por_ejecutar, pct_ejecutado, criticos, a_revisar, sin_oc, con_oc };
    }, [data]);

    // ── Pivot anual ──
    const pivotAnual = useMemo(() => {
        if (!data) return [];
        const map = {};
        data.forEach(r => {
            const m = r.numero_contrato?.match(/CL(\d{2})/);
            const anio = m ? (2000 + parseInt(m[1])) : null;
            const k = anio || 'Sin año';
            if (!map[k]) map[k] = { anio: k, n: 0, monto: 0, ejecutado: 0, por_ejecutar: 0, n_oc: 0, criticos: 0 };
            map[k].n += 1;
            map[k].monto += r.monto_contrato || 0;
            map[k].ejecutado += r.monto_ejecutado || 0;
            map[k].por_ejecutar += r.monto_por_ejecutar || 0;
            map[k].n_oc += r.n_oc || 0;
            if (r.alerta === 'critico') map[k].criticos += 1;
        });
        return Object.values(map).sort((a, b) => {
            if (typeof a.anio === 'number' && typeof b.anio === 'number') return b.anio - a.anio;
            return String(a.anio).localeCompare(String(b.anio));
        });
    }, [data]);

    // ── Datos para gráfico donut (reconciliación) ──
    const donutData = useMemo(() => {
        if (!data) return null;
        const cnt = {};
        data.forEach(r => { cnt[r.reconciliacion] = (cnt[r.reconciliacion] || 0) + 1; });
        const keys = Object.keys(cnt).filter(k => cnt[k] > 0);
        return {
            labels: keys.map(k => RECONCILIACION_CFG[k]?.label || k),
            datasets: [{
                data: keys.map(k => cnt[k]),
                backgroundColor: keys.map(k => RECONCILIACION_CFG[k]?.chartColor || '#ccc'),
                borderWidth: 2,
                borderColor: '#fff',
            }],
        };
    }, [data]);

    // ── Datos para gráfico bar (alertas) ──
    const barAlertaData = useMemo(() => {
        if (!data) return null;
        const orden = ['critico', 'urgente', 'atencion', 'ok', 'sin_datos'];
        const cnt = {};
        data.forEach(r => { cnt[r.alerta] = (cnt[r.alerta] || 0) + 1; });
        const validos = orden.filter(k => cnt[k] > 0);
        return {
            labels: validos.map(k => ALERTA_CFG[k].label),
            datasets: [{
                label: 'Contratos',
                data: validos.map(k => cnt[k]),
                backgroundColor: validos.map(k => ALERTA_CFG[k].chartColor),
                borderRadius: 5,
                borderWidth: 0,
            }],
        };
    }, [data]);

    // ── Tabla filtrada y ordenada ──
    const toggleSort = (col) =>
        setSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));

    const STRING_COLS = new Set(['numero_contrato', 'nombre_contrato', 'estado_contrato', 'reconciliacion', 'alerta', 'unidad_requirente']);

    const filtrado = useMemo(() => {
        if (!data) return [];
        return data.filter(r => {
            if (filtroReconcil && r.reconciliacion !== filtroReconcil) return false;
            if (filtroAlerta   && r.alerta !== filtroAlerta)           return false;
            if (!busqueda) return true;
            const q = busqueda.toLowerCase();
            return (r.nombre_contrato || '').toLowerCase().includes(q) ||
                   (r.numero_contrato || '').toLowerCase().includes(q) ||
                   (r.id_licitacion_oc || '').toLowerCase().includes(q);
        });
    }, [data, busqueda, filtroReconcil, filtroAlerta]);

    const sorted = useMemo(() => {
        const mul = sort.dir === 'asc' ? 1 : -1;
        return [...filtrado].sort((a, b) => {
            const va = a[sort.col], vb = b[sort.col];
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            if (STRING_COLS.has(sort.col)) return mul * String(va).localeCompare(String(vb));
            return mul * (va - vb);
        });
    }, [filtrado, sort]);

    const cardStyle = { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>⏳ Cargando seguimiento financiero...</div>;
    if (!data || !kpis) return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>⚠️ Error al cargar datos.</div>;

    // ── SortTh ──
    const SortTh = ({ col, children, align = 'left' }) => (
        <th onClick={() => toggleSort(col)}
            style={{
                padding: '9px 10px', textAlign: align, fontWeight: 600,
                color: sort.col === col ? '#7c3aed' : '#475569',
                borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap',
                background: '#f8fafc', fontSize: 12,
                cursor: 'pointer', userSelect: 'none',
            }}>
            {children}
            <span style={{ opacity: sort.col === col ? 1 : 0.3, marginLeft: 3 }}>
                {sort.col === col ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
            </span>
        </th>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* ── Sub-tabs vista ── */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb' }}>
                {[
                    { id: 'resumen', label: '📊 Resumen & Gráficos' },
                    { id: 'detalle', label: `📋 Tabla Detalle (${fmtN(sorted.length)})` },
                ].map(t => (
                    <button key={t.id} onClick={() => setTabVista(t.id)} style={{
                        padding: '10px 18px', background: 'none', border: 'none',
                        cursor: 'pointer', fontSize: 12,
                        fontWeight: tabVista === t.id ? 700 : 400,
                        color: tabVista === t.id ? '#7c3aed' : '#64748b',
                        borderBottom: tabVista === t.id ? '2px solid #7c3aed' : '2px solid transparent',
                        marginBottom: -2,
                    }}>
                        {t.label}
                    </button>
                ))}
                <div style={{ flex: 1 }} />
                <button onClick={() => exportarFinanciero(data)} style={{
                    padding: '6px 14px', background: '#f0fdf4', border: '1px solid #86efac',
                    borderRadius: 6, fontSize: 12, color: '#15803d', cursor: 'pointer',
                    fontWeight: 600, alignSelf: 'center', marginRight: 4,
                }}>
                    📥 Excel
                </button>
            </div>

            {/* ─── VISTA RESUMEN ─────────────────────────────────────────────── */}
            {tabVista === 'resumen' && (
                <>
                    {/* KPIs */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <KpiCard label="Total Contratos"   value={fmtN(kpis.total_contratos)}
                            sub={`${fmtN(kpis.con_oc)} con OC en sistema`} color="#7c3aed"
                            tooltip="Contratos en el módulo con el filtro actual aplicado." />
                        <KpiCard label="Monto Total" value={fmtB(kpis.total_monto)}
                            sub={`${kpis.pct_ejecutado.toFixed(1)}% ejecutado`} color="#0ea5e9"
                            tooltip="Suma de monto_contrato de todos los contratos del filtro." />
                        <KpiCard label="Monto Ejecutado" value={fmtB(kpis.total_ejecutado)}
                            sub={`Por ejecutar: ${fmtB(kpis.total_por_ejecutar)}`} color="#16a34a"
                            tooltip="Suma de monto_ejecutado (campo del Excel MP). Por ejecutar = monto_contrato − monto_ejecutado." />
                        <KpiCard label="🔴 Críticos" value={fmtN(kpis.criticos)}
                            sub="presupuesto < 3 meses" color="#dc2626"
                            tooltip="Contratos cuyo presupuesto se proyecta agotar en menos de 3 meses, basado en tasa de gasto mensual." />
                        <KpiCard label="🔴 A Reconciliar" value={fmtN(kpis.a_revisar)}
                            sub="diferencia OC > 10%" color="#ea580c"
                            tooltip="Contratos donde la diferencia entre monto_ejecutado y suma de OC supera el 10%. Pueden reflejar OC fuera del sistema." />
                        <KpiCard label="⬜ Sin OC sistema" value={fmtN(kpis.sin_oc)}
                            sub="sin licitación cruzada" color="#9ca3af"
                            tooltip="Contratos sin id_licitacion_oc coincidente en la base de OC. El cruce cubre ~49% del total." />
                    </div>

                    {/* Barra de ejecución global */}
                    <div style={cardStyle}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
                            Avance de Ejecución Global — {kpis.pct_ejecutado.toFixed(1)}%
                        </div>
                        <div style={{ background: '#e2e8f0', borderRadius: 8, height: 20, position: 'relative' }}>
                            <div style={{
                                width: `${Math.min(kpis.pct_ejecutado, 100)}%`,
                                background: kpis.pct_ejecutado >= 90
                                    ? 'linear-gradient(90deg,#dc2626,#ef4444)'
                                    : kpis.pct_ejecutado >= 60
                                        ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                                        : 'linear-gradient(90deg,#7c3aed,#a78bfa)',
                                height: '100%', borderRadius: 8, transition: 'width 0.5s ease',
                            }} />
                            <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                                {fmtB(kpis.total_ejecutado)} / {fmtB(kpis.total_monto)}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginTop: 5 }}>
                            <span>Ejecutado: {fmtB(kpis.total_ejecutado)}</span>
                            <span>Por ejecutar: {fmtB(kpis.total_por_ejecutar)}</span>
                            <span>Total contratos: {fmtB(kpis.total_monto)}</span>
                        </div>
                    </div>

                    {/* Gráficos 50/50 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div style={cardStyle}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                                Distribución de Reconciliación
                                <InfoTooltip text={'Compara monto_ejecutado (MP) con suma de OC en sistema.\n≤1% diff → Cuadrado 🟢\n1-10% → Diferencia menor 🟡\n>10% → Revisar 🔴\nSin OC → Sin datos ⬜'} />
                            </div>
                            <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {donutData && (
                                    <Doughnut data={donutData} options={{
                                        responsive: true, maintainAspectRatio: false,
                                        plugins: {
                                            legend: { position: 'right', labels: { font: { size: 11 }, padding: 8, boxWidth: 12 } },
                                            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmtN(ctx.raw)} contratos` } },
                                        },
                                        cutout: '55%',
                                    }} />
                                )}
                            </div>
                        </div>

                        <div style={cardStyle}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                                Alertas de Proyección Financiera
                                <InfoTooltip text={'Proyección de agotamiento basada en tasa de gasto mensual.\nCrítico: < 3 meses\nUrgente: 3-6 meses\nAtención: 6-12 meses\nOK: > 12 meses'} />
                            </div>
                            <div style={{ height: 240 }}>
                                {barAlertaData && (
                                    <Bar data={barAlertaData} options={{
                                        indexAxis: 'y',
                                        responsive: true, maintainAspectRatio: false,
                                        plugins: {
                                            legend: { display: false },
                                            tooltip: { callbacks: { label: ctx => ` ${fmtN(ctx.raw)} contratos` } },
                                        },
                                        scales: {
                                            x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
                                            y: { grid: { display: false }, ticks: { font: { size: 11 } } },
                                        },
                                    }} />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Pivot anual */}
                    <div style={cardStyle}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 14 }}>
                            Tabla Pivot — Por Año de Contrato
                            <InfoTooltip text="Año extraído del N° contrato (CL26 → 2026). Muestra monto total, ejecutado, OC y contratos críticos por año." />
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr>
                                        {['Año', 'N° Contratos', 'Monto Total', 'Monto Ejecutado', '% Ejec.', 'N° OC', 'Críticos'].map(h => (
                                            <th key={h} style={{
                                                padding: '9px 10px', textAlign: h === 'Año' || h === 'N° Contratos' || h === 'N° OC' || h === 'Críticos' ? 'center' : 'right',
                                                fontWeight: 600, color: '#475569',
                                                borderBottom: '2px solid #e2e8f0',
                                                background: '#f8fafc', whiteSpace: 'nowrap', fontSize: 12,
                                            }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pivotAnual.map((r, i) => {
                                        const pctEjec = r.monto > 0 ? ((r.ejecutado / r.monto) * 100).toFixed(1) : '—';
                                        return (
                                            <tr key={r.anio} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>{r.anio}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>{fmtN(r.n)}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmtB(r.monto)}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtB(r.ejecutado)}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    <span style={{
                                                        background: pctEjec === '—' ? '#f3f4f6' : pctEjec >= 90 ? '#fef2f2' : pctEjec >= 60 ? '#fffbeb' : '#f0fdf4',
                                                        color: pctEjec === '—' ? '#9ca3af' : pctEjec >= 90 ? '#dc2626' : pctEjec >= 60 ? '#b45309' : '#15803d',
                                                        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                                    }}>
                                                        {pctEjec === '—' ? '—' : `${pctEjec}%`}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b' }}>{fmtN(r.n_oc)}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    {r.criticos > 0
                                                        ? <span style={{ color: '#dc2626', fontWeight: 700 }}>🔴 {r.criticos}</span>
                                                        : <span style={{ color: '#9ca3af' }}>—</span>}
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

            {/* ─── VISTA DETALLE ─────────────────────────────────────────────── */}
            {tabVista === 'detalle' && (
                <>
                    {/* Filtros + búsqueda */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <input
                                type="text" value={busqueda}
                                onChange={e => { setBusqueda(e.target.value); setExpandida(null); }}
                                placeholder="Buscar por N° contrato, nombre, código licitación..."
                                style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
                            />
                            <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                                {fmtN(sorted.length)} contratos
                            </span>
                        </div>

                        {/* Chips de filtro rápido */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Reconciliación:</span>
                            {['', ...Object.keys(RECONCILIACION_CFG)].map(k => {
                                const active = filtroReconcil === k;
                                const cfg = RECONCILIACION_CFG[k] || { label: 'Todos', color: '#64748b', bg: '#f8fafc' };
                                return (
                                    <button key={k} onClick={() => { setFiltroReconcil(k); setExpandida(null); }}
                                        style={{
                                            padding: '3px 10px', borderRadius: 20, fontSize: 11,
                                            fontWeight: active ? 700 : 400,
                                            border: active ? `2px solid ${cfg.color || '#7c3aed'}` : '1px solid #e2e8f0',
                                            background: active ? (cfg.bg || '#ede9fe') : '#fff',
                                            color: active ? (cfg.color || '#7c3aed') : '#64748b',
                                            cursor: 'pointer',
                                        }}>
                                        {k === '' ? 'Todos' : cfg.label}
                                    </button>
                                );
                            })}
                            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginLeft: 8 }}>Proyección:</span>
                            {['', ...Object.keys(ALERTA_CFG)].map(k => {
                                const active = filtroAlerta === k;
                                const cfg = ALERTA_CFG[k] || { label: 'Todos', color: '#64748b' };
                                return (
                                    <button key={k} onClick={() => { setFiltroAlerta(k); setExpandida(null); }}
                                        style={{
                                            padding: '3px 10px', borderRadius: 20, fontSize: 11,
                                            fontWeight: active ? 700 : 400,
                                            border: active ? `2px solid ${cfg.color}` : '1px solid #e2e8f0',
                                            background: active ? cfg.color + '15' : '#fff',
                                            color: active ? cfg.color : '#64748b',
                                            cursor: 'pointer',
                                        }}>
                                        {k === '' ? 'Todos' : cfg.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Tabla */}
                    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 32, background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }} />
                                        <SortTh col="numero_contrato">N° Contrato</SortTh>
                                        <SortTh col="nombre_contrato">Nombre</SortTh>
                                        <SortTh col="estado_contrato">Estado</SortTh>
                                        <SortTh col="monto_contrato" align="right">Monto</SortTh>
                                        <SortTh col="monto_ejecutado" align="right">Ejecutado</SortTh>
                                        <SortTh col="monto_por_ejecutar" align="right">Por Ejecutar</SortTh>
                                        <SortTh col="suma_bruto_oc" align="right">OC Sistema</SortTh>
                                        <SortTh col="reconciliacion">Reconcil.</SortTh>
                                        <SortTh col="alerta">Proyección</SortTh>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map((r, i) => (
                                        <React.Fragment key={r.numero_contrato}>
                                            <tr
                                                onClick={() => setExpandida(expandida === i ? null : i)}
                                                style={{
                                                    borderBottom: '1px solid #f1f5f9',
                                                    background: expandida === i ? '#faf5ff' : i % 2 === 0 ? '#fff' : '#fafafa',
                                                    cursor: 'pointer',
                                                }}>
                                                <td style={{ padding: '8px 10px', textAlign: 'center', color: '#7c3aed', fontSize: 13 }}>
                                                    {expandida === i ? '▾' : '▸'}
                                                </td>
                                                <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>{r.numero_contrato}</td>
                                                <td style={{ padding: '8px 10px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151' }} title={r.nombre_contrato}>{r.nombre_contrato}</td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <span style={{
                                                        padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                                        background: r.estado_contrato?.startsWith('En ejecución') ? '#f0fdf4' : r.estado_contrato === 'Ampliado' ? '#fffbeb' : '#f3f4f6',
                                                        color: r.estado_contrato?.startsWith('En ejecución') ? '#15803d' : r.estado_contrato === 'Ampliado' ? '#92400e' : '#6b7280',
                                                    }}>
                                                        {r.estado_contrato}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmt(r.monto_contrato)}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(r.monto_ejecutado)}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right', color: r.monto_por_ejecutar == null ? '#9ca3af' : '#374151' }}>
                                                    {r.monto_por_ejecutar != null ? fmt(r.monto_por_ejecutar) : 'N/D'}
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right', color: r.suma_bruto_oc == null ? '#9ca3af' : '#374151' }}>
                                                    {r.suma_bruto_oc != null ? fmt(r.suma_bruto_oc) : '—'}
                                                </td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    {(() => {
                                                        const cfg = RECONCILIACION_CFG[r.reconciliacion] || RECONCILIACION_CFG.sin_datos;
                                                        return (
                                                            <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                                {cfg.label}
                                                            </span>
                                                        );
                                                    })()}
                                                </td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    {r.meses_hasta_agotamiento != null ? (
                                                        <span style={{ color: ALERTA_CFG[r.alerta]?.color, fontWeight: 600, fontSize: 12 }}>
                                                            {ALERTA_CFG[r.alerta]?.label}
                                                            <span style={{ fontWeight: 400, fontSize: 11, color: '#64748b', marginLeft: 4 }}>{r.meses_hasta_agotamiento}m</span>
                                                        </span>
                                                    ) : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}
                                                </td>
                                            </tr>
                                            {expandida === i && (
                                                <FilaExpandida idLic={r.id_licitacion_oc} contratoData={r} />
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
