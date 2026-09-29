/**
 * Round-Trip- und Rendering-Tests ohne externe Abhängigkeiten:
 *   node test/roundtrip.test.mjs
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const xsdPath = join(here, '..', 'topo.xsd');
const exampleXmlPath = join(here, '..', 'examples', 'my-canyon-inferiore.xml');
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

test('Author und Dauer bleiben im App-Modell sowie JSON/XML erhalten', () => {
  const input = {
    ...original,
    author: 'Max & Team',
    duration: 'ca. 3-4 Stunden',
  };
  const topo = normalizeTopo(input);
  assert.equal(topo.author, input.author);
  assert.equal(topo.duration, input.duration);
  assert.deepEqual(topoToJsonObject(topoFromJson(topoToJsonObject(topo))), input);
  assert.deepEqual(topoToJsonObject(topoFromXml(topoToXml(topo))), input);
});

test('alte Dateien ohne Author und Dauer bleiben kompatibel', () => {
  const { author, duration, ...legacy } = original;
  const topo = topoFromJson(legacy);
  assert.equal(topo.author, '');
  assert.equal(topo.duration, '');
  assert.deepEqual(topoToJsonObject(topo), legacy);

  const legacyXml = topoToXml(topo);
  assert.equal(legacyXml.includes(' author='), false);
  assert.equal(legacyXml.includes(' duration='), false);
  assert.deepEqual(topoToJsonObject(topoFromXml(legacyXml)), legacy);
});

test('XSD validiert das XML mit den neuen Metadaten', () => {
  const resultWithMetadata = spawnSync(
    'xmllint',
    ['--noout', '--schema', xsdPath, exampleXmlPath],
    { encoding: 'utf8' },
  );
  if (resultWithMetadata.error?.code === 'ENOENT') {
    assert.match(readFileSync(xsdPath, 'utf8'), /name="author" type="xs:string"/);
    assert.match(readFileSync(xsdPath, 'utf8'), /name="duration" type="xs:string"/);
    return;
  }
  assert.equal(resultWithMetadata.status, 0, resultWithMetadata.stderr);

  const { author, duration, ...legacy } = original;
  const resultWithoutMetadata = spawnSync(
    'xmllint',
    ['--noout', '--schema', xsdPath, '-'],
    { encoding: 'utf8', input: topoToXml(normalizeTopo(legacy)) },
  );
  assert.equal(resultWithoutMetadata.status, 0, resultWithoutMetadata.stderr);
});

test('Topo-Metadaten und Abseillängen-Label stehen in der UI', () => {
  assert.match(
    html,
    /Name\s*<input[^>]+id="topo-name"[\s\S]*Author\s*<input[^>]+id="topo-author"[\s\S]*Dauer\s*<input[^>]+id="topo-duration"/,
  );
  assert.match(html, /Max\. Abseillänge \(m\)\s*<input[^>]+id="topo-max-walk"/);
  assert.equal(html.includes('Max. Walk-Länge'), false);
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

test('RAPPEL-Winkel bis 90 Grad behalten die bisherige Pfeilgeometrie', () => {
  for (const angle of [60, 90]) {
    const topo = normalizeTopo({
      segments: [{ type: 'RAPPEL', length_in_meters: 10, angle_in_degrees: angle }],
    });
    const placement = layoutTopo(topo).placements[0];
    const { arrow } = rappelGeometry(topo);
    assert.equal(arrow.x1, placement.start.x + placement.perp.x);
    assert.equal(arrow.y1, placement.start.y + placement.perp.y);
    assert.equal(arrow.x2, placement.end.x + placement.perp.x);
    assert.equal(arrow.y2, placement.end.y + placement.perp.y);
  }
});

test('RAPPEL-Überhänge zeichnen nur den Untergrund schräg, den Pfeil senkrecht', () => {
  for (const type of ['RAPPEL', 'RAPPEL_DRY', 'RAPPEL_WET']) {
    let arrowX;
    for (const angle of [100, 110, 135, 170]) {
      const topo = normalizeTopo({
        segments: [{ type, length_in_meters: 10, angle_in_degrees: angle }],
      });
      const { placement, groundEnd, arrow } = rappelGeometry(topo);
      assert.ok(placement.end.x < placement.start.x, `${type} ${angle}: Untergrund hängt über`);
      assert.equal(groundEnd.x, placement.end.x);
      assert.equal(groundEnd.y, placement.end.y);
      assert.equal(arrow.x1, arrow.x2, `${type} ${angle}: Pfeil muss exakt senkrecht sein`);
      assert.equal(arrow.x1, placement.start.x + 1);
      assert.equal(arrow.y1, placement.start.y);
      assert.equal(arrow.y2, placement.end.y);
      assert.ok(arrow.y2 > arrow.y1);
      if (arrowX !== undefined) assert.equal(arrow.x1, arrowX, 'Pfeilposition bleibt stabil');
      arrowX = arrow.x1;
      assert.equal(topoToJsonObject(topo).segments[0].angle_in_degrees, angle);
      assert.equal(topoFromXml(topoToXml(topo)).segments[0].angle_in_degrees, angle);
    }
  }
});

test('Andere überhängende Segmenttypen behalten ihre Geometrie', () => {
  const topo = normalizeTopo({
    segments: [{ type: 'JUMP', length_in_meters: 10, angle_in_degrees: 110 }],
  });
  const placement = layoutTopo(topo).placements[0];
  assert.ok(placement.end.x < placement.start.x);
  assert.ok(!renderTopoSvg(topo, layoutTopo(topo)).includes('marker-end="url(#topo-arrow)"'));
});

function rappelGeometry(topo) {
  const layout = layoutTopo(topo);
  const placement = layout.placements[0];
  const svg = renderTopoSvg(topo, layout);
  const ground = /<path d="M [^"]+?" fill="none" stroke=/.exec(svg);
  assert.ok(ground, 'Geländepfad fehlt');
  const endpoint = / L ([\d.eE+-]+) ([\d.eE+-]+)$/.exec(ground[0].split('"')[1]);
  assert.ok(endpoint, 'Geländeendpunkt fehlt');
  const line = /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"[^>]+marker-end="url\(#topo-arrow\)"/.exec(svg);
  assert.ok(line, 'Rappelpfeil fehlt');
  return {
    placement,
    groundEnd: { x: Number(endpoint[1]), y: Number(endpoint[2]) },
    arrow: { x1: Number(line[1]), y1: Number(line[2]), x2: Number(line[3]), y2: Number(line[4]) },
  };
}

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
