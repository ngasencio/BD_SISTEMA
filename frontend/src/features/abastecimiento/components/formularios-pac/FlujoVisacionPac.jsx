// Línea de flujo de visación de las fichas PAC: P → FR → FA → AA → DC (+ rechazadas).
// Es un filtro: cada círculo agrega/quita su bandeja a la selección que gobierna la tabla.
import { Fragment, useEffect, useState } from 'react';
import '../formularios/formularios.css';
import './formularios-pac.css';
import { getFormulariosPacFlujo } from '../../api/formulariosPacApi';
import { fmtN } from '../formularios/shared';
import { InfoTooltip } from '../formularios/ui';
import { ESTADO_PAC_INFO, fmtMillones, infoEstadoPac } from './sharedPac';

function Nodo({ codigo, cantidad, monto, dias, activo, onClick }) {
    const info = infoEstadoPac(codigo);
    return (
        <button type="button" className={`frm-flow__node${activo ? ' is-active' : ''}`} style={{ '--node-color': info.color }}
                aria-pressed={activo} onClick={onClick}
                title={`${info.nombre} — ${fmtN(cantidad)} ficha(s). ${info.detalle} Clic para agregar o quitar de la selección.`}>
            <span className="frm-flow__circle">
                {fmtN(cantidad)}
                <span className="frm-flow__code">{codigo}</span>
            </span>
            <span className="frm-flow__label">{info.nombre}</span>
            <span className="frm-flow__person">{fmtMillones(monto)}</span>
            {dias != null && <span className="frm-flow__person">{fmtN(Math.round(dias))} d en trámite (prom.)</span>}
        </button>
    );
}

export default function FlujoVisacionPac({ filtros, estadoSel, onSelectEstado }) {
    const [flujo, setFlujo] = useState(null);
    const [cargando, setCargando] = useState(true);
    const clave = JSON.stringify(filtros || {});

    useEffect(() => {
        let activo = true;
        setCargando(true);
        getFormulariosPacFlujo(filtros || {})
            .then(({ data }) => { if (activo) setFlujo(data); })
            .catch(() => { if (activo) setFlujo(null); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clave]);

    if (cargando) return <div className="frm-note frm-block">Cargando flujo de visación…</div>;
    if (!flujo) return <div className="frm-note frm-block">No fue posible cargar el flujo de visación.</div>;

    const nodos = flujo.estados_pipeline;
    const alternar = (codigo) => {
        const actual = estadoSel || [];
        onSelectEstado(actual.includes(codigo) ? actual.filter((c) => c !== codigo) : [...actual, codigo]);
    };

    return (
        <section className="dv-panel frm-panel">
            <div className="frm-panel__head">
                <h2 className="frm-panel__title">
                    Línea de flujo de visación
                    <InfoTooltip text={`Recorrido de las fichas PAC por las bandejas de visación, desde ${ESTADO_PAC_INFO.P.nombre} hasta ${ESTADO_PAC_INFO.DC.nombre} (estado final). Cada bandeja muestra cuántas fichas hay, su monto y los días promedio en trámite. Haz clic en un círculo para filtrar la tabla.`} />
                </h2>
                <span className="frm-panel__note">Haz clic en una bandeja para filtrar la tabla; puedes seleccionar varias.</span>
            </div>
            <div className="frm-panel__body">
                <div className="frm-flow" role="group" aria-label="Bandejas de visación PAC">
                    {nodos.map((nodo, i) => (
                        <Fragment key={nodo.codigo}>
                            <Nodo codigo={nodo.codigo} cantidad={nodo.cantidad} monto={nodo.monto}
                                  dias={nodo.dias_en_tramite_promedio} activo={estadoSel?.includes(nodo.codigo)}
                                  onClick={() => alternar(nodo.codigo)} />
                            {i < nodos.length - 1 && <span className="frm-flow__arrow" aria-hidden="true">›</span>}
                        </Fragment>
                    ))}
                    <span className="frm-flow__arrow frm-flow__arrow--branch" title="Fichas rechazadas en cualquier punto del proceso" aria-hidden="true">↘</span>
                    <Nodo codigo="R" cantidad={flujo.rechazadas.cantidad} monto={flujo.rechazadas.monto}
                          activo={estadoSel?.includes('R')} onClick={() => alternar('R')} />
                </div>

                <p className="pac-legend">
                    <b>{fmtN(flujo.total_en_tramite)}</b> ficha(s) en trámite (P, FR, FA y AA). <b>DC</b> es el estado final: la ficha ya fue aprobada.
                    {flujo.historial_disponible_desde && <> Historial de bandejas disponible desde el {flujo.historial_disponible_desde.split('-').reverse().join('-')}.</>}
                </p>

                {estadoSel?.length > 0 && (
                    <div className="frm-flow__summary">
                        <p>Filtrando por: <strong>{estadoSel.map((c) => infoEstadoPac(c).nombre).join(', ')}</strong> — haz clic de nuevo para quitar.</p>
                    </div>
                )}
            </div>
        </section>
    );
}
