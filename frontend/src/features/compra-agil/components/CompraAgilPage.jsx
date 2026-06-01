import React, { useState, useRef } from 'react';
import { useCompraAgil } from '../hooks/useCompraAgil';
import ResumenTab from './tabs/ResumenTab';
import AhorroTab from './tabs/AhorroTab';
import ComprasTable from './tabs/ComprasTable';
import ProveedoresTab from './tabs/ProveedoresTab';
import { generarPDFCompraAgil } from '../utils/pdfExport';

const TABS = [
    { id: 'resumen', label: '📊 Resumen' },
    { id: 'ahorro', label: '💰 Ahorro' },
    { id: 'compras', label: '🛒 Compras Ágiles' },
    { id: 'proveedores', label: '🏢 Proveedores' },
];

export default function CompraAgilPage() {
    const [tab, setTab] = useState('resumen');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [generandoPDF, setGenerandoPDF] = useState(false);

    const filtros = { fechaDesde, fechaHasta };
    const { stats, loadingStats, errorStats, compras, loadingCompras, errorCompras, proveedores, loadingProveedores } =
        useCompraAgil(filtros);

    const chartsRef = useRef({});

    const handleLimpiarFiltros = () => {
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
                filtros: { fechaDesde, fechaHasta },
                chartsRef: chartsRef.current,
            });
        } finally {
            setGenerandoPDF(false);
        }
    };

    const hayFiltros = fechaDesde || fechaHasta;

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

            {/* ── Filtro global de fechas ── */}
            <div className="card filtro-global-bar">
                <div className="filtro-global-inner">
                    <span className="filtro-label">📅 Período:</span>
                    <div className="filtro-group">
                        <label>Desde</label>
                        <input
                            type="date"
                            className="filtro-input"
                            value={fechaDesde}
                            onChange={e => setFechaDesde(e.target.value)}
                        />
                    </div>
                    <div className="filtro-group">
                        <label>Hasta</label>
                        <input
                            type="date"
                            className="filtro-input"
                            value={fechaHasta}
                            onChange={e => setFechaHasta(e.target.value)}
                        />
                    </div>
                    {hayFiltros && (
                        <button className="btn-limpiar" onClick={handleLimpiarFiltros}>
                            ✕ Limpiar
                        </button>
                    )}
                    {hayFiltros && (
                        <span className="filtro-activo-badge">
                            Filtro activo: {fechaDesde || '…'} → {fechaHasta || '…'}
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
                <div className="error-message">Error al cargar datos: {errorStats}</div>
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
        </div>
    );
}
