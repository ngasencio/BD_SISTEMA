# Inicio
- **Cluster:** Frontend SPA (React)
- **Tipo:** ui
- **Ubicación:** frontend/src/pages/Home.jsx
- **Tecnología:** React 18

## Qué hace
Es la pantalla que ve cualquier persona apenas inicia sesión: una grilla de tarjetas con los módulos activos del sistema (Licitaciones, OC, Compra Ágil, PAC, Abastecimiento, etc.) y otra con los módulos en desarrollo. Aquí vive el botón **"Ver Mapa"** que abre el mapa 3D del sistema.

## Entradas / Salidas
- **Entrada:** ninguna (contenido estático + hora/fecha en vivo).
- **Salida:** navegación a la ruta del módulo elegido.

## Depende de →
- `mapa-sistema` (botón Ver Mapa)
- `backend-api` (KPIs generales, si se agregan a futuro)

## Lo usan ←
- `app-shell` (ruta `/`)

## Riesgos / notas
Es el lugar natural para ir agregando accesos a futuros módulos — mantener la lista `MODULES_ACTIVE` sincronizada con las rutas reales de `App.jsx`.
