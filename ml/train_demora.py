#!/usr/bin/env python3
"""
Fase 4 — Modelo de PREDICCIÓN DE DEMORA judicial (días hasta sentencia).
Entrena sobre la microdata por expediente (CSJ Piura) en data/processed/demora_piura_*.parquet.

Honestidad (SPEC §7): el modelo SOLO es válido para las jurisdicciones/materias con microdata
real (hoy: CSJ Piura — NLPT laboral, alimentos, penal, civil). No se extrapola al resto del país.
Se reporta el error real (MAE, error mediano) en un set de prueba; nada se inventa.

Salidas:
  ml/models/demora.joblib            -> modelo entrenado (para servir en la API del VPS)
  ml/models/demora_meta.json         -> métricas + features + cobertura
  site/data/real/ml_demora.json      -> resumen para el dashboard (métricas + predicción por proceso)
"""
from __future__ import annotations
import json
from pathlib import Path
import glob

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
import joblib

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "ml" / "models"
MODELS.mkdir(parents=True, exist_ok=True)
OUT_JSON = ROOT / "site" / "data" / "real" / "ml_demora.json"

CAT = ["proceso", "materia_f", "provincia_f", "tipo_ingreso_f", "instancia_tipo"]
NUM = ["mes_anio"]
TARGET = "dias"


def load() -> pd.DataFrame:
    frames = []
    for f in sorted(glob.glob(str(ROOT / "data/processed/demora_piura_*.parquet"))):
        frames.append(pd.read_parquet(f))
    d = pd.concat(frames, ignore_index=True)

    # target normalizado
    d["dias"] = pd.to_numeric(d.get("dias", d.get("DIAS")), errors="coerce")
    # quitar sentinela 999 y no válidos
    d = d[(d["dias"] >= 1) & (d["dias"] <= 998)].copy()

    # features robustas (combinan columnas equivalentes de los distintos procesos)
    d["materia_f"] = d.get("MATERIA").fillna(d.get("GENERICO")).fillna(d.get("materia")).fillna("NA").astype(str).str.upper().str[:40]
    d["provincia_f"] = d.get("PROVINCIA").fillna("NA").astype(str).str.upper()
    d["tipo_ingreso_f"] = d.get("TIPO_INGRESO").fillna("NA").astype(str).str.upper()
    inst = d.get("INSTANCIA").fillna(d.get("instancia")).fillna("NA").astype(str).str.upper()
    # reducir cardinalidad: tipo de instancia (juzgado de paz / especializado / sala / etc.)
    def inst_tipo(s):
        s = str(s)
        if "PAZ" in s: return "JUZGADO DE PAZ LETRADO"
        if "SALA" in s: return "SALA SUPERIOR"
        if "INV" in s or "PREPARAT" in s: return "JUZ. INVESTIGACION PREPARATORIA"
        if "UNIPERSONAL" in s: return "JUZ. PENAL UNIPERSONAL"
        if "COLEGIADO" in s: return "JUZ. PENAL COLEGIADO"
        if "LABORAL" in s or "TRABAJO" in s: return "JUZGADO LABORAL"
        if "FAMILIA" in s: return "JUZGADO DE FAMILIA"
        if "CIVIL" in s: return "JUZGADO CIVIL"
        return "OTRO"
    d["instancia_tipo"] = inst.map(inst_tipo)
    d["proceso"] = d.get("proceso").fillna("NA").astype(str)
    # mes del año (estacionalidad) desde MES (AAAAMM) o FECHA_INGRESO
    mes = pd.to_numeric(d.get("MES"), errors="coerce")
    d["mes_anio"] = (mes % 100).fillna(0).astype(int).clip(0, 12)
    return d[CAT + NUM + [TARGET]].dropna(subset=[TARGET])


def main():
    d = load()
    print(f"Filas de entrenamiento (demora 1–998 días): {len(d):,}")
    X, y = d[CAT + NUM], d[TARGET].values
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42)

    pre = ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore", max_categories=40, sparse_output=False), CAT)], remainder="passthrough")
    model = Pipeline([("pre", pre), ("gb", HistGradientBoostingRegressor(max_iter=400, learning_rate=0.06, max_depth=6, random_state=42))])
    model.fit(Xtr, ytr)

    pred = model.predict(Xte)
    mae = mean_absolute_error(yte, pred)
    medae = float(np.median(np.abs(yte - pred)))
    r2 = r2_score(yte, pred)
    # baseline: predecir la mediana global
    base_mae = mean_absolute_error(yte, np.full_like(yte, np.median(ytr), dtype=float))
    print(f"MAE={mae:.1f} d | error mediano={medae:.1f} d | R2={r2:.3f} | baseline MAE={base_mae:.1f} d (mejora {(1-mae/base_mae)*100:.0f}%)")

    joblib.dump(model, MODELS / "demora.joblib")
    (MODELS / "demora_meta.json").write_text(json.dumps({
        "target": "dias_hasta_sentencia", "features": CAT + NUM,
        "n_train": len(Xtr), "n_test": len(Xte),
        "mae_dias": round(mae, 1), "error_mediano_dias": round(medae, 1), "r2": round(r2, 3),
        "baseline_mae_dias": round(base_mae, 1),
        "cobertura": "CSJ Piura (NLPT, alimentos, penal, civil)",
        "modelo": "HistGradientBoostingRegressor", "nota": "Solo válido para jurisdicciones con microdata real.",
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    # resumen por proceso para el dashboard: predicción mediana + error
    by = []
    for proc, g in d.groupby("proceso"):
        p = model.predict(g[CAT + NUM])
        by.append({"proceso": proc, "n": int(len(g)),
                   "demora_real_mediana": int(np.median(g[TARGET])),
                   "demora_predicha_mediana": int(np.median(p))})
    OUT_JSON.write_text(json.dumps({
        "_meta": {"fuente": "Modelo ML sobre microdata CSJ Piura (datosabiertos.gob.pe)",
                  "fecha_corte": "2026-06", "cobertura": "CSJ Piura", "granularidad": "expediente",
                  "modelo": "HistGradientBoostingRegressor"},
        "metricas": {"mae_dias": round(mae, 1), "error_mediano_dias": round(medae, 1), "r2": round(r2, 3),
                     "baseline_mae_dias": round(base_mae, 1), "n_test": len(Xte)},
        "por_proceso": sorted(by, key=lambda x: -x["demora_real_mediana"]),
        "nota": "Predicción de días hasta sentencia. Solo válido para CSJ Piura (única microdata real disponible). No extrapolar al resto del país.",
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"-> {(MODELS/'demora.joblib').relative_to(ROOT)}")
    print(f"-> {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
