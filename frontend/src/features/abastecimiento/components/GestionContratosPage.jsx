import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    iniciarActualizacionContratos,
    estadoActualizacionContratos,
    cancelarActualizacionContratos,
} from '../api/contratosApi';
import { FiltrosLateral } from './contratos/FiltrosLateral';
import { TabEvaluaciones } from './contratos/TabEvaluaciones';
import { TabFinanciero } from './contratos/TabFinanciero';
import { TabPlazos } from './contratos/TabPlazos';
import { TabPAC } from './contratos/TabPAC';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

// ─── Banner de progreso ETL ───────────────────────────────────────────────────

function BannerContratos({ tarea, onCerrar, onCancelar }) {
    if (!tarea) return null;
    const completado = tarea.status === 'completado';
    const error      = tarea.status === 'error';
    const enProceso  = tarea.status === 'en_proceso' || tarea.status === 'iniciado';
    const color = completado ? '#16a34a' : error ? '#dc2626' : '#7c3aed';

    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
            background: '#1e1e2e', border: `2px solid ${color}`,
            borderRadius: 12, padding: '16px 20px', width: 380,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)', fontFamily: 'monospace',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ color, fontWeight: 700, fontSize: 13 }}>
                    {completado ? '✅ Carga completada' : error ? '❌ Error' : '🔄 Cargando contratos...'}
                </span>
                <button onClick={onCerrar} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ background: '#374151', borderRadius: 4, height: 6, marginBottom: 10 }}>
                <div style={{ width: `${tarea.progreso_pct || (completado ? 100 : enProceso ? 40 : 0)}%`, background: color, height: '100%', borderRadius: 4, transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ color: '#d1d5db', fontSize: 12, marginBottom: 8 }}>{tarea.paso_desc}</div>
            {tarea.total_registros > 0 && (
                <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 6 }}>
                    {tarea.total_cargados > 0
                        ? `${fmtN(tarea.total_cargados)} / ${fmtN(tarea.total_registros)} contratos cargados`
                        : `${fmtN(tarea.total_registros)} contratos encontrados`}
                </div>
            )}
            {tarea.archivo_nombre && (
                <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 6 }}>Archivo: {tarea.archivo_nombre}</div>
            )}
            {tarea.logs_recientes?.length > 0 && (
                <div style={{ background: '#111827', borderRadius: 6, padding: '6px 8px', maxHeight: 80, overflowY: 'auto', fontSize: 10, color: '#4ade80', lineHeight: 1.5 }}>
                    {tarea.logs_recientes.map((l, i) => <div key={i}>&gt; {l}</div>)}
                </div>
            )}
            {error && <div style={{ color: '#fca5a5', fontSize: 11, marginTop: 8 }}>{tarea.error}</div>}
            {enProceso && (
                <button onClick={onCancelar} style={{ marginTop: 10, width: '100%', padding: '6px', background: '#374151', border: '1px solid #6b7280', borderRadius: 6, color: '#d1d5db', cursor: 'pointer', fontSize: 12 }}>
                    Cancelar
                </button>
            )}
        </div>
    );
}

// ─── Definición de tabs ───────────────────────────────────────────────────────

const TABS = [
    { id: 'evaluaciones', label: 'Evaluaciones Res.188', icono: '📝', analitico: true },
    { id: 'financiero',   label: 'Seg. Financiero',      icono: '💰', analitico: true },
    { id: 'plazos',       label: 'Plazos y Vigencia',    icono: '📅', analitico: true },
    { id: 'pac',          label: 'Cruce PAC',            icono: '🔗', analitico: true },
];

const FILTROS_VACIO = { estado_contrato: '', categoria_contrato: '', tipo_contrato: '', unidad_requirente: '' };

// ─── Página principal ─────────────────────────────────────────────────────────

