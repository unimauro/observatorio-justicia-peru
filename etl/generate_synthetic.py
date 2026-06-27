#!/usr/bin/env python3
"""
Observatorio Nacional de Justicia del Peru
Generador de datos SINTETICOS realistas para la Fase 1 (exploracion + dashboard).

ATENCION: estos datos son simulados y sirven para construir y validar el dashboard
mientras se conectan las fuentes oficiales (ver docs/DATA_CATALOG.md). Los ordenes de
magnitud estan calibrados con cifras publicas del Poder Judicial / INEI, pero NO deben
interpretarse como datos reales hasta integrar el ETL oficial.

Salida: site/data/*.json  (consumidos por el dashboard estatico)
"""
from __future__ import annotations
import json
import math
import random
from pathlib import Path

SEED = 27806  # guino a la Ley 27806 de Transparencia
random.seed(SEED)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "site" / "data"
OUT.mkdir(parents=True, exist_ok=True)

ANIO_ACTUAL = 2026
ANIO_INICIO = 2010

# --------------------------------------------------------------------------------------
# Departamentos del Peru (25) con centroides aprox (lat, lng) y poblacion aprox (miles)
# --------------------------------------------------------------------------------------
DEPARTAMENTOS = [
    # nombre, lat, lng, poblacion_miles, indice_pobreza(0-1), riesgo_seguridad(0-1)
    ("Amazonas",      -5.20, -78.00,   425, 0.34, 0.30),
    ("Ancash",        -9.53, -77.53,  1180, 0.24, 0.34),
    ("Apurimac",     -14.00, -73.00,   430, 0.36, 0.28),
    ("Arequipa",     -16.40, -71.53,  1500, 0.12, 0.45),
    ("Ayacucho",     -13.16, -74.22,   690, 0.34, 0.31),
    ("Cajamarca",     -7.16, -78.50,  1450, 0.41, 0.33),
    ("Callao",       -12.05, -77.12,  1130, 0.13, 0.78),
    ("Cusco",        -13.53, -71.97,  1360, 0.20, 0.40),
    ("Huancavelica", -12.78, -74.97,   370, 0.42, 0.25),
    ("Huanuco",       -9.93, -76.24,   760, 0.33, 0.42),
    ("Ica",          -14.07, -75.73,   980, 0.09, 0.49),
    ("Junin",        -12.07, -75.21,  1380, 0.22, 0.47),
    ("La Libertad",   -8.11, -79.03,  2050, 0.21, 0.74),
    ("Lambayeque",    -6.70, -79.91,  1320, 0.19, 0.58),
    ("Lima",         -12.05, -77.04, 10800, 0.16, 0.68),
    ("Loreto",        -3.75, -73.25,  1030, 0.32, 0.41),
    ("Madre de Dios",-12.59, -69.18,   175, 0.10, 0.55),
    ("Moquegua",     -17.19, -70.93,   195, 0.10, 0.30),
    ("Pasco",        -10.68, -76.26,   270, 0.27, 0.33),
    ("Piura",         -5.19, -80.63,  2050, 0.25, 0.61),
    ("Puno",         -15.84, -70.02,  1230, 0.30, 0.36),
    ("San Martin",    -6.49, -76.36,   900, 0.26, 0.44),
    ("Tacna",        -18.01, -70.25,   370, 0.11, 0.40),
    ("Tumbes",        -3.57, -80.46,   250, 0.16, 0.66),
    ("Ucayali",       -8.38, -74.55,   600, 0.27, 0.52),
]

