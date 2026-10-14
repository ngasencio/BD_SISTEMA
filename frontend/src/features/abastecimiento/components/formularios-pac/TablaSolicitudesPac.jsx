// Tabla «Solicitudes PAC»: todas las fichas, filtrables por bandeja y por acción.
import { useState } from 'react';
import '../formularios/formularios.css';
import './formularios-pac.css';
import { getFormulariosPac } from '../../api/formulariosPacApi';
import { useListaServidor } from '../formularios/useListaServidor';
import { fmtCLP, fmtFecha, fmtN } from '../formularios/shared';
import { DiasChip, FilaEstado, FiltroChip, InfoTooltip, Pagination, SearchBox, SortTh } from '../formularios/ui';
import { AccionPacChip, EstadoPacChip } from './uiPac';
import { ACCIONES_PAC, ACCION_PAC_INFO, ESTADO_PAC_INFO, tituloFichaPac } from './sharedPac';
import FichaPacModal from './FichaPacModal';

const COLUMNAS = 9;

export default function TablaSolicitudesPac({
    filtros, filtroBandeja, onFiltroBandejaChange, filtroAccion, onFiltroAccionChange, tablaRef,
}) {
    const params = {
        ...(filtros || {}),
        ...(filtroBandeja?.length ? { estado: filtroBandeja.join(',') } : {}),
        ...(filtroAccion?.length ? { accion_proyecto: filtroAccion.join(',') } : {}),
    };
    const { search, setSearch, ordering, setOrdering, page, setPage, data, cargando, error } =
        useListaServidor(getFormulariosPac, '-fecha_ficha', Object.keys(params).length ? params : null);
    const [fichaId, setFichaId] = useState(null);
    const orden = { ordering, setOrdering };

    const alternar = (lista, onChange, valor) =>
        onChange(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);

    return (
        <>
            {fichaId && <FichaPacModal id={fichaId} onCerrar={() => setFichaId(null)} />}

            <div className="frm-toolbar" ref={tablaRef}>
                <SearchBox value={search} onChange={setSearch}
                           placeholder="Buscar por folio, departamento, proyecto, responsable, identificador…" />
                <span className="frm-count">{fmtN(data.count)} ficha(s)</span>
            </div>

            <div className="frm-pills">
                <span className="frm-pills__label">
                    Bandeja
                    <InfoTooltip text="Filtra las fichas por bandeja de visación. Puedes seleccionar varias a la vez." />
                </span>
                <FiltroChip activo={!filtroBandeja?.length} onClick={() => onFiltroBandejaChange([])}>Todas</FiltroChip>
                {Object.entries(ESTADO_PAC_INFO).map(([codigo, info]) => (
                    <FiltroChip key={codigo} punto activo={filtroBandeja?.includes(codigo)} color={info.color}
                                onClick={() => alternar(filtroBandeja || [], onFiltroBandejaChange, codigo)} title={info.detalle}>
                        {codigo} · {info.nombre}
                    </FiltroChip>
                ))}
            </div>

            <div className="frm-pills">
                <span className="frm-pills__label">
                    Acción
                    <InfoTooltip text="Qué pide la ficha: crear un proyecto nuevo, modificar uno del plan o eliminarlo." />
                </span>
                <FiltroChip activo={!filtroAccion?.length} onClick={() => onFiltroAccionChange([])}>Todas</FiltroChip>
                {ACCIONES_PAC.map((a) => (
                    <FiltroChip key={a} activo={filtroAccion?.includes(a)} title={ACCION_PAC_INFO[a].detalle}
                                onClick={() => alternar(filtroAccion || [], onFiltroAccionChange, a)}>
                        {a}
                    </FiltroChip>
                ))}
            </div>

            <div className="frm-table-wrap">
                <table className="dv-table frm-table">
                    <thead>
                        <tr>
                            <SortTh label="ID" campo="folio" {...orden} tip="Folio de la ficha en el Panel + año (PAC-folio-AA)." />
                            <SortTh label="Fecha" campo="fecha_ficha" {...orden} />
                            <SortTh label="Departamento y responsable" campo="departamento" {...orden} />
                            <SortTh label="Acción" campo="accion_proyecto" {...orden} />
                            <SortTh label="Proyecto" campo="nombre_proyecto" {...orden} />
                            <SortTh label="Monto" campo="monto" {...orden} align="right" tip="Efecto neto declarado por la ficha; puede ser negativo (rebaja) o vacío (eliminar)." />
                            <th className="is-center">Días<InfoTooltip text="Días en trámite desde la fecha de la ficha. Solo mientras está en P, FR, FA o AA." /></th>
                            <SortTh label="Bandeja" campo="estado" {...orden} />
                            <th className="is-center"><span className="frm-sr">Ficha</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {cargando ? <FilaEstado colSpan={COLUMNAS}>Cargando fichas…</FilaEstado>
                            : error ? <FilaEstado colSpan={COLUMNAS} error>No fue posible cargar las fichas.</FilaEstado>
                            : data.results.length === 0 ? <FilaEstado colSpan={COLUMNAS}>No se encontraron fichas con los filtros aplicados.</FilaEstado>
                            : data.results.map((f) => (
                                <tr key={f.id}>
                                    <td className="is-nowrap">
                                        <span className="frm-id">{f.id_ficha}</span>
                                        {f.n_lineas > 0 && <span className="frm-sub">{f.n_lineas} línea(s) de carro</span>}
                                    </td>
                                    <td className="is-nowrap">{fmtFecha(f.fecha_ficha)}</td>
                                    <td>
                                        <div className="frm-trunc" title={f.departamento}>{f.departamento || '—'}</div>
                                        {f.nombre_responsable && <span className="frm-sub" title="Responsable de la ficha">{f.nombre_responsable}</span>}
                                    </td>
                                    <td><AccionPacChip accion={f.accion_proyecto} /></td>
                                    <td>
                                        <div className="frm-trunc" title={tituloFichaPac(f)}>{tituloFichaPac(f) || '—'}</div>
                                        {f.nombre_proyecto && f.identificador_proyecto && (
                                            <span className="frm-sub" title="Proyecto del plan al que apunta la ficha">→ {f.identificador_proyecto}</span>
                                        )}
                                    </td>
                                    <td className="is-num is-strong is-nowrap">{f.monto != null ? fmtCLP(f.monto) : <span className="frm-muted">—</span>}</td>
                                    <td className="is-center"><DiasChip dias={f.dias_en_tramite} /></td>
                                    <td><EstadoPacChip codigo={f.estado} /></td>
                                    <td className="is-center">
                                        <button type="button" className="dv-btn frm-btn-ver" onClick={() => setFichaId(f.id)}
                                                title="Ver la ficha completa">Ver</button>
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
