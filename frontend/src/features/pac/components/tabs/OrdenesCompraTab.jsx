import React from 'react';
import { Bar, Line } from 'react-chartjs-2';

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const TRIMESTRES = [
    { label: 'T1 (Ene-Mar)', meses: [1, 2, 3] },
    { label: 'T2 (Abr-Jun)', meses: [4, 5, 6] },
    { label: 'T3 (Jul-Sep)', meses: [7, 8, 9] },
    { label: 'T4 (Oct-Dic)', meses: [10, 11, 12] },
];

const COLOR_ENLAZADA = '#16a34a';
const COLOR_NO_ENLAZADA = '#dc2626';
const COLOR_AZUL = '#1e3a5f';
const PALETA_ANIOS = ['#1e3a5f', '#38b2bd', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];

const barOptsMonto = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
        legend: { position: 'top', labels: { font: { size: 11 }, padding: 10, boxWidth: 12 } },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
    },
    scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, callback: (v) => fmtN(v) } },
    },
};

const barOptsCantidad = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
        legend: { position: 'top', labels: { font: { size: 11 }, padding: 10, boxWidth: 12 } },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtN(ctx.parsed.y)} OC` } },
    },
    scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, precision: 0, callback: (v) => fmtN(v) } },
    },
};

// ── Tarjeta institucional para tablas pivote/agregadas: header azul + más espacio entre secciones ──
function PivotCard({ title, children }) {
    return (
        <div className="pac-pivot-card">
            <div className="pac-pivot-card-header">{title}</div>
            <div className="pac-pivot-card-body">{children}</div>
        </div>
    );
}

export default function OrdenesCompraTab({ indicadores, ocStats, anio = 2026 }) {
    if (!ocStats) {
        return (
            <div style={{ textAlign: 'center', padding: 60, color: '#7a8899', fontSize: 14 }}>
                No hay datos de Órdenes de Compra disponibles para {anio}.
            </div>
        );
    }

    // ── Evolución Mensual: Enlazada vs No Enlazada (monto, FechaEnvio del año seleccionado) ──
    const evolMap = {};
    (ocStats.evolucion_enlace || []).forEach((r) => { evolMap[r.mes] = r; });
    const evolucionData = {
        labels: MESES_CORTOS,
        datasets: [
            { label: 'Enlazada', data: Array.from({ length: 12 }, (_, i) => evolMap[i + 1]?.enlazada ?? 0), backgroundColor: COLOR_ENLAZADA, borderRadius: 4 },
            { label: 'No Enlazada', data: Array.from({ length: 12 }, (_, i) => evolMap[i + 1]?.no_enlazada ?? 0), backgroundColor: COLOR_NO_ENLAZADA, borderRadius: 4 },
        ],
    };

    // ── Evolución Mensual por CANTIDAD de OC (N°, año seleccionado) ──
    const evolucionCantidadData = {
        labels: MESES_CORTOS,
        datasets: [
            { label: 'Enlazada', data: Array.from({ length: 12 }, (_, i) => evolMap[i + 1]?.cantidad_enlazada ?? 0), backgroundColor: COLOR_ENLAZADA, borderRadius: 4 },
            { label: 'No Enlazada', data: Array.from({ length: 12 }, (_, i) => evolMap[i + 1]?.cantidad_no_enlazada ?? 0), backgroundColor: COLOR_NO_ENLAZADA, borderRadius: 4 },
        ],
    };

    // ── Comparativo Trimestral (monto, año seleccionado) ──
    const trimestralData = {
        labels: TRIMESTRES.map((t) => t.label),
        datasets: [
            {
                label: 'Enlazada',
                data: TRIMESTRES.map((t) => t.meses.reduce((s, m) => s + (evolMap[m]?.enlazada ?? 0), 0)),
                backgroundColor: COLOR_ENLAZADA, borderRadius: 4,
            },
            {
                label: 'No Enlazada',
                data: TRIMESTRES.map((t) => t.meses.reduce((s, m) => s + (evolMap[m]?.no_enlazada ?? 0), 0)),
                backgroundColor: COLOR_NO_ENLAZADA, borderRadius: 4,
            },
        ],
    };

    // ── Comparativo Anual: % Enlace PAC (institucional, todos los años con datos) ──
    const anualSorted = [...(ocStats.historico_enlace_anual || [])].sort((a, b) => a.anio - b.anio);
    const anualData = {
        labels: anualSorted.map((r) => r.anio),
        datasets: [{
            label: '% Enlace PAC', data: anualSorted.map((r) => r.pct_enlace),
            borderColor: COLOR_AZUL, backgroundColor: 'rgba(30,58,95,0.12)',
            fill: true, tension: .3, pointBackgroundColor: COLOR_AZUL, pointRadius: 4,
        }],
    };
    const anualOpts = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx) => ` ${ctx.parsed.y}% enlazado`,
                    afterLabel: (ctx) => {
                        const r = anualSorted[ctx.dataIndex];
                        return r ? [`${fmtN(r.enlazadas)} de ${fmtN(r.total_oc)} OC`, `Monto enlazado: ${fmt(r.monto_enlazado)}`] : [];
                    },
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { min: 0, max: 100, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, callback: (v) => v + '%' } },
        },
    };

    // ── % Enlace Mensual — comparativo con años anteriores (últimos 5 años con datos) ──
    const aniosDisponibles = [...new Set(anualSorted.map((r) => r.anio))].sort((a, b) => a - b);
    const aniosRecientes = aniosDisponibles.slice(-5);
    const mensualPorAnio = {};
    (ocStats.historico_enlace_mensual || []).forEach((r) => {
        if (!aniosRecientes.includes(r.anio)) return;
        if (!mensualPorAnio[r.anio]) mensualPorAnio[r.anio] = {};
        mensualPorAnio[r.anio][r.mes] = r.pct_enlace;
    });
    const enlaceMensualMultiAnioData = {
        labels: MESES_CORTOS,
        datasets: aniosRecientes.map((a, i) => ({
            label: String(a),
            data: Array.from({ length: 12 }, (_, m) => mensualPorAnio[a]?.[m + 1] ?? null),
            borderColor: PALETA_ANIOS[i % PALETA_ANIOS.length],
            backgroundColor: PALETA_ANIOS[i % PALETA_ANIOS.length],
            tension: .3, pointRadius: 3, spanGaps: true,
            borderWidth: a === anio ? 3.5 : 1.5,
        })),
    };
    const enlaceMensualOpts = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y + '%' : 'sin datos'}` } },
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { min: 0, max: 100, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, callback: (v) => v + '%' } },
        },
    };

    // ── Montos Enlazados vs No Enlazados por Año (todos los años con datos) ──
    const montosChartData = {
        labels: anualSorted.map((r) => r.anio),
        datasets: [
            { label: 'Enlazada', data: anualSorted.map((r) => r.monto_enlazado), backgroundColor: COLOR_ENLAZADA, borderRadius: 4 },
            { label: 'No Enlazada', data: anualSorted.map((r) => r.monto_no_enlazado), backgroundColor: COLOR_NO_ENLAZADA, borderRadius: 4 },
        ],
    };

    // ── Cantidad de OC Enlazadas vs No Enlazadas por Año (todos los años con datos) ──
    const cantidadPorAnioChartData = {
        labels: anualSorted.map((r) => r.anio),
        datasets: [
            { label: 'Enlazada', data: anualSorted.map((r) => r.enlazadas), backgroundColor: COLOR_ENLAZADA, borderRadius: 4 },
            { label: 'No Enlazada', data: anualSorted.map((r) => r.total_oc - r.enlazadas), backgroundColor: COLOR_NO_ENLAZADA, borderRadius: 4 },
        ],
    };

    // ── Matriz Cruzada: Tipo OC × Tipo Interno ──
    const matriz = ocStats.matriz_tipo_oc_interno || { filas: [], columnas: [], datos: {}, insight: null };
    const matrizMax = Math.max(
        1, ...matriz.filas.flatMap((f) => matriz.columnas.map((c) => matriz.datos[f]?.[c] || 0))
    );

    const corregidas = ocStats.corregidas || {};

    return (
        <div className="pac-tab-content">
            <div className="pac-doc-section-title" style={{ marginTop: 0 }}>Resumen Órdenes de Compra {anio}</div>
            <table className="pac-doc-table">
                <tbody>
                    <tr>
                        <td style={{ fontWeight: 600 }}>Total OC emitidas</td>
                        <td>{fmtN(ocStats.resumen.total_oc)}</td>
                        <td style={{ fontWeight: 600 }}>Monto Neto Total</td>
                        <td>{fmt(ocStats.resumen.monto_total)}</td>
                    </tr>
                    <tr>
                        <td style={{ fontWeight: 600 }}>Monto Bruto Total</td>
                        <td>{fmt(ocStats.resumen.monto_bruto)}</td>
                        <td style={{ fontWeight: 600 }}>Monto OC-PAC</td>
                        <td>{fmt(indicadores?.monto_enlazado_pac)}</td>
                    </tr>
                </tbody>
            </table>

            {corregidas.oc_unicas_corregidas > 0 && (
                <div className="pac-doc-note">
                    🔧 <strong>Corregidas manualmente:</strong> {fmtN(corregidas.oc_unicas_corregidas)} OC fueron
                    revisadas y enlazadas a mano al PAC (de {fmtN(corregidas.total_revisiones)} revisiones registradas).
                    De ellas, <strong>{fmtN(corregidas.sincronizadas)}</strong> ya quedaron confirmadas por la sincronización
                    con Mercado Público{corregidas.esperando_sync > 0 && <> y <strong>{fmtN(corregidas.esperando_sync)}</strong> aún esperan que el próximo ETL las refleje</>}.
                </div>
            )}

            <div className="pac-doc-section-title">Evolución Mensual: Enlazada vs No Enlazada — Monto ({anio})</div>
            <div style={{ height: 280, marginBottom: 20 }}>
                <Bar data={evolucionData} options={barOptsMonto} />
            </div>

            <div className="pac-doc-section-title">Evolución Mensual: Enlazada vs No Enlazada — N° de OC ({anio})</div>
            <div className="pac-doc-sub" style={{ margin: '-4px 0 10px' }}>
                Mismo período que el gráfico anterior, ahora por cantidad de Órdenes de Compra en vez de monto.
            </div>
            <div style={{ height: 280, marginBottom: 20 }}>
                <Bar data={evolucionCantidadData} options={barOptsCantidad} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                    <div className="pac-doc-section-title" style={{ marginTop: 0 }}>Comparativo Trimestral ({anio})</div>
                    <div style={{ height: 240 }}>
                        <Bar data={trimestralData} options={barOptsMonto} />
                    </div>
                </div>
                <div>
                    <div className="pac-doc-section-title" style={{ marginTop: 0 }}>Comparativo Anual — % Enlace PAC</div>
                    <div style={{ height: 240 }}>
                        <Line data={anualData} options={anualOpts} />
                    </div>
                </div>
            </div>

            <div className="pac-doc-section-title">% Enlace Mensual — Comparativo con Años Anteriores</div>
            <div className="pac-doc-sub" style={{ margin: '-4px 0 10px' }}>
                Últimos {aniosRecientes.length} años con datos. La línea del año {anio} (seleccionado arriba) se resalta más gruesa.
            </div>
            <div style={{ height: 300, marginBottom: 20 }}>
                <Line data={enlaceMensualMultiAnioData} options={enlaceMensualOpts} />
            </div>

            <PivotCard title="💰 Montos Enlazados vs No Enlazados por Año">
                <div style={{ height: 260, marginBottom: 16 }}>
                    <Bar data={montosChartData} options={barOptsMonto} />
                </div>
                <table className="pac-doc-table">
                    <thead>
                        <tr>
                            <th>Año</th><th>OC Enlazadas</th><th>Monto Enlazado</th>
                            <th>Monto No Enlazado</th><th>Total</th><th>% Enlace</th>
                        </tr>
                    </thead>
                    <tbody>
                        {anualSorted.map((r) => (
                            <tr key={r.anio}>
                                <td style={{ fontWeight: 700 }}>{r.anio}</td>
                                <td>{fmtN(r.enlazadas)} / {fmtN(r.total_oc)}</td>
                                <td>{fmt(r.monto_enlazado)}</td>
                                <td>{fmt(r.monto_no_enlazado)}</td>
                                <td style={{ fontWeight: 600 }}>{fmt(r.monto_enlazado + r.monto_no_enlazado)}</td>
                                <td style={{ color: r.pct_enlace >= 50 ? COLOR_ENLAZADA : COLOR_NO_ENLAZADA, fontWeight: 700 }}>
                                    {r.pct_enlace}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </PivotCard>

            <PivotCard title="🔢 Cantidad de OC Enlazadas vs No Enlazadas por Año">
                <div style={{ height: 260, marginBottom: 16 }}>
                    <Bar data={cantidadPorAnioChartData} options={barOptsCantidad} />
                </div>
                <table className="pac-doc-table">
                    <thead>
                        <tr><th>Año</th><th>N° Enlazadas</th><th>N° No Enlazadas</th><th>Total OC</th><th>% Enlace</th></tr>
                    </thead>
                    <tbody>
                        {anualSorted.map((r) => (
                            <tr key={r.anio}>
                                <td style={{ fontWeight: 700 }}>{r.anio}</td>
                                <td>{fmtN(r.enlazadas)}</td>
                                <td>{fmtN(r.total_oc - r.enlazadas)}</td>
                                <td style={{ fontWeight: 600 }}>{fmtN(r.total_oc)}</td>
                                <td style={{ color: r.pct_enlace >= 50 ? COLOR_ENLAZADA : COLOR_NO_ENLAZADA, fontWeight: 700 }}>
                                    {r.pct_enlace}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </PivotCard>

            <div className="pac-doc-section-title">Estado de OC</div>
            <table className="pac-doc-table">
                <thead>
                    <tr><th>Estado</th><th>Cantidad</th><th>Monto Neto</th></tr>
                </thead>
                <tbody>
                    {ocStats.por_estado.map((r, i) => (
                        <tr key={i}>
                            <td>{r.estado || '—'}</td>
                            <td>{fmtN(r.cantidad)}</td>
                            <td>{fmt(r.monto)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <PivotCard title={`📋 Resumen por Tipo OC — Fuera del PAC (${anio})`}>
                <table className="pac-doc-table">
                    <thead>
                        <tr><th>Tipo OC</th><th>Cantidad</th><th>Monto Neto</th></tr>
                    </thead>
                    <tbody>
                        {(ocStats.no_enlazadas_tipo_oc || []).map((r, i) => (
                            <tr key={i}>
                                <td>{r.tipo_oc}</td>
                                <td>{fmtN(r.cantidad)}</td>
                                <td>{fmt(r.monto)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </PivotCard>

            <PivotCard title={`🔀 Matriz Cruzada: Tipo OC × Tipo Interno (N° OCs, fuera PAC — ${anio})`}>
                <div style={{ overflowX: 'auto' }}>
                    <table className="pac-doc-table">
                        <thead>
                            <tr>
                                <th>Tipo OC \ Tipo Interno</th>
                                {matriz.columnas.map((c) => <th key={c} style={{ textAlign: 'center' }}>{c}</th>)}
                                <th style={{ textAlign: 'center' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {matriz.filas.map((fila) => {
                                const rowTotal = matriz.columnas.reduce((s, c) => s + (matriz.datos[fila]?.[c] || 0), 0);
                                return (
                                    <tr key={fila}>
                                        <td style={{ fontWeight: 600 }}>{fila}</td>
                                        {matriz.columnas.map((c) => {
                                            const val = matriz.datos[fila]?.[c] || 0;
                                            const intensity = val / matrizMax;
                                            return (
                                                <td key={c} style={{
                                                    textAlign: 'center',
                                                    background: val ? `rgba(220,38,38,${(0.08 + intensity * 0.55).toFixed(2)})` : undefined,
                                                }}>
                                                    {val || '—'}
                                                </td>
                                            );
                                        })}
                                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{rowTotal}</td>
                                    </tr>
                                );
                            })}
                            <tr className="pac-doc-total-row">
                                <td>Total</td>
                                {matriz.columnas.map((c) => {
                                    const colTotal = matriz.filas.reduce((s, f) => s + (matriz.datos[f]?.[c] || 0), 0);
                                    return <td key={c} style={{ textAlign: 'center' }}>{colTotal}</td>;
                                })}
                                <td style={{ textAlign: 'center' }}>
                                    {matriz.filas.reduce((s, f) => s + matriz.columnas.reduce((s2, c) => s2 + (matriz.datos[f]?.[c] || 0), 0), 0)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                {matriz.insight && (
                    <div className="pac-doc-note" style={{ marginTop: 14, marginBottom: 0 }}>
                        🔎 <strong>Lectura de la matriz:</strong> la mayor concentración de OC fuera del PAC está en{' '}
                        <strong>{matriz.insight.tipo_oc} × {matriz.insight.tipo_interno}</strong>, con{' '}
                        <strong>{fmtN(matriz.insight.cantidad)}</strong> OC — un <strong>{matriz.insight.pct_del_total}%</strong> del
                        total fuera del PAC analizado en esta matriz ({fmtN(matriz.insight.total_matriz)} OC). Ese cruce es el punto
                        de mayor impacto para priorizar revisión y posible enlace manual al PAC.
                    </div>
                )}
            </PivotCard>

            <div className="pac-doc-section-title">Top 10 Proveedores</div>
            <table className="pac-doc-table">
                <thead>
                    <tr><th>Proveedor</th><th>RUT</th><th>OC</th><th>Monto</th></tr>
                </thead>
                <tbody>
                    {ocStats.top_proveedores.slice(0, 10).map((r, i) => (
                        <tr key={i}>
                            <td>{r.nombre || '—'}</td>
                            <td>{r.rut || '—'}</td>
                            <td>{fmtN(r.cantidad)}</td>
                            <td>{fmt(r.monto)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
