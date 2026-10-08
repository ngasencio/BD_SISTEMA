// Vista «Productos»: ítem → categoría → formularios, en tres presentaciones (cascada, acordeón y treemap).
import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import '../formularios.css';
import { dvColor, fmtCLP, paletaGrupos } from '../shared';
import { Columna, Flecha, FscMini } from './Piezas';
import { alturaColumnas, parseItemCode } from './jerarquia';

const SUBTABS = [
    { id: 'pipeline', label: 'Cascada' },
    { id: 'acordeon', label: 'Acordeón' },
    { id: 'treemap', label: 'Treemap' },
];

const Caret = ({ abierto }) => <span className={`frm-caret${abierto ? ' is-open' : ''}`} aria-hidden="true">▶</span>;

// ─── A: cascada ítem → categoría → FSC ───────────────────────────────────────

function ProductosCascada({ gruposProductos, onClickNodo }) {
    const [selItem, setSelItem] = useState(null);
    const [selCat, setSelCat] = useState(null);
    useEffect(() => { setSelItem(null); setSelCat(null); }, [gruposProductos]);

    const selItemData = selItem ? gruposProductos.find((g) => g.item_presupuestario === selItem) : null;
    const cats = selItemData?.categorias || [];
    const selCatData = selCat ? cats.find((c) => c.categoria === selCat) : null;
    const fscList = selCatData ? selCatData.formularios : (selItemData ? selItemData.categorias.flatMap((c) => c.formularios) : []);
    const alturaMax = alturaColumnas();

    return (
        <div className="frm-cascade__scroll">
            <div className="frm-cascade">
                <Columna titulo={`Ítems presupuestarios (${gruposProductos.length})`} alturaMax={alturaMax}>
                    {gruposProductos.map((g) => {
                        const { code, label } = parseItemCode(g.item_presupuestario);
                        const activo = selItem === g.item_presupuestario;
                        return (
                            <button key={g.item_presupuestario} type="button" className={`frm-item${activo ? ' is-active' : ''}`} aria-pressed={activo}
                                    onClick={() => { setSelItem(activo ? null : g.item_presupuestario); setSelCat(null); }}>
                                <div className="frm-item__top"><span className="frm-id">{code}</span><span className="frm-item__count">{g.n_formularios} FSC</span></div>
                                {label && <div className="frm-item__label">{label}</div>}
                                <div className="frm-item__money">{fmtCLP(g.monto_total)}</div>
                            </button>
                        );
                    })}
                </Columna>
                <Flecha />
                <Columna titulo={`Categorías (${cats.length})`} activa={Boolean(selItemData)} pista="← Selecciona un ítem" alturaMax={alturaMax}>
                    {cats.map((c) => {
                        const activo = selCat === c.categoria;
                        return (
                            <button key={c.categoria} type="button" className={`frm-item${activo ? ' is-active' : ''}`} aria-pressed={activo}
                                    onClick={() => setSelCat(activo ? null : c.categoria)}>
                                <div className="frm-item__top"><span className="frm-item__count">{c.categoria}</span><span className="frm-item__count">{c.n_formularios}</span></div>
                                <div className="frm-item__money">{fmtCLP(c.monto_total)}</div>
                            </button>
                        );
                    })}
                </Columna>
                <Flecha />
                <Columna titulo={`Formularios (${fscList.length})`} activa={Boolean(selItemData)} pista="← Selecciona un ítem" vacio="Sin formularios" alturaMax={alturaMax} ancho={250}>
                    {fscList.map((fsc) => <FscMini key={`${fsc.folio}-${fsc.anho}`} fsc={fsc} onClickNodo={onClickNodo} />)}
                </Columna>
            </div>
        </div>
    );
}

// ─── B: acordeón ─────────────────────────────────────────────────────────────

