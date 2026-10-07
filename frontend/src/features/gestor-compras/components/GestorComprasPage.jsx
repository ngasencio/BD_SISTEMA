import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAlcanceGestor } from '../hooks/useAlcanceGestor';
import TabSolicitudes from './TabSolicitudes';
import TabDerivacion from './TabDerivacion';
import TabPlanCompra from './TabPlanCompra';
import TabNotificacion from './TabNotificacion';
import '../styles/gestor.css';

// Panel de solo lectura de un departamento: sus solicitudes (FSC), lo derivado a
// comprador y su Plan de Compra. Un gestor ve solo su departamento (se resuelve en el
// servidor desde su pertenencia en el Panel SSO); admin/jefatura/general ven TODOS los departamentos
// a la vez (por defecto) o eligen uno.
const TABS = [
    { id: 'solicitudes', label: '📝 Solicitudes' },
    { id: 'derivacion', label: '🛒 Derivación a Comprador' },
    { id: 'plan', label: '📅 Plan de Compra' },
];

// Solo para cuentas autorizadas en el servidor (alcance.puede_notificar): envía correos masivos a funcionarios.
const TAB_NOTIFICACION = { id: 'notificacion', label: '📧 Notificación' };

function EstadoVacio({ icono, titulo, texto }) {
    return (
        <div className="card">
            <div className="gc-empty">
                <div className="gc-empty-icon">{icono}</div>
                <div className="gc-empty-title">{titulo}</div>
                <div className="gc-empty-sub">{texto}</div>
            </div>
        </div>
    );
}

function SelectorDepartamento({ disponibles, valor, onChange }) {
    // Agrupa por subdirección; los sub-departamentos van sangrados bajo su raíz.
    const grupos = useMemo(() => {
        const porSub = new Map();
        disponibles.forEach((d) => {
            if (!porSub.has(d.subdireccion)) porSub.set(d.subdireccion, []);
            porSub.get(d.subdireccion).push(d);
        });
        return [...porSub.entries()];
    }, [disponibles]);

    return (
        <div className="gc-selector">
            <label htmlFor="gc-depto">Departamento</label>
            <select id="gc-depto" value={valor} onChange={(e) => onChange(e.target.value)}>
                <option value="">🌐 Todos los departamentos</option>
                {grupos.map(([subdireccion, deptos]) => (
                    <optgroup key={subdireccion} label={subdireccion}>
                        {deptos.map((d) => (
                            <option key={d.id} value={d.id}>{d.es_raiz ? d.nombre : `↳ ${d.nombre}`}</option>
                        ))}
                    </optgroup>
                ))}
            </select>
        </div>
    );
}

function BannerDepartamento({ alcance, deptoId, setDeptoId }) {
    const esSupervision = alcance.modo === 'supervision';
    const deptos = alcance.departamentos || [];
    const nombres = deptos.map((d) => d.nombre).join(' · ');
    const subs = deptos.reduce((n, d) => n + (d.sub_departamentos?.length || 0), 0);
    const subdirecciones = [...new Set(deptos.map((d) => d.subdireccion))].join(' · ');

    return (
        <div className="card gc-banner">
            <div className="gc-banner-icon">🏢</div>
            <div className="gc-banner-body">
                <div className="gc-banner-title">{nombres || 'Sin departamento seleccionado'}</div>
                <div className="gc-banner-meta">
                    {subdirecciones}
                    {subs > 0 && ` · incluye ${subs} sub-departamento${subs !== 1 ? 's' : ''}`}
                </div>
            </div>
            {esSupervision && (
                <SelectorDepartamento
                    disponibles={alcance.departamentos_disponibles || []}
                    valor={deptoId}
                    onChange={setDeptoId}
                />
            )}
            <span className={`gc-badge ${esSupervision ? 'gc-badge-supervision' : ''}`}>
                {esSupervision ? '🔎 Vista de supervisión' : '👁 Solo lectura'}
            </span>
        </div>
    );
}

export default function GestorComprasPage() {
    const { alcance, cargando, error, deptoId, setDeptoId, params } = useAlcanceGestor();
    const [searchParams, setSearchParams] = useSearchParams();
    const tabs = alcance?.puede_notificar ? [...TABS, TAB_NOTIFICACION] : TABS;
    // Un ?tab=notificacion de quien no está autorizado cae en la pestaña por defecto (y el servidor igual respondería 403).
    const tab = tabs.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'solicitudes';

    const cambiarTab = (id) => setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', id);
        return next;
    }, { replace: true });

    const sinAlcance = alcance && (alcance.departamentos || []).length === 0;
    const esSupervision = alcance?.modo === 'supervision';

    return (
        <div className="feature-page">
            <div className="page-header">
                <div className="page-title"><span className="page-title-icon">🏢</span> Gestor de Compras</div>
                <div className="page-subtitle">
                    Seguimiento de las solicitudes, compras y Plan de Compra de su departamento.
                </div>
            </div>

            {cargando && <div className="loading-spinner">Cargando su departamento…</div>}
            {!cargando && error && <div className="error-message">{error}</div>}

            {!cargando && alcance && (
                <>
                    {/* El selector solo existe para supervisión; un gestor sin alcance no tiene nada que elegir. */}
                    {(esSupervision || !sinAlcance) && (
                        <BannerDepartamento alcance={alcance} deptoId={deptoId} setDeptoId={setDeptoId} />
                    )}

                    {sinAlcance ? (
                        esSupervision ? (
                            <EstadoVacio
                                icono="🔎"
                                titulo="Departamento no encontrado"
                                texto={`${alcance.motivo || 'El departamento solicitado no existe.'} Elija uno de la lista o vuelva a "Todos los departamentos".`}
                            />
                        ) : (
                            <EstadoVacio
                                icono="🚫"
                                titulo="No tiene un departamento asignado"
                                texto={`${alcance.motivo || 'No hay un departamento asociado a su cuenta.'} Pida a un administrador que revise su pertenencia en el Panel SSO.`}
                            />
                        )
                    ) : (
                        <>
                            <div className="tabs-bar" style={{ marginBottom: 12 }}>
                                {tabs.map((t) => (
                                    <button
                                        key={t.id}
                                        className={`tab-btn ${tab === t.id ? 'active' : ''}`}
                                        onClick={() => cambiarTab(t.id)}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            {tab === 'solicitudes' && <TabSolicitudes params={params} />}
                            {tab === 'derivacion' && <TabDerivacion params={params} />}
                            {tab === 'plan' && <TabPlanCompra params={params} />}
                            {tab === 'notificacion' && <TabNotificacion params={params} />}
                        </>
                    )}
                </>
            )}
        </div>
    );
}
