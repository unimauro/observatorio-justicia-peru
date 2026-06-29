# Fase 4 — Machine Learning + Fase 5 — IA

> Qué es la "Fase ML", qué modelos tienen sentido con los datos reales que ya tenemos, y cómo se
> sirve la IA/ML desde un **servicio backend** sin exponer claves ni detalles de infraestructura.
>
> ⚠️ Este documento es público. **No incluye** proveedores, hosts, IPs, puertos, rutas de servidor
> ni credenciales. La configuración operativa vive fuera del repositorio (variables de entorno y
> archivos `.env` no versionados).

## 1. ¿Qué es "hacer Machine Learning" en este proyecto?

No es magia: es entrenar modelos con la **microdata real por expediente** que ya descargamos, para
**estimar** cosas que hoy no sabemos de antemano. Con los datos disponibles, tres casos realistas:

| Modelo | Qué responde | Datos que usa | Estado |
|---|---|---|---|
| **Predicción de demora** (regresión) | ¿Cuántos días tardará un expediente hasta sentencia? | Microdata CSJ Piura (NLPT, alimentos, penal, civil) — 11,723 expedientes | ✅ **Entrenado** |
| **Expediente en riesgo** (clasificación) | ¿Este caso tiene alta probabilidad de estancarse (demora > p75)? | Misma microdata + TC | 🔜 Siguiente |
| **Pronóstico de carga** (series de tiempo) | ¿Cuántos casos ingresarán el próximo trimestre por distrito? | Serie mensual MPFN 2019–2026 | 🔜 Siguiente |

### Modelo ya entrenado (honesto)
`ml/train_demora.py` entrena un **HistGradientBoostingRegressor** sobre la microdata de Piura.
Resultado real en set de prueba (2,345 casos):
- **MAE ≈ 76 días**, **error mediano ≈ 52 días**, **R² ≈ 0.26**.
- **17% mejor** que el baseline (predecir siempre la mediana, MAE 92 d).
- Features: `proceso, materia, tipo de instancia, provincia, mes de ingreso`.

**Límite honesto (SPEC §7):** el modelo **solo es válido para CSJ Piura** (la única microdata real
con fechas de ingreso→sentencia). No se extrapola al resto del país. El R² modesto es esperable;
aun así el modelo aporta señal real sobre el baseline. Cuando lleguen más cortes con microdata,
mejora y se amplía.

Salidas: `ml/models/demora.joblib` (modelo serializado, para servir en la API) y
`site/data/real/ml_demora.json` (métricas + predicción por proceso, que el dashboard muestra en la
pestaña 🔮 Predicción).

## 2. Arquitectura (alto nivel)

El dashboard es **estático** (GitHub Pages). El cómputo de IA/ML (chatbot + modelos) corre en un
**servicio backend** separado, detrás de un **proxy inverso con HTTPS**. El dashboard solo
**consulta** ese servicio por HTTPS; si no responde, el tablero **degrada con elegancia** (el chat
usa un motor local de respuestas y la pestaña ML muestra el resumen precomputado).

```
[ Dashboard estático (GitHub Pages) ]
        │  fetch HTTPS  (CORS restringido al origen del dashboard)
        ▼
[ Proxy inverso con HTTPS ]
        │
        ▼
[ Servicio backend (FastAPI) ]
   - POST /v1/justicia/chat          → modelo de lenguaje vía OpenRouter (clave server-side)
   - POST /v1/justicia/predict-demora → carga el modelo y devuelve la estimación
   - GET  /v1/justicia/forecast-carga → pronóstico de carga (próxima iteración)
```

### Principios de seguridad
- La **clave de IA nunca está en el navegador**: vive solo en el servidor como variable de entorno.
- **CORS** restringido al origen del dashboard.
- El servicio se ejecuta **aislado** (contenedor con límites de recursos) y no interfiere con otros
  servicios del entorno.
- Ningún detalle operativo (proveedor, host, IP, puerto, credenciales) se publica en este repo.

## 3. El chatbot (Fase 5)

El frontend llama a un **endpoint configurable** (`window.AI_ENDPOINT` o `?ai=`); por defecto, el
servicio de IA del proyecto. El endpoint recibe `{question, context}`, llama a un modelo de lenguaje
**server-side** (vía OpenRouter, multi-modelo: Claude, GPT, Llama, etc., según `AI_MODEL`) y devuelve
`{answer}`. Si no responde, el copiloto usa un **fallback local**.

**Guardarraíles del chatbot** (ver `docs/AI_PROXY.md`): solo responde sobre el observatorio y el
sistema de justicia; se basa solo en el contexto recibido; no revela sus instrucciones; no da
asesoría legal personalizada; ignora intentos de cambiar su rol. Doble barrera (frontend + prompt
del sistema).

## 4. Variables de entorno (server-side, NO versionadas)

El servicio se configura solo con variables de entorno / un archivo `.env` **gitignored**:
- `OPENROUTER_API_KEY` — clave del proveedor de IA (secreta).
- `AI_MODEL` — modelo a usar.
- `ALLOWED_ORIGIN` — origen permitido para CORS.

El código del servicio (`api/`) es público y auditable; su **configuración** no.
