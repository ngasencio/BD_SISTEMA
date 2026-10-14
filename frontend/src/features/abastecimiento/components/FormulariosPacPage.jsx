// Abastecimiento › Formularios › Formularios PAC.
// Fichas con que los departamentos piden crear / modificar / eliminar proyectos del Plan Anual
// de Compras: línea de flujo de visación, tabla de solicitudes, carro de productos y alertas.
// Mismos datos del Panel Documental que Formularios FSC, otros reportes (totalpac / totalcarropac).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    getFormulariosPacStats, getFormulariosPacOrganigrama,
    iniciarActualizacionFormulariosPac, estadoActualizacionFormulariosPac, cancelarActualizacionFormulariosPac,
} from '../api/formulariosPacApi';
import { fmtN } from './formularios/shared';
import { InfoTooltip } from './formularios/ui';
import { BannerFormularios, ModalCredenciales } from './formularios/ActualizacionFsc';
import FlujoVisacionPac from './formularios-pac/FlujoVisacionPac';
import TablaSolicitudesPac from './formularios-pac/TablaSolicitudesPac';
import TabCarroPac from './formularios-pac/TabCarroPac';
import TabAlertasPac from './formularios-pac/TabAlertasPac';
import PanelCambiosPac from './formularios-pac/PanelCambiosPac';
import { fmtMillones, infoEstadoPac, paramsFiltrosPac } from './formularios-pac/sharedPac';
import './formularios/formularios.css';
import './formularios-pac/formularios-pac.css';

const TABS = [
    { id: 'solicitudes', label: 'Solicitudes PAC' },
    { id: 'carro',       label: 'Carro de Productos' },
    { id: 'alertas',     label: 'Alertas / Demoras' },
];

function Kpis({ stats }) {
    const k = stats?.kpis;
    if (!k) return null;
    const acciones = (stats.por_accion || []).map((a) => `${a.accion} ${fmtN(a.total)}`).join(' · ');
    return (
        <section className="frm-kpis">
            <article className="dv-card" style={{ '--dv-card-accent': 'var(--dv-primary)' }}>
                <div className="dv-card__title">Fichas PAC <InfoTooltip text="Cantidad de fichas registradas en el Panel, según los filtros aplicados." /></div>
                <div className="dv-card__value">{fmtN(k.total_fichas)}</div>
                <div className="dv-card__meta">{acciones || 'Sin fichas'}</div>
            </article>
            <article className="dv-card" style={{ '--dv-card-accent': 'var(--dv-watch)' }}>
                <div className="dv-card__title">En trámite <InfoTooltip text="Fichas que siguen en una bandeja de visación: Pendiente Firma, Revisor Finanzas, Jefatura Finanzas o Jefatura Abastecimiento." /></div>
                <div className="dv-card__value">{fmtN(k.en_tramite)}</div>
                <div className="dv-card__meta">Pendientes de aprobar</div>
            </article>
            <article className="dv-card" style={{ '--dv-card-accent': 'var(--dv-ok)' }}>
                <div className="dv-card__title">Aprobadas <InfoTooltip text={`${infoEstadoPac('DC').detalle} El porcentaje es sobre las fichas ya resueltas (aprobadas + rechazadas).`} /></div>
                <div className="dv-card__value">{fmtN(k.aprobadas)}</div>
                <div className="dv-card__meta">{k.pct_aprobacion != null ? `${k.pct_aprobacion}% de las resueltas` : 'Sin fichas resueltas'}</div>
            </article>
            <article className="dv-card" style={{ '--dv-card-accent': 'var(--dv-none)' }}>
                <div className="dv-card__title">Rechazadas</div>
                <div className="dv-card__value">{fmtN(k.rechazadas)}</div>
                <div className="dv-card__meta">{k.pct_rechazo != null ? `${k.pct_rechazo}% de las resueltas` : 'Sin fichas resueltas'}</div>
            </article>
            <article className="dv-card" style={{ '--dv-card-accent': 'var(--dv-secondary)' }}>
                <div className="dv-card__title">Monto vigente <InfoTooltip text="Suma de los montos de las fichas en trámite y aprobadas (sin las rechazadas). Es el efecto neto declarado: una modificación que rebaja resta." /></div>
                <div className="dv-card__value" title={new Intl.NumberFormat('es-CL').format(k.monto_vigente)}>{fmtMillones(k.monto_vigente)}</div>
                <div className="dv-card__meta">Sin contar rechazadas</div>
            </article>
        </section>
    );
}

