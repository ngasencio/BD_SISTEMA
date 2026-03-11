/**
 * @file components/ui/Sidebar.jsx
 * @description Sidebar dinámico según el rol del usuario autenticado.
 *
 * Roles soportados:
 *  - admin       → ve todos los módulos
 *  - abastecimiento → ve módulo Abastecimiento
 *  - finanzas    → ve módulo Finanzas
 *  - viewer      → acceso de solo lectura (sin módulos de gestión)
 */
import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/authStore';

// ─── Definición del menú por rol ──────────────────────────────────────────────
const NAV_ITEMS = {
    admin: [
        { label: 'Inicio', path: '/', icon: '🏠' },
        { label: 'Dashboard Abastecimiento', path: '/abastecimiento/dashboard', icon: '📋' },
        { label: 'Gestor FSC', path: '/abastecimiento/fsc', icon: '📑' },
        { label: 'Licitaciones', path: '/licitaciones', icon: '🔍' },
        { label: 'Órdenes de Compra', path: '/ordenes-compra', icon: '🛍️' },
        { label: 'Dashboard Finanzas', path: '/finanzas/dashboard', icon: '💰' },
        { label: 'Control Deuda (Anexo 3)', path: '/anexo3', icon: '📊' },
    ],
    abastecimiento: [
        { label: 'Inicio', path: '/', icon: '🏠' },
        { label: 'Dashboard', path: '/abastecimiento/dashboard', icon: '📋' },
        { label: 'Gestor FSC', path: '/abastecimiento/fsc', icon: '📑' },
        { label: 'Licitaciones', path: '/licitaciones', icon: '🔍' },
        { label: 'Órdenes de Compra', path: '/ordenes-compra', icon: '🛍️' },
    ],
    finanzas: [
        { label: 'Inicio', path: '/', icon: '🏠' },
        { label: 'Dashboard Finanzas', path: '/finanzas/dashboard', icon: '💰' },
        { label: 'Control Deuda (Anexo 3)', path: '/anexo3', icon: '📊' },
    ],
    viewer: [
        { label: 'Inicio', path: '/', icon: '🏠' },
        { label: 'Licitaciones', path: '/licitaciones', icon: '🔍' },
        { label: 'Órdenes de Compra', path: '/ordenes-compra', icon: '🛍️' },
    ],
};

// ─── Componente ───────────────────────────────────────────────────────────────
export const Sidebar = () => {
    const { user, role, logout } = useAuth();
    const navigate = useNavigate();
    const [collapsed, setCollapsed] = useState(false);

    const items = NAV_ITEMS[role] || NAV_ITEMS.viewer;

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
            {/* Header */}
            <div className="sidebar-header">
                {!collapsed && (
                    <div className="sidebar-brand">
                        <span className="brand-icon">⚙️</span>
                        <span className="brand-name">Sistema Gestión</span>
                    </div>
                )}
                <button
                    className="sidebar-toggle"
                    onClick={() => setCollapsed((c) => !c)}
                    aria-label="Colapsar menú"
                >
                    {collapsed ? '»' : '«'}
                </button>
            </div>

            {/* Perfil */}
            {!collapsed && user && (
                <div className="sidebar-profile">
                    <div className="avatar">{user.username?.[0]?.toUpperCase() || '?'}</div>
                    <div>
                        <p className="profile-name">{user.username || 'Usuario'}</p>
                        <span className={`role-badge role-${role}`}>{role}</span>
                    </div>
                </div>
            )}

            {/* Navegación */}
            <nav className="sidebar-nav">
                {items.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `nav-item${isActive ? ' nav-item--active' : ''}`
                        }
                        title={collapsed ? item.label : undefined}
                    >
                        <span className="nav-icon">{item.icon}</span>
                        {!collapsed && <span className="nav-label">{item.label}</span>}
                    </NavLink>
                ))}
            </nav>

            {/* Logout */}
            <div className="sidebar-footer">
                <button className="nav-item nav-item--logout" onClick={handleLogout}>
                    <span className="nav-icon">🚪</span>
                    {!collapsed && <span className="nav-label">Cerrar Sesión</span>}
                </button>
            </div>
        </aside>
    );
};
