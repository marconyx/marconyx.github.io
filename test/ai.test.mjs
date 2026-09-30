/**
 * Tests für die Verarbeitung von Modellantworten (Foto → Topo):
 *   node test/ai.test.mjs
 *
 * Es wird kein Netzaufruf gemacht — geprüft wird nur, dass unsaubere
 * Modellausgaben zuverlässig in ein gültiges Topo übersetzt oder klar
 * abgelehnt werden.
 */
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import {
  AI_MAX_TOKENS,
  AI_TEMPERATURE,
  MAX_PROMPT_CHARS,
  PROMPT_TEMPLATES,
  buildCompactInstructions,
  buildOptimizedInstructions,
  buildPrompt,
  buildPromptParts,
  extractJsonObject,
  getAiSettings,
  listModels,
  loadAiSettings,
  photoToTopo,
  pickModelIds,
  promptTemplateById,
  providerById,
  sanitizeTopoCandidate,
  saveAiSettings,
} from '../src/ai.js';
import {
  DEAD_CAPABLE_ELEMENT_TYPES,
  ELEMENT_TYPES,
  RANGE_ELEMENT_TYPES,
  SEGMENT_TYPES,
  WALK_TIME_ELEMENT_TYPES,
  validateTopo,
} from '../src/model.js';
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
  const response = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    // src/ai.js liest Fehlerantworten doppelt (Prüfung + Meldung).
    clone: () => jsonResponse(payload, status),
  };
  return response;
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


/* --------------------------------------------------------- Prompt-Vorlagen */

console.log('\nPrompt-Vorlagen');

const IMAGE = 'data:image/png;base64,AAAA';
const ANSWER = '{"canyon_name":"Test","segments":[{"type":"RAPPEL","height":20}]}';

/** Antwort im OpenAI-Format mit einem brauchbaren Topo. */
function openAiAnswer() {
  return jsonResponse({ choices: [{ message: { content: ANSWER } }] });
}

/** Sammelt den zuletzt gesendeten Request-Body. */
function recorder() {
  const calls = [];
  const handler = (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (String(url).includes('/messages')) {
      return jsonResponse({ content: [{ type: 'text', text: ANSWER }] });
    }
    // Ein Proxy reicht den Modelltext als JSON-String durch.
    if (String(url).includes('/api/topo')) return jsonResponse(ANSWER);
    return openAiAnswer();
  };
  return { calls, handler };
}

function useOpenAi(patch = {}) {
  saveAiSettings({
    providerId: 'openai',
    endpoint: 'https://api.example.com/v1',
    model: 'gpt-4o',
    apiKey: 'test-key',
    promptTemplate: 'optimized',
    customPrompt: '',
    ...patch,
  });
}

test('jede Vorlage hat Id, Label und Hinweis', () => {
  assert.deepEqual(
    PROMPT_TEMPLATES.map((entry) => entry.id),
    ['optimized', 'compact', 'legacy', 'custom'],
  );
  for (const entry of PROMPT_TEMPLATES) {
    assert.ok(entry.label && entry.hint, `${entry.id} ist unvollständig`);
  }
  assert.equal(promptTemplateById('gibt-es-nicht').id, 'optimized');
});

test('die optimierte Vorlage nennt jeden Segment- und jeden Symboltyp', () => {
  const prompt = buildOptimizedInstructions();
  for (const type of SEGMENT_TYPES) {
    assert.ok(prompt.includes(type), `Segmenttyp ${type} fehlt`);
  }
  for (const type of ELEMENT_TYPES) {
    assert.ok(prompt.includes(type), `Elementtyp ${type} fehlt`);
  }
});

