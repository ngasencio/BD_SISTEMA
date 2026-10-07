import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    enviarNotif, enviarPruebaNotif, getNotifLote, getNotifLotePdf, guardarReglaCopia, previsualizarNotif,
} from '../../api/gestorComprasApi';
import { fmtCLP, fmtN } from '../solicitudes/shared';
import EditorCopias from './EditorCopias';
import { agregarPuntual, ajustesParaEnviar, quitarPuntual, restaurarPuntual } from './ajustesCopia';

const SONDEO_MS = 2000;
const ESTADO_ENVIO = {
    PENDIENTE: { label: 'En cola', color: '#64748b', bg: '#f1f5f9' },
    ENVIADO: { label: 'Enviado', color: '#15803d', bg: '#dcfce7' },
    ERROR: { label: 'Error', color: '#b91c1c', bg: '#fee2e2' },
};

function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function Chip({ estado }) {
    const e = ESTADO_ENVIO[estado] || ESTADO_ENVIO.PENDIENTE;
    return <span className="gc-notif-chip" style={{ background: e.bg, color: e.color }}>{e.label}</span>;
}

// Revisión previa, envío y seguimiento de un lote. Tres fases:
//   revision  → lo que se enviaría (Para/CC por responsable) + el correo tal como lo verá el destinatario
//   enviando  → el servidor envía en segundo plano; se consulta el avance cada 2 s
//   listo     → resultado por responsable y descarga del PDF de cierre
export default function ModalEnvio({ seleccion, params, onCerrar, onTerminado }) {
    const [fase, setFase] = useState('revision');
    const [prev, setPrev] = useState(null);
    const [ejemplo, setEjemplo] = useState(null);
    const [error, setError] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [confirmaReenvio, setConfirmaReenvio] = useState(false);
    const [confirmaReal, setConfirmaReal] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [lote, setLote] = useState(null);
    const [bajandoPdf, setBajandoPdf] = useState(false);
    const [ajustes, setAjustes] = useState({});     // copias cambiadas SOLO para este envío (ver ajustesCopia.js)
    const [recarga, setRecarga] = useState(0);      // fuerza una nueva vista previa tras guardar una regla
    const [guardandoRegla, setGuardandoRegla] = useState(false);
    const [probando, setProbando] = useState(false);
    const [aviso, setAviso] = useState(null);
    const terminadoAvisado = useRef(false);

    // Vista previa: al abrir, al elegir otro responsable de ejemplo y al cambiar las copias.
    useEffect(() => {
        let activo = true;
        setCargando(true);
        previsualizarNotif({ seleccion, ejemplo, ajustes_cc: ajustesParaEnviar(ajustes) }, params)
            .then(({ data }) => { if (activo) { setPrev(data); setError(null); } })
            .catch((err) => { if (activo) setError(err.response?.data?.detail || 'No fue posible preparar la vista previa.'); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [seleccion, params, ejemplo, ajustes, recarga]);

    // Seguimiento del lote mientras se envía.
    useEffect(() => {
        if (fase !== 'enviando' || !lote?.id) return undefined;
        let activo = true;
        const id = setInterval(() => {
            getNotifLote(lote.id)
                .then(({ data }) => {
                    if (!activo) return;
                    setLote(data);
                    if (data.estado !== 'ENVIANDO') {
                        setFase('listo');
                        if (!terminadoAvisado.current) { terminadoAvisado.current = true; onTerminado(); }
                    }
                })
                .catch(() => { /* un sondeo fallido se reintenta en el siguiente ciclo */ });
        }, SONDEO_MS);
        return () => { activo = false; clearInterval(id); };
    }, [fase, lote?.id, onTerminado]);

    const puedeCerrar = fase !== 'enviando';
    const cerrar = useCallback(() => { if (puedeCerrar) onCerrar(); }, [puedeCerrar, onCerrar]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') cerrar(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [cerrar]);

    const enviables = prev?.enviables || [];
    const necesitaReenvio = prev?.requiere_confirmar_reenvio;
    const bloqueado = !prev || enviables.length === 0 || prev.excede_tope
        || (necesitaReenvio && !confirmaReenvio) || (!prev.modo_prueba && !confirmaReal);

    const enviar = async () => {
        setEnviando(true);
        setError(null);
        try {
            const { data } = await enviarNotif({
                seleccion, confirmar_reenvio: Boolean(necesitaReenvio && confirmaReenvio),
                // En modo oficial el servidor exige esta confirmación (la casilla de abajo); sin ella responde 409.
                confirmar_envio_real: Boolean(!prev?.modo_prueba && confirmaReal),
                ajustes_cc: ajustesParaEnviar(ajustes),
            }, params);
            setLote({ id: data.lote_id, estado: 'ENVIANDO', total: enviables.length, procesados: 0, enviados: 0, fallidos: 0, envios: [] });
            setFase('enviando');
        } catch (err) {
            const d = err.response?.data;
            const mensajes = {
                reenvio: 'Hay planes que ya fueron notificados: marque la confirmación de reenvío.',
                confirmar_real: 'Marque la casilla que confirma el envío de correos reales.',
            };
            setError(mensajes[d?.code] || d?.detail || 'No se pudo iniciar el envío.');
        } finally {
            setEnviando(false);
        }
    };

    // ── Copias: cada cambio es "solo este envío" (se guarda en `ajustes`) o "siempre en el departamento"
    // (regla permanente en el servidor; luego se recalcula la vista previa). ──
    const reglaPermanente = async (accion, fila, item) => {
        setGuardandoRegla(true);
        setError(null);
        try {
            await guardarReglaCopia(
                { accion, departamento_id: fila.depto_ref_id, correo: item.correo, nombre: item.nombre }, params);
            setRecarga((n) => n + 1);
        } catch (err) {
            setError(err.response?.data?.detail || 'No se pudo guardar la regla de copia.');
        } finally {
            setGuardandoRegla(false);
        }
    };
    // Quitar "siempre" a una copia que venía de una regla "agregar" = borrar esa regla; a una jefatura
    // automática = regla "excluir".
    const quitarCopia = (fila, item, permanente) => (permanente
        ? reglaPermanente(item.origen === 'REGLA' ? 'olvidar' : 'excluir', fila, item)
        : setAjustes((a) => quitarPuntual(a, fila.nombre_responsable, item.correo)));
    const agregarCopia = (fila, correo, permanente) => (permanente
        ? reglaPermanente('agregar', fila, { correo, nombre: '' })
        : setAjustes((a) => agregarPuntual(a, fila.nombre_responsable, correo)));
    const restaurarCopia = (fila, item) => (item.motivo === 'REGLA'
        ? reglaPermanente('olvidar', fila, item)
        : setAjustes((a) => restaurarPuntual(a, fila.nombre_responsable, item.correo)));

    // Correo de muestra SOLO a la cuenta de prueba (aunque el sistema esté en modo oficial).
    const enviarPrueba = async () => {
        setProbando(true);
        setError(null);
        setAviso(null);
        try {
            const { data } = await enviarPruebaNotif(
                { seleccion, ejemplo: ejemplo || prev?.ejemplo, ajustes_cc: ajustesParaEnviar(ajustes) }, params);
            setAviso(`🧪 Prueba enviada a ${data.enviado_a.join(', ')} (correo de ${data.responsable}). Revise su bandeja, incluido Outlook web.`);
        } catch (err) {
            setError(err.response?.data?.detail || 'No se pudo enviar la prueba.');
        } finally {
            setProbando(false);
        }
    };

    const bajarPdf = async () => {
        setBajandoPdf(true);
        try {
            const { data } = await getNotifLotePdf(lote.id);
            descargarBlob(data, `notificaciones_plan_compras_lote_${lote.id}.pdf`);
        } catch {
            setError('No fue posible descargar el PDF.');
        } finally {
            setBajandoPdf(false);
        }
    };

    const pct = lote?.total ? Math.round((lote.procesados / lote.total) * 100) : 0;

    return (
        <div className="gc-ficha-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
            <div className="gc-notif-modal gc-notif-modal-ancho" role="dialog" aria-modal="true" aria-label="Enviar notificaciones">
                <div className="gc-notif-modal-head">
                    <div>
                        <div className="gc-notif-modal-title">
                            {fase === 'revision' && '📧 Revisar antes de enviar'}
                            {fase === 'enviando' && '📨 Enviando correos…'}
                            {fase === 'listo' && '✅ Envío finalizado'}
                        </div>
                        <div className="gc-notif-modal-sub">
                            Aviso a los responsables del PAC para que generen su Formulario de Solicitud de Compra en el Panel Documental.
                        </div>
                    </div>
                    {puedeCerrar && <button className="gc-notif-x" onClick={cerrar} aria-label="Cerrar">✕</button>}
                </div>

                <div className="gc-notif-modal-body">
                    {error && <div className="error-message" style={{ marginBottom: 10 }}>{error}</div>}
                    {aviso && <div className="gc-notif-aviso gc-notif-aviso-ok">{aviso}</div>}

                    {fase === 'revision' && (
                        <>
                            {cargando && !prev && <div className="loading-spinner">Preparando los correos…</div>}
                            {prev && (
                                <>
                                    {prev.modo_prueba ? (
                                        <div className="gc-notif-aviso gc-notif-aviso-prueba">
                                            🧪 <strong>MODO PRUEBA</strong> — ningún correo llegará a los responsables: todos van solo a{' '}
                                            <strong>{prev.destino_prueba}</strong>. La columna «Habría ido a» muestra el destinatario real.
                                        </div>
                                    ) : (
                                        <div className="gc-notif-aviso gc-notif-aviso-real">
                                            🚨 <strong>ENVÍO REAL</strong> — los correos llegarán a los responsables y a las copias indicadas. No se puede deshacer.
                                        </div>
                                    )}

                                    <div className="gc-notif-resumen">
                                        <div><strong>{fmtN(enviables.length)}</strong><span>correos a enviar</span></div>
                                        <div><strong>{fmtN(prev.planes_enviables)}</strong><span>planes incluidos</span></div>
                                        <div><strong>{fmtN(prev.omitidos.length)}</strong><span>responsables omitidos</span></div>
                                        <div>
                                            <strong>{prev.copias_activas ? 'Sí' : 'No'}</strong>
                                            <span>copias a jefaturas del departamento</span>
                                        </div>
                                    </div>

                                    {prev.excede_tope && (
                                        <div className="error-message">
                                            La selección tiene {enviables.length} responsables y el máximo por envío es {prev.max_lote}. Acote la selección (mes, estado o departamento).
                                        </div>
                                    )}

                                    {prev.omitidos.length > 0 && (
                                        <details className="gc-notif-omitidos">
                                            <summary>⚠️ {prev.omitidos.length} responsable(s) no recibirán el aviso (falta confirmar su correo)</summary>
                                            <ul>
                                                {prev.omitidos.map((o) => (
                                                    <li key={o.nombre_responsable}><strong>{o.nombre_responsable}</strong> — {o.planes} plan(es). {o.motivo}</li>
                                                ))}
                                            </ul>
                                        </details>
                                    )}

                                    <div className="gc-notif-tabla-wrap">
                                        <table className="gc-notif-tabla">
                                            <thead>
                                                <tr>
                                                    <th>Responsable</th><th>Departamento</th><th style={{ textAlign: 'right' }}>Planes</th>
                                                    <th style={{ textAlign: 'right' }}>Monto</th>
                                                    {prev.modo_prueba && <th>Habría ido a</th>}
                                                    <th>Sale a</th>
                                                    <th style={{ minWidth: 300 }} title="Jefaturas del departamento según su cargo, más lo que usted agregue o quite">Con copia a (editable)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {enviables.map((e) => (
                                                    <tr key={e.nombre_responsable} className={ejemplo === e.nombre_responsable || (!ejemplo && prev.ejemplo === e.nombre_responsable) ? 'gc-notif-fila-activa' : ''}>
                                                        <td>
                                                            <strong>{e.nombre_responsable}</strong>
                                                            <div className="gc-notif-sub">{e.cargo_responsable}</div>
                                                            <button className="gc-notif-link" onClick={() => setEjemplo(e.nombre_responsable)}>👁 Ver su correo</button>
                                                        </td>
                                                        <td>{e.departamento || '—'}</td>
                                                        <td style={{ textAlign: 'right' }}>{e.planes}{e.reenvio_ids.length > 0 && <span title={`${e.reenvio_ids.length} ya notificado(s)`}> 🔁</span>}</td>
                                                        <td style={{ textAlign: 'right' }}>{fmtCLP(e.monto_total)}</td>
                                                        {prev.modo_prueba && <td>{e.reales_para.join(', ') || '—'}</td>}
                                                        <td>{e.para.join(', ')}</td>
                                                        <td>
                                                            <EditorCopias
                                                                fila={e} copiasActivas={prev.copias_activas} ocupado={guardandoRegla}
                                                                onQuitar={(item, permanente) => quitarCopia(e, item, permanente)}
                                                                onAgregar={(correo, permanente) => agregarCopia(e, correo, permanente)}
                                                                onRestaurar={(item) => restaurarCopia(e, item)}
                                                            />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {prev.resumen_para.length > 0 && (
                                        <div className="gc-notif-sub" style={{ marginTop: 8 }}>
                                            Al terminar se enviará un correo resumen con el PDF de los notificados a:{' '}
                                            <strong>{prev.resumen_para.join(', ')}</strong>
                                            {prev.resumen_cc.length > 0 && <>, con copia a: <strong>{prev.resumen_cc.join(', ')}</strong></>}.
                                        </div>
                                    )}

                                    {prev.html_ejemplo && (
                                        <div className="gc-notif-preview">
                                            <div className="gc-notif-preview-head">
                                                Así lo recibirá <strong>{prev.ejemplo}</strong>
                                                {cargando && <span className="gc-notif-sub"> · actualizando…</span>}
                                            </div>
                                            {/* sandbox sin permisos: el HTML del correo no puede ejecutar nada en la página */}
                                            <iframe title="Vista previa del correo" sandbox="" srcDoc={prev.html_ejemplo} className="gc-notif-iframe" />
                                        </div>
                                    )}

                                    {necesitaReenvio && (
                                        <label className="gc-notif-check gc-notif-check-warn">
                                            <input type="checkbox" checked={confirmaReenvio} onChange={(e) => setConfirmaReenvio(e.target.checked)} />
                                            🔁 {prev.reenvios.length} plan(es) ya fueron notificados antes. Confirmo que quiero volver a avisar.
                                        </label>
                                    )}
                                    {!prev.modo_prueba && (
                                        <label className="gc-notif-check gc-notif-check-warn">
                                            <input type="checkbox" checked={confirmaReal} onChange={(e) => setConfirmaReal(e.target.checked)} />
                                            Entiendo que se enviarán {enviables.length} correo(s) REALES a funcionarios.
                                        </label>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {(fase === 'enviando' || fase === 'listo') && lote && (
                        <>
                            <div className="gc-notif-progreso">
                                <div className="gc-notif-progreso-barra"><div style={{ width: `${pct}%` }} /></div>
                                <div className="gc-notif-progreso-txt">
                                    {lote.procesados} de {lote.total} procesados · <span style={{ color: '#15803d' }}>{lote.enviados} enviados</span>
                                    {lote.fallidos > 0 && <> · <span style={{ color: '#b91c1c' }}>{lote.fallidos} con error</span></>}
                                    {fase === 'enviando' && ' — por favor no cierre esta ventana'}
                                </div>
                            </div>
                            {fase === 'listo' && lote.modo_prueba && (
                                <div className="gc-notif-aviso gc-notif-aviso-prueba">
                                    🧪 Envío de prueba: revise su bandeja. También recibirá el correo resumen con el PDF.
                                </div>
                            )}
                            <div style={{ overflowX: 'auto' }}>
                                <table className="gc-notif-tabla">
                                    <thead><tr><th>Responsable</th><th>Enviado a</th><th style={{ textAlign: 'right' }}>Planes</th><th>Estado</th></tr></thead>
                                    <tbody>
                                        {lote.envios.map((e) => (
                                            <tr key={e.id}>
                                                <td>{e.nombre_responsable}</td>
                                                <td>{e.enviado_a}{e.cc && <div className="gc-notif-sub">CC: {e.cc}</div>}</td>
                                                <td style={{ textAlign: 'right' }}>{e.n_planes}</td>
                                                <td><Chip estado={e.estado} />{e.error && <div className="gc-notif-error">{e.error}</div>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>

                <div className="gc-notif-modal-foot">
                    {fase === 'revision' && (
                        <>
                            <button className="gc-notif-btn gc-notif-btn-sec" onClick={cerrar}>Cancelar</button>
                            {prev && !prev.modo_prueba && (
                                <button
                                    className="gc-notif-btn gc-notif-btn-sec" onClick={enviarPrueba}
                                    disabled={probando || cargando || enviables.length === 0}
                                    title="Envía UN correo de muestra (el de arriba) solo a la cuenta de prueba, no a los responsables"
                                >
                                    {probando ? 'Enviando prueba…' : '🧪 Enviarme una prueba'}
                                </button>
                            )}
                            <button className="gc-notif-btn gc-notif-btn-primary" disabled={bloqueado || enviando || guardandoRegla} onClick={enviar}>
                                {enviando ? 'Iniciando…' : `📧 Enviar ${enviables.length} correo${enviables.length !== 1 ? 's' : ''}${prev?.modo_prueba ? ' (prueba)' : ''}`}
                            </button>
                        </>
                    )}
                    {fase === 'listo' && (
                        <>
                            <button className="gc-notif-btn gc-notif-btn-sec" onClick={bajarPdf} disabled={bajandoPdf}>
                                {bajandoPdf ? 'Generando…' : '📄 Descargar PDF de notificados'}
                            </button>
                            <button className="gc-notif-btn gc-notif-btn-primary" onClick={onCerrar}>Cerrar</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
