/**
 * Round-Trip- und Rendering-Tests ohne externe Abhängigkeiten:
 *   node test/roundtrip.test.mjs
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  ELEMENT_TYPES,
  DEPTH_SEGMENT_TYPES,
  SEGMENT_TYPES,
  RANGE_ELEMENT_TYPES,
  WALL_DISTANCE_SEGMENT_TYPES,
  normalizeTopo,
  validateTopo,
} from '../src/model.js';
import { topoFromJson, topoToJson, topoToJsonObject } from '../src/io-json.js';
import { topoToXml, topoFromXml } from '../src/io-xml.js';
import { layoutTopo } from '../src/layout.js';
import { renderTopoSvg, THEMES } from '../src/renderer.js';
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
  HELICOPTER: 'Helikopter',
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

test('alte WEIR-Dateien werden vor Normalisierung abgewiesen; andere unbekannte Typen bleiben erhalten', () => {
  for (const [file, parse] of [
    ['my-canyon-inferiore-legacy.json', topoFromJson],
    ['my-canyon-inferiore-legacy.xml', topoFromXml],
  ]) {
    const text = readFileSync(join(here, '..', 'examples', file), 'utf8');
    assert.throws(() => parse(text), /WEIR.*no longer supported/);
  }
  assert.throws(() => topoFromXml("<topo><segment type='WALK'/><segment type='WE&#x49;R'/></topo>"), /WEIR/);
  const raw = { segments: [{ type: 'FUTURE_TYPE', length_in_meters: 4, extraField: 'kept' }] };
  assert.equal(topoToJsonObject(topoFromJson(raw)).segments[0].extraField, 'kept');
  assert.equal(raw.segments[0].type, 'FUTURE_TYPE');
});

test('Nutzertext bleibt in SVG und JSON/XML unverändert und erzeugt kein Markup', () => {
  const text = `Ä😀 & <svg onload="globalThis.pwned=1"> ' "</text><script>attack()</script> stroke-width="10" #fff"`;
  const topo = normalizeTopo({
    canyon_name: text,
    author: text,
    duration: text,
    segments: [{ type: 'WALK', length_in_meters: 20, elements: [
      { type: 'CUSTOM_TEXT', text },
      { type: 'PATH', text, horizontal_end_rel_to_segment_start: 4, vertical_end_rel_to_segment_start: 0 },
    ] }],
  });
  const expected = topoToJsonObject(topo);
  assert.deepEqual(topoToJsonObject(topoFromJson(topoToJson(topo))), expected);
  const xml = topoToXml(topo);
  assert.ok(xml.includes('&lt;svg onload=&quot;globalThis.pwned=1&quot;&gt;'));
  assert.deepEqual(topoToJsonObject(topoFromXml(xml)), expected);
  for (const theme of Object.keys(THEMES)) {
    for (const interactive of [false, true]) {
      const svg = renderTopoSvg(topo, layoutTopo(topo), { theme, interactive });
      assert.doesNotMatch(svg, /<script|<svg onload=/i);
      assert.match(svg, /&lt;svg onload=&quot;globalThis\.pwned=1&quot;&gt;/);
      assert.match(svg, /stroke-width=&quot;10&quot; #fff&quot;/);
      assert.doesNotMatch(svg, /stroke-width=&quot;8\.2&quot;|#fbfbf8&quot;/);
    }
  }
});

test('XML-Attribute erhalten Leerraum und Unicode-Zeichenreferenzen', () => {
  const text = 'Zeile 1\nZeile 2\r\t😀 & "\'';
  const topo = normalizeTopo({ canyon_name: text, segments: [] });
  const xml = topoToXml(topo);
  assert.match(xml, /&#10;.*&#13;&#9;/);
  assert.equal(topoFromXml(xml).canyon_name, text);
  assert.equal(topoFromXml('<topo canyon_name="&#128512; &#x1F600;"/>').canyon_name, '😀 😀');
});

test('importierte Prototypnamen bleiben unbekannte Typen statt Symbolkatalog-Einträge', () => {
  for (const type of ['constructor', '__proto__', 'toString']) {
    const topo = topoFromJson(JSON.stringify({ segments: [{
      type, elements: [{ type, text: '<img src=x onerror=attack()>' }],
    }] }));
    for (const theme of Object.keys(THEMES)) {
      const svg = renderTopoSvg(topo, layoutTopo(topo), { theme, interactive: true });
      assert.ok(svg.includes(type));
      assert.doesNotMatch(svg, /<img/i);
    }
    assert.equal(topoToJsonObject(topo).segments[0].elements[0].type, type);
  }
});

test('importierte __proto__-Felder bleiben Daten und verändern keine Objekt-Prototypen', () => {
  const raw = JSON.parse('{"__proto__":{"polluted":"root"},"segments":[{"type":"WALK","__proto__":{"polluted":"segment"},"elements":[{"type":"STONE","__proto__":{"polluted":"element"}}]}]}');
  const topo = topoFromJson(raw);
  for (const imported of [topo, topo.segments[0], topo.segments[0].elements[0]]) {
    assert.equal(Object.getPrototypeOf(imported._extra), Object.prototype);
    assert.equal(Object.hasOwn(imported._extra, '__proto__'), true);
    assert.equal(imported.polluted, undefined);
  }
  const json = topoToJsonObject(topo);
  assert.equal(Object.getPrototypeOf(json), Object.prototype);
  assert.equal(Object.hasOwn(json, '__proto__'), true);
  assert.deepEqual(topoToJsonObject(topoFromJson(JSON.stringify(json))), json);
  assert.deepEqual(topoToJsonObject(topoFromXml(topoToXml(topo))), json);
  assert.equal({}.polluted, undefined);
});

function exitRegressionTopo(types) {
  return normalizeTopo({
    canyon_name: 'Exit regression',
    // Fixes Datum: sonst landet "heute" in der Legende und die Hashes kippen täglich.
    date: '2026-10-07',
    segments: [{
      type: 'WALK',
      length_in_meters: 10,
      elements: types.map((type) => ({
        type, position: 0.5, text: 'Weg & Ort', duration_to_walk_in_min: 12,
      })),
    }],
  });
}

test('Fluchtweg links und Standard bleiben bytegenau unverändert', () => {
  const baselines = {
    color: '250718ce6c51e1c6a4cd7b1a8d87d75371d64742b492deafa16a44c340d33a4f',
    alpiner_classic: '7d39c988e44a3165dd9674547759904de95b06b2800162a18ae02d8c3b71cab3',
    eau_froide: '4a79ec3a98bf12a0ccc1833bad63b67f9a59bf38db0c783bda545dc9e00efed4',
  };
  for (const [theme, baseline] of Object.entries(baselines)) {
    const topo = exitRegressionTopo(theme === 'eau_froide'
      ? ['ESCAPE_EXIT_LEFT', 'ESCAPE_EXIT_RIGHT'] : ['ESCAPE_EXIT_LEFT']);
    const renders = [false, true].map((interactive) =>
      renderTopoSvg(topo, layoutTopo(topo), { theme, interactive }));
    assert.equal(createHash('sha256').update(JSON.stringify(renders)).digest('hex'), baseline, theme);
  }
});

test('Fluchtweg rechts hat einen vollständigen Läufer links und getrennten Rechtspfeil', () => {
  assert.equal(THEMES.eau_froide.label, 'Standard');
  assert.match(html, /<option value="eau_froide" id="opt-theme-eau-froide">Standard<\/option>/);
  assert.ok(symbolOptions().some((group) =>
    group.symbols.some((symbol) => symbol.type === 'ESCAPE_EXIT_RIGHT')));
  const element = { text: 'Weg & Ort', duration_to_walk_in_min: 12 };
  const right = SYMBOLS.ESCAPE_EXIT_RIGHT.render(element);
  assert.doesNotMatch(right, /transform=|clip-path=/);
  assert.match(right, /<\/g>\s*<text[^>]+>Weg &amp; Ort<\/text>\s*<text[^>]+>12 min<\/text>$/);
  const head = /<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/.exec(right);
  assert.ok(head, 'echter geschlossener Kreis statt fast vollständigem Bogen');
  const [cx, cy, radius] = head.slice(1).map(Number);
  const paths = [...right.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(paths.length, 4, 'Rumpf, zwei Arme, zwei Beine, Pfeil');
  const points = (path) => [...path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)]
    .map((match) => match.slice(1).map(Number));
  const limbs = paths.slice(0, 3).map(points);
  assert.deepEqual(limbs.map((part) => part.length), [2, 6, 6]);
  assert.equal((paths[1].match(/M/g) || []).length, 2, 'zwei getrennte Armzüge');
  assert.equal((paths[2].match(/M/g) || []).length, 2, 'zwei getrennte Beinzüge');
  const halfStroke = 0.115 / 2;
  const runnerPoints = limbs.flat();
  const runnerLeft = Math.min(cx - radius, ...runnerPoints.map(([x]) => x - halfStroke));
  const runnerRight = Math.max(cx + radius, ...runnerPoints.map(([x]) => x + halfStroke));
  const runnerTop = Math.min(cy - radius, ...runnerPoints.map(([, y]) => y - halfStroke));
  const runnerBottom = Math.max(cy + radius, ...runnerPoints.map(([, y]) => y + halfStroke));
  assert.ok(runnerRight < 0, 'Person vollständig auf der linken Schildhälfte');
  assert.ok(runnerLeft > -1.3 + 0.1 && runnerTop > -1.05 + 0.1 &&
    runnerBottom < 0.15 - 0.08, 'inklusive runder Strichenden kein Clipping am Schild');
  const shoulderTop = Math.min(...limbs.slice(0, 2).flat().map(([, y]) => y)) - halfStroke;
  assert.ok(shoulderTop - (cy + radius) > 0.06, 'Kopf berührt keine Schulter/Arme');
  const arrowPoints = points(paths[3]);
  assert.ok(paths[3].endsWith('Z'), 'geschlossener Pfeil');
  const arrowLeft = Math.min(...arrowPoints.map(([x]) => x));
  const arrowRight = Math.max(...arrowPoints.map(([x]) => x));
  assert.ok(arrowLeft - runnerRight > 0.3, 'sichtbare Lücke zwischen Hand und Pfeil');
  assert.ok(arrowRight < 1.3 - 0.1, 'Pfeilspitze innerhalb des Schilds');
  assert.deepEqual(arrowPoints.filter(([x]) => x === arrowRight), [[1.15, -0.45]],
    'einzige Pfeilspitze zeigt nach rechts');
  assert.ok(arrowPoints.every(([, y]) => y > -1.05 && y < 0.15));
  const topo = exitRegressionTopo(['ESCAPE_EXIT_RIGHT']);
  const colors = { color: ['#0b7a45', '#fff'],
    alpiner_classic: ['#62766e', '#fbfbf8'], pencil_sketch: ['#535353', '#ffffff'] };
  for (const theme of Object.keys(THEMES).filter((key) => key !== 'eau_froide')) {
    for (const interactive of [false, true]) {
      const svg = renderTopoSvg(topo, layoutTopo(topo), { theme, interactive });
      for (const path of paths) assert.ok(svg.includes(`d="${path}"`), `${theme}: gleiche Geometrie`);
      assert.ok(svg.includes(`<circle cx="${cx}" cy="${cy}" r="${radius}"/>`));
      assert.ok(svg.includes(`rx="0.08" fill="${colors[theme][0]}"`));
      assert.ok(svg.includes(`<g fill="${colors[theme][1]}" stroke="none">`));
      assert.doesNotMatch(svg, /scale\(-1,1\)/);
      assert.match(svg, /<\/g>\s*<text[^>]+>Weg &amp; Ort<\/text>\s*<text[^>]+>12 min<\/text>/);
    }
  }
  for (const minutes of [undefined, 0]) {
    const withoutTime = SYMBOLS.ESCAPE_EXIT_RIGHT.render({ duration_to_walk_in_min: minutes });
    assert.ok(!withoutTime.includes('<text'));
    assert.ok(withoutTime.includes('<circle'));
  }
});

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

test('maximale Abseillänge bleibt als Metadatum im JSON- und XML-Roundtrip erhalten', () => {
  const input = { ...original, maximum_walk_length: 45 };
  const topo = normalizeTopo(input);
  assert.equal(topoToJsonObject(topo).maximum_walk_length, 45);
  assert.equal(topoToJsonObject(topoFromJson(topoToJson(topo))).maximum_walk_length, 45);
  assert.equal(
    topoToJsonObject(topoFromXml(topoToXml(topo))).maximum_walk_length,
    45,
  );
});

test('empfohlene Seillänge übersteht JSON und XML mit Sonderzeichen', () => {
  const rope = `2 x 40 m & <Reserve> "ä" '😀'\t\n`;
  const topo = normalizeTopo({ ...original, recommended_rope_length: rope });
  const xml = topoToXml(topo);
  assert.match(xml, /recommended_rope_length="2 x 40 m &amp; &lt;Reserve&gt; &quot;ä&quot;/);
  assert.equal(topoFromJson(topoToJson(topo)).recommended_rope_length, rope);
  assert.equal(topoFromXml(xml).recommended_rope_length, rope);
  assert.equal(topoFromXml(xml).maximum_walk_length, topo.maximum_walk_length);
  assert.match(readFileSync(xsdPath, 'utf8'), /name="recommended_rope_length" type="xs:string"/);
  const result = spawnSync('xmllint', ['--noout', '--schema', xsdPath, '-'], {
    encoding: 'utf8', input: xml,
  });
  if (result.error?.code !== 'ENOENT') assert.equal(result.status, 0, result.stderr);
  const old = normalizeTopo(original);
  assert.equal(old.recommended_rope_length, '');
  assert.equal(Object.hasOwn(topoToJsonObject(old), 'recommended_rope_length'), false);
  assert.doesNotMatch(topoToXml(old), / recommended_rope_length=/);
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

test('Verkürzungsschwelle bleibt im Modell sowie JSON und XML erhalten', () => {
  const topo = normalizeTopo({
    ...original,
    length_shortening_threshold_meters: 30,
  });
  const json = topoToJsonObject(topo);
  assert.equal(json.length_shortening_threshold_meters, 30);
  assert.equal(
    topoToJsonObject(topoFromJson(JSON.stringify(json)))
      .length_shortening_threshold_meters,
    30,
  );

  const xml = topoToXml(topo);
  assert.match(xml, /length_shortening_threshold_meters="30"/);
  assert.equal(
    topoToJsonObject(topoFromXml(xml)).length_shortening_threshold_meters,
    30,
  );
  assert.match(
    readFileSync(xsdPath, 'utf8'),
    /name="length_shortening_threshold_meters" type="xs:decimal"/,
  );

  for (const value of [null, 0, '']) {
    const disabled = topoToJsonObject(normalizeTopo({
      ...original,
      length_shortening_threshold_meters: value,
    }));
    assert.equal(
      Object.hasOwn(disabled, 'length_shortening_threshold_meters'),
      false,
      `deaktivierte Einstellung ${String(value)} bleibt exportseitig ausgelassen`,
    );
  }
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
    /Name<\/span>\s*<input[^>]+id="topo-name"[\s\S]*Author<\/span>\s*<input[^>]+id="topo-author"[\s\S]*Dauer<\/span>\s*<input[^>]+id="topo-duration"/,
  );
  assert.match(html, /Max\. Abseillänge \(m\)<\/span>\s*<input[^>]+id="topo-max-walk"/);
  assert.match(
    html,
    /Segmente verkürzen ab \(m\): <\/span><input type="number" id="topo-length-shortening-threshold" min="0"/,
  );
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

test('Infrastrukturtypen sind im Modell und mit deutschen Labels in der Palette', () => {
  assert.equal(ELEMENT_TYPES.length, 44);
  assert.deepEqual(new Set(Object.keys(SYMBOLS)), new Set(ELEMENT_TYPES));
  const group = symbolOptions().find((category) => category.id === 'infrastructure');
  for (const [type, name] of Object.entries(infrastructure)) {
    assert.ok(ELEMENT_TYPES.includes(type));
    assert.equal(SYMBOLS[type].category, 'infrastructure');
    assert.equal(group.symbols.find((symbol) => symbol.type === type)?.label, name);
    assert.equal(RANGE_ELEMENT_TYPES.has(type), false);
  }
});

test('Helikopter hat Rotoren, Kabine, Kufen und Beschriftung in allen Stilen', () => {
  const topo = normalizeTopo({
    segments: [{
      type: 'WALK', length_in_meters: 20, elements: [{
        type: 'HELICOPTER', size: 2, text: 'Heli & Team',
        horizontal_start_rel_to_segment_start: 10,
        vertical_start_rel_to_segment_start: 3,
      }],
    }],
  });
  for (const theme of Object.keys(THEMES)) {
    const svg = renderTopoSvg(topo, layoutTopo(topo), { theme, interactive: true });
    assert.match(svg, /class="topo-element" data-seg="0" data-el="0"/);
    assert.ok(svg.includes('M-1.45,-1.3 L1.65,-1.3'), `${theme}: Hauptrotor`);
    assert.match(svg, /<circle cx="-2.05" cy="-0.65" r="0.3"/, `${theme}: Heckrotor`);
    assert.ok(svg.includes('M0.2,-0.7'), `${theme}: Cockpit`);
    assert.ok(svg.includes('M-0.45,0.15 L-0.6,0.45'), `${theme}: Kufen`);
    assert.ok(svg.includes('Heli &amp; Team'), `${theme}: Text`);
    assert.ok(svg.includes('scale(2)'), `${theme}: Größe`);
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

test('neue SVG-Silhouetten sind einzeln unterscheidbar und in Farbe lesbar', () => {
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
  for (const mode of ['color']) {
    const svg = renderTopoSvg(topo, layoutTopo(topo), { theme: mode, interactive: true });
    assert.ok(svg.startsWith('<svg') && svg.includes('</svg>'));
    const drawings = infrastructureTypes.map((type) => SYMBOLS[type].render({ text: '' }, mode));
    assert.equal((svg.match(/class="topo-element"/g) || []).length, infrastructureTypes.length);
    assert.equal(new Set(drawings).size, infrastructureTypes.length);
    for (const drawing of drawings) {
      assert.ok(svg.includes(drawing), `${mode}: Symbolzeichnung fehlt im SVG`);
      assert.match(drawing, /<path/);
      assert.match(drawing, /stroke="#111"/);
    }
    assert.ok(drawings.some((drawing) => drawing.includes('#c52b24')));
  }
});

test('Busch steht unter Natur und überlebt JSON/XML in allen Darstellungsstilen', () => {
  assert.ok(ELEMENT_TYPES.includes('BUSH'));
  assert.ok(symbolOptions().find((group) => group.id === 'nature').symbols.some((symbol) => symbol.type === 'BUSH'));
  const topo = normalizeTopo({
    segments: [{ type: 'WALK', length_in_meters: 20, elements: [{
      type: 'BUSH', horizontal_start_rel_to_segment_start: 7,
      vertical_start_rel_to_segment_start: 2, size: 1.5, text: 'Busch & Stein',
    }] }],
  });
  const expected = topo.segments[0].elements[0];
  assert.deepEqual(topoFromJson(topoToJson(topo)).segments[0].elements[0], expected);
  const xml = topoToXml(topo);
  assert.deepEqual(topoFromXml(xml).segments[0].elements[0], expected);
  const validation = spawnSync('xmllint', ['--noout', '--schema', xsdPath, '-'], {
    input: xml, encoding: 'utf8',
  });
  if (!validation.error) assert.equal(validation.status, 0, validation.stderr);
  for (const theme of Object.keys(THEMES)) {
    const svg = renderTopoSvg(topo, layoutTopo(topo), { theme, interactive: true });
    assert.ok(svg.includes('M-1.25,0 C-1.55,-0.25'), `${theme}: Busch fehlt`);
    assert.ok(svg.includes('Busch &amp; Stein'), `${theme}: Beschriftung fehlt`);
    assert.match(svg, /class="topo-element" data-seg="0" data-el="0"/);
  }
  assert.notEqual(SYMBOLS.BUSH.render({ text: '' }), SYMBOLS.LEAF_TREE.render({ text: '' }));
});

test('Busch ist in farbigen Stilen grün und in monochromen Stilen neutral', () => {
  const topo = normalizeTopo({
    segments: [{ type: 'WALK', length_in_meters: 20, elements: [{ type: 'BUSH' }] }],
  });
  const expected = {
    color: ['#2a9d48', '#14532d'],
    alpiner_classic: ['#377b4d', '#214f32'],
    eau_froide: ['#00ff00', '#004d00'],
  };
  for (const [theme, [fill, stroke]] of Object.entries(expected)) {
    const svg = renderTopoSvg(topo, layoutTopo(topo), { theme });
    const path = /<path d="M-1\.25,0 C-1\.55,-0\.25[^>]*>/.exec(svg)?.[0];
    assert.ok(path, `${theme}: Busch fehlt`);
    assert.ok(path.includes(`fill="${fill}"`), `${theme}: Füllfarbe`);
    assert.ok(path.includes(`stroke="${stroke}"`), `${theme}: Kontur`);
  }
  const sketch = renderTopoSvg(topo, layoutTopo(topo), { theme: 'pencil_sketch' });
  const path = /<path d="M-1\.25,0 C-1\.55,-0\.25[^>]*>/.exec(sketch)?.[0];
  assert.ok(path);
  for (const [, color] of path.matchAll(/(?:fill|stroke)="#([0-9a-f]{6})"/g)) {
    assert.equal(color.slice(0, 2), color.slice(2, 4));
    assert.equal(color.slice(2, 4), color.slice(4, 6));
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

/* --------------------------------------------------- Wanddistanz (Überhang) */

