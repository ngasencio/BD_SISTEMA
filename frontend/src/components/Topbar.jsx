import React from 'react';

export default function Topbar() {
    return (
        <>
            <div className="gob-header-strip">
                <div className="gob-logo">
                    <div className="gob-logo-icon">G</div>
                    <span className="gob-logo-text">Gobierno de Chile</span>
                </div>
                <span className="gob-org">Servicio de Salud Osorno</span>
                <div className="gob-header-spacer"></div>
            </div>

            <div className="topbar">
                <div className="topbar-breadcrumb">
                    <span>📦 Abastecimiento</span>
                    <span className="bc-sep">/</span>
                    <span>🛒 Mercado Público</span>
                    <span className="bc-sep">/</span>
                    <span className="bc-current">📄 Licitaciones</span>
                </div>
                <div className="topbar-spacer"></div>
                <div className="topbar-status"><span className="dot"></span> Datos actualizados</div>
            </div>
        </>
    );
}
