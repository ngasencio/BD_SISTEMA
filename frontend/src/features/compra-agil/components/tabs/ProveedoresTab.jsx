import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';

const fmt = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
const fmtN = n => new Intl.NumberFormat('es-CL').format(n || 0);

function KpiCard({ label, value, sub, color = '#3b82f6' }) {
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '16px 20px',
            border: '1px solid #e2e8f0', flex: '1 1 160px', minWidth: 150,
            borderTop: `4px solid ${color}`,
        }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

function TasaBadge({ tasa }) {
    const esAlta = tasa >= 50;
    const esMedia = tasa >= 25 && tasa < 50;
    const bg = esAlta ? '#dcfce7' : esMedia ? '#fef9c3' : '#fee2e2';
    const color = esAlta ? '#16a34a' : esMedia ? '#b45309' : '#dc2626';
    const border = esAlta ? '#bbf7d0' : esMedia ? '#fde68a' : '#fca5a5';
    return (
        <span style={{
            display: 'inline-block', padding: '2px 9px', borderRadius: 20,
            fontSize: 11, fontWeight: 700, background: bg, color, border: `1px solid ${border}`,
        }}>
            {tasa}%
        </span>
    );
}

export default function ProveedoresTab({ stats, loading }) {
    const [busqueda, setBusqueda] = useState('');
    const [sortKey, setSortKey] = useState('monto_total');
    const [sortDir, setSortDir] = useState('desc');

    const proveedores = stats?.top_proveedores || [];

    const totalGanadores = useMemo(() => new Set(proveedores.map(p => p.rut)).size, [proveedores]);

    const totalParticipantes = useMemo(() =>
        proveedores.reduce((acc, p) => acc + (p.participadas || 0), 0),
    [proveedores]);

    const promedioTasa = useMemo(() => {
        if (!proveedores.length) return 0;
        return (proveedores.reduce((acc, p) => acc + (p.tasa || 0), 0) / proveedores.length).toFixed(1);
    }, [proveedores]);

    const montoMaximo = useMemo(() =>
        Math.max(...proveedores.map(p => p.monto_total || 0), 0),
    [proveedores]);

    const montoTotal = useMemo(() =>
        proveedores.reduce((acc, p) => acc + (p.monto_total || 0), 0),
    [proveedores]);

    const filtrados = useMemo(() => {
        const txt = busqueda.toLowerCase();
        return proveedores.filter(p =>
            !txt ||
            (p.razonsocial || '').toLowerCase().includes(txt) ||
            (p.rut || '').toLowerCase().includes(txt)
        );
    }, [proveedores, busqueda]);

    const ordenados = useMemo(() => {
        return [...filtrados].sort((a, b) => {
            const va = a[sortKey], vb = b[sortKey];
            if (va == null) return 1;
            if (vb == null) return -1;
            const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [filtrados, sortKey, sortDir]);

    const toggleSort = key => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const arrow = key => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕';

    const exportarExcel = () => {
        const rows = ordenados.map(p => ({
            'RUT': p.rut,
            'Razón Social': p.razonsocial,
            'CAs Ganadas': p.ganadas,
            'CAs Participadas': p.participadas,
            'Tasa de Adjudicación (%)': p.tasa,
            'Monto Total Adjudicado': p.monto_total,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Proveedores');
        XLSX.writeFile(wb, `proveedores_compra_agil_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    if (loading) return <div className="loading-spinner">Cargando proveedores...</div>;
    if (!stats) return null;

    return (
        <div>
            {/* ── KPIs ── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <KpiCard label="Proveedores Adjudicados" value={fmtN(totalGanadores)} sub="empresas únicas" color="#22c55e" />
                <KpiCard label="Participaciones Totales" value={fmtN(totalParticipantes)} sub="en Compras Ágiles" color="#3b82f6" />
                <KpiCard label="Tasa Promedio Adj." value={`${promedioTasa}%`} sub="entre proveedores" color="#f59e0b" />
                <KpiCard label="Monto Adjudicado Total" value={fmt(montoTotal)} color="#8b5cf6" />
            </div>

            {/* ── Ranking ── */}
            <div className="card">
                <div className="card-header card-header-accent">
                    <span>🏆</span>
                    <span className="card-title">Ranking de Proveedores por Adjudicación</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                            className="filter-input"
                            placeholder="🔍 Buscar proveedor o RUT..."
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            style={{ minWidth: 220 }}
                        />
                        <button className="btn-excel" onClick={exportarExcel}>📥 Excel</button>
                    </div>
                </div>
                <div className="table-responsive">
                    <table className="table-gob">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th onClick={() => toggleSort('razonsocial')} style={{ cursor: 'pointer', userSelect: 'none' }}>Razón Social{arrow('razonsocial')}</th>
                                <th onClick={() => toggleSort('rut')} style={{ cursor: 'pointer', userSelect: 'none' }}>RUT{arrow('rut')}</th>
                                <th onClick={() => toggleSort('ganadas')} style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>CAs Ganadas{arrow('ganadas')}</th>
                                <th onClick={() => toggleSort('participadas')} style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>Participadas{arrow('participadas')}</th>
                                <th onClick={() => toggleSort('tasa')} style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>Tasa Adj.{arrow('tasa')}</th>
                                <th onClick={() => toggleSort('monto_total')} style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }}>Monto Adjudicado{arrow('monto_total')}</th>
                                <th>Participación</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ordenados.length === 0 && (
                                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>Sin proveedores.</td></tr>
                            )}
                            {ordenados.map((p, i) => {
                                const pctMonto = montoMaximo > 0 ? (p.monto_total / montoMaximo) * 100 : 0;
                                return (
                                    <tr key={p.rut || i}>
                                        <td style={{ color: '#94a3b8', fontWeight: 600, fontSize: 12 }}>#{i + 1}</td>
                                        <td style={{ fontWeight: 500 }}>{p.razonsocial}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{p.rut}</td>
                                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#22c55e' }}>{p.ganadas}</td>
                                        <td style={{ textAlign: 'center', color: '#64748b' }}>{p.participadas}</td>
                                        <td style={{ textAlign: 'center' }}><TasaBadge tasa={p.tasa} /></td>
                                        <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{fmt(p.monto_total)}</td>
                                        <td>
                                            <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, minWidth: 80, overflow: 'hidden' }}>
                                                <div style={{ width: `${pctMonto}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)', borderRadius: 4, transition: 'width .3s' }} />
                                            </div>
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
