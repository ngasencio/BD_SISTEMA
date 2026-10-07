import React, { useEffect, useState } from 'react';
import { confirmarCorreoResponsable, getNotifResponsablesPendientes } from '../../api/gestorComprasApi';
import { fmtCLP } from '../solicitudes/shared';
import { filtrosAParams } from './seleccion';

const ESTADO = {
    SUGERIDO: { label: 'Hay que confirmar cuál es', color: '#b45309', bg: '#fffbeb' },
    AMBIGUO: { label: 'Hay varios con ese nombre', color: '#b45309', bg: '#fffbeb' },
    SIN_CORREO: { label: 'Sin candidato', color: '#b91c1c', bg: '#fef2f2' },
};
const RE_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function FilaResponsable({ r, guardando, onGuardar }) {
    const [manual, setManual] = useState('');
    const info = ESTADO[r.estado] || ESTADO.SIN_CORREO;
    return (
        <div className="gc-notif-resp">
            <div className="gc-notif-resp-head">
                <div>
                    <div className="gc-notif-resp-nombre">{r.nombre_responsable}</div>
                    <div className="gc-notif-resp-meta">
                        {r.planes} plan{r.planes !== 1 ? 'es' : ''} · {fmtCLP(r.monto_total)}
                        {r.departamentos.length > 0 && <> · {r.departamentos.join(' / ')}</>}
                    </div>
                </div>
                <span className="gc-notif-chip" style={{ background: info.bg, color: info.color }}>{info.label}</span>
            </div>

            {r.candidatos.length > 0 && (
                <div className="gc-notif-cands">
                    <div className="gc-notif-cands-label">Posibles usuarios del Panel SSO:</div>
                    {r.candidatos.map((c) => (
                        <button
                            key={c.correo} className="gc-notif-cand" disabled={guardando}
                            onClick={() => onGuardar(r.nombre_responsable, c.correo)}
                            title="Usar este correo para este responsable (se recuerda para siempre)"
                        >
                            <span><strong>{c.alias}</strong>{c.cargo ? ` · ${c.cargo}` : ''}{!c.activo ? ' · (inactivo)' : ''}</span>
                            <span className="gc-notif-cand-correo">{c.correo} <em>{Math.round(c.puntaje * 100)}%</em></span>
                        </button>
                    ))}
                </div>
            )}

            <div className="gc-notif-manual">
                <input
                    type="email" value={manual} placeholder="…o escriba el correo a mano"
                    onChange={(e) => setManual(e.target.value)}
                />
                <button
                    className="gc-notif-btn" disabled={guardando || !RE_CORREO.test(manual.trim())}
                    onClick={() => onGuardar(r.nombre_responsable, manual.trim())}
                >
                    Guardar
                </button>
            </div>
        </div>
    );
}

// Responsables del PAC cuyo correo no se pudo asegurar solo (parecidos, homónimos o sin candidato).
// Cada confirmación se guarda una vez: de ahí en adelante ese nombre queda resuelto.
export default function ModalCorreosPendientes({ params, anho, filtros, onCerrar, onCambio }) {
    const [filas, setFilas] = useState(null);
    const [error, setError] = useState(null);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        let activo = true;
        // Solo los filtros que no dependen del correo: aquí interesan todos los responsables dudosos.
        const resto = filtrosAParams({ ...filtros, correo: '', notificado: '' });
        getNotifResponsablesPendientes({ ...params, ...(anho ? { anho } : {}), ...resto })
            .then(({ data }) => { if (activo) setFilas(data.results); })
            .catch(() => { if (activo) setError('No fue posible cargar los responsables pendientes.'); });
        return () => { activo = false; };
    }, [params, anho, filtros]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onCerrar(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onCerrar]);

    const guardar = async (nombre, correo) => {
        setGuardando(true);
        setError(null);
        try {
            await confirmarCorreoResponsable({ nombre_responsable: nombre, correo }, params);
            setFilas((prev) => prev.filter((f) => f.nombre_responsable !== nombre));
            onCambio();
        } catch (err) {
            setError(err.response?.data?.detail || 'No se pudo guardar el correo.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="gc-ficha-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
            <div className="gc-notif-modal" role="dialog" aria-modal="true" aria-label="Confirmar correos">
                <div className="gc-notif-modal-head">
                    <div>
                        <div className="gc-notif-modal-title">✉️ Confirmar correos de responsables</div>
                        <div className="gc-notif-modal-sub">
                            El PAC solo trae el nombre del responsable. Confirme su correo una vez y el sistema lo recordará.
                        </div>
                    </div>
                    <button className="gc-notif-x" onClick={onCerrar} aria-label="Cerrar">✕</button>
                </div>
                <div className="gc-notif-modal-body">
                    {error && <div className="error-message">{error}</div>}
                    {filas === null && !error && <div className="loading-spinner">Buscando coincidencias…</div>}
                    {filas?.length === 0 && (
                        <div className="gc-empty"><div className="gc-empty-icon">✅</div>
                            <div className="gc-empty-title">Todos los correos están resueltos</div></div>
                    )}
                    {filas?.map((r) => (
                        <FilaResponsable key={r.nombre_responsable} r={r} guardando={guardando} onGuardar={guardar} />
                    ))}
                </div>
            </div>
        </div>
    );
}
