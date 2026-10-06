import React, { useEffect, useMemo, useState } from 'react';
import { getGestorFlujo } from '../../api/gestorComprasApi';
import { ESTADO_FSC_INFO, InfoTooltip, PIPELINE_ORDEN, fmtN } from './shared';

// Línea de flujo de visación del departamento — copia del FlujoVisacion de Formularios FSC
// (mismos estilos .flujo-* de index.css), alimentada por gestor-compras/flujo/. Controlado:
// la selección de bandejas la maneja el tab, que filtra la tabla de solicitudes.
export default function FlujoVisacionGestor({ params, anho, estadoSel, onSelectEstado }) {
    const [flujo, setFlujo] = useState(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        getGestorFlujo({ ...params, ...(anho ? { anho } : {}) })
            .then(({ data }) => { if (activo) setFlujo(data); })
            .catch(() => { if (activo) setFlujo(null); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [params, anho]);

    // Quién tiene hoy los formularios de las bandejas seleccionadas (calculado con el mismo
    // payload del flujo, sin otra llamada). Antes de los early returns: Rules of Hooks.
    const destinosCounts = useMemo(() => {
        if (!flujo || !estadoSel?.length) return [];
        const todos = [];
        estadoSel.forEach((codigo) => {
            const nodo = flujo.estados_pipeline.find((e) => e.codigo === codigo);
            if (nodo?.formularios) todos.push(...nodo.formularios);
            if (codigo === 'R' && flujo.rechazados?.formularios) todos.push(...flujo.rechazados.formularios);
        });
        const counts = {};
        todos.forEach((f) => {
            const d = f.destino_actual?.trim();
            if (d) counts[d] = (counts[d] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [estadoSel, flujo]);

    if (cargando) return <div className="loading-spinner">Cargando flujo de visación…</div>;
    if (!flujo) return <div className="loading-spinner">No fue posible cargar el flujo de visación.</div>;

    const nodos = PIPELINE_ORDEN.map((codigo) => flujo.estados_pipeline.find((e) => e.codigo === codigo)).filter(Boolean);
    const alternar = (codigo) => {
        const actual = estadoSel || [];
        onSelectEstado(actual.includes(codigo) ? actual.filter((c) => c !== codigo) : [...actual, codigo]);
    };

    return (
        <div className="card">
            <div className="card-header card-header-accent">
                <span>🔁</span>
                <span className="card-title">
                    Línea de flujo de visación
                    <InfoTooltip text={`Recorrido de las solicitudes de su departamento por las bandejas de visación, desde ${ESTADO_FSC_INFO.P.nombre} hasta ${ESTADO_FSC_INFO.AC.nombre}. Haga clic en un círculo para filtrar la tabla de solicitudes. Historial disponible desde el ${flujo.historial_disponible_desde}.`} />
                </span>
            </div>
            <div className="flujo-pipeline">
                {nodos.map((nodo, i) => {
                    const info = ESTADO_FSC_INFO[nodo.codigo] || { nombre: nodo.codigo, persona: null, color: '#94a3b8' };
                    return (
                        <React.Fragment key={nodo.codigo}>
                            <button
                                type="button"
                                className={`flujo-nodo ${estadoSel?.includes(nodo.codigo) ? 'activo' : ''}`}
                                style={{ '--nodo-color': info.color }}
                                onClick={() => alternar(nodo.codigo)}
                                title={`${info.nombre}${info.persona ? ` (${info.persona})` : ''} — ${fmtN(nodo.cantidad)} formulario(s)\nClic para filtrar`}
                            >
                                <span className="flujo-nodo-circulo-wrap">
                                    <span className="flujo-nodo-circulo">{fmtN(nodo.cantidad)}</span>
                                    <span className="flujo-nodo-codigo-tag">{nodo.codigo}</span>
                                </span>
                                <span className="flujo-nodo-label">{info.nombre}</span>
                                {info.persona && <span className="flujo-nodo-persona">({info.persona})</span>}
                            </button>
                            {i < nodos.length - 1 && <span className="flujo-flecha">→</span>}
                        </React.Fragment>
                    );
                })}
                <span className="flujo-flecha flujo-flecha-rama" title="Formularios rechazados en cualquier punto del proceso">↘</span>
                <button
                    type="button"
                    className={`flujo-nodo ${estadoSel?.includes('R') ? 'activo' : ''}`}
                    style={{ '--nodo-color': ESTADO_FSC_INFO.R.color }}
                    onClick={() => alternar('R')}
                    title={`${ESTADO_FSC_INFO.R.nombre} — ${fmtN(flujo.rechazados.cantidad)} formulario(s)\nClic para filtrar`}
                >
                    <span className="flujo-nodo-circulo-wrap">
                        <span className="flujo-nodo-circulo">{fmtN(flujo.rechazados.cantidad)}</span>
                        <span className="flujo-nodo-codigo-tag">R</span>
                    </span>
                    <span className="flujo-nodo-label">{ESTADO_FSC_INFO.R.nombre}</span>
                </button>
            </div>

            {estadoSel?.length > 0 ? (
                <>
                    <p style={{ fontSize: 11, color: '#7c3aed', padding: '0 16px 6px', margin: 0, fontWeight: 600 }}>
                        Filtrando por: <strong>{estadoSel.map((c) => ESTADO_FSC_INFO[c]?.nombre || c).join(', ')}</strong> — haga clic de nuevo para quitar
                    </p>
                    {destinosCounts.length > 0 && (
                        <div style={{ padding: '6px 16px 14px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 7 }}>
                                Actualmente en bandeja de:
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {destinosCounts.map(([nombre, n]) => (
                                    <span key={nombre} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, background: '#f5f3ff', border: '1px solid #ddd6fe', fontSize: 12, color: '#5b21b6', fontWeight: 500 }}>
                                        👤 {nombre}
                                        <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: 11, marginLeft: 2 }}>({n})</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <p style={{ fontSize: 11, color: '#94a3b8', padding: '0 16px 14px', margin: 0 }}>
                    Haga clic en una bandeja para filtrar. Puede seleccionar varias.
                </p>
            )}
        </div>
    );
}
