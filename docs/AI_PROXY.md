# Copiloto IA — proxy serverless (ai.tunky.net)

El dashboard es **estático** (GitHub Pages), por lo que la clave de la Claude API **no puede vivir
en el navegador**. El copiloto del tablero llama a un **endpoint proxy** que corre server-side
(Vercel Function, o un servicio en el VPS Hostinger detrás de Caddy, dentro del ecosistema
`tunky.net`). Si el endpoint no responde, el copiloto usa un **motor local de respuestas** (fallback)
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

## Implementación de referencia (Vercel Function + Claude API)
> Reusar el patrón de `ai-interviewer` (`@ai-sdk/anthropic`). La API key vive en el servidor.

```ts
// api/justicia/chat.ts
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  const { question, context } = await req.json();
  const system = `Eres el copiloto del Observatorio Nacional de Justicia del Perú.
Responde SOLO con base en el JSON de contexto. Si el dato es sintético, acláralo.
Sé breve, cita cifras del contexto. No inventes datos que no estén en el contexto.`;
  const { text } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"), // rápido; usar claude-opus-4-8 para análisis profundo
    system,
    prompt: `Pregunta: ${question}\n\nContexto (JSON):\n${JSON.stringify(context)}`,
    maxTokens: 500,
  });
  return new Response(JSON.stringify({ answer: text }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
```
Variables de entorno (server-side): `ANTHROPIC_API_KEY`. Habilitar **CORS** para el origen
`https://unimauro.github.io`. Modelos: `claude-haiku-4-5-20251001` (rápido) / `claude-opus-4-8`
(razonamiento). Cuando exista la capa de datos reales, enriquecer `context` con los JSON de
`site/data/real/` para respuestas fundamentadas.
