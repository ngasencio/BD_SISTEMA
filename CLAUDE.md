# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Agentes especializados en `.claude/`** — leer antes de cada tarea:
>
> | Agente | Cuándo leerlo |
> |---|---|
> | `agent-arquitectura.md` | Antes de agregar módulo, decidir estructura, o tocar routing |
> | `agent-datos.md` | Antes de consultar, modificar o crear modelos y relaciones DB |
> | `agent-codigo.md` | Antes de escribir código backend o frontend nuevo |
> | `agent-seguridad.md` | Antes de cada commit o deploy |
> | `agent-testing.md` | Antes de escribir cualquier test |
> | `agent-devops.md` | Para deploy, Nginx, ETL cron, backups, troubleshooting |

---

## What this system does

Internal procurement management web app for **Organismo 7296 — Servicio de Salud Osorno** (Chile). Pulls data from the Mercado Público API, stores it in MariaDB, and exposes it via Django REST API + React SPA.

---

## Development commands

```bash
# Backend — from BD_SISTEMA/backend/
python manage.py runserver 0.0.0.0:8000
python manage.py makemigrations && python manage.py migrate
python manage.py createsuperuser

# Frontend — from BD_SISTEMA/frontend/
npm run dev        # Vite dev server on :5173
npm run build      # Outputs to dist/ (served by Django at /gestion-sso/)

# ETL scripts — from BD_SISTEMA/api/  (run manually or via cron)
python LI_SSO_SERVER.py        # Licitaciones ETL
python OC_SSO_SERVER.py        # Órdenes de Compra ETL
```

No linting configured. Tests aún no implementados — ver `agent-testing.md` para la estrategia y los comandos (pytest + Vitest).

---

## Repository layout

```
BD_SISTEMA/
├── backend/          # Django 4.2 + DRF 3.16 — REST API on :8000
│   ├── core/         # settings.py, urls.py (mounts /api/ and /gestion-sso/ SPA)
│   └── api/          # ALL active models, views, serializers, services, urls
├── frontend/         # React 18 + Vite SPA — served at /gestion-sso/
│   └── src/
│       ├── App.jsx              # Router + RequireAuth/RequireRole guards
│       ├── components/ui/AppLayout.jsx  # Shell: Topbar + Sidebar + <Outlet>
│       ├── pages/               # Legacy pages (Dashboard, OC, AnexoDeuda) — el Home ya vive en features/inicio
│       └── features/            # Feature-Sliced modules (preferred pattern)
└── api/              # Python ETL scripts — NOT a web server, run via CLI
    ├── LI_SSO_SERVER.py
    ├── OC_SSO_SERVER.py
    └── data/         # Static Excel/CSV files (PAC, facturas) — NOT in DB. FSC ya NO vive aquí: se sincroniza en vivo a la DB vía data_panel/page_data_panel.py
```

---

## Data flow

```
Mercado Público API (HTTPS, SSL disabled — known issue)
  → api/ ETL scripts (import Django ORM directly, no HTTP)
  → MariaDB :3306  bd_sistema
  → backend/ Django :8000  /api/*  (JWT required)
  → frontend/ React  /gestion-sso/
```

ETL scripts call `bulk_create` / `all().delete()` on the ORM directly — no intermediate HTTP. Modifying a model requires checking the corresponding ETL script for compatibility.

---

## Backend — active models (`backend/api/models.py`)

Two naming conventions coexist — **do not mix them in new code**:

| Convention | Models | Rule for new models |
|---|---|---|
| PascalCase fields (legacy, from MP API) | `Licitacion`, `OrdenCompra`, `DetalleLicitacion`, `DetalleOrdenCompra` | Keep as-is; use `db_column` if renaming |
| snake_case fields (correct Django style) | All others | **Use this** |

