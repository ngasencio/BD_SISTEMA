import React, { useState, useEffect, useCallback } from 'react';
import { getContratosFinanciero, getContratosOCDetalle } from '../../api/contratosApi';
import { exportarFinanciero, exportarOCDetalle } from './exportUtils';

const fmt = (n) =>
    n == null ? '—' :
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

const RECONCILIACION_CFG = {
    cuadrado:        { label: '🟢 Cuadrado',        bg: '#f0fdf4', color: '#15803d' },
    diferencia_menor:{ label: '🟡 Dif. menor',      bg: '#fffbeb', color: '#b45309' },
    revisar:         { label: '🔴 Revisar',          bg: '#fef2f2', color: '#dc2626' },
    sin_datos:       { label: '⬜ Sin OC',           bg: '#f9fafb', color: '#6b7280' },
    sin_ejecutado:   { label: '⚪ Sin ejecutado',    bg: '#f9fafb', color: '#9ca3af' },
};

const ALERTA_CFG = {
    critico:  { label: '🔴 Crítico (<3m)',   color: '#dc2626' },
    urgente:  { label: '🟠 Urgente (<6m)',   color: '#ea580c' },
    atencion: { label: '🟡 Atención (<12m)', color: '#b45309' },
    ok:       { label: '🟢 OK',              color: '#15803d' },
    sin_datos:{ label: '—',                  color: '#9ca3af' },
};

