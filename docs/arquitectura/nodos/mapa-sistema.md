# Mapa del Sistema
- **Cluster:** Frontend SPA (React)
- **Tipo:** ui
- **Ubicación:** frontend/src/features/mapa-sistema/
- **Tecnología:** React 18 + Three.js 0.160 (embebido en iframe)

## Qué hace
Muestra este mismo mapa de arquitectura como una escena 3D interactiva dentro de la aplicación: cada nodo es un componente del sistema, cada línea una conexión real (con su evidencia). Pensado para explicar cómo está armado el sistema a alguien nuevo, a jefatura o en una auditoría, sin tener que leer código.

## Entradas / Salidas
- **Entrada:** `graph.json` (inyectado en `mapa-sistema.html` al momento de generarlo).
- **Salida:** ninguna — es solo visualización.

## Depende de →
- (ninguno en tiempo de ejecución — el HTML es autocontenido)

## Lo usan ←
- `app-shell` (ruta `/mapa-sistema`)
- `home` (botón "Ver Mapa")

## Riesgos / notas
El HTML se regenera con `python docs/arquitectura/build_graph.py` cada vez que cambie `graph.json` — hay que recordar copiar el resultado a `frontend/public/mapa-sistema.html` (o el paso equivalente) antes de un `npm run build`. Ver `docs/arquitectura/00-resumen.md` → "Cómo regenerar el mapa".
