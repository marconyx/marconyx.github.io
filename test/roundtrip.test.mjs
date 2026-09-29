/**
 * Round-Trip- und Rendering-Tests ohne externe Abhängigkeiten:
 *   node test/roundtrip.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

import { ELEMENT_TYPES, RANGE_ELEMENT_TYPES, normalizeTopo, validateTopo } from '../src/model.js';
import { topoFromJson, topoToJsonObject } from '../src/io-json.js';
import { topoToXml, topoFromXml } from '../src/io-xml.js';
import { layoutTopo } from '../src/layout.js';
import { renderTopoSvg } from '../src/renderer.js';
import { SYMBOLS, symbolOptions } from '../src/symbols.js';

const here = dirname(fileURLToPath(import.meta.url));
const examplePath = join(here, '..', 'examples', 'my-canyon-inferiore.json');
const original = JSON.parse(readFileSync(examplePath, 'utf8'));
const infrastructure = {
  RADIO_MAST: 'Funkmast',
  LIFT_MAST: 'Liftmast',
  SQUARE_CONCRETE_BASE: 'Betonsockel eckig',
  STEEL_BEAM: 'Stahlträger',
};
const infrastructureTypes = Object.keys(infrastructure);

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

test('alle vier Infrastrukturtypen sind im Modell und mit deutschen Labels in der Palette', () => {
  assert.equal(ELEMENT_TYPES.length, 28);
  assert.deepEqual(new Set(Object.keys(SYMBOLS)), new Set(ELEMENT_TYPES));
  const group = symbolOptions().find((category) => category.id === 'infrastructure');
  for (const [type, name] of Object.entries(infrastructure)) {
    assert.ok(ELEMENT_TYPES.includes(type));
    assert.equal(SYMBOLS[type].category, 'infrastructure');
    assert.equal(group.symbols.find((symbol) => symbol.type === type)?.label, name);
    assert.equal(RANGE_ELEMENT_TYPES.has(type), false);
  }
});

test('neue Infrastrukturtypen bleiben mit Koordinaten, Größe und Text im JSON/XML erhalten', () => {
  const elements = infrastructureTypes.map((type, index) => ({
    type,
    horizontal_start_rel_to_segment_start: index * 4 + 2,
    vertical_start_rel_to_segment_start: index + 1,
    horizontal_end_rel_to_segment_start: null,
    vertical_end_rel_to_segment_start: null,
    size: 1.2,
    text: `Punkt ${index + 1}`,
  }));
  const input = { ...original, segments: [{ ...original.segments[0], elements }] };
  const topo = topoFromJson(input);
  assert.deepEqual(validateTopo(topo), []);
  assert.deepEqual(topoToJsonObject(topo).segments[0].elements, elements);
  assert.deepEqual(topoToJsonObject(topoFromJson(JSON.stringify(topoToJsonObject(topo)))), input);
  const xml = topoToXml(topo);
  for (const type of infrastructureTypes) assert.ok(xml.includes(`type="${type}"`));
  assert.deepEqual(topoToJsonObject(topoFromXml(xml)), input);
});

test('neue SVG-Silhouetten sind einzeln unterscheidbar und in Farbe sowie S/W lesbar', () => {
  const elements = infrastructureTypes.map((type, index) => ({
    type,
    horizontal_start_rel_to_segment_start: index * 5 + 2,
    vertical_start_rel_to_segment_start: 3,
    text: '',
  }));
  const topo = normalizeTopo({
    ...original,
    segments: [{ ...original.segments[0], elements }],
  });
  for (const mode of ['color', 'bw']) {
    const svg = renderTopoSvg(topo, layoutTopo(topo), { theme: mode, interactive: true });
    assert.ok(svg.startsWith('<svg') && svg.includes('</svg>'));
    const drawings = infrastructureTypes.map((type) => SYMBOLS[type].render({ text: '' }, mode));
    assert.equal((svg.match(/class="topo-element"/g) || []).length, 4);
    assert.equal(new Set(drawings).size, 4);
    for (const drawing of drawings) {
      assert.ok(svg.includes(drawing), `${mode}: Symbolzeichnung fehlt im SVG`);
      assert.match(drawing, /<path/);
      assert.match(drawing, /stroke="#111"/);
    }
    if (mode === 'bw') {
      assert.ok(!drawings.some((drawing) => /#c52b24|#768898|#52687a|#d7d4c9|#aab9c6/i.test(drawing)));
    } else {
      assert.ok(drawings.some((drawing) => drawing.includes('#c52b24')));
    }
  }
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

test('Beim Ziehen bleibt das Bild stehen und schrumpft nicht', () => {
  // Elementpositionen gehen in die Zeilengrenzen ein. Ohne Rahmen verschiebt
  // jede Mausbewegung das ganze Topo – es läuft dem Zeiger davon.
  const topo = normalizeTopo(original);
  const frame = layoutTopo(topo);
  // Was sich nicht bewegen darf: Zeilenversatz und linker Rand. Nur daran
  // hängt, ob gezeichnete Inhalte ihre Position behalten.
  const anchors = (l) => ({ minX: l.minX, offsets: l.rows.map((r) => r.offsetY) });
  const fixed = anchors(frame);

  const element = topo.segments[0].elements[0];
  for (const [across, along] of [[10, 5], [40, 5], [0, 140], [-25, 60]]) {
    element.vertical_start_rel_to_segment_start = across;
    element.horizontal_start_rel_to_segment_start = along;
    const dragged = layoutTopo(topo, { frame });
    assert.deepEqual(
      anchors(dragged),
      fixed,
      `Inhalt darf sich nicht verschieben (quer=${across}, entlang=${along})`,
    );
    // Wachsen ist erlaubt (sonst würde das Symbol am Blattrand abgeschnitten),
    // Schrumpfen nicht – das wäre wieder ein Sprung.
    assert.ok(dragged.width >= frame.width, 'Blatt darf nicht schmaler werden');
    assert.ok(dragged.height >= frame.height, 'Blatt darf nicht flacher werden');
  }

  // Gegenprobe: ohne Rahmen verschiebt sich der Inhalt wirklich – sonst
  // bestünde der Test auch dann, wenn es gar nichts einzufrieren gäbe.
  element.vertical_start_rel_to_segment_start = 40;
  element.horizontal_start_rel_to_segment_start = 5;
  assert.notDeepEqual(anchors(layoutTopo(topo)), fixed);
});

test('Ein Rahmen aus demselben Stand ändert nichts', () => {
  const topo = normalizeTopo(original);
  for (const mode of ['serpentine', 'linear']) {
    const plain = layoutTopo(topo, { layout: mode });
    const framed = layoutTopo(topo, { layout: mode, frame: plain });
    assert.deepEqual(
      JSON.parse(JSON.stringify(framed)),
      JSON.parse(JSON.stringify(plain)),
      `${mode}: Rahmen darf kein anderes Layout erzeugen`,
    );
  }
});

console.log(`\n${passed} Test(s) bestanden.`);
