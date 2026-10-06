import React, { useEffect, useState } from 'react';
import { getCompradores, getJefaturaResumen } from '../../api/comprasApi';
import ResumenComprador from '../ResumenComprador';
import FormulariosTable from '../FormulariosTable';
import FscProcesoPanel from '../FscProcesoPanel';
import ModalDetalleFsc from '../ModalDetalleFsc';

// Tab Búsqueda Personalizada — jefatura elige un comprador del selector y ve
// EXACTAMENTE el mismo panel (KPIs + alertas + gestión interna + pivote) que
// ese comprador ve en su propio "Mis Formularios > Panel", más la tabla
// completa de sus FSC. Un solo fetch (getJefaturaResumen) alimenta ambos —
// ResumenComprador se usa en modo "controlado" (ver su docstring) para no
// duplicar la llamada.
export default function BusquedaPersonalizada() {
    const [compradores, setCompradores] = useState([]);
    const [compradorId, setCompradorId] = useState('');
    const [data, setData] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [fscSeleccionado, setFscSeleccionado] = useState(null);
    const [fscVerId, setFscVerId] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const compradorSeleccionado = compradores.find((c) => String(c.usuario) === String(compradorId));
    const compradorNombre = compradorSeleccionado?.nombre_usuario || compradorSeleccionado?.nombre_comprador;
    // ComprasMisFormularioSerializer (lo que trae data.formularios) no incluye
    // comprador_id/comprador_display como calcular_compras_sin_gestion sí —
    // se inyecta acá con el comprador ya elegido en el selector. Sin esto,
    // FscProcesoPanel asignaría el proceso nuevo a request.user (jefatura) en
    // vez de al comprador real, mismo bug que se corrigió en TablaSinGestion.
    const enriquecerFsc = (f) => ({
        ...f, comprador_id: compradorId ? Number(compradorId) : null, comprador_display: compradorNombre,
    });
    const formularios = (data?.formularios || []).map(enriquecerFsc);
    // ResumenComprador también dispara 'Gestionar' desde su bloque interno
    // "Proceso de Gestión" (gestion_interna) — mismo hueco, mismo fix: se le
    // pasa una copia de `data` con esa lista ya enriquecida en vez de
    // enseñarle a ResumenComprador sobre compradorId directamente.
    const dataParaResumen = data ? { ...data, gestion_interna: (data.gestion_interna || []).map(enriquecerFsc) } : null;

    useEffect(() => {
        getCompradores().then(({ data: res }) => setCompradores(res)).catch(() => setCompradores([]));
    }, []);

    useEffect(() => {
        if (!compradorId) { setData(null); return undefined; }
        let activo = true;
        setCargando(true);
        getJefaturaResumen(compradorId)
            .then(({ data: res }) => { if (activo) setData(res); })
            .catch(() => { if (activo) setData(null); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [compradorId, refreshKey]);

    return (
        <div>
            <div className="card" style={{ padding: '14px 16px', marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                    Comprador
                </label>
                <select
                    value={compradorId}
                    onChange={(e) => setCompradorId(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, width: '100%', maxWidth: 360, fontSize: 13 }}
                >
                    <option value="">Selecciona un comprador…</option>
                    {compradores.map((c) => (
                        <option key={c.usuario} value={c.usuario}>{c.nombre_usuario || c.nombre_comprador}</option>
                    ))}
                </select>
            </div>

            {!compradorId ? (
                <div className="loading-spinner">Elige un comprador para ver su detalle.</div>
            ) : (
                <>
                    <ResumenComprador
                        data={dataParaResumen}
                        cargando={cargando}
                        refreshKey={refreshKey}
                        onGestionar={setFscSeleccionado}
                    />

                    <div className="card">
                        <div className="card-header card-header-accent">
                            <span>📋</span>
                            <span className="card-title">
                                {formularios.length} formulario(s) de este comprador
                            </span>
                        </div>
                        <FormulariosTable
                            data={formularios}
                            cargando={cargando}
                            emptyMessage="Este comprador no tiene formularios en la bandeja 'A Comprador'."
                            onVer={setFscVerId}
                            onGestionar={setFscSeleccionado}
                        />
                    </div>
                </>
            )}

            {fscSeleccionado && (
                <FscProcesoPanel
                    fsc={fscSeleccionado}
                    onCambiado={() => { setFscSeleccionado(null); setRefreshKey((k) => k + 1); }}
                    onCerrar={() => setFscSeleccionado(null)}
                />
            )}
            {fscVerId && <ModalDetalleFsc fscId={fscVerId} onCerrar={() => setFscVerId(null)} />}
        </div>
    );
}
