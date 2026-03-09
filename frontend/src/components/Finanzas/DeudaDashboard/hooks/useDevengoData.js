import { useState, useEffect } from 'react';
import api from '../../../../api';

export function useDevengoData() {
    const [rawData, setRawData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const normalizeData = (data) => {
        return data.map(r => ({
            ue: r.codigo_ue || '',
            prov: r.principal || '',
            td: r.tipo_documento || '',
            fc: r.fecha_conforme || '',
            cc: r.id_chile_compra ? 1 : 0,
            c01: r.catalogo_01 || '',
            c04: r.catalogo_04 || '',
            cp: r.concepto_presupuestario || '',
            n1: r.catalogo_02 || (r.concepto_presupuestario || '').split(' ').slice(0, 2).join(' '),
            v: parseFloat(r.monto_vigente) || 0,
            d: parseFloat(r.monto_disponible) || 0,
            c: parseFloat(r.monto_consumido) || 0,
        }));
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                // Llamamos directamente al endpoint optimizado sin paginación
                const res = await api.get('devengo/raw_all/');
                const allData = res.data || [];


                setRawData(normalizeData(allData));
            } catch (err) {
                setError('Error cargando datos: ' + (err.response?.data?.detail || err.message));
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    return { rawData, loading, error };
}
