import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Sidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    const path = location.pathname; // ruta actual para marcar el ítem activo

    // Expandir automáticamente el grupo correcto según la ruta
    const [openGroups, setOpenGroups] = useState({
        abast: path.startsWith('/licitaciones'),
        finanzas: path.startsWith('/anexo'),
        admin: false,
    });
    const [openMods, setOpenMods] = useState({
        mp: path.startsWith('/licitaciones'),
        inventario: false,
        finReportes: path.startsWith('/anexo'),
    });

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('refresh');
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
            {/* CABECERA */}
            <div className="sidebar-brand" onClick={() => goTo('/')} style={{ cursor: 'pointer' }}>

                <div className="sidebar-brand-info">
                    <div className="sidebar-brand-name">Sistema Gestión Interno</div>
                    <div className="sidebar-brand-sub">Servicio de Salud Osorno </div>
                </div>
            </div>

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
                                    <span>🛍️</span> <span className="nav-item-text">Órdenes de Compra</span>
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
                    </div>
                </div>

                {/* ── FINANZAS ──────────────────────── */}
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
                                    className={`nav-item ${isActive('/anexo3') ? 'active' : ''}`}
                                    onClick={() => goTo('/anexo3', 'finanzas', 'finReportes')}
                                >
                                    <span>📋</span> <span className="nav-item-text">Anexo N°3 — Control Deuda</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── ADMINISTRACIÓN ────────────────── */}
                <div className={`nav-group ${openGroups.admin ? 'open' : ''}`}>
                    <div className="nav-group-title" onClick={() => toggleGroup('admin')}>
                        <span className="nav-group-title-icon">⚙️</span>
                        <span className="nav-group-title-text">Administración</span>
                        <span className="nav-group-arrow" style={{ transform: openGroups.admin ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                    </div>
                    <div className="nav-group-children" style={{ display: openGroups.admin ? 'block' : 'none' }}>
                        <div className="nav-item disabled">
                            <span>👤</span> <span className="nav-item-text">Gestión de Usuarios</span>
                            <span className="nav-badge">Pronto</span>
                        </div>
                    </div>
                </div>
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-user">
                    <span className="sidebar-user-avatar">👤</span>
                    <span className="sidebar-user-name">Administrador</span>
                </div>
                <button className="sidebar-logout-btn" onClick={handleLogout}>
                    <span>🚪</span>
                    <span className="sidebar-logout-label">Salir</span>
                </button>
            </div>
        </aside>
    );
}
