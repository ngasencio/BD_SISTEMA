import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getJefaturaActividad } from '../../api/comprasApi';
import { tipoLabel, estadoLabel, colorPorTipo } from '../../constants/estadosProceso';

const INTERVALO_POLLING_MS = 25000;

const TIPO_ICONO = { CAMBIO_ESTADO: '🔄', OC_VINCULADA: '📦', PROCESO_NUEVO: '🆕' };

function textoEvento(e) {
    const quien = e.usuario_nombre || e.comprador_nombre;
    if (e.tipo === 'PROCESO_NUEVO') {
        return <>{quien} clasificó <strong>"{e.titulo}"</strong> como {tipoLabel(e.tipo_proceso)}.</>;
    }
    if (e.tipo === 'OC_VINCULADA') {
        return <>{quien} vinculó la OC <strong>{e.codigo_oc}</strong> a <strong>"{e.titulo}"</strong>.</>;
    }
    // CAMBIO_ESTADO
    if (e.estado_anterior !== e.estado_nuevo) {
        return <>{quien} cambió <strong>"{e.titulo}"</strong> a <strong>{estadoLabel(e.estado_nuevo)}</strong>.</>;
    }
    return <>{quien} comentó en <strong>"{e.titulo}"</strong>.</>;
}

function tiempoRelativo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.floor(h / 24)} d`;
}

function EventoRow({ e }) {
    const color = colorPorTipo(e.tipo_proceso);
    return (
        <div style={{
            display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8,
            background: '#f8fafc', border: '1px solid #e2e8f0',
        }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{TIPO_ICONO[e.tipo] || '🔔'}</span>
            <div style={{ flex: '1 1 0%', minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: '#1e293b' }}>{textoEvento(e)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '1px 8px', borderRadius: 20,
                        background: color + '1f', color,
                    }}>
                        {e.comprador_nombre}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{tiempoRelativo(e.fecha)}</span>
                </div>
                {e.comentario && (
                    <div style={{ fontSize: 11.5, color: '#475569', fontStyle: 'italic', marginTop: 4 }}>
                        "{e.comentario}"
                    </div>
                )}
            </div>
        </div>
    );
}

// Feed de últimos movimientos (Tab General del Panel Formularios). Polling
// incremental: cada tick pide solo eventos posteriores al más reciente ya
// mostrado (?desde=) en vez de re-traer todo el feed — importante porque
// "cada vez llegarán más formularios" (pedido explícito del usuario).
export default function FeedActividad() {
    const [eventos, setEventos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const ultimaFechaRef = useRef(null);

    const cargarInicial = useCallback(() => {
        setCargando(true);
        getJefaturaActividad({ limit: 50 })
            .then(({ data }) => {
                setEventos(data);
                if (data.length) ultimaFechaRef.current = data[0].fecha;
            })
            .catch(() => setEventos([]))
            .finally(() => setCargando(false));
    }, []);

    useEffect(() => { cargarInicial(); }, [cargarInicial]);

    useEffect(() => {
        const id = setInterval(() => {
            if (!ultimaFechaRef.current) return;
            getJefaturaActividad({ desde: ultimaFechaRef.current, limit: 50 })
                .then(({ data }) => {
                    if (!data.length) return;
                    ultimaFechaRef.current = data[0].fecha;
                    setEventos((prev) => [...data, ...prev].slice(0, 100));
                })
                .catch(() => {});
        }, INTERVALO_POLLING_MS);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>🗞️ Últimos Movimientos</div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 12 }}>
                Cambios de estado, comentarios y Órdenes de Compra vinculadas por los compradores — se actualiza solo.
            </div>
            {cargando ? (
                <div className="loading-spinner">Cargando…</div>
            ) : eventos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 10px', color: '#94a3b8', fontSize: 12.5 }}>
                    Sin movimientos registrados todavía.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
                    {eventos.map((e, i) => <EventoRow key={`${e.tipo}-${e.proceso_id}-${e.fecha}-${i}`} e={e} />)}
                </div>
            )}
        </div>
    );
}
