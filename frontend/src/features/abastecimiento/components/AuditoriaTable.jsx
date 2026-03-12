/**
 * @file features/abastecimiento/components/AuditoriaTable.jsx
 * @description Tabla de auditoría de boletas eliminadas.
 */
import React, { useState } from 'react';

function fmt(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString('es-CL', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export function AuditoriaTable({ registros, loading, error }) {
    const [expanded, setExpanded] = useState(null);

    if (loading) return <div className="loading-spinner">Cargando auditoría...</div>;
    if (error) return <div className="boleta-error">{error}</div>;

    return (
        <div className="table-wrapper">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>ID Boleta</th>
                        <th>N° Documento</th>
                        <th>Eliminado por</th>
                        <th>Fecha Eliminación</th>
                        <th>Razón</th>
                        <th>Snapshot</th>
                    </tr>
                </thead>
                <tbody>
                    {registros.length === 0 ? (
                        <tr>
                            <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                Sin registros de auditoría.
                            </td>
                        </tr>
                    ) : registros.map((r) => (
                        <React.Fragment key={r.id}>
                            <tr>
                                <td>#{r.boleta_id}</td>
                                <td>{r.numero_documento}</td>
                                <td>{r.eliminado_por_username || '—'}</td>
                                <td>{fmt(r.eliminado_en)}</td>
                                <td>{r.razon || <span style={{ color: 'var(--text-muted)' }}>Sin razón</span>}</td>
                                <td>
                                    <button
                                        className="btn btn--xs btn--secondary"
                                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                                    >
                                        {expanded === r.id ? 'Ocultar' : 'Ver datos'}
                                    </button>
                                </td>
                            </tr>
                            {expanded === r.id && (
                                <tr>
                                    <td colSpan={6} style={{ background: 'var(--bg-alt, #f8f9fa)' }}>
                                        <pre className="boleta-snapshot">
                                            {JSON.stringify(r.snapshot, null, 2)}
                                        </pre>
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
