import React from 'react';
import { cardStyle, sectionTitle, sectionSub, emptyState } from './styles';
import { fmtN } from '../../utils/format';

export default function RegistrosPorAnio({ porAnio }) {
    const filas = porAnio ?? [];
    const total = filas.reduce((acc, p) => acc + p.count, 0);
    const maxAnio = filas.length ? Math.max(...filas.map(p => p.count)) : 0;

    return (
        <div style={cardStyle}>
            <div style={sectionTitle}>📅 Registros por Año</div>
            <div style={sectionSub}>Cantidad de facturas guardadas, según el año de la fecha de emisión.</div>
            {!filas.length ? (
                <div style={emptyState}>Sin datos aún.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {filas.map(p => {
                        const pct = total ? (p.count / total) * 100 : 0;
                        return (
                            <div key={p.anio} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{
                                    width: 46, fontSize: 12, fontWeight: 700, color: '#1e3a5f',
                                    background: '#e0f5f7', borderRadius: 6, padding: '3px 0', textAlign: 'center',
                                }}>
                                    {p.anio}
                                </span>
                                <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 999, height: 16, overflow: 'hidden' }}>
                                    <div style={{
                                        width: maxAnio ? `${(p.count / maxAnio) * 100}%` : '0%',
                                        height: '100%', borderRadius: 999,
                                        background: 'linear-gradient(90deg, #3b6fc9, #38b2bd)',
                                        transition: 'width 0.4s ease',
                                    }} />
                                </div>
                                <span style={{ width: 60, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#334155' }}>{fmtN(p.count)}</span>
                                <span style={{ width: 42, textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>{pct.toFixed(0)}%</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
