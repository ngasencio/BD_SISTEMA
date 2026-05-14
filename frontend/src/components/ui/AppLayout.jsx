/**
 * @file components/ui/AppLayout.jsx
 * @description Layout principal de la aplicación: Sidebar + contenido principal.
 * Envuelve todas las rutas protegidas.
 */
import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../Sidebar';
import Topbar from '../Topbar';

export const AppLayout = () => {
    return (
        <div className="app-shell">
            <Topbar />
            <Sidebar />
            <main className="main">
                <div className="content">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};
