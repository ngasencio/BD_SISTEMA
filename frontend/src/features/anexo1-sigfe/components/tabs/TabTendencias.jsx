import React, { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { useAnexo1Fetch } from '../../hooks/useAnexo1Fetch';
import { fetchTendenciasAnexo1 } from '../../api/anexo1SigfeApi';
import { buildTree, nombreSinCodigo } from './detallado/buildTree';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtPct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const PALETTE = ['#1B3FD8', '#0FAB5C', '#C47820', '#9333EA', '#D0202F', '#0891B2'];

// Fila del árbol de proyección — misma indentación/flecha que Nodo/Fila en
// TablaJerarquica.jsx, pero como <tr> (no tarjeta) para mantener las 5
// columnas numéricas alineadas en tabla, como pidió el usuario.
function FilaProyeccion({ nodo, profundidad, expandidos, toggleExpand, seleccionado, onSeleccionar }) {
    const tieneHijos = nodo.hijos.length > 0;
    const expandido = expandidos.has(nodo.codigo);
    const activo = nodo.concepto === seleccionado;
    const nombre = nombreSinCodigo(nodo[`n${nodo.nivel}_desc`], nodo.codigo) || nodo.nombre;

    return (
        <>
            <tr
                onClick={() => onSeleccionar(nodo)}
                style={{ cursor: 'pointer', background: activo ? 'var(--gob-celeste-lt)' : undefined }}
                data-tip="Click para ver este ítem en el gráfico de Evolución Mensual de arriba."
            >
                <td style={{ paddingLeft: 12 + profundidad * 18, whiteSpace: 'nowrap' }}>
                    {tieneHijos ? (
                        <span
                            className={`tree-expand ${expandido ? 'open' : ''}`}
                            onClick={(e) => { e.stopPropagation(); toggleExpand(nodo.codigo); }}
                        >
                            ▶
                        </span>
                    ) : <span style={{ display: 'inline-block', width: 14 }} />}
                    <span className="tree-code">{nodo.codigo}</span> {nombre}
                </td>
                <td className="td-monto">{fmtMoney(nodo.acumulado_real)}</td>
                <td className="td-monto">{fmtMoney(nodo.proyeccion_diciembre)}</td>
                <td className="td-monto">{fmtMoney(nodo.cierre_anio_anterior)}</td>
                <td className="td-monto" style={{ color: nodo.delta >= 0 ? 'var(--gob-verde)' : 'var(--gob-rojo)' }}>{fmtMoney(nodo.delta)}</td>
                <td className="td-monto" style={{ fontWeight: 700, color: nodo.delta >= 0 ? 'var(--gob-verde)' : 'var(--gob-rojo)' }}>{fmtPct(nodo.delta_pct)}</td>
            </tr>
            {expandido && nodo.hijos.map((h) => (
                <FilaProyeccion
                    key={h.codigo} nodo={h} profundidad={profundidad + 1}
                    expandidos={expandidos} toggleExpand={toggleExpand}
                    seleccionado={seleccionado} onSeleccionar={onSeleccionar}
                />
            ))}
        </>
    );
}

export default function TabTendencias({ filtros, refreshKey }) {
    const [subtitulo, setSubtitulo] = useState('');
    const [anhosSeleccionados, setAnhosSeleccionados] = useState(null);
    const [metrica, setMetrica] = useState('devengado');
    const [puntoSeleccionado, setPuntoSeleccionado] = useState(null);
    const [expandidos, setExpandidos] = useState(() => new Set());

    const { data, loading, error } = useAnexo1Fetch(
        fetchTendenciasAnexo1,
        {
            ue: filtros.ue || undefined,
            excluir_34_35: filtros.excluir3435,
            subtitulo: subtitulo || undefined,
            anhos: anhosSeleccionados?.length ? anhosSeleccionados.join(',') : undefined,
        },
        refreshKey,
        'No se pudo cargar Histórico y Tendencias.',
    );

    useEffect(() => {
        if (data?.anhos_disponibles && anhosSeleccionados === null) {
            setAnhosSeleccionados(data.anhos_disponibles);
        }
    }, [data, anhosSeleccionados]);

    const toggleAnho = (anho) => {
        setAnhosSeleccionados((prev) => {
            const actual = prev || data.anhos_disponibles;
            if (actual.includes(anho)) {
                return actual.length > 1 ? actual.filter((a) => a !== anho) : actual;
            }
            return [...actual, anho].sort();
        });
    };

    const chartData = useMemo(() => {
        if (!data?.series_por_anho) return null;
        const anhosUsados = Object.keys(data.series_por_anho).map(Number).sort();
        const datasets = anhosUsados.map((anho, i) => {
            const col = PALETTE[i % PALETTE.length];
            const serie = data.series_por_anho[String(anho)][metrica];
            return {
                label: String(anho), data: serie.map((v) => v / 1e6),
                borderColor: col, backgroundColor: col + '18',
                borderWidth: anho === data.anho_base ? 2.5 : 1.5,
                pointRadius: 3, tension: 0.3,
            };
        });
        if (data.proyeccion_anho_base && metrica === 'devengado') {
            datasets.push({
                label: `Proyección ${data.anho_base}`,
                data: data.proyeccion_anho_base.map((v) => v / 1e6),
                borderColor: '#94a3b8', borderDash: [6, 4], pointRadius: 0, borderWidth: 2,
            });
        }
        return { labels: MESES, datasets };
    }, [data, metrica]);

    const arbolProyeccion = useMemo(() => buildTree(data?.arbol_proyeccion || []), [data]);

    if (loading && !data) return <div className="loading-spinner">Cargando Histórico y Tendencias…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data || !data.anhos_disponibles.length) return <div className="error-message">No hay datos históricos cargados.</div>;

    const anhosMostrados = anhosSeleccionados || data.anhos_disponibles;

    const toggleExpand = (codigo) => {
        setExpandidos((prev) => {
            const next = new Set(prev);
            next.has(codigo) ? next.delete(codigo) : next.add(codigo);
            return next;
        });
    };

    const seleccionarConcepto = (nodo) => setSubtitulo((prev) => (prev === nodo.concepto ? '' : nodo.concepto));

    const onClickPunto = (evt, els) => {
        if (!els.length || !chartData) return;
        const { datasetIndex, index } = els[0];
        const ds = chartData.datasets[datasetIndex];
        const mes = MESES[index];
        setPuntoSeleccionado((prev) => (
            prev?.label === ds.label && prev?.mes === mes ? null : { label: ds.label, mes, valor: ds.data[index] * 1e6 }
        ));
    };
    const cursorPointer = (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; };

    return (
        <div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="filter-group">
                    <label className="filter-label">Subtítulo</label>
                    <select
                        className="filter-input" value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)}
                        data-tip="También podés elegir un ítem desde la tabla de abajo, en cualquier nivel de la jerarquía."
                    >
                        <option value="">Todos (consolidado)</option>
                        {/* Si la selección viene de un click en la tabla (Ítem/Asignación/etc.,
                            no está en este listado de solo Subtítulos), se agrega como opción
                            sintética para que el select no se vea vacío/inconsistente. */}
                        {subtitulo && !data.subtitulos_disponibles.some((s) => s.concepto === subtitulo) && (
                            <option value={subtitulo}>{subtitulo}</option>
                        )}
                        {data.subtitulos_disponibles.map((s) => (
                            <option key={s.codigo} value={s.concepto}>{s.codigo} {s.nombre}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-group">
                    <label className="filter-label">Métrica</label>
                    <select className="filter-input" value={metrica} onChange={(e) => setMetrica(e.target.value)}>
                        <option value="devengado">Devengado</option>
                        <option value="efectivo">Efectivo</option>
                    </select>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {data.anhos_disponibles.map((a) => (
                        <label key={a} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, padding: '6px 10px', border: '1px solid var(--gob-gris3)', borderRadius: 20, cursor: 'pointer', background: anhosMostrados.includes(a) ? 'var(--gob-celeste-lt)' : '#fff' }}>
                            <input type="checkbox" checked={anhosMostrados.includes(a)} onChange={() => toggleAnho(a)} /> {a}
                        </label>
                    ))}
                </div>
            </div>

            {subtitulo && (
                <div className="analysis-context">
                    🔎 Analizando: {subtitulo}
                    <button onClick={() => setSubtitulo('')} title="Limpiar selección">✕</button>
                </div>
            )}

            {chartData && (
                <div className="card" style={{ padding: 16, height: 380, marginBottom: 20 }}>
                    <div
                        style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-gris5)', marginBottom: 10 }}
                        data-tip="Compara mes a mes el gasto de cada año seleccionado. La línea punteada gris es la proyección del año en curso, extrapolada del año anterior."
                    >
                        Evolución Mensual ({metrica === 'devengado' ? 'Devengado' : 'Efectivo'}) — comparación interanual
                    </div>
                    <Line
                        data={chartData}
                        options={{
                            responsive: true, maintainAspectRatio: false,
                            onClick: onClickPunto,
                            onHover: cursorPointer,
                            plugins: { legend: { position: 'bottom' } },
                            scales: { y: { ticks: { callback: (v) => `M$${v}` } } },
                        }}
                    />
                </div>
            )}

            {puntoSeleccionado && (
                <div className="analysis-context">
                    🔎 Analizando: {puntoSeleccionado.mes} {puntoSeleccionado.label} — {fmtMoney(puntoSeleccionado.valor)}
                    <button onClick={() => setPuntoSeleccionado(null)} title="Limpiar selección">✕</button>
                </div>
            )}

            {arbolProyeccion.length > 0 && (
                <div className="card" style={{ padding: 0 }}>
                    <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--gob-gris5)', borderBottom: '1px solid var(--color-border)' }}>
                        Proyección {data.anho_base} vs. Cierre {data.anho_base - 1} por Subtítulo — desglosado por jerarquía presupuestaria
                    </div>
                    <div style={{ maxHeight: 480, overflowY: 'auto', overflowX: 'auto' }}>
                    <table className="table-gob th-center">
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left' }} data-tip="Subtítulo → Ítem → Asignación → Sub-asignación → Detalle. Click en ▶ para desglosar, click en la fila para verla en el gráfico.">Concepto</th>
                                <th data-tip="Suma del Devengado de los meses ya transcurridos del año en curso.">Acumulado Real</th>
                                <th data-tip="Acumulado real + gasto mensual promedio × meses restantes del año.">Proyección Dic.</th>
                                <th data-tip="Devengado total del mismo concepto en el año anterior completo.">Cierre Año Anterior</th>
                                <th data-tip="Proyección a diciembre menos Cierre del año anterior.">Δ</th>
                                <th data-tip="Variación porcentual de la proyección respecto al cierre del año anterior.">Δ%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {arbolProyeccion.map((n) => (
                                <FilaProyeccion
                                    key={n.codigo} nodo={n} profundidad={0}
                                    expandidos={expandidos} toggleExpand={toggleExpand}
                                    seleccionado={subtitulo} onSeleccionar={seleccionarConcepto}
                                />
                            ))}
                        </tbody>
                    </table>
                    </div>
                </div>
            )}
        </div>
    );
}
