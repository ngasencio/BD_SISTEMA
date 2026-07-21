import { useState, useEffect, useCallback } from 'react';
import { getFichasPac, getDepartamentosPac } from '../../../api/pacCumplimientoApi';
import { fmtCLP, fmtN } from '../../../utils/format';
import ModalFichaPac from './ModalFichaPac';

const cardStyle = { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };

const ESTADOS = [
    { key: '', label: 'Todos' },
    { key: 'EJECUTADO', label: '✅ Ejecutado' },
    { key: 'PENDIENTE', label: '⏳ Pendiente' },
    { key: 'ATRASADO', label: '⏰ Atrasado' },
    { key: 'SIN_FECHA', label: '❓ Sin fecha' },
];

const ESTADO_BADGE = {
    EJECUTADO: { bg: '#dcfce7', color: '#15803d' },
    PENDIENTE: { bg: '#fffbeb', color: '#b45309' },
    ATRASADO: { bg: '#fee2e2', color: '#b91c1c' },
    SIN_FECHA: { bg: '#f1f5f9', color: '#64748b' },
};

export default function VerFichaSubtab({ anho, sectionId, filtroExterno, onClearFiltroExterno }) {
    const [data, setData] = useState({ results: [], count: 0 });
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [estado, setEstado] = useState('');
    const [depto, setDepto] = useState('');
    const [departamentos, setDepartamentos] = useState([]);
    const [cargando, setCargando] = useState(false);
    const [fichaAbierta, setFichaAbierta] = useState(null);

    const filtroExternoKey = filtroExterno ? `${filtroExterno.deptoIds?.join(',') ?? ''}|${filtroExterno.subdireccionId ?? ''}` : '';

    useEffect(() => {
        getDepartamentosPac()
            .then(({ data: res }) => setDepartamentos((res.results ?? res).sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || ''))))
            .catch(() => setDepartamentos([]));
    }, []);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const params = { page };
            if (anho) params.anho = anho;
            if (search) params.search = search;
            if (estado) params.estado = estado;
            if (filtroExterno) {
                if (filtroExterno.deptoIds?.length) params.depto_in = filtroExterno.deptoIds.join(',');
                if (filtroExterno.subdireccionId != null) params.subdireccion = filtroExterno.subdireccionId;
            } else if (depto) {
                params.depto = depto;
            }
            const { data: res } = await getFichasPac(params);
            setData(res);
        } catch (_) {
            setData({ results: [], count: 0 });
        } finally {
            setCargando(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anho, page, search, estado, depto, filtroExternoKey]);

    useEffect(() => { setPage(1); }, [anho, search, estado, depto, filtroExternoKey]);
    useEffect(() => { cargar(); }, [cargar]);

    const totalPaginas = Math.max(1, Math.ceil(data.count / 50));

    return (
        <div id={sectionId} style={cardStyle}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>📋 Fichas del Plan Anual de Compras</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        {filtroExterno ? `Filtrado a: ${filtroExterno.label}` : 'Control total: ficha, formulario de compra vinculado y OC enlazada'} — {fmtN(data.count)} ficha(s)
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por proyecto o depto…"
                        style={{ border: '1.5px solid #c8d3de', borderRadius: 7, padding: '6px 10px', fontSize: 12, minWidth: 200 }}
                    />
                    <select
                        value={depto}
                        onChange={(e) => setDepto(e.target.value)}
                        disabled={!!filtroExterno}
                        title={filtroExterno ? 'Quita el filtro activo para usar este selector' : undefined}
                        style={{ border: '1.5px solid #c8d3de', borderRadius: 7, padding: '6px 10px', fontSize: 12, maxWidth: 220, opacity: filtroExterno ? 0.5 : 1 }}
                    >
                        <option value="">Todos los departamentos</option>
                        {departamentos.map((d) => (
                            <option key={d.id} value={d.id}>{d.descripcion}</option>
                        ))}
                    </select>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {ESTADOS.map((e) => (
                            <button
                                key={e.key}
                                onClick={() => setEstado(e.key)}
                                style={{
                                    padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                    border: '1px solid ' + (estado === e.key ? '#0ea5e9' : '#e2e8f0'),
                                    background: estado === e.key ? '#e0f2fe' : '#fff',
                                    color: estado === e.key ? '#0369a1' : '#64748b',
                                }}
                            >
                                {e.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {filtroExterno && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', background: '#f5f3ff', borderBottom: '1px solid #ede9fe' }}>
                    <span style={{ fontSize: 12, color: '#5b21b6' }}>🔎 Filtrando por: <strong>{filtroExterno.label}</strong></span>
                    {onClearFiltroExterno && (
                        <button
                            onClick={onClearFiltroExterno}
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
                            {['ID Proyecto', 'Nombre Proyecto', 'Depto / Subdirección', 'Responsable', 'Monto Total', 'Fecha Compra', 'Formulario', 'OC', 'Estado', ''].map((h) => (
                                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {cargando ? (
                            <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Cargando…</td></tr>
                        ) : data.results.length === 0 ? (
                            <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Sin fichas para el filtro seleccionado.</td></tr>
                        ) : data.results.map((f) => {
                            const badge = ESTADO_BADGE[f.estado_ejecucion] ?? ESTADO_BADGE.SIN_FECHA;
                            return (
                                <tr key={f.id_proyecto} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 600, color: '#0369a1' }}>{f.id_proyecto}</td>
                                    <td style={{ padding: '7px 10px', maxWidth: 220 }}><div className="truncate-text" title={f.nombre_proyecto}>{f.nombre_proyecto}</div></td>
                                    <td style={{ padding: '7px 10px', maxWidth: 200 }}>
                                        {f.depto_nombre
                                            ? <div className="truncate-text" title={f.depto_nombre}>{f.depto_nombre}</div>
                                            : <span style={{ color: '#b45309', fontWeight: 600 }} title="depto sin match — revisar en BD">⚠️ {f.depto_texto || 'Sin depto'}</span>}
                                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{f.subdireccion_nombre}</div>
                                    </td>
                                    <td style={{ padding: '7px 10px', maxWidth: 160 }}><div className="truncate-text" title={f.nombre_responsable}>{f.nombre_responsable}</div></td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 500 }}>{fmtCLP(f.monto_total)}</td>
                                    <td style={{ padding: '7px 10px' }}>{f.fecha_mas_proxima || '—'}</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>{f.tiene_formulario ? `✅ ${f.cantidad_formularios}` : '—'}</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>{f.tiene_oc ? `✅ ${f.cantidad_oc}` : '—'}</td>
                                    <td style={{ padding: '7px 10px' }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: badge.bg, color: badge.color }}>
                                            {f.estado_ejecucion}
                                        </span>
                                    </td>
                                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                        <button
                                            onClick={() => setFichaAbierta(f.id_proyecto)}
                                            title="Ver ficha completa"
                                            style={{ padding: '4px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, color: '#0369a1', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                        >
                                            🔍 Revisar
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#64748b' }}>
                <span>{fmtN(data.count)} ficha(s)</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Anterior</button>
                    <span>Página {page} de {totalPaginas}</span>
                    <button className="page-btn" disabled={page >= totalPaginas} onClick={() => setPage((p) => p + 1)}>Siguiente ›</button>
                </div>
            </div>

            <ModalFichaPac idProyecto={fichaAbierta} onCerrar={() => setFichaAbierta(null)} />
        </div>
    );
}