test('die optimierte Vorlage priorisiert die Kodierung der Topo-Kurzlabels', () => {
  const prompt = buildOptimizedInstructions();
  const mapping = prompt.split('KODIERUNGS-MAPPING (Priorität!):')[1]?.split('\nAUSGABE:')[0];
  assert.ok(mapping, 'das priorisierte Kodierungs-Mapping fehlt');
  assert.match(mapping, /Vorrang vor Kurzlabels und Erkennungsmerkmalen/);
  assert.match(mapping, /C \(Cascade\) → RAPPEL_WET \(Wasserfall-Abseilen\/Abfahrt\)/);
  assert.match(mapping, /T \/ TP \(Toboggan\) → SLIDE \(Rutsche\)/);
  assert.match(mapping, /R \/ Rd \/ Rw → RAPPEL \/ RAPPEL_DRY \/ RAPPEL_WET/);
  assert.match(mapping, /MC \(Main-Courante\) → Elementtyp ROPE_RAILING_LEFT oder ROPE_RAILING_RIGHT \(je nach Lage\)/);
  assert.ok(prompt.indexOf('KODIERUNGS-MAPPING (Priorität!):') < prompt.indexOf('SEGMENTTYPEN ('));
  assert.match(prompt, /CLIMB[^\n]*C \(Cascade\) ist RAPPEL_WET/);
});

test('die optimierte Vorlage erklärt die Gehzeit von Segment und Fluchtweg', () => {
  for (const prompt of [buildOptimizedInstructions(), buildCompactInstructions()]) {
    assert.match(prompt, /duration_to_walk_in_min/);
    for (const type of WALK_TIME_ELEMENT_TYPES) {
      assert.ok(prompt.includes(type), `${type} fehlt`);
    }
  }
  assert.match(buildOptimizedInstructions(), /beim Segment nur bei WALK/);
});

test('die optimierte Vorlage erklärt Rolle, Vorgehen, Einheiten und Ausgabe', () => {
  const prompt = buildOptimizedInstructions();
  assert.match(prompt, /Canyoning-Topo-Experte/);
  assert.match(prompt, /VORGEHEN/);
  assert.match(prompt, /AUSSCHLIESSLICH mit einem einzigen JSON-Objekt/);
  assert.match(prompt, /kein Markdown/i);
  assert.match(prompt, />90 = ÜBERHÄNGEND/);
  assert.match(prompt, /wall_distance_in_meters/);
  assert.match(prompt, /force_cut_row_after_this_segment/);
  assert.match(prompt, /NIE beide zugleich true/);
  assert.match(prompt, /"dead": true/);
  assert.match(prompt, /links der Laufrichtung/);
  assert.match(prompt, /BEISPIEL/);
  // Streckenelemente und Bäume sind dynamisch markiert, nicht hart aufgezählt.
  for (const type of RANGE_ELEMENT_TYPES) {
    assert.ok(prompt.includes(`${type} (`), `${type} fehlt`);
  }
  for (const type of DEAD_CAPABLE_ELEMENT_TYPES) {
    assert.match(prompt, new RegExp(`${type}[^\\n]*kennt "dead"`));
  }
});

test('die kompakte Vorlage nennt ebenfalls jeden Typ, bleibt aber kürzer', () => {
  const compact = buildPrompt({}, { template: 'compact' });
  for (const type of [...SEGMENT_TYPES, ...ELEMENT_TYPES]) {
    assert.ok(compact.includes(type), `${type} fehlt in der Kurzfassung`);
  }
  assert.ok(compact.length < buildPrompt({}, { template: 'optimized' }).length);
});

test('der bisherige Prompt ist byte-identisch zum alten Aufbau', () => {
  const expected = readFileSync(new URL('./fixtures/legacy-prompt.txt', import.meta.url), 'utf8');
  const actual = buildPrompt(
    { canyonName: 'Boggera', notes: 'Skizze aus dem Führer' },
    { template: 'legacy' },
  );
  assert.equal(actual, expected);
});

test('optimiert und kompakt trennen Anweisung und Bildaufgabe', () => {
  for (const template of ['optimized', 'compact']) {
    const parts = buildPromptParts({ canyonName: 'Boggera', notes: 'aus dem Führer' }, { template });
    assert.ok(parts.system.length > 200, `${template} hat keine Anweisung`);
    assert.ok(parts.user.length < 400, `${template} packt zu viel in die Aufgabe`);
    assert.match(parts.user, /Boggera/);
    assert.match(parts.user, /aus dem Führer/);
  }
});

test('bisheriger und eigener Prompt bleiben ein einziger User-Text', () => {
  const legacy = buildPromptParts({}, { template: 'legacy' });
  assert.equal(legacy.system, '');
  const custom = buildPromptParts({}, { template: 'custom', customPrompt: 'Mach ein Topo.' });
  assert.equal(custom.system, '');
  assert.equal(custom.user, 'Mach ein Topo.');
});

