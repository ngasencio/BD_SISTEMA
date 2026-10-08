import { useEffect, useRef, useState } from 'react';
import '../formularios.css';
import { getFormulariosDerivados } from '../../../api/formulariosApi';
import { fmtCLP, fmtFecha, fmtN } from '../shared';
import { Chip, FilaEstado, Pagination } from '../ui';
import FichaFormularioModal from '../FichaFormularioModal';

// ─── Tabla de formularios filtrados por la unidad seleccionada en la jerarquía ─
// «Ver» abre la misma ficha completa que las tablas Solicitudes y Derivados
// (`FichaFormularioModal`, origen "derivado": esta tabla sale de FormularioFSCDerivado),
// con el proceso de compra y las órdenes de compra enlazadas.

const PAGE_SIZE_DRF = 50; // debe coincidir con REST_FRAMEWORK.PAGE_SIZE (backend/core/settings.py)

export default function TablaFormulariosDrillDown({ filtroOrg, anhoScope }) {
    const [data, setData] = useState({ count: 0, results: [] });
    const [page, setPage] = useState(1);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(false);
    const [fichaId, setFichaId] = useState(null);

    // Resetear a página 1 y buscar quedan en un solo efecto (en vez de 2 efectos
    // separados) para evitar una carrera: con dos efectos, cambiar filtroOrg con
    // page > 1 dispara primero la búsqueda con la página VIEJA (los efectos de un
    // mismo render corren con el estado previo a que setPage(1) surta efecto) y
    // recién en el siguiente render se corrige a página 1 — un fetch de más y un
    // parpadeo de "sin formularios" si la página vieja no existe para el nuevo filtro.
    const filtroKeyRef = useRef(null);

    useEffect(() => {
        const key = JSON.stringify([filtroOrg, anhoScope]);
        if (filtroKeyRef.current !== key) {
            filtroKeyRef.current = key;
            if (page !== 1) { setPage(1); return; } // este efecto se re-ejecuta cuando page cambie a 1
        }
        if (!filtroOrg) { setData({ count: 0, results: [] }); return; }
        let activo = true;
        setCargando(true);
        setError(false);
        const params = {
            estado: 'AC', establecimiento: 1, ordering: '-fecha_derivado', page,
            ...(anhoScope ? { anho_fecha_derivado: anhoScope } : {}),
            ...(filtroOrg.ids?.length ? { sso_departamento_in: filtroOrg.ids.join(',') } : {}),
            ...(filtroOrg.sinClasificar ? { sin_clasificar: 1 } : {}),
        };
        getFormulariosDerivados(params)
            .then(({ data: res }) => { if (activo) setData(res); })
            .catch(() => { if (activo) { setData({ count: 0, results: [] }); setError(true); } })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [filtroOrg, anhoScope, page]);

    return (
        <section className="dv-panel frm-panel">
            <div className="frm-panel__head">
                <h3 className="frm-panel__title">Formularios{filtroOrg ? ` de ${filtroOrg.label}` : ''}</h3>
                {filtroOrg && (
                    <span className="frm-panel__note">
                        {fmtN(data.count)} formulario(s) derivado(s) a comprador · «Ver» abre la ficha completa con las órdenes de compra enlazadas
                    </span>
                )}
            </div>
            <div className="frm-panel__body">
                {!filtroOrg ? (
                    <div className="frm-note">
                        Selecciona una subdirección, departamento o sub-departamento en la jerarquía (botón «Analizar») para ver y revisar sus formularios.
                    </div>
                ) : (
                    <>
                        <div className="frm-table-wrap">
                            <table className="dv-table frm-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Derivado</th>
                                        <th>Unidad requirente</th>
                                        <th>Usuario requirente</th>
                                        <th>Comprador</th>
                                        <th>Estado de compra</th>
                                        <th>PAC</th>
                                        <th className="is-num">Monto estimado</th>
                                        <th className="is-center"><span className="frm-sr">Ficha</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cargando ? <FilaEstado colSpan={9}>Cargando formularios…</FilaEstado>
                                        : error ? <FilaEstado colSpan={9} error>No fue posible cargar los formularios.</FilaEstado>
                                        : data.results.length === 0 ? <FilaEstado colSpan={9}>Sin formularios para esta selección.</FilaEstado>
                                        : data.results.map(f => (
                                            <tr key={f.id}>
                                                <td className="is-nowrap"><span className="frm-id">{f.id_formulario || `#${f.folio}`}</span></td>
                                                <td className="is-nowrap">{fmtFecha(f.fecha_derivado)}</td>
                                                <td>
                                                    <div className="frm-trunc" title={f.unidad_requirente}>{f.unidad_requirente || '—'}</div>
                                                    {f.sso_departamento_nombre && <span className="frm-sub frm-trunc" title={f.sso_departamento_nombre}>{f.sso_departamento_nombre}</span>}
                                                </td>
                                                <td><div className="frm-trunc frm-trunc--sm" title={f.usuario_requirente}>{f.usuario_requirente || '—'}</div></td>
                                                <td><div className="frm-trunc frm-trunc--sm" title={f.comprador}>{f.comprador || '—'}</div></td>
                                                <td>{f.estado_compra
                                                    ? <span className="dv-chip frm-chip-neutral">{f.estado_compra}</span>
                                                    : <span className="frm-muted">—</span>}</td>
                                                <td>{f.dentro_fuera_pac
                                                    ? <Chip variante={f.dentro_fuera_pac === 'DENTRO' ? 'ok' : 'warn'}>{f.dentro_fuera_pac === 'DENTRO' ? 'Dentro' : 'Fuera'}</Chip>
                                                    : <span className="frm-muted">—</span>}</td>
                                                <td className="is-num is-strong is-nowrap">{fmtCLP(f.monto_estimado)}</td>
                                                <td className="is-center">
                                                    <button type="button" className="dv-btn frm-btn-ver" onClick={() => setFichaId(f.id)}
                                                            title="Ver la ficha completa, con la gestión de compra y las órdenes de compra enlazadas">Ver</button>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={page} setPage={setPage} count={data.count} pageSize={PAGE_SIZE_DRF} />
                    </>
                )}
            </div>
            {fichaId && <FichaFormularioModal origen="derivado" id={fichaId} onCerrar={() => setFichaId(null)} />}
        </section>
    );
}
