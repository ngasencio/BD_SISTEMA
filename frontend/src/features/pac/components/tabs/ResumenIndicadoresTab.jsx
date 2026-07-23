import React, { useState } from 'react';

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

const fPct = (v) => (v != null ? v.toFixed(1) + '%' : '—');

// Score 0-100 → banda de color institucional (verde/ámbar/rojo).
// Hex literal (no var()) porque se concatena con sufijo de alfa ("+ '20'") en la tabla.
const bandaColor = (score) =>
    score == null ? '#64748b' : score >= 75 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';

export default function ResumenIndicadoresTab({ indicadores, anio = 2026 }) {
    const [mods, setMods] = useState(0);
    const [rfiNum, setRfiNum] = useState(0);
    const [rfiDen, setRfiDen] = useState(0);

    const i1 = indicadores?.i1 ?? 0;
    const i2 = indicadores?.i2 ?? 0;
    const i4Score = indicadores?.i4_score ?? 0;
    const i5 = indicadores?.i5 ?? 0;
    const s3 = mods === 0 ? 100 : mods <= 3 ? 80 : mods <= 6 ? 60 : 40;
    const i6 = rfiDen > 0 ? (rfiNum / rfiDen) * 100 : 0;

    const sc = {
        i1: Math.min(100, i1), i2: Math.min(100, i2), i3: s3,
        i4: Math.min(100, i4Score), i5: Math.min(100, i5), i6: Math.min(100, i6),
    };
    const pw = { i1: .25, i2: .15, i3: .10, i4: .20, i5: .20, i6: .10 };
    const score = Object.keys(pw).reduce((s, k) => s + sc[k] * pw[k], 0);

    const FILAS = [
        {
            n: 1, nombre: '% Compras dentro del PAC', dimension: 'Planificación y coherencia',
            formula: 'OC enlazadas PAC / Total OC', pond: .25,
            valor: <>{fPct(i1)}</>,
        },
        {
            n: 2, nombre: '% Procesos Competitivos', dimension: 'Planificación y coherencia',
            formula: '(SE Lic + AG) / Total OC', pond: .15,
            valor: <>{fPct(i2)}</>,
        },
        {
            n: 3, nombre: 'Modificaciones al PAC', dimension: 'Planificación y coherencia',
            formula: 'N° ediciones al PAC vigente', pond: .10,
            valor: (
                <>
                    <input
                        type="number" min="0" value={mods}
                        onChange={(e) => setMods(parseInt(e.target.value) || 0)}
                        className="pac-doc-input" style={{ width: 46 }}
                    /> mods.
                </>
            ),
        },
        {
            n: 4, nombre: 'Satisfacción Servicio/Producto', dimension: 'Satisfacción y cumplimiento',
            formula: 'Σ Notas / N° notas evaluadas', pond: .20,
            valor: indicadores?.i4_nota != null
                ? <>{indicadores.i4_nota.toFixed(1)}/7 <span className="pac-doc-sub">({indicadores.i4_evaluados}/{indicadores.i4_terminados} evaluados)</span></>
                : <span className="pac-doc-pend">
                    Pendiente <span className="pac-doc-sub">({indicadores?.i4_evaluados ?? 0}/{indicadores?.i4_terminados ?? 0} evaluados)</span>
                  </span>,
        },
        {
            n: 5, nombre: 'Ahorro en Compras', dimension: 'Eficiencia y resultados',
            formula: 'Monto ahorrado / Monto adjudicado', pond: .20,
            valor: <>{fPct(i5)}</>,
        },
        {
            n: 6, nombre: '% RFI de Innovación', dimension: 'Fomento de innovación',
            formula: 'RFI Innovación / Total RFI', pond: .10,
            valor: (
                <>
                    <input
                        type="number" min="0" value={rfiNum}
                        onChange={(e) => setRfiNum(parseInt(e.target.value) || 0)}
                        className="pac-doc-input" style={{ width: 40 }} placeholder="Num."
                    />
                    <span style={{ margin: '0 4px' }}>/</span>
                    <input
                        type="number" min="0" value={rfiDen}
                        onChange={(e) => setRfiDen(parseInt(e.target.value) || 0)}
                        className="pac-doc-input" style={{ width: 40 }} placeholder="Den."
                    />
                    <span className="pac-doc-sub"> ({fPct(i6)})</span>
                </>
            ),
        },
    ];

    return (
        <div className="pac-tab-content">
            <div className="pac-score-strip">
                <div>
                    <div className="pac-score-strip-lbl">Score Res.188/2026</div>
                    <div className="pac-score-strip-hint">Ind. 3 y 6 requieren entrada manual — no se guardan al recargar.</div>
                </div>
                <div className="pac-doc-score" style={{ background: bandaColor(score) }}>
                    <div className="pac-doc-score-val">{score.toFixed(1)}</div>
                    <div className="pac-doc-score-lbl">/ 100 pts</div>
                </div>
            </div>

            {indicadores && (
                <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
                    <div className="kpi-card">
                        <div className="kpi-label">Total OC {anio}</div>
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

            <div className="pac-doc-section-title">Resumen de Indicadores</div>
            <table className="pac-doc-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Indicador</th>
                        <th>Dimensión</th>
                        <th>Fórmula</th>
                        <th>Pond.</th>
                        <th>Valor</th>
                        <th>Puntos</th>
                    </tr>
                </thead>
                <tbody>
                    {FILAS.map((f) => {
                        const puntos = sc[`i${f.n}`] * f.pond;
                        return (
                            <tr key={f.n}>
                                <td>{f.n}</td>
                                <td style={{ fontWeight: 600 }}>{f.nombre}</td>
                                <td className="pac-doc-sub">{f.dimension}</td>
                                <td className="pac-doc-sub">{f.formula}</td>
                                <td>{(f.pond * 100).toFixed(0)}%</td>
                                <td>{f.valor}</td>
                                <td style={{ background: bandaColor(sc[`i${f.n}`]) + '20', fontWeight: 700 }}>
                                    {puntos.toFixed(1)}
                                </td>
                            </tr>
                        );
                    })}
                    <tr className="pac-doc-total-row">
                        <td colSpan={6} style={{ textAlign: 'right' }}>Puntaje Total</td>
                        <td>{score.toFixed(1)}</td>
                    </tr>
                </tbody>
            </table>

            {indicadores?.i4_terminados > 0 && (
                <div className="pac-doc-note">
                    📋 <strong>Observación Ind.4 — Satisfacción Servicio/Producto:</strong> de{' '}
                    {fmtN(indicadores.i4_terminados)} contratos terminados a nivel institucional,{' '}
                    <strong>{fmtN(indicadores.i4_pendientes)}</strong> ({(indicadores.i4_pendientes / indicadores.i4_terminados * 100).toFixed(1)}%)
                    están pendientes de evaluación en Mercado Público. La nota promedio se calcula solo con los{' '}
                    {fmtN(indicadores.i4_evaluados)} contratos que sí tienen evaluación registrada.
                </div>
            )}
        </div>
    );
}
