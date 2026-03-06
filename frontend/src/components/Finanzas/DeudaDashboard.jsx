import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Chart as ChartJS,
    ArcElement, BarElement, LineElement, PointElement,
    CategoryScale, LinearScale, Tooltip, Legend, Filler
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import api from '../../api';

ChartJS.register(ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

// ── Paleta institucional ──────────────────────────────────────────────────────
const COLORS = {
    azul: '#1a3d71', azulMid: '#1e4d8c', azulLight: '#2c6bbf',
    celeste: '#6bccd6', rojo: '#c0392b', naranja: '#e67e22',
    amarillo: '#f39c12', verde: '#27ae60',
};
const CHART_COLORS = [
    '#1a3d71', '#c0392b', '#27ae60', '#e67e22', '#6bccd6',
    '#8e44ad', '#f39c12', '#2980b9', '#16a085', '#d35400',
];

// ── Formateadores ─────────────────────────────────────────────────────────────
const fmtM = (v) => {
    if (!v && v !== 0) return '—';
    const n = Math.abs(v);
    if (n >= 1e9) return `$${(v / 1e9).toFixed(2)} MM`;
    if (n >= 1e6) return `$${(v / 1e6).toFixed(1)} M`;
    if (n >= 1e3) return `$${(v / 1e3).toFixed(0)} K`;
    return `$${v.toFixed(0)}`;
};
const fmt$ = (v) =>
    v != null ? `$${Number(v).toLocaleString('es-CL')}` : '—';
const daysSince = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return Math.floor((Date.now() - d) / 86400000);
};

// ── Umbrales de alerta configurables ─────────────────────────────────────────
const DEFAULT_THRESHOLDS = { critico: 500e6, alto: 100e6, medio: 50e6, dias: 60, var: 20 };

