/**
 * Tests für die Verarbeitung von Modellantworten (Foto → Topo):
 *   node test/ai.test.mjs
 *
 * Es wird kein Netzaufruf gemacht — geprüft wird nur, dass unsaubere
 * Modellausgaben zuverlässig in ein gültiges Topo übersetzt oder klar
 * abgelehnt werden.
 */
import assert from 'node:assert/strict';

import {
  buildPrompt,
  extractJsonObject,
  listModels,
  pickModelIds,
  sanitizeTopoCandidate,
  saveAiSettings,
} from '../src/ai.js';
import { validateTopo } from '../src/model.js';
import { layoutTopo } from '../src/layout.js';
import { renderTopoSvg } from '../src/renderer.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error.message}`);
    process.exitCode = 1;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error.message}`);
    process.exitCode = 1;
  }
}

/** Tauscht global.fetch nur für die Dauer eines Tests aus. */
async function withFetch(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => handler(url, init);
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

console.log('AI-Antwortverarbeitung');

test('JSON in Markdown-Codefence wird erkannt', () => {
  const answer = 'Klar, hier das Topo:\n```json\n{"canyon_name":"Test","segments":[]}\n```\nViel Spaß!';
  assert.equal(extractJsonObject(answer).canyon_name, 'Test');
});

test('verschachtelte Objekte und Klammern in Strings brechen den Parser nicht', () => {
  const answer = '{"canyon_name":"A }{ B","segments":[{"type":"WALK","elements":[]}]}';
  const parsed = extractJsonObject(answer);
  assert.equal(parsed.canyon_name, 'A }{ B');
  assert.equal(parsed.segments.length, 1);
});

test('Antwort ohne JSON wird klar abgelehnt', () => {
  assert.throws(() => extractJsonObject('Ich kann das Bild leider nicht erkennen.'), /JSON/);
});

test('abgeschnittene Antwort wird abgelehnt', () => {
  assert.throws(() => extractJsonObject('{"canyon_name":"x","segments":[{'), /vollständig/);
});

test('bekannte Synonyme werden auf gültige Typen abgebildet', () => {
  const topo = sanitizeTopoCandidate({
    canyon_name: 'Synonyme',
    segments: [
      { type: 'hike', elements: [{ type: 'boulder' }] },
      { type: 'Wet Rappel', elements: [{ type: 'anchor' }] },
      { type: 'swim', elements: [] },
    ],
  });
  assert.deepEqual(
    topo.segments.map((s) => s.type),
    ['WALK', 'RAPPEL_WET', 'POOL'],
  );
  assert.equal(topo.segments[0].elements[0].type, 'STONE');
  assert.equal(topo.segments[1].elements[0].type, 'BOLT');
});

test('neue Infrastrukturtypen und deutsche/englische Aliase überleben die AI-Normalisierung', () => {
  const types = [
    'RADIO_MAST', 'Funkmast', 'radio tower',
    'LIFT_MAST', 'Liftmast', 'ski lift tower',
    'SQUARE_CONCRETE_BASE', 'Betonsockel eckig', 'concrete base',
    'STEEL_BEAM', 'Stahlträger', 'I-beam',
  ];
  const report = [];
  const topo = sanitizeTopoCandidate({
    segments: [{ type: 'WALK', elements: types.map((type) => ({ type })) }],
  }, report);
  assert.deepEqual(topo.segments[0].elements.map((element) => element.type), [
    'RADIO_MAST', 'RADIO_MAST', 'RADIO_MAST',
    'LIFT_MAST', 'LIFT_MAST', 'LIFT_MAST',
    'SQUARE_CONCRETE_BASE', 'SQUARE_CONCRETE_BASE', 'SQUARE_CONCRETE_BASE',
    'STEEL_BEAM', 'STEEL_BEAM', 'STEEL_BEAM',
  ]);
  assert.deepEqual(report, []);
  for (const element of topo.segments[0].elements) {
    assert.equal(element.horizontal_end_rel_to_segment_start, null);
  }
  for (const type of ['RADIO_MAST', 'LIFT_MAST', 'SQUARE_CONCRETE_BASE', 'STEEL_BEAM']) {
    assert.ok(buildPrompt().includes(type), `${type} fehlt im Prompt`);
  }
});

test('unbekannte Typen werden verworfen und gemeldet', () => {
  const report = [];
  const topo = sanitizeTopoCandidate(
    {
      segments: [
        { type: 'WALK', elements: [{ type: 'TELEPORTER' }] },
        { type: 'ZIPLINE', elements: [] },
      ],
    },
    report,
  );
  assert.equal(topo.segments.length, 1, 'nur das WALK-Segment bleibt');
  assert.equal(topo.segments[0].elements.length, 0);
  assert.equal(report.length, 2);
});

test('Tote Bäume werden aus Typnamen und aus dem Feld erkannt', () => {
  const topo = sanitizeTopoCandidate({
    segments: [
      {
        type: 'WALK',
        elements: [
          { type: 'DEAD_TREE' },
          { type: 'SNAG' },
          { type: 'DEAD_CONIFER' },
          { type: 'LEAF_TREE', dead: true },
          { type: 'LEAF_TREE' },
        ],
      },
    ],
  });
  const elements = topo.segments[0].elements;
  assert.deepEqual(
    elements.map((el) => el.type),
    ['LEAF_TREE', 'LEAF_TREE', 'CONIFER_TREE', 'LEAF_TREE', 'LEAF_TREE'],
  );
  assert.deepEqual(
    elements.map((el) => el.dead),
    [true, true, true, true, false],
  );
});

test('Der Zustand "abgestorben" wird bei Nicht-Bäumen verworfen', () => {
  const topo = sanitizeTopoCandidate({
    segments: [{ type: 'WALK', elements: [{ type: 'STONE', dead: true }] }],
  });
  assert.equal(topo.segments[0].elements[0].dead, false);
});

test('Punktelemente bekommen keine Endkoordinaten', () => {
  const topo = sanitizeTopoCandidate({
    segments: [
      {
        type: 'WALK',
        elements: [
          { type: 'STONE', horizontal_end_rel_to_segment_start: 5, vertical_end_rel_to_segment_start: 5 },
        ],
      },
    ],
  });
  const element = topo.segments[0].elements[0];
  assert.equal(element.horizontal_end_rel_to_segment_start, null);
  assert.equal(element.vertical_end_rel_to_segment_start, null);
});

test('Streckenelemente behalten bzw. bekommen Endkoordinaten', () => {
  const topo = sanitizeTopoCandidate({
    segments: [
      {
        type: 'WALK',
        elements: [
          { type: 'ROPE_RAILING_LEFT', horizontal_start_rel_to_segment_start: 0 },
          {
            type: 'ROPE_RAILING_RIGHT',
            horizontal_start_rel_to_segment_start: 1,
            horizontal_end_rel_to_segment_start: 7,
            vertical_end_rel_to_segment_start: -2,
          },
        ],
      },
    ],
  });
  const [a, b] = topo.segments[0].elements;
  assert.equal(typeof a.horizontal_end_rel_to_segment_start, 'number');
  assert.equal(b.horizontal_end_rel_to_segment_start, 7);
  assert.equal(b.vertical_end_rel_to_segment_start, -2);
});

test('Antwort ganz ohne brauchbare Segmente wird abgelehnt', () => {
  assert.throws(() => sanitizeTopoCandidate({ segments: [] }), /kein verwertbares Topo/);
  assert.throws(() => sanitizeTopoCandidate(null), /kein Topo-Objekt/);
});

test('fehlendes oder unsinniges Datum wird ersetzt', () => {
  const topo = sanitizeTopoCandidate({
    date: 'irgendwann im Sommer',
    segments: [{ type: 'WALK', elements: [] }],
  });
  assert.match(topo.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('ein AI-Ergebnis ist sofort valide, layoutbar und renderbar', () => {
  const answer = `\`\`\`json
{
  "canyon_name": "Val Bodengo",
  "date": "2026-07-12",
  "maximum_walk_length": 30,
  "distance_of_single_line": 60,
  "segments": [
    { "type": "walk", "length_in_meters": 40, "duration_to_walk_in_min": 5,
      "elements": [{ "type": "tree", "horizontal_start_rel_to_segment_start": 12 }] },
    { "type": "RAPPEL_DRY", "length_in_meters": 25, "angle_in_degrees": 90,
      "elements": [{ "type": "BOLT_LEFT", "horizontal_start_rel_to_segment_start": 0.5 }] },
    { "type": "POOL", "length_in_meters": 9, "elements": [] }
  ]
}
\`\`\``;
  const topo = sanitizeTopoCandidate(extractJsonObject(answer));

  assert.equal(validateTopo(topo).filter((i) => i.level === 'error').length, 0);
  const layout = layoutTopo(topo);
  assert.equal(layout.placements.length, 3);
  const svg = renderTopoSvg(topo, layout);
  assert.ok(svg.startsWith('<svg') && svg.includes('Val Bodengo'));
});

