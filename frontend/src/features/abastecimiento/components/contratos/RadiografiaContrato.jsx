import React, { useState } from 'react';

const fmt = (n) =>
    n == null ? '—' :
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
const fmtB = (n) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return fmt(n);
};

const ALERTA_CFG = {
    critico:  { label: '🔴 Crítico',  color: '#dc2626' },
    urgente:  { label: '🟠 Urgente',  color: '#ea580c' },
    atencion: { label: '🟡 Atención', color: '#b45309' },
    ok:       { label: '🟢 OK',       color: '#15803d' },
    sin_datos:{ label: '— Sin datos', color: '#9ca3af' },
};

export function calcularRadiografia(r) {
    const mc = r.monto_contrato || 0;
    const me = r.monto_ejecutado || 0;
    const diasVigencia      = r.dias_vigencia   || 0;
    const diasRestantes     = r.dias_restantes  || 0;
    const diasTranscurridos = Math.max(0, diasVigencia - diasRestantes);

    const pctFinanciero       = mc > 0 ? (me / mc) * 100 : 0;
    const pctTiempo           = diasVigencia > 0 ? (diasTranscurridos / diasVigencia) * 100 : null;
    const ritmoDiarioReal     = diasTranscurridos > 0 ? me / diasTranscurridos : null;
    const ritmoDiarioEsperado = diasVigencia > 0 ? mc / diasVigencia : null;
    const proyeccionCierre    = ritmoDiarioReal != null && diasVigencia > 0 ? ritmoDiarioReal * diasVigencia : null;
    const pctProyeccion       = proyeccionCierre != null && mc > 0 ? (proyeccionCierre / mc) * 100 : null;
    const delta               = pctTiempo !== null ? pctFinanciero - pctTiempo : null;
    const velocidad           = (ritmoDiarioReal != null && ritmoDiarioEsperado != null && ritmoDiarioEsperado > 0)
        ? (ritmoDiarioReal / ritmoDiarioEsperado) * 100 : null;

    let diagnostico, colorDiag, iconoDiag;
    if (me === 0) {
        diagnostico = 'Sin ejecución registrada'; colorDiag = '#94a3b8'; iconoDiag = '⬜';
    } else if (delta === null) {
        diagnostico = 'Sin datos temporales';     colorDiag = '#94a3b8'; iconoDiag = '⬜';
    } else if (delta > 20) {
        diagnostico = 'Gasto acelerado — riesgo de sobreejecutar'; colorDiag = '#dc2626'; iconoDiag = '🔴';
    } else if (delta > 10) {
        diagnostico = 'Por encima del ritmo esperado';              colorDiag = '#ea580c'; iconoDiag = '🟠';
    } else if (delta >= -10) {
        diagnostico = 'En línea con el tiempo transcurrido';        colorDiag = '#16a34a'; iconoDiag = '🟢';
    } else if (delta >= -20) {
        diagnostico = 'Subejecutado para el avance temporal';       colorDiag = '#b45309'; iconoDiag = '🟡';
    } else {
        diagnostico = 'Muy por debajo — revisar ejecución';         colorDiag = '#7c3aed'; iconoDiag = '🔵';
    }

    let proyeccionTexto, proyeccionColor, proyeccionIcono;
    if (pctProyeccion === null) {
        proyeccionTexto = 'Sin proyección disponible'; proyeccionColor = '#94a3b8'; proyeccionIcono = '—';
    } else if (pctProyeccion > 110) {
        proyeccionTexto = `Sobreejecutará ~${pctProyeccion.toFixed(0)}%`;      proyeccionColor = '#dc2626'; proyeccionIcono = '⚠️';
    } else if (pctProyeccion > 95) {
        proyeccionTexto = `Cierre equilibrado ~${pctProyeccion.toFixed(0)}%`;  proyeccionColor = '#16a34a'; proyeccionIcono = '✅';
    } else if (pctProyeccion > 70) {
        proyeccionTexto = `Subejecución moderada ~${pctProyeccion.toFixed(0)}%`; proyeccionColor = '#b45309'; proyeccionIcono = '⚠️';
    } else {
        proyeccionTexto = `Subejecución grave ~${pctProyeccion.toFixed(0)}%`;  proyeccionColor = '#7c3aed'; proyeccionIcono = '⚠️';
    }

    return {
        diasTranscurridos, pctFinanciero, pctTiempo,
        ritmoDiarioReal, ritmoDiarioEsperado, velocidad,
        pctProyeccion, delta,
        diagnostico, colorDiag, iconoDiag,
        proyeccionTexto, proyeccionColor, proyeccionIcono,
    };
}

