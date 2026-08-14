import React from 'react';
import { cardStyle, sectionTitle, sectionSub, emptyState } from './styles';
import { fmtN, fmtCLPCorto } from '../../utils/format';

const BAR_COLOR = '#3b6fc9';

export default function PivotTipoDocumento({ datos }) {
    const filas = datos ?? [];
    const maxCount = filas.length ? Math.max(...filas.map(f => f.count)) : 0;

    return (
        <div style={cardStyle}>
            <div style={sectionTitle}>🧮 Composición por Tipo de Documento</div>
            <div style={sectionSub}>
                Facturas, notas de crédito y notas de débito agrupadas por su <code>tipo_documento</code> tal
                como lo entrega DIPRES/Acepta. Distintos nombres para un mismo tipo de documento (ej. "Nota
                Credito" y "Nota De Credito Electronica") suelen venir de dos fuentes históricas distintas
                (carga Excel antigua vs. scraper actual) — no se fusionan automáticamente para no asumir
                equivalencias sin verificar.
            </div>
            {!filas.length ? (
                <div style={emptyState}>Sin datos aún.</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>
                                <th style={{ padding: '6px 10px' }}>Tipo de Documento</th>
                                <th style={{ padding: '6px 10px' }}>Cantidad</th>
                                <th style={{ padding: '6px 10px', width: '32%' }}></th>
                                <th style={{ padding: '6px 10px', textAlign: 'right' }}>%</th>
                                <th style={{ padding: '6px 10px', textAlign: 'right' }}>Monto Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filas.map((f, i) => (
                                <tr key={f.tipo_documento} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 ? '#fafbfc' : '#fff' }}>
                                    <td style={{ padding: '7px 10px', fontWeight: 600, color: '#1e293b' }}>{f.label}</td>
                                    <td style={{ padding: '7px 10px', color: '#334155' }}>{fmtN(f.count)}</td>
                                    <td style={{ padding: '7px 10px' }}>
                                        <div style={{ background: '#f1f5f9', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                                            <div style={{
                                                width: maxCount ? `${(f.count / maxCount) * 100}%` : '0%',
                                                background: BAR_COLOR, height: '100%', borderRadius: 4,
                                            }} />
                                        </div>
                                    </td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b' }}>{f.pct}%</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#334155', fontVariantNumeric: 'tabular-nums' }}>{fmtCLPCorto(f.monto_total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
