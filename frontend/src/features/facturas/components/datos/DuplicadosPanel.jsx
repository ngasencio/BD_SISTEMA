import React, { useState } from 'react';
import { cardStyle, sectionTitle, sectionSub } from './styles';
import { fmtN } from '../../utils/format';

export default function DuplicadosPanel({ duplicados }) {
    const [abierto, setAbierto] = useState(false);
    const grupos = duplicados?.grupos_duplicados ?? 0;
    const filas = duplicados?.filas_afectadas ?? 0;
    const detalle = duplicados?.detalle ?? [];
    const sinDuplicados = grupos === 0;

    return (
        <div style={{
            ...cardStyle,
            border: sinDuplicados ? '1px solid #bbf7d0' : '1px solid #fde68a',
            background: sinDuplicados ? '#f0fdf4' : '#fffbeb',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                    <div style={sectionTitle}>{sinDuplicados ? '✅ Sin Facturas Duplicadas' : '⚠️ Posibles Facturas Duplicadas'}</div>
                    <div style={sectionSub}>
                        Filas que comparten el mismo <code>folio</code> + <code>emisor</code> — la clave que usa la
                        actualización automática para no duplicar registros. Si aparece algo aquí, viene de una
                        carga anterior a este control y conviene revisarlo manualmente.
                    </div>
                </div>
                {!sinDuplicados && (
                    <div style={{ display: 'flex', gap: 16, textAlign: 'right' }}>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#b45309' }}>{fmtN(grupos)}</div>
                            <div style={{ fontSize: 11, color: '#92400e' }}>grupos duplicados</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#b45309' }}>{fmtN(filas)}</div>
                            <div style={{ fontSize: 11, color: '#92400e' }}>filas afectadas</div>
                        </div>
                    </div>
                )}
            </div>

            {!sinDuplicados && (
                <>
                    <button
                        onClick={() => setAbierto(a => !a)}
                        style={{
                            marginTop: 8, background: 'none', border: 'none', color: '#b45309',
                            fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
                        }}
                    >
                        {abierto ? '▾ Ocultar detalle' : '▸ Ver detalle'}
                    </button>
                    {abierto && (
                        <div style={{ marginTop: 10, overflowX: 'auto' }}>
                            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', color: '#92400e', borderBottom: '1px solid #fde68a' }}>
                                        <th style={{ padding: '4px 8px' }}>Folio</th>
                                        <th style={{ padding: '4px 8px' }}>Emisor</th>
                                        <th style={{ padding: '4px 8px' }}>Repeticiones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detalle.map((d, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #fef3c7' }}>
                                            <td style={{ padding: '4px 8px' }}>{d.folio}</td>
                                            <td style={{ padding: '4px 8px' }}>{d.emisor}</td>
                                            <td style={{ padding: '4px 8px' }}>{d.count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {duplicados?.detalle_truncado && (
                                <div style={{ fontSize: 11, color: '#92400e', marginTop: 6 }}>
                                    Mostrando los primeros 50 grupos — hay más sin listar.
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
