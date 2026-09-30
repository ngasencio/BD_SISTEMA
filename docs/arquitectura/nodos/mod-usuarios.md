# Usuarios y Roles
- **Cluster:** Frontend SPA (React)
- **Tipo:** ui
- **Ubicación:** frontend/src/features/usuarios/
- **Tecnología:** React 18

## Qué hace
CRUD de usuarios del sistema (`/admin/usuarios`, solo `admin`) y la página de perfil propio (`/perfil`, cualquier usuario autenticado). Administra el rol de cada persona: admin, abastecimiento, finanzas, comprador, jefatura, general o viewer.

## Entradas / Salidas
- **Entrada:** datos de usuario + rol asignado.
- **Salida:** REST a `backend-api` sobre `auth.User` + `PerfilUsuario`.

## Depende de →
- `backend-api`

## Lo usan ←
- `app-shell` (rutas `/admin/usuarios`, `/perfil`)

## Riesgos / notas
`features/usuarios/constants/roles.js` es la fuente única de verdad de labels/colores de rol — debe mantenerse sincronizado a mano con los guards `RequireRole` de `App.jsx`.
