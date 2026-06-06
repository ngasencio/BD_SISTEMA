import React from 'react';

const OPCIONES_ESTADO = [
    'En ejecución', 'En ejecución (Modificado)', 'Ampliado',
    'Terminado', 'Terminado anticipadamente por mutuo acuerdo',
    'Terminado anticipadamente por sanción',
];

export function FiltrosLateral({ filtros, onChange, stats, abierto, onToggle }) {
    const set = (campo, valor) => onChange({ ...filtros, [campo]: valor });
    const limpiar = () => onChange({ estado_contrato: '', categoria_contrato: '', tipo_contrato: '', unidad_requirente: '' });

    const tieneActivos = Object.values(filtros).some(v => v !== '');
    const categorias = stats?.por_categoria?.map(c => c.categoria_contrato).filter(Boolean) ?? [];
    const tipos = stats?.por_tipo?.map(t => t.tipo_contrato).filter(Boolean) ?? [];
    const unidades = stats?.por_unidad?.map(u => u.unidad_requirente).filter(Boolean) ?? [];

    return (
        <>
            {/* Botón toggle */}
            <button
                onClick={onToggle}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px',
                    background: tieneActivos ? '#7c3aed' : '#f3f4f6',
                    color: tieneActivos ? '#fff' : '#374151',
                    border: '1px solid ' + (tieneActivos ? '#7c3aed' : '#d1d5db'),
                    borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                }}
            >
                🔍 Filtros {tieneActivos ? `(${Object.values(filtros).filter(v => v).length})` : ''}
            </button>

            {/* Panel */}
            {abierto && (
                <div style={{
                    position: 'fixed', top: 0, right: 0, bottom: 0,
                    width: 300, background: '#fff',
                    boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
                    zIndex: 900, display: 'flex', flexDirection: 'column',
                    borderLeft: '1px solid #e5e7eb',
                }}>
                    <div style={{
                        padding: '18px 20px', borderBottom: '1px solid #e5e7eb',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: '#faf5ff',
                    }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#374151' }}>
                            🔍 Filtros
                        </div>
                        <button
                            onClick={onToggle}
                            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280' }}
                        >✕</button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label style={labelStyle}>Estado contrato</label>
                            <select value={filtros.estado_contrato} onChange={e => set('estado_contrato', e.target.value)} style={selectStyle}>
                                <option value="">— Todos —</option>
                                {OPCIONES_ESTADO.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>

                        <div>
                            <label style={labelStyle}>Categoría</label>
                            <select value={filtros.categoria_contrato} onChange={e => set('categoria_contrato', e.target.value)} style={selectStyle}>
                                <option value="">— Todas —</option>
                                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <div>
                            <label style={labelStyle}>Tipo de contrato</label>
                            <select value={filtros.tipo_contrato} onChange={e => set('tipo_contrato', e.target.value)} style={selectStyle}>
                                <option value="">— Todos —</option>
                                {tipos.slice(0, 20).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>

                        <div>
                            <label style={labelStyle}>Unidad requirente</label>
                            <input
                                type="text"
                                value={filtros.unidad_requirente}
                                onChange={e => set('unidad_requirente', e.target.value)}
                                placeholder="Buscar unidad..."
                                style={{ ...selectStyle, fontFamily: 'inherit' }}
                            />
                        </div>
                    </div>

                    <div style={{ padding: '14px 20px', borderTop: '1px solid #e5e7eb' }}>
                        <button
                            onClick={limpiar}
                            disabled={!tieneActivos}
                            style={{
                                width: '100%', padding: '9px',
                                background: tieneActivos ? '#fef2f2' : '#f9fafb',
                                color: tieneActivos ? '#dc2626' : '#9ca3af',
                                border: '1px solid ' + (tieneActivos ? '#fca5a5' : '#e5e7eb'),
                                borderRadius: 8, fontSize: 13, fontWeight: 600,
                                cursor: tieneActivos ? 'pointer' : 'default',
                            }}
                        >
                            Limpiar filtros
                        </button>
                    </div>
                </div>
            )}

            {/* Overlay */}
            {abierto && (
                <div
                    onClick={onToggle}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)',
                        zIndex: 899,
                    }}
                />
            )}
        </>
    );
}

const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: '#374151', marginBottom: 6,
};

const selectStyle = {
    width: '100%', padding: '8px 10px',
    border: '1px solid #d1d5db', borderRadius: 6,
    fontSize: 13, color: '#111827',
    background: '#fff',
};
