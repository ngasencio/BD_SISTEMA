import { useState, useEffect, useCallback } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { getFscOcLinks } from '../../api/fscOcPacApi';
import { ESTADO_LABEL, ESTADO_CHIP, CONFIANZA_LABEL, CONFIANZA_CHIP, PAC_ESTADO_LABEL, PAC_ESTADO_CHIP } from '../../utils/format';
import Chip from '../Chip';
import DetalleFscModal from '../DetalleFscModal';
import DetalleOcModal from '../DetalleOcModal';

const PAGE_SIZE = 50;

export default function DetalleTab({ anho }) {
    const [rows, setRows] = useState([]);
    const [count, setCount] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [estado, setEstado] = useState('');
    const [confianza, setConfianza] = useState('');
    const [verFscId, setVerFscId] = useState(null);
    const [verOc, setVerOc] = useState(null);

    const fetchPage = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                page, page_size: PAGE_SIZE,
                ...(anho ? { formulario_derivado__anho: anho } : {}),
                ...(estado ? { estado } : {}),
                ...(confianza ? { confianza } : {}),
            };
            const { data } = await getFscOcLinks(params);
            setRows(data.results ?? data);
            setCount(data.count ?? (data.results ?? data).length);
        } finally {
            setLoading(false);
        }
    }, [page, anho, estado, confianza]);

    useEffect(() => { fetchPage(); }, [fetchPage]);
    useEffect(() => { setPage(1); }, [anho, estado, confianza]);

    const columns = [
        { key: 'id_formulario', label: 'FSC' },
        { key: 'unidad_requirente', label: 'Unidad Requirente' },
        { key: 'orden_compra', label: 'OC' },
        { key: 'nombre_oc', label: 'Nombre OC' },
        { key: 'confianza', label: 'Confianza', render: (v) => <Chip variant={CONFIANZA_CHIP[v]}>{CONFIANZA_LABEL[v] || v}</Chip> },
        { key: 'estado', label: 'Estado', render: (v) => <Chip variant={v === 'CONFIRMADO' ? 'ok' : v === 'RECHAZADO' ? 'none' : 'watch'}>{ESTADO_LABEL[v] || v}</Chip> },
        {
            key: 'pac_estado', label: 'Estado PAC',
            render: (v) => (v ? <Chip variant={PAC_ESTADO_CHIP[v]}>{PAC_ESTADO_LABEL[v]}</Chip> : '—'),
        },
        {
            key: 'id', label: 'Ver',
            render: (_v, row) => (
                <div style={{ display: 'flex', gap: 4 }}>
                    <button className="dv-btn dv-btn--sm" onClick={() => setVerFscId(row.formulario_derivado)}>FSC</button>
                    {row.orden_compra && (
                        <button className="dv-btn dv-btn--sm" onClick={() => setVerOc(row.orden_compra)}>OC</button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10 }}>
                <select className="dv-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
                    <option value="">Todos los estados</option>
                    <option value="SUGERIDO">Sugerido</option>
                    <option value="CONFIRMADO">Confirmado</option>
                    <option value="RECHAZADO">Rechazado</option>
                </select>
                <select className="dv-select" value={confianza} onChange={(e) => setConfianza(e.target.value)}>
                    <option value="">Toda confianza</option>
                    <option value="ALTA">Alta</option>
                    <option value="MEDIA">Media</option>
                    <option value="BAJA_SUGERIDA">Baja (sugerida)</option>
                    <option value="MANUAL">Manual</option>
                </select>
            </div>
            <div className="dv-panel" style={{ padding: 0, overflow: 'hidden' }}>
                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    page={page}
                    totalCount={count}
                    pageSize={PAGE_SIZE}
                    onPageChange={setPage}
                />
            </div>

            <DetalleFscModal fscId={verFscId} onCerrar={() => setVerFscId(null)} onVerOc={setVerOc} />
            <DetalleOcModal codigoOc={verOc} onCerrar={() => setVerOc(null)} onVerFsc={setVerFscId} onCorregido={fetchPage} />
        </div>
    );
}
