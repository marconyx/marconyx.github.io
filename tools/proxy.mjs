#!/usr/bin/env node
/**
 * Lokaler AI-Proxy für den Canyoning Topo Generator.
 *
 * Warum das nötig ist: Firmen-Gateways (z. B. api.swisscom.com) antworten auf den
 * CORS-Preflight des Browsers mit 401 und ohne `Access-Control-Allow-Origin`.
 * Der Browser bricht den Aufruf dann ab, bevor er überhaupt passiert – sichtbar nur
 * als nichtssagender Netzwerkfehler. Ein Proxy umgeht das, weil zwischen Servern
 * keine CORS-Regeln gelten.
 *
 * Der Proxy serviert zusätzlich die App selbst. Läuft beides auf demselben Origin,
 * entfällt CORS vollständig – das ist der robusteste Weg.
 *
 * Start:
 *   AI_KEY=... node tools/proxy.mjs
 *
 * Konfiguration über Umgebungsvariablen (siehe README):
 *   AI_KEY          Pflicht. Wird nur serverseitig verwendet, nie an den Browser geschickt.
 *   AI_UPSTREAM     Basis-URL der Modell-API (ohne /chat/completions).
 *   AI_MODEL        Vorgabemodell, falls der Browser keins mitschickt.
 *   AI_AUTH_HEADER  Header-Name für den Key (Vorgabe: Authorization).
 *   AI_AUTH_SCHEME  Präfix vor dem Key (Vorgabe: "Bearer "; leer setzen für rohe Keys).
 *   AI_API          "openai" (Vorgabe) oder "anthropic".
 *   PORT            Vorgabe 8787.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const config = {
  port: Number(process.env.PORT || 8787),
  upstream: (
    process.env.AI_UPSTREAM ||
    'https://api.swisscom.com/products/swiss-ai-platform/internal-all-models/v1'
  ).replace(/\/+$/, ''),
  key: process.env.AI_KEY || '',
  model: process.env.AI_MODEL || 'qwen/qwen3.6-35b-a3b',
  authHeader: process.env.AI_AUTH_HEADER || 'Authorization',
  // Absichtlich nicht getrimmt: "Bearer " braucht das Leerzeichen, ein roher Key nicht.
  authScheme: process.env.AI_AUTH_SCHEME ?? 'Bearer ',
  api: (process.env.AI_API || 'openai').toLowerCase(),
  // Erlaubt der App, Endpoint/Key/Modell pro Anfrage mitzuschicken. Damit muss der
  // Proxy nie neu gestartet werden, wenn sich in der Oberfläche etwas ändert.
  // Nur vertretbar, weil ausschliesslich an 127.0.0.1 gebunden wird.
  allowClientConfig: process.env.AI_ALLOW_CLIENT_CONFIG !== 'false',
  maxBody: 32 * 1024 * 1024,
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.xsd': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...corsHeaders(),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > config.maxBody) {
        reject(new Error('Anfrage zu groß – bitte das Bild kleiner skalieren.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('Ungültiges JSON im Request-Body.'));
      }
    });
    req.on('error', reject);
  });
}

/** Trennt eine Data-URL in Medientyp und base64-Nutzlast. */
function splitDataUrl(image) {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(image || '');
  if (!match) throw new Error('image muss eine base64-Data-URL sein.');
  return { mediaType: match[1], base64: match[2] };
}

/**
 * Niedrige Temperatur, damit das Modell das Bild übersetzt statt zu erfinden.
 * Muss zu AI_TEMPERATURE in src/ai.js passen.
 */
const TEMPERATURE = 0.15;

/** Obergrenze je Prompt-Teil. Der Browser darf den Prompt bestimmen, aber nicht sprengen. */
const MAX_PROMPT_CHARS = 32000;

/**
 * Baut die Upstream-Anfrage. Prompt UND System-Anweisung kommen aus dem Browser –
 * der Proxy formuliert bewusst nichts selbst, sonst weichen die beiden Wege
 * (direkt und über den Proxy) voneinander ab.
 */
