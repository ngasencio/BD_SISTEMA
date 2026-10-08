// Línea de flujo de visación: círculos por bandeja (P → … → AC) + rechazados.
// Es un filtro: cada círculo agrega/quita su bandeja a la selección que gobierna la tabla Solicitudes.
import { Fragment, useEffect, useMemo, useState } from 'react';
import './formularios.css';
import { getFormulariosFlujo } from '../../api/formulariosApi';
import { ESTADO_FSC_INFO, fmtN } from './shared';
import { InfoTooltip } from './ui';

const PIPELINE_ORDEN = ['P', 'FR', 'FA', 'ASDA', 'ADIR', 'AA', 'DC', 'AC'];

function Nodo({ codigo, cantidad, activo, onClick }) {
    const info = ESTADO_FSC_INFO[codigo] || { nombre: codigo, persona: null, color: 'var(--dv-none)' };
    return (
        <button type="button" className={`frm-flow__node${activo ? ' is-active' : ''}`} style={{ '--node-color': info.color }}
                aria-pressed={activo} onClick={onClick}
                title={`${info.nombre}${info.persona ? ` (${info.persona})` : ''} — ${fmtN(cantidad)} formulario(s). Clic para agregar o quitar de la selección.`}>
            <span className="frm-flow__circle">
                {fmtN(cantidad)}
                <span className="frm-flow__code">{codigo}</span>
            </span>
            <span className="frm-flow__label">{info.nombre}</span>
            {info.persona && <span className="frm-flow__person">{info.persona}</span>}
        </button>
    );
}

export default function FlujoVisacion({ anioSeleccionado, estadoSel, onSelectEstado }) {
    const [flujo, setFlujo] = useState(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        getFormulariosFlujo(anioSeleccionado ? { anho: anioSeleccionado } : {})
            .then(({ data }) => { if (activo) setFlujo(data); })
            .catch(() => { if (activo) setFlujo(null); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [anioSeleccionado]);

    // Debe ir antes de los early returns para no violar las reglas de los hooks.
    const destinosCounts = useMemo(() => {
        if (!flujo || !estadoSel?.length) return [];
        const todos = [];
        estadoSel.forEach((codigo) => {
            const nodo = flujo.estados_pipeline.find((e) => e.codigo === codigo);
            if (nodo?.formularios) todos.push(...nodo.formularios);
            if (codigo === 'R' && flujo.rechazados?.formularios) todos.push(...flujo.rechazados.formularios);
        });
        const cuenta = {};
        todos.forEach((f) => {
            const d = f.destino_actual?.trim() || null;
            if (d) cuenta[d] = (cuenta[d] || 0) + 1;
        });
        return Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
    }, [estadoSel, flujo]);

    if (cargando) return <div className="frm-note frm-block">Cargando flujo de visación…</div>;
    if (!flujo) return <div className="frm-note frm-block">No fue posible cargar el flujo de visación.</div>;

    const nodos = PIPELINE_ORDEN.map((codigo) => flujo.estados_pipeline.find((e) => e.codigo === codigo)).filter(Boolean);
    const alternar = (codigo) => {
        const actual = estadoSel || [];
        onSelectEstado(actual.includes(codigo) ? actual.filter((c) => c !== codigo) : [...actual, codigo]);
    };

    return (
        <section className="dv-panel frm-panel">
            <div className="frm-panel__head">
                <h2 className="frm-panel__title">
                    Línea de flujo de visación
                    <InfoTooltip text={`Recorrido de las solicitudes por las bandejas de visación, desde ${ESTADO_FSC_INFO.P.nombre} hasta ${ESTADO_FSC_INFO.AC.nombre}. Cada bandeja muestra el cargo responsable y, debajo, quién la atiende habitualmente. Haz clic en un círculo para filtrar la tabla de solicitudes. Historial disponible desde el ${flujo.historial_disponible_desde}.`} />
                </h2>
                <span className="frm-panel__note">Haz clic en una bandeja para filtrar la tabla; puedes seleccionar varias.</span>
            </div>
            <div className="frm-panel__body">
                <div className="frm-flow" role="group" aria-label="Bandejas de visación">
                    {nodos.map((nodo, i) => (
                        <Fragment key={nodo.codigo}>
                            <Nodo codigo={nodo.codigo} cantidad={nodo.cantidad} activo={estadoSel?.includes(nodo.codigo)} onClick={() => alternar(nodo.codigo)} />
                            {i < nodos.length - 1 && <span className="frm-flow__arrow" aria-hidden="true">›</span>}
                        </Fragment>
                    ))}
                    <span className="frm-flow__arrow frm-flow__arrow--branch" title="Formularios rechazados en cualquier punto del proceso" aria-hidden="true">↘</span>
                    <Nodo codigo="R" cantidad={flujo.rechazados.cantidad} activo={estadoSel?.includes('R')} onClick={() => alternar('R')} />
                </div>

                {estadoSel?.length > 0 && (
                    <div className="frm-flow__summary">
                        <p>
                            Filtrando por: <strong>{estadoSel.map((c) => ESTADO_FSC_INFO[c]?.nombre || c).join(', ')}</strong> — haz clic de nuevo para quitar.
                        </p>
                        {destinosCounts.length > 0 && (
                            <>
                                <div className="dv-eyebrow" style={{ marginBottom: 'var(--dv-sp-2)' }}>Actualmente en bandeja de</div>
                                <div className="frm-chips">
                                    {destinosCounts.map(([nombre, n]) => (
                                        <span key={nombre} className="dv-chip frm-chip-neutral">{nombre} <b>{n}</b></span>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
