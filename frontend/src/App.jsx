/**
 * @file src/App.jsx
 * @description Router principal de la aplicación.
 *
 * Arquitectura Feature-Driven — Rutas protegidas por roles.
 *
 * Estructura de rutas:
 *  /login                       → Pública
 *  /                            → Protegida → AppLayout > Home
 *  /licitaciones                → Protegida → AppLayout > Dashboard
 *  /abastecimiento/*            → Protegida (rol: admin, abastecimiento, general)
 *  /finanzas/*                  → Protegida (rol: admin, finanzas, general)
 *  /anexo1/base-datos           → Protegida (rol: admin, finanzas, general)
 *  /anexo3/reporte-sigfe        → Protegida (rol: admin, finanzas, general) — único reporte Anexo N°3, el viejo AnexoDeudaPage se eliminó
 *  /admin/usuarios              → Protegida (rol: admin)
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';

// Store
import { AuthProvider, useAuth } from './store/authStore';
// Layout compartido
import { AppLayout } from './components/ui/AppLayout';

// Páginas existentes (compatibilidad hacia atrás)
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import { LoginPage } from './features/auth/pages/LoginPage';
import OrdenesCompraDashboard from './pages/OrdenesCompraDashboard';

// Rutas de features
import { abastecimientoRoutes } from './features/abastecimiento/routes';
import { finanzasRoutes } from './features/finanzas/routes';
import { pacRoutes } from './features/pac/routes';
import { pacCumplimientoRoutes } from './features/pac-cumplimiento/routes';
import { fscOcPacRoutes } from './features/fsc-oc-pac/routes';
import { compraAgilRoutes } from './features/compra-agil/routes';
import { perfilRoute, adminUsuariosRoute } from './features/usuarios/routes';
import { devengoSigfeRoutes } from './features/devengo-sigfe/routes';
import { anexo1SigfeRoutes } from './features/anexo1-sigfe/routes';
import { facturasRoutes } from './features/facturas/routes';

// ─── Guards ───────────────────────────────────────────────────────────────────

/** Redirige al login si no está autenticado */
const RequireAuth = () => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

/** Permite acceso solo a ciertos roles */
const RequireRole = ({ allowed = [], children }) => {
  const { role } = useAuth();
  if (!allowed.includes(role)) return <Navigate to="/" replace />;
  return children || <Outlet />;
};

// ─── App ─────────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      {/* Ruta pública */}
      <Route path="/login" element={<LoginPage />} />

      {/* Rutas protegidas: requieren autenticación */}
      <Route element={<RequireAuth />}>
          {/* Layout principal con Sidebar */}
          <Route element={<AppLayout />}>

            {/* Rutas generales */}
            <Route path="/" element={<Home />} />
            <Route path="/licitaciones" element={<Dashboard />} />
            <Route path="/ordenes-compra" element={<OrdenesCompraDashboard />} />
            {/* Módulo PAC (todos los autenticados) */}
            {pacRoutes}
            {/* Módulo PAC — Cumplimiento del Plan Anual de Compras (todos los autenticados) */}
            {pacCumplimientoRoutes}
            {/* Módulo Compra Ágil (todos los autenticados) */}
            {compraAgilRoutes}

            {/* Módulo Abastecimiento (admin + abastecimiento + general) */}
            <Route element={<RequireRole allowed={['admin', 'abastecimiento', 'general']} />}>
              {abastecimientoRoutes}
              {fscOcPacRoutes}
            </Route>

            {/* Módulo Finanzas (admin + finanzas + general) */}
            <Route element={<RequireRole allowed={['admin', 'finanzas', 'general']} />}>
              {finanzasRoutes}
              {devengoSigfeRoutes}
              {anexo1SigfeRoutes}
              {facturasRoutes}
            </Route>

            {/* Perfil propio — todos los autenticados */}
            {perfilRoute}

            {/* Gestión de usuarios — solo admin */}
            <Route element={<RequireRole allowed={['admin']} />}>
              {adminUsuariosRoute}
            </Route>

          </Route>
      </Route>

      {/* Fallback: redirige cualquier ruta no encontrada al inicio */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter basename="/gestion-sso">
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
