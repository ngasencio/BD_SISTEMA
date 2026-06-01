import React, { useState } from 'react';
import { OrdenesCompraResumen } from '../components/OrdenesCompraResumen';

const TABS = [
    { id: 'resumen', label: '🏠 Resumen OC' },
];

export default function OrdenesCompraDashboard() {
    const [activeTab, setActiveTab] = useState('resumen');

    return (
        <>
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
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="tab-container">
                {activeTab === 'resumen' && <OrdenesCompraResumen />}
            </div>
        </>
    );
}
