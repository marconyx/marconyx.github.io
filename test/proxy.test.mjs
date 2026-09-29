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
  return fetch(`http://127.0.0.1:${port}/api/topo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
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
    assert.ok(!JSON.stringify(data).includes(KEY), 'Der Key darf nicht in /api/health stehen');
  });
} finally {
  proxy.child.kill();
  upstream.close();
}

console.log(`\n${passed} Test(s) bestanden.`);