| Model | DB table | PK | Notes |
|---|---|---|---|
| `Licitacion` | `api_licitacion` | `codigo_licitacion` | PascalCase legacy |
| `DetalleLicitacion` | `api_detallicitacion` | `id` | FK→Licitacion |
| `OrdenCompra` | `api_ordencompra` | `codigo_oc` | PascalCase legacy. `TotalNeto`/`TotalBruto` are **DecimalField** (migrated from the earlier TextField — convert defensively with `Number()`/`Decimal()` only if you hit an old raw dump). `EnlacePAC`/`ID_Proyecto`/`Nombre_Proyecto` are recalculated from scratch against `api/data/data_pac/OCPAC_Maestro.csv` on every OC sync (`enlazar_con_pac()` in `OC_SSO_SERVER.py`) — never write a manual correction directly into these columns, it'll be silently overwritten on the next sync (see `OcPacOverride` for the soft-FK pattern that survives this) |
| `DetalleOrdenCompra` | `api_detalleordencompra` | `id` | FK→OrdenCompra |
| `Factura` | (auto) | `id` | `emision` stored as DD-MM-YYYY string |
| `PlanerPAC` | `data_planerpac` | `id` | snake_case. PAC plan vigente, cargado desde `PlanificacionPACxxxx.xlsx` vía `api/data/data_planificacionPac/cargar_pac_servidor.py` — **reemplazo por año** (desde 2026-10-07): el Excel es el plan VIGENTE completo de cada año de su columna `PAC`; la carga borra las filas de esos años e inserta todas las del archivo en una transacción (`--dry-run` simula; guarda un respaldo CSV en `data_planificacionPac/respaldos/` antes de borrar; aborta si el archivo trae <50% de las filas ya cargadas, salvo `--forzar`). Una modificación del plan (1ª, 2ª…) se carga igual: el archivo nuevo reemplaza al anterior. NO es upsert porque no existe clave natural única: un mismo ítem se repite con igual fecha y montos distintos (cuotas), y la clave `id_proyecto+nombre_item+pac+fecha_inicio_compra` colapsaba esas filas y subestimaba el plan. Los años que el archivo no trae no se tocan (se acumula año sobre año). `managed=True` desde que se retrofiteó la PK (antes el loader hacía `DROP TABLE`+`to_sql` crudo sin `id`). Nada referencia `PlanerPAC.id` (todo cruza por `id_proyecto`), así que reinsertar es seguro. **Al terminar la carga reclasifica Dentro/Fuera PAC de los FSC derivados** (`services.reclasificar_dentro_fuera_pac`, la misma regla del ETL de formularios; `--sin-reclasificar` la omite): la regla depende de qué `id_proyecto` existen en el plan, y sin este paso (2026-10-08) quedaron 43 FSC con la clasificación del plan anterior y el % Dentro del 3er trimestre salía 69,8% en vez de 84,7%. `cantidad_oc`/`meses_envio_oc` (TextField) agregados para el módulo PAC Cumplimiento. |
| `PacProyectoMaestro` | `data_pac_proyecto_maestro` | `id` | snake_case. Maestro histórico multi-año (PC20-PC26+) de proyectos PAC, cargado desde `OCPAC_Maestro.csv` (actualización manual) vía `python manage.py cargar_pac_maestro`. Usado solo para verificar si un `FormularioFSCDerivado.id_plan` corresponde a un proyecto PAC real (columna `dentro_fuera_pac`) — no trae fechas ni montos, eso vive en `PlanerPAC`. |
| `SsoSubdireccion` | `data_sso_subdireccion` | `subdireccion_id` | snake_case. Solo 4 filas (IDs 2-5) — nombres de las subdirecciones institucionales (Dirección SS Osorno), cargadas desde `mapa_sso.xlsx` vía `python manage.py cargar_jerarquia_sso`. Resuelve el nombre de `Departamento.subdireccion_id` cuando `establecimiento_id=1`; los otros 6 hospitales de la red se agrupan por `Establecimiento.descripcion` en su lugar (no tienen nombre propio de subdirección). |
| `CompraAgilResumen` | `api_compraagil_resumen` | `codigocompraagil` | `presupuestoestimado` is **TextField** |
| `CompraAgilDocumento` | `api_compraagil_documentos` | `id` | FK→CompraAgilResumen |
| `CompraAgilProducto` | `api_compraagil_productos` | `id` | FK→CompraAgilResumen |
| `CompraAgilProductoCotizado` | `api_compraagil_productos_cotizados` | `id` | Quoted prices |
| `CompraAgilProveedor` | `api_compraagil_proveedores` | `id` | `proveedorseleccionado` field is **inconsistent**: values are `"1"`, `"Si"`, `"si"`, `"True"`, `"true"` — check with `str(val) in ['1','Si','si','True','true']` |
| `RevisionOCCorregible` | (auto) | `id` | Manual PAC-link review with resultado/motivo/observaciones |
| `Anexo1` | `tabla_anexo1` | `id` | snake_case |
| `Proveedor` | `T_Proveedores` | `rut` | Custom table name |
| `Comprador` | `T_Comprador` | `id` | Custom table name |
| `BoletaGarantia` | `T_BoletaGarantia` | `id` | CRUD + file upload |
| `BoletaGarantiaAudit` | `T_BoletaGarantia_Audit` | `id` | Auto-written on update/delete |
| `GestionContrato` | `data_gestioncontratos` | `numero_contrato` (PK) | snake_case. `monto_por_ejecutar` nullable (>10^13 → None). `fecha_inicio`/`fecha_termino` malformed strings ("07-00-2026"). Join: `id_licitacion_oc = OrdenCompra.CodigoLicitacion` |
| `FormularioFSC` | `data_formularios_fsc` | `id` | snake_case. Sin clave natural única — `folio`/`folio+anho` se repiten (~33% colisión); ETL usa `update_or_create` por `folio+anho+unidad_requirente+fecha_solicitud`. El Panel SSO trae el histórico completo en cada descarga, así que desde 2026-07-21 el sync también **elimina** (acotado a los años presentes en el archivo, ver `_sincronizar_borrado()` en `page_data_panel.py`) las filas cuya clave ya no aparece — borrar un FSC elimina en cascada su `historial_estados`. Campos `adj_espec_tecnicas`, `adj_cotizacion`, `adj_validacion`, `adj_form_justificacion` (TextField nullable): URLs de adjuntos del Panel SSO. `destino_actual` (TextField nullable): persona que actualmente tiene el formulario. `item_presupuestario`/`folio_requerimiento` (CharField 200, nullable). `fecha_solicitud` como string `YYYY-MM-DD`. ViewSet filtra `?estado=DC,AA` (CSV) via `FormularioFSCFilter(BaseInFilter)` |
| `FormularioFSCDerivado` | `data_formularios_fsc_derivados` | `id` | snake_case. Misma clave de upsert que `FormularioFSC`. También tiene los 4 campos `adj_*`. **Módulo PAC Cumplimiento:** `dentro_fuera_pac` (choices `DENTRO`/`FUERA`, null) y `sso_departamento` (FK→`Departamento`, `db_constraint=False` porque esa tabla es `managed=False` con `id` tipo `int(11)` incompatible con el `bigint` que genera Django) — ambos calculados por `_clasificar_dentro_fuera_pac()` en `page_data_panel.py`, recalculado en cada sync. Null en `sso_departamento` = "Sin Clasificar" (unidad_requirente sin match), nunca se descarta. |
| `FormularioFSCProducto` | `data_formularios_fsc_productos` | `id` | snake_case. `tipo_formulario` usa `db_column='t_form'`. Clave de upsert: `folio+anho+tipo_formulario+categoria+producto+descripcion` |
| `DevengoSigfeAnual` | `api_sigfe_devengo_anual` | `id` | snake_case. Reemplaza por completo al viejo modelo `Devengo` (tabla `devengo`, eliminada). Snapshot **vigente** (no histórico acumulativo) de devengo SIGFE por establecimiento/documento — sincronización por **reemplazo**: `doc_key` (hash de la identidad del documento — UE+folio+tipo/número doc+concepto+proveedor+catálogos, `unique=True`) es la llave de upsert; `monto_vigente`/`monto_disponible`/`monto_consumido`/`monto_vigente_insumo`/`tipo_cambio`/`fecha_conforme`/`fecha_ingreso` son saldo vivo y se **sobrescriben** en la misma fila en cada sync (nunca se insertan como fila nueva) — `row_hash` (hash de todo el contenido, ya no `unique`) solo sirve para saltarse el UPDATE si nada cambió. Antes del fix (migración `0044_devengosigfeanual_doc_key`, 2026-09-03) se acumulaba una fila nueva por cada cambio de saldo del mismo documento sin borrar la anterior — ~10% de las filas eran snapshots repetidos y los KPIs de deuda (`monto_disponible`) quedaban muy por debajo de la realidad; la migración dedupe el histórico existente quedándose con la fila de `fecha_sync` más reciente por `doc_key`. ETL en `api/data/data_devengo/sigfe_descarga_devengos_Completo.py` + `consolidar_devengo_anual.py` (`CAMPOS_IDENTIDAD`/`CAMPOS_SALDO_VIVO`/`calcular_doc_key`), disparable desde el dashboard (`/api/devengo-sigfe-anual/actualizar/`). Todo el módulo Anexo N°3 (Control de Deuda) corre sobre esta tabla. |
| `ConceptoJerarquia` | `concepto_jerarquia` | `id` | snake_case. Jerarquía de 5 niveles (Subtítulo→Ítem→Asignación→Sub-asignación→Detalle) de conceptos presupuestarios, 702 registros, prácticamente estática. Se carga con `python manage.py cargar_jerarquia`. Usada para enriquecer el reporte HTML jerárquico de Anexo N°3. |
| `CompradorInicial` | `data_comprador_inicial` | `codigo` (PK) | snake_case. Catálogo fijo iniciales de comprador (código embebido en `OrdenCompra.NombreOC`, ej. "F1-162-26-NAM") → `auth.User`. Lista cerrada mantenida a mano (no se derivan de nombres — no hay regla fija), cargada con `python manage.py cargar_compradores_iniciales`. |
| `FscOcLink` | `data_fsc_oc_link` | `id` | snake_case. Enlace FSC (`FormularioFSCDerivado` Dentro-PAC) ↔ `OrdenCompra`, calculado por `recalcular_fsc_oc_matching()` (services.py) y ajustable a mano vía `/fsc-oc-pac`. `confianza` (ALTA/MEDIA/BAJA_SUGERIDA/MANUAL) + `estado` (SUGERIDO/CONFIRMADO/RECHAZADO). **`orden_compra` es FK con `on_delete=DO_NOTHING, db_constraint=False`** — a propósito: `OC_SSO_SERVER.py` hace `OrdenCompra.objects.all().delete()`+`bulk_create()` en cada sync (snapshot completo), y un FK con CASCADE borraría toda revisión humana cada sync; con este ajuste el link sobrevive porque `codigo_oc` es estable entre syncs. `formulario_derivado` sí usa CASCADE normal (esa tabla se sincroniza por upsert, fila estable). "Sin match" NO se persiste como fila con `orden_compra=NULL` (MariaDB trata cada NULL como distinto en el `UniqueConstraint`, permitiría duplicados) — se representa por ausencia de filas para ese FSC. Ver detalle completo del algoritmo de matching (5 señales de score, hooks de recálculo automático) en `agent-arquitectura.md`. |
| `PacResponsableCorreo` | `data_pac_responsable_correo` | `id` | snake_case. Equivalencia CONFIRMADA a mano: nombre del responsable del PAC (`PlanerPAC.nombre_responsable`, solo texto) → correo. `nombre_normalizado` (único) es la llave. Módulo Notificación. |
| `NotificacionPlanLote` / `NotificacionPlanEnvio` / `NotificacionPlanItem` | `data_notif_plan_lote` / `_envio` / `_item` | `id` | snake_case. Registro de cada "Enviar" de la pestaña Notificación: lote → un envío (correo) por persona → sus planes (`id_proyecto`, indexado). `modo_prueba=True` en el lote = salió solo al destino de prueba y **NO cuenta como "ya notificado"**. `NotificacionPlanEnvio` guarda `destinatario_real` (a quién correspondía) y `enviado_a` (adónde salió de verdad). |
| `NotificacionPlanCopia` | `data_notif_plan_copia` | `id` | snake_case. Regla PERMANENTE de copia (CC) por departamento: `accion` EXCLUIR (esa persona no va en copia) o AGREGAR (siempre va). `departamento_id` sin FK (Departamento es `managed=False`). Único por (departamento, correo). Módulo Notificación. |
| `OcPacOverride` | `data_oc_pac_override` | `orden_compra` (PK, OneToOne) | snake_case. Corrección manual del PAC real de una OC cuando `OrdenCompra.EnlacePAC`/`ID_Proyecto` (recalculados desde cero contra `OCPAC_Maestro.csv` en cada sync de OC, ver `enlazar_con_pac()` en `OC_SSO_SERVER.py`) están vacíos o equivocados frente al `id_plan` que declara el FSC que originó la compra. Mismo patrón de soft-FK que `FscOcLink.orden_compra`. Nunca se escribe en `OrdenCompra.ID_Proyecto` ni en `PacProyectoMaestro` (ambos son pipelines derivados que se pisarían solos) — este override es la única fuente de verdad para "el PAC real de esta OC", aplicado por encima al calcular `estado_pac` (`_pac_match_estado()` en services.py). |

