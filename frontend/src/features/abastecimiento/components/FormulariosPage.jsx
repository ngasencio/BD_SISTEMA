import { useState, useEffect, useCallback, useRef } from 'react';
import {
    getFormulariosStats, getFormulariosOrganigrama,
    iniciarActualizacionFormularios, estadoActualizacionFormularios, cancelarActualizacionFormularios,
} from '../api/formulariosApi';
import TabTemporalidad from './formularios/TabTemporalidad';
import TabAlertas from './formularios/TabAlertas';
import TabHistorial from './formularios/TabHistorial';
import TabUnificacion from './formularios/compras-conjuntas/TabUnificacion';
import FlujoVisacion from './formularios/FlujoVisacion';
import { BannerFormularios, ModalCredenciales, PanelCambiosFSC } from './formularios/ActualizacionFsc';
import TablaSolicitudes from './formularios/TablaSolicitudes';
import TablaDerivados from './formularios/TablaDerivados';
import { fmtN, fmtCLP, ESTADO_FSC_INFO } from './formularios/shared';
import { InfoTooltip } from './formularios/ui';
import './formularios/formularios.css';

// ─── Resumen + Gráficos + Tabla (tab unificado) ───────────────────────────────

function ResumenFormularios({ stats, anioSeleccionado, filtroBandeja, onFiltroChange, subdireccionSel, deptoSel }) {
    const kpis     = stats?.kpis;
    const tablaRef = useRef(null);

    const handleSelectBandeja = useCallback((nuevaBandeja) => {
        onFiltroChange(nuevaBandeja);
        if (nuevaBandeja?.length && tablaRef.current) {
            setTimeout(() => tablaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        }
    }, [onFiltroChange]);

    return (
        <div>
            {kpis && (
                <section className="frm-kpis">
                    <article className="dv-card" style={{ '--dv-card-accent': 'var(--dv-primary)' }}>
                        <div className="dv-card__title">Total de formularios <InfoTooltip text="Cantidad de solicitudes FSC registradas en el sistema, según el filtro de año aplicado." /></div>
                        <div className="dv-card__value">{fmtN(kpis.total_formularios)}</div>
                        <div className="dv-card__meta">FSC registrados</div>
                    </article>
                    <article className="dv-card" style={{ '--dv-card-accent': 'var(--dv-group-2)' }}>
                        <div className="dv-card__title">Derivados a comprador <InfoTooltip text="Solicitudes que ya fueron derivadas a un comprador para su gestión de compra (bandeja DC en adelante)." /></div>
                        <div className="dv-card__value">{fmtN(kpis.total_derivados)}</div>
                        <div className="dv-card__meta">{kpis.pct_derivados}% del total</div>
                    </article>
                    <article className="dv-card" style={{ '--dv-card-accent': 'var(--dv-secondary)' }}>
                        <div className="dv-card__title">Monto total estimado <InfoTooltip text="Suma del monto estimado de todas las solicitudes FSC del filtro actual." /></div>
                        <div className="dv-card__value">{fmtCLP(kpis.monto_total_estimado)}</div>
                        <div className="dv-card__meta">Suma de las solicitudes FSC</div>
                    </article>
                    <article className="dv-card" style={{ '--dv-card-accent': 'var(--dv-group-4)' }}>
                        <div className="dv-card__title">Estados de compra <InfoTooltip text="Cantidad de categorías distintas de estado de compra observadas entre los formularios derivados." /></div>
                        <div className="dv-card__value">{fmtN(stats.por_estado_compra?.length ?? 0)}</div>
                        <div className="dv-card__meta">Categorías distintas</div>
                    </article>
                </section>
            )}

            {/* Flujo de visación (controlado) */}
            <FlujoVisacion
                anioSeleccionado={anioSeleccionado}
                estadoSel={filtroBandeja}
                onSelectEstado={handleSelectBandeja}
            />

            {/* Tabla de solicitudes (siempre visible, se filtra con el flujo) */}
            <section className="dv-panel frm-panel">
                <div className="frm-panel__head">
                    <h2 className="frm-panel__title">Solicitudes FSC</h2>
                    {filtroBandeja?.length > 0 && (
                        <span className="frm-panel__note">
                            Filtrando por bandeja: <strong>{filtroBandeja.map(c => ESTADO_FSC_INFO[c]?.nombre || c).join(', ')}</strong>
                        </span>
                    )}
                </div>
                <div className="frm-panel__body">
                    <TablaSolicitudes
                        filtroBandeja={filtroBandeja}
                        onFiltroChange={onFiltroChange}
                        anioSeleccionado={anioSeleccionado}
                        subdireccionSel={subdireccionSel}
                        deptoSel={deptoSel}
                        tablaRef={tablaRef}
                    />
                </div>
            </section>
        </div>
    );
}

// ─── Tabs principales ─────────────────────────────────────────────────────────

const TABS = [
    { id: 'solicitudes',   label: 'Solicitudes (FSC)' },
    { id: 'derivados',     label: 'Derivados a Comprador' },
    { id: 'unificacion',   label: 'Compras Conjuntas' },
    { id: 'alertas',       label: 'Alertas / Demoras' },
    { id: 'historial',     label: 'Historial de Compras' },
    { id: 'temporalidad',  label: 'Temporalidad' },
];

// ─── Página principal ─────────────────────────────────────────────────────────

export function FormulariosPage() {
    const [tab, setTab]                   = useState('solicitudes');
    const [stats, setStats]               = useState(null);
    const [filtroBandeja, setFiltroBandeja] = useState([]);
    const [anioGlobal, setAnioGlobal]     = useState(null);
    const [organigrama, setOrganigrama]   = useState(null);
    const [subdireccionSel, setSubdireccionSel] = useState('');
    const [deptoSel, setDeptoSel]         = useState('');


    const [tarea, setTarea]         = useState(null);
    const [iniciando, setIniciando] = useState(false);
    const [modalAbierto, setModalAbierto] = useState(false);
    const [panelCambios, setPanelCambios] = useState(null);
    const pollingRef                = useRef(null);

    const cargarStats = useCallback(async () => {
        try {
            const { data } = await getFormulariosStats(anioGlobal ? { anho: anioGlobal } : {});
            setStats(data);
        } catch { /* ignorar */ }
    }, [anioGlobal]);

    useEffect(() => { cargarStats(); }, [cargarStats]);

    // Resetear filtro de bandeja al cambiar el año global
    useEffect(() => { setFiltroBandeja([]); }, [anioGlobal]);

    // Árbol Subdirección → Departamento para el filtro de la tabla Solicitudes FSC
    // (no depende del año — se carga una sola vez).
    useEffect(() => {
        getFormulariosOrganigrama()
            .then(({ data }) => setOrganigrama(data))
            .catch(() => setOrganigrama(null));
    }, []);

    // Al cambiar de subdirección, el departamento seleccionado (si pertenecía a otra) deja de ser válido.
    useEffect(() => { setDeptoSel(''); }, [subdireccionSel]);


    useEffect(() => () => clearInterval(pollingRef.current), []);

    const iniciarPolling = useCallback((taskId) => {
        clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
            try {
                const { data } = await estadoActualizacionFormularios(taskId);
                setTarea(data);
                if (['completado', 'error', 'cancelado'].includes(data.status)) {
                    clearInterval(pollingRef.current);
                    if (data.status === 'completado') {
                        cargarStats();
                        if (data.diff) setPanelCambios(data.diff);
                    }
                }
            } catch {
                clearInterval(pollingRef.current);
            }
        }, 2000);
    }, [cargarStats]);

    const handleConfirmarCredenciales = async ({ rut, dv, clave }) => {
        setModalAbierto(false);
        if (iniciando) return;
        setIniciando(true);
        try {
            const { data } = await iniciarActualizacionFormularios({ rut, dv, clave });
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
        try { await cancelarActualizacionFormularios(tarea.task_id); } catch { /* ignorar */ }
        clearInterval(pollingRef.current);
        setTarea(prev => ({ ...prev, status: 'cancelado', paso_desc: 'Cancelado por el usuario.' }));
    };

    const enProceso             = tarea?.status === 'iniciado' || tarea?.status === 'en_proceso';
    const opcionesEstadoCompra  = stats?.por_estado_compra?.map(e => e.estado).filter(Boolean) ?? [];
    const aniosDisponibles      = stats?.anios_disponibles;

    return (
        <div className="feature-page frm-page">
            {/* Título + acción */}
            <header className="frm-header">
                <div>
                    <div className="dv-eyebrow frm-header__eyebrow">Abastecimiento</div>
                    <h1 className="frm-header__title">Formularios de Solicitud de Compra</h1>
                    <div className="frm-header__sub">Panel Documental — Servicio de Salud Osorno</div>
                </div>
                <button
                    type="button"
                    className="dv-btn dv-btn--primary"
                    onClick={() => setModalAbierto(true)}
                    disabled={iniciando || enProceso}
                >
                    {enProceso ? 'Actualizando…' : 'Actualizar desde el Panel'}
                </button>
            </header>

            {/* Filtros globales */}
            <div className="frm-filterbar">
                <span className="frm-filterbar__label dv-eyebrow">
                    Filtros
                    <InfoTooltip text="El año se aplica a los indicadores, al flujo de visación y a los listados de Solicitudes y Derivados. Subdirección y Departamento acotan solo la tabla Solicitudes FSC." />
                </span>
                <label className="frm-field-inline">
                    <span>Año</span>
                    <select className="dv-select" value={anioGlobal || ''} onChange={e => setAnioGlobal(e.target.value || null)}>
                        <option value="">Todos los años</option>
                        {aniosDisponibles?.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                </label>
                <label className="frm-field-inline">
                    <span>Subdirección</span>
                    <select className="dv-select" value={subdireccionSel} onChange={e => setSubdireccionSel(e.target.value)}>
                        <option value="">Todas</option>
                        {organigrama?.subdirecciones.map(s => (
                            <option key={s.subdireccion_id ?? 'sin_clasificar'} value={s.subdireccion_id ?? 'sin_clasificar'}>
                                {s.nombre} ({fmtN(s.total)})
                            </option>
                        ))}
                    </select>
                </label>
                <label className="frm-field-inline">
                    <span>Departamento</span>
                    <select
                        className="dv-select"
                        value={deptoSel}
                        onChange={e => setDeptoSel(e.target.value)}
                        disabled={!subdireccionSel}
                    >
                        <option value="">Todos</option>
                        {organigrama?.subdirecciones
                            .find(s => String(s.subdireccion_id) === subdireccionSel)
                            ?.departamentos.map(d => (
                                <option key={d.depto_id} value={d.depto_id}>{d.nombre} ({fmtN(d.total)})</option>
                            ))}
                    </select>
                </label>
            </div>

            {/* Tabs principales */}
            <nav className="frm-tabs" role="tablist" aria-label="Secciones de Formularios">
                {TABS.map(t => (
                    <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                            onClick={() => setTab(t.id)} className={`frm-tab${tab === t.id ? ' is-active' : ''}`}>
                        {t.label}
                    </button>
                ))}
            </nav>

            {tab === 'solicitudes' && (
                <ResumenFormularios
                    stats={stats}
                    anioSeleccionado={anioGlobal}
                    filtroBandeja={filtroBandeja}
                    onFiltroChange={setFiltroBandeja}
                    subdireccionSel={subdireccionSel}
                    deptoSel={deptoSel}
                />
            )}

            {tab === 'derivados' && (
                <section className="dv-panel frm-panel">
                    <div className="frm-panel__head">
                        <h2 className="frm-panel__title">Formularios derivados a comprador</h2>
                        <span className="frm-panel__note">Pasaron a gestión de compra; «Ver» muestra la ficha con el proceso y las órdenes de compra enlazadas.</span>
                    </div>
                    <div className="frm-panel__body">
                        <TablaDerivados opcionesEstadoCompra={opcionesEstadoCompra} anioSeleccionado={anioGlobal} />
                    </div>
                </section>
            )}

            {tab === 'unificacion' && (
                <TabUnificacion anioSeleccionado={anioGlobal} />
            )}

            {tab === 'alertas' && (
                <TabAlertas anioSeleccionado={anioGlobal} />
            )}

            {tab === 'historial' && (
                <TabHistorial anioSeleccionado={anioGlobal} />
            )}

            {tab === 'temporalidad' && (
                <TabTemporalidad />
            )}

            {modalAbierto && (
                <ModalCredenciales onConfirmar={handleConfirmarCredenciales} onCerrar={() => setModalAbierto(false)} />
            )}

            {panelCambios && (
                <PanelCambiosFSC diff={panelCambios} onCerrar={() => setPanelCambios(null)} />
            )}

            <BannerFormularios
                tarea={tarea}
                onCerrar={() => { clearInterval(pollingRef.current); setTarea(null); }}
                onCancelar={handleCancelar}
            />
        </div>
    );
}
