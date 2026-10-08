// Vista «Red»: simulación de fuerzas (D3). Cada círculo es un FSC en camino; los grupos son sus ítems presupuestarios.
import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import '../formularios.css';
import { dvColor, fmtCLP } from '../shared';
import { Chip } from '../ui';
import { colorEstado, ESTADOS_UNIFICACION, getRadiusUni } from './jerarquia';

const perteneceAlGrupo = (d, grupo) => d?.items_propios?.includes(grupo) || d?.primary_item === grupo;

export default function GrafoRed({ nodos, grupos, grupoResaltado, onClickNodo }) {
    const svgRef = useRef(null);
    const simRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);
    const [lineOpacity, setLineOpacity] = useState(0.35);

    // La construcción del grafo depende solo de los datos: el slider de líneas y el resaltado tienen sus
    // propios efectos para no reiniciar la simulación (por eso `lineOpacity` y `onClickNodo` no están en deps).
    useEffect(() => {
        if (!nodos?.length || !grupos?.length || !svgRef.current) return undefined;

        const el = svgRef.current;
        const W = el.clientWidth || el.parentElement?.clientWidth || 700;
        const H = Math.max(340, Math.min(Math.floor(window.innerHeight * 0.52), 510));
        el.setAttribute('height', H);

        d3.select(el).selectAll('*').remove();
        if (simRef.current) simRef.current.stop();

        const C = {
            primary: dvColor('--dv-primary'), suave: dvColor('--dv-surface-sel'), borde: dvColor('--dv-line-hover'),
            ink2: dvColor('--dv-ink-2'), ink4: dvColor('--dv-ink-4'), blanco: dvColor('--dv-surface', '#FFFFFF'),
        };

        const svg = d3.select(el);
        const g = svg.append('g');

        // Cuadrícula de anclas, una por ítem.
        const N = grupos.length;
        const COLS = Math.ceil(Math.sqrt(N * 1.5));
        const ROWS = Math.ceil(N / COLS);
        const padX = W * 0.12;
        const padY = H * 0.16;
        const stepX = (W - padX * 2) / Math.max(COLS - 1, 1);
        const stepY = (H - padY * 2) / Math.max(ROWS - 1, 1);

        const anchors = {};
        grupos.forEach((gi, i) => {
            anchors[gi.item_presupuestario] = {
                x: COLS === 1 ? W / 2 : padX + (i % COLS) * stepX,
                y: ROWS === 1 ? H / 2 : padY + Math.floor(i / COLS) * stepY,
            };
        });

        // Etiquetas de cada cluster.
        const labelG = g.append('g').attr('class', 'cluster-labels').attr('pointer-events', 'none');
        grupos.forEach((gi) => {
            const a = anchors[gi.item_presupuestario];
            if (!a) return;
            const partes = gi.item_presupuestario.split(' - ');
            const codigo = partes[0] || '';
            const nombre = (partes.slice(1).join(' - ') || gi.item_presupuestario).slice(0, 22);

            labelG.append('circle').attr('cx', a.x).attr('cy', a.y).attr('r', 30)
                .attr('fill', C.suave).attr('stroke', C.borde).attr('stroke-width', 1.5).attr('opacity', 0.9);
            labelG.append('text').attr('x', a.x).attr('y', a.y - 3).attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
                .attr('font-size', 9).attr('font-weight', 700).attr('fill', C.primary).text(codigo);
            labelG.append('text').attr('x', a.x).attr('y', a.y + 40).attr('text-anchor', 'middle')
                .attr('font-size', 8).attr('fill', C.ink2).text(nombre);
            labelG.append('text').attr('x', a.x).attr('y', a.y + 51).attr('text-anchor', 'middle')
                .attr('font-size', 8).attr('font-weight', 600).attr('fill', C.primary).text(`${gi.n_formularios} FSC`);
        });

        // Posición de cada FSC = centroide de las anclas de todos sus ítems.
        const nodeData = nodos.map((n) => {
            const items = n.items_propios?.length ? n.items_propios : (n.primary_item ? [n.primary_item] : []);
            const validAnchors = items.map((it) => anchors[it]).filter(Boolean);
            const ax = validAnchors.length ? validAnchors.reduce((s, a) => s + a.x, 0) / validAnchors.length : W * 0.5;
            const ay = validAnchors.length ? validAnchors.reduce((s, a) => s + a.y, 0) / validAnchors.length : H * 0.88;
            return {
                ...n, _ax: ax, _ay: ay, _allAnchors: validAnchors,
                x: ax + (Math.random() - 0.5) * 30, y: ay + (Math.random() - 0.5) * 30, r: getRadiusUni(n.monto_estimado),
            };
        });

        // Líneas de tensión: un FSC con varios ítems se une a cada ancla (detrás de los nodos).
        const linesG = g.append('g').attr('class', 'anchor-lines');
        const lineData = [];
        nodeData.forEach((n) => {
            if ((n._allAnchors || []).length > 1) n._allAnchors.forEach((anchor) => lineData.push({ source: n, target: anchor }));
        });
        linesG.selectAll('line').data(lineData).join('line')
            .attr('stroke', C.ink4).attr('stroke-dasharray', '4,3')
            .attr('stroke-width', 0.5 + lineOpacity * 2.5).attr('opacity', lineOpacity);

        const nodesG = g.append('g').attr('class', 'fsc-nodes');
        const circles = nodesG.selectAll('circle').data(nodeData).join('circle')
            .attr('r', (d) => d.r)
            .attr('fill', (d) => colorEstado(d.estado))
            .attr('stroke', C.blanco).attr('stroke-width', 2).attr('opacity', 0.87)
            .style('cursor', 'pointer')
            .call(d3.drag()
                .on('start', (ev, d) => { if (!ev.active) simRef.current?.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
                .on('end', (ev, d) => { if (!ev.active) simRef.current?.alphaTarget(0); d.fx = null; d.fy = null; }))
            .on('click', (ev, d) => { ev.stopPropagation(); if (onClickNodo) onClickNodo(d); })
            .on('mouseover', (ev, d) => {
                setTooltip({ x: ev.clientX, y: ev.clientY, d });
                d3.select(ev.currentTarget).attr('stroke', C.primary).attr('stroke-width', 3).attr('opacity', 1);
            })
            .on('mousemove', (ev) => setTooltip((p) => (p ? { ...p, x: ev.clientX, y: ev.clientY } : null)))
            .on('mouseout', (ev) => {
                setTooltip(null);
                d3.select(ev.currentTarget).attr('stroke', C.blanco).attr('stroke-width', 2).attr('opacity', 0.87);
            });

        const labelsG = g.append('g').attr('class', 'fsc-labels').attr('pointer-events', 'none');
        labelsG.selectAll('text').data(nodeData.filter((d) => d.r >= 14)).join('text')
            .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
            .attr('font-size', 9).attr('font-weight', 700).attr('fill', '#fff').text((d) => d.folio);

        const sim = d3.forceSimulation(nodeData)
            .force('x', d3.forceX((d) => d._ax).strength(0.28))
            .force('y', d3.forceY((d) => d._ay).strength(0.28))
            .force('collide', d3.forceCollide((d) => d.r + 3).strength(1).iterations(3))
            .force('charge', d3.forceManyBody().strength(-12));
        simRef.current = sim;

        sim.on('tick', () => {
            circles
                .attr('cx', (d) => { d.x = Math.max(d.r + 4, Math.min(W - d.r - 4, d.x)); return d.x; })
                .attr('cy', (d) => { d.y = Math.max(d.r + 4, Math.min(H - d.r - 4, d.y)); return d.y; });
            labelsG.selectAll('text').attr('x', (d) => d.x).attr('y', (d) => d.y);
            linesG.selectAll('line')
                .attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
                .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
        });

        svg.call(d3.zoom().scaleExtent([0.35, 4]).on('zoom', (ev) => g.attr('transform', ev.transform)));

        return () => sim.stop();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodos, grupos]);

    // Opacidad de las líneas multi-ítem, sin reiniciar la simulación.
    useEffect(() => {
        if (!svgRef.current) return;
        d3.select(svgRef.current).selectAll('.anchor-lines line')
            .attr('opacity', lineOpacity).attr('stroke-width', 0.5 + lineOpacity * 2.5);
    }, [lineOpacity]);

    // Resaltado de un grupo, sin reiniciar la simulación.
    useEffect(() => {
        if (!svgRef.current) return;
        const blanco = dvColor('--dv-surface', '#FFFFFF');
        const primary = dvColor('--dv-primary');
        const cs = d3.select(svgRef.current).selectAll('.fsc-nodes circle');
        if (!grupoResaltado) {
            cs.attr('opacity', 0.87).attr('stroke', blanco).attr('stroke-width', 2);
        } else {
            cs.attr('opacity', (d) => (perteneceAlGrupo(d, grupoResaltado) ? 1 : 0.12))
                .attr('stroke', (d) => (perteneceAlGrupo(d, grupoResaltado) ? primary : blanco))
                .attr('stroke-width', (d) => (perteneceAlGrupo(d, grupoResaltado) ? 3 : 1));
        }
    }, [grupoResaltado]);

    return (
        <div className="frm-viz">
            <div className="frm-viz__legend">
                {ESTADOS_UNIFICACION.map((estado) => (
                    <span key={estado} className="frm-viz__key"><i style={{ background: colorEstado(estado) }} />{estado}</span>
                ))}
                <span className="frm-viz__hint">Tamaño = monto · arrastra para mover · rueda para acercar</span>
                <label className="frm-viz__slider">
                    <span>Líneas multi-ítem</span>
                    <input type="range" min="0" max="1" step="0.05" value={lineOpacity} onChange={(e) => setLineOpacity(parseFloat(e.target.value))} />
                    <b>{Math.round(lineOpacity * 100)}%</b>
                </label>
            </div>
            <svg ref={svgRef} role="img" aria-label="Red de formularios agrupados por ítem presupuestario" />
            {tooltip && (
                <div className="frm-d3tip" style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
                    <div className="frm-d3tip__title">{tooltip.d.id_formulario || `Folio ${tooltip.d.folio}`}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Chip variante="none">{tooltip.d.estado}</Chip>
                        {tooltip.d.destino_actual && <span className="frm-d3tip__muted">Bandeja de {tooltip.d.destino_actual}</span>}
                    </div>
                    <div className="frm-d3tip__muted">{tooltip.d.unidad_requirente}</div>
                    {tooltip.d.requerimiento && (
                        <div className="frm-d3tip__muted" style={{ fontStyle: 'italic' }}>
                            {tooltip.d.requerimiento.slice(0, 80)}{tooltip.d.requerimiento.length > 80 ? '…' : ''}
                        </div>
                    )}
                    <div className="frm-d3tip__money">{fmtCLP(tooltip.d.monto_estimado)}</div>
                    {tooltip.d.primary_item && <div className="frm-d3tip__muted">Ítem: {tooltip.d.primary_item.slice(0, 55)}</div>}
                </div>
            )}
        </div>
    );
}
