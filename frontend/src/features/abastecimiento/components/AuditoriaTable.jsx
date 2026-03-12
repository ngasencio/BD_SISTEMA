/**
 * @file features/abastecimiento/components/AuditoriaTable.jsx
 * @description Tabla de auditoría de boletas eliminadas con diseño premium.
 */
import React, { useState } from 'react';
import './BoletaTable.css';

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

    const toggleExpand = (id) => {
        setExpanded(expanded === id ? null : id);
    };

    if (loading) return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
            <div className="spinner-small" style={{ margin: '0 auto 10px' }}></div>
            <p style={{ color: '#64748b' }}>Cargando auditoría...</p>
        </div>
    );

    if (error) return <div className="boleta-alert boleta-alert-error">{error}</div>;

    return (
        <div className="boleta-table-container">
            <div className="table-stats">
                <span>Total: <strong className="table-stats-count">{registros.length}</strong> eventos de eliminación</span>
            </div>

            <div className="table-wrapper" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table className="boleta-data-table">
                    <thead>
                        <tr>
                            <th style={{ width: '100px' }}>ID Boleta</th>
                            <th>N° Documento</th>
                            <th>Eliminado por</th>
                            <th>Fecha Eliminación</th>
                            <th>Razón</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {registros.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No hay registros de auditoría.</td></tr>
                        ) : registros.map((r) => (
                            <React.Fragment key={r.id}>
                                <tr className={expanded === r.id ? 'row-expanded' : ''}>
                                    <td><span className="col-numero">#{r.boleta_id}</span></td>
                                    <td style={{ fontWeight: 600 }}>{r.numero_documento}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '1.2rem' }}>👤</span>
                                            <span>{r.eliminado_por_username || 'Sistema'}</span>
                                        </div>
                                    </td>
                                    <td style={{ color: '#64748b', fontSize: '0.85rem' }}>{fmt(r.eliminado_en)}</td>
                                    <td style={{ maxWidth: '250px' }}>
                                        <div style={{
                                            fontStyle: r.razon ? 'normal' : 'italic',
                                            color: r.razon ? '#334155' : '#94a3b8',
                                            fontSize: '0.9rem'
                                        }}>
                                            {r.razon || 'Sin razón especificada'}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <button
                                            className={`action-btn action-btn--toggle ${expanded === r.id ? 'active' : ''}`}
                                            onClick={() => toggleExpand(r.id)}
                                            title={expanded === r.id ? 'Ocultar datos' : 'Ver datos respaldo'}
                                        >
                                            {expanded === r.id ? 'Cerrar ▴' : 'Datos ▾'}
                                        </button>
                                    </td>
                                </tr>
                                {expanded === r.id && (
                                    <tr>
                                        <td colSpan={6} className="snapshot-container">
                                            <div style={{ marginBottom: '10px', fontSize: '0.75rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>
                                                Snapshot del registro al momento de eliminación:
                                            </div>
                                            <pre className="snapshot-view">
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
        </div>
    );
}
