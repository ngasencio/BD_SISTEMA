import React from 'react';
import { KpiCard } from '../../abastecimiento/components/KpiCard';
import SerieTemporalChart from './datos/SerieTemporalChart';
import PivotTipoDocumento from './datos/PivotTipoDocumento';
import RelacionOCCard from './datos/RelacionOCCard';
import TareaActualList from './datos/TareaActualList';
import RegistrosPorAnio from './datos/RegistrosPorAnio';
import HistorialSync from './datos/HistorialSync';
import DuplicadosPanel from './datos/DuplicadosPanel';
import { fmtN, fmtCLPCorto, fmtFechaHora, fmtFecha } from '../utils/format';

export default function TabDatos({ stats, loading, error, analisis, analisisLoading, analisisError }) {
    if (loading) return <div className="loading-spinner">Cargando datos...</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!stats) return null;

    const { total_registros, por_anio, ultima_sync, historial_sync } = stats;

    return (
        <div>
            {/* ── Explicación para quien recién ve el módulo ── */}
            <div style={{
                background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
                padding: '12px 16px', marginBottom: 18, fontSize: 12.5, color: '#1e3a5f', lineHeight: 1.6,
            }}>
                <strong>¿Qué muestra esta pantalla?</strong> Este panel resume el estado actual de la base de
                datos de <strong>Facturas</strong>, sincronizada desde el portal <strong>DIPRES/Acepta</strong>{' '}
                mediante el botón "Actualizar Dipres". Debajo del resumen general encontrarás cómo se componen
                esas facturas: por tipo de documento, su evolución mes a mes, si vienen o no asociadas a una
                Orden de Compra de Mercado Público, en qué estado de tramitación están, y un control de calidad
                que detecta posibles duplicados.
            </div>

            {/* ── KPIs generales ── */}
            <section className="kpi-grid">
                <KpiCard
                    title="Total de Facturas"
                    value={fmtN(total_registros)}
                    subtitle="Registros en base de datos"
                    icon="🧾"
                    colorVar="--color-primary"
                />
                <KpiCard
                    title="Monto Total Facturado"
                    value={analisis ? fmtCLPCorto(analisis.montos.total) : '—'}
                    subtitle="Suma de monto_total histórico"
                    icon="💰"
                    colorVar="--color-accent"
                />
                <KpiCard
                    title="Última Actualización"
                    value={ultima_sync ? fmtFechaHora(ultima_sync.fecha_ejecucion) : 'Sin corridas'}
                    subtitle={ultima_sync ? `Rango: ${fmtFecha(ultima_sync.fecha_desde)} – ${fmtFecha(ultima_sync.fecha_hasta)}` : 'Aún no se ha actualizado desde DIPRES'}
                    icon="🕒"
                    colorVar={ultima_sync?.estado === 'error' ? '--color-danger' : '--color-success'}
                />
                <KpiCard
                    title="Nuevas (última corrida)"
                    value={fmtN(ultima_sync?.registros_nuevos)}
                    subtitle="Facturas insertadas"
                    icon="✨"
                    colorVar="--color-accent"
                />
                <KpiCard
                    title="Actualizadas (última corrida)"
                    value={fmtN(ultima_sync?.registros_actualizados)}
                    subtitle="Facturas con cambios"
                    icon="🔄"
                    colorVar="--color-warning"
                />
            </section>

            {ultima_sync?.estado === 'error' && ultima_sync.error_mensaje && (
                <div className="error-message" style={{ marginTop: -8, marginBottom: 20 }}>
                    Última corrida terminó en error: {ultima_sync.error_mensaje}
                </div>
            )}

            {/* ── Análisis de composición (tipo_documento, temporal, OC, tarea_actual, duplicados) ── */}
            {analisisLoading && <div className="loading-spinner">Cargando análisis...</div>}
            {analisisError && <div className="error-message">{analisisError}</div>}
            {analisis && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
                    <SerieTemporalChart serie={analisis.serie_temporal} />

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 16 }}>
                        <PivotTipoDocumento datos={analisis.por_tipo_documento} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <RelacionOCCard relacion={analisis.relacion_oc} />
                            <TareaActualList datos={analisis.por_tarea_actual} />
                        </div>
                    </div>

                    <DuplicadosPanel duplicados={analisis.duplicados} />
                </div>
            )}

            {/* ── Registros por año + historial de sync ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
                <RegistrosPorAnio porAnio={por_anio} />
                <HistorialSync historial={historial_sync} />
            </div>
        </div>
    );
}
