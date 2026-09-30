import React, { useMemo, useState } from 'react';
import { useAnexo1Fetch } from '../../hooks/useAnexo1Fetch';
import { fetchMapaGastoAnexo1 } from '../../api/anexo1SigfeApi';

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtM = (n) => 'M$ ' + ((n ?? 0) / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 });
const fmtPct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);

// Params propios del tab: a diferencia del resto de tabs de Anexo N°1, este
// NO envía `ue` (el establecimiento es el eje de la tabla, no un filtro) y
// agrega su propio selector de concepto (`subtitulo`), mismo patrón que
// TabResumen/TabBurnRate.
function paramsMapaGasto(filtros, subtitulo) {
    return {
        anho: filtros.anho || undefined,
        mes_desde: filtros.mesDesde || undefined,
        mes_hasta: filtros.mesHasta || undefined,
        excluir_34_35: filtros.excluir3435,
        subtitulo: subtitulo || undefined,
    };
}

// Intensidad de celda: interpola entre un azul muy tenue y el azul
// institucional (--gob-azul) según qué tan cerca esté el valor del máximo
// visible en la matriz — mismo criterio de "heatmap secuencial de un solo
// tono" usado en el resto del sistema (evita inventar una escala nueva).
function colorCelda(valor, maximo) {
    if (!maximo || valor <= 0) return { background: '#fff', color: 'var(--gob-gris5)' };
    const t = Math.min(valor / maximo, 1);
    const alpha = 0.08 + t * 0.82;
    return {
        background: `rgba(30, 58, 95, ${alpha.toFixed(2)})`,
        color: t > 0.45 ? '#fff' : 'var(--gob-gris5)',
    };
}

