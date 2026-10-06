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
 *  /abastecimiento/*            → Protegida (rol: admin, abastecimiento, comprador, general)
 *  /compras/mis-formularios     → Protegida (rol: admin, comprador, jefatura, general)
 *  /compras/panel-formularios   → Protegida (rol: admin, jefatura, general — SIN comprador)
 *  /gestor-compras              → Protegida (rol: admin, gestor_compras, jefatura, general) — solo lectura, por departamento
 *  /pac-cumplimiento            → Protegida (todos los roles MENOS gestor_compras: ahí están los rankings de todos los departamentos)
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
import { comprasRoutes, comprasJefaturaRoutes } from './features/compras/routes';
import { gestorComprasRoutes } from './features/gestor-compras/routes';
import { mapaSistemaRoutes } from './features/mapa-sistema/routes';

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

/** El gestor de compras ve solo su departamento: su inicio es su panel, no el Home general. */
const HomeSegunRol = () => {
  const { role } = useAuth();
  return role === 'gestor_compras' ? <Navigate to="/gestor-compras" replace /> : <Home />;
};

// Todos los roles salvo gestor_compras (el backend también lo bloquea en /pac-cumplimiento/*)
const ROLES_CON_PAC_CUMPLIMIENTO = ['admin', 'abastecimiento', 'finanzas', 'viewer', 'comprador', 'jefatura', 'general'];

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
            <Route path="/" element={<HomeSegunRol />} />
            <Route path="/licitaciones" element={<Dashboard />} />
            <Route path="/ordenes-compra" element={<OrdenesCompraDashboard />} />
            {/* Mapa del sistema (todos los autenticados) */}
            {mapaSistemaRoutes}
            {/* Módulo PAC (todos los autenticados) */}
            {pacRoutes}
            {/* Módulo PAC — Cumplimiento del Plan Anual de Compras (todos los autenticados salvo gestor_compras) */}
            <Route element={<RequireRole allowed={ROLES_CON_PAC_CUMPLIMIENTO} />}>
              {pacCumplimientoRoutes}
            </Route>
            {/* Módulo Compra Ágil (todos los autenticados) */}
            {compraAgilRoutes}

            {/* Módulo Abastecimiento (admin + abastecimiento + comprador + general) */}
            <Route element={<RequireRole allowed={['admin', 'abastecimiento', 'comprador', 'general']} />}>
              {abastecimientoRoutes}
              {fscOcPacRoutes}
            </Route>

            {/* Módulo Gestión de Compras — bandeja del comprador (admin + comprador + jefatura + general) */}
            <Route element={<RequireRole allowed={['admin', 'comprador', 'jefatura', 'general']} />}>
              {comprasRoutes}
            </Route>

            {/* Panel Formularios — supervisión de jefatura, SIN 'comprador' a propósito */}
            <Route element={<RequireRole allowed={['admin', 'jefatura', 'general']} />}>
              {comprasJefaturaRoutes}
            </Route>

            {/* Gestor de Compras — panel de solo lectura por departamento */}
            <Route element={<RequireRole allowed={['admin', 'gestor_compras', 'jefatura', 'general']} />}>
              {gestorComprasRoutes}
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
