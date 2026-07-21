import { useState, useMemo, Fragment } from 'react';
import TablaFormulariosPac from '../shared/TablaFormulariosPac';

const TABLA_FORMULARIOS_ID = 'jerarquia-tabla-formularios';

function verFormularios(setFiltroOrg, filtro) {
    setFiltroOrg(filtro);
    // Deja pintar el nuevo filtro antes de scrollear, si la tabla estaba fuera de pantalla.
    requestAnimationFrame(() => {
        document.getElementById(TABLA_FORMULARIOS_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function BotonVerFormularios({ onClick, title }) {
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            title={title || 'Ver formularios de esta unidad'}
            style={{
                padding: '3px 9px', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 6,
                color: '#7c3aed', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
        >
            🔍 Ver formularios
        </button>
    );
}

const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtB = (n) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return fmt(n);
};
const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

const colorPct = (pct) => (pct == null ? '#94a3b8' : pct >= 70 ? '#15803d' : pct >= 40 ? '#b45309' : '#dc2626');

// Muestra mínima para que un % sea representativo — mismo umbral que calcular_pac_rankings
// (services.py: "if d['total'] < 3: continue") para no destacar un 100%/0% con 1 solo formulario.
const MUESTRA_MINIMA = 3;

function InfoTooltip({ text }) {
    const [show, setShow] = useState(false);
    return (
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
              onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
            <span style={{ cursor: 'help', color: '#94a3b8', fontSize: 12, marginLeft: 4 }}>ⓘ</span>
            {show && (
                <span style={{
                    position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
                    background: '#1e293b', color: '#f8fafc', fontSize: 11, padding: '8px 12px',
                    borderRadius: 7, whiteSpace: 'pre-wrap', minWidth: 210, maxWidth: 300,
                    width: 'max-content', textAlign: 'left', zIndex: 200, lineHeight: 1.7,
                    boxShadow: '0 6px 20px rgba(0,0,0,.28)', pointerEvents: 'none',
                }}>
                    {text}
                </span>
            )}
        </span>
    );
}

function tooltipRendimiento(d) {
    const partes = [
        `Total: ${fmtN(d.total)} formularios`,
        `Dentro: ${fmtN(d.dentro)}  ·  Fuera: ${fmtN(d.fuera)}`,
        `Monto Dentro: ${fmtB(d.monto_dentro)}`,
        `Monto Fuera: ${fmtB(d.monto_fuera)}`,
        `% En fecha: ${d.pct_en_fecha == null ? 'sin datos' : d.pct_en_fecha + '%'}`,
    ];
    if (d.total < MUESTRA_MINIMA) {
        partes.push(`⚠️ Muestra baja (< ${MUESTRA_MINIMA}) — el % puede no ser representativo`);
    }
    return partes.join('\n');
}

function KpiCard({ label, value, sub, color }) {
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '14px 18px',
            border: '1px solid #e2e8f0', flex: '1 1 170px', minWidth: 150,
            borderTop: `4px solid ${color}`, boxShadow: '0 1px 2px rgba(15,23,42,.04)',
        }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', lineHeight: 1.25 }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
        </div>
    );
}

function useKpisInstitucionales(subdirecciones) {
    return useMemo(() => {
        if (!subdirecciones.length) return null;

        let total = 0, dentro = 0, montoDentro = 0, montoFuera = 0;
        const deptosConMuestra = [];
        for (const sub of subdirecciones) {
            total += sub.total; dentro += sub.dentro;
            montoDentro += sub.monto_dentro; montoFuera += sub.monto_fuera;
            for (const d of sub.departamentos) {
                if (d.total >= MUESTRA_MINIMA) deptosConMuestra.push({ ...d, subdireccion: sub.nombre });
            }
        }

        const subsConMuestra = subdirecciones.filter((s) => s.total >= MUESTRA_MINIMA);
        const mejorSub = subsConMuestra.length ? [...subsConMuestra].sort((a, b) => b.pct_dentro - a.pct_dentro)[0] : null;
        const peorSub = subsConMuestra.length ? [...subsConMuestra].sort((a, b) => a.pct_dentro - b.pct_dentro)[0] : null;
        const deptoLider = deptosConMuestra.length ? [...deptosConMuestra].sort((a, b) => b.pct_dentro - a.pct_dentro)[0] : null;
        const totalDeptos = subdirecciones.reduce((acc, s) => acc + s.departamentos.length, 0);

        return {
            total, dentro, fuera: total - dentro,
            pctDentro: total ? Math.round((dentro / total) * 1000) / 10 : 0,
            montoDentro, montoFuera, totalDeptos,
            mejorSub, peorSub, deptoLider,
        };
    }, [subdirecciones]);
}

function BarraPct({ pct, color }) {
    if (pct == null) return <span style={{ fontSize: 11, color: '#94a3b8' }}>Sin datos</span>;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ background: '#f1f5f9', borderRadius: 3, height: 7, width: 70, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, background: color, height: '100%' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct}%</span>
        </div>
    );
}

