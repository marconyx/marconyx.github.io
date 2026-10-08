/**
 * Serpentine-Layout, Formatwahl, Umbruchregeln und Legende:
 *   node test/layout.test.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { normalizeTopo } from '../src/model.js';
import { topoFromJson, topoToJsonObject } from '../src/io-json.js';
import { topoFromXml, topoToXml } from '../src/io-xml.js';
import {
  LAYOUT_MODES,
  drawnLengthOf,
  layoutTopo,
  rowBreakRulesFor,
  worldToLocal,
} from '../src/layout.js';
import { createRandomTopo } from '../src/random-topo.js';
import { renderTopoSvg } from '../src/renderer.js';
import {
  contentBoundsFor,
  fitBoundsToPaper,
  legendMetaTextsFor,
  legendPanelHeightMeters,
  legendPanelTopMeters,
  paperAspectRatio,
  PAPER_PRESETS,
  poolDepthLabelFor,
  poolDrawingDepthOf,
} from '../src/sheet.js';

const here = dirname(fileURLToPath(import.meta.url));
const example = JSON.parse(
  readFileSync(join(here, '..', 'examples', 'my-canyon-inferiore.json'), 'utf8'),
);

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

console.log('Serpentine-Layout Tests');

/** Flaches Topo aus gleich langen Gehstücken – die Zeilenbreite ist damit exakt vorhersagbar. */
function flatTopo(count, lengthInMeters = 10, overrides = {}) {
  return normalizeTopo({
    canyon_name: 'Test',
    maximum_walk_length: 1000,
    distance_of_single_line: 60,
    segments: Array.from({ length: count }, (_, index) => ({
      type: 'POOL',
      length_in_meters: lengthInMeters,
      angle_in_degrees: 0,
      ...(overrides[index] || {}),
    })),
  });
}

function rowWidths(layout) {
  return layout.rows.map((row) => row.maxX - row.minX);
}

function rowSegments(layout) {
  return layout.rows.map((row) => row.placements.map((p) => p.index));
}

function rowMarkupFromSvg(svg) {
  const rows = [];
  const rowStarts = [...svg.matchAll(/<g class="topo-row" data-row="\d+">/g)];
  for (const rowStart of rowStarts) {
    const tags = /<\/?g\b[^>]*>/g;
    tags.lastIndex = rowStart.index;
    let depth = 0;
    let end = rowStart.index;
    let tag;
    while ((tag = tags.exec(svg))) {
      depth += tag[0].startsWith('</') ? -1 : 1;
      if (depth === 0) {
        end = tags.lastIndex;
        break;
      }
    }
    rows.push(svg.slice(rowStart.index, end));
  }
  return rows;
}

/* ------------------------------------------------ automatische Aufteilung */

test('Serpentine teilt automatisch auf und hält die Zielbreite ein', () => {
  const topo = flatTopo(12, 10); // 120 m Gesamtbreite, Ziel 60 m
  const layout = layoutTopo(topo);
  assert.equal(layout.rowWidthLimit, 60);
  assert.ok(layout.rows.length > 1, 'mehr als eine Zeile erwartet');
  for (const width of rowWidths(layout)) {
    assert.ok(width <= 60 + 1e-9, `Zeile zu breit: ${width}`);
  }
  assert.deepEqual(rowSegments(layout), [
    [0, 1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10, 11],
  ]);
});

test('die Aufteilung folgt der Breite, nicht einer festen Segmentzahl', () => {
  // Gleiche Segmentzahl, doppelte Länge: es muss doppelt so viele Zeilen geben.
  const narrow = layoutTopo(flatTopo(12, 20));
  const wide = layoutTopo(flatTopo(12, 10));
  assert.ok(
    narrow.rows.length > wide.rows.length,
    'längere Segmente müssen mehr Zeilen ergeben',
  );
  assert.deepEqual(rowSegments(narrow), [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [9, 10, 11],
  ]);
});

test('die Zeilen werden ausgeglichen gefüllt statt gierig', () => {
  // 7 x 10 m bei 30 m Ziel: gierig ergäbe 3/3/1, ausgeglichen 3/2/2.
  const layout = layoutTopo(
    normalizeTopo({
      distance_of_single_line: 30,
      maximum_walk_length: 1000,
      segments: Array.from({ length: 7 }, () => ({
        type: 'POOL',
        length_in_meters: 10,
        angle_in_degrees: 0,
      })),
    }),
  );
  const sizes = rowSegments(layout).map((row) => row.length);
  assert.equal(sizes.reduce((a, b) => a + b, 0), 7);
  assert.ok(
    Math.max(...sizes) - Math.min(...sizes) <= 1,
    `Zeilen unausgeglichen: ${sizes.join('/')}`,
  );
});

test('jede Zeile startet links und läuft nach rechts', () => {
  const layout = layoutTopo(flatTopo(12, 10));
  for (const row of layout.rows) {
    assert.equal(row.placements[0].start.x, 0, 'Zeilenanfang muss bei x=0 liegen');
    const last = row.placements[row.placements.length - 1];
    assert.ok(last.end.x > row.placements[0].start.x);
  }
});

test('Verkürzungsschwelle spart proportional Platz und ist standardmässig aus', () => {
  const rappel = normalizeTopo({
    maximum_walk_length: 30,
    length_shortening_threshold_meters: 30,
    segments: [{
      type: 'RAPPEL',
      length_in_meters: 80,
      angle_in_degrees: 90,
      elements: [{
        type: 'PATH',
        horizontal_start_rel_to_segment_start: 10,
        vertical_start_rel_to_segment_start: 0,
        horizontal_end_rel_to_segment_start: 70,
        vertical_end_rel_to_segment_start: 0,
      }],
    }],
  });
  const placement = layoutTopo(rappel).placements[0];
  assert.equal(drawnLengthOf(rappel.segments[0]), 80);
  assert.equal(placement.drawnLength, 30);
  assert.equal(placement.realLength, 80);
  assert.equal(placement.shortened, true);
  assert.equal(placement.scaleAlong, 30 / 80);
  assert.ok(
    Math.abs(
      Math.hypot(
        placement.elements[0].endPoint.x - placement.elements[0].point.x,
        placement.elements[0].endPoint.y - placement.elements[0].point.y,
      ) - 22.5,
    ) < 1e-9,
    'Streckenelemente werden proportional mitskaliert',
  );
  assert.equal(
    layoutTopo(normalizeTopo({
      maximum_walk_length: 30,
      segments: [{ type: 'RAPPEL', length_in_meters: 80 }],
    })).placements[0].drawnLength,
    80,
    'ohne Einstellung bleibt die Abseilstrecke unverändert',
  );
  assert.equal(
    drawnLengthOf(
      normalizeTopo({ segments: [{ type: 'POOL', length_in_meters: 30 }] }).segments[0],
      30,
    ),
    30,
    'Werte bis einschliesslich Schwelle bleiben unverändert',
  );
});

test('maximum_walk_length ändert Geometrie und Layout nicht', () => {
  const source = {
    canyon_name: 'Max walk is legend only',
    duration: '4 h',
    date: '2026-10-08',
    distance_of_single_line: 60,
    segments: [
      { type: 'WALK', length_in_meters: 120, angle_in_degrees: 0, duration_to_walk_in_min: 40 },
      { type: 'RAPPEL', length_in_meters: 80, angle_in_degrees: 90 },
      { type: 'SLIDE', length_in_meters: 60, angle_in_degrees: 45 },
    ],
  };
  const shortMax = normalizeTopo({ ...source, maximum_walk_length: 20 });
  const longMax = normalizeTopo({ ...source, maximum_walk_length: 90 });
  const segmentGeometry = (topo, mode, paper) => {
    const layout = layoutTopo(topo, { layout: mode, paper });
    return {
      rows: layout.rows.map((row) => ({
        placements: row.placements.map(({ index, start, end, drawnLength, compressed }) => ({
          index, start, end, drawnLength, compressed,
        })),
      })),
      rowAssignment: layout.rowAssignment,
    };
  };
  for (const mode of LAYOUT_MODES) {
    for (const paper of Object.keys(PAPER_PRESETS)) {
      assert.deepEqual(
        segmentGeometry(shortMax, mode, paper),
        segmentGeometry(longMax, mode, paper),
        `${mode}/${paper}: Metadatum ändert das Layout nicht`,
      );
      assert.deepEqual(
        rowMarkupFromSvg(renderTopoSvg(
          shortMax,
          layoutTopo(shortMax, { layout: mode, paper }),
          { paper },
        )),
        rowMarkupFromSvg(renderTopoSvg(
          longMax,
          layoutTopo(longMax, { layout: mode, paper }),
          { paper },
        )),
        `${mode}/${paper}: Topo-SVG ohne Legende bleibt gleich`,
      );
    }
  }
});

