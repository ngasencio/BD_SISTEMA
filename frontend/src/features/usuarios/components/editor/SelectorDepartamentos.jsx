import { useMemo, useState } from 'react';
import { filtrarNodos } from '../../utils/organizacion';

const LIMITE_RESULTADOS = 60;

function contieneSeleccion(nodo, sel) {
    return sel.has(nodo.id) || (nodo.hijos || []).some(h => contieneSeleccion(h, sel));
}

function Nodo({ nodo, sel, onAlternar, nivel }) {
    const tieneHijos = (nodo.hijos || []).length > 0;
    const [abierto, setAbierto] = useState(() => contieneSeleccion(nodo, sel));
    return (
        <li className="ue-arbol-nodo">
            <div className="ue-arbol-fila" style={{ paddingLeft: nivel * 16 }}>
                {tieneHijos ? (
                    <button type="button" className="ue-arbol-caret" aria-expanded={abierto}
                        onClick={() => setAbierto(a => !a)}>{abierto ? '▾' : '▸'}</button>
                ) : <span className="ue-arbol-caret ue-arbol-caret-vacio" />}
                <label className="ue-arbol-etiqueta">
                    <input type="checkbox" checked={sel.has(nodo.id)} onChange={() => onAlternar(nodo.id)} />
                    <span>{nodo.nombre}</span>
                    {nodo.es_depto ? <span className="ue-badge">primer nivel</span> : null}
                    {tieneHijos ? <span className="ue-badge ue-badge-suave">{nodo.hijos.length} sub</span> : null}
                </label>
            </div>
            {tieneHijos && abierto ? (
                <ul className="ue-arbol-lista">
                    {nodo.hijos.map(h => (
                        <Nodo key={h.id} nodo={h} sel={sel} onAlternar={onAlternar} nivel={nivel + 1} />
                    ))}
                </ul>
            ) : null}
        </li>
    );
}

function Rama({ rama, sel, onAlternar }) {
    const [abierta, setAbierta] = useState(() => rama.departamentos.some(d => contieneSeleccion(d, sel)));
    return (
        <div className="ue-rama">
            <button type="button" className="ue-rama-cab" aria-expanded={abierta}
                onClick={() => setAbierta(a => !a)}>
                <span>{abierta ? '▾' : '▸'}</span> {rama.nombre}
                <span className="ue-badge ue-badge-suave">{rama.departamentos.length}</span>
            </button>
            {abierta ? (
                <ul className="ue-arbol-lista">
                    {rama.departamentos.map(d => (
                        <Nodo key={d.id} nodo={d} sel={sel} onAlternar={onAlternar} nivel={0} />
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

/**
 * Elige departamentos recorriendo la jerarquía (Subdirección/Hospital → Departamento →
 * Sub-departamento) o buscando por nombre. Elegir un departamento de primer nivel incluye a
 * sus sub-departamentos; elegir un sub-departamento deja ver SOLO ese.
 */
export default function SelectorDepartamentos({ arbol, indice, seleccionados, onAlternar }) {
    const [texto, setTexto] = useState('');
    const sel = useMemo(() => new Set(seleccionados.map(Number)), [seleccionados]);
    const resultados = useMemo(
        () => (texto.trim() ? filtrarNodos(indice.filas, texto) : null),
        [indice, texto],
    );

    return (
        <div className="ue-selector">
            <input
                type="search"
                className="ue-selector-buscar"
                placeholder="Buscar departamento o sub-departamento…"
                value={texto}
                onChange={e => setTexto(e.target.value)}
            />
            <div className="ue-selector-cuerpo">
                {resultados ? (
                    resultados.length === 0 ? (
                        <div className="ue-vacio">Sin coincidencias.</div>
                    ) : (
                        <>
                            <ul className="ue-resultados">
                                {resultados.slice(0, LIMITE_RESULTADOS).map(f => (
                                    <li key={f.id}>
                                        <label className="ue-arbol-etiqueta">
                                            <input type="checkbox" checked={sel.has(f.id)}
                                                onChange={() => onAlternar(f.id)} />
                                            <span>
                                                <strong>{f.nombre}</strong>
                                                <small className="ue-ruta">{f.ruta}</small>
                                            </span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                            {resultados.length > LIMITE_RESULTADOS ? (
                                <div className="ue-vacio">
                                    Mostrando {LIMITE_RESULTADOS} de {resultados.length}. Afine la búsqueda.
                                </div>
                            ) : null}
                        </>
                    )
                ) : (
                    arbol.map(rama => (
                        <Rama key={rama.clave} rama={rama} sel={sel} onAlternar={onAlternar} />
                    ))
                )}
            </div>
        </div>
    );
}
