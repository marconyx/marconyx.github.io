/**
 * Tests für den Zufallsgenerator (deterministisch über Seeds):
 *   node test/random.test.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  RANGE_ELEMENT_TYPES,
  SEGMENT_TYPES,
  WALK_TIME_ELEMENT_TYPES,
  validateTopo,
} from '../src/model.js';
import { topoToJsonObject, topoFromJson } from '../src/io-json.js';
import { topoToXml, topoFromXml } from '../src/io-xml.js';
import { layoutTopo } from '../src/layout.js';
import { renderTopoSvg } from '../src/renderer.js';
import { PAPER_PRESETS } from '../src/sheet.js';
import { symbolOptions } from '../src/symbols.js';
import {
  createRandomTopo,
  createRng,
  requiredSymbolVariants,
} from '../src/random-topo.js';

const here = dirname(fileURLToPath(import.meta.url));
const xsdPath = join(here, '..', 'topo.xsd');
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

const SEEDS = [1, 7, 42, 1234, 99991];

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

const variantKey = (entry) => `${entry.type}${entry.dead ? ':dead' : ''}`;

console.log('Zufalls-Topo Tests');

test('jedes erzeugte Topo enthält jeden Segmenttyp mindestens einmal', () => {
  for (const seed of SEEDS) {
    const topo = createRandomTopo({ seed });
    const present = new Set(topo.segments.map((segment) => segment.type));
    for (const type of SEGMENT_TYPES) {
      assert.ok(present.has(type), `Seed ${seed}: Segmenttyp ${type} fehlt`);
    }
  }
});

test('jede Variante der Symbolpalette kommt mindestens einmal vor', () => {
  const expected = symbolOptions().flatMap((category) =>
    category.symbols.map(variantKey),
  );
  assert.ok(expected.length > 0);
  for (const seed of SEEDS) {
    const topo = createRandomTopo({ seed });
    const present = new Set(
      topo.segments.flatMap((segment) => segment.elements.map(variantKey)),
    );
    for (const key of expected) {
      assert.ok(present.has(key), `Seed ${seed}: Symbolvariante ${key} fehlt`);
    }
  }
});

test('die Pflichtliste wird aus der Palette abgeleitet, nicht hart codiert', () => {
  assert.deepEqual(
    requiredSymbolVariants().map(variantKey).sort(),
    symbolOptions()
      .flatMap((category) => category.symbols.map(variantKey))
      .sort(),
  );
});

test('gleicher Seed ergibt ein identisches Topo', () => {
  for (const seed of SEEDS) {
    assert.deepEqual(
      topoToJsonObject(createRandomTopo({ seed })),
      topoToJsonObject(createRandomTopo({ seed })),
    );
  }
});

test('verschiedene Seeds ergeben verschiedene Topos', () => {
  const seen = new Set(
    SEEDS.map((seed) => JSON.stringify(topoToJsonObject(createRandomTopo({ seed })))),
  );
  assert.equal(seen.size, SEEDS.length, 'Seeds liefern kein unterschiedliches Ergebnis');
});

test('eine eigene Zufallsquelle wird verwendet', () => {
  const rng = createRng(4711);
  const viaRng = topoToJsonObject(createRandomTopo({ rng }));
  const viaSeed = topoToJsonObject(createRandomTopo({ seed: 4711 }));
  assert.deepEqual(viaRng, viaSeed);
});

test('die Validierung meldet weder Fehler noch Warnungen', () => {
  for (const seed of SEEDS) {
    const issues = validateTopo(createRandomTopo({ seed }));
    assert.deepEqual(issues, [], `Seed ${seed}: ${JSON.stringify(issues)}`);
  }
});

test('Streckenelemente bekommen Start- und Endpunkt', () => {
  for (const seed of SEEDS) {
    for (const segment of createRandomTopo({ seed }).segments) {
      for (const element of segment.elements) {
        if (!RANGE_ELEMENT_TYPES.has(element.type)) continue;
        assert.ok(
          Number.isFinite(element.horizontal_end_rel_to_segment_start),
          `Seed ${seed}: ${element.type} ohne horizontalen Endpunkt`,
        );
        assert.ok(
          Number.isFinite(element.vertical_end_rel_to_segment_start),
          `Seed ${seed}: ${element.type} ohne vertikalen Endpunkt`,
        );
      }
    }
  }
});

test('Metadaten sind vollständig gefüllt', () => {
  for (const seed of SEEDS) {
    const topo = createRandomTopo({ seed });
    assert.ok(topo.canyon_name.trim().length > 2, 'Name fehlt');
    assert.ok(topo.author.trim().length > 0, 'Author fehlt');
    assert.match(topo.duration, /\d/, 'Dauer ohne Zahl');
    assert.match(topo.date, /^\d{4}-\d{2}-\d{2}$/, 'Datum nicht ISO');
    assert.ok(topo.maximum_walk_length > 0);
    assert.ok(topo.distance_of_single_line > 0);
  }
});

test('kein Übergang erzwingt und verhindert den Umbruch gleichzeitig', () => {
  for (const seed of SEEDS) {
    createRandomTopo({ seed }).segments.forEach((segment, index) => {
      assert.ok(
        !(
          segment.force_cut_row_after_this_segment &&
          segment.do_not_cut_row_after_this_segment
        ),
        `Seed ${seed}, Segment ${index + 1}: widersprüchliche Umbruch-Flags`,
      );
    });
  }
});

test('das letzte Segment trägt keine Umbruch-Flags', () => {
  for (const seed of SEEDS) {
    const last = createRandomTopo({ seed }).segments.at(-1);
    assert.equal(last.force_cut_row_after_this_segment, false);
    assert.equal(last.do_not_cut_row_after_this_segment, false);
  }
});

test('Zufalls-Gumpentiefen sind gelegentlich gesetzt, nur bei POOL und plausibel', () => {
  let known = 0;
  let unknown = 0;
  for (let seed = 1; seed <= 100; seed += 1) {
    for (const segment of createRandomTopo({ seed }).segments) {
      if (segment.type !== 'POOL') {
        assert.equal(segment.depth_in_meters, null);
      } else if (segment.depth_in_meters === null) {
        unknown += 1;
      } else {
        known += 1;
        assert.ok(segment.depth_in_meters >= 1 && segment.depth_in_meters <= 8);
      }
    }
  }
  assert.ok(known > 0 && unknown > 0, 'bekannte und unbekannte Tiefen müssen vorkommen');
});

test('Winkel und Wanddistanz bleiben fachlich plausibel', () => {
  let overhangs = 0;
  for (let seed = 1; seed <= 25; seed += 1) {
    for (const segment of createRandomTopo({ seed }).segments) {
      assert.ok(segment.length_in_meters > 0);
      assert.ok(
        segment.angle_in_degrees >= -10 && segment.angle_in_degrees <= 120,
        `unplausibler Winkel ${segment.angle_in_degrees}`,
      );
      assert.ok(segment.wall_distance_in_meters >= 0);
      if (segment.angle_in_degrees > 90) overhangs += 1;
    }
  }
  assert.ok(overhangs > 0, 'Überhänge >90° kommen nie vor');
});

test('Layout und Rendering liefern in allen Formaten endliche Werte', () => {
  for (const seed of SEEDS) {
    const topo = createRandomTopo({ seed });
    for (const paper of Object.keys(PAPER_PRESETS)) {
      for (const mode of ['serpentine', 'linear']) {
        const layout = layoutTopo(topo, { layout: mode, paper });
        assert.ok(Number.isFinite(layout.width) && layout.width > 0);
        assert.ok(Number.isFinite(layout.height) && layout.height > 0);
        for (const placement of layout.placements) {
          for (const point of [placement.start, placement.end]) {
            assert.ok(
              Number.isFinite(point.x) && Number.isFinite(point.y),
              `Seed ${seed}/${paper}/${mode}: nicht endliche Koordinate`,
            );
          }
        }
        const svg = renderTopoSvg(topo, layout, { paper });
        assert.ok(svg.startsWith('<svg'));
        assert.equal(/NaN|Infinity/.test(svg), false, `${paper}/${mode}: NaN/Infinity im SVG`);
      }
    }
  }
});

test('JSON- und XML-Round-Trip sind verlustfrei', () => {
  for (const seed of SEEDS) {
    const topo = createRandomTopo({ seed });
    const json = topoToJsonObject(topo);
    assert.deepEqual(topoToJsonObject(topoFromJson(JSON.stringify(json))), json);
    assert.deepEqual(topoToJsonObject(topoFromXml(topoToXml(topo))), json);
  }
});

test('das erzeugte XML validiert gegen die XSD', () => {
  const probe = spawnSync('xmllint', ['--version'], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT') {
    console.log('       (xmllint nicht verfügbar – Schemaprüfung übersprungen)');
    return;
  }
  for (const seed of SEEDS) {
    const result = spawnSync('xmllint', ['--noout', '--schema', xsdPath, '-'], {
      encoding: 'utf8',
      input: topoToXml(createRandomTopo({ seed })),
    });
    assert.equal(result.status, 0, `Seed ${seed}: ${result.stderr}`);
  }
});

test('die Gehzeit steht nur bei WALK und am Fluchtweg', () => {
  for (const seed of SEEDS) {
    const topo = createRandomTopo({ seed });
    for (const segment of topo.segments) {
      if (segment.type !== 'WALK') {
        assert.equal(
          segment.duration_to_walk_in_min,
          null,
          `Seed ${seed}: ${segment.type} hat eine Gehzeit`,
        );
      }
      for (const element of segment.elements) {
        const minutes = element.duration_to_walk_in_min;
        if (WALK_TIME_ELEMENT_TYPES.has(element.type)) {
          if (minutes !== null) assert.ok(minutes > 0 && minutes <= 120);
        } else {
          assert.equal(minutes, null, `Seed ${seed}: ${element.type}`);
        }
      }
    }
  }
});

test('der Zufall-Knopf steht neben dem Beispiel-Knopf in der Toolbar', () => {
  assert.match(
    html,
    /id="btn-example"[\s\S]{0,200}id="btn-random"/,
    'Zufall-Knopf fehlt direkt nach Beispiel',
  );
  assert.match(html, /id="btn-random"[^>]*>\s*Zufall\s*</);
});

test('der Zufallskatalog enthält Rappel Guide mit vollständigen Endkoordinaten', () => {
  const variants = requiredSymbolVariants();
  const guide = variants.find((variant) => variant.type === 'RAPPEL_GUIDE');
  assert.ok(guide, 'RAPPEL_GUIDE fehlt in den Palettenvarianten');
  assert.equal(guide.range, true);
  // Über viele Seeds sichern, dass der Generator RAPPEL_GUIDE wirklich auswürfelt.
  let seen = false;
  for (let seed = 1; seed < 5000; seed += 1) {
    for (const segment of createRandomTopo({ seed }).segments) {
      for (const element of segment.elements) {
        if (element.type !== 'RAPPEL_GUIDE') continue;
        seen = true;
        assert.ok(
          Number.isFinite(element.horizontal_end_rel_to_segment_start),
          `Seed ${seed}: horizontaler Endpunkt fehlt`,
        );
        assert.ok(
          Number.isFinite(element.vertical_end_rel_to_segment_start),
          `Seed ${seed}: vertikaler Endpunkt fehlt`,
        );
      }
    }
    if (seen) break;
  }
  assert.ok(seen, 'RAPPEL_GUIDE wurde in keinem der Seeds erzeugt');
});

console.log(`\n${passed} Test(s) bestanden.`);