---

## Backend — all REST endpoints (`/api/`)

All require `Authorization: Bearer <access_token>` except `/auth/`.

```
POST  auth/login/                         TokenObtainPairView
POST  auth/refresh/                       TokenRefreshView

# Licitaciones
GET   licitaciones/                       ?Estado=&C_NombreOrganismo=&Tipo=&EsRenovable=
GET   licitaciones/{id}/
GET   detalles/                           ?licitacion=&CodigoProducto=&Categoria=
GET   dashboard/stats/                    KPI aggregates (5 min cache)

# Órdenes de Compra
GET   ordenes-compra/                     ?EstadoOC=&C_Unidad=&TipoOC=
GET   ordenes-compra/{id}/
GET   ordenes-compra-detalles/
GET   ordenes-compra/raw_all/             ?estado=&anio=&limit= (max 25 000, unpaginated, default 25 000)
GET   ordenes-compra/proyectos-licitacion/ CodigoLicitacion→ID_Proyecto map (10 min cache)
GET   facturas/raw_all/                   ?anio= (unpaginated, emision as DD-MM-YYYY string)

# Devengo SIGFE Anual (Anexo N°3 — reemplaza al viejo modelo/tabla Devengo, eliminado)
GET   devengo-sigfe-anual/                ?codigo_ue=&tipo_documento=&concepto_presupuestario=&search=&ordering=
GET   devengo-sigfe-anual/{id}/
GET   devengo-sigfe-anual/stats/          ?ue=&solo_deuda= (5 min cache per ue/flag combo)
GET   devengo-sigfe-anual/raw_all/        ?ue=&desde=&hasta=&limit= (max 100 000, default 50 000)
GET   devengo-sigfe-anual/reporte-html/   Reporte HTML standalone (árbol jerárquico + Chart.js) con D_SLIM inyectado — pedir con axios autenticado + iframe.srcDoc/Blob, NUNCA <iframe src=...> directo (5 min cache)
POST  devengo-sigfe-anual/actualizar/     {usuario, password, fecha_desde, fecha_hasta} (YYYY-MM-DD) → {task_id}. Selenium headless server-side.
GET   devengo-sigfe-anual/actualizar-estado/<task_id>/  Progreso + diff (nuevos_detalle, resumen_por_ue)
POST  devengo-sigfe-anual/actualizar-cancelar/<task_id>/  Cancelación real (mata el hilo + cierra Chrome)

# PAC
GET   planer-pac/                         PAC plan rows
GET   pac/indicadores-res188/             Res.188/2026 savings indicators. Ind.1 (`i1`) = MONTO de OC con `EnlacePAC='Enlazada'` **cuyo `ID_Proyecto` está en `PlanerPAC`** (incluye arrastre PC24/PC25) / monto total del año sin canceladas — definición ORIGINAL, restituida el 2026-10-08 tras probar "cualquier proyecto PAC" (83,1%) y revertirlo a pedido del usuario; 2026 = 77,6%. `i1_cualquier_pac`/`monto_enlazado_cualquier_pac` (sin exigir PlanerPAC) son solo datos adicionales (observación en los informes, nunca el Score); `plan_del_anio_cargado` avisa que `PlanerPAC` no trae el año consultado (hoy solo 2026: el Ind.1 de otro año no es comparable). `total_oc` es un MONTO; la cantidad es `cantidad_oc`. Los informes Word/PPT/PDF (`services_reportes_res188.py`) muestran `i1` como Indicador 1 y usan `pct_enlace_monto` de `historico_enlace_*` (base "cualquier proyecto PAC", rotulada así) para las series mensual/trimestral/anual; `pct_enlace` (por cantidad) lo sigue usando el dashboard.
GET   pac/oc-stats/                       OC stats aggregated for PAC
GET   pac/oc-productos/                   Products per OC for PAC analysis

# PAC — Seguimiento y Rendimiento del Plan Anual de Compras (módulo separado del bloque PAC de arriba)
GET   pac-cumplimiento/dentro-fuera/      ?anho=&subdireccion=&depto= % Dentro/Fuera + comparativa histórica por año (5 min cache)
GET   pac-cumplimiento/temporal/          ?anho=&subdireccion=&depto= En fecha/Atrasado/Pendiente/Sin planificación (5 min cache)
GET   pac-cumplimiento/jerarquia/         ?anho= Árbol Subdirección→Departamento(raíz)→Sub-departamento (5 min cache)
GET   pac-cumplimiento/rankings/          ?anho=&tipo=depto|formulario Mejores/peores, score compuesto (5 min cache)
POST  pac-cumplimiento/actualizar-maestro/     Recarga OCPAC_Maestro.csv → PacProyectoMaestro (síncrono, sin task_id)
POST  pac-cumplimiento/actualizar-jerarquia/   Recarga nombres de subdirección desde mapa_sso.xlsx (síncrono)
GET   pac-cumplimiento/reporte/word|ppt|pdf/   ?periodo=YYYY-MM|YYYY-QN Descarga informe/presentación/PDF (python-docx/python-pptx/reportlab)

# Temporalidad de Formularios (pestaña "Temporalidad" en /abastecimiento/formularios — reutiliza el backend de arriba, UI distinta)
GET   pac-cumplimiento/temporalidad-formularios/comparativo/   Serie anual completa Dentro/Fuera PAC por cantidad y por monto, estado='AC' (5 min cache)
GET   pac-cumplimiento/temporalidad-formularios/jerarquia/     ?anho= Igual que jerarquia/ de arriba + campo `nota` (1.0-7.0) por nodo, estado='AC' (5 min cache)
GET   pac-cumplimiento/temporalidad-formularios/usuarios/      ?anho=&limite=50 Ranking por usuario_requirente con `nota`, estado='AC' (5 min cache)

# Compra Ágil
GET   compraagil-resumen/                 ?estadoglosa=&unidadcompra=&search=
GET   compraagil-productos/               ?codigocompraagil=
GET   compraagil-proveedores/             ?codigocompraagil=
GET   compraagil/ahorro-stats/            ?fecha_desde=&fecha_hasta= (5 min cache)

# Garantías (Boletas)
GET   proveedores/                        ?search= (no pagination)
GET   compradores/                        ?search= (no pagination)
CRUD  boletas-garantia/                   ?tipo_documento=&banco=&proveedor=&search=&ordering=
GET   boletas-garantia/{id}/
GET   boletas-garantia-audit/             Read-only

# Revisiones OC
CRUD  revisiones-oc/                      ?codigo_oc=

# Gestión Contratos SSO
GET   contratos/                          ?estado_contrato=&categoria_contrato=&tipo_contrato=&unidad_requirente=&search=
GET   contratos/{numero_contrato}/
GET   contratos/stats/                    Aggregated KPIs (5 min cache)
POST  contratos/actualizar/               Launches async ETL task → {task_id}
POST  contratos/actualizar-cancelar/{task_id}/  Cancels running ETL
GET   contratos/tarea-status/{task_id}/   Polls ETL progress {status, paso_desc, progreso_pct, logs_recientes}
GET   contratos/evaluaciones/             Res.188 evaluation analysis (5 min cache)
GET   contratos/financiero/               OC reconciliation + financial projections (5 min cache)
GET   contratos/oc-detalle/               ?id_licitacion_oc= — OC + productos for one contract (5 min cache per id)
GET   contratos/plazos/                   Active contracts with alert levels (5 min cache)
GET   contratos/pac/                      PAC linkage pivot by year (5 min cache)

# Formularios FSC (Panel Documental SS Osorno — sync vía Selenium, reemplaza Excel)
GET   formularios/stats/                  ?anho= KPIs + distributions (5 min cache)
GET   formularios/flujo/                  ?anho= Pipeline P→AC + rechazados (5 min cache)
GET   formularios/alertas/                ?dias_min=10&anho= FSC activos con días desde solicitud ≥ umbral, ordenados por días desc (cada fila trae `id_formulario`)
GET   formularios/unificacion/            ?anho= Grupos candidatos a compra conjunta: layer1=item_presupuestario (≥2 FSC), layer2=categoria. Estados ASDA→DC. Cada nodo/formulario trae `id` (FormularioFSC) para abrir la ficha. (5 min cache)
GET   formularios/historial/              ?anho=&unidad_requirente=&usuario_requirente= FSC+productos embebidos excl. R/P. Usado por Tab "Historial de Compras". Cada FSC trae `id` y `id_formulario` (para abrir la ficha). (5 min cache)
GET   formularios/ficha/                  ?origen=solicitud|derivado&id= Ficha completa para el botón "Ver" de Solicitudes y Derivados (`calcular_formulario_ficha`): datos del FSC (cabecera de la tabla pedida completada con su gemela de la otra tabla por folio+año+unidad+fecha_solicitud), carro del tipo correcto, historial de bandejas, ProcesoCompra del comprador y OC enlazadas (`FscOcLink` + las vinculadas al proceso) con resumen y estado PAC. `departamento`/`subdireccion` salen del organigrama aunque el FSC no esté derivado. Sin cache. Los ids de FormularioFSC y FormularioFSCDerivado NO son intercambiables (de ahí `origen`)
POST  formularios/actualizar/             {rut, dv, clave} → launches async ETL task → {task_id}
POST  formularios/actualizar-cancelar/{task_id}/  Cancels running ETL
GET   formularios/actualizar-estado/{task_id}/    Polls ETL progress {status, paso_desc, progreso_pct, logs_recientes, diff}
GET   formularios-fsc/                    ?anho=&unidad_requirente=&estado=DC,AA (CSV multi-select)&search=
GET   formularios-fsc-derivados/          ?anho=&estado_compra=&search=
GET   formularios-fsc-productos/          ?anho=&categoria=

# Enlace FSC-OC-PAC (cruza FSC Dentro-PAC ↔ OC ↔ su PAC real — /fsc-oc-pac)
GET   fsc-oc-pac/resumen/                 ?anho= KPIs enlace + KPI "PAC en confirmados" (PAC_OK/SIN_PAC/PAC_DISTINTO) (cache 5min)
GET   fsc-oc-pac/pendientes/              ?anho= {enlace_pendiente:[...], pac_pendiente:[...]} — sin cache. Un FSC puede tener varias OC CONFIRMADO a la vez (varios procesos de compra); `enlace_pendiente` incluye el FSC si le quedan candidatas SUGERIDO aunque ya tenga confirmadas (`n_confirmadas` indica cuántas), y `pac_pendiente` trae una fila por CADA OC confirmada con PAC incorrecto
GET   fsc-oc-pac/pivote/                  ?anho= Jerarquía Subdirección→Departamento con conteo por estado de enlace (cache 5min)
GET   fsc-oc-pac/compraagil-resumen/      ?anho= Reporte solo-lectura OC↔CompraAgilResumen vía CodigoCompraAgil (cache 5min)
GET   fsc-oc-pac/corregidas/              Registro de OcPacOverride + KPIs sincronizadas/esperando_sync (cache 5min)
GET   fsc-oc-pac/impacto/                 Reporte combinado: impacto vía Licitación (RevisionOCCorregible) + vía Formularios (OcPacOverride) (cache 5min)
GET   fsc-oc-pac/fsc-detalle/             ?id= Detalle completo de un FormularioFSCDerivado (8 secciones, para modal "Ver FSC")
GET   fsc-oc-pac/oc-detalle/              ?codigo_oc= Detalle completo de una OrdenCompra + estado PAC + líneas (modal "Ver OC")
POST  fsc-oc-pac/confirmar/               {link_id} → confirma candidata SUGERIDO; rechaza automáticamente las demás del mismo FSC
POST  fsc-oc-pac/rechazar/                {link_id, motivo}
POST  fsc-oc-pac/enlazar-manual/          {formulario_derivado_id, codigo_oc, observaciones} → confianza=MANUAL, estado=CONFIRMADO
POST  fsc-oc-pac/corregir-pac/            {codigo_oc, formulario_derivado_id, observaciones} → crea/actualiza OcPacOverride con id_plan del FSC
POST  fsc-oc-pac/recalcular/              Relanza recalcular_fsc_oc_matching() a demanda (sincrónico, respeta decisiones humanas)
GET   fsc-oc-links/                       ?confianza=&estado=&formulario_derivado__anho= Listado paginado (tab "Detalle/Explorador")
GET   compradores-iniciales/              Catálogo de iniciales de comprador

# Inicio (Home — tablero ejecutivo; ver sección "Módulo Inicio")
GET   inicio/resumen/                     ?anio= (omitido = año en curso; inválido → 400) Cifras del año para el Home. Bloques por rol: `oc` y `pac` para todos; `formularios` solo `admin/abastecimiento/comprador/general/jefatura`; `deuda` solo `admin/finanzas/general` (el servidor los omite = `null`, no es la UI la que oculta). `gestor_compras` → 403 (su Home es su panel). Cache 5 min por (año, día, bloques)

# Gestor de Compras (rol gestor_compras — SOLO LECTURA, acotado al departamento del usuario; ver sección "Módulo Gestor de Compras")
GET   gestor-compras/mi-alcance/          Departamento(s) del usuario; admin/jefatura/general reciben `todos` + `departamentos_disponibles` y eligen con ?depto_id= (sin él ven TODOS los departamentos)
GET   gestor-compras/stats/               ?anho= KPIs del departamento (60 s cache por contenido del alcance)
GET   gestor-compras/flujo/               ?anho= Pipeline P→AC del departamento (60 s cache)
GET   gestor-compras/alertas/             ?anho=&dias_min= FSC activos con demora
GET   gestor-compras/solicitudes/         ViewSet RO: ?anho=&estado=DC,AA&search=&ordering= · {id}/ · {id}/productos/ (FSC ajeno → 404)
GET   gestor-compras/derivaciones/        ViewSet RO de FSC derivados (AC) del departamento, todos los compradores: ?finalizados=1&search= · {id}/ · {id}/productos/
GET   gestor-compras/resumen/             Plazos de Mercado Público + gestión interna + procesos por tipo y estado del departamento (60 s cache)
GET   gestor-compras/procesos/            ViewSet RO de ProcesoCompra con ≥1 FSC del departamento · {id}/ · {id}/historial/ · {id}/detalle-mp/ (proceso ajeno → 404)
GET   gestor-compras/plan/resumen/        ?anho= Dentro/Fuera PAC + histórico (+ `pac_disponible`, `anios_pac`, `muestra_minima`)
GET   gestor-compras/plan/temporal/       ?anho= En fecha/Atrasado/Pendiente/Sin planificación del departamento
GET   gestor-compras/plan/mensual/        ?anho= Fichas por MES de su fecha de compra más próxima, apiladas ejecutado/pendiente/atrasado (cantidad y monto), eje continuo, `sin_fecha` aparte (60 s cache)
GET   gestor-compras/plan/items/          ?anho=&estado=&search=&mes=YYYY-MM&page=&page_size= Fichas PAC del departamento (mes inválido se ignora) · {id_proyecto}/ detalle con TODOS los campos del PAC (ajena → 404)
```

