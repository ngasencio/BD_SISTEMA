/**
 * @file features/auth/routes/index.jsx
 * @description Rutas del módulo de autenticación.
 */
import React from 'react';
import { Route } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';

export const authRoutes = (
    <Route path="/login" element={<LoginPage />} />
);
