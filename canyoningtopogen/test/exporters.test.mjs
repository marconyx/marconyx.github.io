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

console.log(`\n${passed} Test(s) bestanden.`);
