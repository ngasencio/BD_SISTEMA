import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { getCompraAgilProductos, getCompraAgilProveedores } from '../../api/compraAgilApi';

const fmt = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);

const ESTADO_COLORS = {
    'Proveedor seleccionado': '#22c55e',
    'Cerrada': '#3b82f6',
    'Publicada': '#f59e0b',
    'Desierta': '#ef4444',
    'Cancelada': '#9ca3af',
};

const ESTADO_OPCIONES = ['Todos', 'Proveedor seleccionado', 'Publicada', 'Cerrada', 'Desierta', 'Cancelada'];

function EstadoBadge({ estado }) {
    const color = ESTADO_COLORS[estado] || '#9ca3af';
    return (
        <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 20,
            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
            background: color + '20', color, border: `1px solid ${color}50`,
        }}>
            {estado}
        </span>
    );
}

function Pagination({ page, setPage, pageSize, setPageSize, total }) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    const btnBase = { padding: '3px 9px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, cursor: 'pointer', background: '#fff', color: '#475569', lineHeight: 1.4 };
    const btnDis = { ...btnBase, cursor: 'not-allowed', color: '#cbd5e1' };
    const btnAct = { ...btnBase, background: '#3b82f6', color: '#fff', fontWeight: 700, border: '1px solid #3b82f6' };
    const from = Math.max(1, Math.min(page - 2, totalPages - 4));
    const to = Math.min(totalPages, from + 4);
    const pages = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#64748b', marginRight: 4 }}>Mostrar:</span>
            {[20, 50, 100].map(s => (
                <button key={s} onClick={() => { setPageSize(s); setPage(1); }} style={pageSize === s ? btnAct : btnBase}>{s}</button>
            ))}
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{start}–{end} de {total} registros</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                <button onClick={() => setPage(1)} disabled={page === 1} style={page === 1 ? btnDis : btnBase}>«</button>
                <button onClick={() => setPage(p => p - 1)} disabled={page === 1} style={page === 1 ? btnDis : btnBase}>‹</button>
                {pages.map(p => <button key={p} onClick={() => setPage(p)} style={p === page ? btnAct : btnBase}>{p}</button>)}
                <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages} style={page === totalPages ? btnDis : btnBase}>›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={page === totalPages ? btnDis : btnBase}>»</button>
            </div>
        </div>
    );
}