export function GestionContratosPage() {
    const [tab, setTab]                         = useState('evaluaciones');
    const [tarea, setTarea]                     = useState(null);
    const [iniciando, setIniciando]             = useState(false);
    const [filtros, setFiltros]                 = useState(FILTROS_VACIO);
    const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
    const pollingRef                            = useRef(null);

    useEffect(() => {
        return () => clearInterval(pollingRef.current);
    }, []);

    const iniciarPolling = useCallback((taskId) => {
        clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
            try {
                const { data } = await estadoActualizacionContratos(taskId);
                setTarea(data);
                if (['completado', 'error', 'cancelado'].includes(data.status)) {
                    clearInterval(pollingRef.current);
                }
            } catch {
                clearInterval(pollingRef.current);
            }
        }, 2000);
    }, []);

    const handleActualizar = async () => {
        if (iniciando) return;
        setIniciando(true);
        try {
            const { data } = await iniciarActualizacionContratos();
            setTarea({ status: 'iniciado', task_id: data.task_id, paso: 0, paso_desc: 'Iniciando...', progreso_pct: 0, logs_recientes: [] });
            iniciarPolling(data.task_id);
        } catch (err) {
            alert(err.response?.data?.error || 'Error al iniciar la actualización.');
        } finally {
            setIniciando(false);
        }
    };

    const handleCancelar = async () => {
        if (!tarea?.task_id) return;
        try { await cancelarActualizacionContratos(tarea.task_id); } catch { /* ignorar */ }
        clearInterval(pollingRef.current);
        setTarea(prev => ({ ...prev, status: 'cancelado', paso_desc: 'Cancelado por el usuario.' }));
    };

    const enProceso = tarea?.status === 'iniciado' || tarea?.status === 'en_proceso';
    const filtrosActivos = Object.values(filtros).some(v => v !== '');

    return (
        <div className="feature-page">
            {/* ── Cabecera ── */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div className="page-title"><span className="page-title-icon">📋</span> Gestión de Contratos</div>
                    <div className="page-subtitle">Contratos vigentes e históricos — Servicio de Salud Osorno · Mercado Público</div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <FiltrosLateral
                        filtros={filtros}
                        onChange={setFiltros}
                        stats={null}
                        abierto={filtrosAbiertos}
                        onToggle={() => setFiltrosAbiertos(a => !a)}
                    />
                    <button
                        onClick={handleActualizar}
                        disabled={iniciando || enProceso}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '9px 18px',
                            background: enProceso ? '#6b21a8' : '#7c3aed',
                            color: '#fff', border: 'none', borderRadius: 8,
                            fontSize: 13, fontWeight: 600,
                            cursor: (iniciando || enProceso) ? 'not-allowed' : 'pointer',
                            opacity: iniciando ? 0.7 : 1, whiteSpace: 'nowrap',
                        }}
                    >
                        {enProceso ? '⚙️' : '🔄'}
                        {enProceso ? 'Cargando...' : 'Actualizar desde Excel'}
                    </button>
                </div>
            </div>

            {/* ── Banner filtros activos ── */}
            {filtrosActivos && (
                <div style={{
                    background: '#fef9c3', border: '1px solid #fcd34d', borderRadius: 8,
                    padding: '10px 16px', marginBottom: 12,
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13,
                }}>
                    <span style={{ fontSize: 16 }}>🔔</span>
                    <span style={{ color: '#92400e', fontWeight: 600 }}>Filtros activos:</span>
                    {filtros.estado_contrato && (
                        <span style={{ background: '#fff', border: '1px solid #fcd34d', borderRadius: 20, padding: '2px 10px', fontSize: 12, color: '#92400e' }}>
                            Estado: <strong>{filtros.estado_contrato}</strong>
                        </span>
                    )}
                    {filtros.categoria_contrato && (
                        <span style={{ background: '#fff', border: '1px solid #fcd34d', borderRadius: 20, padding: '2px 10px', fontSize: 12, color: '#92400e' }}>
                            Categoría: <strong>{filtros.categoria_contrato}</strong>
                        </span>
                    )}
                    {filtros.tipo_contrato && (
                        <span style={{ background: '#fff', border: '1px solid #fcd34d', borderRadius: 20, padding: '2px 10px', fontSize: 12, color: '#92400e' }}>
                            Tipo: <strong>{filtros.tipo_contrato}</strong>
                        </span>
                    )}
                    {filtros.unidad_requirente && (
                        <span style={{ background: '#fff', border: '1px solid #fcd34d', borderRadius: 20, padding: '2px 10px', fontSize: 12, color: '#92400e' }}>
                            Unidad: <em>"{filtros.unidad_requirente}"</em>
                        </span>
                    )}
                    <div style={{ flex: 1 }} />
                    <button
                        onClick={() => setFiltros(FILTROS_VACIO)}
                        style={{ background: '#fcd34d', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, color: '#78350f', cursor: 'pointer', fontWeight: 700 }}
                    >
                        ✕ Limpiar filtros
                    </button>
                </div>
            )}

            {/* ── Tabs ── */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid #e5e7eb', flexWrap: 'wrap' }}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        className={`tab-btn${tab === t.id ? ' active' : ''}`}
                        onClick={() => setTab(t.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '8px 12px' }}
                    >
                        <span>{t.icono}</span> {t.label}
                        {filtrosActivos && tab === t.id && (
                            <span style={{ background: '#7c3aed', color: '#fff', borderRadius: 10, fontSize: 10, padding: '1px 5px', marginLeft: 2 }}>•</span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Contenido ── */}
            <>
                {tab === 'evaluaciones' && <TabEvaluaciones />}
                {tab === 'financiero'   && <TabFinanciero   filtros={filtros} />}
                {tab === 'plazos'       && <TabPlazos       filtros={filtros} />}
                {tab === 'pac'          && <TabPAC          filtros={filtros} />}
            </>

            {/* ── Banner ETL ── */}
            <BannerContratos tarea={tarea} onCerrar={() => { clearInterval(pollingRef.current); setTarea(null); }} onCancelar={handleCancelar} />
        </div>
    );
}

export default GestionContratosPage;
