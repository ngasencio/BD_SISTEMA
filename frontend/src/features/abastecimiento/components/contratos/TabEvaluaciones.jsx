import React, { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import { getContratosEvaluaciones } from '../../api/contratosApi';
import { exportarEvaluaciones } from './exportUtils';

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

// ── Tooltip informativo ────────────────────────────────────────────────────────
function InfoTooltip({ text }) {
    const [show, setShow] = useState(false);
    return (
        <span
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
        >
            <span style={{ cursor: 'help', color: '#94a3b8', fontSize: 13, marginLeft: 5, lineHeight: 1 }}>ⓘ</span>
            {show && (
                <span style={{
                    position: 'absolute', bottom: '130%', left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#1e293b', color: '#f8fafc',
                    fontSize: 11.5, padding: '9px 14px', borderRadius: 8,
                    whiteSpace: 'pre-wrap',
                    minWidth: 220, maxWidth: 320,
                    width: 'max-content',
                    textAlign: 'left', zIndex: 200, lineHeight: 1.7,
                    boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
                    pointerEvents: 'none',
                }}>
                    {text}
                </span>
            )}
        </span>
    );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = '#7c3aed', tooltip }) {
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '16px 20px',
            border: '1px solid #e2e8f0', flex: '1 1 150px', minWidth: 145,
            borderTop: `4px solid ${color}`,
            boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 1px 4px rgba(15,23,42,.03)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: '#64748b', marginBottom: 5 }}>
                {label}
                {tooltip && <InfoTooltip text={tooltip} />}
            </div>
            <div style={{ fontSize: 21, fontWeight: 700, color: '#1e293b' }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
        </div>
    );
}

// ── Badge estado ──────────────────────────────────────────────────────────────
function Badge({ label, color }) {
    return (
        <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 20,
            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
            background: color + '20', color, border: `1px solid ${color}50`,
        }}>
            {label}
        </span>
    );
}

