import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { getGestorSolicitudes, getGestorSolicitudProductos } from '../../api/gestorComprasApi';
import ModalDocumentoGestor from './ModalDocumentoGestor';
import {
    DiasBadge, ESTADO_FSC_INFO, EstadoFSCBadge, FiltroChip, InfoTooltip, PacBadge, SortableTh,
    BarraPaginacion, diasDesde, fmtCLP, fmtN, thStyle, useListaServidor,
} from './shared';

// Tabla "Solicitudes FSC" del departamento — copia de TablaSolicitudes de Formularios FSC, de
// solo lectura y sin el filtro Subdirección/Departamento (el alcance ya lo fija el servidor).
// Agrega "Exportar Excel": trae TODAS las filas del filtro actual (no solo la página visible).
export default function TablaSolicitudesGestor({ params, filtroBandeja, onFiltroChange, anho, tablaRef }) {
    const filtros = useMemo(() => ({
        ...params,
        ...(filtroBandeja?.length ? { estado: filtroBandeja.join(',') } : {}),
        ...(anho ? { anho } : {}),
    }), [params, filtroBandeja, anho]);

    const { search, setSearch, ordering, setOrdering, page, setPage, data, cargando } =
        useListaServidor(getGestorSolicitudes, '-fecha_solicitud', filtros);

    const [modalDoc, setModalDoc] = useState(null);
    const [exportando, setExportando] = useState(false);

    const exportarExcel = async () => {
        setExportando(true);
        try {
            const filas = [];
            for (let p = 1; ; p += 1) {
                const { data: res } = await getGestorSolicitudes({ search: search || undefined, ordering, page: p, ...filtros });
                filas.push(...(res.results ?? []));
                if (!res.next) break;
            }
            const hoja = XLSX.utils.json_to_sheet(filas.map((f) => ({
                'ID Formulario': f.id_formulario,
                'Año': f.anho,
                'Fecha Solicitud': f.fecha_solicitud,
                'Días': diasDesde(f.fecha_solicitud),
                'Unidad Requirente': f.unidad_requirente,
                'Usuario Requirente': f.usuario_requirente,
                'Monto Estimado': f.monto_estimado || 0,
                'Bandeja': ESTADO_FSC_INFO[f.estado]?.nombre || f.estado,
                'Destino Actual': f.destino_actual || '',
                'ID Plan': f.id_plan || '',
                'Requerimiento': f.requerimiento || '',
            })));
            hoja['!cols'] = [12, 6, 14, 6, 34, 26, 14, 26, 26, 16, 50].map((wch) => ({ wch }));
            const libro = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(libro, hoja, 'Solicitudes FSC');
            XLSX.writeFile(libro, `solicitudes_fsc_${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch {
            window.alert('No fue posible exportar las solicitudes.');
        } finally {
            setExportando(false);
        }
    };

    return (
        <>
            {modalDoc && (
                <ModalDocumentoGestor
                    formulario={modalDoc}
                    cargarProductos={(id) => getGestorSolicitudProductos(id, params)}
                    onCerrar={() => setModalDoc(null)}
                />
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }} ref={tablaRef}>
                <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
                    <input
                        style={{ width: '100%', padding: '9px 14px 9px 36px', border: '1.5px solid #e2e8f0', borderRadius: 24, fontSize: 13, color: '#1e293b', background: '#f8fafc', outline: 'none', boxSizing: 'border-box' }}
                        placeholder="Buscar por folio, usuario, requerimiento, especificaciones técnicas…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', background: '#f1f5f9', padding: '6px 12px', borderRadius: 20, fontWeight: 600 }}>
                    {fmtN(data.count)} solicitud(es)
                </span>
                <button
                    onClick={exportarExcel}
                    disabled={exportando || data.count === 0}
                    style={{ padding: '7px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', cursor: (exportando || !data.count) ? 'not-allowed' : 'pointer', opacity: (exportando || !data.count) ? 0.5 : 1 }}
                >
                    {exportando ? '⏳ Exportando…' : '📥 Exportar Excel'}
                </button>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                    Bandeja
                    <InfoTooltip text="Filtra las solicitudes por bandeja de visación. Puede seleccionar varias a la vez." />
                    :
                </span>
                <FiltroChip activo={!filtroBandeja?.length} onClick={() => onFiltroChange([])}>Todas</FiltroChip>
                {Object.entries(ESTADO_FSC_INFO).map(([codigo, info]) => (
                    <FiltroChip
                        key={codigo}
                        activo={filtroBandeja?.includes(codigo)}
                        color={info.color}
                        title={info.persona ? `${info.nombre} (${info.persona})` : info.nombre}
                        onClick={() => {
                            const actual = filtroBandeja || [];
                            onFiltroChange(actual.includes(codigo) ? actual.filter((c) => c !== codigo) : [...actual, codigo]);
                        }}
                    >
                        {codigo} · {info.nombre}
                        {info.persona && <em style={{ fontStyle: 'italic', opacity: 0.75, marginLeft: 4 }}>({info.persona})</em>}
                    </FiltroChip>
                ))}
            </div>

            <div className="table-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <SortableTh label="ID / Folio" campo="folio" ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Año" campo="anho" ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Fecha Solicitud" campo="fecha_solicitud" ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Unidad Requirente" campo="unidad_requirente" ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Monto Estimado" campo="monto_estimado" ordering={ordering} setOrdering={setOrdering} align="right" />
                            <th style={{ ...thStyle, textAlign: 'center' }} title="Días desde la fecha de solicitud hasta hoy">Días</th>
                            <SortableTh label="Bandeja" campo="estado" ordering={ordering} setOrdering={setOrdering} tip="Bandeja de visación actual del formulario" />
                            <th style={{ ...thStyle, textAlign: 'center' }} title="Indica si el formulario tiene un ID de Plan de Compras (id_plan) asociado">
                                PAC
                                <InfoTooltip text="Verde: el formulario declara un ID de Plan de Compras (id_plan). Rojo: no tiene ID de Plan asociado." />
                            </th>
                            <SortableTh label="Destino Actual" campo="destino_actual" ordering={ordering} setOrdering={setOrdering} tip="Persona que actualmente tiene el formulario en su bandeja" />
                            <th style={{ ...thStyle, textAlign: 'center' }}>Documento</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cargando ? (
                            <tr><td colSpan={10} className="loading-spinner-sm" style={{ textAlign: 'center', padding: 24 }}>Cargando solicitudes…</td></tr>
                        ) : data.results.length === 0 ? (
                            <tr><td colSpan={10} style={{ textAlign: 'center', padding: 28, color: '#94a3b8', fontSize: 13 }}>No se encontraron solicitudes.</td></tr>
                        ) : data.results.map((f, i) => (
                            <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                <td style={{ padding: '8px 10px' }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12, color: '#7c3aed', background: '#f5f3ff', padding: '2px 7px', borderRadius: 5 }} title="ID generado: tipo de formulario + folio + año">
                                        {f.id_formulario || `#${f.folio}`}
                                    </span>
                                </td>
                                <td style={{ padding: '8px 10px', fontSize: 13, color: '#374151' }}>{f.anho}</td>
                                <td style={{ padding: '8px 10px', fontSize: 13, color: '#374151' }}>{f.fecha_solicitud || '—'}</td>
                                <td style={{ padding: '8px 10px', maxWidth: 220 }}><div className="truncate-text" title={f.unidad_requirente} style={{ fontSize: 13, color: '#374151' }}>{f.unidad_requirente}</div></td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, color: '#374151', fontWeight: 500 }}>{fmtCLP(f.monto_estimado)}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}><DiasBadge dias={diasDesde(f.fecha_solicitud)} compact /></td>
                                <td style={{ padding: '8px 10px' }}><EstadoFSCBadge codigo={f.estado} /></td>
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}><PacBadge idPlan={f.id_plan} /></td>
                                <td style={{ padding: '8px 10px', maxWidth: 160 }}>
                                    {f.destino_actual
                                        ? <div className="truncate-text" title={f.destino_actual} style={{ fontSize: 12, color: '#5b21b6' }}>👤 {f.destino_actual}</div>
                                        : <span style={{ color: '#94a3b8' }}>—</span>}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                    <button
                                        onClick={() => setModalDoc(f)}
                                        title="Ver documento completo"
                                        style={{ padding: '4px 12px', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 6, color: '#7c3aed', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    >
                                        📄 Ver
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
