// Carro de productos de las fichas PAC: análisis por categoría, ítem presupuestario y mes de
// ejecución, más el detalle de líneas. Barras y mes son filtros de la tabla de líneas.
import { useEffect, useState } from 'react';
import '../formularios/formularios.css';
import './formularios-pac.css';
import { getFormulariosPacCarro, getFormulariosPacProductos } from '../../api/formulariosPacApi';
import { useListaServidor } from '../formularios/useListaServidor';
import { fmtCLP, fmtN } from '../formularios/shared';
import { FilaEstado, FiltroChip, InfoTooltip, Pagination, SearchBox, SortTh } from '../formularios/ui';
import { BarraPac, EstadoPacChip } from './uiPac';
import {
    ACCIONES_PAC, ACCION_PAC_INFO, ALCANCES_CARRO, estadosDeAlcance, fmtMesIso, fmtMillones, pctDe,
} from './sharedPac';
import FichaPacModal from './FichaPacModal';

const TOP = 12;
const SIN = new Set(['Sin ítem', 'Sin mes', 'Sin categoría', 'Sin nombre']);

function Bloque({ titulo, nota, children, vacio }) {
    return (
        <section className="dv-panel frm-panel" style={{ marginBottom: 0 }}>
            <div className="frm-panel__head">
                <h3 className="frm-panel__title">{titulo}</h3>
                {nota && <span className="frm-panel__note">{nota}</span>}
            </div>
            <div className="frm-panel__body">{vacio ? <div className="frm-note">Sin datos para los filtros aplicados.</div> : children}</div>
        </section>
    );
}

