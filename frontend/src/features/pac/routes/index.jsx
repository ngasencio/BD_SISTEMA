import React from 'react';
import { Route } from 'react-router-dom';
import PacDashboardPage from '../components/PacDashboardPage';

export const pacRoutes = (
    <Route path="/pac" element={<PacDashboardPage />} />
);
