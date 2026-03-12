/**
 * @file features/abastecimiento/components/BoletasPage.jsx
 * @description Página principal del módulo Registro de Boletas de Garantía.
 *
 * Pestañas:
 *  1. Nuevo Registro — formulario de alta/edición
 *  2. Registros      — tabla CRUD con filtros y paginación
 *  3. Auditoría      — historial de boletas eliminadas
 */
import React, { useState } from 'react';
import { AuditoriaTable } from './AuditoriaTable';
import { BoletaForm } from './BoletaForm';
import { BoletaTable } from './BoletaTable';
import { useAuditoria, useBoletas, useBoletasMutations, useCatalogos } from '../hooks/useBoletas';

const TABS = [
    { id: 'form', label: '➕ Nuevo Registro' },
    { id: 'table', label: '📋 Registros' },
    { id: 'audit', label: '📜 Auditoría' },
];

export function BoletasPage() {
    const [activeTab, setActiveTab] = useState('table');
    const [editTarget, setEditTarget] = useState(null); // boleta a editar
    const [viewTarget, setViewTarget] = useState(null); // boleta a ver en detalle

    // ── Data ─────────────────────────────────────────────────────────────────
    const { proveedores, compradores, loading: loadingCats } = useCatalogos();
    const {
        boletas, loading, error,
        page, setPage, totalCount, PAGE_SIZE,
        filters, applyFilters, refresh,
    } = useBoletas();
    const { registros, loading: loadingAudit, error: errorAudit, refresh: refreshAudit } = useAuditoria();

    const handleMutationSuccess = () => {
        refresh();
        refreshAudit();
        setActiveTab('table');
        setEditTarget(null);
    };

    const { save, remove, saving, saveError } = useBoletasMutations(handleMutationSuccess);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleEdit = (boleta) => {
        setEditTarget(boleta);
        setActiveTab('form');
    };

    const handleView = (boleta) => {
        setViewTarget(boleta);
    };

    const handleDelete = async (id, razon) => {
        await remove(id, razon);
    };

    const handleFormSubmit = (formData) => {
        save(formData, editTarget?.id ?? null);
    };

    const handleFormCancel = () => {
        setEditTarget(null);
        setActiveTab('table');
    };

    const handleNewClick = () => {
        setEditTarget(null);
        setActiveTab('form');
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="feature-page">
            {/* Encabezado */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">📄 Registro de Boletas de Garantía</h1>
                    <p className="page-subtitle">
                        Gestión de boletas, certificados de fianza y pólizas de seguro.
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="boleta-tabs">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        className={`boleta-tab${activeTab === tab.id ? ' boleta-tab--active' : ''}`}
                        onClick={() => {
                            setActiveTab(tab.id);
                            if (tab.id !== 'form') setEditTarget(null);
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="card">
                {/* ── Pestaña: Formulario ─────────────────────────────── */}
                {activeTab === 'form' && (
                    <>
                        <h2 className="boleta-section-title">
                            {editTarget ? `Editar Boleta N° ${editTarget.numero_documento}` : 'Nueva Boleta de Garantía'}
                        </h2>
                        {loadingCats ? (
                            <div className="loading-spinner">Cargando catálogos...</div>
                        ) : (
                            <BoletaForm
                                proveedores={proveedores}
                                compradores={compradores}
                                initial={editTarget}
                                onSubmit={handleFormSubmit}
                                onCancel={handleFormCancel}
                                saving={saving}
                                error={saveError}
                            />
                        )}
                    </>
                )}

                {/* ── Pestaña: Tabla de registros ─────────────────────── */}
                {activeTab === 'table' && (
                    <BoletaTable
                        boletas={boletas}
                        loading={loading}
                        error={error}
                        page={page}
                        setPage={setPage}
                        totalCount={totalCount}
                        pageSize={PAGE_SIZE}
                        filters={filters}
                        onFilterChange={applyFilters}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onView={handleView}
                    />
                )}

                {/* ── Pestaña: Auditoría ──────────────────────────────── */}
                {activeTab === 'audit' && (
                    <AuditoriaTable
                        registros={registros}
                        loading={loadingAudit}
                        error={errorAudit}
                    />
                )}
            </div>

            {/* Modal de detalle (vista) */}
            {viewTarget && (
                <div className="boleta-modal-overlay" onClick={() => setViewTarget(null)}>
                    <div className="boleta-modal boleta-modal--detail" onClick={(e) => e.stopPropagation()}>
                        <div className="boleta-modal-header">
                            <h3>Detalle — Boleta N° {viewTarget.numero_documento}</h3>
                            <button className="boleta-modal-close" onClick={() => setViewTarget(null)}>✕</button>
                        </div>
                        <div className="boleta-detail-grid">
                            {[
                                ['Mes/Año', viewTarget.mes_anio],
                                ['Tipo Documento', viewTarget.tipo_documento],
                                ['Formato', viewTarget.formato_documento],
                                ['N° Documento', viewTarget.numero_documento],
                                ['Fecha Emisión', viewTarget.fecha_emision],
                                ['Monto', Number(viewTarget.monto).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })],
                                ['Proveedor', viewTarget.proveedor_nombre],
                                ['Banco', viewTarget.banco],
                                ['ID Licitación', viewTarget.id_licitacion || '—'],
                                ['Nombre Licitación', viewTarget.nombre_licitacion || '—'],
                                ['Comprador', viewTarget.comprador_nombre],
                                ['Vigencia', viewTarget.vigencia_garantia],
                                ['Fecha Derivación Abast.', viewTarget.fecha_derivacion_abastecimiento || '—'],
                                ['Depto. Finanzas', viewTarget.depto_finanzas || '—'],
                                ['N° Memo', viewTarget.numero_memo || '—'],
                                ['Fecha Despacho Finanzas', viewTarget.fecha_despacho_finanzas || '—'],
                                ['Creado por', viewTarget.creado_por_username || '—'],
                                ['Fecha Registro', viewTarget.created_at ? new Date(viewTarget.created_at).toLocaleString('es-CL') : '—'],
                            ].map(([label, value]) => (
                                <div key={label} className="boleta-detail-row">
                                    <span className="boleta-detail-label">{label}</span>
                                    <span className="boleta-detail-value">{value}</span>
                                </div>
                            ))}
                            {viewTarget.adjunto_url && (
                                <div className="boleta-detail-row boleta-detail-row--full">
                                    <span className="boleta-detail-label">Adjunto</span>
                                    <a href={viewTarget.adjunto_url} target="_blank" rel="noopener noreferrer" className="boleta-file-link">
                                        📎 Descargar archivo
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
