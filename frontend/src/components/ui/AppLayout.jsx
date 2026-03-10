/**
 * @file components/ui/AppLayout.jsx
 * @description Layout principal de la aplicación: Sidebar + contenido principal.
 * Envuelve todas las rutas protegidas.
 */
import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const AppLayout = () => {
    return (
        <div className="app-shell">
            <Sidebar />
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
};
