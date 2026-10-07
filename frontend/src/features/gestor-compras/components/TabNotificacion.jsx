import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getGestorPlanResumen, getNotifPlanes } from '../api/gestorComprasApi';
import { BarraPaginacion, fmtCLP, fmtN } from './solicitudes/shared';
import ModalFichaGestor, { ESTADO_FICHA } from './plan/ModalFichaGestor';
import GraficoMensualPlan from './plan/GraficoMensualPlan';
import ModalCorreosPendientes from './notificacion/ModalCorreosPendientes';
import ModalEnvio from './notificacion/ModalEnvio';
import {
    alternar, cantidadSeleccionada, construirSeleccion, estaSeleccionado, filtrosAParams,
    paginaCompleta, seleccionVacia, seleccionarPagina, seleccionarTodosFiltrados,
} from './notificacion/seleccion';

const PAGE_SIZE = 50;
const ESTADOS = ['ATRASADO', 'PENDIENTE', 'SIN_FECHA'];
const FILTROS_INICIALES = { estados: [], mes: '', search: '', correo: '', notificado: '' };
const th = { padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' };

// 'YYYY-MM-DD' → 'dd-mm-yyyy' sin pasar por Date (evita el desfase de zona horaria)
const fmtFecha = (s) => {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '—';
};
// 'YYYY-MM' → 'MM/YYYY'
const etiquetaMes = (mes) => `${mes.slice(5)}/${mes.slice(0, 4)}`;
const fmtFechaHora = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('es-CL') : '—';
};

const CORREO = {
    CONFIRMADO: { icono: '✉️', label: 'Correo confirmado', color: '#15803d', bg: '#dcfce7' },
    EXACTO: { icono: '✉️', label: 'Correo encontrado', color: '#15803d', bg: '#dcfce7' },
    SUGERIDO: { icono: '⚠️', label: 'Confirmar correo', color: '#b45309', bg: '#fffbeb' },
    AMBIGUO: { icono: '⚠️', label: 'Elegir correo', color: '#b45309', bg: '#fffbeb' },
    SIN_CORREO: { icono: '✕', label: 'Sin correo', color: '#b91c1c', bg: '#fee2e2' },
};

function ChipCorreo({ fila, onResolver }) {
    const c = CORREO[fila.correo_estado] || CORREO.SIN_CORREO;
    const utilizable = fila.correo_estado === 'EXACTO' || fila.correo_estado === 'CONFIRMADO';
    return (
        <button
            className="gc-notif-chip gc-notif-chip-btn" onClick={utilizable ? undefined : onResolver}
            style={{ background: c.bg, color: c.color, cursor: utilizable ? 'default' : 'pointer' }}
            title={utilizable ? fila.correo : 'Clic para confirmar el correo de este responsable'}
        >
            {c.icono} {utilizable ? fila.correo : c.label}
        </button>
    );
}

function Kpi({ label, value, color, onClick, title }) {
    return (
        <div
            onClick={onClick} title={title}
            style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', border: '1px solid #e2e8f0', flex: '1 1 150px', minWidth: 140, borderTop: `4px solid ${color}`, cursor: onClick ? 'pointer' : 'default' }}
        >
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#1e293b' }}>{value}</div>
        </div>
    );
}

