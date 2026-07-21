const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtB = (n) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return fmt(n);
};
const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

const scoreColor = (score) => (score >= 70 ? '#15803d' : score >= 40 ? '#b45309' : '#dc2626');

const ESTADO_TEMPORAL_LABEL = {
    EN_FECHA: { label: '✅ En fecha', color: '#15803d' },
    ATRASADO: { label: '⏰ Atrasado', color: '#dc2626' },
};

function FilaDepto({ f, pos }) {
    return (
        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '8px 10px', color: '#94a3b8', fontWeight: 700 }}>{pos}</td>
            <td style={{ padding: '8px 10px' }}>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>{f.nombre}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{f.subdireccion}</div>
            </td>
            <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtN(f.total)}</td>
            <td style={{ padding: '8px 10px', textAlign: 'right' }}>{f.pct_dentro}%</td>
            <td style={{ padding: '8px 10px', textAlign: 'right' }}>{f.pct_en_fecha ?? '—'}{f.pct_en_fecha != null ? '%' : ''}</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: scoreColor(f.score) }}>{f.score}</td>
        </tr>
    );
}

function FilaFormulario({ f, pos }) {
    const estado = ESTADO_TEMPORAL_LABEL[f.estado_temporal];
    return (
        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '8px 10px', color: '#94a3b8', fontWeight: 700 }}>{pos}</td>
            <td style={{ padding: '8px 10px' }}>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>Folio {f.folio}/{f.anho} — {f.unidad_requirente}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.requerimiento}>{f.requerimiento}</div>
            </td>
            <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtB(f.monto_estimado)}</td>
            <td style={{ padding: '8px 10px' }}>
                <span style={{ color: f.dentro_fuera_pac === 'DENTRO' ? '#15803d' : '#dc2626', fontWeight: 600 }}>
                    {f.dentro_fuera_pac === 'DENTRO' ? '✅ Dentro' : '⛔ Fuera'}
                </span>
            </td>
            <td style={{ padding: '8px 10px', color: estado?.color ?? '#94a3b8' }}>{estado?.label ?? '—'}</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: scoreColor(f.score) }}>{f.score}</td>
        </tr>
    );
}

function Tabla({ titulo, filas, tipo, colorBorde }) {
    const cols = tipo === 'depto'
        ? ['#', 'Departamento', 'Total', '% Dentro', '% En fecha', 'Score']
        : ['#', 'Formulario', 'Monto', 'Dentro/Fuera', 'Estado temporal', 'Score'];
    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: '1 1 420px', borderTop: `4px solid ${colorBorde}` }}>
            <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#374151' }}>{titulo}</div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {cols.map((h) => (
                                <th key={h} style={{ padding: '7px 10px', textAlign: h === '#' || h === 'Departamento' || h === 'Formulario' ? 'left' : 'right', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filas.length === 0 && (
                            <tr><td colSpan={cols.length} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Sin datos suficientes.</td></tr>
                        )}
                        {filas.map((f, i) => tipo === 'depto'
                            ? <FilaDepto key={`${f.nombre}-${i}`} f={f} pos={i + 1} />
                            : <FilaFormulario key={`${f.folio}-${f.anho}-${i}`} f={f} pos={i + 1} />)}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function RankingsTab({ rankings, rankingTipo, onChangeTipo }) {
    const mejores = rankings?.mejores ?? [];
    const peores = rankings?.peores ?? [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Rankear por:</span>
                <button
                    className={`tab-btn ${rankingTipo === 'depto' ? 'active' : ''}`}
                    onClick={() => onChangeTipo('depto')}
                >
                    🏛️ Departamento
                </button>
                <button
                    className={`tab-btn ${rankingTipo === 'formulario' ? 'active' : ''}`}
                    onClick={() => onChangeTipo('formulario')}
                >
                    📄 Formulario
                </button>
            </div>

            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Score compuesto: 40% % Dentro PAC + 40% % cumplimiento temporal + 20% % Dentro PAC ponderado por monto.
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <Tabla titulo="🏆 Mejores" filas={mejores} tipo={rankingTipo} colorBorde="#16a34a" />
                <Tabla titulo="⚠️ Peores" filas={peores} tipo={rankingTipo} colorBorde="#dc2626" />
            </div>
        </div>
    );
}