function rappelTopo(overrides = {}, type = 'RAPPEL') {
  return normalizeTopo({
    canyon_name: 'Wand',
    segments: [
      { type, length_in_meters: 20, angle_in_degrees: 90, ...overrides },
    ],
  });
}

test('Wanddistanz gibt es nur bei den drei Abseiltypen', () => {
  assert.deepEqual([...WALL_DISTANCE_SEGMENT_TYPES].sort(), [
    'RAPPEL',
    'RAPPEL_DRY',
    'RAPPEL_WET',
  ]);
  for (const type of ['RAPPEL', 'RAPPEL_DRY', 'RAPPEL_WET']) {
    const segment = rappelTopo({ wall_distance_in_meters: 4 }, type).segments[0];
    assert.equal(segment.wall_distance_in_meters, 4);
  }
  for (const type of ['WALK', 'JUMP', 'POOL', 'SLIDE', 'CLIMB']) {
    const segment = rappelTopo({ wall_distance_in_meters: 4 }, type).segments[0];
    assert.equal(segment.wall_distance_in_meters, 0, type);
  }
});

test('Wanddistanz wird nie negativ und versteht Zahlen als Text', () => {
  assert.equal(rappelTopo({ wall_distance_in_meters: -3 }).segments[0].wall_distance_in_meters, 0);
  assert.equal(rappelTopo({ wall_distance_in_meters: '2.5' }).segments[0].wall_distance_in_meters, 2.5);
  assert.equal(rappelTopo({ wall_distance_in_meters: 'x' }).segments[0].wall_distance_in_meters, 0);
  assert.equal(rappelTopo().segments[0].wall_distance_in_meters, 0);
});

