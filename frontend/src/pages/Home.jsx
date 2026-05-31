import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import logoImg from '../assets/logo.jpg';

const MODULES_ACTIVE = [
    {
        id: 'licitaciones',
        icon: '📄',
        title: 'Licitaciones',
        desc: 'Gestión y seguimiento de licitaciones en Mercado Público. Estados, montos y compradores.',
        route: '/licitaciones',
        color: '#1a3d71',
    },
    {
        id: 'ordenes',
        icon: '🛍️',
        title: 'Órdenes de Compra',
        desc: 'OC emitidas: seguimiento de estados, proveedores, montos y enlace con PAC.',
        route: '/ordenes-compra',
        color: '#22c55e',
    },
    {
        id: 'compra-agil',
        icon: '⚡',
        title: 'Compra Ágil',
        desc: 'Análisis de compras por convenio marco. KPIs de ahorro, adjudicación y Res.188.',
        route: '/compra-agil',
        color: '#3b82f6',
    },
    {
        id: 'anexo3',
        icon: '📋',
        title: 'Control de Deuda',
        desc: 'Dashboard de devengo y deuda pendiente por proveedor y establecimiento (Anexo N°3).',
        route: '/anexo3',
        color: '#dc2626',
    },
    {
        id: 'pac',
        icon: '📅',
        title: 'PAC',
        desc: 'Plan Anual de Compras: seguimiento de cumplimiento y vinculación con órdenes.',
        route: '/pac',
        color: '#f59e0b',
    },
    {
        id: 'abastecimiento',
        icon: '🏪',
        title: 'Dashboard Abastecimiento',
        desc: 'Resumen operativo del área de abastecimiento: FSC, boletas y gestión de contratos.',
        route: '/abastecimiento/dashboard',
        color: '#8b5cf6',
    },
    {
        id: 'boletas',
        icon: '🔐',
        title: 'Boletas de Garantía',
        desc: 'Registro y control de boletas de garantía: estado, vigencia y proveedores.',
        route: '/abastecimiento/boletas',
        color: '#0891b2',
    },
    {
        id: 'finanzas',
        icon: '💹',
        title: 'Dashboard Finanzas',
        desc: 'Indicadores financieros, ejecución presupuestaria y análisis de devengo.',
        route: '/finanzas/dashboard',
        color: '#16a34a',
    },
];

const MODULES_PENDING = [
    {
        id: 'inventario',
        icon: '🏭',
        title: 'Gestión de Inventario',
        desc: 'Control de bodegas, stock y movimientos de materiales.',
        color: '#94a3b8',
    },
    {
        id: 'contratos',
        icon: '📝',
        title: 'Contratos',
        desc: 'Registro y seguimiento de contratos vigentes, vencimientos y renovaciones.',
        color: '#94a3b8',
    },
    {
        id: 'usuarios',
        icon: '👥',
        title: 'Administración de Usuarios',
        desc: 'Gestión de usuarios, roles y permisos del sistema.',
        color: '#94a3b8',
    },
];

function ModuleCard({ mod, onClick }) {
    const isActive = !!onClick;
    return (
        <div
            className={`module-card ${isActive ? 'module-card-active' : 'module-card-disabled'}`}
            style={{ borderTop: `4px solid ${mod.color}` }}
            onClick={onClick}
        >
            <div style={{ fontSize: 22, marginBottom: 10 }}>{mod.icon}</div>
            <div className="module-card-title">{mod.title}</div>
            <div className="module-card-desc">{mod.desc}</div>
            {isActive && (
                <div className="module-card-link" style={{ color: mod.color }}>
                    Abrir módulo →
                </div>
            )}
            {!isActive && (
                <div style={{ marginTop: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, background: '#f1f5f9', color: '#94a3b8', padding: '2px 8px', borderRadius: 20, border: '1px solid #e2e8f0' }}>
                        Próximamente
                    </span>
                </div>
            )}
        </div>
    );
}

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
        <>
            {/* ── Encabezado ── */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: 8, overflow: 'hidden',
                        border: '1px solid #e2e8f0', flexShrink: 0, background: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <img src={logoImg} alt="SSO" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div>
                        <div className="page-title">
                            <span className="page-title-icon">🏥</span> Sistema de Gestión Interno
                        </div>
                        <div className="page-subtitle">
                            Servicio de Salud Osorno · Departamento de Abastecimiento · Organismo 7296
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace', lineHeight: 1 }}>
                        {hora}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, textTransform: 'capitalize' }}>
                        {fecha}
                    </div>
                </div>
            </div>

            {/* ── Módulos disponibles ── */}
            <div className="section-heading">Módulos disponibles</div>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                gap: 14,
                marginBottom: 32,
            }}>
                {MODULES_ACTIVE.map(mod => (
                    <ModuleCard key={mod.id} mod={mod} onClick={() => navigate(mod.route)} />
                ))}
            </div>

            {/* ── Próximamente ── */}
            <div className="section-heading" style={{ color: '#94a3b8' }}>En desarrollo</div>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                gap: 14,
                marginBottom: 24,
            }}>
                {MODULES_PENDING.map(mod => (
                    <ModuleCard key={mod.id} mod={mod} onClick={null} />
                ))}
            </div>

            {/* ── Pie de página ── */}
            <div style={{
                borderTop: '1px solid #e2e8f0',
                paddingTop: 12,
                fontSize: 11,
                color: '#94a3b8',
                textAlign: 'center',
            }}>
                Sistema de Gestión Interno · Servicio de Salud Osorno · Abastecimiento · {new Date().getFullYear()}
            </div>
        </>
    );
}
