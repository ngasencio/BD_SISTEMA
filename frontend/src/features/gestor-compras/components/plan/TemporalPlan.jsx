import React, { useMemo, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { fmtN, colorPct } from '../../../pac-cumplimiento/utils/format';
import { fmtCLP } from '../solicitudes/shared';

ChartJS.register(ArcElement, Tooltip, Legend);

const cardStyle = { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };
const PAGE = 15;

const ESTADOS = {
    EN_FECHA: { label: 'En fecha', color: '#16a34a', bg: '#dcfce7' },
    ATRASADO: { label: 'Atrasado', color: '#dc2626', bg: '#fee2e2' },
    PENDIENTE: { label: 'Pendiente', color: '#d97706', bg: '#fffbeb' },
    SIN_PLANIFICACION_CON_FECHA: { label: 'Sin planificación', color: '#64748b', bg: '#f1f5f9' },
};

function Kpi({ label, value, sub, color }) {
    return (
        <div style={{ background: '#fff', borderRadius: 10, padding: '14px 18px', border: '1px solid #e2e8f0', flex: '1 1 150px', minWidth: 140, borderTop: `4px solid ${color}`, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
        </div>
    );
}

function Chip({ estado }) {
    const e = ESTADOS[estado] || ESTADOS.SIN_PLANIFICACION_CON_FECHA;
    return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 12, background: e.bg, color: e.color, whiteSpace: 'nowrap' }}>{e.label}</span>;
}

function BotonVer({ onClick }) {
    return <button type="button" className="gc-btn-ver" onClick={onClick} title="Ver todos los datos del proyecto">👁 Ver</button>;
}

function TablaPaginada({ titulo, subtitulo, columnas, filas, vacio, filaKey }) {
    const [pagina, setPagina] = useState(1);
    const totalPaginas = Math.max(1, Math.ceil(filas.length / PAGE));
    const actual = Math.min(pagina, totalPaginas);
    const visibles = filas.slice((actual - 1) * PAGE, actual * PAGE);

    return (
        <div style={cardStyle}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{titulo}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{subtitulo}</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {columnas.map((c) => (
                                <th key={c.titulo} style={{ padding: '8px 10px', textAlign: c.derecha ? 'right' : 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>{c.titulo}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filas.length === 0 ? (
                            <tr><td colSpan={columnas.length} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>{vacio}</td></tr>
                        ) : visibles.map((f) => (
                            <tr key={filaKey(f)} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                {columnas.map((c) => (
                                    <td key={c.titulo} style={{ padding: '7px 10px', textAlign: c.derecha ? 'right' : 'left' }}>{c.render(f)}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {filas.length > PAGE && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#64748b' }}>
                    <span>{fmtN(filas.length)} registro(s)</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="page-btn" disabled={actual <= 1} onClick={() => setPagina(actual - 1)}>‹ Anterior</button>
                        <span>Página {actual} de {totalPaginas}</span>
                        <button className="page-btn" disabled={actual >= totalPaginas} onClick={() => setPagina(actual + 1)}>Siguiente ›</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// Cumplimiento temporal del PAC del departamento: cruza sus formularios Dentro PAC contra las
// fechas de compra planificadas (tolerancia: mes calendario) y lista los proyectos planificados
// que aún no se inician. Mismo cálculo que la pestaña de /pac-cumplimiento, acotado al departamento.
export default function TemporalPlan({ data, onVerFicha }) {
    const kpis = data?.kpis;

    const donutData = useMemo(() => {
        if (!kpis?.total_evaluado && !kpis?.sin_planificacion_con_fecha) return null;
        const claves = [['EN_FECHA', kpis.en_fecha], ['ATRASADO', kpis.atrasado], ['PENDIENTE', kpis.pendiente], ['SIN_PLANIFICACION_CON_FECHA', kpis.sin_planificacion_con_fecha]];
        return {
            labels: claves.map(([k]) => ESTADOS[k].label),
            datasets: [{ data: claves.map(([, v]) => v), backgroundColor: claves.map(([k]) => ESTADOS[k].color), borderWidth: 0, hoverOffset: 6 }],
        };
    }, [kpis]);

    if (!kpis) return <div className="loading-spinner">Sin datos de cumplimiento temporal.</div>;

    const detalle = data.detalle_formularios ?? [];
    const sinIniciar = data.proyectos_sin_iniciar ?? [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Kpi label="✅ En fecha" value={fmtN(kpis.en_fecha)} color="#16a34a" sub={`${kpis.pct_en_fecha}% de lo evaluado`} />
                <Kpi label="⏰ Atrasado" value={fmtN(kpis.atrasado)} color="#dc2626" sub="derivado tarde o sin iniciar" />
                <Kpi label="⏳ Pendiente" value={fmtN(kpis.pendiente)} color="#d97706" sub="planificado a futuro" />
                <Kpi label="❓ Sin planificación" value={fmtN(kpis.sin_planificacion_con_fecha)} color="#64748b" sub="proyecto sin fecha en el plan" />
                <Kpi label="% En fecha" value={`${kpis.pct_en_fecha}%`} color={colorPct(kpis.pct_en_fecha)} sub={`${fmtN(kpis.total_evaluado)} evaluados`} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 16 }}>
                <div style={{ ...cardStyle, padding: '16px 18px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>⏱️ Distribución del cumplimiento</div>
                    <div className="chart-box" style={{ height: 230 }}>
                        {donutData ? (
                            <Doughnut data={donutData} options={{ responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { color: '#64748b', padding: 14, font: { size: 11.5 } } } } }} />
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 12 }}>Sin datos.</div>
                        )}
                    </div>
                </div>
                <div className="gc-nota" style={{ alignSelf: 'start', lineHeight: 1.7 }}>
                    <strong>Cómo se lee:</strong><br />
                    <b>En fecha</b>: el formulario se derivó en el mes planificado o antes.<br />
                    <b>Atrasado</b>: se derivó después del mes planificado, o el mes pasó y el proyecto no se ha iniciado.<br />
                    <b>Pendiente</b>: planificado para el mes actual o futuro, aún sin formulario.<br />
                    <b>Sin planificación</b>: el formulario declara un proyecto PAC que no tiene fecha de compra cargada en el plan.
                </div>
            </div>

            <TablaPaginada
                titulo="🗓️ Proyectos planificados sin iniciar"
                subtitulo="Proyectos de su departamento con fecha de compra planificada y ningún formulario Dentro PAC derivado todavía."
                filas={sinIniciar}
                vacio="No hay proyectos planificados pendientes de iniciar."
                filaKey={(f) => f.id_proyecto}
                columnas={[
                    { titulo: 'ID Proyecto', render: (f) => <button type="button" onClick={() => onVerFicha(f.id_proyecto)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 600, color: '#0369a1' }}>{f.id_proyecto}</button> },
                    { titulo: 'Fecha de compra planificada', render: (f) => f.fecha_inicio_compra },
                    { titulo: 'Estado', render: (f) => <Chip estado={f.estado} /> },
                    { titulo: '', render: (f) => <BotonVer onClick={() => onVerFicha(f.id_proyecto)} /> },
                ]}
            />

            <TablaPaginada
                titulo="📋 Formularios evaluados"
                subtitulo="Formularios Dentro PAC de su departamento y su cercanía a la fecha planificada del proyecto."
                filas={detalle}
                vacio="No hay formularios Dentro PAC evaluados en el período."
                filaKey={(f) => f.id}
                columnas={[
                    { titulo: 'Folio', render: (f) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#7c3aed' }}>#{f.folio}</span> },
                    { titulo: 'Proyecto PAC', render: (f) => <button type="button" onClick={() => onVerFicha(f.id_plan)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'monospace', color: '#0369a1' }}>{f.id_plan}</button> },
                    { titulo: 'Derivado', render: (f) => f.fecha_derivado },
                    { titulo: 'Fecha planificada', render: (f) => f.fecha_evento_mas_cercano || '—' },
                    { titulo: 'Monto', derecha: true, render: (f) => fmtCLP(f.monto_estimado) },
                    { titulo: 'Estado', render: (f) => <Chip estado={f.estado} /> },
                    { titulo: '', render: (f) => <BotonVer onClick={() => onVerFicha(f.id_plan)} /> },
                ]}
            />
        </div>
    );
}
