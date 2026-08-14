import React from 'react';
import { Route } from 'react-router-dom';
import FacturasPage from '../components/FacturasPage';

export const facturasRoutes = (
    <Route path="/facturas" element={<FacturasPage />} />
);
