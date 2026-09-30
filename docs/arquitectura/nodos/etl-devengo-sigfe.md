# ETL Devengo SIGFE
- **Cluster:** ETL Presupuesto (SIGFE/DIPRES/PAC)
- **Tipo:** script
- **Ubicación:** api/data/data_devengo/sigfe_descarga_devengos_Completo.py, consolidar_devengo_anual.py
- **Tecnología:** Python 3 + Selenium

## Qué hace
Inicia sesión en el portal SIGFE y descarga el devengo por establecimiento y documento. `consolidar_devengo_anual.py` calcula un `doc_key` (hash de la identidad del documento) y hace upsert-por-reemplazo: el saldo vivo de cada documento se sobrescribe en la misma fila en vez de acumular snapshots. Alimenta el Anexo N°3 (Control de Deuda).

## Entradas / Salidas
- **Entrada:** usuario/clave SIGFE + rango de fechas.
- **Salida:** filas en `DevengoSigfeAnual` (tabla `api_sigfe_devengo_anual`).

## Depende de →
- `sigfe-web`, `mariadb`

## Lo usan ←
- `backend-etl-runner`

## Riesgos / notas
Antes de la migración `0044` (2026-09-03) se acumulaba una fila nueva por cada cambio de saldo sin borrar la anterior, lo que subestimaba la deuda real (`monto_disponible`) en los KPIs — ya corregido, pero es la razón de que `doc_key` sea `unique=True` hoy.