function InfoTooltip({ text }) {
    const [show, setShow] = useState(false);
    return (
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
              onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
            <span style={{ cursor: 'help', color: '#94a3b8', fontSize: 12, marginLeft: 4 }}>ⓘ</span>
            {show && (
                <span style={{
                    position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
                    background: '#1e293b', color: '#f8fafc', fontSize: 11, padding: '7px 11px',
                    borderRadius: 7, whiteSpace: 'pre-wrap', minWidth: 200, maxWidth: 300,
                    width: 'max-content', textAlign: 'left', zIndex: 300, lineHeight: 1.7,
                    boxShadow: '0 6px 20px rgba(0,0,0,.28)', pointerEvents: 'none',
                }}>
                    {text}
                </span>
            )}
        </span>
    );
}

export function RadiografiaContrato({ r, compact = false }) {
    const {
        diasTranscurridos, pctFinanciero, pctTiempo,
        ritmoDiarioReal, ritmoDiarioEsperado, velocidad,
        pctProyeccion, delta,
        diagnostico, colorDiag, iconoDiag,
        proyeccionTexto, proyeccionColor, proyeccionIcono,
    } = calcularRadiografia(r);

    const colorBarraFinan = pctFinanciero >= 90 ? '#dc2626' : pctFinanciero >= 75 ? '#f59e0b' : '#7c3aed';
    const barraProyWidth  = pctProyeccion != null ? Math.min(pctProyeccion, 100) : 0;
    const textoProyDentro = barraProyWidth >= 25;

    return (
        <div style={{
            background: 'linear-gradient(135deg,#f5f3ff 0%,#faf5ff 100%)',
            border: '1px solid #ddd6fe', borderRadius: 10,
            padding: '14px 16px', marginBottom: 14,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#4c1d95' }}>📊 Radiografía de Salud</span>
                <span style={{
                    background: colorDiag + '18', color: colorDiag,
                    border: `1px solid ${colorDiag}40`,
                    borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                }}>
                    {iconoDiag} {diagnostico}
                </span>
                {delta !== null && (
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        Δ {delta > 0 ? '+' : ''}{delta.toFixed(1)}% vs tiempo
                    </span>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3,1fr)', gap: 12 }}>

                {/* Zona 1 */}
                <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', border: '1px solid #ede9fe' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6d28d9', marginBottom: 10 }}>Comparación temporal</div>
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 3 }}>
                            <span>⏱ Tiempo transcurrido</span>
                            <span style={{ fontWeight: 600 }}>{pctTiempo !== null ? `${pctTiempo.toFixed(1)}%` : 'N/D'}</span>
                        </div>
                        <div style={{ background: '#ddd6fe', borderRadius: 4, height: 10 }}>
                            {pctTiempo !== null && <div style={{ width: `${Math.min(pctTiempo, 100)}%`, height: '100%', borderRadius: 4, background: 'linear-gradient(90deg,#6d28d9,#a78bfa)', transition: 'width .4s' }} />}
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                            {pctTiempo !== null ? `${diasTranscurridos} días de ${r.dias_vigencia}` : 'Datos de fecha no disponibles'}
                        </div>
                    </div>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 3 }}>
                            <span>💰 Gasto ejecutado</span>
                            <span style={{ fontWeight: 600, color: colorBarraFinan }}>{pctFinanciero.toFixed(1)}%</span>
                        </div>
                        <div style={{ background: '#e9d5ff', borderRadius: 4, height: 10 }}>
                            <div style={{ width: `${Math.min(pctFinanciero, 100)}%`, height: '100%', borderRadius: 4, background: `linear-gradient(90deg,${colorBarraFinan},${colorBarraFinan}bb)`, transition: 'width .4s' }} />
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{fmt(r.monto_ejecutado)} de {fmt(r.monto_contrato)}</div>
                    </div>
                    {delta !== null && r.monto_ejecutado > 0 && (
                        <div style={{ padding: '5px 8px', background: colorDiag + '12', borderRadius: 6, border: `1px solid ${colorDiag}28`, marginTop: 8 }}>
                            <span style={{ fontSize: 11, color: colorDiag, fontWeight: 600 }}>
                                {delta > 0 ? '▲' : delta < 0 ? '▼' : '●'} {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                                <span style={{ fontWeight: 400, marginLeft: 4 }}>{delta > 0 ? 'adelantado' : delta < 0 ? 'atrasado' : 'exacto'} vs tiempo</span>
                            </span>
                        </div>
                    )}
                </div>

                {/* Zona 2 */}
                <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', border: '1px solid #ede9fe' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6d28d9', marginBottom: 10 }}>Ritmo de gasto</div>
                    {ritmoDiarioReal != null ? (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                <div style={{ background: '#faf5ff', borderRadius: 6, padding: '7px 9px' }}>
                                    <div style={{ fontSize: 10, color: '#94a3b8' }}>Real (diario)</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{fmtB(ritmoDiarioReal)}</div>
                                </div>
                                <div style={{ background: '#f8fafc', borderRadius: 6, padding: '7px 9px' }}>
                                    <div style={{ fontSize: 10, color: '#94a3b8' }}>Esperado</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>{fmtB(ritmoDiarioEsperado)}</div>
                                </div>
                            </div>
                            {velocidad != null && (
                                <div style={{ padding: '6px 9px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 8 }}>
                                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Velocidad relativa</div>
                                    <div style={{ background: '#e2e8f0', borderRadius: 4, height: 8, marginBottom: 3 }}>
                                        <div style={{ width: `${Math.min(velocidad, 150) / 150 * 100}%`, height: '100%', borderRadius: 4, background: velocidad > 110 ? '#dc2626' : velocidad < 80 ? '#b45309' : '#16a34a', transition: 'width .4s' }} />
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: velocidad > 110 ? '#dc2626' : velocidad < 80 ? '#b45309' : '#16a34a' }}>
                                        {velocidad.toFixed(0)}% del ritmo esperado
                                    </span>
                                </div>
                            )}
                            {r.meses_hasta_agotamiento != null && (
                                <div style={{ padding: '5px 9px', background: (ALERTA_CFG[r.alerta]?.color || '#94a3b8') + '12', borderRadius: 6 }}>
                                    <div style={{ fontSize: 10, color: '#64748b' }}>Agotamiento presupuesto</div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: ALERTA_CFG[r.alerta]?.color || '#94a3b8' }}>
                                        {ALERTA_CFG[r.alerta]?.label} — en {r.meses_hasta_agotamiento}m
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.5 }}>
                            {diasTranscurridos === 0
                                ? '⏳ Contrato reciente — ritmo disponible pronto'
                                : '— Sin datos de ritmo'}
                        </div>
                    )}
                </div>

                {/* Zona 3 */}
                <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', border: '1px solid #ede9fe' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6d28d9', marginBottom: 10 }}>Proyección de cierre</div>
                    {pctProyeccion !== null ? (
                        <>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Al ritmo actual, al cierre se habrá ejecutado:</div>
                            <div style={{ background: '#e9d5ff', borderRadius: 6, height: 20, position: 'relative', marginBottom: 4 }}>
                                <div style={{ width: `${barraProyWidth}%`, height: '100%', borderRadius: 6, background: `linear-gradient(90deg,${proyeccionColor},${proyeccionColor}bb)`, transition: 'width .4s' }} />
                                {textoProyDentro
                                    ? <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontSize: 10, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,.4)', whiteSpace: 'nowrap' }}>{pctProyeccion.toFixed(0)}% del contrato</span>
                                    : <span style={{ position: 'absolute', left: `calc(${barraProyWidth}% + 6px)`, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{pctProyeccion.toFixed(0)}%</span>
                                }
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                                <span style={{ fontSize: 11 }}>{proyeccionIcono}</span>
                                <span style={{ fontSize: 11, color: proyeccionColor, fontWeight: 600 }}>{proyeccionTexto}</span>
                            </div>
                            {r.monto_por_ejecutar != null && (
                                <div style={{ padding: '5px 9px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: 10, color: '#64748b' }}>Sin ejecutar hoy</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>{fmt(r.monto_por_ejecutar)}</div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.5 }}>
                            {r.monto_por_ejecutar == null
                                ? '— Monto por ejecutar no disponible'
                                : '— Sin días ejecutados para proyectar'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
