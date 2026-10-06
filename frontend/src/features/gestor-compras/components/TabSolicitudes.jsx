import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getGestorStats } from '../api/gestorComprasApi';
import { KpiCard } from '../../abastecimiento/components/KpiCard';
import FlujoVisacionGestor from './solicitudes/FlujoVisacionGestor';
import TablaSolicitudesGestor from './solicitudes/TablaSolicitudesGestor';
import AlertasGestor from './solicitudes/AlertasGestor';
import { ESTADO_FSC_INFO, InfoTooltip, fmtCLP, fmtN } from './solicitudes/shared';

// Tab Solicitudes: en qué etapa van los formularios (FSC) del departamento. Misma vista
// que Abastecimiento › Formularios FSC (KPIs + línea de flujo de visación + tabla), de solo
// lectura y acotada al departamento; más las alertas de demora.
export default function TabSolicitudes({ params }) {
    const [stats, setStats] = useState(null);
    const [anho, setAnho] = useState(null);
    const [anhoInicializado, setAnhoInicializado] = useState(false);
    const [filtroBandeja, setFiltroBandeja] = useState([]);
    const [vista, setVista] = useState('solicitudes');
    const tablaRef = useRef(null);

    // Estadísticas del departamento. El año por defecto es el más reciente con datos (lo que
    // interesa para el seguimiento del día a día); "Todos los años" sigue disponible.
    useEffect(() => {
        let activo = true;
        getGestorStats({ ...params, ...(anho ? { anho } : {}) })
            .then(({ data }) => {
                if (!activo) return;
                setStats(data);
                if (!anhoInicializado) {
                    setAnhoInicializado(true);
                    const reciente = data.anios_disponibles?.[0];
                    if (reciente) setAnho(String(reciente));
                }
            })
            .catch(() => { if (activo) setStats(null); });
        return () => { activo = false; };
    }, [params, anho, anhoInicializado]);

    // Cambiar de departamento (supervisión) reinicia año y filtros.
    useEffect(() => { setAnho(null); setAnhoInicializado(false); setFiltroBandeja([]); }, [params]);
    useEffect(() => { setFiltroBandeja([]); }, [anho]);

    const seleccionarBandeja = useCallback((nueva) => {
        setFiltroBandeja(nueva);
        if (nueva?.length && tablaRef.current) {
            setTimeout(() => tablaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        }
    }, []);

    const kpis = stats?.kpis;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>📅 Año</span>
                <select className="filtro-select" value={anho || ''} onChange={(e) => setAnho(e.target.value || null)}>
                    <option value="">Todos los años</option>
                    {stats?.anios_disponibles?.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {[['solicitudes', '📝 Solicitudes'], ['alertas', '⏰ Alertas / Demoras']].map(([id, label]) => (
                        <button key={id} className={`tab-btn ${vista === id ? 'active' : ''}`} onClick={() => setVista(id)}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {vista === 'solicitudes' ? (
                <>
                    {kpis && (
                        <section className="kpi-grid">
                            <KpiCard
                                title={<>Total Formularios <InfoTooltip text="Solicitudes FSC de su departamento, según el año seleccionado." /></>}
                                value={fmtN(kpis.total_formularios)}
                                subtitle="FSC de su departamento"
                                icon="📋"
                                colorVar="--color-primary"
                            />
                            <KpiCard
                                title={<>Derivados a Comprador <InfoTooltip text="Solicitudes de su departamento que ya fueron derivadas a un comprador para su gestión de compra." /></>}
                                value={fmtN(kpis.total_derivados)}
                                subtitle={`${kpis.pct_derivados}% del total`}
                                icon="➡️"
                                colorVar="--color-accent"
                            />
                            <KpiCard
                                title={<>Monto Total Estimado <InfoTooltip text="Suma del monto estimado de las solicitudes FSC de su departamento." /></>}
                                value={fmtCLP(kpis.monto_total_estimado)}
                                subtitle="Suma de solicitudes FSC"
                                icon="💰"
                                colorVar="--color-success"
                            />
                            <KpiCard
                                title={<>Estados de Compra <InfoTooltip text="Categorías distintas de estado de compra entre sus formularios derivados." /></>}
                                value={fmtN(stats.por_estado_compra?.length ?? 0)}
                                subtitle="Categorías distintas"
                                icon="🏷️"
                                colorVar="--color-warning"
                            />
                        </section>
                    )}

                    <FlujoVisacionGestor params={params} anho={anho} estadoSel={filtroBandeja} onSelectEstado={seleccionarBandeja} />

                    <div className="card">
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ fontWeight: 700, color: '#1e293b', fontSize: 14 }}>
                                Solicitudes FSC
                                {filtroBandeja.length > 0 && (
                                    <span style={{ marginLeft: 8, fontSize: 12, color: '#7c3aed', fontWeight: 400 }}>
                                        — filtrando por: <strong>{filtroBandeja.map((c) => ESTADO_FSC_INFO[c]?.nombre || c).join(', ')}</strong>
                                    </span>
                                )}
                            </span>
                        </div>
                        <div style={{ padding: '16px 20px' }}>
                            <TablaSolicitudesGestor
                                params={params}
                                filtroBandeja={filtroBandeja}
                                onFiltroChange={setFiltroBandeja}
                                anho={anho}
                                tablaRef={tablaRef}
                            />
                        </div>
                    </div>
                </>
            ) : (
                <AlertasGestor params={params} anho={anho} />
            )}
        </div>
    );
}
