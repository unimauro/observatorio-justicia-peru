#!/usr/bin/env python3
"""
Parser de los Excel del Portal Estadístico del Poder Judicial (carga procesal).
Estos archivos se descargan MANUALMENTE (protegidos por reCAPTCHA) a data/raw/pj_portal/.
Ver data/raw/MANUAL_DOWNLOADS.md.

Uso:
    python3 etl/pipeline/parse_pj_portal.py
Lee data/raw/pj_portal/*.xlsx, normaliza al esquema tidy del SPEC (§3) y produce
site/data/real/pj_carga_multianio.json con la serie por año + por distrito judicial.

NOTA: el layout exacto de los .xlsx del portal se confirma con el primer archivo real.
Este parser detecta columnas de forma flexible (busca encabezados por nombre) y, si no
encuentra una hoja/columna esperada, lo REGISTRA y deja "sin dato" — nunca inventa.
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "pj_portal"
OUT = ROOT / "site" / "data" / "real"

# Sinónimos de columnas esperadas (se ajustan al ver el primer archivo real)
COLS = {
    "distrito_judicial": ["distrito judicial", "distrito_judicial", "corte", "dpto_judicial"],
    "especialidad": ["especialidad", "espec", "materia"],
    "instancia": ["instancia", "tipo_organo", "tipo de organo", "tipo_órgano"],
    "anio": ["anio", "año", "year", "periodo"],
    "pendientes_inicio": ["pendiente inicial", "pendientes_inicio", "stock inicial", "carga inicial"],
    "ingresos": ["ingreso", "ingresos", "ingresado", "ingresot"],
    "resueltos": ["resuelto", "resueltos", "resueltot"],
    "pendientes_fin": ["pendiente final", "pendientes_fin", "pendiente", "stock final"],
}


def find_col(headers, keys):
    norm = {re.sub(r"\s+", " ", str(h)).strip().lower(): h for h in headers}
    for want in keys:
        for h_norm, h_orig in norm.items():
            if want in h_norm:
                return h_orig
    return None


def main():
    try:
        import pandas as pd
    except ImportError:
        print("Falta pandas/openpyxl: python3 -m pip install pandas openpyxl", file=sys.stderr)
        sys.exit(1)

    files = sorted(RAW.glob("*.xlsx")) + sorted(RAW.glob("*.xls"))
    if not files:
        print(f"No hay archivos en {RAW.relative_to(ROOT)}.")
        print("Descarga manual desde el Portal Estadístico del PJ (ver data/raw/MANUAL_DOWNLOADS.md),")
        print("guarda los .xlsx ahí y vuelve a ejecutar este parser.")
        return

    log = []
    print(f"Encontrados {len(files)} archivo(s) en {RAW.relative_to(ROOT)}:")
    for f in files:
        print(f"  - {f.name}")
        try:
            xls = pd.ExcelFile(f)
            log.append({"archivo": f.name, "hojas": xls.sheet_names})
            # heurística: primera hoja con columnas reconocibles
            for sheet in xls.sheet_names:
                df = xls.parse(sheet, nrows=5)
                hits = sum(1 for k in COLS if find_col(df.columns, COLS[k]))
                if hits >= 3:
                    log[-1]["hoja_datos"] = sheet
                    log[-1]["columnas_detectadas"] = {k: find_col(df.columns, COLS[k]) for k in COLS}
                    break
        except Exception as e:
            log.append({"archivo": f.name, "error": str(e)[:140]})

    print("\nDiagnóstico de columnas (para finalizar la normalización):")
    print(json.dumps(log, ensure_ascii=False, indent=2))
    print("\n>> Con este diagnóstico se completa la normalización al esquema tidy y se escribe")
    print("   site/data/real/pj_carga_multianio.json. Pásame la salida si quieres que lo cierre.")


if __name__ == "__main__":
    main()