# --------------------------------------------------------------------------------------
# Cortes Superiores de Justicia (Distritos Judiciales) -> departamento sede
# --------------------------------------------------------------------------------------
CORTES = [
    ("Lima",                 "Lima"),
    ("Lima Norte",           "Lima"),
    ("Lima Sur",             "Lima"),
    ("Lima Este",            "Lima"),
    ("Ventanilla",           "Callao"),
    ("Callao",               "Callao"),
    ("Canete",               "Lima"),
    ("Arequipa",             "Arequipa"),
    ("La Libertad",          "La Libertad"),
    ("Lambayeque",           "Lambayeque"),
    ("Piura",                "Piura"),
    ("Sullana",              "Piura"),
    ("Cusco",                "Cusco"),
    ("Junin",                "Junin"),
    ("Ancash",               "Ancash"),
    ("Santa",                "Ancash"),
    ("Cajamarca",            "Cajamarca"),
    ("Ica",                  "Ica"),
    ("Puno",                 "Puno"),
    ("San Roman",            "Puno"),
    ("Loreto",               "Loreto"),
    ("Ucayali",              "Ucayali"),
    ("Huanuco",              "Huanuco"),
    ("Ayacucho",             "Ayacucho"),
    ("Huancavelica",         "Huancavelica"),
    ("Apurimac",             "Apurimac"),
    ("Amazonas",             "Amazonas"),
    ("San Martin",           "San Martin"),
    ("Tacna",                "Tacna"),
    ("Moquegua",             "Moquegua"),
    ("Tumbes",               "Tumbes"),
    ("Pasco",                "Pasco"),
    ("Madre de Dios",        "Madre de Dios"),
    ("Selva Central",        "Junin"),
    ("Lima Noroeste",        "Lima"),
]

# --------------------------------------------------------------------------------------
# Tipos de proceso con demora mediana aprox (dias) y peso relativo de carga
# --------------------------------------------------------------------------------------
TIPOS_PROCESO = [
    # nombre, demora_mediana_dias, peso_carga, materia
    ("Penal",                 540, 0.27, "Penal"),
    ("Civil",                 820, 0.18, "Civil"),
    ("Familia",               360, 0.16, "Familia"),
    ("Familia - Alimentos",   140, 0.09, "Familia"),
    ("Laboral",               430, 0.10, "Laboral"),
    ("Constitucional",        210, 0.05, "Constitucional"),
    ("Contencioso Adm.",      610, 0.06, "Contencioso"),
    ("Comercial",             480, 0.04, "Comercial"),
    ("Tributario",            560, 0.03, "Tributario"),
    ("Notarial / No Cont.",    95, 0.02, "Notarial"),
]

# --------------------------------------------------------------------------------------
# Etapas del embudo procesal
# --------------------------------------------------------------------------------------
ETAPAS = ["Ingresados", "Admitidos", "En tramite", "Sentenciados",
          "Apelados", "Ejecutados", "Archivados"]

# --------------------------------------------------------------------------------------
# Nombres para generar magistrados (jueces / fiscales) sinteticos
# --------------------------------------------------------------------------------------
NOMBRES = ["Carlos", "Maria", "Jose", "Ana", "Luis", "Rosa", "Jorge", "Elena",
           "Miguel", "Carmen", "Cesar", "Patricia", "Victor", "Lucia", "Raul",
           "Sofia", "Manuel", "Gloria", "Fernando", "Beatriz", "Roberto", "Teresa"]
APELLIDOS = ["Quispe", "Mamani", "Rojas", "Vargas", "Flores", "Huaman", "Castillo",
             "Ramos", "Torres", "Diaz", "Salazar", "Cordova", "Benavides", "Ponce",
             "Saavedra", "Zegarra", "Atarama", "Concha", "Lujan", "Espinoza",
             "Villanueva", "Carhuancho", "Chavez", "Najar", "Aldana"]

ESPECIALIDADES = ["Penal", "Civil", "Familia", "Laboral", "Constitucional",
                  "Penal - Crimen Organizado", "Anticorrupcion"]
CONDICIONES = ["Titular", "Provisional", "Supernumerario"]

# Casos algidos de seguridad (categorias tematicas)
TEMAS_SEGURIDAD = [
    "Crimen organizado", "Extorsion", "Sicariato", "Mineria ilegal",
    "Narcotrafico (TID)", "Trata de personas", "Corrupcion de funcionarios",
    "Lavado de activos", "Terrorismo", "Bandas criminales",
]


