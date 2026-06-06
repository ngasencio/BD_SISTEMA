import React, { useState, useEffect } from 'react';
import { getContratosEvaluaciones } from '../../api/contratosApi';
import { exportarEvaluaciones } from './exportUtils';

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

function KpiEval({ titulo, valor, subtitulo, color }) {
    return (
        <div className="kpi-card" style={{ borderTop: `3px solid ${color}` }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{titulo}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{valor}</div>
            {subtitulo && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{subtitulo}</div>}
        </div>
    );
}

export function TabEvaluaciones() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sort, setSort] = useState({ col: 'pendientes', dir: 'desc' });
    const [tabInner, setTabInner] = useState('anio');

    useEffect(() => {
        getContratosEvaluaciones()
            .then(r => setData(r.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⏳ Cargando evaluaciones...</div>
    );
    if (!data) return (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⚠️ Error al cargar datos.</div>
    );

    const { kpis, por_anio, por_estado_terminado, detalle_pendientes } = data;

    const sortedDetalle = [...detalle_pendientes].sort((a, b) => {
        const mul = sort.dir === 'asc' ? 1 : -1;
        if (sort.col === 'monto_contrato') return mul * ((a.monto_contrato ?? 0) - (b.monto_contrato ?? 0));
        if (sort.col === 'anio') return mul * ((a.anio ?? 0) - (b.anio ?? 0));
        return mul * String(a[sort.col] ?? '').localeCompare(String(b[sort.col] ?? ''));
    });

    const toggleSort = (col) => setSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
    const arrow = (col) => sort.col === col ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPIs */}
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
                <KpiEval titulo="Terminados" valor={fmtN(kpis.total_terminados)} color="#6b7280" subtitulo="contratos terminados" />
                <KpiEval titulo="Evaluados" valor={fmtN(kpis.evaluados)} color="#16a34a" subtitulo="con nota en MP" />
                <KpiEval titulo="Pendientes de Evaluación" valor={fmtN(kpis.pendientes)} color="#dc2626"
                    subtitulo={`${kpis.pct_pendiente}% de terminados`} />
                <KpiEval titulo="Nota Promedio" valor={kpis.nota_promedio ?? '—'} color="#7c3aed"
                    subtitulo="evaluaciones realizadas" />
            </div>

            {/* Barra de progreso evaluaciones */}
            {kpis.total_terminados > 0 && (
                <div className="card">
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#374151' }}>
                        Cobertura de Evaluación — Contratos Terminados
                    </div>
                    <div style={{ background: '#f3f4f6', borderRadius: 8, height: 20, position: 'relative' }}>
                        <div style={{
                            width: `${(kpis.evaluados / kpis.total_terminados) * 100}%`,
                            background: 'linear-gradient(90deg, #16a34a, #4ade80)',
                            height: '100%', borderRadius: 8, transition: 'width 0.5s',
                        }} />
                        <span style={{
                            position: 'absolute', left: '50%', top: '50%',
                            transform: 'translate(-50%,-50%)',
                            fontSize: 11, fontWeight: 700, color: '#111827',
                        }}>
                            {((kpis.evaluados / kpis.total_terminados) * 100).toFixed(1)}% evaluado
                        </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: '#6b7280' }}>
                        <span>Evaluados: {fmtN(kpis.evaluados)}</span>
                        <span>Pendientes: {fmtN(kpis.pendientes)}</span>
                        <span>Total terminados: {fmtN(kpis.total_terminados)}</span>
                    </div>
                </div>
            )}

            {/* Sub-tabs detalle */}
            <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb' }}>
                {[{ id: 'anio', label: 'Por Año' }, { id: 'estado', label: 'Por Estado' }, { id: 'detalle', label: `Detalle (${kpis.pendientes})` }].map(t => (
                    <button key={t.id} className={`tab-btn${tabInner === t.id ? ' active' : ''}`}
                        onClick={() => setTabInner(t.id)} style={{ fontSize: 12 }}>
                        {t.label}
                    </button>
                ))}
                <div style={{ flex: 1 }} />
                <button
                    onClick={() => exportarEvaluaciones(data)}
                    style={{
                        padding: '5px 12px', background: '#f0fdf4', border: '1px solid #86efac',
                        borderRadius: 6, fontSize: 12, color: '#15803d', cursor: 'pointer', fontWeight: 600,
                    }}
                >
                    📥 Excel
                </button>
            </div>

            {tabInner === 'anio' && (
                <div className="card">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={{ background: '#faf5ff' }}>
                                    <Th>Año</Th>
                                    <Th>Total Terminados</Th>
                                    <Th>Evaluados</Th>
                                    <Th>Pendientes</Th>
                                    <Th>% Pendiente</Th>
                                    <Th>Monto Total</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {por_anio.map(r => (
                                    <tr key={r.anio} style={trStyle}>
                                        <Td bold>{r.anio || '—'}</Td>
                                        <Td>{fmtN(r.total)}</Td>
                                        <Td><span style={{ color: '#16a34a', fontWeight: 600 }}>{fmtN(r.evaluados)}</span></Td>
                                        <Td>
                                            <span style={{ color: r.pendientes > 0 ? '#dc2626' : '#6b7280', fontWeight: 600 }}>
                                                {fmtN(r.pendientes)}
                                            </span>
                                        </Td>
                                        <Td>{r.total > 0 ? `${((r.pendientes / r.total) * 100).toFixed(1)}%` : '—'}</Td>
                                        <Td>{fmt(r.monto)}</Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tabInner === 'estado' && (
                <div className="card">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={{ background: '#faf5ff' }}>
                                    <Th>Estado del Contrato</Th>
                                    <Th>Pendientes de Evaluación</Th>
                                    <Th>Monto Total</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {por_estado_terminado.map((r, i) => (
                                    <tr key={i} style={trStyle}>
                                        <Td>{r.estado}</Td>
                                        <Td>
                                            <span style={{ color: r.pendientes > 0 ? '#dc2626' : '#6b7280', fontWeight: 600 }}>
                                                {fmtN(r.pendientes)}
                                            </span>
                                        </Td>
                                        <Td>{fmt(r.monto)}</Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tabInner === 'detalle' && (
                <div className="card">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={{ background: '#faf5ff' }}>
                                    {[
                                        { col: 'numero_contrato', label: 'N° Contrato' },
                                        { col: 'nombre_contrato', label: 'Nombre Contrato' },
                                        { col: 'estado_contrato', label: 'Estado' },
                                        { col: 'unidad_requirente', label: 'Unidad' },
                                        { col: 'monto_contrato', label: 'Monto' },
                                        { col: 'anio', label: 'Año' },
                                    ].map(({ col, label }) => (
                                        <th key={col} onClick={() => toggleSort(col)}
                                            style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}>
                                            {label}{arrow(col)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedDetalle.map((r, i) => (
                                    <tr key={i} style={trStyle}>
                                        <Td mono>{r.numero_contrato}</Td>
                                        <Td>{r.nombre_contrato}</Td>
                                        <Td>
                                            <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                                                {r.estado_contrato}
                                            </span>
                                        </Td>
                                        <Td>{r.unidad_requirente}</Td>
                                        <Td bold>{fmt(r.monto_contrato)}</Td>
                                        <Td>{r.anio ?? '—'}</Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// Helpers de tabla reutilizables
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' };
const trStyle = { borderBottom: '1px solid #f3f4f6' };
const Th = ({ children }) => <th style={thStyle}>{children}</th>;
const Td = ({ children, bold, mono }) => (
    <td style={{ padding: '8px 12px', color: '#374151', fontWeight: bold ? 600 : 400, fontFamily: mono ? 'monospace' : 'inherit' }}>
        {children}
    </td>
);