test('alle Segmenttypen nutzen die Verkürzungsschwelle', () => {
  const types = [
    'WALK',
    'POOL',
    'RAPPEL',
    'RAPPEL_DRY',
    'RAPPEL_WET',
    'JUMP',
    'SLIDE',
    'CLIMB',
    'WEIR',
  ];
  const topo = normalizeTopo({
    maximum_walk_length: 1000,
    length_shortening_threshold_meters: 30,
    segments: types.map((type) => ({
      type,
      length_in_meters: 80,
      angle_in_degrees: 0,
    })),
  });
  const layout = layoutTopo(topo);
  for (const placement of layout.placements) {
    assert.equal(placement.drawnLength, 30, placement.segment.type);
    assert.equal(placement.shortened, true, placement.segment.type);
  }
});

test('Doppelbruch erscheint für verkürzte Strecken in allen Stilen, nicht auf Labels', () => {
  const topo = normalizeTopo({
    length_shortening_threshold_meters: 30,
    segments: [{
      type: 'RAPPEL',
      length_in_meters: 80,
      angle_in_degrees: 90,
    }],
  });
  for (const theme of ['color', 'bw', 'alpiner_classic', 'eau_froide']) {
    const svg = renderTopoSvg(topo, layoutTopo(topo), { theme });
    assert.equal((svg.match(/class="topo-shortening-break"/g) || []).length, 1, theme);
    assert.match(svg, /> ?80<\/tspan>/, `${theme}: echtes Mass fehlt`);
  }

  topo.length_shortening_threshold_meters = null;
  assert.doesNotMatch(
    renderTopoSvg(topo, layoutTopo(topo)),
    /topo-shortening-break/,
    'ohne aktive Schwelle wird kein Bruchzeichen gezeichnet',
  );
});

test('SVG-Doppelbruch sitzt exakt in der geometrischen Mitte der Linie', () => {
  const topo = normalizeTopo({
    maximum_walk_length: 200,
    distance_of_single_line: 60,
    length_shortening_threshold_meters: 30,
    segments: [
      { type: 'RAPPEL', length_in_meters: 80, angle_in_degrees: 45, wall_distance_in_meters: 4 },
      { type: 'WALK', length_in_meters: 120, angle_in_degrees: 90 },
      { type: 'POOL', length_in_meters: 80, angle_in_degrees: 30, depth_in_meters: 5 },
      { type: 'JUMP', length_in_meters: 80, angle_in_degrees: 0 },
      { type: 'SLIDE', length_in_meters: 80, angle_in_degrees: 120 },
      { type: 'WEIR', length_in_meters: 80, angle_in_degrees: 60 },
    ],
  });

  for (const mode of LAYOUT_MODES) {
    const layout = layoutTopo(topo, { layout: mode });
    for (const theme of ['color', 'bw', 'alpiner_classic', 'eau_froide']) {
      const svg = renderTopoSvg(topo, layout, { theme });
      const markers = new Map(
        [...svg.matchAll(
          /<g class="topo-shortening-break" data-seg="(\d+)" data-center-x="([^"]+)" data-center-y="([^"]+)" transform="translate\(([^,]+),([^)]+)\)">/g,
        )].map((match) => [
          Number(match[1]),
          {
            x: Number(match[2]),
            y: Number(match[3]),
            transformX: Number(match[4]),
            transformY: Number(match[5]),
          },
        ]),
      );
      assert.equal(markers.size, topo.segments.length, `${mode}/${theme}: ein Marker je Segment`);
      for (const placement of layout.placements) {
        const marker = markers.get(placement.index);
        assert.ok(marker, `${mode}/${theme}: Marker für ${placement.segment.type}`);
        const { start, end, wallBulge, segment } = placement;
        let expected;
        if (wallBulge) {
          expected = {
            x: (start.x + 2 * wallBulge.control.x + end.x) / 4,
            y: (start.y + 2 * wallBulge.control.y + end.y) / 4,
          };
        } else if (segment.type === 'POOL' || segment.type === 'WEIR') {
          const controlY = Math.max(start.y, end.y) + poolDrawingDepthOf(segment);
          expected = {
            x: (start.x + end.x) / 2,
            y: (start.y + 2 * controlY + end.y) / 4,
          };
        } else {
          expected = {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2,
          };
        }
        assert.ok(Math.abs(marker.x - expected.x) < 1e-9, `${mode}/${theme}/${segment.type}: x`);
        assert.ok(Math.abs(marker.y - expected.y) < 1e-9, `${mode}/${theme}/${segment.type}: y`);
        assert.equal(marker.transformX, marker.x, 'Markergruppe ist am exakten Mittelpunkt verankert');
        assert.equal(marker.transformY, marker.y, 'Markergruppe ist am exakten Mittelpunkt verankert');
      }
      const rowStarts = [...svg.matchAll(/<g class="topo-row" data-row="\d+">/g)]
        .map((match) => match.index);
      for (const [index, rowStart] of rowStarts.entries()) {
        const row = svg.slice(rowStart, rowStarts[index + 1] ?? svg.length);
        const lastDepthLabel = row.lastIndexOf('topo-pool-depth');
        const firstMarker = row.indexOf('class="topo-shortening-break"');
        if (firstMarker >= 0 && lastDepthLabel >= 0) {
          assert.ok(
            firstMarker > lastDepthLabel,
            `${mode}/${theme}: Marker wird über Labels gezeichnet`,
          );
        }
      }
    }
  }
});

test('Pool-Tiefe bleibt als separat stilisierte Tiefe erhalten', () => {
  const topo = normalizeTopo({
    length_shortening_threshold_meters: 30,
    segments: [{
      type: 'POOL',
      length_in_meters: 80,
      depth_in_meters: 80,
      angle_in_degrees: 0,
    }],
  });
  const placement = layoutTopo(topo).placements[0];
  const svg = renderTopoSvg(topo, layoutTopo(topo));
  assert.equal(placement.drawnLength, 30, 'die horizontale Beckenstrecke wird verkürzt');
  assert.equal(poolDrawingDepthOf(topo.segments[0]), 5);
  assert.match(svg, />T 80 m</, 'die echte Gumpentiefe bleibt beschriftet');
});

/* ---------------------------------------------------------------- Formate */

test('alle drei Formate ergeben sinnvolle, unterschiedliche Zeileneinteilungen', () => {
  const topo = normalizeTopo(example);
  const byPaper = {};
  for (const paper of Object.keys(PAPER_PRESETS)) {
    byPaper[paper] = layoutTopo(topo, { paper });
  }

  assert.equal(byPaper.screen.rowWidthLimit, topo.distance_of_single_line);
  assert.notDeepEqual(
    byPaper.a4_portrait.rowAssignment,
    byPaper.a4_landscape.rowAssignment,
    'A4 hoch und A4 quer müssen sich unterscheiden',
  );
  assert.ok(
    byPaper.a4_portrait.rowWidthLimit < byPaper.a4_landscape.rowWidthLimit,
    'A4 hoch muss schmalere Zeilen erzeugen als A4 quer',
  );
  assert.ok(
    byPaper.a4_portrait.rows.length > byPaper.a4_landscape.rows.length,
    'A4 hoch muss mehr Zeilen erzeugen als A4 quer',
  );
  for (const [paper, layout] of Object.entries(byPaper)) {
    assert.equal(
      layout.placements.length,
      topo.segments.length,
      `${paper}: jedes Segment muss platziert sein`,
    );
  }
});

