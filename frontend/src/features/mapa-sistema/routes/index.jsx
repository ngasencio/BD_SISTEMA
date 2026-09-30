import React from 'react';
import { Route } from 'react-router-dom';
import MapaSistemaPage from '../components/MapaSistemaPage';

export const mapaSistemaRoutes = (
    <Route path="/mapa-sistema" element={<MapaSistemaPage />} />
);
