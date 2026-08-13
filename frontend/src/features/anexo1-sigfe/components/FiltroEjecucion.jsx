import React from 'react';

const MESES = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

// Filtro compartido por todos los tabs de "Análisis de Ejecución Presupuestaria"
// (UE + Año + rango de mes + excluir Subt. 34/35). Filtros propios de cada tab
// (Subtítulo, Año de comparación, Concepto) viven dentro de cada Tab*.
export default function FiltroEjecucion({ establecimientos = [], anhos = [], value, onChange }) {
    const set = (campo) => (e) => {
        const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        onChange({ ...value, [campo]: v });
    };

    return (
        <div className="filter-zone">
            <div className="filter-zone-title">🔍 Filtro de ejecución presupuestaria</div>
            <div className="filter-row">
                <div className="filter-group">
                    <label className="filter-label">🏥 Establecimiento</label>
                    <select className="filter-input" value={value.ue || 'todas'} onChange={set('ue')}>
                        <option value="todas">Todas (consolidado SSO)</option>
                        {establecimientos.map((e) => (
                            <option key={e.codigo_ue} value={e.codigo_ue}>{e.nombre}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-group">
                    <label className="filter-label">Año</label>
                    <select className="filter-input" value={value.anho || ''} onChange={set('anho')}>
                        {anhos.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
                <div className="filter-group">
                    <label className="filter-label">Mes desde</label>
                    <select className="filter-input" value={value.mesDesde || 1} onChange={set('mesDesde')}>
                        {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                </div>
                <div className="filter-group">
                    <label className="filter-label">Mes hasta</label>
                    <select className="filter-input" value={value.mesHasta || 12} onChange={set('mesHasta')}>
                        {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--gob-gris4)', paddingBottom: 7 }}>
                    <input type="checkbox" checked={value.excluir3435 !== false} onChange={set('excluir3435')} />
                    Excluir Subt. 34/35
                </label>
            </div>
        </div>
    );
}
