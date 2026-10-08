// Tabla "Derivados a Comprador": formularios que ya pasaron a gestión de compra.
import { useState } from 'react';
import './formularios.css';
import { getFormulariosDerivados } from '../../api/formulariosApi';
import { useListaServidor } from './useListaServidor';
import { fmtCLP, fmtFecha, fmtN } from './shared';
import { Chip, FilaEstado, FiltroChip, InfoTooltip, Pagination, SearchBox, SortTh } from './ui';
import FichaFormularioModal from './FichaFormularioModal';

// Punto de color por estado de compra: tokens DV (no hay un set de colores por estado, el catálogo es libre).
const COLORES_ESTADO_COMPRA = [
    'var(--dv-group-1)', 'var(--dv-group-2)', 'var(--dv-group-3)', 'var(--dv-group-4)',
    'var(--dv-ok)', 'var(--dv-warn)', 'var(--dv-scale-high)', 'var(--dv-watch)',
];

export default function TablaDerivados({ opcionesEstadoCompra, anioSeleccionado }) {
    const [filtroEstadoCompra, setFiltroEstadoCompra] = useState('');
    const [fichaId, setFichaId] = useState(null);
    const filtros = {
        ...(filtroEstadoCompra ? { estado_compra: filtroEstadoCompra } : {}),
        ...(anioSeleccionado ? { anho: anioSeleccionado } : {}),
    };
    const { search, setSearch, ordering, setOrdering, page, setPage, data, cargando, error } =
        useListaServidor(getFormulariosDerivados, '-fecha_derivado', Object.keys(filtros).length ? filtros : null);
    const orden = { ordering, setOrdering };
    const colorEstado = (estado) =>
        COLORES_ESTADO_COMPRA[Math.max(0, (opcionesEstadoCompra || []).indexOf(estado)) % COLORES_ESTADO_COMPRA.length];

    return (
        <>
            {fichaId && <FichaFormularioModal origen="derivado" id={fichaId} onCerrar={() => setFichaId(null)} />}

            <div className="frm-toolbar">
                <SearchBox value={search} onChange={setSearch}
                           placeholder="Buscar por folio, unidad, comprador, objetivo de compra…" />
                <span className="frm-count">{fmtN(data.count)} derivado(s)</span>
            </div>

            {opcionesEstadoCompra?.length > 0 && (
                <div className="frm-pills">
                    <span className="frm-pills__label">
                        Estado de compra
                        <InfoTooltip text="Filtra los formularios derivados según el estado de gestión de la compra asignado por el comprador." />
                    </span>
                    <FiltroChip activo={!filtroEstadoCompra} onClick={() => setFiltroEstadoCompra('')}>Todos</FiltroChip>
                    {opcionesEstadoCompra.map((e) => (
                        <FiltroChip key={e} punto activo={filtroEstadoCompra === e} color={colorEstado(e)}
                                    onClick={() => setFiltroEstadoCompra(filtroEstadoCompra === e ? '' : e)}>
                            {e}
                        </FiltroChip>
                    ))}
                </div>
            )}

            <div className="frm-table-wrap">
                <table className="dv-table frm-table">
                    <thead>
                        <tr>
                            <SortTh label="ID" campo="folio" {...orden} tip="Tipo de formulario + folio + año (Fn-XXX-AA)" />
                            <SortTh label="Derivado" campo="fecha_derivado" {...orden} />
                            <SortTh label="Unidad requirente" campo="unidad_requirente" {...orden} />
                            <SortTh label="Comprador" campo="comprador" {...orden} />
                            <SortTh label="Monto estimado" campo="monto_estimado" {...orden} align="right" />
                            <SortTh label="Estado de compra" campo="estado_compra" {...orden} />
                            <th>PAC<InfoTooltip text="Dentro/Fuera del Plan Anual de Compras, verificado contra el maestro de proyectos PAC." /></th>
                            <th className="is-center"><span className="frm-sr">Ficha</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {cargando ? <FilaEstado colSpan={8}>Cargando derivados…</FilaEstado>
                            : error ? <FilaEstado colSpan={8} error>No fue posible cargar los derivados.</FilaEstado>
                            : data.results.length === 0 ? <FilaEstado colSpan={8}>No se encontraron derivados con los filtros aplicados.</FilaEstado>
                            : data.results.map((f) => (
                                <tr key={f.id}>
                                    <td><span className="frm-id">{f.id_formulario || `#${f.folio}`}</span></td>
                                    <td>{fmtFecha(f.fecha_derivado)}</td>
                                    <td>
                                        <div className="frm-trunc" title={f.unidad_requirente}>{f.unidad_requirente || '—'}</div>
                                        {f.sso_departamento_nombre && <span className="frm-sub frm-trunc" title={f.sso_departamento_nombre}>{f.sso_departamento_nombre}</span>}
                                    </td>
                                    <td><div className="frm-trunc frm-trunc--sm" title={f.comprador}>{f.comprador || '—'}</div></td>
                                    <td className="is-num is-strong">{fmtCLP(f.monto_estimado)}</td>
                                    <td>{f.estado_compra
                                        ? <span className="dv-chip frm-chip-neutral"><span className="dv-chip__dot" style={{ color: colorEstado(f.estado_compra) }} />{f.estado_compra}</span>
                                        : <span className="frm-muted">—</span>}</td>
                                    <td>{f.dentro_fuera_pac
                                        ? <Chip variante={f.dentro_fuera_pac === 'DENTRO' ? 'ok' : 'warn'}>{f.dentro_fuera_pac === 'DENTRO' ? 'Dentro' : 'Fuera'}</Chip>
                                        : <span className="frm-muted">—</span>}</td>
                                    <td className="is-center">
                                        <button type="button" className="dv-btn frm-btn-ver" onClick={() => setFichaId(f.id)}
                                                title="Ver la ficha completa, con la gestión de compra y las órdenes de compra enlazadas">Ver</button>
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
