import { useState, useEffect, useCallback } from 'react';
import { getFormulariosPac } from '../../api/pacCumplimientoApi';
import { fmtCLP } from '../../utils/format';
import ModalRevisionFsc from './ModalRevisionFsc';

const cardStyle = { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };
const sectionTitle = { fontSize: 14, fontWeight: 700, color: '#1e293b' };
const sectionSub = { fontSize: 12, color: '#64748b' };

const FILTROS = [
    { key: '', label: 'Todos' },
    { key: 'DENTRO', label: '✅ Dentro PAC' },
    { key: 'FUERA', label: '⛔ Fuera PAC' },
];

/**
 * Tabla de formularios reutilizada por Resumen y Jerarquía. `filtroOrg` (opcional) acota
 * a una subdirección/departamento/sub-departamento — lo setea el tab que la usa (ver
 * JerarquiaTab: clic en un nodo resuelve los depto_id que caen bajo él, incluyendo el
 * rollup de sub-departamentos, y los pasa acá vía `sso_departamento_in`).
 */
export default function TablaFormulariosPac({ anho, sectionId, filtroOrg, onClearFiltroOrg }) {
    const [data, setData] = useState({ results: [], count: 0 });
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [filtro, setFiltro] = useState('');
    const [cargando, setCargando] = useState(false);
    const [modalFsc, setModalFsc] = useState(null);

    const orgKey = filtroOrg ? `${filtroOrg.ids?.join(',') ?? ''}|${filtroOrg.sinClasificar ? 1 : 0}` : '';

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const params = { page, ordering: '-fecha_derivado' };
            // `anho_fecha_derivado` (no el filterset genérico `anho`) para que el conteo de filas
            // calce con el "Total" agregado por calcular_pac_jerarquia/calcular_pac_dentro_fuera_stats,
            // que filtran por el año calendario de fecha_derivado — ver FormularioFSCDerivadoViewSet.get_queryset.
            if (anho) params.anho_fecha_derivado = anho;
            if (search) params.search = search;
            if (filtro) params.dentro_fuera_pac = filtro;
            if (filtroOrg?.ids?.length) params.sso_departamento_in = filtroOrg.ids.join(',');
            if (filtroOrg?.sinClasificar) params.sin_clasificar = 1;
            const { data: res } = await getFormulariosPac(params);
            setData({ results: res.results ?? res, count: res.count ?? (res.results ?? res).length });
        } catch (_) {
            setData({ results: [], count: 0 });
        } finally {
            setCargando(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anho, page, search, filtro, orgKey]);

    useEffect(() => { setPage(1); }, [anho, search, filtro, orgKey]);
    useEffect(() => { cargar(); }, [cargar]);

    const totalPaginas = Math.max(1, Math.ceil(data.count / 50));

    return (
        <div id={sectionId} style={cardStyle}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                    <div style={sectionTitle}>📋 Formularios — detalle y revisión</div>
                    <div style={sectionSub}>
                        {filtroOrg
                            ? `Filtrado a: ${filtroOrg.label}`
                            : 'Todos los registros del período, con clasificación organizacional para identificar "Sin Clasificar"'}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar folio, unidad, requerimiento…"
                        style={{ border: '1.5px solid #c8d3de', borderRadius: 7, padding: '6px 10px', fontSize: 12, minWidth: 200 }}
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                        {FILTROS.map((f) => (
                            <button
                                key={f.key}
                                onClick={() => setFiltro(f.key)}
                                style={{
                                    padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                    border: '1px solid ' + (filtro === f.key ? '#0ea5e9' : '#e2e8f0'),
                                    background: filtro === f.key ? '#e0f2fe' : '#fff',
                                    color: filtro === f.key ? '#0369a1' : '#64748b',
                                }}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {filtroOrg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', background: '#f5f3ff', borderBottom: '1px solid #ede9fe' }}>
                    <span style={{ fontSize: 12, color: '#5b21b6' }}>🔎 Filtrando por: <strong>{filtroOrg.label}</strong></span>
                    {onClearFiltroOrg && (
                        <button
                            onClick={onClearFiltroOrg}
                            style={{ padding: '2px 10px', background: '#fff', border: '1px solid #c4b5fd', borderRadius: 20, color: '#7c3aed', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                        >
                            ✕ Quitar filtro
                        </button>
                    )}
                </div>
            )}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {['Formulario', 'Fecha Derivado', 'Unidad Requirente', 'Depto/Subdirección', 'Comprador', 'Estado', 'PAC', 'Monto', ''].map((h) => (
                                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {cargando ? (
                            <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Cargando…</td></tr>
                        ) : data.results.length === 0 ? (
                            <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Sin formularios para el filtro seleccionado.</td></tr>
                        ) : data.results.map((f) => (
                            <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 600, color: '#0369a1' }}>{f.id_formulario || `#${f.folio}`}</td>
                                <td style={{ padding: '7px 10px' }}>{f.fecha_derivado || '—'}</td>
                                <td style={{ padding: '7px 10px', maxWidth: 200 }}><div className="truncate-text" title={f.unidad_requirente}>{f.unidad_requirente}</div></td>
                                <td style={{ padding: '7px 10px', maxWidth: 180 }}>
                                    {f.sso_departamento_nombre
                                        ? <div className="truncate-text" title={f.sso_departamento_nombre}>{f.sso_departamento_nombre}</div>
                                        : <span style={{ color: '#b45309', fontWeight: 600 }} title="unidad_requirente sin match — revisar en BD">⚠️ Sin Clasificar</span>}
                                </td>
                                <td style={{ padding: '7px 10px' }}>{f.comprador || '—'}</td>
                                <td style={{ padding: '7px 10px' }}>{f.estado_compra || '—'}</td>
                                <td style={{ padding: '7px 10px' }}>
                                    <span style={{
                                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                                        background: f.dentro_fuera_pac === 'DENTRO' ? '#dcfce7' : f.dentro_fuera_pac === 'FUERA' ? '#fee2e2' : '#f1f5f9',
                                        color: f.dentro_fuera_pac === 'DENTRO' ? '#15803d' : f.dentro_fuera_pac === 'FUERA' ? '#b91c1c' : '#64748b',
                                    }}>
                                        {f.dentro_fuera_pac === 'DENTRO' ? 'Dentro' : f.dentro_fuera_pac === 'FUERA' ? 'Fuera' : 'Sin evaluar'}
                                    </span>
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 500 }}>{fmtCLP(f.monto_estimado)}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                    <button
                                        onClick={() => setModalFsc(f)}
                                        title="Ver documento completo"
                                        style={{ padding: '4px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, color: '#0369a1', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    >
                                        🔍 Revisar
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#64748b' }}>
                <span>{data.count} formulario(s)</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Anterior</button>
                    <span>Página {page} de {totalPaginas}</span>
                    <button className="page-btn" disabled={page >= totalPaginas} onClick={() => setPage((p) => p + 1)}>Siguiente ›</button>
                </div>
            </div>

            <ModalRevisionFsc formulario={modalFsc} onCerrar={() => setModalFsc(null)} />
        </div>
    );
}
