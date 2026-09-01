import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/authStore';
export default function Sidebar() {
    const { user, role, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const path = location.pathname;
    const puede = (...roles) => roles.includes(role);

    // Expandir automáticamente el grupo correcto según la ruta
    const [openGroups, setOpenGroups] = useState({
        abast: path.startsWith('/licitaciones') || path.startsWith('/abastecimiento') || path.startsWith('/ordenes-compra') || path.startsWith('/pac') || path.startsWith('/compra-agil') || path.startsWith('/fsc-oc-pac'),
        finanzas: path.startsWith('/anexo') || path.startsWith('/finanzas') || path.startsWith('/facturas'),
        admin: path.startsWith('/admin'),
    });
    const [openMods, setOpenMods] = useState({
        mp: path.startsWith('/licitaciones') || path.startsWith('/ordenes-compra') || path.startsWith('/compra-agil') || path.startsWith('/abastecimiento/contratos'),
        formularios: path.startsWith('/abastecimiento/formularios'),
        pac: path.startsWith('/pac') || path.startsWith('/fsc-oc-pac'),
        inventario: false,
        garantias: path.startsWith('/abastecimiento/boletas'),
        finReportes: path.startsWith('/anexo') || path.startsWith('/finanzas') || path.startsWith('/facturas'),
    });
    const pacTab = path === '/pac' ? (new URLSearchParams(location.search).get('tab') || 'resumen') : null;
    const pacCumplimientoTab = path === '/pac-cumplimiento' ? (new URLSearchParams(location.search).get('tab') || 'resumen') : null;

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const toggleGroup = (group) =>
        setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));

    const toggleMod = (mod) =>
        setOpenMods(prev => ({ ...prev, [mod]: !prev[mod] }));

    // Helper: navegar y expandir el grupo correcto
    const goTo = (route, group, mod) => {
        if (group) setOpenGroups(prev => ({ ...prev, [group]: true }));
        if (mod) setOpenMods(prev => ({ ...prev, [mod]: true }));
        navigate(route);
    };

    const isActive = (route) => path === route;

    return (
        <aside className="sidebar">


            <nav className="sidebar-nav">
                {/* ── ABASTECIMIENTO ────────────────── */}
                <div className={`nav-group ${openGroups.abast ? 'open' : ''}`}>
                    <div className="nav-group-title" onClick={() => toggleGroup('abast')}>
                        <span className="nav-group-title-icon">📦</span>
                        <span className="nav-group-title-text">Abastecimiento</span>
                        <span className="nav-group-arrow" style={{ transform: openGroups.abast ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                    </div>
                    <div className="nav-group-children" style={{ display: openGroups.abast ? 'block' : 'none' }}>

                        {/* Mercado Público */}
                        <div className={`nav-mod ${openMods.mp ? 'open' : ''}`}>
                            <div className="nav-mod-title" onClick={() => toggleMod('mp')}>
                                <span style={{ fontSize: 14 }}>🛒</span>
                                <span className="nav-mod-title-text">Mercado Público</span>
                                <span className="nav-mod-arrow" style={{ transform: openMods.mp ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                            </div>
                            <div className="nav-mod-items" style={{ display: openMods.mp ? 'block' : 'none' }}>
                                <div
                                    className={`nav-item ${isActive('/licitaciones') ? 'active' : ''}`}
                                    onClick={() => goTo('/licitaciones', 'abast', 'mp')}
                                >
                                    <span>📄</span> <span className="nav-item-text">Licitaciones</span>
                                </div>
                                <div
                                    className={`nav-item ${isActive('/ordenes-compra') ? 'active' : ''}`}
                                    onClick={() => goTo('/ordenes-compra', 'abast', 'mp')}
                                >
                                    <span>🛍️</span>
                                    <span className="nav-item-text">Órdenes de Compra</span>
                                </div>
                                <div
                                    className={`nav-item ${isActive('/compra-agil') ? 'active' : ''}`}
                                    onClick={() => goTo('/compra-agil', 'abast', 'mp')}
                                >
                                    <span>⚡</span>
                                    <span className="nav-item-text">Compra Ágil</span>
                                </div>
                                {puede('admin', 'abastecimiento', 'general') && (
                                    <div
                                        className={`nav-item ${isActive('/abastecimiento/contratos') ? 'active' : ''}`}
                                        onClick={() => goTo('/abastecimiento/contratos', 'abast', 'mp')}
                                    >
                                        <span>📋</span>
                                        <span className="nav-item-text">Contratos SSO</span>
                                    </div>
                                )}

                            </div>
                        </div>

                        {/* Formularios */}
                        {puede('admin', 'abastecimiento', 'general') && (
                        <div className={`nav-mod ${openMods.formularios ? 'open' : ''}`}>
                            <div className="nav-mod-title" onClick={() => toggleMod('formularios')}>
                                <span style={{ fontSize: 14 }}>🗂️</span>
                                <span className="nav-mod-title-text">Formularios</span>
                                <span className="nav-mod-arrow" style={{ transform: openMods.formularios ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                            </div>
                            <div className="nav-mod-items" style={{ display: openMods.formularios ? 'block' : 'none' }}>
                                <div
                                    className={`nav-item ${isActive('/abastecimiento/formularios') ? 'active' : ''}`}
                                    onClick={() => goTo('/abastecimiento/formularios', 'abast', 'formularios')}
                                >
                                    <span>📝</span>
                                    <span className="nav-item-text">Formularios FSC</span>
                                </div>
                            </div>
                        </div>
                        )}

                        {/* PAC 2026 */}
                        <div className={`nav-mod ${openMods.pac ? 'open' : ''}`}>
                            <div className="nav-mod-title" onClick={() => toggleMod('pac')}>
                                <span style={{ fontSize: 14 }}>📅</span>
                                <span className="nav-mod-title-text">PAC 2026</span>
                                <span className="nav-mod-arrow" style={{ transform: openMods.pac ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                            </div>
                            <div className="nav-mod-items" style={{ display: openMods.pac ? 'block' : 'none' }}>
                                <div
                                    className={`nav-item ${isActive('/pac') && pacTab === 'resumen' ? 'active' : ''}`}
                                    onClick={() => goTo('/pac?tab=resumen', 'abast', 'pac')}
                                >
                                    <span>📊</span>
                                    <span className="nav-item-text">Indicadores Res.188</span>
                                </div>
                                <div
                                    className={`nav-item ${isActive('/pac-cumplimiento') && pacCumplimientoTab === 'resumen' ? 'active' : ''}`}
                                    onClick={() => goTo('/pac-cumplimiento?tab=resumen', 'abast', 'pac')}
                                >
                                    <span>✅</span>
                                    <span className="nav-item-text">Cumplimiento Interno PAC</span>
                                </div>
                                <div
                                    className={`nav-item ${isActive('/fsc-oc-pac') ? 'active' : ''}`}
                                    onClick={() => goTo('/fsc-oc-pac', 'abast', 'pac')}
                                >
                                    <span>🔗</span>
                                    <span className="nav-item-text">Enlace FSC-OC-PAC</span>
                                </div>
                            </div>
                        </div>

                        {/* Inventario */}
                        <div className={`nav-mod ${openMods.inventario ? 'open' : ''}`}>
                            <div className="nav-mod-title" onClick={() => toggleMod('inventario')}>
                                <span style={{ fontSize: 14 }}>🏭</span>
                                <span className="nav-mod-title-text">Gestión de Inventario</span>
                                <span className="nav-mod-arrow" style={{ transform: openMods.inventario ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                            </div>
                            <div className="nav-mod-items" style={{ display: openMods.inventario ? 'block' : 'none' }}>
                                <div className="nav-item disabled">
                                    <span>🏢</span> <span className="nav-item-text">Bodegas Centrales</span>
                                    <span className="nav-badge">Pronto</span>
                                </div>
                            </div>
                        </div>

                        {/* Garantías */}
                        {puede('admin', 'abastecimiento', 'general') && (
                        <div className={`nav-mod ${openMods.garantias ? 'open' : ''}`}>
                            <div className="nav-mod-title" onClick={() => toggleMod('garantias')}>
                                <span style={{ fontSize: 14 }}>🛡️</span>
                                <span className="nav-mod-title-text">Garantías</span>
                                <span className="nav-mod-arrow" style={{ transform: openMods.garantias ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                            </div>
                            <div className="nav-mod-items" style={{ display: openMods.garantias ? 'block' : 'none' }}>
                                <div
                                    className={`nav-item ${isActive('/abastecimiento/boletas') ? 'active' : ''}`}
                                    onClick={() => goTo('/abastecimiento/boletas', 'abast', 'garantias')}
                                >
                                    <span>📄</span> <span className="nav-item-text">Boletas de Garantía</span>
                                </div>
                            </div>
                        </div>
                        )}
                    </div>
                </div>

                {/* ── FINANZAS ──────────────────────── */}
                {puede('admin', 'finanzas', 'general') && (
                <div className={`nav-group ${openGroups.finanzas ? 'open' : ''}`}>
                    <div className="nav-group-title" onClick={() => toggleGroup('finanzas')}>
                        <span className="nav-group-title-icon">💵</span>
                        <span className="nav-group-title-text">Finanzas</span>
                        <span className="nav-group-arrow" style={{ transform: openGroups.finanzas ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                    </div>
                    <div className="nav-group-children" style={{ display: openGroups.finanzas ? 'block' : 'none' }}>
                        <div className={`nav-mod ${openMods.finReportes ? 'open' : ''}`}>
                            <div className="nav-mod-title" onClick={() => toggleMod('finReportes')}>
                                <span style={{ fontSize: 14 }}>📊</span>
                                <span className="nav-mod-title-text">Reportes</span>
                                <span className="nav-mod-arrow" style={{ transform: openMods.finReportes ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                            </div>
                            <div className="nav-mod-items" style={{ display: openMods.finReportes ? 'block' : 'none' }}>
                                <div
                                    className={`nav-item ${isActive('/anexo1/base-datos') ? 'active' : ''}`}
                                    onClick={() => goTo('/anexo1/base-datos', 'finanzas', 'finReportes')}
                                >
                                    <span>📑</span> <span className="nav-item-text">Anexo N°1 — Ejecución Presupuestaria</span>
                                </div>
                                <div
                                    className={`nav-item ${isActive('/anexo3/reporte-sigfe') ? 'active' : ''}`}
                                    onClick={() => goTo('/anexo3/reporte-sigfe', 'finanzas', 'finReportes')}
                                >
                                    <span>🌳</span> <span className="nav-item-text">Anexo N°3 - Reporte Deuda</span>
                                </div>
                                <div
                                    className={`nav-item ${isActive('/facturas') ? 'active' : ''}`}
                                    onClick={() => goTo('/facturas', 'finanzas', 'finReportes')}
                                >
                                    <span>🧾</span> <span className="nav-item-text">Facturas DIPRES</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                )}

                {/* ── ADMINISTRACIÓN (solo admin) ─── */}
                {role === 'admin' && (
                    <div className={`nav-group ${openGroups.admin ? 'open' : ''}`}>
                        <div className="nav-group-title" onClick={() => toggleGroup('admin')}>
                            <span className="nav-group-title-icon">⚙️</span>
                            <span className="nav-group-title-text">Administración</span>
                            <span className="nav-group-arrow" style={{ transform: openGroups.admin ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                        </div>
                        <div className="nav-group-children" style={{ display: openGroups.admin ? 'block' : 'none' }}>
                            <div
                                className={`nav-item ${isActive('/admin/usuarios') ? 'active' : ''}`}
                                onClick={() => goTo('/admin/usuarios', 'admin', null)}
                            >
                                <span>👥</span>
                                <span className="nav-item-text">Gestión de Usuarios</span>
                            </div>
                        </div>
                    </div>
                )}

            </nav>

            <div className="sidebar-footer">
                <div
                    className={`sidebar-user ${isActive('/perfil') ? 'active' : ''}`}
                    onClick={() => navigate('/perfil')}
                    style={{ cursor: 'pointer' }}
                    title="Mi Perfil"
                >
                    <div className="sidebar-user-avatar">
                        {user?.username?.[0]?.toUpperCase() || '👤'}
                    </div>
                    <div className="sidebar-user-info">
                        <div className="sidebar-user-name">{user?.nombre || user?.username || 'Usuario'}</div>
                        <div className="sidebar-user-role">{role}</div>
                    </div>
                </div>
                <button className="sidebar-logout-btn" onClick={handleLogout} title="Cerrar Sesión">
                    <span>🚪</span>
                    <span className="sidebar-logout-label">Salir</span>
                </button>
            </div>
        </aside>
    );
}
