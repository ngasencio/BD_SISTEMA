import React, { useEffect, useState } from 'react';
import { getGestorPlanResumen, getGestorPlanTemporal } from '../api/gestorComprasApi';
import ResumenPlan from './plan/ResumenPlan';
import TemporalPlan from './plan/TemporalPlan';
import ItemsPlan from './plan/ItemsPlan';
import ModalFichaGestor from './plan/ModalFichaGestor';

const VISTAS = [
    { id: 'resumen', label: '📊 Resumen Dentro/Fuera PAC' },
    { id: 'temporal', label: '⏱️ Cumplimiento temporal' },
    { id: 'items', label: '📋 Ítems del plan' },
];

// Tab Plan de Compra: cómo cumple el departamento con el Plan Anual de Compras. Mismos
// indicadores que /pac-cumplimiento (Resumen y Cumplimiento Temporal) más el detalle de los
// ítems del plan, siempre acotados al departamento; sin rankings ni comparación con otros.
export default function TabPlanCompra({ params }) {
    const [vista, setVista] = useState('resumen');
    const [anho, setAnho] = useState(null);
    const [resumen, setResumen] = useState(null);
    const [temporal, setTemporal] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [fichaId, setFichaId] = useState(null);

    useEffect(() => { setAnho(null); }, [params]);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        const extra = anho ? { anho } : {};
        Promise.all([
            getGestorPlanResumen({ ...params, ...extra }),
            getGestorPlanTemporal({ ...params, ...extra }),
        ])
            .then(([{ data: r }, { data: t }]) => {
                if (!activo) return;
                setResumen(r);
                setTemporal(t);
            })
            .catch(() => { if (activo) { setResumen(null); setTemporal(null); } })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [params, anho]);

    const sinCobertura = resumen && resumen.pac_disponible === false;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>📅 Año</span>
                <select className="filtro-select" value={anho || ''} onChange={(e) => setAnho(e.target.value || null)}>
                    <option value="">Todos los años</option>
                    {resumen?.anios_pac?.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {VISTAS.map((v) => (
                        <button key={v.id} className={`tab-btn ${vista === v.id ? 'active' : ''}`} onClick={() => setVista(v.id)}>
                            {v.label}
                        </button>
                    ))}
                </div>
            </div>

            {sinCobertura && (
                <div className="gc-nota">
                    ℹ️ Los indicadores de cumplimiento del PAC cubren a la Dirección del Servicio de Salud Osorno. Este departamento
                    pertenece a otro establecimiento, por lo que aquí no hay formularios evaluados ni proyectos planificados.
                </div>
            )}

            {cargando ? (
                <div className="loading-spinner">Cargando el plan de compra…</div>
            ) : (
                <>
                    {vista === 'resumen' && <ResumenPlan data={resumen} />}
                    {vista === 'temporal' && <TemporalPlan data={temporal} onVerFicha={setFichaId} />}
                    {vista === 'items' && <ItemsPlan params={params} anho={anho} onVerFicha={setFichaId} />}
                </>
            )}

            <ModalFichaGestor idProyecto={fichaId} params={params} onCerrar={() => setFichaId(null)} />
        </div>
    );
}
