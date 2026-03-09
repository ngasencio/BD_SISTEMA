import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import logoImg from '../assets/logo.jpg';

const MODULES = [
    {
        id: 'licitaciones',
        icon: '📄',
        title: 'Licitaciones',
        desc: 'Gestión y seguimiento de licitaciones en Mercado Público. Consulta estados, montos y compradores.',
        route: '/licitaciones',
        color: '#1a3d71',
        gradient: 'linear-gradient(135deg, #1a3d71 0%, #2c6bbf 100%)',
        badge: null,
        available: true,
    },
    {
        id: 'anexo3',
        icon: '📋',
        title: 'Anexo N°3 — Control de Deuda',
        desc: 'Dashboard de control de devengo y deuda pendiente por proveedor y establecimiento.',
        route: '/anexo3',
        color: '#c0392b',
        gradient: 'linear-gradient(135deg, #c0392b 0%, #e74c3c 100%)',
        badge: null,
        available: true,
    },
    {
        id: 'ordenes',
        icon: '🛍️',
        title: 'Órdenes de Compra',
        desc: 'Gestión de órdenes de compra, seguimiento y control de proveedores.',
        route: null,
        color: '#27ae60',
        gradient: 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)',
        badge: 'Próximamente',
        available: false,
    },
    {
        id: 'inventario',
        icon: '🏭',
        title: 'Gestión de Inventario',
        desc: 'Control de bodegas centrales, stock y movimientos de materiales.',
        route: null,
        color: '#e67e22',
        gradient: 'linear-gradient(135deg, #e67e22 0%, #f39c12 100%)',
        badge: 'Próximamente',
        available: false,
    },
    {
        id: 'contratos',
        icon: '📝',
        title: 'Contratos',
        desc: 'Registro y seguimiento de contratos vigentes, vencimientos y renovaciones.',
        route: null,
        color: '#8e44ad',
        gradient: 'linear-gradient(135deg, #8e44ad 0%, #9b59b6 100%)',
        badge: 'Próximamente',
        available: false,
    },
    {
        id: 'usuarios',
        icon: '👥',
        title: 'Administración',
        desc: 'Gestión de usuarios, roles y permisos del sistema.',
        route: null,
        color: '#6c757d',
        gradient: 'linear-gradient(135deg, #6c757d 0%, #adb5bd 100%)',
        badge: 'Próximamente',
        available: false,
    },
];

const QUICK_LINKS = [
    { icon: '📄', label: 'Licitaciones', route: '/licitaciones', color: '#1a3d71' },
    { icon: '📋', label: 'Control de Deuda', route: '/anexo3', color: '#c0392b' },
];

