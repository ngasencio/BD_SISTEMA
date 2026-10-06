import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
    getTemporalidadComparativo, getTemporalidadJerarquia, getTemporalidadUsuarios,
    getFormulariosDerivados, getFormularioDerivadoById,
} from '../../api/formulariosApi';

// ─── Helpers ────────────────────────────────────────────────────────────────
// Duplicados localmente (no hay un módulo de formato compartido entre features
// en este proyecto — ver convención ya usada por InfoTooltip en FormulariosPage.jsx).

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
const fmtCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtCompacto = (n) => new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 }).format(n ?? 0);

const MUESTRA_MINIMA_PAC = 3; // debe coincidir con MUESTRA_MINIMA_PAC de backend/api/services.py

// Réplica en JS de `_nota_desempeno_pac` (services.py) — se usa para agregar la nota
// sobre un subconjunto de años ya traído (ver nota "Todos los años"), sin pedirle al
// backend una combinación nueva por cada selección (mismo patrón que "Comparativo
// Anual" de Órdenes de Compra: agregar en el frontend sobre datos ya cargados).
function notaDesempeno(total, dentroCant, montoDentro, montoTotal) {
    if (total < MUESTRA_MINIMA_PAC) return null;
    const pctCantidad = (dentroCant / total) * 100;
    const pctMonto = montoTotal ? (montoDentro / montoTotal) * 100 : pctCantidad;
    const score = 0.5 * pctCantidad + 0.5 * pctMonto;
    return Math.round((1 + (score / 100) * 6) * 10) / 10;
}

// Resuelve qué `depto_id` caen bajo un nodo clickeado de la jerarquía — mismo
// criterio de rollup que usa `/pac-cumplimiento` (JerarquiaTab) para su propio
// filtro cruzado tabla↔jerarquía: una Subdirección o un Departamento raíz deben
// incluir también los `depto_id` de sus sub-departamentos, o se pierden sus FSC
// (calcular_pac_temporalidad_jerarquia ya los suma juntos para las métricas, pero
// en la tabla real cada sub-departamento tiene su propio sso_departamento_id).
function idsDeSubdireccion(sub) {
    if (sub.subdireccion_id == null) return { ids: [], sinClasificar: true };
    const ids = [];
    sub.departamentos.forEach(d => {
        if (d.depto_id != null) ids.push(d.depto_id);
        d.subdepartamentos.forEach(sd => ids.push(sd.depto_id));
    });
    return { ids, sinClasificar: false };
}
function idsDeDepartamento(d) {
    if (d.depto_id == null) return { ids: [], sinClasificar: true };
    return { ids: [d.depto_id, ...d.subdepartamentos.map(sd => sd.depto_id)], sinClasificar: false };
}
function idsDeSubdepartamento(sd) {
    return { ids: [sd.depto_id], sinClasificar: false };
}

function colorNota(nota) {
    if (nota === null || nota === undefined) return '#94a3b8';
    if (nota < 4.0) return '#dc2626';
    if (nota < 5.5) return '#d97706';
    return '#16a34a';
}

function NotaBadge({ nota, size = 'normal' }) {
    const color = colorNota(nota);
    const grande = size === 'grande';
    if (nota === null || nota === undefined) {
        return (
            <span style={{
                display: 'inline-block', padding: grande ? '6px 14px' : '2px 9px',
                borderRadius: 20, fontSize: grande ? 15 : 11, fontWeight: 700,
                background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0',
            }} title={`Muestra insuficiente (< ${MUESTRA_MINIMA_PAC} formularios)`}>
                s/n
            </span>
        );
    }
    return (
        <span style={{
            display: 'inline-block', padding: grande ? '6px 16px' : '2px 10px',
            borderRadius: 20, fontSize: grande ? 20 : 12, fontWeight: 800,
            background: color + '20', color, border: `1px solid ${color}50`,
        }}>
            {nota.toFixed(1)}
        </span>
    );
}

// ─── Gráfico comparativo anual (cantidad vs monto, lado a lado) ───────────────

