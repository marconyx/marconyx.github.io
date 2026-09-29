/**
 * Round-Trip- und Rendering-Tests ohne externe Abhängigkeiten:
 *   node test/roundtrip.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

import { normalizeTopo, validateTopo } from '../src/model.js';
import { topoFromJson, topoToJsonObject } from '../src/io-json.js';
import { topoToXml, topoFromXml } from '../src/io-xml.js';
import { layoutTopo } from '../src/layout.js';
import { renderTopoSvg } from '../src/renderer.js';

const here = dirname(fileURLToPath(import.meta.url));
const examplePath = join(here, '..', 'examples', 'my-canyon-inferiore.json');
const original = JSON.parse(readFileSync(examplePath, 'utf8'));

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

console.log('Topo-Generator Tests');

test('JSON round-trip ist strukturell identisch', () => {
  const topo = topoFromJson(JSON.stringify(original));
  assert.deepEqual(topoToJsonObject(topo), original);
});

test('XML round-trip erhält alle Daten', () => {
  const topo = topoFromJson(JSON.stringify(original));
  const backFromXml = topoFromXml(topoToXml(topo));
  assert.deepEqual(topoToJsonObject(backFromXml), original);
});

test('unbekannte Felder überleben den Round-Trip', () => {
  const withExtra = {
    ...original,
    custom_root_field: 'keep-me',
    segments: [
      { ...original.segments[0], custom_segment_field: 42 },
      ...original.segments.slice(1),
    ],
  };
  const topo = normalizeTopo(withExtra);
  assert.equal(topoToJsonObject(topo).custom_root_field, 'keep-me');
  assert.equal(
    topoToJsonObject(topoFromXml(topoToXml(topo))).segments[0]
      .custom_segment_field,
    42,
  );
});

test('Validierung meldet keine Fehler für die Beispieldatei', () => {
  const issues = validateTopo(normalizeTopo(original));
  assert.equal(issues.filter((issue) => issue.level === 'error').length, 0);
});

test('Layout erzeugt Zeilen und Geometrie', () => {
  const layout = layoutTopo(normalizeTopo(original));
  assert.ok(layout.rows.length >= 2, 'mindestens zwei Zeilen erwartet');
  assert.equal(
    layout.placements.length,
    original.segments.length,
    'jedes Segment muss platziert sein',
  );
  assert.ok(layout.width > 0 && layout.height > 0);
});

test('Renderer liefert valides SVG mit Titel und Legende', () => {
  const topo = normalizeTopo(original);
  const svg = renderTopoSvg(topo, layoutTopo(topo));
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('</svg>'));
  assert.ok(svg.includes('My Canyon - Inferiore'));
  assert.ok(svg.includes('Legend'));
});

test('Abgestorbene Bäume überleben den JSON- und XML-Roundtrip', () => {
  const topo = normalizeTopo({
    ...original,
    segments: [
      {
        ...original.segments[0],
        elements: [
          { type: 'LEAF_TREE', dead: true, offsetX: 1, offsetY: 2 },
          { type: 'CONIFER_TREE', dead: true, offsetX: -1, offsetY: 3 },
          { type: 'LEAF_TREE', offsetX: 2, offsetY: 4 },
        ],
      },
    ],
  });

  const viaJson = topoFromJson(JSON.stringify(topoToJsonObject(topo)));
  assert.deepEqual(
    viaJson.segments[0].elements.map((el) => el.dead),
    [true, true, false],
  );

  const viaXml = topoFromXml(topoToXml(topo));
  assert.deepEqual(
    viaXml.segments[0].elements.map((el) => el.dead),
    [true, true, false],
  );
});

test('Der Zustand ist nur bei Bäumen zulässig', () => {
  const topo = normalizeTopo({
    ...original,
    segments: [
      {
        ...original.segments[0],
        elements: [{ type: 'STONE', dead: true, offsetX: 0, offsetY: 0 }],
      },
    ],
  });
  assert.equal(topo.segments[0].elements[0].dead, false);
  const json = topoToJsonObject(topo);
  assert.ok(!('dead' in json.segments[0].elements[0]));
});

test('Ohne tote Bäume bleibt der Export zum Canyon-Explore-Format identisch', () => {
  // Die Eigenschaft ist eine Erweiterung. Sie darf bestehende Dateien nicht
  // verändern, sonst wäre der Austausch mit Canyon-Explore gebrochen.
  const exported = topoToJsonObject(normalizeTopo(original));
  const stray = JSON.stringify(exported).includes('"dead"');
  assert.equal(stray, false, 'kein dead-Feld in einem Topo ohne tote Bäume');

  const xml = topoToXml(normalizeTopo(original));
  assert.equal(xml.includes('dead='), false, 'kein dead-Attribut im XML');
});

test('Tote Bäume werden anders gezeichnet als lebende', () => {
  const base = { ...original, segments: [{ ...original.segments[0], elements: [] }] };
  const svgOf = (elements) => {
    const topo = normalizeTopo({
      ...base,
      segments: [{ ...base.segments[0], elements }],
    });
    return renderTopoSvg(topo, layoutTopo(topo));
  };

  const alive = svgOf([{ type: 'LEAF_TREE', offsetX: 1, offsetY: 2 }]);
  const dead = svgOf([{ type: 'LEAF_TREE', dead: true, offsetX: 1, offsetY: 2 }]);
  assert.notEqual(alive, dead, 'das tote Symbol muss sich vom lebenden unterscheiden');

  const deadConifer = svgOf([{ type: 'CONIFER_TREE', dead: true, offsetX: 1, offsetY: 2 }]);
  assert.notEqual(dead, deadConifer, 'toter Laub- und Nadelbaum dürfen nicht gleich aussehen');
});

console.log(`\n${passed} Test(s) bestanden.`);
