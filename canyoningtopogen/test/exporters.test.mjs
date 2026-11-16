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

const { printSvg, slugify, topoToShortList } = await import('../src/exporters.js');
const { normalizeTopo } = await import('../src/model.js');
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

function shortListTopo(threshold = null) {
  return normalizeTopo({
    canyon_name: 'Test',
    length_shortening_threshold_meters: threshold,
    segments: [
      { type: 'WALK', length_in_meters: 120, duration_to_walk_in_min: 15 },
      { type: 'RAPPEL_DRY', length_in_meters: 12.5, wall_distance_in_meters: 2 },
      { type: 'POOL', length_in_meters: 0, depth_in_meters: 3 },
      { type: 'RAPPEL_WET', length_in_meters: 35 },
      { type: 'JUMP', length_in_meters: -4 },
      { type: 'SLIDE', length_in_meters: 6.25, elements: [{ type: 'BOLT' }] },
      { type: 'RAPPEL', length_in_meters: 8 },
    ],
  });
}

test('Kurzliste: Topo-Reihenfolge, nur positive Längen, Dezimalwerte ungerundet', () => {
  const { text, count } = topoToShortList(shortListTopo());
  assert.equal(count, 5);
  assert.equal(
    text,
    '1. WALK: 120 m\n2. RAPPEL_DRY: 12.5 m\n3. RAPPEL_WET: 35 m\n4. SLIDE: 6.25 m\n5. RAPPEL: 8 m\n',
  );
  assert.doesNotMatch(text, /POOL|JUMP|BOLT|Test|min|wall|depth/);
});

test('Kurzliste: aktive Darstellungsverkürzung ändert die Meterangaben nicht', () => {
  const shortened = shortListTopo(20);
  assert.equal(drawnLengthOf(shortened.segments[0], 20), 20, 'Zeichnung ist gekappt');
  assert.equal(topoToShortList(shortened).text, topoToShortList(shortListTopo()).text);
  assert.match(topoToShortList(shortened).text, /^1\. WALK: 120 m$/m);
});

test('Kurzliste: ohne gültige Längen leer statt Scheinerfolg', () => {
  const topo = normalizeTopo({ segments: [{ type: 'POOL', length_in_meters: 0 }] });
  assert.deepEqual(topoToShortList(topo), { text: '', count: 0 });
  assert.deepEqual(topoToShortList({ segments: [] }), { text: '', count: 0 });
  assert.deepEqual(topoToShortList({ segments: [{ type: 'WALK', length_in_meters: Number.NaN }] }), { text: '', count: 0 });
});

console.log(`\n${passed} Test(s) bestanden.`);
