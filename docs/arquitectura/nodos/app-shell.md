# App Shell
- **Cluster:** Frontend SPA (React)
- **Tipo:** ui
- **Ubicación:** frontend/src/App.jsx
- **Tecnología:** React 18 + react-router-dom 7

## Qué hace
Es el punto de entrada de la aplicación web. Define todas las rutas de la SPA, decide qué puede ver cada usuario según su rol (`RequireAuth`/`RequireRole`) y envuelve cada página en `AppLayout` (Topbar + Sidebar), que es obligatorio para que el diseño no se rompa.

## Entradas / Salidas
- **Entrada:** sesión JWT guardada en `localStorage` (vía `authStore.jsx`).
- **Salida:** renderiza uno de los módulos según la URL visitada.

## Depende de →
- `home`, `mapa-sistema`, `mod-mercado-publico`, `mod-compra-agil`, `mod-pac`, `mod-abastecimiento`, `mod-fsc-oc-pac`, `mod-anexo-sigfe`, `mod-finanzas-facturas`, `mod-usuarios` (rutas)
- `backend-api` (login/refresh JWT)

## Lo usan ←
- (ninguno — es el punto de entrada de la SPA)

## Riesgos / notas
Si se agrega una página nueva sin envolverla en `AppLayout` o sin registrar su ruta aquí, queda inaccesible o rompe el layout (ver regla de layout en `frontend/CLAUDE.md`).