test('der Prompt nennt alle gültigen Typen und das Koordinatensystem', () => {
  const prompt = buildPrompt({ canyonName: 'Boggera', notes: 'Skizze aus dem Führer' });
  for (const type of ['WALK', 'RAPPEL_WET', 'CLIMB', 'WEIR']) {
    assert.ok(prompt.includes(type), `${type} fehlt im Prompt`);
  }
  assert.ok(prompt.includes('ROPE_RAILING_LEFT'));
  assert.ok(prompt.includes('Boggera'), 'Hinweis auf den Canyon-Namen fehlt');
  assert.ok(prompt.includes('Skizze aus dem Führer'), 'Nutzer-Zusatzinfo fehlt');
  assert.ok(prompt.includes('"author"'), 'Author-Metadatum fehlt');
  assert.ok(prompt.includes('"duration"'), 'Dauer-Metadatum fehlt');
  assert.ok(prompt.includes('links der Laufrichtung'), 'Koordinatenregel fehlt');
});

test('pickModelIds versteht alle gängigen Antwortformen', () => {
  assert.deepEqual(pickModelIds({ data: [{ id: 'b' }, { id: 'a' }] }), ['a', 'b']);
  assert.deepEqual(pickModelIds({ models: ['x'] }), ['x']);
  assert.deepEqual(pickModelIds(['n']), ['n']);
  assert.deepEqual(pickModelIds({ data: [{ name: 'per-name' }] }), ['per-name']);
  assert.deepEqual(pickModelIds({ data: [{ id: 'd' }, { id: 'd' }] }), ['d'], 'Doppelte raus');
  assert.deepEqual(pickModelIds({ unbekannt: 1 }), []);
  assert.deepEqual(pickModelIds(null), []);
});