test('Ohne Wanddistanz bleibt alles exakt wie bisher', () => {
  const topo = rappelTopo();
  assert.equal(layoutTopo(topo).placements[0].wallBulge, null);
  const json = topoToJsonObject(topo);
  assert.equal('wall_distance_in_meters' in json.segments[0], false);
  assert.equal(topoToXml(topo).includes('wall_distance_in_meters'), false);
  // Die Beispieldatei kennt das Feld nicht – sie muss byte-gleich bleiben.
  assert.deepEqual(topoToJsonObject(normalizeTopo(original)), original);
});

test('Die Wandkurve weicht genau um die Wanddistanz zurück', () => {
  for (const distance of [1, 4, 12.5]) {
    const topo = rappelTopo({ wall_distance_in_meters: distance });
    const placement = layoutTopo(topo).placements[0];
    const { start, end, wallBulge } = placement;
    // Senkrechtes Abseilen: die Wand weicht waagrecht nach hinten aus.
    assert.equal(wallBulge.distance, distance);
    assert.ok(Math.abs(wallBulge.apex.x - (start.x - distance)) < 1e-9, `Scheitel bei ${distance}`);
    assert.ok(Math.abs(wallBulge.apex.y - (start.y + end.y) / 2) < 1e-9);
    // Ober- und Unterpunkt bleiben auf der Seillinie, es wird nichts versetzt.
    assert.ok(Math.abs(start.x) < 1e-9);
    assert.ok(Math.abs(end.x) < 1e-9);
    assert.ok(Math.abs(end.y - start.y - 20) < 1e-9);
  }
});

