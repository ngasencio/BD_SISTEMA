import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    getGestorDerivacion, getGestorDerivacionProductos, getGestorDerivaciones, getGestorProcesoDetalleMp,
    getGestorProcesos, getGestorResumen,
} from '../api/gestorComprasApi';
import ResumenComprador from '../../compras/components/ResumenComprador';
import FormulariosTable from '../../compras/components/FormulariosTable';
import VerProcesoModal from '../../compras/components/VerProcesoModal';
import ModalDocumentoGestor from './solicitudes/ModalDocumentoGestor';
import ProcesoDetalleGestor from './derivacion/ProcesoDetalleGestor';
import { BarraPaginacion, FiltroChip, fmtN, thStyle, useListaServidor } from './solicitudes/shared';
import { ESTADO_COLOR, colorPorTipo, estadoLabel, tipoLabel } from '../../compras/constants/estadosProceso';

const fmtFecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function ChipSimple({ color, children }) {
    return (
        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', background: `${color}1f`, color, border: `1px solid ${color}55` }}>
            {children}
        </span>
    );
}

// Tabla de los procesos de compra del departamento — todos los compradores.
function TablaProcesos({ params, onVerProceso }) {
    // Orden fijo por última actualización (más reciente primero).
    const { search, setSearch, page, setPage, data, cargando } =
        useListaServidor(getGestorProcesos, '-actualizado_en', params);

    return (
        <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <input
                    style={{ flex: 1, minWidth: 220, padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 24, fontSize: 13, background: '#f8fafc', outline: 'none' }}
                    placeholder="Buscar por título…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <span style={{ fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '6px 12px', borderRadius: 20, fontWeight: 600 }}>
                    {fmtN(data.count)} proceso(s)
                </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr>
                            <th style={thStyle}>Proceso</th>
                            <th style={thStyle}>Tipo</th>
                            <th style={thStyle}>Estado</th>
                            <th style={thStyle}>Comprador</th>
                            <th style={{ ...thStyle, textAlign: 'center' }}>FSC</th>
                            <th style={{ ...thStyle, textAlign: 'center' }}>OC</th>
                            <th style={thStyle}>Actualizado</th>
                            <th style={thStyle} />
                        </tr>
                    </thead>
                    <tbody>
                        {cargando ? (
                            <tr><td colSpan={8} className="loading-spinner-sm" style={{ textAlign: 'center', padding: 24 }}>Cargando procesos…</td></tr>
                        ) : data.results.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: 28, color: '#94a3b8', fontSize: 13 }}>
                                Aún no hay procesos de compra para los formularios de este departamento.
                            </td></tr>
                        ) : data.results.map((p, i) => (
                            <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                <td style={{ padding: '8px 10px', maxWidth: 280 }}>
                                    <div className="truncate-text" title={p.titulo} style={{ fontWeight: 600, color: '#1e293b' }}>{p.titulo}</div>
                                </td>
                                <td style={{ padding: '8px 10px' }}><ChipSimple color={colorPorTipo(p.tipo_proceso)}>{tipoLabel(p.tipo_proceso)}</ChipSimple></td>
                                <td style={{ padding: '8px 10px' }}><ChipSimple color={ESTADO_COLOR(p.estado_proceso)}>{estadoLabel(p.estado_proceso)}</ChipSimple></td>
                                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: '#374151' }}>{p.comprador_nombre || '—'}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', color: '#374151' }}>{p.n_formularios}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', color: '#374151' }}>{p.n_ordenes_compra}</td>
                                <td style={{ padding: '8px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtFecha(p.actualizado_en)}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                    <button type="button" className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => onVerProceso(p.id)}>
                                        Ver proceso
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <BarraPaginacion page={page} setPage={setPage} count={data.count} />
        </>
    );
}

// Formularios derivados a comprador del departamento (abiertos / finalizados).
function TablaDerivaciones({ params, finalizados, onVer, onVerProceso }) {
    const filtros = useMemo(() => ({ ...params, ...(finalizados ? { finalizados: 1 } : {}) }), [params, finalizados]);
    const { search, setSearch, page, setPage, data, cargando } =
        useListaServidor(getGestorDerivaciones, '-fecha_derivado', filtros);

    return (
        <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <input
                    style={{ flex: 1, minWidth: 220, padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 24, fontSize: 13, background: '#f8fafc', outline: 'none' }}
                    placeholder="Buscar por folio, requerimiento, comprador…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <span style={{ fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '6px 12px', borderRadius: 20, fontWeight: 600 }}>
                    {fmtN(data.count)} formulario(s)
                </span>
            </div>
            <FormulariosTable
                data={data.results}
                cargando={cargando}
                emptyMessage={finalizados
                    ? 'Aún no hay formularios finalizados en este departamento.'
                    : "No hay formularios de este departamento en la bandeja 'A Comprador'."}
                onVer={onVer}
                soloLectura
                mostrarComprador
                onVerProceso={onVerProceso}
            />
            <BarraPaginacion page={page} setPage={setPage} count={data.count} />
        </>
    );
}