**Lógica de negocio compleja** → always in `api/services.py`, never in views. Key service functions: `obtener_kpis_devengo`, `calcular_indicadores_res188`, `calcular_oc_stats`, `calcular_oc_productos`, `calcular_compraagil_ahorro_stats`, `calcular_contratos_evaluaciones`, `calcular_contratos_financiero`, `calcular_contratos_oc_detalle`, `calcular_contratos_plazos`, `calcular_contratos_pac`, `calcular_formularios_stats`, `calcular_formularios_unificacion`, `calcular_formularios_historial`. **Helpers en views.py (NO en services):** `_snapshot_fsc()` (captura estado pre-ETL), `_diff_fsc()` (compara snapshots y produce diff con 4 categorías: nuevos/cambiaron_estado/derivados_nuevos/pegados).

**Módulo PAC Cumplimiento** (`api/services.py`): `calcular_pac_dentro_fuera_stats`, `calcular_pac_comparativa_periodos`, `calcular_pac_cumplimiento_temporal`, `calcular_pac_jerarquia`, `calcular_pac_rankings` — todas aceptan `fecha_desde`/`fecha_hasta` (ISO, prioridad) o `anho`. `calcular_pac_jerarquia` resuelve sub-departamentos vía `_resolver_depto_raiz()`: sube la cadena `Departamento.parent_id` (hasta 3 niveles reales observados) hasta el departamento de primer nivel dentro de la misma subdirección/establecimiento — `es_depto == 'SI'` es la señal autoritativa de "soy de primer nivel" y corta la cadena ahí aunque `parent_id` apunte a otro lado (hay departamentos reales, ej. PRAIS, cuyo `parent_id` apunta al nodo que representa la propia Subdirección, no a un par). Sin este rollup, sub-departamentos (ej. "AYEKAN" bajo "DEPARTAMENTO DE SALUD MENTAL") aparecían como hermanos sueltos fragmentando las métricas — ver `_mapa_departamentos()`/`_resolver_depto_raiz()`. Generación de reportes en `api/services_reportes.py` (`generar_informe_word`/`generar_presentacion_ppt`/`generar_reporte_pdf`, matplotlib backend `Agg`) + `api/plantillas_narrativas.py` (frases condicionales, sin IA — usar `_n()`/`_money()` para formatear números, nunca `str.replace(',', '.')` sobre un párrafo completo, corrompe comas de la prosa).

