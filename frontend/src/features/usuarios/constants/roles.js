// Fuente única de verdad para roles del sistema — qué desbloquea cada uno.
// Refleja exactamente los guards de RequireRole en App.jsx; si cambia un guard,
// actualizar acá (y no en cada componente que muestre roles).

const MODULOS_GENERALES = ['Licitaciones', 'Órdenes de Compra', 'PAC', 'Compra Ágil'];
const MODULOS_ABASTECIMIENTO = ['Formularios FSC', 'Boletas de Garantía', 'Contratos SSO'];
const MODULOS_FINANZAS = ['Anexo N°1 — Ejec. Presupuestaria', 'Anexo N°3 — Reporte Deuda', 'Dashboard Finanzas'];
const MODULOS_COMPRAS = ['Procesos de Compra'];

export const ROLES = [
    {
        value: 'viewer',
        label: 'Visualizador',
        color: '#64748b',
        descripcion: 'Acceso a los módulos generales de compras públicas.',
        modulos: [...MODULOS_GENERALES],
    },
    {
        value: 'abastecimiento',
        label: 'Abastecimiento',
        color: '#2563eb',
        descripcion: 'Generales + Formularios FSC, Boletas de Garantía y Contratos SSO.',
        modulos: [...MODULOS_GENERALES, ...MODULOS_ABASTECIMIENTO],
    },
    {
        value: 'finanzas',
        label: 'Finanzas',
        color: '#059669',
        descripcion: 'Generales + reportería de Anexo N°1, Anexo N°3 y Dashboard Finanzas.',
        modulos: [...MODULOS_GENERALES, ...MODULOS_FINANZAS],
    },
    {
        value: 'comprador',
        label: 'Comprador',
        color: '#0891b2',
        descripcion: 'Generales + Abastecimiento (Formularios FSC, Boletas, Contratos) + Procesos de Compra, con vista personalizada de sus propios formularios y procesos.',
        modulos: [...MODULOS_GENERALES, ...MODULOS_ABASTECIMIENTO, ...MODULOS_COMPRAS],
    },
    {
        value: 'jefatura',
        label: 'Jefatura',
        color: '#be185d',
        descripcion: 'Generales + Procesos de Compra con vista global (todos los compradores), dashboard de KPIs y notificaciones.',
        modulos: [...MODULOS_GENERALES, ...MODULOS_COMPRAS],
    },
    {
        value: 'general',
        label: 'General (Todos)',
        color: '#d97706',
        descripcion: 'Ve Abastecimiento, Finanzas y Procesos de Compra completos, sin administrar usuarios.',
        modulos: [...MODULOS_GENERALES, ...MODULOS_ABASTECIMIENTO, ...MODULOS_FINANZAS, ...MODULOS_COMPRAS],
    },
    {
        value: 'admin',
        label: 'Administrador',
        color: '#7c3aed',
        descripcion: 'Todo el sistema, incluyendo Gestión de Usuarios (roles, altas, bajas).',
        modulos: [...MODULOS_GENERALES, ...MODULOS_ABASTECIMIENTO, ...MODULOS_FINANZAS, ...MODULOS_COMPRAS, 'Gestión de Usuarios'],
    },
];

export const ROLE_LABELS = Object.fromEntries(ROLES.map(r => [r.value, r.label]));

export const ROLE_COLORS = Object.fromEntries(
    ROLES.map(r => [r.value, { bg: `${r.color}22`, text: r.color, dot: r.color }])
);

export const getRol = (value) => ROLES.find(r => r.value === value) || ROLES[0];