// Pestaña "Notificación": revisar los planes del PAC que aún no tienen formulario, elegir cuáles
// y avisar por correo a sus responsables para que generen su Formulario de Solicitud de Compra.
// Solo la ven las cuentas autorizadas en el servidor (alcance.puede_notificar).
export default function TabNotificacion({ params }) {
    const [anhos, setAnhos] = useState([]);
    const [anho, setAnho] = useState('');
    const [filtros, setFiltros] = useState(FILTROS_INICIALES);
    const [busqueda, setBusqueda] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState({ results: [], count: 0, kpis: null });
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [recarga, setRecarga] = useState(0);
    const [sel, setSel] = useState(seleccionVacia);
    const [fichaId, setFichaId] = useState(null);
    const [verPendientes, setVerPendientes] = useState(false);
    const [envio, setEnvio] = useState(null);   // foto de la selección al abrir el modal de envío

    // Años disponibles (mismo origen que la pestaña Plan) y el más reciente por defecto.
    useEffect(() => {
        let activo = true;
        getGestorPlanResumen(params)
            .then(({ data: r }) => {
                if (!activo) return;
                const lista = r.anios_pac || [];
                setAnhos(lista);
                setAnho((actual) => actual || (lista.length ? String(Math.max(...lista.map(Number))) : ''));
            })
            .catch(() => { /* sin años: se consulta "todos" */ });
        return () => { activo = false; };
    }, [params]);

    // La búsqueda por texto se aplica con un pequeño retraso para no consultar en cada tecla.
    useEffect(() => {
        const t = setTimeout(() => setFiltros((f) => (f.search === busqueda ? f : { ...f, search: busqueda })), 350);
        return () => clearTimeout(t);
    }, [busqueda]);

    const filtrosKey = JSON.stringify(filtros);
    // Cambiar un filtro cambia el significado de "todos los filtrados": se parte de cero.
    useEffect(() => { setPage(1); setSel((s) => (s.modo === 'filtro' ? seleccionVacia() : s)); }, [filtrosKey, anho, params]);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        getNotifPlanes({ ...params, ...(anho ? { anho } : {}), ...filtrosAParams(filtros), page, page_size: PAGE_SIZE })
            .then(({ data: r }) => { if (activo) { setData(r); setError(null); } })
            .catch((err) => {
                if (!activo) return;
                setData({ results: [], count: 0, kpis: null });
                setError(err.response?.status === 403
                    ? 'Su cuenta no está autorizada para enviar notificaciones.'
                    : 'No fue posible cargar los planes.');
            })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params, anho, filtrosKey, page, recarga]);

    const idsPagina = useMemo(() => data.results.map((r) => r.id_proyecto), [data.results]);
    const cantidad = cantidadSeleccionada(sel, data.count);
    const kpis = data.kpis;

    const setFiltro = (campo, valor) => setFiltros((f) => ({ ...f, [campo]: valor }));
    const alternarEstado = (e) => setFiltros((f) => ({
        ...f, estados: f.estados.includes(e) ? f.estados.filter((x) => x !== e) : [...f.estados, e],
    }));
    const limpiarFiltros = () => { setBusqueda(''); setFiltros(FILTROS_INICIALES); };
    const hayFiltros = Boolean(filtros.estados.length || filtros.mes || filtros.search || filtros.correo || filtros.notificado);

    const abrirEnvio = () => {
        const seleccion = construirSeleccion(sel, anho ? Number(anho) : null, filtros, data.count);
        if (seleccion) setEnvio(seleccion);
    };
    const refrescar = useCallback(() => setRecarga((n) => n + 1), []);
    const alTerminarEnvio = useCallback(() => { setSel(seleccionVacia()); setRecarga((n) => n + 1); }, []);

    const pagCompleta = paginaCompleta(sel, idsPagina);
    const mostrarBannerTodos = pagCompleta && sel.modo === 'ids' && data.count > idsPagina.length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="gc-nota">
                📧 Elija los planes del PAC que aún no tienen formulario y avise a sus responsables para que lo generen en el
                Panel Documental. Se envía <strong>un correo por responsable</strong> con todos sus planes. Antes de enviar verá
                una vista previa de cada correo y de a quién llegará.
            </div>

            {kpis && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Kpi label="Planes sin formulario" value={fmtN(kpis.planes)} color="#0ea5e9" />
                    <Kpi label="Responsables" value={fmtN(kpis.responsables)} color="#7c3aed" />
                    <Kpi label="Monto asociado" value={fmtCLP(kpis.monto_total)} color="#0f766e" />
                    <Kpi
                        label="Correos por confirmar" value={fmtN(kpis.responsables_por_confirmar)}
                        color={kpis.responsables_por_confirmar ? '#d97706' : '#16a34a'}
                        onClick={kpis.responsables_por_confirmar ? () => setVerPendientes(true) : undefined}
                        title={kpis.responsables_por_confirmar ? 'Clic para resolverlos' : 'Todos resueltos'}
                    />
                    <Kpi label="Ya notificados" value={fmtN(kpis.planes_ya_notificados)} color="#2563eb" />
                </div>
            )}

            {/* Mismo gráfico de la pestaña Plan: un clic en un mes filtra la tabla de abajo a los planes de ese mes. */}
            <GraficoMensualPlan params={params} anho={anho} mes={filtros.mes || null} onSelectMes={(m) => setFiltro('mes', m || '')} soloPorAvisar />

            <div className="card">
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>📅 Año</span>
                        <select className="filtro-select" value={anho} onChange={(e) => setAnho(e.target.value)}>
                            <option value="">Todos</option>
                            {anhos.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>

                        <input
                            value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar proyecto, responsable o departamento…"
                            style={{ border: '1.5px solid #c8d3de', borderRadius: 7, padding: '6px 10px', fontSize: 12, minWidth: 250, flex: '1 1 250px' }}
                        />
                        {hayFiltros && <button className="gc-notif-link" onClick={limpiarFiltros}>✕ Limpiar filtros</button>}
                    </div>

                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 2 }}>Estado:</span>
                            {ESTADOS.map((e) => {
                                const activo = filtros.estados.includes(e);
                                return (
                                    <button
                                        key={e} onClick={() => alternarEstado(e)}
                                        style={{
                                            padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                            border: `1px solid ${activo ? '#0ea5e9' : '#e2e8f0'}`, background: activo ? '#e0f2fe' : '#fff', color: activo ? '#0369a1' : '#64748b',
                                        }}
                                    >
                                        {ESTADO_FICHA[e].label}
                                    </button>
                                );
                            })}
                        </div>
                        <label className="gc-notif-mini">
                            Correo:
                            <select value={filtros.correo} onChange={(e) => setFiltro('correo', e.target.value)}>
                                <option value="">Todos</option><option value="con">Con correo</option><option value="sin">Por confirmar</option>
                            </select>
                        </label>
                        <label className="gc-notif-mini">
                            Aviso:
                            <select value={filtros.notificado} onChange={(e) => setFiltro('notificado', e.target.value)}>
                                <option value="">Todos</option><option value="no">Aún no notificados</option><option value="si">Ya notificados</option>
                            </select>
                        </label>
                        {kpis?.responsables_por_confirmar > 0 && (
                            <button className="gc-notif-btn gc-notif-btn-sec" onClick={() => setVerPendientes(true)}>
                                ✉️ Confirmar {kpis.responsables_por_confirmar} correo{kpis.responsables_por_confirmar !== 1 ? 's' : ''}
                            </button>
                        )}
                    </div>
                </div>

                {error && <div className="error-message" style={{ margin: 14 }}>{error}</div>}

                {filtros.mes && data.count > 0 && sel.modo !== 'filtro' && (
                    <div className="gc-notif-banner-mes">
                        <span>
                            📅 <strong>{etiquetaMes(filtros.mes)}</strong>: {fmtN(data.count)} plan{data.count !== 1 ? 'es' : ''} sin formulario por avisar.
                        </span>
                        <button className="gc-notif-btn gc-notif-btn-primary" onClick={() => setSel(seleccionarTodosFiltrados())}>
                            ☑ {data.count === 1 ? 'Seleccionar el plan de este mes' : `Seleccionar los ${fmtN(data.count)} planes de este mes`}
                        </button>
                    </div>
                )}
                {mostrarBannerTodos && !filtros.mes && (
                    <div className="gc-notif-banner-sel">
                        Se seleccionaron los {idsPagina.length} planes de esta página.{' '}
                        <button className="gc-notif-link" onClick={() => setSel(seleccionarTodosFiltrados())}>
                            Seleccionar los {fmtN(data.count)} planes que cumplen el filtro
                        </button>
                    </div>
                )}
                {sel.modo === 'filtro' && (
                    <div className="gc-notif-banner-sel">
                        Están seleccionados <strong>{fmtN(cantidad)}</strong> planes del filtro{sel.excluidos.size > 0 && ` (${sel.excluidos.size} excluido${sel.excluidos.size !== 1 ? 's' : ''})`}.{' '}
                        <button className="gc-notif-link" onClick={() => setSel(seleccionVacia())}>Limpiar selección</button>
                    </div>
                )}

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                <th style={{ ...th, width: 34 }}>
                                    <input
                                        type="checkbox" checked={pagCompleta} aria-label="Seleccionar la página"
                                        onChange={(e) => setSel((s) => seleccionarPagina(s, idsPagina, e.target.checked))}
                                    />
                                </th>
                                {['ID Proyecto', 'Nombre Proyecto', 'Departamento', 'Responsable', 'Monto Total', 'Fecha Compra', 'Estado', 'Aviso', ''].map((h) => <th key={h} style={th}>{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {cargando ? (
                                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Cargando…</td></tr>
                            ) : data.results.length === 0 ? (
                                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                                    No hay planes sin formulario para el filtro seleccionado.
                                </td></tr>
                            ) : data.results.map((f) => {
                                const badge = ESTADO_FICHA[f.estado_ejecucion] ?? ESTADO_FICHA.SIN_FECHA;
                                const marcado = estaSeleccionado(sel, f.id_proyecto);
                                return (
                                    <tr key={f.id_proyecto} style={{ borderBottom: '1px solid #f1f5f9', background: marcado ? '#f0f9ff' : undefined }}>
                                        <td style={{ padding: '7px 10px' }}>
                                            <input type="checkbox" checked={marcado} aria-label={`Seleccionar ${f.id_proyecto}`} onChange={() => setSel((s) => alternar(s, f.id_proyecto))} />
                                        </td>
                                        <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 600, color: '#0369a1' }}>{f.id_proyecto}</td>
                                        <td style={{ padding: '7px 10px', maxWidth: 240 }}><div className="truncate-text" title={f.nombre_proyecto}>{f.nombre_proyecto}</div></td>
                                        <td style={{ padding: '7px 10px', maxWidth: 190 }}><div className="truncate-text" title={f.depto_nombre}>{f.depto_nombre}</div></td>
                                        <td style={{ padding: '7px 10px', maxWidth: 230 }}>
                                            <div className="truncate-text" title={f.nombre_responsable}>{f.nombre_responsable || '—'}</div>
                                            {f.nombre_responsable && <ChipCorreo fila={f} onResolver={() => setVerPendientes(true)} />}
                                        </td>
                                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 500 }}>{fmtCLP(f.monto_total)}</td>
                                        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{fmtFecha(f.fecha_mas_proxima)}</td>
                                        <td style={{ padding: '7px 10px' }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>{badge.label}</span>
                                        </td>
                                        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontSize: 11 }}>
                                            {f.notificado_veces > 0
                                                ? <span title={`Último aviso: ${fmtFechaHora(f.ultimo_envio)}`} style={{ color: '#15803d', fontWeight: 600 }}>✅ ×{f.notificado_veces} · {fmtFechaHora(f.ultimo_envio)}</span>
                                                : <span style={{ color: '#94a3b8' }}>—</span>}
                                            {f.pruebas_veces > 0 && <span title="Se envió en modo prueba (no cuenta como aviso real)" style={{ marginLeft: 6 }}>🧪{f.pruebas_veces}</span>}
                                        </td>
                                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                            <button onClick={() => setFichaId(f.id_proyecto)} title="Ver todos los datos del proyecto" className="gc-btn-ver">👁 Ver</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <BarraPaginacion page={page} setPage={setPage} count={data.count} pageSize={PAGE_SIZE} />
            </div>

            {cantidad > 0 && (
                <div className="gc-notif-barra">
                    <div>
                        <strong>{fmtN(cantidad)}</strong> plan{cantidad !== 1 ? 'es' : ''} seleccionado{cantidad !== 1 ? 's' : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="gc-notif-btn gc-notif-btn-sec" onClick={() => setSel(seleccionVacia())}>Limpiar</button>
                        <button className="gc-notif-btn gc-notif-btn-primary" onClick={abrirEnvio}>📧 Revisar y enviar</button>
                    </div>
                </div>
            )}

            <ModalFichaGestor idProyecto={fichaId} params={params} onCerrar={() => setFichaId(null)} />
            {verPendientes && (
                <ModalCorreosPendientes
                    params={params} anho={anho} filtros={filtros}
                    onCerrar={() => setVerPendientes(false)} onCambio={refrescar}
                />
            )}
            {envio && (
                <ModalEnvio seleccion={envio} params={params} onCerrar={() => setEnvio(null)} onTerminado={alTerminarEnvio} />
            )}
        </div>
    );
}
