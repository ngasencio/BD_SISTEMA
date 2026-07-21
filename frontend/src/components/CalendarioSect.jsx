import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import apiClient from '../lib/axios';

const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

const MESES = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

// Agrupación visual de etapas
const EVENT_GROUPS = [
    { label: 'Inicio',        color: '#27ae60' },
    { label: 'Plazos',        color: '#e74c3c' },
    { label: 'Evaluación',    color: '#2980b9' },
    { label: 'Adjudicación',  color: '#8e44ad' },
    { label: 'Contrato',      color: '#0e6655' },
];

const EVENT_CFG = {
    // ── Inicio del proceso ── verde
    creacion:    { label: 'Creación',               color: '#2ecc71', bg: '#e8faf0', field: 'FechaCreacion',              group: 0 },
    pub:         { label: 'Publicación',            color: '#27ae60', bg: '#eafaf1', field: 'FechaPublicacion',           group: 0 },
    inicio:      { label: 'Inicio',                 color: '#1abc9c', bg: '#e8f8f5', field: 'FechaInicio',                group: 0 },
    // ── Plazos / deadlines ── rojo-naranja
    visita:      { label: 'Visita Terreno',         color: '#d35400', bg: '#fdf0e7', field: 'FechaVisitaTerreno',         group: 1 },
    antecedentes:{ label: 'Entrega Antecedentes',   color: '#e67e22', bg: '#fef3e7', field: 'FechaEntregaAntecedentes',   group: 1 },
    soporte:     { label: 'Soporte Físico',         color: '#f39c12', bg: '#fff9ed', field: 'FechaSoporteFisico',         group: 1 },
    cierre:      { label: 'Cierre Ofertas',         color: '#e74c3c', bg: '#fdecea', field: 'FechaCierre',                group: 1 },
    // ── Evaluación / apertura ── azul
    respuestas:  { label: 'Pub. Respuestas',        color: '#5dade2', bg: '#edf7fc', field: 'FechaPubRespuestas',         group: 2 },
    apert_tec:   { label: 'Apertura Técnica',       color: '#2980b9', bg: '#e8f4fb', field: 'FechaActoAperturaTecnica',   group: 2 },
    apert_eco:   { label: 'Apertura Económica',     color: '#1a5276', bg: '#e4eef7', field: 'FechaActoAperturaEconomica', group: 2 },
    evaluacion:  { label: 'Evaluación',             color: '#1f618d', bg: '#e6f0f8', field: 'FechaTiempoEvaluacion',      group: 2 },
    // ── Adjudicación ── morado
    adj_est:     { label: 'Adj. Estimada',          color: '#8e44ad', bg: '#f5eef8', field: 'FechaEstimadaAdjudicacion',  group: 3 },
    adj_real:    { label: 'Adjudicación',           color: '#6c3483', bg: '#f2eaf9', field: 'FechaAdjudicacion',          group: 3 },
    adj_fecha:   { label: 'Fecha Adj.',             color: '#9b59b6', bg: '#f4ecf9', field: 'Adj_Fecha',                  group: 3 },
    // ── Contrato ── verde oscuro
    firma:       { label: 'Est. Firma',             color: '#1d8348', bg: '#e8f5ec', field: 'FechaEstimadaFirma',         group: 4 },
    contrato:    { label: 'Inicio Contrato',        color: '#0e6655', bg: '#e5f5f2', field: 'FechaInicioContrato',        group: 4 },
    final:       { label: 'Fecha Final',            color: '#145a32', bg: '#e6f4eb', field: 'FechaFinal',                 group: 4 },
};

const ALERT_DAYS = 30;

const toLocalKey = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);