def jitter(base: float, pct: float) -> float:
    return base * (1 + random.uniform(-pct, pct))


def magistrado_nombre() -> str:
    return f"{random.choice(NOMBRES)} {random.choice(APELLIDOS)} {random.choice(APELLIDOS)}"


# ======================================================================================
# 1) Cortes superiores: metricas base del anio actual
# ======================================================================================
def build_cortes():
    dep_idx = {d[0]: d for d in DEPARTAMENTOS}
    # cuantas cortes hay por departamento (para repartir la poblacion/carga)
    cortes_por_dep = {}
    for _, dep in CORTES:
        cortes_por_dep[dep] = cortes_por_dep.get(dep, 0) + 1
    cortes = []
    for nombre, dep in CORTES:
        d = dep_idx[dep]
        pob = d[3] / cortes_por_dep[dep]  # poblacion atendida por esta corte
        riesgo = d[5]
        # carga escala con poblacion + factor aleatorio
        base = pob * 1000 * jitter(0.112, 0.22)
        ingresados = int(base)
        # tasa de resolucion (clearance) entre 0.78 y 1.05, peor donde hay mas riesgo
        clearance = max(0.62, min(1.08, jitter(1.0 - riesgo * 0.18, 0.08)))
        resueltos = int(ingresados * clearance)
        # pendientes acumulados (backlog) ~ 0.8 a 1.7 x ingresos anuales
        pendientes = int(ingresados * jitter(0.9 + riesgo * 0.6, 0.20))
        jueces = max(6, int(ingresados / jitter(1100, 0.18)))
        carga_por_juez = round(ingresados / jueces, 1)
        # congestion = (pendientes + ingresados) / resueltos
        congestion = round((pendientes + ingresados) / max(resueltos, 1), 2)
        demora = int(jitter(430 + riesgo * 380, 0.15))
        cortes.append({
            "corte": f"CSJ {nombre}",
            "departamento": dep,
            "ingresados": ingresados,
            "resueltos": resueltos,
            "pendientes": pendientes,
            "jueces": jueces,
            "carga_por_juez": carga_por_juez,
            "clearance_rate": round(clearance, 3),
            "congestion": congestion,
            "demora_dias": demora,
            "riesgo_seguridad": round(riesgo, 2),
        })
    cortes.sort(key=lambda c: c["congestion"], reverse=True)
    for i, c in enumerate(cortes, 1):
        c["ranking_congestion"] = i
    return cortes


# ======================================================================================
# 2) Departamentos: agregados para el mapa coropletico
# ======================================================================================
def build_departamentos(cortes):
    agg = {}
    for c in cortes:
        dep = c["departamento"]
        a = agg.setdefault(dep, {"ingresados": 0, "resueltos": 0,
                                 "pendientes": 0, "jueces": 0, "demoras": []})
        a["ingresados"] += c["ingresados"]
        a["resueltos"] += c["resueltos"]
        a["pendientes"] += c["pendientes"]
        a["jueces"] += c["jueces"]
        a["demoras"].append(c["demora_dias"])
    out = []
    for nombre, lat, lng, pob, pobreza, riesgo in DEPARTAMENTOS:
        a = agg.get(nombre)
        if not a:
            continue
        demora = int(sum(a["demoras"]) / len(a["demoras"]))
        congestion = round((a["pendientes"] + a["ingresados"]) / max(a["resueltos"], 1), 2)
        out.append({
            "departamento": nombre,
            "lat": lat, "lng": lng,
            "poblacion_miles": pob,
            "pobreza": pobreza,
            "riesgo_seguridad": riesgo,
            "ingresados": a["ingresados"],
            "resueltos": a["resueltos"],
            "pendientes": a["pendientes"],
            "jueces": a["jueces"],
            "demora_dias": demora,
            "congestion": congestion,
            "procesos_por_1000hab": round(a["ingresados"] / (pob), 1),
            "carga_por_juez": round(a["ingresados"] / max(a["jueces"], 1), 1),
        })
    out.sort(key=lambda x: x["congestion"], reverse=True)
    return out