test('Die Wand wird gerundet gezeichnet und der Pfeil bleibt senkrecht', () => {
  for (const type of ['RAPPEL', 'RAPPEL_DRY', 'RAPPEL_WET']) {
    for (const theme of ['color']) {
      const topo = rappelTopo({ wall_distance_in_meters: 6 }, type);
      const layout = layoutTopo(topo);
      const svg = renderTopoSvg(topo, layout, { theme });
      const { control, apex } = layout.placements[0].wallBulge;
      assert.ok(
        svg.includes(`Q ${control.x} ${control.y} `),
        `${type}/${theme}: gerundete Wand fehlt`,
      );
      assert.ok(Math.abs(apex.x + 6) < 1e-9, `${type}/${theme}: falscher Scheitel`);
      const arrow = /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"[^>]+marker-end="url\(#topo-arrow\)"/.exec(svg);
      assert.ok(arrow, `${type}/${theme}: Pfeil fehlt`);
      assert.ok(
        Math.abs(Number(arrow[1]) - Number(arrow[3])) < 1e-9,
        `${type}/${theme}: Pfeil steht nicht senkrecht`,
      );
    }
  }
});

test('Auch beim Überhang (Winkel > 90) bleibt der Pfeil senkrecht', () => {
  const topo = rappelTopo({ wall_distance_in_meters: 5, angle_in_degrees: 110 });
  const layout = layoutTopo(topo);
  const svg = renderTopoSvg(topo, layout);
  const arrow = /<line x1="([^"]+)" y1="[^"]+" x2="([^"]+)"[^>]+marker-end="url\(#topo-arrow\)"/.exec(svg);
  assert.ok(arrow, 'Rappelpfeil fehlt');
  assert.equal(arrow[1], arrow[2]);
  assert.equal(layout.placements[0].wallBulge.distance, 5);
  // Der Überhang läuft nach links, die Wand weicht zusätzlich zurück.
  assert.ok(layout.placements[0].wallBulge.apex.x < layout.placements[0].end.x);
});

test('Die Wandkurve wird vom Blatt nicht abgeschnitten', () => {
  const distance = 9;
  const topo = rappelTopo({ wall_distance_in_meters: distance });
  const layout = layoutTopo(topo);
  assert.ok(layout.minX <= layout.placements[0].wallBulge.apex.x);
  const svg = renderTopoSvg(topo, layout);
  const viewBox = /viewBox="([^"]+)"/.exec(svg)[1].split(' ').map(Number);
  assert.ok(viewBox[0] <= layout.placements[0].wallBulge.apex.x);
  // Ohne Wand wäre das Blatt schmaler – die Kurve verbreitert es.
  const plain = layoutTopo(rappelTopo());
  assert.ok(layout.minX < plain.minX);
});

test('Wanddistanz überlebt JSON, XML und XSD', () => {
  const topo = rappelTopo({ wall_distance_in_meters: 7.5 });
  const json = topoToJsonObject(topo);
  assert.equal(json.segments[0].wall_distance_in_meters, 7.5);
  assert.equal(topoFromJson(JSON.stringify(json)).segments[0].wall_distance_in_meters, 7.5);
  const xml = topoToXml(topo);
  assert.ok(xml.includes('wall_distance_in_meters="7.5"'));
  assert.equal(topoFromXml(xml).segments[0].wall_distance_in_meters, 7.5);
  assert.ok(readFileSync(xsdPath, 'utf8').includes('name="wall_distance_in_meters"'));
});

test('die Gehzeit am Fluchtweg überlebt JSON, XML und XSD', () => {
  const topo = normalizeTopo({
    canyon_name: 'Fluchtweg',
    segments: [
      {
        type: 'WALK',
        length_in_meters: 30,
        elements: [
          {
            type: 'ESCAPE_EXIT_LEFT',
            horizontal_start_rel_to_segment_start: 5,
            duration_to_walk_in_min: 25,
          },
          // Fremder Typ: das Feld darf nicht durchrutschen.
          { type: 'STONE', duration_to_walk_in_min: 9 },
        ],
      },
    ],
  });
  assert.equal(topo.segments[0].elements[0].duration_to_walk_in_min, 25);
  assert.equal(topo.segments[0].elements[1].duration_to_walk_in_min, null);

  const json = topoToJsonObject(topo);
  assert.equal(json.segments[0].elements[0].duration_to_walk_in_min, 25);
  assert.equal(
    Object.hasOwn(json.segments[0].elements[1], 'duration_to_walk_in_min'),
    false,
    'ohne Wert bleibt die Datei byte-identisch zu vorher',
  );
  assert.equal(
    topoFromJson(JSON.stringify(json)).segments[0].elements[0]
      .duration_to_walk_in_min,
    25,
  );

  const xml = topoToXml(topo);
  assert.ok(xml.includes('duration_to_walk_in_min="25"'));
  assert.equal(
    topoFromXml(xml).segments[0].elements[0].duration_to_walk_in_min,
    25,
  );

  const xsd = readFileSync(xsdPath, 'utf8');
  assert.match(xsd, /name="duration_to_walk_in_min" type="xs:decimal"/);
  const result = spawnSync('xmllint', ['--noout', '--schema', xsdPath, '-'], {
    encoding: 'utf8',
    input: xml,
  });
  if (result.error?.code !== 'ENOENT') {
    assert.equal(result.status, 0, result.stderr);
  }
});