**Módulo Temporalidad de Formularios** (`api/services.py`, agregado 2026-10-01): pestaña "Temporalidad" en `/abastecimiento/formularios` (NO vive en `/pac-cumplimiento`, pero reutiliza su backend a propósito — decisión explícita del usuario para no duplicar la resolución de jerarquía). `_qs_fsc_derivado_pac_cumplimiento`/`calcular_pac_dentro_fuera_stats`/`calcular_pac_cumplimiento_temporal`/`calcular_pac_jerarquia` ganaron un kwarg opcional `estado=None` (sin impacto en los llamadores existentes, que no lo pasan). `calcular_pac_temporalidad_comparativo()` (serie anual completa cantidad+monto, sin parámetro — el frontend elige qué años graficar), `calcular_pac_temporalidad_jerarquia(anho)` (wrapper delgado sobre `calcular_pac_jerarquia(estado='AC')`, solo agrega `nota`), `calcular_pac_temporalidad_usuarios(anho, limite)` (agrupa por `FormularioFSCDerivado.usuario_requirente`, CharField de texto libre, sin FK a tabla de usuarios) — las 3 acotadas a `ESTADO_TEMPORALIDAD_FORMULARIOS='AC'` y al mismo alcance institucional que PAC Cumplimiento (Establecimiento 1). `_nota_desempeno_pac(total, dentro_cant, monto_dentro, monto_total)`: nota 1.0-7.0 = `1 + 6×(50%·%dentro_cantidad + 50%·%dentro_monto)`, `None` si `total < MUESTRA_MINIMA_PAC`. Frontend: `frontend/src/features/abastecimiento/components/formularios/TabTemporalidad.jsx` (única pestaña de Formularios extraída a archivo propio, en vez de inlinearla en el ya enorme `FormulariosPage.jsx`).