test('A4-Layouts treffen das Seitenverhältnis des Formats besser als die Rohbreite', () => {
  const topo = normalizeTopo(example);
  const deviation = (layout) => {
    const bounds = contentBoundsFor(topo, layout);
    const ratio =
      (bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY);
    return Math.abs(Math.log(ratio / paperAspectRatio('a4_landscape')));
  };
  assert.ok(
    deviation(layoutTopo(topo, { paper: 'a4_landscape' })) <
      deviation(layoutTopo(topo, { paper: 'screen' })),
    'A4 quer muss das Format besser ausnutzen als die reine Bildschirmbreite',
  );
});

test('das gerenderte SVG hat exakt das Seitenverhältnis des Formats', () => {
  const topo = normalizeTopo(example);
  for (const paper of ['a4_landscape', 'a4_portrait']) {
    const svg = renderTopoSvg(topo, layoutTopo(topo, { paper }), { paper });
    const viewBox = /viewBox="([^"]+)"/.exec(svg)[1].split(' ').map(Number);
    const preset = PAPER_PRESETS[paper];
    assert.equal(
      Math.round((viewBox[2] / viewBox[3]) * 1000),
      Math.round((preset.width / preset.height) * 1000),
      `${paper}: viewBox muss zum Pixelmass passen (sonst verzerrt)`,
    );
    assert.equal(Number(/ width="(\d+)"/.exec(svg)[1]), preset.width);
    assert.equal(Number(/ height="(\d+)"/.exec(svg)[1]), preset.height);
  }
});

test('das freie Bildschirmformat bleibt ungedehnt', () => {
  const topo = normalizeTopo(example);
  const layout = layoutTopo(topo, { paper: 'screen' });
  assert.deepEqual(
    fitBoundsToPaper(contentBoundsFor(topo, layout), 'screen'),
    contentBoundsFor(topo, layout),
  );
});

/* ------------------------------------------------------ Umbruch erzwingen */

test('Zeilenumbruch erzwingen trennt auch bei reichlich Platz', () => {
  const topo = flatTopo(4, 10, {
    1: { force_cut_row_after_this_segment: true },
  });
  const layout = layoutTopo(topo);
  assert.deepEqual(rowSegments(layout), [
    [0, 1],
    [2, 3],
  ]);
  // Ohne das Flag stünde alles in einer Zeile.
  assert.deepEqual(rowSegments(layoutTopo(flatTopo(4, 10))), [[0, 1, 2, 3]]);
});

test('mehrere erzwungene Trennstellen ergeben mehrere kurze Zeilen', () => {
  const topo = flatTopo(5, 5, {
    0: { force_cut_row_after_this_segment: true },
    2: { force_cut_row_after_this_segment: true },
  });
  assert.deepEqual(rowSegments(layoutTopo(topo)), [[0], [1, 2], [3, 4]]);
});

test('ein erzwungener Umbruch am letzten Segment erzeugt keine leere Zeile', () => {
  const topo = flatTopo(3, 5, {
    2: { force_cut_row_after_this_segment: true },
  });
  const layout = layoutTopo(topo);
  assert.equal(layout.rows.length, 1);
  assert.ok(layout.rows.every((row) => row.placements.length > 0));
});

/* ----------------------------------------------------- Umbruch verhindern */

test('Umbruch verhindern hält Segmente auch über die Zielbreite hinaus zusammen', () => {
  const topo = flatTopo(4, 20, {
    1: { do_not_cut_row_after_this_segment: true },
  }); // Ziel 60 m, ohne Flag: 3 + 1
  const layout = layoutTopo(topo);
  const rows = rowSegments(layout);
  const rowOf = (index) => rows.findIndex((row) => row.includes(index));
  assert.equal(rowOf(1), rowOf(2), 'Segment 2 und 3 müssen zusammenbleiben');
});

test('eine Keep-Together-Kette sprengt die Zielbreite, ohne etwas abzuschneiden', () => {
  const topo = flatTopo(5, 30, {
    0: { do_not_cut_row_after_this_segment: true },
    1: { do_not_cut_row_after_this_segment: true },
    2: { do_not_cut_row_after_this_segment: true },
  }); // 0..3 zusammen = 120 m bei Ziel 60 m
  const layout = layoutTopo(topo);
  assert.deepEqual(rowSegments(layout), [[0, 1, 2, 3], [4]]);

  const widest = Math.max(...rowWidths(layout));
  assert.ok(widest > layout.rowWidthLimit, 'die Zeile muss überbreit sein');
  assert.ok(
    layout.width >= widest,
    'das Blatt muss die überbreite Zeile aufnehmen',
  );

  const bounds = contentBoundsFor(topo, layout);
  assert.ok(
    bounds.maxX > widest,
    'die Aussenmasse müssen die Überbreite enthalten',
  );
  const svg = renderTopoSvg(topo, layout);
  const viewBox = /viewBox="([^"]+)"/.exec(svg)[1].split(' ').map(Number);
  assert.ok(
    viewBox[0] + viewBox[2] >= widest,
    'die viewBox darf die überbreite Zeile nicht abschneiden',
  );
});

test('Verhindern wirkt auch dort, wo sonst automatisch umgebrochen würde', () => {
  const plain = layoutTopo(flatTopo(6, 15));
  const breakAfter = plain.rowAssignment.findIndex(
    (row, index) => index > 0 && row !== plain.rowAssignment[index - 1],
  );
  assert.ok(breakAfter > 0, 'Vorbedingung: es muss automatisch umgebrochen werden');

  const kept = layoutTopo(
    flatTopo(6, 15, {
      [breakAfter - 1]: { do_not_cut_row_after_this_segment: true },
    }),
  );
  assert.equal(
    kept.rowAssignment[breakAfter - 1],
    kept.rowAssignment[breakAfter],
    'der markierte Übergang darf nicht mehr umbrechen',
  );
});

/* -------------------------------------------------------------- Konflikte */

test('Konflikt am selben Übergang: Erzwingen schlägt Verhindern', () => {
  const { forced, keepTogether } = rowBreakRulesFor([
    {
      force_cut_row_after_this_segment: true,
      do_not_cut_row_after_this_segment: true,
    },
    {},
  ]);
  assert.equal(forced[0], true);
  assert.equal(keepTogether[0], false);

  const topo = flatTopo(4, 10, {
    1: {
      force_cut_row_after_this_segment: true,
      do_not_cut_row_after_this_segment: true,
    },
  });
  assert.deepEqual(rowSegments(layoutTopo(topo)), [
    [0, 1],
    [2, 3],
  ]);
});

test('benachbarte Flags gelten beide: Verhindern davor, Erzwingen danach', () => {
  const topo = flatTopo(5, 10, {
    1: { do_not_cut_row_after_this_segment: true },
    2: { force_cut_row_after_this_segment: true },
  });
  assert.deepEqual(rowSegments(layoutTopo(topo)), [
    [0, 1, 2],
    [3, 4],
  ]);
});

test('Erzwingen bricht eine Keep-Together-Kette genau an der markierten Stelle', () => {
  const topo = flatTopo(6, 10, {
    0: { do_not_cut_row_after_this_segment: true },
    1: { do_not_cut_row_after_this_segment: true },
    2: {
      do_not_cut_row_after_this_segment: true,
      force_cut_row_after_this_segment: true,
    },
    3: { do_not_cut_row_after_this_segment: true },
  });
  assert.deepEqual(rowSegments(layoutTopo(topo)), [
    [0, 1, 2],
    [3, 4, 5],
  ]);
});

/* ------------------------------------------------------ Kompatibilität/IO */