export default function TabMapaGasto({ filtros, refreshKey }) {
    const [subtitulo, setSubtitulo] = useState('');
    const [metrica, setMetrica] = useState('monto'); // 'monto' | 'pct'
    const [celda, setCelda] = useState(null); // { codigo_ue, nombre, mes, devengado, efectivo }

    const { data, loading, error } = useAnexo1Fetch(
        fetchMapaGastoAnexo1, paramsMapaGasto(filtros, subtitulo), refreshKey, 'No se pudo cargar el Mapa de Gasto.',
    );

    const mesDesde = filtros.mesDesde || 1;
    const mesHasta = filtros.mesHasta || 12;
    const meses = useMemo(
        () => Array.from({ length: mesHasta - mesDesde + 1 }, (_, i) => mesDesde + i),
        [mesDesde, mesHasta],
    );

    // Filas ordenadas por gasto total desc (ranking) — recalcula solo cuando
    // cambian los establecimientos o la métrica elegida, no en cada render.
    const filas = useMemo(() => {
        if (!data?.establecimientos) return [];
        return [...data.establecimientos].sort((a, b) => b.total_devengado - a.total_devengado);
    }, [data]);

    const maximoCelda = useMemo(() => {
        let max = 0;
        for (const est of filas) {
            for (const m of meses) {
                const v = est.valores[m - 1];
                const valor = metrica === 'pct' ? (est.ley_anual ? (v.devengado / est.ley_anual) * 100 : 0) : v.devengado;
                if (valor > max) max = valor;
            }
        }
        return max;
    }, [filas, meses, metrica]);

    if (loading && !data) return <div className="loading-spinner">Cargando Mapa de Gasto…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data) return null;

    const onClickCelda = (est, mes) => {
        const v = est.valores[mes - 1];
        setCelda((prev) => (prev?.codigo_ue === est.codigo_ue && prev?.mes === mes
            ? null
            : { codigo_ue: est.codigo_ue, nombre: est.nombre, mes, devengado: v.devengado, efectivo: v.efectivo }));
    };

    return (
        <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="filter-group">
                    <label className="filter-label">Concepto (Subtítulo)</label>
                    <select className="filter-input" value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} style={{ minWidth: 260 }}>
                        <option value="">Consolidado (todos los subtítulos)</option>
                        {data.conceptos_disponibles.map((c) => (
                            <option key={c.concepto} value={c.concepto}>{c.codigo} {c.nombre}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-group">
                    <label className="filter-label">Ver como</label>
                    <select className="filter-input" value={metrica} onChange={(e) => setMetrica(e.target.value)}>
                        <option value="monto">Monto ($)</option>
                        <option value="pct">% de la Ley anual del establecimiento</option>
                    </select>
                </div>
                <div style={{ fontSize: 11, color: 'var(--gob-gris4)', paddingBottom: 8 }}>
                    Cada celda es el Devengado de ese establecimiento en ese mes. Clic para ver el detalle.
                </div>
            </div>

            {celda && (
                <div className="analysis-context">
                    🔎 {celda.nombre} — {MESES_CORTO[celda.mes - 1]}: Devengado {fmtMoney(celda.devengado)} · Efectivo {fmtMoney(celda.efectivo)}
                    <button onClick={() => setCelda(null)} title="Cerrar detalle">✕</button>
                </div>
            )}

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={{
                                position: 'sticky', left: 0, background: 'var(--gob-gris1)', zIndex: 1,
                                textAlign: 'left', padding: '8px 12px', fontSize: 10.5, color: 'var(--gob-gris4)',
                                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px',
                                borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap',
                            }}>
                                Establecimiento
                            </th>
                            {meses.map((m) => (
                                <th key={m} style={{
                                    padding: '8px 6px', fontSize: 10.5, color: 'var(--gob-gris4)', fontWeight: 700,
                                    textTransform: 'uppercase', borderBottom: '1px solid var(--color-border)',
                                    textAlign: 'center', minWidth: 78,
                                }}>
                                    {MESES_CORTO[m - 1]}
                                </th>
                            ))}
                            <th style={{
                                padding: '8px 12px', fontSize: 10.5, color: 'var(--gob-gris4)', fontWeight: 700,
                                textTransform: 'uppercase', borderBottom: '1px solid var(--color-border)',
                                textAlign: 'right', whiteSpace: 'nowrap',
                            }}>
                                Total período
                            </th>
                            <th
                                data-tip="Total del período sobre la Ley de Presupuestos anual del establecimiento."
                                style={{
                                    padding: '8px 12px', fontSize: 10.5, color: 'var(--gob-gris4)', fontWeight: 700,
                                    textTransform: 'uppercase', borderBottom: '1px solid var(--color-border)',
                                    textAlign: 'right', whiteSpace: 'nowrap',
                                }}
                            >
                                % Ejecución
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map((est) => (
                            <tr key={est.codigo_ue}>
                                <td style={{
                                    position: 'sticky', left: 0, background: '#fff', zIndex: 1,
                                    padding: '6px 12px', fontSize: 12.5, color: 'var(--gob-gris5)', whiteSpace: 'nowrap',
                                    borderBottom: '1px solid var(--gob-gris2)', fontWeight: 600,
                                }}>
                                    {est.nombre}
                                </td>
                                {meses.map((m) => {
                                    const v = est.valores[m - 1];
                                    const valorMostrado = metrica === 'pct'
                                        ? (est.ley_anual ? (v.devengado / est.ley_anual) * 100 : 0)
                                        : v.devengado;
                                    const { background, color } = colorCelda(valorMostrado, maximoCelda);
                                    return (
                                        <td
                                            key={m}
                                            onClick={() => onClickCelda(est, m)}
                                            data-tip={`${est.nombre} — ${MESES_CORTO[m - 1]}: Devengado ${fmtMoney(v.devengado)} · Efectivo ${fmtMoney(v.efectivo)}`}
                                            style={{
                                                background, color, textAlign: 'center', padding: '7px 6px',
                                                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                borderBottom: '1px solid var(--gob-gris2)',
                                            }}
                                        >
                                            {metrica === 'pct' ? fmtPct(valorMostrado) : fmtM(v.devengado)}
                                        </td>
                                    );
                                })}
                                <td className="td-monto" style={{ textAlign: 'right', padding: '7px 12px', fontWeight: 700, borderBottom: '1px solid var(--gob-gris2)' }}>
                                    {fmtMoney(est.total_devengado)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '7px 12px', fontWeight: 700, borderBottom: '1px solid var(--gob-gris2)', color: 'var(--gob-azul)' }}>
                                    {fmtPct(est.pct_ejecucion)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td style={{
                                position: 'sticky', left: 0, background: 'var(--gob-gris1)',
                                padding: '7px 12px', fontSize: 12, fontWeight: 700, color: 'var(--gob-gris5)',
                            }}>
                                Total SSO
                            </td>
                            {meses.map((m) => (
                                <td key={m} style={{ padding: '7px 6px', textAlign: 'center', fontSize: 11, fontWeight: 700, background: 'var(--gob-gris1)', color: 'var(--gob-gris5)' }}>
                                    {fmtM(data.totales_por_mes[m - 1].devengado)}
                                </td>
                            ))}
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, background: 'var(--gob-gris1)' }}>
                                {fmtMoney(data.total_general.devengado)}
                            </td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, background: 'var(--gob-gris1)', color: 'var(--gob-azul)' }}>
                                {fmtPct(data.total_general.pct_ejecucion)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
