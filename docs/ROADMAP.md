# 🗺️ Roadmap — Observatorio Nacional del Sistema de Justicia del Perú

> ⚠️ **La fuente de la verdad del proyecto es [`SPEC.md`](../SPEC.md).** A partir de la versión de
> datos reales, el trabajo se rige por ese spec y por su principio rector: **nunca inventar datos;
> citar fuente + fecha de corte; no derivar demoras en días desde datos agregados.** La Fase 1
> sintética fue solo un prototipo de UI; el dashboard de producción se construye sobre **datos
> oficiales** inventariados en la [FASE 0](../data/INVENTARIO.md).

El proyecto avanza en fases, de un MVP estático con datos sintéticos hacia una plataforma de
inteligencia con datos reales, indicadores estándar, ML y asistente IA. Cada fase es entregable.

| Fase | Nombre | Estado |
|------|--------|--------|
| 0 | Inventario de datos reales (datosabiertos API + manuales) | ✅ **Hecho** — pendiente revisión |
| 1 (proto) | Dashboard nacional + datos **sintéticos** (prototipo UI) | ✅ **Hecho** (live GH Pages) |
| 1 (real) | ETL de fuentes oficiales → esquema tidy en `data/processed/` | 🔜 Siguiente |
| 2 | Indicadores estándar (clearance, congestión, demora real microdata) | 🔜 Planificado |
| 3 | Dashboard de producción (Streamlit / FastAPI) + vista calidad del dato | 🔜 Planificado |
| 4 | Machine Learning predictivo | 🔮 Futuro |
| 5 | Asistente IA (LLM) + capa socioeconómica | 🔮 Futuro |

### 🔌 Infraestructura
Datos livianos (agregados, JSON de presentación) → **repo + GitHub Pages**. Datos pesados
(microdata por expediente, históricos, Parquet) → un **servicio backend** para procesamiento y,
si hace falta, una API. Ver [`SPEC.md` §9](../SPEC.md).

---

## ✅ FASE 0 — Inventario de datos reales `[HECHO — pendiente de revisión]`

**Objetivo:** No asumir; saber exactamente qué datos abiertos existen antes de codear el ETL.

**Entregables**
- [x] Detectar API que responde en datosabiertos.gob.pe (CKAN-compat `package_list`/`package_show`).
- [x] Inventariar 4,665 datasets → 155 relevantes → núcleos judiciales/fiscales curados.
- [x] Documentar columnas reales, granularidad (expediente vs agregado) y demora calculable.
- [x] `data/INVENTARIO.md` + `data/raw/MANUAL_DOWNLOADS.md`.
- [ ] **Revisión del usuario antes de iniciar la FASE 1 real.**

---

## ✅ Fase 1 — Dashboard nacional + datos sintéticos `[HECHO]`

**Objetivo:** Tener un MVP visible, compartible y desplegado que pruebe el concepto y fije el
contrato de datos, sin depender de fuentes oficiales todavía.

**Entregables**
- Generador de datos sintéticos calibrado con órdenes de magnitud reales.
- Datasets JSON en `site/data/` (nacional, departamentos, cortes, magistrados, seguridad, etc.).
- Dashboard estático (ECharts + Leaflet) con los módulos principales.
- Despliegue en GitHub Pages.
- Documentación base (README, arquitectura, modelo de datos, indicadores, roadmap).

**Tareas**
- [x] Diseñar el esquema de cada dataset.
- [x] Implementar `etl/generate_synthetic.py` (seed fija, reproducible).
- [x] Generar KPIs nacionales y serie histórica 2010–2026.
- [x] Generar corte territorial (25 departamentos) con lat/lng, pobreza y riesgo.
- [x] Generar 35 Cortes Superiores con ranking de congestión.
- [x] Generar 320 jueces y 280 fiscales con historial de **rotaciones**.
- [x] Generar 60 casos de seguridad con niveles de alerta.
- [x] Construir glosario de indicadores.
- [x] Publicar en GitHub Pages.
- [x] Documentar el proyecto.

---

## 🔜 Fase 2 — Integración de datos reales + mapa

**Objetivo:** Reemplazar los datos sintéticos por **datos oficiales** mediante un ETL hacia
fuentes institucionales, y montar un mapa territorial real (distritos judiciales).

**Entregables**
- Conectores a fuentes oficiales en `etl/sources/`.
- Pipeline de normalización y validación en `etl/pipeline/`.
- Base de datos PostgreSQL + PostGIS con el modelo relacional (ver [`DATA_MODEL.md`](DATA_MODEL.md)).
- Mapa coroplético con geometrías reales de distritos judiciales.
- Marca clara de procedencia y fecha de corte de cada dato.

