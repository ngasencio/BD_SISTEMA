import React, { useEffect, useRef } from 'react';
import { useAuth } from '../../../store/authStore';
import { useNotificaciones } from '../hooks/useNotificaciones';

const TIPO_ICONO = {
    NUEVO_PROCESO: '🆕',
    CAMBIO_ESTADO: '🔄',
    EMISION_OC: '📦',
    CIERRE_PROXIMO: '⏰',
};

function tiempoRelativo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.floor(h / 24)} d`;
}

// Campanita global del Topbar — visible para cualquier usuario autenticado
// (hoy solo las 3 jefaturas de Abastecimiento reciben filas, pero el
// componente no asume ningún rol: simplemente muestra 0 si no hay nada).
export default function CampanitaNotificaciones() {
    const { isAuthenticated } = useAuth();
    const { count, notificaciones, abierto, cargando, abrir, cerrar, onMarcarLeida, onMarcarTodasLeidas } = useNotificaciones();
    const wrapperRef = useRef(null);

    useEffect(() => {
        if (!abierto) return undefined;
        const onClickFuera = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) cerrar();
        };
        document.addEventListener('mousedown', onClickFuera);
        return () => document.removeEventListener('mousedown', onClickFuera);
    }, [abierto, cerrar]);

    if (!isAuthenticated) return null;

    return (
        <div ref={wrapperRef} style={{ position: 'relative', marginRight: 16 }}>
            <button
                type="button"
                onClick={() => (abierto ? cerrar() : abrir())}
                title="Notificaciones"
                style={{
                    position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.85)', fontSize: 16, padding: 4, lineHeight: 1,
                }}
            >
                🔔
                {count > 0 && (
                    <span style={{
                        position: 'absolute', top: -4, right: -6, background: '#c62828', color: '#fff',
                        borderRadius: 999, fontSize: 10, fontWeight: 700, lineHeight: 1,
                        minWidth: 16, height: 16, padding: '0 4px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '1px solid rgba(255,255,255,0.4)',
                    }}>
                        {count > 9 ? '9+' : count}
                    </span>
                )}
            </button>

            {abierto && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, maxHeight: 420,
                    background: '#fff', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                    border: '1px solid #e2e8f0', overflow: 'hidden', zIndex: 300,
                    display: 'flex', flexDirection: 'column',
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderBottom: '1px solid #f1f5f9',
                    }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Notificaciones</span>
                        {notificaciones.some((n) => !n.leida) && (
                            <button type="button" onClick={onMarcarTodasLeidas} style={{
                                background: 'none', border: 'none', color: '#2563eb', fontSize: 11.5,
                                cursor: 'pointer', fontWeight: 600,
                            }}>
                                Marcar todas como leídas
                            </button>
                        )}
                    </div>

                    <div style={{ overflowY: 'auto', flex: '1 1 auto' }}>
                        {cargando ? (
                            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12.5 }}>Cargando…</div>
                        ) : notificaciones.length === 0 ? (
                            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 12.5 }}>
                                Sin notificaciones por ahora.
                            </div>
                        ) : (
                            notificaciones.map((n) => (
                                <div
                                    key={n.id}
                                    onClick={() => !n.leida && onMarcarLeida(n.id)}
                                    role="button"
                                    style={{
                                        display: 'flex', gap: 10, padding: '10px 14px', cursor: n.leida ? 'default' : 'pointer',
                                        background: n.leida ? '#fff' : '#eff6ff',
                                        borderBottom: '1px solid #f1f5f9',
                                    }}
                                >
                                    <span style={{ fontSize: 16, flexShrink: 0 }}>{TIPO_ICONO[n.tipo] || '🔔'}</span>
                                    <div style={{ flex: '1 1 0%', minWidth: 0 }}>
                                        <div style={{ fontSize: 12.5, color: '#1e293b', fontWeight: n.leida ? 400 : 600 }}>
                                            {n.mensaje}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                            {tiempoRelativo(n.creado_en)}
                                        </div>
                                    </div>
                                    {!n.leida && (
                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563eb', flexShrink: 0, marginTop: 4 }} />
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
