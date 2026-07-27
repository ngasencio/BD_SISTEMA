import React, { useState } from 'react';
import { descargarReporteAnexo1 } from '../../api/anexo1SigfeApi';
import { paramsBase } from './filtrosParams';

const SECCIONES = [
    { id: 'kpi', label: '📊 Resumen Ejecutivo (KPIs)' },
    { id: 'tabla', label: '📋 Ejecución por Subtítulo' },
    { id: 'semaforo', label: '🚦 Semáforo de Cierre' },
    { id: 'alertas', label: '⚠️ Alertas y Anomalías (top 10)' },
];

export default function TabExportar({ filtros }) {
    const [secciones, setSecciones] = useState(() => new Set(SECCIONES.map((s) => s.id)));
    const [descargando, setDescargando] = useState(false);
    const [error, setError] = useState(null);

    const toggle = (id) => {
        setSecciones((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleDescargar = async () => {
        setDescargando(true);
        setError(null);
        try {
            const { data } = await descargarReporteAnexo1(paramsBase(filtros, { secciones: [...secciones].join(',') }));
            const url = window.URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Anexo1_Ejecucion_Presupuestaria_${filtros.anho || ''}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            setError('Error al generar el reporte PDF.');
        } finally {
            setDescargando(false);
        }
    };

    return (
        <div className="card" style={{ padding: 24, maxWidth: 560 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 6 }}>📤 Exportar Reporte PDF</div>
            <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 18 }}>
                Genera un PDF con el estado de ejecución presupuestaria para el establecimiento y período
                seleccionados en el filtro de arriba.
            </div>

            <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>
                    Secciones a incluir
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {SECCIONES.map((s) => (
                        <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: '#334155' }}>
                            <input type="checkbox" checked={secciones.has(s.id)} onChange={() => toggle(s.id)} />
                            {s.label}
                        </label>
                    ))}
                </div>
            </div>

            {error && <div className="error-message" style={{ marginBottom: 12 }}>{error}</div>}

            <button
                onClick={handleDescargar}
                disabled={descargando || secciones.size === 0}
                style={{
                    padding: '10px 20px', background: descargando ? '#94a3b8' : '#0ea5e9', color: '#fff',
                    border: 'none', borderRadius: 8, cursor: descargando ? 'not-allowed' : 'pointer',
                    fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                }}
            >
                {descargando ? '⏳ Generando...' : '📄 Generar PDF'}
            </button>
        </div>
    );
}
