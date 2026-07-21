import { useEffect, useMemo, useState } from 'react';
import { getJerarquiaPlaner } from '../../../api/pacCumplimientoApi';
import { fmtN, fmtCompacto, colorPct } from '../../../utils/format';
import VerFichaSubtab from './VerFichaSubtab';

const TABLA_FICHAS_ID = 'jerarquica-tabla-fichas';

function BotonVerFichas({ onClick, title }) {
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            title={title || 'Ver fichas de esta unidad'}
            style={{ padding: '3px 9px', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 6, color: '#7c3aed', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
            🔍 Ver fichas
        </button>
    );
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

function BarraPct({ pct }) {
    const color = colorPct(pct);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ background: '#f1f5f9', borderRadius: 3, height: 7, width: 70, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, background: color, height: '100%' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct}%</span>
        </div>
    );
}

const MUESTRA_MINIMA = 3;

function FilaDepartamento({ claveDepto, d, expandido, onToggle, onVerFichas }) {
    const tieneSubdeptos = d.subdepartamentos?.length > 0;
    return (
        <>
            <tr
                style={{ borderBottom: '1px solid #f1f5f9', cursor: tieneSubdeptos ? 'pointer' : 'default' }}
                onClick={() => tieneSubdeptos && onToggle(claveDepto)}
            >
                <td style={{ padding: '7px 12px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.nombre}>
                    {tieneSubdeptos && <span style={{ color: '#94a3b8', marginRight: 6 }}>{expandido ? '▾' : '▸'}</span>}
                    {d.nombre}
                    {d.total < MUESTRA_MINIMA && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '1px 6px', marginLeft: 6 }}>
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
                <td style={{ padding: '7px 12px', color: '#15803d', fontWeight: 600 }}>{fmtN(d.ejecutados)}</td>
                <td style={{ padding: '7px 12px', color: '#b45309', fontWeight: 600 }}>{fmtN(d.pendientes)}</td>
                <td style={{ padding: '7px 12px', color: '#dc2626', fontWeight: 600 }}>{fmtN(d.atrasados)}</td>
                <td style={{ padding: '7px 12px' }}><BarraPct pct={d.pct_ejecutado} /></td>
                <td style={{ padding: '7px 12px', color: '#64748b' }}>{fmtCompacto(d.monto_total)}</td>
                <td style={{ padding: '7px 12px' }}>
                    <BotonVerFichas onClick={() => onVerFichas(d)} />
                </td>
            </tr>
            {expandido && d.subdepartamentos.map((sd) => (
                <tr key={sd.nombre} style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                    <td style={{ padding: '6px 12px 6px 34px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569', fontSize: 11.5 }} title={sd.nombre}>
                        ↳ {sd.nombre}
                        {sd.total < MUESTRA_MINIMA && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '1px 6px', marginLeft: 6 }}>
                                muestra baja
                            </span>
                        )}
                    </td>
                    <td style={{ padding: '6px 12px', fontSize: 11.5 }}>{fmtN(sd.total)}</td>
                    <td style={{ padding: '6px 12px', color: '#15803d', fontSize: 11.5 }}>{fmtN(sd.ejecutados)}</td>
                    <td style={{ padding: '6px 12px', color: '#b45309', fontSize: 11.5 }}>{fmtN(sd.pendientes)}</td>
                    <td style={{ padding: '6px 12px', color: '#dc2626', fontSize: 11.5 }}>{fmtN(sd.atrasados)}</td>
                    <td style={{ padding: '6px 12px' }}><BarraPct pct={sd.pct_ejecutado} /></td>
                    <td style={{ padding: '6px 12px', color: '#94a3b8', fontSize: 11.5 }}>{fmtCompacto(sd.monto_total)}</td>
                    <td style={{ padding: '6px 12px' }}>
                        <BotonVerFichas onClick={() => onVerFichas(sd)} />
                    </td>
                </tr>
            ))}
        </>
    );
}

