import React, { useEffect, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { getResumenComprador } from '../api/comprasApi';
import { KpiCard } from '../../abastecimiento/components/KpiCard';
import { tipoLabel, colorPorTipo } from '../constants/estadosProceso';
import VerProcesoModal from './VerProcesoModal';

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
const fmtCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const cardStyle = { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '16px 18px', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' };
const sectionTitle = { fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 2 };
const sectionSub = { fontSize: 11.5, color: '#64748b', marginBottom: 12 };
const vacio = { textAlign: 'center', padding: '28px 10px', color: '#94a3b8', fontSize: 12.5 };

const URGENCIA_INFO = {
    vencido: { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', dot: '#dc2626', label: 'Vencido' },
    alta:    { bg: '#fff7ed', border: '#fed7aa', color: '#c2410c', dot: '#ea580c', label: 'Urgente' },
    media:   { bg: '#fffbeb', border: '#fde68a', color: '#b45309', dot: '#f59e0b', label: 'Próximo' },
    baja:    { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', dot: '#16a34a', label: 'En plazo' },
};

function AlertaRow({ a, onVer }) {
    const u = URGENCIA_INFO[a.urgencia] || URGENCIA_INFO.baja;
    const texto = a.dias < 0
        ? `Cerrada hace ${Math.abs(a.dias)} día${Math.abs(a.dias) === 1 ? '' : 's'} — sin ${a.tipo_proceso === 'LICITACION' ? 'adjudicar' : 'tramitar'}`
        : a.dias === 0 ? 'Cierra hoy'
        : `Cierra en ${a.dias} día${a.dias === 1 ? '' : 's'}`;
    return (
        <div
            onClick={() => onVer(a)} role="button"
            style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                background: u.bg, border: `1px solid ${u.border}`, cursor: 'pointer',
            }}
        >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.dot, flexShrink: 0 }} />
            <div style={{ flex: '1 1 0%', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '1px 8px', borderRadius: 20, flexShrink: 0,
                        background: colorPorTipo(a.tipo_proceso) + '1f', color: colorPorTipo(a.tipo_proceso),
                    }}>
                        {tipoLabel(a.tipo_proceso)}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0%', minWidth: 0 }}>
                        {a.titulo}
                    </span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.codigo_mp} {a.estado_mp ? `· ${a.estado_mp}` : ''}
                </div>
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: u.color, whiteSpace: 'nowrap', flexShrink: 0 }}>{texto}</span>
        </div>
    );
}

