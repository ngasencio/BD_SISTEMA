import React, { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { useAnexo1Fetch } from '../../../hooks/useAnexo1Fetch';
import { fetchDetalladoControlAnexo1 } from '../../../api/anexo1SigfeApi';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtM = (n) => 'M$ ' + (n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 });

export default function SubTabControl({ filtros, filasBase }) {
    const [concepto, setConcepto] = useState('');

    const conceptosDisponibles = useMemo(
        () => (filasBase || []).filter((f) => f.devengado > 0).sort((a, b) => a.codigo.localeCompare(b.codigo)),
        [filasBase],
    );

    const { data, loading, error } = useAnexo1Fetch(
        fetchDetalladoControlAnexo1,
        { ue: filtros.ue || undefined, concepto: concepto || undefined },
        0, 'No se pudo cargar el Control Estadístico.',
    );

    const chartData = useMemo(() => {
        if (!data?.suficiente) return null;
        const outOfControl = data.serie_actual.map((v) => (v != null && (v > data.ucl || v < data.lcl) ? v / 1e6 : null));
        return {
            labels: MESES,
            datasets: [
                { label: 'Límite Superior (μ+σ)', data: Array(12).fill(data.ucl / 1e6), borderColor: 'rgba(0,111,179,.4)', borderDash: [4, 3], pointRadius: 0, borderWidth: 1.5 },
                { label: 'Límite Inferior (μ−σ)', data: Array(12).fill(data.lcl / 1e6), borderColor: 'rgba(0,111,179,.4)', borderDash: [4, 3], pointRadius: 0, borderWidth: 1.5, fill: false },
                { label: `Media histórica: ${fmtM(data.media)}`, data: Array(12).fill(data.media / 1e6), borderColor: 'rgba(0,111,179,.7)', borderDash: [8, 4], pointRadius: 0, borderWidth: 2 },
                { label: `Devengado ${data.anho_actual}`, data: data.serie_actual.map((v) => (v != null ? v / 1e6 : null)), borderColor: '#1B3FD8', borderWidth: 2.5, pointRadius: 4, tension: 0.3, spanGaps: false },
                { label: 'Fuera de control', data: outOfControl, borderColor: 'transparent', backgroundColor: '#D0202F', pointRadius: 8, showLine: false },
            ],
        };
    }, [data]);

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--gob-gris4)', display: 'block', marginBottom: 4 }}>Concepto</label>
                <select value={concepto} onChange={(e) => setConcepto(e.target.value)} style={{ padding: '7px 10px', border: '1px solid var(--gob-gris3)', borderRadius: 7, fontSize: 12.5, minWidth: 260 }}>
                    <option value="">Seleccionar concepto…</option>
                    {conceptosDisponibles.map((c) => (
                        <option key={c.concepto} value={c.concepto}>{c.codigo} {c.nombre}</option>
                    ))}
                </select>
            </div>

            {!concepto && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--gob-gris4)' }}>Selecciona un concepto para ver su control estadístico (Shewhart).</div>}
            {loading && concepto && <div className="loading-spinner">Cargando…</div>}
            {error && <div className="error-message">{error}</div>}

            {concepto && data && !data.suficiente && (
                <div className="error-message">Datos insuficientes (mínimo 3 meses históricos con devengo &gt; 0).</div>
            )}

            {chartData && (
                <>
                    <div className="card" style={{ padding: 16, height: 380, marginBottom: 16 }}>
                        <div
                            style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-gris5)', marginBottom: 10 }}
                            data-tip="Gráfico de control (Shewhart): compara el gasto mensual del año actual contra la media histórica ± 1 desviación estándar del concepto. Puntos rojos = fuera de control."
                        >
                            Control Estadístico — μ = {fmtM(data.media)}, σ = {fmtM(data.sigma)}
                        </div>
                        <Line
                            data={chartData}
                            options={{
                                responsive: true, maintainAspectRatio: false,
                                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, filter: (i) => i.text !== 'Límite Inferior (μ−σ)' } } },
                                scales: { y: { ticks: { callback: (v) => `M$${v}` } } },
                            }}
                        />
                    </div>
                    {data.fuera_de_control.length > 0 ? (
                        <div style={{ background: 'var(--gob-rojo-lt)', border: '1px solid var(--gob-rojo)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 12.5, color: 'var(--gob-rojo)' }}>
                            ⚠️ {data.fuera_de_control.length} mes(es) fuera de control en {data.anho_actual}:
                            <ul style={{ margin: '6px 0 0 16px' }}>
                                {data.fuera_de_control.map((f) => (
                                    <li key={f.mes}><strong>{f.mes}:</strong> {fmtM(f.valor)} — {f.sobre_limite ? 'Sobre límite superior' : 'Bajo límite inferior'}</li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <div style={{ background: 'var(--gob-verde-lt)', border: '1px solid var(--gob-verde)', borderRadius: 'var(--radius)', padding: '10px 16px', fontSize: 12.5, color: 'var(--gob-verde)' }}>
                            ✅ Todos los meses de {data.anho_actual} dentro de los límites de control estadístico.
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
