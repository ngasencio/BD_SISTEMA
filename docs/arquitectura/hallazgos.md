# Hallazgos

Deuda técnica, código ambiguo y dudas detectadas durante la construcción de este mapa. No repite lo ya documentado en el `CLAUDE.md` raíz ("Known issues to fix before production") salvo cuando aporta un matiz nuevo relevante para el mapa.

## Código posiblemente muerto

- **`api/data/data_proveedores/scraping_proveedores.py`, `scraping_proveedores_v2.py`, `scraping_proveedores_v3_debug.py`, `scraping_con_login.py`** — existen 4 variantes de un mismo scraper de proveedores, y ninguna aparece referenciada desde `backend/api/views.py` ni desde ningún otro script activo (búsqueda `grep` sin resultados fuera de la propia carpeta). No se incluyeron en `graph.json` porque no hay evidencia de que corran hoy. Si alguna sigue en uso vía tarea programada de Windows u otro mecanismo externo al repo, agregarla al grafo como nodo de `etl_panel`.

## Ambigüedades resueltas por decisión, no por evidencia

- **Agrupación de `mod-anexo-sigfe` y `mod-finanzas-facturas`**: Anexo N°1, Anexo N°3, Finanzas y Facturas son 4 features de frontend distintas: se agruparon en 2 nodos para mantener el mapa legible (15-40 nodos). Si el sistema sigue creciendo en esta área, considerar separarlas en 4 nodos.
- **App Django `ordenes_compra/`**: existe, tiene modelo vacío y no está en `INSTALLED_APPS` — se excluyó del mapa por estar inactiva. Reactivarla debería incluir agregarla como nodo nuevo.
- **`etl-pac-loader`**: agrupa `cargar_pac_servidor.py` (carga `PlanerPAC` desde Excel) y `consolidar_pac.py` (preprocesa `OCPAC_Maestro.csv`) más el comando `manage.py cargar_pac_maestro` (recarga `PacProyectoMaestro`) porque los tres alimentan el mismo dominio (PAC) desde archivos locales, pero no se confirmó línea por línea que `consolidar_pac.py` sea el generador directo de `OCPAC_Maestro.csv` — verificar si esa relación es correcta antes de citarla como definitiva.

## Riesgos de seguridad (ya conocidos, no repetidos en el grafo con su valor real)

- `backend/core/settings.py` tiene `SECRET_KEY` y una contraseña de MariaDB como valores por defecto (fallback) si no existe `.env` — ningún nodo ni archivo de este mapa reproduce esos valores, solo se nombra la variable de entorno correspondiente. Ver `CLAUDE.md` raíz, tabla "Known issues".
- `CORS_ALLOW_ALL_ORIGINS = DEBUG` y `ALLOWED_HOSTS` con la IP del servidor de producción están documentados en `.claude/agent-devops.md` — no se citó la IP en este mapa a propósito.

## Regenerar la tabla `relaciones.md`

`build_graph.py` (Fase 3) valida `graph.json` y genera `mapa-sistema.html`, pero **no** regenera automáticamente `relaciones.md` — esa tabla se mantiene a mano en paralelo al grafo. Si el equipo agrega muchas aristas nuevas, conviene extender `build_graph.py` con una opción `--tabla` que la vuelque a partir del JSON, para evitar que se desincronicen.

## Confirmar con una persona del equipo

1. Si alguna variante de `scraping_proveedores*.py` sigue en uso (ver arriba) — de lo contrario, candidatas a borrar.
2. Si `mod-anexo-sigfe`/`mod-finanzas-facturas` deberían separarse en 4 nodos en la próxima iteración del mapa.
3. Si `etl-contratos` y `etl-fsc-panel` realmente comparten el mismo login de `panel-sso-documental` (mismo portal, credenciales distintas) o son dos accesos independientes — el mapa asume que es el mismo portal.
