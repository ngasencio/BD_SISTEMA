import React from 'react';

export default function Topbar() {
    return (
        <div className="gob-header-strip">
            <div className="gob-logo">
                <div className="gob-logo-icon">G</div>
                <span className="gob-logo-text">Gobierno de Chile</span>
            </div>
            <span className="gob-org">Servicio de Salud Osorno</span>
            <div className="gob-header-spacer" />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-title)' }}>
                Sistema Gestión Interno
            </span>
        </div>
    );
}