**Módulo Enlace FSC-OC-PAC** (`api/services.py`): cruza `FormularioFSCDerivado` (Dentro-PAC) con `OrdenCompra` (`TipoOCInterno='Formulario'`) usando el código embebido en `NombreOC` ("F1-162-26-NAM" = Tipo-Folio-Año-Comprador). `recalcular_fsc_oc_matching()` es el corazón: idempotente, indexa OC por (tipo,folio,año) y por (tipo,folio) para el fallback legacy sin año, combina 5 señales de score para las candidatas BAJA_SUGERIDA (`_score_similitud_fsc_oc`: fecha, unidad, monto, texto, **comprador** — esta última crítica porque muchas OC legacy traen comprador pero no año), y **nunca pisa una fila que un humano ya marcó CONFIRMADO/RECHAZADO/MANUAL** (solo toca SUGERIDO o crea filas nuevas). Se engancha automáticamente al final del ETL de OC (`views.py`, tras `oc.subir_maestros_a_django()`), del ETL de FSC (`page_data_panel.py`, tras `_clasificar_dentro_fuera_pac()`) y de la carga histórica (`OC_TOTAL_DSSO_SERVER.py`) — siempre en un `try/except` que solo loguea, nunca tumba el ETL. `_pac_match_estado()` calcula PAC_OK/SIN_PAC/PAC_DISTINTO comparando `id_plan` del FSC contra el PAC real de la OC (override de `OcPacOverride` primero, si no `OrdenCompra.EnlacePAC`/`ID_Proyecto`). `calcular_fsc_oc_impacto()` combina esta vía con la vía histórica de "OC Corregibles" (`RevisionOCCorregible`, ver bloque `corregidas` dentro de `calcular_oc_stats()`) SIN llamar a esa función completa (recalcula el mismo agregado acotado, más barato). Frontend: `frontend/src/features/fsc-oc-pac/` — ver tabla de rutas y `frontend/CLAUDE.md`.

**Módulo Gestor de Compras** (agregado 2026-10-06): rol `gestor_compras` (`PerfilUsuario.ROLES`, migración `0050`) para que un departamento vea, en solo lectura, qué ocurre con sus compras. Frontend: `/gestor-compras` (3 tabs: Solicitudes, Derivación a Comprador, Plan de Compra) — ver `frontend/CLAUDE.md`.
- **Alcance = `services.resolver_alcance_gestor(user, depto_id=None)`**, ÚNICA fuente de verdad. Sale de `data_pertenencia_usuario` (por `PerfilUsuario.panel_id`, `tipo_dependencia='DEP'`): el departamento asignado MÁS sus descendientes (`_cuelga_de`, mismo criterio de corte `es_depto=='SI'` que `_resolver_depto_raiz`). Quien pertenece a un **sub-departamento ve SOLO ese** (decisión del usuario; distinto al rollup a depto raíz de PAC Cumplimiento). Devuelve `unidades` (valores de `unidad_requirente` que casan por ID de departamento, **nunca por texto**: «SUB. DPTO. DE SALUD MENTAL EN ATENCION PRIMARIA…» NO cuelga de Atención Primaria) y `depto_ids`. **Vacío nunca significa "todo"**: sin pertenencia el alcance es `[]` y todo devuelve 0 filas. `depto_id` solo lo respetan admin/jefatura/general; para un gestor se ignora. **Un supervisor sin `depto_id` (o ''/'todos') ve TODOS los departamentos** (`todos=True`; ya ven todo en Abastecimiento/Panel Formularios, no es acceso nuevo); un `depto_id` inválido NO cae en "todos" (alcance vacío). En ese modo las vistas pasan `depto_ids=None` (= sin acotar, vía `_gestor_depto_ids`) a las funciones del PAC — **`None` solo lo produce `todos=True`**; `[]` sigue significando "ninguno". Cache 60 s por usuario.
- **Trampas conocidas** (ya cubiertas, no reintroducirlas): `_calcular_fichas_pac_completo(depto=[])` trata la lista vacía como "sin filtro" (devolvería TODAS las fichas — `calcular_gestor_plan_items` corta antes); `calcular_pac_dentro_fuera_stats`/`calcular_pac_cumplimiento_temporal` ganaron `depto_ids` donde `[]` = ninguno; los procesos del departamento se obtienen por subconsulta `id__in` y NO por join+`distinct()` (el pivote usa `values_list` y DISTINCT colapsaría procesos distintos); `.values_list(...).distinct()` sobre un modelo con `Meta.ordering` duplica filas → usar `.order_by()` antes.
- **Permisos**: `_IsGestorCompras` (`admin`, `gestor_compras`, `jefatura`, `general`) en las 19 rutas `gestor-compras/*`, todas GET. El gestor NO está en `_IsComprador`/`_IsAbastecimiento`, así que no alcanza ningún endpoint de escritura de Compras. `_NoGestorCompras` excluye SOLO al gestor de las 19 vistas `pac-cumplimiento/*` (rankings y jerarquía de todos los departamentos); el resto de roles y el superusuario pasan igual.
- **Compra conjunta**: `GestorProcesoCompraSerializer` muestra solo los FSC del alcance dentro de un proceso; los de otros departamentos solo cuentan en `n_formularios_otros`.
- **Reuso sin duplicar**: `listar_fsc_*_comprador` y `calcular_compras_resumen_comprador` se factorizaron en `_qs_fsc_finalizados`/`_qs_fsc_pendientes`/`_calcular_compras_resumen` (reciben un queryset base) — comportamiento del comprador idéntico, verificado campo a campo. `calcular_formularios_stats/flujo` aceptan `unidades=None|lista`; `calcular_formularios_alertas` salió de la vista a `services.py`.
- **Notificaciones** (campanita, solo in-app, sin correo): tipos nuevos `FSC_BANDEJA` y `FSC_DERIVADO` (migración `0051`). El ETL de FSC (`page_data_panel.py`) recoge las transiciones reales de bandeja (solo con estado previo — la primera vez que se ve un FSC no es un cambio) y los derivados recién creados, y al final llama `notificar_gestores_cambios_fsc` en `try/except` (nunca tumba el ETL; >100 derivados nuevos en un sync = carga masiva, no notifica). `_notificar_jefaturas` también avisa a los gestores del departamento de los FSC del proceso (sin deduplicar). Los eventos del ETL y los plazos se deduplican por (tipo, mensaje) en 7/14 días — el ETL de FSC documenta un bug de upsert que duplica filas. **Plazos de Mercado Público**: `python manage.py notificar_plazos_gestores` (idempotente) — **hay que programarlo a diario** (cron / Programador de tareas); nada lo dispara solo.
- **Gráfico mensual del plan**: `calcular_gestor_plan_mensual` y el filtro `?mes=` de `plan/items/` usan la MISMA fecha (`fecha_mas_proxima` de la ficha) y las mismas fichas, así que cada barra calza con la tabla filtrada por su mes (comprobado en los 24 meses, total y por estado). Cada ficha cuenta UNA vez aunque tenga ítems en varios meses. Fechas fuera de 2015-2045 (año mal digitado en el PAC) cuentan como `sin_fecha` para no estirar el eje continuo. `calcular_pac_ficha_detalle` ganó (aditivo) `unidad_compra`, `codigos_presupuestarios`, `monto_total`, `n_items`, `fecha_mas_proxima`, `fecha_ultima_compra`, `depto_id`; `/pac-cumplimiento` sigue igual.
- **Alcance de PAC**: `plan/*` hereda el límite de PAC Cumplimiento (solo Dirección SS Osorno, establecimiento 1); un departamento de hospital recibe `pac_disponible=false` y ceros.