function FilaExpandida({ idLic, contratoData }) {
    const [detalle, setDetalle] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tabOC, setTabOC] = useState('oc');
    const [ocExpandida, setOcExpandida] = useState(null);

    useEffect(() => {
        if (!idLic) { setLoading(false); return; }
        getContratosOCDetalle(idLic)
            .then(r => setDetalle(r.data))
            .catch(() => setDetalle(null))
            .finally(() => setLoading(false));
    }, [idLic]);

    const mc = contratoData.monto_contrato || 0;
    const me = contratoData.monto_ejecutado || 0;
    const mpe = contratoData.monto_por_ejecutar;
    const moOC = contratoData.suma_bruto_oc;
    const pctEjec = mc > 0 ? Math.min((me / mc) * 100, 100) : 0;

    return (
        <tr>
            <td colSpan={10} style={{ padding: 0, background: '#faf5ff' }}>
                <div style={{ padding: '16px 20px', borderTop: '1px solid #c4b5fd', borderBottom: '1px solid #e5e7eb' }}>

                    {/* Mini-dashboard financiero */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                        {[
                            { label: 'Monto Contrato', valor: fmt(mc), color: '#7c3aed' },
                            { label: 'Monto Ejecutado', valor: fmt(me), color: '#0ea5e9' },
                            { label: 'Por Ejecutar', valor: mpe != null ? fmt(mpe) : 'N/D', color: '#f59e0b' },
                            { label: 'Monto OC (sistema)', valor: moOC != null ? fmt(moOC) : '—', color: '#16a34a' },
                        ].map(kpi => (
                            <div key={kpi.label} style={{ background: '#fff', border: `1px solid #e5e7eb`, borderRadius: 8, padding: '10px 14px', borderTop: `3px solid ${kpi.color}` }}>
                                <div style={{ fontSize: 11, color: '#6b7280' }}>{kpi.label}</div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{kpi.valor}</div>
                            </div>
                        ))}
                    </div>

                    {/* Barra de avance */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                            Avance de ejecución financiera — {pctEjec.toFixed(1)}%
                        </div>
                        <div style={{ background: '#e9d5ff', borderRadius: 6, height: 16, position: 'relative' }}>
                            <div style={{
                                width: `${pctEjec}%`, height: '100%', borderRadius: 6,
                                background: pctEjec >= 90 ? '#dc2626' : pctEjec >= 75 ? '#f59e0b' : '#7c3aed',
                                transition: 'width 0.4s',
                            }} />
                        </div>
                        {contratoData.meses_hasta_agotamiento != null && (
                            <div style={{ marginTop: 6, fontSize: 12, color: ALERTA_CFG[contratoData.alerta]?.color }}>
                                {ALERTA_CFG[contratoData.alerta]?.label} — Proyección de agotamiento: {contratoData.meses_hasta_agotamiento} meses
                            </div>
                        )}
                    </div>

                    {/* Sub-tabs OC */}
                    {!idLic ? (
                        <div style={{ color: '#9ca3af', fontSize: 13 }}>Este contrato no tiene código de licitación — no se pueden buscar OC.</div>
                    ) : loading ? (
                        <div style={{ color: '#9ca3af', fontSize: 13 }}>⏳ Cargando órdenes de compra...</div>
                    ) : !detalle ? (
                        <div style={{ color: '#ef4444', fontSize: 13 }}>Error al cargar OC.</div>
                    ) : (
                        <>
                            {/* Proyectos resumen */}
                            {detalle.proyectos.length > 0 && (
                                <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {detalle.proyectos.map(p => (
                                        <div key={p.ID_Proyecto} style={{
                                            background: '#ede9fe', border: '1px solid #c4b5fd',
                                            borderRadius: 8, padding: '6px 12px', fontSize: 12,
                                        }}>
                                            <span style={{ fontWeight: 600, color: '#6d28d9' }}>{p.ID_Proyecto}</span>
                                            {p.Nombre_Proyecto && <span style={{ color: '#7c3aed' }}> — {p.Nombre_Proyecto}</span>}
                                            <span style={{ color: '#6b7280', marginLeft: 8 }}>{p.n_oc} OC · {fmt(p.suma_bruto)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 10 }}>
                                {[
                                    { id: 'oc', label: `OC (${detalle.oc.length})` },
                                ].map(t => (
                                    <button key={t.id} className={`tab-btn${tabOC === t.id ? ' active' : ''}`}
                                        onClick={() => setTabOC(t.id)} style={{ fontSize: 12 }}>
                                        {t.label}
                                    </button>
                                ))}
                                <div style={{ flex: 1 }} />
                                <button onClick={() => exportarOCDetalle(idLic, detalle)}
                                    style={{ padding: '4px 10px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, fontSize: 11, color: '#15803d', cursor: 'pointer' }}>
                                    📥 Excel
                                </button>
                            </div>

                            {detalle.oc.length === 0 ? (
                                <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>
                                    Sin órdenes de compra en el sistema para esta licitación.
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ background: '#ede9fe' }}>
                                                {['', 'Código OC', 'Estado', 'Total Bruto', 'Total Neto', 'Fecha Envío', 'Proveedor', 'Enlace PAC', 'ID Proyecto'].map(h => (
                                                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#4c1d95', borderBottom: '2px solid #c4b5fd', whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detalle.oc.map((oc, i) => (
                                                <React.Fragment key={oc.codigo_oc}>
                                                    <tr style={{ borderBottom: '1px solid #f3f4f6', background: ocExpandida === i ? '#faf5ff' : 'transparent' }}>
                                                        <td style={{ padding: '6px 10px' }}>
                                                            {oc.productos.length > 0 && (
                                                                <button
                                                                    onClick={() => setOcExpandida(ocExpandida === i ? null : i)}
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#7c3aed' }}
                                                                >
                                                                    {ocExpandida === i ? '▾' : '▸'}
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#374151' }}>
                                                            {oc.LinkMP
                                                                ? <a href={oc.LinkMP} target="_blank" rel="noreferrer" style={{ color: '#7c3aed' }}>{oc.codigo_oc}</a>
                                                                : oc.codigo_oc}
                                                        </td>
                                                        <td style={{ padding: '6px 10px' }}>
                                                            <span style={{
                                                                padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                                                background: oc.EstadoOC === 'Recepción Conforme' ? '#f0fdf4' : '#fef3c7',
                                                                color: oc.EstadoOC === 'Recepción Conforme' ? '#15803d' : '#92400e',
                                                            }}>{oc.EstadoOC}</span>
                                                        </td>
                                                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>{fmt(oc.TotalBruto)}</td>
                                                        <td style={{ padding: '6px 10px', color: '#6b7280' }}>{fmt(oc.TotalNeto)}</td>
                                                        <td style={{ padding: '6px 10px', color: '#6b7280' }}>{oc.FechaEnvio}</td>
                                                        <td style={{ padding: '6px 10px' }}>{oc.P_Nombre}</td>
                                                        <td style={{ padding: '6px 10px' }}>
                                                            <span style={{
                                                                padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                                                background: oc.EnlacePAC === 'Enlazada' ? '#f0fdf4' : '#fef2f2',
                                                                color: oc.EnlacePAC === 'Enlazada' ? '#15803d' : '#dc2626',
                                                            }}>{oc.EnlacePAC || '—'}</span>
                                                        </td>
                                                        <td style={{ padding: '6px 10px', fontSize: 11, color: '#6b7280' }}>
                                                            {oc.ID_Proyecto && <span style={{ color: '#7c3aed', fontWeight: 600 }}>{oc.ID_Proyecto}</span>}
                                                            {oc.Nombre_Proyecto && <div style={{ fontSize: 10 }}>{oc.Nombre_Proyecto}</div>}
                                                        </td>
                                                    </tr>
                                                    {ocExpandida === i && oc.productos.length > 0 && (
                                                        <tr>
                                                            <td colSpan={9} style={{ background: '#fdf4ff', padding: '0 16px 12px 36px' }}>
                                                                <div style={{ fontSize: 11, fontWeight: 600, color: '#6d28d9', marginBottom: 6, paddingTop: 8 }}>
                                                                    Líneas de productos ({oc.productos.length})
                                                                </div>
                                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                                                    <thead>
                                                                        <tr style={{ background: '#ede9fe' }}>
                                                                            {['Código Cat.', 'Categoría', 'Código Prod.', 'Producto', 'Cantidad', 'Precio Neto', 'Total Línea'].map(h => (
                                                                                <th key={h} style={{ padding: '5px 8px', textAlign: 'left', color: '#4c1d95', fontWeight: 600 }}>{h}</th>
                                                                            ))}
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {oc.productos.map((p, j) => (
                                                                            <tr key={j} style={{ borderBottom: '1px solid #e9d5ff' }}>
                                                                                <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: 10 }}>{p.CodigoCategoria}</td>
                                                                                <td style={{ padding: '4px 8px' }}>{p.Categoria}</td>
                                                                                <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: 10 }}>{p.CodigoProducto}</td>
                                                                                <td style={{ padding: '4px 8px' }}>{p.Producto}</td>
                                                                                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmtN(p.Cantidad)}</td>
                                                                                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmt(p.PrecioNeto)}</td>
                                                                                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>{fmt(p.TotalLinea)}</td>
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

export function TabFinanciero({ filtros }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandida, setExpandida] = useState(null);
    const [sort, setSort] = useState({ col: 'monto_contrato', dir: 'desc' });
    const [busqueda, setBusqueda] = useState('');

    const cargar = useCallback(() => {
        setLoading(true);
        setExpandida(null);
        getContratosFinanciero(filtros)
            .then(r => setData(r.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [JSON.stringify(filtros)]);

    useEffect(() => { cargar(); }, [cargar]);

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⏳ Cargando seguimiento financiero...</div>;
    if (!data) return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⚠️ Error al cargar datos.</div>;

    const toggleSort = (col) => setSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
    const arrow = (col) => sort.col === col ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '';

    const filtrado = data.filter(r =>
        !busqueda ||
        r.nombre_contrato.toLowerCase().includes(busqueda.toLowerCase()) ||
        r.numero_contrato.toLowerCase().includes(busqueda.toLowerCase()) ||
        (r.id_licitacion_oc || '').toLowerCase().includes(busqueda.toLowerCase())
    );

    const sorted = [...filtrado].sort((a, b) => {
        const mul = sort.dir === 'asc' ? 1 : -1;
        return mul * ((a[sort.col] ?? -1) - (b[sort.col] ?? -1));
    });

    const Th = ({ col, children }) => (
        <th onClick={() => toggleSort(col)}
            style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
            {children}{arrow(col)}
        </th>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <input
                    type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar contrato, N°, código licitación..."
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
                />
                <button onClick={() => exportarFinanciero(data)}
                    style={{ padding: '7px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#15803d', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    📥 Excel
                </button>
                <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{sorted.length} contratos</span>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#faf5ff' }}>
                                <th style={{ width: 32 }} />
                                <Th col="numero_contrato">N° Contrato</Th>
                                <Th col="nombre_contrato">Nombre</Th>
                                <Th col="estado_contrato">Estado</Th>
                                <Th col="monto_contrato">Monto Contrato</Th>
                                <Th col="monto_ejecutado">Ejecutado</Th>
                                <Th col="monto_por_ejecutar">Por Ejecutar</Th>
                                <Th col="suma_bruto_oc">Monto OC</Th>
                                <th style={{ padding: '8px 10px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>Reconcil.</th>
                                <Th col="meses_hasta_agotamiento">Proyección</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((r, i) => (
                                <React.Fragment key={r.numero_contrato}>
                                    <tr
                                        style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: expandida === i ? '#faf5ff' : 'transparent' }}
                                        onClick={() => setExpandida(expandida === i ? null : i)}
                                    >
                                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#7c3aed', fontSize: 14 }}>
                                            {expandida === i ? '▾' : '▸'}
                                        </td>
                                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12 }}>{r.numero_contrato}</td>
                                        <td style={{ padding: '8px 10px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.nombre_contrato}>{r.nombre_contrato}</td>
                                        <td style={{ padding: '8px 10px' }}>
                                            <span style={{
                                                padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                                background: r.estado_contrato.startsWith('En ejecución') ? '#f0fdf4' : r.estado_contrato === 'Ampliado' ? '#fffbeb' : '#f3f4f6',
                                                color: r.estado_contrato.startsWith('En ejecución') ? '#15803d' : r.estado_contrato === 'Ampliado' ? '#92400e' : '#6b7280',
                                            }}>{r.estado_contrato}</span>
                                        </td>
                                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmt(r.monto_contrato)}</td>
                                        <td style={{ padding: '8px 10px' }}>{fmt(r.monto_ejecutado)}</td>
                                        <td style={{ padding: '8px 10px', color: r.monto_por_ejecutar == null ? '#9ca3af' : '#374151' }}>
                                            {r.monto_por_ejecutar != null ? fmt(r.monto_por_ejecutar) : 'N/D'}
                                        </td>
                                        <td style={{ padding: '8px 10px', color: r.suma_bruto_oc == null ? '#9ca3af' : '#374151' }}>
                                            {r.suma_bruto_oc != null ? fmt(r.suma_bruto_oc) : '—'}
                                        </td>
                                        <td style={{ padding: '8px 10px' }}>
                                            {(() => {
                                                const cfg = RECONCILIACION_CFG[r.reconciliacion] || RECONCILIACION_CFG.sin_datos;
                                                return (
                                                    <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                        {cfg.label}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td style={{ padding: '8px 10px' }}>
                                            {r.meses_hasta_agotamiento != null ? (
                                                <span style={{ color: ALERTA_CFG[r.alerta]?.color, fontWeight: 600, fontSize: 12 }}>
                                                    {ALERTA_CFG[r.alerta]?.label}<br />
                                                    <span style={{ fontWeight: 400, fontSize: 11 }}>{r.meses_hasta_agotamiento}m</span>
                                                </span>
                                            ) : <span style={{ color: '#9ca3af' }}>—</span>}
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
        </div>
    );
}