export default function EjecucionJerarquicaSubtab({ anho }) {
    const [jerarquia, setJerarquia] = useState(null);
    const [abierta, setAbierta] = useState(null);
    const [deptosExpandidos, setDeptosExpandidos] = useState(new Set());
    const [cargando, setCargando] = useState(false);
    const [filtroExterno, setFiltroExterno] = useState(null);

    const toggleDepto = (clave) => {
        setDeptosExpandidos((prev) => {
            const next = new Set(prev);
            if (next.has(clave)) next.delete(clave); else next.add(clave);
            return next;
        });
    };

    useEffect(() => {
        setCargando(true);
        getJerarquiaPlaner({ anho })
            .then(({ data }) => setJerarquia(data))
            .catch(() => setJerarquia(null))
            .finally(() => setCargando(false));
    }, [anho]);

    const verFichasDeSubdireccion = (sub) => {
        setFiltroExterno({ subdireccionId: sub.subdireccion_id, deptoIds: [], label: sub.nombre });
        requestAnimationFrame(() => {
            document.getElementById(TABLA_FICHAS_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    const verFichasDeDepartamento = (d) => {
        setFiltroExterno({ deptoIds: d.depto_ids ?? [], subdireccionId: null, label: d.nombre });
        requestAnimationFrame(() => {
            document.getElementById(TABLA_FICHAS_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    const subdirecciones = jerarquia?.subdirecciones ?? [];

    const kpis = useMemo(() => {
        if (!subdirecciones.length) return null;
        let total = 0, ejecutados = 0, pendientes = 0, atrasados = 0, monto = 0;
        for (const s of subdirecciones) {
            total += s.total; ejecutados += s.ejecutados; pendientes += s.pendientes; atrasados += s.atrasados; monto += s.monto_total;
        }
        const conMuestra = subdirecciones.filter((s) => s.total >= MUESTRA_MINIMA);
        const mejor = conMuestra.length ? [...conMuestra].sort((a, b) => b.pct_ejecutado - a.pct_ejecutado)[0] : null;
        const peor = conMuestra.length ? [...conMuestra].sort((a, b) => a.pct_ejecutado - b.pct_ejecutado)[0] : null;
        return {
            total, ejecutados, pendientes, atrasados, monto,
            pctEjecutado: total ? Math.round((ejecutados / total) * 1000) / 10 : 0,
            mejor, peor,
        };
    }, [subdirecciones]);

    if (cargando) {
        return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Cargando…</div>;
    }
    if (!subdirecciones.length) {
        return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Sin datos para el período seleccionado.</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {kpis && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <KpiCard label="Total fichas" value={fmtN(kpis.total)} color="#0ea5e9" sub={fmtCompacto(kpis.monto)} />
                    <KpiCard label="% Ejecutado institucional" value={`${kpis.pctEjecutado}%`} color={colorPct(kpis.pctEjecutado)} sub={`${fmtN(kpis.ejecutados)} de ${fmtN(kpis.total)}`} />
                    <KpiCard label="🏆 Mejor subdirección" color="#16a34a" value={kpis.mejor ? kpis.mejor.nombre : '—'} sub={kpis.mejor ? `${kpis.mejor.pct_ejecutado}% ejecutado` : undefined} />
                    <KpiCard label="⚠️ Necesita atención" color="#dc2626" value={kpis.peor ? kpis.peor.nombre : '—'} sub={kpis.peor ? `${kpis.peor.pct_ejecutado}% ejecutado` : undefined} />
                </div>
            )}

            {subdirecciones.map((sub, i) => {
                const abiertaAhora = abierta === i;
                const esSinClasificar = sub.nombre === 'Sin Clasificar';
                return (
                    <div key={sub.nombre} className="card" style={{ padding: 0, overflow: 'hidden', border: esSinClasificar ? '1px dashed #cbd5e1' : '1px solid #e2e8f0' }}>
                        <div
                            onClick={() => setAbierta(abiertaAhora ? null : i)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer', background: esSinClasificar ? '#f8fafc' : '#fff' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 14, color: '#64748b' }}>{abiertaAhora ? '▾' : '▸'}</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: esSinClasificar ? '#64748b' : '#1e293b' }}>
                                    {esSinClasificar ? '❓ ' : '🏛️ '}{sub.nombre}
                                </span>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>({sub.departamentos.length} departamentos · {fmtN(sub.total)} fichas)</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ fontSize: 11, color: '#64748b' }}>💰 {fmtCompacto(sub.monto_total)}</div>
                                <BarraPct pct={sub.pct_ejecutado} />
                                <BotonVerFichas onClick={() => verFichasDeSubdireccion(sub)} title={`Ver todas las fichas de ${sub.nombre}`} />
                            </div>
                        </div>

                        {abiertaAhora && (
                            <div style={{ overflowX: 'auto', borderTop: '1px solid #f1f5f9' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            {['Departamento', 'Total', 'Ejecutado', 'Pendiente', 'Atrasado', '% Ejecutado', 'Monto', ''].map((h) => (
                                                <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sub.departamentos.map((d) => {
                                            const claveDepto = `${i}-${d.nombre}`;
                                            return (
                                                <FilaDepartamento
                                                    key={claveDepto} claveDepto={claveDepto} d={d}
                                                    expandido={deptosExpandidos.has(claveDepto)}
                                                    onToggle={toggleDepto}
                                                    onVerFichas={verFichasDeDepartamento}
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

            <VerFichaSubtab
                anho={anho}
                sectionId={TABLA_FICHAS_ID}
                filtroExterno={filtroExterno}
                onClearFiltroExterno={() => setFiltroExterno(null)}
            />
        </div>
    );
}