test('die Gehzeit steht als Beschriftung am Fluchtweg-Schild', () => {
  const topo = normalizeTopo({
    canyon_name: 'Fluchtweg',
    segments: [
      {
        type: 'WALK',
        length_in_meters: 30,
        elements: [
          {
            type: 'ESCAPE_EXIT_RIGHT',
            horizontal_start_rel_to_segment_start: 5,
            duration_to_walk_in_min: 40,
          },
        ],
      },
    ],
  });
  const svg = renderTopoSvg(topo, layoutTopo(topo));
  assert.match(svg, />40 min</);

  topo.segments[0].elements[0].duration_to_walk_in_min = null;
  const plain = renderTopoSvg(topo, layoutTopo(topo));
  assert.equal(/ min</.test(plain), false, 'ohne Wert keine Beschriftung');
});

/* ------------------------------------------ Neue Topo-Symbole (Referenzsatz) */

const NEW_HAZARDS = [
  'DEATH_HAZARD',
  'TREE_JAM',
  'BOULDER_JAM',
  'ROCKFALL',
  'UNDERCUT',
  'DANGEROUS_CURRENT',
  'SIPHON',
];
const NEW_INFRASTRUCTURE = ['WATER_DIVERSION', 'PATH', 'ROAD'];
const NEW_ANNOTATION = ['BYPASS', 'ENTRY_POINT', 'EXIT_POINT'];
const NEW_TYPES = [...NEW_HAZARDS, ...NEW_INFRASTRUCTURE, ...NEW_ANNOTATION];
const NEW_POINT_TYPES = NEW_TYPES.filter((type) => !RANGE_ELEMENT_TYPES.has(type));

test('die neuen Symbole stehen im Modell und mit Kategorie in der Palette', () => {
  const expected = {
    ...Object.fromEntries(NEW_HAZARDS.map((type) => [type, 'hazards'])),
    ...Object.fromEntries(NEW_INFRASTRUCTURE.map((type) => [type, 'infrastructure'])),
    ...Object.fromEntries(NEW_ANNOTATION.map((type) => [type, 'annotation'])),
  };
  const palette = symbolOptions();
  for (const [type, category] of Object.entries(expected)) {
    assert.ok(ELEMENT_TYPES.includes(type), `${type} fehlt im Modell`);
    assert.equal(SYMBOLS[type].category, category, `${type} in falscher Kategorie`);
    const group = palette.find((entry) => entry.id === category);
    const entry = group.symbols.find((symbol) => symbol.type === type);
    assert.ok(entry, `${type} fehlt in der Palette`);
    assert.ok(entry.label && entry.label !== type, `${type} ohne deutsches Label`);
    assert.equal(entry.range, RANGE_ELEMENT_TYPES.has(type));
  }
  assert.deepEqual(
    NEW_TYPES.filter((type) => RANGE_ELEMENT_TYPES.has(type)),
    ['PATH', 'ROAD'],
  );
});

test('jedes neue Punktsymbol zeichnet eigenständig', () => {
  for (const mode of ['color']) {
    const drawings = NEW_POINT_TYPES.map((type) => SYMBOLS[type].render({ text: '' }, mode));
    assert.equal(new Set(drawings).size, NEW_POINT_TYPES.length, `${mode}: Symbole doppelt`);
    for (const [index, drawing] of drawings.entries()) {
      const type = NEW_POINT_TYPES[index];
      assert.match(drawing, /<path|<circle|<line|<rect/, `${type} zeichnet nichts`);
      assert.equal(/NaN|Infinity|undefined|null/.test(drawing), false, `${type}: ungültiger Wert`);
    }
  }
});

test('die neuen Symbole tragen optionale Beschriftungen', () => {
  for (const type of NEW_POINT_TYPES) {
    const drawing = SYMBOLS[type].render({ text: 'Hinweis' }, 'color');
    assert.ok(drawing.includes('Hinweis'), `${type} zeigt den Text nicht`);
    assert.equal(
      SYMBOLS[type].render({ text: '' }, 'color').includes('Hinweis'),
      false,
    );
  }
  for (const type of ['PATH', 'ROAD']) {
    const a = { x: 0, y: 0 };
    const b = { x: 6, y: 2 };
    const withText = SYMBOLS[type].render(a, b, { size: 1, element: { text: 'Alpweg' } });
    assert.ok(withText.includes('Alpweg'), `${type} zeigt den Text nicht`);
    const plain = SYMBOLS[type].render(a, b, { size: 1, element: { text: '' } });
    assert.equal(plain.includes('<text'), false, `${type} beschriftet ohne Text`);
    // Entartete Strecke (Start = Ende) darf keine Division durch 0 erzeugen.
    const degenerate = SYMBOLS[type].render(a, a, { size: 1, element: { text: '' } });
    assert.equal(/NaN|Infinity/.test(degenerate), false, `${type}: NaN bei Nulllänge`);
  }
});

test('die neuen Symbole überleben JSON- und XML-Roundtrip und rendern im SVG', () => {
  const elements = NEW_TYPES.map((type, index) => ({
    type,
    horizontal_start_rel_to_segment_start: index * 2 + 1,
    vertical_start_rel_to_segment_start: (index % 5) - 2,
    horizontal_end_rel_to_segment_start: RANGE_ELEMENT_TYPES.has(type) ? index * 2 + 6 : null,
    vertical_end_rel_to_segment_start: RANGE_ELEMENT_TYPES.has(type) ? 3 : null,
    size: 1.1,
    text: `Hinweis ${index + 1}`,
  }));
  const input = {
    ...original,
    segments: [{ ...original.segments[0], type: 'WALK', length_in_meters: 60, elements }],
  };
  const topo = topoFromJson(input);
  assert.deepEqual(validateTopo(topo), []);
  assert.deepEqual(topoToJsonObject(topo).segments[0].elements, elements);
  const xml = topoToXml(topo);
  for (const type of NEW_TYPES) assert.ok(xml.includes(`type="${type}"`), `${type} fehlt im XML`);
  assert.deepEqual(topoToJsonObject(topoFromXml(xml)), input);

  for (const mode of ['color', 'alpiner_classic', 'eau_froide', 'pencil_sketch']) {
    const svg = renderTopoSvg(topo, layoutTopo(topo), { theme: mode, interactive: true });
    assert.equal(
      (svg.match(/class="topo-element"/g) || []).length,
      NEW_TYPES.length,
      `${mode}: nicht alle Symbole gerendert`,
    );
    assert.equal(/NaN|Infinity/.test(svg), false, `${mode}: ungültige Koordinaten`);
    assert.equal(svg.includes('>?</text>'), false, `${mode}: unbekannter Typ gezeichnet`);
  }
});

