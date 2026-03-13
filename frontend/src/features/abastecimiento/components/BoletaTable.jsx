/**
 * @file features/abastecimiento/components/BoletaTable.jsx
 * @description Tabla de registros de Boletas de Garantía con diseño estructurado.
 */
import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import './BoletaTable.css';

const today = () => new Date();

function VigenciaBadge({ dateStr }) {
    if (!dateStr) return null;
    const diff = Math.floor((new Date(dateStr) - today()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return <span className="badge-vigencia badge-vigencia--danger">Vencida</span>;
    if (diff <= 30) return <span className="badge-vigencia badge-vigencia--warning">Vence pronto</span>;
    return <span className="badge-vigencia badge-vigencia--success">Vigente</span>;
}

function fmt(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function fmtMoney(val) {
    if (val === null || val === undefined) return '—';
    return Number(val).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

export function BoletaTable({
    boletas, loading, error,
    page, setPage, totalCount, pageSize,
    filters, onFilterChange, // Nuevos props para filtros y orden
    onEdit, onDelete, onView,
}) {
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [razon, setRazon] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const [searchTerm, setSearchTerm] = useState(filters.search || '');

    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    // Debounce buscador
    React.useEffect(() => {
        const timer = setTimeout(() => {
            if (searchTerm !== (filters.search || '')) {
                onFilterChange({ ...filters, search: searchTerm });
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm, filters, onFilterChange]);

    const handleSort = (field) => {
        let newOrder = field;
        if (filters.ordering === field) {
            newOrder = `-${field}`;
        } else if (filters.ordering === `-${field}`) {
            newOrder = ''; // Desactivar orden
        }
        onFilterChange({ ...filters, ordering: newOrder });
    };

    const getSortIcon = (field) => {
        if (filters.ordering === field) return ' 🔼';
        if (filters.ordering === `-${field}`) return ' 🔽';
        return ' ↕️';
    };

    const handleExportExcel = () => {
        if (boletas.length === 0) return;

        const dataToExport = boletas.map(b => ({
            'Mes/Año': b.mes_anio,
            'N° Documento': b.numero_documento,
            'Tipo': b.tipo_documento,
            'Proveedor': b.proveedor_nombre,
            'Monto': b.monto,
            'Vigencia': b.vigencia_garantia,
            'Estado Documento': b.estado_trazabilidad || '—',
            'Banco': b.banco,
            'ID Licitación': b.id_licitacion || '—',
            'Nombre Licitación': b.nombre_licitacion || '—',
            'Comprador': b.comprador_nombre,
            'Fecha Registro': b.created_at ? new Date(b.created_at).toLocaleDateString('es-CL') : '—'
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Boletas');
        XLSX.writeFile(wb, `Reporte_Boletas_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleDeleteClick = (boleta) => {
        setConfirmDelete({ id: boleta.id, numero: boleta.numero_documento });
        setRazon('');
        setDeleteError('');
    };

    const handleConfirmDelete = async () => {
        setDeleting(true);
        try {
            await onDelete(confirmDelete.id, razon);
            setConfirmDelete(null);
        } catch {
            setDeleteError('Error al eliminar el registro.');
        } finally {
            setDeleting(false);
        }
    };

    if (error) return <div className="boleta-alert boleta-alert-error">{error}</div>;

    return (
        <div className="boleta-table-container">
            {confirmDelete && (
                <div className="boleta-modal-overlay">
                    <div className="boleta-modal">
                        <div className="boleta-modal-header">
                            <h3 className="boleta-modal-title">Confirmar Eliminación</h3>
                            <button className="boleta-modal-close" onClick={() => setConfirmDelete(null)}>✕</button>
                        </div>
                        <div style={{ padding: '20px' }}>
                            <p style={{ marginBottom: '15px' }}>¿Desea eliminar la boleta <strong>N° {confirmDelete.numero}</strong>?</p>
                            <textarea
                                className="boleta-input"
                                placeholder="Razón de eliminación (opcional)"
                                rows={2}
                                value={razon}
                                onChange={(e) => setRazon(e.target.value)}
                                style={{ width: '100%', marginBottom: '15px' }}
                            />
                            {deleteError && <p className="text-danger" style={{ marginBottom: '10px' }}>{deleteError}</p>}
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button className="btn btn--secondary" onClick={() => setConfirmDelete(null)}>Cancelar</button>
                                <button className="btn btn--danger" onClick={handleConfirmDelete} disabled={deleting}>
                                    {deleting ? 'Eliminando...' : 'Confirmar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="table-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '20px' }}>
                <div className="search-box" style={{ flex: 1, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                    <input
                        type="text"
                        className="boleta-input"
                        placeholder="Buscar por número, proveedor, licitación..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '100%', paddingLeft: '35px', height: '45px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <button
                        className="btn btn--secondary"
                        onClick={handleExportExcel}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '45px', padding: '0 20px', backgroundColor: '#107c41', color: 'white', border: 'none' }}
                        title="Descargar esta página como Excel"
                    >
                        <span style={{ fontSize: '18px' }}>📊</span> Exportar Excel
                    </button>
                    <div className="table-stats" style={{ margin: 0, whiteSpace: 'nowrap' }}>
                        <span>Total: <strong className="table-stats-count">{totalCount}</strong> registros</span>
                    </div>
                </div>
            </div>

            <div className="table-wrapper" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                {loading && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10
                    }}>
                        <div className="spinner-small"></div>
                    </div>
                )}
                <table className="boleta-data-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('mes_anio')} style={{ cursor: 'pointer' }}>Mes/Año {getSortIcon('mes_anio')}</th>
                            <th onClick={() => handleSort('numero_documento')} style={{ cursor: 'pointer' }}>N° Documento {getSortIcon('numero_documento')}</th>
                            <th onClick={() => handleSort('tipo_documento')} style={{ cursor: 'pointer' }}>Tipo {getSortIcon('tipo_documento')}</th>
                            <th onClick={() => handleSort('proveedor__nombre')} style={{ cursor: 'pointer' }}>Proveedor {getSortIcon('proveedor__nombre')}</th>
                            <th onClick={() => handleSort('monto')} style={{ cursor: 'pointer' }}>Monto {getSortIcon('monto')}</th>
                            <th onClick={() => handleSort('vigencia_garantia')} style={{ cursor: 'pointer' }}>Vigencia {getSortIcon('vigencia_garantia')}</th>
                            <th onClick={() => handleSort('estado_trazabilidad')} style={{ cursor: 'pointer' }}>Estado Documento {getSortIcon('estado_trazabilidad')}</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {boletas.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>{loading ? 'Cargando...' : 'No hay registros que coincidan con la búsqueda.'}</td></tr>
                        ) : boletas.map((b) => (
                            <tr key={b.id}>
                                <td className="col-mes-anio">{b.mes_anio}</td>
                                <td><span className="col-numero">{b.numero_documento}</span></td>
                                <td><span className="badge-doc">{b.tipo_documento?.replace('De ', '')}</span></td>
                                <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {b.proveedor_nombre}
                                </td>
                                <td className="col-monto">{fmtMoney(b.monto)}</td>
                                <td style={{ textAlign: 'center' }}>
                                    <VigenciaBadge dateStr={b.vigencia_garantia} />
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>{fmt(b.vigencia_garantia)}</div>
                                </td>
                                <td>
                                    <span style={{
                                        fontSize: '0.85rem',
                                        fontWeight: 500,
                                        color: b.estado_trazabilidad === 'Apagado' ? '#94a3b8' : '#0f172a'
                                    }}>
                                        {b.estado_trazabilidad || '—'}
                                    </span>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        <button className="action-btn action-btn--view" onClick={() => onView(b)} title="Ver">👁️</button>
                                        <button className="action-btn action-btn--edit" onClick={() => onEdit(b)} title="Editar">✏️</button>
                                        <button className="action-btn action-btn--delete" onClick={() => handleDeleteClick(b)} title="Eliminar">🗑️</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="pagination-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                    Página <strong>{page}</strong> de {totalPages}
                </div>
                {totalPages > 1 && (
                    <div className="pagination-container" style={{ margin: 0 }}>
                        <button className="pagination-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                            ← Anterior
                        </button>
                        <button className="pagination-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                            Siguiente →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
