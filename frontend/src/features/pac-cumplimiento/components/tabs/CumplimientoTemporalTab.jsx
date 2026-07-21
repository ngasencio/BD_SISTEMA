import { useState } from 'react';
import EjecucionComprasSubtab from './temporal/EjecucionComprasSubtab';
import VerFichaSubtab from './temporal/VerFichaSubtab';
import TemporalSubtab from './temporal/TemporalSubtab';
import EjecucionJerarquicaSubtab from './temporal/EjecucionJerarquicaSubtab';

const SUBTABS = [
    { key: 'compras', label: '📅 Ejecución de Compras' },
    { key: 'ficha', label: '📋 Ver Ficha' },
    { key: 'temporal', label: '🗓️ Temporal' },
    { key: 'jerarquica', label: '🏛️ Ejecución Jerárquica' },
];

function SubTabBtn({ active, onClick, children }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, color: active ? '#7c3aed' : '#64748b',
                borderBottom: active ? '2.5px solid #7c3aed' : '2.5px solid transparent',
                transition: 'color 0.15s, border-color 0.15s',
            }}
        >
            {children}
        </button>
    );
}

export default function CumplimientoTemporalTab({ temporal, anho }) {
    const [subtab, setSubtab] = useState('compras');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 22, borderBottom: '1px solid #e2e8f0' }}>
                {SUBTABS.map((t) => (
                    <SubTabBtn key={t.key} active={subtab === t.key} onClick={() => setSubtab(t.key)}>
                        {t.label}
                    </SubTabBtn>
                ))}
            </div>

            {subtab === 'compras' && <EjecucionComprasSubtab temporal={temporal} />}
            {subtab === 'ficha' && <VerFichaSubtab anho={anho} />}
            {subtab === 'temporal' && <TemporalSubtab anho={anho} />}
            {subtab === 'jerarquica' && <EjecucionJerarquicaSubtab anho={anho} />}
        </div>
    );
}
