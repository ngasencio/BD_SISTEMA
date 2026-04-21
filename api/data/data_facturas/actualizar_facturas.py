"""
=============================================================
  SSO Abastecimiento — Actualizador de data_facturas
  Uso: python actualizar_facturas.py ruta/al/archivo.xlsx
  
  Requisitos:
    pip install pandas openpyxl sqlalchemy pymysql
=============================================================
"""

import sys
import pandas as pd
from sqlalchemy import create_engine, text
from datetime import datetime

# ── CONFIGURACIÓN ─────────────────────────────────────────
DB_USER     = "root"          # tu usuario MySQL
DB_PASSWORD = ""              # tu contraseña MySQL
DB_HOST     = "localhost"
DB_PORT     = "3306"
DB_NAME     = "bd_sistema"
TABLE_NAME  = "data_facturas"

# Columna que identifica unívocamente una factura
# folio + emisor juntos = clave única (un proveedor no repite folio)
UNIQUE_COLS = ["folio", "emisor"]
# ──────────────────────────────────────────────────────────


def conectar():
    url = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
    engine = create_engine(url)
    return engine


def limpiar_dataframe(df):
    """Limpia y normaliza el DataFrame antes de insertar."""

    # Convertir fechas a string para evitar problemas de formato
    date_cols = ["publicacion", "emision", "fecha_vencimiento"]
    for col in date_cols:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.strftime("%d-%m-%Y %H:%M").where(
                df[col].notna(), other=None
            )

    # Convertir columnas numéricas problemáticas a string
    str_cols = ["codigo_devengo", "ticket_devengo", "folio_sigfe",
                "area_transaccional", "rut_usuario_resp"]
    for col in str_cols:
        if col in df.columns:
            df[col] = df[col].apply(
                lambda x: str(int(x)) if pd.notna(x) and str(x).replace(".0","").isdigit() else (str(x) if pd.notna(x) else None)
            )

    # Reemplazar NaN con None (NULL en SQL)
    df = df.where(pd.notna(df), other=None)

    # Limpiar espacios en RUTs
    for col in ["emisor", "receptor"]:
        if col in df.columns:
            df[col] = df[col].str.strip()

    return df


def obtener_existentes(engine):
    """Retorna un set de (folio, emisor) ya existentes en la BD."""
    query = f"SELECT folio, emisor FROM `{TABLE_NAME}`"
    with engine.connect() as conn:
        result = conn.execute(text(query))
        return set((str(row[0]), str(row[1]).strip()) for row in result)


def actualizar(archivo_excel):
    print(f"\n{'='*55}")
    print(f"  Actualizador data_facturas — SSO Abastecimiento")
    print(f"  Archivo: {archivo_excel}")
    print(f"  Fecha:   {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print(f"{'='*55}\n")

    # 1. Leer Excel
    print("📂 Leyendo Excel...")
    try:
        df = pd.read_excel(archivo_excel, dtype=str)  # todo como string primero
        df_original = pd.read_excel(archivo_excel)    # tipado real para fechas
        # Aplicar fechas del tipado real
        for col in ["publicacion", "emision", "fecha_vencimiento"]:
            if col in df_original.columns:
                df[col] = df_original[col]
    except Exception as e:
        print(f"❌ Error leyendo el archivo: {e}")
        sys.exit(1)

    print(f"   → {len(df)} registros encontrados en el Excel")

    # 2. Limpiar
    print("🧹 Limpiando datos...")
    df = limpiar_dataframe(df)

    # 3. Conectar a BD
    print("🔌 Conectando a la base de datos...")
    try:
        engine = conectar()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print(f"   → Conectado a {DB_NAME} en {DB_HOST}")
    except Exception as e:
        print(f"❌ Error de conexión: {e}")
        print("   Verifica DB_USER, DB_PASSWORD y que MySQL esté corriendo")
        sys.exit(1)

    # 4. Obtener registros existentes
    print("🔍 Verificando registros existentes...")
    existentes = obtener_existentes(engine)
    print(f"   → {len(existentes)} registros en la BD actualmente")

    # 5. Filtrar solo los nuevos
    df["_key"] = df["folio"].astype(str) + "||" + df["emisor"].astype(str).str.strip()
    existentes_key = set(f"{f}||{e}" for f, e in existentes)
    
    df_nuevos    = df[~df["_key"].isin(existentes_key)].copy()
    df_existentes = df[df["_key"].isin(existentes_key)].copy()
    
    df_nuevos.drop(columns=["_key"], inplace=True)
    df_existentes.drop(columns=["_key"], inplace=True)

    print(f"   → {len(df_nuevos)} registros NUEVOS para insertar")
    print(f"   → {len(df_existentes)} registros ya existentes (se actualizarán)")

    # 6. Insertar nuevos
    if len(df_nuevos) > 0:
        print(f"\n➕ Insertando {len(df_nuevos)} registros nuevos...")
        try:
            df_nuevos.to_sql(
                TABLE_NAME,
                con=engine,
                if_exists="append",
                index=False,
                chunksize=200,
                method="multi"
            )
            print(f"   ✅ {len(df_nuevos)} registros insertados")
        except Exception as e:
            print(f"   ❌ Error insertando: {e}")

    # 7. Actualizar existentes (UPDATE fila por fila en lotes)
    if len(df_existentes) > 0:
        print(f"\n🔄 Actualizando {len(df_existentes)} registros existentes...")
        cols = [c for c in df_existentes.columns if c not in ["id"]]
        actualizados = 0

        with engine.begin() as conn:
            for _, row in df_existentes.iterrows():
                set_clause = ", ".join([f"`{c}` = :{c}" for c in cols if c not in UNIQUE_COLS])
                where_clause = " AND ".join([f"`{c}` = :{c}" for c in UNIQUE_COLS])
                sql = f"UPDATE `{TABLE_NAME}` SET {set_clause} WHERE {where_clause}"
                params = {c: (None if pd.isna(row[c]) else row[c]) for c in cols}
                conn.execute(text(sql), params)
                actualizados += 1

        print(f"   ✅ {actualizados} registros actualizados")

    # 8. Resumen final
    with engine.connect() as conn:
        total = conn.execute(text(f"SELECT COUNT(*) FROM `{TABLE_NAME}`")).scalar()

    print(f"\n{'='*55}")
    print(f"  ✅ Proceso completado")
    print(f"  📊 Total registros en BD: {total}")
    print(f"  ➕ Insertados:  {len(df_nuevos)}")
    print(f"  🔄 Actualizados: {len(df_existentes)}")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\nUso: python actualizar_facturas.py ruta/al/archivo.xlsx")
        print("Ejemplo: python actualizar_facturas.py Facturas2026.xlsx\n")
        sys.exit(1)

    actualizar(sys.argv[1])