test('Alpin klassisch ist ein eigenständiger, vollständiger Renderstil', () => {
  assert.equal(THEMES.alpiner_classic.label, 'Alpin klassisch');
  assert.match(html, /<option value="alpiner_classic" id="opt-theme-alpiner-classic">Alpin klassisch<\/option>/);

  const elements = ELEMENT_TYPES.map((type, index) => ({
    type,
    horizontal_start_rel_to_segment_start: index * 0.4 + 1,
    vertical_start_rel_to_segment_start: 0,
    horizontal_end_rel_to_segment_start: RANGE_ELEMENT_TYPES.has(type)
      ? index * 0.4 + 4
      : null,
    vertical_end_rel_to_segment_start: RANGE_ELEMENT_TYPES.has(type) ? 1 : null,
    size: 1,
    text: type === 'CUSTOM_TEXT' ? 'Alpiner Einstieg' : '1',
  }));
  const input = {
    ...original,
    segments: [{
      ...original.segments[0],
      type: 'WALK',
      length_in_meters: 70,
      elements,
    }, {
      ...original.segments[0],
      type: 'POOL',
      length_in_meters: 8,
      elements: [],
    }],
  };
  const topo = topoFromJson(input);
  const layout = layoutTopo(topo);
  const classic = renderTopoSvg(topo, layout, {
    theme: 'alpiner_classic',
    interactive: true,
  });

  assert.equal((classic.match(/class="topo-element"/g) || []).length, ELEMENT_TYPES.length);
  assert.ok(classic.includes('stop-color="#cbd5d8"'), 'alpiner Terrainfarbton fehlt');
  assert.ok(classic.includes('fill="#5e8799"'), 'Wasserfarbe fehlt');
  assert.equal(
    (classic.match(/fill="#5e8799" stroke="#303a3e" stroke-width="0.1"/g) || []).length,
    1,
    'Gumpe wird nicht mit dem klassischen Wasserstil gezeichnet',
  );
  assert.ok(classic.includes('>RG 1<'), 'Rappel Guide fehlt');
  assert.ok(classic.includes('font-style="italic"'), 'Freitext ist nicht kursiv');
  assert.ok(!classic.includes('#1b3fb5'), 'gesättigtes Symbolblau wurde nicht angepasst');
  assert.equal(/NaN|Infinity/.test(classic), false);

  // Entfernte und unbekannte Stile verwenden den unveränderten Farbstandard.
  assert.equal(renderTopoSvg(topo, layout), renderTopoSvg(topo, layout, { theme: 'color' }));
  assert.equal(renderTopoSvg(topo, layout, { theme: 'bw' }), renderTopoSvg(topo, layout, { theme: 'color' }));
});

test('Stil Standard (eau_froide): Palette, eigene Symbole und Regression der anderen Stile', () => {
  assert.equal(THEMES.eau_froide.label, 'Standard');
  assert.match(html, /<option value="eau_froide" id="opt-theme-eau-froide">Standard<\/option>/);

  const elements = ELEMENT_TYPES.map((type, index) => ({
    type,
    horizontal_start_rel_to_segment_start: index * 0.4 + 1,
    vertical_start_rel_to_segment_start: 0,
    horizontal_end_rel_to_segment_start: RANGE_ELEMENT_TYPES.has(type) ? index * 0.4 + 4 : null,
    vertical_end_rel_to_segment_start: RANGE_ELEMENT_TYPES.has(type) ? 1 : null,
    size: 1,
    text: type === 'CUSTOM_TEXT' ? 'Eau Froide' : '1',
  }));
  const topo = topoFromJson({
    ...original,
    segments: [
      { ...original.segments[0], type: 'WALK', length_in_meters: 70, elements },
      { ...original.segments[0], type: 'RAPPEL', length_in_meters: 20, elements: [] },
      { ...original.segments[0], type: 'POOL', length_in_meters: 8, elements: [] },
    ],
  });
  const layout = layoutTopo(topo);
  const ef = renderTopoSvg(topo, layout, { theme: 'eau_froide', interactive: true });

  assert.equal((ef.match(/class="topo-element"/g) || []).length, ELEMENT_TYPES.length);
  for (const marker of [
    'stop-color="#d9dde0"', 'id="topo-marble"', 'url(#topo-marble)', 'class="topo-title-shadow"',
    'class="topo-cascade"', '#00ffff', '#00ff00', '#ff0000', '#993300', '#800000',
  ]) {
    assert.ok(ef.includes(marker), `Marker fehlt: ${marker}`);
  }
  assert.equal(/NaN|Infinity/.test(ef), false);
  assert.equal(ef.includes('>?</text>'), false);
  assert.equal(ef, renderTopoSvg(topo, layout, { theme: 'eau_froide', interactive: true }), 'nicht deterministisch');

  assert.equal(renderTopoSvg(topo, layout), renderTopoSvg(topo, layout, { theme: 'color' }));
  for (const theme of ['color', 'alpiner_classic']) {
    const other = renderTopoSvg(topo, layout, { theme });
    assert.ok(!other.includes('topo-marble') && !other.includes('topo-title-shadow'), `${theme} enthält Eau-Froide-Marker`);
  }
});

test('Eau Froide rendert alle Layouts und Papierformate mit allen Elementen', () => {
  const elements = ELEMENT_TYPES.map((type, index) => ({
    type,
    horizontal_start_rel_to_segment_start: index * 0.4 + 1,
    vertical_start_rel_to_segment_start: 0,
    horizontal_end_rel_to_segment_start: RANGE_ELEMENT_TYPES.has(type) ? index * 0.4 + 4 : null,
    vertical_end_rel_to_segment_start: RANGE_ELEMENT_TYPES.has(type) ? 1 : null,
    size: 1,
    text: '1',
  }));
  const topo = topoFromJson({
    ...original,
    segments: [{ ...original.segments[0], type: 'WALK', length_in_meters: 80, elements }],
  });
  for (const layout of ['serpentine', 'cascaded', 'linear']) {
    for (const paper of ['screen', 'a4_landscape', 'a4_portrait']) {
      const svg = renderTopoSvg(topo, layoutTopo(topo, { layout, paper }), { theme: 'eau_froide', interactive: true });
      assert.equal((svg.match(/class="topo-element"/g) || []).length, ELEMENT_TYPES.length, `${layout}/${paper}`);
      assert.equal(/NaN|Infinity/.test(svg), false, `${layout}/${paper}`);
    }
  }
});