function ExpandedRow({ codigo }) {
    const [productos, setProductos] = useState(null);
    const [proveedores, setProveedores] = useState(null);
    const [loading, setLoading] = useState(false);
    const [cargado, setCargado] = useState(false);

    const cargar = async () => {
        if (cargado) return;
        setLoading(true);
        try {
            const [pRes, prRes] = await Promise.all([
                getCompraAgilProductos({ codigocompraagil: codigo, page_size: 100 }),
                getCompraAgilProveedores({ codigocompraagil: codigo, page_size: 100 }),
            ]);
            setProductos(pRes.data.results ?? pRes.data);
            setProveedores(prRes.data.results ?? prRes.data);
            setCargado(true);
        } finally {
            setLoading(false);
        }
    };

    if (!cargado && !loading) {
        cargar();
    }

    if (loading) return <tr><td colSpan={8}><div style={{ padding: '10px 24px', fontSize: 12, color: '#64748b' }}>Cargando detalle...</div></td></tr>;

    return (
        <>
            {/* Proveedores */}
            <tr style={{ background: '#f8fafc' }}>
                <td colSpan={8}>
                    <div style={{ padding: '10px 24px', borderLeft: '3px solid #3b82f6', margin: '4px 0' }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 8 }}>🏢 Proveedores que cotizaron</p>
                        {!proveedores?.length ? (
                            <p style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Sin proveedores registrados.</p>
                        ) : (
                            <table className="table-gob" style={{ fontSize: 12 }}>
                                <thead>
                                    <tr>
                                        <th>Razón Social</th>
                                        <th>RUT</th>
                                        <th style={{ textAlign: 'right' }}>Valor Neto</th>
                                        <th style={{ textAlign: 'right' }}>Monto Total</th>
                                        <th>EMT</th>
                                        <th>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {proveedores.map((p, i) => {
                                        const esGanador = ['1', 'Si', 'si', 'True', 'true'].includes(String(p.proveedorseleccionado));
                                        return (
                                            <tr key={i} style={{ background: esGanador ? '#f0fdf4' : undefined }}>
                                                <td>{p.razonsocial}</td>
                                                <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{p.rutproveedor}</td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{p.valorneto ? fmt(p.valorneto) : '—'}</td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{p.montototal ? fmt(p.montototal) : '—'}</td>
                                                <td>{p.esemt || '—'}</td>
                                                <td>
                                                    {esGanador
                                                        ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0' }}>✅ Seleccionado</span>
                                                        : <span style={{ color: '#94a3b8' }}>—</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </td>
            </tr>
            {/* Productos */}
            <tr style={{ background: '#f8fafc' }}>
                <td colSpan={8}>
                    <div style={{ padding: '10px 24px', borderLeft: '3px solid #8b5cf6', margin: '4px 0' }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#6d28d9', marginBottom: 8 }}>📦 Productos solicitados</p>
                        {!productos?.length ? (
                            <p style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Sin productos registrados.</p>
                        ) : (
                            <table className="table-gob" style={{ fontSize: 12 }}>
                                <thead>
                                    <tr>
                                        <th>Código</th>
                                        <th>Nombre</th>
                                        <th style={{ textAlign: 'center' }}>Cantidad</th>
                                        <th>Unidad de Medida</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {productos.map((p, i) => (
                                        <tr key={i}>
                                            <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.codigoproducto}</td>
                                            <td>{p.nombre}</td>
                                            <td style={{ textAlign: 'center' }}>{p.cantidad}</td>
                                            <td>{p.unidadmedida}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </td>
            </tr>
        </>
    );
}

export default function ComprasTable({ compras, loading }) {
    const [busqueda, setBusqueda] = useState('');
    const [estadoFiltro, setEstadoFiltro] = useState('Todos');
    const [unidadFiltro, setUnidadFiltro] = useState('');
    const [sortKey, setSortKey] = useState('fechapublicacion');
    const [sortDir, setSortDir] = useState('desc');
    const [expanded, setExpanded] = useState({});
    const [pagina, setPagina] = useState(1);
    const [porPagina, setPorPagina] = useState(25);

    const unidades = useMemo(() => {
        const set = new Set((compras || []).map(c => c.unidadcompra).filter(Boolean));
        return ['Todas', ...Array.from(set).sort()];
    }, [compras]);

    const filtrados = useMemo(() => {
        return (compras || []).filter(c => {
            const txt = busqueda.toLowerCase();
            const matchBusq = !txt ||
                (c.codigocompraagil || '').toLowerCase().includes(txt) ||
                (c.nombre || '').toLowerCase().includes(txt) ||
                (c.unidadcompra || '').toLowerCase().includes(txt) ||
                (c.oc_codigo || '').toLowerCase().includes(txt);
            const matchEstado = estadoFiltro === 'Todos' || c.estadoglosa === estadoFiltro;
            const matchUnidad = !unidadFiltro || unidadFiltro === 'Todas' || c.unidadcompra === unidadFiltro;
            return matchBusq && matchEstado && matchUnidad;
        });
    }, [compras, busqueda, estadoFiltro, unidadFiltro]);

    const ordenados = useMemo(() => {
        return [...filtrados].sort((a, b) => {
            const va = a[sortKey], vb = b[sortKey];
            if (!va && !vb) return 0;
            if (!va) return 1;
            if (!vb) return -1;
            const cmp = String(va).localeCompare(String(vb), 'es', { numeric: true });
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [filtrados, sortKey, sortDir]);

    const paginados = ordenados.slice((pagina - 1) * porPagina, pagina * porPagina);

    const toggleSort = key => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
        setPagina(1);
    };

    const arrow = key => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕';

    const toggleExpand = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    const exportarExcel = () => {
        const rows = ordenados.map(c => ({
            'Código CA': c.codigocompraagil,
            'Nombre': c.nombre,
            'Estado': c.estadoglosa,
            'Unidad de Compra': c.unidadcompra,
            'Presupuesto Estimado': c.presupuestoestimado,
            'OC Código': c.oc_codigo,
            'Fecha Publicación': c.fechapublicacion,
            'Fecha Cierre': c.fechacierre,
            'Ofertas Recibidas': c.totalofertasrecibidas,
            'Proveedores Cotizando': c.totalproveedorescotizando,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Compras Ágiles');
        XLSX.writeFile(wb, `compras_agiles_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    if (loading) return <div className="loading-spinner">Cargando compras ágiles...</div>;

    return (
        <div className="card">
            {/* ── Encabezado de tarjeta ── */}
            <div className="card-header card-header-accent">
                <span>🛒</span>
                <span className="card-title">Listado de Compras Ágiles</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{filtrados.length} resultados</span>
            </div>

            {/* ── Barra de filtros ── */}
            <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    className="filter-input"
                    placeholder="🔍 Buscar por código, nombre, unidad u OC..."
                    value={busqueda}
                    onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
                    style={{ minWidth: 260, flex: '1 1 260px' }}
                />
                <select
                    className="filter-input"
                    value={estadoFiltro}
                    onChange={e => { setEstadoFiltro(e.target.value); setPagina(1); }}
                >
                    {ESTADO_OPCIONES.map(e => <option key={e}>{e}</option>)}
                </select>
                <select
                    className="filter-input"
                    value={unidadFiltro}
                    onChange={e => { setUnidadFiltro(e.target.value); setPagina(1); }}
                >
                    {unidades.map(u => <option key={u}>{u}</option>)}
                </select>
                <button className="btn-excel" onClick={exportarExcel}>📥 Excel</button>
            </div>

            {/* ── Tabla ── */}
            <div className="table-responsive">
                <table className="table-gob">
                    <thead>
                        <tr>
                            <th style={{ width: 32 }}></th>
                            <th onClick={() => toggleSort('codigocompraagil')} style={{ cursor: 'pointer', userSelect: 'none' }}>Código{arrow('codigocompraagil')}</th>
                            <th onClick={() => toggleSort('nombre')} style={{ cursor: 'pointer', userSelect: 'none' }}>Nombre{arrow('nombre')}</th>
                            <th onClick={() => toggleSort('estadoglosa')} style={{ cursor: 'pointer', userSelect: 'none' }}>Estado{arrow('estadoglosa')}</th>
                            <th onClick={() => toggleSort('unidadcompra')} style={{ cursor: 'pointer', userSelect: 'none' }}>Unidad{arrow('unidadcompra')}</th>
                            <th onClick={() => toggleSort('presupuestoestimado')} style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }}>Presupuesto{arrow('presupuestoestimado')}</th>
                            <th onClick={() => toggleSort('oc_codigo')} style={{ cursor: 'pointer', userSelect: 'none' }}>OC{arrow('oc_codigo')}</th>
                            <th onClick={() => toggleSort('fechapublicacion')} style={{ cursor: 'pointer', userSelect: 'none' }}>Publicación{arrow('fechapublicacion')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginados.length === 0 && (
                            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>Sin resultados para los filtros aplicados.</td></tr>
                        )}
                        {paginados.map(c => (
                            <React.Fragment key={c.codigocompraagil || c.id}>
                                <tr
                                    style={{ cursor: 'pointer', background: expanded[c.codigocompraagil] ? '#eff6ff' : undefined }}
                                    onClick={() => toggleExpand(c.codigocompraagil)}
                                >
                                    <td style={{ color: '#6b7280', fontSize: 11, width: 24, textAlign: 'center' }}>
                                        {expanded[c.codigocompraagil] ? '▼' : '▶'}
                                    </td>
                                    <td>
                                        <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, color: '#374151' }}>
                                            {c.codigocompraagil}
                                        </span>
                                    </td>
                                    <td title={c.nombre} style={{ maxWidth: 220 }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {c.nombre}
                                        </div>
                                    </td>
                                    <td><EstadoBadge estado={c.estadoglosa} /></td>
                                    <td style={{ fontSize: 12, color: '#475569' }}>{c.unidadcompra}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{c.presupuestoestimado ? fmt(c.presupuestoestimado) : '—'}</td>
                                    <td>
                                        {c.oc_codigo
                                            ? <span style={{ fontSize: 11, color: '#2563eb', fontFamily: 'monospace' }}>{c.oc_codigo}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td style={{ fontSize: 12, color: '#64748b' }}>{c.fechapublicacion ? c.fechapublicacion.slice(0, 10) : '—'}</td>
                                </tr>
                                {expanded[c.codigocompraagil] && (
                                    <ExpandedRow codigo={c.codigocompraagil} />
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ── Paginación OC-style ── */}
            <Pagination
                page={pagina}
                setPage={setPagina}
                pageSize={porPagina}
                setPageSize={setPorPagina}
                total={ordenados.length}
            />
        </div>
    );
}
