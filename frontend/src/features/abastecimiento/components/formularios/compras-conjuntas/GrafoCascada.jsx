// Vista «Cascada»: columnas por nivel del ítem (N1 → N2 → N3) y, al final, los formularios del nivel elegido.
import { useEffect, useMemo, useState } from 'react';
import '../formularios.css';
import { fmtCLP } from '../shared';
import { alturaColumnas, buildHierarchy } from './jerarquia';
import { Columna, Flecha, FscMini, PuntosEstado } from './Piezas';

function ItemNivel({ node, activo, onSelect }) {
    return (
        <button type="button" className={`frm-item${activo ? ' is-active' : ''}`} aria-pressed={activo} onClick={() => onSelect(node.code)}>
            <div className="frm-item__top">
                <span className="frm-id">{node.code}</span>
                <span className="frm-item__count">{node.n_formularios}</span>
            </div>
            {node.label && node.label !== node.code && <div className="frm-item__label">{node.label}</div>}
            <div className="frm-item__money">{fmtCLP(node.monto_total)}</div>
            <PuntosEstado estados={node.estados} />
        </button>
    );
}

export default function GrafoCascada({ grupos, nodos, onClickNodo }) {
    const hierarchyRoot = useMemo(() => buildHierarchy(grupos, nodos), [grupos, nodos]);
    const [selL1, setSelL1] = useState(null);
    const [selL2, setSelL2] = useState(null);
    const [selL3, setSelL3] = useState(null);

    useEffect(() => { setSelL1(null); setSelL2(null); setSelL3(null); }, [hierarchyRoot]);

    const alternarL1 = (code) => { setSelL1((prev) => (prev === code ? null : code)); setSelL2(null); setSelL3(null); };
    const alternarL2 = (code) => { setSelL2((prev) => (prev === code ? null : code)); setSelL3(null); };
    const alternarL3 = (code) => setSelL3((prev) => (prev === code ? null : code));

    const l1Nodes = hierarchyRoot.children || [];
    const selL1Node = selL1 ? l1Nodes.find((n) => n.code === selL1) : null;
    const l2Nodes = selL1Node?.children || [];
    const selL2Node = selL2 ? l2Nodes.find((n) => n.code === selL2) : null;
    const l3Nodes = selL2Node?.children || [];
    const selL3Node = selL3 ? l3Nodes.find((n) => n.code === selL3) : null;

    const masProfundo = selL3Node || selL2Node || selL1Node;
    const fscNodes = masProfundo?.allFscDescendants || [];
    const mostrarL3 = selL2Node && l3Nodes.length > 0;
    const alturaMax = alturaColumnas();

    return (
        <div className="frm-cascade__scroll">
            <div className="frm-cascade">
                <Columna titulo="Subtítulo N1" alturaMax={alturaMax}>
                    {l1Nodes.map((n) => <ItemNivel key={n.code} node={n} activo={selL1 === n.code} onSelect={alternarL1} />)}
                </Columna>
                <Flecha />
                <Columna titulo="Grupo N2" activa={Boolean(selL1)} pista="← Selecciona un N1" vacio="Sin subniveles" alturaMax={alturaMax}>
                    {l2Nodes.map((n) => <ItemNivel key={n.code} node={n} activo={selL2 === n.code} onSelect={alternarL2} />)}
                </Columna>
                {mostrarL3 && (
                    <>
                        <Flecha />
                        <Columna titulo="Subgrupo N3" activa={Boolean(selL2)} pista="← Selecciona un N2" vacio="Sin subniveles" alturaMax={alturaMax}>
                            {l3Nodes.map((n) => <ItemNivel key={n.code} node={n} activo={selL3 === n.code} onSelect={alternarL3} />)}
                        </Columna>
                    </>
                )}
                <Flecha />
                <Columna titulo={`Formularios (${fscNodes.length})`} activa={Boolean(masProfundo)} pista="Selecciona un ítem" vacio="Sin formularios asignados" alturaMax={alturaMax} ancho={250}>
                    {fscNodes.map((fsc) => <FscMini key={`${fsc.folio}-${fsc.anho}`} fsc={fsc} onClickNodo={onClickNodo} />)}
                </Columna>
            </div>
        </div>
    );
}
