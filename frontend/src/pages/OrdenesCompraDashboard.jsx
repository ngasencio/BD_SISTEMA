import React, { useState, useEffect } from 'react';
import api from '../lib/axios';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { OrdenesCompraResumen } from '../components/OrdenesCompraResumen';

const TABS = [
    { id: 'resumen', label: '🏠 Resumen OC' },
];

export default function OrdenesCompraDashboard() {
    const [activeTab, setActiveTab] = useState('resumen');

    return (
        <div style={{ display: 'flex', flex: 1, width: '100%' }}>
            <Sidebar />
            <main className="main">
                <Topbar />

                <div className="content">
                    <div className="page-header">
                        <div className="page-title">
                            <span className="page-title-icon">🛍️</span> Órdenes de Compra — Mercado Público
                        </div>
                        <div className="page-subtitle">
                            Organismo: SERVICIO DE SALUD OSORNO · Registros de Compras Directas y otros
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
                        {activeTab === 'resumen' && <OrdenesCompraResumen />}
                    </div>
                </div>

                <div className="gob-footer" style={{ marginLeft: '0px', position: 'fixed', bottom: 0, right: 0, left: '68px', zIndex: 10 }}>
                    <span className="gob-footer-logo">🏥 Sistema Gestión Interno</span>
                    <span className="gob-footer-text" style={{ marginLeft: '10px' }}>Servicio de Salud Osorno · Abastecimiento</span>
                </div>
            </main>
        </div>
    );
}
