import React, { useState, useEffect } from 'react';
import api from '../lib/axios';

export function OrdenesCompraResumen() {
    const [ordenes, setOrdenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filters
    const [estadoFilter, setEstadoFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        setLoading(true);
        let url = 'ordenes-compra/';
        if (estadoFilter) {
            url += `?EstadoOC=${estadoFilter}`;
        }

        api.get(url)
            .then(res => {
                let results = res.data.results || res.data;
                if (searchTerm) {
                    results = results.filter(oc =>
                        oc.NombreOC?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        oc.codigo_oc?.toLowerCase().includes(searchTerm.toLowerCase())
                    );
                }
                setOrdenes(results);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [estadoFilter, searchTerm]);

    return (
        <div className="tab-view active" id="tab-resumen-oc">
            <div className="alert alert-warning">
                <span className="alert-icon">⚠️</span>
                <div><strong>Aviso:</strong> Datos actualizados dinámicamente desde el backend. OCs sincronizadas.</div>
            </div>

            {/* Tabla */}
            <div className="card" style={{ marginBottom: '18px' }}>
                <div className="card-header card-header-accent">
                    <span style={{ fontSize: '16px' }}>📋</span>
                    <span className="card-title">Tabla Maestra de Órdenes de Compra</span>
                </div>

                <div className="filter-bar">
                    <input className="filter-input" type="text" placeholder="🔍 Buscar por nombre o código OC…"
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ minWidth: '240px' }} />
                    <select className="filter-input" value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)}>
                        <option value="">Todos los estados</option>
                        <option value="Aceptada">Aceptada</option>
                        <option value="Enviado a Proveedor">Enviado a Proveedor</option>
                        <option value="Cancelada">Cancelada</option>
                    </select>
                </div>

                <div className="table-responsive">
                    {error && <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>}
                    {loading ? <div style={{ padding: '20px' }}>Cargando datos...</div> :
                        <table className="table-gob" id="oc-table">
                            <thead>
                                <tr>
                                    <th>Código OC</th>
                                    <th>Nombre</th>
                                    <th>Tipo</th>
                                    <th>Estado</th>
                                    <th>Comprador</th>
                                    <th>Proveedor</th>
                                    <th>Fecha Envío</th>
                                    <th>Total Bruto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ordenes.map(oc => (
                                    <tr key={oc.codigo_oc}>
                                        <td><strong>{oc.codigo_oc}</strong></td>
                                        <td style={{ maxWidth: '300px' }}>
                                            <div className="truncate-text" title={oc.NombreOC}>
                                                {oc.NombreOC}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="badge badge-gray">{oc.TipoOC}</span>
                                        </td>
                                        <td>
                                            <span className={`status-badge status-${(oc.EstadoOC || 'default').toLowerCase().replace(/\s+/g, '-')}`}>
                                                {oc.EstadoOC || 'N/A'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="truncate-text" title={oc.C_Unidad}>
                                                {oc.C_Unidad}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="truncate-text" title={oc.P_Nombre}>
                                                {oc.P_Nombre}
                                            </div>
                                        </td>
                                        <td>
                                            {oc.FechaEnvio ? new Date(oc.FechaEnvio).toLocaleDateString('es-CL') : 'N/A'}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {oc.TotalBruto ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: oc.TipoMoneda || 'CLP' }).format(oc.TotalBruto) : 'N/A'}
                                        </td>
                                    </tr>
                                ))}
                                {ordenes.length === 0 && (
                                    <tr>
                                        <td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>
                                            No se encontraron órdenes de compra
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    }
                </div>
            </div>
        </div>
    );
}

export default OrdenesCompraResumen;
