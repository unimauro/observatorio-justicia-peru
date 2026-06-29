# SPEC — Dashboard del Sistema de Justicia del Perú (carga procesal y demoras)

> **Fuente de la verdad del proyecto.** Todo el trabajo de datos se sincroniza contra este
> documento. No se empieza a codear una fase sin haber cerrado la anterior.
>
> **Estado:** FASE 0 (inventario) ejecutada → ver [`data/INVENTARIO.md`](data/INVENTARIO.md) y
> [`data/raw/MANUAL_DOWNLOADS.md`](data/raw/MANUAL_DOWNLOADS.md). **Pausa para revisión del inventario.**
>
> Nota: existe un **prototipo previo (Fase 1 sintética)** ya desplegado en GitHub Pages con datos
> simulados, usado solo para validar la UI. Este SPEC lo reemplaza como hoja de ruta de datos reales.

## 0. Objetivo

Construir un dashboard que permita ver la problemática del sistema de justicia peruano:
carga procesal, procesos con altas demoras, y tipos de proceso estancados por juzgado /
corte superior / especialidad / instancia / año. El dashboard debe ser **honesto sobre la
calidad y disponibilidad de los datos**: si un dato no existe en fuente abierta, no se inventa.

## 1. Realidad de los datos (LEER ANTES DE CODEAR)

NO existe una API nacional única con "expedientes estancados por juzgado y días de demora".
Las fuentes reales son heterogéneas. Trabaja con lo que existe:

| Fuente | Qué tiene | Formato | Acceso |
|---|---|---|---|
| Portal Estadístico PJ — portalestadistico.pj.gob.pe | Carga procesal (ingresos/resueltos/pendientes) por corte, especialidad, instancia, año | PDF / tablero | **Bloquea scraping**. Descarga MANUAL → `data/raw/pj_portal/` |
| Plataforma Nacional de Datos Abiertos — datosabiertos.gob.pe | Microdata por expediente, fragmentada por corte/materia (TC 1992-2026, NLPT por corte, NCPP, etc.) | CSV / JSON / XLSX, API DKAN/CKAN | Automatizable vía API |
| INEI | Anuario de Criminalidad y Seguridad Ciudadana; Compendio Estadístico (carga procesal agregada) | PDF (algunos XLS) | Descarga MANUAL |
| Comisión Nacional de Productividad Judicial (CNPJ) | Estándares de expedientes resueltos por tipo de órgano | PDF / resoluciones | Descarga MANUAL |
| Ministerio Público (MPFN) | Boletines estadísticos, carga fiscal | PDF + CSV (datosabiertos) | Mixto |

Consecuencia de diseño clave:
- **Demora literal en días** (fecha de ingreso → fecha de resolución) solo es calculable donde
  hay microdata por expediente (TC, NLPT/Alimentos/Penal de algunas cortes en datosabiertos).
- Para todo lo demás, usa **índices agregados de congestión/resolución**. NO derives "días de
  demora" de datos agregados; sería inventar.

## 2. FASE 0 — Inventario de datos (✅ ejecutada — pendiente de revisión)

1. Consultar API de datosabiertos.gob.pe (DKAN/CKAN). → **Responde** `…/api/3/action/package_list`
   y `…/api/3/action/package_show?id=<slug>` (CKAN-compat sobre DKAN 1.x/Drupal 7). El
   `package_search?q=` redirige a HTML (no usar). Documentado en `data/INVENTARIO.md`.
2. Registrar cada dataset en `data/INVENTARIO.md`: título, institución, URL, formato, cobertura,
   granularidad (expediente|agregado), columnas (fechas, tipo de proceso, estado, corte, juzgado).
3. Marcar **automatizable** vs **descarga manual**.
4. `data/raw/MANUAL_DOWNLOADS.md` con los PDFs/Excel a descargar a mano.

**Entregable: `data/INVENTARIO.md` + `data/raw/MANUAL_DOWNLOADS.md`. Pausa y revisión.**

## 3. FASE 1 — ETL

- Descarga automatizada de CSV/JSON/XLSX de datosabiertos a `data/raw/`.
- Parser para PDFs descargados manualmente (`pdfplumber` o `camelot`; si una tabla no se extrae
  limpia, se registra en log y no se inventan celdas).
