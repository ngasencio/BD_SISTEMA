/**
 * @file features/gestor-compras/routes/index.jsx
 * @description Ruta del módulo Gestor de Compras (lazy loaded). El guard de rol
 * (admin, gestor_compras, jefatura, general) se aplica en App.jsx.
 */
import React, { lazy, Suspense } from 'react';
import { Route } from 'react-router-dom';

const GestorComprasPage = lazy(() => import('../components/GestorComprasPage'));

const Loading = () => <div className="loading-spinner">Cargando módulo...</div>;

export const gestorComprasRoutes = (
    <Route
        path="/gestor-compras"
        element={<Suspense fallback={<Loading />}><GestorComprasPage /></Suspense>}
    />
);
