/**
 * @file features/compras/routes/index.jsx
 * @description Rutas del módulo Gestión de Compras (lazy loaded).
 */
import React, { lazy, Suspense } from 'react';
import { Route } from 'react-router-dom';

const MisFormulariosPage = lazy(() => import('../components/MisFormulariosPage'));

const Loading = () => <div className="loading-spinner">Cargando módulo...</div>;

export const comprasRoutes = (
    <>
        <Route
            path="/compras/mis-formularios"
            element={<Suspense fallback={<Loading />}><MisFormulariosPage /></Suspense>}
        />
    </>
);