// Tab Derivación a Comprador: lo que ocurre con los formularios del departamento una vez
// derivados a un comprador. Mismas vistas que ve el comprador en "Mis Formularios" —
// plazos de Mercado Público, gestión interna, procesos por tipo y estado— pero de TODOS los
// compradores del departamento y estrictamente de solo lectura: se puede abrir cada
// formulario y cada proceso (con sus observaciones), no modificar nada.
export default function TabDerivacion({ params }) {
    const [resumen, setResumen] = useState(null);
    const [cargandoResumen, setCargandoResumen] = useState(true);
    const [vista, setVista] = useState('abiertos');
    const [fscDetalle, setFscDetalle] = useState(null);
    const [procesoId, setProcesoId] = useState(null);
    const [procesoMp, setProcesoMp] = useState(null);

    useEffect(() => {
        let activo = true;
        setCargandoResumen(true);
        getGestorResumen(params)
            .then(({ data }) => { if (activo) setResumen(data); })
            .catch(() => { if (activo) setResumen(null); })
            .finally(() => { if (activo) setCargandoResumen(false); });
        return () => { activo = false; };
    }, [params]);

    // Abre el modal de un FSC derivado cargando su ficha completa (la fila de la tabla ya la
    // trae, pero el resumen y los procesos solo conocen el id).
    const abrirFsc = useCallback((id) => {
        getGestorDerivacion(id, params)
            .then(({ data }) => setFscDetalle(data))
            .catch(() => window.alert('No fue posible cargar el formulario.'));
    }, [params]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ResumenComprador
                data={resumen}
                cargando={cargandoResumen}
                soloLectura
                onGestionar={(f) => abrirFsc(f.id)}
                cargarDetalleMp={(id) => getGestorProcesoDetalleMp(id, params)}
            />

            <div className="card">
                <div className="card-header card-header-accent" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <span>📋</span>
                    <span className="card-title">Formularios derivados a comprador</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <FiltroChip activo={vista === 'abiertos'} onClick={() => setVista('abiertos')}>En gestión</FiltroChip>
                        <FiltroChip activo={vista === 'finalizados'} color="#16a34a" onClick={() => setVista('finalizados')}>Finalizados</FiltroChip>
                    </div>
                </div>
                <div style={{ padding: '14px 18px' }}>
                    <TablaDerivaciones
                        params={params}
                        finalizados={vista === 'finalizados'}
                        onVer={abrirFsc}
                        onVerProceso={setProcesoId}
                    />
                </div>
            </div>

            <div className="card">
                <div className="card-header card-header-accent">
                    <span>🗂️</span>
                    <span className="card-title">Procesos de compra del departamento</span>
                </div>
                <div style={{ padding: '14px 18px' }}>
                    <TablaProcesos params={params} onVerProceso={setProcesoId} />
                </div>
            </div>

            {fscDetalle && (
                <ModalDocumentoGestor
                    formulario={fscDetalle}
                    cargarProductos={(id) => getGestorDerivacionProductos(id, params)}
                    onCerrar={() => setFscDetalle(null)}
                />
            )}
            {procesoId && (
                <ProcesoDetalleGestor
                    procesoId={procesoId}
                    params={params}
                    onVerFsc={abrirFsc}
                    onVerMercadoPublico={(p) => setProcesoMp({ id: p.id, tipo_proceso: p.tipo_proceso, titulo: p.titulo, ordenes_compra_detalle: p.ordenes_compra_detalle })}
                    onCerrar={() => setProcesoId(null)}
                />
            )}
            {procesoMp && (
                <VerProcesoModal
                    proceso={procesoMp}
                    cargarDetalle={(id) => getGestorProcesoDetalleMp(id, params)}
                    onCerrar={() => setProcesoMp(null)}
                />
            )}
        </div>
    );
}