function GestionRow({ f, onGestionar }) {
    return (
        <div
            onClick={() => onGestionar(f)} role="button"
            style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer',
            }}
        >
            <div style={{ flex: '1 1 0%', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace', flexShrink: 0 }}>{f.id_formulario}</span>
                    <span style={{ fontSize: 11.5, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0%', minWidth: 0 }}>{f.unidad_requirente}</span>
                </div>
                <div style={{ fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.requerimiento}</div>
            </div>
            <span style={{ fontSize: 11.5, color: '#475569', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtCLP(f.monto_estimado)}</span>
        </div>
    );
}

const BUCKET_INFO = [
    { key: 'recepcionado', label: 'Recepcionado', color: '#94a3b8' },
    { key: 'en_tramite',   label: 'En trámite',   color: '#d97706' },
    { key: 'finalizado',   label: 'Finalizado',   color: '#16a34a' },
    { key: 'rechazado',    label: 'Rechazado',    color: '#dc2626' },
];

// Panel "Resumen" al inicio de Mis Formularios — para que el comprador entre,
// vea de un vistazo sus plazos de Mercado Público (Licitación/Compra Ágil
// próximas a cerrar o ya cerradas sin tramitar) y lo que le falta clasificar,
// y decida qué atender primero — "trabajar como un reloj" en vez de descubrir
// un vencimiento abriendo formulario por formulario.
export default function ResumenComprador({ onGestionar, refreshKey }) {
    const [data, setData] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [procesoVer, setProcesoVer] = useState(null);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        getResumenComprador()
            .then(({ data: res }) => { if (activo) setData(res); })
            .catch(() => { if (activo) setData(null); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [refreshKey]);

    if (cargando) {
        return <div className="card" style={{ padding: 18, marginBottom: 16 }}><div className="loading-spinner">Cargando resumen…</div></div>;
    }
    if (!data) return null;

    const { kpis, alertas, gestion_interna, pivote } = data;

    const barData = pivote.length ? {
        labels: pivote.map(p => p.tipo_label),
        datasets: BUCKET_INFO.map(b => ({
            label: b.label, data: pivote.map(p => p[b.key]), backgroundColor: b.color, stack: 'estado', borderRadius: 4,
        })),
    } : null;
    const barOptions = {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { position: 'bottom', labels: { font: { size: 10.5 }, boxWidth: 10, padding: 8 } } },
        scales: {
            x: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, precision: 0 } },
            y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
        },
    };

    const urgenciaCount = { vencido: 0, alta: 0, media: 0, baja: 0 };
    alertas.forEach(a => { urgenciaCount[a.urgencia] = (urgenciaCount[a.urgencia] || 0) + 1; });
    const donutData = alertas.length ? {
        labels: ['Vencido', 'Urgente (≤3d)', 'Próximo (≤10d)', 'En plazo'],
        datasets: [{
            data: [urgenciaCount.vencido, urgenciaCount.alta, urgenciaCount.media, urgenciaCount.baja],
            backgroundColor: [URGENCIA_INFO.vencido.dot, URGENCIA_INFO.alta.dot, URGENCIA_INFO.media.dot, URGENCIA_INFO.baja.dot],
            borderWidth: 0,
        }],
    } : null;
    const donutOptions = {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { position: 'bottom', labels: { font: { size: 10.5 }, boxWidth: 10, padding: 8 } } },
    };

    return (
        <div style={{ marginBottom: 20, minWidth: 0, maxWidth: '100%' }}>
            <div className="kpi-grid" style={{ marginBottom: 14 }}>
                <KpiCard icon="🗂️" title="Procesos Activos" value={fmtN(kpis.procesos_activos)} colorVar="--color-primary" />
                <KpiCard icon="🔴" title="Plazos Vencidos" value={fmtN(kpis.alertas_vencidas)} colorVar="--color-danger"
                         subtitle={kpis.alertas_vencidas > 0 ? 'Requieren atención hoy' : 'Sin pendientes'} />
                <KpiCard icon="🟡" title="Por Vencer (≤10d)" value={fmtN(kpis.alertas_proximas)} colorVar="--color-warning" />
                <KpiCard icon="📋" title="Gestión Interna" value={fmtN(kpis.gestion_interna)} colorVar="--color-accent"
                         subtitle="Sin enlace a Mercado Público" />
                <KpiCard icon="✅" title="Finalizados" value={fmtN(kpis.finalizados)} colorVar="--color-success" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
                <div style={cardStyle}>
                    <div style={sectionTitle}>🔔 Notificaciones — Plazos Mercado Público</div>
                    <div style={sectionSub}>Licitaciones/Compras Ágiles enlazadas, ordenadas por urgencia. Click para ver el detalle.</div>
                    {alertas.length === 0 ? (
                        <div style={vacio}>Sin plazos pendientes por ahora — todo al día.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 280, overflowY: 'auto' }}>
                            {alertas.map(a => <AlertaRow key={a.proceso_id} a={a} onVer={() => setProcesoVer(a)} />)}
                        </div>
                    )}
                </div>

                <div style={cardStyle}>
                    <div style={sectionTitle}>📂 Proceso de Gestión — Gestión Interna</div>
                    <div style={sectionSub}>FSC abiertos aún sin enlace real a Mercado Público. Click para gestionar.</div>
                    {gestion_interna.length === 0 ? (
                        <div style={vacio}>No tienes FSC pendientes de enlazar — al día.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 280, overflowY: 'auto' }}>
                            {gestion_interna.map(f => <GestionRow key={f.id} f={f} onGestionar={onGestionar} />)}
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 14, alignItems: 'start' }}>
                <div style={cardStyle}>
                    <div style={sectionTitle}>📊 Procesos por Tipo y Estado</div>
                    <div style={sectionSub}>Pivote de tus procesos activos y finalizados.</div>
                    {!barData ? <div style={vacio}>Aún no tienes procesos creados.</div> : (
                        <>
                            <div style={{ position: 'relative', width: '100%', maxWidth: '100%', height: Math.max(110, pivote.length * 46) }}>
                                <Bar data={barData} options={barOptions} />
                            </div>
                            <div style={{ overflowX: 'auto', marginTop: 14 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            {['Tipo', 'Recep.', 'En trámite', 'Finalizado', 'Rechazado', 'Total'].map(h => (
                                                <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Tipo' ? 'left' : 'right', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pivote.map(p => (
                                            <tr key={p.tipo_proceso} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '6px 8px', fontWeight: 600, color: colorPorTipo(p.tipo_proceso) }}>{p.tipo_label}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.recepcionado}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.en_tramite}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.finalizado}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.rechazado}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{p.total}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>

                <div style={cardStyle}>
                    <div style={sectionTitle}>⏱️ Nivel de Urgencia</div>
                    <div style={sectionSub}>Distribución de tus plazos activos.</div>
                    {!donutData ? <div style={vacio}>Sin plazos activos que graficar.</div> : (
                        <div style={{ position: 'relative', width: '100%', maxWidth: 320, height: 220, margin: '0 auto' }}><Doughnut data={donutData} options={donutOptions} /></div>
                    )}
                </div>
            </div>

            {procesoVer && (
                <VerProcesoModal
                    proceso={{ id: procesoVer.proceso_id, tipo_proceso: procesoVer.tipo_proceso, titulo: procesoVer.titulo }}
                    onCerrar={() => setProcesoVer(null)}
                />
            )}
        </div>
    );
}
