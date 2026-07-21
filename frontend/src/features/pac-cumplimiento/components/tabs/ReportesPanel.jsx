import { useState } from 'react';
import { descargarReporte } from '../../api/pacCumplimientoApi';

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const ANIOS = [2026, 2025, 2024, 2023];

const FORMATOS = [
    {
        id: 'word', icono: '📄', label: 'Word', ext: '.docx',
        badge: 'Completo', badgeColor: 'var(--gob-azul-light)',
        descripcion: 'Informe exhaustivo con portada institucional, índice, metodología, un capítulo por subdirección y anexos.',
        colorAcento: 'var(--gob-azul)',
    },
    {
        id: 'pdf', icono: '🧾', label: 'PDF', ext: '.pdf',
        badge: 'Completo', badgeColor: 'var(--gob-azul-light)',
        descripcion: 'Misma versión exhaustiva del Word, lista para imprimir y distribuir por correo a Alta Dirección.',
        colorAcento: 'var(--gob-rojo)',
    },
    {
        id: 'ppt', icono: '📊', label: 'PowerPoint', ext: '.pptx',
        badge: 'Por subdirección', badgeColor: 'var(--gob-celeste)',
        descripcion: 'Presentación completa (~30 diapositivas): resumen institucional y luego un capítulo con KPIs, gráficos y tablas por cada subdirección — lista para exponer completa o subdirección por subdirección.',
        colorAcento: 'var(--gob-celeste)',
    },
];

const EXTENSIONES = { word: 'docx', ppt: 'pptx', pdf: 'pdf' };
const ORDINAL_TRIMESTRE = { 1: '1er', 2: '2do', 3: '3er', 4: '4to' };

const CONTENIDO_INFORME = [
    'Portada institucional con logo e imagen del edificio principal',
    'Índice con numeración de página automática',
    'Resumen ejecutivo institucional (KPIs, gráficos, variación vs período anterior)',
    'Metodología — cómo se integran Formularios FSC y Plan Anual de Compras',
    'Un capítulo por subdirección con su detalle de cumplimiento y ejecución',
    'Rankings institucionales de departamentos y formularios',
    'Alertas y seguimiento — proyectos sin iniciar, próximos y atrasados',
    'Conclusiones y recomendaciones',
];

export default function ReportesPanel() {
    const [tipoPeriodo, setTipoPeriodo] = useState('mensual');
    const [anio, setAnio] = useState(2026);
    const [mes, setMes] = useState(new Date().getMonth() + 1);
    const [trimestre, setTrimestre] = useState(3);
    const [descargando, setDescargando] = useState(null);
    const [error, setError] = useState(null);

    const periodo = tipoPeriodo === 'mensual'
        ? `${anio}-${String(mes).padStart(2, '0')}`
        : `${anio}-Q${trimestre}`;

    const etiquetaPeriodo = tipoPeriodo === 'mensual'
        ? `${MESES[mes - 1]} ${anio}`
        : `${ORDINAL_TRIMESTRE[trimestre]} trimestre ${anio}`;

    const handleDescargar = async (formato) => {
        setDescargando(formato);
        setError(null);
        try {
            const { data } = await descargarReporte(formato, periodo);
            const url = window.URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Informe_PAC_${periodo}.${EXTENSIONES[formato]}`;
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 980 }}>
            {/* Hero institucional */}
            <div style={{
                background: 'linear-gradient(120deg, var(--gob-azul-dark), var(--gob-azul) 55%, var(--gob-azul-mid))',
                borderRadius: 14, padding: '22px 26px', color: '#fff',
                display: 'flex', alignItems: 'center', gap: 18,
                boxShadow: '0 4px 16px rgba(30,58,95,.18)',
            }}>
                <div style={{
                    width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,.14)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0,
                }}>
                    📑
                </div>
                <div>
                    <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: .2 }}>
                        Informe de Seguimiento y Ejecución del Plan Anual de Compras
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--gob-celeste)', marginTop: 3, fontWeight: 600 }}>
                        Dirección Servicio de Salud Osorno · Reporte institucional unificado
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 20, alignItems: 'start' }}>
                {/* Selector de período */}
                <div className="card">
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-azul)', marginBottom: 12 }}>
                        📅 Período del informe
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <button
                            className={`tab-btn ${tipoPeriodo === 'mensual' ? 'active' : ''}`}
                            onClick={() => setTipoPeriodo('mensual')}
                        >
                            Mensual
                        </button>
                        <button
                            className={`tab-btn ${tipoPeriodo === 'trimestral' ? 'active' : ''}`}
                            onClick={() => setTipoPeriodo('trimestral')}
                        >
                            Trimestral
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={selectStyle}>
                            {ANIOS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                        {tipoPeriodo === 'mensual' ? (
                            <select value={mes} onChange={(e) => setMes(Number(e.target.value))} style={selectStyle}>
                                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                            </select>
                        ) : (
                            <select value={trimestre} onChange={(e) => setTrimestre(Number(e.target.value))} style={selectStyle}>
                                <option value={1}>1er trimestre (Ene-Mar)</option>
                                <option value={2}>2do trimestre (Abr-Jun)</option>
                                <option value={3}>3er trimestre (Jul-Sep)</option>
                                <option value={4}>4to trimestre (Oct-Dic)</option>
                            </select>
                        )}
                    </div>
                    <div style={{
                        marginTop: 12, padding: '8px 10px', borderRadius: 8,
                        background: 'var(--gob-celeste-lt)', fontSize: 11.5, color: 'var(--gob-azul-dark)',
                    }}>
                        Período seleccionado: <strong>{etiquetaPeriodo}</strong>. Incluye comparación vs período anterior y vs mismo período del año anterior. La Ejecución del Plan de Compras siempre refleja el año PAC completo ({anio}).
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

            {error && <div className="alert alert-error">⚠️ {error}</div>}

            {/* Formatos de descarga */}
            <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-azul)', marginBottom: 10 }}>
                    ⬇️ Descargar informe — {etiquetaPeriodo}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                    {FORMATOS.map((f) => (
                        <div key={f.id} className="card" style={{
                            display: 'flex', flexDirection: 'column', gap: 10,
                            borderTop: `3px solid ${f.colorAcento}`, position: 'relative',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 22 }}>{f.icono}</span>
                                    <div>
                                        <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1e293b' }}>{f.label}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{f.ext}</div>
                                    </div>
                                </div>
                                <span style={{
                                    fontSize: 10, fontWeight: 700, color: '#fff', background: f.badgeColor,
                                    borderRadius: 20, padding: '3px 9px', letterSpacing: .3,
                                }}>
                                    {f.badge}
                                </span>
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

const selectStyle = { border: '1.5px solid #c8d3de', borderRadius: 7, padding: '6px 10px', fontSize: 13, fontFamily: 'Inter, sans-serif' };
