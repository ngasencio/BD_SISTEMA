/**
 * @file features/finanzas/routes/index.jsx
 * @description Rutas del módulo Finanzas.
 */
import React, { lazy, Suspense } from 'react';
import { Route } from 'react-router-dom';

const FinanzasDashboard = lazy(() =>
    import('../components/FinanzasDashboard').then(m => ({ default: m.FinanzasDashboard }))
);

const Loading = () => <div className="loading-spinner">Cargando módulo...</div>;

export const finanzasRoutes = (
    <>
        <Route
            path="/finanzas/dashboard"
            element={<Suspense fallback={<Loading />}><FinanzasDashboard /></Suspense>}
        />
    </>
);
