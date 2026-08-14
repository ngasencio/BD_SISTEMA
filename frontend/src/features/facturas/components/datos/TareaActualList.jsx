import React from 'react';
import { cardStyle, sectionTitle, sectionSub, emptyState } from './styles';
import { fmtN, humanizarSlug } from '../../utils/format';

const BAR_COLOR = '#38b2bd';

export default function TareaActualList({ datos }) {
    const filas = datos ?? [];
    const max = filas.length ? Math.max(...filas.map(f => f.count)) : 0;

    return (
        <div style={cardStyle}>
            <div style={sectionTitle}>⚙️ Estado de Tramitación (Tarea Actual)</div>
            <div style={sectionSub}>
                En qué paso del flujo de devengo SIGFE se encuentra cada factura según DIPRES — por ejemplo,
                si ya devengó automáticamente, quedó pendiente de revisión manual, o tuvo algún error.
            </div>
            {!filas.length ? (
                <div style={emptyState}>Sin datos aún.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {filas.map(f => (
                        <div key={f.tarea_actual} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 190, fontSize: 12, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.tarea_actual}>
                                {humanizarSlug(f.tarea_actual)}
                            </span>
                            <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 14, overflow: 'hidden' }}>
                                <div style={{
                                    width: max ? `${(f.count / max) * 100}%` : '0%',
                                    background: BAR_COLOR, height: '100%', borderRadius: 4,
                                }} />
                            </div>
                            <span style={{ width: 56, textAlign: 'right', fontSize: 12, color: '#64748b' }}>{fmtN(f.count)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
