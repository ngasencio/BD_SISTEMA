import React, { useState, useEffect, useCallback } from 'react';
import { getContratosPlazos } from '../../api/contratosApi';
import { exportarPlazos } from './exportUtils';

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

const ALERTA_CFG = {
    critico:  { label: '🔴 Crítico',   bg: '#fef2f2', color: '#dc2626', desc: '≤ 90 días' },
    urgente:  { label: '🟠 Urgente',   bg: '#fff7ed', color: '#ea580c', desc: '91–180 días' },
    atencion: { label: '🟡 Atención',  bg: '#fffbeb', color: '#b45309', desc: '181–365 días' },
    ok:       { label: '🟢 OK',        bg: '#f0fdf4', color: '#15803d', desc: '> 365 días' },
};

export function TabPlazos({ filtros }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sort, setSort] = useState({ col: 'dias_restantes', dir: 'asc' });
    const [busqueda, setBusqueda] = useState('');
    const [expandida, setExpandida] = useState(null);

    const cargar = useCallback(() => {
        setLoading(true);
        getContratosPlazos(filtros)
            .then(r => setData(r.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [JSON.stringify(filtros)]);

    useEffect(() => { cargar(); }, [cargar]);

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⏳ Cargando plazos...</div>;
    if (!data) return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⚠️ Error al cargar datos.</div>;

    const { activos, kpis } = data;

    const toggleSort = (col) => setSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
    const arrow = (col) => sort.col === col ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '';

    const filtrado = activos.filter(r =>
        !busqueda ||
        r.nombre_contrato.toLowerCase().includes(busqueda.toLowerCase()) ||
        r.numero_contrato.toLowerCase().includes(busqueda.toLowerCase())
    );

    const sorted = [...filtrado].sort((a, b) => {
        const mul = sort.dir === 'asc' ? 1 : -1;
        if (['dias_restantes', 'dias_vigencia', 'monto_contrato', 'pct_ejecutado_tiempo'].includes(sort.col))
            return mul * ((a[sort.col] ?? 0) - (b[sort.col] ?? 0));
        return mul * String(a[sort.col] ?? '').localeCompare(String(b[sort.col] ?? ''));
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* KPIs */}
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
                <div className="kpi-card" style={{ borderTop: '3px solid #6b7280' }}>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>Total Activos</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtN(kpis.total_activos)}</div>
                </div>
                {Object.entries(ALERTA_CFG).map(([key, cfg]) => (
                    <div key={key} className="kpi-card" style={{ borderTop: `3px solid ${cfg.color}` }}>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{cfg.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: cfg.color }}>{fmtN(kpis[key] || 0)}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{cfg.desc}</div>
                    </div>
                ))}
            </div>

            {/* Barra resumen alertas */}
            <div className="card">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
                    Distribución de alertas de vigencia
                </div>
                <div style={{ display: 'flex', height: 24, borderRadius: 8, overflow: 'hidden', gap: 1 }}>
                    {Object.entries(ALERTA_CFG).map(([key, cfg]) => {
                        const n = kpis[key] || 0;
                        const pct = kpis.total_activos > 0 ? (n / kpis.total_activos) * 100 : 0;
                        return pct > 0 ? (
                            <div key={key} title={`${cfg.label}: ${n} (${pct.toFixed(1)}%)`}
                                style={{ width: `${pct}%`, background: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 600, transition: 'width 0.4s' }}>
                                {pct > 8 ? `${pct.toFixed(0)}%` : ''}
                            </div>
                        ) : null;
                    })}
                </div>
            </div>

            {/* Controles */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input
                    type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar contrato..."
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
                />
                <button onClick={() => exportarPlazos(data)}
                    style={{ padding: '7px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#15803d', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    📥 Excel
                </button>
                <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{sorted.length} contratos</span>
            </div>

            {/* Tabla */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f9fafb' }}>
                                <th style={{ width: 32 }} />
                                {[
                                    { col: 'numero_contrato', label: 'N° Contrato' },
                                    { col: 'nombre_contrato', label: 'Nombre' },
                                    { col: 'estado_contrato', label: 'Estado' },
                                    { col: 'dias_restantes', label: 'Días Restantes' },
                                    { col: 'dias_vigencia', label: 'Días Vigencia' },
                                    { col: 'pct_ejecutado_tiempo', label: '% Tiempo' },
                                    { col: 'monto_contrato', label: 'Monto' },
                                    { col: 'alerta_tiempo', label: 'Alerta' },
                                ].map(({ col, label }) => (
                                    <th key={col} onClick={() => toggleSort(col)}
                                        style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                                        {label}{arrow(col)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((r, i) => {
                                const cfg = ALERTA_CFG[r.alerta_tiempo] || ALERTA_CFG.ok;
                                return (
                                    <React.Fragment key={r.numero_contrato}>
                                        <tr
                                            style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: expandida === i ? '#f9fafb' : 'transparent' }}
                                            onClick={() => setExpandida(expandida === i ? null : i)}
                                        >
                                            <td style={{ padding: '8px 10px', textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
                                                {r.proyectos?.length > 0 ? (expandida === i ? '▾' : '▸') : ''}
                                            </td>
                                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12 }}>{r.numero_contrato}</td>
                                            <td style={{ padding: '8px 10px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.nombre_contrato}>{r.nombre_contrato}</td>
                                            <td style={{ padding: '8px 10px', fontSize: 12, color: '#6b7280' }}>{r.estado_contrato}</td>
                                            <td style={{ padding: '8px 10px', fontWeight: 700, color: cfg.color }}>{fmtN(r.dias_restantes)}</td>
                                            <td style={{ padding: '8px 10px', color: '#6b7280' }}>{fmtN(r.dias_vigencia)}</td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <div style={{ background: '#f3f4f6', borderRadius: 3, height: 8, width: 80 }}>
                                                    <div style={{ width: `${r.pct_ejecutado_tiempo}%`, background: '#7c3aed', height: '100%', borderRadius: 3, transition: 'width 0.3s' }} />
                                                </div>
                                                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{r.pct_ejecutado_tiempo}%</div>
                                            </td>
                                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmt(r.monto_contrato)}</td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                                                    {cfg.label}
                                                </span>
                                            </td>
                                        </tr>
                                        {expandida === i && r.proyectos?.length > 0 && (
                                            <tr>
                                                <td colSpan={9} style={{ background: '#f9fafb', padding: '8px 16px 12px 40px', borderBottom: '1px solid #e5e7eb' }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>ID Proyectos PAC asociados:</div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                        {r.proyectos.map(p => (
                                                            <div key={p.ID_Proyecto} style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                                                                <span style={{ fontWeight: 600, color: '#6d28d9' }}>{p.ID_Proyecto}</span>
                                                                {p.Nombre_Proyecto && <span style={{ color: '#7c3aed' }}> — {p.Nombre_Proyecto}</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
                                                        Inicio: {r.fecha_inicio || '—'} · Término: {r.fecha_termino || '—'}
                                                        {r.fecha_inicio?.includes('-00-') && <span> (fechas con mes no disponible)</span>}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
