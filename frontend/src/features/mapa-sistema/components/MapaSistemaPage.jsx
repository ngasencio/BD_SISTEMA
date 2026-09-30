import React, { useEffect, useState } from 'react';

/**
 * Mapa 3D interactivo de la arquitectura del sistema.
 * El HTML se genera desde docs/arquitectura/graph.json (ver build_graph.py)
 * y se copia a frontend/public/mapa-sistema-content.html — no se edita a mano.
 */
export default function MapaSistemaPage() {
    const [html, setHtml] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const url = `${import.meta.env.BASE_URL}mapa-sistema-content.html`;
        fetch(url)
            .then((res) => {
                if (!res.ok) throw new Error(`No se pudo cargar el mapa (${res.status})`);
                return res.text();
            })
            .then(setHtml)
            .catch((err) => setError(err.message || 'Error al cargar el mapa.'));
    }, []);

    return (
        <div className="feature-page" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 88px)' }}>
            <div className="page-header">
                <div className="page-title">
                    <span className="page-title-icon">🗺️</span> Mapa del Sistema
                </div>
                <div className="page-subtitle">
                    Cómo están conectados los módulos, la base de datos y las fuentes externas — pasa el mouse o haz clic sobre un nodo para ver el detalle.
                </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            {!error && (
                <iframe
                    title="Mapa del sistema"
                    srcDoc={html || ''}
                    style={{ flex: 1, width: '100%', border: 'none', borderRadius: 10, minHeight: 480 }}
                />
            )}
        </div>
    );
}
