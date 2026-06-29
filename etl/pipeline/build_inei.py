#!/usr/bin/env python3
"""
ETL REAL - Iteracion 3 del Observatorio Nacional de Justicia del Peru.

Integra el "Registro Nacional de Denuncias de Delitos y Faltas" del INEI/PNP
(datos policiales de criminalidad), que complementa al MPFN con la mirada de la
Policia. Reusa el estilo y el contrato de salida de build_real_2.py (JSON con
_meta {fuente, fecha_corte, cobertura, granularidad, url}); NO sobreescribe los
JSON existentes y hace MERGE (no reemplazo) del manifest.

Respeta los principios NO negociables del SPEC.md (§7):
  - Nunca inventar datos.
  - Conservar `fuente` y `fecha_corte`.
  - Anonimizar: el agregado nacional no expone ningun dato personal; ademas los
    capitulos 200/300 (microdata con N de documento y datos de victima) NO se
    publican a nivel registro.
  - Distinguir granularidad expediente|agregado (aqui: agregado).
  - Si algo falla, registrar y seguir (no inventar).

NOTA CRITICA SOBRE LA FUENTE (descubierta al parsear):
  Los ZIP de data completa (inei.gob.pe/.../DELITOS/DATA/{2016,2017}.zip) son
  exportaciones SPSS corruptas: los campos numericos quedaron volcados como bytes
  IEEE-754 crudos (p.ej. ``\\x00\\x00\\x00\\x00\\x00\\x00\\xf0?`` = 1.0) y el
  system-missing como ``6.01347001699907E-154``. Esos bytes binarios contienen a
  veces ``0x7C`` ('|') y ``0x0A`` ('\\n'), por lo que el archivo NO es un CSV
  delimitado por '|' fiable: las columnas se desplazan y UBIGEO/NOMBREDD quedan
  ilegibles. Por eso NO se parsea por columnas.

  Lo que SI es recuperable de forma fiable es el texto del DELITO GENERICO (cap
  200): en cada linea aparece el nombre del Titulo del Codigo Penal (p.ej.
  "DELITOS CONTRA EL PATRIMONIO"), a veces partido por un '|' espurio. Se
  reconstruye quitando los '|' del segmento y casando contra la taxonomia fija
  del Codigo Penal (insensible a espacios/acentos). Asi se obtienen totales
  nacionales, por anio y por tipo (generico). La desagregacion por departamento
  NO se publica porque el campo de ubicacion esta corrupto en origen (no se
  inventa).

Salidas:
  site/data/real/inei_denuncias.json
  site/data/real/manifest.json            (merge: append id "inei_denuncias")
  data/processed/inei_denuncias.parquet   (tidy agregado, NO versionado)
  docs/REPORTE_ETL.md                      (append "## Iteracion 3")

Uso:
    python3 etl/pipeline/build_inei.py
"""
from __future__ import annotations

import collections
import datetime as dt
import glob
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path

import pandas as pd

# Permite importar fetch tanto como modulo (etl.pipeline.fetch) como suelto.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "inei"
PROCESSED = ROOT / "data" / "processed"
OUT = ROOT / "site" / "data" / "real"
DOCS = ROOT / "docs"

ANIOS = ("2016", "2017")
ZIP_URL = "https://www.inei.gob.pe/media/DATOS_ABIERTOS/DELITOS/DATA/{anio}.zip"
DATASET_URL = ("https://www.datosabiertos.gob.pe/dataset/registro-nacional-de-"
               "denuncias-de-delitos-y-faltas-{anio}-instituto-nacional-de-"
               "estadística-e")
FECHA_CORTE = "2017-12-31"  # ultimo anio cubierto por la serie abierta

# Taxonomia fija de DELITO GENERICO = Titulos del Libro Segundo del Codigo Penal
# peruano. Se usa para casar el texto reconstruido (insensible a may/acentos/
# espacios). Incluye variantes 2016 ("ECOLOGIA Y RECURSOS NATURALES") y 2017
# ("AMBIENTALES").
CANON = [
    "DELITOS CONTRA EL PATRIMONIO",
    "DELITOS CONTRA LA VIDA EL CUERPO Y LA SALUD",
    "DELITOS CONTRA LA SEGURIDAD PUBLICA",
    "DELITOS CONTRA LA LIBERTAD",
    "DELITOS CONTRA LA ADMINISTRACION PUBLICA",
    "DELITOS CONTRA LA FAMILIA",
    "DELITOS CONTRA LA FE PUBLICA",
    "DELITOS CONTRA LA HUMANIDAD",
    "DELITOS CONTRA EL ORDEN FINANCIERO Y MONETARIO",
    "DELITOS AMBIENTALES",
    "DELITOS CONTRA LA ECOLOGIA Y LOS RECURSOS NATURALES",
    "DELITOS CONTRA LA TRANQUILIDAD PUBLICA",
    "DELITOS CONTRA EL HONOR",
    "DELITOS CONTRA LOS DERECHOS INTELECTUALES",
    "DELITOS TRIBUTARIOS",
    "DELITOS CONTRA LA VOLUNTAD POPULAR",
    "DELITOS CONTRA EL ORDEN ECONOMICO",
    "DELITOS CONTRA LA CONFIANZA Y LA BUENA FE EN LOS NEGOCIOS",
    "DELITOS CONTRA EL ESTADO Y LA DEFENSA NACIONAL",
    "DELITOS CONTRA LOS PODERES DEL ESTADO Y EL ORDEN CONSTITUCIONAL",
    "DELITOS ADUANEROS",
]
RX_GEN = re.compile(r"DELITOS?\s")