export default function TabCarroPac({ filtros }) {
    const [alcance, setAlcance] = useState('vigentes');
    const [acciones, setAcciones] = useState([]);
    const [mes, setMes] = useState(null);
    const [categoria, setCategoria] = useState(null);
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(false);
    const [fichaId, setFichaId] = useState(null);

    const base = {
        ...(filtros || {}),
        estado: estadosDeAlcance(alcance).join(','),
        ...(acciones.length ? { accion: acciones.join(',') } : {}),
    };
    const claveBase = JSON.stringify(base);

    useEffect(() => { setMes(null); setCategoria(null); }, [claveBase]);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        setError(false);
        getFormulariosPacCarro(base)
            .then(({ data }) => { if (activo) setDatos(data); })
            .catch(() => { if (activo) { setDatos(null); setError(true); } })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [claveBase]);

    const filtrosLineas = {
        ...base,
        ...(mes && mes !== 'Sin mes' ? { mes } : {}),
        ...(categoria && !SIN.has(categoria) ? { categoria } : {}),
    };
    const { search, setSearch, ordering, setOrdering, page, setPage, data, cargando: cargandoLineas, error: errorLineas } =
        useListaServidor(getFormulariosPacProductos, 'folio', filtrosLineas);
    const orden = { ordering, setOrdering };

    const t = datos?.totales;
    const alternarAccion = (a) => setAcciones((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));

    const categorias = (datos?.por_categoria || []).slice(0, TOP);
    const items = (datos?.por_item || []).slice(0, TOP);
    const meses = datos?.por_mes || [];
    const maxCat = Math.max(0, ...categorias.map((c) => Math.abs(c.monto)));
    const maxItem = Math.max(0, ...items.map((c) => Math.abs(c.monto)));
    const maxMes = Math.max(0, ...meses.map((c) => Math.abs(c.monto)));

    return (
        <>
            {fichaId && <FichaPacModal id={fichaId} onCerrar={() => setFichaId(null)} />}

            <section className="dv-panel frm-panel">
                <div className="frm-panel__head">
                    <h2 className="frm-panel__title">Carro de productos PAC</h2>
                    <span className="frm-panel__note">Lo que los departamentos planifican comprar: productos de las fichas, por categoría, ítem presupuestario y mes.</span>
                </div>
                <div className="frm-panel__body">
                    <div className="frm-pills">
                        <span className="frm-pills__label">
                            Fichas
                            <InfoTooltip text="Qué fichas entran al análisis. «Vigentes» deja fuera las rechazadas." />
                        </span>
                        {ALCANCES_CARRO.map((a) => (
                            <FiltroChip key={a.id} activo={alcance === a.id} onClick={() => setAlcance(a.id)} title={a.hint}>{a.label}</FiltroChip>
                        ))}
                    </div>
                    <div className="frm-pills" style={{ marginBottom: 0 }}>
                        <span className="frm-pills__label">
                            Acción
                            <InfoTooltip text="Tipo de ficha. En una modificación el carro es la versión resultante del proyecto." />
                        </span>
                        <FiltroChip activo={!acciones.length} onClick={() => setAcciones([])}>Todas</FiltroChip>
                        {ACCIONES_PAC.map((a) => (
                            <FiltroChip key={a} activo={acciones.includes(a)} onClick={() => alternarAccion(a)} title={ACCION_PAC_INFO[a].detalle}>{a}</FiltroChip>
                        ))}
                    </div>
                </div>
            </section>

            {cargando && <div className="frm-note frm-block">Cargando análisis del carro…</div>}
            {error && <div className="frm-note frm-state--error frm-block">No fue posible cargar el análisis del carro.</div>}

            {t && !cargando && (
                <>
                    <section className="frm-kpis">
                        <article className="dv-card" style={{ '--dv-card-accent': 'var(--dv-primary)' }}>
                            <div className="dv-card__title">Monto en carro</div>
                            <div className="dv-card__value" title={fmtCLP(t.monto)}>{fmtMillones(t.monto)}</div>
                            <div className="dv-card__meta">{fmtCLP(t.monto)}</div>
                        </article>
                        <article className="dv-card" style={{ '--dv-card-accent': 'var(--dv-group-2)' }}>
                            <div className="dv-card__title">Líneas de producto</div>
                            <div className="dv-card__value">{fmtN(t.n_lineas)}</div>
                            <div className="dv-card__meta">En {fmtN(t.n_fichas)} de {fmtN(t.n_fichas_consideradas)} ficha(s)</div>
                        </article>
                        <article className="dv-card" style={{ '--dv-card-accent': 'var(--dv-secondary)' }}>
                            <div className="dv-card__title">Sin ítem presupuestario <InfoTooltip text="Líneas cuyo ítem viene vacío, en cero o con un código antiguo sin formato (frecuente en 2024)." /></div>
                            <div className="dv-card__value">{fmtN(t.lineas_sin_item)}</div>
                            <div className="dv-card__meta">{pctDe(t.lineas_sin_item, t.n_lineas) ?? 0}% de las líneas</div>
                        </article>
                        <article className="dv-card" style={{ '--dv-card-accent': 'var(--dv-group-4)' }}>
                            <div className="dv-card__title">Sin mes de ejecución</div>
                            <div className="dv-card__value">{fmtN(t.lineas_sin_mes)}</div>
                            <div className="dv-card__meta">{pctDe(t.lineas_sin_mes, t.n_lineas) ?? 0}% de las líneas</div>
                        </article>
                    </section>

                    <div className="pac-grid">
                        <Bloque titulo="Por categoría" nota="Clic en una barra para filtrar las líneas" vacio={!categorias.length}>
                            <div className="pac-bars">
                                {categorias.map((c) => (
                                    <BarraPac key={c.categoria} etiqueta={c.categoria} valor={c.monto} maximo={maxCat}
                                              texto={fmtMillones(c.monto)} sub={`${fmtN(c.n_lineas)} línea(s)`}
                                              activa={categoria === c.categoria}
                                              onClick={SIN.has(c.categoria) ? undefined : () => setCategoria(categoria === c.categoria ? null : c.categoria)} />
                                ))}
                            </div>
                        </Bloque>

                        <Bloque titulo="Por ítem presupuestario" nota="Los 12 mayores" vacio={!items.length}>
                            <div className="pac-bars">
                                {items.map((c) => (
                                    <BarraPac key={c.codigo} etiqueta={c.nombre ? `${c.codigo} · ${c.nombre}` : c.codigo} valor={c.monto}
                                              maximo={maxItem} texto={fmtMillones(c.monto)} sub={`${fmtN(c.n_lineas)} línea(s)`}
                                              color="var(--dv-group-2)" />
                                ))}
                            </div>
                        </Bloque>

                        <Bloque titulo="Por mes de ejecución" nota="Clic en un mes para filtrar las líneas" vacio={!meses.length}>
                            <div className="pac-bars">
                                {meses.map((c) => (
                                    <BarraPac key={c.mes} etiqueta={fmtMesIso(c.mes)} valor={c.monto} maximo={maxMes}
                                              texto={fmtMillones(c.monto)} sub={`${fmtN(c.n_lineas)} línea(s)`} color="var(--dv-group-4)"
                                              activa={mes === c.mes}
                                              onClick={c.mes === 'Sin mes' ? undefined : () => setMes(mes === c.mes ? null : c.mes)} />
                                ))}
                            </div>
                        </Bloque>
                    </div>

                    {t.lineas_sin_ficha > 0 && (
                        <p className="dv-footnote" style={{ marginBottom: 'var(--dv-sp-5)' }}>
                            Además hay {fmtN(t.lineas_sin_ficha)} línea(s) de carro sin ficha en el reporte de cabeceras (mayormente 2024, que la
                            cabecera no exporta); no entran a este análisis.
                        </p>
                    )}
                </>
            )}

            <section className="dv-panel frm-panel">
                <div className="frm-panel__head">
                    <h2 className="frm-panel__title">Líneas del carro</h2>
                </div>
                <div className="frm-panel__body">
                    {(mes || categoria) && (
                        <div className="pac-activefilters">
                            {categoria && <span className="frm-filterchip">Categoría: {categoria}<button type="button" onClick={() => setCategoria(null)}>quitar</button></span>}
                            {mes && <span className="frm-filterchip">Mes: {fmtMesIso(mes)}<button type="button" onClick={() => setMes(null)}>quitar</button></span>}
                        </div>
                    )}
                    <div className="frm-toolbar">
                        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por producto, categoría o ítem presupuestario…" />
                        <span className="frm-count">{fmtN(data.count)} línea(s)</span>
                    </div>
                    <div className="frm-table-wrap">
                        <table className="dv-table frm-table">
                            <thead>
                                <tr>
                                    <SortTh label="Ficha" campo="folio" {...orden} />
                                    <th>Bandeja</th>
                                    <th>Departamento</th>
                                    <SortTh label="Categoría" campo="categoria" {...orden} />
                                    <th>Producto</th>
                                    <SortTh label="Cant." campo="cantidad" {...orden} align="right" />
                                    <SortTh label="Monto" campo="monto" {...orden} align="right" />
                                    <th>Ítem presupuestario</th>
                                    <SortTh label="Mes" campo="mes_ejecucion_fecha" {...orden} />
                                    <th className="is-center"><span className="frm-sr">Ficha</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {cargandoLineas ? <FilaEstado colSpan={10}>Cargando líneas…</FilaEstado>
                                    : errorLineas ? <FilaEstado colSpan={10} error>No fue posible cargar las líneas.</FilaEstado>
                                    : data.results.length === 0 ? <FilaEstado colSpan={10}>No hay líneas con los filtros aplicados.</FilaEstado>
                                    : data.results.map((l) => (
                                        <tr key={l.id}>
                                            <td className="is-nowrap">
                                                <span className="frm-id">{l.ficha?.id_ficha || `#${l.folio}/${l.anho}`}</span>
                                                <span className="frm-sub">línea {l.linea}</span>
                                            </td>
                                            <td>{l.ficha ? <EstadoPacChip codigo={l.ficha.estado} /> : <span className="frm-muted" title="La cabecera de esta ficha no está en el reporte">sin ficha</span>}</td>
                                            <td><div className="frm-trunc" title={l.ficha?.departamento}>{l.ficha?.departamento || '—'}</div></td>
                                            <td>{l.categoria || '—'}</td>
                                            <td className="is-strong"><div className="frm-trunc" title={l.producto}>{l.producto || '—'}</div></td>
                                            <td className="is-num">{l.cantidad ?? '—'}</td>
                                            <td className="is-num is-strong is-nowrap">{l.monto != null ? fmtCLP(l.monto) : '—'}</td>
                                            <td><div className="frm-trunc" title={l.item_presupuestario}>{l.item_presupuestario || <span className="frm-muted">—</span>}</div></td>
                                            <td className="is-nowrap">{l.mes_ejecucion || <span className="frm-muted">—</span>}</td>
                                            <td className="is-center">
                                                {l.ficha && (
                                                    <button type="button" className="dv-btn frm-btn-ver" onClick={() => setFichaId(l.ficha.id)}
                                                            title="Ver la ficha completa">Ver</button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination page={page} setPage={setPage} count={data.count} />
                </div>
            </section>
        </>
    );
}