- Normalizar a esquema "tidy" único en `data/processed/` (Parquet o SQLite). Esquema mínimo:
  - `corte_superior`, `distrito_judicial`, `instancia`, `especialidad`, `tipo_proceso`,
    `anio`, `periodo`, `pendientes_inicio`, `ingresos`, `resueltos`, `pendientes_fin`,
    `fuente`, `fecha_corte`, `granularidad` (expediente|agregado).
  - Microdata por expediente, tabla aparte: `expediente_id`, `fecha_ingreso`,
    `fecha_resolucion`, `tipo_proceso`, `estado`, `corte`, `juzgado`.
- Cada fila DEBE conservar `fuente` y `fecha_corte`. Sin eso, se descarta.
- Tests: ingresos/resueltos/pendientes no negativos; años en rango.

## 4. FASE 2 — Indicadores (fórmulas estándar)

Sobre datos agregados:
- **Carga procesal** = `pendientes_inicio + ingresos`
- **Tasa de resolución (clearance)** = `resueltos / ingresos * 100` (>100 descarga atraso; <100 crece)
- **Tasa de congestión** = `(pendientes_inicio + ingresos) / resueltos` (≥1; mayor = más congestión)
- **Tasa de pendencia** = `pendientes_fin / carga_procesal * 100`
- **% en trámite vs % en ejecución** (donde la fuente lo distinga)
- **Brecha vs estándar CNPJ** = `resueltos - estandar_resueltos` por tipo de órgano

Solo con microdata por expediente:
- **Tiempo de tramitación real** = `fecha_resolucion - fecha_ingreso` (días); **mediana y p90**, no solo promedio.
- **Antigüedad de pendientes** = `hoy - fecha_ingreso` para expedientes sin resolver.

Usar `Decimal` para tasas; redondear solo en presentación.

## 5. FASE 3 — Dashboard

Default: **Streamlit** leyendo `data/processed/`. Alternativa: **FastAPI** + frontend React/Recharts.
Implementar el default salvo indicación. (El prototipo estático ECharts/Leaflet sirve como vista
pública ligera para GitHub Pages; el Streamlit/FastAPI es la herramienta analítica completa.)

Vistas: (1) Panorama nacional, (2) Por corte/especialidad/instancia, (3) Tipos de proceso
estancados, (4) Demoras reales (solo slices con microdata, con banner de cobertura), (5) Calidad
del dato (cobertura, `fecha_corte`, huecos). Cada gráfico cita **fuente + fecha de corte** al pie.

## 6. Estructura del repo

```
/data
  /raw            # descargas (csv, json, pdf)
  /processed      # parquet/sqlite normalizado
  INVENTARIO.md
/etl              # descarga, parseo, normalización
/indicators       # cálculo de métricas (testeado)
/dashboard        # streamlit o fastapi+frontend
/tests
README.md
docker-compose.yml
```

## 7. Restricciones (no negociables)

- **Nunca inventar datos.** Si falta, "sin dato" y se registra el hueco.
- **Siempre citar fuente + fecha de corte** en cada cifra mostrada.
- **No derivar demoras en días desde datos agregados.** Solo desde microdata por expediente.
- **Privacidad**: varios microdata (NLPT, Alimentos) traen **DNI y fecha de nacimiento** →
  anonimizar/eliminar antes de procesar. No exponer datos personales en el dashboard.
- Distinguir siempre `granularidad = expediente | agregado`.
- Documentar en README los supuestos y limitaciones de cada indicador.

## 8. Plan de agentes (tracks paralelos)

- **Track A**: ETL + parsers de PDF.
- **Track B**: indicadores + pytest de validación numérica (boundaries, Decimal).
- **Track C**: dashboard / UI.

Sincronizan contra este spec.

## 9. Infraestructura (datos pesados → servicio backend)

Datos livianos (agregados, JSON de presentación) viven en el repo y se sirven por GitHub Pages.
**Datos pesados** (microdata por expediente, históricos completos, Parquet grandes) se procesan en
un **servicio backend** (servidor propio o función serverless) y, de requerirse, exponen una API.
El dashboard estático consume agregados precomputados; el análisis pesado corre en el backend, no
en el navegador. Los detalles operativos (proveedor, hosts, puertos, credenciales) NO se versionan
en este repositorio público.