test('die Umbruch-Flags überleben JSON und XML unverändert', () => {
  const topo = flatTopo(3, 10, {
    0: { force_cut_row_after_this_segment: true },
    1: { do_not_cut_row_after_this_segment: true },
  });
  const json = topoToJsonObject(topo);
  assert.equal(json.segments[0].force_cut_row_after_this_segment, true);
  assert.equal(json.segments[1].do_not_cut_row_after_this_segment, true);

  for (const back of [
    topoFromJson(JSON.stringify(json)),
    topoFromXml(topoToXml(topo)),
  ]) {
    assert.deepEqual(
      back.segments.map((s) => [
        s.force_cut_row_after_this_segment,
        s.do_not_cut_row_after_this_segment,
      ]),
      topo.segments.map((s) => [
        s.force_cut_row_after_this_segment,
        s.do_not_cut_row_after_this_segment,
      ]),
    );
    assert.deepEqual(rowSegments(layoutTopo(back)), rowSegments(layoutTopo(topo)));
  }
});

test('alte Dateien mit widersprüchlichen Flags bleiben lesbar', () => {
  const legacy = topoFromJson(
    JSON.stringify({
      canyon_name: 'Legacy',
      distance_of_single_line: 60,
      maximum_walk_length: 1000,
      segments: [
        { type: 'POOL', length_in_meters: 10, angle_in_degrees: 0 },
        {
          type: 'POOL',
          length_in_meters: 10,
          angle_in_degrees: 0,
          force_cut_row_after_this_segment: 'true',
          do_not_cut_row_after_this_segment: 'true',
        },
        { type: 'POOL', length_in_meters: 10, angle_in_degrees: 0 },
      ],
    }),
  );
  assert.equal(legacy.segments[1].force_cut_row_after_this_segment, true);
  assert.equal(legacy.segments[1].do_not_cut_row_after_this_segment, true);
  assert.deepEqual(rowSegments(layoutTopo(legacy)), [[0, 1], [2]]);
});

/* ------------------------------------------------------ Linear unverändert */

test('Linear bleibt eine Zeile – auch mit Flags und Formatwahl', () => {
  const topo = flatTopo(8, 25, {
    1: { force_cut_row_after_this_segment: true },
    3: { do_not_cut_row_after_this_segment: true },
  });
  const reference = layoutTopo(topo, { layout: 'linear' });
  assert.equal(reference.rows.length, 1);
  assert.equal(reference.rowWidthLimit, Number.POSITIVE_INFINITY);
  assert.deepEqual(reference.rowAssignment, new Array(8).fill(0));
  // Segmente liegen lückenlos hintereinander.
  reference.placements.forEach((placement, index) => {
    assert.equal(placement.start.x, index * 25);
  });

  for (const paper of Object.keys(PAPER_PRESETS)) {
    const layout = layoutTopo(topo, { layout: 'linear', paper });
    assert.deepEqual(
      layout.placements.map((p) => [p.start.x, p.start.y, p.end.x, p.end.y]),
      reference.placements.map((p) => [p.start.x, p.start.y, p.end.x, p.end.y]),
      `${paper}: Linear darf sich vom Format nicht beeinflussen lassen`,
    );
  }
});

test('Linear rendert ohne unendliche Aussenmasse', () => {
  const topo = normalizeTopo(example);
  const layout = layoutTopo(topo, { layout: 'linear' });
  const bounds = contentBoundsFor(topo, layout);
  assert.ok(Number.isFinite(bounds.maxX), 'maxX muss endlich sein');
  const svg = renderTopoSvg(topo, layout);
  assert.ok(!svg.includes('Infinity'), 'kein Infinity im SVG');
  assert.ok(svg.startsWith('<svg') && svg.includes('</svg>'));
});

/* ------------------------------------------ Symbole, Überhang, Drag-Rahmen */

test('Überhänge und Rappel-Geometrie bleiben in jedem Format gleich', () => {
  const topo = normalizeTopo({
    distance_of_single_line: 40,
    maximum_walk_length: 1000,
    segments: [
      { type: 'WALK', length_in_meters: 20, angle_in_degrees: 0 },
      { type: 'RAPPEL', length_in_meters: 12, angle_in_degrees: 135 },
      { type: 'WALK', length_in_meters: 20, angle_in_degrees: 0 },
    ],
  });
  for (const paper of Object.keys(PAPER_PRESETS)) {
    const layout = layoutTopo(topo, { paper });
    const rappel = layout.placements[1];
    assert.ok(rappel.end.x < rappel.start.x, `${paper}: Überhang läuft zurück`);
    assert.equal(
      Math.round(rappel.end.y - rappel.start.y),
      Math.round(Math.sin((135 * Math.PI) / 180) * 12),
    );
    const svg = renderTopoSvg(topo, layout, { paper });
    assert.ok(svg.includes('marker-end="url(#topo-arrow)"'));
  }
});

test('Symbole bleiben relativ zu ihrem Segment verankert', () => {
  const topo = normalizeTopo({
    distance_of_single_line: 30,
    maximum_walk_length: 1000,
    segments: Array.from({ length: 6 }, () => ({
      type: 'POOL',
      length_in_meters: 10,
      angle_in_degrees: 0,
      elements: [
        {
          type: 'STONE',
          horizontal_start_rel_to_segment_start: 4,
          vertical_start_rel_to_segment_start: 2,
        },
      ],
    })),
  });
  for (const paper of Object.keys(PAPER_PRESETS)) {
    const layout = layoutTopo(topo, { paper });
    for (const placement of layout.placements) {
      const placed = placement.elements[0];
      assert.equal(placed.point.x - placement.start.x, 4);
      assert.equal(placed.point.y - placement.start.y, -2);
    }
  }
});

test('Der Drag-Rahmen friert die Zeilenaufteilung ein', () => {
  const topo = normalizeTopo(example);
  for (const paper of Object.keys(PAPER_PRESETS)) {
    const frame = layoutTopo(topo, { paper });
    const element = topo.segments[0].elements[0];
    const before = { ...element };
    element.horizontal_start_rel_to_segment_start = 400;
    element.vertical_start_rel_to_segment_start = -300;
    const dragged = layoutTopo(topo, { paper, frame });
    assert.deepEqual(
      dragged.rowAssignment,
      frame.rowAssignment,
      `${paper}: die Zeilenaufteilung darf beim Ziehen nicht springen`,
    );
    assert.equal(dragged.rowWidthLimit, frame.rowWidthLimit);
    assert.ok(dragged.width >= frame.width);
    Object.assign(element, before);
  }
});

/* ---------------------------------------------------------------- Legende */

test('Author und Dauer stehen in der Legende', () => {
  const topo = normalizeTopo({
    ...example,
    author: 'Marco & Team',
    duration: 'ca. 4 h',
  });
  const svg = renderTopoSvg(topo, layoutTopo(topo));
  assert.ok(svg.includes('Author:'), 'Author-Beschriftung fehlt');
  assert.ok(svg.includes('Marco &amp; Team'), 'Author-Wert fehlt/unescaped');
  assert.ok(svg.includes('Dauer:'), 'Dauer-Beschriftung fehlt');
  assert.ok(svg.includes('ca. 4 h'), 'Dauer-Wert fehlt');
  assert.ok(svg.includes('Max. Abseil:'));
  assert.ok(svg.includes('30 m'));
  assert.ok(svg.includes(topo.canyon_name));
});

test('leere Metadaten erzeugen keine leeren Legendenzeilen', () => {
  const topo = normalizeTopo({
    ...example,
    author: '   ',
    duration: '',
    maximum_walk_length: 0,
  });
  assert.deepEqual(legendMetaTextsFor(topo), []);
  const svg = renderTopoSvg(topo, layoutTopo(topo));
  assert.ok(!svg.includes('Author:'));
  assert.ok(!svg.includes('Dauer:'));
  assert.ok(!svg.includes('data-meta="author"'));
  assert.ok(!svg.includes('data-meta="duration"'));
  assert.ok(!svg.includes('data-meta="maximum_walk_length"'));
});

test('maximale Abseillänge steht direkt nach der Dauer in der Legende', () => {
  const topo = normalizeTopo({
    ...example,
    duration: '3-4 h',
    maximum_walk_length: 45,
  });
  for (const theme of ['color', 'bw', 'alpiner_classic', 'eau_froide']) {
    const svg = renderTopoSvg(topo, layoutTopo(topo), { theme });
    assert.match(svg, /data-meta="maximum_walk_length"[^>]*>[\s\S]*Max\. Abseil:<\/tspan> 45 m<\/text>/);
    assert.equal(
      metaY(svg, 'maximum_walk_length') - metaY(svg, 'duration'),
      1.4,
      `${theme}: Max. Abseil steht direkt unter Dauer`,
    );
  }
});

