import React from 'react';
import { cardStyle, sectionTitle, sectionSub, emptyState } from './styles';
import { fmtN, fmtFechaHora, fmtFecha } from '../../utils/format';

const ESTADO_CFG = {
    completado: { texto: 'Completado', bg: '#f0fdf4', color: '#16a34a', icono: '✓' },
    error: { texto: 'Error', bg: '#fef2f2', color: '#dc2626', icono: '✕' },
    cancelado: { texto: 'Cancelado', bg: '#fffbeb', color: '#d97706', icono: '⏸' },
};

function EstadoPill({ estado }) {
    const cfg = ESTADO_CFG[estado] || { texto: estado, bg: '#f1f5f9', color: '#64748b', icono: '•' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: 11,
            borderRadius: 999, padding: '3px 9px',
        }}>
            {cfg.icono} {cfg.texto}
        </span>
    );
}

export default function HistorialSync({ historial }) {
    const filas = historial ?? [];

    return (
        <div style={cardStyle}>
            <div style={sectionTitle}>🕘 Historial de Sincronizaciones</div>
            <div style={sectionSub}>Últimas corridas del botón "Actualizar Dipres", con lo que trajeron desde el portal.</div>
            {!filas.length ? (
                <div style={emptyState}>Sin corridas registradas todavía. Usa "Actualizar Dipres" para la primera sincronización.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {filas.map((s, i) => (
                        <div
                            key={i}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                                padding: '9px 10px', borderRadius: 8,
                                background: i % 2 ? '#fafbfc' : '#fff',
                                border: '1px solid #f1f5f9',
                            }}
                        >
                            <div style={{ minWidth: 128 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{fmtFechaHora(s.fecha_ejecucion)}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtFecha(s.fecha_desde)} – {fmtFecha(s.fecha_hasta)}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 14, flex: 1, fontSize: 12 }}>
                                <span style={{ color: '#16a34a' }}>✨ {fmtN(s.registros_nuevos)} nuevas</span>
                                <span style={{ color: '#3b6fc9' }}>🔄 {fmtN(s.registros_actualizados)} actualizadas</span>
                            </div>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{s.usuario || '—'}</span>
                            <EstadoPill estado={s.estado} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
