import { useState } from 'react';
import { confirmarLink, rechazarLink, enlazarManual, corregirPac } from '../../api/fscOcPacApi';
import { fmtCLP, ESTADO_LABEL, ESTADO_CHIP, CONFIANZA_LABEL, CONFIANZA_CHIP, PAC_ESTADO_LABEL, PAC_ESTADO_CHIP } from '../../utils/format';
import Chip from '../Chip';
import DetalleFscModal from '../DetalleFscModal';
import DetalleOcModal from '../DetalleOcModal';

function VerBotones({ fscId, codigoOc, onVerFsc, onVerOc }) {
    return (
        <div style={{ display: 'flex', gap: 4 }}>
            {fscId != null && (
                <button className="dv-btn dv-btn--sm" onClick={() => onVerFsc(fscId)}>👁️ Ver FSC</button>
            )}
            {codigoOc && (
                <button className="dv-btn dv-btn--sm" onClick={() => onVerOc(codigoOc)}>👁️ Ver OC</button>
            )}
        </div>
    );
}

function CandidataRow({ candidata, onConfirmar, onRechazar, onVerOc, busy }) {
    const huerfano = candidata.criterios_match?.huerfano;
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
            borderRadius: 'var(--dv-r-lg)', border: '1px solid var(--dv-line)', marginBottom: 6,
            background: candidata.estado === 'RECHAZADO' ? 'var(--dv-surface-alt)' : 'var(--dv-surface)',
            opacity: candidata.estado === 'RECHAZADO' ? 0.65 : 1,
        }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dv-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {candidata.codigo_oc} {huerfano && <span title="Esta OC ya no existe en el sistema" style={{ color: 'var(--dv-warn)' }}>⚠️ huérfana</span>}
                </div>
                <div className="dv-footnote" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {candidata.nombre_oc || '—'}
                </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--dv-ink-2)', minWidth: 90, textAlign: 'right' }} className="dv-num">
                {candidata.total_bruto != null ? fmtCLP(candidata.total_bruto) : '—'}
            </div>
            <Chip variant={CONFIANZA_CHIP[candidata.confianza]}>
                {CONFIANZA_LABEL[candidata.confianza] || candidata.confianza}
                {candidata.score_similitud != null && ` · ${Math.round(candidata.score_similitud * 100)}%`}
            </Chip>
            {candidata.estado_pac && (
                <Chip variant={PAC_ESTADO_CHIP[candidata.estado_pac]}>{PAC_ESTADO_LABEL[candidata.estado_pac]}</Chip>
            )}
            <button className="dv-btn dv-btn--sm" onClick={() => onVerOc(candidata.codigo_oc)}>👁️ Ver OC</button>
            {candidata.estado === 'SUGERIDO' && (
                <div style={{ display: 'flex', gap: 6 }}>
                    <button className="dv-btn dv-btn--sm" disabled={busy} onClick={() => onConfirmar(candidata.link_id)}>✅ Confirmar</button>
                    <button className="dv-btn dv-btn--sm" disabled={busy} onClick={() => onRechazar(candidata.link_id)}>✕ Rechazar</button>
                </div>
            )}
            {candidata.estado === 'CONFIRMADO' && <Chip variant="ok">Confirmado</Chip>}
            {candidata.estado === 'RECHAZADO' && <Chip variant="none">Rechazado</Chip>}
        </div>
    );
}

