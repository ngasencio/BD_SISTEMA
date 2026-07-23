import React, { useState } from 'react';
import { descargarReporteInd1 } from '../../api/pacApi';

const ANIOS = [2026, 2025, 2024, 2023, 2022, 2021, 2020];

const FORMATOS = [
    {
        id: 'word', icono: '📄', label: 'Word', ext: '.docx',
        descripcion: 'Informe institucional con portada, resumen ejecutivo del Score Res.188, tabla completa de los 6 indicadores y detalle de Órdenes de Compra.',
        colorAcento: 'var(--gob-azul)',
    },
    {
        id: 'pdf', icono: '🧾', label: 'PDF', ext: '.pdf',
        descripcion: 'Misma versión exhaustiva del Word, lista para imprimir y distribuir por correo a Alta Dirección.',
        colorAcento: 'var(--gob-rojo)',
    },
    {
        id: 'ppt', icono: '📊', label: 'PowerPoint', ext: '.pptx',
        descripcion: 'Presentación con una diapositiva por indicador Res.188, resumen de Órdenes de Compra y conclusiones — lista para exponer.',
        colorAcento: 'var(--gob-celeste)',
    },
];

const CONTENIDO_INFORME = [
    'Portada institucional con logo e imagen del edificio principal',
    'Índice con numeración de página automática',
    'Resumen ejecutivo: % de enlace al PAC y variación vs año anterior',
    'Evolución mensual, comparativo trimestral y comparativo anual histórico',
    '% Enlace Mensual comparado entre los últimos años',
    'Detalle de Órdenes de Compra fuera del PAC por tipo',
    'Registro de OC corregidas manualmente',
    'Conclusiones y recomendaciones',
];

const EXTENSIONES = { word: 'docx', ppt: 'pptx', pdf: 'pdf' };

export default function ReportesTab() {
    const [anio, setAnio] = useState(2026);
    const [descargando, setDescargando] = useState(null);
    const [error, setError] = useState(null);

    const handleDescargar = async (formato) => {
        setDescargando(formato);
        setError(null);
        try {
            const { data } = await descargarReporteInd1(formato, anio);
            const url = window.URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Indicador1_PAC_${anio}.${EXTENSIONES[formato]}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setError(err.response?.data?.error || 'Error al generar el reporte.');
        } finally {
            setDescargando(null);
        }
    };

    return (
        <div className="pac-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 980 }}>
            {/* Hero institucional */}
            <div className="pac-reportes-hero">
                <div className="pac-reportes-hero-icon">📑</div>
                <div>
                    <div className="pac-reportes-hero-title">Informe de Gestión PAC — Indicador 1: % Compras dentro del PAC</div>
                    <div className="pac-reportes-hero-sub">
                        Dirección Servicio de Salud Osorno · Análisis de enlace al Plan Anual de Compras
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: 20, alignItems: 'start' }}>
                {/* Selector de año */}
                <div className="card">
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-azul)', marginBottom: 12 }}>
                        📅 Año del informe
                    </div>
                    <select
                        value={anio}
                        onChange={(e) => setAnio(Number(e.target.value))}
                        style={{ width: '100%', border: '1.5px solid #c8d3de', borderRadius: 7, padding: '7px 10px', fontSize: 13, fontFamily: 'Inter, sans-serif' }}
                    >
                        {ANIOS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <div style={{
                        marginTop: 12, padding: '8px 10px', borderRadius: 8,
                        background: 'var(--gob-celeste-lt)', fontSize: 11.5, color: 'var(--gob-azul-dark)',
                    }}>
                        El comparativo anual y el % de enlace mensual siempre incluyen todos los años con datos —
                        el selector solo define el año de enfoque del resto del informe.
                    </div>
                </div>

                {/* Qué incluye el informe */}
                <div className="card">
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-azul)', marginBottom: 10 }}>
                        📋 Contenido del informe
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                        {CONTENIDO_INFORME.map((item) => (
                            <div key={item} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#374151', lineHeight: 1.4 }}>
                                <span style={{ color: 'var(--gob-verde)', flexShrink: 0 }}>✓</span>
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {error && <div className="alert alert-warning">⚠️ {error}</div>}

            {/* Formatos de descarga */}
            <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-azul)', marginBottom: 10 }}>
                    ⬇️ Descargar informe — Año {anio}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                    {FORMATOS.map((f) => (
                        <div key={f.id} className="card" style={{
                            display: 'flex', flexDirection: 'column', gap: 10,
                            borderTop: `3px solid ${f.colorAcento}`, position: 'relative',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 22 }}>{f.icono}</span>
                                <div>
                                    <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1e293b' }}>{f.label}</div>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{f.ext}</div>
                                </div>
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45, minHeight: 48 }}>
                                {f.descripcion}
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={() => handleDescargar(f.id)}
                                disabled={descargando !== null}
                                style={{ width: '100%', justifyContent: 'center' }}
                            >
                                {descargando === f.id ? '⏳ Generando…' : '⬇️ Descargar'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
