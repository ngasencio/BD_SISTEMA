import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { KpiCard } from '../../../abastecimiento/components/KpiCard';

const fmt = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
const fmtN = n => new Intl.NumberFormat('es-CL').format(n || 0);

export default function ProveedoresTab({ stats, loading }) {
    const [busqueda, setBusqueda] = useState('');
    const [sortKey, setSortKey] = useState('monto_total');
    const [sortDir, setSortDir] = useState('desc');

    const proveedores = stats?.top_proveedores || [];

    const totalGanadores = useMemo(() => {
        const set = new Set(proveedores.map(p => p.rut));
        return set.size;
    }, [proveedores]);

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
            <section className="kpi-grid">
                <KpiCard title="Proveedores Adjudicados" value={fmtN(totalGanadores)} icon="🏆" colorVar="--color-success" />
                <KpiCard title="Participaciones Totales" value={fmtN(totalParticipantes)} icon="🤝" colorVar="--color-primary" />
                <KpiCard title="Tasa Promedio Adjudicación" value={`${promedioTasa}%`} icon="📈" colorVar="--color-accent" />
                <KpiCard title="Mayor Adjudicación" value={fmt(montoMaximo)} icon="🥇" colorVar="--color-warning" />
            </section>

            <div className="card">
                <div className="table-toolbar">
                    <h3 className="card-title">Ranking de Proveedores por Adjudicación</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            className="search-input"
                            placeholder="🔍 Buscar proveedor o RUT..."
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                        />
                        <button className="btn-excel" onClick={exportarExcel}>📥 Excel</button>
                    </div>
                </div>
                <div className="table-scroll">
                    <table className="data-table sortable">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th onClick={() => toggleSort('razonsocial')} className="sortable-th">Razón Social{arrow('razonsocial')}</th>
                                <th onClick={() => toggleSort('rut')} className="sortable-th">RUT{arrow('rut')}</th>
                                <th onClick={() => toggleSort('ganadas')} className="sortable-th">CAs Ganadas{arrow('ganadas')}</th>
                                <th onClick={() => toggleSort('participadas')} className="sortable-th">Participadas{arrow('participadas')}</th>
                                <th onClick={() => toggleSort('tasa')} className="sortable-th">Tasa Adj.{arrow('tasa')}</th>
                                <th onClick={() => toggleSort('monto_total')} className="sortable-th">Monto Adjudicado{arrow('monto_total')}</th>
                                <th>Participación</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ordenados.length === 0 && (
                                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Sin proveedores.</td></tr>
                            )}
                            {ordenados.map((p, i) => {
                                const pctMonto = montoMaximo > 0 ? (p.monto_total / montoMaximo) * 100 : 0;
                                return (
                                    <tr key={p.rut || i}>
                                        <td style={{ color: '#9ca3af', fontWeight: 600 }}>#{i + 1}</td>
                                        <td style={{ fontWeight: 500 }}>{p.razonsocial}</td>
                                        <td style={{ color: '#6b7280', fontSize: 13 }}>{p.rut}</td>
                                        <td style={{ textAlign: 'center', fontWeight: 600, color: '#22c55e' }}>{p.ganadas}</td>
                                        <td style={{ textAlign: 'center' }}>{p.participadas}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className={`tasa-badge ${p.tasa >= 50 ? 'tasa-alta' : p.tasa >= 25 ? 'tasa-media' : 'tasa-baja'}`}>
                                                {p.tasa}%
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{fmt(p.monto_total)}</td>
                                        <td>
                                            <div className="mini-bar-wrap">
                                                <div className="mini-bar-fill" style={{ width: `${pctMonto}%` }} />
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
