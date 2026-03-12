/**
 * @file features/abastecimiento/components/BoletaTable.jsx
 * @description Tabla de registros de Boletas de Garantía con acciones CRUD.
 *
 * Semáforo de vigencia:
 *  🔴 Vencida (pasado)
 *  🟡 Por vencer ≤ 30 días
 *  🟢 Vigente > 30 días
 */
import React, { useState } from 'react';

const today = () => new Date();

function vigenciaBadge(dateStr) {
    if (!dateStr) return null;
    const diff = Math.floor((new Date(dateStr) - today()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return <span className="badge badge--danger">Vencida</span>;
    if (diff <= 30) return <span className="badge badge--warning">Vence pronto</span>;
    return <span className="badge badge--success">Vigente</span>;
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
    const [confirmDelete, setConfirmDelete] = useState(null); // { id, numero }
    const [razon, setRazon] = useState('');

    const totalPages = Math.ceil(totalCount / pageSize);

    const handleDeleteClick = (boleta) => {
        setConfirmDelete({ id: boleta.id, numero: boleta.numero_documento });
        setRazon('');
    };

    const handleConfirmDelete = () => {
        onDelete(confirmDelete.id, razon);
        setConfirmDelete(null);
        setRazon('');
    };

    if (loading) return <div className="loading-spinner">Cargando registros...</div>;
    if (error) return <div className="boleta-error">{error}</div>;

    return (
        <>
            {/* Confirm modal */}
            {confirmDelete && (
                <div className="boleta-modal-overlay">
                    <div className="boleta-modal">
                        <h3 className="boleta-modal-title">⚠️ Eliminar Boleta</h3>
                        <p>
                            Está por eliminar la boleta <strong>N° {confirmDelete.numero}</strong>.
                            Esta acción quedará registrada en la auditoría.
                        </p>
                        <div className="boleta-field">
                            <label className="boleta-label">Razón de eliminación (opcional)</label>
                            <textarea
                                className="boleta-input"
                                rows={3}
                                value={razon}
                                onChange={(e) => setRazon(e.target.value)}
                                placeholder="Ej: Registro duplicado, boleta devuelta, etc."
                            />
                        </div>
                        <div className="boleta-form-actions">
                            <button
                                className="btn btn--secondary"
                                onClick={() => setConfirmDelete(null)}
                            >
                                Cancelar
                            </button>
                            <button className="btn btn--danger" onClick={handleConfirmDelete}>
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Mes/Año</th>
                            <th>N° Documento</th>
                            <th>Tipo</th>
                            <th>Proveedor</th>
                            <th>Banco</th>
                            <th>Monto</th>
                            <th>Vigencia</th>
                            <th>Estado</th>
                            <th>Comprador</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {boletas.length === 0 ? (
                            <tr>
                                <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                    No hay registros.
                                </td>
                            </tr>
                        ) : boletas.map((b) => (
                            <tr key={b.id}>
                                <td>{b.mes_anio || '—'}</td>
                                <td>{b.numero_documento}</td>
                                <td>
                                    <span className="badge badge--info" style={{ fontSize: '0.7rem' }}>
                                        {b.tipo_documento?.replace('De ', '')}
                                    </span>
                                </td>
                                <td>{b.proveedor_nombre || '—'}</td>
                                <td>{b.banco}</td>
                                <td style={{ textAlign: 'right' }}>{fmtMoney(b.monto)}</td>
                                <td>{fmt(b.vigencia_garantia)}</td>
                                <td>{vigenciaBadge(b.vigencia_garantia)}</td>
                                <td>{b.comprador_nombre || '—'}</td>
                                <td>
                                    <div className="boleta-actions">
                                        <button
                                            className="btn btn--xs btn--secondary"
                                            onClick={() => onView(b)}
                                            title="Ver detalle"
                                        >
                                            👁
                                        </button>
                                        <button
                                            className="btn btn--xs btn--primary"
                                            onClick={() => onEdit(b)}
                                            title="Editar"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            className="btn btn--xs btn--danger"
                                            onClick={() => handleDeleteClick(b)}
                                            title="Eliminar"
                                        >
                                            🗑
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
                <div className="table-pagination">
                    <button
                        className="btn btn--secondary btn--sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                    >
                        ‹ Anterior
                    </button>
                    <span className="pagination-info">
                        Página {page} de {totalPages} ({totalCount} registros)
                    </span>
                    <button
                        className="btn btn--secondary btn--sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                    >
                        Siguiente ›
                    </button>
                </div>
            )}
        </>
    );
}