test('Stil Bleistiftskizze: Graustufen, Schraffur und Regression der anderen Stile', () => {
  assert.equal(THEMES.pencil_sketch.label, 'Bleistiftskizze');
  assert.match(html, /<option value="pencil_sketch" id="opt-theme-pencil-sketch">Bleistiftskizze<\/option>/);

  const elements = ELEMENT_TYPES.map((type, index) => ({
    type,
    horizontal_start_rel_to_segment_start: index * 0.4 + 1,
    vertical_start_rel_to_segment_start: 0,
    horizontal_end_rel_to_segment_start: RANGE_ELEMENT_TYPES.has(type) ? index * 0.4 + 4 : null,
    vertical_end_rel_to_segment_start: RANGE_ELEMENT_TYPES.has(type) ? 1 : null,
    size: 1,
    text: type === 'CUSTOM_TEXT' ? 'Skizze' : '1',
  }));
  const topo = topoFromJson({
    ...original,
    segments: [
      { ...original.segments[0], type: 'WALK', length_in_meters: 70, elements },
      { ...original.segments[0], type: 'RAPPEL', length_in_meters: 20, elements: [] },
      { ...original.segments[0], type: 'POOL', length_in_meters: 8, elements: [] },
    ],
  });
  const layout = layoutTopo(topo);
  const sketch = renderTopoSvg(topo, layout, { theme: 'pencil_sketch', interactive: true });

  assert.equal((sketch.match(/class="topo-element"/g) || []).length, ELEMENT_TYPES.length);
  for (const marker of ['id="topo-sketch-hatch"', 'url(#topo-sketch-hatch)']) {
    assert.ok(sketch.includes(marker), `Marker fehlt: ${marker}`);
  }
  // Die Geländelinie wird als Mehrfachstrich zur Betonung der Handzeichnung
  // gerendert statt als einzelner Pfad.
  assert.ok((sketch.match(/<g class="topo-row"/g) || []).length > 0);
  assert.ok(sketch.includes('transform="translate(-0.1,0.07)"'), 'erster Strichversatz fehlt');
  assert.ok(sketch.includes('transform="translate(0.08,-0.05)"'), 'zweiter Strichversatz fehlt');
  // Komplett grau: keine der bunten Originalfarben aus den Symbolen taucht auf.
  for (const color of ['#c52b24', '#768898', '#52687a', '#d7d4c9', '#aab9c6', '#1b3fb5', '#0b7a45']) {
    assert.ok(!sketch.includes(color), `Farbe ${color} sollte in der Skizze ausgegraut sein`);
  }
  assert.equal(/NaN|Infinity/.test(sketch), false);
  assert.equal(sketch.includes('>?</text>'), false);
  assert.equal(sketch, renderTopoSvg(topo, layout, { theme: 'pencil_sketch', interactive: true }), 'nicht deterministisch');

  for (const theme of ['color', 'alpiner_classic', 'eau_froide']) {
    const other = renderTopoSvg(topo, layout, { theme });
    assert.ok(!other.includes('topo-sketch-hatch'), `${theme} enthält Skizzen-Marker`);
  }
});

test('Bleistiftskizze: weisser Hintergrund, wellige Wandlinie, exakt gerade Abseil-/RG-Linien', () => {
  assert.equal(THEMES.pencil_sketch.background, '#ffffff');

  const topo = normalizeTopo({
    maximum_walk_length: 200,
    distance_of_single_line: 30,
    segments: [
      { type: 'RAPPEL', length_in_meters: 80, angle_in_degrees: 90, wall_distance_in_meters: 4 },
      { type: 'WALK', length_in_meters: 60, angle_in_degrees: 0 },
    ],
  });
  const layout = layoutTopo(topo);
  const sketch = renderTopoSvg(topo, layout, { theme: 'pencil_sketch' });

  // Seitenhintergrund ist reines Weiss, nicht gelblich/cremefarben getönt.
  assert.match(sketch, /<rect x="[-\d.]+" y="[-\d.]+" width="[\d.]+" height="[\d.]+" fill="#ffffff"\/>/);

  // Die drei Wandlinien-Striche sind kein einzelner starrer Pfad mehr,
  // sondern ein Polygonzug aus vielen Teilstücken (Wellenform), nicht nur
  // Start-/Endpunkt wie bei einer geraden Linie.
  const wallPaths = [...sketch.matchAll(/<path d="(M [^"]+)" fill="none" stroke="#3a3a3a"/g)];
  assert.ok(wallPaths.length >= 3, 'mindestens 3 Wandlinien-Striche erwartet');
  for (const [, d] of wallPaths) {
    const pointCount = (d.match(/[ML]/g) || []).length;
    assert.ok(pointCount > 10, `Wandlinie sollte viele Stützpunkte fuer eine Welle haben, hat aber nur ${pointCount}`);
  }

  // Die Abseil-/Rappel-Linie (arrowFor) bleibt exakt gerade: eine einzelne
  // <line> mit identischem x1/x2 (vertikales Segment), kein Polygonzug.
  const arrowLine = sketch.match(/<line x1="([\d.]+)" y1="[\d.]+" x2="([\d.]+)" y2="[\d.]+" stroke="#2b2b2b" stroke-width="0.14" marker-end="url\(#topo-arrow\)"\/>/);
  assert.ok(arrowLine, 'Abseil-Pfeillinie nicht gefunden');
  assert.ok(Math.abs(Number(arrowLine[1]) - Number(arrowLine[2])) < 1e-6, 'Abseil-Linie muss exakt vertikal/gerade bleiben');
});

test('wobbleWallPath haelt Start- und Endpunkt fest und bleibt deterministisch', () => {
  const topo = normalizeTopo({
    maximum_walk_length: 200,
    distance_of_single_line: 30,
    segments: [{ type: 'WALK', length_in_meters: 50, angle_in_degrees: 0 }],
  });
  const layout = layoutTopo(topo);
  const a = renderTopoSvg(topo, layout, { theme: 'pencil_sketch' });
  const b = renderTopoSvg(topo, layout, { theme: 'pencil_sketch' });
  assert.equal(a, b, 'Wellenform muss bytegleich reproduzierbar bleiben');
});

/* ------------------------------------------------------- Rappel Guide (RG) */



test('Rappel Guide steht im Modell, als Strecke und in der Palette Verankerung', () => {
  assert.ok(ELEMENT_TYPES.includes('RAPPEL_GUIDE'), 'RAPPEL_GUIDE fehlt im Modell');
  assert.ok(RANGE_ELEMENT_TYPES.has('RAPPEL_GUIDE'), 'RAPPEL_GUIDE ist keine Strecke');
  assert.equal(SYMBOLS.RAPPEL_GUIDE.category, 'anchors');
  assert.equal(SYMBOLS.RAPPEL_GUIDE.range, true);
  const group = symbolOptions().find((category) => category.id === 'anchors');
  const entry = group.symbols.find((symbol) => symbol.type === 'RAPPEL_GUIDE');
  assert.ok(entry, 'RAPPEL_GUIDE fehlt in der Palettenkategorie Verankerung');
  assert.equal(entry.label, 'Rappel Guide (RG)');
  assert.equal(entry.range, true);
});

