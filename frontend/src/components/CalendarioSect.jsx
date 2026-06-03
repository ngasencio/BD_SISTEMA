import React, { useState, useMemo } from 'react';

const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

const MESES = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const EVENT_CFG = {
    cierre: { label: 'Cierre',        color: '#e74c3c', bg: '#fdecea', field: 'FechaCierre' },
    adj:    { label: 'Adj. Estimada', color: '#1a3d71', bg: '#e8edf5', field: 'FechaEstimadaAdjudicacion' },
    pub:    { label: 'Publicación',   color: '#27ae60', bg: '#eafaf1', field: 'FechaPublicacion' },
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

export default function CalendarioSect({ licitaciones = [] }) {
    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    const [viewDate, setViewDate] = useState(
        () => new Date(today.getFullYear(), today.getMonth(), 1)
    );
    const [selectedKey, setSelectedKey] = useState(null);

    const year  = viewDate.getFullYear();
    const month = viewDate.getMonth();

    /* ── Mapa de eventos: 'YYYY-MM-DD' → [{type, lic}] ── */
    const eventMap = useMemo(() => {
        const map = {};
        licitaciones.forEach(lic => {
            Object.entries(EVENT_CFG).forEach(([type, cfg]) => {
                const key = toLocalKey(lic[cfg.field]);
                if (!key) return;
                if (!map[key]) map[key] = [];
                map[key].push({ type, lic });
            });
        });
        return map;
    }, [licitaciones]);

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
        return licitaciones
            .filter(l => {
                if (!l.FechaCierre) return false;
                const d = new Date(l.FechaCierre);
                return d >= today && d <= limit;
            })
            .sort((a, b) => new Date(a.FechaCierre) - new Date(b.FechaCierre));
    }, [licitaciones, today]);

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

            {/* ── Leyenda ── */}
            <div className="cal-legend">
                {Object.entries(EVENT_CFG).map(([key, cfg]) => (
                    <span key={key} className="cal-legend-item" style={{ color: cfg.color }}>
                        <span className="cal-legend-dot" style={{ background: cfg.color }} />
                        {cfg.label}
                    </span>
                ))}
                <span className="cal-legend-item" style={{ color: '#f39c12' }}>
                    <span className="cal-legend-dot" style={{
                        background: '#fff9ed',
                        border: '1px solid #f39c12',
                        borderRadius: '3px',
                    }} />
                    Próximo a vencer (≤{ALERT_DAYS} días)
                </span>
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
                                {selectedEvents.map((ev, i) => (
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
                                            {ev.lic.codigo_licitacion}
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
                                    </div>
                                ))}
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
