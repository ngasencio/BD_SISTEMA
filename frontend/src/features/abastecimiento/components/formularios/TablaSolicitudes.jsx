// Tabla "Solicitudes FSC": todos los formularios, filtrables por bandeja de visación.
import { useState } from 'react';
import './formularios.css';
import { getFormularios } from '../../api/formulariosApi';
import { useListaServidor } from './useListaServidor';
import { ESTADO_FSC_INFO, diasDesde, fmtCLP, fmtFecha, fmtN } from './shared';
import { DiasChip, EstadoChip, FilaEstado, FiltroChip, InfoTooltip, Pagination, PlanChip, SearchBox, SortTh } from './ui';
import FichaFormularioModal from './FichaFormularioModal';

export default function TablaSolicitudes({ filtroBandeja, onFiltroChange, anioSeleccionado, subdireccionSel, deptoSel, tablaRef }) {
    const filtros = {
        ...(filtroBandeja?.length ? { estado: filtroBandeja.join(',') } : {}),
        ...(anioSeleccionado ? { anho: anioSeleccionado } : {}),
        ...(subdireccionSel === 'sin_clasificar'
            ? { sin_clasificar: 1 }
            : deptoSel ? { depto: deptoSel } : subdireccionSel ? { subdireccion: subdireccionSel } : {}),
    };
    const { search, setSearch, ordering, setOrdering, page, setPage, data, cargando, error } =
        useListaServidor(getFormularios, '-fecha_solicitud', Object.keys(filtros).length ? filtros : null);
    const [fichaId, setFichaId] = useState(null);
    const orden = { ordering, setOrdering };

    const alternarBandeja = (codigo) => {
        const actual = filtroBandeja || [];
        onFiltroChange(actual.includes(codigo) ? actual.filter((c) => c !== codigo) : [...actual, codigo]);
    };

    return (
        <>
            {fichaId && <FichaFormularioModal origen="solicitud" id={fichaId} onCerrar={() => setFichaId(null)} />}

            <div className="frm-toolbar" ref={tablaRef}>
                <SearchBox value={search} onChange={setSearch}
                           placeholder="Buscar por folio, unidad, usuario, requerimiento, especificaciones técnicas…" />
                <span className="frm-count">{fmtN(data.count)} solicitud(es)</span>
            </div>

            <div className="frm-pills">
                <span className="frm-pills__label">
                    Bandeja
                    <InfoTooltip text="Filtra las solicitudes por bandeja de visación. Puedes seleccionar varias bandejas a la vez." />
                </span>
                <FiltroChip activo={!filtroBandeja?.length} onClick={() => onFiltroChange([])}>Todas</FiltroChip>
                {Object.entries(ESTADO_FSC_INFO).map(([codigo, info]) => (
                    <FiltroChip key={codigo} punto activo={filtroBandeja?.includes(codigo)} color={info.color}
                                onClick={() => alternarBandeja(codigo)}
                                title={info.persona ? `${info.nombre} (${info.persona})` : info.nombre}>
                        {codigo} · {info.nombre}
                        {info.persona && <em>({info.persona})</em>}
                    </FiltroChip>
                ))}
            </div>

            <div className="frm-table-wrap">
                <table className="dv-table frm-table">
                    <thead>
                        <tr>
                            <SortTh label="ID" campo="folio" {...orden} tip="Tipo de formulario + folio + año (Fn-XXX-AA)" />
                            <SortTh label="Solicitud" campo="fecha_solicitud" {...orden} />
                            <SortTh label="Unidad requirente" campo="unidad_requirente" {...orden} />
                            <SortTh label="Usuario" campo="usuario_requirente" {...orden} />
                            <SortTh label="Monto estimado" campo="monto_estimado" {...orden} align="right" />
                            <th className="is-center">Días<InfoTooltip text="Días corridos desde la fecha de solicitud hasta hoy." /></th>
                            <SortTh label="Bandeja" campo="estado" {...orden} tip="Bandeja de visación en la que está hoy el formulario." />
                            <th>Plan<InfoTooltip text="ID del Plan de Compras que declara el formulario. «Sin plan» indica que no declara ninguno." /></th>
                            <SortTh label="En bandeja de" campo="destino_actual" {...orden} tip="Persona que tiene hoy el formulario en su bandeja." />
                            <th className="is-center"><span className="frm-sr">Ficha</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {cargando ? <FilaEstado colSpan={10}>Cargando solicitudes…</FilaEstado>
                            : error ? <FilaEstado colSpan={10} error>No fue posible cargar las solicitudes.</FilaEstado>
                            : data.results.length === 0 ? <FilaEstado colSpan={10}>No se encontraron solicitudes con los filtros aplicados.</FilaEstado>
                            : data.results.map((f) => (
                                <tr key={f.id}>
                                    <td><span className="frm-id">{f.id_formulario || `#${f.folio}`}</span></td>
                                    <td>{fmtFecha(f.fecha_solicitud)}</td>
                                    <td><div className="frm-trunc" title={f.unidad_requirente}>{f.unidad_requirente || '—'}</div></td>
                                    <td><div className="frm-trunc frm-trunc--sm" title={f.usuario_requirente}>{f.usuario_requirente || '—'}</div></td>
                                    <td className="is-num is-strong">{fmtCLP(f.monto_estimado)}</td>
                                    <td className="is-center"><DiasChip dias={diasDesde(f.fecha_solicitud)} /></td>
                                    <td><EstadoChip codigo={f.estado} /></td>
                                    <td><PlanChip idPlan={f.id_plan} /></td>
                                    <td>{f.destino_actual
                                        ? <div className="frm-trunc frm-trunc--sm" title={f.destino_actual}>{f.destino_actual}</div>
                                        : <span className="frm-muted">—</span>}</td>
                                    <td className="is-center">
                                        <button type="button" className="dv-btn frm-btn-ver" onClick={() => setFichaId(f.id)}
                                                title="Ver la ficha completa del formulario">Ver</button>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
            <Pagination page={page} setPage={setPage} count={data.count} />
        </>
    );
}
