/**
 * Cloudflare Worker als AI-Proxy für den Canyoning Topo Generator.
 *
 * Gleicher Zweck wie tools/proxy.mjs, aber für den Dauerbetrieb: Wenn die App
 * irgendwo gehostet ist (GitHub Pages, interner Webserver), braucht sie einen
 * erreichbaren Proxy – der lokale Node-Proxy läuft ja nur auf dem eigenen Rechner.
 *
 * Deployen:
 *   npx wrangler deploy tools/worker.js --name canyon-topo-proxy --compatibility-date 2025-01-01
 *   npx wrangler secret put AI_KEY
 *
 * Variablen (wrangler.toml oder Dashboard):
 *   AI_KEY          Secret. Verlässt den Worker nie.
 *   AI_UPSTREAM     Basis-URL der Modell-API.
 *   AI_MODEL        Vorgabemodell.
 *   AI_AUTH_HEADER  Vorgabe "Authorization".
 *   AI_AUTH_SCHEME  Vorgabe "Bearer ".
 *   AI_API          "openai" (Vorgabe) oder "anthropic".
 *   ALLOWED_ORIGIN  Einzelner Origin oder "*". Für interne Keys unbedingt setzen.
 */

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(payload, status, origin) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) },
  });
}

function splitDataUrl(image) {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(image || '');
  if (!match) throw new Error('image muss eine base64-Data-URL sein.');
  return { mediaType: match[1], base64: match[2] };
}

function extractText(data) {
  const openai = data?.choices?.[0]?.message?.content;
  if (typeof openai === 'string') return openai;
  if (Array.isArray(openai)) return openai.map((part) => part?.text || '').join('');
  if (Array.isArray(data?.content)) {
    return data.content
      .filter((part) => part?.type === 'text')
      .map((part) => part.text)
      .join('');
  }
  return '';
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'POST') return json({ error: 'Nur POST.' }, 405, origin);
    if (!env.AI_KEY) return json({ error: 'AI_KEY ist nicht gesetzt.' }, 500, origin);

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Ungültiges JSON.' }, 400, origin);
    }

    const { image, prompt } = payload;
    if (!image || !prompt) return json({ error: 'image und prompt sind erforderlich.' }, 400, origin);

    const api = (env.AI_API || 'openai').toLowerCase();
    const base = (env.AI_UPSTREAM || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = payload.model || env.AI_MODEL || 'gpt-4o';

    let url;
    let body;
    try {
      if (api === 'anthropic') {
        const { mediaType, base64 } = splitDataUrl(image);
        url = `${base}/messages`;
        body = {
          model,
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
                { type: 'text', text: prompt },
              ],
            },
          ],
        };
      } else {
        url = `${base}/chat/completions`;
        body = {
          model,
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: image } },
                { type: 'text', text: prompt },
              ],
            },
          ],
        };
      }
    } catch (error) {
      return json({ error: error.message }, 400, origin);
    }

    const headers = {
      'Content-Type': 'application/json',
      [env.AI_AUTH_HEADER || 'Authorization']: `${env.AI_AUTH_SCHEME ?? 'Bearer '}${env.AI_KEY}`,
    };
    if (api === 'anthropic') headers['anthropic-version'] = '2023-06-01';

    let upstream;
    try {
      upstream = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (error) {
      return json({ error: `Upstream nicht erreichbar: ${error.message}` }, 502, origin);
    }

    const raw = await upstream.text();
    if (!upstream.ok) {
      let detail = raw.slice(0, 400);
      try {
        const parsed = JSON.parse(raw);
        detail = parsed?.error?.message || parsed?.message || detail;
      } catch {
        /* Gateways antworten gern mit HTML. */
      }
      return json({ error: `Upstream-Fehler ${upstream.status}: ${detail}` }, upstream.status, origin);
    }

    let text = '';
    try {
      text = extractText(JSON.parse(raw));
    } catch {
      return json({ error: 'Upstream hat kein JSON geliefert.' }, 502, origin);
    }
    if (!text) return json({ error: 'Upstream-Antwort enthielt keinen Text.' }, 502, origin);

    // Nur der Modelltext geht zurück – Sanitizing passiert in src/ai.js.
    return json(text, 200, origin);
  },
};
