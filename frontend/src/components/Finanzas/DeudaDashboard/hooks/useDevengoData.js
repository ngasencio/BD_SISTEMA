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
                let allData = [];
                let url = 'devengo/?page_size=1000';

                while (url) {
                    const res = await api.get(url);
                    const body = res.data;

                    if (Array.isArray(body)) {
                        allData = allData.concat(body);
                        url = null;
                    } else {
                        allData = allData.concat(body.results || []);
                        if (body.next) {
                            const match = body.next.match(/\/api\/(.*)/);
                            url = match ? match[1] : null;
                        } else {
                            url = null;
                        }
                    }
                }

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
