import { useState } from 'react';
import { getFormularioPacPorId } from '../../api/pacCumplimientoApi';
import TablaFormulariosPac from '../shared/TablaFormulariosPac';
import ModalRevisionFsc from '../shared/ModalRevisionFsc';
import { fmtN, fmtCompacto, colorPct } from '../../utils/format';

// `colorPct` sirve también para el "score" del ranking — misma escala 0-100 y mismos
// umbrales 70/40 que el % Dentro PAC (antes duplicado acá como `scoreColor`, fórmula
// idéntica salvo el nombre).
const ESTADO_TEMPORAL_LABEL = {
    EN_FECHA: { label: '✅ En fecha', color: '#15803d' },
    ATRASADO: { label: '⏰ Atrasado', color: '#dc2626' },
};

const TABLA_FORMULARIOS_ID = 'rankings-tabla-formularios';

function KpiCard({ label, value, sub, color }) {
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '14px 18px',
            border: '1px solid #e2e8f0', flex: '1 1 160px', minWidth: 140,
            borderTop: `4px solid ${color}`, boxShadow: '0 1px 2px rgba(15,23,42,.04)',
        }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', lineHeight: 1.25 }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
        </div>
    );
}

function BotonVerFormularios({ onClick, label }) {
    return (
        <button
            onClick={onClick}
            title="Ver formularios de este departamento"
            style={{ padding: '3px 9px', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 6, color: '#7c3aed', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
            {label || '🔍 Ver formularios'}
        </button>
    );
}

function FilaDepto({ f, pos, onVerFormularios }) {
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
            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: colorPct(f.score) }}>{f.score}</td>
            <td style={{ padding: '8px 10px' }}>
                <BotonVerFormularios onClick={() => onVerFormularios(f)} />
            </td>
        </tr>
    );
}

function FilaFormulario({ f, pos, onRevisar }) {
    const estado = ESTADO_TEMPORAL_LABEL[f.estado_temporal];
    return (
        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '8px 10px', color: '#94a3b8', fontWeight: 700 }}>{pos}</td>
            <td style={{ padding: '8px 10px' }}>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>Folio {f.folio}/{f.anho} — {f.unidad_requirente}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.requerimiento}>{f.requerimiento}</div>
            </td>
            <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtCompacto(f.monto_estimado)}</td>
            <td style={{ padding: '8px 10px' }}>
                <span style={{ color: f.dentro_fuera_pac === 'DENTRO' ? '#15803d' : '#dc2626', fontWeight: 600 }}>
                    {f.dentro_fuera_pac === 'DENTRO' ? '✅ Dentro' : '⛔ Fuera'}
                </span>
            </td>
            <td style={{ padding: '8px 10px', color: estado?.color ?? '#94a3b8' }}>{estado?.label ?? '—'}</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: colorPct(f.score) }}>{f.score}</td>
            <td style={{ padding: '8px 10px' }}>
                <BotonVerFormularios onClick={() => onRevisar(f)} label="🔍 Revisar" />
            </td>
        </tr>
    );
}

function Tabla({ titulo, filas, tipo, colorBorde, onVerFormularios, onRevisar }) {
    const cols = tipo === 'depto'
        ? ['#', 'Departamento', 'Total', '% Dentro', '% En fecha', 'Score', '']
        : ['#', 'Formulario', 'Monto', 'Dentro/Fuera', 'Estado temporal', 'Score', ''];
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
                            ? <FilaDepto key={`${f.nombre}-${i}`} f={f} pos={i + 1} onVerFormularios={onVerFormularios} />
                            : <FilaFormulario key={`${f.id ?? f.folio}-${f.anho}-${i}`} f={f} pos={i + 1} onRevisar={onRevisar} />)}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function RankingsTab({ rankings, rankingTipo, onChangeTipo, anho }) {
    const [filtroOrg, setFiltroOrg] = useState(null);
    const [modalFsc, setModalFsc] = useState(null);
    const [cargandoRevisar, setCargandoRevisar] = useState(false);

    const mejores = rankings?.mejores ?? [];
    const peores = rankings?.peores ?? [];

    const onVerFormularios = (f) => {
        const ids = [f.depto_id, ...(f.subdepto_ids ?? [])].filter((id) => id != null);
        const sinClasificar = f.depto_id == null;
        setFiltroOrg({ ids, sinClasificar, label: f.nombre });
        requestAnimationFrame(() => {
            document.getElementById(TABLA_FORMULARIOS_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    const onRevisar = async (f) => {
        setCargandoRevisar(true);
        try {
            const { data } = await getFormularioPacPorId(f.id);
            setModalFsc(data);
        } catch (_) {
            // el formulario pudo haber sido reclasificado/eliminado desde la última sync
        } finally {
            setCargandoRevisar(false);
        }
    };

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
                {cargandoRevisar && <span style={{ fontSize: 11, color: '#94a3b8' }}>Cargando formulario…</span>}
            </div>

            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Score compuesto: 40% % Dentro PAC + 40% % cumplimiento temporal + 20% % Dentro PAC ponderado por monto.
            </div>

            {rankings && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <KpiCard label="Elementos evaluados" value={fmtN(rankings.total_elegibles)} color="#0ea5e9" sub={rankingTipo === 'depto' ? 'departamentos con muestra suficiente' : 'formularios del período'} />
                    <KpiCard label="Score promedio" value={rankings.score_promedio} color={colorPct(rankings.score_promedio)} />
                    <KpiCard label="🏆 Mejor score" value={mejores[0]?.score ?? '—'} color="#16a34a" sub={rankingTipo === 'depto' ? mejores[0]?.nombre : mejores[0] ? `Folio ${mejores[0].folio}/${mejores[0].anho}` : undefined} />
                    <KpiCard label="⚠️ Peor score" value={peores[0]?.score ?? '—'} color="#dc2626" sub={rankingTipo === 'depto' ? peores[0]?.nombre : peores[0] ? `Folio ${peores[0].folio}/${peores[0].anho}` : undefined} />
                </div>
            )}

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <Tabla titulo="🏆 Mejores" filas={mejores} tipo={rankingTipo} colorBorde="#16a34a" onVerFormularios={onVerFormularios} onRevisar={onRevisar} />
                <Tabla titulo="⚠️ Peores" filas={peores} tipo={rankingTipo} colorBorde="#dc2626" onVerFormularios={onVerFormularios} onRevisar={onRevisar} />
            </div>

            <TablaFormulariosPac
                anho={anho}
                sectionId={TABLA_FORMULARIOS_ID}
                filtroOrg={filtroOrg}
                onClearFiltroOrg={() => setFiltroOrg(null)}
            />

            <ModalRevisionFsc formulario={modalFsc} onCerrar={() => setModalFsc(null)} />
        </div>
    );
}
