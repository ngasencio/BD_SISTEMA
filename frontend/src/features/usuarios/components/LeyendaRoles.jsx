import React from 'react';
import { ROLES, getRol } from '../constants/roles';

/**
 * variant="panel"   → tarjetas grandes, una por rol (usado arriba de la tabla).
 * variant="compact" → una sola línea describiendo `rolActivo` (usado en el drawer de edición).
 */
export default function LeyendaRoles({ variant = 'panel', rolActivo }) {
    if (variant === 'compact') {
        const rol = getRol(rolActivo);
        return (
            <div className="lr-compact" style={{ borderLeftColor: rol.color }}>
                <span className="lr-compact-dot" style={{ background: rol.color }} />
                <div>
                    <div className="lr-compact-label" style={{ color: rol.color }}>{rol.label}</div>
                    <div className="lr-compact-desc">{rol.descripcion}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="lr-panel card">
            <div className="lr-panel-title">🔑 Roles del sistema — qué módulo desbloquea cada uno</div>
            <div className="lr-panel-grid">
                {ROLES.map(rol => (
                    <div key={rol.value} className="lr-card" style={{ borderTopColor: rol.color }}>
                        <div className="lr-card-header">
                            <span className="lr-card-dot" style={{ background: rol.color }} />
                            <span className="lr-card-label" style={{ color: rol.color }}>{rol.label}</span>
                        </div>
                        <div className="lr-card-desc">{rol.descripcion}</div>
                        <div className="lr-card-modulos">
                            {rol.modulos.map(m => <span key={m} className="lr-chip">{m}</span>)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
