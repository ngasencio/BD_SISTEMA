/**
 * @file features/compras/routes/index.jsx
 * @description Rutas del módulo Gestión de Compras (lazy loaded).
 */
import React, { lazy, Suspense } from 'react';
import { Route } from 'react-router-dom';

const MisFormulariosPage = lazy(() => import('../components/MisFormulariosPage'));
const PanelFormulariosPage = lazy(() => import('../components/PanelFormulariosPage'));

const Loading = () => <div className="loading-spinner">Cargando módulo...</div>;

export const comprasRoutes = (
    <>
        <Route
            path="/compras/mis-formularios"
            element={<Suspense fallback={<Loading />}><MisFormulariosPage /></Suspense>}
        />
    </>
);

// Separado de comprasRoutes porque su guard de rol es distinto (sin
// 'comprador' — ver App.jsx): este panel es de supervisión de jefatura,
// no la bandeja de trabajo individual.
export const comprasJefaturaRoutes = (
    <>
        <Route
            path="/compras/panel-formularios"
            element={<Suspense fallback={<Loading />}><PanelFormulariosPage /></Suspense>}
        />
    </>
);
