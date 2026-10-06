import React, { useEffect, useState } from 'react';
import { getMisFormularios } from '../api/comprasApi';
import FscProcesoPanel from './FscProcesoPanel';
import ModalDetalleFsc from './ModalDetalleFsc';
import FormulariosTable from './FormulariosTable';
import ResumenComprador from './ResumenComprador';

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

// Bandeja personalizada del comprador: todos sus FormularioFSCDerivado en
// estado 'AC' (bandeja "A Comprador" del Panel SSO), estén o no ya
// clasificados. Cada fila muestra su estado de gestión y abre el mismo panel
// lateral (FscProcesoPanel) para clasificar, enlazar Mercado Público y
// registrar avances — sin una pantalla/pestaña separada para "mis procesos".
// La tabla en sí vive en FormulariosTable.jsx (compartida con "Búsqueda
// Personalizada" del Panel Formularios de jefatura).
export default function MisFormulariosPage() {
    const [tab, setTab] = useState('panel');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState({ results: [], count: 0 });
    const [cargando, setCargando] = useState(true);
    const [fscSeleccionado, setFscSeleccionado] = useState(null);
    const [fscVerId, setFscVerId] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => { setPage(1); }, [search, tab]);

    useEffect(() => {
        if (tab === 'panel') return undefined;
        let activo = true;
        setCargando(true);
        getMisFormularios({
            search: search || undefined, page, ordering: '-fecha_derivado',
            finalizados: tab === 'finalizados' ? 1 : undefined,
        })
            .then(({ data: res }) => {
                if (!activo) return;
                setData({ results: res.results ?? res, count: res.count ?? (res.results ?? res).length });
            })
            .catch(() => { if (activo) setData({ results: [], count: 0 }); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [tab, search, page, refreshKey]);

    const totalPaginas = Math.max(1, Math.ceil(data.count / 50));

    return (
        <div className="feature-page">
            <div className="page-header">
                <div className="page-title"><span className="page-title-icon">🗂️</span> Mis Formularios</div>
                <div className="page-subtitle">
                    Formularios de Solicitud de Compra derivados a tu cuenta. Clasifícalos en un Proceso de Compra,
                    enlaza la Licitación/Compra Ágil/OC real y ve registrando el avance.
                </div>
            </div>

            <div className="tabs-bar" style={{ marginBottom: 12 }}>
                <button className={`tab-btn ${tab === 'panel' ? 'active' : ''}`} onClick={() => setTab('panel')}>
                    🖥️ Panel
                </button>
                <button className={`tab-btn ${tab === 'activos' ? 'active' : ''}`} onClick={() => setTab('activos')}>
                    📋 Formularios
                </button>
                <button className={`tab-btn ${tab === 'finalizados' ? 'active' : ''}`} onClick={() => setTab('finalizados')}>
                    ✅ Formularios Finalizados
                </button>
            </div>

            {tab === 'panel' && (
                <ResumenComprador refreshKey={refreshKey} onGestionar={setFscSeleccionado} />
            )}

            {tab !== 'panel' && (
            <div className="card">
                <div className="card-header card-header-accent">
                    <span>{tab === 'finalizados' ? '✅' : '📋'}</span>
                    <span className="card-title">
                        {fmtN(data.count)} formulario(s) {tab === 'finalizados' ? 'con proceso finalizado' : ''}
                    </span>
                </div>

                <div style={{ padding: '12px 16px' }}>
                    <input
                        type="text"
                        placeholder="Buscar por folio, requerimiento, especificaciones o unidad…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, width: '100%', maxWidth: 420 }}
                    />
                </div>

                <FormulariosTable
                    data={data.results}
                    cargando={cargando}
                    emptyMessage={tab === 'finalizados' ? 'No tienes formularios con proceso finalizado todavía.' : 'No tienes formularios en la bandeja "A Comprador".'}
                    onVer={setFscVerId}
                    onGestionar={setFscSeleccionado}
                />

                {totalPaginas > 1 && (
                    <div className="pagination-bar">
                        <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹ Anterior</button>
                        <span className="page-info">Página {page} de {totalPaginas} — {fmtN(data.count)} registro(s)</span>
                        <button className="page-btn" disabled={page >= totalPaginas} onClick={() => setPage(p => p + 1)}>Siguiente ›</button>
                    </div>
                )}
            </div>
            )}

            {fscSeleccionado && (
                <FscProcesoPanel
                    fsc={fscSeleccionado}
                    onCambiado={() => setRefreshKey(k => k + 1)}
                    onCerrar={() => setFscSeleccionado(null)}
                />
            )}

            {fscVerId && <ModalDetalleFsc fscId={fscVerId} onCerrar={() => setFscVerId(null)} />}
        </div>
    );
}
