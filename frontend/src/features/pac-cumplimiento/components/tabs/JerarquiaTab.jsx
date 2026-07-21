import { useState, Fragment } from 'react';

const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtB = (n) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return fmt(n);
};
const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

const colorPct = (pct) => (pct == null ? '#94a3b8' : pct >= 70 ? '#15803d' : pct >= 40 ? '#b45309' : '#dc2626');

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

function FilaDepto({ claveDepto, d, expandidos, toggleDepto }) {
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
            </tr>
            {expandido && d.subdepartamentos.map((s) => (
                <tr key={s.depto_id ?? s.nombre} style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                    <td style={{ padding: '6px 12px 6px 34px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569', fontSize: 11.5 }} title={s.nombre}>
                        ↳ {s.nombre}
                    </td>
                    <td style={{ padding: '6px 12px', fontSize: 11.5 }}>{fmtN(s.total)}</td>
                    <td style={{ padding: '6px 12px', color: '#15803d', fontSize: 11.5 }}>{fmtN(s.dentro)}</td>
                    <td style={{ padding: '6px 12px', color: '#dc2626', fontSize: 11.5 }}>{fmtN(s.fuera)}</td>
                    <td style={{ padding: '6px 12px' }}><BarraPct pct={s.pct_dentro} color={colorPct(s.pct_dentro)} /></td>
                    <td style={{ padding: '6px 12px' }}><BarraPct pct={s.pct_en_fecha} color={colorPct(s.pct_en_fecha)} /></td>
                    <td style={{ padding: '6px 12px', color: '#94a3b8', fontSize: 11.5 }}>{fmtB(s.monto_dentro)}</td>
                    <td style={{ padding: '6px 12px', color: '#94a3b8', fontSize: 11.5 }}>{fmtB(s.monto_fuera)}</td>
                </tr>
            ))}
        </Fragment>
    );
}

export default function JerarquiaTab({ jerarquia }) {
    const [abierta, setAbierta] = useState(null);
    const [deptosExpandidos, setDeptosExpandidos] = useState(new Set());
    const subdirecciones = jerarquia?.subdirecciones ?? [];

    const toggleDepto = (clave) => {
        setDeptosExpandidos((prev) => {
            const next = new Set(prev);
            if (next.has(clave)) next.delete(clave); else next.add(clave);
            return next;
        });
    };

    if (!subdirecciones.length) {
        return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Sin datos para el período seleccionado.</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                                <div style={{ fontSize: 11, color: '#64748b' }}>💰 {fmtB(sub.monto_dentro)} dentro / {fmtB(sub.monto_fuera)} fuera</div>
                                <BarraPct pct={sub.pct_dentro} color={colorPct(sub.pct_dentro)} />
                            </div>
                        </div>

                        {abiertaAhora && (
                            <div style={{ overflowX: 'auto', borderTop: '1px solid #f1f5f9' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            {['Departamento', 'Total', 'Dentro', 'Fuera', '% Dentro', '% En fecha', 'Monto Dentro', 'Monto Fuera'].map((h) => (
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
        </div>
    );
}
