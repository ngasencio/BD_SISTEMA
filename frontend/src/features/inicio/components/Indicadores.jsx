// Franja de indicadores del año. Cada tarjeta lleva al módulo donde se ve el detalle.
import '../styles/inicio.css';
import { varianteNota } from '../../abastecimiento/components/formularios/temporalidad/logica';
import { fmtMillones, fmtN, fmtNota, fmtPct, fmtVariacion, sentidoVariacion } from '../utils/formato';

const FLECHA = { sube: '▲', baja: '▼', igual: '■' };

/** «▲ +4,4% frente a $5.628 M al mismo corte de 2025». */
function Delta({ pct, base, referencia }) {
    if (pct === null || pct === undefined) return <div className="ini-delta">Sin base de comparación {referencia}</div>;
    return (
        <div className="ini-delta">
            <span className="ini-delta__flecha" aria-hidden="true">{FLECHA[sentidoVariacion(pct)]}</span>
            <b>{fmtVariacion(pct)}</b>
            <span>frente a {base} {referencia}</span>
        </div>
    );
}

function Tarjeta({ acento, titulo, valor, meta, pie, ruta, onIr }) {
    return (
        <article className="dv-card" style={{ '--dv-card-accent': acento }}>
            <div className="dv-card__title">{titulo}</div>
            <div className="dv-card__value">{valor}</div>
            {meta}
            <div className="dv-card__footer">
                {pie}
                {ruta && <button type="button" className="ini-link" onClick={() => onIr(ruta)}>Ver detalle ›</button>}
            </div>
        </article>
    );
}

export default function Indicadores({ datos, onIr }) {
    const { oc, pac, anio } = datos;
    const enCurso = oc.mes_en_curso != null;
    const referencia = enCurso ? `al mismo corte de ${anio - 1}` : `${anio - 1} completo`;
    const df = pac.dentro_fuera;
    const sinPlan = !pac.plan_del_anio_cargado;

    return (
        <section className="ini-kpis" aria-label={`Indicadores ${anio}`}>
            <Tarjeta acento="var(--dv-primary)" titulo="Órdenes de compra" valor={fmtN(oc.cantidad)} ruta="/ordenes-compra" onIr={onIr}
                     meta={<Delta pct={oc.var_cantidad_pct} base={fmtN(oc.anterior.cantidad)} referencia={referencia} />}
                     pie={<span className="dv-card__cut">Sin canceladas</span>} />

            <Tarjeta acento="var(--dv-group-2)" titulo="Monto neto comprado" valor={fmtMillones(oc.monto_neto)} ruta="/ordenes-compra" onIr={onIr}
                     meta={<Delta pct={oc.var_monto_pct} base={fmtMillones(oc.anterior.monto_neto)} referencia={referencia} />}
                     pie={<span className="dv-card__cut">Por fecha de envío</span>} />

            <Tarjeta acento="var(--dv-secondary)" titulo="Compras dentro del PAC" valor={sinPlan ? '—' : fmtPct(pac.enlace_pct)} ruta="/pac?tab=resumen" onIr={onIr}
                     meta={sinPlan
                         ? <div className="ini-aviso">El plan PAC de {anio} no está cargado.</div>
                         : <div className="ini-delta">Monto enlazado a proyectos del plan vigente</div>}
                     pie={<span className="dv-card__cut">Indicador 1 · Res.188</span>} />

            <Tarjeta acento="var(--dv-group-4)" titulo="Procesos competitivos" valor={fmtPct(pac.competitivo_pct)} ruta="/pac?tab=resumen" onIr={onIr}
                     meta={<div className="ini-delta">Licitaciones y compras ágiles, por monto</div>}
                     pie={<span className="dv-card__cut">Indicador 2 · Res.188</span>} />

            <Tarjeta acento="var(--dv-ok)" titulo="Formularios dentro del PAC" valor={fmtNota(df.nota)} ruta="/pac-cumplimiento?tab=resumen" onIr={onIr}
                     meta={df.total === 0
                         ? <div className="ini-delta">Sin formularios derivados en {anio}</div>
                         : <div className="ini-delta"><b>{fmtPct(df.pct_dentro)}</b> dentro · {fmtN(df.dentro)} de {fmtN(df.total)} derivados</div>}
                     pie={<span className={`dv-chip dv-chip--${varianteNota(df.nota)}`}
                                title={df.nota === null ? `Muestra insuficiente (menos de ${df.muestra_minima} formularios)` : 'Nota de 1,0 a 7,0: 50% por cantidad y 50% por monto'}>
                         Nota 1,0 a 7,0
                     </span>} />
        </section>
    );
}