function ManualLinkForm({ fscId, onEnlazado }) {
    const [codigoOc, setCodigoOc] = useState('');
    const [obs, setObs] = useState('');
    const [abierto, setAbierto] = useState(false);
    const [busy, setBusy] = useState(false);

    const handleEnlazar = async () => {
        if (!codigoOc.trim()) return;
        setBusy(true);
        try {
            await enlazarManual(fscId, codigoOc.trim(), obs);
            setCodigoOc(''); setObs(''); setAbierto(false);
            onEnlazado();
        } catch (err) {
            alert(err.response?.data?.error || 'Error al enlazar manualmente.');
        } finally {
            setBusy(false);
        }
    };

    if (!abierto) {
        return <button className="dv-btn dv-btn--sm" onClick={() => setAbierto(true)}>🔗 Enlazar a mano otra OC</button>;
    }

    return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
            <input
                placeholder="codigo_oc exacto (ej. 1057727-21-AG25)"
                value={codigoOc}
                onChange={(e) => setCodigoOc(e.target.value)}
                style={{ flex: 1, border: '1px solid var(--dv-line)', borderRadius: 'var(--dv-r-md)', padding: '4px 8px', fontSize: 12, fontFamily: 'var(--dv-font)' }}
            />
            <input
                placeholder="Observación (opcional)"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                style={{ flex: 1, border: '1px solid var(--dv-line)', borderRadius: 'var(--dv-r-md)', padding: '4px 8px', fontSize: 12, fontFamily: 'var(--dv-font)' }}
            />
            <button className="dv-btn dv-btn--primary dv-btn--sm" disabled={busy} onClick={handleEnlazar}>Enlazar</button>
            <button className="dv-btn dv-btn--sm" onClick={() => setAbierto(false)}>Cancelar</button>
        </div>
    );
}

function PacPendienteRow({ item, onVerFsc, onVerOc, onCorregido }) {
    const [busy, setBusy] = useState(false);

    const handleCorregir = async () => {
        setBusy(true);
        try {
            await corregirPac(item.codigo_oc, item.id, '');
            onCorregido();
        } catch (err) {
            alert(err.response?.data?.error || 'Error al corregir el PAC.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="dv-panel" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 10, padding: '12px 18px' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dv-ink)' }}>{item.id_formulario} <span style={{ fontWeight: 400, color: 'var(--dv-ink-3)', fontSize: 12 }}>· {item.unidad_requirente || 'Sin unidad'}</span></div>
                <div className="dv-footnote">
                    PAC del FSC: <span style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--dv-ink-2)' }}>{item.id_plan_fsc || '—'}</span>
                    {item.nombre_pac_fsc && <span> — <strong style={{ color: 'var(--dv-ink)' }}>{item.nombre_pac_fsc}</strong></span>}
                </div>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dv-ink)' }}>{item.codigo_oc}</div>
                <div className="dv-footnote" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.nombre_oc}</div>
                <div className="dv-footnote">PAC de la OC: <span style={{ fontFamily: 'ui-monospace, monospace' }}>{item.id_proyecto_oc || '—'}</span> ({item.enlace_pac_oc || 'No Enlazada'})</div>
            </div>
            <Chip variant={PAC_ESTADO_CHIP[item.estado_pac]}>{PAC_ESTADO_LABEL[item.estado_pac]}</Chip>
            <VerBotones fscId={item.id} codigoOc={item.codigo_oc} onVerFsc={onVerFsc} onVerOc={onVerOc} />
            <button className="dv-btn dv-btn--primary dv-btn--sm" disabled={busy} onClick={handleCorregir}>
                {busy ? '⏳' : '🔗 Enlazar OC al PAC del FSC'}
            </button>
        </div>
    );
}

