import React, { useEffect, useState } from 'react';
import {
    crearProceso, actualizarProceso, cambiarEstadoProceso, agregarOcAProceso,
    getHistorialProceso, getProcesos, buscarLicitacion, buscarCompraAgil, buscarOc,
    desvincularProcesoMp, quitarOcDeProceso,
    importarLicitacion, importarCompraAgil, importarOc,
} from '../api/comprasApi';
import { TIPOS_PROCESO, ESTADOS_POR_TIPO_PROCESO, estadoLabel, tipoLabel, ESTADO_COLOR } from '../constants/estadosProceso';
import ModalDetalleFsc from './ModalDetalleFsc';
import VerProcesoModal from './VerProcesoModal';

const fmtCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtFecha = (iso) => iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// Tipos con catálogo propio en Mercado Público (número/código buscable).
// Convenio Marco / Trato Directo / OC Directa no tienen un "proceso" separado
// del lado de MP — se materializan directo como Orden de Compra.
const TIPOS_CON_CATALOGO_MP = ['LICITACION', 'COMPRA_AGIL'];

function EstadoProcesoBadge({ codigo }) {
    const color = ESTADO_COLOR(codigo);
    return (
        <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 20,
            fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
            background: color + '1f', color, border: `1px solid ${color}55`,
        }}>
            {estadoLabel(codigo)}
        </span>
    );
}

// Badge para el estado REAL que trae Mercado Público (Licitacion.Estado /
// CompraAgilResumen.EstadoGlosa / OrdenCompra.EstadoOC) — heurística de color
// por palabra clave, ya que cada fuente usa su propio vocabulario de estados.
function EstadoMpBadge({ estado }) {
    if (!estado) return <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>;
    const s = estado.toLowerCase();
    let color = '#64748b';
    if (/adjudicad|aceptad|conforme|recepcion|seleccionado|finaliz/.test(s)) color = '#16a34a';
    else if (/rechazad|desiert|cancelad|revocad/.test(s)) color = '#dc2626';
    else if (/public|revision|evaluacion|tramit|enviad|proceso/.test(s)) color = '#2563eb';
    return (
        <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 20,
            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
            background: color + '15', color, border: `1px solid ${color}40`,
        }}>
            {estado}
        </span>
    );
}

function PacBadge({ idProyecto, enlacePac }) {
    const ok = enlacePac === 'Enlazada';
    return (
        <span
            title={idProyecto ? `Código PAC: ${idProyecto}` : 'Sin código PAC asociado'}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 20,
                fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                background: ok ? '#f0fdf4' : '#fef2f2', color: ok ? '#16a34a' : '#dc2626',
                border: `1px solid ${ok ? 'rgba(22,163,74,.3)' : 'rgba(220,38,38,.3)'}`,
            }}
        >
            {ok ? '✓ PAC' : '✕ PAC'} {idProyecto ? `· ${idProyecto}` : ''}
        </span>
    );
}

function SeccionBloque({ icon, titulo, subtitulo, children, acento }) {
    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 16, overflow: 'hidden', ...(acento ? { borderColor: acento + '55' } : {}) }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                background: acento ? acento + '0d' : '#f8fafc', borderBottom: '1px solid #e2e8f0',
            }}>
                <span style={{ fontSize: 15 }}>{icon}</span>
                <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: acento || '#334155', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{titulo}</div>
                    {subtitulo && <div style={{ fontSize: 11, color: '#94a3b8' }}>{subtitulo}</div>}
                </div>
            </div>
            <div style={{ padding: 14 }}>{children}</div>
        </div>
    );
}

const TIPO_MP_LABEL = { LICITACION: 'Licitación', COMPRA_AGIL: 'Compra Ágil', OC: 'Orden de Compra' };

