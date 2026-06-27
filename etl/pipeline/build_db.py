#!/usr/bin/env python3
"""
Observatorio Nacional de Justicia del Peru
Carga los JSON de ``site/data/*.json`` a una base DuckDB local para analitica ad-hoc.

Los JSON los produce ``etl/generate_synthetic.py`` (datos sinteticos) o, mas adelante,
el ETL oficial (etl/sources/*). Este script es agnostico: lee cada dataset disponible
y crea/reemplaza una tabla DuckDB con el mismo nombre usando ``read_json_auto``.

Salida: data/processed/justicia.duckdb

Uso:
    python3 etl/pipeline/build_db.py
"""
from __future__ import annotations

from pathlib import Path

import duckdb

# Raiz del repo: este archivo esta en etl/pipeline/ -> parents[2] == raiz.
ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "site" / "data"
DB_DIR = ROOT / "data" / "processed"
DB_PATH = DB_DIR / "justicia.duckdb"

# Datasets a cargar: nombre de archivo JSON -> nombre de tabla DuckDB.
DATASETS: dict[str, str] = {
    "nacional.json": "nacional",
    "cortes.json": "corte",
    "departamentos.json": "departamento",
    "series.json": "series",
    "tipos_proceso.json": "tipo_proceso",
    "jueces.json": "juez",
    "fiscales.json": "fiscal",
    "casos_seguridad.json": "caso_seguridad",
}


def load_dataset(con: duckdb.DuckDBPyConnection, json_path: Path, table: str) -> int:
    """Crea/reemplaza una tabla DuckDB desde un archivo JSON. Devuelve N de filas."""
    # read_json_auto infiere el esquema; format='auto' maneja arrays y objetos sueltos.
    con.execute(
        f"CREATE OR REPLACE TABLE {table} AS "
        f"SELECT * FROM read_json_auto(?, format='auto')",
        [str(json_path)],
    )
    (n_rows,) = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
    return int(n_rows)


def main() -> None:
    if not DATA_DIR.exists():
        raise SystemExit(
            f"No existe {DATA_DIR}. Genera primero los datos: "
            f"python3 etl/generate_synthetic.py"
        )

    DB_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Construyendo DuckDB en: {DB_PATH.relative_to(ROOT)}")

    con = duckdb.connect(str(DB_PATH))
    try:
        total = 0
        for filename, table in DATASETS.items():
            json_path = DATA_DIR / filename
            if not json_path.exists():
                print(f"  [skip] {filename} no encontrado")
                continue
            n = load_dataset(con, json_path, table)
            total += n
            print(f"  [ok]   {table:<16} <- {filename:<22} ({n} filas)")
        con.commit()
    finally:
        con.close()

    print(f"Listo. {total} filas cargadas en {DB_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
