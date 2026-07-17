import React, { useState } from 'react';

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

export default function BannerActualizacionSigfe({ tarea, onCerrar, onCancelar }) {
    const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
    if (!tarea) return null;

    const completado = tarea.status === 'completado';
    const error = tarea.status === 'error';
    const cancelado = tarea.status === 'cancelado';
    const enProceso = tarea.status === 'en_proceso' || tarea.status === 'iniciado';
    const color = completado ? '#16a34a' : (error || cancelado) ? '#dc2626' : '#0ea5e9';

    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
            background: '#1e1e2e', border: `2px solid ${color}`,
            borderRadius: 12, padding: '16px 20px', width: 400,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)', fontFamily: 'monospace',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ color, fontWeight: 700, fontSize: 13 }}>
                    {completado ? '✅ Actualización completada'
                        : error ? '❌ Error'
                        : cancelado ? '✋ Cancelado'
                        : '🔄 Actualizando desde SIGFE...'}
                </span>
                <button onClick={onCerrar} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>

            <div style={{ background: '#374151', borderRadius: 4, height: 6, marginBottom: 10 }}>
                <div style={{
                    width: `${tarea.progreso_pct || (completado ? 100 : enProceso ? 5 : 0)}%`,
                    background: color, height: '100%', borderRadius: 4, transition: 'width 0.3s ease',
                }} />
            </div>

            <div style={{ color: '#d1d5db', fontSize: 12, marginBottom: 8 }}>{tarea.paso_desc}</div>

            {tarea.diff && (
                <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 6 }}>
                    {fmtN(tarea.diff.insertadas)} documentos nuevos · {fmtN(tarea.diff.ya_existian)} ya existían
                </div>
            )}

            {tarea.logs_recientes?.length > 0 && (
                <div style={{ background: '#111827', borderRadius: 6, padding: '6px 8px', maxHeight: 120, overflowY: 'auto', fontSize: 10, color: '#4ade80', lineHeight: 1.5 }}>
                    {tarea.logs_recientes.map((l, i) => <div key={i}>&gt; {l}</div>)}
                </div>
            )}

            {error && <div style={{ color: '#fca5a5', fontSize: 11, marginTop: 8 }}>{tarea.error}</div>}

            {enProceso && !confirmandoCancelar && (
                <button
                    onClick={() => setConfirmandoCancelar(true)}
                    style={{ marginTop: 10, width: '100%', padding: '6px', background: '#374151', border: '1px solid #6b7280', borderRadius: 6, color: '#d1d5db', cursor: 'pointer', fontSize: 12 }}
                >
                    Cancelar
                </button>
            )}
            {enProceso && confirmandoCancelar && (
                <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                    <span style={{ flex: 1, fontSize: 11, color: '#fbbf24', alignSelf: 'center' }}>¿Detener la actualización?</span>
                    <button
                        onClick={() => setConfirmandoCancelar(false)}
                        style={{ padding: '6px 10px', background: '#374151', border: '1px solid #6b7280', borderRadius: 6, color: '#d1d5db', cursor: 'pointer', fontSize: 11 }}
                    >
                        No
                    </button>
                    <button
                        onClick={onCancelar}
                        style={{ padding: '6px 10px', background: '#dc2626', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 11 }}
                    >
                        Sí, detener
                    </button>
                </div>
            )}
        </div>
    );
}
