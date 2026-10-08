// Vista «Burbujas»: empaquetado circular jerárquico (D3). Clic en un grupo para entrar al nivel siguiente;
// al llegar a la hoja se muestran los formularios y un clic abre su ficha.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import '../formularios.css';
import { fmtCLP, paletaGrupos } from '../shared';
import { EstadoChip } from '../ui';
import { buildHierarchy, colorEstado } from './jerarquia';

export default function GrafoBurbujas({ grupos, nodos, onClickNodo }) {
    const svgRef = useRef(null);
    const [viewStack, setViewStack] = useState([]);
    const [tooltip, setTooltip] = useState(null);

    const hierarchyRoot = useMemo(() => buildHierarchy(grupos, nodos), [grupos, nodos]);
    useEffect(() => { setViewStack([]); }, [hierarchyRoot]);

    const currentNode = viewStack.length > 0 ? viewStack[viewStack.length - 1] : hierarchyRoot;
    const drillInto = useCallback((node) => setViewStack((prev) => [...prev, node]), []);
    const goTo = useCallback((idx) => setViewStack((prev) => (idx < 0 ? [] : prev.slice(0, idx + 1))), []);

    useEffect(() => {
        if (!svgRef.current || !currentNode) return;
        const el = svgRef.current;
        const W = el.clientWidth || 800;
        const H = Math.max(350, Math.min(Math.floor(window.innerHeight * 0.55), 570));
        el.setAttribute('height', H);
        d3.select(el).selectAll('*').remove();

        // En una hoja se muestran los FSC individuales; en cualquier otro nivel, los subgrupos.
        const esHoja = currentNode.isLeaf;
        const displayItems = esHoja
            ? (currentNode.fscChildren || []).map((f) => ({
                code: f.id_formulario || `#${f.folio}`, label: f.requerimiento?.slice(0, 40) || `Folio ${f.folio}`,
                n_formularios: 1, monto_total: f.monto_estimado || 0, estados: { [f.estado]: 1 },
                isFSCNode: true, fscData: f, children: [],
            }))
            : (currentNode.children || []);
        if (!displayItems.length) return;

        const l1Codes = [...new Set(displayItems.map((c) => c.code?.split('.')[0] || '0'))];
        const colorOf = d3.scaleOrdinal(paletaGrupos()).domain(l1Codes);

        const packRoot = d3.hierarchy({ children: displayItems })
            .sum((d) => Math.max(1, d.monto_total || d.n_formularios || 1))
            .sort((a, b) => b.value - a.value);
        d3.pack().size([W - 16, H - 16]).padding(7)(packRoot);

        const svg = d3.select(el);
        const g = svg.append('g').attr('transform', 'translate(8,8)');

        packRoot.children?.forEach((node) => {
            const d = node.data;
            const isFSC = d.isFSCNode;
            const hasSub = !isFSC && (d.children?.length > 0 || d.fscChildren?.length > 0);
            const color = isFSC ? colorEstado(d.fscData?.estado) : colorOf(d.code?.split('.')[0] || '0');

            g.append('circle')
                .attr('cx', node.x).attr('cy', node.y).attr('r', node.r)
                .attr('fill', color + (hasSub ? '1e' : isFSC ? '55' : '33'))
                .attr('stroke', color).attr('stroke-width', hasSub ? 2.5 : 1.5).attr('opacity', 0.92)
                .style('cursor', hasSub || isFSC ? 'pointer' : 'default')
                .on('click', (ev) => {
                    ev.stopPropagation();
                    if (isFSC && onClickNodo) { onClickNodo(d.fscData); return; }
                    if (hasSub) drillInto(d);
                })
                .on('mouseover', (ev) => {
                    d3.select(ev.currentTarget).attr('stroke-width', 4).attr('opacity', 1);
                    setTooltip({ x: ev.clientX, y: ev.clientY, d, color });
                })
                .on('mousemove', (ev) => setTooltip((p) => (p ? { ...p, x: ev.clientX, y: ev.clientY } : null)))
                .on('mouseout', (ev) => {
                    d3.select(ev.currentTarget).attr('stroke-width', hasSub ? 2.5 : 1.5).attr('opacity', 0.92);
                    setTooltip(null);
                });

            if (node.r > 14) {
                g.append('text')
                    .attr('x', node.x).attr('y', node.y + (node.r > 32 ? -6 : 0))
                    .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
                    .attr('font-size', Math.min(13, node.r * 0.32 + 5)).attr('font-weight', 700)
                    .attr('fill', isFSC ? '#fff' : color).attr('pointer-events', 'none')
                    .text(isFSC ? `#${d.fscData?.folio}` : d.code);
            }
            if (node.r > 34 && !isFSC) {
                g.append('text')
                    .attr('x', node.x).attr('y', node.y + node.r * 0.28)
                    .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
                    .attr('font-size', Math.min(10, node.r * 0.2)).attr('fill', color).attr('pointer-events', 'none')
                    .text(`${d.n_formularios} FSC`);
            }
        });

        svg.call(d3.zoom().scaleExtent([0.4, 4]).on('zoom', (ev) => g.attr(
            'transform', `translate(8,8) scale(${ev.transform.k}) translate(${ev.transform.x / ev.transform.k},${ev.transform.y / ev.transform.k})`,
        )));
    }, [currentNode, drillInto, onClickNodo]);

    return (
        <div className="frm-viz">
            <div className="frm-crumbs">
                <button type="button" onClick={() => goTo(-1)} disabled={!viewStack.length}>Raíz</button>
                {viewStack.map((node, i) => (
                    <Fragment key={node.code}>
                        <span className="frm-crumbs__sep" aria-hidden="true">›</span>
                        <button type="button" onClick={() => goTo(i)} disabled={i === viewStack.length - 1}>{node.code}</button>
                    </Fragment>
                ))}
                <span className="frm-crumbs__hint">
                    {currentNode.isLeaf
                        ? `${currentNode.fscChildren?.length} formulario(s): clic en uno para ver su ficha`
                        : `${currentNode.children?.length} subgrupos: clic en uno para abrirlo`}
                </span>
            </div>
            {viewStack.length > 0 && (
                <div className="frm-levelinfo">
                    <span className="frm-id">{currentNode.code}</span>
                    {currentNode.label && <span>{currentNode.label}</span>}
                    <span><b>{currentNode.n_formularios}</b> FSC</span>
                    <b>{fmtCLP(currentNode.monto_total)}</b>
                </div>
            )}
            <svg ref={svgRef} role="img" aria-label="Burbujas de ítems presupuestarios" />
            {tooltip && (
                <div className="frm-d3tip" style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
                    {tooltip.d.isFSCNode ? (
                        <>
                            <div className="frm-d3tip__title">{tooltip.d.fscData?.id_formulario || `Folio ${tooltip.d.fscData?.folio}`}</div>
                            <EstadoChip codigo={tooltip.d.fscData?.estado} />
                            <div className="frm-d3tip__muted">{tooltip.d.fscData?.unidad_requirente}</div>
                            <div className="frm-d3tip__money">{fmtCLP(tooltip.d.fscData?.monto_estimado)}</div>
                        </>
                    ) : (
                        <>
                            <div className="frm-d3tip__title">{tooltip.d.code}</div>
                            {tooltip.d.label && <div className="frm-d3tip__muted">{tooltip.d.label}</div>}
                            <div className="frm-d3tip__money">{fmtCLP(tooltip.d.monto_total)}</div>
                            <div className="frm-d3tip__muted">{tooltip.d.n_formularios} formularios</div>
                            {(tooltip.d.children?.length > 0 || tooltip.d.fscChildren?.length > 0) && (
                                <div className="frm-d3tip__muted">
                                    {tooltip.d.children?.length > 0 ? `${tooltip.d.children.length} subgrupos` : `${tooltip.d.fscChildren.length} FSC`}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
