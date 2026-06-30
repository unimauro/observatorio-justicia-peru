#!/usr/bin/env python3
"""
ETL geo-anual: delitos denunciados del MPFN por DEPARTAMENTO y por ANIO.

Alimenta el filtro por anio del mapa del Observatorio. Reutiliza el contrato de
salida de build_real.py (_meta {fuente, fecha_corte, cobertura, granularidad, url})
y los mismos principios NO negociables del SPEC.md:
  - Nunca inventar datos: cantidades < 0 o anios fuera de rango se descartan.
  - Conservar `fuente`, `fecha_corte` y `url` en _meta.
  - Departamentos normalizados a MAYUSCULAS sin tildes, alineados con
    site/data/peru_departamentos.geojson (prop NOMBDEP).

Fuente:
  dataset `mpfn-delitos-denunciados` (datosabiertos.gob.pe). Un CSV por anio
  (2019..2026). Columnas relevantes: anio_denuncia, dpto_pjfs, cantidad.

Salida:
  site/data/real/delitos_depto_anual.json (versionado)

Uso:
    python3 etl/pipeline/build_geo_anual.py
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import unicodedata
import urllib.parse
from pathlib import Path

import pandas as pd

# Permite importar fetch tanto como modulo como suelto.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
GEOJSON = ROOT / "site" / "data" / "peru_departamentos.geojson"
OUT = ROOT / "site" / "data" / "real"

MPFN_DELITOS_SLUG = "mpfn-delitos-denunciados"
ANIO_MIN, ANIO_MAX = 2019, 2026


def to_num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce")


def norm_dep(s: str) -> str:
    """MAYUSCULAS sin tildes, alineado con NOMBDEP del geojson."""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.upper().strip()


def departamentos_geojson() -> set[str]:
    """Conjunto de los 25 NOMBDEP oficiales (para validar/filtrar)."""
    g = json.loads(GEOJSON.read_text(encoding="utf-8"))
    return {norm_dep(f["properties"]["NOMBDEP"]) for f in g["features"]}


def fecha_corte_de(df: pd.DataFrame, col: str = "fecha_corte") -> str | None:
    if col not in df.columns:
        return None
    vals = df[col].dropna().astype(str).str.strip()
    vals = vals[vals != ""]
    if vals.empty:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%Y%m%d"):
        d = pd.to_datetime(vals, format=fmt, errors="coerce").dropna()
        if not d.empty:
            return d.max().strftime("%Y-%m-%d")
    return sorted(vals.unique())[-1]


def download_all() -> list[Path]:
    """Descarga TODOS los CSV del dataset a data/raw/mpfn/delitos (idempotente)."""
    paths: list[Path] = []
    subdir = RAW / "mpfn" / "delitos"
    try:
        resources = fetch.csv_resources(MPFN_DELITOS_SLUG)
    except Exception as e:  # noqa: BLE001
        print(f"  WARN no se pudo consultar la API ({e}); uso CSV ya presentes en {subdir}")
        resources = []
    for r in resources:
        fname = urllib.parse.unquote(r["url"].rsplit("/", 1)[-1])
        try:
            paths.append(fetch.download(r["url"], subdir / fname))
        except Exception as e:  # noqa: BLE001
            print(f"  WARN no se pudo bajar {r['url']}: {e}")
    # union con lo que ya exista en disco (la API a veces no lista todos los anios)
    paths += [p for p in sorted(subdir.glob("*.csv")) if p not in paths]
    # dedup conservando orden
    seen, uniq = set(), []
    for p in paths:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    return uniq


def read_concat(paths: list[Path]) -> pd.DataFrame:
    frames = []
    for p in paths:
        try:
            frames.append(fetch.read_csv_smart(p))
        except Exception as e:  # noqa: BLE001
            print(f"  WARN no se pudo leer {p.name}: {e}")
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def build() -> dict:
    print("## MPFN delitos denunciados por departamento y anio")
    paths = download_all()
    print(f"  CSV disponibles: {len(paths)}")
    for p in paths:
        print(f"    - {p.name}")
    df = read_concat(paths)
    if df.empty:
        raise RuntimeError("sin CSV legibles del dataset mpfn-delitos-denunciados")

    n0 = len(df)
    anio_col = "anio_denuncia" if "anio_denuncia" in df.columns else "anio"
    df["anio"] = to_num(df[anio_col])
    df["cantidad_n"] = to_num(df["cantidad"]).fillna(0)
    df["departamento"] = df["dpto_pjfs"].map(norm_dep)

    valid_deps = departamentos_geojson()
    bad_anio = (df["anio"] < ANIO_MIN) | (df["anio"] > ANIO_MAX) | df["anio"].isna()
    bad_cant = df["cantidad_n"] < 0
    bad_dep = ~df["departamento"].isin(valid_deps)
    bad = bad_anio | bad_cant | bad_dep
    n_drop = int(bad.sum())
    dropped_deps = sorted(set(df.loc[bad_dep, "departamento"].unique()))
    df = df[~bad].copy()
    df["anio"] = df["anio"].astype(int)
    print(f"  filas={n0} descartadas={n_drop} validas={len(df)} "
          f"(deps no-geojson descartados: {dropped_deps})")

    # Agregacion (departamento, anio).
    g = df.groupby(["anio", "departamento"])["cantidad_n"].sum().reset_index()
    anios = sorted(int(a) for a in g["anio"].unique())

    por_anio_departamento: dict[str, dict[str, int]] = {}
    for a in anios:
        sub = g[g["anio"] == a].sort_values("cantidad_n", ascending=False)
        por_anio_departamento[str(a)] = {
            r.departamento: int(r.cantidad_n) for r in sub.itertuples()
        }

    total_por_anio = [
        {"anio": a, "cantidad": int(g.loc[g["anio"] == a, "cantidad_n"].sum())}
        for a in anios
    ]

    fcorte = fecha_corte_de(df)
    nota = ("Totales geocodables: se excluyen denuncias con departamento '#N/D' "
            "(no asignado, no ubicable en el mapa), por lo que pueden quedar por "
            "debajo del total nacional de mpfn_delitos.json.")
    if ANIO_MAX in anios:
        nota += (f" {ANIO_MAX} es parcial (corte de anio en curso, "
                 f"fecha_corte={fcorte}): cifras menores, no comparables con "
                 f"anios completos.")

    meta = {
        "fuente": "Ministerio Publico (MPFN)",
        "fecha_corte": fcorte,
        "cobertura": f"Nacional por departamento, {anios[0]}-{anios[-1]}",
        "granularidad": "agregado",
        "url": f"https://www.datosabiertos.gob.pe/dataset/{MPFN_DELITOS_SLUG}",
        "nota": nota,
    }
    return {
        "_meta": meta,
        "anios": anios,
        "por_anio_departamento": por_anio_departamento,
        "total_por_anio": total_por_anio,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    out = build()
    dest = OUT / "delitos_depto_anual.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  -> escrito {dest.relative_to(ROOT)}")

    print("\n## Resumen")
    print(f"  anios: {out['anios']}")
    for t in out["total_por_anio"]:
        print(f"    {t['anio']}: {t['cantidad']:,}")
    n_dep = len(next(iter(out['por_anio_departamento'].values())))
    print(f"  departamentos (primer anio): {n_dep}")
    print(f"  generado_utc: {dt.datetime.now(dt.timezone.utc).isoformat()}")


if __name__ == "__main__":
    main()