test('Rappel Guide zeichnet eine Linie exakt von Start zu Ende mit RG-Kennung', () => {
  const a = { x: 3, y: 4 };
  const b = { x: 11, y: 9 };
  const drawing = SYMBOLS.RAPPEL_GUIDE.render(a, b, {
    size: 1,
    element: { text: '' },
    color: '#111111',
  });
  assert.match(
    drawing,
    new RegExp(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"`),
    'die Linie läuft nicht exakt von Start zu Ende',
  );
  assert.ok(drawing.includes('>RG<'), 'RG-Kennung fehlt');
  assert.equal(/NaN|Infinity|undefined/.test(drawing), false, 'ungültiger Wert im SVG');
  // Farb- und S/W-Theme werden über options.color weitergereicht.
  const colored = SYMBOLS.RAPPEL_GUIDE.render(a, b, {
    size: 1,
    element: { text: '' },
    color: '#000000',
  });
  assert.ok(colored.includes('#000000'), 'Farbe aus dem Theme wird nicht übernommen');
  // size skaliert Strichstärke und Pfeil.
  const big = SYMBOLS.RAPPEL_GUIDE.render(a, b, {
    size: 2,
    element: { text: '' },
    color: '#111',
  });
  assert.ok(big.includes('stroke-width="0.24"'), 'size skaliert die Strichstärke nicht');
  // Entartete Strecke (Start = Ende) darf keine Division durch 0 erzeugen.
  const degenerate = SYMBOLS.RAPPEL_GUIDE.render(a, a, {
    size: 1,
    element: { text: '' },
    color: '#111',
  });
  assert.equal(/NaN|Infinity/.test(degenerate), false, 'NaN bei Nulllänge');
  // Optionaler Text wird angehangen.
  const withText = SYMBOLS.RAPPEL_GUIDE.render(a, b, {
    size: 1,
    element: { text: 'Pfad' },
    color: '#111',
  });
  assert.ok(withText.includes('>RG Pfad<'), 'Beschriftung fehlt');
});

test('Rappel Guide rendert in allen Layoutmodi und Papierformaten ohne NaN', () => {
  const base = {
    ...original,
    segments: [
      {
        ...original.segments[0],
        type: 'WALK',
        length_in_meters: 40,
        elements: [
          {
            type: 'RAPPEL_GUIDE',
            horizontal_start_rel_to_segment_start: 2,
            vertical_start_rel_to_segment_start: 1,
            horizontal_end_rel_to_segment_start: 18,
            vertical_end_rel_to_segment_start: 4,
            size: 1,
            text: '',
          },
        ],
      },
    ],
  };
  const topo = topoFromJson(base);
  assert.deepEqual(validateTopo(topo), []);
  for (const layout of ['serpentine', 'cascaded', 'linear']) {
    for (const paper of ['screen', 'a4_landscape', 'a4_portrait']) {
      const layoutData = layoutTopo(topo, { layout, paper });
      for (const theme of ['color', 'alpiner_classic', 'eau_froide', 'pencil_sketch']) {
        const svg = renderTopoSvg(topo, layoutData, { theme, interactive: true });
        assert.ok(svg.includes('>RG<'), `${layout}/${paper}/${theme}: RG fehlt`);
        assert.equal(/NaN|Infinity/.test(svg), false, `${layout}/${paper}/${theme}: NaN/Infinity`);
        assert.ok(
          (svg.match(/class="topo-element"/g) || []).length >= 1,
          `${layout}/${paper}/${theme}: Element nicht gerendert`,
        );
      }
    }
  }
});

test('Rappel Guide überlebt JSON-, XML- und XSD-Roundtrip', () => {
  const element = {
    type: 'RAPPEL_GUIDE',
    horizontal_start_rel_to_segment_start: 5,
    vertical_start_rel_to_segment_start: 2,
    horizontal_end_rel_to_segment_start: 22,
    vertical_end_rel_to_segment_start: -1,
    size: 1.3,
    text: 'Führungsseil',
  };
  const input = {
    ...original,
    segments: [{ ...original.segments[0], type: 'WALK', length_in_meters: 40, elements: [element] }],
  };
  const topo = topoFromJson(input);
  assert.deepEqual(validateTopo(topo), []);
  assert.deepEqual(topoToJsonObject(topo).segments[0].elements, [element]);
  const xml = topoToXml(topo);
  assert.ok(xml.includes('type="RAPPEL_GUIDE"'), 'RAPPEL_GUIDE fehlt im XML');
  assert.deepEqual(topoToJsonObject(topoFromXml(xml)), input);
  // XSD-Validierung (falls xmllint vorhanden, sonst nur Schema-Plausibilität).
  const result = spawnSync('xmllint', ['--noout', '--schema', xsdPath, '-'], {
    encoding: 'utf8',
    input: xml,
  });
  if (result.error?.code !== 'ENOENT') {
    assert.equal(result.status, 0, result.stderr);
  }
});

test('Gumpentiefe ist optional, nicht negativ und nur bei POOL erlaubt', () => {
  assert.deepEqual([...DEPTH_SEGMENT_TYPES], ['POOL']);
  for (const type of [...SEGMENT_TYPES, 'UNKNOWN']) {
    const segment = normalizeTopo({ segments: [{ type, depth_in_meters: '2.5' }] }).segments[0];
    assert.equal(segment.depth_in_meters, type === 'POOL' ? 2.5 : null, type);
    assert.equal(segment._extra?.depth_in_meters, undefined);
    if (type !== 'POOL') {
      assert.equal('depth_in_meters' in topoToJsonObject({ ...normalizeTopo(original), segments: [segment] }).segments[0], false);
      assert.equal(topoToXml({ ...normalizeTopo(original), segments: [segment] }).includes('depth_in_meters'), false);
    }
  }
  for (const value of [undefined, null, '', '  ', -1, '-2', 'x', NaN, Infinity, true, [], {}]) {
    const topo = normalizeTopo({ segments: [{ type: 'POOL', depth_in_meters: value }] });
    assert.equal(topo.segments[0].depth_in_meters, null, String(value));
  }
});

test('Gumpentiefe überlebt JSON/XML/XSD inklusive 0 und Dezimalwerten', () => {
  assert.match(readFileSync(xsdPath, 'utf8'), /<xs:attribute name="depth_in_meters" type="xs:decimal"\s*\/>/);
  for (const depth of [0, 2.5, 4, 8]) {
    const topo = normalizeTopo({
      ...original,
      segments: [{ type: 'POOL', length_in_meters: 8, depth_in_meters: depth }],
    });
    assert.deepEqual(validateTopo(topo), []);
    const json = topoToJson(topo);
    const xml = topoToXml(topo);
    assert.equal(topoToJsonObject(topo).segments[0].depth_in_meters, depth);
    assert.match(xml, new RegExp(`depth_in_meters="${depth}"`));
    assert.equal(topoFromJson(json).segments[0].depth_in_meters, depth);
    assert.equal(topoFromXml(xml).segments[0].depth_in_meters, depth);
    assert.equal(topoToJson(topoFromXml(xml)), json);
    const result = spawnSync('xmllint', ['--noout', '--schema', xsdPath, '-'], {
      encoding: 'utf8', input: xml,
    });
    if (result.error?.code !== 'ENOENT') {
      assert.equal(result.status, 0, result.stderr);
    }
    for (const [type, value, expected] of [
      ['POOL', '-1', null], ['POOL', 'x', null], ['POOL', '', null],
      ['POOL', '2.5', 2.5], ['WALK', '8', null], ['RAPPEL', '4', null],
    ]) {
      assert.equal(
        topoFromXml(xml.replace('type="POOL"', `type="${type}"`).replace(`depth_in_meters="${depth}"`, `depth_in_meters="${value}"`)).segments[0].depth_in_meters,
        expected,
      );
    }
  }
});

test('ohne Gumpentiefe bleiben JSON/XML byte-identisch zum bisherigen Export', () => {
  const topo = normalizeTopo(original);
  const hash = (text) => createHash('sha256').update(text).digest('hex');
  assert.equal(hash(topoToJson(topo)), '7f7e1d664958fe204989f23c1604f8ea8d1ea0da133e6299d70b4b9f6b6c93f1');
  assert.equal(hash(topoToXml(topo)), '5d27838590d01eb62488652f54435cd10e216624c57b8732fcebec9edcab1026');
  assert.equal(topoToJson(topo).includes('depth_in_meters'), false);
  assert.equal(topoToXml(topo).includes('depth_in_meters'), false);
});

test('legend_offset_left: nur gesetzt exportiert, JSON und XML verlustfrei', () => {
  const plain = normalizeTopo(original);
  assert.equal('legend_offset_left' in plain, false);
  assert.equal(topoToJson(plain).includes('legend_offset_left'), false);
  assert.equal(topoToXml(plain).includes('legend_offset_left'), false);

  const moved = normalizeTopo({ ...original, legend_offset_left: 12.75 });
  assert.equal(moved.legend_offset_left, 12.75);
  assert.equal(topoFromJson(topoToJson(moved)).legend_offset_left, 12.75);
  assert.equal(topoFromXml(topoToXml(moved)).legend_offset_left, 12.75);
  assert.equal('legend_offset_left' in normalizeTopo({ ...original, legend_offset_left: null }), false);
});

console.log(`\n${passed} Test(s) bestanden.`);
