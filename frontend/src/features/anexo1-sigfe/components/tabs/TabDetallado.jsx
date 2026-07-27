import React, { useState } from 'react';
import { useAnexo1Fetch } from '../../hooks/useAnexo1Fetch';
import { fetchDetalladoAnexo1 } from '../../api/anexo1SigfeApi';
import { paramsBase } from './filtrosParams';
import TablaJerarquica from './detallado/TablaJerarquica';
import SubTabPareto from './detallado/SubTabPareto';
import SubTabTemporal from './detallado/SubTabTemporal';
import SubTabControl from './detallado/SubTabControl';

const SUBTABS = [
    { id: 'tabla', label: 'Tabla Jerárquica' },
    { id: 'pareto', label: 'Pareto ABC' },
    { id: 'temporal', label: 'Evolución Temporal' },
    { id: 'control', label: 'Control Estadístico' },
];

export default function TabDetallado({ filtros, refreshKey }) {
    const [subtab, setSubtab] = useState('tabla');
    const [search, setSearch] = useState('');

    const { data, loading, error } = useAnexo1Fetch(
        fetchDetalladoAnexo1, paramsBase(filtros, { search: search || undefined }), refreshKey, 'No se pudo cargar el Análisis Detallado.',
    );

    return (
        <div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
                {SUBTABS.map((t) => (
                    <button
                        key={t.id}
                        className={`tab-btn ${subtab === t.id ? 'active' : ''}`}
                        onClick={() => setSubtab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {subtab === 'tabla' && (
                <div>
                    <div style={{ marginBottom: 12 }}>
                        <input
                            type="text" placeholder="Buscar concepto…" value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 12.5, width: 280 }}
                        />
                    </div>
                    {loading && !data && <div className="loading-spinner">Cargando Análisis Detallado…</div>}
                    {error && <div className="error-message">{error}</div>}
                    {data && <TablaJerarquica filas={data.filas} />}
                </div>
            )}

            {subtab === 'pareto' && <SubTabPareto filtros={filtros} />}
            {subtab === 'temporal' && <SubTabTemporal filtros={filtros} />}
            {subtab === 'control' && <SubTabControl filtros={filtros} filasBase={data?.filas} />}
        </div>
    );
}
