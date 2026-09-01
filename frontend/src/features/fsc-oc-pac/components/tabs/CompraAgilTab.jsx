import { fmtN, fmtCLP } from '../../utils/format';

function KpiCard({ label, value, accent }) {
    return (
        <article className="dv-card" style={{ '--dv-card-accent': accent, flex: '1 1 180px' }}>
            <div className="dv-card__title">{label}</div>
            <div className="dv-card__value">{value}</div>
        </article>
    );
}

export default function CompraAgilTab({ compraAgil }) {
    const kpis = compraAgil?.kpis;
    const detalle = compraAgil?.detalle ?? [];

    if (!kpis) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <KpiCard label="OC de tipo Compra Ágil" value={fmtN(kpis.total_oc_agil)} accent="var(--dv-primary)" />
                <KpiCard label="Con CodigoCompraAgil" value={fmtN(kpis.con_codigo_ca)} accent="var(--dv-ok)" />
                <KpiCard label="Enlazadas a CA existente" value={fmtN(kpis.enlazadas_a_ca_existente)} accent="var(--dv-ok)" />
                <KpiCard label="% Enlazado" value={`${kpis.pct_enlazado}%`} accent={kpis.pct_enlazado >= 70 ? 'var(--dv-ok)' : kpis.pct_enlazado >= 30 ? 'var(--dv-warn)' : 'var(--dv-watch)'} />
            </div>

            <div className="dv-panel" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px 0' }}>
                    <h3 className="dv-panel__title">Detalle</h3>
                    <p className="dv-panel__subtitle">Primeras {detalle.length} OC enlazadas a Compra Ágil.</p>
                </div>
                <div className="dv-table-scroll" style={{ maxHeight: 480, overflowY: 'auto' }}>
                    <table className="dv-table">
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left' }}>Código OC</th>
                                <th style={{ textAlign: 'left' }}>Nombre OC</th>
                                <th style={{ textAlign: 'left' }}>Código Compra Ágil</th>
                                <th>Total Bruto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detalle.map((row) => (
                                <tr key={row.codigo_oc}>
                                    <td style={{ textAlign: 'left', fontWeight: 600 }}>{row.codigo_oc}</td>
                                    <td style={{ textAlign: 'left', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.NombreOC}</td>
                                    <td style={{ textAlign: 'left' }}>{row.CodigoCompraAgil}</td>
                                    <td>{row.TotalBruto != null ? fmtCLP(row.TotalBruto) : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
