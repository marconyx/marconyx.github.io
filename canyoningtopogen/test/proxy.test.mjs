/**
 * Tests für den lokalen AI-Proxy (tools/proxy.mjs):
 *   node test/proxy.test.mjs
 *
 * Der Proxy existiert, weil Firmen-Gateways den CORS-Preflight des Browsers mit
 * 401 und ohne Access-Control-Allow-Origin beantworten. Geprüft wird hier gegen
 * einen Fake-Upstream, dass der Proxy korrekt übersetzt, den Key nie an den
 * Browser durchreicht und Fehler verständlich weitergibt.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

import worker from '../tools/worker.js';
import { buildPromptParts } from '../src/ai.js';

const PROXY_SCRIPT = fileURLToPath(new URL('../tools/proxy.mjs', import.meta.url));
const KEY = 'geheimer-test-key';
const IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let passed = 0;
const received = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ok  ${name}`);
    })
    .catch((error) => {
      console.error(`  FEHLER  ${name}\n      ${error.message}`);
      process.exitCode = 1;
    });
}

/** Fake-Upstream: notiert jeden Request und antwortet wie eine OpenAI-API. */
function startUpstream() {
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      received.push({ path: req.url, headers: req.headers, body });

      const reply = (status, payload) => {
        const out = JSON.stringify(payload);
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(out);
      };

      if (req.url === '/v1/models') {
        reply(200, { data: [{ id: 'zeta-vision' }, { id: 'alpha-vision' }, { id: 'zeta-vision' }] });
        return;
      }
      if (req.url === '/v1/leer/models') {
        reply(200, { data: [] });
        return;
      }
      if (req.url === '/v1/weg/models') {
        reply(404, { error: { message: 'not found' } });
        return;
      }

      if (body.model === 'kein-denkschalter' && body.chat_template_kwargs) {
        reply(400, { error: { message: 'Unrecognized request argument: chat_template_kwargs' } });
        return;
      }
      if (body.model === 'denkt-zu-viel') {
        reply(200, {
          choices: [{ finish_reason: 'length', message: { content: '', reasoning: 'Hmm …' } }],
        });
        return;
      }
      if (body.model === 'kein-json' && body.response_format) {
        reply(400, { error: { message: 'response_format is not supported by this model' } });
        return;
      }
      if (body.model === 'boom') {
        reply(403, { error: { message: 'kein Zugriff auf dieses Modell' } });
        return;
      }
      if (body.model === 'html') {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<html>Gateway Error</html>');
        return;
      }
      reply(200, {
        choices: [
          {
            message: {
              content:
                'Hier das Topo:\n```json\n{"canyon_name":"Fake","segments":[' +
                '{"type":"RAPPEL","name":"R1","height":25}]}\n```',
            },
          },
        ],
      });
    });
  });
  server.listen(0, '127.0.0.1');
  return once(server, 'listening').then(() => server);
}