**Módulo Inicio** (agregado 2026-10-09, `api/services_inicio.py`, vista `inicio_resumen_view`, tests `api/tests/test_inicio_resumen.py`): Home «¿Cómo vamos en <año>?». **No recalcula nada propio**: reutiliza las mismas funciones/definiciones de `/pac` (`calcular_indicadores_res188` → Ind.1 = `i1`, Ind.2 = competitivo), PAC Cumplimiento (`calcular_pac_dentro_fuera_stats` + `_nota_desempeno_pac`), Formularios y Anexo N°3, para que la cifra del Home coincida con la del módulo al que lleva. Comparaciones **«al mismo corte»**: año en curso contra el mismo día del año anterior (`corte_comparable`), año cerrado contra el año anterior completo; el mes en curso del gráfico va marcado parcial. `anios_disponibles` sale del `Min(FechaEnvio)` de OC. `_bloque_deuda` hace 2 consultas livianas en vez de `obtener_kpis_devengo` (5 `group by` sobre ~55k filas, ~5 s en frío) — un test garantiza que da el mismo total. **Trampa de este MariaDB: no tiene cargadas las tablas de zona horaria** (`CONVERT_TZ` devuelve NULL), así que `ExtractMonth`/`ExtractYear`/`__date`/`__month` sobre un `DateTimeField` aware devuelven NULL **sin error** y los tests (SQLite) lo ocultan. Agrupar por mes con rangos de fechas aware (`_limites_meses`) y `Sum(..., filter=Q(...))`; `FechaEnvio__year=N` sí sirve (se traduce a rango). Pendiente sin verificar: `calcular_oc_stats` usa `FechaEnvio__month__lte/gte` (~líneas 447-450) y podría devolver 0 en esta base por lo mismo.

**Módulo Notificación del Plan de Compras** (agregado 2026-10-07, `api/services_notificacion_plan.py` + `services_notificacion_plan_pdf.py`, plantillas `api/templates/notificacion_plan/`, logo liviano `api/assets/logo_correo.png`): pestaña "📧 Notificación" en `/gestor-compras` para avisar por correo a los responsables del PAC que generen su Formulario de Solicitud de Compra en el Panel Documental. Endpoints (todos `gestor-compras/notificacion/…`, GET salvo indicación): `planes/` (?anho=&estado=CSV&mes=YYYY-MM&search=&responsable=&correo=con|sin&notificado=si|no&page=), `responsables-pendientes/`, `confirmar-correo/` (POST {nombre_responsable, correo}), `previsualizar/` (POST, NO envía), `enviar-prueba/` (POST: UN correo de muestra solo a `NOTIF_PLAN_DESTINO_PRUEBA`, sin lote ni registro), `enviar/` (POST → 202 {lote_id}; 409 `reenvio`|`en_curso`|`confirmar_real`; **en modo oficial exige `confirmar_envio_real: true` en el cuerpo, impuesto por el servidor — un POST sin ello no envía nada**), `copias/` (POST {accion: excluir|agregar|olvidar, departamento_id, correo, nombre?}: regla PERMANENTE de copia), `lotes/{id}/` (progreso), `lotes/{id}/pdf/`. `seleccion` = `{anho, ids:[...]}` | `{anho, filtros:{...}, excluir:[...]}`; `previsualizar/enviar/enviar-prueba` aceptan además `ajustes_cc` = `{nombre_responsable: {quitar:[...], agregar:[...]}}` (copias cambiadas SOLO para ese envío).
- **Acceso nominal**: `_IsNotificadorPlan` → `usuario_puede_notificar_plan()`, por correo del usuario en `settings.NOTIF_PLAN_USUARIOS` (`.env`). No basta ser admin/superusuario (403). `mi-alcance/` devuelve `puede_notificar` solo para que la UI muestre la pestaña; la autorización real es el 403 de cada endpoint.
- **MODO OFICIAL desde 2026-10-07** (`.env`: `NOTIF_PLAN_MODO_PRUEBA=False`, `NOTIF_PLAN_CC_JEFATURAS=True`, `NOTIF_PLAN_RESUMEN_CC=cristina.flores@…,sandrap.espinoza@…`): los avisos llegan a los responsables reales. El default del código sigue siendo MODO PRUEBA (`True`: TODO sale solo a `NOTIF_PLAN_DESTINO_PRUEBA`, sin CC, con banner de a quién habría ido) por seguridad si falta la variable. La UI exige marcar una confirmación para enviar en oficial, y el botón "🧪 Enviarme una prueba" (`enviar_prueba()`) manda UN correo de muestra solo a la cuenta de prueba. **`NOTIF_PLAN_RESUMEN_CC` (Cristina y Sandra) NO va en cada aviso: solo recibe el correo resumen con el PDF de cierre.** Ese resumen va Para = quien envía + `NOTIF_PLAN_RESUMEN_PARA` (nicolas.asencio; sin duplicar) y Con copia = `NOTIF_PLAN_RESUMEN_CC` (`resumen_destinatarios()`); la revisión previa muestra esos correos (`resumen_para`/`resumen_cc`). Un cambio en `.env` exige reiniciar el servidor (con `runserver` basta tocar un `.py`). Credenciales SMTP (`EMAIL_*`, Office 365 :587) solo en `.env`. El logo viaja con la estructura MIME `alternative › related › [text/html, image/png <logo>]` (`_clase_correo_con_logo`): con el logo como hermano del bloque `alternative` Outlook de escritorio lo muestra pero **Outlook web lo da por imagen rota**.
- **Notificable** = ficha del PAC (`_calcular_fichas_pac_completo`, la misma fuente de la pestaña Plan) en estado ATRASADO/PENDIENTE/SIN_FECHA, o sea sin FSC ni OC. El filtro `mes` usa `fecha_mas_proxima`, igual que el gráfico mensual.
- **Un correo por PERSONA**, no por texto del nombre: `clave_persona()` agrupa por correo resuelto (el PAC escribe "Yuvit Garcia-Chacur"/"Yuvit García-Chacur" o "Carolina Silva Carolina Silva"; sin esto recibirían varios correos — bug real detectado en la revisión). Cruce nombre→correo: `resolver_correo()` contra `UsuarioPanel.alias` tras `reparar_texto()` (el Panel guarda mojibake cp437: "NU├æEZ") y `normalizar_nombre()` (U+FFFD queda como comodín `?`). Estados: CONFIRMADO/EXACTO (utilizables) vs SUGERIDO/AMBIGUO/SIN_CORREO (hay que confirmar con `confirmar-correo/`; nunca se envía a una sugerencia sin confirmar). Homónimos se desempatan por departamento (`data_pertenencia_usuario`).
- **Jefaturas** = usuarios activos del departamento (y sus ancestros hasta la raíz `es_depto=='SI'`) cuyo cargo contiene Jefe/a, Director/a, Subdirector/a (`es_cargo_jefatura`); no existe un campo "es jefatura" en el Panel. Se identifican siempre (la vista previa las muestra para validarlas) pero solo van en copia con `NOTIF_PLAN_CC_JEFATURAS` (interruptor general de las copias).
- **Copias editables** (`calcular_copias()`, pura): copias finales = jefaturas por cargo (AUTO) + reglas permanentes `AGREGAR` del departamento (REGLA) − reglas `EXCLUIR` ± ajustes SOLO de ese envío (PUNTUAL: un "agregar" puntual gana a una regla excluir; un "quitar" puntual siempre gana). El responsable nunca va en copia de su propio correo. Reglas en `NotificacionPlanCopia` (`data_notif_plan_copia`, único por departamento+correo; agregar y excluir se anulan), por `departamento_id` (el de los planes del responsable; `depto_ref_id` = donde tiene más planes). Se editan en la revisión previa (`EditorCopias.jsx`): cada ✕ / ＋ elige "solo este envío" o "siempre en este departamento", y lo quitado se lista con "↩ Restaurar". `envio.cc` registra lo que SE ENVIÓ de verdad.
- **Envío**: `iniciar_envio()` crea lote/envíos/items en una transacción y envía en un hilo daemon (`ejecutar_envio`, una conexión SMTP, pausa `NOTIF_PLAN_PAUSA_SEG`=2 s: Office 365 limita ~30 correos/min). Un fallo por correo se registra y no detiene al resto; `_mensaje_error()` enmascara la contraseña. Reenviar planes ya avisados de verdad exige `confirmar_reenvio: true` (booleano estricto); un lote ENVIANDO < 15 min bloquea otro; tope `NOTIF_PLAN_MAX_LOTE` (50) por lote. Al cerrar el lote se envía un correo resumen con el PDF (una sola vez; nunca tumba el envío). **Límite conocido**: la guarda contra doble envío no es atómica entre workers (la UI deshabilita el botón); un lote que queda ENVIANDO por reinicio del servidor se cierra como ERROR al consultarlo pasados 15 min.
- **Pruebas**: `python manage.py test api.tests --settings=core.settings_test` (177, SQLite en memoria, correo locmem — jamás envía) y `npm test` en frontend (lógica de selección con `node --test`). Ver `core/settings_test.py` y `core/test_runner.py` (crea las tablas `managed=False`).