export default function Home() {
    const navigate = useNavigate();
    const [hora, setHora] = useState('');
    const [fecha, setFecha] = useState('');

    useEffect(() => {
        const update = () => {
            const now = new Date();
            setHora(now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
            setFecha(now.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
        };
        update();
        const t = setInterval(update, 60000);
        return () => clearInterval(t);
    }, []);

    return (
        <div style={{ display: 'flex' }}>
            <Sidebar />
            <main className="main">
                <Topbar />
                <div className="content" style={{ padding: '24px 28px', maxWidth: 1200 }}>

                    {/* ── Hero Banner ─────────────────────────────────────── */}
                    <div style={{
                        background: 'linear-gradient(135deg, #1a3d71 0%, #1e4d8c 60%, #2c6bbf 100%)',
                        borderRadius: 16,
                        padding: '32px 36px',
                        marginBottom: 28,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 28,
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: '0 8px 32px rgba(26, 61, 113, 0.35)',
                    }}>
                        {/* Decoración de fondo */}
                        <div style={{
                            position: 'absolute', right: -40, top: -40,
                            width: 240, height: 240, borderRadius: '50%',
                            background: 'rgba(255,255,255,0.06)',
                        }} />
                        <div style={{
                            position: 'absolute', right: 80, bottom: -60,
                            width: 180, height: 180, borderRadius: '50%',
                            background: 'rgba(255,255,255,0.04)',
                        }} />

                        {/* Logo */}
                        <div style={{
                            width: 80, height: 80, borderRadius: 16, overflow: 'hidden',
                            border: '3px solid rgba(255,255,255,0.25)',
                            flexShrink: 0, background: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                        }}>
                            <img src={logoImg} alt="SSO Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>

                        {/* Texto */}
                        <div style={{ flex: 1, zIndex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.65)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
                                Servicio de Salud Osorno · Código 7296
                            </div>
                            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                                Sistema de Gestión Interno
                            </h1>
                            <div style={{ marginTop: 6, fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
                                Departamento de Abastecimiento · Región de Los Lagos
                            </div>
                        </div>

                        {/* Reloj */}
                        <div style={{ textAlign: 'right', zIndex: 1, flexShrink: 0 }}>
                            <div style={{ fontSize: 34, fontWeight: 800, color: '#fff', fontFamily: 'monospace', lineHeight: 1 }}>
                                {hora}
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 4, textTransform: 'capitalize' }}>
                                {fecha}
                            </div>
                        </div>
                    </div>

                    {/* ── Accesos Rápidos ──────────────────────────────────── */}
                    <div style={{ marginBottom: 28 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a3d71', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                            ⚡ Accesos Rápidos
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {QUICK_LINKS.map(link => (
                                <button
                                    key={link.route}
                                    onClick={() => navigate(link.route)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '10px 20px', borderRadius: 10,
                                        border: `2px solid ${link.color}`,
                                        background: '#fff', color: link.color,
                                        fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = link.color;
                                        e.currentTarget.style.color = '#fff';
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                        e.currentTarget.style.boxShadow = `0 6px 20px ${link.color}40`;
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = '#fff';
                                        e.currentTarget.style.color = link.color;
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                                    }}
                                >
                                    <span style={{ fontSize: 16 }}>{link.icon}</span>
                                    {link.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Módulos del Sistema ──────────────────────────────── */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a3d71', marginBottom: 16, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        🗂️ Módulos del Sistema
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: 18,
                        marginBottom: 32,
                    }}>
                        {MODULES.map(mod => (
                            <ModuleCard key={mod.id} mod={mod} onClick={() => mod.available && navigate(mod.route)} />
                        ))}
                    </div>

                    {/* ── Footer institucional ─────────────────────────────── */}
                    <div style={{
                        textAlign: 'center', padding: '16px', borderTop: '1px solid #eaecf0',
                        fontSize: 11, color: '#9ca3af',
                    }}>
                        🏥 Sistema Gestión Interno · Servicio de Salud Osorno · Abastecimiento · {new Date().getFullYear()}
                    </div>

                </div>
            </main>
        </div>
    );
}

function ModuleCard({ mod, onClick }) {
    const [hovered, setHovered] = useState(false);

    return (
        <div
            onClick={mod.available ? onClick : undefined}
            onMouseEnter={() => mod.available && setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                borderRadius: 14,
                border: '1px solid',
                borderColor: hovered ? mod.color : '#e5e7eb',
                background: hovered ? `${mod.color}08` : '#fff',
                padding: '22px 22px 20px',
                cursor: mod.available ? 'pointer' : 'default',
                transition: 'all 0.22s ease',
                transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
                boxShadow: hovered
                    ? `0 12px 30px ${mod.color}25`
                    : '0 2px 8px rgba(0,0,0,0.06)',
                opacity: mod.available ? 1 : 0.72,
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Línea superior de color */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                height: 4, background: mod.gradient,
                opacity: hovered ? 1 : 0.5,
                transition: 'opacity 0.22s',
                borderRadius: '14px 14px 0 0',
            }} />

            {/* Icono */}
            <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: mod.gradient,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, marginBottom: 14,
                boxShadow: `0 4px 14px ${mod.color}30`,
                transition: 'transform 0.22s',
                transform: hovered ? 'scale(1.1)' : 'scale(1)',
            }}>
                {mod.icon}
            </div>

            {/* Título y badge */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2332', lineHeight: 1.3, flex: 1 }}>
                    {mod.title}
                </div>
                {mod.badge && (
                    <span style={{
                        fontSize: 9, fontWeight: 700, background: '#f0f0f0',
                        color: '#6c757d', borderRadius: 20, padding: '2px 8px',
                        whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2,
                        border: '1px solid #e0e0e0',
                    }}>
                        {mod.badge}
                    </span>
                )}
            </div>

            {/* Descripción */}
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
                {mod.desc}
            </div>

            {/* Flecha si disponible */}
            {mod.available && (
                <div style={{
                    marginTop: 14, fontSize: 12, fontWeight: 600,
                    color: mod.color, display: 'flex', alignItems: 'center', gap: 4,
                    opacity: hovered ? 1 : 0, transition: 'opacity 0.2s',
                }}>
                    Abrir módulo →
                </div>
            )}
        </div>
    );
}
