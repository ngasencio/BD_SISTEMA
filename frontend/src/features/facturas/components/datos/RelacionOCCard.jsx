import React from 'react';
import { cardStyle, sectionTitle, sectionSub } from './styles';
import { fmtN } from '../../utils/format';

const COLOR_CON_OC = '#16a34a';
const COLOR_SIN_OC = '#d97706';

export default function RelacionOCCard({ relacion }) {
    const conOc = relacion?.con_oc ?? 0;
    const sinOc = relacion?.sin_oc ?? 0;
    const pct = relacion?.pct_con_oc ?? 0;
    const total = conOc + sinOc;

    return (
        <div style={cardStyle}>
            <div style={sectionTitle}>🔗 Relación con Orden de Compra</div>
            <div style={sectionSub}>
                Cuántas facturas traen un <code>folio_oc</code> — es decir, están vinculadas a una Orden de
                Compra de Mercado Público — versus las que llegaron sin ese cruce (compras directas, otros
                convenios, o documentos aún sin enlazar).
            </div>

            {total === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: 12 }}>Sin datos aún.</div>
            ) : (
                <>
                    <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
                        <div style={{ width: `${pct}%`, background: COLOR_CON_OC, minWidth: conOc ? 4 : 0 }} title={`${fmtN(conOc)} con OC`} />
                        <div style={{ width: `${100 - pct}%`, background: COLOR_SIN_OC, minWidth: sinOc ? 4 : 0 }} title={`${fmtN(sinOc)} sin OC`} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: COLOR_CON_OC, display: 'inline-block' }} />
                            <span style={{ fontSize: 12, color: '#334155' }}>
                                Con OC — <strong>{fmtN(conOc)}</strong> ({pct}%)
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: COLOR_SIN_OC, display: 'inline-block' }} />
                            <span style={{ fontSize: 12, color: '#334155' }}>
                                Sin OC — <strong>{fmtN(sinOc)}</strong> ({(100 - pct).toFixed(1)}%)
                            </span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