export default function CalendarioSect() {
    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    // ── Datos propios del calendario ──────────────────────────────
    const anioActual = today.getFullYear();
    const [anioSel, setAnioSel]           = useState(anioActual);
    const [licData, setLicData]           = useState([]);
    const [loadingLic, setLoadingLic]     = useState(false);
    const [errorLic, setErrorLic]         = useState(null);
    const [anosCalendario, setAnosCalendario] = useState([]);

    // Cargar años disponibles al montar
    useEffect(() => {
        apiClient.get('licitaciones/anos-calendario/')
            .then(res => {
                const anos = res.data || [];
                setAnosCalendario(anos);
                // Si el año actual no tiene datos, saltar al más reciente
                if (anos.length > 0 && !anos.includes(anioActual)) {
                    setAnioSel(anos[0]);
                }
            })
            .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Cargar licitaciones cuando cambia el año seleccionado
    useEffect(() => {
        setLoadingLic(true);
        setErrorLic(null);
        setSelectedKey(null);
        apiClient.get('licitaciones/calendario/', { params: { anio: anioSel } })
            .then(res => setLicData(res.data || []))
            .catch(() => setErrorLic('Error al cargar el calendario.'))
            .finally(() => setLoadingLic(false));
    }, [anioSel]);

    // ── Estado de la vista ────────────────────────────────────────
    const [viewDate, setViewDate] = useState(
        () => new Date(today.getFullYear(), today.getMonth(), 1)
    );
    const [selectedKey, setSelectedKey] = useState(null);
    const autoNavDone = useRef(false);

    // Reiniciar auto-navegación cuando carga un nuevo año
    useEffect(() => {
        autoNavDone.current = false;
    }, [anioSel]);

    // Estado de descargas: { [codigo_licitacion]: { taskId, status, rutaZip, rutaCarpeta, error } }
    const [descargas, setDescargas] = useState({});
    const pollingRefs = useRef({});

    const iniciarDescarga = useCallback(async (codigo) => {
        setDescargas(prev => ({ ...prev, [codigo]: { taskId: null, status: 'iniciado', rutaZip: null, error: null } }));
        try {
            const { data } = await apiClient.post('licitaciones/descarga-ofertas/', { codigo });
            const taskId = data.task_id;
            setDescargas(prev => ({ ...prev, [codigo]: { taskId, status: 'en_proceso', rutaZip: null, error: null } }));

            pollingRefs.current[codigo] = setInterval(async () => {
                try {
                    const { data: estado } = await apiClient.get(`licitaciones/descarga-estado/${taskId}/`);
                    setDescargas(prev => ({
                        ...prev,
                        [codigo]: {
                            taskId,
                            status: estado.status,
                            rutaZip: estado.ruta_zip,
                            rutaCarpeta: estado.ruta_carpeta,
                            error: estado.error,
                        },
                    }));
                    if (estado.status === 'completado' || estado.status === 'error') {
                        clearInterval(pollingRefs.current[codigo]);
                        delete pollingRefs.current[codigo];
                    }
                } catch {
                    // silenciar errores de red durante polling
                }
            }, 5000);
        } catch (err) {
            const msg = err.response?.data?.error || 'Error al iniciar descarga.';
            setDescargas(prev => ({ ...prev, [codigo]: { taskId: null, status: 'error', rutaZip: null, error: msg } }));
        }
    }, []);

    // Descarga el ZIP ya generado en el servidor: se trae como blob y se
    // guarda con un <a download> para que caiga en la carpeta de Descargas
    // del navegador de quien hace clic, sin importar en qué máquina corre
    // el servidor Django/Selenium.
    const descargarZip = useCallback(async (codigo) => {
        const descarga = descargas[codigo];
        if (!descarga?.taskId) return;
        try {
            const { data } = await apiClient.get(
                `licitaciones/descarga-archivo/${descarga.taskId}/`,
                { responseType: 'blob' }
            );
            const nombreZip = (descarga.rutaZip || `${codigo}.zip`).split(/[\\/]/).pop();
            const url = window.URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = nombreZip;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            setDescargas(prev => ({
                ...prev,
                [codigo]: { ...prev[codigo], error: 'No se pudo descargar el archivo ZIP.' },
            }));
        }
    }, [descargas]);

    // Limpiar intervalos al desmontar
    useEffect(() => {
        return () => {
            Object.values(pollingRefs.current).forEach(id => clearInterval(id));
        };
    }, []);

    const year  = viewDate.getFullYear();
    const month = viewDate.getMonth();

    /* ── Mapa de eventos: 'YYYY-MM-DD' → [{type, lic}] ── */
    const eventMap = useMemo(() => {
        const map = {};
        licData.forEach(lic => {
            Object.entries(EVENT_CFG).forEach(([type, cfg]) => {
                const key = toLocalKey(lic[cfg.field]);
                if (!key) return;
                if (!map[key]) map[key] = [];
                map[key].push({ type, lic });
            });
        });
        return map;
    }, [licData]);

    /* ── Meses distintos con eventos (para el selector rápido) ── */
    const mesesConEventos = useMemo(() => {
        const months = new Set(Object.keys(eventMap).map(k => k.slice(0, 7)));
        return [...months].sort();
    }, [eventMap]);

    /* ── Auto-navegar al mes más cercano con datos si el mes actual está vacío ── */
    useEffect(() => {
        if (autoNavDone.current || licData.length === 0 || mesesConEventos.length === 0) return;
        const todayYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const hasNow  = mesesConEventos.includes(todayYM);
        if (!hasNow) {
            // preferir mes futuro más cercano; si no, el más reciente pasado
            const future = mesesConEventos.filter(m => m >= todayYM);
            const target = future.length > 0 ? future[0] : mesesConEventos[mesesConEventos.length - 1];
            const [y, m] = target.split('-').map(Number);
            setViewDate(new Date(y, m - 1, 1));
        }
        autoNavDone.current = true;
    }, [mesesConEventos, licData.length, today]);

    /* ── Días del calendario (incluyendo bordes del mes anterior/siguiente) ── */
    const calDays = useMemo(() => {
        const firstDow = new Date(year, month, 1).getDay(); // 0=Dom
        const leadEmpty = firstDow === 0 ? 6 : firstDow - 1; // Lu=0
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = [];

        for (let i = leadEmpty; i > 0; i--)
            days.push({ date: new Date(year, month, 1 - i), current: false });
        for (let d = 1; d <= daysInMonth; d++)
            days.push({ date: new Date(year, month, d), current: true });
        const trailing = (7 - (days.length % 7)) % 7;
        for (let i = 1; i <= trailing; i++)
            days.push({ date: new Date(year, month + 1, i), current: false });

        return days;
    }, [year, month]);

    /* ── Próximos 30 días — solo cierres ── */
    const proximos = useMemo(() => {
        const limit = new Date(today);
        limit.setDate(limit.getDate() + ALERT_DAYS);
        return licData
            .filter(l => {
                if (!l.FechaCierre) return false;
                const d = new Date(l.FechaCierre);
                return d >= today && d <= limit;
            })
            .sort((a, b) => new Date(a.FechaCierre) - new Date(b.FechaCierre));
    }, [licData, today]);

    /* ── Navegación ── */
    const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
    const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
    const goToday   = () => {
        setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
        setSelectedKey(null);
    };

    const dayKey = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const isToday = (d) =>
        d.getFullYear() === today.getFullYear() &&
        d.getMonth()    === today.getMonth()    &&
        d.getDate()     === today.getDate();

    const daysLeft = (dateStr) =>
        Math.ceil((new Date(dateStr) - today) / 86400000);

    const selectedEvents = selectedKey ? (eventMap[selectedKey] || []) : [];

    /* ── Eventos del mes actual (para el contador del header) ── */
    const eventosDelMes = useMemo(() => {
        return calDays
            .filter(d => d.current)
            .reduce((acc, d) => acc + (eventMap[dayKey(d.date)]?.length || 0), 0);
    }, [calDays, eventMap]);

    return (
        <div className="tab-view active" id="tab-calendario">

            {/* ── Selector de año ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: '#666', fontWeight: 700, flexShrink: 0 }}>Año:</span>
                {anosCalendario.map(a => (
                    <button
                        key={a}
                        className={`tab-btn${anioSel === a ? ' active' : ''}`}
                        style={{ fontSize: '12px', padding: '3px 12px' }}
                        onClick={() => setAnioSel(a)}
                    >
                        {a}
                    </button>
                ))}
                {loadingLic && (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        fontSize: '11px', color: '#9aabb8', marginLeft: '4px',
                    }}>
                        <span style={{
                            width: '10px', height: '10px',
                            border: '2px solid #9aabb8', borderTopColor: 'transparent',
                            borderRadius: '50%', display: 'inline-block',
                            animation: 'spin 0.8s linear infinite',
                        }} />
                        Cargando {anioSel}…
                    </span>
                )}
                {errorLic && (
                    <span style={{ fontSize: '11px', color: '#e74c3c', marginLeft: '4px' }}>
                        {errorLic}
                    </span>
                )}
                {!loadingLic && !errorLic && licData.length > 0 && (
                    <span style={{ fontSize: '11px', color: '#9aabb8', marginLeft: '4px' }}>
                        {licData.length} licitaciones
                    </span>
                )}
            </div>

            {/* ── Barra de navegación ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <button className="tab-btn" onClick={prevMonth}>← Anterior</button>
                <h3 style={{
                    flex: 1, textAlign: 'center', margin: 0,
                    fontSize: '16px', fontWeight: 700, color: '#1a3d71',
                    textTransform: 'capitalize',
                }}>
                    {MESES[month]} {year}
                    <span style={{ fontSize: '12px', fontWeight: 400, color: '#9aabb8', marginLeft: '8px' }}>
                        ({eventosDelMes} eventos este mes)
                    </span>
                </h3>
                <button className="tab-btn" onClick={nextMonth}>Siguiente →</button>
                <button className="tab-btn active" onClick={goToday}>Hoy</button>
            </div>

            {/* ── Selector rápido de meses con eventos ── */}
            {mesesConEventos.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#9aabb8', fontWeight: 600, flexShrink: 0 }}>Ir a:</span>
                    {mesesConEventos.map(ym => {
                        const [y, m] = ym.split('-').map(Number);
                        const isActive = y === year && m === month + 1;
                        const count = Object.keys(eventMap)
                            .filter(k => k.startsWith(ym))
                            .reduce((acc, k) => acc + eventMap[k].length, 0);
                        return (
                            <button
                                key={ym}
                                className={`tab-btn${isActive ? ' active' : ''}`}
                                style={{ fontSize: '11px', padding: '3px 9px' }}
                                onClick={() => { setViewDate(new Date(y, m - 1, 1)); setSelectedKey(null); }}
                            >
                                {MESES[m - 1].slice(0, 3)} {y}
                                <span style={{ opacity: 0.65, marginLeft: '4px' }}>({count})</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── Leyenda agrupada ── */}
            <div style={{ marginBottom: '12px' }}>
                {EVENT_GROUPS.map((grp, gi) => {
                    const items = Object.entries(EVENT_CFG).filter(([, c]) => c.group === gi);
                    return (
                        <div key={gi} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: grp.color, minWidth: '80px', flexShrink: 0 }}>
                                {grp.label}
                            </span>
                            {items.map(([key, cfg]) => (
                                <span key={key} className="cal-legend-item" style={{ color: cfg.color, fontSize: '10px' }}>
                                    <span className="cal-legend-dot" style={{ background: cfg.color, width: '8px', height: '8px' }} />
                                    {cfg.label}
                                </span>
                            ))}
                        </div>
                    );
                })}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#f39c12', marginTop: '2px' }}>
                    <span style={{ width: '12px', height: '8px', background: '#fff9ed', border: '1px solid #f39c12', borderRadius: '2px', display: 'inline-block', flexShrink: 0 }} />
                    Celda amarilla = cierre en ≤{ALERT_DAYS} días
                </div>
            </div>

            {/* ── Layout calendario + panel lateral ── */}
            <div className="cal-layout">

                {/* Grilla del mes */}
                <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                    {/* Encabezado días */}
                    <div className="cal-grid-header">
                        {DIAS.map(d => (
                            <div key={d} className="cal-grid-header-cell">{d}</div>
                        ))}
                    </div>

                    {/* Aviso mes sin eventos */}
                    {eventosDelMes === 0 && licData.length > 0 && (
                        <div style={{
                            padding: '18px 16px', textAlign: 'center',
                            fontSize: '12px', color: '#9aabb8',
                            borderBottom: '1px solid #f0f2f5',
                            background: '#fafbfc',
                        }}>
                            Sin eventos en {MESES[month]} {year}.
                            {mesesConEventos.length > 0 && (
                                <span> Usa los accesos rápidos de arriba para navegar a los meses con datos.</span>
                            )}
                        </div>
                    )}

                    {/* Celdas */}
                    <div className="cal-grid-body">
                        {calDays.map((dayObj, idx) => {
                            const key    = dayKey(dayObj.date);
                            const events = eventMap[key] || [];
                            const hasCierre = events.some(e => e.type === 'cierre');
                            const cierreD   = hasCierre ? new Date(key) : null;
                            const isProx    = cierreD && cierreD >= today && daysLeft(key) <= ALERT_DAYS;

                            const classes = [
                                'cal-day-cell',
                                !dayObj.current   ? 'other-month' : '',
                                isToday(dayObj.date) ? 'is-today' : '',
                                selectedKey === key  ? 'is-selected' : '',
                                isProx               ? 'is-prox' : '',
                                events.length > 0    ? 'has-events' : '',
                            ].filter(Boolean).join(' ');

                            return (
                                <div
                                    key={idx}
                                    className={classes}
                                    onClick={() => {
                                        if (events.length > 0)
                                            setSelectedKey(selectedKey === key ? null : key);
                                    }}
                                >
                                    <div className={`cal-day-num${isToday(dayObj.date) ? ' today' : ''}`}>
                                        {dayObj.date.getDate()}
                                    </div>
                                    {events.slice(0, 3).map((ev, i) => (
                                        <span
                                            key={i}
                                            className="cal-event-pill"
                                            style={{
                                                background: EVENT_CFG[ev.type].bg,
                                                color: EVENT_CFG[ev.type].color,
                                            }}
                                        >
                                            {EVENT_CFG[ev.type].label.slice(0, 5)}: {ev.lic.Nombre?.slice(0, 10)}…
                                        </span>
                                    ))}
                                    {events.length > 3 && (
                                        <span className="cal-event-more">+{events.length - 3} más</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Panel lateral */}
                <div className="cal-side-panel">

                    {/* Detalle del día seleccionado */}
                    {selectedKey && (
                        <div className="card">
                            <div className="card-header card-header-accent">
                                <span style={{ fontSize: '15px' }}>📅</span>
                                <span className="card-title">
                                    {new Date(selectedKey + 'T12:00:00').toLocaleDateString('es-CL', {
                                        weekday: 'long', day: 'numeric', month: 'long',
                                    })}
                                </span>
                                <button
                                    onClick={() => setSelectedKey(null)}
                                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#9aabb8', fontSize: '14px' }}
                                >✕</button>
                            </div>
                            <div className="card-body" style={{ padding: '8px 14px 12px', maxHeight: '320px', overflowY: 'auto' }}>
                                {(() => {
                                    const mostradosDescarga = new Set();
                                    return selectedEvents.map((ev, i) => {
                                        const codigo = ev.lic.codigo_licitacion;
                                        const fechaCierre = ev.lic.FechaCierre ? new Date(ev.lic.FechaCierre) : null;
                                        const cierreYaPaso = fechaCierre && fechaCierre <= new Date();
                                        const puedeDescargar = ev.lic.Estado === 'Cerrada' || cierreYaPaso;
                                        const mostrarBtn = puedeDescargar && !mostradosDescarga.has(codigo);
                                        if (mostrarBtn) mostradosDescarga.add(codigo);
                                        const descarga = descargas[codigo];

                                        return (
                                            <div key={i} className="cal-day-detail-event">
                                                <span style={{
                                                    fontSize: '9px', padding: '2px 7px', borderRadius: '10px',
                                                    background: EVENT_CFG[ev.type].bg,
                                                    color: EVENT_CFG[ev.type].color,
                                                    fontWeight: 700, display: 'inline-block', marginBottom: '4px',
                                                }}>
                                                    {EVENT_CFG[ev.type].label}
                                                </span>
                                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#333', marginTop: '2px' }}>
                                                    {ev.lic.Nombre}
                                                </div>
                                                <div style={{ fontSize: '10px', color: '#9aabb8', fontFamily: 'monospace', marginTop: '2px' }}>
                                                    {codigo}
                                                </div>
                                                {ev.lic.C_Usuario && (
                                                    <div style={{ fontSize: '10px', color: '#6c757d', marginTop: '2px' }}>
                                                        👤 {ev.lic.C_Usuario}
                                                    </div>
                                                )}
                                                {ev.lic.C_Unidad && (
                                                    <div style={{ fontSize: '10px', color: '#6c757d' }}>
                                                        🏥 {ev.lic.C_Unidad}
                                                    </div>
                                                )}
                                                {parseFloat(ev.lic.MontoEstimado) > 0 && (
                                                    <div style={{ fontSize: '10px', color: '#27ae60', fontWeight: 600, marginTop: '2px' }}>
                                                        💰 {fmt(ev.lic.MontoEstimado)}
                                                    </div>
                                                )}
                                                <div style={{ fontSize: '10px', marginTop: '2px' }}>
                                                    <span className="tag tag-gris" style={{ fontSize: '9px' }}>{ev.lic.Estado}</span>
                                                    {ev.lic.Tipo && <span className="tag tag-azul" style={{ fontSize: '9px', marginLeft: '4px' }}>{ev.lic.Tipo}</span>}
                                                </div>

                                                {mostrarBtn && (
                                                    <div style={{ marginTop: '8px' }}>
                                                        {!descarga || descarga.status === undefined ? (
                                                            <button
                                                                onClick={() => iniciarDescarga(codigo)}
                                                                style={{
                                                                    fontSize: '10px', padding: '4px 12px',
                                                                    background: '#1a3d71', color: '#fff',
                                                                    border: 'none', borderRadius: '4px',
                                                                    cursor: 'pointer', fontWeight: 600,
                                                                }}
                                                            >
                                                                ↓ Descargar Ofertas
                                                            </button>
                                                        ) : descarga.status === 'iniciado' || descarga.status === 'en_proceso' ? (
                                                            <div style={{
                                                                fontSize: '10px', color: '#e67e22', fontWeight: 600,
                                                                display: 'flex', alignItems: 'center', gap: '5px',
                                                            }}>
                                                                <span style={{
                                                                    display: 'inline-block', width: '10px', height: '10px',
                                                                    border: '2px solid #e67e22', borderTopColor: 'transparent',
                                                                    borderRadius: '50%',
                                                                    animation: 'spin 0.8s linear infinite',
                                                                }} />
                                                                Descargando... Chrome abierto
                                                            </div>
                                                        ) : descarga.status === 'completado' ? (
                                                            <div style={{ fontSize: '10px', color: '#27ae60' }}>
                                                                <div style={{ fontWeight: 700 }}>✓ Listo en el servidor</div>
                                                                {descarga.rutaZip ? (
                                                                    <button
                                                                        onClick={() => descargarZip(codigo)}
                                                                        style={{
                                                                            marginTop: '4px', fontSize: '10px', padding: '4px 12px',
                                                                            background: '#27ae60', color: '#fff',
                                                                            border: 'none', borderRadius: '4px',
                                                                            cursor: 'pointer', fontWeight: 600,
                                                                        }}
                                                                    >
                                                                        ⭳ Descargar ZIP
                                                                    </button>
                                                                ) : (
                                                                    <div style={{ color: '#e67e22', marginTop: '2px' }}>
                                                                        No se generó ZIP (revisa la carpeta en el servidor).
                                                                    </div>
                                                                )}
                                                                <button
                                                                    onClick={() => iniciarDescarga(codigo)}
                                                                    style={{
                                                                        marginTop: '4px', marginLeft: '6px', fontSize: '9px', padding: '2px 8px',
                                                                        background: 'none', color: '#1a3d71',
                                                                        border: '1px solid #1a3d71', borderRadius: '3px',
                                                                        cursor: 'pointer',
                                                                    }}
                                                                >
                                                                    Volver a descargar
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div style={{ fontSize: '10px', color: '#e74c3c' }}>
                                                                <div style={{ fontWeight: 700 }}>✕ Error en descarga</div>
                                                                <div style={{ color: '#666', marginTop: '2px' }}>
                                                                    {descarga.error}
                                                                </div>
                                                                <button
                                                                    onClick={() => iniciarDescarga(codigo)}
                                                                    style={{
                                                                        marginTop: '4px', fontSize: '9px', padding: '2px 8px',
                                                                        background: 'none', color: '#e74c3c',
                                                                        border: '1px solid #e74c3c', borderRadius: '3px',
                                                                        cursor: 'pointer',
                                                                    }}
                                                                >
                                                                    Reintentar
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    )}

                    {/* Cierres próximos 30 días */}
                    <div className="card">
                        <div className="card-header card-header-accent">
                            <span style={{ fontSize: '15px' }}>⚠️</span>
                            <span className="card-title">Cierres próximos {ALERT_DAYS} días</span>
                            {proximos.length > 0 && (
                                <span style={{
                                    marginLeft: 'auto', background: '#fdecea', color: '#e74c3c',
                                    borderRadius: '10px', fontSize: '11px', fontWeight: 700,
                                    padding: '1px 8px',
                                }}>
                                    {proximos.length}
                                </span>
                            )}
                        </div>
                        <div className="card-body" style={{ padding: '6px 14px 10px', maxHeight: '420px', overflowY: 'auto' }}>
                            {proximos.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#aaa', padding: '24px 0', fontSize: '12px' }}>
                                    Sin cierres en los próximos {ALERT_DAYS} días
                                </div>
                            ) : proximos.map((lic, i) => {
                                const dias    = daysLeft(lic.FechaCierre);
                                const urgente = dias <= 7;
                                return (
                                    <div key={lic.codigo_licitacion} className="cal-prox-item">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                            <span className="cal-prox-badge" style={{
                                                background: urgente ? '#fdecea' : '#fff9ed',
                                                color: urgente ? '#e74c3c' : '#f39c12',
                                            }}>
                                                {dias === 0 ? '¡Hoy!' : `${dias}d`}
                                            </span>
                                            <span style={{ fontSize: '10px', color: '#9aabb8', fontFamily: 'monospace' }}>
                                                {new Date(lic.FechaCierre).toLocaleDateString('es-CL')}
                                            </span>
                                        </div>
                                        <div style={{
                                            fontSize: '12px', fontWeight: 600, color: '#333',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }} title={lic.Nombre}>
                                            {lic.Nombre}
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#9aabb8', marginTop: '1px' }}>
                                            {lic.Estado}
                                            {lic.C_Unidad ? ` · ${lic.C_Unidad}` : ''}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