**Tareas**
- [ ] Inventariar y documentar las fuentes (Poder Judicial, Ministerio Público, JNJ, INEI, MINJUSDH).
- [ ] Construir conectores/scrapers de boletines estadísticos y portales de transparencia.
- [ ] Definir reglas de limpieza, deduplicación y normalización de nombres de cortes/juzgados.
- [ ] Diseñar e implementar el esquema PostgreSQL + PostGIS.
- [ ] Cargar geometrías de distritos judiciales / departamentos.
- [ ] Mapear datos reales de **rotaciones** de magistrados (JNJ).
- [ ] Validar contra órdenes de magnitud conocidos (control de calidad).
- [ ] Versionar los snapshots de datos (corte temporal).
- [ ] Reemplazar el consumo de JSON por el contrato de datos real (mismo esquema).

---

## 🔜 Fase 3 — Analítica avanzada + benchmark

**Objetivo:** Pasar de "mostrar datos" a "comparar y explicar". Benchmarks entre cortes y
departamentos, detección de outliers y descomposición de la congestión.

**Entregables**
- API de consulta (FastAPI) con filtros por territorio, materia y periodo.
- Motor analítico con DuckDB para agregaciones rápidas.
- Tableros de benchmark y rankings comparables.
- Detección de cuellos de botella (juzgados/cortes atípicos).

**Tareas**
- [ ] Levantar FastAPI con endpoints de KPIs filtrables.
- [ ] Integrar DuckDB para analítica OLAP sobre los datos normalizados.
- [ ] Implementar benchmark territorial (z-scores, percentiles, peer groups).
- [ ] Detección de outliers de congestión / mora / demora.
- [ ] Descomposición de la demora por etapa procesal.
- [ ] Series desestacionalizadas y tendencias.
- [ ] Exportación de reportes (CSV / PDF).
- [ ] Cachear agregaciones frecuentes.

---

## 🔮 Fase 4 — Machine Learning predictivo

**Objetivo:** Anticipar el comportamiento del sistema para apoyar la gestión: cuánto demorará un
expediente, qué probabilidad tiene de apelarse o archivarse, y cómo evolucionará la carga.

**Entregables**
- Modelo de **predicción de demora** de un expediente (regresión).
- Modelo de **probabilidad de apelación** y de **archivamiento** (clasificación).
- Modelo de **proyección de carga futura** por corte/territorio (series temporales).
- Pipeline de entrenamiento, evaluación y monitoreo de modelos.

**Tareas**
- [ ] Construir features a partir de tipo de proceso, materia, corte, carga, condición del magistrado, etc.
- [ ] Entrenar regresión de demora (p. ej. XGBoost) con validación temporal.
- [ ] Entrenar clasificadores de apelación / archivamiento (scikit-learn / XGBoost).
- [ ] Proyectar carga futura por corte (modelos de series temporales).
- [ ] Definir métricas de evaluación (MAE, AUC, calibración) y baselines.
- [ ] Exponer predicciones vía FastAPI.
- [ ] Monitorear *drift* y reentrenar de forma programada.
- [ ] Documentar limitaciones y sesgos de cada modelo.

---

## 🔮 Fase 5 — Asistente IA (LLM) + capa socioeconómica

**Objetivo:** Un asistente conversacional sobre los datos y, sobre todo, **cruzar el desempeño
judicial con variables socioeconómicas** (pobreza, criminalidad, presupuesto) para responder la
pregunta de política pública central: **¿dónde conviene crear nuevos juzgados o fiscalías?**

**Entregables**
- Asistente IA (Claude API) que responde preguntas en lenguaje natural sobre los indicadores.
- Capa de datos socioeconómicos integrada (pobreza, criminalidad, presupuesto, población).
- **Índice de prioridad de inversión judicial** por territorio.
- Recomendador de ubicación de nuevos juzgados/fiscalías.

**Tareas**
- [ ] Integrar la **Claude API** como asistente sobre los datos (consultas en lenguaje natural).
- [ ] Diseñar herramientas/funciones para que el LLM consulte la API de forma segura.
- [ ] Integrar variables socioeconómicas (INEI: pobreza, población; criminalidad; presupuesto público).
- [ ] Construir un índice compuesto de **déficit de cobertura judicial**.
- [ ] Cruzar carga vs. recursos vs. demanda social no atendida.
- [ ] Generar recomendaciones de creación/refuerzo de juzgados y fiscalías.
- [ ] Validar recomendaciones con criterios de política pública y restricciones presupuestales.
- [ ] Publicar reportes territoriales explicables y auditables.

---

## 🧭 Principios transversales

- **Reproducibilidad:** todo dato debe poder regenerarse o trazarse a su fuente.
- **Transparencia:** marcar siempre origen, fecha de corte y si el dato es real o sintético.
- **El contrato de datos perdura:** el esquema de los datasets es estable entre fases; cambia
  el origen (sintético → oficial), no la forma.
- **Foco en magistrados y seguridad:** las rotaciones de jueces/fiscales y los casos álgidos de
  seguridad son el eje diferenciador del observatorio en todas las fases.
