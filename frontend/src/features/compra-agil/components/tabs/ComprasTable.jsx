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

    if (loading) return <tr><td colSpan={8}><div className="loading-spinner-sm">Cargando detalle...</div></td></tr>;

    return (
        <>
            {/* Proveedores */}
            <tr className="expanded-section-row">
                <td colSpan={8}>
                    <div className="expanded-section">
                        <p className="expanded-section-title">🏢 Proveedores que cotizaron</p>
                        {!proveedores?.length ? (
                            <p className="expanded-empty">Sin proveedores registrados.</p>
                        ) : (
                            <table className="data-table data-table-sm">
                                <thead>
                                    <tr>
                                        <th>Razón Social</th>
                                        <th>RUT</th>
                                        <th>Valor Neto</th>
                                        <th>Monto Total</th>
                                        <th>EMT</th>
                                        <th>Ganador</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {proveedores.map((p, i) => {
                                        const esGanador = ['1', 'Si', 'si', 'True', 'true'].includes(String(p.proveedorseleccionado));
                                        return (
                                            <tr key={i} className={esGanador ? 'row-ganador' : ''}>
                                                <td>{p.razonsocial}</td>
                                                <td>{p.rutproveedor}</td>
                                                <td>{p.valorneto ? fmt(p.valorneto) : '—'}</td>
                                                <td>{p.montototal ? fmt(p.montototal) : '—'}</td>
                                                <td>{p.esemt || '—'}</td>
                                                <td>{esGanador ? <span className="badge-ganador">✅ Seleccionado</span> : '—'}</td>
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
            <tr className="expanded-section-row">
                <td colSpan={8}>
                    <div className="expanded-section">
                        <p className="expanded-section-title">📦 Productos solicitados</p>
                        {!productos?.length ? (
                            <p className="expanded-empty">Sin productos registrados.</p>
                        ) : (
                            <table className="data-table data-table-sm">
                                <thead>
                                    <tr>
                                        <th>Código</th>
                                        <th>Nombre</th>
                                        <th>Cantidad</th>
                                        <th>Unidad de Medida</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {productos.map((p, i) => (
                                        <tr key={i}>
                                            <td>{p.codigoproducto}</td>
                                            <td>{p.nombre}</td>
                                            <td>{p.cantidad}</td>
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
    const POR_PAGINA = 25;

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

    const totalPaginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA));
    const paginados = ordenados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

    const toggleSort = key => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
        setPagina(1);
    };

    const arrow = key => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕';

    const toggleExpand = id => {
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

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
        <div>
            {/* Toolbar */}
            <div className="card">
                <div className="table-toolbar">
                    <div className="toolbar-filters">
                        <input
                            className="search-input"
                            placeholder="🔍 Buscar por código, nombre, unidad u OC..."
                            value={busqueda}
                            onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
                        />
                        <select
                            className="filtro-select"
                            value={estadoFiltro}
                            onChange={e => { setEstadoFiltro(e.target.value); setPagina(1); }}
                        >
                            {ESTADO_OPCIONES.map(e => <option key={e}>{e}</option>)}
                        </select>
                        <select
                            className="filtro-select"
                            value={unidadFiltro}
                            onChange={e => { setUnidadFiltro(e.target.value); setPagina(1); }}
                        >
                            {unidades.map(u => <option key={u}>{u}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className="result-count">{filtrados.length} resultados</span>
                        <button className="btn-excel" onClick={exportarExcel}>
                            📥 Excel
                        </button>
                    </div>
                </div>

                <div className="table-scroll">
                    <table className="data-table sortable">
                        <thead>
                            <tr>
                                <th style={{ width: 32 }}></th>
                                <th onClick={() => toggleSort('codigocompraagil')} className="sortable-th">Código{arrow('codigocompraagil')}</th>
                                <th onClick={() => toggleSort('nombre')} className="sortable-th">Nombre{arrow('nombre')}</th>
                                <th onClick={() => toggleSort('estadoglosa')} className="sortable-th">Estado{arrow('estadoglosa')}</th>
                                <th onClick={() => toggleSort('unidadcompra')} className="sortable-th">Unidad{arrow('unidadcompra')}</th>
                                <th onClick={() => toggleSort('presupuestoestimado')} className="sortable-th">Presupuesto{arrow('presupuestoestimado')}</th>
                                <th onClick={() => toggleSort('oc_codigo')} className="sortable-th">OC{arrow('oc_codigo')}</th>
                                <th onClick={() => toggleSort('fechapublicacion')} className="sortable-th">Publicación{arrow('fechapublicacion')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginados.length === 0 && (
                                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Sin resultados para los filtros aplicados.</td></tr>
                            )}
                            {paginados.map(c => (
                                <React.Fragment key={c.codigocompraagil || c.id}>
                                    <tr
                                        className={`main-row${expanded[c.codigocompraagil] ? ' expanded' : ''}`}
                                        onClick={() => toggleExpand(c.codigocompraagil)}
                                    >
                                        <td className="expand-btn">{expanded[c.codigocompraagil] ? '▼' : '▶'}</td>
                                        <td><span className="codigo-badge">{c.codigocompraagil}</span></td>
                                        <td title={c.nombre} style={{ maxWidth: 220 }}>
                                            {c.nombre?.slice(0, 60)}{c.nombre?.length > 60 ? '…' : ''}
                                        </td>
                                        <td>
                                            <span className="estado-badge" style={{ background: ESTADO_COLORS[c.estadoglosa] || '#9ca3af' }}>
                                                {c.estadoglosa}
                                            </span>
                                        </td>
                                        <td>{c.unidadcompra}</td>
                                        <td>{c.presupuestoestimado ? fmt(c.presupuestoestimado) : '—'}</td>
                                        <td>{c.oc_codigo ? <span className="oc-link">{c.oc_codigo}</span> : '—'}</td>
                                        <td>{c.fechapublicacion ? c.fechapublicacion.slice(0, 10) : '—'}</td>
                                    </tr>
                                    {expanded[c.codigocompraagil] && (
                                        <ExpandedRow codigo={c.codigocompraagil} />
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Paginación */}
                <div className="pagination-bar">
                    <button className="page-btn" onClick={() => setPagina(1)} disabled={pagina === 1}>««</button>
                    <button className="page-btn" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}>‹</button>
                    <span className="page-info">Pág {pagina} de {totalPaginas} · {ordenados.length} total</span>
                    <button className="page-btn" onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}>›</button>
                    <button className="page-btn" onClick={() => setPagina(totalPaginas)} disabled={pagina === totalPaginas}>»»</button>
                </div>
            </div>
        </div>
    );
}
