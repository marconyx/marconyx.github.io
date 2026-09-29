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
  model: process.env.AI_MODEL || 'gpt-4o',
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

function buildUpstreamRequest(image, prompt, { model, base, api }) {
  if (api === 'anthropic') {
    const { mediaType, base64 } = splitDataUrl(image);
    return {
      url: `${base}/messages`,
      body: {
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
      },
    };
  }
  return {
    url: `${base}/chat/completions`,
    body: {
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
    },
  };
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
    request = buildUpstreamRequest(image, prompt, cfg);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    [cfg.authHeader]: `${cfg.authScheme}${cfg.key}`,
  };
  if (cfg.api === 'anthropic') headers['anthropic-version'] = '2023-06-01';

  // HTTP-Header dürfen nur Latin-1 enthalten. Ein versehentlich kopiertes "…"
  // oder ein Umlaut im Key liesse fetch sonst mit einer kryptischen
  // ByteString-Meldung scheitern – die dem Nutzer gar nichts sagt.
  const offending = [...`${cfg.authScheme}${cfg.key}`].find((char) => char.charCodeAt(0) > 255);
  if (offending) {
    sendJson(res, 400, {
      error:
        `Der API-Key enthält ein unzulässiges Zeichen ("${offending}"). ` +
        'Sieht nach einem Kopierfehler aus – bitte den Key erneut einfügen.',
    });
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

  const raw = await upstream.text();
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