test('ein leerer eigener Prompt wird abgelehnt', () => {
  assert.throws(
    () => buildPromptParts({}, { template: 'custom', customPrompt: '   ' }),
    /eigene Prompt ist leer/,
  );
});

test('ein überlanger eigener Prompt wird abgelehnt', () => {
  assert.throws(
    () => buildPromptParts({}, { template: 'custom', customPrompt: 'x'.repeat(MAX_PROMPT_CHARS + 1) }),
    /zu lang/,
  );
});

/* ------------------------------------------------------- Standardeinstellungen */

const SWISSCOM_ENDPOINT =
  'https://api.swisscom.com/products/swiss-ai-platform/internal-all-models/v1';
const SWISSCOM_MODEL = 'qwen/qwen3.6-35b-a3b';

/** Führt fn mit einem frischen localStorage-Ersatz aus. */
function withStorage(fn, seed = null) {
  const store = new Map();
  if (seed) store.set('canyon-topo-generator/ai/v1', JSON.stringify(seed));
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  try {
    return fn(store);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
}

/** Liest zurück, was loadAiSettings in den Speicher geschrieben hat. */
function storedSettings(store) {
  const raw = store.get('canyon-topo-generator/ai/v1');
  return raw ? JSON.parse(raw) : null;
}

test('der OpenAI-Anbieter zeigt auf die Swisscom Swiss AI Platform', () => {
  const spec = providerById('openai');
  assert.equal(spec.defaultEndpoint, SWISSCOM_ENDPOINT);
  assert.equal(spec.defaultModel, SWISSCOM_MODEL);
  assert.match(spec.hint, /Swisscom Swiss AI Platform/);
  assert.match(spec.hint, /OpenAI/);

  // Die übrigen Anbieter bleiben unangetastet.
  assert.equal(providerById('anthropic').defaultEndpoint, 'https://api.anthropic.com/v1');
  assert.equal(providerById('anthropic').defaultModel, 'claude-sonnet-4-20250514');
  assert.equal(providerById('proxy').defaultEndpoint, 'http://127.0.0.1:8787/api/topo');
  assert.equal(providerById('proxy').defaultModel, '');
});

test('ohne gespeicherte Werte gelten die neuen Standards', () => {
  // Ein leerer Datensatz: alles kommt aus DEFAULT_SETTINGS.
  const restored = withStorage(() => loadAiSettings(), {});
  assert.equal(restored.providerId, 'openai');
  assert.equal(restored.endpoint, SWISSCOM_ENDPOINT);
  assert.equal(restored.model, SWISSCOM_MODEL);
});

test('leere gespeicherte Werte werden beim Laden mit den Standards gefüllt', () => {
  const restored = withStorage(() => loadAiSettings(), {
    providerId: 'openai',
    endpoint: '',
    model: '   ',
    apiKey: 'geheim',
  });
  assert.equal(restored.endpoint, SWISSCOM_ENDPOINT);
  assert.equal(restored.model, SWISSCOM_MODEL);
  assert.equal(restored.apiKey, 'geheim', 'das Key-Verhalten bleibt unverändert');

  // Auch ein Datensatz ganz ohne die Felder bekommt die Vorgaben.
  const sparse = withStorage(() => loadAiSettings(), { providerId: 'openai' });
  assert.equal(sparse.endpoint, SWISSCOM_ENDPOINT);
  assert.equal(sparse.model, SWISSCOM_MODEL);
});

test('ausdrücklich gespeicherte Werte überschreibt der neue Standard nicht', () => {
  const restored = withStorage(() => loadAiSettings(), {
    providerId: 'openai',
    endpoint: 'https://gateway.intern.test/v1',
    model: 'gpt-4o-mini',
  });
  assert.equal(restored.endpoint, 'https://gateway.intern.test/v1');
  assert.equal(restored.model, 'gpt-4o-mini');
});

test('die alten Standardwerte werden auf die neuen migriert', () => {
  const restored = withStorage(
    (store) => {
      const result = loadAiSettings();
      // Die Migration muss auch im Speicher ankommen, nicht nur im Ergebnis.
      const persisted = storedSettings(store);
      assert.equal(persisted.endpoint, SWISSCOM_ENDPOINT);
      assert.equal(persisted.model, SWISSCOM_MODEL);
      assert.equal(persisted.apiKey, 'geheim', 'der Key bleibt unangetastet');
      return result;
    },
    {
      providerId: 'openai',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiKey: 'geheim',
    },
  );
  assert.equal(restored.endpoint, SWISSCOM_ENDPOINT);
  assert.equal(restored.model, SWISSCOM_MODEL);
});

test('ein abschliessender Slash verhindert die Migration nicht', () => {
  const restored = withStorage(() => loadAiSettings(), {
    providerId: 'openai',
    endpoint: 'https://api.openai.com/v1/',
    model: 'gpt-4o',
  });
  assert.equal(restored.endpoint, SWISSCOM_ENDPOINT);
});

test('Endpoint und Modell werden unabhängig voneinander migriert', () => {
  const nurEndpoint = withStorage(() => loadAiSettings(), {
    providerId: 'openai',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  });
  assert.equal(nurEndpoint.endpoint, SWISSCOM_ENDPOINT);
  assert.equal(nurEndpoint.model, 'gpt-4o-mini', 'das eigene Modell bleibt');

  const nurModell = withStorage(() => loadAiSettings(), {
    providerId: 'openai',
    endpoint: 'https://gateway.intern.test/v1',
    model: 'gpt-4o',
  });
  assert.equal(nurModell.endpoint, 'https://gateway.intern.test/v1', 'der eigene Endpoint bleibt');
  assert.equal(nurModell.model, SWISSCOM_MODEL);
});

test('die Migration greift nur beim OpenAI-Anbieter', () => {
  const restored = withStorage(() => loadAiSettings(), {
    providerId: 'anthropic',
    endpoint: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
  });
  assert.equal(restored.endpoint, 'https://api.anthropic.com/v1');
  assert.equal(restored.model, 'claude-sonnet-4-20250514');

  // Selbst ein untergeschobener Altwert bleibt bei Anthropic stehen.
  const exotisch = withStorage(() => loadAiSettings(), {
    providerId: 'anthropic',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  });
  assert.equal(exotisch.endpoint, 'https://api.openai.com/v1');
  assert.equal(exotisch.model, 'gpt-4o');
});

test('ohne Migration wird nichts in den Speicher zurückgeschrieben', () => {
  withStorage(
    (store) => {
      loadAiSettings();
      const persisted = storedSettings(store);
      assert.equal(persisted.endpoint, 'https://gateway.intern.test/v1');
      assert.equal(persisted.model, 'gpt-4o-mini');
    },
    {
      providerId: 'openai',
      endpoint: 'https://gateway.intern.test/v1',
      model: 'gpt-4o-mini',
    },
  );
});

test('beim Proxy-Anbieter bleibt das leere Modell leer', () => {
  const restored = withStorage(() => loadAiSettings(), {
    providerId: 'proxy',
    endpoint: '',
    model: '',
  });
  assert.equal(restored.endpoint, 'http://127.0.0.1:8787/api/topo');
  assert.equal(restored.model, '', 'der Proxy kennt bewusst kein Standardmodell');
});

test('Vorlage und eigener Text überleben einen Neustart', () => {
  const store = new Map();
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  try {
    saveAiSettings({ promptTemplate: 'compact', customPrompt: 'Mein Prompt', apiKey: 'geheim' });
    const restored = loadAiSettings();
    assert.equal(restored.promptTemplate, 'compact');
    assert.equal(restored.customPrompt, 'Mein Prompt');
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});

await testAsync('OpenAI bekommt System-Nachricht, niedrige Temperatur und JSON-Modus', async () => {
  useOpenAi();
  const { calls, handler } = recorder();
  await withFetch(handler, () => photoToTopo(IMAGE, { hints: { canyonName: 'Boggera' } }));
  assert.equal(calls.length, 1);
  const body = calls[0].body;
  assert.equal(body.temperature, AI_TEMPERATURE);
  assert.ok(AI_TEMPERATURE <= 0.2, 'die Temperatur soll niedrig bleiben');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /Canyoning-Topo-Experte/);
  assert.equal(body.messages[1].role, 'user');
  assert.equal(body.messages[1].content[0].type, 'text');
  assert.match(body.messages[1].content[0].text, /Boggera/);
  assert.equal(body.messages[1].content[1].image_url.url, IMAGE);
});

await testAsync('die Auswahl "kompakt" verändert die gesendete Anweisung', async () => {
  useOpenAi({ promptTemplate: 'compact' });
  const { calls, handler } = recorder();
  await withFetch(handler, () => photoToTopo(IMAGE));
  const system = calls[0].body.messages[0].content;
  assert.match(system, /Du bist Canyoning-Topo-Experte/);
  assert.ok(system.length < buildOptimizedInstructions().length);
});

await testAsync('die Auswahl "bisheriger Prompt" sendet genau den alten Text', async () => {
  useOpenAi({ promptTemplate: 'legacy' });
  const { calls, handler } = recorder();
  await withFetch(handler, () => photoToTopo(IMAGE));
  const messages = calls[0].body.messages;
  assert.equal(messages.length, 1, 'ohne System-Nachricht');
  assert.equal(messages[0].content[0].text, buildPrompt({}, { template: 'legacy' }));
});

await testAsync('ein eigener Prompt geht unverändert raus', async () => {
  useOpenAi({ promptTemplate: 'custom', customPrompt: '  Bitte nur JSON.  ' });
  const { calls, handler } = recorder();
  await withFetch(handler, () => photoToTopo(IMAGE));
  const messages = calls[0].body.messages;
  assert.equal(messages.length, 1);
  assert.equal(messages[0].content[0].text, 'Bitte nur JSON.');
});

await testAsync('ein leerer eigener Prompt verhindert den Aufruf', async () => {
  useOpenAi({ promptTemplate: 'custom', customPrompt: '' });
  let called = false;
  await withFetch(
    () => {
      called = true;
      return openAiAnswer();
    },
    async () => {
      await assert.rejects(() => photoToTopo(IMAGE), /eigene Prompt ist leer/);
    },
  );
  assert.equal(called, false, 'es darf kein Leeraufruf abgesetzt werden');
});

await testAsync('ohne JSON-Modus wird einmal ohne response_format wiederholt', async () => {
  useOpenAi();
  const bodies = [];
  await withFetch(
    (url, init) => {
      bodies.push(JSON.parse(init.body));
      if (bodies.length === 1) {
        return jsonResponse({ error: { message: 'response_format is not supported' } }, 400);
      }
      return openAiAnswer();
    },
    () => photoToTopo(IMAGE),
  );
  assert.equal(bodies.length, 2);
  assert.ok(bodies[0].response_format, 'erster Versuch mit JSON-Modus');
  assert.equal(bodies[1].response_format, undefined, 'zweiter Versuch ohne JSON-Modus');
  assert.equal(bodies[1].temperature, AI_TEMPERATURE);
});

await testAsync('ein echter Fehler wird nicht als JSON-Modus-Problem missdeutet', async () => {
  useOpenAi();
  let calls = 0;
  await withFetch(
    () => {
      calls += 1;
      return jsonResponse({ error: { message: 'kein Zugriff auf dieses Modell' } }, 403);
    },
    async () => {
      await assert.rejects(() => photoToTopo(IMAGE), /403/);
    },
  );
  assert.equal(calls, 1);
});

await testAsync('Anthropic bekommt die Anweisung im system-Feld', async () => {
  saveAiSettings({
    providerId: 'anthropic',
    endpoint: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet',
    apiKey: 'test-key',
    promptTemplate: 'optimized',
    customPrompt: '',
  });
  const { calls, handler } = recorder();
  await withFetch(handler, () => photoToTopo('data:image/png;base64,AAAA'));
  const body = calls[0].body;
  assert.match(body.system, /Canyoning-Topo-Experte/);
  assert.equal(body.temperature, AI_TEMPERATURE);
  assert.equal(body.response_format, undefined, 'Anthropic kennt response_format nicht');
  assert.equal(body.messages[0].content[0].type, 'image');
  assert.equal(body.messages[0].content[1].type, 'text');
  assert.match(body.messages[0].content[1].text, /Erzeuge aus diesem Bild/);
});

await testAsync('Anthropic sendet beim eigenen Prompt kein system-Feld', async () => {
  saveAiSettings({ promptTemplate: 'custom', customPrompt: 'Nur JSON.' });
  const { calls, handler } = recorder();
  await withFetch(handler, () => photoToTopo('data:image/png;base64,AAAA'));
  assert.equal(calls[0].body.system, undefined);
  assert.equal(calls[0].body.messages[0].content[1].text, 'Nur JSON.');
});

await testAsync('der Proxy-Pfad bekommt Prompt, System und die Vorlagen-Id', async () => {
  saveAiSettings({
    providerId: 'proxy',
    endpoint: 'http://127.0.0.1:8787/api/topo',
    promptTemplate: 'optimized',
    customPrompt: '',
  });
  const { calls, handler } = recorder();
  await withFetch(handler, () => photoToTopo(IMAGE, { hints: { canyonName: 'Boggera' } }));
  const body = calls[0].body;
  assert.equal(body.promptTemplate, 'optimized');
  assert.match(body.system, /Canyoning-Topo-Experte/);
  assert.match(body.prompt, /Boggera/);
  assert.equal(body.image, IMAGE);
});

await testAsync('der Proxy-Pfad sendet beim eigenen Prompt kein System', async () => {
  saveAiSettings({ promptTemplate: 'custom', customPrompt: 'Nur JSON.' });
  const { calls, handler } = recorder();
  await withFetch(handler, () => photoToTopo(IMAGE));
  assert.equal(calls[0].body.system, undefined);
  assert.equal(calls[0].body.prompt, 'Nur JSON.');
  assert.equal(calls[0].body.promptTemplate, 'custom');
});

await testAsync('die Vorlage aus den Einstellungen gilt ohne Zutun des Aufrufers', async () => {
  useOpenAi({ promptTemplate: 'compact' });
  assert.equal(getAiSettings().promptTemplate, 'compact');
  assert.equal(buildPromptParts({}).template, 'compact');
  useOpenAi();
  assert.equal(buildPromptParts({}).template, 'optimized');
});

await testAsync('Denkmodelle bekommen chat_template_kwargs mit', async () => {
  useOpenAi();
  const { calls, handler } = recorder();
  await withFetch(handler, () => photoToTopo(IMAGE));
  assert.deepEqual(calls[0].body.chat_template_kwargs, { enable_thinking: false });
  assert.equal(calls[0].body.max_tokens, AI_MAX_TOKENS);
  assert.ok(AI_MAX_TOKENS >= 8000, 'das Budget muss für lange Topos reichen');
});

await testAsync('ein unbekanntes chat_template_kwargs führt zu einem Versuch ohne', async () => {
  useOpenAi();
  const bodies = [];
  await withFetch(
    (url, init) => {
      bodies.push(JSON.parse(init.body));
      if (bodies.length === 1) {
        return jsonResponse(
          { error: { message: 'Unrecognized request argument supplied: chat_template_kwargs' } },
          400,
        );
      }
      return openAiAnswer();
    },
    () => photoToTopo(IMAGE),
  );
  assert.equal(bodies.length, 2);
  assert.ok(bodies[0].chat_template_kwargs, 'erster Versuch mit Denkschalter');
  assert.equal(bodies[1].chat_template_kwargs, undefined, 'zweiter Versuch ohne');
  assert.ok(bodies[1].response_format, 'der JSON-Modus bleibt erhalten');
});

await testAsync('beide Fallbacks greifen nacheinander', async () => {
  useOpenAi();
  const bodies = [];
  await withFetch(
    (url, init) => {
      bodies.push(JSON.parse(init.body));
      if (bodies.length === 1) {
        return jsonResponse({ error: { message: 'unknown field chat_template_kwargs' } }, 400);
      }
      if (bodies.length === 2) {
        return jsonResponse({ error: { message: 'response_format is not supported' } }, 400);
      }
      return openAiAnswer();
    },
    () => photoToTopo(IMAGE),
  );
  assert.equal(bodies.length, 3);
  assert.equal(bodies[2].chat_template_kwargs, undefined);
  assert.equal(bodies[2].response_format, undefined);
  assert.equal(bodies[2].temperature, AI_TEMPERATURE);
});

await testAsync('ein echter Fehler löst keinen Denkschalter-Fallback aus', async () => {
  useOpenAi();
  let calls = 0;
  await withFetch(
    () => {
      calls += 1;
      return jsonResponse({ error: { message: 'Bild zu gross' } }, 400);
    },
    async () => {
      await assert.rejects(() => photoToTopo(IMAGE), /Bild zu gross/);
    },
  );
  assert.equal(calls, 1, 'ohne Hinweis auf einen Parameter wird nicht wiederholt');
});

await testAsync('ein leergedachter content wird klar gemeldet', async () => {
  useOpenAi();
  await withFetch(
    () =>
      jsonResponse({
        choices: [{ finish_reason: 'length', message: { content: '', reasoning: 'Hmm …' } }],
      }),
    async () => {
      await assert.rejects(() => photoToTopo(IMAGE), /Nachdenken verbraucht/);
    },
  );
});

await testAsync('ein leerer content ohne Denkspur meldet schlicht keinen Text', async () => {
  useOpenAi();
  await withFetch(
    () => jsonResponse({ choices: [{ finish_reason: 'stop', message: { content: '  ' } }] }),
    async () => {
      await assert.rejects(() => photoToTopo(IMAGE), /keinen Text/);
    },
  );
});

await testAsync('ein vorangestelltes leeres Objekt stört das Parsen nicht', async () => {
  useOpenAi();
  const topo = await withFetch(
    () => jsonResponse({ choices: [{ message: { content: `{}${ANSWER}` } }] }),
    () => photoToTopo(IMAGE),
  );
  assert.equal(topo.canyon_name, 'Test');
  assert.equal(topo.segments.length, 1);
});

test('von mehreren Objekten gewinnt das mit segments', () => {
  const parsed = extractJsonObject(`{"farbe":"blau"}\n${ANSWER}`);
  assert.equal(parsed.canyon_name, 'Test');
  assert.equal(parsed.segments.length, 1);
});

test('gibt es mehrere Topos, gewinnt das grössere', () => {
  const small = '{"segments":[{"type":"WALK"}]}';
  const big = '{"segments":[{"type":"WALK"},{"type":"RAPPEL","height":12}]}';
  assert.equal(extractJsonObject(`${small}${big}`).segments.length, 2);
  assert.equal(extractJsonObject(`${big}${small}`).segments.length, 2);
});

/* --------------------------------------- Neue Symboltypen im Prompt und Import */

const NEW_ELEMENT_TYPES = [
  'DEATH_HAZARD',
  'TREE_JAM',
  'BOULDER_JAM',
  'ROCKFALL',
  'UNDERCUT',
  'DANGEROUS_CURRENT',
  'SIPHON',
  'WATER_DIVERSION',
  'PATH',
  'ROAD',
  'BYPASS',
  'ENTRY_POINT',
  'EXIT_POINT',
];

test('die neuen Symboltypen sind in den aktiven Vorlagen erklärt', () => {
  const optimized = buildOptimizedInstructions();
  const compact = buildCompactInstructions();
  const catalog = optimized.split('ELEMENTTYPEN (nur diese Werte sind gültig):')[1]?.split('\nPunktelemente')[0];
  assert.ok(catalog, 'der dynamische Symbolkatalog fehlt');
  for (const type of NEW_ELEMENT_TYPES) {
    assert.ok(catalog.includes(`${type} (`), `${type} fehlt im dynamischen Symbolkatalog`);
    assert.ok(compact.includes(type), `${type} fehlt in der Kurzfassung`);
    assert.equal(
      new RegExp(`- ${type} \\([^)]+\\)[^\\n]*= Symbol "`).test(optimized),
      false,
      `${type} hat nur die Platzhalter-Erklärung`,
    );
  }
  for (const type of ['PATH', 'ROAD']) {
    assert.match(optimized, new RegExp(`${type}[^\\n]*Strecke: Start UND Ende`));
  }
});

test('die bisherige Vorlage bleibt trotz neuer Symbole eingefroren', () => {
  const legacy = buildPrompt({}, { template: 'legacy' });
  for (const type of NEW_ELEMENT_TYPES) {
    assert.equal(legacy.includes(type), false, `${type} ist in die alte Vorlage geraten`);
  }
  assert.ok(legacy.includes('ROPE_RAILING_LEFT'), 'die alte Vorlage wurde beschnitten');
});

test('gängige Fremdbezeichnungen landen auf den neuen Symbolen', () => {
  const topo = sanitizeTopoCandidate({
    canyon_name: 'Synonyme neu',
    segments: [
      {
        type: 'WALK',
        elements: [
          { type: 'skull' },
          { type: 'log jam' },
          { type: 'boulder choke' },
          { type: 'falling rocks' },
          { type: 'underwash' },
          { type: 'strong current' },
          { type: 'sump' },
          { type: 'water intake' },
          { type: 'detour' },
          { type: 'put in' },
          { type: 'take out' },
          {
            type: 'trail',
            horizontal_start_rel_to_segment_start: 1,
            horizontal_end_rel_to_segment_start: 8,
            vertical_end_rel_to_segment_start: 2,
          },
          {
            type: 'street',
            horizontal_start_rel_to_segment_start: 2,
            horizontal_end_rel_to_segment_start: 9,
            vertical_end_rel_to_segment_start: 3,
          },
        ],
      },
    ],
  });
  assert.deepEqual(
    topo.segments[0].elements.map((element) => element.type).sort(),
    [...NEW_ELEMENT_TYPES].sort(),
  );
  assert.deepEqual(validateTopo(topo), []);
  const svg = renderTopoSvg(topo, layoutTopo(topo));
  assert.ok(svg.startsWith('<svg'));
  assert.equal(/NaN|Infinity/.test(svg), false);
});

test('die optimierte und kompakte Vorlage kennen Rappel Guide und das RG-Mapping', () => {
  for (const prompt of [buildOptimizedInstructions(), buildCompactInstructions()]) {
    assert.ok(prompt.includes('RAPPEL_GUIDE'), 'RAPPEL_GUIDE fehlt im Prompt');
  }
  const optimized = buildOptimizedInstructions();
  assert.ok(optimized.includes('Rappel Guide'), 'deutsches Label fehlt im optimierten Prompt');
  const mapping = optimized.split('KODIERUNGS-MAPPING (Priorität!):')[1]?.split('\nAUSGABE:')[0];
  assert.ok(mapping, 'Kodierungs-Mapping fehlt');
  assert.match(
    mapping,
    /RG \(Rappel Guide\) → Elementtyp RAPPEL_GUIDE/,
    'RG-Mapping fehlt im Kodierungs-Mapping',
  );
});

test('RG, GUIDED_RAPPEL und GUIDE_LINE normalisieren alle zu RAPPEL_GUIDE', () => {
  const aliases = ['RG', 'RAPPEL_GUIDE', 'GUIDED_RAPPEL', 'GUIDE_LINE', 'GUIDELINE'];
  const report = [];
  const topo = sanitizeTopoCandidate(
    {
      segments: [
        {
          type: 'WALK',
          elements: aliases.map((alias) => ({
            type: alias,
            horizontal_start_rel_to_segment_start: 1,
            horizontal_end_rel_to_segment_start: 6,
            vertical_end_rel_to_segment_start: 1,
          })),
        },
      ],
    },
    report,
  );
  assert.deepEqual(
    topo.segments[0].elements.map((element) => element.type),
    aliases.map(() => 'RAPPEL_GUIDE'),
  );
  assert.deepEqual(report, []);
  for (const element of topo.segments[0].elements) {
    assert.ok(
      Number.isFinite(element.horizontal_end_rel_to_segment_start),
      'Endpunkt nach Normalisierung verloren',
    );
  }
});

test('der Legacy-Prompt bleibt frei von Rappel Guide (byte-identisch zur Fixture)', () => {
  const expected = readFileSync(new URL('./fixtures/legacy-prompt.txt', import.meta.url), 'utf8');
  const actual = buildPrompt(
    { canyonName: 'Boggera', notes: 'Skizze aus dem Führer' },
    { template: 'legacy' },
  );
  assert.equal(actual, expected);
  assert.equal(actual.includes('RAPPEL_GUIDE'), false, 'Legacy-Prompt erwähnt RAPPEL_GUIDE');
  assert.equal(actual.includes('Rappel Guide'), false, 'Legacy-Prompt erwähnt Rappel Guide');
});

console.log(`\n${passed} Test(s) bestanden.`);
