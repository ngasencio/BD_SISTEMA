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
 *  /anexo3                      → Protegida → AppLayout > AnexoDeudaPage
 *  /abastecimiento/dashboard    → Protegida (rol: admin, abastecimiento)
 *  /abastecimiento/fsc          → Protegida (rol: admin, abastecimiento)
 *  /finanzas/dashboard          → Protegida (rol: admin, finanzas)
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
import AnexoDeudaPage from './pages/AnexoDeudaPage';
import OrdenesCompraDashboard from './pages/OrdenesCompraDashboard';

// Rutas de features
import { abastecimientoRoutes } from './features/abastecimiento/routes';
import { finanzasRoutes } from './features/finanzas/routes';

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
          <Route path="/anexo3" element={<AnexoDeudaPage />} />
          <Route path="/ordenes-compra" element={<OrdenesCompraDashboard />} />

          {/* Módulo Abastecimiento (admin + abastecimiento + viewer) */}
          <Route element={<RequireRole allowed={['admin', 'abastecimiento', 'viewer']} />}>
            {abastecimientoRoutes}
          </Route>

          {/* Módulo Finanzas (admin + finanzas) */}
          <Route element={<RequireRole allowed={['admin', 'finanzas']} />}>
            {finanzasRoutes}
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
    <BrowserRouter basename="/bd_sistema">
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