function buildUpstreamRequest(image, prompt, { model, base, api, system, jsonMode = true }) {
  if (api === 'anthropic') {
    const { mediaType, base64 } = splitDataUrl(image);
    return {
      url: `${base}/messages`,
      body: {
        model,
        max_tokens: 4096,
        temperature: TEMPERATURE,
        // Anthropic hat ein eigenes system-Feld und kein response_format.
        ...(system ? { system } : {}),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      },
    };
  }
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: image } },
      { type: 'text', text: prompt },
    ],
  });
  return {
    url: `${base}/chat/completions`,
    body: {
      model,
      max_tokens: 4096,
      temperature: TEMPERATURE,
      messages,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    },
  };
}

/** Erkennt, dass der Upstream den JSON-Modus nicht kennt – dann ohne ihn erneut. */
function rejectsJsonMode(status, text) {
  if (status !== 400 && status !== 404 && status !== 422 && status !== 500) return false;
  return /response_format|json_object|json mode|json_schema/i.test(text || '');
}

/**
 * Baut die effektive Konfiguration einer Anfrage.
 * Die App darf Endpoint, Modell, Key und API-Form mitschicken – sonst greift die
 * Umgebung. So lässt sich alles in der Oberfläche umstellen, ohne den Proxy
 * anzufassen. Der Key wird weder geloggt noch zurückgegeben.
 */
function resolveRequestConfig(payload) {
  const fromClient = config.allowClientConfig ? payload : {};
  const base = String(fromClient.endpoint || config.upstream)
    .trim()
    .replace(/\/+$/, '')
    // Schickt die App versehentlich den vollen Pfad, kürzen wir auf die Basis.
    .replace(/\/(chat\/completions|messages)$/, '');
  return {
    base,
    api: String(fromClient.api || config.api).toLowerCase(),
    model: fromClient.model || config.model,
    key: fromClient.apiKey || config.key,
    authHeader: fromClient.authHeader || config.authHeader,
    authScheme: fromClient.authScheme ?? config.authScheme,
  };
}

/**
 * Baut die Auth-Header und wirft, wenn der Key nicht in einen HTTP-Header passt.
 * HTTP-Header dürfen nur Latin-1 enthalten. Ein versehentlich kopiertes "…" oder
 * ein Umlaut liesse fetch sonst mit einer kryptischen ByteString-Meldung
 * scheitern – die dem Nutzer gar nichts sagt.
 */
function authHeaders(cfg) {
  const value = `${cfg.authScheme}${cfg.key}`;
  const offending = [...value].find((char) => char.charCodeAt(0) > 255);
  if (offending) {
    throw new Error(
      `Der API-Key enthält ein unzulässiges Zeichen ("${offending}"). ` +
        'Sieht nach einem Kopierfehler aus – bitte den Key erneut einfügen.',
    );
  }
  const headers = { 'Content-Type': 'application/json', [cfg.authHeader]: value };
  if (cfg.api === 'anthropic') headers['anthropic-version'] = '2023-06-01';
  return headers;
}

/** Holt den reinen Text aus der Antwort – beide API-Formen sehen anders aus. */
function extractText(data) {
  if (typeof data === 'string') return data;
  const openai = data?.choices?.[0]?.message?.content;
  if (typeof openai === 'string') return openai;
  if (Array.isArray(openai)) {
    return openai.map((part) => part?.text || '').join('');
  }
  const anthropic = data?.content;
  if (Array.isArray(anthropic)) {
    return anthropic
      .filter((part) => part?.type === 'text')
      .map((part) => part.text)
      .join('');
  }
  return '';
}

