import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Sidebar() {
    const navigate = useNavigate();

    // State to toggle navigation groups
    const [openGroups, setOpenGroups] = useState({ abast: true, finanzas: false, admin: false });
    // State to toggle sub-modules
    const [openMods, setOpenMods] = useState({ mp: true, inventario: false });
    // State for the currently active item
    const [activeItem, setActiveItem] = useState('licitaciones');

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('refresh');
        navigate('/login');
    };

    const toggleGroup = (group) => {
        setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    const toggleMod = (mod) => {
        setOpenMods(prev => ({ ...prev, [mod]: !prev[mod] }));
    };

    const handleItemClick = (item) => {
        setActiveItem(item);
    };

    return (
        <aside className="sidebar">
            <div className="sidebar-unit">
                <div className="sidebar-unit-icon">🏥</div>
                <div className="sidebar-unit-name">Servicio de Salud Osorno</div>
                <div className="sidebar-unit-sub">Sistema de Gestión — SSO · Código 7296</div>
            </div>

            <nav className="sidebar-nav">
                {/* GRUPO ABASTECIMIENTO */}
                <div className={`nav-group ${openGroups.abast ? 'open' : ''}`}>
                    <div className="nav-group-title" onClick={() => toggleGroup('abast')} style={{ cursor: 'pointer' }}>
                        <span className="nav-group-title-icon">📦</span>
                        <span className="nav-group-title-text">Abastecimiento</span>
                        <span className="nav-group-arrow" style={{ transform: openGroups.abast ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>▼</span>
                    </div>
                    <div className="nav-group-children" style={{ display: openGroups.abast ? 'block' : 'none' }}>

                        <div className={`nav-mod ${openMods.mp ? 'open' : ''}`}>
                            <div className="nav-mod-title" onClick={() => toggleMod('mp')} style={{ cursor: 'pointer' }}>
                                <span style={{ fontSize: '14px' }}>🛒</span>
                                <span className="nav-mod-title-text">Mercado Público</span>
                                <span className="nav-mod-arrow" style={{ transform: openMods.mp ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>▼</span>
                            </div>
                            <div className="nav-mod-items" style={{ display: openMods.mp ? 'block' : 'none' }}>
                                <div
                                    className={`nav-item ${activeItem === 'licitaciones' ? 'active' : ''}`}
                                    onClick={() => handleItemClick('licitaciones')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <span>📄</span> Licitaciones
                                </div>
                                <div
                                    className={`nav-item ${activeItem === 'compras' ? 'active' : ''}`}
                                    onClick={() => handleItemClick('compras')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <span>🛍️</span> Órdenes de Compra
                                </div>
                            </div>
                        </div>

                        <div className={`nav-mod ${openMods.inventario ? 'open' : ''}`}>
                            <div className="nav-mod-title" onClick={() => toggleMod('inventario')} style={{ cursor: 'pointer' }}>
                                <span style={{ fontSize: '14px' }}>🏭</span>
                                <span className="nav-mod-title-text">Gestión de Inventario</span>
                                <span className="nav-mod-arrow" style={{ transform: openMods.inventario ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>▼</span>
                            </div>
                            <div className="nav-mod-items" style={{ display: openMods.inventario ? 'block' : 'none' }}>
                                <div
                                    className={`nav-item ${activeItem === 'bodegas' ? 'active' : ''}`}
                                    onClick={() => handleItemClick('bodegas')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <span>🏢</span> Bodegas Centrales
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* GRUPO FINANZAS */}
                <div className={`nav-group ${openGroups.finanzas ? 'open' : ''}`}>
                    <div className="nav-group-title" onClick={() => toggleGroup('finanzas')} style={{ cursor: 'pointer' }}>
                        <span className="nav-group-title-icon">💵</span>
                        <span className="nav-group-title-text">Finanzas y Pagos</span>
                        <span className="nav-group-arrow" style={{ transform: openGroups.finanzas ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>▼</span>
                    </div>
                    <div className="nav-group-children" style={{ display: openGroups.finanzas ? 'block' : 'none' }}>
                        <div style={{ padding: '8px 16px 8px 38px', fontSize: '13px', color: 'var(--gob-gris4)' }}>
                            Módulo en desarrollo...
                        </div>
                    </div>
                </div>

                {/* GRUPO ADMINISTRACIÓN */}
                <div className={`nav-group ${openGroups.admin ? 'open' : ''}`}>
                    <div className="nav-group-title" onClick={() => toggleGroup('admin')} style={{ cursor: 'pointer' }}>
                        <span className="nav-group-title-icon">⚙️</span>
                        <span className="nav-group-title-text">Administración</span>
                        <span className="nav-group-arrow" style={{ transform: openGroups.admin ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>▼</span>
                    </div>
                    <div className="nav-group-children" style={{ display: openGroups.admin ? 'block' : 'none' }}>
                        <div style={{ padding: '8px 16px 8px 38px', fontSize: '13px', color: 'var(--gob-gris4)' }}>
                            Gestión de Usuarios
                        </div>
                    </div>
                </div>

            </nav>

            <div className="sidebar-footer">
                <button className="btn-refresh" onClick={handleLogout} style={{ cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eef2f7'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <span>🚪</span> Salir del sistema
                </button>
            </div>
        </aside>
    );
}
