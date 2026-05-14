/**
 * @file features/abastecimiento/components/FSCManager.jsx
 * @description Gestor de Formularios de Solicitud de Compra (FSC).
 * Tabla paginada con filtros y acciones básicas.
 */
import React, { useState } from 'react';
import { useLicitaciones } from '../hooks/useLicitaciones';
import { DataTable } from '../../../components/ui/DataTable';

const COLUMNS = [
    { key: 'codigo_licitacion', label: 'Código', width: '160px' },
    { key: 'Nombre', label: 'Nombre' },
    { key: 'Estado', label: 'Estado', width: '120px' },
    { key: 'Tipo', label: 'Tipo', width: '150px' },
    {
        key: 'MontoEstimado', label: 'Monto Est.', width: '150px',
        render: (v) => v ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v) : '-'
    },
    {
        key: 'FechaCreacion', label: 'Fecha', width: '130px',
        render: (v) => v ? new Date(v).toLocaleDateString('es-CL') : '-'
    },
];

export const FSCManager = () => {
    const { data, count, loading, error, params, changePage, applyFilter } =
        useLicitaciones();
    const [search, setSearch] = useState('');

    const handleSearch = (e) => {
        e.preventDefault();
        applyFilter({ search });
    };

    return (
        <div className="feature-page">
            <div className="page-header">
                <h1>Gestor FSC — Licitaciones</h1>
                <span className="badge">{count.toLocaleString('es-CL')} registros</span>
            </div>

            {/* Buscador */}
            <form onSubmit={handleSearch} className="search-bar">
                <input
                    type="text"
                    placeholder="Buscar por nombre, código o proveedor..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="search-input"
                />
                <button type="submit" className="btn btn-primary">Buscar</button>
            </form>

            {error && <p className="error-msg">{error}</p>}

            <DataTable
                columns={COLUMNS}
                data={data}
                loading={loading}
                page={params.page}
                totalCount={count}
                pageSize={50}
                onPageChange={changePage}
            />
        </div>
    );
};
