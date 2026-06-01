import React, { useState, useRef, useEffect } from 'react';
import { useCompraAgil } from '../hooks/useCompraAgil';
import ResumenTab from './tabs/ResumenTab';
import AhorroTab from './tabs/AhorroTab';
import ComprasTable from './tabs/ComprasTable';
import ProveedoresTab from './tabs/ProveedoresTab';
import ComparativaTab from './tabs/ComparativaTab';
import { generarPDFCompraAgil } from '../utils/pdfExport';
import { getCompraAgilAnios } from '../api/compraAgilApi';

const TABS = [
    { id: 'resumen', label: '📊 Resumen' },
    { id: 'ahorro', label: '💰 Ahorro' },
    { id: 'compras', label: '🛒 Compras Ágiles' },
    { id: 'proveedores', label: '🏢 Proveedores' },
    { id: 'comparativa', label: '📈 Comparativa' },
];

export default function CompraAgilPage() {
    const [tab, setTab] = useState('resumen');
    const [anio, setAnio] = useState('');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [generandoPDF, setGenerandoPDF] = useState(false);
    const [anosDisponibles, setAnosDisponibles] = useState([]);

    useEffect(() => {
        getCompraAgilAnios()
            .then(({ data }) => setAnosDisponibles(data))
            .catch(() => setAnosDisponibles([]));
    }, []);

    const filtros = { fechaDesde, fechaHasta };
    const { stats, loadingStats, errorStats, compras, loadingCompras, errorCompras, proveedores, loadingProveedores, refresh } =
        useCompraAgil(filtros);

    const chartsRef = useRef({});

    // Al seleccionar año → llena el rango de fechas automáticamente
    const handleAnioChange = (value) => {
        setAnio(value);
        if (value) {
            setFechaDesde(`${value}-01-01`);
            setFechaHasta(`${value}-12-31`);
        } else {
            setFechaDesde('');
            setFechaHasta('');
        }
    };

    // Si el usuario edita manualmente las fechas → desvincula el año
    const handleFechaDesdeChange = (value) => {
        setFechaDesde(value);
        setAnio('');
    };

    const handleFechaHastaChange = (value) => {
        setFechaHasta(value);
        setAnio('');
    };

    const handleLimpiarFiltros = () => {
        setAnio('');
        setFechaDesde('');
        setFechaHasta('');
    };

    const handleExportarPDF = async () => {
        if (!stats) return;
        setGenerandoPDF(true);
        try {
            await generarPDFCompraAgil({
                stats,
                compras,
                proveedores,
                filtros: { fechaDesde, fechaHasta, anio },
                chartsRef: chartsRef.current,
            });
        } finally {
            setGenerandoPDF(false);
        }
    };

    const hayFiltros = fechaDesde || fechaHasta || anio;

    return (
        <div className="feature-page">
            {/* ── Encabezado ── */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 className="page-title">Compra Ágil</h1>
                    <p className="page-subtitle">
                        Análisis de compras por convenio marco — Organismo 7296
                    </p>
                </div>
                <button
                    className="btn-pdf"
                    onClick={handleExportarPDF}
                    disabled={generandoPDF || loadingStats}
                    title="Generar reporte PDF completo con los filtros activos"
                >
                    {generandoPDF ? '⏳ Generando...' : '🖨️ Reporte PDF'}
                </button>
            </div>

            {/* ── Filtros globales ── */}
            <div className="card filtro-global-bar">
                <div className="filtro-global-inner">
                    {/* Selector de año */}
                    <div className="filtro-group">
                        <span className="filtro-label">📆 Año:</span>
                        <div className="anio-selector">
                            <button
                                className={`anio-btn${!anio ? ' active' : ''}`}
                                onClick={() => handleAnioChange('')}
                            >
                                Todos
                            </button>
                            {anosDisponibles.map(a => (
                                <button
                                    key={a}
                                    className={`anio-btn${anio === String(a) ? ' active' : ''}`}
                                    onClick={() => handleAnioChange(String(a))}
                                >
                                    {a}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Separador */}
                    <div className="filtro-separator" />

                    {/* Rango de fechas */}
                    <span className="filtro-label">📅 Período:</span>
                    <div className="filtro-group">
                        <label>Desde</label>
                        <input
                            type="date"
                            className="filtro-input"
                            value={fechaDesde}
                            onChange={e => handleFechaDesdeChange(e.target.value)}
                        />
                    </div>
                    <div className="filtro-group">
                        <label>Hasta</label>
                        <input
                            type="date"
                            className="filtro-input"
                            value={fechaHasta}
                            onChange={e => handleFechaHastaChange(e.target.value)}
                        />
                    </div>

                    {hayFiltros && (
                        <button className="btn-limpiar" onClick={handleLimpiarFiltros}>
                            ✕ Limpiar
                        </button>
                    )}
                    {hayFiltros && (
                        <span className="filtro-activo-badge">
                            {anio ? `Año ${anio}` : `${fechaDesde || '…'} → ${fechaHasta || '…'}`}
                        </span>
                    )}
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className="tabs-bar">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        className={`tab-btn${tab === t.id ? ' active' : ''}`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── Contenido de tabs ── */}
            {errorStats && (
                <div className="error-message" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <span>⚠️ {errorStats}</span>
                    <button
                        onClick={() => refresh()}
                        style={{ padding: '4px 14px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#dc2626', fontWeight: 600 }}
                    >
                        🔄 Reintentar
                    </button>
                </div>
            )}

            {tab === 'resumen' && (
                <ResumenTab stats={stats} loading={loadingStats} chartsRef={chartsRef} />
            )}
            {tab === 'ahorro' && (
                <AhorroTab stats={stats} loading={loadingStats} chartsRef={chartsRef} />
            )}
            {tab === 'compras' && (
                <ComprasTable
                    compras={compras}
                    loading={loadingCompras}
                    error={errorCompras}
                    filtros={filtros}
                />
            )}
            {tab === 'proveedores' && (
                <ProveedoresTab
                    stats={stats}
                    loading={loadingStats || loadingProveedores}
                />
            )}
            {tab === 'comparativa' && (
                <ComparativaTab />
            )}
        </div>
    );
}