test('ein leeres Datum erzeugt keine Datumszeile', () => {
  const topo = normalizeTopo({ ...example, date: '' });
  topo.date = '';
  const svg = renderTopoSvg(topo, layoutTopo(topo));
  assert.ok(!svg.includes('data-meta="date"'));
  assert.ok(!svg.includes('Datum:'));
});

test('nur ein gefülltes Feld ergibt genau eine Zusatzzeile neben dem Datum', () => {
  const topo = normalizeTopo({
    ...example,
    author: 'Solo',
    duration: '',
    maximum_walk_length: 0,
  });
  const svg = renderTopoSvg(topo, layoutTopo(topo));
  assert.equal((svg.match(/data-meta="/g) || []).length, 2);
  assert.ok(svg.includes('data-meta="author"'));
  assert.ok(svg.includes('data-meta="date"'));
  assert.ok(!svg.includes('data-meta="duration"'));
});

/* ------------------------------------------- Author und Datum am Ende */

/** y-Koordinate einer Legenden-Metazeile. */
function metaY(svg, key) {
  const match = new RegExp(`data-meta="${key}" x="[-\\d.]+" y="([-\\d.]+)"`).exec(svg);
  assert.ok(match, `Legendenzeile ${key} fehlt`);
  return Number(match[1]);
}

/** y-Koordinate des letzten regulären Legendeneintrags. */
function lastEntryY(svg) {
  const match = /<text x="[-\d.]+" y="([-\d.]+)"[^>]*>\(le\) = left<\/text>/.exec(svg);
  assert.ok(match, 'letzter Legendeneintrag fehlt');
  return Number(match[1]);
}

test('Author und Datum stehen nach dem letzten Legendeneintrag', () => {
  const topo = normalizeTopo({
    ...example,
    author: 'Marco',
    duration: '4 h',
    date: '2024-03-07',
  });
  const svg = renderTopoSvg(topo, layoutTopo(topo));
  const entryY = lastEntryY(svg);
  const authorY = metaY(svg, 'author');
  const dateY = metaY(svg, 'date');
  assert.ok(authorY > entryY, `Author (${authorY}) steht nicht unter dem Eintrag (${entryY})`);
  assert.ok(dateY > authorY, `Datum (${dateY}) muss unter dem Author (${authorY}) stehen`);
  // Die Dauer bleibt oben zwischen Titel und "Legend:".
  assert.ok(metaY(svg, 'duration') < entryY);
});

test('das Datum erscheint als TT.MM.JJJJ', () => {
  const topo = normalizeTopo({ ...example, date: '2024-03-07' });
  const svg = renderTopoSvg(topo, layoutTopo(topo));
  assert.ok(svg.includes('07.03.2024'), 'lesbares Datum fehlt');
  assert.ok(/data-meta="date"[^>]*>[\s\S]*?07\.03\.2024/.test(svg));
});

test('der Legendenkasten umschliesst Author und Datum in allen Formaten', () => {
  const topo = normalizeTopo({
    ...example,
    author: 'Eine lange Autorenangabe mit Team',
    duration: '5-6 h',
    date: '2024-12-24',
  });
  for (const paper of Object.keys(PAPER_PRESETS)) {
    const layout = layoutTopo(topo, { paper });
    const svg = renderTopoSvg(topo, layout, { paper });
    const panel = /<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*opacity="0.92"/.exec(
      svg,
    );
    assert.ok(panel, `${paper}: Legendenkasten fehlt`);
    const panelBottom = Number(panel[2]) + Number(panel[4]);
    const dateY = metaY(svg, 'date');
    assert.ok(
      dateY < panelBottom,
      `${paper}: Datum (${dateY}) läuft aus dem Kasten (${panelBottom})`,
    );
    const bounds = fitBoundsToPaper(contentBoundsFor(topo, layout), paper);
    assert.ok(
      panelBottom <= bounds.maxY,
      `${paper}: Kasten (${panelBottom}) ragt über das Blatt (${bounds.maxY})`,
    );
    assert.equal(
      legendPanelTopMeters(topo) + legendPanelHeightMeters(topo) <= bounds.maxY,
      true,
    );
  }
});

test('ein kurzes Topo wächst für die Legende nach unten mit', () => {
  const topo = normalizeTopo({
    canyon_name: 'Kurz',
    author: 'A',
    date: '2024-01-02',
    segments: [{ type: 'POOL', length_in_meters: 5, angle_in_degrees: 0 }],
  });
  const layout = layoutTopo(topo);
  const bounds = contentBoundsFor(topo, layout);
  assert.ok(
    bounds.maxY >= legendPanelTopMeters(topo) + legendPanelHeightMeters(topo),
    'das Blatt schneidet die Legende ab',
  );
});

test('lange Metadaten verbreitern die Legende, statt sich zu überlappen', () => {
  const plain = normalizeTopo({ ...example, author: '', duration: '' });
  const rich = normalizeTopo({
    ...example,
    author: 'Eine ausgesprochen lange Autorenangabe mit Team',
    duration: 'ungefähr fünfeinhalb bis sechs Stunden',
  });
  const widthOf = (topo) => {
    const layout = layoutTopo(topo);
    const bounds = contentBoundsFor(topo, layout);
    return bounds.maxX - bounds.minX;
  };
  assert.ok(widthOf(rich) > widthOf(plain), 'die Legendenspalte muss mitwachsen');

  // Die Legende darf nicht in das Topo hineinragen.
  const layout = layoutTopo(rich);
  const bounds = contentBoundsFor(rich, layout);
  const svg = renderTopoSvg(rich, layout);
  const panel = /<rect x="([-\d.]+)" y="[-\d.]+" width="([\d.]+)"[^>]*opacity="0.92"/.exec(
    svg,
  );
  assert.ok(panel, 'Legendenkasten fehlt');
  const panelLeft = Number(panel[1]);
  const drawingRight = Math.max(layout.maxX, layout.rowWidthLimit);
  assert.ok(
    panelLeft >= drawingRight,
    `Legende (${panelLeft}) überlappt das Topo (${drawingRight})`,
  );
  assert.ok(Number(panel[1]) + Number(panel[2]) <= bounds.maxX);
});

test('Metadaten wirken sich sofort auf das nächste Rendering aus', () => {
  const topo = normalizeTopo({ ...example, author: '', duration: '' });
  const before = renderTopoSvg(topo, layoutTopo(topo));
  assert.ok(!before.includes('data-meta="duration"'));
  topo.duration = '3 h';
  const after = renderTopoSvg(topo, layoutTopo(topo));
  assert.ok(after.includes('data-meta="duration"'));
  assert.ok(after.includes('3 h'));
});

/* ---------------------------------------------------- Kaskadiert (Spalten) */

console.log('\nKaskadiert-Layout Tests');

const CASCADED = { layout: 'cascaded' };

/** Senkrechte Abseiler gleicher Länge – die Spaltenhöhe ist exakt vorhersagbar. */
function steepTopo(count, lengthInMeters = 10, overrides = {}, extra = {}) {
  return normalizeTopo({
    canyon_name: 'Steil',
    maximum_walk_length: 1000,
    distance_of_single_line: 60,
    ...extra,
    segments: Array.from({ length: count }, (_, index) => ({
      type: 'RAPPEL',
      length_in_meters: lengthInMeters,
      angle_in_degrees: 90,
      ...(overrides[index] || {}),
    })),
  });
}

function columnSegments(layout) {
  return layout.rows.map((column) => column.placements.map((p) => p.index));
}

/** Höhenbedarf einer Spalte, wie ihn die Aufteilung rechnet. */
function columnSpan(column) {
  return column.placements.reduce(
    (sum, p) =>
      sum +
      Math.abs(p.dir.y * p.drawnLength) +
      Math.abs(p.dir.x) * (p.segment.wall_distance_in_meters || 0),
    0,
  );
}

/** Alle Punkte, die eine Spalte tatsächlich belegt. */
function trackedPointsOf(column) {
  return column.placements.flatMap((p) => [
    p.start,
    p.end,
    ...(p.wallBulge ? [p.wallBulge.apex] : []),
    ...p.elements.flatMap((e) => (e.endPoint ? [e.point, e.endPoint] : [e.point])),
  ]);
}

function allNumbersFinite(value, path = 'layout', seen = new Set()) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value) || value === Number.POSITIVE_INFINITY, `${path} = ${value}`);
    assert.ok(!Number.isNaN(value), `${path} ist NaN`);
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (key === 'segment' || key === 'element') continue;
    allNumbersFinite(child, `${path}.${key}`, seen);
  }
}

