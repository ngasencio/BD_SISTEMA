import React from 'react';
import { Route } from 'react-router-dom';
import UsuariosPage from '../components/UsuariosPage';
import PerfilPage   from '../components/PerfilPage';

/** /perfil — todos los usuarios autenticados */
export const perfilRoute = (
    <Route path="/perfil" element={<PerfilPage />} />
);

/** /admin/usuarios — solo admin (debe estar dentro de RequireRole) */
export const adminUsuariosRoute = (
    <Route path="/admin/usuarios" element={<UsuariosPage />} />
);
