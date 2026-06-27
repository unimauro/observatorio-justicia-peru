# 🏛️ Observatorio Nacional del Sistema de Justicia del Perú

[![Estado](https://img.shields.io/badge/fase-1%20MVP-blue)](#-roadmap)
[![Datos](https://img.shields.io/badge/datos-sint%C3%A9ticos-orange)](#-aviso-importante-datos-sint%C3%A9ticos)
[![Stack](https://img.shields.io/badge/stack-Python%20%7C%20ECharts%20%7C%20Leaflet-success)](#-stack-tecnol%C3%B3gico)
[![Deploy](https://img.shields.io/badge/deploy-GitHub%20Pages-black)](#-despliegue)
[![Licencia](https://img.shields.io/badge/licencia-MIT-green)](#-licencia)

> **Plataforma de datos abiertos e inteligencia territorial sobre el sistema de justicia peruano.**
> Visualiza la carga procesal, la congestión, las demoras, las rotaciones de jueces y fiscales,
> y los casos álgidos de seguridad (crimen organizado, extorsión, narcotráfico, corrupción)
> a nivel nacional, departamental y por Corte Superior.

---

## 🎯 ¿Qué es esto?

El sistema de justicia del Perú procesa cada año **millones de expedientes** con una de las
mayores tasas de congestión de la región. Sin embargo, la información sobre su desempeño está
dispersa, en PDFs, y rara vez es comparable entre territorios.

El **Observatorio Nacional del Sistema de Justicia** busca cambiar eso: consolidar, normalizar y
visualizar los indicadores clave del aparato judicial y fiscal peruano en un único tablero
abierto, con un foco especial en dos preguntas que importan a la ciudadanía:

1. **¿Dónde se está atascando la justicia?** — Congestión, mora, backlog y demora por territorio.
2. **¿Quién juzga qué y dónde?** — Magistrados (jueces y fiscales), sus **rotaciones históricas**
   y su exposición a **casos álgidos de seguridad**.

```text
        ┌──────────────────────────────────────────────────────────┐
        │   OBSERVATORIO NACIONAL DEL SISTEMA DE JUSTICIA — PERÚ     │
        ├──────────────┬──────────────┬──────────────┬──────────────┤
        │  Nacional    │ Territorial  │ Magistrados  │  Seguridad   │
        │  KPIs + serie│ Mapa + corte │ Rotaciones   │ Casos álgidos│
        └──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
               │              │              │              │
               ▼              ▼              ▼              ▼
        ┌──────────────────────────────────────────────────────────┐
        │            site/data/*.json  (ETL Python)                 │
        └──────────────────────────────────────────────────────────┘
```

---

## 🧩 Módulos del dashboard

| Módulo | Descripción | Datasets |
|--------|-------------|----------|
| 🇵🇪 **Panorama Nacional** | KPIs del sistema (ingresados, resueltos, pendientes, clearance, congestión, mora, demora) + serie histórica 2010–2026 | `nacional.json`, `series.json` |
| 🗺️ **Inteligencia Territorial** | Mapa coroplético (Leaflet) por departamento: carga, congestión, pobreza, riesgo de seguridad | `departamentos.json` |
| ⚖️ **Cortes Superiores** | Ranking de las 35 Cortes por congestión, carga por juez y clearance rate | `cortes.json` |
| 🔻 **Embudo Procesal** | Flujo del expediente: ingreso → admisión → trámite → sentencia → apelación → ejecución | `embudo.json` |
| 📚 **Materias y Demoras** | Tiempos de resolución (mediana / p90) y tasa de apelación por tipo de proceso | `tipos_proceso.json` |
| 👨‍⚖️ **Jueces y Fiscales** | Perfil de magistrados, especialidad, condición, carga y **rotaciones históricas** | `jueces.json`, `fiscales.json` |
| 🚨 **Casos de Seguridad** | Casos álgidos (crimen organizado, extorsión, narcotráfico, corrupción, trata) y su alerta | `casos_seguridad.json` |
| 🧱 **Backlog Crítico** | Juzgados con mayor acumulación de expedientes pendientes | `backlog.json` |
| 📐 **Glosario** | Definiciones y fórmulas de los indicadores | `indicadores.json` |

---

## 🛠️ Stack tecnológico

### Fase 1 (actual) — estático, sin backend

| Capa | Tecnología |
|------|------------|
| Generación de datos (ETL) | **Python 3** (`etl/generate_synthetic.py`) |
| Formato de datos | **JSON** estático en `site/data/` |
| Visualización | **Apache ECharts** (gráficos) + **Leaflet** (mapas) |
| Frontend | HTML + JS **client-side** (sin servidor) |
| Hosting | **GitHub Pages** |

> Todo corre en el navegador. No hay base de datos ni API en Fase 1: el dashboard
> consume archivos JSON pre-generados, lo que lo hace gratuito, rápido y trivialmente desplegable.

### Roadmap técnico (futuro)

**FastAPI** (API) · **PostgreSQL + PostGIS** (datos geoespaciales) · **DuckDB** (analítica local) ·
**scikit-learn / XGBoost** (modelos predictivos) · **Claude API** (asistente IA y enriquecimiento).

Ver [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) y [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## 🚀 Cómo correr el proyecto

### 1. Generar los datos (ETL)

```bash
python3 etl/generate_synthetic.py
```

Esto (re)genera los archivos JSON en `site/data/` de forma determinista (seed fija).

### 2. Ver el dashboard localmente

```bash
cd site
python3 -m http.server 8000
```

Luego abre **http://localhost:8000** en el navegador.

> Se sirve por HTTP (no abriendo el `index.html` directo) porque el dashboard hace `fetch`
> de los JSON, y los navegadores bloquean `fetch` desde el protocolo `file://`.

---

## 📁 Estructura de carpetas

```text
observatorio-justicia-peru/
├── README.md                 # Este archivo
├── docs/                     # Documentación técnica
│   ├── ARCHITECTURE.md       # Arquitectura y flujo de datos
│   ├── ROADMAP.md            # Plan en 5 fases
│   ├── DATA_MODEL.md         # Modelo relacional objetivo (PostgreSQL)
│   ├── INDICATORS.md         # Glosario de indicadores judiciales
│   └── DATA_CATALOG.md       # Catálogo detallado de cada dataset
├── etl/                      # Pipeline de datos
│   ├── generate_synthetic.py # Generador de datos sintéticos (Fase 1)
│   ├── sources/              # (futuro) conectores a fuentes oficiales
│   ├── pipeline/             # (futuro) transformaciones ETL
│   └── duck/                 # (futuro) consultas/analítica DuckDB
├── site/                     # Dashboard estático (GitHub Pages)
│   └── data/                 # Datasets JSON generados por el ETL
│       ├── manifest.json
│       ├── nacional.json
│       ├── departamentos.json
│       ├── cortes.json
│       ├── series.json
│       ├── tipos_proceso.json
│       ├── embudo.json
│       ├── backlog.json
│       ├── jueces.json
│       ├── fiscales.json
│       ├── casos_seguridad.json
│       └── indicadores.json
├── frontend/                 # (futuro) frontend con framework
├── data/                     # (futuro) datos crudos/intermedios
└── scripts/                  # (futuro) utilidades
```

---

## 🗺️ Roadmap resumido

| Fase | Objetivo | Estado |
|------|----------|--------|
| **1** | Dashboard nacional + datos sintéticos | ✅ **Hecho** |
| **2** | Integración de datos reales vía ETL oficial + mapa | 🔜 Planificado |
| **3** | Analítica avanzada + benchmark territorial | 🔜 Planificado |
| **4** | Machine Learning predictivo (demora, apelación, carga futura) | 🔮 Futuro |
| **5** | Asistente IA (LLM) + variables socioeconómicas para ubicar nuevos juzgados | 🔮 Futuro |

Detalle completo en [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## 🌐 Despliegue

El dashboard se publica como sitio estático en **GitHub Pages** desde la carpeta `site/`.

**URL de producción:** `https://unimauro.github.io/observatorio-justicia-peru/`

> Para publicar: en la configuración del repositorio en GitHub → **Settings → Pages**,
> selecciona la rama y la carpeta `/site` como fuente. Cada `push` actualiza el sitio.

---

## ⚠️ Aviso importante: DATOS SINTÉTICOS

> **En la Fase 1, TODOS los datos son SINTÉTICOS (generados artificialmente).**

No representan registros reales de expedientes, magistrados ni casos. Son **datos simulados**
generados de forma determinista, pero **calibrados con órdenes de magnitud públicos** del sistema
de justicia peruano para que el dashboard se vea y se comporte de forma realista:

- ~**3.7 M** expedientes ingresados por año
- ~**3,350** jueces a nivel nacional
- Congestión procesal ~**2.5**
- Demora promedio ~**636 días**
- **35** Cortes Superiores y **25** departamentos

Los nombres de jueces, fiscales y casos son **ficticios**. La integración de datos oficiales
(Poder Judicial, Ministerio Público, JNJ, INEI, MINJUSDH) corresponde a la **Fase 2**.

---

## 🏛️ Instituciones fuente (objetivo Fase 2+)

- **Poder Judicial del Perú** — expedientes, cortes, juzgados, producción.
- **Ministerio Público / Fiscalía de la Nación** — carga fiscal, casos.
- **Junta Nacional de Justicia (JNJ)** — nombramientos y **rotaciones** de magistrados.
- **INEI** — población, pobreza, criminalidad.
- **MINJUSDH** — política criminal y penitenciaria.

---

## 📄 Licencia

Distribuido bajo licencia **MIT**. Úsalo, modifícalo y compártelo libremente.

## 👤 Autor

**Carlos Mauro** ([@unimauro](https://github.com/unimauro))

---

> _Proyecto de datos abiertos con fines de transparencia y análisis. Los datos de la Fase 1 son
> sintéticos y no deben usarse para decisiones reales._
