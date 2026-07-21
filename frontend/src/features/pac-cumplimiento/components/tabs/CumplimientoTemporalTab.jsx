import { useMemo, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtB = (n) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return fmt(n);
};
const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

const cardStyle = { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };

const ESTADO_CFG = {
    EN_FECHA: { label: '✅ En fecha', color: '#16a34a', bg: '#f0fdf4' },
    ATRASADO: { label: '⏰ Atrasado', color: '#dc2626', bg: '#fef2f2' },
    PENDIENTE: { label: '⏳ Pendiente', color: '#f59e0b', bg: '#fffbeb' },
    SIN_PLANIFICACION_CON_FECHA: { label: '❓ Sin planificación con fecha', color: '#6b7280', bg: '#f8fafc' },
};

function KpiCard({ label, value, sub, color }) {
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '14px 18px',
            border: '1px solid #e2e8f0', flex: '1 1 170px', minWidth: 150,
            borderTop: `4px solid ${color}`, boxShadow: '0 1px 2px rgba(15,23,42,.04)',
        }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
        </div>
    );
}

export default function CumplimientoTemporalTab({ temporal }) {
    const [filtroEstado, setFiltroEstado] = useState('');
    const [busqueda, setBusqueda] = useState('');

    const kpis = temporal?.kpis;
    const detalle = temporal?.detalle_formularios ?? [];
    const proyectosSinIniciar = temporal?.proyectos_sin_iniciar ?? [];

    const donutData = useMemo(() => {
        if (!kpis || !kpis.total_evaluado) return null;
        return {
            labels: ['En fecha', 'Atrasado', 'Pendiente', 'Sin planificación con fecha'],
            datasets: [{
                data: [kpis.en_fecha, kpis.atrasado, kpis.pendiente, kpis.sin_planificacion_con_fecha],
                backgroundColor: ['#16a34a', '#dc2626', '#f59e0b', '#9ca3af'],
                borderWidth: 0,
                hoverOffset: 6,
            }],
        };
    }, [kpis]);

    const donutOptions = {
        cutout: '70%',
        plugins: {
            legend: { position: 'bottom', labels: { color: '#64748b', padding: 14, font: { size: 11 } } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtN(ctx.raw)}` } },
        },
    };

    const detalleFiltrado = useMemo(() => {
        return detalle.filter((d) => {
            if (filtroEstado && d.estado !== filtroEstado) return false;
            if (!busqueda) return true;
            const q = busqueda.toLowerCase();
            return String(d.folio).includes(q) || (d.unidad_requirente || '').toLowerCase().includes(q) || (d.id_plan || '').toLowerCase().includes(q);
        });
    }, [detalle, filtroEstado, busqueda]);

    if (!kpis) {
        return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Sin datos para el período seleccionado.</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <KpiCard label="✅ En fecha" value={fmtN(kpis.en_fecha)} color="#16a34a" sub={`${kpis.pct_en_fecha}% del total evaluado`} />
                <KpiCard label="⏰ Atrasado" value={fmtN(kpis.atrasado)} color="#dc2626" />
                <KpiCard label="⏳ Pendiente" value={fmtN(kpis.pendiente)} color="#f59e0b" sub="planificado, aún no vence" />
                <KpiCard label="❓ Sin planificación con fecha" value={fmtN(kpis.sin_planificacion_con_fecha)} color="#6b7280" sub="Dentro PAC sin fecha planificada cargada" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
                <div style={cardStyle}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>📊 Distribución de cumplimiento temporal</div>
                    <div style={{ height: 240 }}>
                        {donutData ? <Doughnut data={donutData} options={donutOptions} /> : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 12 }}>Sin datos.</div>
                        )}
                    </div>
                </div>

                <div style={cardStyle}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                        📁 Proyectos planificados sin ningún formulario Dentro PAC derivado todavía
                    </div>
                    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                        {proyectosSinIniciar.length === 0 ? (
                            <div style={{ color: '#94a3b8', fontSize: 12, padding: 12 }}>No hay proyectos planificados sin iniciar.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        {['ID Proyecto', 'Fecha planificada', 'Estado'].map((h) => (
                                            <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#f8fafc' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {proyectosSinIniciar.map((p) => {
                                        const cfg = ESTADO_CFG[p.estado];
                                        return (
                                            <tr key={p.id_proyecto} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{p.id_proyecto}</td>
                                                <td style={{ padding: '6px 10px', color: '#64748b' }}>{p.fecha_inicio_compra}</td>
                                                <td style={{ padding: '6px 10px' }}>
                                                    <span style={{ background: cfg?.bg, color: cfg?.color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>{cfg?.label ?? p.estado}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                    <input
                        value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar por folio, unidad o ID proyecto..."
                        style={{ flex: '1 1 240px', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12 }}
                    />
                    <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12 }}>
                        <option value="">Todos los estados</option>
                        {Object.entries(ESTADO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtN(detalleFiltrado.length)} formularios</span>
                </div>
                <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Folio', 'ID Proyecto', 'Unidad Requirente', 'Fecha Derivado', 'Fecha Evento Planificado', 'Monto', 'Estado'].map((h) => (
                                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#f8fafc' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {detalleFiltrado.length === 0 && (
                                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Sin resultados para los filtros aplicados.</td></tr>
                            )}
                            {detalleFiltrado.map((d) => {
                                const cfg = ESTADO_CFG[d.estado];
                                return (
                                    <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '6px 10px' }}>{d.folio}/{d.anho}</td>
                                        <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{d.id_plan}</td>
                                        <td style={{ padding: '6px 10px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.unidad_requirente}>{d.unidad_requirente}</td>
                                        <td style={{ padding: '6px 10px', color: '#64748b' }}>{d.fecha_derivado || '—'}</td>
                                        <td style={{ padding: '6px 10px', color: '#64748b' }}>{d.fecha_evento_mas_cercano || '—'}</td>
                                        <td style={{ padding: '6px 10px' }}>{fmtB(d.monto_estimado)}</td>
                                        <td style={{ padding: '6px 10px' }}>
                                            <span style={{ background: cfg?.bg, color: cfg?.color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>{cfg?.label ?? d.estado}</span>
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
