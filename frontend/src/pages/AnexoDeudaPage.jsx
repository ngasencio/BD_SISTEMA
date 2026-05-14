import React from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import DeudaDashboard from '../components/Finanzas/DeudaDashboard';

export default function AnexoDeudaPage() {
    return (
        <div style={{ display: 'flex', flex: 1, width: '100%' }}>
            <Sidebar />
            <main className="main">
                <Topbar />
                <DeudaDashboard />
                <div className="gob-footer" style={{ marginLeft: '0px', position: 'fixed', bottom: 0, right: 0, left: '68px', zIndex: 10 }}>
                    <span className="gob-footer-logo">🏥 Servicio de Salud Osorno</span>
                    <span className="gob-footer-text" style={{ marginLeft: '10px' }}>Sistema de Gestión — Finanzas · Anexo N°3</span>
                </div>
            </main>
        </div>
    );
}
