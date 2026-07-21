import { useState } from 'react';
import { descargarReporte } from '../../api/pacCumplimientoApi';

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const ANIOS = [2026, 2025, 2024, 2023];

const FORMATOS = [
    { id: 'word', label: '📄 Word (.docx)', descripcion: 'Informe ejecutivo completo con narrativa por capítulos' },
    { id: 'ppt', label: '📊 PowerPoint (.pptx)', descripcion: 'Presentación resumida para Dirección' },
    { id: 'pdf', label: '🧾 PDF', descripcion: 'Versión imprimible y distribuible por correo' },
];

const EXTENSIONES = { word: 'docx', ppt: 'pptx', pdf: 'pdf' };
const ORDINAL_TRIMESTRE = { 1: '1er', 2: '2do', 3: '3er', 4: '4to' };

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
            <div className="card">
                <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>
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
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                    Período seleccionado: <strong>{etiquetaPeriodo}</strong> · incluye comparación vs período anterior y vs mismo período del año anterior.
                </div>
            </div>

            {error && <div className="alert alert-error">⚠️ {error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {FORMATOS.map((f) => (
                    <div key={f.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{f.label}</div>
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>{f.descripcion}</div>
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={() => handleDescargar(f.id)}
                            disabled={descargando !== null}
                        >
                            {descargando === f.id ? '⏳ Generando...' : '⬇️ Descargar'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

const selectStyle = { border: '1.5px solid #c8d3de', borderRadius: 7, padding: '6px 10px', fontSize: 13, fontFamily: 'Inter, sans-serif' };
