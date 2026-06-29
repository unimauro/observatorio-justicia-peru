#!/usr/bin/env python3
"""
ETL REAL - Iteracion 2 del Observatorio Nacional de Justicia del Peru.

Anade nuevas fuentes al pipeline de la iteracion 1 (ver build_real.py). Reusa
el mismo estilo, los helpers de fetch.py y el contrato de salida (JSON con
_meta {fuente, fecha_corte, cobertura, granularidad, url}). NO sobreescribe los
JSON existentes; ANADE nuevos y hace MERGE (no reemplazo) del manifest.

Respeta los principios NO negociables del SPEC.md:
  - Nunca inventar datos: si un recurso no baja, n_registros=null + campo error.
  - Conservar `fuente` y `fecha_corte`.
  - Demora en dias SOLO desde microdata por expediente.
  - Anonimizar (DNI, nombres, fecha de nacimiento) ANTES de procesar.
  - Distinguir granularidad expediente|agregado.

Salidas nuevas:
  site/data/real/tc.json              (TC: ingresos/publicados + DEMORA real)
  site/data/real/mpfn_seguridad.json  (flagrancia, VCM, ciberdelitos, trata)
  site/data/real/manifest.json        (merge con entradas previas)
  data/processed/*.parquet            (tidy, NO versionado)
  docs/REPORTE_ETL.md                 (append "## Iteracion 2")

Uso:
    python3 etl/pipeline/build_real_2.py
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import urllib.parse
from pathlib import Path

import pandas as pd

# Permite importar fetch tanto como modulo (etl.pipeline.fetch) como suelto.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
OUT = ROOT / "site" / "data" / "real"
DOCS = ROOT / "docs"

ANIO_MIN, ANIO_MAX = 1992, 2026
PRIVADAS = ["DNI", "NOMBRES", "APELLIDOS", "NOMBRE", "FECHA_NACIMIENTO",
            "FEC_NACIMIENTO", "NOMBRE_COMPLETO"]  # regla §7 SPEC

# Slugs verificados via package_list (2026-06).
TC_ING_SLUG = ("expedientes-ingresados-al-tribunal-constitucional-"
               "desde-1992-2026-tribunal-constitucional-tc")
TC_PUB_SLUG = ("expedientes-publicados-por-el-tribunal-constitucional-"
               "desde-1992-2026-tribunal")
TC_ING_URL = ("https://www.datosabiertos.gob.pe/sites/default/files/"
              "dataset_ing_04-05-2026.xlsx")
TC_PUB_URL = ("https://www.datosabiertos.gob.pe/sites/default/files/"
              "dataset_pub_04-05-2026.xlsx")

SEG_SLUGS = {
    "flagrancia": "mpfn-casos-fiscales-de-flagrancia-delictiva",
    "violencia_mujer": "mpfn-casos-fiscales-en-violencia-contra-la-mujer",
    "ciberdelitos": "mpfn-delitos-de-ciberdelincuencia-denunciados-en-el-ministerio-público",
    "trata": "casos-intervenidos-por-el-delito-de-trata-de-personas-según-distrito-fiscal",
}
TRATA_URL = "https://www.datosabiertos.gob.pe/sites/default/files/c_8_1.xlsx"

REPORT: list[str] = []


def log(msg: str) -> None:
    print(msg)
    REPORT.append(msg)


def to_num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce")


def anonimizar(df: pd.DataFrame) -> pd.DataFrame:
    """Elimina columnas con datos personales (§7 SPEC). Insensible a may/min."""
    drop = [c for c in df.columns if c.strip().upper() in
            {p.upper() for p in PRIVADAS}]
    return df.drop(columns=drop) if drop else df


def yyyymmdd(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s.astype(str).str.strip(), format="%Y%m%d", errors="coerce")


def write_json(name: str, obj) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2),
                            encoding="utf-8")
    log(f"  -> escrito site/data/real/{name}")


def merge_manifest(entries: list[dict]) -> None:
    """Lee el manifest actual y hace UPSERT por id (no reemplaza el resto)."""
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


def download_xlsx(url: str, dest: Path) -> Path:
    return fetch.download(url, dest)


def download_all_csv(slug: str, subdir: str) -> list[Path]:
    paths = []
    for r in fetch.csv_resources(slug):
        fname = urllib.parse.unquote(r["url"].rsplit("/", 1)[-1])
        try:
            paths.append(fetch.download(r["url"], RAW / subdir / fname))
        except Exception as e:  # noqa: BLE001
            log(f"  WARN no se pudo bajar {r['url']}: {e}")
    return paths


def read_concat(paths: list[Path]) -> pd.DataFrame:
    frames = []
    for p in paths:
        try:
            frames.append(fetch.read_csv_smart(p))
        except Exception as e:  # noqa: BLE001
            log(f"  WARN no se pudo leer {p.name}: {e}")
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


# ===========================================================================
# 1) TRIBUNAL CONSTITUCIONAL - ingresos/publicados + DEMORA real (expediente)
# ===========================================================================
def build_tc(manifest: list[dict]) -> None:
    log("\n## Tribunal Constitucional - ingresos, publicados y demora real")
    try:
        ping = download_xlsx(TC_ING_URL, RAW / "tc" / TC_ING_URL.rsplit("/", 1)[-1])
        ppub = download_xlsx(TC_PUB_URL, RAW / "tc" / TC_PUB_URL.rsplit("/", 1)[-1])
        ing = anonimizar(pd.read_excel(ping, dtype=str))
        pub = anonimizar(pd.read_excel(ppub, dtype=str))
    except Exception as e:  # noqa: BLE001
        log(f"  ERROR descargando/leyendo TC: {e}")
        manifest.append({
            "id": "tc", "titulo": "Expedientes del Tribunal Constitucional",
            "fuente": "datosabiertos.gob.pe", "institucion": "Tribunal Constitucional",
            "fecha_corte": None, "cobertura": None, "granularidad": "expediente",
            "url": f"https://www.datosabiertos.gob.pe/dataset/{TC_ING_SLUG}",
            "n_registros": None, "error": str(e),
        })
        return

    # --- Ingresos: una fila = un expediente ingresado. Anio = FEC_INGRESO ---
    ing["fec_ing"] = yyyymmdd(ing["FEC_INGRESO"])
    ing["anio_ing"] = ing["fec_ing"].dt.year
    ing["tipo"] = ing["CDES_TIPOPROCESO"].astype(str).str.strip()
    ing = ing[(ing["anio_ing"] >= ANIO_MIN) & (ing["anio_ing"] <= ANIO_MAX)].copy()

    # --- Publicados: una fila = un expediente publicado. Anio = PUB_PAGWEB ---
    pub["fec_ing"] = yyyymmdd(pub["FEC_INGRESO"])
    pub["fec_pub"] = yyyymmdd(pub["PUB_PAGWEB"])
    pub["anio_pub"] = pub["fec_pub"].dt.year
    pub["tipo"] = pub["CDES_TIPOPROCESO"].astype(str).str.strip()
    pub = pub[(pub["anio_pub"] >= ANIO_MIN) & (pub["anio_pub"] <= ANIO_MAX)].copy()

    log(f"  ingresados: {len(ing):,} filas | publicados: {len(pub):,} filas")

    # por_anio: ingresados (por FEC_INGRESO) y publicados (por PUB_PAGWEB)
    g_ing = ing.groupby("anio_ing").size()
    g_pub = pub.groupby("anio_pub").size()
    anios = sorted(set(g_ing.index.dropna().astype(int)) |
                   set(g_pub.index.dropna().astype(int)))
    por_anio = [{
        "anio": a,
        "ingresados": int(g_ing.get(a, 0)),
        "publicados": int(g_pub.get(a, 0)),
    } for a in anios]

    # por_tipo: ingresados por tipo de proceso (universo que entra al TC)
    g_tipo = ing.groupby("tipo").size().sort_values(ascending=False)
    por_tipo = [{"tipo": k, "n": int(v)} for k, v in g_tipo.items()]

    # --- DEMORA real (dias) = PUB_PAGWEB - FEC_INGRESO sobre microdata pub ---
    # Cada fila publicada trae su propia fecha de ingreso y de publicacion:
    # NO requiere cruce; es demora literal por expediente (cumple §7 SPEC).
    pub["dias"] = (pub["fec_pub"] - pub["fec_ing"]).dt.days
    dem = pub[pub["dias"].notna() & (pub["dias"] >= 0)].copy()
    n_neg = int((pub["dias"] < 0).sum())
    log(f"  demora: {len(dem):,} expedientes con dias>=0 (descartados {n_neg} con dias<0)")

    def stats(d: pd.Series) -> dict:
        return {
            "n": int(len(d)),
            "mediana_dias": round(float(d.median()), 1),
            "p90_dias": round(float(d.quantile(0.90)), 1),
            "promedio_dias": round(float(d.mean()), 1),
        }

    g = dem.groupby("tipo")["dias"]
    demora_por_tipo = [
        {"tipo": tipo, **stats(g.get_group(tipo))}
        for tipo in g.size().sort_values(ascending=False).index
        if len(g.get_group(tipo)) >= 30  # umbral minimo para mediana/p90 estable
    ]
    demora_global = stats(dem["dias"])

    # fecha_corte: fecha de extraccion constante en FEC_DEVPJ_1 (yyyymmdd)
    fcorte = None
    if "FEC_DEVPJ_1" in pub.columns:
        fc = yyyymmdd(pub["FEC_DEVPJ_1"]).dropna()
        if not fc.empty:
            fcorte = fc.max().strftime("%Y-%m-%d")

    meta = {
        "fuente": "Tribunal Constitucional (datosabiertos.gob.pe)",
        "fecha_corte": fcorte,
        "cobertura": f"Nacional, {anios[0]}-{anios[-1]}" if anios else None,
        "granularidad": "expediente",
        "url": f"https://www.datosabiertos.gob.pe/dataset/{TC_ING_SLUG}",
    }
    write_json("tc.json", {
        "_meta": meta,
        "por_anio": por_anio,
        "por_tipo": por_tipo,
        "demora": {
            "global": demora_global,
            "por_tipo": demora_por_tipo,
            "nota": "Demora literal en dias = fecha de publicacion en pagina web "
                    "(PUB_PAGWEB) - fecha de ingreso (FEC_INGRESO), por expediente "
                    "publicado. Solo tipos con n>=30. dias<0 descartados.",
        },
        "nota": "por_anio.ingresados se cuenta por FEC_INGRESO; publicados por "
                "PUB_PAGWEB. por_tipo es ingresados por tipo de proceso. "
                f"{anios[-1] if anios else ''} es parcial (corte {fcorte}).",
        "nota_privacidad": "El dataset del TC no contiene DNI ni nombres; aun asi "
                           "se aplico el filtro de anonimizacion por seguridad.",
    })

    # tidy parquet anonimizado (microdata de demora)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    dem_out = dem[["tipo", "anio_pub", "dias"]].assign(
        fuente="Tribunal Constitucional (datosabiertos.gob.pe)",
        fecha_corte=fcorte, granularidad="expediente")
    dem_out.to_parquet(PROCESSED / "tc_demora.parquet", index=False)

    log(f"  demora global: n={demora_global['n']:,} mediana="
        f"{demora_global['mediana_dias']}d p90={demora_global['p90_dias']}d")
    for d in demora_por_tipo[:5]:
        log(f"    {d['tipo']}: n={d['n']:,} mediana={d['mediana_dias']}d "
            f"p90={d['p90_dias']}d")

    manifest.append({
        "id": "tc", "titulo": "Expedientes del Tribunal Constitucional (demora real)",
        "fuente": "datosabiertos.gob.pe", "institucion": "Tribunal Constitucional",
        "fecha_corte": fcorte, "cobertura": meta["cobertura"],
        "granularidad": "expediente", "url": meta["url"],
        "n_registros": int(len(pub) + len(ing)),
    })


# ===========================================================================
# 2) MPFN seguridad adicional (agregados)
# ===========================================================================
def _por_anio_ing_at(df: pd.DataFrame, anio_col: str) -> list[dict]:
    g = df.groupby(anio_col)[["ingresado_n", "atendido_n"]].sum().sort_index()
    return [{"anio": int(a), "ingresado": int(r.ingresado_n),
             "atendido": int(r.atendido_n)} for a, r in g.iterrows()]


def _top_distrito(df: pd.DataFrame, val: str = "ingresado_n", n: int = 15) -> list[dict]:
    col = "distrito_fiscal"
    g = df.groupby(df[col].astype(str).str.strip())[val].sum()
    return [{"distrito_fiscal": k, "total": int(v)}
            for k, v in g.sort_values(ascending=False).head(n).items()]


def build_flagrancia_o_vcm(key: str, titulo: str) -> dict:
    slug = SEG_SLUGS[key]
    paths = download_all_csv(slug, f"mpfn_seg/{key}")
    df = read_concat(paths)
    url = f"https://www.datosabiertos.gob.pe/dataset/{slug}"
    if df.empty:
        log(f"  {key}: sin CSV descargables")
        return {"_meta": {"url": url}, "error": "sin CSV descargables", "total": None}
    n0 = len(df)
    df["anio"] = to_num(df["anio"])
    df["ingresado_n"] = to_num(df["ingresado"]).fillna(0)
    df["atendido_n"] = to_num(df["atendido"]).fillna(0)
    bad = ((df["ingresado_n"] < 0) | (df["atendido_n"] < 0) |
           (df["anio"] < ANIO_MIN) | (df["anio"] > ANIO_MAX) | df["anio"].isna())
    df = df[~bad].copy()
    anios = sorted(df["anio"].dropna().unique().astype(int))
    log(f"  {key}: filas={n0} validas={len(df)} anios={anios}")

    df.assign(fuente="MPFN (datosabiertos.gob.pe)", granularidad="agregado").to_parquet(
        PROCESSED / f"mpfn_{key}.parquet", index=False)

    meta = {
        "fuente": "Ministerio Publico - Fiscalia de la Nacion (datosabiertos.gob.pe)",
        "fecha_corte": _fecha_corte_dmy(df),
        "cobertura": f"Nacional, {anios[0]}-{anios[-1]}" if anios else None,
        "granularidad": "agregado",
        "url": url,
    }
    return {
        "_meta": meta,
        "total": int(df["ingresado_n"].sum()),
        "por_anio": _por_anio_ing_at(df, "anio"),
        "por_distrito_fiscal": _top_distrito(df),
        "_n_registros": int(len(df)),
    }


def _fecha_corte_dmy(df: pd.DataFrame) -> str | None:
    for col in ("fecha_descarga", "Fecha_descarga", "fecha_publicacion"):
        if col in df.columns:
            d = pd.to_datetime(df[col].astype(str).str.strip(),
                               format="%d/%m/%Y", errors="coerce").dropna()
            if not d.empty:
                return d.max().strftime("%Y-%m-%d")
    return None


def build_ciber() -> dict:
    key = "ciberdelitos"
    slug = SEG_SLUGS[key]
    paths = download_all_csv(slug, f"mpfn_seg/{key}")
    df = read_concat(paths)
    url = f"https://www.datosabiertos.gob.pe/dataset/{slug}"
    if df.empty:
        log(f"  {key}: sin CSV descargables")
        return {"_meta": {"url": url}, "error": "sin CSV descargables", "total": None}
    n0 = len(df)
    anio_col = "anio_denuncia" if "anio_denuncia" in df.columns else "anio"
    df["anio"] = to_num(df[anio_col])
    df["cantidad_n"] = to_num(df["cantidad"]).fillna(0)
    bad = ((df["cantidad_n"] < 0) | (df["anio"] < ANIO_MIN) |
           (df["anio"] > ANIO_MAX) | df["anio"].isna())
    df = df[~bad].copy()
    anios = sorted(df["anio"].dropna().unique().astype(int))
    log(f"  {key}: filas={n0} validas={len(df)} anios={anios}")

    df.assign(fuente="MPFN (datosabiertos.gob.pe)", granularidad="agregado").to_parquet(
        PROCESSED / f"mpfn_{key}.parquet", index=False)

    por_anio = [{"anio": int(a), "cantidad": int(v)} for a, v in
                df.groupby("anio")["cantidad_n"].sum().sort_index().items()]
    tipo_col = "des_articulo" if "des_articulo" in df.columns else "subgenerico"
    g = df.groupby(df[tipo_col].astype(str).str.strip())["cantidad_n"].sum()
    top_tipos = [{"tipo": k, "cantidad": int(v)} for k, v in
                 g.sort_values(ascending=False).head(15).items()]
    meta = {
        "fuente": "Ministerio Publico - Fiscalia de la Nacion (datosabiertos.gob.pe)",
        "fecha_corte": _fecha_corte_dmy(df),
        "cobertura": f"Nacional, {anios[0]}-{anios[-1]}" if anios else None,
        "granularidad": "agregado",
        "url": url,
    }
    return {
        "_meta": meta,
        "total": int(df["cantidad_n"].sum()),
        "por_anio": por_anio,
        "top_tipos": top_tipos,
        "_n_registros": int(len(df)),
    }


def build_trata() -> dict:
    key = "trata"
    slug = SEG_SLUGS[key]
    url = f"https://www.datosabiertos.gob.pe/dataset/{slug}"
    try:
        p = download_xlsx(TRATA_URL, RAW / "trata" / "c_8_1.xlsx")
        raw = pd.read_excel(p, sheet_name=0, dtype=str, header=None)
    except Exception as e:  # noqa: BLE001
        log(f"  {key}: error {e}")
        return {"_meta": {"url": url}, "error": str(e), "total": None}

    # Cuadro ancho: localizar la fila de cabecera ("Distrito Fiscal" + anios).
    hdr = None
    for i in range(len(raw)):
        if str(raw.iat[i, 1]).strip().lower() == "distrito fiscal":
            hdr = i
            break
    if hdr is None:
        log(f"  {key}: no se hallo cabecera 'Distrito Fiscal'")
        return {"_meta": {"url": url}, "error": "estructura inesperada", "total": None}

    year_cols = {}
    for c in range(2, raw.shape[1]):
        y = pd.to_numeric(str(raw.iat[hdr, c]).strip(), errors="coerce")
        if pd.notna(y) and ANIO_MIN <= int(y) <= ANIO_MAX:
            year_cols[c] = int(y)
    anios = sorted(year_cols.values())

    por_dist, por_anio_acc = [], {a: 0 for a in anios}
    total = 0
    for i in range(hdr + 1, len(raw)):
        nombre = str(raw.iat[i, 1]).strip()
        if not nombre or nombre.lower() in ("nan", "nacional"):
            continue
        fila_total = 0
        for c, y in year_cols.items():
            v = pd.to_numeric(str(raw.iat[i, c]).strip(), errors="coerce")
            if pd.notna(v) and v >= 0:
                por_anio_acc[y] += int(v)
                fila_total += int(v)
        if fila_total > 0:
            por_dist.append({"distrito_fiscal": nombre, "total": fila_total})
            total += fila_total

    por_dist.sort(key=lambda d: d["total"], reverse=True)
    por_anio = [{"anio": a, "cantidad": por_anio_acc[a]} for a in anios]
    log(f"  {key}: total={total:,} distritos={len(por_dist)} anios={anios}")

    pd.DataFrame(por_dist).assign(
        fuente="MPFN (datosabiertos.gob.pe)", granularidad="agregado").to_parquet(
        PROCESSED / "mpfn_trata.parquet", index=False)

    meta = {
        "fuente": "Ministerio Publico (datosabiertos.gob.pe), cuadro 2.7",
        "fecha_corte": f"{anios[-1]}-12-31" if anios else None,
        "cobertura": f"Nacional, {anios[0]}-{anios[-1]}" if anios else None,
        "granularidad": "agregado",
        "url": url,
    }
    return {
        "_meta": meta,
        "total": total,
        "por_anio": por_anio,
        "por_distrito_fiscal": por_dist[:15],
        "_n_registros": len(por_dist),
    }


def build_mpfn_seguridad(manifest: list[dict]) -> None:
    log("\n## MPFN seguridad adicional (flagrancia, VCM, ciberdelitos, trata)")
    PROCESSED.mkdir(parents=True, exist_ok=True)
    out = {}

    builders = {
        "flagrancia": lambda: build_flagrancia_o_vcm("flagrancia", "Flagrancia delictiva"),
        "violencia_mujer": lambda: build_flagrancia_o_vcm("violencia_mujer", "Violencia contra la mujer"),
        "ciberdelitos": build_ciber,
        "trata": build_trata,
    }
    titulos = {
        "flagrancia": "Casos fiscales de flagrancia delictiva",
        "violencia_mujer": "Casos fiscales de violencia contra la mujer",
        "ciberdelitos": "Delitos de ciberdelincuencia denunciados",
        "trata": "Casos intervenidos por trata de personas",
    }
    for key, fn in builders.items():
        try:
            res = fn()
        except Exception as e:  # noqa: BLE001
            import traceback
            log(f"  ERROR {key}: {e}\n{traceback.format_exc()}")
            res = {"_meta": {"url": f"https://www.datosabiertos.gob.pe/dataset/{SEG_SLUGS[key]}"},
                   "error": str(e), "total": None}
        nreg = res.pop("_n_registros", None)
        out[key] = res
        m = res.get("_meta", {})
        manifest.append({
            "id": key, "titulo": titulos[key], "fuente": "datosabiertos.gob.pe",
            "institucion": "Ministerio Publico", "fecha_corte": m.get("fecha_corte"),
            "cobertura": m.get("cobertura"), "granularidad": m.get("granularidad", "agregado"),
            "url": m.get("url", f"https://www.datosabiertos.gob.pe/dataset/{SEG_SLUGS[key]}"),
            "n_registros": nreg if "error" not in res else None,
            **({"error": res["error"]} if "error" in res else {}),
        })

    write_json("mpfn_seguridad.json", out)
    for key in builders:
        t = out[key].get("total")
        log(f"  {key}: total={t:,}" if isinstance(t, int) else f"  {key}: total=None")


# ===========================================================================
# Orquestacion
# ===========================================================================
def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    log("# REPORTE ETL REAL - Iteracion 2 - Observatorio Justicia Peru")
    log(f"Ejecutado (UTC): {dt.datetime.now(dt.timezone.utc).isoformat()}")

    new_manifest: list[dict] = []
    for fn in (build_tc,):
        try:
            fn(new_manifest)
        except Exception as e:  # noqa: BLE001
            import traceback
            log(f"  ERROR en {fn.__name__}: {e}\n{traceback.format_exc()}")
    try:
        build_mpfn_seguridad(new_manifest)
    except Exception as e:  # noqa: BLE001
        import traceback
        log(f"  ERROR en build_mpfn_seguridad: {e}\n{traceback.format_exc()}")

    merge_manifest(new_manifest)

    # Append a docs/REPORTE_ETL.md (no sobreescribir la bitacora previa).
    section = ["\n\n## Iteracion 2 (TC + MPFN seguridad)\n",
               *[f"{l}" for l in REPORT]]
    rep = DOCS / "REPORTE_ETL.md"
    prev = rep.read_text(encoding="utf-8") if rep.exists() else ""
    rep.write_text(prev + "\n".join(section) + "\n", encoding="utf-8")
    log("\nLISTO iteracion 2.")


if __name__ == "__main__":
    main()
