// Actualización de Formularios desde el Panel Documental: credenciales, progreso y resumen de cambios.
import { useState } from 'react';
import './formularios.css';
import { fmtCLP, fmtN } from './shared';
import { DiasChip, EstadoChip } from './ui';

// ─── Credenciales del Panel SS Osorno ────────────────────────────────────────

export function ModalCredenciales({ onConfirmar, onCerrar }) {
    const [rut, setRut] = useState('');
    const [dv, setDv] = useState('');
    const [clave, setClave] = useState('');
    const completo = Boolean(rut && dv && clave);

    const enviar = (e) => {
        e.preventDefault();
        if (completo) onConfirmar({ rut, dv, clave });
    };

    return (
        <div className="dv-overlay is-open" style={{ zIndex: 1100 }} onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
            <form className="dv-modal frm-modal--sm" onSubmit={enviar} aria-label="Acceso al Panel SS Osorno">
                <header className="dv-modal__header">
                    <div>
                        <h2>Acceso al Panel SS Osorno</h2>
                        <div className="dv-sub">Descarga de los reportes de Formularios de Solicitud de Compra</div>
                    </div>
                </header>
                <div className="dv-modal__body">
                    <p className="dv-footnote" style={{ marginTop: 0, marginBottom: 'var(--dv-sp-4)' }}>
                        Ingresa tus credenciales del Panel. Se usan solo para esta descarga y no se almacenan en el servidor.
                    </p>
                    <div className="frm-form">
                        <div className="frm-form__row">
                            <label className="frm-label">RUT (sin dígito verificador)
                                <input className="frm-input" value={rut} onChange={(e) => setRut(e.target.value)} autoComplete="off" autoFocus />
                            </label>
                            <label className="frm-label">DV
                                <input className="frm-input" value={dv} onChange={(e) => setDv(e.target.value)} autoComplete="off" maxLength={1} />
                            </label>
                        </div>
                        <label className="frm-label">Contraseña
                            <input className="frm-input" type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="off" />
                        </label>
                    </div>
                </div>
                <footer className="dv-modal__footer">
                    <button type="button" className="dv-btn" onClick={onCerrar}>Cancelar</button>
                    <button type="submit" className="dv-btn dv-btn--primary" disabled={!completo}>Iniciar descarga</button>
                </footer>
            </form>
        </div>
    );
}

// ─── Progreso de la descarga ─────────────────────────────────────────────────

export function BannerFormularios({ tarea, onCerrar, onCancelar }) {
    if (!tarea) return null;
    const completado = tarea.status === 'completado';
    const error = tarea.status === 'error';
    const enProceso = tarea.status === 'en_proceso' || tarea.status === 'iniciado';
    const pct = tarea.progreso_pct || (completado ? 100 : enProceso ? 15 : 0);
    const titulo = completado ? 'Actualización completada' : error ? 'La actualización falló' : 'Actualizando formularios desde el Panel…';

    return (
        <aside className="frm-banner" role="status" aria-live="polite">
            <div className="frm-banner__head">
                <span className="frm-banner__title">{titulo}</span>
                <button type="button" className="dv-btn dv-btn--on-dark dv-btn--icon" onClick={onCerrar} aria-label="Cerrar">✕</button>
            </div>
            <div className="frm-banner__body">
                <div className="frm-progress" aria-label={`Progreso ${pct}%`}>
                    <div className={`frm-progress__bar${completado ? ' is-ok' : error ? ' is-error' : ''}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="frm-banner__step">{tarea.paso_desc}</div>
                {tarea.total_cargados > 0 && <div className="frm-banner__count">{fmtN(tarea.total_cargados)} registros cargados</div>}
                {tarea.logs_recientes?.length > 0 && (
                    <div className="frm-banner__log">
                        {tarea.logs_recientes.map((l, i) => <div key={i}>&gt; {l}</div>)}
                    </div>
                )}
                {error && <div className="frm-banner__error">{tarea.error}</div>}
                {enProceso && <button type="button" className="dv-btn" onClick={onCancelar}>Cancelar actualización</button>}
            </div>
        </aside>
    );
}

// ─── Resumen de cambios tras sincronizar ─────────────────────────────────────

const TABS_DIFF = [
    { id: 'nuevos', label: 'Nuevos', key: 'nuevos_count' },
    { id: 'cambiaron_estado', label: 'Cambiaron de estado', key: 'cambiaron_estado_count' },
    { id: 'derivados_nuevos', label: 'Derivados nuevos', key: 'derivados_nuevos_count' },
    { id: 'pegados', label: 'Detenidos más de 10 días', key: 'pegados_count' },
];

export function PanelCambiosFSC({ diff, onCerrar }) {
    const [tabActivo, setTabActivo] = useState('nuevos');
    if (!diff) return null;

    const filas = diff[tabActivo] || [];
    const esCambio = tabActivo === 'cambiaron_estado';

    return (
        <aside className="frm-drawer" role="dialog" aria-label="Resumen de sincronización">
            <header className="frm-drawer__head">
                <div>
                    <h2>Resumen de sincronización</h2>
                    <p>Cambios detectados en esta actualización del Panel</p>
                </div>
                <button type="button" className="dv-btn dv-btn--on-dark dv-btn--icon" onClick={onCerrar} aria-label="Cerrar">✕</button>
            </header>

            <div className="frm-drawer__tiles">
                {TABS_DIFF.map((t) => (
                    <button key={t.id} type="button" className={`frm-tile${tabActivo === t.id ? ' is-active' : ''}`}
                            aria-pressed={tabActivo === t.id} onClick={() => setTabActivo(t.id)}>
                        <div className="frm-tile__value">{fmtN(diff[t.key] || 0)}</div>
                        <div className="frm-tile__label">{t.label}</div>
                    </button>
                ))}
            </div>

            <div className="frm-drawer__body">
                {filas.length === 0 ? (
                    <div className="frm-note">Sin registros en esta categoría para esta sincronización.</div>
                ) : (
                    <div className="frm-table-wrap">
                        <table className="dv-table frm-table">
                            <thead>
                                <tr>
                                    <th>Folio</th>
                                    {esCambio && <th>Estado anterior</th>}
                                    <th>{esCambio ? 'Estado nuevo' : 'Bandeja'}</th>
                                    <th>Unidad requirente</th>
                                    {tabActivo === 'pegados' && <th className="is-center">Días</th>}
                                    <th className="is-num">Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filas.map((f, i) => (
                                    <tr key={i}>
                                        <td className="is-nowrap">
                                            <span className="frm-id">#{f.folio}</span>
                                            {f.anho && <span className="frm-sub">{f.anho}</span>}
                                        </td>
                                        {esCambio && <td><EstadoChip codigo={f.estado_anterior} /></td>}
                                        <td><EstadoChip codigo={f.estado} /></td>
                                        <td><div className="frm-trunc" title={f.unidad_requirente}>{f.unidad_requirente || '—'}</div></td>
                                        {tabActivo === 'pegados' && <td className="is-center"><DiasChip dias={f.dias} /></td>}
                                        <td className="is-num is-strong is-nowrap">{fmtCLP(f.monto_estimado)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <footer className="frm-drawer__foot">
                <button type="button" className="dv-btn dv-btn--primary" onClick={onCerrar}>Cerrar</button>
            </footer>
        </aside>
    );
}
