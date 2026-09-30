# Servicios ML
- **Cluster:** Backend API (Django REST)
- **Tipo:** módulo
- **Ubicación:** backend/api/ml_services.py
- **Tecnología:** scikit-learn 1.8 + mlxtend + nltk

## Qué hace
Aplica algoritmos de Machine Learning sobre los datos de Compra Ágil: TF-IDF + K-means para agrupar productos similares, Apriori/FP-Growth para encontrar asociaciones de compra por proveedor o comprador, y un scoring multicriterio para sugerir candidatos a convenio marco.

## Entradas / Salidas
- **Entrada:** parámetros como `n_clusters`, `min_support`, `umbral_monto`.
- **Salida:** resultados numéricos (siempre convertidos de tipos numpy a tipos nativos de Python antes de responder).

## Depende de →
- `mariadb`

## Lo usan ←
- `backend-api`

## Riesgos / notas
Los resultados de clustering/asociaciones se cachean 15 min — no reflejan cambios instantáneos en la base.
