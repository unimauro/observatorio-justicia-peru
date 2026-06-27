#!/usr/bin/env python3
"""
ETL REAL del Observatorio Nacional de Justicia del Peru.

Orquesta: descarga (datosabiertos.gob.pe) -> normaliza -> anonimiza -> agrega ->
escribe JSON sumarizados para el dashboard. Respeta los principios NO negociables
del SPEC.md:
  - Nunca inventar datos: si un recurso no baja, n_registros=null + campo error.
  - Conservar `fuente` y `fecha_corte` en cada fila del tidy.
  - NO derivar demoras en dias desde agregados: solo desde microdata por expediente.
  - Anonimizar (eliminar DNI y FECHA_NACIMIENTO) ANTES de procesar microdata.
  - clearance/congestion solo sobre agregados; demora en dias solo sobre microdata.

Salidas:
  data/processed/<fuente>.parquet         (tidy, NO versionado)
  data/processed/REPORTE_ETL.md           (bitacora honesta)
  site/data/real/<dataset>.json           (sumarizados, SI versionados)

Uso:
    python3 etl/pipeline/build_real.py
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

import pandas as pd

# Permite importar fetch tanto como modulo (etl.pipeline.fetch) como suelto.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
OUT = ROOT / "site" / "data" / "real"

# ---------------------------------------------------------------------------
# Definicion de fuentes (slugs verificados en Fase 0 / inventario).
# ---------------------------------------------------------------------------
PJ_NACIONAL_URL = (
    "https://www.datosabiertos.gob.pe/sites/default/files/"
    "dataset_jurisdiccional_a-partir-del-2024.csv"
)
PJ_SLUG = "procesos-judiciales-principales-nivel-nacional-partir-del-2023-poder-judicial"

MPFN_SLUGS = {
    "fiscales": "mpfn-fiscales",
    "casos": "mpfn-casos-fiscales",
    "delitos": "mpfn-delitos-denunciados",
}

PIURA = {
    # proceso (etiqueta canonica) -> (slug, instancia_col)
    "NLPT Laboral": (
        "demandas-con-sentencias-de-la-nueva-ley-procesal-de-trabajo-nlpt-de-la-corte-superior-de",
        "INSTANCIA",
    ),
    "Alimentos": (
        "demandas-por-proceso-de-alimentos-con-sentencia-de-la-corte-superior-de-justicia-de-piura",
        "INSTANCIA",
    ),
    "Penal (pena efectiva)": (
        "situación-jurídica-de-procesos-penales-con-penas-privativas-de-libertad-efectivas",
        "INSTANCIA_SENTENCIA",
    ),
    "Civil": (
        "demandas-con-sentencias-del-módulo-corporativo-civil-de-litigación-oral-de-la-corte-superior",
        "INSTANCIA",
    ),
}

ANIO_MIN, ANIO_MAX = 2015, 2026

# Bitacora global (se vuelca a REPORTE_ETL.md).
REPORT: list[str] = []
MANIFEST: list[dict] = []


def log(msg: str) -> None:
    print(msg)
    REPORT.append(msg)


def to_num(s: pd.Series) -> pd.Series:
    """A numerico tolerante (los CSV traen todo como str)."""
    return pd.to_numeric(s, errors="coerce")


def fecha_corte_de(df: pd.DataFrame, col: str = "fecha_corte") -> str | None:
    """Devuelve la fecha de corte mas reciente presente en los datos (o None)."""
    if col not in df.columns:
        return None
    vals = df[col].dropna().astype(str).str.strip()
    vals = vals[vals != ""]
    if vals.empty:
        return None
    # prueba formatos comunes: dd/mm/aaaa (MPFN) y aaaammdd (microdata Piura)
    for fmt in ("%d/%m/%Y", "%Y%m%d"):
        try:
            d = pd.to_datetime(vals, format=fmt, errors="coerce").dropna()
            if not d.empty:
                return d.max().strftime("%Y-%m-%d")
        except Exception:  # noqa: BLE001
            pass
    return sorted(vals.unique())[-1]


def write_json(name: str, obj) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(
        json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log(f"  -> escrito site/data/real/{name}")


# ===========================================================================
# 1) PODER JUDICIAL - carga procesal nacional (AGREGADO)
# ===========================================================================
def build_pj() -> None:
    log("\n## PJ carga procesal nacional (agregado)")
    dest = RAW / "pj" / "dataset_jurisdiccional_a-partir-del-2024.csv"
    try:
        fetch.download(PJ_NACIONAL_URL, dest)
        df = fetch.read_csv_smart(dest)
    except Exception as e:  # noqa: BLE001
        log(f"  ERROR descargando/leyendo PJ: {e}")
        MANIFEST.append({
            "id": "pj_carga_nacional", "titulo": "Carga procesal nacional",
            "fuente": "datosabiertos.gob.pe", "institucion": "Poder Judicial",
            "fecha_corte": None, "cobertura": None, "granularidad": "agregado",
            "url": PJ_NACIONAL_URL, "n_registros": None, "error": str(e),
        })
        return

    n0 = len(df)
    # Columnas reales verificadas: el sufijo T = tramite, E = ejecucion,
    # y la columna SIN sufijo es el TOTAL (tramite+ejecucion). Verificado:
    # INGRESO_SIN+INGRESO_CON == (INGRESOT+INGRESOE), RESUELTO==RESUELTOT+RESUELTOE,
    # PENDIENTE==PENDIENTET+PENDIENTEE (identidad exacta sobre 58k filas).
    cols_ing = "INGRESO_SIN + INGRESO_CON"
    cols_res = "RESUELTO"
    cols_pen = "PENDIENTE"
    df = df.assign(
        anio=to_num(df["ANIO"]),
        ingresos=to_num(df["INGRESO_SIN"]).fillna(0) + to_num(df["INGRESO_CON"]).fillna(0),
        resueltos=to_num(df["RESUELTO"]).fillna(0),
        pendientes=to_num(df["PENDIENTE"]).fillna(0),
        sentencias=to_num(df["SENTENCIA"]).fillna(0),
        distrito_judicial=df["DISTRITO_JUDICIAL"].astype(str).str.strip(),
        especialidad=df["ESPEC_EXP"].astype(str).str.strip(),
        mes=df["MES"].astype(str).str.strip(),
    )
    # Validacion: descartar negativos y anios fuera de rango.
    bad = (
        (df["ingresos"] < 0) | (df["resueltos"] < 0) | (df["pendientes"] < 0)
        | (df["anio"] < ANIO_MIN) | (df["anio"] > ANIO_MAX) | df["anio"].isna()
    )
    n_drop = int(bad.sum())
    df = df[~bad].copy()
    log(f"  filas leidas={n0} | descartadas(negativos/anio fuera rango)={n_drop} | validas={len(df)}")

    # PENDIENTE es un STOCK que la fuente reporta una sola vez al inicio del periodo
    # (solo en Enero; los demas meses traen 0). Verificado: la suma de PENDIENTE sobre
    # TODAS las filas == stock de Enero == pendientes_inicio del esquema del spec.
    # Por eso pendientes se suma sobre todas las filas (no hay snapshot de fin de mes).
    # INGRESO_SIN+INGRESO_CON y RESUELTO son FLUJOS: se suman sobre los 12 meses.
    meses_orden = {m: i for i, m in enumerate([
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
        "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
    ], start=1)}
    df["_mes_n"] = df["mes"].map(meses_orden).fillna(0).astype(int)
    anios = sorted(int(a) for a in df["anio"].unique())
    fcorte = f"{anios[-1]}-{df.loc[df['anio'] == anios[-1], '_mes_n'].max():02d}" if anios else None

    # Tidy parquet (granularidad mensual conservada).
    tidy = df[[
        "anio", "mes", "distrito_judicial", "especialidad",
        "ingresos", "resueltos", "pendientes", "sentencias",
    ]].copy()
    tidy["fuente"] = "Poder Judicial (datosabiertos.gob.pe)"
    tidy["fecha_corte"] = fcorte
    tidy["granularidad"] = "agregado"
    PROCESSED.mkdir(parents=True, exist_ok=True)
    tidy.to_parquet(PROCESSED / "pj_carga_nacional.parquet", index=False)

    def agg(group_cols: list[str]) -> pd.DataFrame:
        # ingresos/resueltos = flujo anual (suma de meses);
        # pendientes = stock inicial (PENDIENTE solo viene en Enero) => suma de todas las filas.
        out = df.groupby(group_cols, dropna=False)[
            ["ingresos", "resueltos", "pendientes"]
        ].sum().reset_index().fillna(0)
        return out

    def clearance(res, ing):
        return round(float(res) / float(ing) * 100, 1) if ing else None

    def congestion(pen, ing, res):
        return round((float(pen) + float(ing)) / float(res), 2) if res else None

    # Nacional (un solo anio en el archivo: 2024).
    nac_ing = float(df["ingresos"].sum())
    nac_res = float(df["resueltos"].sum())
    nac_pen = float(df["pendientes"].sum())  # PENDIENTE solo en Enero = pendientes_inicio
    nacional = {
        "ingresos": int(nac_ing), "resueltos": int(nac_res), "pendientes": int(nac_pen),
        "clearance": clearance(nac_res, nac_ing),
        "congestion": congestion(nac_pen, nac_ing, nac_res),
    }

    dj = agg(["distrito_judicial"]).sort_values("ingresos", ascending=False)
    por_dj = [{
        "distrito_judicial": r.distrito_judicial,
        "ingresos": int(r.ingresos), "resueltos": int(r.resueltos),
        "pendientes": int(r.pendientes),
        "clearance": clearance(r.resueltos, r.ingresos),
        "congestion": congestion(r.pendientes, r.ingresos, r.resueltos),
    } for r in dj.itertuples()]

    esp = agg(["especialidad"]).sort_values("ingresos", ascending=False)
    por_esp = [{
        "especialidad": r.especialidad,
        "ingresos": int(r.ingresos), "resueltos": int(r.resueltos),
        "pendientes": int(r.pendientes),
        "clearance": clearance(r.resueltos, r.ingresos),
    } for r in esp.itertuples()]

    meta = {
        "fuente": "Poder Judicial - Subgerencia de Estadistica (datosabiertos.gob.pe)",
        "fecha_corte": fcorte,
        "cobertura": f"Nacional, {anios[0]} (mensual Ene-Dic)" if anios else None,
        "granularidad": "agregado",
        "url": f"https://www.datosabiertos.gob.pe/dataset/{PJ_SLUG}",
    }
    write_json("pj_carga_nacional.json", {
        "_meta": meta,
        "nacional": nacional,
        "por_distrito_judicial": por_dj,
        "por_especialidad": por_esp,
        "anios": anios,
        "columnas_sumadas": {
            "ingresos": cols_ing, "resueltos": cols_res, "pendientes": cols_pen,
            "nota": "Sufijo T=tramite, E=ejecucion, sin sufijo=total (verificado: "
                    "INGRESO_SIN+INGRESO_CON=INGRESOT+INGRESOE, RESUELTO=RESUELTOT+RESUELTOE, "
                    "PENDIENTE=PENDIENTET+PENDIENTEE). ingresos incluye nuevos (SIN) y con "
                    "tramite/reingreso previo (CON); resueltos es flujo anual; PENDIENTE es el "
                    "stock pendiente_inicio (reportado solo en Enero). congestion=(pendientes+"
                    "ingresos)/resueltos.",
        },
    })
    log(f"  nacional: ingresos={nacional['ingresos']:,} resueltos={nacional['resueltos']:,} "
        f"pendientes={nacional['pendientes']:,} clearance={nacional['clearance']}% "
        f"congestion={nacional['congestion']}")
    MANIFEST.append({
        "id": "pj_carga_nacional", "titulo": "Carga procesal a nivel nacional",
        "fuente": "datosabiertos.gob.pe", "institucion": "Poder Judicial",
        "fecha_corte": fcorte, "cobertura": meta["cobertura"], "granularidad": "agregado",
        "url": meta["url"], "n_registros": int(len(df)),
    })


# ===========================================================================
# 2) MINISTERIO PUBLICO
# ===========================================================================
def _download_all_csv(slug: str, subdir: str) -> list[Path]:
    paths = []
    for r in fetch.csv_resources(slug):
        fname = r["url"].rsplit("/", 1)[-1]
        import urllib.parse
        fname = urllib.parse.unquote(fname)
        try:
            p = fetch.download(r["url"], RAW / subdir / fname)
            paths.append(p)
        except Exception as e:  # noqa: BLE001
            log(f"  WARN no se pudo bajar {r['url']}: {e}")
    return paths


def _read_concat(paths: list[Path]) -> pd.DataFrame:
    frames = []
    for p in paths:
        try:
            frames.append(fetch.read_csv_smart(p))
        except Exception as e:  # noqa: BLE001
            log(f"  WARN no se pudo leer {p.name}: {e}")
    if not frames:
        return pd.DataFrame()
    # union por nombre de columna (algunos anios varian columnas)
    return pd.concat(frames, ignore_index=True)


def build_mpfn_fiscales() -> None:
    log("\n## MPFN fiscales (agregado, headcount snapshot)")
    paths = _download_all_csv(MPFN_SLUGS["fiscales"], "mpfn/fiscales")
    df = _read_concat(paths)
    if df.empty:
        MANIFEST.append({"id": "mpfn_fiscales", "titulo": "Fiscales", "fuente": "datosabiertos.gob.pe",
                         "institucion": "Ministerio Publico", "fecha_corte": None, "cobertura": None,
                         "granularidad": "agregado", "url": "", "n_registros": None,
                         "error": "sin CSV descargables"})
        return
    n0 = len(df)
    df["anio"] = to_num(df["anio"])
    df["mes"] = to_num(df.get("mes"))
    df["total_n"] = to_num(df["total"])
    bad = (df["total_n"] < 0) | (df["anio"] < ANIO_MIN) | (df["anio"] > ANIO_MAX) | df["anio"].isna()
    n_drop = int(bad.sum())
    df = df[~bad].copy()
    log(f"  filas={n0} descartadas={n_drop} validas={len(df)} anios={sorted(df['anio'].dropna().unique().astype(int))}")

    # headcount = snapshot del ultimo mes de cada anio (no sumar meses: doble conteo).
    df["_snap"] = df.groupby("anio")["mes"].transform("max")
    snap = df[df["mes"] == df["_snap"]].copy()

    por_anio = [{"anio": int(a), "total": int(snap.loc[snap["anio"] == a, "total_n"].sum())}
                for a in sorted(snap["anio"].dropna().unique())]
    anio_reciente = max(snap["anio"].dropna()) if not snap.empty else None
    reciente = snap[snap["anio"] == anio_reciente].copy()
    total_fiscales = int(reciente["total_n"].sum())

    def breakdown(col):
        if col not in reciente.columns:
            return []
        g = reciente.groupby(reciente[col].astype(str).str.strip(), dropna=False)["total_n"].sum()
        return [{col: k, "total": int(v)} for k, v in g.sort_values(ascending=False).items()]

    meta = {
        "fuente": "Ministerio Publico - Fiscalia de la Nacion (datosabiertos.gob.pe)",
        "fecha_corte": fecha_corte_de(reciente),
        "cobertura": f"Nacional, {int(anio_reciente)} (snapshot mes {int(reciente['mes'].max())})" if anio_reciente else None,
        "granularidad": "agregado",
        "url": f"https://www.datosabiertos.gob.pe/dataset/{MPFN_SLUGS['fiscales']}",
    }
    write_json("mpfn_fiscales.json", {
        "_meta": meta, "total_fiscales": total_fiscales, "por_anio": por_anio,
        "por_distrito_fiscal": [{"distrito_fiscal": d["distrito_fiscal"], "total": d["total"]}
                                for d in breakdown("distrito_fiscal")],
        "por_cargo": [{"cargo": d["cargo"], "total": d["total"]} for d in breakdown("cargo")],
        "por_condicion": [{"condicion": d["condicion"], "total": d["total"]} for d in breakdown("condicion")],
        "por_sexo": [{"sexo": d["sexo"], "total": d["total"]} for d in breakdown("sexo")],
    })
    log(f"  total_fiscales (anio {int(anio_reciente)}) = {total_fiscales:,}")
    # tidy
    snap.assign(fuente="MPFN (datosabiertos.gob.pe)", granularidad="agregado").to_parquet(
        PROCESSED / "mpfn_fiscales.parquet", index=False)
    MANIFEST.append({"id": "mpfn_fiscales", "titulo": "Fiscales (dotacion)", "fuente": "datosabiertos.gob.pe",
                     "institucion": "Ministerio Publico", "fecha_corte": meta["fecha_corte"],
                     "cobertura": meta["cobertura"], "granularidad": "agregado", "url": meta["url"],
                     "n_registros": int(len(df))})


def build_mpfn_casos() -> None:
    log("\n## MPFN casos fiscales (agregado, flujo)")
    paths = _download_all_csv(MPFN_SLUGS["casos"], "mpfn/casos")
    df = _read_concat(paths)
    if df.empty:
        MANIFEST.append({"id": "mpfn_casos", "titulo": "Casos fiscales", "fuente": "datosabiertos.gob.pe",
                         "institucion": "Ministerio Publico", "fecha_corte": None, "cobertura": None,
                         "granularidad": "agregado", "url": "", "n_registros": None,
                         "error": "sin CSV descargables"})
        return
    n0 = len(df)
    df["anio"] = to_num(df["anio"])
    df["ingresado_n"] = to_num(df["ingresado"]).fillna(0)
    df["atendido_n"] = to_num(df["atendido"]).fillna(0)
    bad = (df["ingresado_n"] < 0) | (df["atendido_n"] < 0) | (df["anio"] < ANIO_MIN) | (df["anio"] > ANIO_MAX) | df["anio"].isna()
    n_drop = int(bad.sum())
    df = df[~bad].copy()
    log(f"  filas={n0} descartadas={n_drop} validas={len(df)}")

    def clr(at, ing):
        return round(float(at) / float(ing) * 100, 1) if ing else None

    g_anio = df.groupby("anio")[["ingresado_n", "atendido_n"]].sum().reset_index()
    por_anio = [{"anio": int(r.anio), "ingresado": int(r.ingresado_n), "atendido": int(r.atendido_n),
                 "clearance": clr(r.atendido_n, r.ingresado_n)} for r in g_anio.itertuples()]

    anio_rec = int(df["anio"].max())
    rec = df[df["anio"] == anio_rec]
    g_mat = rec.groupby(rec["materia"].astype(str).str.strip())[["ingresado_n", "atendido_n"]].sum()
    por_materia = [{"materia": k, "ingresado": int(v.ingresado_n), "atendido": int(v.atendido_n)}
                   for k, v in g_mat.sort_values("ingresado_n", ascending=False).iterrows()]
    g_df = rec.groupby(rec["distrito_fiscal"].astype(str).str.strip())[["ingresado_n", "atendido_n"]].sum()
    por_df = [{"distrito_fiscal": k, "ingresado": int(v.ingresado_n), "atendido": int(v.atendido_n),
               "clearance": clr(v.atendido_n, v.ingresado_n)}
              for k, v in g_df.sort_values("ingresado_n", ascending=False).iterrows()]

    meta = {
        "fuente": "Ministerio Publico - Fiscalia de la Nacion (datosabiertos.gob.pe)",
        "fecha_corte": fecha_corte_de(rec),
        "cobertura": f"Nacional, {int(df['anio'].min())}-{anio_rec}",
        "granularidad": "agregado",
        "url": f"https://www.datosabiertos.gob.pe/dataset/{MPFN_SLUGS['casos']}",
    }
    write_json("mpfn_casos.json", {
        "_meta": meta, "por_anio": por_anio, "por_materia": por_materia,
        "por_distrito_fiscal": por_df,
    })
    log(f"  casos {anio_rec}: ingresado={int(rec['ingresado_n'].sum()):,} atendido={int(rec['atendido_n'].sum()):,}")
    df.assign(fuente="MPFN (datosabiertos.gob.pe)", granularidad="agregado").to_parquet(
        PROCESSED / "mpfn_casos.parquet", index=False)
    MANIFEST.append({"id": "mpfn_casos", "titulo": "Casos fiscales", "fuente": "datosabiertos.gob.pe",
                     "institucion": "Ministerio Publico", "fecha_corte": meta["fecha_corte"],
                     "cobertura": meta["cobertura"], "granularidad": "agregado", "url": meta["url"],
                     "n_registros": int(len(df))})


def build_mpfn_delitos() -> None:
    log("\n## MPFN delitos denunciados (agregado)")
    paths = _download_all_csv(MPFN_SLUGS["delitos"], "mpfn/delitos")
    # Reaprovecha los CSV 2019/2020 ya presentes en ~/Downloads si la API fallara.
    df = _read_concat(paths)
    if df.empty:
        MANIFEST.append({"id": "mpfn_delitos", "titulo": "Delitos denunciados", "fuente": "datosabiertos.gob.pe",
                         "institucion": "Ministerio Publico", "fecha_corte": None, "cobertura": None,
                         "granularidad": "agregado", "url": "", "n_registros": None,
                         "error": "sin CSV descargables"})
        return
    n0 = len(df)
    # el anio puede llamarse anio_denuncia o anio
    anio_col = "anio_denuncia" if "anio_denuncia" in df.columns else "anio"
    df["anio"] = to_num(df[anio_col])
    df["cantidad_n"] = to_num(df["cantidad"]).fillna(0)
    bad = (df["cantidad_n"] < 0) | (df["anio"] < ANIO_MIN) | (df["anio"] > ANIO_MAX) | df["anio"].isna()
    n_drop = int(bad.sum())
    df = df[~bad].copy()
    log(f"  filas={n0} descartadas={n_drop} validas={len(df)} anios={sorted(df['anio'].dropna().unique().astype(int))}")

    total = int(df["cantidad_n"].sum())
    g_dep = df.groupby(df["dpto_pjfs"].astype(str).str.strip())["cantidad_n"].sum()
    por_dep = [{"departamento": k, "cantidad": int(v)}
               for k, v in g_dep.sort_values(ascending=False).items()]
    g_gen = df.groupby(df["generico"].astype(str).str.strip())["cantidad_n"].sum()
    top = [{"generico": k, "cantidad": int(v)}
           for k, v in g_gen.sort_values(ascending=False).head(20).items()]
    g_anio = df.groupby("anio")["cantidad_n"].sum()
    por_anio = [{"anio": int(k), "cantidad": int(v)} for k, v in g_anio.sort_index().items()]

    meta = {
        "fuente": "Ministerio Publico - Fiscalia de la Nacion (datosabiertos.gob.pe)",
        "fecha_corte": fecha_corte_de(df),
        "cobertura": f"Nacional, {int(df['anio'].min())}-{int(df['anio'].max())}",
        "granularidad": "agregado",
        "url": f"https://www.datosabiertos.gob.pe/dataset/{MPFN_SLUGS['delitos']}",
    }
    write_json("mpfn_delitos.json", {
        "_meta": meta, "total_denuncias": total, "por_departamento": por_dep,
        "top_delitos": top, "por_anio": por_anio,
    })
    log(f"  total_denuncias = {total:,}")
    df.assign(fuente="MPFN (datosabiertos.gob.pe)", granularidad="agregado").to_parquet(
        PROCESSED / "mpfn_delitos.parquet", index=False)
    MANIFEST.append({"id": "mpfn_delitos", "titulo": "Delitos denunciados", "fuente": "datosabiertos.gob.pe",
                     "institucion": "Ministerio Publico", "fecha_corte": meta["fecha_corte"],
                     "cobertura": meta["cobertura"], "granularidad": "agregado", "url": meta["url"],
                     "n_registros": int(len(df))})


# ===========================================================================
# 3) MICRODATA PIURA - demora real en dias (con anonimizacion)
# ===========================================================================
PRIVADAS = ["DNI", "FECHA_NACIMIENTO"]  # regla §7 SPEC: eliminar antes de procesar


def _load_micro(slug: str, instancia_col: str) -> tuple[pd.DataFrame, str | None]:
    res = fetch.csv_resources(slug)
    if not res:
        return pd.DataFrame(), None
    import urllib.parse
    url = res[0]["url"]
    fname = urllib.parse.unquote(url.rsplit("/", 1)[-1])
    p = fetch.download(url, RAW / "piura" / fname)
    df = fetch.read_csv_smart(p)
    # ANONIMIZAR de inmediato.
    df = df.drop(columns=[c for c in PRIVADAS if c in df.columns])
    fcorte = fecha_corte_de(df.rename(columns={"FECHA_CORTE": "fecha_corte"}))
    # columna instancia generica
    if instancia_col in df.columns:
        df["instancia"] = df[instancia_col].astype(str).str.strip()
    else:
        df["instancia"] = ""
    return df, fcorte


def build_demora_piura() -> None:
    log("\n## Microdata Piura - demora real en dias (anonimizado)")
    buckets = [(0, 30), (30, 90), (90, 180), (180, 365), (365, 730), (730, None)]
    por_proceso = []
    histograma = {}
    fcortes = []
    n_total = 0

    for proceso, (slug, inst_col) in PIURA.items():
        try:
            df, fcorte = _load_micro(slug, inst_col)
        except Exception as e:  # noqa: BLE001
            log(f"  WARN {proceso}: no se pudo cargar ({e})")
            continue
        if df.empty:
            log(f"  WARN {proceso}: sin datos")
            continue
        if fcorte:
            fcortes.append(fcorte)
        # Una fila por evento de sentencia (colapsa duplicacion por parte/persona).
        key = ["EXPEDIENTE", "instancia", "FECHA_INGRESO", "FECHA_SENTENCIA", "DIAS"]
        key = [k for k in key if k in df.columns]
        ev = df.drop_duplicates(subset=key).copy()
        ev["dias"] = to_num(ev["DIAS"])
        before = len(ev)
        ev = ev[ev["dias"].notna() & (ev["dias"] >= 0)]
        dropped = before - len(ev)
        n = len(ev)
        n_total += n
        log(f"  {proceso}: filas_brutas={len(df)} eventos_sentencia={before} validos(DIAS>=0)={n} (descartados {dropped})")
        if n == 0:
            continue
        d = ev["dias"]
        por_proceso.append({
            "proceso": proceso, "n": int(n),
            "mediana_dias": round(float(d.median()), 1),
            "p90_dias": round(float(d.quantile(0.90)), 1),
            "promedio_dias": round(float(d.mean()), 1),
            "min_dias": int(d.min()), "max_dias": int(d.max()),
        })
        hist = []
        for desde, hasta in buckets:
            if hasta is None:
                cnt = int((d >= desde).sum())
                label = f"{desde}+"
            else:
                cnt = int(((d >= desde) & (d < hasta)).sum())
                label = f"{desde}-{hasta}"
            hist.append({"bucket": label, "desde": desde, "hasta": hasta, "n": cnt})
        histograma[proceso] = hist
        # tidy anonimizado por proceso
        ev_out = ev.assign(proceso=proceso, fuente="PJ CSJ Piura (datosabiertos.gob.pe)",
                           fecha_corte=fcorte, granularidad="expediente")
        ev_out.to_parquet(PROCESSED / f"demora_piura_{proceso.split()[0].lower()}.parquet", index=False)

    meta = {
        "fuente": "Poder Judicial - CSJ Piura (datosabiertos.gob.pe), microdata por expediente",
        "fecha_corte": max(fcortes) if fcortes else None,
        "cobertura": "Corte Superior de Justicia de Piura",
        "granularidad": "expediente",
        "url": "https://www.datosabiertos.gob.pe/dataset/"
               "demandas-con-sentencias-de-la-nueva-ley-procesal-de-trabajo-nlpt-de-la-corte-superior-de",
    }
    write_json("demora_piura.json", {
        "_meta": meta,
        "por_proceso": por_proceso,
        "histograma": histograma,
        "nota_privacidad": "Anonimizado: se eliminaron DNI y fecha de nacimiento",
    })
    for p in por_proceso:
        log(f"  {p['proceso']}: n={p['n']} mediana={p['mediana_dias']}d p90={p['p90_dias']}d")
    MANIFEST.append({
        "id": "demora_piura", "titulo": "Demora real (dias) por proceso - CSJ Piura",
        "fuente": "datosabiertos.gob.pe", "institucion": "Poder Judicial - CSJ Piura",
        "fecha_corte": meta["fecha_corte"], "cobertura": meta["cobertura"],
        "granularidad": "expediente", "url": meta["url"], "n_registros": int(n_total),
    })


# ===========================================================================
# Orquestacion
# ===========================================================================
def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    log(f"# REPORTE ETL REAL - Observatorio Justicia Peru")
    log(f"Ejecutado (UTC): {dt.datetime.now(dt.timezone.utc).isoformat()}")

    for fn in (build_pj, build_mpfn_fiscales, build_mpfn_casos,
               build_mpfn_delitos, build_demora_piura):
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            import traceback
            log(f"  ERROR en {fn.__name__}: {e}\n{traceback.format_exc()}")

    manifest = {
        "generado_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "datasets": MANIFEST,
    }
    write_json("manifest.json", manifest)

    log("\n## Supuestos, columnas y huecos (honestidad del dato)")
    log("- PJ: ingresos=INGRESO_SIN+INGRESO_CON (nuevos + con tramite/reingreso previo); "
        "resueltos=RESUELTO; pendientes=PENDIENTE. Verificado que sin-sufijo = T(tramite)+E(ejecucion). "
        "ingresos/resueltos son flujo anual; PENDIENTE es stock reportado solo en Enero "
        "(=pendientes_inicio). clearance=resueltos/ingresos*100; congestion=(pendientes+ingresos)/resueltos.")
    log("- PJ: el archivo solo cubre 2024 (mensual). No hay diccionario de datos publicado; la "
        "semantica de SIN/CON se infiere de la identidad aritmetica, no de un diccionario oficial.")
    log("- MPFN fiscales: es headcount (stock). Se toma el snapshot del ultimo mes de cada anio; "
        "NO se suman meses (evita doble conteo). Desgloses sobre el anio mas reciente.")
    log("- MPFN casos/delitos: flujos acumulados por periodo anual; se suman entre distritos. "
        "2026 es parcial (corte a mitad de anio): cifras menores, no comparables a anios completos.")
    log("- Demora Piura: SOLO microdata por expediente (unica via a dias reales). Cobertura = CSJ Piura. "
        "Anonimizado (DNI y FECHA_NACIMIENTO eliminados al cargar). Una fila por evento de sentencia "
        "(dedup por EXPEDIENTE+instancia+fechas+DIAS para colapsar duplicacion por parte). DIAS<0 o nulo "
        "descartado. Aparecen valores tope (max=999 en NLPT/Penal) que parecen sentinela en origen.")
    log("- NO se derivan dias de demora desde agregados (regla no negociable del spec).")
    log("- Pendiente/no incluido en esta corrida: TC 1992-2026 (XLSX), modulos VCM, INEI, y descargas "
        "manuales (PJ Portal Estadistico, CNPJ). Quedan como siguiente iteracion.")

    (PROCESSED / "REPORTE_ETL.md").write_text("\n".join(REPORT) + "\n", encoding="utf-8")
    log("\nLISTO. Reporte en data/processed/REPORTE_ETL.md")


if __name__ == "__main__":
    main()
