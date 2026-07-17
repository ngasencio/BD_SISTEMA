import React, { useState } from 'react';

function hoyISO(offsetDias = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDias);
    return d.toISOString().slice(0, 10);
}

export default function ModalActualizarSigfe({ onConfirmar, onCerrar }) {
    const [usuario, setUsuario] = useState('');
    const [password, setPassword] = useState('');
    const [fechaDesde, setFechaDesde] = useState(hoyISO(-30));
    const [fechaHasta, setFechaHasta] = useState(hoyISO());

    const fechasValidas = fechaDesde && fechaHasta && fechaDesde <= fechaHasta;
    const puedeConfirmar = usuario && password && fechasValidas;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 400, boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
                <h3 style={{ margin: '0 0 6px' }}>Actualizar desde SIGFE</h3>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 16px' }}>
                    Descarga los 7 establecimientos del Servicio de Salud Osorno para el rango de fechas indicado
                    y sincroniza los devengos nuevos. Las credenciales no se almacenan en el servidor. Puede tardar
                    varios minutos — puedes cancelarlo en cualquier momento.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                        placeholder="Usuario SIGFE"
                        value={usuario}
                        onChange={e => setUsuario(e.target.value)}
                        style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                    />
                    <input
                        placeholder="Contraseña SIGFE"
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                    />
                    <div style={{ display: 'flex', gap: 10 }}>
                        <label style={{ flex: 1, fontSize: 11, color: '#6b7280' }}>
                            Desde
                            <input
                                type="date"
                                value={fechaDesde}
                                max={fechaHasta}
                                onChange={e => setFechaDesde(e.target.value)}
                                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                            />
                        </label>
                        <label style={{ flex: 1, fontSize: 11, color: '#6b7280' }}>
                            Hasta
                            <input
                                type="date"
                                value={fechaHasta}
                                min={fechaDesde}
                                max={hoyISO()}
                                onChange={e => setFechaHasta(e.target.value)}
                                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                            />
                        </label>
                    </div>
                    {!fechasValidas && (
                        <div style={{ fontSize: 11, color: '#dc2626' }}>La fecha "desde" no puede ser posterior a "hasta".</div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                    <button onClick={onCerrar} style={{ padding: '8px 14px', background: '#f3f4f6', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirmar({ usuario, password, fechaDesde, fechaHasta })}
                        disabled={!puedeConfirmar}
                        style={{
                            padding: '8px 14px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6,
                            cursor: puedeConfirmar ? 'pointer' : 'not-allowed', opacity: puedeConfirmar ? 1 : 0.6,
                        }}
                    >
                        Iniciar actualización
                    </button>
                </div>
            </div>
        </div>
    );
}