function FilaDepto({ claveDepto, d, expandidos, toggleDepto, onVerFormularios }) {
    const tieneSubdeptos = d.subdepartamentos?.length > 0;
    const expandido = expandidos.has(claveDepto);
    return (
        <Fragment>
            <tr
                style={{ borderBottom: '1px solid #f1f5f9', cursor: tieneSubdeptos ? 'pointer' : 'default' }}
                onClick={() => tieneSubdeptos && toggleDepto(claveDepto)}
            >
                <td style={{ padding: '7px 12px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.nombre}>
                    {tieneSubdeptos && <span style={{ color: '#94a3b8', marginRight: 6 }}>{expandido ? '▾' : '▸'}</span>}
                    {d.nombre}
                    <InfoTooltip text={tooltipRendimiento(d)} />
                    {d.total < MUESTRA_MINIMA && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '1px 6px', marginLeft: 6 }} title={`Menos de ${MUESTRA_MINIMA} formularios — % poco representativo`}>
                            muestra baja
                        </span>
                    )}
                    {tieneSubdeptos && (
                        <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>
                            ({d.subdepartamentos.length} sub-depto{d.subdepartamentos.length > 1 ? 's' : ''})
                        </span>
                    )}
                </td>
                <td style={{ padding: '7px 12px' }}>{fmtN(d.total)}</td>
                <td style={{ padding: '7px 12px', color: '#15803d', fontWeight: 600 }}>{fmtN(d.dentro)}</td>
                <td style={{ padding: '7px 12px', color: '#dc2626', fontWeight: 600 }}>{fmtN(d.fuera)}</td>
                <td style={{ padding: '7px 12px' }}><BarraPct pct={d.pct_dentro} color={colorPct(d.pct_dentro)} /></td>
                <td style={{ padding: '7px 12px' }}><BarraPct pct={d.pct_en_fecha} color={colorPct(d.pct_en_fecha)} /></td>
                <td style={{ padding: '7px 12px', color: '#64748b' }}>{fmtB(d.monto_dentro)}</td>
                <td style={{ padding: '7px 12px', color: '#64748b' }}>{fmtB(d.monto_fuera)}</td>
                <td style={{ padding: '7px 12px' }}>
                    <BotonVerFormularios onClick={() => onVerFormularios(
                        [d.depto_id, ...d.subdepartamentos.map((s) => s.depto_id)],
                        d.nombre,
                    )} />
                </td>
            </tr>
            {expandido && d.subdepartamentos.map((s) => (
                <tr key={s.depto_id ?? s.nombre} style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                    <td style={{ padding: '6px 12px 6px 34px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569', fontSize: 11.5 }} title={s.nombre}>
                        ↳ {s.nombre}
                        <InfoTooltip text={tooltipRendimiento(s)} />
                        {s.total < MUESTRA_MINIMA && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '1px 6px', marginLeft: 6 }} title={`Menos de ${MUESTRA_MINIMA} formularios — % poco representativo`}>
                                muestra baja
                            </span>
                        )}
                    </td>
                    <td style={{ padding: '6px 12px', fontSize: 11.5 }}>{fmtN(s.total)}</td>
                    <td style={{ padding: '6px 12px', color: '#15803d', fontSize: 11.5 }}>{fmtN(s.dentro)}</td>
                    <td style={{ padding: '6px 12px', color: '#dc2626', fontSize: 11.5 }}>{fmtN(s.fuera)}</td>
                    <td style={{ padding: '6px 12px' }}><BarraPct pct={s.pct_dentro} color={colorPct(s.pct_dentro)} /></td>
                    <td style={{ padding: '6px 12px' }}><BarraPct pct={s.pct_en_fecha} color={colorPct(s.pct_en_fecha)} /></td>
                    <td style={{ padding: '6px 12px', color: '#94a3b8', fontSize: 11.5 }}>{fmtB(s.monto_dentro)}</td>
                    <td style={{ padding: '6px 12px', color: '#94a3b8', fontSize: 11.5 }}>{fmtB(s.monto_fuera)}</td>
                    <td style={{ padding: '6px 12px' }}>
                        <BotonVerFormularios onClick={() => onVerFormularios([s.depto_id], s.nombre)} />
                    </td>
                </tr>
            ))}
        </Fragment>
    );
}

function idsDeSubdireccion(sub) {
    const ids = [];
    for (const d of sub.departamentos) {
        ids.push(d.depto_id);
        for (const s of d.subdepartamentos) ids.push(s.depto_id);
    }
    return ids;
}

