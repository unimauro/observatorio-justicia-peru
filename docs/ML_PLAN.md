# Fase 4 — Machine Learning + Fase 5 — IA (arquitectura cerrada en el VPS)

> Qué es la "Fase ML", qué modelos tienen sentido con los datos reales que ya tenemos, y cómo se
> despliega **todo cerrado** en un subdominio de `tunky.net` sobre el VPS Hostinger, **sin apagar
> ni tocar** los demás servicios que ya corren ahí.

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
con fechas de ingreso→sentencia). No se extrapola al resto del país. El R² modesto es esperable:
predecir la duración exacta de un proceso judicial con pocas variables es difícil; aun así el modelo
aporta señal real sobre el baseline. Cuando lleguen más cortes con microdata, mejora y se amplía.

Salidas: `ml/models/demora.joblib` (modelo serializado, para servir en la API) y
`site/data/real/ml_demora.json` (métricas + predicción por proceso, que el dashboard ya muestra en
la pestaña 🔮 Predicción).

## 2. Arquitectura cerrada en el VPS (tunky.net)

> **`ml.tunky.net` es un gateway de IA/ML MULTI-ESTUDIO**: un único contenedor FastAPI sirve a
> varios proyectos, separados por ruta (`/v1/justicia/...`, y `/v1/<otro-estudio>/...` a futuro).
> Así se reutiliza el chatbot y los modelos sin levantar un contenedor por proyecto (ahorra RAM
> en el VPS). El chatbot usa **OpenRouter** (no la API de Anthropic directa).

Todo el cómputo pesado (modelos, microdata, chatbot) vive en el **VPS Hostinger** ([redacted-host]),
detrás de **Caddy** (que ya hace de reverse-proxy + TLS para los demás SaaS). El dashboard estático
(GitHub Pages) solo **consulta** la API; si la API está caída, el tablero sigue funcionando (las
predicciones y el chat degradan con elegancia).

```
[ GitHub Pages: dashboard estático ]
        │  fetch HTTPS (CORS: solo unimauro.github.io)
        ▼
[ Caddy en el VPS ]  ──►  ai.tunky.net   → contenedor justicia-api (FastAPI)
                          ml.tunky.net   → mismo contenedor (rutas /v1/justicia/*)
        │
        ▼
[ contenedor Docker "justicia-api" ]   ← NUEVO, aislado, con límites de recursos
   - FastAPI (uvicorn)
   - /v1/justicia/chat        → OpenRouter (key en env, server-side)   [Fase 5]
   - /v1/justicia/predict-demora    → carga demora.joblib y predice          [Fase 4]
   - /v1/justicia/forecast-carga    → pronóstico de carga                    [Fase 4]
   - /data, /models montados como volumen (microdata pesada se queda en el VPS)
```

### ⚠️ Convivencia con los servicios existentes (no se apaga nada)
El VPS ya corre otros SaaS (p. ej. `[redacted].example`). El contenedor nuevo:
- Se levanta **aparte** con su propio `docker compose -p justicia ...` (proyecto separado).
- Lleva **límites de recursos** para no competir: `cpus: "0.8"`, `mem_limit: 1g`.
- **No se detiene ni modifica** ningún contenedor existente. Caddy solo suma dos `reverse_proxy`.

### Snippet Caddy (añadir, no reemplazar)
```caddy
ai.tunky.net, ml.tunky.net {
    reverse_proxy 127.0.0.1:8088
}
```

### docker-compose (VPS) — `deploy/docker-compose.vps.yml`
```yaml
services:
  justicia-api:
    build: ../api
    container_name: justicia-api
    restart: unless-stopped
    ports: ["127.0.0.1:8088:8088"]   # solo local; Caddy expone al exterior
    environment:
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - AI_MODEL=anthropic/claude-3.5-haiku
      - ALLOWED_ORIGIN=https://unimauro.github.io
    volumes:
      - ../ml/models:/app/models:ro
      - ../data/processed:/app/data:ro
    cpus: "0.8"
    mem_limit: 1g
```

## 3. El chatbot (Fase 5) — ¿es factible ya? Sí.

El frontend **ya está cableado** a `ai.tunky.net/v1/justicia/chat` (con fallback local si no
responde). Para activarlo "de verdad" solo falta **levantar el endpoint** en el contenedor:
recibe `{question, context}`, llama a OpenRouter server-side (la key vive en el VPS, nunca en el
navegador; OpenRouter es multi-modelo) y responde `{answer}`. Modelo configurable vía `AI_MODEL` en OpenRouter (Claude, GPT, Llama, etc.). Implementación de referencia en `docs/AI_PROXY.md` y esqueleto en `api/`.

**Factibilidad:** alta. Es un único contenedor FastAPI + una variable de entorno con la API key +
dos líneas en el Caddyfile. No requiere apagar nada.

## 4. Pasos para desplegar (cuando se decida)
1. `pip install -r api/requirements.txt` dentro del contenedor (fastapi, uvicorn, joblib, scikit-learn, openai (cliente OpenRouter)).
2. Copiar `ml/models/*.joblib` al VPS.
3. `OPENROUTER_API_KEY=… docker compose -p justicia -f deploy/docker-compose.vps.yml up -d --build`.
4. Añadir el bloque `ai.tunky.net, ml.tunky.net` al Caddyfile y `caddy reload`.
5. Verificar CORS desde el dashboard. Listo: chat + predicciones en vivo.
