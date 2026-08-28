import React from 'react';
import { useAnexo1GuiaSimple } from '../../hooks/useAnexo1GuiaSimple';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

function BarraSimple({ rows, color = '#1B3FD8' }) {
    if (!rows.length) {
        return <div style={{ fontSize: 11.5, color: '#94a3b8', padding: '8px 0' }}>Sin datos para este filtro.</div>;
    }
    const max = Math.max(...rows.map((r) => Math.abs(r.val)), 1);
    return (
        <div>
            {rows.map((r, i) => {
                const pct = Math.max((Math.abs(r.val) / max) * 100, 2);
                return (
                    <div key={r.lbl + i} style={{ marginBottom: 11 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: '#334155', marginBottom: 3 }}>
                            <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.lbl}>{r.lbl}</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0B5A8F', flexShrink: 0, marginLeft: 10 }}>{fmtMoney(r.val)}</span>
                        </div>
                        <div style={{ background: '#f1f5f9', borderRadius: 5, height: 9, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 5 }} />
                        </div>
                        {r.sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{r.sub}</div>}
                    </div>
                );
            })}
        </div>
    );
}

const PASOS = [
    {
        key: 'ley_presupuestos', label: '1. Ley de Presupuestos', icon: '📜',
        desc: 'El presupuesto total que el Estado le aprobó al hospital para gastar este año — el techo máximo.',
    },
    {
        key: 'requerimiento', label: '2. Requerimiento', icon: '📝',
        desc: 'Lo que el hospital pidió gastar de ese presupuesto. Todavía no es una obligación legal.',
        saldoKey: 'saldo_por_aplicar', saldoLabel: 'Del presupuesto, esto no se ha ni solicitado todavía',
    },
    {
        key: 'compromiso', label: '3. Compromiso', icon: '🤝',
        desc: 'Lo que ya se comprometió formalmente: una orden de compra o un contrato firmado con un proveedor.',
        saldoKey: 'saldo_por_comprometer', saldoLabel: 'Se pidió, pero todavía no se firma/compromete',
    },
    {
        key: 'devengado', label: '4. Devengado', icon: '📦',
        desc: 'Lo que ya se recibió: el bien llegó o el servicio se prestó, aunque todavía no se haya pagado.',
        saldoKey: 'saldo_por_devengar', saldoLabel: 'Comprometido, pero aún no llega / no se presta',
    },
    {
        key: 'efectivo', label: '5. Efectivo', icon: '💵',
        desc: 'Lo que ya se pagó de verdad, en dinero, al proveedor.',
        saldoKey: 'deuda_flotante', saldoLabel: 'Ya se recibió pero todavía NO se paga (Deuda Flotante)', saldoDanger: true,
    },
];

const NIVEL_DESC = {
    1: 'Subtítulo — la categoría más general de gasto (ej. "21 Gastos en Personal").',
    2: 'Ítem — un nivel más específico dentro del Subtítulo.',
    3: 'Asignación — más específico todavía.',
    4: 'Sub-asignación — casi al detalle final.',
    5: 'Detalle — el nivel más específico de todos.',
};

export default function TabGuiaSimple({ filtros, refreshKey }) {
    const { data, loading, error } = useAnexo1GuiaSimple(filtros, refreshKey);

    if (loading && !data) return <div className="loading-spinner">Cargando Guía Rápida…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data) return null;

    const { kpis, por_concepto, por_nivel, por_cruce } = data;

    return (
        <div>
            <div style={{
                background: '#eff6ff', borderLeft: '4px solid #0B5A8F', borderRadius: 8,
                padding: '14px 16px', marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-start',
            }}
            >
                <span style={{ fontSize: 22 }}>💡</span>
                <div style={{ fontSize: 12, color: '#1e293b', lineHeight: 1.6 }}>
                    <strong>¿Cómo se gasta el presupuesto del hospital?</strong> El dinero pasa por 5 etapas, una tras otra: se
                    aprueba (Ley), se solicita (Requerimiento), se compromete con un proveedor (Compromiso), se recibe
                    (Devengado) y finalmente se paga (Efectivo). Entre cada etapa queda un "saldo": la parte que todavía no
                    avanzó a la siguiente. La <strong>Deuda Flotante</strong> es la más importante de vigilar: es lo que ya se
                    recibió pero todavía no se paga.
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {PASOS.map((p) => (
                    <div key={p.key} className="card" style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 24 }}>{p.icon}</span>
                            <div style={{ flex: 1, minWidth: 220 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#0B5A8F' }}>{p.label}</div>
                                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>{p.desc}</div>
                            </div>
                            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'monospace', color: '#1e293b', whiteSpace: 'nowrap' }}>
                                {fmtMoney(kpis[p.key])}
                            </div>
                        </div>
                        {p.saldoKey && (
                            <div style={{
                                marginTop: 10, marginLeft: 38, fontSize: 11, padding: '6px 10px', borderRadius: 6,
                                background: p.saldoDanger ? '#fee2e2' : '#f8fafc',
                                color: p.saldoDanger ? '#7f1d1d' : '#475569',
                                display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
                            }}
                            >
                                <span>↳ {p.saldoLabel}</span>
                                <strong style={{ fontFamily: 'monospace' }}>{fmtMoney(kpis[p.saldoKey])}</strong>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div className="card" style={{ padding: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 4 }}>📂 ¿En qué categoría de gasto está la plata?</div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>
                        Cada barra es un Concepto Presupuestario (ej. "22 Bienes y Servicios de Consumo"). El monto es la deuda pendiente de esa categoría.
                    </div>
                    <BarraSimple
                        rows={por_concepto.filter((c) => c.deuda > 0).slice(0, 8).map((c) => ({
                            lbl: `${c.codigo} ${c.nombre}`, val: c.deuda,
                            sub: `Ley: ${fmtMoney(c.ley)} · Devengado: ${fmtMoney(c.devengado)}`,
                        }))}
                        color="#D0202F"
                    />
                </div>
                <div className="card" style={{ padding: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 4 }}>🗂️ ¿Qué tan detallada es la clasificación? (Nivel)</div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>
                        El sistema clasifica cada gasto en 5 niveles, de lo más general a lo más específico.
                    </div>
                    {por_nivel.map((n) => (
                        <div key={n.nivel} style={{ marginBottom: 9, fontSize: 11.5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                                <strong>Nivel {n.nivel}</strong>
                                <span style={{ color: '#64748b' }}>{n.n_conceptos} conceptos · {fmtMoney(n.devengado)} devengado</span>
                            </div>
                            <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{NIVEL_DESC[n.nivel] || ''}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 4 }}>🔀 Otra forma de clasificar el gasto (Nivel Cruce / Catálogo Cruce)</div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>
                    SIGFE también clasifica cada gasto con una segunda "etiqueta" cruzada, independiente del Concepto Presupuestario — sirve para verificar el gasto desde otro ángulo. El monto es lo devengado en esa etiqueta.
                </div>
                <BarraSimple
                    rows={por_cruce.slice(0, 10).map((c) => ({
                        lbl: `${c.catalogo_cruce} (${c.nivel_cruce})`, val: c.devengado,
                        sub: `Efectivo pagado: ${fmtMoney(c.efectivo)}`,
                    }))}
                    color="#9333EA"
                />
            </div>
        </div>
    );
}