test('Kaskadiert ist als Layoutmodus bekannt', () => {
  assert.deepEqual(LAYOUT_MODES, ['serpentine', 'cascaded', 'linear']);
  const layout = layoutTopo(steepTopo(3), CASCADED);
  assert.equal(layout.mode, 'cascaded');
  assert.equal(layout.orientation, 'columns');
  assert.equal(layout.columns, layout.rows);
});

test('Kaskadiert teilt automatisch in Spalten auf und hält die Zielhöhe ein', () => {
  const layout = layoutTopo(steepTopo(12, 10), CASCADED); // 120 m Höhe, Ziel 60 m
  assert.equal(layout.columnHeightLimit, 60);
  assert.deepEqual(columnSegments(layout), [
    [0, 1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10, 11],
  ]);
  for (const column of layout.rows) {
    assert.ok(columnSpan(column) <= 60 + 1e-9, `Spalte zu hoch: ${columnSpan(column)}`);
    assert.ok(column.bottom - column.top <= 60 + 1e-9);
  }
});

test('die Spaltenaufteilung folgt der Höhe, nicht der Segmentzahl', () => {
  const short = layoutTopo(steepTopo(12, 5), CASCADED); // 60 m -> 1 Spalte
  const tall = layoutTopo(steepTopo(6, 30), CASCADED); // 180 m -> 3 Spalten
  assert.equal(short.rows.length, 1);
  assert.equal(tall.rows.length, 3);
  // Flache Gehstücke kosten keine Höhe und erzeugen keine eigene Spalte.
  const mixed = steepTopo(6, 20, {
    1: { type: 'WALK', angle_in_degrees: 0, length_in_meters: 25 },
    3: { type: 'WALK', angle_in_degrees: 0, length_in_meters: 25 },
  });
  const mixedLayout = layoutTopo(mixed, CASCADED); // 80 m Höhe
  assert.equal(mixedLayout.rows.length, 2);
});

test('die Spalten werden ausgeglichen gefüllt statt gierig', () => {
  // 7 x 10 m bei 30 m Ziel: gierig ergäbe 3/3/1, ausgeglichen 3/2/2.
  const layout = layoutTopo(
    steepTopo(7, 10, {}, { distance_of_single_line: 30 }),
    CASCADED,
  );
  const sizes = columnSegments(layout).map((column) => column.length);
  assert.equal(sizes.length, 3);
  assert.equal(sizes.reduce((a, b) => a + b, 0), 7);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, sizes.join('/'));
});

test('jede Spalte startet oben bündig, die nächste folgt rechts daneben', () => {
  const topo = steepTopo(12, 10, {
    // Ein Symbol ragt weit über den Start der zweiten Spalte hinaus.
    6: {
      elements: [
        { type: 'STONE', horizontal_start_rel_to_segment_start: 0, vertical_start_rel_to_segment_start: 0 },
      ],
    },
    0: { type: 'WALK', angle_in_degrees: 0, length_in_meters: 10 },
  });
  // Das erste Segment flach, Symbol 9 m über dem Weg (negative lokale y).
  topo.segments[0].elements = [
    { ...topo.segments[6].elements[0], horizontal_start_rel_to_segment_start: 5, vertical_start_rel_to_segment_start: 9 },
  ];
  const layout = layoutTopo(topo, CASCADED);
  assert.ok(layout.rows.length >= 2);
  const tops = layout.rows.map((column) =>
    Math.min(...trackedPointsOf(column).map((point) => point.y)),
  );
  for (const top of tops) assert.ok(Math.abs(top - tops[0]) < 1e-9, `Spalten nicht bündig: ${tops}`);
  assert.ok(tops[0] >= 0, 'nichts ragt über die Blattoberkante');
  layout.rows.forEach((column, index) => {
    assert.ok(Math.abs(column.top - tops[0]) < 1e-9);
    // Innerhalb der Spalte geht es abwärts, in Segmentreihenfolge.
    column.placements.forEach((p, i) => {
      assert.ok(p.end.y >= p.start.y - 1e-9, 'Spalte muss nach unten laufen');
      if (i > 0) assert.deepEqual(p.start, column.placements[i - 1].end);
    });
    if (index > 0) {
      const previous = layout.rows[index - 1];
      assert.ok(column.contentLeft > previous.contentRight, 'nächste Spalte liegt rechts');
      assert.equal(column.continuesBefore, true);
      assert.equal(previous.continuesAfter, true);
    }
  });
});

test('Spaltenabstand ist konstant und nichts überlappt', () => {
  const topo = steepTopo(16, 10, {
    2: { wall_distance_in_meters: 6 },
    5: { type: 'WALK', angle_in_degrees: 0, length_in_meters: 30 },
    9: { angle_in_degrees: 120 },
    12: {
      elements: [
        {
          type: 'PATH',
          horizontal_start_rel_to_segment_start: 0,
          vertical_start_rel_to_segment_start: -3,
          horizontal_end_rel_to_segment_start: 8,
          vertical_end_rel_to_segment_start: -12,
        },
      ],
    },
  });
  const layout = layoutTopo(topo, CASCADED);
  assert.ok(layout.rows.length >= 3);
  const gaps = [];
  layout.rows.forEach((column, index) => {
    for (const point of trackedPointsOf(column)) {
      assert.ok(point.x >= column.contentLeft - 1e-9 && point.x <= column.contentRight + 1e-9);
      assert.ok(point.y >= column.top - 1e-9 && point.y <= column.bottom + 1e-9);
      assert.ok(point.x >= layout.minX - 1e-9 && point.x <= layout.maxX + 1e-9);
      assert.ok(point.y <= layout.height + 1e-9, 'Punkt unter der Blattunterkante');
    }
    assert.ok(column.left < column.contentLeft && column.right > column.contentRight);
    if (index > 0) gaps.push(column.left - layout.rows[index - 1].right);
  });
  for (const gap of gaps) {
    assert.ok(gap > 0, 'Spalten überlappen');
    assert.ok(Math.abs(gap - gaps[0]) < 1e-9, `Abstand nicht konstant: ${gaps}`);
  }
  // Wandausbeulung und Streckenende gehen in die Spaltenbreite ein.
  const bulge = layout.placements[2].wallBulge;
  assert.ok(bulge);
  const bulgeColumn = layout.rows[layout.rowAssignment[2]];
  assert.ok(bulge.apex.x < layout.placements[2].start.x - 5, 'Wand weicht seitlich aus');
  assert.ok(bulgeColumn.contentLeft <= bulge.apex.x + 1e-9);
  const stretch = layout.placements[12].elements[0].endPoint;
  const stretchColumn = layout.rows[layout.rowAssignment[12]];
  assert.ok(stretch.x < layout.placements[12].start.x - 10, 'Streckenende ragt seitlich hinaus');
  assert.ok(stretchColumn.contentLeft <= stretch.x + 1e-9);
});