export default function RevisionTab({ pendientes, onCambio }) {
    const [busyId, setBusyId] = useState(null);
    const [verFscId, setVerFscId] = useState(null);
    const [verOc, setVerOc] = useState(null);

    if (!pendientes) return null;

    const enlacePendiente = pendientes.enlace_pendiente ?? [];
    const pacPendiente = pendientes.pac_pendiente ?? [];

    const handleConfirmar = async (linkId) => {
        setBusyId(linkId);
        try {
            await confirmarLink(linkId);
            await onCambio();
        } catch (err) {
            alert(err.response?.data?.error || 'Error al confirmar.');
        } finally {
            setBusyId(null);
        }
    };

    const handleRechazar = async (linkId) => {
        const motivo = prompt('Motivo de rechazo (opcional):') || '';
        setBusyId(linkId);
        try {
            await rechazarLink(linkId, motivo);
            await onCambio();
        } catch (err) {
            alert(err.response?.data?.error || 'Error al rechazar.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {pacPendiente.length > 0 && (
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dv-ink)', marginBottom: 10 }}>
                        🎯 PAC por corregir ({pacPendiente.length}) — FSC ya con OC confirmada, pero la OC no tiene el PAC correcto
                    </div>
                    {pacPendiente.map((item) => (
                        <PacPendienteRow key={item.link_id} item={item} onVerFsc={setVerFscId} onVerOc={setVerOc} onCorregido={onCambio} />
                    ))}
                </div>
            )}

            <div>
                {pacPendiente.length > 0 && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dv-ink)', marginBottom: 10 }}>
                        📝 Enlace FSC-OC por resolver ({enlacePendiente.length})
                    </div>
                )}
                {enlacePendiente.length === 0 && pacPendiente.length === 0 && (
                    <div className="dv-callout" style={{ textAlign: 'center' }}>✅ No hay nada pendiente de revisión — todo enlazado y con PAC correcto.</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {enlacePendiente.map((fsc) => (
                        <div key={fsc.id} className="dv-panel" style={{ padding: '14px 18px', marginBottom: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dv-ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {fsc.id_formulario} <span style={{ fontWeight: 400, color: 'var(--dv-ink-3)', fontSize: 12 }}>· {fsc.unidad_requirente || 'Sin unidad'}</span>
                                        <VerBotones fscId={fsc.id} onVerFsc={setVerFscId} onVerOc={() => {}} />
                                    </div>
                                    <div className="dv-footnote">
                                        Comprador: {fsc.comprador || '—'} · Monto est.: {fsc.monto_estimado != null ? fmtCLP(fsc.monto_estimado) : '—'} · {fsc.departamento || 'Sin Clasificar'}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {fsc.n_confirmadas > 0 && (
                                        <Chip variant="ok">{fsc.n_confirmadas === 1 ? '1 OC confirmada' : `${fsc.n_confirmadas} OC confirmadas`}</Chip>
                                    )}
                                    <Chip variant={ESTADO_CHIP[fsc.estado_enlace]}>{ESTADO_LABEL[fsc.estado_enlace] || fsc.estado_enlace}</Chip>
                                </div>
                            </div>

                            {fsc.n_confirmadas > 0 && (
                                <div className="dv-footnote" style={{ marginBottom: 8 }}>
                                    Este FSC ya tiene {fsc.n_confirmadas} OC confirmada{fsc.n_confirmadas > 1 ? 's' : ''} — un FSC puede derivar en varios procesos de compra, así que las candidatas de abajo son ADICIONALES por revisar, no reemplazan a las ya confirmadas.
                                </div>
                            )}
                            {fsc.candidatas.length === 0 && (
                                <div className="dv-footnote" style={{ marginBottom: 6 }}>Sin ninguna OC candidata detectada automáticamente.</div>
                            )}
                            {fsc.candidatas.map((c) => (
                                <CandidataRow
                                    key={c.link_id} candidata={c}
                                    onConfirmar={handleConfirmar} onRechazar={handleRechazar} onVerOc={setVerOc}
                                    busy={busyId === c.link_id}
                                />
                            ))}

                            <ManualLinkForm fscId={fsc.id} onEnlazado={onCambio} />
                        </div>
                    ))}
                </div>
            </div>

            <DetalleFscModal fscId={verFscId} onCerrar={() => setVerFscId(null)} onVerOc={setVerOc} />
            <DetalleOcModal codigoOc={verOc} onCerrar={() => setVerOc(null)} onVerFsc={setVerFscId} onCorregido={onCambio} />
        </div>
    );
}
