# Copiloto IA — proxy serverless (ai.tunky.net)

El dashboard es **estático** (GitHub Pages), por lo que la clave de la Claude API **no puede vivir
en el navegador**. El copiloto del tablero llama a un **endpoint proxy** que corre server-side
(una función serverless o un servicio backend propio detrás de un proxy inverso con HTTPS). Si el endpoint no responde, el copiloto usa un **motor local de respuestas** (fallback)
y el tablero sigue funcionando.

## Configuración en el frontend
`site/assets/js/app.js`:
```js
const AI_ENDPOINT = new URLSearchParams(location.search).get("ai")
  || window.AI_ENDPOINT || "https://ai.tunky.net/v1/justicia/chat";
```
- Override por querystring: `?ai=https://mi-endpoint/chat`
- O define `window.AI_ENDPOINT` antes de cargar `app.js`.

## Contrato del endpoint
**Request** `POST {AI_ENDPOINT}` · `Content-Type: application/json`
```json
{
  "question": "¿Qué corte tiene más congestión?",
  "context": { "nacional": { "...": "..." }, "top_cortes_congestion": [], "casos_seguridad_criticos": 0 }
}
```
**Response** `200 application/json` — se acepta cualquiera de estas claves: `answer` | `text` | `message`
```json
{ "answer": "La corte con mayor congestión es ..." }
```
Timeout del cliente: 6 s. Cualquier error/abort → fallback local.

## Implementación de referencia (FastAPI + OpenRouter)
> Implementada en `api/main.py`. Usa **OpenRouter** (compatible con la API de OpenAI), no la API
> de Anthropic directa. La key vive en el servidor. OpenRouter es multi-modelo: una sola key
> enruta a Claude, GPT, Llama, etc. según `AI_MODEL`.

```python
# api/main.py (extracto)
from openai import OpenAI
client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"])
resp = client.chat.completions.create(
    model=os.environ.get("AI_MODEL", "anthropic/claude-3.5-haiku"),  # cualquier modelo de OpenRouter
    max_tokens=500,
    messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
    extra_headers={"HTTP-Referer": "https://unimauro.github.io/...", "X-Title": "Observatorio Justicia Peru"},
)
answer = resp.choices[0].message.content
```
Variables de entorno (server-side): `OPENROUTER_API_KEY`, `AI_MODEL`. Habilitar **CORS** para el origen
`https://unimauro.github.io`. Modelos: `claude-haiku-4-5-20251001` (rápido) / `claude-opus-4-8`
(razonamiento). El `context` ya se enriquece con los JSON reales de `site/data/real/` (ver
`aiContext()` en `app.js`), separando `DATOS_REALES_oficiales` de `PROTOTIPO_sintetico`.

## Guardrails (implementados)
1. **Alcance de tema:** el copiloto SOLO responde sobre el observatorio / sistema de justicia y
   seguridad del Perú. Doble barrera:
   - **Frontend** (`aiOffTopic()` en `app.js`): si la pregunta no contiene términos del dominio,
     ni siquiera se llama al modelo; se responde con un mensaje que reconduce al tema.
   - **Servidor** (system prompt en `api/main.py`): regla estricta de declinar otros temas, ignorar
     intentos de cambiar el rol, y no revelar las instrucciones.
2. **Markdown:** las respuestas del modelo se renderizan con `mdToHtml()` (negritas, listas, código,
   enlaces) escapando HTML primero (seguro). El system prompt pide responder en Markdown conciso.
3. **Honestidad del dato:** el prompt obliga a basarse solo en el contexto, distinguir real vs
   sintético y no dar asesoría legal personalizada (solo información estadística).
