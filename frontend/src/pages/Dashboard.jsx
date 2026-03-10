import React, { useState, useEffect, useMemo } from 'react';
import api from '../lib/axios';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import ResumenSect from '../components/ResumenSect';
import TimelineSect from '../components/TimelineSect';
import CompradoresSect from '../components/CompradoresSect';
import FinancieroSect from '../components/FinancieroSect';
import CategoriasSect from '../components/CategoriasSect';
import ReportesSect from '../components/ReportesSect';

const TABS = [
    { id: 'resumen', label: '🏠 Resumen' },
    { id: 'timeline', label: '📅 Línea de Tiempo' },
    { id: 'compradores', label: '👤 Compradores' },
    { id: 'financiero', label: '💰 Financiero' },
    { id: 'categorias', label: '🗂️ Categorías' },
    { id: 'reportes', label: '🖨️ Reportes PDF' },
];

export default function Dashboard() {
    const [activeTab, setActiveTab] = useState('resumen');
    const [stats, setStats] = useState(null);
    const [licitaciones, setLicitaciones] = useState([]);
    const [detalles, setDetalles] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            api.get('dashboard/stats/'),
            api.get('licitaciones/?limit=1000'),
            api.get('detalles/?limit=5000')
        ]).then(([sRes, lRes, dRes]) => {
            setStats(sRes.data);
            setLicitaciones(lRes.data.results || lRes.data);
            setDetalles(dRes.data.results || dRes.data);
            setLoading(false);
        }).catch(err => {
            console.error("Error fetching data:", err);
            setLoading(false);
        });
    }, []);

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando sistema...</div>;
    }

    return (
        <div style={{ display: 'flex', flex: 1, width: '100%' }}>
            <Sidebar />
            <main className="main">
                <Topbar />

                <div className="content">
                    <div className="page-header">
                        <div className="page-title">
                            <span className="page-title-icon">📄</span> Licitaciones — Mercado Público
                        </div>
                        <div className="page-subtitle">
                            Organismo: SERVICIO DE SALUD OSORNO · Código 7296 · Región de los Lagos · {stats?.total || 0} licitaciones registradas
                        </div>
                    </div>

                    <div className="tabs-bar">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="tab-container">
                        {activeTab === 'resumen' && <ResumenSect stats={stats} />}
                        {activeTab === 'timeline' && <TimelineSect licitaciones={licitaciones} />}
                        {activeTab === 'compradores' && <CompradoresSect licitaciones={licitaciones} />}
                        {activeTab === 'financiero' && <FinancieroSect licitaciones={licitaciones} detalles={detalles} />}
                        {activeTab === 'categorias' && <CategoriasSect detalles={detalles} />}
                        {activeTab === 'reportes' && <ReportesSect licitaciones={licitaciones} />}
                    </div>          </div>

                <div className="gob-footer" style={{ marginLeft: '0px', position: 'fixed', bottom: 0, right: 0, left: '68px', zIndex: 10 }}>
                    <span className="gob-footer-logo">🏥 Sistema Gestión Interno</span>
                    <span className="gob-footer-text" style={{ marginLeft: '10px' }}>Servicio de Salud Osorno · Abastecimiento</span>
                </div>
            </main>
        </div>
    );
}
