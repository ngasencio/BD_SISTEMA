// Resumen de cambios detectados tras sincronizar las fichas PAC con el Panel.
import { useState } from 'react';
import '../formularios/formularios.css';
import './formularios-pac.css';
import { fmtCLP, fmtN } from '../formularios/shared';
import { DiasChip } from '../formularios/ui';
import { AccionPacChip, EstadoPacChip } from './uiPac';

const TABS = [
    { id: 'nuevas', label: 'Nuevas', key: 'nuevas_count' },
    { id: 'cambiaron_estado', label: 'Cambiaron de bandeja', key: 'cambiaron_estado_count' },
    { id: 'aprobadas', label: 'Aprobadas', key: 'aprobadas_count' },
    { id: 'rechazadas', label: 'Rechazadas', key: 'rechazadas_count' },
    { id: 'eliminadas', label: 'Eliminadas del Panel', key: 'eliminadas_count' },
    { id: 'detenidas', label: 'En trámite hace más de 10 días', key: 'detenidas_count' },
];

export default function PanelCambiosPac({ diff, onCerrar }) {
    const [tabActivo, setTabActivo] = useState('nuevas');
    if (!diff) return null;

    const filas = diff[tabActivo] || [];
    const total = diff[`${tabActivo}_count`] || 0;
    const esCambio = tabActivo === 'cambiaron_estado';

    return (
        <aside className="frm-drawer" role="dialog" aria-label="Resumen de sincronización PAC">
            <header className="frm-drawer__head">
                <div>
                    <h2>Resumen de sincronización</h2>
                    <p>Cambios en las fichas PAC detectados en esta actualización del Panel</p>
                </div>
                <button type="button" className="dv-btn dv-btn--on-dark dv-btn--icon" onClick={onCerrar} aria-label="Cerrar">✕</button>
            </header>

            <div className="frm-drawer__tiles">
                {TABS.map((t) => (
                    <button key={t.id} type="button" className={`frm-tile${tabActivo === t.id ? ' is-active' : ''}`}
                            aria-pressed={tabActivo === t.id} onClick={() => setTabActivo(t.id)}>
                        <div className="frm-tile__value">{fmtN(diff[t.key] || 0)}</div>
                        <div className="frm-tile__label">{t.label}</div>
                    </button>
                ))}
            </div>

            <div className="frm-drawer__body">
                {filas.length === 0 ? (
                    <div className="frm-note">Sin fichas en esta categoría para esta sincronización.</div>
                ) : (
                    <>
                        {total > filas.length && (
                            <p className="dv-footnote" style={{ marginBottom: 'var(--dv-sp-3)' }}>Se muestran las primeras {fmtN(filas.length)} de {fmtN(total)}.</p>
                        )}
                        <div className="frm-table-wrap">
                            <table className="dv-table frm-table">
                                <thead>
                                    <tr>
                                        <th>Ficha</th>
                                        {esCambio && <th>Antes</th>}
                                        <th>Bandeja</th>
                                        <th>Acción</th>
                                        <th>Departamento</th>
                                        {tabActivo === 'detenidas' && <th className="is-center">Días</th>}
                                        <th className="is-num">Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filas.map((f) => (
                                        <tr key={`${f.folio}-${f.anho}`}>
                                            <td className="is-nowrap"><span className="frm-id">{f.id_ficha}</span></td>
                                            {esCambio && <td><EstadoPacChip codigo={f.estado_anterior} /></td>}
                                            <td><EstadoPacChip codigo={f.estado} /></td>
                                            <td><AccionPacChip accion={f.accion_proyecto} /></td>
                                            <td><div className="frm-trunc" title={f.departamento}>{f.departamento || '—'}</div></td>
                                            {tabActivo === 'detenidas' && <td className="is-center"><DiasChip dias={f.dias} /></td>}
                                            <td className="is-num is-strong is-nowrap">{f.monto != null ? fmtCLP(f.monto) : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            <footer className="frm-drawer__foot">
                <button type="button" className="dv-btn dv-btn--primary" onClick={onCerrar}>Cerrar</button>
            </footer>
        </aside>
    );
}