**Cache pattern** — all stat endpoints use `LocMemCache` (volatile — lost on restart, not shared across workers):
```python
cache_key = f'my_stats_{param}'
if data := cache.get(cache_key):
    return Response(data)
# compute...
cache.set(cache_key, data, timeout=300)
```

---

## Frontend — layout rule (critical)

**All pages render inside `AppLayout`** (`components/ui/AppLayout.jsx`), which already provides `<Topbar>`, `<Sidebar>`, `<main class="main">` (margin-left: 68px, margin-top: 40px), and `<div class="content">` (padding: 24px 28px 48px).

**Pages must NOT include their own `<Sidebar>`, `<Topbar>`, `<main>`, or `<div class="content">`** — doing so stacks margins and creates ~192px of left whitespace.

```jsx
// ✅ Correct — renders inside AppLayout's .content
export default function MyPage() {
    return (
        <>
            <div className="page-header">
                <div className="page-title"><span className="page-title-icon">📄</span> Title</div>
                <div className="page-subtitle">Subtitle</div>
            </div>
            {/* content */}
        </>
    );
}

// ❌ Wrong — creates double wrapper
export default function MyPage() {
    return (
        <div style={{ display: 'flex' }}>
            <Sidebar /><main className="main"><Topbar /><div className="content">...</div></main>
        </div>
    );
}
```

Feature pages (`features/*/components/*Page.jsx`) use `<div className="feature-page">` as root — this is a no-padding semantic wrapper; AppLayout's `.content` provides the actual padding.

---

## Frontend — routes and feature structure

| Route | Component | Roles |
|---|---|---|
| `/login` | `features/auth/pages/LoginPage` | Public |
| `/` | `features/inicio/components/InicioPage` | Authenticated (`gestor_compras` es redirigido a `/gestor-compras` por `HomeSegunRol`) — tablero «¿Cómo vamos en <año>?»; ver "Módulo Inicio" |
| `/licitaciones` | `pages/Dashboard` | Authenticated |
| `/anexo3/reporte-sigfe` | `features/devengo-sigfe/components/ReporteSigfePage` | Authenticated |
| `/ordenes-compra` | `pages/OrdenesCompraDashboard` | Authenticated |
| `/compra-agil` | `features/compra-agil/components/CompraAgilPage` | Authenticated |
| `/pac` | `features/pac/components/PacDashboardPage` | Authenticated |
| `/pac-cumplimiento` | `features/pac-cumplimiento/components/PacCumplimientoPage` | Authenticated **salvo `gestor_compras`** (backend: `_NoGestorCompras`) — feature separada de `/pac` (Res.188/OC/Compra Ágil); 5 tabs: Resumen, Jerarquía, Rankings, Cumplimiento Temporal, Reportes |
| `/gestor-compras` | `features/gestor-compras/components/GestorComprasPage` | admin, gestor_compras, jefatura, general — solo lectura, por departamento; 3 tabs: Solicitudes, Derivación a Comprador, Plan de Compra. Ver sección "Módulo Gestor de Compras" |
| `/fsc-oc-pac` | `features/fsc-oc-pac/components/FscOcPacPage` | admin, abastecimiento, general — 7 tabs: Resumen, Jerarquía, Revisión Pendientes, Corregidas, Impacto, Detalle, Compra Ágil. Único módulo del sistema con el sistema de diseño DV-UI aplicado (`features/fsc-oc-pac/styles/dv-ui.css`) — ver nota abajo |
| `/abastecimiento/*` | `features/abastecimiento/` | admin, abastecimiento, viewer |
| `/finanzas/*` | `features/finanzas/` | admin, finanzas |

New modules go in `src/features/<domain>/` with `api/`, `components/`, `hooks/`, `routes/` subdirectories. HTTP calls always through `src/lib/axios.js` (has JWT interceptors and automatic token refresh). Auth state only via `useAuth()` from `src/store/authStore.jsx`.

---

## Known issues to fix before production

| Priority | Issue | Location |
|---|---|---|
| 🔴 | `SECRET_KEY` and DB password hardcoded in source | `backend/core/settings.py` |
| 🟢 | ~~`DEBUG = True` and `ALLOWED_HOSTS = ['*']`~~ — already fixed: `DEBUG = False`, `ALLOWED_HOSTS = ['10.8.153.227', 'localhost', '127.0.0.1']` | `backend/core/settings.py` |
| 🔴 | DB user is `root` — needs least-privilege user | MariaDB |
| 🟠 | `CORS_ALLOW_ALL_ORIGINS = True` | `backend/core/settings.py` |
| 🟠 | SSL verification disabled in Mercado Público API calls | `api/*.py` ETL scripts |
| 🟠 | ETL uses DELETE+bulk_create without atomic rollback | `api/LI_SSO_SERVER.py`, `OC_SSO_SERVER.py` |
| 🟡 | `LocMemCache` is volatile and not shared across Gunicorn workers | `backend/core/settings.py` |
| 🟡 | `facturas_raw_all` filters year with Python string slicing instead of DB query | `backend/api/views.py:facturas_raw_all` |
| 🟡 | `Factura.emision` stored as DD-MM-YYYY string — can't index or range-query | `backend/api/models.py` |
| 🟡 | No DB indexes on frequent filter columns (EstadoOC, FechaEnvio, estadoglosa) | `backend/api/models.py` |
| 🟢 | Delete utility scripts not meant for production | `backend/fix_login.py`, `backend/add_cols.py`, `backend/run_err.txt` |
| 🟢 | `ordenes_compra/` app empty, not in INSTALLED_APPS | `backend/ordenes_compra/models.py` |