await testAsync('listModels fragt den Endpoint direkt ab', async () => {
  saveAiSettings({ providerId: 'openai', endpoint: 'https://beispiel.test/v1', apiKey: 'k' });
  const seen = [];
  const result = await withFetch(
    (url, init) => {
      seen.push({ url, method: init.method });
      return jsonResponse({ data: [{ id: 'gpt-4o' }] });
    },
    () => listModels(),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.models, ['gpt-4o']);
  assert.equal(result.viaProxy, false);
  assert.equal(seen[0].url, 'https://beispiel.test/v1/models');
  assert.equal(seen[0].method, 'GET');
});

await testAsync('listModels weicht bei CORS auf den lokalen Proxy aus', async () => {
  saveAiSettings({ providerId: 'openai', endpoint: 'https://gateway.test/v1', apiKey: 'k' });
  const calls = [];
  const result = await withFetch(
    (url) => {
      calls.push(String(url));
      // So meldet der Browser eine am Preflight gescheiterte Anfrage.
      if (String(url).startsWith('https://')) throw new TypeError('Failed to fetch');
      if (String(url).endsWith('/api/health')) {
        return jsonResponse({ ok: true, canListModels: true });
      }
      return jsonResponse({ models: ['gateway-modell'] });
    },
    () => listModels(),
  );
  assert.equal(result.ok, true, `unerwartet: ${result.reason}`);
  assert.equal(result.viaProxy, true);
  assert.deepEqual(result.models, ['gateway-modell']);
  assert.ok(
    calls.some((url) => url.endsWith('/api/models')),
    'der Proxy hätte gefragt werden müssen',
  );
});

await testAsync('ohne Proxy erklärt listModels das CORS-Problem statt zu werfen', async () => {
  saveAiSettings({ providerId: 'openai', endpoint: 'https://gateway.test/v1', apiKey: 'k' });
  const result = await withFetch(
    () => {
      throw new TypeError('Failed to fetch');
    },
    () => listModels(),
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /CORS/);
  assert.match(result.reason, /npm start/);
});

await testAsync('listModels meldet einen unbrauchbaren Key, ohne das Netz zu belasten', async () => {
  saveAiSettings({ providerId: 'openai', endpoint: 'https://beispiel.test/v1', apiKey: 'AI_KEY=…' });
  let called = false;
  const result = await withFetch(
    () => {
      called = true;
      return jsonResponse({});
    },
    () => listModels(),
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /unzulässiges Zeichen/);
  assert.equal(called, false);
});

await testAsync('im Proxy-Modus gibt es nichts aufzulisten', async () => {
  saveAiSettings({ providerId: 'proxy' });
  const result = await listModels();
  assert.equal(result.ok, false);
  assert.match(result.reason, /Proxy/);
});

console.log(`\n${passed} Test(s) bestanden.`);