test('A4 hoch und A4 quer teilen sinnvoll und unterschiedlich in Spalten', () => {
  const topo = steepTopo(24, 10);
  const deviation = (layout, paper) => {
    const bounds = contentBoundsFor(topo, layout);
    return Math.abs(
      Math.log((bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY) / paperAspectRatio(paper)),
    );
  };
  const portrait = layoutTopo(topo, { ...CASCADED, paper: 'a4_portrait' });
  const landscape = layoutTopo(topo, { ...CASCADED, paper: 'a4_landscape' });
  const screen = layoutTopo(topo, { ...CASCADED, paper: 'screen' });
  assert.equal(screen.columnHeightLimit, topo.distance_of_single_line);
  assert.ok(
    portrait.columnHeightLimit > landscape.columnHeightLimit,
    `A4 hoch (${portrait.columnHeightLimit}) muss höhere Spalten haben als A4 quer (${landscape.columnHeightLimit})`,
  );
  assert.ok(
    portrait.rows.length < landscape.rows.length,
    `A4 hoch (${portrait.rows.length}) muss weniger Spalten haben als A4 quer (${landscape.rows.length})`,
  );
  // Jedes Format nutzt sein eigenes Seitenverhältnis besser als das andere.
  assert.ok(deviation(portrait, 'a4_portrait') < deviation(landscape, 'a4_portrait'));
  assert.ok(deviation(landscape, 'a4_landscape') < deviation(portrait, 'a4_landscape'));
  assert.ok(deviation(landscape, 'a4_landscape') <= deviation(screen, 'a4_landscape') + 1e-9);
  assert.ok(deviation(portrait, 'a4_portrait') <= deviation(screen, 'a4_portrait') + 1e-9);
});

test('Spaltenwechsel erzwingen trennt auch bei reichlich Platz', () => {
  const topo = steepTopo(4, 5, { 1: { force_cut_row_after_this_segment: true } });
  assert.deepEqual(columnSegments(layoutTopo(topo, CASCADED)), [[0, 1], [2, 3]]);
  for (const paper of Object.keys(PAPER_PRESETS)) {
    const layout = layoutTopo(topo, { ...CASCADED, paper });
    assert.equal(layout.rowAssignment[1], 0, paper);
    assert.equal(layout.rowAssignment[2], 1, paper);
  }
});

test('Verhindern hält Segmente in derselben Spalte – auch über die Zielhöhe', () => {
  const overrides = {};
  for (let index = 0; index < 9; index += 1) {
    overrides[index] = { do_not_cut_row_after_this_segment: true };
  }
  const topo = steepTopo(12, 10, overrides); // 100 m Kette, Ziel 60 m
  const layout = layoutTopo(topo, CASCADED);
  assert.deepEqual(columnSegments(layout)[0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const column = layout.rows[0];
  assert.ok(columnSpan(column) > layout.columnHeightLimit, 'Kette muss die Zielhöhe sprengen');
  // Nichts wird abgeschnitten: Blatt und SVG wachsen mit.
  assert.ok(layout.height >= column.bottom);
  const bounds = contentBoundsFor(topo, layout);
  assert.ok(bounds.maxY >= column.bottom);
  const svg = renderTopoSvg(topo, layout);
  const viewBox = /viewBox="([^"]+)"/.exec(svg)[1].split(' ').map(Number);
  assert.ok(viewBox[1] + viewBox[3] >= column.bottom);
});

test('Konflikt: Erzwingen schlägt Verhindern auch bei Spalten', () => {
  const topo = steepTopo(4, 5, {
    1: { force_cut_row_after_this_segment: true, do_not_cut_row_after_this_segment: true },
  });
  assert.deepEqual(columnSegments(layoutTopo(topo, CASCADED)), [[0, 1], [2, 3]]);
  // Verhindern davor, Erzwingen danach: beide gelten.
  const chained = steepTopo(12, 10, {
    4: { do_not_cut_row_after_this_segment: true },
    5: { do_not_cut_row_after_this_segment: true },
    6: { force_cut_row_after_this_segment: true },
  });
  const layout = layoutTopo(chained, CASCADED);
  assert.equal(layout.rowAssignment[4], layout.rowAssignment[5]);
  assert.equal(layout.rowAssignment[5], layout.rowAssignment[6]);
  assert.notEqual(layout.rowAssignment[6], layout.rowAssignment[7]);
});

test('jedes Segment genau einmal, in Reihenfolge, ohne NaN/Infinity', () => {
  const topos = [normalizeTopo(example)];
  for (let seed = 1; seed <= 25; seed += 1) topos.push(createRandomTopo({ seed }));
  for (const topo of topos) {
    for (const paper of Object.keys(PAPER_PRESETS)) {
      const layout = layoutTopo(topo, { ...CASCADED, paper });
      const order = columnSegments(layout).flat();
      assert.deepEqual(order, topo.segments.map((_, index) => index));
      assert.equal(layout.placements.length, topo.segments.length);
      for (const column of layout.rows) assert.ok(column.placements.length > 0, 'leere Spalte');
      allNumbersFinite({ ...layout, rowWidthLimit: 0 });
      const bounds = contentBoundsFor(topo, layout);
      for (const value of Object.values(bounds)) assert.ok(Number.isFinite(value));
      const svg = renderTopoSvg(topo, layout, { paper });
      assert.ok(!/NaN|Infinity/.test(svg), `${paper}: NaN/Infinity im SVG`);
    }
  }
});

test('Kaskadiert rendert gültiges SVG für Bildschirm und A4', () => {
  const topo = steepTopo(20, 10, {}, { canyon_name: 'Kaskade' });
  for (const paper of Object.keys(PAPER_PRESETS)) {
    const layout = layoutTopo(topo, { ...CASCADED, paper });
    const svg = renderTopoSvg(topo, layout, { paper, interactive: true });
    assert.ok(svg.startsWith('<svg') && svg.includes('</svg>'));
    const viewBox = /viewBox="([^"]+)"/.exec(svg)[1].split(' ').map(Number);
    const preset = PAPER_PRESETS[paper];
    if (preset.width) {
      assert.equal(
        Math.round((viewBox[2] / viewBox[3]) * 1000),
        Math.round((preset.width / preset.height) * 1000),
      );
    }
    // Je Spalte eine Gruppe, ein eindeutiger Verlauf, Marken an jedem Wechsel.
    const columns = layout.rows.length;
    assert.equal((svg.match(/class="topo-row"/g) || []).length, columns);
    const gradientIds = [...svg.matchAll(/linearGradient id="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(gradientIds).size, columns);
    assert.equal((svg.match(/>\(l\)</g) || []).length, 2 * (columns - 1));
    // Die Geländefüllung bleibt im Spaltenkasten.
    for (const column of layout.rows) {
      const group = new RegExp(`data-row="${column.index}">\\s*<path d="([^"]+)"`).exec(svg)[1];
      const xs = [...group.matchAll(/[MLQ] ([-\d.e]+) /g)].map((m) => Number(m[1]));
      assert.ok(Math.min(...xs) >= column.left - 1e-9 && Math.max(...xs) <= column.right + 1e-9);
      assert.ok(column.left >= viewBox[0] && column.right <= viewBox[0] + viewBox[2]);
    }
    // Die Legende steht rechts neben der letzten Spalte.
    const panel = /<rect x="([-\d.]+)" y="[-\d.]+" width="([-\d.]+)"[^>]*opacity="0.92"/.exec(svg);
    const lastColumn = layout.rows[columns - 1];
    assert.ok(Number(panel[1]) > lastColumn.right, 'Legende kollidiert mit der letzten Spalte');
  }
});