export default function JerarquiaTab({ jerarquia, anho }) {
    const [abierta, setAbierta] = useState(null);
    const [deptosExpandidos, setDeptosExpandidos] = useState(new Set());
    const [filtroOrg, setFiltroOrg] = useState(null);
    const subdirecciones = jerarquia?.subdirecciones ?? [];
    const kpis = useKpisInstitucionales(subdirecciones);

    const toggleDepto = (clave) => {
        setDeptosExpandidos((prev) => {
            const next = new Set(prev);
            if (next.has(clave)) next.delete(clave); else next.add(clave);
            return next;
        });
    };

    const onVerFormularios = (ids, label) => {
        const idsValidos = ids.filter((id) => id != null);
        const sinClasificar = ids.some((id) => id == null);
        verFormularios(setFiltroOrg, { ids: idsValidos, sinClasificar, label });
    };

    if (!subdirecciones.length) {
        return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Sin datos para el período seleccionado.</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {kpis && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <KpiCard label="Total formularios" value={fmtN(kpis.total)} color="#0ea5e9" sub={`${kpis.totalDeptos} departamentos`} />
                    <KpiCard label="% Dentro institucional" value={`${kpis.pctDentro}%`} color={colorPct(kpis.pctDentro)} sub={`${fmtN(kpis.dentro)} de ${fmtN(kpis.total)}`} />
                    <KpiCard
                        label="🏆 Mejor subdirección" color="#16a34a"
                        value={kpis.mejorSub ? kpis.mejorSub.nombre : '—'}
                        sub={kpis.mejorSub ? `${kpis.mejorSub.pct_dentro}% Dentro · ${fmtN(kpis.mejorSub.total)} formularios` : `Sin subdirección con ≥${MUESTRA_MINIMA} formularios`}
                    />
                    <KpiCard
                        label="⚠️ Necesita atención" color="#dc2626"
                        value={kpis.peorSub ? kpis.peorSub.nombre : '—'}
                        sub={kpis.peorSub ? `${kpis.peorSub.pct_dentro}% Dentro · ${fmtN(kpis.peorSub.total)} formularios` : `Sin subdirección con ≥${MUESTRA_MINIMA} formularios`}
                    />
                    <KpiCard
                        label="🥇 Departamento líder" color="#7c3aed"
                        value={kpis.deptoLider ? kpis.deptoLider.nombre : '—'}
                        sub={kpis.deptoLider ? `${kpis.deptoLider.pct_dentro}% Dentro · ${kpis.deptoLider.subdireccion}` : `Sin depto con ≥${MUESTRA_MINIMA} formularios`}
                    />
                    <KpiCard label="💰 Monto Dentro / Fuera" value={fmtB(kpis.montoDentro)} color="#16a34a" sub={`${fmtB(kpis.montoFuera)} fuera del PAC`} />
                </div>
            )}

            {subdirecciones.map((sub, i) => {
                const esSinClasificar = sub.nombre === 'Sin Clasificar';
                const abiertaAhora = abierta === i;
                return (
                    <div key={sub.subdireccion_id ?? sub.nombre} className="card" style={{ padding: 0, overflow: 'hidden', border: esSinClasificar ? '1px dashed #cbd5e1' : '1px solid #e2e8f0' }}>
                        <div
                            onClick={() => setAbierta(abiertaAhora ? null : i)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '14px 18px', cursor: 'pointer',
                                background: esSinClasificar ? '#f8fafc' : '#fff',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 14, color: '#64748b' }}>{abiertaAhora ? '▾' : '▸'}</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: esSinClasificar ? '#64748b' : '#1e293b' }}>
                                    {esSinClasificar ? '❓ ' : '🏛️ '}{sub.nombre}
                                </span>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>({sub.departamentos.length} departamentos · {fmtN(sub.total)} formularios)</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ fontSize: 11, color: '#64748b' }}>💰 {fmtB(sub.monto_dentro)} dentro / {fmtB(sub.monto_fuera)} fuera</div>
                                <BarraPct pct={sub.pct_dentro} color={colorPct(sub.pct_dentro)} />
                                <BotonVerFormularios
                                    onClick={() => onVerFormularios(idsDeSubdireccion(sub), sub.nombre)}
                                    title={`Ver todos los formularios de ${sub.nombre}`}
                                />
                            </div>
                        </div>

                        {abiertaAhora && (
                            <div style={{ overflowX: 'auto', borderTop: '1px solid #f1f5f9' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            {['Departamento', 'Total', 'Dentro', 'Fuera', '% Dentro', '% En fecha', 'Monto Dentro', 'Monto Fuera', ''].map((h) => (
                                                <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sub.departamentos.map((d) => {
                                            const claveDepto = `${i}-${d.depto_id ?? d.nombre}`;
                                            return (
                                                <FilaDepto
                                                    key={claveDepto} claveDepto={claveDepto} d={d}
                                                    expandidos={deptosExpandidos} toggleDepto={toggleDepto}
                                                    onVerFormularios={onVerFormularios}
                                                />
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}

            <TablaFormulariosPac
                anho={anho}
                sectionId={TABLA_FORMULARIOS_ID}
                filtroOrg={filtroOrg}
                onClearFiltroOrg={() => setFiltroOrg(null)}
            />
        </div>
    );
}