function ComparativoAnualChart({ serieAnual, aniosSel }) {
    const filas = useMemo(
        () => serieAnual.filter(s => aniosSel.includes(s.anho)).sort((a, b) => a.anho - b.anho),
        [serieAnual, aniosSel],
    );

    const opcionesBase = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: { y: { beginAtZero: true, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 11 } } } },
    };

    const datosCantidad = {
        labels: filas.map(f => f.anho),
        datasets: [
            { label: 'Dentro PAC', data: filas.map(f => f.dentro_cantidad), backgroundColor: '#16a34a', borderRadius: 4 },
            { label: 'Fuera PAC', data: filas.map(f => f.fuera_cantidad), backgroundColor: '#dc2626', borderRadius: 4 },
        ],
    };
    const datosMonto = {
        labels: filas.map(f => f.anho),
        datasets: [
            { label: 'Dentro PAC', data: filas.map(f => f.dentro_monto), backgroundColor: '#15803d', borderRadius: 4 },
            { label: 'Fuera PAC', data: filas.map(f => f.fuera_monto), backgroundColor: '#b91c1c', borderRadius: 4 },
        ],
    };

    if (!filas.length) {
        return <div className="card" style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Selecciona al menos un año para graficar.</div>;
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>📊 Por cantidad de formularios</div>
                <div style={{ height: 260 }}>
                    <Bar data={datosCantidad} options={{
                        ...opcionesBase,
                        plugins: {
                            ...opcionesBase.plugins,
                            tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtN(ctx.raw)}` } },
                        },
                    }} />
                </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>💰 Por monto estimado</div>
                <div style={{ height: 260 }}>
                    <Bar data={datosMonto} options={{
                        ...opcionesBase,
                        plugins: {
                            ...opcionesBase.plugins,
                            tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtCLP(ctx.raw)}` } },
                        },
                        scales: {
                            ...opcionesBase.scales,
                            y: { ...opcionesBase.scales.y, ticks: { ...opcionesBase.scales.y.ticks, callback: (v) => fmtCompacto(v) } },
                        },
                    }} />
                </div>
            </div>
        </div>
    );
}

// ─── Indicador simple Dentro/Fuera (donut) ────────────────────────────────────

function IndicadorSimplePac({ resumen }) {
    const data = {
        labels: ['Dentro PAC', 'Fuera PAC'],
        datasets: [{
            data: [resumen.dentroCant, resumen.fueraCant],
            backgroundColor: ['#16a34a', '#dc2626'],
            borderWidth: 0,
        }],
    };
    return (
        <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 120, height: 120, flexShrink: 0 }}>
                <Doughnut data={data} options={{
                    responsive: true, maintainAspectRatio: false, cutout: '68%',
                    plugins: { legend: { display: false } },
                }} />
            </div>
            <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Indicador Dentro / Fuera PAC</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{resumen.pctDentroCant.toFixed(1)}%</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                    {fmtN(resumen.dentroCant)} Dentro / {fmtN(resumen.fueraCant)} Fuera ({fmtN(resumen.totalCant)} total)
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Por monto: <strong>{resumen.pctDentroMonto.toFixed(1)}%</strong> ({fmtCLP(resumen.dentroMonto)} de {fmtCLP(resumen.totalMonto)})
                </div>
            </div>
        </div>
    );
}

// ─── Jerarquía (Subdirección → Departamento → Sub-departamento) ───────────────

function FilaMetrica({ nombre, nivel, m, onAnalizar, activo }) {
    const indent = nivel * 20;
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
            paddingLeft: 10 + indent, borderBottom: '1px solid #f1f5f9',
            background: activo ? '#eff6ff' : (nivel === 0 ? '#f8fafc' : '#fff'),
        }}>
            <span style={{ flex: 1, fontSize: nivel === 0 ? 13 : 12, fontWeight: nivel === 0 ? 700 : 500, color: '#334155' }}>
                {nivel > 0 && '↳ '}{nombre}
            </span>
            <span style={{ fontSize: 11, color: '#64748b', width: 70, textAlign: 'right' }}>{fmtN(m.total)} FSC</span>
            <span style={{ fontSize: 11, color: '#16a34a', width: 110, textAlign: 'right' }}>
                {fmtN(m.dentro)} Dentro ({m.pct_dentro}%)
            </span>
            <span style={{ fontSize: 11, color: '#64748b', width: 150, textAlign: 'right' }}>{fmtCLP(m.monto_dentro)}</span>
            <NotaBadge nota={m.nota} />
            {onAnalizar && (
                <button
                    onClick={(e) => { e.stopPropagation(); onAnalizar(); }}
                    title="Filtrar usuarios y formularios por esta unidad"
                    style={{
                        padding: '3px 9px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        whiteSpace: 'nowrap', border: `1px solid ${activo ? '#2563eb' : '#c7d2fe'}`,
                        background: activo ? '#2563eb' : '#eef2ff',
                        color: activo ? '#fff' : '#4338ca',
                    }}
                >
                    {activo ? '🔍 Analizando' : '🔍 Analizar'}
                </button>
            )}
        </div>
    );
}

