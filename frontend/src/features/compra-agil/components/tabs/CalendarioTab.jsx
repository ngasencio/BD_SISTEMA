import React, { useState, useMemo, useEffect, useRef } from 'react';
import apiClient from '../../../../lib/axios';

const DIAS  = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];
const MESES = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const EVENT_CFG = {
    pub:    { label: 'Publicación',   color: '#27ae60', bg: '#eafaf1', field: 'fechapublicacion' },
    cierre: { label: 'Cierre',        color: '#e74c3c', bg: '#fdecea', field: 'fechacierre'       },
    cambio: { label: 'Último Cambio', color: '#2980b9', bg: '#e8f4fb', field: 'fechaultimocambio' },
};

const EVENT_GROUPS = [
    { label: 'Publicación',   color: '#27ae60' },
    { label: 'Cierre',        color: '#e74c3c' },
    { label: 'Último Cambio', color: '#2980b9' },
];

const ALERT_DAYS = 30;

const toLocalKey = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtHora = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
};

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(n) || 0);

export default function CalendarioTab() {
    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    // ── Datos propios del calendario ──────────────────────────────
    const anioActual = today.getFullYear();
    const [anioSel, setAnioSel]               = useState(anioActual);
    const [caData, setCaData]                 = useState([]);
    const [loadingCa, setLoadingCa]           = useState(false);
    const [errorCa, setErrorCa]               = useState(null);
    const [anosCalendario, setAnosCalendario] = useState([]);

    useEffect(() => {
        apiClient.get('compraagil/anos-calendario/')
            .then(res => {
                const anos = res.data || [];
                setAnosCalendario(anos);
                if (anos.length > 0 && !anos.includes(anioActual)) {
                    setAnioSel(anos[0]);
                }
            })
            .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setLoadingCa(true);
        setErrorCa(null);
        setSelectedKey(null);
        apiClient.get('compraagil/calendario/', { params: { anio: anioSel } })
            .then(res => setCaData(res.data || []))
            .catch(() => setErrorCa('Error al cargar el calendario.'))
            .finally(() => setLoadingCa(false));
    }, [anioSel]);

    // ── Estado de la vista ────────────────────────────────────────
    const [viewDate, setViewDate] = useState(
        () => new Date(today.getFullYear(), today.getMonth(), 1)
    );
    const [selectedKey, setSelectedKey] = useState(null);
    const autoNavDone = useRef(false);

    useEffect(() => { autoNavDone.current = false; }, [anioSel]);

    const year  = viewDate.getFullYear();
    const month = viewDate.getMonth();

    // ── Mapa de eventos ───────────────────────────────────────────
    const eventMap = useMemo(() => {
        const map = {};
        caData.forEach(ca => {
            Object.entries(EVENT_CFG).forEach(([type, cfg]) => {
                const key = toLocalKey(ca[cfg.field]);
                if (!key) return;
                if (!map[key]) map[key] = [];
                map[key].push({ type, ca });
            });
        });
        return map;
    }, [caData]);

    // ── Meses con eventos ─────────────────────────────────────────
    const mesesConEventos = useMemo(() => {
        const months = new Set(Object.keys(eventMap).map(k => k.slice(0, 7)));
        return [...months].sort();
    }, [eventMap]);

    // ── Auto-navegar al mes más cercano con datos ─────────────────
    useEffect(() => {
        if (autoNavDone.current || caData.length === 0 || mesesConEventos.length === 0) return;
        const todayYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        if (!mesesConEventos.includes(todayYM)) {
            const future = mesesConEventos.filter(m => m >= todayYM);
            const target = future.length > 0 ? future[0] : mesesConEventos[mesesConEventos.length - 1];
            const [y, m] = target.split('-').map(Number);
            setViewDate(new Date(y, m - 1, 1));
        }
        autoNavDone.current = true;
    }, [mesesConEventos, caData.length, today]);

    // ── Días del mes ──────────────────────────────────────────────
    const calDays = useMemo(() => {
        const firstDow  = new Date(year, month, 1).getDay();
        const leadEmpty = firstDow === 0 ? 6 : firstDow - 1;
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

    // ── Cierres próximos ──────────────────────────────────────────
    const proximos = useMemo(() => {
        const limit = new Date(today);
        limit.setDate(limit.getDate() + ALERT_DAYS);
        return caData
            .filter(c => {
                if (!c.fechacierre) return false;
                const d = new Date(c.fechacierre);
                return d >= today && d <= limit;
            })
            .sort((a, b) => new Date(a.fechacierre) - new Date(b.fechacierre));
    }, [caData, today]);

    // ── Helpers ───────────────────────────────────────────────────
    const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
    const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
    const goToday   = () => { setViewDate(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedKey(null); };
    const dayKey    = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isToday   = (d) => d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    const daysLeft  = (dateStr) => Math.ceil((new Date(dateStr) - today) / 86400000);

    const selectedEvents = selectedKey ? (eventMap[selectedKey] || []) : [];
    const eventosDelMes  = useMemo(() =>
        calDays.filter(d => d.current).reduce((acc, d) => acc + (eventMap[dayKey(d.date)]?.length || 0), 0),
    [calDays, eventMap]);

    return (
        <div className="tab-view active">

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
                {loadingCa && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#9aabb8', marginLeft: '4px' }}>
                        <span style={{ width: '10px', height: '10px', border: '2px solid #9aabb8', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                        Cargando {anioSel}…
                    </span>
                )}
                {errorCa && <span style={{ fontSize: '11px', color: '#e74c3c', marginLeft: '4px' }}>{errorCa}</span>}
                {!loadingCa && !errorCa && caData.length > 0 && (
                    <span style={{ fontSize: '11px', color: '#9aabb8', marginLeft: '4px' }}>{caData.length} compras</span>
                )}
            </div>

            {/* ── Barra de navegación ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <button className="tab-btn" onClick={prevMonth}>← Anterior</button>
                <h3 style={{ flex: 1, textAlign: 'center', margin: 0, fontSize: '16px', fontWeight: 700, color: '#1a3d71', textTransform: 'capitalize' }}>
                    {MESES[month]} {year}
                    <span style={{ fontSize: '12px', fontWeight: 400, color: '#9aabb8', marginLeft: '8px' }}>
                        ({eventosDelMes} eventos este mes)
                    </span>
                </h3>
                <button className="tab-btn" onClick={nextMonth}>Siguiente →</button>
                <button className="tab-btn active" onClick={goToday}>Hoy</button>
            </div>

            {/* ── Selector rápido de meses ── */}
            {mesesConEventos.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#9aabb8', fontWeight: 600, flexShrink: 0 }}>Ir a:</span>
                    {mesesConEventos.map(ym => {
                        const [y, m] = ym.split('-').map(Number);
                        const isActive = y === year && m === month + 1;
                        const count = Object.keys(eventMap).filter(k => k.startsWith(ym)).reduce((acc, k) => acc + eventMap[k].length, 0);
                        return (
                            <button key={ym} className={`tab-btn${isActive ? ' active' : ''}`}
                                style={{ fontSize: '11px', padding: '3px 9px' }}
                                onClick={() => { setViewDate(new Date(y, m - 1, 1)); setSelectedKey(null); }}>
                                {MESES[m - 1].slice(0, 3)} {y}
                                <span style={{ opacity: 0.65, marginLeft: '4px' }}>({count})</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── Leyenda ── */}
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {EVENT_GROUPS.map((grp, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: grp.color, fontWeight: 600 }}>
                        <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: grp.color, display: 'inline-block' }} />
                        {grp.label}
                    </span>
                ))}
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#f39c12' }}>
                    <span style={{ width: '12px', height: '8px', background: '#fff9ed', border: '1px solid #f39c12', borderRadius: '2px', display: 'inline-block' }} />
                    Cierre en ≤{ALERT_DAYS} días
                </span>
            </div>

            {/* ── Layout ── */}
            <div className="cal-layout">

                {/* Grilla */}
                <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                    <div className="cal-grid-header">
                        {DIAS.map(d => <div key={d} className="cal-grid-header-cell">{d}</div>)}
                    </div>

                    {eventosDelMes === 0 && caData.length > 0 && (
                        <div style={{ padding: '18px 16px', textAlign: 'center', fontSize: '12px', color: '#9aabb8', borderBottom: '1px solid #f0f2f5', background: '#fafbfc' }}>
                            Sin eventos en {MESES[month]} {year}.
                            {mesesConEventos.length > 0 && <span> Usa los accesos rápidos de arriba.</span>}
                        </div>
                    )}

                    <div className="cal-grid-body">
                        {calDays.map((dayObj, idx) => {
                            const key    = dayKey(dayObj.date);
                            const events = eventMap[key] || [];
                            const hasCierre = events.some(e => e.type === 'cierre');
                            const cierreD   = hasCierre ? new Date(key) : null;
                            const isProx    = cierreD && cierreD >= today && daysLeft(key) <= ALERT_DAYS;

                            const classes = [
                                'cal-day-cell',
                                !dayObj.current       ? 'other-month' : '',
                                isToday(dayObj.date)  ? 'is-today'    : '',
                                selectedKey === key   ? 'is-selected' : '',
                                isProx                ? 'is-prox'     : '',
                                events.length > 0     ? 'has-events'  : '',
                            ].filter(Boolean).join(' ');

                            return (
                                <div key={idx} className={classes}
                                    onClick={() => { if (events.length > 0) setSelectedKey(selectedKey === key ? null : key); }}>
                                    <div className={`cal-day-num${isToday(dayObj.date) ? ' today' : ''}`}>
                                        {dayObj.date.getDate()}
                                    </div>
                                    {events.slice(0, 3).map((ev, i) => (
                                        <span key={i} className="cal-event-pill"
                                            style={{ background: EVENT_CFG[ev.type].bg, color: EVENT_CFG[ev.type].color }}>
                                            {EVENT_CFG[ev.type].label.slice(0, 5)}: {ev.ca.nombre?.slice(0, 10)}…
                                        </span>
                                    ))}
                                    {events.length > 3 && <span className="cal-event-more">+{events.length - 3} más</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Panel lateral */}
                <div className="cal-side-panel">

                    {/* Detalle del día */}
                    {selectedKey && (
                        <div className="card">
                            <div className="card-header card-header-accent">
                                <span style={{ fontSize: '15px' }}>📅</span>
                                <span className="card-title">
                                    {new Date(selectedKey + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                                </span>
                                <button onClick={() => setSelectedKey(null)}
                                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#9aabb8', fontSize: '14px' }}>✕</button>
                            </div>
                            <div className="card-body" style={{ padding: '8px 14px 12px', maxHeight: '340px', overflowY: 'auto' }}>
                                {selectedEvents.map((ev, i) => (
                                    <div key={i} className="cal-day-detail-event">
                                        <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '10px', background: EVENT_CFG[ev.type].bg, color: EVENT_CFG[ev.type].color, fontWeight: 700, display: 'inline-block', marginBottom: '4px' }}>
                                            {EVENT_CFG[ev.type].label}
                                            {ev.ca[EVENT_CFG[ev.type].field] && (
                                                <span style={{ fontWeight: 400, marginLeft: '4px' }}>
                                                    {fmtHora(ev.ca[EVENT_CFG[ev.type].field])}
                                                </span>
                                            )}
                                        </span>
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#333', marginTop: '2px' }}>
                                            {ev.ca.nombre}
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#9aabb8', fontFamily: 'monospace', marginTop: '2px' }}>
                                            {ev.ca.codigocompraagil}
                                        </div>
                                        {ev.ca.unidadcompra && (
                                            <div style={{ fontSize: '10px', color: '#6c757d', marginTop: '2px' }}>
                                                🏥 {ev.ca.unidadcompra}
                                            </div>
                                        )}
                                        {Number(ev.ca.presupuestoestimado) > 0 && (
                                            <div style={{ fontSize: '10px', color: '#27ae60', fontWeight: 600, marginTop: '2px' }}>
                                                💰 {fmt(ev.ca.presupuestoestimado)}
                                            </div>
                                        )}
                                        <div style={{ fontSize: '10px', marginTop: '2px' }}>
                                            <span className="tag tag-gris" style={{ fontSize: '9px' }}>{ev.ca.estadoglosa}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Cierres próximos */}
                    <div className="card">
                        <div className="card-header card-header-accent">
                            <span style={{ fontSize: '15px' }}>⚠️</span>
                            <span className="card-title">Cierres próximos {ALERT_DAYS} días</span>
                            {proximos.length > 0 && (
                                <span style={{ marginLeft: 'auto', background: '#fdecea', color: '#e74c3c', borderRadius: '10px', fontSize: '11px', fontWeight: 700, padding: '1px 8px' }}>
                                    {proximos.length}
                                </span>
                            )}
                        </div>
                        <div className="card-body" style={{ padding: '6px 14px 10px', maxHeight: '420px', overflowY: 'auto' }}>
                            {proximos.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#aaa', padding: '24px 0', fontSize: '12px' }}>
                                    Sin cierres en los próximos {ALERT_DAYS} días
                                </div>
                            ) : proximos.map((ca, i) => {
                                const dias    = daysLeft(ca.fechacierre);
                                const urgente = dias <= 7;
                                return (
                                    <div key={ca.codigocompraagil || i} className="cal-prox-item">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                            <span className="cal-prox-badge" style={{ background: urgente ? '#fdecea' : '#fff9ed', color: urgente ? '#e74c3c' : '#f39c12' }}>
                                                {dias === 0 ? '¡Hoy!' : `${dias}d`}
                                            </span>
                                            <span style={{ fontSize: '10px', color: '#9aabb8', fontFamily: 'monospace' }}>
                                                {new Date(ca.fechacierre).toLocaleDateString('es-CL')}
                                                {' '}
                                                <span style={{ color: '#1a3d71', fontWeight: 600 }}>{fmtHora(ca.fechacierre)}</span>
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ca.nombre}>
                                            {ca.nombre}
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#9aabb8', marginTop: '1px' }}>
                                            {ca.estadoglosa}{ca.unidadcompra ? ` · ${ca.unidadcompra}` : ''}
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
