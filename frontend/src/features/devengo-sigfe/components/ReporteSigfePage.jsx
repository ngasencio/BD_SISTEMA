import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchReporteSigfeHtml, iniciarActualizacionSigfe, estadoActualizacionSigfe, cancelarActualizacionSigfe } from '../api/devengoSigfeApi';
import ModalActualizarSigfe from './ModalActualizarSigfe';
import BannerActualizacionSigfe from './BannerActualizacionSigfe';
import PanelCambiosSigfe from './PanelCambiosSigfe';

export default function ReporteSigfePage() {
    const [estado, setEstado] = useState('cargando'); // cargando | listo | error
    const [error, setError] = useState(null);
    const [iframeListo, setIframeListo] = useState(false);
    // 'reciente' (año actual + anterior, default — mucho más liviano) | 'completo' (todo el histórico)
    const [rango, setRango] = useState('reciente');
    const iframeRef = useRef(null);
    const blobUrlRef = useRef(null);

    // ETL: modal de credenciales/fechas, banner de progreso, panel de cambios
    const [modalAbierto, setModalAbierto] = useState(false);
    const [iniciando, setIniciando] = useState(false);
    const [tarea, setTarea] = useState(null);
    const [panelCambios, setPanelCambios] = useState(null);
    const pollingRef = useRef(null);

    const cargarReporte = useCallback(async () => {
        setEstado('cargando');
        setError(null);
        setIframeListo(false);
        try {
            const { data: html } = await fetchReporteSigfeHtml(rango);

            // Blob + object URL en vez de iframe.srcDoc: el reporte trae
            // decenas de miles de registros inyectados (varios MB de HTML),
            // y srcDoc duplica esa cadena en memoria del documento padre.
            // El blob hereda el origen de la página padre, así que
            // iframeRef.current.contentWindow.exportExcel()/openPdfModal()
            // (definidas dentro del reporte) son accesibles sin problema de CORS.
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;
            if (iframeRef.current) iframeRef.current.src = url;
            setEstado('listo');
        } catch (err) {
            setError(err.response?.data?.detail || 'No se pudo cargar el reporte.');
            setEstado('error');
        }
    }, [rango]);

    // Los botones Excel/PDF quedan habilitados recién cuando el iframe
    // terminó de cargar Y de ejecutar su propio script de inicialización
    // (que define exportExcel/openPdfModal en su contentWindow) — no basta
    // con que "estado" sea 'listo', eso solo indica que el fetch del HTML
    // terminó, no que el documento del iframe ya se haya montado y corrido.
    const handleIframeLoad = () => setIframeListo(true);

    const handleExportExcel = () => {
        iframeRef.current?.contentWindow?.exportExcel?.();
    };

    const handleExportPdf = () => {
        iframeRef.current?.contentWindow?.openPdfModal?.();
    };

    useEffect(() => {
        cargarReporte();
        return () => {
            clearInterval(pollingRef.current);
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        };
    }, [cargarReporte]);

    const iniciarPolling = useCallback((taskId) => {
        clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
            try {
                const { data } = await estadoActualizacionSigfe(taskId);
                setTarea(data);
                if (['completado', 'error', 'cancelado'].includes(data.status)) {
                    clearInterval(pollingRef.current);
                    if (data.status === 'completado') {
                        cargarReporte(); // trae los documentos recién sincronizados
                        if (data.diff) setPanelCambios(data.diff);
                    }
                }
            } catch {
                clearInterval(pollingRef.current);
            }
        }, 3000);
    }, [cargarReporte]);

    const handleConfirmarActualizar = async ({ usuario, password, fechaDesde, fechaHasta, visible }) => {
        setModalAbierto(false);
        if (iniciando) return;
        setIniciando(true);
        try {
            const { data } = await iniciarActualizacionSigfe({ usuario, password, fechaDesde, fechaHasta, visible });
            setTarea({ status: 'iniciado', task_id: data.task_id, paso: 0, paso_desc: 'Iniciando...', progreso_pct: 0, logs_recientes: [] });
            iniciarPolling(data.task_id);
        } catch (err) {
            alert(err.response?.data?.error || 'Error al iniciar la actualización.');
        } finally {
            setIniciando(false);
        }
    };

    const handleCancelar = async () => {
        if (!tarea?.task_id) return;
        try {
            await cancelarActualizacionSigfe(tarea.task_id);
        } catch {
            // ignorar — el próximo poll (o el estado forzado abajo) refleja el estado real
        }
        clearInterval(pollingRef.current);
        setTarea(prev => ({ ...prev, status: 'cancelado', paso_desc: 'Cancelado por el usuario.' }));
    };

    const enProceso = tarea && (tarea.status === 'en_proceso' || tarea.status === 'iniciado');

    return (
        <div className="feature-page" style={{ height: 'calc(100vh - 88px)', display: 'flex', flexDirection: 'column' }}>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div className="page-title"><span className="page-title-icon">🌳</span> Anexo N°3 — Reporte Jerárquico SIGFE</div>
                    <div className="page-subtitle">
                        Árbol presupuestario (Subtítulo → Ítem → Asignación → Sub-asignación → Detalle) sobre el histórico
                        consolidado de devengos SIGFE
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                        value={rango}
                        onChange={(e) => setRango(e.target.value)}
                        disabled={estado === 'cargando'}
                        title="El histórico completo pesa varias veces más y puede tardar más en cargar"
                        style={{
                            padding: '9px 10px', background: '#fff', color: '#334155',
                            border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontWeight: 600,
                            cursor: estado === 'cargando' ? 'not-allowed' : 'pointer',
                        }}
                    >
                        <option value="reciente">Año actual + anterior</option>
                        <option value="completo">Histórico completo</option>
                    </select>
                    <button
                        onClick={handleExportExcel}
                        disabled={!iframeListo}
                        title={iframeListo ? '' : 'Esperando que el reporte termine de cargar...'}
                        style={{
                            padding: '9px 14px', background: '#fff', color: '#334155',
                            border: '1px solid #cbd5e1', borderRadius: 8, cursor: iframeListo ? 'pointer' : 'not-allowed',
                            opacity: iframeListo ? 1 : 0.5, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                        }}
                    >
                        ⬇ Excel
                    </button>
                    <button
                        onClick={handleExportPdf}
                        disabled={!iframeListo}
                        title={iframeListo ? '' : 'Esperando que el reporte termine de cargar...'}
                        style={{
                            padding: '9px 14px', background: '#fff', color: '#334155',
                            border: '1px solid #cbd5e1', borderRadius: 8, cursor: iframeListo ? 'pointer' : 'not-allowed',
                            opacity: iframeListo ? 1 : 0.5, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                        }}
                    >
                        📄 Exportar PDF
                    </button>
                    <button
                        onClick={() => setModalAbierto(true)}
                        disabled={iniciando || enProceso}
                        style={{
                            padding: '9px 16px', background: enProceso ? '#94a3b8' : '#0ea5e9', color: '#fff',
                            border: 'none', borderRadius: 8, cursor: (iniciando || enProceso) ? 'not-allowed' : 'pointer',
                            fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                        }}
                    >
                        {enProceso ? '⚙️ Actualizando...' : '🔄 Actualizar desde SIGFE'}
                    </button>
                </div>
            </div>

            {estado === 'cargando' && (
                <div className="loading-spinner">
                    Cargando reporte (puede tardar unos segundos)…
                </div>
            )}
            {estado === 'error' && (
                <div className="error-message">{error}</div>
            )}

            <iframe
                ref={iframeRef}
                title="Anexo N°3 — Reporte Jerárquico SIGFE"
                onLoad={handleIframeLoad}
                style={{ flex: 1, width: '100%', border: 'none', display: estado === 'listo' ? 'block' : 'none' }}
            />

            {modalAbierto && (
                <ModalActualizarSigfe onConfirmar={handleConfirmarActualizar} onCerrar={() => setModalAbierto(false)} />
            )}
            {panelCambios && (
                <PanelCambiosSigfe diff={panelCambios} onCerrar={() => setPanelCambios(null)} />
            )}
            <BannerActualizacionSigfe
                tarea={tarea}
                onCerrar={() => { clearInterval(pollingRef.current); setTarea(null); }}
                onCancelar={handleCancelar}
            />
        </div>
    );
}