function startProxy(port, env) {
  const child = spawn(process.execPath, [PROXY_SCRIPT], {
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (chunk) => {
    out += chunk;
  });
  child.stderr.on('data', (chunk) => {
    out += chunk;
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Proxy startete nicht')), 8000);
    const check = setInterval(() => {
      if (out.includes('Canyoning-Topo-Proxy läuft')) {
        clearInterval(check);
        clearTimeout(timer);
        resolve({ child, log: () => out });
      }
    }, 100);
  });
}

function post(port, payload) {
  return postTo(port, '/api/topo', payload);
}

function postTo(port, path, payload) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Ruft den Cloudflare-Worker direkt auf – er ist ein reines fetch-Handler-Objekt. */
function callWorker(payload, env = {}) {
  const request = new Request('https://worker.test/api/topo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return worker.fetch(request, { AI_KEY: KEY, AI_UPSTREAM: 'https://upstream.test/v1', ...env });
}

/** Tauscht global.fetch nur für die Dauer eines Worker-Tests aus. */
async function withMockedFetch(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => handler(url, init);
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

const upstream = await startUpstream();
const upstreamPort = upstream.address().port;
const PORT = 8899;

const proxy = await startProxy(PORT, {
  AI_KEY: KEY,
  AI_UPSTREAM: `http://127.0.0.1:${upstreamPort}/v1`,
  AI_MODEL: 'fake-vision',
});

try {
  await test('leitet Bild und Prompt im OpenAI-Format an den Upstream weiter', async () => {
    const response = await post(PORT, { image: IMAGE, prompt: 'Erzeuge ein Topo' });
    assert.equal(response.status, 200);
    const last = received.at(-1);
    assert.equal(last.path, '/v1/chat/completions');
    assert.equal(last.body.model, 'fake-vision');
    const parts = last.body.messages[0].content.map((part) => part.type);
    assert.deepEqual(parts, ['image_url', 'text']);
    assert.equal(last.body.messages[0].content[0].image_url.url, IMAGE);
  });

  await test('setzt den Key serverseitig ein, der Browser sieht ihn nie', async () => {
    const response = await post(PORT, { image: IMAGE, prompt: 'x' });
    const text = await response.text();
    assert.equal(received.at(-1).headers.authorization, `Bearer ${KEY}`);
    assert.ok(!text.includes(KEY), 'Der Key darf nicht in der Antwort auftauchen');
  });

  await test('gibt den Modelltext unverändert zurück (Sanitizing macht die App)', async () => {
    const response = await post(PORT, { image: IMAGE, prompt: 'x' });
    const data = await response.json();
    assert.equal(typeof data, 'string', 'Antwort muss ein JSON-String sein');
    assert.ok(data.includes('```json'), 'Codefence bleibt erhalten');
    assert.ok(data.includes('"canyon_name":"Fake"'));
  });

  await test('das vom Browser gewünschte Modell schlägt die Vorgabe', async () => {
    await post(PORT, { image: IMAGE, prompt: 'x', model: 'anderes-modell' });
    assert.equal(received.at(-1).body.model, 'anderes-modell');
  });

  await test('reicht Upstream-Fehler im Klartext weiter', async () => {
    const response = await post(PORT, { image: IMAGE, prompt: 'x', model: 'boom' });
    assert.equal(response.status, 403);
    const data = await response.json();
    assert.match(data.error, /kein Zugriff auf dieses Modell/);
    assert.match(data.hint, /AI_AUTH_HEADER/, 'Bei 403 muss der Auth-Hinweis kommen');
  });

  await test('verkraftet HTML-Fehlerseiten von Gateways', async () => {
    const response = await post(PORT, { image: IMAGE, prompt: 'x', model: 'html' });
    assert.equal(response.status, 500);
    const data = await response.json();
    assert.match(data.error, /Gateway Error/);
  });

  await test('weist unvollständige Anfragen ab', async () => {
    const response = await post(PORT, { prompt: 'ohne Bild' });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /image und prompt/);
  });

  await test('weist Bilder ab, die keine Data-URL sind (Anthropic-Modus)', async () => {
    const other = 8900;
    const alt = await startProxy(other, {
      AI_KEY: KEY,
      AI_UPSTREAM: `http://127.0.0.1:${upstreamPort}/v1`,
      AI_API: 'anthropic',
      AI_MODEL: 'claude-test',
    });
    try {
      const bad = await post(other, { image: 'https://example.com/bild.png', prompt: 'x' });
      assert.equal(bad.status, 400);
      assert.match((await bad.json()).error, /Data-URL/);

      await post(other, { image: IMAGE, prompt: 'x' });
      const last = received.at(-1);
      assert.equal(last.path, '/v1/messages');
      assert.equal(last.headers['anthropic-version'], '2023-06-01');
      const source = last.body.messages[0].content[0].source;
      assert.equal(source.media_type, 'image/png');
      assert.ok(!source.data.startsWith('data:'), 'Anthropic will base64 ohne Präfix');
    } finally {
      alt.child.kill();
    }
  });

  await test('das Auth-Schema ist frei konfigurierbar', async () => {
    const other = 8901;
    const alt = await startProxy(other, {
      AI_KEY: KEY,
      AI_UPSTREAM: `http://127.0.0.1:${upstreamPort}/v1`,
      AI_AUTH_HEADER: 'X-Api-Key',
      AI_AUTH_SCHEME: '',
    });
    try {
      await post(other, { image: IMAGE, prompt: 'x' });
      const headers = received.at(-1).headers;
      assert.equal(headers['x-api-key'], KEY, 'roher Key ohne Präfix');
      assert.equal(headers.authorization, undefined);
    } finally {
      alt.child.kill();
    }
  });

  await test('meldet einen nicht erreichbaren Upstream als 502', async () => {
    const other = 8902;
    const alt = await startProxy(other, {
      AI_KEY: KEY,
      AI_UPSTREAM: 'http://127.0.0.1:1/v1',
    });
    try {
      const response = await post(other, { image: IMAGE, prompt: 'x' });
      assert.equal(response.status, 502);
      assert.match((await response.json()).error, /nicht erreichbar/);
    } finally {
      alt.child.kill();
    }
  });

  await test('ohne AI_KEY verweigert der Proxy den Dienst', async () => {
    const other = 8903;
    const alt = await startProxy(other, {
      AI_KEY: '',
      AI_UPSTREAM: `http://127.0.0.1:${upstreamPort}/v1`,
    });
    try {
      const response = await post(other, { image: IMAGE, prompt: 'x' });
      assert.equal(response.status, 500);
      assert.match((await response.json()).error, /AI_KEY/);
    } finally {
      alt.child.kill();
    }
  });

  await test('beantwortet den Preflight, den das Firmen-Gateway verweigert', async () => {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/topo`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://example.com' },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
  });

  await test('serviert die App, damit App und API denselben Origin haben', async () => {
    const page = await fetch(`http://127.0.0.1:${PORT}/index.html`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<title>/);

    const module = await fetch(`http://127.0.0.1:${PORT}/src/ai.js`);
    assert.equal(module.status, 200);
    assert.match(module.headers.get('content-type'), /javascript/);
  });

  await test('verweigert Pfade ausserhalb des Projektordners', async () => {
    const response = await fetch(`http://127.0.0.1:${PORT}/../../../etc/passwd`);
    assert.ok(response.status === 403 || response.status === 404);
    assert.ok(!(await response.text()).includes('root:'));
  });

  await test('health zeigt die Konfiguration, aber nicht den Key', async () => {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/health`);
    const data = await response.json();
    assert.equal(data.keyConfigured, true);
    assert.equal(data.model, 'fake-vision');
    assert.equal(data.acceptsClientConfig, true, 'Die App muss die Automatik erkennen können');
    assert.ok(!JSON.stringify(data).includes(KEY), 'Der Key darf nicht in /api/health stehen');
  });

  await test('übernimmt Endpoint, Modell und Key aus der Anfrage', async () => {
    const response = await post(PORT, {
      image: IMAGE,
      prompt: 'x',
      endpoint: `http://127.0.0.1:${upstreamPort}/anders`,
      model: 'aus-der-app',
      apiKey: 'app-key',
    });
    assert.equal(response.status, 200);
    const last = received.at(-1);
    assert.equal(last.path, '/anders/chat/completions');
    assert.equal(last.body.model, 'aus-der-app');
    assert.equal(last.headers.authorization, 'Bearer app-key');
  });

  await test('kürzt einen versehentlich vollständigen Pfad auf die Basis', async () => {
    await post(PORT, {
      image: IMAGE,
      prompt: 'x',
      endpoint: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`,
    });
    assert.equal(received.at(-1).path, '/v1/chat/completions', 'kein doppeltes /chat/completions');
  });

  await test('die App kann pro Anfrage auf das Anthropic-Format umschalten', async () => {
    await post(PORT, {
      image: IMAGE,
      prompt: 'x',
      endpoint: `http://127.0.0.1:${upstreamPort}/v1`,
      api: 'anthropic',
      apiKey: 'claude-key',
    });
    const last = received.at(-1);
    assert.equal(last.path, '/v1/messages');
    assert.equal(last.headers['anthropic-version'], '2023-06-01');
  });

  await test('ohne Key in Umgebung UND Anfrage kommt eine hilfreiche Meldung', async () => {
    const other = 8904;
    const alt = await startProxy(other, {
      AI_KEY: '',
      AI_UPSTREAM: `http://127.0.0.1:${upstreamPort}/v1`,
    });
    try {
      const withKey = await post(other, { image: IMAGE, prompt: 'x', apiKey: 'nur-aus-app' });
      assert.equal(withKey.status, 200, 'Key allein aus der App muss genügen');
      assert.equal(received.at(-1).headers.authorization, 'Bearer nur-aus-app');

      const without = await post(other, { image: IMAGE, prompt: 'x' });
      assert.equal(without.status, 500);
      assert.match((await without.json()).error, /in der App/);
    } finally {
      alt.child.kill();
    }
  });

  await test('AI_ALLOW_CLIENT_CONFIG=false ignoriert Angaben aus dem Browser', async () => {
    const other = 8905;
    const alt = await startProxy(other, {
      AI_KEY: KEY,
      AI_UPSTREAM: `http://127.0.0.1:${upstreamPort}/v1`,
      AI_MODEL: 'nur-server',
      AI_ALLOW_CLIENT_CONFIG: 'false',
    });
    try {
      const health = await (await fetch(`http://127.0.0.1:${other}/api/health`)).json();
      assert.equal(health.acceptsClientConfig, false);

      await post(other, {
        image: IMAGE,
        prompt: 'x',
        endpoint: 'http://127.0.0.1:1/boese',
        model: 'untergeschoben',
        apiKey: 'fremder-key',
      });
      const last = received.at(-1);
      assert.equal(last.path, '/v1/chat/completions', 'Endpoint aus dem Browser muss ignoriert werden');
      assert.equal(last.body.model, 'nur-server');
      assert.equal(last.headers.authorization, `Bearer ${KEY}`);
    } finally {
      alt.child.kill();
    }
  });
  await test('ohne AI_MODEL meldet health das Standardmodell', async () => {
    const other = 8906;
    const alt = await startProxy(other, {
      AI_KEY: KEY,
      AI_UPSTREAM: `http://127.0.0.1:${upstreamPort}/v1`,
      AI_MODEL: '',
    });
    try {
      const health = await (await fetch(`http://127.0.0.1:${other}/api/health`)).json();
      assert.equal(health.model, 'qwen/qwen3.6-35b-a3b');
    } finally {
      alt.child.kill();
    }
  });

  await test('listet Modelle, entdoppelt und sortiert sie', async () => {
    const res = await postTo(PORT, '/api/models', { apiKey: 'k' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.models, ['alpha-vision', 'zeta-vision']);
  });

  await test('die Modell-Liste folgt dem Endpoint aus der Anfrage', async () => {
    const res = await postTo(PORT, '/api/models', {
      apiKey: 'k',
      endpoint: `http://127.0.0.1:${upstreamPort}/v1/weg`,
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.match(body.hint, /von Hand/);
  });

  await test('eine leere Modell-Liste gilt als Fehlschlag', async () => {
    const res = await postTo(PORT, '/api/models', {
      apiKey: 'k',
      endpoint: `http://127.0.0.1:${upstreamPort}/v1/leer`,
    });
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /keine erkennbare Modell-Liste/);
  });

  await test('health meldet, dass der Proxy Modelle auflisten kann', async () => {
    const health = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
    assert.equal(health.canListModels, true);
  });

  await test('weist einen Key mit Nicht-ASCII-Zeichen verständlich ab', async () => {
    const before = received.length;
    const res = await post(PORT, {
      image: IMAGE,
      prompt: 'x',
      apiKey: 'AI_KEY=… kopierter Platzhalter',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /unzulässiges Zeichen/);
    assert.match(body.error, /…/, 'das störende Zeichen soll genannt werden');
    assert.equal(received.length, before, 'so ein Key darf den Upstream nie erreichen');
  });
  await test('übernimmt die System-Anweisung des Browsers unverändert', async () => {
    const { system, user } = buildPromptParts({}, { template: 'optimized' });
    await post(PORT, { image: IMAGE, prompt: user, system });
    const messages = received.at(-1).body.messages;
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[0].content, system, 'der Proxy darf nichts eigenes formulieren');
    assert.equal(messages[1].role, 'user');
    assert.equal(messages[1].content[1].text, user);
  });

  await test('ohne System-Anweisung bleibt es bei einer einzigen Nachricht', async () => {
    await post(PORT, { image: IMAGE, prompt: 'nur Prompt' });
    const messages = received.at(-1).body.messages;
    assert.equal(messages.length, 1);
    assert.equal(messages[0].role, 'user');
  });

  await test('setzt niedrige Temperatur und den JSON-Modus', async () => {
    await post(PORT, { image: IMAGE, prompt: 'x' });
    const body = received.at(-1).body;
    assert.equal(body.temperature, 0.15);
    assert.deepEqual(body.response_format, { type: 'json_object' });
  });

  await test('schaltet den Denkmodus ab und lässt Raum für lange Topos', async () => {
    await post(PORT, { image: IMAGE, prompt: 'x' });
    const body = received.at(-1).body;
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
    assert.equal(body.max_tokens, 8000);
  });

  await test('wiederholt ohne Denkschalter, wenn der Upstream ihn ablehnt', async () => {
    const before = received.length;
    const response = await post(PORT, { image: IMAGE, prompt: 'x', model: 'kein-denkschalter' });
    assert.equal(response.status, 200);
    assert.equal(received.length - before, 2, 'genau ein Wiederholungsversuch');
    assert.ok(received.at(-2).body.chat_template_kwargs, 'erster Versuch mit Denkschalter');
    assert.equal(received.at(-1).body.chat_template_kwargs, undefined, 'zweiter Versuch ohne');
    assert.ok(received.at(-1).body.response_format, 'der JSON-Modus bleibt erhalten');
  });

  await test('meldet ein leergedachtes Modell verständlich', async () => {
    const response = await post(PORT, { image: IMAGE, prompt: 'x', model: 'denkt-zu-viel' });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /Nachdenken verbraucht/);
  });

  await test('wiederholt ohne JSON-Modus, wenn der Upstream ihn ablehnt', async () => {
    const before = received.length;
    const response = await post(PORT, { image: IMAGE, prompt: 'x', model: 'kein-json' });
    assert.equal(response.status, 200);
    assert.equal(received.length - before, 2, 'genau ein Wiederholungsversuch');
    assert.ok(received.at(-2).body.response_format, 'erster Versuch mit JSON-Modus');
    assert.equal(received.at(-1).body.response_format, undefined, 'zweiter Versuch ohne');
    assert.equal(received.at(-1).body.temperature, 0.15);
  });

  await test('weist einen zu langen Prompt ab', async () => {
    const before = received.length;
    const response = await post(PORT, { image: IMAGE, prompt: 'x'.repeat(32001) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /zu lang/);
    assert.equal(received.length, before, 'so etwas darf den Upstream nie erreichen');
  });

  await test('weist eine zu lange System-Anweisung ab', async () => {
    const response = await post(PORT, { image: IMAGE, prompt: 'x', system: 'y'.repeat(32001) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /zu lang/);
  });

  await test('weist Prompt und System ab, die kein Text sind', async () => {
    const wrongPrompt = await post(PORT, { image: IMAGE, prompt: 42 });
    assert.equal(wrongPrompt.status, 400);
    assert.match((await wrongPrompt.json()).error, /müssen Text sein/);
    const wrongSystem = await post(PORT, { image: IMAGE, prompt: 'x', system: { a: 1 } });
    assert.equal(wrongSystem.status, 400);
    assert.match((await wrongSystem.json()).error, /müssen Text sein/);
  });

  await test('health meldet, dass der Proxy eine System-Anweisung annimmt', async () => {
    const health = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
    assert.equal(health.acceptsSystemPrompt, true);
    assert.equal(health.maxPromptChars, 32000);
  });

  await test('im Anthropic-Modus wandert die Anweisung ins system-Feld', async () => {
    const other = 8906;
    const alt = await startProxy(other, {
      AI_KEY: KEY,
      AI_UPSTREAM: `http://127.0.0.1:${upstreamPort}/v1`,
      AI_API: 'anthropic',
      AI_MODEL: 'claude-test',
    });
    try {
      const { system, user } = buildPromptParts({}, { template: 'optimized' });
      await post(other, { image: IMAGE, prompt: user, system });
      const body = received.at(-1).body;
      assert.equal(body.system, system);
      assert.equal(body.temperature, 0.15);
      assert.equal(body.response_format, undefined, 'Anthropic kennt response_format nicht');
      assert.equal(
        body.chat_template_kwargs,
        undefined,
        'Anthropic kennt chat_template_kwargs nicht',
      );
      assert.equal(body.messages[0].content[1].text, user);
    } finally {
      alt.child.kill();
    }
  });

  await test('der Worker schaltet den Denkmodus ab und lässt Raum für lange Topos', async () => {
    const bodies = [];
    await withMockedFetch(
      (url, init) => {
        bodies.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
      },
      () => callWorker({ image: IMAGE, prompt: 'x' }),
    );
    assert.deepEqual(bodies[0].chat_template_kwargs, { enable_thinking: false });
    assert.equal(bodies[0].max_tokens, 8000);
  });

  await test('der Worker erhält den optimierten Prompt für OpenAI und Anthropic bytegleich', async () => {
    const { system, user } = buildPromptParts({}, { template: 'optimized' });
    for (const api of ['openai', 'anthropic']) {
      const bodies = [];
      await withMockedFetch((url, init) => {
        bodies.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
      }, () => callWorker({ image: IMAGE, prompt: user, system }, { AI_API: api }));
      const body = bodies[0];
      if (api === 'openai') {
        assert.equal(body.messages[0].content, system);
        assert.equal(body.messages[1].content[1].text, user);
        assert.equal(body.messages[1].content[0].image_url.url, IMAGE);
      } else {
        assert.equal(body.system, system);
        assert.equal(body.messages[0].content[1].text, user);
        assert.equal(body.messages[0].content[0].source.data, IMAGE.split(',')[1]);
      }
    }
  });

  await test('der Worker wiederholt ohne Denkschalter, wenn der Upstream ihn ablehnt', async () => {
    const bodies = [];
    const response = await withMockedFetch(
      (url, init) => {
        bodies.push(JSON.parse(init.body));
        if (bodies.length === 1) {
          return new Response(
            JSON.stringify({ error: { message: 'unknown field chat_template_kwargs' } }),
            { status: 400 },
          );
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
      },
      () => callWorker({ image: IMAGE, prompt: 'x' }),
    );
    assert.equal(response.status, 200);
    assert.equal(bodies.length, 2, 'genau ein Wiederholungsversuch');
    assert.equal(bodies[1].chat_template_kwargs, undefined, 'zweiter Versuch ohne Denkschalter');
  });

  await test('der Worker meldet ein leergedachtes Modell verständlich', async () => {
    const response = await withMockedFetch(
      () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'length', message: { content: '', reasoning: 'Hmm …' } }],
          }),
        ),
      () => callWorker({ image: IMAGE, prompt: 'x' }),
    );
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /Nachdenken verbraucht/);
  });

} finally {
  proxy.child.kill();
  upstream.close();
}

console.log(`\n${passed} Test(s) bestanden.`);
