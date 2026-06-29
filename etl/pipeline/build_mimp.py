#!/usr/bin/env python3
"""
ETL REAL - Iteracion 4 (MIMP / Programa AURORA / Centros Emergencia Mujer).

Integra datos del Ministerio de la Mujer y Poblaciones Vulnerables (MIMP) sobre
violencia contra la mujer e integrantes del grupo familiar, feminicidios y
tentativas de feminicidio atendidos por los Centros Emergencia Mujer (CEM).

Reusa el estilo y el contrato de salida de build_real_2.py (JSON con _meta
{fuente, fecha_corte, cobertura, granularidad, url}) y los helpers de fetch.py.
NO sobreescribe los JSON existentes ni el frontend: ANADE mimp_violencia.json y
hace UPSERT (no reemplazo) del manifest.

Respeta los principios NO negociables del SPEC.md (§7):
  - Nunca inventar datos: si un sub-bloque no se arma, {error, total:null} y sigue.
  - Conservar `fuente` y `fecha_corte`.
  - Anonimizar (DNI, nombres) ANTES de procesar.
  - Distinguir granularidad: aqui todo es AGREGADO (una fila = un CEM/anio).

Fuentes (datosabiertos.gob.pe, slugs verificados via package_list 2026-06):
  - mimp-numero-...-casos-atendidos-por-violencia-contra-la-mujer...   (2.1.1 BdD_CEM_Casos)
  - mimp-...-victimas-de-feminicidio-atendidas-por-los-cem...          (2.4.1 BdD_Feminicidio)
  - mimp-...-tentativa-de-feminicidio-atendidos-por-los-cem...         (2.4.2 BdD_Tentativa_Feminicidio)
Cada dataset publica SNAPSHOTS acumulativos ("a Noviembre 2022", ..., "a
Diciembre 2025"). Se usa SOLO el snapshot mas reciente (el mas completo); NO se
concatenan snapshots (duplicaria los anios). Todas las filas son agregados
anuales (PERIODO "ENE - DIC"), por lo que sumar no double-cuenta.

Salidas:
  site/data/real/mimp_violencia.json   (contrato del observatorio)
  site/data/real/manifest.json         (upsert de la entrada mimp_violencia)
  data/processed/mimp_*.parquet        (tidy, NO versionado)
  docs/REPORTE_ETL.md                  (append "## Iteracion 4 (MIMP/CEM)")

Uso:
    python3 etl/pipeline/build_mimp.py
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

import pandas as pd

# Permite importar fetch tanto como modulo como suelto.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "mimp"
PROCESSED = ROOT / "data" / "processed"
OUT = ROOT / "site" / "data" / "real"
DOCS = ROOT / "docs"

ANIO_MIN, ANIO_MAX = 2002, 2026
PRIVADAS = ["DNI", "NOMBRES", "APELLIDOS", "NOMBRE", "FECHA_NACIMIENTO",
            "FEC_NACIMIENTO", "NOMBRE_COMPLETO"]  # regla §7 SPEC

# Slugs verificados via package_list (los oficiales llevan prefijo "mimp-" y tildes).
SLUG_CASOS = ("mimp-número-de-casos-atendidos-por-violencia-contra-la-mujer-"
              "integrantes-del-grupo-familiar")
SLUG_FEMIN = ("mimp-número-de-casos-de-víctimas-de-feminicidio-atendidas-"
              "por-los-cem-según-grupo-de-edad")
SLUG_TENT = ("mimp-número-de-casos-de-tentativa-de-feminicidio-atendidos-"
             "por-los-cem-según-grupo-de-edad")

# Snapshot mas reciente de cada dataset (a Diciembre 2025). Si MIMP publica uno
# nuevo, basta con apuntar a la URL del recurso mas reciente del package_show.
URL_CASOS = ("https://www.datosabiertos.gob.pe/sites/default/files/"
             "2.1.1%20BdD_CEM_Casos_9.csv")
URL_FEMIN = ("https://www.datosabiertos.gob.pe/sites/default/files/"
             "2.4.1%20BdD_Feminicidio_11.csv")
URL_TENT = ("https://www.datosabiertos.gob.pe/sites/default/files/"
            "2.4.2%20BdD_Tentativa_Feminicidio_12.csv")

REPORT: list[str] = []


def log(msg: str) -> None:
    print(msg)
    REPORT.append(msg)


def write_json(name: str, obj) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2),
                            encoding="utf-8")
    log(f"  -> escrito site/data/real/{name}")


def merge_manifest(entries: list[dict]) -> None:
    """Lee el manifest actual y hace UPSERT por id (no borra el resto)."""
    path = OUT / "manifest.json"
    if path.exists():
        cur = json.loads(path.read_text(encoding="utf-8"))
    else:
        cur = {"datasets": []}
    by_id = {d["id"]: d for d in cur.get("datasets", [])}
    for e in entries:
        by_id[e["id"]] = e
    cur["datasets"] = list(by_id.values())
    cur["generado_utc"] = dt.datetime.now(dt.timezone.utc).isoformat()
    write_json("manifest.json", cur)


def anonimizar(df: pd.DataFrame) -> pd.DataFrame:
    """Elimina columnas con datos personales (§7 SPEC). Insensible a may/min."""
    drop = [c for c in df.columns if str(c).strip().upper() in
            {p.upper() for p in PRIVADAS}]
    return df.drop(columns=drop) if drop else df


def _norm(s: str) -> str:
    """Normaliza un nombre de columna: trim + colapsa espacios + mayusculas."""
    return re.sub(r"\s+", " ", str(s).strip()).upper()


def find_col(df: pd.DataFrame, *needles: str) -> str | None:
    """Halla la primera columna cuyo nombre normalizado contiene TODOS los needles."""
    keys = [_norm(n) for n in needles]
    for c in df.columns:
        cn = _norm(c)
        if all(k in cn for k in keys):
            return c
    return None


def to_num(s: pd.Series) -> pd.Series:
    """Numerico tolerante: quita separadores de miles (coma) y espacios."""
    return pd.to_numeric(
        s.astype(str).str.replace(",", "", regex=False).str.strip(),
        errors="coerce")


def anio_col(df: pd.DataFrame) -> pd.Series:
    col = find_col(df, "AÑO") or find_col(df, "ANIO") or find_col(df, "ANO")
    return to_num(df[col])


def fecha_corte_dmy(df: pd.DataFrame) -> str | None:
    """fecha_corte = max de la columna de fecha de reporte/envio (dd/mm/yyyy)."""
    col = (find_col(df, "FECHA", "REPORTE") or find_col(df, "FECHA", "ENVIO")
           or find_col(df, "FECHA"))
    if not col:
        return None
    d = pd.to_datetime(df[col].astype(str).str.strip(),
                       format="%d/%m/%Y", errors="coerce").dropna()
    return d.max().strftime("%Y-%m-%d") if not d.empty else None


def por_anio(df: pd.DataFrame, valcol: str) -> list[dict]:
    g = df.groupby("anio")[valcol].sum().sort_index()
    return [{"anio": int(a), "cantidad": int(v)} for a, v in g.items()]


def url(slug: str) -> str:
    return f"https://www.datosabiertos.gob.pe/dataset/{slug}"


# ===========================================================================
# 1) CASOS atendidos por violencia (CEM) - agregado anual por centro/depto
# ===========================================================================
def build_casos() -> dict:
    p = fetch.download(URL_CASOS, RAW / "2.1.1_BdD_CEM_Casos.csv")
    df = anonimizar(fetch.read_csv_smart(p))
    n0 = len(df)
    df["anio"] = anio_col(df)
    total_col = find_col(df, "CASOS ATENDIDOS", "TOTAL") or find_col(df, "CASOS", "TOTAL")
    df["total_n"] = to_num(df[total_col]).fillna(0)
    bad = ((df["total_n"] < 0) | (df["anio"] < ANIO_MIN) |
           (df["anio"] > ANIO_MAX) | df["anio"].isna())
    df = df[~bad].copy()
    anios = sorted(df["anio"].dropna().unique().astype(int))
    log(f"  casos: filas={n0} validas={len(df)} anios={anios[0]}-{anios[-1]}")

    # por_departamento (top 25)
    dcol = find_col(df, "DEPARTAMENTO")
    gd = df.groupby(df[dcol].astype(str).str.strip())["total_n"].sum()
    por_depto = [{"departamento": k, "cantidad": int(v)} for k, v in
                 gd.sort_values(ascending=False).head(25).items()]

    # por_tipo de violencia (un caso puede presentar mas de un tipo -> no suma al total)
    tipos = {
        "Psicologica": find_col(df, "VIOLENCIA PSICOLOGICA"),
        "Fisica": find_col(df, "VIOLENCIA FISICA"),
        "Sexual": find_col(df, "VIOLENCIA SEXUAL"),
        "Economica o patrimonial": find_col(df, "VIOLENCIA ECON"),
    }
    por_tipo = []
    for nombre, col in tipos.items():
        if col is not None:
            por_tipo.append({"tipo": nombre, "cantidad": int(to_num(df[col]).fillna(0).sum())})
    por_tipo.sort(key=lambda d: d["cantidad"], reverse=True)

    PROCESSED.mkdir(parents=True, exist_ok=True)
    df[["anio", dcol, "total_n"]].rename(
        columns={dcol: "departamento", "total_n": "casos"}).assign(
        fuente="MIMP - AURORA / CEM (datosabiertos.gob.pe)",
        granularidad="agregado").to_parquet(
        PROCESSED / "mimp_casos_violencia.parquet", index=False)

    total = int(df["total_n"].sum())
    log(f"  casos: total={total:,} departamentos={len(por_depto)}")
    return {
        "total": total,
        "por_anio": por_anio(df, "total_n"),
        "por_departamento": por_depto,
        "por_tipo": por_tipo,
        "nota": "Un mismo caso puede presentar mas de un tipo de violencia; "
                "por ello la suma de por_tipo no coincide con el total de casos.",
        "_fecha_corte": fecha_corte_dmy(df),
        "_anios": anios,
    }


# ===========================================================================
# 2) FEMINICIDIOS atendidos por los CEM - agregado por depto/anio
# ===========================================================================
def build_feminicidios() -> dict:
    p = fetch.download(URL_FEMIN, RAW / "2.4.1_BdD_Feminicidio.csv")
    df = anonimizar(fetch.read_csv_smart(p))
    n0 = len(df)
    df["anio"] = anio_col(df)
    tcol = find_col(df, "DE CASOS", "MUJERES") or find_col(df, "CASOS", "MUJERES")
    df["total_n"] = to_num(df[tcol]).fillna(0)
    bad = ((df["total_n"] < 0) | (df["anio"] < ANIO_MIN) |
           (df["anio"] > ANIO_MAX) | df["anio"].isna())
    df = df[~bad].copy()
    anios = sorted(df["anio"].dropna().unique().astype(int))
    log(f"  feminicidios: filas={n0} validas={len(df)} anios={anios[0]}-{anios[-1]}")

    # por_vinculo relacional del agresor
    vinculos = {
        "Pareja": find_col(df, "VINCULO RELACIONAL", "PAREJA") if not find_col(df, "VINCULO RELACIONAL", "EX PAREJA") else None,
        "Ex pareja": find_col(df, "VINCULO RELACIONAL", "EX PAREJA"),
        "Familiar": find_col(df, "VINCULO RELACIONAL", "FAMILIAR"),
        "Conocido": find_col(df, "VINCULO RELACIONAL", "CONOCIDO"),
        "Desconocido": find_col(df, "VINCULO RELACIONAL", "DESCONOCIDO"),
        "Otros": find_col(df, "VINCULO RELACIONAL", "OTROS"),
    }
    # "Pareja" se confunde con "EX PAREJA" en el find por substring -> resolver aparte.
    col_pareja = None
    for c in df.columns:
        cn = _norm(c)
        if "VINCULO RELACIONAL" in cn and "PAREJA" in cn and "EX" not in cn:
            col_pareja = c
            break
    vinculos["Pareja"] = col_pareja
    por_vinculo = []
    for nombre, col in vinculos.items():
        if col is not None:
            por_vinculo.append({"vinculo": nombre, "cantidad": int(to_num(df[col]).fillna(0).sum())})
    por_vinculo.sort(key=lambda d: d["cantidad"], reverse=True)

    # por_grupo_edad
    grupos = ["0_5", "6_11", "12_17", "18_29", "30_59", "60_MÁS"]
    etiquetas = {"0_5": "0-5", "6_11": "6-11", "12_17": "12-17",
                 "18_29": "18-29", "30_59": "30-59", "60_MÁS": "60 a mas"}
    por_edad = []
    for g in grupos:
        col = find_col(df, "FEMINICIDIO", g, "MUJERES") or find_col(df, g, "MUJERES")
        if col is not None:
            por_edad.append({"grupo": etiquetas[g],
                             "cantidad": int(to_num(df[col]).fillna(0).sum())})

    PROCESSED.mkdir(parents=True, exist_ok=True)
    dcol = find_col(df, "DEPARTAMENTO")
    df[["anio", dcol, "total_n"]].rename(
        columns={dcol: "departamento", "total_n": "feminicidios"}).assign(
        fuente="MIMP - AURORA / CEM (datosabiertos.gob.pe)",
        granularidad="agregado").to_parquet(
        PROCESSED / "mimp_feminicidios.parquet", index=False)

    total = int(df["total_n"].sum())
    log(f"  feminicidios: total={total:,} vinculos={len(por_vinculo)} edades={len(por_edad)}")
    return {
        "total": total,
        "por_anio": por_anio(df, "total_n"),
        "por_vinculo": por_vinculo,
        "por_grupo_edad": por_edad,
        "_fecha_corte": fecha_corte_dmy(df),
        "_anios": anios,
    }


# ===========================================================================
# 3) TENTATIVAS de feminicidio atendidas por los CEM - agregado por anio
# ===========================================================================
def build_tentativas() -> dict:
    p = fetch.download(URL_TENT, RAW / "2.4.2_BdD_Tentativa_Feminicidio.csv")
    df = anonimizar(fetch.read_csv_smart(p))
    n0 = len(df)
    df["anio"] = anio_col(df)
    tcol = find_col(df, "DE CASOS", "MUJERES") or find_col(df, "CASOS", "MUJERES")
    df["total_n"] = to_num(df[tcol]).fillna(0)
    bad = ((df["total_n"] < 0) | (df["anio"] < ANIO_MIN) |
           (df["anio"] > ANIO_MAX) | df["anio"].isna())
    df = df[~bad].copy()
    anios = sorted(df["anio"].dropna().unique().astype(int))
    log(f"  tentativas: filas={n0} validas={len(df)} anios={anios[0]}-{anios[-1]}")

    PROCESSED.mkdir(parents=True, exist_ok=True)
    dcol = find_col(df, "DEPARTAMENTO")
    df[["anio", dcol, "total_n"]].rename(
        columns={dcol: "departamento", "total_n": "tentativas"}).assign(
        fuente="MIMP - AURORA / CEM (datosabiertos.gob.pe)",
        granularidad="agregado").to_parquet(
        PROCESSED / "mimp_tentativas.parquet", index=False)

    total = int(df["total_n"].sum())
    log(f"  tentativas: total={total:,}")
    return {
        "total": total,
        "por_anio": por_anio(df, "total_n"),
        "_fecha_corte": fecha_corte_dmy(df),
        "_anios": anios,
    }


# ===========================================================================
# Orquestacion
# ===========================================================================
def _safe(fn, etiqueta: str) -> dict:
    try:
        return fn()
    except Exception as e:  # noqa: BLE001
        import traceback
        log(f"  ERROR {etiqueta}: {e}\n{traceback.format_exc()}")
        return {"error": str(e), "total": None}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    log("# REPORTE ETL REAL - Iteracion 4 (MIMP/CEM) - Observatorio Justicia Peru")
    log(f"Ejecutado (UTC): {dt.datetime.now(dt.timezone.utc).isoformat()}")

    log("\n## Casos de violencia contra la mujer (CEM)")
    casos = _safe(build_casos, "casos")
    log("\n## Feminicidios atendidos por los CEM")
    femin = _safe(build_feminicidios, "feminicidios")
    log("\n## Tentativas de feminicidio atendidas por los CEM")
    tent = _safe(build_tentativas, "tentativas")

    # fecha_corte global = mayor de las fechas de reporte disponibles.
    cortes = [b.get("_fecha_corte") for b in (casos, femin, tent) if b.get("_fecha_corte")]
    fcorte = max(cortes) if cortes else None
    # cobertura global = union de anios disponibles.
    anios_all = sorted({a for b in (casos, femin, tent) for a in b.get("_anios", [])})
    cobertura = f"Nacional, {anios_all[0]}-{anios_all[-1]}" if anios_all else None

    # Limpia campos internos antes de serializar.
    for b in (casos, femin, tent):
        b.pop("_fecha_corte", None)
        b.pop("_anios", None)

    meta = {
        "fuente": "MIMP - Programa AURORA / Centros Emergencia Mujer (CEM)",
        "fecha_corte": fcorte,
        "cobertura": cobertura,
        "granularidad": "agregado",
        "url": url(SLUG_CASOS),
    }
    out = {
        "_meta": meta,
        "casos_violencia": casos,
        "feminicidios": femin,
        "tentativas_feminicidio": tent,
    }
    write_json("mimp_violencia.json", out)

    # n_registros: usamos la suma de totales como senal de volumen del dataset
    # (casos atendidos + feminicidios + tentativas).
    n_registros = None
    if isinstance(casos.get("total"), int):
        n_registros = casos["total"] + (femin.get("total") or 0) + (tent.get("total") or 0)

    merge_manifest([{
        "id": "mimp_violencia",
        "titulo": "Violencia contra la mujer y feminicidios (MIMP/CEM)",
        "fuente": "datosabiertos.gob.pe",
        "institucion": "MIMP / Programa AURORA",
        "fecha_corte": fcorte,
        "cobertura": cobertura,
        "granularidad": "agregado",
        "url": url(SLUG_CASOS),
        "n_registros": n_registros,
    }])

    # Append a docs/REPORTE_ETL.md (no sobreescribir la bitacora previa).
    section = ["\n\n## Iteración 4 (MIMP/CEM)\n", *REPORT]
    rep = DOCS / "REPORTE_ETL.md"
    prev = rep.read_text(encoding="utf-8") if rep.exists() else ""
    rep.write_text(prev + "\n".join(section) + "\n", encoding="utf-8")
    log("\nLISTO iteracion 4 (MIMP/CEM).")


if __name__ == "__main__":
    main()