# ======================================================================================
# 3) KPIs nacionales
# ======================================================================================
def build_nacional(cortes):
    ing = sum(c["ingresados"] for c in cortes)
    res = sum(c["resueltos"] for c in cortes)
    pen = sum(c["pendientes"] for c in cortes)
    jueces = sum(c["jueces"] for c in cortes)
    demora = int(sum(c["demora_dias"] * c["ingresados"] for c in cortes) / ing)
    return {
        "anio": ANIO_ACTUAL,
        "expedientes_ingresados": ing,
        "expedientes_resueltos": res,
        "expedientes_pendientes": pen,
        "expedientes_activos": pen + ing - res,
        "clearance_rate": round(res / ing, 3),
        "tiempo_promedio_dias": demora,
        "jueces": jueces,
        "carga_por_juez": round(ing / jueces, 1),
        "congestion": round((pen + ing) / res, 2),
        "indice_mora": round(pen / (pen + res), 3),
        "cortes_superiores": len(cortes),
        "nota": "DATOS SINTETICOS calibrados con ordenes de magnitud publicos. Ver docs/DATA_CATALOG.md",
    }


# ======================================================================================
# 4) Series de tiempo nacional 2010-2026
# ======================================================================================
def build_series(nacional):
    base_ing = int(nacional["expedientes_ingresados"] / 1.6)
    series = []
    pend = int(base_ing * 1.1)
    for anio in range(ANIO_INICIO, ANIO_ACTUAL + 1):
        growth = (anio - ANIO_INICIO) * 0.032
        covid = 0.62 if anio == 2020 else (0.85 if anio == 2021 else 1.0)
        ingresados = int(base_ing * (1 + growth) * covid * jitter(1.0, 0.04))
        clearance = jitter(0.92 if anio < 2020 else 0.97, 0.05)
        resueltos = int(ingresados * clearance)
        pend = max(0, pend + ingresados - resueltos)
        demora = int(jitter(560 + (anio - ANIO_INICIO) * 14 - (40 if anio > 2022 else 0), 0.04))
        series.append({
            "anio": anio,
            "ingresados": ingresados,
            "resueltos": resueltos,
            "pendientes": pend,
            "demora_dias": demora,
            "clearance_rate": round(resueltos / ingresados, 3),
        })
    return series


# ======================================================================================
# 5) Tipos de proceso (pie + heatmap demora)
# ======================================================================================
def build_tipos(nacional):
    ing = nacional["expedientes_ingresados"]
    out = []
    for nombre, demora, peso, materia in TIPOS_PROCESO:
        casos = int(ing * peso * jitter(1.0, 0.05))
        out.append({
            "tipo": nombre,
            "materia": materia,
            "casos": casos,
            "demora_mediana_dias": int(jitter(demora, 0.06)),
            "demora_p90_dias": int(jitter(demora * 1.9, 0.08)),
            "tasa_apelacion": round(jitter(0.18 + (0.12 if materia in ("Penal", "Laboral") else 0), 0.2), 3),
        })
    out.sort(key=lambda x: x["casos"], reverse=True)
    return out


# ======================================================================================
# 6) Embudo procesal
# ======================================================================================
def build_embudo(nacional):
    ing = nacional["expedientes_ingresados"]
    factores = [1.0, 0.93, 0.80, 0.52, 0.27, 0.19, 0.74]
    out = []
    for etapa, f in zip(ETAPAS, factores):
        out.append({"etapa": etapa, "expedientes": int(ing * f)})
    return out