async function handleTopo(req, res) {
  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const { image, prompt } = payload;
  if (!image || !prompt) {
    sendJson(res, 400, { error: 'image und prompt sind erforderlich.' });
    return;
  }
  if (typeof prompt !== 'string' || (payload.system != null && typeof payload.system !== 'string')) {
    sendJson(res, 400, { error: 'prompt und system müssen Text sein.' });
    return;
  }
  const system = payload.system ? String(payload.system) : '';
  if (prompt.length > MAX_PROMPT_CHARS || system.length > MAX_PROMPT_CHARS) {
    sendJson(res, 400, {
      error: `Prompt zu lang – erlaubt sind ${MAX_PROMPT_CHARS} Zeichen je Teil.`,
    });
    return;
  }

  const cfg = resolveRequestConfig(payload);

  if (!cfg.key) {
    sendJson(res, 500, {
      error:
        'Kein API-Key vorhanden. Entweder in der App unter "Einstellungen" eintragen ' +
        'oder den Proxy mit AI_KEY=… starten.',
    });
    return;
  }
  if (!cfg.base) {
    sendJson(res, 400, { error: 'Kein Endpoint konfiguriert.' });
    return;
  }

  let request;
  try {
    request = buildUpstreamRequest(image, prompt, { ...cfg, system });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  let headers;
  try {
    headers = authHeaders(cfg);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(request.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request.body),
    });
  } catch (error) {
    // Hier steckt der echte Netzwerkfehler – im Browser wäre er unsichtbar gewesen.
    sendJson(res, 502, {
      error: `Upstream nicht erreichbar: ${error.message}`,
      upstream: request.url,
    });
    return;
  }

  let raw = await upstream.text();
  if (!upstream.ok && rejectsJsonMode(upstream.status, raw)) {
    // Gateways ohne JSON-Modus: einmal ohne response_format wiederholen.
    const retry = buildUpstreamRequest(image, prompt, { ...cfg, system, jsonMode: false });
    try {
      upstream = await fetch(retry.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(retry.body),
      });
      raw = await upstream.text();
    } catch (error) {
      sendJson(res, 502, {
        error: `Upstream nicht erreichbar: ${error.message}`,
        upstream: retry.url,
      });
      return;
    }
  }
  if (!upstream.ok) {
    let detail = raw.slice(0, 400);
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.error?.message || parsed?.message || detail;
    } catch {
      /* Gateways antworten gern mit HTML. */
    }
    console.error(`[proxy] Upstream ${upstream.status}: ${detail}`);
    sendJson(res, upstream.status, {
      error: `Upstream-Fehler ${upstream.status}: ${detail}`,
      hint:
        upstream.status === 401 || upstream.status === 403
          ? 'Key oder Auth-Schema prüfen: AI_AUTH_HEADER / AI_AUTH_SCHEME anpassen.'
          : undefined,
    });
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    sendJson(res, 502, { error: 'Upstream hat kein JSON geliefert.' });
    return;
  }

  const text = extractText(data);
  if (!text) {
    sendJson(res, 502, { error: 'Upstream-Antwort enthielt keinen Text.' });
    return;
  }

  // Der Browser bekommt nur den Modelltext – Sanitizing passiert in src/ai.js.
  console.log(`[proxy] ok – Modell ${cfg.model}, ${text.length} Zeichen`);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() });
  res.end(JSON.stringify(text));
}

/**
 * Fragt die Modellliste beim Upstream ab. Dasselbe CORS-Problem wie beim Topo:
 * `GET /models` scheitert im Browser am Gateway, hier nicht.
 * OpenAI und Anthropic nutzen beide `/models`, aber unterschiedliche Felder.
 */
