import React from 'react';
import logoImg from '../assets/logo.jpg';

export default function Topbar() {
    return (
        <div className="gob-header-strip">
            <div className="gob-logo">
                <div style={{
                    width: 24, height: 24, borderRadius: 4, overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#fff', border: '1px solid rgba(255,255,255,0.2)'
                }}>
                    <img src={logoImg} alt="SSO Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <span className="gob-logo-text" style={{ marginLeft: 8 }}>Gobierno de Chile</span>
            </div>
            <span className="gob-org">Servicio de Salud Osorno</span>
            <div className="gob-header-spacer" />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-title)' }}>
                Sistema Gestión Interno
            </span>
        </div>
    );
}