// ── SortTh ────────────────────────────────────────────────────────────────────
function SortTh({ col, label, sort, onToggle, align = 'left' }) {
    const active = sort.col === col;
    return (
        <th onClick={() => onToggle(col)}
            style={{
                padding: '9px 10px', textAlign: align, fontWeight: 600,
                color: active ? '#7c3aed' : '#475569',
                borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap',
                background: '#f8fafc', fontSize: 12,
                cursor: 'pointer', userSelect: 'none',
            }}>
            {label}
            <span style={{ opacity: active ? 1 : 0.35, marginLeft: 3 }}>
                {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
            </span>
        </th>
    );
}

export function TabEvaluaciones() {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [tabInner, setTabInner] = useState('anio');
    const [sort, setSort]       = useState({ col: 'monto_contrato', dir: 'desc' });
    const [busqueda, setBusqueda] = useState('');

    useEffect(() => {
        getContratosEvaluaciones()
            .then(r => setData(r.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
            Cargando evaluaciones...
        </div>
    );
    if (!data) return (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
            Error al cargar datos.
        </div>
    );

    const { kpis, por_anio, por_estado_terminado, detalle_pendientes } = data;

    const toggleSort = (col) =>
        setSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));

    const pctEvaluado = kpis.total_terminados > 0
        ? (kpis.evaluados / kpis.total_terminados) * 100
        : 0;

    // ── Detalle filtrado y ordenado ──
    const detalleFiltrado = detalle_pendientes.filter(r =>
        !busqueda ||
        r.nombre_contrato.toLowerCase().includes(busqueda.toLowerCase()) ||
        r.numero_contrato.toLowerCase().includes(busqueda.toLowerCase())
    );
    const detalleOrdenado = [...detalleFiltrado].sort((a, b) => {
        const mul = sort.dir === 'asc' ? 1 : -1;
        if (sort.col === 'monto_contrato' || sort.col === 'anio')
            return mul * ((a[sort.col] ?? 0) - (b[sort.col] ?? 0));
        return mul * String(a[sort.col] ?? '').localeCompare(String(b[sort.col] ?? ''));
    });

    // ── Datos para Chart.js ──
    const aniosOrdenados = [...por_anio].sort((a, b) => (a.anio ?? 0) - (b.anio ?? 0));
    const chartData = {
        labels: aniosOrdenados.map(r => r.anio || '—'),
        datasets: [
            {
                label: 'Evaluados',
                data: aniosOrdenados.map(r => r.evaluados),
                backgroundColor: 'rgba(22,163,74,0.75)',
                borderColor: '#16a34a',
                borderWidth: 1,
                borderRadius: 4,
            },
            {
                label: 'Pendientes',
                data: aniosOrdenados.map(r => r.pendientes),
                backgroundColor: 'rgba(220,38,38,0.65)',
                borderColor: '#dc2626',
                borderWidth: 1,
                borderRadius: 4,
            },
        ],
    };
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top', labels: { font: { size: 11 }, padding: 10, boxWidth: 12 } },
            tooltip: {
                callbacks: {
                    label: ctx => ` ${ctx.dataset.label}: ${fmtN(ctx.parsed.y)}`,
                    afterBody: (items) => {
                        const idx = items[0]?.dataIndex;
                        const row = aniosOrdenados[idx];
                        if (!row) return [];
                        const total = row.total || 1;
                        const pctPend = ((row.pendientes / total) * 100).toFixed(1);
                        return [`Monto total: ${fmt(row.monto)}`, `% pendiente: ${pctPend}%`];
                    },
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: {
                grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: { font: { size: 11 }, callback: v => fmtN(v) },
            },
        },
    };

    const cardStyle = {
        background: '#fff', borderRadius: 10,
        border: '1px solid #e2e8f0', padding: '18px 20px',
        boxShadow: '0 1px 2px rgba(15,23,42,.04)',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* ── Fila 1: KPIs ── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <KpiCard
                    label="Contratos Terminados"
                    value={fmtN(kpis.total_terminados)}
                    sub="total en estado terminado"
                    color="#64748b"
                    tooltip="Total de contratos cuyo estado en Mercado Público indica que han finalizado su ejecución."
                />
                <KpiCard
                    label="Evaluados"
                    value={fmtN(kpis.evaluados)}
                    sub={`${kpis.total_terminados > 0 ? ((kpis.evaluados / kpis.total_terminados) * 100).toFixed(1) : 0}% de terminados`}
                    color="#16a34a"
                    tooltip="Contratos terminados que tienen una nota numérica de evaluación registrada en el portal de Mercado Público."
                />
                <KpiCard
                    label="Pendientes de Evaluación"
                    value={fmtN(kpis.pendientes)}
                    sub={`${kpis.pct_pendiente}% sin evaluar`}
                    color="#dc2626"
                    tooltip='Contratos terminados con evaluación en "--" o "Evaluación Pendiente". Requieren acción en el portal MP.'
                />
            </div>

            {/* ── Fila 2: Barra de cobertura + Nota Promedio ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'stretch' }}>
                <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                            Cobertura de Evaluación
                        </span>
                        <InfoTooltip text={`Calculado como: (contratos evaluados / total terminados) × 100.\nUn contrato se considera evaluado si tiene una nota numérica en el campo "evaluación" de Mercado Público.`} />
                    </div>
                    <div style={{ background: '#e2e8f0', borderRadius: 8, height: 22, position: 'relative' }}>
                        <div style={{
                            width: `${pctEvaluado}%`,
                            background: pctEvaluado < 20
                                ? 'linear-gradient(90deg,#dc2626,#ef4444)'
                                : pctEvaluado < 60
                                    ? 'linear-gradient(90deg,#d97706,#f59e0b)'
                                    : 'linear-gradient(90deg,#16a34a,#4ade80)',
                            height: '100%', borderRadius: 8, transition: 'width 0.6s ease',
                            minWidth: pctEvaluado > 0 ? 4 : 0,
                        }} />
                        {/* Texto: dentro si hay espacio, fuera (derecha del relleno) si es muy pequeño */}
                        {pctEvaluado >= 15 ? (
                            <span style={{
                                position: 'absolute', left: '50%', top: '50%',
                                transform: 'translate(-50%,-50%)',
                                fontSize: 11, fontWeight: 700,
                                color: pctEvaluado < 20 ? '#fff' : pctEvaluado < 60 ? '#fff' : '#fff',
                                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                                whiteSpace: 'nowrap',
                            }}>
                                {pctEvaluado.toFixed(1)}% evaluado
                            </span>
                        ) : (
                            <span style={{
                                position: 'absolute',
                                left: `calc(${pctEvaluado}% + 8px)`, top: '50%',
                                transform: 'translateY(-50%)',
                                fontSize: 11, fontWeight: 700, color: '#374151',
                                whiteSpace: 'nowrap',
                            }}>
                                {pctEvaluado.toFixed(1)}% evaluado
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#6b7280' }}>
                        <span>✅ Evaluados: <strong>{fmtN(kpis.evaluados)}</strong></span>
                        <span>⚠️ Pendientes: <strong style={{ color: '#dc2626' }}>{fmtN(kpis.pendientes)}</strong></span>
                        <span>Total: <strong>{fmtN(kpis.total_terminados)}</strong></span>
                    </div>
                </div>

                {/* Nota Promedio */}
                <div style={{
                    ...cardStyle,
                    minWidth: 150, textAlign: 'center', display: 'flex',
                    flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                    borderTop: '4px solid #7c3aed',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                        Nota Promedio
                        <InfoTooltip text="Promedio de las notas numéricas registradas en contratos evaluados. Solo considera contratos con nota 1–7 en MP." />
                    </div>
                    <div style={{ fontSize: 36, fontWeight: 800, color: '#7c3aed', lineHeight: 1 }}>
                        {kpis.nota_promedio ?? '—'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                        de {fmtN(kpis.evaluados)} evaluados
                    </div>
                    <div style={{
                        marginTop: 8, background: '#ede9fe', borderRadius: 6,
                        padding: '3px 10px', fontSize: 11, color: '#6d28d9', fontWeight: 600,
                    }}>
                        {kpis.nota_promedio >= 6 ? 'Excelente' :
                         kpis.nota_promedio >= 5 ? 'Bueno' :
                         kpis.nota_promedio >= 4 ? 'Regular' :
                         kpis.nota_promedio ? 'Bajo' : 'Sin datos'}
                    </div>
                </div>
            </div>

            {/* ── Sub-tabs ── */}
            <div>
                <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 0 }}>
                    {[
                        { id: 'anio',    label: 'Por Año' },
                        { id: 'estado',  label: 'Por Estado' },
                        { id: 'detalle', label: `Detalle Pendientes (${fmtN(kpis.pendientes)})` },
                    ].map(t => (
                        <button key={t.id}
                            onClick={() => setTabInner(t.id)}
                            style={{
                                padding: '10px 18px', background: 'none', border: 'none',
                                cursor: 'pointer', fontSize: 12, fontWeight: tabInner === t.id ? 700 : 400,
                                color: tabInner === t.id ? '#7c3aed' : '#64748b',
                                borderBottom: tabInner === t.id ? '2px solid #7c3aed' : '2px solid transparent',
                                marginBottom: -2, transition: 'color 0.15s',
                            }}>
                            {t.label}
                        </button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => exportarEvaluaciones(data)} style={{
                        padding: '6px 14px', background: '#f0fdf4',
                        border: '1px solid #86efac', borderRadius: 6,
                        fontSize: 12, color: '#15803d', cursor: 'pointer',
                        fontWeight: 600, alignSelf: 'center', marginRight: 4,
                    }}>
                        📥 Excel
                    </button>
                </div>

                {/* ── Por Año: tabla + gráfico ── */}
                {tabInner === 'anio' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                        <div style={cardStyle}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                                Tabla por Año
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr>
                                            {['Año', 'Terminados', 'Evaluados', 'Pendientes', '% Pend.', 'Monto'].map(h => (
                                                <th key={h} style={{
                                                    padding: '9px 10px', textAlign: h === 'Monto' ? 'right' : 'left',
                                                    fontWeight: 600, color: '#475569',
                                                    borderBottom: '2px solid #e2e8f0',
                                                    background: '#f8fafc', whiteSpace: 'nowrap',
                                                }}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...por_anio].sort((a, b) => (b.anio ?? 0) - (a.anio ?? 0)).map((r, i) => {
                                            const pctP = r.total > 0 ? ((r.pendientes / r.total) * 100).toFixed(1) : '—';
                                            return (
                                                <tr key={r.anio} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                    <td style={{ padding: '7px 10px', fontWeight: 700, color: '#374151' }}>{r.anio || '—'}</td>
                                                    <td style={{ padding: '7px 10px' }}>{fmtN(r.total)}</td>
                                                    <td style={{ padding: '7px 10px' }}>
                                                        <span style={{ color: '#16a34a', fontWeight: 600 }}>{fmtN(r.evaluados)}</span>
                                                    </td>
                                                    <td style={{ padding: '7px 10px' }}>
                                                        <span style={{ color: r.pendientes > 0 ? '#dc2626' : '#94a3b8', fontWeight: 600 }}>
                                                            {fmtN(r.pendientes)}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '7px 10px', color: '#64748b' }}>{pctP}%</td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151', fontWeight: 500 }}>{fmt(r.monto)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div style={cardStyle}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                                Distribución por Año
                            </div>
                            <div style={{ height: 260 }}>
                                <Bar data={chartData} options={chartOptions} />
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Por Estado ── */}
                {tabInner === 'estado' && (
                    <div style={{ ...cardStyle, marginTop: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                            Pendientes de Evaluación por Estado del Contrato
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr>
                                        {['Estado del Contrato', 'Pendientes', 'Monto Total'].map(h => (
                                            <th key={h} style={{
                                                padding: '9px 10px', textAlign: 'left', fontWeight: 600,
                                                color: '#475569', borderBottom: '2px solid #e2e8f0',
                                                background: '#f8fafc', whiteSpace: 'nowrap',
                                            }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {por_estado_terminado.map((r, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                            <td style={{ padding: '8px 10px', color: '#374151' }}>{r.estado}</td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <Badge
                                                    label={fmtN(r.pendientes)}
                                                    color={r.pendientes > 0 ? '#dc2626' : '#94a3b8'}
                                                />
                                            </td>
                                            <td style={{ padding: '8px 10px', fontWeight: 600, color: '#374151' }}>{fmt(r.monto)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── Detalle Pendientes ── */}
                {tabInner === 'detalle' && (
                    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <input
                                type="text" value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                                placeholder="Buscar por N° contrato o nombre..."
                                style={{
                                    flex: 1, padding: '8px 12px',
                                    border: '1px solid #d1d5db', borderRadius: 8,
                                    fontSize: 13, outline: 'none',
                                }}
                            />
                            <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                                {fmtN(detalleOrdenado.length)} contratos
                            </span>
                        </div>
                        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr>
                                            <SortTh col="numero_contrato"  label="N° Contrato"    sort={sort} onToggle={toggleSort} />
                                            <SortTh col="nombre_contrato"  label="Nombre"          sort={sort} onToggle={toggleSort} />
                                            <SortTh col="estado_contrato"  label="Estado"          sort={sort} onToggle={toggleSort} />
                                            <SortTh col="unidad_requirente" label="Unidad"         sort={sort} onToggle={toggleSort} />
                                            <SortTh col="monto_contrato"   label="Monto"           sort={sort} onToggle={toggleSort} align="right" />
                                            <SortTh col="anio"             label="Año"             sort={sort} onToggle={toggleSort} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detalleOrdenado.map((r, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
                                                    {r.numero_contrato}
                                                </td>
                                                <td style={{ padding: '8px 10px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151' }} title={r.nombre_contrato}>
                                                    {r.nombre_contrato}
                                                </td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <Badge label={r.estado_contrato} color="#dc2626" />
                                                </td>
                                                <td style={{ padding: '8px 10px', color: '#64748b', fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.unidad_requirente}>
                                                    {r.unidad_requirente || '—'}
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>
                                                    {fmt(r.monto_contrato)}
                                                </td>
                                                <td style={{ padding: '8px 10px', color: '#64748b' }}>{r.anio ?? '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Notas y Pasos a Seguir ── */}
            <div style={{
                background: '#faf5ff', border: '1px solid #c4b5fd',
                borderRadius: 10, padding: '18px 22px',
                boxShadow: '0 1px 2px rgba(124,58,237,.06)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span style={{ fontSize: 18 }}>📋</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#5b21b6' }}>
                        Notas y Pasos a Seguir
                    </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#6d28d9', marginBottom: 8 }}>
                            ¿Por qué evaluar los contratos terminados?
                        </div>
                        <ul style={{ fontSize: 12, color: '#4c1d95', lineHeight: 1.9, paddingLeft: 16, margin: 0 }}>
                            <li>La Resolución 188/2026 exige evaluación de proveedores en contratos &gt; 1.000 UTM.</li>
                            <li>La evaluación afecta el historial del proveedor en Mercado Público.</li>
                            <li>Contratos sin evaluar pueden generar observaciones en auditorías de la CGR.</li>
                            <li>El plazo reglamentario es de 30 días hábiles desde el término del contrato.</li>
                        </ul>
                    </div>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#6d28d9', marginBottom: 8 }}>
                            Pasos para evaluar un contrato en Mercado Público
                        </div>
                        <ol style={{ fontSize: 12, color: '#4c1d95', lineHeight: 1.9, paddingLeft: 16, margin: 0 }}>
                            <li>Ingresar a <strong>mercadopublico.cl</strong> con tu usuario institucional.</li>
                            <li>Ir a <em>Mis Contratos → Contratos Terminados</em>.</li>
                            <li>Buscar el contrato por N° y hacer clic en <em>"Evaluar proveedor"</em>.</li>
                            <li>Completar los criterios de cumplimiento (notas 1 a 7).</li>
                            <li>Guardar y verificar que el estado cambie a <em>"Evaluado"</em>.</li>
                        </ol>
                    </div>
                </div>
                <div style={{
                    marginTop: 14, padding: '10px 14px',
                    background: '#ede9fe', borderRadius: 8,
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5b21b6',
                }}>
                    <span style={{ fontSize: 16 }}>💡</span>
                    <span>
                        <strong>{fmtN(kpis.pendientes)}</strong> contratos pendientes representan aproximadamente{' '}
                        <strong>{kpis.pct_pendiente}%</strong> del total de terminados. Priorizar por mayor monto
                        usando la tabla <em>"Detalle Pendientes"</em>.
                    </span>
                </div>
            </div>

        </div>
    );
}
