/**
 * Export-Hilfsfunktionen (slugify, Druck-Titel-Escaping):
 *   node test/exporters.test.mjs
 */
import assert from 'node:assert/strict';

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

console.log('Export-Hilfsfunktionen Tests');

/** Minimaler Fake-DOM, nur für printSvg: iframe mit beschreibbarem Dokument. */
class FakeIframeDocument {
  open() {}
  write(html) {
    this.written = (this.written || '') + html;
  }
  close() {}
}

class FakeIframe {
  constructor() {
    this.style = {};
    this.contentDocument = new FakeIframeDocument();
    this.contentWindow = { focus() {}, print() {} };
    this.removed = false;
  }
  remove() {
    this.removed = true;
  }
}

function withFakeDocument(run) {
  const created = [];
  const originalDocument = globalThis.document;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.document = {
    createElement: (tag) => {
      const node = tag === 'iframe' ? new FakeIframe() : new FakeIframe();
      created.push(node);
      return node;
    },
    body: { appendChild: () => {} },
  };
  // printSvg verzögert Fokus/Druck/Entfernen per setTimeout; synchron ausführen.
  globalThis.setTimeout = (fn) => {
    fn();
    return 0;
  };
  try {
    run();
    return created[0];
  } finally {
    globalThis.document = originalDocument;
    globalThis.setTimeout = originalSetTimeout;
  }
}

const { printSvg, slugify } = await import('../src/exporters.js');
const { topoToShortList, topoFromShortList, ShortListError } = await import('../src/io-shortlist.js');
const { normalizeTopo, SEGMENT_SHORTCUTS } = await import('../src/model.js');
const { drawnLengthOf } = await import('../src/layout.js');

test('slugify entfernt Akzente, Sonderzeichen und normalisiert Grossschreibung', () => {
  assert.equal(slugify('Schlücht Été 2026'), 'schlucht-ete-2026');
  assert.equal(slugify(''), 'topo');
  assert.equal(slugify('   '), 'topo');
});

test('printSvg escaped den Titel, damit Sonderzeichen das Druckdokument nicht zerbrechen', () => {
  const frame = withFakeDocument(() => {
    printSvg('<svg></svg>', 'Val d\'<Été> & "Gorges"');
  });
  assert.ok(frame.contentDocument.written.includes(
    '<title>Val d\'&lt;Été&gt; &amp; "Gorges"</title>',
  ), 'Titel wurde nicht korrekt escaped: ' + frame.contentDocument.written.slice(0, 200));
  // Das SVG selbst bleibt unverändert (kein zusätzliches Escaping von Inhalt).
  assert.ok(frame.contentDocument.written.includes('<svg></svg>'));
});

test('printSvg kommt ohne Titel klar (leerer String statt "undefined")', () => {
  const frame = withFakeDocument(() => {
    printSvg('<svg></svg>', undefined);
  });
  assert.ok(frame.contentDocument.written.includes('<title></title>'));
});

test('Drucktitel kann das HTML-Dokument nicht verlassen', () => {
  const title = `Ä😀 & </title><script>globalThis.pwned=1</script> "'`;
  const frame = withFakeDocument(() => printSvg('<svg></svg>', title));
  assert.ok(frame.contentDocument.written.includes('&lt;/title&gt;&lt;script&gt;'));
  assert.doesNotMatch(frame.contentDocument.written, /<script>/);
});

function shortListTopo(threshold = null) {
  return normalizeTopo({
    canyon_name: 'Test',
    length_shortening_threshold_meters: threshold,
    segments: [
      { type: 'WALK', length_in_meters: 120, duration_to_walk_in_min: 15 },
      { type: 'RAPPEL_DRY', length_in_meters: 12.5, wall_distance_in_meters: 2 },
      { type: 'POOL', length_in_meters: 4, depth_in_meters: 3 },
      { type: 'RAPPEL_WET', length_in_meters: 35 },
      { type: 'JUMP', length_in_meters: 4 },
      { type: 'SLIDE', length_in_meters: 6.25, elements: [{ type: 'BOLT' }] },
      { type: 'RAPPEL', length_in_meters: 8 },
    ],
  });
}

test('Kurzliste: Topo-Reihenfolge und Dezimalwerte ungerundet', () => {
  const { text, count } = topoToShortList(shortListTopo());
  assert.equal(count, 7);
  assert.equal(
    text,
    'W120\nRD12.5\nP4\nRW35\nJ4\nS6.25\nR8\n',
  );
  assert.doesNotMatch(text, /BOLT|Test|min|wall|depth/);
});