# ======================================================================================
# 7) Backlog: top juzgados con mayor acumulacion
# ======================================================================================
def build_backlog(cortes):
    juzgados = []
    jid = 1
    for c in cortes:
        n = max(1, c["jueces"] // 6)
        for _ in range(n):
            esp = random.choice(ESPECIALIDADES)
            pend = int(jitter(c["pendientes"] / max(c["jueces"], 1) * 6, 0.4))
            demora = int(jitter(c["demora_dias"] * 1.3, 0.2))
            juzgados.append({
                "id": jid,
                "juzgado": f"{random.randint(1,12)}{random.choice(['er','do','er','to','mo'])} Juzgado {esp}",
                "corte": c["corte"],
                "departamento": c["departamento"],
                "especialidad": esp,
                "pendientes": pend,
                "demora_dias": demora,
                "carga": int(jitter(pend * 1.4, 0.2)),
            })
            jid += 1
    juzgados.sort(key=lambda j: j["pendientes"], reverse=True)
    return juzgados[:100]


# ======================================================================================
# 8) Jueces y Fiscales con ROTACIONES (historial de asignaciones)
# ======================================================================================
def build_magistrados(cortes, rol: str, n: int):
    corte_names = [c["corte"] for c in cortes]
    out = []
    for i in range(1, n + 1):
        esp = random.choice(ESPECIALIDADES)
        # mas peso a especialidades de seguridad para el foco del proyecto
        if random.random() < 0.22:
            esp = random.choice(["Penal - Crimen Organizado", "Anticorrupcion", "Penal"])
        anios_servicio = random.randint(2, 28)
        n_rot = random.randint(1, 5)
        rotaciones = []
        anio_cursor = ANIO_ACTUAL - anios_servicio
        for r in range(n_rot):
            dur = random.randint(1, max(1, anios_servicio // max(n_rot, 1) + 1))
            desde = anio_cursor
            hasta = min(ANIO_ACTUAL, anio_cursor + dur)
            rotaciones.append({
                "corte": random.choice(corte_names),
                "especialidad": esp if random.random() < 0.7 else random.choice(ESPECIALIDADES),
                "condicion": random.choice(CONDICIONES),
                "desde": desde,
                "hasta": hasta if hasta < ANIO_ACTUAL else None,  # None = actual
                "motivo": random.choice(["Nombramiento", "Traslado", "Ascenso",
                                         "Reasignacion", "Encargatura", "Ratificacion"]),
            })
            anio_cursor = hasta
        actual = rotaciones[-1]
        out.append({
            "id": f"{rol[:1].upper()}{i:04d}",
            "rol": rol,
            "nombre": magistrado_nombre(),
            "especialidad": actual["especialidad"],
            "condicion": actual["condicion"],
            "corte_actual": actual["corte"],
            "anios_servicio": anios_servicio,
            "n_rotaciones": n_rot,
            "casos_seguridad": random.randint(0, 14) if "Crimen" in esp or "Anticorrupcion" in esp or esp == "Penal" else random.randint(0, 3),
            "carga_actual": int(jitter(620, 0.35)),
            "tasa_resolucion": round(jitter(0.84, 0.12), 3),
            "rotaciones": rotaciones,
        })
    return out


# ======================================================================================
# 9) Casos algidos de seguridad (alto perfil)
# ======================================================================================
def build_casos_seguridad(cortes, jueces, fiscales):
    casos = []
    corte_high = [c for c in cortes if c["riesgo_seguridad"] >= 0.5] or cortes
    for i in range(1, 61):
        tema = random.choice(TEMAS_SEGURIDAD)
        corte = random.choice(corte_high)
        juez = random.choice(jueces)
        fiscal = random.choice(fiscales)
        ingreso = random.randint(2018, ANIO_ACTUAL)
        dias = (ANIO_ACTUAL - ingreso) * 365 + random.randint(0, 360)
        estados = ["Investigacion preparatoria", "Etapa intermedia", "Juicio oral",
                   "Sentenciado", "En apelacion", "Casacion"]
        estado = random.choices(estados, weights=[28, 18, 22, 14, 12, 6])[0]
        nivel = "Critico" if dias > 1000 else ("Riesgo" if dias > 500 else "Normal")
        casos.append({
            "id": f"SEG-{i:03d}",
            "tema": tema,
            "caso": f"Caso {tema} - {corte['departamento']} #{random.randint(100,999)}-{ingreso}",
            "corte": corte["corte"],
            "departamento": corte["departamento"],
            "juez_id": juez["id"],
            "juez": juez["nombre"],
            "fiscal_id": fiscal["id"],
            "fiscal": fiscal["nombre"],
            "anio_ingreso": ingreso,
            "dias_transcurridos": dias,
            "estado": estado,
            "imputados": random.randint(1, 38),
            "nivel_alerta": nivel,
        })
    casos.sort(key=lambda c: c["dias_transcurridos"], reverse=True)
    return casos


# ======================================================================================
# 10) Benchmark e indicadores (definiciones)
# ======================================================================================
INDICADORES_DEF = [
    {"indicador": "Tasa de resolucion (Clearance Rate)",
     "formula": "Resueltos / Ingresados", "interpretacion": ">1 el sistema reduce backlog; <1 lo acumula."},
    {"indicador": "Congestion procesal",
     "formula": "(Pendientes + Ingresados) / Resueltos", "interpretacion": "Mayor valor = mayor saturacion."},
    {"indicador": "Indice de mora",
     "formula": "Pendientes / (Pendientes + Resueltos)", "interpretacion": "Proporcion de carga sin resolver."},
    {"indicador": "Carga por juez",
     "formula": "Ingresados / N de jueces", "interpretacion": "Volumen de trabajo por magistrado."},
    {"indicador": "Tiempo promedio de resolucion",
     "formula": "Promedio ponderado de dias hasta resolucion", "interpretacion": "Duracion real del proceso."},
    {"indicador": "Procesos por 1000 hab.",
     "formula": "Ingresados / Poblacion * 1000", "interpretacion": "Litigiosidad relativa del territorio."},
]


def write(name, obj):
    p = OUT / name
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  -> {p.relative_to(ROOT)}  ({p.stat().st_size//1024} KB)")


def main():
    print("Generando datos sinteticos del Observatorio Nacional de Justicia...")
    cortes = build_cortes()
    departamentos = build_departamentos(cortes)
    nacional = build_nacional(cortes)
    series = build_series(nacional)
    tipos = build_tipos(nacional)
    embudo = build_embudo(nacional)
    backlog = build_backlog(cortes)
    jueces = build_magistrados(cortes, "Juez", 320)
    fiscales = build_magistrados(cortes, "Fiscal", 280)
    casos = build_casos_seguridad(cortes, jueces, fiscales)

    write("nacional.json", nacional)
    write("departamentos.json", departamentos)
    write("cortes.json", cortes)
    write("series.json", series)
    write("tipos_proceso.json", tipos)
    write("embudo.json", embudo)
    write("backlog.json", backlog)
    write("jueces.json", jueces)
    write("fiscales.json", fiscales)
    write("casos_seguridad.json", casos)
    write("indicadores.json", INDICADORES_DEF)

    # manifest para el frontend
    write("manifest.json", {
        "generado": "sintetico",
        "anio_actual": ANIO_ACTUAL,
        "anio_inicio": ANIO_INICIO,
        "seed": SEED,
        "n_cortes": len(cortes),
        "n_departamentos": len(departamentos),
        "n_jueces": len(jueces),
        "n_fiscales": len(fiscales),
        "n_casos_seguridad": len(casos),
        "datasets": ["nacional", "departamentos", "cortes", "series", "tipos_proceso",
                     "embudo", "backlog", "jueces", "fiscales", "casos_seguridad", "indicadores"],
    })
    print("Listo. Datos en site/data/")


if __name__ == "__main__":
    main()
