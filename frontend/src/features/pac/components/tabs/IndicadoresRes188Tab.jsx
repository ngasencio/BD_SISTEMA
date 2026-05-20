import React, { useState } from 'react';

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const fPct = (v) => (v != null ? v.toFixed(1) + '%' : '—');

function ScoreBanner({ indicadores, mods, rfiNum, rfiDen }) {
    const i1 = indicadores?.i1 ?? 0;
    const i2 = indicadores?.i2 ?? 0;
    const i5 = indicadores?.i5 ?? 0;
    const s3 = mods === 0 ? 100 : mods <= 3 ? 80 : mods <= 6 ? 60 : 40;
    const i6 = rfiDen > 0 ? (rfiNum / rfiDen) * 100 : 0;

    const sc = {
        i1: Math.min(100, i1), i2: Math.min(100, i2), i3: s3,
        i4: 0, i5: Math.min(100, i5), i6: Math.min(100, i6),
    };
    const pw = { i1: .25, i2: .15, i3: .10, i4: .20, i5: .20, i6: .10 };
    const score = Object.keys(pw).reduce((s, k) => s + sc[k] * pw[k], 0);

    return (
        <div className="pac-score-banner">
            <div className="pac-score-info">
                <h3>Score Res.188/2026</h3>
                <p>Puntaje calculado automáticamente. Ind. 3, 4 y 6 requieren entrada manual.</p>
                <div className="pac-score-dims">
                    {[
                        { l: 'Ind.1', v: fPct(i1) },
                        { l: 'Ind.2', v: fPct(i2) },
                        { l: 'Mods', v: mods },
                        { l: 'Ind.4', v: '—' },
                        { l: 'Ahorro', v: fPct(i5) },
                        { l: 'RFI', v: fPct(i6) },
                    ].map((d) => (
                        <div key={d.l} className="pac-dim">
                            <span className="pac-dim-v">{d.v}</span>
                            <span className="pac-dim-l">{d.l}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="pac-score-big">{score.toFixed(1)}<span>/100</span></div>
        </div>
    );
}

function IndicadorCard({ n, nombre, formula, dimension, ponderacion, valor, unidad, pend, tooltip }) {
    const color = valor == null ? 'gy' : valor >= 75 ? 'gr' : valor >= 50 ? 'or' : 'rd';
    const pct = valor != null ? Math.min(100, valor) : 0;

    const colorMap = { gr: '#2D717C', or: '#E0701E', rd: '#FE6565', gy: '#c8d3de' };

    return (
        <div className="pac-ind-card">
            <div className="pac-ind-head">
                <div className={`pac-ind-n ${pend ? 'pend' : ''}`}>{n}</div>
                <span className="pac-ind-pond">{ponderacion}</span>
            </div>
            <div className="pac-ind-name">{nombre}</div>
            <div className="pac-ind-formula">{formula}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span className={`pac-ind-big ${pend ? 'pend' : ''}`}>
                    {pend ? 'Pendiente' : valor != null ? (unidad === '%' ? valor.toFixed(1) : unidad === '/5' ? valor.toFixed(1) : valor) : '—'}
                </span>
                <span className="pac-ind-unit">{!pend && unidad}</span>
            </div>
            <div className="pac-ind-bar-w">
                <div className="pac-ind-bar" style={{ width: `${pct}%`, background: colorMap[color] }} />
            </div>
            <div className="pac-ind-dim">Dimensión: <strong>{dimension}</strong></div>
        </div>
    );
}

export default function IndicadoresRes188Tab({ indicadores, caResumen }) {
    const [mods, setMods] = useState(0);
    const [rfiNum, setRfiNum] = useState(0);
    const [rfiDen, setRfiDen] = useState(0);

    const i6 = rfiDen > 0 ? (rfiNum / rfiDen) * 100 : 0;

    const INDS = [
        {
            n: 1, nombre: '% Compras dentro del PAC',
            formula: 'OC enlazadas PAC / Total OC',
            dimension: 'Planificación y coherencia', ponderacion: '25%',
            valor: indicadores?.i1, unidad: '%', pend: false,
        },
        {
            n: 2, nombre: '% Procesos Competitivos',
            formula: '(SE Lic + AG) / Total OC',
            dimension: 'Planificación y coherencia', ponderacion: '15%',
            valor: indicadores?.i2, unidad: '%', pend: false,
        },
        {
            n: 3, nombre: 'Modificaciones al PAC',
            formula: 'N° ediciones al PAC vigente',
            dimension: 'Planificación y coherencia', ponderacion: '10%',
            valor: mods, unidad: 'mods', pend: false,
        },
        {
            n: 4, nombre: 'Satisfacción Servicio/Producto',
            formula: 'Σ Notas / N° notas evaluadas',
            dimension: 'Satisfacción y cumplimiento', ponderacion: '20%',
            valor: null, unidad: '/5', pend: true,
        },
        {
            n: 5, nombre: 'Ahorro en Compras',
            formula: 'Monto ahorrado / Monto adjudicado',
            dimension: 'Eficiencia y resultados', ponderacion: '20%',
            valor: indicadores?.i5, unidad: '%', pend: false,
        },
        {
            n: 6, nombre: '% RFI de Innovación',
            formula: 'RFI Innovación / Total RFI',
            dimension: 'Fomento de innovación', ponderacion: '10%',
            valor: i6, unidad: '%', pend: false,
        },
    ];

    return (
        <div className="pac-tab-content">
            {/* Banner score */}
            <ScoreBanner indicadores={indicadores} mods={mods} rfiNum={rfiNum} rfiDen={rfiDen} />

            {/* Entrada manual Ind 3 */}
            <div className="pac-manual-card">
                <div className="pac-manual-row">
                    <label>Ind.3 — N° modificaciones al PAC:</label>
                    <input
                        type="number" min="0" value={mods}
                        onChange={(e) => setMods(parseInt(e.target.value) || 0)}
                        className="pac-manual-input"
                    />
                    <span className="pac-manual-hint">
                        0 mods → 100 pts · 1-3 → 80 · 4-6 → 60 · 7+ → 40
                    </span>
                </div>
                <div className="pac-manual-row" style={{ marginTop: 8 }}>
                    <label>Ind.6 — RFI Innovación:</label>
                    <input
                        type="number" min="0" value={rfiNum}
                        onChange={(e) => setRfiNum(parseInt(e.target.value) || 0)}
                        className="pac-manual-input"
                        style={{ width: 60 }}
                        placeholder="Num."
                    />
                    <span style={{ margin: '0 6px', color: '#7a8899' }}>/</span>
                    <input
                        type="number" min="0" value={rfiDen}
                        onChange={(e) => setRfiDen(parseInt(e.target.value) || 0)}
                        className="pac-manual-input"
                        style={{ width: 60 }}
                        placeholder="Den."
                    />
                </div>
            </div>

            {/* KPIs base */}
            {indicadores && (
                <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
                    <div className="kpi-card">
                        <div className="kpi-label">Total OC {indicadores.anio}</div>
                        <div className="kpi-value">{fmt(indicadores.total_oc)}</div>
                    </div>
                    <div className="kpi-card">
                        <div className="kpi-label">Monto OC-PAC</div>
                        <div className="kpi-value">{fmt(indicadores.monto_enlazado_pac)}</div>
                    </div>
                    <div className="kpi-card">
                        <div className="kpi-label">Monto Competitivo</div>
                        <div className="kpi-value">{fmt(indicadores.monto_competitivo)}</div>
                    </div>
                    <div className="kpi-card">
                        <div className="kpi-label">Ahorro CA</div>
                        <div className="kpi-value">{fmt(indicadores.ahorro_ca)}</div>
                    </div>
                </div>
            )}

            {/* Grid indicadores */}
            <div className="pac-ind-grid">
                {INDS.map((ind) => <IndicadorCard key={ind.n} {...ind} />)}
            </div>

            {/* Tabla Compras Ágiles */}
            {caResumen.length > 0 && (
                <div className="card" style={{ marginTop: 20 }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #ecf0f5', fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13 }}>
                        Compras Ágiles — Detalle ({caResumen.length})
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Código CA</th>
                                    <th>Nombre</th>
                                    <th>Estado</th>
                                    <th>Unidad</th>
                                    <th>Oferentes</th>
                                    <th>Monto Disp.</th>
                                    <th>OC</th>
                                </tr>
                            </thead>
                            <tbody>
                                {caResumen.map((r, i) => (
                                    <tr key={i}>
                                        <td><code>{r.codigocompraagil}</code></td>
                                        <td>{r.nombre || '—'}</td>
                                        <td>
                                            <span className={`badge ${r.estadoglosa === 'Publicada' ? 'badge-green' : r.estadoglosa === 'Cerrada' ? 'badge-blue' : 'badge-gray'}`}>
                                                {r.estadoglosa || '—'}
                                            </span>
                                        </td>
                                        <td>{r.unidadcompra || '—'}</td>
                                        <td>{r.totalofertasrecibidas || '—'}</td>
                                        <td>{r.montodisponibleclp ? fmt(parseFloat(r.montodisponibleclp)) : '—'}</td>
                                        <td>{r.oc_codigo || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