function ProductosAcordeon({ gruposProductos, onClickNodo }) {
    const [openItem, setOpenItem] = useState(null);
    const [openCat, setOpenCat] = useState({});
    const alternarItem = (item) => { setOpenItem((p) => (p === item ? null : item)); setOpenCat({}); };
    const alternarCat = (cat) => setOpenCat((p) => ({ ...p, [cat]: !p[cat] }));

    return (
        <div className="frm-acc">
            {gruposProductos.map((g) => {
                const { code, label } = parseItemCode(g.item_presupuestario);
                const abierto = openItem === g.item_presupuestario;
                return (
                    <div key={g.item_presupuestario} className={`frm-acc__item${abierto ? ' is-open' : ''}`}>
                        <button type="button" className="frm-acc__head" aria-expanded={abierto} onClick={() => alternarItem(g.item_presupuestario)}>
                            <Caret abierto={abierto} />
                            <span className="frm-id">{code}</span>
                            <span className="frm-acc__title">{label || code}</span>
                            <span className="frm-acc__meta">{g.n_formularios} FSC</span>
                            <span className="frm-acc__meta">{fmtCLP(g.monto_total)}</span>
                        </button>
                        {abierto && (
                            <div className="frm-acc__body">
                                {g.categorias.map((c) => {
                                    const catAbierta = Boolean(openCat[c.categoria]);
                                    return (
                                        <div key={c.categoria} className={`frm-acc__sub${catAbierta ? ' is-open' : ''}`}>
                                            <button type="button" className="frm-acc__subhead" aria-expanded={catAbierta} onClick={() => alternarCat(c.categoria)}>
                                                <Caret abierto={catAbierta} />
                                                <span className="frm-acc__title" style={{ fontWeight: 'var(--dv-fw-semi)' }}>{c.categoria}</span>
                                                <span className="frm-acc__meta">{c.n_formularios} FSC · {fmtCLP(c.monto_total)}</span>
                                            </button>
                                            {catAbierta && (
                                                <div className="frm-acc__subbody">
                                                    {c.formularios.map((fsc) => <FscMini key={`${fsc.folio}-${fsc.anho}`} fsc={fsc} onClickNodo={onClickNodo} />)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── C: treemap ──────────────────────────────────────────────────────────────

function ProductosTreemap({ gruposProductos, onClickNodo }) {
    const containerRef = useRef(null);
    const svgRef = useRef(null);
    const [panelCat, setPanelCat] = useState(null);
    const [tooltip, setTooltip] = useState(null);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !gruposProductos?.length) return;
        const W = containerRef.current.clientWidth || 700;
        const H = Math.max(320, Math.min(Math.floor(window.innerHeight * 0.48), 480));
        svgRef.current.setAttribute('height', H);
        d3.select(svgRef.current).selectAll('*').remove();

        const root = d3.hierarchy({
            name: 'root',
            children: gruposProductos.map((g) => ({
                name: g.item_presupuestario,
                children: g.categorias.map((c) => ({
                    name: c.categoria, value: Math.max(1, c.monto_total || c.n_formularios), n_formularios: c.n_formularios,
                    monto_total: c.monto_total, formularios: c.formularios, item: g.item_presupuestario,
                })),
            })),
        }).sum((d) => d.value || 0).sort((a, b) => b.value - a.value);

        d3.treemap().size([W, H]).padding(2).paddingTop(18)(root);

        const l1Codes = [...new Set(gruposProductos.map((g) => parseItemCode(g.item_presupuestario).code.split('.')[0]))];
        const colorL1 = d3.scaleOrdinal(paletaGrupos()).domain(l1Codes);
        const tinta3 = dvColor('--dv-ink-3');
        const svg = d3.select(svgRef.current);

        // Nivel 1 (ítem): solo borde y etiqueta.
        svg.selectAll('.item-group').data(root.children || []).join('g').attr('class', 'item-group')
            .each(function pintarItem(d) {
                const { code } = parseItemCode(d.data.name);
                const color = colorL1(code.split('.')[0]);
                d3.select(this).append('rect')
                    .attr('x', d.x0).attr('y', d.y0).attr('width', d.x1 - d.x0).attr('height', d.y1 - d.y0)
                    .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).attr('rx', 4);
                if (d.x1 - d.x0 > 40) {
                    d3.select(this).append('text').attr('x', d.x0 + 5).attr('y', d.y0 + 13)
                        .attr('font-size', 9).attr('font-weight', 700).attr('fill', color).text(code);
                }
            });

        // Hojas (categorías).
        const hojas = svg.selectAll('.cat-leaf').data(root.leaves()).join('g').attr('class', 'cat-leaf').attr('cursor', 'pointer')
            .on('click', (ev, d) => { ev.stopPropagation(); setPanelCat(d.data); })
            .on('mouseover', (ev, d) => { d3.select(ev.currentTarget).select('rect').attr('opacity', 1); setTooltip({ x: ev.clientX, y: ev.clientY, d: d.data }); })
            .on('mousemove', (ev) => setTooltip((p) => (p ? { ...p, x: ev.clientX, y: ev.clientY } : null)))
            .on('mouseout', (ev) => { d3.select(ev.currentTarget).select('rect').attr('opacity', 0.82); setTooltip(null); });

        const colorHoja = (d) => colorL1(parseItemCode(d.data.item).code.split('.')[0]);
        hojas.append('rect')
            .attr('x', (d) => d.x0 + 1).attr('y', (d) => d.y0 + 1)
            .attr('width', (d) => Math.max(0, d.x1 - d.x0 - 2)).attr('height', (d) => Math.max(0, d.y1 - d.y0 - 2))
            .attr('rx', 3).attr('fill', (d) => `${colorHoja(d)}28`).attr('stroke', colorHoja).attr('stroke-width', 1).attr('opacity', 0.82);

        hojas.each(function pintarHoja(d) {
            const w = d.x1 - d.x0 - 4;
            const h = d.y1 - d.y0 - 4;
            if (w < 20 || h < 12) return;
            d3.select(this).append('text').attr('x', d.x0 + 4).attr('y', d.y0 + 14)
                .attr('font-size', Math.min(11, w / 8 + 5)).attr('font-weight', 600).attr('fill', colorHoja(d))
                .text(d.data.name.length > 20 ? `${d.data.name.slice(0, 20)}…` : d.data.name);
            if (h > 30) {
                d3.select(this).append('text').attr('x', d.x0 + 4).attr('y', d.y0 + 27)
                    .attr('font-size', 9).attr('fill', tinta3).text(`${d.data.n_formularios} FSC · ${fmtCLP(d.data.monto_total)}`);
            }
        });
    }, [gruposProductos]);

    return (
        <div>
            <div ref={containerRef} className="frm-viz">
                <svg ref={svgRef} role="img" aria-label="Treemap de categorías por ítem presupuestario" />
                {tooltip && (
                    <div className="frm-d3tip" style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
                        <div className="frm-d3tip__title">{tooltip.d.name}</div>
                        <div className="frm-d3tip__muted">{parseItemCode(tooltip.d.item).code}</div>
                        <div className="frm-d3tip__money">{fmtCLP(tooltip.d.monto_total)}</div>
                        <div className="frm-d3tip__muted">{tooltip.d.n_formularios} formularios · clic para ver</div>
                    </div>
                )}
            </div>
            {panelCat && (
                <div className="frm-sidepanel" onClick={() => setPanelCat(null)}>
                    <aside className="frm-sidepanel__box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Formularios de ${panelCat.name}`}>
                        <header className="frm-sidepanel__head">
                            <div>
                                <h3>{panelCat.name}</h3>
                                <p>{parseItemCode(panelCat.item).code} · {panelCat.n_formularios} formularios · {fmtCLP(panelCat.monto_total)}</p>
                            </div>
                            <button type="button" className="dv-btn dv-btn--on-dark dv-btn--icon" onClick={() => setPanelCat(null)} aria-label="Cerrar">✕</button>
                        </header>
                        <div className="frm-sidepanel__body">
                            {panelCat.formularios.map((fsc) => (
                                <FscMini key={`${fsc.folio}-${fsc.anho}`} fsc={fsc} onClickNodo={(f) => { setPanelCat(null); onClickNodo?.(f); }} />
                            ))}
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
}

// ─── Contenedor ──────────────────────────────────────────────────────────────

export default function ProductosVistas({ gruposProductos, onClickNodo }) {
    const [subTab, setSubTab] = useState('pipeline');

    if (!gruposProductos?.length) {
        return <div className="frm-note" style={{ textAlign: 'center' }}>Sin ítems presupuestarios compartidos entre formularios para el período seleccionado.</div>;
    }

    const totalCategorias = gruposProductos.reduce((s, g) => s + g.n_categorias, 0);
    const totalMonto = gruposProductos.reduce((s, g) => s + g.monto_total, 0);

    return (
        <>
            <div className="frm-controls">
                <span className="frm-controls__label">
                    <b>{gruposProductos.length}</b> ítems · <b>{totalCategorias}</b> categorías · <b>{fmtCLP(totalMonto)}</b> estimados
                </span>
                <div className="frm-segmented frm-controls__end" style={{ marginBottom: 0 }} role="tablist" aria-label="Presentación">
                    {SUBTABS.map((st) => (
                        <button key={st.id} type="button" role="tab" aria-selected={subTab === st.id} className={subTab === st.id ? 'is-active' : ''} onClick={() => setSubTab(st.id)}>
                            {st.label}
                        </button>
                    ))}
                </div>
            </div>
            {subTab === 'pipeline' && <ProductosCascada gruposProductos={gruposProductos} onClickNodo={onClickNodo} />}
            {subTab === 'acordeon' && <ProductosAcordeon gruposProductos={gruposProductos} onClickNodo={onClickNodo} />}
            {subTab === 'treemap' && <ProductosTreemap gruposProductos={gruposProductos} onClickNodo={onClickNodo} />}
        </>
    );
}
