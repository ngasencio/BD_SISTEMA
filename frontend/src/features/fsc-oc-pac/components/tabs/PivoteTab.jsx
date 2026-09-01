import { useMemo, useState } from 'react';
import { fmtN, ESTADO_LABEL } from '../../utils/format';

const ESTADOS_ORDEN = ['CONFIRMADO', 'PENDIENTE_MEDIA', 'PENDIENTE_BAJA', 'RECHAZADO_TOTAL', 'SIN_MATCH'];

export default function PivoteTab({ pivote }) {
    const [orden, setOrden] = useState('pct_desc');

    const filas = useMemo(() => {
        if (!pivote) return [];
        const conPct = pivote.map((row) => ({
            ...row,
            pct_confirmado: row.total ? Math.round(100 * (row.CONFIRMADO || 0) / row.total) : 0,
        }));
        return conPct.sort((a, b) => (orden === 'pct_desc' ? b.pct_confirmado - a.pct_confirmado : b.total - a.total));
    }, [pivote, orden]);

    if (!pivote) return null;
    if (!pivote.length) {
        return <div className="dv-footnote" style={{ textAlign: 'center', padding: 60 }}>Sin datos para el período seleccionado.</div>;
    }

    return (
        <div className="dv-panel">
            <div className="dv-panel__header" style={{ marginBottom: 12 }}>
                <div>
                    <h3 className="dv-panel__title">Cobertura por departamento</h3>
                    <p className="dv-panel__subtitle" style={{ marginBottom: 0 }}>Subdirección / Departamento raíz, con rollup de sub-departamentos.</p>
                </div>
                <div className="dv-segmented">
                    <button className={orden === 'pct_desc' ? 'is-active' : ''} onClick={() => setOrden('pct_desc')}>% enlazado</button>
                    <button className={orden === 'total_desc' ? 'is-active' : ''} onClick={() => setOrden('total_desc')}>Volumen</button>
                </div>
            </div>
            <div className="dv-table-scroll">
                <table className="dv-table">
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left' }}>Departamento</th>
                            {ESTADOS_ORDEN.map((e) => <th key={e}>{ESTADO_LABEL[e]}</th>)}
                            <th>Total</th>
                            <th>% Enlazado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map((row) => (
                            <tr key={row.departamento}>
                                <td style={{ textAlign: 'left', fontWeight: 600 }}>{row.departamento}</td>
                                {ESTADOS_ORDEN.map((e) => (
                                    <td key={e} style={{ color: row[e] ? 'var(--dv-ink)' : 'var(--dv-ink-4)' }}>{fmtN(row[e] || 0)}</td>
                                ))}
                                <td style={{ fontWeight: 600 }}>{fmtN(row.total)}</td>
                                <td style={{
                                    fontWeight: 700,
                                    color: row.pct_confirmado >= 70 ? 'var(--dv-ok)' : row.pct_confirmado >= 30 ? 'var(--dv-warn)' : 'var(--dv-ink-3)',
                                }}>
                                    {row.pct_confirmado}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