// Mini terminal de log — mismo estilo visual (fondo oscuro, texto verde
// monoespaciado) que el patrón de banners ETL del resto del sistema
// (ver BannerFormularios en FormulariosPage.jsx), acá aplicado a la
// búsqueda/importación puntual de un código en vez de un ETL de rango.
function MiniTerminal({ lineas }) {
    if (!lineas || lineas.length === 0) return null;
    return (
        <div style={{
            background: '#111827', borderRadius: 6, padding: '7px 9px', marginTop: 6,
            maxHeight: 130, overflowY: 'auto', fontSize: 10.5, lineHeight: 1.6, fontFamily: 'monospace',
        }}>
            {lineas.map((l, i) => (
                <div key={i} style={{ color: l.tipo === 'error' ? '#f87171' : l.tipo === 'ok' ? '#4ade80' : '#9ca3af' }}>
                    &gt; {l.texto}
                </div>
            ))}
        </div>
    );
}

// Buscador inline contra lo ya sincronizado localmente (Licitación / Compra
// Ágil / OC). Si no hay resultados para una búsqueda con contenido, ofrece
// traer el código exacto EN VIVO desde Mercado Público y guardarlo en la
// base de datos general del sistema (Fase 3) — desde ahí queda disponible
// para todo el sistema, no solo para este panel. Una mini terminal muestra
// en qué etapa va la búsqueda/importación y cualquier error tal cual llega
// del servidor (no encontrado vs. error real del backend).
function BuscadorMP({ tipo, placeholder, onSeleccionar }) {
    const [q, setQ] = useState('');
    const [resultados, setResultados] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const [buscado, setBuscado] = useState(false);
    const [importando, setImportando] = useState(false);
    const [logs, setLogs] = useState([]);

    const log = (texto, tipoLog = 'info') => setLogs(prev => [...prev, { texto, tipo: tipoLog }]);

    useEffect(() => {
        if (q.trim().length < 2) { setResultados([]); setBuscado(false); setLogs([]); return undefined; }
        let activo = true;
        setBuscando(true);
        setLogs([{ texto: `Buscando "${q.trim()}" en la base de datos local (${TIPO_MP_LABEL[tipo]})…`, tipo: 'info' }]);
        const fn = tipo === 'LICITACION' ? buscarLicitacion : tipo === 'COMPRA_AGIL' ? buscarCompraAgil : buscarOc;
        const t = setTimeout(() => {
            fn(q.trim())
                .then(({ data }) => {
                    if (!activo) return;
                    setResultados(data);
                    setBuscado(true);
                    if (data.length > 0) log(`${data.length} resultado(s) encontrado(s) localmente.`, 'ok');
                    else log('Sin resultados locales.', 'info');
                })
                .catch(() => { if (activo) log('Error al consultar la base de datos local.', 'error'); })
                .finally(() => { if (activo) setBuscando(false); });
        }, 350);
        return () => { activo = false; clearTimeout(t); };
    }, [q, tipo]);

    const handleBuscarEnVivo = async () => {
        setImportando(true);
        log(`Consultando la API de Mercado Público (${TIPO_MP_LABEL[tipo]})…`);
        if (tipo === 'COMPRA_AGIL') log('La API de Compra Ágil suele tardar ~25s en responder — espera hasta 30s.');
        try {
            const fnImportar = tipo === 'LICITACION' ? importarLicitacion : tipo === 'COMPRA_AGIL' ? importarCompraAgil : importarOc;
            const { data } = await fnImportar(q.trim());
            const seg = data._diagnostico?.segundos;
            log(`Encontrado: "${data.Nombre || data.nombre || data.NombreOC || q.trim()}"${seg ? ` (${seg}s)` : ''}.`, 'ok');
            log(data._creada ? 'Guardado en la base de datos.' : 'Ya estaba sincronizado (se re-verificó al vuelo).', 'ok');
            onSeleccionar(data);
            setQ(''); setResultados([]); setBuscado(false);
        } catch (err) {
            const status = err.response?.status;
            const diag = err.response?.data?.diagnostico;
            const seg = diag?.segundos ? ` (tras ${diag.segundos}s)` : '';
            if (status === 404) {
                log(`${err.response?.data?.error || 'Mercado Público no tiene ese código.'}${seg}`, 'error');
            } else if (status >= 500) {
                log(`Error del servidor (${status})${seg} al importar — revisa con soporte si se repite.`, 'error');
            } else if (err.request && !err.response) {
                log('Sin respuesta del servidor — revisa la conexión.', 'error');
            } else {
                log(`${err.response?.data?.error || `Error inesperado (${status || 's/n'}).`}${seg}`, 'error');
            }
        } finally {
            setImportando(false);
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            <input
                type="text" value={q} onChange={e => setQ(e.target.value)}
                placeholder={placeholder}
                style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, width: '100%', fontSize: 13 }}
            />
            {buscando && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Buscando…</div>}
            {!buscando && buscado && resultados.length === 0 && (
                <div style={{
                    display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, fontSize: 11.5,
                    color: '#b45309', background: '#fffbeb', border: '1px dashed #fcd34d', borderRadius: 6, padding: '8px 10px',
                }}>
                    <div><strong>⏳ Async</strong> — no está sincronizado localmente todavía.</div>
                    <button
                        type="button" onClick={handleBuscarEnVivo} disabled={importando}
                        style={{
                            alignSelf: 'flex-start', padding: '5px 12px', fontSize: 11.5, fontWeight: 600,
                            borderRadius: 6, border: '1px solid #f59e0b', background: importando ? '#fef3c7' : '#fff',
                            color: '#b45309', cursor: importando ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {importando ? 'Buscando en Mercado Público…' : `🔎 Buscar "${q.trim()}" en Mercado Público (en vivo)`}
                    </button>
                </div>
            )}
            <MiniTerminal lineas={logs} />
            {resultados.length > 0 && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 6, maxHeight: 220, overflowY: 'auto', background: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,.08)' }}>
                    {resultados.map(r => {
                        const codigo = r.codigo_licitacion || r.codigocompraagil || r.codigo_oc;
                        const nombre = r.Nombre || r.nombre || r.NombreOC;
                        const estado = r.Estado || r.estadoglosa || r.EstadoOC;
                        return (
                            <div
                                key={codigo}
                                onClick={() => { onSeleccionar(r); setQ(''); setResultados([]); setBuscado(false); }}
                                style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 12 }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                            >
                                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e293b' }}>{codigo}</div>
                                <div style={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre || '—'}</div>
                                <div style={{ color: '#94a3b8' }}>{estado || ''}</div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// Panel único por FSC — estructura fija en dos bloques, igual siempre (sin
// distinguir "clasificado"/"sin clasificar"):
//   Bloque 1 · Enlace Mercado Público → Procesos de Compra (Licitación/Compra
//     Ágil/Convenio Marco/Trato Directo/OC Directa, uno o varios) + Órdenes
//     de Compra emitidas (con link a MP y estado de enlace PAC).
//   Bloque 2 · Historial de Compra (estado real en Mercado Público, solo
//     lectura) + Historial Comprador (banner para registrar avances de
//     estado + observaciones, visible para jefatura).
export default function FscProcesoPanel({ fsc, onCerrar, onCambiado }) {
    const [cargando, setCargando] = useState(true);
    const [procesos, setProcesos] = useState([]);
    const [procesoActivoIdx, setProcesoActivoIdx] = useState(0);
    const [mostrarAgregarProceso, setMostrarAgregarProceso] = useState(false);
    const [error, setError] = useState(null);
    const [fscVerId, setFscVerId] = useState(null);
    const [procesoVerMp, setProcesoVerMp] = useState(null);

    // Alta de proceso nuevo
    const [tipoNuevo, setTipoNuevo] = useState('LICITACION');
    const [tituloManual, setTituloManual] = useState('');
    const [creando, setCreando] = useState(false);

    // Historial comprador
    const [historial, setHistorial] = useState([]);
    const [nuevoEstado, setNuevoEstado] = useState('');
    const [comentario, setComentario] = useState('');
    const [guardando, setGuardando] = useState(false);

    const cargarProcesos = (mantenerIdx) => {
        setCargando(true);
        getProcesos({ formulario_id: fsc.id })
            .then(({ data }) => {
                const lista = data.results ?? data;
                setProcesos(lista);
                if (!mantenerIdx) setProcesoActivoIdx(0);
                setMostrarAgregarProceso(lista.length === 0);
            })
            .catch(() => setError('No fue posible cargar los procesos de este formulario.'))
            .finally(() => setCargando(false));
    };

    useEffect(() => {
        setError(null);
        cargarProcesos(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fsc.id]);

    const procesoActivo = procesos[Math.min(procesoActivoIdx, Math.max(procesos.length - 1, 0))] || null;

    useEffect(() => {
        if (!procesoActivo) { setHistorial([]); return undefined; }
        setNuevoEstado(procesoActivo.estado_proceso);
        let activo = true;
        getHistorialProceso(procesoActivo.id).then(({ data }) => { if (activo) setHistorial(data); });
        return () => { activo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [procesoActivo?.id]);

    const estadosDisponibles = procesoActivo ? (ESTADOS_POR_TIPO_PROCESO[procesoActivo.tipo_proceso] || []) : [];
    const sinCambios = procesoActivo && nuevoEstado === procesoActivo.estado_proceso && !comentario.trim();

    const crearYVincular = async (extra) => {
        setCreando(true);
        setError(null);
        try {
            await crearProceso({
                tipo_proceso: tipoNuevo,
                titulo: extra.titulo,
                formulario_ids: [fsc.id],
                estado_proceso: 'RECEPCIONADO',
                ...extra.campos,
            });
            onCambiado?.();
            cargarProcesos(false);
            setMostrarAgregarProceso(false);
            setTituloManual('');
        } catch (err) {
            const d = err.response?.data;
            setError(typeof d === 'string' ? d : d?.error || 'Error al crear el proceso.');
        } finally {
            setCreando(false);
        }
    };

    const handleSeleccionarLicitacion = (lic) => crearYVincular({
        titulo: lic.Nombre || `Licitación ${lic.codigo_licitacion}`,
        campos: { licitacion: lic.codigo_licitacion, monto_estimado: lic.MontoEstimado || null },
    });

    const handleSeleccionarCompraAgil = (ca) => crearYVincular({
        titulo: ca.nombre || `Compra Ágil ${ca.codigocompraagil}`,
        campos: { codigo_compra_agil: ca.codigocompraagil },
    });

    const handleCrearManual = (e) => {
        e.preventDefault();
        if (!tituloManual.trim()) return;
        crearYVincular({ titulo: tituloManual, campos: {} });
    };

    const handleAgregarOc = async (oc) => {
        setError(null);
        try {
            await agregarOcAProceso(procesoActivo.id, oc.codigo_oc);
            onCambiado?.();
            cargarProcesos(true);
        } catch { setError('No fue posible enlazar la orden de compra.'); }
    };

    const handleDesvincularMp = async (proceso) => {
        if (!window.confirm(`¿Quitar el enlace con "${proceso.licitacion || proceso.codigo_compra_agil}"? Podrás buscar y enlazar el correcto después.`)) return;
        setError(null);
        try {
            await desvincularProcesoMp(proceso.id);
            onCambiado?.();
            cargarProcesos(true);
        } catch { setError('No fue posible quitar el enlace.'); }
    };

    const handleQuitarOc = async (codigoOc) => {
        if (!window.confirm(`¿Quitar el enlace con la OC ${codigoOc}?`)) return;
        setError(null);
        try {
            await quitarOcDeProceso(procesoActivo.id, codigoOc);
            onCambiado?.();
            cargarProcesos(true);
        } catch { setError('No fue posible quitar el enlace de la orden de compra.'); }
    };

    const handleRegistrarEstado = async (e) => {
        e.preventDefault();
        setGuardando(true);
        setError(null);
        try {
            await cambiarEstadoProceso(procesoActivo.id, nuevoEstado, comentario);
            setComentario('');
            onCambiado?.();
            cargarProcesos(true);
        } catch (err) {
            const d = err.response?.data;
            setError(typeof d === 'string' ? d : d?.error || 'Error al registrar el cambio.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <>
            <div className="drawer-backdrop" onClick={onCerrar} />
            <div className="mu-drawer" style={{ width: 760 }}>
                <div className="mu-header">
                    <div className="mu-header-info">
                        <div className="mu-header-title">Proceso de Compra</div>
                        <div className="mu-header-email">{fsc.id_formulario || `Folio ${fsc.folio}`} — {fsc.unidad_requirente}</div>
                    </div>
                    <button className="modal-close mu-close" onClick={onCerrar} type="button">✕</button>
                </div>

                <div className="mu-body" style={{ overflowY: 'auto', flex: 1 }}>
                    {error && <div className="error-message">{error}</div>}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#f8fafc', borderRadius: 8, padding: '10px 14px', marginBottom: 18 }}>
                        <div style={{ fontSize: 13, color: '#475569', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {fsc.requerimiento || 'Sin nombre de compra registrado.'}
                            {fsc.monto_estimado ? <> — <strong>{fmtCLP(fsc.monto_estimado)}</strong></> : null}
                        </div>
                        <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11, flexShrink: 0 }} onClick={() => setFscVerId(fsc.id)}>
                            Ver ficha completa
                        </button>
                    </div>

                    {cargando ? <div className="loading-spinner">Cargando…</div> : (
                        <>
                            {procesos.length > 1 && (
                                <label className="form-field mu-field" style={{ marginBottom: 16 }}>
                                    <span>Proceso activo ({procesos.length} vinculados a este formulario)</span>
                                    <select value={procesoActivoIdx} onChange={e => setProcesoActivoIdx(Number(e.target.value))}>
                                        {procesos.map((p, i) => (
                                            <option key={p.id} value={i}>{tipoLabel(p.tipo_proceso)} — {p.titulo}</option>
                                        ))}
                                    </select>
                                </label>
                            )}

                            {/* ══════════ BLOQUE 1 · ENLACE MERCADO PÚBLICO ══════════ */}

                            <SeccionBloque icon="🏛️" titulo="Enlace Mercado Público" subtitulo="Proceso de Compra" acento="#7c3aed">
                                {procesos.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: mostrarAgregarProceso ? 14 : 0 }}>
                                        {procesos.map((p, i) => {
                                            const tipoInfo = TIPOS_PROCESO.find(t => t.value === p.tipo_proceso);
                                            const codigoMp = p.licitacion || p.codigo_compra_agil;
                                            return (
                                                <div key={p.id} onClick={() => setProcesoActivoIdx(i)} style={{
                                                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                                                    background: procesoActivo?.id === p.id ? '#f5f3ff' : '#f8fafc',
                                                    border: procesoActivo?.id === p.id ? '1.5px solid #c4b5fd' : '1px solid #e2e8f0',
                                                }}>
                                                    <span style={{ fontSize: 16 }}>{tipoInfo?.icon}</span>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.titulo}</div>
                                                        <div style={{ fontSize: 11, color: '#64748b', fontFamily: codigoMp ? 'monospace' : 'inherit' }}>
                                                            {codigoMp || (TIPOS_CON_CATALOGO_MP.includes(p.tipo_proceso) ? 'Sin enlazar a un código de Mercado Público aún' : tipoLabel(p.tipo_proceso))}
                                                        </div>
                                                    </div>
                                                    {codigoMp && (
                                                        <>
                                                            <button
                                                                type="button" className="btn-secondary" style={{ padding: '3px 9px', fontSize: 11, flexShrink: 0 }}
                                                                onClick={e => { e.stopPropagation(); setProcesoVerMp(p); }}
                                                            >
                                                                👁 Ver
                                                            </button>
                                                            <button
                                                                type="button" title="Quitar este enlace de Mercado Público"
                                                                onClick={e => { e.stopPropagation(); handleDesvincularMp(p); }}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                                                    border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626',
                                                                    cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0,
                                                                }}
                                                            >
                                                                ✕
                                                            </button>
                                                        </>
                                                    )}
                                                    <EstadoProcesoBadge codigo={p.estado_proceso} />
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {!mostrarAgregarProceso ? (
                                    <button
                                        type="button" onClick={() => setMostrarAgregarProceso(true)}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                                            width: '100%', padding: '10px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 600,
                                            border: '1.5px dashed #c4b5fd', background: '#faf9ff', color: '#7c3aed', cursor: 'pointer',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#f5f3ff'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = '#faf9ff'; }}
                                    >
                                        <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
                                        Enlazar {procesos.length > 0 ? 'otro proceso' : 'un proceso'} de Mercado Público
                                    </button>
                                ) : (
                                    <div style={{ background: '#faf9ff', border: '1px solid #e9e3fc', borderRadius: 10, padding: 14 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                                Tipo de proceso
                                            </span>
                                            <button
                                                type="button" onClick={() => setMostrarAgregarProceso(false)}
                                                title="Cancelar"
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    width: 20, height: 20, borderRadius: '50%', border: '1px solid #e2e8f0',
                                                    background: '#fff', color: '#94a3b8', cursor: 'pointer', fontSize: 11, padding: 0,
                                                }}
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                                            {TIPOS_PROCESO.map(t => {
                                                const activo = tipoNuevo === t.value;
                                                return (
                                                    <button
                                                        key={t.value} type="button" onClick={() => setTipoNuevo(t.value)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 6,
                                                            padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                                            border: activo ? `1.5px solid ${t.color}` : '1px solid #e2e8f0',
                                                            background: activo ? `${t.color}14` : '#fff',
                                                            color: activo ? t.color : '#64748b',
                                                            boxShadow: activo ? `0 1px 4px ${t.color}30` : 'none',
                                                            cursor: 'pointer', transition: 'all 0.12s',
                                                        }}
                                                    >
                                                        <span>{t.icon}</span> {t.label}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div style={{ background: '#fff', border: '1px solid #ede9fe', borderRadius: 8, padding: 10 }}>
                                            {TIPOS_CON_CATALOGO_MP.includes(tipoNuevo) ? (
                                                <BuscadorMP
                                                    tipo={tipoNuevo}
                                                    placeholder={tipoNuevo === 'LICITACION' ? 'Buscar licitación por código o nombre…' : 'Buscar compra ágil por código o nombre…'}
                                                    onSeleccionar={tipoNuevo === 'LICITACION' ? handleSeleccionarLicitacion : handleSeleccionarCompraAgil}
                                                />
                                            ) : (
                                                <form onSubmit={handleCrearManual} style={{ display: 'flex', gap: 8 }}>
                                                    <input
                                                        type="text" value={tituloManual} onChange={e => setTituloManual(e.target.value)}
                                                        placeholder="Título del proceso…" required
                                                        style={{ flex: 1, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                                                    />
                                                    <button type="submit" className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} disabled={creando}>
                                                        {creando ? 'Creando…' : 'Crear'}
                                                    </button>
                                                </form>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </SeccionBloque>

                            <SeccionBloque icon="🧾" titulo="Enlace Orden de Compra" subtitulo="OC emitidas para este proceso" acento="#15803d">
                                {!procesoActivo ? (
                                    <p style={{ fontSize: 12.5, color: '#94a3b8', margin: 0 }}>
                                        Enlaza primero un Proceso de Compra arriba para poder anexar Órdenes de Compra.
                                    </p>
                                ) : (
                                    <>
                                        {procesoActivo.ordenes_compra_detalle?.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                                                {procesoActivo.ordenes_compra_detalle.map(oc => (
                                                    <div key={oc.id} style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 8, padding: '9px 12px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#15803d', fontSize: 12.5 }}>{oc.codigo_oc}</span>
                                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                                <EstadoMpBadge estado={oc.estado_oc} />
                                                                <PacBadge idProyecto={oc.id_proyecto} enlacePac={oc.enlace_pac} />
                                                                <button
                                                                    type="button" title="Quitar el enlace de esta OC"
                                                                    onClick={() => handleQuitarOc(oc.codigo_oc)}
                                                                    style={{
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                                                        border: '1px solid #fecaca', background: '#fff', color: '#dc2626',
                                                                        cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: 0,
                                                                    }}
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div style={{ fontSize: 12, color: '#374151', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{oc.nombre_oc}</div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                                                            <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{fmtCLP(oc.total_bruto)}</span>
                                                            {oc.link_mp && (
                                                                <a href={oc.link_mp} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none' }}>
                                                                    Ver en Mercado Público ↗
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <BuscadorMP tipo="OC" placeholder="Buscar y enlazar Orden de Compra por código o nombre…" onSeleccionar={handleAgregarOc} />
                                    </>
                                )}
                            </SeccionBloque>

                            {/* ══════════ BLOQUE 2 · HISTORIAL ══════════ */}

                            <SeccionBloque icon="📑" titulo="Historial de Compra" subtitulo="Estado real en Mercado Público (solo lectura)" acento="#0891b2">
                                {procesos.length === 0 ? (
                                    <p style={{ fontSize: 12.5, color: '#94a3b8', margin: 0 }}>Sin procesos enlazados todavía.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {procesos.map(p => {
                                            const tipoInfo = TIPOS_PROCESO.find(t => t.value === p.tipo_proceso);
                                            const estadoMp = p.tipo_proceso === 'LICITACION' ? p.licitacion_estado
                                                : p.tipo_proceso === 'COMPRA_AGIL' ? p.compra_agil_estado : null;
                                            return (
                                                <div key={p.id} style={{ borderBottom: '1px dashed #e2e8f0', paddingBottom: 8 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b' }}>{tipoInfo?.icon} {p.titulo}</span>
                                                        {estadoMp ? <EstadoMpBadge estado={estadoMp} /> : <span style={{ fontSize: 11, color: '#cbd5e1' }}>Sin estado MP directo</span>}
                                                    </div>
                                                    {p.ordenes_compra_detalle?.length > 0 && (
                                                        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 22 }}>
                                                            {p.ordenes_compra_detalle.map(oc => (
                                                                <div key={oc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                                                                    <span style={{ fontFamily: 'monospace', color: '#64748b' }}>{oc.codigo_oc}</span>
                                                                    <EstadoMpBadge estado={oc.estado_oc} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </SeccionBloque>

                            <SeccionBloque icon="💬" titulo="Historial Comprador" subtitulo="Avances y observaciones — visibles para jefatura" acento="#d97706">
                                {!procesoActivo ? (
                                    <p style={{ fontSize: 12.5, color: '#94a3b8', margin: 0 }}>Enlaza un proceso para poder registrar avances.</p>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                            <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Estado actual</span>
                                            <EstadoProcesoBadge codigo={procesoActivo.estado_proceso} />
                                        </div>

                                        <form onSubmit={handleRegistrarEstado} style={{
                                            marginBottom: 18, background: '#fffbeb', border: '1px solid #fde9c4',
                                            borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
                                        }}>
                                            <label className="form-field mu-field">
                                                <span>Nuevo estado</span>
                                                <select value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)}>
                                                    {estadosDisponibles.map(c => <option key={c} value={c}>{estadoLabel(c)}</option>)}
                                                </select>
                                            </label>
                                            <label className="form-field mu-field">
                                                <span>Observación / comentario</span>
                                                <textarea rows={2} value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Ej: en espera de respuesta del proveedor…" />
                                            </label>
                                            <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-end' }} disabled={guardando || sinCambios}>
                                                {guardando ? 'Guardando…' : nuevoEstado === procesoActivo.estado_proceso ? 'Agregar nota' : 'Registrar cambio de estado'}
                                            </button>
                                        </form>

                                        {historial.length === 0 ? (
                                            <div className="loading-spinner">Sin movimientos registrados.</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                {historial.map(h => (
                                                    <div key={h.id} style={{ borderLeft: `3px solid ${ESTADO_COLOR(h.estado_nuevo)}`, paddingLeft: 12 }}>
                                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtFecha(h.fecha)} — {h.usuario_nombre || 'Sistema'}</div>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                                                            {h.estado_anterior && h.estado_anterior !== h.estado_nuevo
                                                                ? `${h.estado_anterior_display} → ${h.estado_nuevo_display}`
                                                                : h.estado_anterior
                                                                    ? `Nota en ${h.estado_nuevo_display}`
                                                                    : `Proceso creado — ${h.estado_nuevo_display}`}
                                                        </div>
                                                        {h.comentario && (
                                                            <div style={{ fontSize: 13, color: '#475569', marginTop: 2, background: '#f8fafc', borderRadius: 6, padding: '6px 10px' }}>
                                                                {h.comentario}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </SeccionBloque>
                        </>
                    )}
                </div>
            </div>

            {fscVerId && <ModalDetalleFsc fscId={fscVerId} onCerrar={() => setFscVerId(null)} />}
            {procesoVerMp && <VerProcesoModal proceso={procesoVerMp} onCerrar={() => setProcesoVerMp(null)} />}
        </>
    );
}
