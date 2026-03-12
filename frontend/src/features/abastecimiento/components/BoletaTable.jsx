/**
 * @file features/abastecimiento/components/BoletaTable.jsx
 * @description Tabla de registros de Boletas de Garantía con diseño estructurado.
 */
import React, { useState } from 'react';
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
    onEdit, onDelete, onView,
}) {
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [razon, setRazon] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const totalPages = Math.ceil(totalCount / pageSize) || 1;

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

    if (loading) return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
            <div className="spinner-small" style={{ margin: '0 auto 10px' }}></div>
            <p style={{ color: '#64748b' }}>Cargando registros...</p>
        </div>
    );

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

            <div className="table-stats">
                <span>Total: <strong className="table-stats-count">{totalCount}</strong> registros</span>
                <span>Página {page} de {totalPages}</span>
            </div>

            <div className="table-wrapper" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table className="boleta-data-table">
                    <thead>
                        <tr>
                            <th>Mes/Año</th>
                            <th>N° Documento</th>
                            <th>Tipo</th>
                            <th>Proveedor</th>
                            <th>Monto</th>
                            <th>Vigencia</th>
                            <th>Estado Documento</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {boletas.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No hay registros.</td></tr>
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

            {totalPages > 1 && (
                <div className="pagination-container">
                    <button className="pagination-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                        ← Anterior
                    </button>
                    <span style={{ fontSize: '0.875rem', color: '#64748b' }}>Página <strong>{page}</strong> de {totalPages}</span>
                    <button className="pagination-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                        Siguiente →
                    </button>
                </div>
            )}
        </div>
    );
}