test('Kurzliste: aktive Darstellungsverkürzung ändert die Meterangaben nicht', () => {
  const shortened = shortListTopo(20);
  assert.equal(drawnLengthOf(shortened.segments[0], 20), 20, 'Zeichnung ist gekappt');
  assert.equal(topoToShortList(shortened).text, topoToShortList(shortListTopo()).text);
  assert.match(topoToShortList(shortened).text, /^W120$/m);
});

test('Kurzliste: ungültige oder unbekannte Segmente werden nicht ausgelassen', () => {
  assert.deepEqual(topoToShortList({ segments: [] }), { text: '', count: 0 });
  const invalid = { segments: [
    { type: 'WALK', length_in_meters: 2 },
    { type: 'UNKNOWN', length_in_meters: 3 },
    { type: 'POOL', length_in_meters: 0 },
    { type: 'JUMP', length_in_meters: Number.NaN },
    { length_in_meters: null },
    { type: 'CLIMB', length_in_meters: Infinity },
  ] };
  assert.throws(() => topoToShortList(invalid), (error) => {
    assert.ok(error instanceof ShortListError);
    assert.deepEqual(error.issues, [
      { position: 2, code: 'type' }, { position: 3, code: 'length' },
      { position: 4, code: 'length' }, { position: 5, code: 'type' },
      { position: 5, code: 'length' }, { position: 6, code: 'length' },
    ]);
    return true;
  });
});

test('alle Typen und extreme endliche Werte überleben Export und Import', () => {
  const types = Object.values(SEGMENT_SHORTCUTS);
  const values = [10, 23, 12.5, 0.0000001, 1e21, Number.MIN_VALUE, Number.MAX_VALUE, 2.75, 4];
  const topo = normalizeTopo({
    canyon_name: 'Nicht in TXT', segments: types.map((type, i) => ({ type, length_in_meters: values[i] })),
  });
  const result = topoToShortList(topo);
  assert.equal(result.count, types.length);
  const restored = topoFromShortList(result.text);
  assert.deepEqual(restored.segments.map((s) => [s.type, s.length_in_meters]),
    types.map((type, i) => [type, values[i]]));
  assert.equal(restored.canyon_name, 'My Canyon');
  assert.ok(restored.segments.every((segment) => segment.elements.length === 0));
});

test('Import akzeptiert Kurzlisten-Exporte mit Zeilenenden, BOM und altem nummeriertem Format', () => {
  const topo = topoFromShortList('\uFEFF  r10\r\n\rW120\nRD23\r rw12,5 \n4. WALK: 0.0000001 m\n5. RAPPEL_DRY: 1e+21 m\n');
  assert.deepEqual(topo.segments.map((s) => [s.type, s.length_in_meters]), [
    ['RAPPEL', 10], ['WALK', 120], ['RAPPEL_DRY', 23], ['RAPPEL_WET', 12.5],
    ['WALK', 1e-7], ['RAPPEL_DRY', 1e21],
  ]);
});

test('WA wird in Kurzlisten mit Zeilennummer abgewiesen', () => {
  for (const entry of ['WA120', 'wa 120', 'Wa12,5']) {
    assert.throws(() => topoFromShortList(`R10\n${entry}\nW20`), (error) => {
      assert.ok(error instanceof ShortListError);
      assert.deepEqual(error.issues, [{ position: 2, code: 'shortcut.unknown' }]);
      return true;
    });
  }
});

test('alte WEIR-Kürzel werden mit Zeilennummer abgewiesen', () => {
  for (const text of ['R10\nWE4', 'R10\n2. WEIR: 4 m']) {
    assert.throws(() => topoFromShortList(text), (error) =>
      error instanceof ShortListError && error.issues[0].position === 2 &&
      error.issues[0].code === 'shortcut.removed_weir');
  }
});

test('Import meldet jede ungültige Zeile und lehnt leere Dateien ab', () => {
  assert.throws(() => topoFromShortList('R10\n\nX5\nRD\n3. UNKNOWN: 2 m\nR-2\nR20 P2'), (error) => {
    assert.ok(error instanceof ShortListError);
    assert.deepEqual(error.issues.map((issue) => issue.position), [3, 4, 5, 6, 7]);
    return true;
  });
  for (const text of ['', '\uFEFF \n\r\n']) {
    assert.throws(() => topoFromShortList(text), (error) => error.issues[0].code === 'empty');
  }
});

console.log(`\n${passed} Test(s) bestanden.`);
