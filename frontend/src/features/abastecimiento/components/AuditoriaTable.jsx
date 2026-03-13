/**
 * @file features/abastecimiento/components/AuditoriaTable.jsx
 * @description Tabla de auditoría: muestra eliminaciones Y modificaciones de boletas.
 *              Para modificaciones muestra snapshot antes/después comparados.
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

/** Badge visual según el tipo de acción */
function AccionBadge({ accion }) {
    const esModificar = accion === 'MODIFICAR';
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '999px',
            fontSize: '0.78rem',
            fontWeight: 700,
            letterSpacing: '0.03em',
            background: esModificar ? '#eff6ff' : '#fff1f2',
            color: esModificar ? '#1d4ed8' : '#be123c',
            border: `1px solid ${esModificar ? '#bfdbfe' : '#fecdd3'}`,
        }}>
            {esModificar ? '✏️ MODIFICACIÓN' : '🗑️ ELIMINACIÓN'}
        </span>
    );
}

/**
 * Renderiza un snapshot JSON como tabla legible de clave→valor.
 * Resalta en amarillo los campos que difieren entre antes y después.
 */
function SnapshotView({ data, comparar, titulo }) {
    if (!data) return <em style={{ color: '#94a3b8' }}>Sin datos</em>;

    const entries = Object.entries(data).filter(([k]) =>
        !['adjunto_url'].includes(k) // omitir URLs de archivo (cambian en cada request)
    );

    return (
        <div>
            {titulo && (
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                    {titulo}
                </div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <tbody>
                    {entries.map(([key, val]) => {
                        const difiere = comparar && JSON.stringify(comparar[key]) !== JSON.stringify(val);
                        return (
                            <tr key={key} style={{ background: difiere ? '#fef9c3' : 'transparent' }}>
                                <td style={{ padding: '3px 8px', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>
                                    {key}
                                </td>
                                <td style={{ padding: '3px 8px', color: '#1e293b', borderBottom: '1px solid #f1f5f9', wordBreak: 'break-word' }}>
                                    {val === null || val === undefined ? <em style={{ color: '#94a3b8' }}>—</em> : String(val)}
                                    {difiere && <span title="Campo modificado" style={{ marginLeft: '6px', color: '#ca8a04' }}>⚠</span>}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export function AuditoriaTable({ registros, loading, error }) {
    const [expanded, setExpanded] = useState(null);

    const toggleExpand = (id) => setExpanded(expanded === id ? null : id);

    if (loading) return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
            <div className="spinner-small" style={{ margin: '0 auto 10px' }}></div>
            <p style={{ color: '#64748b' }}>Cargando auditoría...</p>
        </div>
    );

    if (error) return <div className="boleta-alert boleta-alert-error">{error}</div>;

    const totalModif = registros.filter(r => r.accion === 'MODIFICAR').length;
    const totalElim  = registros.filter(r => r.accion === 'ELIMINAR').length;

    return (
        <div className="boleta-table-container">
            <div className="table-stats" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <span>Total: <strong className="table-stats-count">{registros.length}</strong> eventos</span>
                <span style={{ color: '#1d4ed8' }}>✏️ <strong>{totalModif}</strong> modificaciones</span>
                <span style={{ color: '#be123c' }}>🗑️ <strong>{totalElim}</strong> eliminaciones</span>
            </div>

            <div className="table-wrapper" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table className="boleta-data-table">
                    <thead>
                        <tr>
                            <th style={{ width: '140px' }}>Acción</th>
                            <th style={{ width: '90px' }}>ID Boleta</th>
                            <th>N° Documento</th>
                            <th>Usuario</th>
                            <th>Fecha</th>
                            <th>Razón / Nota</th>
                            <th>Detalle</th>
                        </tr>
                    </thead>
                    <tbody>
                        {registros.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                    No hay registros de auditoría.
                                </td>
                            </tr>
                        ) : registros.map((r) => (
                            <React.Fragment key={r.id}>
                                <tr className={expanded === r.id ? 'row-expanded' : ''}>
                                    <td><AccionBadge accion={r.accion} /></td>
                                    <td><span className="col-numero">#{r.boleta_id}</span></td>
                                    <td style={{ fontWeight: 600 }}>{r.numero_documento}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>👤</span>
                                            <span>{r.usuario_username || 'Sistema'}</span>
                                        </div>
                                    </td>
                                    <td style={{ color: '#64748b', fontSize: '0.85rem' }}>{fmt(r.eliminado_en)}</td>
                                    <td style={{ maxWidth: '200px' }}>
                                        <div style={{
                                            fontStyle: r.razon ? 'normal' : 'italic',
                                            color: r.razon ? '#334155' : '#94a3b8',
                                            fontSize: '0.9rem',
                                        }}>
                                            {r.razon || 'Sin razón especificada'}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <button
                                            className={`action-btn action-btn--toggle ${expanded === r.id ? 'active' : ''}`}
                                            onClick={() => toggleExpand(r.id)}
                                            title={expanded === r.id ? 'Ocultar datos' : 'Ver datos del registro'}
                                        >
                                            {expanded === r.id ? 'Cerrar ▴' : 'Ver ▾'}
                                        </button>
                                    </td>
                                </tr>

                                {expanded === r.id && (
                                    <tr>
                                        <td colSpan={7} className="snapshot-container">
                                            {r.accion === 'MODIFICAR' ? (
                                                /* ── Vista comparativa antes / después ── */
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', padding: '12px' }}>
                                                        <SnapshotView
                                                            data={r.snapshot_antes}
                                                            comparar={r.snapshot}
                                                            titulo="📋 Antes del cambio"
                                                        />
                                                    </div>
                                                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '12px' }}>
                                                        <SnapshotView
                                                            data={r.snapshot}
                                                            comparar={r.snapshot_antes}
                                                            titulo="✅ Después del cambio"
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                /* ── Vista simple para eliminaciones ── */
                                                <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '6px', padding: '12px' }}>
                                                    <SnapshotView
                                                        data={r.snapshot}
                                                        titulo="🗑️ Datos al momento de eliminar"
                                                    />
                                                </div>
                                            )}
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
