import React, { useState, useEffect } from 'react';
import api from '../lib/axios';
import ResumenSect from '../components/ResumenSect';
import CalendarioSect from '../components/CalendarioSect';
import FinancieroSect from '../components/FinancieroSect';
import CategoriasSect from '../components/CategoriasSect';
import ReportesSect from '../components/ReportesSect';
import GestionSect from '../components/GestionSect';
import AhorroSect from '../components/AhorroSect';

const TABS = [
    { id: 'resumen',    label: '🏠 Resumen' },
    { id: 'gestion',    label: '🚦 Gestión' },
    { id: 'ahorro',     label: '💰 Ahorro' },
    { id: 'calendario', label: '📅 Calendario' },
    { id: 'financiero', label: '📊 Financiero' },
    { id: 'categorias', label: '🗂️ Categorías' },
    { id: 'reportes',   label: '🖨️ Reportes PDF' },
];

const ESTADOS_DISPLAY = {
    'Adjudicada':                              'Adjudicada',
    'Publicada':                               'Publicada',
    'Cerrada':                                 'Cerrada',
    'Revocada':                                'Revocada',
    'Desierta (o art. 3 ó 9 Ley 19.886)':    'Desierta',
};

export default function Dashboard() {
    const [activeTab, setActiveTab] = useState('resumen');
    const [stats, setStats] = useState(null);
    const [licitaciones, setLicitaciones] = useState([]);
    const [detalles, setDetalles] = useState([]);
    const [anosDisponibles, setAnosDisponibles] = useState([]);

    // Filtros globales
    const [filtroAnio, setFiltroAnio] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('');

    // Tabs con carga lazy
    const [gestionData, setGestionData] = useState(null);
    const [ahorroData, setAhorroData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingGestion, setLoadingGestion] = useState(false);
    const [loadingAhorro, setLoadingAhorro] = useState(false);
    const [gestionFailed, setGestionFailed] = useState(false);
    const [ahorroFailed, setAhorroFailed] = useState(false);

    // Carga los años disponibles una sola vez al montar
    useEffect(() => {
        api.get('licitaciones/anos/')
            .then(res => setAnosDisponibles(res.data || []))
            .catch(() => {});
    }, []);

    // Re-fetch principal cuando cambian los filtros
    useEffect(() => {
        setLoading(true);
        const qs = new URLSearchParams({ limit: 1000 });
        if (filtroAnio)   qs.append('anio', filtroAnio);
        if (filtroEstado) qs.append('Estado', filtroEstado);

        const qsDet = new URLSearchParams({ limit: 5000 });
        if (filtroAnio) qsDet.append('anio', filtroAnio);

        const statsQs = new URLSearchParams();
        if (filtroAnio)   statsQs.append('anio', filtroAnio);
        if (filtroEstado) statsQs.append('Estado', filtroEstado);

        Promise.all([
            api.get(`dashboard/stats/?${statsQs}`),
            api.get(`licitaciones/?${qs}`),
            api.get(`detalles/?${qsDet}`),
        ]).then(([sRes, lRes, dRes]) => {
            setStats(sRes.data);
            setLicitaciones(lRes.data.results || lRes.data);
            setDetalles(dRes.data.results || dRes.data);
            setLoading(false);
        }).catch(err => {
            console.error('Error fetching data:', err);
            setLoading(false);
        });

        // Al cambiar filtros, resetear tabs lazy para que se recarguen con los nuevos params
        setGestionData(null);
        setAhorroData(null);
        setGestionFailed(false);
        setAhorroFailed(false);
    }, [filtroAnio, filtroEstado]);

    // Carga lazy Gestión
    useEffect(() => {
        if (activeTab === 'gestion' && !gestionData && !loadingGestion && !gestionFailed) {
            setLoadingGestion(true);
            const qs = filtroAnio ? `?anio=${filtroAnio}` : '';
            api.get(`licitaciones/gestion-stats/${qs}`)
                .then(res => setGestionData(res.data))
                .catch(err => {
                    console.error('Error gestion-stats:', err);
                    setGestionFailed(true);
                })
                .finally(() => setLoadingGestion(false));
        }
    }, [activeTab, gestionData, loadingGestion, gestionFailed, filtroAnio]);

    // Carga lazy Ahorro
    useEffect(() => {
        if (activeTab === 'ahorro' && !ahorroData && !loadingAhorro && !ahorroFailed) {
            setLoadingAhorro(true);
            const qs = filtroAnio ? `?anio=${filtroAnio}` : '';
            api.get(`licitaciones/ahorro-stats/${qs}`)
                .then(res => setAhorroData(res.data))
                .catch(err => {
                    console.error('Error ahorro-stats:', err);
                    setAhorroFailed(true);
                })
                .finally(() => setLoadingAhorro(false));
        }
    }, [activeTab, ahorroData, loadingAhorro, ahorroFailed, filtroAnio]);

    return (
        <>
            <div className="page-header">
                <div className="page-title">
                    <span className="page-title-icon">📄</span> Licitaciones — Mercado Público
                </div>
                <div className="page-subtitle">
                    Organismo: SERVICIO DE SALUD OSORNO · Código 7296 · Región de los Lagos
                    {' · '}{stats?.total ?? '…'} licitaciones
                    {filtroAnio ? ` en ${filtroAnio}` : ''}
                    {filtroEstado ? ` · ${ESTADOS_DISPLAY[filtroEstado] || filtroEstado}` : ''}
                </div>
            </div>

            {/* ── Barra de filtros global ── */}
            <div className="filter-bar" style={{ marginBottom: '0', padding: '10px 0 8px', flexWrap: 'wrap', gap: '8px' }}>
                {/* Filtro Año */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: '#666', fontWeight: 600 }}>Año:</span>
                    <button
                        className={`tab-btn${!filtroAnio ? ' active' : ''}`}
                        style={{ fontSize: '12px', padding: '3px 10px' }}
                        onClick={() => setFiltroAnio('')}
                    >
                        Todos
                    </button>
                    {anosDisponibles.map(a => (
                        <button
                            key={a}
                            className={`tab-btn${filtroAnio === String(a) ? ' active' : ''}`}
                            style={{ fontSize: '12px', padding: '3px 10px' }}
                            onClick={() => setFiltroAnio(String(a))}
                        >
                            {a}
                        </button>
                    ))}
                </div>

                {/* Filtro Estado */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#666', fontWeight: 600 }}>Estado:</span>
                    <select
                        className="filter-input"
                        value={filtroEstado}
                        onChange={e => setFiltroEstado(e.target.value)}
                        style={{ minWidth: '160px', fontSize: '12px' }}
                    >
                        <option value="">Todos los estados</option>
                        {Object.entries(ESTADOS_DISPLAY).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                        ))}
                    </select>
                </div>

                {/* Indicador de filtro activo */}
                {(filtroAnio || filtroEstado) && (
                    <button
                        onClick={() => { setFiltroAnio(''); setFiltroEstado(''); }}
                        style={{
                            background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: '12px',
                            color: '#e74c3c', fontSize: '11px', padding: '3px 10px', cursor: 'pointer',
                        }}
                    >
                        ✕ Limpiar filtros
                    </button>
                )}
            </div>

            <div className="tabs-bar">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="loading-spinner">Cargando licitaciones…</div>
            ) : (
                <div className="tab-container">
                    {activeTab === 'resumen'    && <ResumenSect stats={stats} licitaciones={licitaciones} />}
                    {activeTab === 'gestion'    && <GestionSect gestionData={gestionData} loading={loadingGestion} />}
                    {activeTab === 'ahorro'     && <AhorroSect ahorroData={ahorroData} loading={loadingAhorro} />}
                    {activeTab === 'calendario' && <CalendarioSect licitaciones={licitaciones} />}
                    {activeTab === 'financiero' && <FinancieroSect licitaciones={licitaciones} detalles={detalles} />}
                    {activeTab === 'categorias' && <CategoriasSect detalles={detalles} />}
                    {activeTab === 'reportes'   && <ReportesSect licitaciones={licitaciones} />}
                </div>
            )}
        </>
    );
}
