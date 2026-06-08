import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Bar } from 'react-chartjs-2';
import { getContratosPlazos, getContratosOCDetalle } from '../../api/contratosApi';
import { exportarPlazos } from './exportUtils';
import { RadiografiaContrato } from './RadiografiaContrato';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt  = (n) => n == null ? '—' : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
const fmtB = (n) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return fmt(n);
};

// ── Configuración alertas ─────────────────────────────────────────────────────
const ALERTA_CFG = {
    critico:  { label: '🔴 Crítico',  bg: '#fef2f2', color: '#dc2626', desc: '≤ 90 días',    gantt: '#ef4444' },
    urgente:  { label: '🟠 Urgente',  bg: '#fff7ed', color: '#ea580c', desc: '91–180 días',  gantt: '#f97316' },
    atencion: { label: '🟡 Atención', bg: '#fffbeb', color: '#b45309', desc: '181–365 días', gantt: '#eab308' },
    ok:       { label: '🟢 OK',       bg: '#f0fdf4', color: '#15803d', desc: '> 365 días',   gantt: '#22c55e' },
};

const MES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ── Fecha derivada a partir de dias_restantes + hoy ──────────────────────────
function derivarFechas(r) {
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    const fin     = new Date(today);
    fin.setDate(today.getDate() + (r.dias_restantes || 0));
    const inicio  = new Date(fin);
    inicio.setDate(fin.getDate() - (r.dias_vigencia || 0));
    return { inicio, fin, today };
}

// ── Clasificación de patrón de uso ───────────────────────────────────────────
function clasificarPatron(ocList) {
    const validas = ocList.filter(oc => oc.FechaEnvio);
    if (validas.length < 3) return { tipo: 'insuficiente', label: '⚪ Insuficiente', color: '#94a3b8', confianza: 0, avgDias: null };

    const fechas = validas.map(oc => new Date(oc.FechaEnvio)).sort((a, b) => a - b);
    const intervalos = [];
    for (let i = 1; i < fechas.length; i++) {
        intervalos.push((fechas[i] - fechas[i - 1]) / 86400000);
    }
    const avg = intervalos.reduce((s, v) => s + v, 0) / intervalos.length;
    const std = Math.sqrt(intervalos.map(v => (v - avg) ** 2).reduce((s, v) => s + v, 0) / intervalos.length);
    const cv  = avg > 0 ? std / avg : 1;

    let tipo, label, color;
    if      (avg <= 35  && cv < 0.35) { tipo = 'mensual';     label = '🔁 Mensual Regular';  color = '#7c3aed'; }
    else if (avg <= 35)               { tipo = 'mensual_irr'; label = '🔁 Mensual Irregular'; color = '#a78bfa'; }
    else if (avg <= 70  && cv < 0.35) { tipo = 'bimestral';   label = '📅 Bimestral';         color = '#0ea5e9'; }
    else if (avg <= 100 && cv < 0.35) { tipo = 'trimestral';  label = '📅 Trimestral';        color = '#16a34a'; }
    else                              { tipo = 'demanda';     label = '⚡ A Demanda';          color = '#f59e0b'; }

    const confianza = Math.max(20, Math.round((1 - Math.min(cv, 1)) * 100));
    return { tipo, label, color, confianza, avgDias: Math.round(avg), std: Math.round(std) };
}

