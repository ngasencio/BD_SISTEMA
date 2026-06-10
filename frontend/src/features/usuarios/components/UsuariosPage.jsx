import React, { useState, useMemo } from 'react';
import { useUsuarios } from '../hooks/useUsuarios';
import ModalUsuario from './ModalUsuario';

const ROLE_LABELS = {
    admin:          'Administrador',
    abastecimiento: 'Abastecimiento',
    finanzas:       'Finanzas',
    viewer:         'Visualizador',
};
const ROLE_COLORS = {
    admin:          { bg: '#ede9fe', text: '#6d28d9', dot: '#7c3aed' },
    abastecimiento: { bg: '#dbeafe', text: '#1d4ed8', dot: '#2563eb' },
    finanzas:       { bg: '#d1fae5', text: '#065f46', dot: '#059669' },
    viewer:         { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' },
};
const AVATAR_COLORS = ['#7c3aed','#2563eb','#059669','#d97706','#dc2626','#0891b2','#7c3aed','#db2777'];

const PAGE_SIZE = 20;

function getAvatarColor(str = '') {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function getInitials(u) {
    if (u.first_name) return u.first_name[0].toUpperCase();
    return (u.username?.[0] || '?').toUpperCase();
}

function RoleBadge({ role }) {
    const c = ROLE_COLORS[role] || ROLE_COLORS.viewer;
    return (
        <span className="u-role-badge" style={{ background: c.bg, color: c.text }}>
            <span className="u-role-dot" style={{ background: c.dot }} />
            {ROLE_LABELS[role] || role}
        </span>
    );
}

function KpiCard({ icon, label, value, color }) {
    return (
        <div className="u-kpi-card">
            <div className="u-kpi-icon" style={{ background: color + '18', color }}>{icon}</div>
            <div className="u-kpi-body">
                <div className="u-kpi-value">{value}</div>
                <div className="u-kpi-label">{label}</div>
            </div>
        </div>
    );
}

export default function UsuariosPage() {
    const [filtros, setFiltros]         = useState({ search: '', role: '', activo: '' });
    const [page, setPage]               = useState(1);
    const [modal, setModal]             = useState(null);
    const [confirmar, setConfirmar]     = useState(null);
    const [errorAccion, setErrorAccion] = useState(null);
    const [deletingId, setDeletingId]   = useState(null);

    const params = useMemo(
        () => Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== '')),
        [filtros]
    );
    const { usuarios, establecimientos, loading, error, crear, actualizar, eliminar } =
        useUsuarios(params);

    // Reset página cuando cambian filtros
    const setFiltro = (k, v) => { setFiltros(f => ({ ...f, [k]: v })); setPage(1); };

    // KPIs calculados sobre todos los usuarios cargados
    const kpis = useMemo(() => ({
        total:   usuarios.length,
        activos: usuarios.filter(u => u.is_active).length,
        admins:  usuarios.filter(u => u.perfil?.role === 'admin').length,
        viewers: usuarios.filter(u => !u.perfil || u.perfil.role === 'viewer').length,
    }), [usuarios]);

    const estMap = useMemo(() => {
        const m = {};
        establecimientos.forEach(e => { m[e.id] = e.nombre_corto || e.descripcion; });
        return m;
    }, [establecimientos]);

    // Paginación client-side
    const totalPages = Math.ceil(usuarios.length / PAGE_SIZE);
    const paginated  = usuarios.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const handleSave = async (data) => {
        if (modal === 'crear') await crear(data);
        else await actualizar(modal.id, data);
    };

    const handleDelete = async () => {
        setErrorAccion(null);
        setDeletingId(confirmar.id);
        try {
            await eliminar(confirmar.id);
            setConfirmar(null);
        } catch (err) {
            setErrorAccion(err.response?.data?.detail || 'Error al eliminar.');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="feature-page">
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                    <div className="page-title">
                        <span className="page-title-icon">👥</span> Gestión de Usuarios
                    </div>
                    <div className="page-subtitle">
                        Administra cuentas de acceso, roles y perfiles del sistema
                    </div>
                </div>
                <button className="u-btn-new" onClick={() => setModal('crear')}>
                    <span>＋</span> Nuevo Usuario
                </button>
            </div>

            {/* KPIs */}
            <div className="u-kpi-row">
                <KpiCard icon="👥" label="Total usuarios" value={kpis.total}   color="#6d28d9" />
                <KpiCard icon="✅" label="Activos"         value={kpis.activos} color="#059669" />
                <KpiCard icon="⚙️" label="Administradores" value={kpis.admins}  color="#d97706" />
                <KpiCard icon="👁" label="Visualizadores"  value={kpis.viewers} color="#64748b" />
            </div>

            {/* Toolbar */}
            <div className="u-toolbar card">
                <div className="u-toolbar-search">
                    <span className="u-search-icon">🔍</span>
                    <input
                        type="search"
                        placeholder="Buscar por email, nombre o cargo…"
                        value={filtros.search}
                        onChange={e => setFiltro('search', e.target.value)}
                    />
                </div>
                <div className="u-toolbar-filters">
                    <select value={filtros.role} onChange={e => setFiltro('role', e.target.value)}>
                        <option value="">Todos los roles</option>
                        {Object.entries(ROLE_LABELS).map(([v, l]) =>
                            <option key={v} value={v}>{l}</option>
                        )}
                    </select>
                    <select value={filtros.activo} onChange={e => setFiltro('activo', e.target.value)}>
                        <option value="">Activo e inactivo</option>
                        <option value="true">Solo activos</option>
                        <option value="false">Solo inactivos</option>
                    </select>
                    <span className="u-count-chip">
                        {usuarios.length} resultado{usuarios.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {/* Tabla */}
            <div className="card u-table-card">
                {error && <div className="error-message" style={{ margin: '16px 20px 0' }}>{error}</div>}

                {loading ? (
                    <div className="u-loading">
                        <div className="u-spinner" />
                        <span>Cargando usuarios…</span>
                    </div>
                ) : usuarios.length === 0 ? (
                    <div className="u-empty">
                        <div className="u-empty-icon">🔍</div>
                        <div className="u-empty-title">Sin resultados</div>
                        <div className="u-empty-sub">Prueba con otros filtros de búsqueda</div>
                    </div>
                ) : (
                    <>
                        <div className="u-table-wrap">
                            <table className="u-table">
                                <thead>
                                    <tr>
                                        <th>Usuario</th>
                                        <th>Nombre</th>
                                        <th>Rol</th>
                                        <th>Cargo</th>
                                        <th>Establecimiento</th>
                                        <th>Estado</th>
                                        <th className="u-th-actions">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map(u => (
                                        <tr key={u.id} className={!u.is_active ? 'u-row-inactive' : ''}>
                                            <td>
                                                <div className="u-user-cell">
                                                    <div
                                                        className="u-avatar"
                                                        style={{ background: getAvatarColor(u.username) }}
                                                    >
                                                        {getInitials(u)}
                                                    </div>
                                                    <div className="u-user-info">
                                                        <div className="u-user-email">{u.username}</div>
                                                        {u.perfil?.run && (
                                                            <div className="u-user-run">RUN {u.perfil.run}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="u-td-nombre">
                                                {[u.first_name, u.last_name].filter(Boolean).join(' ') || <span className="u-nd">—</span>}
                                            </td>
                                            <td><RoleBadge role={u.perfil?.role || 'viewer'} /></td>
                                            <td className="u-td-cargo">
                                                <span title={u.perfil?.cargo}>
                                                    {u.perfil?.cargo || <span className="u-nd">—</span>}
                                                </span>
                                            </td>
                                            <td className="u-td-est">
                                                {u.perfil?.establecimiento_id
                                                    ? (estMap[u.perfil.establecimiento_id] || `#${u.perfil.establecimiento_id}`)
                                                    : <span className="u-nd">—</span>}
                                            </td>
                                            <td>
                                                <span className={`u-status-badge ${u.is_active ? 'u-active' : 'u-inactive'}`}>
                                                    <span className="u-status-dot" />
                                                    {u.is_active ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </td>
                                            <td className="u-td-actions">
                                                <button
                                                    className="u-action-btn u-action-edit"
                                                    title="Editar usuario"
                                                    onClick={() => setModal(u)}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                                    Editar
                                                </button>
                                                <button
                                                    className="u-action-btn u-action-delete"
                                                    title="Eliminar usuario"
                                                    onClick={() => { setErrorAccion(null); setConfirmar(u); }}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                                    Eliminar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginación */}
                        {totalPages > 1 && (
                            <div className="u-pagination">
                                <span className="u-page-info">
                                    Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, usuarios.length)} de {usuarios.length}
                                </span>
                                <div className="u-page-btns">
                                    <button
                                        className="u-page-btn"
                                        disabled={page === 1}
                                        onClick={() => setPage(p => p - 1)}
                                    >← Anterior</button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                                        .reduce((acc, p, i, arr) => {
                                            if (i > 0 && p - arr[i - 1] > 1) acc.push('…');
                                            acc.push(p);
                                            return acc;
                                        }, [])
                                        .map((p, i) =>
                                            p === '…'
                                                ? <span key={`ellipsis-${i}`} className="u-page-ellipsis">…</span>
                                                : <button
                                                    key={p}
                                                    className={`u-page-btn u-page-num ${p === page ? 'u-page-active' : ''}`}
                                                    onClick={() => setPage(p)}
                                                  >{p}</button>
                                        )
                                    }
                                    <button
                                        className="u-page-btn"
                                        disabled={page === totalPages}
                                        onClick={() => setPage(p => p + 1)}
                                    >Siguiente →</button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal crear/editar */}
            {modal && (
                <ModalUsuario
                    usuario={modal === 'crear' ? null : modal}
                    establecimientos={establecimientos}
                    onSave={handleSave}
                    onClose={() => setModal(null)}
                />
            )}

            {/* Confirmar eliminación */}
            {confirmar && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmar(null)}>
                    <div className="modal-box u-delete-modal">
                        <div className="u-delete-icon-wrap">
                            <div className="u-delete-icon">🗑️</div>
                        </div>
                        <h3 className="u-delete-title">¿Eliminar usuario?</h3>
                        <p className="u-delete-email">{confirmar.username}</p>
                        <p className="u-delete-warning">Esta acción no se puede deshacer. El usuario perderá acceso inmediatamente.</p>
                        {errorAccion && <div className="error-message">{errorAccion}</div>}
                        <div className="u-delete-actions">
                            <button className="btn-secondary" onClick={() => setConfirmar(null)} disabled={!!deletingId}>
                                Cancelar
                            </button>
                            <button className="u-btn-destroy" onClick={handleDelete} disabled={!!deletingId}>
                                {deletingId ? 'Eliminando…' : 'Sí, eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
