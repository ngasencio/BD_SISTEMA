/**
 * @file components/ui/DataTable.jsx
 * @description Tabla de datos genérica y reutilizable.
 * Soporta: columnas custom, render functions, paginación y estado de carga.
 */
import React from 'react';

export const DataTable = ({
    columns = [],
    data = [],
    loading = false,
    page = 1,
    totalCount = 0,
    pageSize = 50,
    onPageChange,
}) => {
    const totalPages = Math.ceil(totalCount / pageSize);

    if (loading) return <div className="loading-spinner">Cargando datos...</div>;

    return (
        <div className="table-wrapper">
            <table className="data-table">
                <thead>
                    <tr>
                        {columns.map((col) => (
                            <th key={col.key} style={{ width: col.width }}>
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} className="empty-row">
                                No hay registros para mostrar.
                            </td>
                        </tr>
                    ) : (
                        data.map((row, i) => (
                            <tr key={row.id || row.codigo_licitacion || i}>
                                {columns.map((col) => (
                                    <td key={col.key}>
                                        {col.render ? col.render(row[col.key], row) : row[col.key] ?? '-'}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            {/* Paginación */}
            {totalPages > 1 && onPageChange && (
                <div className="pagination">
                    <button
                        onClick={() => onPageChange(page - 1)}
                        disabled={page <= 1}
                        className="btn btn-ghost"
                    >
                        ← Anterior
                    </button>
                    <span className="page-info">
                        Página {page} de {totalPages}
                    </span>
                    <button
                        onClick={() => onPageChange(page + 1)}
                        disabled={page >= totalPages}
                        className="btn btn-ghost"
                    >
                        Siguiente →
                    </button>
                </div>
            )}
        </div>
    );
};
