import React from 'react';

const MESES = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

const selectStyle = {
    padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 7,
    fontSize: 12.5, color: '#334155', background: '#fff', outline: 'none',
};

const labelStyle = {
    fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
    letterSpacing: '.4px', display: 'block', marginBottom: 4,
};

// Filtro compartido por todos los tabs de "Análisis de Ejecución Presupuestaria"
// (UE + Año + rango de mes + excluir Subt. 34/35). Filtros propios de cada tab
// (Subtítulo, Año de comparación, Concepto) viven dentro de cada Tab*.
export default function FiltroEjecucion({ establecimientos = [], anhos = [], value, onChange }) {
    const set = (campo) => (e) => {
        const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        onChange({ ...value, [campo]: v });
    };

    return (
        <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', padding: '12px 16px', marginBottom: 16 }}>
            <div>
                <label style={labelStyle}>🏥 Establecimiento</label>
                <select style={selectStyle} value={value.ue || 'todas'} onChange={set('ue')}>
                    <option value="todas">Todas (consolidado SSO)</option>
                    {establecimientos.map((e) => (
                        <option key={e.codigo_ue} value={e.codigo_ue}>{e.nombre}</option>
                    ))}
                </select>
            </div>
            <div>
                <label style={labelStyle}>Año</label>
                <select style={selectStyle} value={value.anho || ''} onChange={set('anho')}>
                    {anhos.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
            </div>
            <div>
                <label style={labelStyle}>Mes desde</label>
                <select style={selectStyle} value={value.mesDesde || 1} onChange={set('mesDesde')}>
                    {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
            </div>
            <div>
                <label style={labelStyle}>Mes hasta</label>
                <select style={selectStyle} value={value.mesHasta || 12} onChange={set('mesHasta')}>
                    {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#475569', paddingBottom: 7 }}>
                <input type="checkbox" checked={value.excluir3435 !== false} onChange={set('excluir3435')} />
                Excluir Subt. 34/35
            </label>
        </div>
    );
}