async function handleModels(req, res) {
  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const cfg = resolveRequestConfig(payload);
  if (!cfg.key) {
    sendJson(res, 400, { error: 'Kein API-Key vorhanden.' });
    return;
  }
  if (!cfg.base) {
    sendJson(res, 400, { error: 'Kein Endpoint konfiguriert.' });
    return;
  }

  let headers;
  try {
    headers = authHeaders(cfg);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const url = `${cfg.base}/models`;
  let upstream;
  try {
    upstream = await fetch(url, { method: 'GET', headers });
  } catch (error) {
    sendJson(res, 502, { error: `Upstream nicht erreichbar: ${error.message}`, upstream: url });
    return;
  }

  const raw = await upstream.text();
  if (!upstream.ok) {
    let detail = raw.slice(0, 300);
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.error?.message || parsed?.message || detail;
    } catch {
      /* Gateways antworten gern mit HTML. */
    }
    sendJson(res, upstream.status, {
      error: `Upstream-Fehler ${upstream.status}: ${detail}`,
      hint:
        upstream.status === 404
          ? 'Dieser Endpoint kennt keine Modell-Liste. Modellname von Hand eintragen.'
          : undefined,
    });
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    sendJson(res, 502, { error: 'Upstream hat kein JSON geliefert.' });
    return;
  }

  const models = extractModels(data);
  if (!models.length) {
    sendJson(res, 502, { error: 'Upstream lieferte keine erkennbare Modell-Liste.' });
    return;
  }
  console.log(`[proxy] ${models.length} Modell(e) von ${url}`);
  sendJson(res, 200, { models });
}

/**
 * Zieht die Modell-IDs aus der Antwort. OpenAI liefert `{data:[{id}]}`,
 * Anthropic ebenso, manche Gateways nur ein nacktes Array oder `{models:[…]}`.
 */
function extractModels(data) {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
        ? data.models
        : [];
  const ids = list
    .map((entry) => (typeof entry === 'string' ? entry : entry?.id || entry?.name || ''))
    .map((id) => String(id).trim())
    .filter(Boolean);
  return [...new Set(ids)].sort();
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  const target = normalize(join(ROOT, pathname));
  if (!target.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    sendJson(res, 403, { error: 'Zugriff verweigert.' });
    return;
  }

  try {
    const file = await readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': file.length,
      'Cache-Control': 'no-cache',
    });
    res.end(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const path = new URL(req.url, 'http://localhost').pathname;

  if (path === '/api/topo') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Nur POST.' });
      return;
    }
    handleTopo(req, res).catch((error) => {
      console.error('[proxy] Unerwarteter Fehler:', error.message);
      if (!res.headersSent) sendJson(res, 500, { error: error.message });
    });
    return;
  }

  if (path === '/api/models') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Nur POST.' });
      return;
    }
    handleModels(req, res).catch((error) => {
      console.error('[proxy] Unerwarteter Fehler:', error.message);
      if (!res.headersSent) sendJson(res, 500, { error: error.message });
    });
    return;
  }

  if (path === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      api: config.api,
      upstream: config.upstream,
      model: config.model,
      authHeader: config.authHeader,
      keyConfigured: Boolean(config.key),
      // Die App erkennt daran, dass sie Endpoint/Key selbst mitschicken darf.
      acceptsClientConfig: config.allowClientConfig,
      canListModels: true,
      // Die App erkennt daran, dass sie System-Anweisung und Prompt trennen darf.
      acceptsSystemPrompt: true,
      maxPromptChars: MAX_PROMPT_CHARS,
    });
    return;
  }

  serveStatic(req, res).catch(() => {
    if (!res.headersSent) sendJson(res, 500, { error: 'Fehler beim Ausliefern.' });
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${config.port} ist belegt – läuft der Proxy schon?\n` +
        `Anderen Port wählen: PORT=8788 npm run proxy`,
    );
  } else {
    console.error(`Proxy konnte nicht starten: ${error.message}`);
  }
  process.exit(1);
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`Canyoning-Topo-Proxy läuft.

  App           http://127.0.0.1:${config.port}/
  Proxy-URL     http://127.0.0.1:${config.port}/api/topo
  Upstream      ${config.upstream}  (${config.api})
  Modell        ${config.model}
  Auth-Header   ${config.authHeader}: ${config.authScheme}<key>
  Key gesetzt   ${config.key ? 'ja' : 'nein – dann in der App eintragen'}
  App-Konfig    ${config.allowClientConfig ? 'erlaubt (Einstellungen wirken sofort)' : 'gesperrt'}

Die App unter http://127.0.0.1:${config.port}/ findet den Proxy von selbst.
`);
});