test('Der Drag-Rahmen friert Spaltenzuordnung und -lage ein', () => {
  const topo = steepTopo(12, 10, {
    3: {
      elements: [
        { type: 'STONE', horizontal_start_rel_to_segment_start: 2, vertical_start_rel_to_segment_start: 1 },
      ],
    },
  });
  for (const paper of Object.keys(PAPER_PRESETS)) {
    const frame = layoutTopo(topo, { ...CASCADED, paper });
    const element = topo.segments[3].elements[0];
    const before = { ...element };
    element.horizontal_start_rel_to_segment_start = 30;
    element.vertical_start_rel_to_segment_start = -80;
    const dragged = layoutTopo(topo, { ...CASCADED, paper, frame });
    assert.deepEqual(dragged.rowAssignment, frame.rowAssignment, paper);
    assert.equal(dragged.columnHeightLimit, frame.columnHeightLimit);
    dragged.rows.forEach((column, index) => {
      assert.equal(column.offsetX, frame.rows[index].offsetX, `${paper}: Spalte ${index} verrutscht`);
      assert.equal(column.offsetY, frame.rows[index].offsetY);
    });
    dragged.placements.forEach((p, index) => {
      assert.deepEqual(p.start, frame.placements[index].start, `${paper}: Segment ${index} verschoben`);
    });
    assert.equal(dragged.minX, frame.minX);
    assert.ok(dragged.width >= frame.width && dragged.height >= frame.height);
    // Das gezogene Symbol lässt sich weiterhin in lokale Koordinaten zurückrechnen.
    const placed = dragged.placements[3].elements[0];
    const local = worldToLocal(dragged.placements[3], placed.point);
    assert.ok(Math.abs(local.horizontal - 30) < 1e-9 && Math.abs(local.vertical + 80) < 1e-9);
    Object.assign(element, before);
    // Ein Rahmen aus einem anderen Modus wird nicht übernommen.
    const serpentineFrame = layoutTopo(topo, { paper });
    const fresh = layoutTopo(topo, { ...CASCADED, paper, frame: serpentineFrame });
    assert.deepEqual(fresh.rowAssignment, frame.rowAssignment);
    assert.equal(fresh.orientation, 'columns');
  }
});

test('Serpentine und Linear bleiben vom neuen Modus unberührt', () => {
  const topo = normalizeTopo(example);
  for (const paper of Object.keys(PAPER_PRESETS)) {
    const implicit = layoutTopo(topo, { paper });
    const explicit = layoutTopo(topo, { layout: 'serpentine', paper });
    assert.equal(implicit.mode, 'serpentine');
    assert.deepEqual(implicit.rowAssignment, explicit.rowAssignment);
    assert.equal(implicit.orientation, undefined);
    for (const row of implicit.rows) {
      assert.equal(row.left, undefined, 'Zeilen füllen weiterhin die ganze Breite');
      assert.equal(row.placements[0].start.x, 0);
    }
    const linear = layoutTopo(topo, { layout: 'linear', paper });
    assert.equal(linear.rows.length, 1);
    assert.equal(linear.rowWidthLimit, Number.POSITIVE_INFINITY);
    const svg = renderTopoSvg(topo, implicit, { paper });
    const bounds = fitBoundsToPaper(contentBoundsFor(topo, implicit), paper);
    // Das Gelände der Serpentine reicht weiterhin über die volle Blattbreite.
    assert.ok(svg.includes(`L ${bounds.maxX} `) && svg.includes(`L ${bounds.minX} `));
  }
});

test('ohne Gumpentiefe bleiben alle Layouts und Renderstile byte-identisch', () => {
  const topo = normalizeTopo(example);
  const layouts = [];
  const svgs = [];
  for (const layout of LAYOUT_MODES) {
    for (const paper of Object.keys(PAPER_PRESETS)) {
      const data = layoutTopo(topo, { layout, paper });
      layouts.push(JSON.stringify(data, (key, value) => key === 'segment' ? undefined : value));
      for (const theme of ['color', 'bw', 'alpiner_classic', 'eau_froide']) {
        svgs.push(renderTopoSvg(topo, data, { theme, paper }));
      }
    }
  }
  const hash = (values) => createHash('sha256').update(values.join('\n')).digest('hex');
  assert.equal(hash(layouts), 'fbbe6919511d3e2f72f2cce5536841b86bce83f9703df379135bca0798d17618');
  assert.equal(hash(svgs), '692f2cf20936f2dadeeef28672b09b6886b38ba78f5045934744fd6166bdf0ea');
});

test('Gumpen-Zeichentiefe skaliert gedämpft und begrenzt, WEIR bleibt unverändert', () => {
  for (const [depth, expected] of [[null, 2.2], [0, 1.2], [0.1, 1.2], [2.5, 2], [4, 2.6], [8, 4.2], [10, 5], [100, 5]]) {
    const topo = flatTopo(1, 8, { 0: { depth_in_meters: depth } });
    assert.equal(poolDrawingDepthOf(topo.segments[0]), expected);
    const data = layoutTopo(topo);
    const p = data.placements[0];
    const curve = `Q ${(p.start.x + p.end.x) / 2} ${Math.max(p.start.y, p.end.y) + expected} ${p.end.x} ${p.end.y}`;
    const svg = renderTopoSvg(topo, data);
    assert.equal(svg.split(curve).length - 1, 3, 'Gelände, Geländelinie und Wasser müssen dieselbe Tiefe verwenden');
    assert.equal(svg.includes('topo-pool-depth'), depth !== null);
    if (depth !== null) assert.ok(svg.includes(`>T ${depth} m</text>`));
  }
  const weir = flatTopo(1, 8, { 0: { type: 'WEIR', depth_in_meters: 100 } });
  assert.equal(poolDrawingDepthOf(weir.segments[0]), 2.2);
  assert.equal(renderTopoSvg(weir, layoutTopo(weir)).includes('topo-pool-depth'), false);
});

test('Gumpentiefe und Label passen in alle Layout-/Papiermodi ohne Zeilenkollision', () => {
  for (const mode of LAYOUT_MODES) {
    for (const paper of Object.keys(PAPER_PRESETS)) {
      for (const angle of [-20, 0, 20]) {
        const topo = flatTopo(4, 8, {
          0: { depth_in_meters: 2.5, angle_in_degrees: angle, force_cut_row_after_this_segment: true },
          1: { depth_in_meters: 100, angle_in_degrees: angle, force_cut_row_after_this_segment: true },
          2: { depth_in_meters: 4, angle_in_degrees: angle, force_cut_row_after_this_segment: true },
          3: { depth_in_meters: 0, angle_in_degrees: angle },
        });
        const data = layoutTopo(topo, { layout: mode, paper });
        const bounds = contentBoundsFor(topo, data);
        for (const p of data.placements) {
          const label = poolDepthLabelFor(p);
          const row = data.rows[p.rowIndex];
          assert.ok(label.y + 0.3 <= row.bottom + 1e-9, 'Label ragt aus der Zeile');
          assert.ok(Math.max(p.start.y, p.end.y) + poolDrawingDepthOf(p.segment) / 2 <= row.bottom);
          assert.ok(label.x - label.halfWidth >= bounds.minX && label.x + label.halfWidth <= bounds.maxX);
          assert.ok(label.y < bounds.maxY);
        }
        if (mode === 'serpentine') {
          for (let index = 1; index < data.rows.length; index += 1) {
            assert.ok(data.rows[index - 1].bottom + 14 < data.rows[index].top, 'Gelände ragt in nächste Zeile');
          }
        }
        for (const theme of ['color', 'bw', 'alpiner_classic', 'eau_froide']) {
          const svg = renderTopoSvg(topo, data, { theme, paper });
          assert.equal((svg.match(/class="topo-pool-depth"/g) || []).length, 4);
          for (const text of ['T 2.5 m', 'T 100 m', 'T 4 m', 'T 0 m']) assert.ok(svg.includes(`>${text}</text>`));
          assert.equal(/NaN|Infinity/.test(svg), false);
        }
      }
    }
  }
  const unknown = layoutTopo(flatTopo(2, 8, { 0: { force_cut_row_after_this_segment: true } }));
  const shallow = layoutTopo(flatTopo(2, 8, { 0: { depth_in_meters: 1, force_cut_row_after_this_segment: true } }));
  const deep = layoutTopo(flatTopo(2, 8, { 0: { depth_in_meters: 100, force_cut_row_after_this_segment: true } }));
  assert.ok(deep.rows[1].offsetY > shallow.rows[1].offsetY);
  assert.ok(shallow.rows[1].offsetY > unknown.rows[1].offsetY);
  const unknownColumns = layoutTopo(flatTopo(4), { layout: 'cascaded' });
  const depthColumns = layoutTopo(flatTopo(4, 10, Object.fromEntries([0, 1, 2, 3].map((index) => [index, { depth_in_meters: 8 }]))), { layout: 'cascaded' });
  assert.ok(depthColumns.height > unknownColumns.height, 'Spaltenhöhenbedarf ignoriert Tiefe');
});

console.log(`\n${passed} Test(s) bestanden.`);
