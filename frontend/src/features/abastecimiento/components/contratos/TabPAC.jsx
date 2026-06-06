import React, { useState, useEffect, useCallback } from 'react';
import { getContratosPAC } from '../../api/contratosApi';
import { exportarPAC } from './exportUtils';

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

export function TabPAC({ filtros }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sort, setSort] = useState({ col: 'n_oc_total', dir: 'desc' });
    const [busqueda, setBusqueda] = useState('');
    const [expandida, setExpandida] = useState(null);

    const cargar = useCallback(() => {
        setLoading(true);
        getContratosPAC(filtros)
            .then(r => setData(r.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [JSON.stringify(filtros)]);

    useEffect(() => { cargar(); }, [cargar]);

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⏳ Cargando cruce PAC...</div>;
    if (!data) return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⚠️ Error al cargar datos.</div>;

    const { resumen, kpis, pivot_anio_estado } = data;

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
        return mul * String(a[sort.col] ?? '').localeCompare(String(b[sort.col] ?? ''));
    });

    const maxPivot = Math.max(...pivot_anio_estado.map(r => r.Enlazada + r['No Enlazada']), 1);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* KPIs */}
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
                <div className="kpi-card" style={{ borderTop: '3px solid #16a34a' }}>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>% Enlazado Global</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{kpis.pct_enlazado_global}%</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>de todas las OC</div>
                </div>
                <div className="kpi-card" style={{ borderTop: '3px solid #16a34a' }}>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>100% Enlazados</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{fmtN(kpis.contratos_100pct_enlazados)}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>contratos</div>
                </div>
                <div className="kpi-card" style={{ borderTop: '3px solid #dc2626' }}>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>Sin PAC</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#dc2626' }}>{fmtN(kpis.contratos_sin_pac)}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>contratos con OC y sin enlace</div>
                </div>
                <div className="kpi-card" style={{ borderTop: '3px solid #6b7280' }}>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>Sin OC en sistema</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#6b7280' }}>{fmtN(kpis.contratos_sin_oc)}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>contratos sin OC encontrada</div>
                </div>
            </div>

            {/* Pivot por año */}
            {pivot_anio_estado.length > 0 && (
                <div className="card">
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                        Evolución anual Enlazadas / No Enlazadas
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {pivot_anio_estado.map(r => {
                            const total = r.Enlazada + r['No Enlazada'];
                            const pctEnl = total > 0 ? (r.Enlazada / total) * 100 : 0;
                            return (
                                <div key={r.anio}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                                        <span style={{ fontWeight: 600, color: '#374151' }}>{r.anio || '—'}</span>
                                        <span style={{ color: '#6b7280' }}>
                                            {fmtN(r.Enlazada)} enlazadas / {fmtN(r['No Enlazada'])} no enlazadas ({pctEnl.toFixed(0)}%)
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', background: '#fef2f2' }}>
                                        <div style={{ width: `${pctEnl}%`, background: '#16a34a', transition: 'width 0.4s' }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Controles tabla */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input
                    type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar contrato..."
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
                />
                <button onClick={() => exportarPAC(data)}
                    style={{ padding: '7px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#15803d', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    📥 Excel
                </button>
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
