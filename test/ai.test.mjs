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
  sanitizeTopoCandidate,
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
  assert.ok(prompt.includes('links der Laufrichtung'), 'Koordinatenregel fehlt');
});

console.log(`\n${passed} Test(s) bestanden.`);
