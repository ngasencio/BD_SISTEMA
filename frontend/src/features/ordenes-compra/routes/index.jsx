import React from 'react';
import { Route } from 'react-router-dom';
import OCDashboardPage from '../components/OCDashboardPage';

export const ocRoutes = (
    <Route path="/ordenes-compra-v2" element={<OCDashboardPage />} />
);