export function FormulariosPacPage() {
    const [tab, setTab] = useState('solicitudes');
    const [stats, setStats] = useState(null);
    const [filtroBandeja, setFiltroBandeja] = useState([]);
    const [filtroAccion, setFiltroAccion] = useState([]);
    const [anioGlobal, setAnioGlobal] = useState(null);
    const [organigrama, setOrganigrama] = useState(null);
    const [subdireccionSel, setSubdireccionSel] = useState('');
    const [deptoSel, setDeptoSel] = useState('');

    const [tarea, setTarea] = useState(null);
    const [iniciando, setIniciando] = useState(false);
    const [modalAbierto, setModalAbierto] = useState(false);
    const [panelCambios, setPanelCambios] = useState(null);
    const [version, setVersion] = useState(0);     // sube al terminar una sincronización: recarga todo
    const pollingRef = useRef(null);
    const tablaRef = useRef(null);

    // Año + organigrama: filtros GLOBALES (acotan KPIs, flujo, tabla, carro y alertas).
    const filtros = useMemo(
        () => paramsFiltrosPac({ anio: anioGlobal, subdireccionSel, deptoSel }),
        [anioGlobal, subdireccionSel, deptoSel],
    );
    const filtrosKey = JSON.stringify(filtros);

    useEffect(() => {
        let activo = true;
        getFormulariosPacStats(filtros)
            .then(({ data }) => { if (activo) setStats(data); })
            .catch(() => { if (activo) setStats(null); });
        return () => { activo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtrosKey, version]);

    useEffect(() => { setFiltroBandeja([]); setFiltroAccion([]); }, [filtrosKey]);

    const cargarOrganigrama = useCallback(() => {
        getFormulariosPacOrganigrama()
            .then(({ data }) => setOrganigrama(data))
            .catch(() => setOrganigrama(null));
    }, []);
    useEffect(() => { cargarOrganigrama(); }, [cargarOrganigrama, version]);

    // Al cambiar de subdirección, el departamento elegido (si era de otra) deja de ser válido.
    useEffect(() => { setDeptoSel(''); }, [subdireccionSel]);

    useEffect(() => () => clearInterval(pollingRef.current), []);

    const iniciarPolling = useCallback((taskId) => {
        clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
            try {
                const { data } = await estadoActualizacionFormulariosPac(taskId);
                setTarea(data);
                if (['completado', 'error', 'cancelado'].includes(data.status)) {
                    clearInterval(pollingRef.current);
                    if (data.status === 'completado') {
                        setVersion((v) => v + 1);
                        if (data.diff) setPanelCambios(data.diff);
                    }
                }
            } catch {
                clearInterval(pollingRef.current);
            }
        }, 2000);
    }, []);

    const handleConfirmarCredenciales = async ({ rut, dv, clave }) => {
        setModalAbierto(false);
        if (iniciando) return;
        setIniciando(true);
        try {
            const { data } = await iniciarActualizacionFormulariosPac({ rut, dv, clave });
            setTarea({ status: 'iniciado', task_id: data.task_id, paso: 0, paso_desc: 'Iniciando...', progreso_pct: 0, logs_recientes: [] });
            iniciarPolling(data.task_id);
        } catch (err) {
            alert(err.response?.data?.error || 'Error al iniciar la actualización.');
        } finally {
            setIniciando(false);
        }
    };

    const handleCancelar = async () => {
        if (!tarea?.task_id) return;
        try { await cancelarActualizacionFormulariosPac(tarea.task_id); } catch { /* ignorar */ }
        clearInterval(pollingRef.current);
        setTarea((prev) => ({ ...prev, status: 'cancelado', paso_desc: 'Cancelado por el usuario.' }));
    };

    const seleccionarBandeja = useCallback((nueva) => {
        setFiltroBandeja(nueva);
        if (nueva?.length && tablaRef.current) {
            setTimeout(() => tablaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        }
    }, []);

    const enProceso = tarea?.status === 'iniciado' || tarea?.status === 'en_proceso';
    const aniosDisponibles = stats?.anios_disponibles;
    // `version` en la clave remonta las pestañas para que recarguen tras sincronizar.
    const claveDatos = `${filtrosKey}|${version}`;

    return (
        <div className="feature-page frm-page">
            <header className="frm-header">
                <div>
                    <div className="dv-eyebrow frm-header__eyebrow">Abastecimiento · Formularios</div>
                    <h1 className="frm-header__title">Formularios PAC</h1>
                    <div className="frm-header__sub">Fichas del Plan Anual de Compras — Panel Documental, Servicio de Salud Osorno</div>
                </div>
                <button type="button" className="dv-btn dv-btn--primary" onClick={() => setModalAbierto(true)}
                        disabled={iniciando || enProceso}>
                    {enProceso ? 'Actualizando…' : 'Actualizar desde el Panel'}
                </button>
            </header>

            <div className="frm-filterbar">
                <span className="frm-filterbar__label dv-eyebrow">
                    Filtros
                    <InfoTooltip text="Año, Subdirección y Departamento acotan todas las pestañas: indicadores, línea de flujo, tablas, carro y alertas." />
                </span>
                <label className="frm-field-inline">
                    <span>Año</span>
                    <select className="dv-select" value={anioGlobal || ''} onChange={(e) => setAnioGlobal(e.target.value || null)}>
                        <option value="">Todos los años</option>
                        {aniosDisponibles?.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                </label>
                <label className="frm-field-inline">
                    <span>Subdirección</span>
                    <select className="dv-select" value={subdireccionSel} onChange={(e) => setSubdireccionSel(e.target.value)}>
                        <option value="">Todas</option>
                        {organigrama?.subdirecciones.map((s) => (
                            <option key={s.subdireccion_id ?? 'sin_clasificar'} value={s.subdireccion_id ?? 'sin_clasificar'}>
                                {s.nombre} ({fmtN(s.total)})
                            </option>
                        ))}
                    </select>
                </label>
                <label className="frm-field-inline">
                    <span>Departamento</span>
                    <select className="dv-select" value={deptoSel} onChange={(e) => setDeptoSel(e.target.value)} disabled={!subdireccionSel}>
                        <option value="">Todos</option>
                        {organigrama?.subdirecciones
                            .find((s) => String(s.subdireccion_id) === subdireccionSel)
                            ?.departamentos.map((d) => (
                                <option key={d.depto_id} value={d.depto_id}>{d.nombre} ({fmtN(d.total)})</option>
                            ))}
                    </select>
                </label>
            </div>

            <nav className="frm-tabs" role="tablist" aria-label="Secciones de Formularios PAC">
                {TABS.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                            onClick={() => setTab(t.id)} className={`frm-tab${tab === t.id ? ' is-active' : ''}`}>
                        {t.label}
                    </button>
                ))}
            </nav>

            {tab === 'solicitudes' && (
                <div key={claveDatos}>
                    <Kpis stats={stats} />
                    <FlujoVisacionPac filtros={filtros} estadoSel={filtroBandeja} onSelectEstado={seleccionarBandeja} />
                    <section className="dv-panel frm-panel">
                        <div className="frm-panel__head">
                            <h2 className="frm-panel__title">Solicitudes PAC</h2>
                            {filtroBandeja.length > 0 && (
                                <span className="frm-panel__note">
                                    Filtrando por bandeja: <strong>{filtroBandeja.map((c) => infoEstadoPac(c).nombre).join(', ')}</strong>
                                </span>
                            )}
                        </div>
                        <div className="frm-panel__body">
                            <TablaSolicitudesPac
                                filtros={filtros}
                                filtroBandeja={filtroBandeja} onFiltroBandejaChange={setFiltroBandeja}
                                filtroAccion={filtroAccion} onFiltroAccionChange={setFiltroAccion}
                                tablaRef={tablaRef}
                            />
                        </div>
                    </section>
                </div>
            )}

            {tab === 'carro' && <TabCarroPac key={claveDatos} filtros={filtros} />}
            {tab === 'alertas' && <TabAlertasPac key={claveDatos} filtros={filtros} />}

            {modalAbierto && (
                <ModalCredenciales
                    onConfirmar={handleConfirmarCredenciales}
                    onCerrar={() => setModalAbierto(false)}
                    descripcion="Descarga de los reportes de Formularios PAC (fichas y carro de productos)"
                />
            )}

            {panelCambios && <PanelCambiosPac diff={panelCambios} onCerrar={() => setPanelCambios(null)} />}

            <BannerFormularios
                tarea={tarea}
                tituloEnCurso="Actualizando fichas PAC desde el Panel…"
                onCerrar={() => { clearInterval(pollingRef.current); setTarea(null); }}
                onCancelar={handleCancelar}
            />
        </div>
    );
}