function JerarquiaTemporalidad({ jerarquia, onSeleccionar, claveSeleccionada }) {
    const [expandidas, setExpandidas] = useState(new Set());
    const toggle = (clave) => setExpandidas(prev => {
        const next = new Set(prev);
        next.has(clave) ? next.delete(clave) : next.add(clave);
        return next;
    });

    if (!jerarquia?.subdirecciones?.length) {
        return <div className="card" style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Sin datos para el período seleccionado.</div>;
    }

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', padding: '8px 10px', background: '#eef2f7', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                <span style={{ flex: 1 }}>Unidad</span>
                <span style={{ width: 70, textAlign: 'right' }}>Total</span>
                <span style={{ width: 110, textAlign: 'right' }}>Dentro PAC</span>
                <span style={{ width: 150, textAlign: 'right' }}>Monto Dentro</span>
                <span style={{ width: 55, textAlign: 'right' }}>Nota</span>
                <span style={{ width: 96 }} />
            </div>
            {jerarquia.subdirecciones.map(sub => {
                const claveSub = `sub-${sub.subdireccion_id ?? 'sinclasificar'}`;
                const abierta = expandidas.has(claveSub);
                return (
                    <div key={claveSub}>
                        <div onClick={() => toggle(claveSub)} style={{ cursor: 'pointer' }}>
                            <FilaMetrica
                                nombre={`${abierta ? '▾' : '▸'} ${sub.nombre} (${sub.departamentos.length} deptos)`}
                                nivel={0} m={sub}
                                activo={claveSeleccionada === claveSub}
                                onAnalizar={() => onSeleccionar({ clave: claveSub, label: sub.nombre, ...idsDeSubdireccion(sub) })}
                            />
                        </div>
                        {abierta && sub.departamentos.map(d => {
                            const claveDepto = `${claveSub}-depto-${d.depto_id ?? 'sinclasificar'}`;
                            const abiertaDepto = expandidas.has(claveDepto);
                            return (
                                <div key={claveDepto}>
                                    <div onClick={() => toggle(claveDepto)} style={{ cursor: d.subdepartamentos.length ? 'pointer' : 'default' }}>
                                        <FilaMetrica
                                            nombre={`${d.subdepartamentos.length ? (abiertaDepto ? '▾' : '▸') + ' ' : ''}${d.nombre}`}
                                            nivel={1} m={d}
                                            activo={claveSeleccionada === claveDepto}
                                            onAnalizar={() => onSeleccionar({ clave: claveDepto, label: d.nombre, ...idsDeDepartamento(d) })}
                                        />
                                    </div>
                                    {abiertaDepto && d.subdepartamentos.map(sd => {
                                        const claveSubdepto = `${claveDepto}-sd-${sd.depto_id}`;
                                        return (
                                            <FilaMetrica
                                                key={sd.depto_id} nombre={sd.nombre} nivel={2} m={sd}
                                                activo={claveSeleccionada === claveSubdepto}
                                                onAnalizar={() => onSeleccionar({ clave: claveSubdepto, label: sd.nombre, ...idsDeSubdepartamento(sd) })}
                                            />
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Ranking de usuarios requirentes ───────────────────────────────────────────

function RankingUsuarios({ usuarios }) {
    const [mostrarTodos, setMostrarTodos] = useState(false);
    if (!usuarios?.usuarios?.length) {
        return <div className="card" style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Sin usuarios requirentes para el período seleccionado.</div>;
    }
    const filas = mostrarTodos ? usuarios.usuarios : usuarios.usuarios.slice(0, 15);

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', padding: '8px 10px', background: '#eef2f7', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                <span style={{ flex: 1 }}>Usuario Requirente</span>
                <span style={{ width: 60, textAlign: 'right' }}>Total</span>
                <span style={{ width: 100, textAlign: 'right' }}>% Dentro (cant.)</span>
                <span style={{ width: 100, textAlign: 'right' }}>% Dentro (monto)</span>
                <span style={{ width: 55, textAlign: 'right' }}>Nota</span>
            </div>
            {filas.map(u => (
                <div key={u.usuario_requirente} style={{
                    display: 'flex', alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid #f1f5f9',
                    opacity: u.muestra_insuficiente ? 0.55 : 1,
                }}>
                    <span style={{ flex: 1, fontSize: 12, color: '#334155' }}>
                        {u.usuario_requirente}
                        {u.muestra_insuficiente && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>(muestra baja)</span>}
                    </span>
                    <span style={{ width: 60, textAlign: 'right', fontSize: 11, color: '#64748b' }}>{fmtN(u.total)}</span>
                    <span style={{ width: 100, textAlign: 'right', fontSize: 11, color: '#16a34a' }}>{u.pct_dentro_cantidad}%</span>
                    <span style={{ width: 100, textAlign: 'right', fontSize: 11, color: '#15803d' }}>{u.pct_dentro_monto}%</span>
                    <span style={{ width: 55, textAlign: 'right' }}><NotaBadge nota={u.nota} /></span>
                </div>
            ))}
            {usuarios.usuarios.length > 15 && (
                <div style={{ textAlign: 'center', padding: 10 }}>
                    <button onClick={() => setMostrarTodos(m => !m)} style={{
                        background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
                        {mostrarTodos ? '▲ Ver menos' : `▼ Ver los ${usuarios.usuarios.length} usuarios`}
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Visor liviano de un formulario (drill-down) ──────────────────────────────
// Deliberadamente NO reutiliza `DrawerFormularioDetalle` de FormulariosPage.jsx:
// ese componente es grande (imprime ficha, carga carro de productos, depende de
// media docena de helpers de módulo) y vive en un archivo ya enorme — mismo
// cálculo de riesgo/beneficio que documentó el módulo PAC Cumplimiento al NO
// reutilizar `ModalDocumento` para su propio visor ("el riesgo de tocar ese
// archivo estable era mayor que el beneficio"). Además apunta a una tabla
// distinta: esta tabla sale de FormularioFSCDerivado, no de FormularioFSC — los
// `id` NO son intercambiables entre ambas (ver `getFormularioDerivadoById`).

function CampoDetalle({ label, value, span2 }) {
    return (
        <div style={{ gridColumn: span2 ? 'span 2' : undefined }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, color: '#1e293b' }}>{value || '—'}</div>
        </div>
    );
}

function VisorFormularioDrillDown({ id, onCerrar }) {
    const [formulario, setFormulario] = useState(null);
    const [cargando, setCargando] = useState(false);

    useEffect(() => {
        if (!id) { setFormulario(null); return; }
        let activo = true;
        setCargando(true);
        getFormularioDerivadoById(id)
            .then(({ data }) => { if (activo) setFormulario(data); })
            .catch(() => { if (activo) setFormulario(null); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [id]);

    if (!id) return null;

    return (
        <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 560, maxWidth: '92vw', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>
                        {formulario?.id_formulario || (formulario ? `Folio ${formulario.folio}` : 'Formulario')}
                    </span>
                    <button onClick={onCerrar} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', fontSize: 14, color: '#64748b' }}>✕</button>
                </div>
                <div style={{ padding: 20 }}>
                    {cargando && <div style={{ color: '#94a3b8', fontSize: 13 }}>Cargando…</div>}
                    {!cargando && formulario && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
                            <CampoDetalle label="Año" value={formulario.anho} />
                            <CampoDetalle label="Fecha Derivado" value={formulario.fecha_derivado} />
                            <CampoDetalle label="Unidad Requirente" value={formulario.unidad_requirente} />
                            <CampoDetalle label="Usuario Requirente" value={formulario.usuario_requirente} />
                            <CampoDetalle label="Comprador" value={formulario.comprador} />
                            <CampoDetalle label="Estado Compra" value={formulario.estado_compra} />
                            <CampoDetalle label="Monto Estimado" value={fmtCLP(formulario.monto_estimado)} />
                            <CampoDetalle
                                label="Dentro/Fuera PAC"
                                value={formulario.dentro_fuera_pac === 'DENTRO' ? '✅ Dentro PAC' : '❌ Fuera PAC'}
                            />
                            <CampoDetalle label="ID Plan" value={formulario.id_plan || 'Sin ID de Plan'} />
                            <CampoDetalle label="Ítem Presupuestario" value={formulario.item_presupuestario} />
                            {formulario.requerimiento && <CampoDetalle label="Nombre de la Compra" value={formulario.requerimiento} span2 />}
                        </div>
                    )}
                    {!cargando && !formulario && <div style={{ color: '#dc2626', fontSize: 13 }}>No se pudo cargar el formulario.</div>}
                </div>
            </div>
        </div>
    );
}

// ─── Tabla de formularios filtrados por la unidad seleccionada en la jerarquía ─

const PAGE_SIZE_DRF = 50; // debe coincidir con REST_FRAMEWORK.PAGE_SIZE (backend/core/settings.py)
const btnPagStyle = {
    padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff',
    fontSize: 11, fontWeight: 600, color: '#334155', cursor: 'pointer',
};

function TablaFormulariosDrillDown({ filtroOrg, anhoScope }) {
    const [data, setData] = useState({ count: 0, results: [] });
    const [page, setPage] = useState(1);
    const [cargando, setCargando] = useState(false);
    const [verId, setVerId] = useState(null);

    // Resetear a página 1 y buscar quedan en un solo efecto (en vez de 2 efectos
    // separados) para evitar una carrera: con dos efectos, cambiar filtroOrg con
    // page > 1 dispara primero la búsqueda con la página VIEJA (los efectos de un
    // mismo render corren con el estado previo a que setPage(1) surta efecto) y
    // recién en el siguiente render se corrige a página 1 — un fetch de más y un
    // parpadeo de "sin formularios" si la página vieja no existe para el nuevo filtro.
    const filtroKeyRef = useRef(null);

    useEffect(() => {
        const key = JSON.stringify([filtroOrg, anhoScope]);
        if (filtroKeyRef.current !== key) {
            filtroKeyRef.current = key;
            if (page !== 1) { setPage(1); return; } // este efecto se re-ejecuta cuando page cambie a 1
        }
        if (!filtroOrg) { setData({ count: 0, results: [] }); return; }
        let activo = true;
        setCargando(true);
        const params = {
            estado: 'AC', establecimiento: 1, ordering: '-fecha_derivado', page,
            ...(anhoScope ? { anho_fecha_derivado: anhoScope } : {}),
            ...(filtroOrg.ids?.length ? { sso_departamento_in: filtroOrg.ids.join(',') } : {}),
            ...(filtroOrg.sinClasificar ? { sin_clasificar: 1 } : {}),
        };
        getFormulariosDerivados(params)
            .then(({ data: res }) => { if (activo) setData(res); })
            .catch(() => { if (activo) setData({ count: 0, results: [] }); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [filtroOrg, anhoScope, page]);

    if (!filtroOrg) {
        return (
            <div className="card" style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                Selecciona una subdirección, departamento o sub-departamento en la jerarquía (botón "🔍 Analizar") para ver y revisar sus formularios.
            </div>
        );
    }

    const totalPaginas = Math.max(1, Math.ceil(data.count / PAGE_SIZE_DRF));

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', padding: '8px 10px', background: '#eef2f7', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                <span style={{ width: 90 }}>Formulario</span>
                <span style={{ flex: 1 }}>Unidad Requirente</span>
                <span style={{ flex: 1 }}>Usuario Requirente</span>
                <span style={{ width: 80, textAlign: 'center' }}>PAC</span>
                <span style={{ width: 130, textAlign: 'right' }}>Monto</span>
                <span style={{ width: 60, textAlign: 'center' }}>Ver</span>
            </div>
            {cargando ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Cargando formularios…</div>
            ) : data.results.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Sin formularios para esta selección.</div>
            ) : data.results.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ width: 90, fontFamily: 'monospace', fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>
                        {f.id_formulario || `#${f.folio}`}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.unidad_requirente}>
                        {f.unidad_requirente || '—'}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.usuario_requirente}>
                        {f.usuario_requirente || '—'}
                    </span>
                    <span style={{ width: 80, textAlign: 'center' }}>
                        <span style={{
                            padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                            background: f.dentro_fuera_pac === 'DENTRO' ? '#f0fdf4' : '#fef2f2',
                            color: f.dentro_fuera_pac === 'DENTRO' ? '#16a34a' : '#dc2626',
                        }}>
                            {f.dentro_fuera_pac === 'DENTRO' ? 'Dentro' : 'Fuera'}
                        </span>
                    </span>
                    <span style={{ width: 130, textAlign: 'right', fontSize: 12, color: '#374151' }}>{fmtCLP(f.monto_estimado)}</span>
                    <span style={{ width: 60, textAlign: 'center' }}>
                        <button onClick={() => setVerId(f.id)} style={{ padding: '3px 10px', border: '1px solid #c4b5fd', borderRadius: 6, background: '#f5f3ff', color: '#7c3aed', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                            👁️ Ver
                        </button>
                    </span>
                </div>
            ))}
            {data.count > PAGE_SIZE_DRF && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 10 }}>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ ...btnPagStyle, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>‹ Anterior</button>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Página {page} de {totalPaginas} — {fmtN(data.count)} formulario(s)</span>
                    <button onClick={() => setPage(p => Math.min(totalPaginas, p + 1))} disabled={page >= totalPaginas} style={{ ...btnPagStyle, opacity: page >= totalPaginas ? 0.4 : 1, cursor: page >= totalPaginas ? 'not-allowed' : 'pointer' }}>Siguiente ›</button>
                </div>
            )}
            <VisorFormularioDrillDown id={verId} onCerrar={() => setVerId(null)} />
        </div>
    );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function TabTemporalidad() {
    const [comparativo, setComparativo] = useState(null);
    const [aniosSel, setAniosSel] = useState([]);
    const [anhoScope, setAnhoScope] = useState(''); // '' = todos los años
    const [jerarquia, setJerarquia] = useState(null);
    const [usuarios, setUsuarios] = useState(null);
    const [filtroOrg, setFiltroOrg] = useState(null); // { clave, label, ids, sinClasificar } | null
    const [cargandoJerarquia, setCargandoJerarquia] = useState(true);
    const [cargandoUsuarios, setCargandoUsuarios] = useState(true);
    const [error, setError] = useState(null);

    // Serie completa — una sola vez, el frontend decide qué años mostrar.
    useEffect(() => {
        let activo = true;
        getTemporalidadComparativo()
            .then(({ data }) => {
                if (!activo) return;
                setComparativo(data);
                setAniosSel(data.anhos_disponibles);
            })
            .catch(() => { if (activo) setError('No se pudo cargar el comparativo anual.'); });
        return () => { activo = false; };
    }, []);

    // Jerarquía depende solo del año — seleccionar un nodo no debe reconstruir el árbol.
    useEffect(() => {
        let activo = true;
        setCargandoJerarquia(true);
        const anhoParam = anhoScope ? Number(anhoScope) : undefined;
        getTemporalidadJerarquia(anhoParam)
            .then(({ data }) => { if (activo) setJerarquia(data); })
            .catch(() => { if (activo) setError('No se pudo cargar la jerarquía.'); })
            .finally(() => { if (activo) setCargandoJerarquia(false); });
        return () => { activo = false; };
    }, [anhoScope]);

    // Ranking de usuarios depende del año Y de la unidad seleccionada en la jerarquía
    // (drill-down: clic en "🔍 Analizar" en Subdirección/Departamento/Sub-departamento).
    useEffect(() => {
        let activo = true;
        setCargandoUsuarios(true);
        const anhoParam = anhoScope ? Number(anhoScope) : undefined;
        getTemporalidadUsuarios(anhoParam, 100, filtroOrg)
            .then(({ data }) => { if (activo) setUsuarios(data); })
            .catch(() => { if (activo) setError('No se pudo cargar el ranking de usuarios.'); })
            .finally(() => { if (activo) setCargandoUsuarios(false); });
        return () => { activo = false; };
    }, [anhoScope, filtroOrg]);

    // Clic en el mismo nodo ya seleccionado lo deselecciona (toggle).
    const handleSeleccionarOrg = (nuevo) => setFiltroOrg(prev => (prev?.clave === nuevo.clave ? null : nuevo));

    const resumenScope = useMemo(() => {
        if (!comparativo) return null;
        const filas = anhoScope
            ? comparativo.serie_anual.filter(s => s.anho === Number(anhoScope))
            : comparativo.serie_anual;
        const agg = filas.reduce((acc, s) => ({
            dentroCant: acc.dentroCant + s.dentro_cantidad, fueraCant: acc.fueraCant + s.fuera_cantidad,
            dentroMonto: acc.dentroMonto + s.dentro_monto, fueraMonto: acc.fueraMonto + s.fuera_monto,
        }), { dentroCant: 0, fueraCant: 0, dentroMonto: 0, fueraMonto: 0 });
        const totalCant = agg.dentroCant + agg.fueraCant;
        const totalMonto = agg.dentroMonto + agg.fueraMonto;
        return {
            ...agg, totalCant, totalMonto,
            pctDentroCant: totalCant ? (agg.dentroCant / totalCant) * 100 : 0,
            pctDentroMonto: totalMonto ? (agg.dentroMonto / totalMonto) * 100 : 0,
            nota: notaDesempeno(totalCant, agg.dentroCant, agg.dentroMonto, totalMonto),
        };
    }, [comparativo, anhoScope]);

    const toggleAnio = (anho) => setAniosSel(prev => (
        prev.includes(anho) ? prev.filter(a => a !== anho) : [...prev, anho].sort()
    ));

    if (error) return <div className="error-message">{error}</div>;
    if (!comparativo) return <div className="loading-spinner">Cargando temporalidad…</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                        Cumplimiento del Plan Anual de Compras sobre formularios <strong>Derivados a Comprador (estado AC)</strong>
                        {' '}— mismo alcance institucional que <em>Cumplimiento Interno PAC</em> (Dirección SS Osorno).
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>📅 Año de análisis (jerarquía, ranking y nota):</span>
                        <select className="filtro-select" value={anhoScope} onChange={e => setAnhoScope(e.target.value)}>
                            <option value="">Todos los años</option>
                            {comparativo.anhos_disponibles.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                </div>
                {/* Indicador de cumplimiento — esquina superior derecha */}
                <div className="card" style={{ padding: '14px 22px', textAlign: 'center', minWidth: 160 }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Nota de Cumplimiento</div>
                    {resumenScope && <NotaBadge nota={resumenScope.nota} size="grande" />}
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>Escala 1.0 – 7.0</div>
                </div>
            </div>

            {resumenScope && <IndicadorSimplePac resumen={resumenScope} />}

            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Comparativo Anual</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>— años a graficar:</span>
                    {comparativo.anhos_disponibles.map(a => (
                        <button key={a} onClick={() => toggleAnio(a)} style={{
                            padding: '3px 11px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            border: `1px solid ${aniosSel.includes(a) ? '#2563eb' : '#e2e8f0'}`,
                            background: aniosSel.includes(a) ? '#2563eb20' : '#fff',
                            color: aniosSel.includes(a) ? '#2563eb' : '#94a3b8',
                        }}>
                            {a}
                        </button>
                    ))}
                </div>
                <ComparativoAnualChart serieAnual={comparativo.serie_anual} aniosSel={aniosSel} />
            </div>

            <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>
                    Jerarquía Institucional — Subdirección → Departamento
                    {cargandoJerarquia && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginLeft: 8 }}>(actualizando…)</span>}
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginLeft: 8 }}>
                        — usa "🔍 Analizar" en una fila para filtrar los usuarios y formularios de abajo
                    </span>
                </div>
                {jerarquia && (
                    <JerarquiaTemporalidad
                        jerarquia={jerarquia}
                        onSeleccionar={handleSeleccionarOrg}
                        claveSeleccionada={filtroOrg?.clave}
                    />
                )}
            </div>

            {filtroOrg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, background: '#eff6ff', color: '#2563eb', fontWeight: 700, border: '1px solid #bfdbfe' }}>
                        🔎 Filtrando por: {filtroOrg.label}
                    </span>
                    <button onClick={() => setFiltroOrg(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                        ✕ Quitar filtro
                    </button>
                </div>
            )}

            <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>
                    Desempeño por Usuario Requirente
                    {cargandoUsuarios && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginLeft: 8 }}>(actualizando…)</span>}
                    {!cargandoUsuarios && usuarios?.nota_promedio != null && (
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400, marginLeft: 8 }}>
                            (nota promedio {usuarios.nota_promedio.toFixed(1)} sobre {usuarios.total_elegibles} usuarios evaluados de {usuarios.total_usuarios})
                        </span>
                    )}
                </div>
                {usuarios && <RankingUsuarios usuarios={usuarios} />}
            </div>

            <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>
                    Formularios {filtroOrg ? `de ${filtroOrg.label}` : ''}
                </div>
                <TablaFormulariosDrillDown filtroOrg={filtroOrg} anhoScope={anhoScope} />
            </div>
        </div>
    );
}