// ── InfoTooltip ───────────────────────────────────────────────────────────────
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

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, tooltip }) {
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '14px 18px',
            border: '1px solid #e2e8f0', flex: '1 1 140px', minWidth: 130,
            borderTop: `4px solid ${color}`, boxShadow: '0 1px 2px rgba(15,23,42,.04)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                {label}{tooltip && <InfoTooltip text={tooltip} />}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-TAB 1: RESUMEN VISUAL
// ══════════════════════════════════════════════════════════════════════════════
function TabResumenVisual({ activos, kpis }) {
    const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

    const kpisExtra = useMemo(() => {
        const en30d  = activos.filter(r => r.dias_restantes >= 0 && r.dias_restantes <= 30).length;
        const en90d  = activos.filter(r => r.dias_restantes >= 0 && r.dias_restantes <= 90).length;
        const montoCritico = activos.filter(r => r.alerta_tiempo === 'critico').reduce((s, r) => s + (r.monto_contrato || 0), 0);
        const pctTiempoAvg = activos.length > 0
            ? activos.reduce((s, r) => s + (r.pct_ejecutado_tiempo || 0), 0) / activos.length : 0;
        const unidadMap = {};
        activos.filter(r => r.alerta_tiempo === 'critico').forEach(r => {
            unidadMap[r.unidad_requirente] = (unidadMap[r.unidad_requirente] || 0) + 1;
        });
        const unidadCritica = Object.entries(unidadMap).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';
        return { en30d, en90d, montoCritico, pctTiempoAvg, unidadCritica };
    }, [activos]);

    // Burbujas de urgencia por mes/año de vencimiento
    const burbujas = useMemo(() => {
        const mapa = {};
        activos.forEach(r => {
            const { fin } = derivarFechas(r);
            if (!fin) return;
            const key = `${fin.getFullYear()}-${fin.getMonth()}`;
            if (!mapa[key]) mapa[key] = { anio: fin.getFullYear(), mes: fin.getMonth(), count: 0, monto: 0, alerta: 'ok', contratos: [] };
            mapa[key].count += 1;
            mapa[key].monto += r.monto_contrato || 0;
            const orden = ['critico','urgente','atencion','ok'];
            if (orden.indexOf(r.alerta_tiempo) < orden.indexOf(mapa[key].alerta)) mapa[key].alerta = r.alerta_tiempo;
            mapa[key].contratos.push(r.nombre_contrato);
        });
        return Object.values(mapa).sort((a,b) => a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes);
    }, [activos]);

    // Línea de tiempo: 24 meses desde hoy
    const meses = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 24; i++) {
            const d = new Date(today);
            d.setMonth(today.getMonth() + i);
            arr.push({ anio: d.getFullYear(), mes: d.getMonth(), label: `${MES_LABEL[d.getMonth()]} ${d.getFullYear()}` });
        }
        return arr;
    }, [today]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* KPIs */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <KpiCard label="Total activos"     value={fmtN(kpis.total_activos)} color="#6b7280"
                    sub="contratos en ejecución"
                    tooltip="Contratos en estado: En ejecución, Modificado o Ampliado." />
                <KpiCard label="⚠️ Vencen en 30d"  value={fmtN(kpisExtra.en30d)}    color="#dc2626"
                    sub={`de ${fmtN(kpis.critico)} críticos`}
                    tooltip={`Contratos que terminan antes del ${new Date(today.getTime() + 30*86400000).toLocaleDateString('es-CL')}.\nSubconjunto de la categoría Crítico (≤90d).`} />
                <KpiCard label="🔴 Críticos ≤90d"  value={fmtN(kpis.critico)}        color="#dc2626"
                    sub="requieren acción inmediata"
                    tooltip="dias_restantes ≤ 90. Incluye contratos ya vencidos (dias_restantes ≤ 0)." />
                <KpiCard label="🟠 Urgentes"        value={fmtN(kpis.urgente)}        color="#ea580c"
                    sub="91–180 días"
                    tooltip="Contratos con 91 a 180 días hasta el término. Planificar renovación o licitación." />
                <KpiCard label="💰 Monto en riesgo" value={fmtB(kpisExtra.montoCritico)} color="#dc2626"
                    sub="suma contratos críticos"
                    tooltip="Suma de monto_contrato de todos los contratos en alerta Crítica.\nRepresenta exposición financiera por vencimiento." />
                <KpiCard label="⏱ Tiempo promedio" value={`${kpisExtra.pctTiempoAvg.toFixed(0)}%`} color="#7c3aed"
                    sub="del período transcurrido"
                    tooltip="Promedio de (días transcurridos / días vigencia × 100) de todos los contratos activos.\nNo relacionado con ejecución financiera." />
            </div>

            {/* Barra distribución de alertas */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                    Distribución de alertas de vigencia
                    <InfoTooltip text={'Proporción de contratos por nivel de alerta.\nCrítico: ≤90d · Urgente: 91-180d · Atención: 181-365d · OK: >365d'} />
                </div>
                <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', gap: 2 }}>
                    {Object.entries(ALERTA_CFG).map(([key, cfg]) => {
                        const n = kpis[key] || 0;
                        const pct = kpis.total_activos > 0 ? (n / kpis.total_activos) * 100 : 0;
                        return pct > 0 ? (
                            <div key={key} title={`${cfg.label}: ${n} (${pct.toFixed(1)}%)`}
                                style={{ width: `${pct}%`, background: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 600, transition: 'width .4s' }}>
                                {pct > 7 ? `${pct.toFixed(0)}%` : ''}
                            </div>
                        ) : null;
                    })}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                    {Object.entries(ALERTA_CFG).map(([key, cfg]) => (
                        <span key={key} style={{ fontSize: 12, color: cfg.color, fontWeight: 600 }}>
                            {cfg.label} {fmtN(kpis[key] || 0)} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({cfg.desc})</span>
                        </span>
                    ))}
                </div>
            </div>

            {/* Scatter de urgencia — contratos por mes de vencimiento */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Contratos por mes de vencimiento
                    <InfoTooltip text={'Cada círculo representa contratos que vencen ese mes.\nTamaño relativo = cantidad de contratos.\nColor = nivel de alerta más crítico del grupo.'} />
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>Próximos 24 meses — fecha derivada de días restantes</div>

                {/* Eje de meses */}
                <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
                    <div style={{ minWidth: 900, position: 'relative' }}>
                        {/* Línea base */}
                        <div style={{ height: 2, background: '#e2e8f0', margin: '60px 0 0', position: 'relative' }}>
                            {/* Marca TODAY */}
                            <div style={{ position: 'absolute', left: 0, top: -50, width: 2, height: 70, background: '#dc2626', zIndex: 5 }}>
                                <span style={{ position: 'absolute', top: -18, left: -16, fontSize: 10, color: '#dc2626', fontWeight: 700, whiteSpace: 'nowrap' }}>HOY</span>
                            </div>
                        </div>

                        {/* Burbujas */}
                        <div style={{ display: 'flex', marginTop: 8 }}>
                            {meses.map((m, idx) => {
                                const burbuja = burbujas.find(b => b.anio === m.anio && b.mes === m.mes);
                                const cfg = burbuja ? ALERTA_CFG[burbuja.alerta] : null;
                                const size = burbuja ? Math.min(16 + burbuja.count * 6, 56) : 0;
                                return (
                                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 60 }}>
                                        {burbuja ? (
                                            <div title={`${burbuja.count} contratos\n${burbuja.contratos.slice(0,3).join('\n')}${burbuja.contratos.length > 3 ? `\n+${burbuja.contratos.length-3} más` : ''}`}
                                                style={{
                                                    width: size, height: size,
                                                    borderRadius: '50%',
                                                    background: cfg.color,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: size >= 28 ? 11 : 9,
                                                    fontWeight: 700, color: '#fff',
                                                    boxShadow: `0 2px 8px ${cfg.color}50`,
                                                    cursor: 'default', userSelect: 'none',
                                                    transition: 'all .3s',
                                                }}>
                                                {burbuja.count}
                                            </div>
                                        ) : (
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#e2e8f0', marginTop: 18 }} />
                                        )}
                                        <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', lineHeight: 1.3 }}>
                                            {MES_LABEL[m.mes]}<br /><span style={{ color: '#cbd5e1' }}>{m.anio}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Leyenda monto */}
                        {burbujas.filter(b => b.monto > 0).length > 0 && (
                            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', fontSize: 11, color: '#64748b' }}>
                                {burbujas.filter(b => b.count > 0).slice(0, 6).map((b, i) => (
                                    <span key={i} style={{ color: ALERTA_CFG[b.alerta]?.color }}>
                                        {MES_LABEL[b.mes]} {b.anio}: {b.count} contratos · {fmtB(b.monto)}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Unidad más crítica */}
            {kpisExtra.unidadCritica !== '—' && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>🏢</span>
                    <div>
                        <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>Unidad con más contratos críticos</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{kpisExtra.unidadCritica}</div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-TAB 2: CARTA GANTT
// ══════════════════════════════════════════════════════════════════════════════
function TabGantt({ activos }) {
    const [panelContrato, setPanelContrato] = useState(null);
    const [detalleOC, setDetalleOC]         = useState(null);
    const [loadingOC, setLoadingOC]         = useState(false);
    const [busqueda, setBusqueda]           = useState('');
    const [filtroAlerta, setFiltroAlerta]   = useState('');
    const ganttRef = useRef(null);

    // Ventana temporal: 6 meses atrás → 24 meses adelante
    const { ganttStart, ganttEnd, totalDias } = useMemo(() => {
        const today = new Date(); today.setHours(0,0,0,0);
        const start = new Date(today); start.setMonth(today.getMonth() - 6); start.setDate(1);
        const end   = new Date(today); end.setMonth(today.getMonth() + 24); end.setDate(1);
        const totalDias = Math.round((end - start) / 86400000);
        return { ganttStart: start, ganttEnd: end, totalDias };
    }, []);

    const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
    const todayPct = ((today - ganttStart) / 86400000 / totalDias * 100).toFixed(2);

    // Meses para el header del Gantt
    const mesesGantt = useMemo(() => {
        const arr = [];
        const cur = new Date(ganttStart);
        while (cur < ganttEnd) {
            arr.push({ anio: cur.getFullYear(), mes: cur.getMonth(), pct: ((cur - ganttStart) / 86400000 / totalDias * 100) });
            cur.setMonth(cur.getMonth() + 1);
        }
        return arr;
    }, [ganttStart, ganttEnd, totalDias]);

    const filtrados = useMemo(() => {
        return activos.filter(r => {
            if (filtroAlerta && r.alerta_tiempo !== filtroAlerta) return false;
            if (!busqueda) return true;
            const q = busqueda.toLowerCase();
            return r.nombre_contrato.toLowerCase().includes(q) || r.numero_contrato.toLowerCase().includes(q);
        });
    }, [activos, filtroAlerta, busqueda]);

    const abrirPanel = async (r) => {
        setPanelContrato(r);
        setDetalleOC(null);
        if (r.id_licitacion_oc) {
            setLoadingOC(true);
            try {
                const res = await getContratosOCDetalle(r.id_licitacion_oc);
                setDetalleOC(res.data);
            } catch { setDetalleOC(null); }
            finally { setLoadingOC(false); }
        }
    };

    return (
        <div style={{ display: 'flex', gap: 0, position: 'relative' }}>
            {/* ── Gantt principal ── */}
            <div style={{ flex: 1, minWidth: 0 }}>
                {/* Controles */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar contrato..."
                        style={{ flex: 1, minWidth: 180, padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                        {['', 'critico', 'urgente', 'atencion', 'ok'].map(k => (
                            <button key={k} onClick={() => setFiltroAlerta(k)}
                                style={{
                                    padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                                    fontWeight: filtroAlerta === k ? 700 : 400,
                                    border: filtroAlerta === k ? `2px solid ${ALERTA_CFG[k]?.color || '#6b7280'}` : '1px solid #e2e8f0',
                                    background: filtroAlerta === k ? (ALERTA_CFG[k]?.bg || '#f8fafc') : '#fff',
                                    color: filtroAlerta === k ? (ALERTA_CFG[k]?.color || '#374151') : '#64748b',
                                }}>
                                {k === '' ? 'Todos' : ALERTA_CFG[k].label}
                            </button>
                        ))}
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtN(filtrados.length)} contratos</span>
                </div>

                <div ref={ganttRef} style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}>
                    <div style={{ minWidth: 900 }}>
                        {/* Header meses */}
                        <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', position: 'sticky', top: 0, zIndex: 10 }}>
                            <div style={{ width: 220, minWidth: 220, padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#475569', borderRight: '1px solid #e2e8f0' }}>
                                Contrato
                            </div>
                            <div style={{ flex: 1, position: 'relative', height: 36 }}>
                                {mesesGantt.map((m, i) => (
                                    <div key={i} style={{
                                        position: 'absolute', left: `${m.pct}%`,
                                        fontSize: 10, color: m.mes === 0 ? '#1e293b' : '#64748b',
                                        fontWeight: m.mes === 0 ? 700 : 400,
                                        top: '50%', transform: 'translateY(-50%)',
                                        whiteSpace: 'nowrap', paddingLeft: 4,
                                        borderLeft: m.mes === 0 ? '2px solid #cbd5e1' : '1px solid #f1f5f9',
                                        paddingTop: 10,
                                    }}>
                                        {m.mes === 0 ? `${MES_LABEL[m.mes]} ${m.anio}` : MES_LABEL[m.mes]}
                                    </div>
                                ))}
                                {/* Línea TODAY en el header */}
                                <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: 2, background: '#dc2626', zIndex: 4 }} />
                            </div>
                        </div>

                        {/* Filas de contratos */}
                        {filtrados.length === 0 && (
                            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Sin contratos para mostrar</div>
                        )}
                        {filtrados.map((r, i) => {
                            const { inicio, fin } = derivarFechas(r);
                            const inicioMs = inicio.getTime();
                            const finMs    = fin.getTime();
                            const startMs  = ganttStart.getTime();
                            const endMs    = ganttEnd.getTime();

                            const barLeft  = Math.max(0, (inicioMs - startMs) / (endMs - startMs) * 100);
                            const barRight = Math.min(100, (finMs - startMs) / (endMs - startMs) * 100);
                            const barW     = Math.max(0.3, barRight - barLeft);

                            const cfg = ALERTA_CFG[r.alerta_tiempo] || ALERTA_CFG.ok;
                            const esPanelAbierto = panelContrato?.numero_contrato === r.numero_contrato;

                            return (
                                <div key={r.numero_contrato}
                                    onClick={() => abrirPanel(r)}
                                    style={{
                                        display: 'flex', alignItems: 'center',
                                        borderBottom: '1px solid #f1f5f9',
                                        background: esPanelAbierto ? '#faf5ff' : i % 2 === 0 ? '#fff' : '#fafafa',
                                        cursor: 'pointer', transition: 'background .15s',
                                    }}>
                                    {/* Nombre contrato */}
                                    <div style={{ width: 220, minWidth: 220, padding: '7px 12px', borderRight: '1px solid #f1f5f9' }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.nombre_contrato}>
                                            {r.nombre_contrato}
                                        </div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{r.numero_contrato}</div>
                                        <span style={{ background: cfg.bg, color: cfg.color, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3 }}>
                                            {cfg.label} · {r.dias_restantes > 0 ? `${r.dias_restantes}d` : 'Vencido'}
                                        </span>
                                    </div>

                                    {/* Barra Gantt */}
                                    <div style={{ flex: 1, height: 48, position: 'relative' }}>
                                        {/* Fondo semana (guías verticales) */}
                                        {mesesGantt.map((m, idx) => (
                                            <div key={idx} style={{
                                                position: 'absolute', left: `${m.pct}%`, top: 0, bottom: 0,
                                                width: 1, background: m.mes === 0 ? '#cbd5e1' : '#f1f5f9',
                                            }} />
                                        ))}

                                        {/* Línea TODAY */}
                                        <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: 2, background: '#fca5a5', zIndex: 3 }} />

                                        {/* Barra principal */}
                                        <div style={{
                                            position: 'absolute',
                                            left: `${barLeft}%`,
                                            width: `${barW}%`,
                                            top: '50%', transform: 'translateY(-50%)',
                                            height: 22, borderRadius: 11,
                                            background: `linear-gradient(90deg,${cfg.gantt},${cfg.gantt}cc)`,
                                            boxShadow: esPanelAbierto ? `0 0 0 2px #7c3aed, 0 2px 8px ${cfg.gantt}50` : `0 1px 4px ${cfg.gantt}30`,
                                            zIndex: 2,
                                            display: 'flex', alignItems: 'center', paddingLeft: 8, overflow: 'hidden',
                                        }}>
                                            {barW > 8 && (
                                                <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,.3)' }}>
                                                    {r.pct_ejecutado_tiempo > 0 ? `${r.pct_ejecutado_tiempo}%` : ''}
                                                </span>
                                            )}
                                        </div>

                                        {/* Barra de progreso de tiempo ENCIMA de la barra principal */}
                                        {r.pct_ejecutado_tiempo > 0 && barW > 2 && (
                                            <div style={{
                                                position: 'absolute',
                                                left: `${barLeft}%`,
                                                width: `${barW * Math.min(r.pct_ejecutado_tiempo, 100) / 100}%`,
                                                top: '50%', transform: 'translateY(-50%)',
                                                height: 22, borderRadius: 11,
                                                background: 'rgba(0,0,0,0.15)',
                                                zIndex: 3, pointerEvents: 'none',
                                            }} />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Leyenda */}
                <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', fontSize: 11, color: '#64748b' }}>
                    <span>Click en cualquier fila para ver detalle →</span>
                    {Object.entries(ALERTA_CFG).map(([k, c]) => (
                        <span key={k} style={{ color: c.color, fontWeight: 600 }}>■ {c.label}</span>
                    ))}
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>│ Línea roja = hoy</span>
                </div>
            </div>

            {/* ── Panel lateral deslizante ── */}
            {panelContrato && (
                <div style={{
                    width: 420, minWidth: 420, marginLeft: 16,
                    background: '#fff', border: '1px solid #ddd6fe',
                    borderRadius: 12, padding: '16px',
                    boxShadow: '0 8px 32px rgba(124,58,237,0.12)',
                    maxHeight: '85vh', overflowY: 'auto',
                    position: 'sticky', top: 0, alignSelf: 'flex-start',
                }}>
                    {/* Header panel */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', lineHeight: 1.3, marginBottom: 4 }}>
                                {panelContrato.nombre_contrato}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{panelContrato.numero_contrato}</div>
                            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{
                                    background: ALERTA_CFG[panelContrato.alerta_tiempo]?.bg,
                                    color: ALERTA_CFG[panelContrato.alerta_tiempo]?.color,
                                    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                }}>
                                    {ALERTA_CFG[panelContrato.alerta_tiempo]?.label}
                                </span>
                                <span style={{ background: '#f3f4f6', color: '#374151', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>
                                    {panelContrato.estado_contrato}
                                </span>
                            </div>
                        </div>
                        <button onClick={() => setPanelContrato(null)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18, padding: 4 }}>✕</button>
                    </div>

                    {/* KPIs mini */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                        {[
                            { label: 'Días restantes', valor: panelContrato.dias_restantes > 0 ? `${fmtN(panelContrato.dias_restantes)}d` : 'Vencido', color: ALERTA_CFG[panelContrato.alerta_tiempo]?.color },
                            { label: 'Días vigencia',  valor: `${fmtN(panelContrato.dias_vigencia)}d total`,    color: '#7c3aed' },
                            { label: 'Monto contrato', valor: fmtB(panelContrato.monto_contrato),                color: '#0ea5e9' },
                            { label: '% tiempo',       valor: `${panelContrato.pct_ejecutado_tiempo}%`,         color: '#16a34a' },
                        ].map(k => (
                            <div key={k.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${k.color}` }}>
                                <div style={{ fontSize: 10, color: '#94a3b8' }}>{k.label}</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{k.valor}</div>
                            </div>
                        ))}
                    </div>

                    {/* Radiografía reutilizada */}
                    <RadiografiaContrato r={panelContrato} />

                    {/* Proyectos PAC */}
                    {panelContrato.proyectos?.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#4c1d95', marginBottom: 6 }}>Proyectos PAC asociados</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {panelContrato.proyectos.map(p => (
                                    <div key={p.ID_Proyecto} style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 6, padding: '3px 9px', fontSize: 11 }}>
                                        <span style={{ fontWeight: 600, color: '#6d28d9' }}>{p.ID_Proyecto}</span>
                                        {p.Nombre_Proyecto && <span style={{ color: '#7c3aed' }}> — {p.Nombre_Proyecto}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* OC del contrato */}
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#4c1d95', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            Órdenes de Compra
                            {loadingOC && <span style={{ fontSize: 10, color: '#94a3b8' }}>⏳ cargando...</span>}
                        </div>
                        {!panelContrato.id_licitacion_oc && <div style={{ fontSize: 11, color: '#9ca3af' }}>Sin código de licitación — no se pueden buscar OC.</div>}
                        {panelContrato.id_licitacion_oc && !loadingOC && !detalleOC && <div style={{ fontSize: 11, color: '#ef4444' }}>Error al cargar OC.</div>}
                        {detalleOC && (
                            detalleOC.oc.length === 0
                                ? <div style={{ fontSize: 11, color: '#9ca3af' }}>Sin OC encontradas.</div>
                                : <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                                    {detalleOC.oc.map((oc, j) => (
                                        <div key={oc.codigo_oc} style={{
                                            padding: '7px 10px', borderBottom: '1px solid #f1f5f9',
                                            background: j % 2 === 0 ? '#fff' : '#fafafa', fontSize: 11,
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontFamily: 'monospace', color: '#7c3aed', fontWeight: 600 }}>
                                                    {oc.LinkMP ? <a href={oc.LinkMP} target="_blank" rel="noreferrer" style={{ color: '#7c3aed' }}>{oc.codigo_oc}</a> : oc.codigo_oc}
                                                </span>
                                                <span style={{ fontWeight: 700, color: '#374151' }}>{fmtB(oc.TotalBruto)}</span>
                                            </div>
                                            <div style={{ color: '#64748b', marginTop: 2 }}>{oc.FechaEnvio} · {oc.EstadoOC}</div>
                                        </div>
                                    ))}
                                </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-TAB 3: PATRÓN DE USO
// ══════════════════════════════════════════════════════════════════════════════
function TabPatronUso({ activos }) {
    const [seleccionado, setSeleccionado] = useState('');
    const [ocData, setOcData]             = useState(null);
    const [loading, setLoading]           = useState(false);

    const contratoSelec = activos.find(r => r.numero_contrato === seleccionado);

    const cargarOC = useCallback(async (r) => {
        if (!r?.id_licitacion_oc) { setOcData({ oc: [] }); return; }
        setLoading(true);
        setOcData(null);
        try {
            const res = await getContratosOCDetalle(r.id_licitacion_oc);
            setOcData(res.data);
        } catch { setOcData({ oc: [] }); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        const r = activos.find(c => c.numero_contrato === seleccionado);
        if (r) cargarOC(r);
    }, [seleccionado, cargarOC]);

    const analisis = useMemo(() => {
        if (!ocData?.oc?.length) return null;
        const oc = ocData.oc.filter(o => o.FechaEnvio);
        if (!oc.length) return null;

        const patron = clasificarPatron(oc);

        // Histograma por día del mes (6 grupos de 5 días)
        const diasBuckets = Array(6).fill(0);
        oc.forEach(o => {
            const dia = new Date(o.FechaEnvio).getDate();
            diasBuckets[Math.min(Math.floor((dia - 1) / 5), 5)]++;
        });

        // Monto mensual (últimos 18 meses)
        const montoMensual = {};
        oc.forEach(o => {
            const f = new Date(o.FechaEnvio);
            const key = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2,'0')}`;
            montoMensual[key] = (montoMensual[key] || 0) + (o.TotalBruto || 0);
        });
        const mesesOrdenados = Object.keys(montoMensual).sort().slice(-18);

        return { patron, diasBuckets, montoMensual, mesesOrdenados, totalOC: oc.length };
    }, [ocData]);

    const chartDias = analisis ? {
        labels: ['1–5','6–10','11–15','16–20','21–25','26–31'],
        datasets: [{
            label: 'OC generadas',
            data: analisis.diasBuckets,
            backgroundColor: 'rgba(124,58,237,0.7)',
            borderColor: '#7c3aed',
            borderRadius: 6,
            borderWidth: 0,
        }],
    } : null;

    const chartMensual = analisis ? {
        labels: analisis.mesesOrdenados.map(k => k.slice(0,7)),
        datasets: [{
            label: 'Monto OC',
            data: analisis.mesesOrdenados.map(k => analisis.montoMensual[k] || 0),
            backgroundColor: analisis.mesesOrdenados.map((_, i) => i % 2 === 0 ? 'rgba(14,165,233,0.75)' : 'rgba(124,58,237,0.6)'),
            borderRadius: 5,
            borderWidth: 0,
        }],
    } : null;

    const chartOpts = (label) => ({
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${label}: ${label === 'OC' ? ctx.raw : fmtB(ctx.raw)}` } },
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
            y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 } } },
        },
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Selector de contrato */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
                    Seleccionar contrato para análisis de patrón
                    <InfoTooltip text={'Analiza la distribución temporal y el patrón de uso de las OC asociadas a este contrato.\nRequiere que el contrato tenga un código de licitación vinculado.'} />
                </div>
                <select value={seleccionado} onChange={e => setSeleccionado(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                    <option value="">— Seleccione un contrato —</option>
                    {activos.filter(r => r.id_licitacion_oc).map(r => (
                        <option key={r.numero_contrato} value={r.numero_contrato}>
                            {r.numero_contrato} — {r.nombre_contrato.slice(0, 60)}{r.nombre_contrato.length > 60 ? '…' : ''} [{ALERTA_CFG[r.alerta_tiempo]?.label || r.alerta_tiempo}]
                        </option>
                    ))}
                </select>
                {activos.filter(r => !r.id_licitacion_oc).length > 0 && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                        {activos.filter(r => !r.id_licitacion_oc).length} contratos sin código de licitación no aparecen en la lista.
                    </div>
                )}
            </div>

            {/* Estado de carga */}
            {loading && (
                <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>⏳ Cargando OC del contrato...</div>
            )}

            {/* Sin OC */}
            {!loading && ocData && ocData.oc.length === 0 && (
                <div style={{ background: '#f9fafb', border: '1px solid #e2e8f0', borderRadius: 10, padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                    Sin órdenes de compra encontradas para este contrato.<br />
                    <span style={{ fontSize: 11 }}>Puede que las OC estén registradas bajo otro código de licitación.</span>
                </div>
            )}

            {/* Análisis */}
            {!loading && analisis && contratoSelec && (
                <>
                    {/* Badge patrón */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{
                                background: analisis.patron.color + '15',
                                border: `2px solid ${analisis.patron.color}40`,
                                borderRadius: 12, padding: '10px 20px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 140,
                            }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: analisis.patron.color }}>
                                    {analisis.patron.label}
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>Patrón detectado</div>
                            </div>
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontSize: 10, color: '#94a3b8' }}>Confianza</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{analisis.patron.confianza}%</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 10, color: '#94a3b8' }}>Intervalo promedio</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{analisis.patron.avgDias != null ? `${analisis.patron.avgDias}d` : '—'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 10, color: '#94a3b8' }}>Desviación</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{analisis.patron.std != null ? `±${analisis.patron.std}d` : '—'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 10, color: '#94a3b8' }}>Total OC analizadas</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{analisis.totalOC}</div>
                                </div>
                            </div>
                        </div>

                        {/* Explicación del patrón */}
                        <div style={{ marginTop: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                            {{
                                mensual:     '🔁 Las OC se emiten aproximadamente una vez al mes con alta regularidad. Contrato de suministro continuo o servicio mensual (limpieza, vigilancia, etc.).',
                                mensual_irr: '🔁 Se emiten OC mensualmente pero con variabilidad alta. Puede reflejar aprobaciones tardías o meses sin uso.',
                                bimestral:   '📅 Las OC se emiten cada ~2 meses. Posible contrato de servicio bimestral o con stock que se repone.',
                                trimestral:  '📅 Las OC se emiten cada ~3 meses. Patrón trimestral, posiblemente por cuotas presupuestarias o ciclos de servicio.',
                                demanda:     '⚡ Sin patrón temporal regular. El contrato se usa a demanda, según necesidad operativa.',
                                insuficiente:'⚪ Menos de 3 OC disponibles. Insuficiente para determinar un patrón con certeza.',
                            }[analisis.patron.tipo] || '—'}
                        </div>
                    </div>

                    {/* Gráficos 50/50 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                                Distribución por día del mes
                                <InfoTooltip text={'Agrupa las OC según en qué día del mes fueron enviadas.\nPermite identificar si existe un día recurrente de facturación.'} />
                            </div>
                            <div style={{ height: 200 }}>
                                {chartDias && <Bar data={chartDias} options={chartOpts('OC')} />}
                            </div>
                        </div>

                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                                Monto mensual OC (últimos 18 meses)
                                <InfoTooltip text={'Suma de TotalBruto de OC enviadas en cada mes.\nUna altura uniforme indica contrato de valor fijo mensual.\nVariabilidad alta → contrato a demanda.'} />
                            </div>
                            <div style={{ height: 200 }}>
                                {chartMensual && <Bar data={chartMensual} options={chartOpts('$')} />}
                            </div>
                        </div>
                    </div>

                    {/* Timeline de OC */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
                            Timeline de órdenes de compra ({ocData.oc.length} OC)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 300, overflowY: 'auto' }}>
                            {ocData.oc.map((oc, i) => (
                                <div key={oc.codigo_oc} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '7px 10px',
                                    borderBottom: '1px solid #f1f5f9',
                                    background: i % 2 === 0 ? '#fff' : '#fafafa',
                                }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed', flexShrink: 0 }} />
                                    <div style={{ width: 95, fontSize: 11, color: '#64748b', fontFamily: 'monospace', flexShrink: 0 }}>{oc.FechaEnvio}</div>
                                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#7c3aed', fontWeight: 600, flexShrink: 0 }}>
                                        {oc.LinkMP ? <a href={oc.LinkMP} target="_blank" rel="noreferrer" style={{ color: '#7c3aed' }}>{oc.codigo_oc}</a> : oc.codigo_oc}
                                    </div>
                                    <div style={{ flex: 1, fontSize: 11, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{oc.EstadoOC}</div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', flexShrink: 0 }}>{fmtB(oc.TotalBruto)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* Placeholder inicial */}
            {!seleccionado && !loading && (
                <div style={{ background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#64748b' }}>Selecciona un contrato para analizar su patrón de uso</div>
                    <div style={{ fontSize: 12 }}>El análisis detecta si es mensual, trimestral o a demanda a partir de las fechas de envío de OC.</div>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export function TabPlazos({ filtros }) {
    const [data, setData]     = useState(null);
    const [loading, setLoading] = useState(true);
    const [subTab, setSubTab] = useState('resumen');

    const cargar = useCallback(() => {
        setLoading(true);
        getContratosPlazos(filtros)
            .then(r => setData(r.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [JSON.stringify(filtros)]);

    useEffect(() => { cargar(); }, [cargar]);

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⏳ Cargando plazos y vigencia...</div>;
    if (!data)   return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⚠️ Error al cargar datos.</div>;

    const { activos, kpis } = data;

    const SUB_TABS = [
        { id: 'resumen', label: '📊 Resumen Visual'  },
        { id: 'gantt',   label: `📅 Carta Gantt (${fmtN(activos.length)})` },
        { id: 'patron',  label: '🔍 Patrón de Uso'   },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex' }}>
                    {SUB_TABS.map(t => (
                        <button key={t.id} onClick={() => setSubTab(t.id)} style={{
                            padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: subTab === t.id ? 700 : 400,
                            color: subTab === t.id ? '#7c3aed' : '#64748b',
                            borderBottom: subTab === t.id ? '2px solid #7c3aed' : '2px solid transparent',
                            marginBottom: -2,
                        }}>
                            {t.label}
                        </button>
                    ))}
                </div>
                <button onClick={() => exportarPlazos(data)}
                    style={{ padding: '6px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, fontSize: 12, color: '#15803d', cursor: 'pointer', fontWeight: 600, marginBottom: 4 }}>
                    📥 Excel
                </button>
            </div>

            {subTab === 'resumen' && <TabResumenVisual activos={activos} kpis={kpis} />}
            {subTab === 'gantt'   && <TabGantt activos={activos} />}
            {subTab === 'patron'  && <TabPatronUso activos={activos} />}
        </div>
    );
}