REPORT: list[str] = []


def log(msg: str) -> None:
    print(msg)
    REPORT.append(msg)


def na(s: str) -> str:
    """Normaliza a solo-letras MAYUS sin acentos (insensible a espacios/puntos)."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z]", "", s)


# {clave normalizada -> nombre canonico}, mas largo primero (longest match).
CANON_NA = sorted(({na(c): c for c in CANON}).items(),
                  key=lambda kv: len(kv[0]), reverse=True)


def write_json(name: str, obj) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2),
                            encoding="utf-8")
    log(f"  -> escrito site/data/real/{name}")


def merge_manifest(entries: list[dict]) -> None:
    """Lee el manifest actual y hace UPSERT por id (no reemplaza el resto)."""
    path = OUT / "manifest.json"
    cur = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"datasets": []}
    by_id = {d["id"]: d for d in cur.get("datasets", [])}
    for e in entries:
        by_id[e["id"]] = e
    cur["datasets"] = list(by_id.values())
    cur["generado_utc"] = dt.datetime.now(dt.timezone.utc).isoformat()
    write_json("manifest.json", cur)


def ensure_data(anio: str) -> Path | None:
    """Descarga (si falta) y extrae el ZIP del anio. Devuelve el dir extraido."""
    zpath = RAW / f"{anio}.zip"
    try:
        fetch.download(ZIP_URL.format(anio=anio), zpath, timeout=300)
    except Exception as e:  # noqa: BLE001
        log(f"  ERROR descargando ZIP {anio}: {e}")
        return None
    ext = RAW / f"{anio}_ext"
    if not ext.exists():
        try:
            with zipfile.ZipFile(zpath) as zf:
                for info in zf.infolist():
                    if info.is_dir():
                        continue
                    raw = (info.filename.encode("cp437")
                           if not (info.flag_bits & 0x800)
                           else info.filename.encode("utf-8"))
                    try:
                        name = raw.decode("utf-8")
                    except UnicodeDecodeError:
                        name = raw.decode("latin-1")
                    safe = name.replace("í", "i").replace("Í", "I")
                    dest = ext / safe
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(info) as src:
                        dest.write_bytes(src.read())
        except Exception as e:  # noqa: BLE001
            log(f"  ERROR descomprimiendo ZIP {anio}: {e}")
            return None
    return ext


def find_cap200(ext: Path, anio: str) -> Path | None:
    pat = str(ext / f"**/Cap*200_Denuncia_de_Delitos_{anio}.csv")
    cands = [p for p in glob.glob(pat, recursive=True)
             if "Muestra" not in p and "Diccionario" not in p]
    return Path(cands[0]) if cands else None


def aggregate_year(csv_path: Path) -> tuple[collections.Counter, int, int, int]:
    """Cuenta delitos por generico reconstruyendo el texto (de-pipe + canon).

    Devuelve (Counter por generico, lineas_totales, lineas_con_generico,
    lineas_sin_clasificar). NO parsea por columnas (la fuente esta corrupta).
    """
    c: collections.Counter = collections.Counter()
    tot = have = unk = 0
    with open(csv_path, "rb") as fh:
        fh.readline()  # cabecera
        for raw in fh:
            tot += 1
            s = raw.decode("latin-1", errors="replace")
            m = RX_GEN.search(s)
            if not m:
                continue
            have += 1
            seg = na(s[m.start():m.start() + 70].replace("|", ""))
            hit = next((full for key, full in CANON_NA if seg.startswith(key)), None)
            if hit:
                c[hit] += 1
            else:
                unk += 1
    return c, tot, have, unk


def build_inei(manifest: list[dict]) -> None:
    log("\n## INEI/PNP - Registro Nacional de Denuncias de Delitos y Faltas")
    por_anio: list[dict] = []
    por_tipo: collections.Counter = collections.Counter()
    parquet_rows: list[dict] = []
    cobertura_anios: list[int] = []
    fallos: list[str] = []

    for anio in ANIOS:
        ext = ensure_data(anio)
        if ext is None:
            fallos.append(f"{anio}: no se pudo descargar/extraer")
            continue
        csv = find_cap200(ext, anio)
        if csv is None:
            log(f"  {anio}: no se hallo el CSV del capitulo 200")
            fallos.append(f"{anio}: sin capitulo 200")
            continue
        c, tot, have, unk = aggregate_year(csv)
        if have == 0:
            log(f"  {anio}: 0 registros con delito generico legible")
            fallos.append(f"{anio}: 0 genericos legibles")
            continue
        ratio_perd = 1 - have / tot if tot else 0
        log(f"  {anio}: lineas={tot:,} con_generico={have:,} "
            f"sin_clasificar={unk:,} ({unk/have:.2%}) "
            f"perdidas_por_corrupcion~{ratio_perd:.1%}")
        por_anio.append({"anio": int(anio), "cantidad": int(have)})
        cobertura_anios.append(int(anio))
        for tipo, n in c.items():
            por_tipo[tipo] += n
            parquet_rows.append({"anio": int(anio), "tipo": tipo, "cantidad": int(n)})
        for tipo, n in c.most_common(5):
            log(f"      {tipo}: {n:,}")

    total = int(sum(d["cantidad"] for d in por_anio))
    top_delitos = [{"tipo": t, "cantidad": int(n)}
                   for t, n in por_tipo.most_common(20)]
    por_anio.sort(key=lambda d: d["anio"])

    # Validaciones (§3 SPEC): cantidades >= 0; anios 2016..2017.
    assert all(d["cantidad"] >= 0 for d in por_anio), "cantidades negativas"
    assert all(2016 <= d["anio"] <= 2017 for d in por_anio), "anio fuera de rango"
    assert all(d["cantidad"] >= 0 for d in top_delitos), "tipo negativo"

    url = DATASET_URL.format(anio="2017")
    cob = (f"Nacional {min(cobertura_anios)}-{max(cobertura_anios)}"
           if cobertura_anios else "Nacional 2016-2017")
    meta = {
        "fuente": "INEI - Registro Nacional de Denuncias de Delitos y Faltas (PNP)",
        "fecha_corte": FECHA_CORTE,
        "cobertura": cob,
        "granularidad": "agregado",
        "url": url,
    }
    obj = {
        "_meta": meta,
        "total_denuncias": total,
        "por_anio": por_anio,
        # Ubicacion (departamento/UBIGEO) corrupta en origen -> no se publica.
        "por_departamento": [],
        "top_delitos": top_delitos,
        "notas": {
            "metodo": "Conteo de denuncias del capitulo 200 (delitos) por DELITO "
                      "GENERICO, reconstruyendo el texto del Codigo Penal desde un "
                      "export SPSS corrupto (bytes binarios + '|' espurios). No se "
                      "parsea por columnas.",
            "por_departamento": "No disponible: los campos de ubicacion (UBIGEO, "
                                "NOMBREDD) llegan ilegibles en el ZIP de origen "
                                "(volcado binario). No se inventa la desagregacion "
                                "territorial.",
            "cobertura_real": "El total es un piso: ~1-1.3% de registros por anio se "
                              "pierden cuando un byte 0x0A binario parte la fila en "
                              "origen. Faltas (capitulo 100) y victimas (capitulo "
                              "300) no se incluyen.",
            "privacidad": "Salida 100% agregada; no se expone ningun dato personal. "
                          "Los capitulos 200/300 (N de documento, datos de victima) "
                          "no se publican a nivel registro.",
        },
        "_n_registros": total,
    }
    if fallos:
        obj["_fallos"] = fallos

    write_json("inei_denuncias.json", obj)

    if parquet_rows:
        PROCESSED.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(parquet_rows).assign(
            fuente=meta["fuente"], fecha_corte=FECHA_CORTE,
            granularidad="agregado").to_parquet(
            PROCESSED / "inei_denuncias.parquet", index=False)
        log("  -> escrito data/processed/inei_denuncias.parquet")

    log(f"  TOTAL denuncias de delitos (cap.200): {total:,}")
    for d in top_delitos[:3]:
        log(f"    top delito: {d['tipo']} = {d['cantidad']:,}")

    manifest.append({
        "id": "inei_denuncias",
        "titulo": "Denuncias de delitos y faltas (INEI/PNP)",
        "fuente": "datosabiertos.gob.pe",
        "institucion": "INEI / PNP",
        "fecha_corte": FECHA_CORTE,
        "cobertura": "Nacional 2016-2017",
        "granularidad": "agregado",
        "url": url,
        "n_registros": total if total else None,
        **({"error": "; ".join(fallos)} if fallos else {}),
    })


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    log("# REPORTE ETL REAL - Iteracion 3 - Observatorio Justicia Peru")
    log(f"Ejecutado (UTC): {dt.datetime.now(dt.timezone.utc).isoformat()}")

    new_manifest: list[dict] = []
    try:
        build_inei(new_manifest)
    except Exception as e:  # noqa: BLE001
        import traceback
        log(f"  ERROR en build_inei: {e}\n{traceback.format_exc()}")

    if new_manifest:
        merge_manifest(new_manifest)

    section = ["\n\n## Iteracion 3 (INEI denuncias PNP)\n", *REPORT]
    rep = DOCS / "REPORTE_ETL.md"
    prev = rep.read_text(encoding="utf-8") if rep.exists() else ""
    rep.write_text(prev + "\n".join(section) + "\n", encoding="utf-8")
    log("\nLISTO iteracion 3.")


if __name__ == "__main__":
    main()