// ── UEs disponibles ────────────────────────────────────────────────────────────
const UE_OPTIONS = [
    { value: '', label: 'Servicio Salud Osorno (Agregado)' },
    { value: '1638001 Direccion del Servicio', label: '1638001 Dirección del Servicio' },
    { value: '1638002 Hospital de Osorno', label: '1638002 Hospital de Osorno' },
    { value: '1638003 Hospital Puerto Octay', label: '1638003 Hospital Puerto Octay' },
    { value: '1638004 Hospital Purranque', label: '1638004 Hospital Purranque' },
    { value: '1638005 Hospital de Rio Negro', label: '1638005 Hospital Río Negro' },
    { value: '1638006 Hospital Mision San Juan de la Costa', label: '1638006 H. Misión San Juan' },
    { value: '1638007 Hospital del Perpetuo Socorro de Quilacahuin', label: '1638007 H. Perpetuo Socorro' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function DeudaDashboard() {
    const [rawData, setRawData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('kpis');
    const [filterUE, setFilterUE] = useState('');
    const [filterN1, setFilterN1] = useState('');
    const [filterDeuda, setFilterDeuda] = useState('1');
    const [filterOrigen, setFilterOrigen] = useState('');
    const [searchDetalle, setSearchDetalle] = useState('');
    const [filterTD, setFilterTD] = useState('');
    const [sortDetalle, setSortDetalle] = useState('d_desc');
    const [pageDetalle, setPageDetalle] = useState(1);
    const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
    const [showModal, setShowModal] = useState(false);
    const [filterAlerta, setFilterAlerta] = useState('');
    const [agTramo, setAgTramo] = useState('');
    const [agUE, setAgUE] = useState('');
    const [pageAg, setPageAg] = useState(1);
    const PAGE_SIZE = 50;

    // ── Cargar datos desde el backend ────────────────────────────────────────────
    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                // Carga paginada: traemos todos los registros
                let allData = [];
                let url = 'devengo/?page_size=1000';   // sin slash inicial → relativo al baseURL
                while (url) {
                    const res = await api.get(url);
                    const body = res.data;
                    if (Array.isArray(body)) {
                        allData = allData.concat(body);
                        url = null;
                    } else {
                        allData = allData.concat(body.results || []);
                        if (body.next) {
                            // Extraer solo el path+query a partir de /api/
                            const match = body.next.match(/\/api\/(.*)/);
                            url = match ? match[1] : null;
                        } else {
                            url = null;
                        }
                    }
                }
                // Normalizar campos
                const normalized = allData.map(r => ({
                    ue: r.codigo_ue || '',
                    prov: r.principal || '',
                    td: r.tipo_documento || '',
                    fc: r.fecha_conforme || '',
                    cc: r.id_chile_compra ? 1 : 0,
                    c01: r.catalogo_01 || '',
                    c04: r.catalogo_04 || '',
                    cp: r.concepto_presupuestario || '',
                    n1: r.catalogo_02 || (r.concepto_presupuestario || '').split(' ').slice(0, 2).join(' '),
                    v: parseFloat(r.monto_vigente) || 0,
                    d: parseFloat(r.monto_disponible) || 0,
                    c: parseFloat(r.monto_consumido) || 0,
                }));
                setRawData(normalized);
            } catch (err) {
                setError('Error cargando datos: ' + (err.response?.data?.detail || err.message));
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // ── Filtrado ─────────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        return rawData.filter(r => {
            if (filterUE && r.ue !== filterUE) return false;
            if (filterN1 && r.n1 !== filterN1) return false;
            if (filterDeuda === '1' && r.d <= 0) return false;
            if (filterOrigen === '1' && !r.cc) return false;
            if (filterOrigen === '0' && r.cc) return false;
            return true;
        });
    }, [rawData, filterUE, filterN1, filterDeuda, filterOrigen]);

    // ── KPIs ─────────────────────────────────────────────────────────────────────
    const kpis = useMemo(() => {
        const totalDeuda = filtered.reduce((s, r) => s + r.d, 0);
        const totalPagada = filtered.reduce((s, r) => s + r.c, 0);
        const totalVigente = filtered.reduce((s, r) => s + r.v, 0);
        const pct = totalVigente > 0 ? (totalDeuda / totalVigente * 100).toFixed(1) : 0;
        // Top proveedor
        const byProv = {};
        filtered.forEach(r => { byProv[r.prov] = (byProv[r.prov] || 0) + r.d; });
        const topProvEntry = Object.entries(byProv).sort((a, b) => b[1] - a[1])[0];
        // Top UE
        const byUE = {};
        filtered.forEach(r => { byUE[r.ue] = (byUE[r.ue] || 0) + r.d; });
        const topUEEntry = Object.entries(byUE).sort((a, b) => b[1] - a[1])[0];
        // Alertas críticas
        const alertas = Object.entries(byProv).filter(([, v]) => v >= thresholds.critico).length;
        return { totalDeuda, totalPagada, totalVigente, pct, topProvEntry, topUEEntry, alertas, byProv, byUE };
    }, [filtered, thresholds]);

    // ── N1 únicos para el filtro ───────────────────────────────────────────────
    const n1Options = useMemo(() => [...new Set(rawData.map(r => r.n1))].filter(Boolean).sort(), [rawData]);

    // ── Datos para gráficos ───────────────────────────────────────────────────
    const chartDataUE = useMemo(() => {
        const sorted = Object.entries(kpis.byUE).sort((a, b) => b[1] - a[1]).slice(0, 8);
        return {
            labels: sorted.map(([k]) => k.replace(/\d{7}\s/, '')),
            datasets: [{
                label: 'Deuda Pendiente', data: sorted.map(([, v]) => v / 1e6),
                backgroundColor: CHART_COLORS, borderRadius: 6
            }],
        };
    }, [kpis.byUE]);

    const chartDataEstado = useMemo(() => ({
        labels: ['Pagado', 'Pendiente'],
        datasets: [{
            data: [kpis.totalPagada, kpis.totalDeuda],
            backgroundColor: [COLORS.verde, COLORS.rojo],
            borderWidth: 0,
        }],
    }), [kpis]);

    // ── Tabla detalle filtrada y ordenada ─────────────────────────────────────
    const detalleData = useMemo(() => {
        let data = filtered;
        if (searchDetalle) {
            const q = searchDetalle.toLowerCase();
            data = data.filter(r => r.prov.toLowerCase().includes(q) || r.cp.toLowerCase().includes(q));
        }
        if (filterTD) data = data.filter(r => r.td === filterTD);
        data = [...data].sort((a, b) => {
            if (sortDetalle === 'd_desc') return b.d - a.d;
            if (sortDetalle === 'd_asc') return a.d - b.d;
            if (sortDetalle === 'fc_desc') return (b.fc || '').localeCompare(a.fc || '');
            return (a.fc || '').localeCompare(b.fc || '');
        });
        return data;
    }, [filtered, searchDetalle, filterTD, sortDetalle]);

    const tiposDocUnicos = useMemo(() => [...new Set(rawData.map(r => r.td))].filter(Boolean).sort(), [rawData]);

    // ── Antigüedad ────────────────────────────────────────────────────────────
    const antigData = useMemo(() => {
        const conFecha = filtered.filter(r => r.d > 0 && r.fc);
        const getBucket = (dias) => {
            if (dias <= 30) return '0-30';
            if (dias <= 60) return '31-60';
            if (dias <= 90) return '61-90';
            return '91+';
        };
        const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '91+': 0 };
        const bucketsMonto = { '0-30': 0, '31-60': 0, '61-90': 0, '91+': 0 };
        let sumDias = 0, count = 0;
        conFecha.forEach(r => {
            const d = daysSince(r.fc);
            if (d == null) return;
            const b = getBucket(d);
            buckets[b]++;
            bucketsMonto[b] += r.d;
            sumDias += d;
            count++;
        });
        const promDias = count > 0 ? Math.round(sumDias / count) : 0;
        const mas60 = (buckets['61-90'] || 0) + (buckets['91+'] || 0);
        return { buckets, bucketsMonto, promDias, mas60, total030: buckets['0-30'], total3160: buckets['31-60'], conFecha };
    }, [filtered]);

    // ── Conceptos ─────────────────────────────────────────────────────────────
    const conceptoData = useMemo(() => {
        const byCp = {};
        filtered.forEach(r => {
            if (!byCp[r.cp]) byCp[r.cp] = { v: 0, d: 0, c: 0, n1: r.n1, docs: 0 };
            byCp[r.cp].v += r.v; byCp[r.cp].d += r.d; byCp[r.cp].c += r.c; byCp[r.cp].docs++;
        });
        return Object.entries(byCp)
            .map(([cp, vals]) => ({ cp, ...vals, pct: vals.v > 0 ? ((vals.d / vals.v) * 100).toFixed(1) : 0 }))
            .sort((a, b) => b.d - a.d);
    }, [filtered]);

    // ── Alertas ───────────────────────────────────────────────────────────────
    const alertasData = useMemo(() => {
        return Object.entries(kpis.byProv)
            .filter(([, v]) => v > 0)
            .map(([prov, deuda]) => {
                let nivel = null;
                if (deuda >= thresholds.critico) nivel = 'critica';
                else if (deuda >= thresholds.alto) nivel = 'alta';
                else if (deuda >= thresholds.medio) nivel = 'media';
                return nivel ? { prov, deuda, nivel } : null;
            })
            .filter(Boolean)
            .filter(a => !filterAlerta || a.nivel === filterAlerta)
            .sort((a, b) => b.deuda - a.deuda);
    }, [kpis.byProv, thresholds, filterAlerta]);

    // ── Top proveedores ───────────────────────────────────────────────────────
    const topProveedores = useMemo(() =>
        Object.entries(kpis.byProv).sort((a, b) => b[1] - a[1]).slice(0, 10),
        [kpis.byProv]
    );

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
                <div style={{ width: 48, height: 48, border: `5px solid ${COLORS.azul}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <div style={{ fontSize: 14, color: '#6c757d' }}>Cargando datos de devengo…</div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (error) {
        return (
            <div className="alert alert-danger" style={{ margin: 24 }}>
                <span className="alert-icon">⚠️</span>
                <div><strong>Error al cargar datos</strong><div>{error}</div></div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    return (
        <div>
            {/* TOPBAR BREADCRUMB */}
            <div className="topbar">
                <div className="topbar-breadcrumb">
                    <span>💰 Finanzas</span><span className="bc-sep">/</span>
                    <span>📊 Reportes</span><span className="bc-sep">/</span>
                    <span className="bc-current">📋 Anexo N°3 — Control de Deuda</span>
                </div>
                <div className="topbar-spacer" />
                <button className="btn btn-secondary btn-sm no-print" onClick={() => setShowModal(true)}>⚙️ Umbrales</button>
                <button className="btn btn-primary btn-sm no-print" onClick={() => window.print()}>🖨️ Exportar PDF</button>
                <div className="topbar-status"><span className="dot" />{rawData.length.toLocaleString()} registros</div>
            </div>

            <div className="content">
                {/* PAGE HEADER */}
                <div className="page-header">
                    <div className="page-title">📋 Anexo N°3 — Análisis y Control de Deuda</div>
                    <div className="page-subtitle">Servicio de Salud Osorno · Devengo consolidado · Período de análisis 2025–2026</div>
                    <div className="page-meta-tags" style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <span className="tag tag-azul">SSO · Código 7296</span>
                        <span className="tag tag-gris">{filterUE || 'Todos los establecimientos'}</span>
                        <span className="tag tag-naranja">{rawData.length.toLocaleString()} registros total</span>
                        <span className="tag tag-celeste">{filtered.length.toLocaleString()} con filtros</span>
                    </div>
                </div>

                {/* FILTROS */}
                <div className="filter-zone">
                    <div className="filter-zone-title">🔎 Filtros de análisis</div>
                    <div className="filter-row">
                        <div className="filter-group">
                            <label className="filter-label">Unidad Ejecutora</label>
                            <select className="filter-input" value={filterUE} onChange={e => setFilterUE(e.target.value)}>
                                {UE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="filter-group">
                            <label className="filter-label">Concepto N1</label>
                            <select className="filter-input" value={filterN1} onChange={e => setFilterN1(e.target.value)}>
                                <option value="">Todos</option>
                                {n1Options.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div className="filter-group">
                            <label className="filter-label">Con deuda pendiente</label>
                            <select className="filter-input" value={filterDeuda} onChange={e => setFilterDeuda(e.target.value)}>
                                <option value="1">Sí — Monto Disponible &gt; 0</option>
                                <option value="0">No — todos los registros</option>
                            </select>
                        </div>
                        <div className="filter-group">
                            <label className="filter-label">Origen</label>
                            <select className="filter-input" value={filterOrigen} onChange={e => setFilterOrigen(e.target.value)}>
                                <option value="">Todos</option>
                                <option value="1">Mercado Público</option>
                                <option value="0">Otras fuentes</option>
                            </select>
                        </div>
                        <div className="filter-group" style={{ alignSelf: 'flex-end' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => { setFilterUE(''); setFilterN1(''); setFilterDeuda('1'); setFilterOrigen(''); }}>
                                ↩ Limpiar
                            </button>
                        </div>
                    </div>
                </div>

                {/* TABS */}
                <div className="tabs-bar">
                    {[
                        ['kpis', '📊 KPIs y Resumen'],
                        ['alertas', '🚨 Centro de Alertas'],
                        ['detalle', '📋 Detalle Registros'],
                        ['antiguedad', '📅 Antigüedad Deuda'],
                        ['concepto', '🗂️ Concepto Presupuestario'],
                    ].map(([id, label]) => (
                        <button key={id} className={`tab-btn ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
                            {label}
                            {id === 'alertas' && alertasData.length > 0 && (
                                <span style={{ marginLeft: 6, background: COLORS.rojo, color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
                                    {alertasData.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* ═══ TAB KPIs ═══ */}
                {activeTab === 'kpis' && (
                    <div>
                        <div className="kpi-grid">
                            <KPICard color="rojo" icon="💳" label="Deuda Total Pendiente" value={fmtM(kpis.totalDeuda)} meta={`${fmt$(kpis.totalDeuda)}`} />
                            <KPICard color="verde" icon="✅" label="Deuda Pagada" value={fmtM(kpis.totalPagada)} meta="Monto Consumido" />
                            <KPICard color="azul" icon="📦" label="Monto Vigente Total" value={fmtM(kpis.totalVigente)} meta="Total facturado" />
                            <KPICard color="amarillo" icon="📉" label="% Deuda Pendiente" value={`${kpis.pct}%`} meta="Sobre total facturado" />
                        </div>
                        <div className="kpi-grid">
                            <KPICard color="naranja" icon="👤" label="Proveedor Mayor Deuda"
                                value={kpis.topProvEntry ? kpis.topProvEntry[0].substring(0, 30) : '—'}
                                meta={kpis.topProvEntry ? fmtM(kpis.topProvEntry[1]) : ''} valueFontSize={13} />
                            <KPICard color="celeste" icon="🏥" label="Establecimiento Mayor Deuda"
                                value={kpis.topUEEntry ? kpis.topUEEntry[0].replace(/\d{7}\s/, '') : '—'}
                                meta={kpis.topUEEntry ? fmtM(kpis.topUEEntry[1]) : ''} valueFontSize={13} />
                            <KPICard color="azul" icon="📂" label="Registros Analizados" value={filtered.length.toLocaleString()} meta="Con filtros aplicados" />
                            <KPICard color="rojo" icon="🔴" label="Alertas Críticas Activas" value={alertasData.filter(a => a.nivel === 'critica').length} meta="Según umbrales" />
                        </div>

                        <div className="grid-2">
                            <div className="card">
                                <div className="card-header card-header-accent">
                                    <span style={{ fontSize: 16 }}>🏥</span>
                                    <span className="card-title">Deuda por Establecimiento</span>
                                </div>
                                <div className="card-body">
                                    <Bar data={chartDataUE} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => `$${v}M` } } } }} />
                                </div>
                            </div>
                            <div className="card">
                                <div className="card-header card-header-accent">
                                    <span style={{ fontSize: 16 }}>📊</span>
                                    <span className="card-title">Estado del Devengo</span>
                                    <span className="card-subtitle">Pagado vs Pendiente</span>
                                </div>
                                <div className="card-body">
                                    <Doughnut data={chartDataEstado} options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }} />
                                </div>
                            </div>
                        </div>

                        {/* Top 10 proveedores */}
                        <div className="card">
                            <div className="card-header card-header-accent">
                                <span style={{ fontSize: 16 }}>🏆</span>
                                <span className="card-title">Top 10 Proveedores — Mayor Deuda Pendiente</span>
                            </div>
                            <div className="card-body">
                                {topProveedores.map(([prov, deuda], i) => {
                                    const pct = kpis.totalDeuda > 0 ? (deuda / kpis.totalDeuda * 100) : 0;
                                    return (
                                        <div key={i} className="progress-row">
                                            <div className="progress-label" title={prov}>{i + 1}. {prov}</div>
                                            <div className="progress-track">
                                                <div className="progress-fill rojo" style={{ width: `${Math.min(pct * 3, 100)}%` }} />
                                            </div>
                                            <div className="progress-val">{fmtM(deuda)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══ TAB ALERTAS ═══ */}
                {activeTab === 'alertas' && (
                    <div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                            <div style={{ fontFamily: 'var(--font-title)', fontSize: 14, fontWeight: 600, color: COLORS.azul }}>
                                🚨 Centro de Alertas Activas
                            </div>
                            <div style={{ flex: 1 }} />
                            {[['', 'Todas'], ['critica', '🔴 Críticas'], ['alta', '🟠 Altas'], ['media', '🟡 Medias']].map(([v, l]) => (
                                <button key={v} className={`btn btn-sm ${filterAlerta === v ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setFilterAlerta(v)}>{l}</button>
                            ))}
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(true)}>⚙️ Umbrales</button>
                        </div>
                        {alertasData.length === 0 ? (
                            <div className="empty-state"><div className="empty-state-icon">✅</div><div className="empty-state-msg">No hay alertas activas con los filtros actuales.</div></div>
                        ) : alertasData.map((a, i) => (
                            <AlertaCard key={i} alerta={a} totalDeuda={kpis.totalDeuda} />
                        ))}
                    </div>
                )}

                {/* ═══ TAB DETALLE ═══ */}
                {activeTab === 'detalle' && (
                    <div className="card">
                        <div className="card-header card-header-accent">
                            <span style={{ fontSize: 16 }}>📋</span>
                            <span className="card-title">Detalle de Registros de Deuda</span>
                            <span className="card-subtitle">{detalleData.length.toLocaleString()} registros</span>
                        </div>
                        <div style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid #eaecf0', background: '#f7f9fc', flexWrap: 'wrap' }}>
                            <input className="filter-input" placeholder="🔍 Buscar proveedor, concepto…"
                                value={searchDetalle} onChange={e => { setSearchDetalle(e.target.value); setPageDetalle(1); }}
                                style={{ minWidth: 220 }} />
                            <select className="filter-input" value={filterTD} onChange={e => { setFilterTD(e.target.value); setPageDetalle(1); }}>
                                <option value="">Todos los tipos doc.</option>
                                {tiposDocUnicos.map(td => <option key={td} value={td}>{td}</option>)}
                            </select>
                            <select className="filter-input" value={sortDetalle} onChange={e => setSortDetalle(e.target.value)}>
                                <option value="d_desc">Mayor deuda primero</option>
                                <option value="d_asc">Menor deuda primero</option>
                                <option value="fc_desc">Más reciente primero</option>
                                <option value="fc_asc">Más antiguo primero</option>
                            </select>
                        </div>
                        <div className="table-responsive">
                            <table className="table-gob">
                                <thead><tr>
                                    <th>Establecimiento</th><th>Proveedor</th><th>Concepto Presupuestario</th>
                                    <th>Tipo Documento</th><th>Fecha Conforme</th><th>M.P.</th>
                                    <th style={{ textAlign: 'right' }}>Monto Vigente</th>
                                    <th style={{ textAlign: 'right' }}>Pagado</th>
                                    <th style={{ textAlign: 'right' }}>Deuda Pendiente</th>
                                </tr></thead>
                                <tbody>
                                    {detalleData.slice((pageDetalle - 1) * PAGE_SIZE, pageDetalle * PAGE_SIZE).map((r, i) => (
                                        <tr key={i}>
                                            <td style={{ fontSize: 11 }}>{r.ue.replace(/\d{7}\s/, '')}</td>
                                            <td style={{ fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.prov}</td>
                                            <td style={{ fontSize: 11 }}>{r.cp}</td>
                                            <td><span className="tag tag-gris">{r.td.split(' ').slice(1).join(' ')}</span></td>
                                            <td className="td-mono">{r.fc || '—'}</td>
                                            <td style={{ textAlign: 'center' }}>{r.cc ? '✅' : ''}</td>
                                            <td className="td-monto">{fmt$(r.v)}</td>
                                            <td className="td-monto td-monto-pagado">{fmt$(r.c)}</td>
                                            <td className="td-monto td-monto-deuda" style={{ fontWeight: 700 }}>{r.d > 0 ? fmt$(r.d) : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination total={detalleData.length} page={pageDetalle} pageSize={PAGE_SIZE} onChange={setPageDetalle} />
                    </div>
                )}

                {/* ═══ TAB ANTIGÜEDAD ═══ */}
                {activeTab === 'antiguedad' && (
                    <div>
                        <div className="kpi-grid">
                            <KPICard color="rojo" icon="⏳" label="Antigüedad Promedio" value={`${antigData.promDias} días`} meta="desde Fecha Conforme" />
                            <KPICard color="naranja" icon="🔴" label="Deuda > 60 días" value={antigData.mas60} meta="documentos" />
                            <KPICard color="amarillo" icon="📆" label="Deuda 31–60 días" value={antigData.total3160} meta="documentos" />
                            <KPICard color="verde" icon="✅" label="Deuda 0–30 días" value={antigData.total030} meta="documentos" />
                        </div>

                        <div className="grid-2">
                            <div className="card">
                                <div className="card-header card-header-accent">
                                    <span style={{ fontSize: 16 }}>📊</span>
                                    <span className="card-title">Distribución por Tramo de Antigüedad</span>
                                </div>
                                <div className="card-body">
                                    <Bar data={{
                                        labels: ['0–30 días', '31–60 días', '61–90 días', '+90 días'],
                                        datasets: [{
                                            label: 'Deuda Pendiente (M$)',
                                            data: Object.values(antigData.bucketsMonto).map(v => v / 1e6),
                                            backgroundColor: [COLORS.verde, COLORS.amarillo, COLORS.naranja, COLORS.rojo],
                                            borderRadius: 6,
                                        }],
                                    }} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => `$${v}M` } } } }} />
                                </div>
                            </div>
                            <div className="card">
                                <div className="card-header card-header-accent">
                                    <span style={{ fontSize: 16 }}>📋</span>
                                    <span className="card-title">Distribución por Tramo (Doughnut)</span>
                                </div>
                                <div className="card-body">
                                    <Doughnut data={{
                                        labels: ['0–30 días', '31–60 días', '61–90 días', '+90 días'],
                                        datasets: [{
                                            data: Object.values(antigData.buckets),
                                            backgroundColor: [COLORS.verde, COLORS.amarillo, COLORS.naranja, COLORS.rojo],
                                            borderWidth: 0,
                                        }],
                                    }} options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }} />
                                </div>
                            </div>
                        </div>

                        {/* Tabla antigüedad */}
                        <div className="card">
                            <div className="card-header card-header-accent">
                                <span style={{ fontSize: 16 }}>📋</span>
                                <span className="card-title">Detalle — Deudas Más Antiguas</span>
                            </div>
                            <div style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid #eaecf0', background: '#f7f9fc' }}>
                                <select className="filter-input" value={agTramo} onChange={e => { setAgTramo(e.target.value); setPageAg(1); }}>
                                    <option value="">Todos los tramos</option>
                                    <option value="0-30">0–30 días</option>
                                    <option value="31-60">31–60 días</option>
                                    <option value="61-90">61–90 días</option>
                                    <option value="91+">Más de 90 días</option>
                                </select>
                            </div>
                            <div className="table-responsive">
                                <table className="table-gob">
                                    <thead><tr>
                                        <th>Días</th><th>Semáforo</th><th>Fecha Conforme</th>
                                        <th>Proveedor</th><th>Concepto</th><th>Establecimiento</th>
                                        <th>Tipo Doc.</th><th style={{ textAlign: 'right' }}>Deuda Pendiente</th>
                                    </tr></thead>
                                    <tbody>
                                        {antigData.conFecha
                                            .map(r => ({ ...r, dias: daysSince(r.fc) }))
                                            .filter(r => {
                                                if (!agTramo) return true;
                                                const d = r.dias;
                                                if (agTramo === '0-30') return d <= 30;
                                                if (agTramo === '31-60') return d > 30 && d <= 60;
                                                if (agTramo === '61-90') return d > 60 && d <= 90;
                                                return d > 90;
                                            })
                                            .sort((a, b) => b.dias - a.dias)
                                            .slice((pageAg - 1) * PAGE_SIZE, pageAg * PAGE_SIZE)
                                            .map((r, i) => {
                                                const sem = r.dias > 90 ? '🔴' : r.dias > 60 ? '🟠' : r.dias > 30 ? '🟡' : '🟢';
                                                return (
                                                    <tr key={i}>
                                                        <td className="td-mono" style={{ fontWeight: 700 }}>{r.dias}</td>
                                                        <td style={{ textAlign: 'center', fontSize: 18 }}>{sem}</td>
                                                        <td className="td-mono">{r.fc}</td>
                                                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.prov}</td>
                                                        <td style={{ fontSize: 11 }}>{r.cp}</td>
                                                        <td style={{ fontSize: 11 }}>{r.ue.replace(/\d{7}\s/, '')}</td>
                                                        <td><span className="tag tag-gris" style={{ fontSize: 10 }}>{r.td.split(' ').slice(1).join(' ')}</span></td>
                                                        <td className="td-monto td-monto-deuda">{fmt$(r.d)}</td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══ TAB CONCEPTO PRESUPUESTARIO ═══ */}
                {activeTab === 'concepto' && (
                    <div>
                        <div className="kpi-grid">
                            <KPICard color="azul" icon="📂" label="Conceptos con Deuda" value={conceptoData.filter(c => c.d > 0).length} meta="de total únicos" />
                            <KPICard color="rojo" icon="🔝" label="Concepto Mayor Deuda"
                                value={conceptoData[0]?.cp?.substring(0, 25) || '—'}
                                meta={conceptoData[0] ? fmtM(conceptoData[0].d) : ''} valueFontSize={12} />
                            <KPICard color="naranja" icon="📊" label="Concentración Top 5"
                                value={`${kpis.totalDeuda > 0 ? (conceptoData.slice(0, 5).reduce((s, c) => s + c.d, 0) / kpis.totalDeuda * 100).toFixed(1) : 0}%`}
                                meta="% de deuda en 5 conceptos" />
                            <KPICard color="celeste" icon="🗂️" label="Sub-conceptos N1 únicos"
                                value={[...new Set(conceptoData.map(c => c.n1))].length}
                                meta="Subtítulos presupuestarios" />
                        </div>

                        {/* Barras top 15 conceptos */}
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div className="card-header card-header-accent">
                                <span style={{ fontSize: 16 }}>📊</span>
                                <span className="card-title">Top 15 Conceptos — Deuda Pendiente</span>
                            </div>
                            <div className="card-body">
                                {conceptoData.slice(0, 15).map((c, i) => {
                                    const pct = kpis.totalDeuda > 0 ? (c.d / kpis.totalDeuda * 100) : 0;
                                    return (
                                        <div key={i} className="progress-row">
                                            <div className="progress-label" title={c.cp}>{c.cp}</div>
                                            <div className="progress-track">
                                                <div className="progress-fill" style={{ width: `${Math.min(pct * 5, 100)}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                            </div>
                                            <div className="progress-val">{fmtM(c.d)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Tabla de conceptos */}
                        <div className="card">
                            <div className="card-header card-header-accent">
                                <span style={{ fontSize: 16 }}>📋</span>
                                <span className="card-title">Tabla Detallada por Concepto Presupuestario</span>
                            </div>
                            <div className="table-responsive">
                                <table className="table-gob">
                                    <thead><tr>
                                        <th>Concepto Presupuestario</th><th>Subtítulo N1</th>
                                        <th style={{ textAlign: 'right' }}>Monto Vigente</th>
                                        <th style={{ textAlign: 'right' }}>Pagado</th>
                                        <th style={{ textAlign: 'right' }}>Deuda Pendiente</th>
                                        <th style={{ textAlign: 'right' }}>% Pend.</th>
                                        <th style={{ textAlign: 'center' }}>Docs</th>
                                    </tr></thead>
                                    <tbody>
                                        {conceptoData.slice(0, 30).map((c, i) => (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 500 }}>{c.cp}</td>
                                                <td><span className="tag tag-azul" style={{ fontSize: 10 }}>{c.n1}</span></td>
                                                <td className="td-monto">{fmt$(c.v)}</td>
                                                <td className="td-monto td-monto-pagado">{fmt$(c.c)}</td>
                                                <td className="td-monto td-monto-deuda" style={{ fontWeight: 700 }}>{c.d > 0 ? fmt$(c.d) : '—'}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <span style={{ color: parseFloat(c.pct) > 50 ? COLORS.rojo : parseFloat(c.pct) > 20 ? COLORS.naranja : COLORS.verde, fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                                        {c.pct}%
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{c.docs}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL UMBRALES */}
            {showModal && (
                <ModalUmbrales
                    thresholds={thresholds}
                    onSave={t => { setThresholds(t); setShowModal(false); }}
                    onClose={() => setShowModal(false)}
                />
            )}
        </div>
    );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function KPICard({ color, icon, label, value, meta, valueFontSize }) {
    return (
        <div className={`kpi-card kpi-${color}`}>
            <div className="kpi-icon-bg">{icon}</div>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={valueFontSize ? { fontSize: valueFontSize, paddingTop: 4 } : {}}>{value}</div>
            {meta && <div className="kpi-meta">{meta}</div>}
        </div>
    );
}

function AlertaCard({ alerta, totalDeuda }) {
    const cfg = {
        critica: { cls: 'alert-critica', emoji: '🔴', label: 'CRÍTICA' },
        alta: { cls: 'alert-alta', emoji: '🟠', label: 'ALTA' },
        media: { cls: 'alert-media', emoji: '🟡', label: 'MEDIA' },
    };
    const c = cfg[alerta.nivel] || cfg.media;
    const pct = totalDeuda > 0 ? ((alerta.deuda / totalDeuda) * 100).toFixed(1) : 0;
    return (
        <div className={`alert ${c.cls}`} style={{ marginBottom: 10 }}>
            <div className="alert-icon" style={{ fontSize: 18 }}>{c.emoji}</div>
            <div className="alert-content">
                <div className="alert-title">[{c.label}] {alerta.prov}</div>
                <div className="alert-msg">
                    Deuda pendiente: <strong>{fmt$(alerta.deuda)}</strong> · Representa el {pct}% de la deuda total
                </div>
            </div>
        </div>
    );
}

function Pagination({ total, page, pageSize, onChange }) {
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) return null;
    return (
        <div className="pagination">
            <button className="pag-btn" disabled={page === 1} onClick={() => onChange(page - 1)}>‹ Ant.</button>
            {[...Array(Math.min(totalPages, 7))].map((_, i) => {
                const p = i + 1;
                return <button key={p} className={`pag-btn ${page === p ? 'active' : ''}`} onClick={() => onChange(p)}>{p}</button>;
            })}
            {totalPages > 7 && <span style={{ fontSize: 12, color: '#6c757d' }}>… {totalPages}</span>}
            <button className="pag-btn" disabled={page === totalPages} onClick={() => onChange(page + 1)}>Sig. ›</button>
            <span className="pag-info">{((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} de {total} registros</span>
        </div>
    );
}

function ModalUmbrales({ thresholds, onSave, onClose }) {
    const [vals, setVals] = useState({ ...thresholds });
    return (
        <div className="modal-overlay open">
            <div className="modal">
                <div className="modal-header">
                    <span className="modal-title">⚙️ Configuración de Umbrales de Alerta</span>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    <p style={{ fontSize: 12.5, color: '#6c757d', marginBottom: 16 }}>Valores en pesos chilenos ($)</p>
                    {[
                        ['critico', '🔴 Alerta Crítica — deuda proveedor supera $', 1e6],
                        ['alto', '🟠 Alerta Alta — deuda proveedor supera $', 1e6],
                        ['medio', '🟡 Alerta Media — deuda proveedor supera $', 1e6],
                    ].map(([key, label, div]) => (
                        <div key={key} className="threshold-row">
                            <span className="threshold-label">{label}</span>
                            <input type="number" className="threshold-input"
                                value={vals[key] / div}
                                onChange={e => setVals(v => ({ ...v, [key]: parseFloat(e.target.value) * div }))} />
                            <span style={{ fontSize: 12, color: '#6c757d' }}>M$</span>
                        </div>
                    ))}
                    <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
                        <button className="btn btn-primary btn-sm" onClick={() => onSave(vals)}>💾 Guardar</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
