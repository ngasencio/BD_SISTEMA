/**
 * @file features/abastecimiento/routes/index.jsx
 * @description Rutas del módulo de Abastecimiento (lazy loaded).
 */
import React, { lazy, Suspense } from 'react';
import { Route } from 'react-router-dom';

const AbastecimientoDashboard = lazy(() =>
    import('../components/AbastecimientoDashboard').then(m => ({ default: m.AbastecimientoDashboard }))
);
const FSCManager = lazy(() =>
    import('../components/FSCManager').then(m => ({ default: m.FSCManager }))
);

const Loading = () => <div className="loading-spinner">Cargando módulo...</div>;

export const abastecimientoRoutes = (
    <>
        <Route
            path="/abastecimiento/dashboard"
            element={<Suspense fallback={<Loading />}><AbastecimientoDashboard /></Suspense>}
        />
        <Route
            path="/abastecimiento/fsc"
            element={<Suspense fallback={<Loading />}><FSCManager /></Suspense>}
        />
    </>
);
