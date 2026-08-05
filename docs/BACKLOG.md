# 📋 Backlog — Observatorio Nacional del Sistema de Justicia del Perú

> Lista **operativa y priorizada** de tareas. Complementa al [`ROADMAP.md`](ROADMAP.md)
> (visión por fases) y a [`SPEC.md`](../SPEC.md) (fuente de la verdad). El roadmap dice
> *qué fase*; este backlog dice *qué hacer ahora*.
>
> Convención: `[ ]` pendiente · `[~]` en progreso · `[x]` hecho · prioridad **P0** (crítico) →
> **P3** (nice-to-have). Última revisión: **2026-08-05**.

---

## ✅ Estado real (más avanzado que el roadmap original)

A diferencia del roadmap por fases, en la práctica ya está **LIVE y con datos reales**:

- **Datos reales integrados** (MPFN fiscales/casos/delitos, PJ carga nacional 2024, demora
  microdata Piura anonimizada, TC 1992–2026, MIMP/CEM feminicidios y VCM, INEI/PNP).
- **Todas las pestañas usan datos reales** (badge 🟢) con partes ilustrativas marcadas 🧪.
- **ML entrenado** (HistGradientBoostingRegressor sobre microdata Piura; MAE ~76 d) + pestaña
  🔮 Predicción con calculadora en vivo.
- **Chatbot LLM en vivo** vía gateway (OpenRouter), con guardrails, rate-limit por IP y
  fallback local con datos reales. Red-team aplicado.
- **Seguridad:** secretos fuera del repo, historial reescrito (IP removida), audit de repo.
- **UX:** tema Teal & Coral, sidebar, deep-links por hash, GA4 real, apoyo/donaciones.

---

## 🔴 P0 — Crítico / bloqueantes de calidad

- [ ] **Diccionario oficial PJ para fijar el clearance.** El clearance/congestión del
  `dataset_jurisdiccional` es **provisional** (semántica INGRESO_SIN/INGRESO_CON ambigua:
  38%–96% según interpretación). Conseguir la Guía Metodológica del PJ y fijar la fórmula.
  Hoy marcado con ⚠️ en UI y `_meta.nota`.
- [ ] **Rotar la key de OpenRouter.** Se pegó en texto plano en el chat; Carlos pidió esperar.
  Crear key dedicada con tope (~$5) para el contenedor del observatorio.

## 🟠 P1 — Cobertura de datos (llenar huecos)

- [ ] **Carga procesal PJ 2021-2023 y 2025-2026** (hoy solo 2024 vía datos abiertos).
  Requiere descarga **manual** de los `.xlsx` del Portal Estadístico PJ (protegido por
  reCAPTCHA → no automatizable). Parser listo en `etl/pipeline/parse_pj_portal.py`.
  Archivos objetivo: Estadísticas Jurisdiccionales ENE-DIC 2021/2022/2023/2025 + Guía
  Metodológica. Catálogo en `data/raw/MANUAL_DOWNLOADS.md`.
- [ ] **INEI denuncias PNP** (Registro Nacional de Denuncias 2016-2017, ZIP sin captcha) →
  `site/data/real/inei_denuncias.json`. Frontend ya preparado (`REAL_FILES` lo incluye).
- [ ] **INEI Anuario** estadístico (indicadores complementarios).
- [ ] **CNPJ / estándares** de la Comisión Nacional de Política Judicial.

## 🟡 P2 — Analítica y modelo (Fase 4 extendida)

- [ ] **Clasificación de riesgo** de expedientes (apelación / archivamiento).
- [ ] **Forecast de carga futura** por corte/territorio (series temporales). Endpoint stub
  ya existe (`/v1/ml/forecast-carga`).
- [ ] Ampliar el modelo de demora más allá de CSJ Piura cuando haya más microdata real
  (hoy honesto: no extrapola).

## 🟢 P3 — Producto y política pública (Fase 5)

- [ ] **Capa socioeconómica** (INEI pobreza/población, criminalidad, presupuesto) para el
  **índice de déficit de cobertura judicial**.
- [ ] **Recomendador de ubicación** de nuevos juzgados/fiscalías (pregunta central de política).
- [ ] Convertir a datos reales las pestañas aún parcialmente ilustrativas si aparece fuente:
  casos nominales individuales, rotaciones de magistrados (JNJ Boletín de la Magistratura),
  top-100 juzgados.

## 🔒 Seguridad / operación (recomendaciones red-team pendientes, BAJA)

- [ ] Firmar/validar el `context` del chatbot server-side (HMAC o ID + resolución en servidor).
- [ ] Allow-list de claves del context; guardrail off-topic también en el servidor.
- [ ] DOMPurify en frontend (defensa en profundidad; `mdToHtml` ya escapa HTML).
- [ ] Endurecer VPS (firewall / fail2ban / SSH key-only) — la IP debe considerarse expuesta.
- [ ] Revisar deserialización de `joblib` (modelo ML) como superficie de riesgo.

---

## 🧭 Recordatorios de gobernanza del dato (de SPEC.md)

- Nunca inventar datos; citar **fuente + fecha de corte**.
- No derivar demoras en días desde datos **agregados** (solo microdata por expediente).
- Distinguir granularidad **expediente | agregado** y marcar **real vs. sintético/ilustrativo**.
- Las cifras nunca dependen del modelo LLM (se le pasan en el context; solo redacta).
