/**
 * UI-Tests gegen ein minimales DOM: die echte App (`src/app.js`) wird geladen,
 * Eingaben werden wie im Browser als Events ausgelöst und das gerenderte SVG
 * geprüft.
 *   node test/ui.test.mjs
 */
import assert from 'node:assert/strict';

/* ------------------------------------------------------------- DOM-Attrappe */

const registry = new Map();

class ClassList {
  constructor() {
    this.set = new Set();
  }
  add(...names) {
    for (const name of names) this.set.add(name);
  }
  remove(...names) {
    for (const name of names) this.set.delete(name);
  }
  toggle(name, force) {
    const on = force === undefined ? !this.set.has(name) : !!force;
    if (on) this.set.add(name);
    else this.set.delete(name);
    return on;
  }
  contains(name) {
    return this.set.has(name);
  }
}

class FakeNode {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.classList = new ClassList();
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = new Map();
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.hidden = false;
    this.disabled = false;
    this.files = [];
    this.options = [];
    this._innerHTML = '';
    this._id = '';
  }

  get id() {
    return this._id;
  }
  set id(value) {
    this._id = value;
    if (value) registry.set(value, this);
  }

  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(value) {
    this._innerHTML = String(value);
    this.children = [];
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener() {}

  dispatch(type, extra = {}) {
    for (const handler of this.listeners.get(type) || []) {
      handler({
        type,
        target: this,
        preventDefault() {},
        stopPropagation() {},
        ...extra,
      });
    }
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    if (node.tagName === 'OPTION') this.options.push(node);
    return node;
  }
  append(...items) {
    for (const item of items) {
      if (item && typeof item === 'object') this.appendChild(item);
      else this.textContent += String(item);
    }
  }
  replaceChildren(...items) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.options = [];
    this.textContent = '';
    this.append(...items);
  }
  remove() {
    const parent = this.parentNode;
    if (!parent) return;
    parent.children = parent.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  closest() {
    return null;
  }
  /** Reicht für `$('svg-host').querySelector('svg')` im Zoom-Code. */
  querySelector(selector) {
    if (selector !== 'svg') return null;
    const width = / width="(\d+)"/.exec(this._innerHTML);
    const height = / height="(\d+)"/.exec(this._innerHTML);
    if (!width) return null;
    return {
      getAttribute: (name) =>
        name === 'width' ? width[1] : name === 'height' ? height?.[1] : null,
      clientWidth: Number(width[1]),
      clientHeight: Number(height?.[1] || 0),
    };
  }
  get clientWidth() {
    return 1000;
  }
  get clientHeight() {
    return 700;
  }
  /** Alle Nachfahren, flach. */
  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
}

function elementById(id) {
  if (!registry.has(id)) {
    const node = new FakeNode('div');
    node.id = id;
  }
  return registry.get(id);
}

const documentStub = {
  getElementById: elementById,
  createElement: (tag) => new FakeNode(tag),
  body: new FakeNode('body'),
  addEventListener() {},
};

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
globalThis.document = documentStub;
globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  location: { href: 'http://localhost/', origin: 'http://localhost' },
};
globalThis.fetch = async () => {
  throw new Error('offline');
};
globalThis.FileReader = class {
  readAsDataURL() {}
};

import { readFileSync } from 'node:fs';

import { PROMPT_TEMPLATES, getAiSettings, providerById } from '../src/ai.js';
import { SEGMENT_TYPES, validateTopo, createEmptyTopo } from '../src/model.js';
import { symbolOptions } from '../src/symbols.js';
import { topoToJson } from '../src/io-json.js';
import { topoToXml } from '../src/io-xml.js';
import { initPanelSections, PANEL_SECTION_IDS, PANEL_STORAGE_KEY } from '../src/panel-sections.js';
import { initResponsive, MOBILE_QUERY, VIEWS, DEFAULT_VIEW } from '../src/responsive.js';

const markup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const panelHeaders = [...markup.matchAll(
  /<details class="panel__section" id="([^"]+)" open>\s*<summary>(.*?)<\/summary>\s*<div class="panel__content">/gs,
)];
const markupRoot = new FakeNode('root');
const markupNodes = new Map();
const markupStack = [markupRoot];
for (const [tag] of markup.matchAll(/<\/?(?:aside|details|summary|div)\b[^>]*>/g)) {
  if (tag.startsWith('</')) {
    markupStack.pop();
    continue;
  }
  const node = new FakeNode(/^<(\w+)/.exec(tag)[1]);
  node._id = /\bid="([^"]+)"/.exec(tag)?.[1] || '';
  markupStack.at(-1).appendChild(node);
  markupStack.push(node);
  if (node.id) markupNodes.set(node.id, node);
}
for (const [, id] of panelHeaders) {
  const node = new FakeNode('details');
  node.id = id;
  node.open = true;
}

const app = await import('../src/app.js');
const { state } = app;

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

const svg = () => elementById('svg-host').innerHTML;

/** Tippen wie im Browser: `input` pro Zeichen, `change` beim Verlassen. */
function type(id, text, { commit = false } = {}) {
  const node = elementById(id);
  node.value = '';
  node.dispatch('input');
  for (const character of text) {
    node.value += character;
    node.dispatch('input');
  }
  if (commit) node.dispatch('change');
}

console.log('UI-Tests (DOM)');

test('bachab-Logo steht nur in der responsiven App-Kopfzeile neben Titel und Status', () => {
  const header = /<header class="toolbar">([\s\S]*?)<\/header>/.exec(markup)?.[1];
  assert.ok(header);
  assert.match(header, /<div class="toolbar__brand">\s*<img class="toolbar__logo" src="assets\/bachab-logo\.png" alt="bachab" width="400" height="133" \/>\s*<div class="toolbar__brand-text">\s*<strong>Canyoning Topo Generator<\/strong>\s*<span class="toolbar__hint" id="status">bereit<\/span>/);
  assert.equal((markup.match(/assets\/bachab-logo\.png/g) || []).length, 1);
  const image = readFileSync(new URL('../assets/bachab-logo.png', import.meta.url));
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16), 400);
  assert.equal(image.readUInt32BE(20), 133);
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.toolbar\s*\{[^}]*flex-wrap: wrap;/);
  assert.match(css, /\.toolbar__brand\s*\{[^}]*align-items: center;[^}]*min-width: 0;[^}]*max-width: 100%;/);
  assert.match(css, /\.toolbar__logo\s*\{[^}]*flex: none;[^}]*width: auto;[^}]*height: 1rem;/);
  assert.match(css, /\.toolbar__brand-text\s*\{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/);
  assert.match(css, /\.toolbar__group\s*\{[^}]*flex-wrap: wrap;[^}]*max-width: 100%;/);
  for (const id of ['btn-new', 'btn-save-json', 'btn-export-svg', 'btn-export-png', 'btn-print', 'btn-undo']) {
    assert.ok(header.includes(`id="${id}"`), `${id} bleibt in der Kopfzeile`);
  }
  assert.doesNotMatch(svg(), /bachab-logo|alt="bachab"/, 'kein Logo im Topo-Export');
});

test('alle sieben Abschnitte haben native, fokussierbare summary-Überschriften und offene Defaults', () => {
  assert.deepEqual(panelHeaders.map((entry) => entry[1]), PANEL_SECTION_IDS);
  assert.equal((markup.match(/class="panel__section"/g) || []).length, 7);
  assert.deepEqual(panelHeaders.map((entry) => /<h[23]>(.*?)<\/h[23]>/.exec(entry[2])?.[1]),
    ['Topo', 'Segmente', 'Foto-Referenz', 'AI-Erkennung', 'Auswahl', 'Symbole', 'Prüfung']);
  for (const [, id, summary] of panelHeaders) {
    const heading = id === 'panel-ai' ? 'h3' : 'h2';
    assert.ok(summary.startsWith(`<span class="panel__arrow" aria-hidden="true"></span><${heading}>`));
    assert.equal(elementById(id).open, true, id);
    assert.equal(elementById(id).listeners.has('keydown'), false, 'Tastatur bleibt nativ');
    assert.equal(elementById(id).listeners.has('click'), false, 'Klick bleibt nativ');
  }
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.panel__arrow::before\s*\{\s*content: '▶';/);
  assert.match(css, /\.panel__section\[open\] > summary \.panel__arrow::before\s*\{\s*content: '◀';/);
  assert.match(css, /\.panel__section > summary:focus-visible/);
  assert.match(css, /\.panel__section > summary:hover/);
  assert.doesNotMatch(css, /\.panel__section\s*\{[^}]*display:/, 'details bleibt nativ, nicht flex');
});

test('AI ist ein eingerückter Unterabschnitt der Foto-Referenz, nicht der Seitenleiste', () => {
  const photo = markupNodes.get('panel-photo');
  const ai = markupNodes.get('panel-ai');
  assert.equal(photo.parentNode.tagName, 'ASIDE');
  assert.equal(ai.parentNode.tagName, 'DIV');
  assert.equal(ai.parentNode.parentNode, photo);
  assert.equal(ai.children[0].tagName, 'SUMMARY');
  assert.equal(markupNodes.get('ai-settings').parentNode.parentNode, ai);
  assert.equal(photo.parentNode.children.filter((node) => node.tagName === 'DETAILS').length, 3);
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.panel__content > \.panel__section\s*\{[^}]*min-width: 0;[^}]*padding: 0 0 0 0\.75rem;[^}]*border-bottom: none;/);
  assert.match(css, /\.panel__section h3\s*\{[^}]*font-size: 0\.74rem;/);
});

test('AI-Erkennung und Einstellungen verwenden exakt dieselbe gezielte Typografie', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const shared = /#ai-settings summary,\s*#panel-ai > summary h3\s*\{([^}]+)\}/.exec(css);
  assert.ok(shared, 'gemeinsame Regel statt globaler h3-Änderung');
  for (const declaration of [
    'font-family: inherit', 'font-size: 0.78rem', 'font-weight: normal',
    'font-style: normal', 'text-transform: none', 'letter-spacing: normal',
  ]) {
    assert.ok(shared[1].includes(`${declaration};`), declaration);
  }
  assert.match(markup, /<summary><span class="panel__arrow" aria-hidden="true"><\/span><h3>AI-Erkennung<\/h3><\/summary>/);
});

function freshPanels() {
  const nodes = new Map(PANEL_SECTION_IDS.map((id) => {
    const node = new FakeNode('details');
    // Nicht in die Registry der laufenden App eintragen.
    node._id = id;
    node.open = true;
    return [id, node];
  }));
  const photoContent = new FakeNode('div');
  nodes.get('panel-photo').appendChild(photoContent);
  photoContent.appendChild(nodes.get('panel-ai'));
  initPanelSections({ getElementById: (id) => nodes.get(id) });
  return [...nodes.values()];
}

test('jeder Abschnitt lässt sich unabhängig schliessen, wieder öffnen und nach Reload wiederherstellen', () => {
  const beforeTopo = storage.get('canyon-topo-generator/state/v1');
  const beforeJson = topoToJson(state.topo);
  const beforeXml = topoToXml(state.topo);
  for (const id of PANEL_SECTION_IDS) {
    const section = elementById(id);
    section.open = false;
    section.dispatch('toggle');
    assert.equal(JSON.parse(storage.get(PANEL_STORAGE_KEY))[id], false);
    assert.equal(freshPanels().find((node) => node.id === id).open, false);
    for (const otherId of PANEL_SECTION_IDS.filter((other) => other !== id)) {
      assert.equal(elementById(otherId).open, true, otherId);
    }
    section.open = true;
    section.dispatch('toggle');
    assert.equal(JSON.parse(storage.get(PANEL_STORAGE_KEY))[id], true);
    assert.ok(freshPanels().every((node) => node.open));
  }
  assert.equal(storage.get('canyon-topo-generator/state/v1'), beforeTopo);
  assert.equal(topoToJson(state.topo), beforeJson);
  assert.equal(topoToXml(state.topo), beforeXml);
  assert.equal('panels' in state, false);
});

test('Foto-Zuklappen versteckt AI und erhält deren unabhängig gespeicherten Zustand nach Reload', () => {
  const beforeAiSettings = getAiSettings();
  const aiContentVisible = (ai) => {
    for (let node = ai; node; node = node.parentNode) {
      if (node.tagName === 'DETAILS' && !node.open) return false;
    }
    return true;
  };
  try {
    for (const aiOpen of [true, false]) {
      storage.delete(PANEL_STORAGE_KEY);
      let sections = freshPanels();
      let photo = sections.find((node) => node.id === 'panel-photo');
      let ai = sections.find((node) => node.id === 'panel-ai');
      ai.open = aiOpen;
      ai.dispatch('toggle');
      photo.open = false;
      photo.dispatch('toggle');
      assert.equal(ai.open, aiOpen);
      assert.equal(aiContentVisible(ai), false);
      assert.equal(JSON.parse(storage.get(PANEL_STORAGE_KEY))['panel-ai'], aiOpen);
      sections = freshPanels();
      photo = sections.find((node) => node.id === 'panel-photo');
      ai = sections.find((node) => node.id === 'panel-ai');
      assert.equal(photo.open, false);
      assert.equal(ai.open, aiOpen);
      assert.equal(aiContentVisible(ai), false);
      photo.open = true;
      photo.dispatch('toggle');
      assert.equal(ai.open, aiOpen);
      assert.equal(aiContentVisible(ai), aiOpen);
      assert.equal(JSON.parse(storage.get(PANEL_STORAGE_KEY))['panel-photo'], true);
      assert.equal(freshPanels().find((node) => node.id === 'panel-ai').open, aiOpen);
    }
    assert.deepEqual(getAiSettings(), beforeAiSettings);
  } finally {
    storage.delete(PANEL_STORAGE_KEY);
  }
});

test('partielle Einstellungen beachten nur boolesche Werte und bekannte IDs', () => {
  storage.set(PANEL_STORAGE_KEY, JSON.stringify({
    'panel-topo': false,
    'panel-segments': 'false',
    'panel-photo': true,
    'unknown-panel': false,
  }));
  assert.deepEqual(freshPanels().map((node) => node.open), [false, true, true, true, true, true, true]);
  storage.delete(PANEL_STORAGE_KEY);
  assert.ok(freshPanels().every((node) => node.open));
});

test('ungültige oder gesperrte Speicherung meldet das Problem, ohne das Klappen zu verhindern', () => {
  const originalWarn = console.warn;
  const originalStorage = globalThis.localStorage;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    for (const value of ['{', 'null', '[]', 'false']) {
      storage.set(PANEL_STORAGE_KEY, value);
      assert.ok(freshPanels().every((node) => node.open));
    }
    globalThis.localStorage = {
      getItem() { throw new Error('Speicher gesperrt'); },
      setItem() { throw new Error('Speicher voll'); },
    };
    const sections = freshPanels();
    for (const section of sections) {
      section.open = false;
      section.dispatch('toggle');
      assert.equal(section.open, false);
    }
    assert.equal(warnings.length, 12);
  } finally {
    console.warn = originalWarn;
    globalThis.localStorage = originalStorage;
    storage.delete(PANEL_STORAGE_KEY);
  }
});

test('bestehende Felder bleiben in ihrem Abschnitt und AI-Einstellungen separat klappbar', () => {
  const expected = [
    [
      'topo-name',
      'topo-author',
      'topo-duration',
      'topo-date',
      'topo-length-shortening-threshold',
      'btn-renumber',
    ],
    ['select-new-segment', 'btn-add-segment', 'segment-list'],
    ['file-photo', 'photo-page-row', 'photo-opacity', 'photo-scale', 'photo-x', 'photo-y', 'btn-photo-clear'],
    ['btn-photo-ai', 'btn-ai-cancel', 'ai-status', 'ai-settings', 'ai-provider', 'ai-model', 'ai-key'],
    ['inspector'],
    ['symbol-palette'],
    ['issues'],
  ];
  for (const [index, header] of panelHeaders.entries()) {
    const end = panelHeaders[index + 1]?.index ?? markup.length;
    const content = markup.slice(header.index, end);
    for (const id of expected[index]) {
      assert.ok(content.includes(`id="${id}"`), `${header[1]}: ${id}`);
      assert.equal(markup.split(`id="${id}"`).length - 1, 1, `eindeutige ID ${id}`);
    }
  }
  assert.match(markup, /<details id="ai-settings">\s*<summary>Einstellungen<\/summary>/);
  // Die vorhandenen Editor-/Inspector-/AI-Tests laufen auch bei geschlossenen Abschnitten.
  for (const id of PANEL_SECTION_IDS) {
    elementById(id).open = false;
    elementById(id).dispatch('toggle');
  }
});

test('Foto-Funktionen und ein neues Topo ändern keine Klappzustände', () => {
  for (const [id, key, value] of [
    ['photo-opacity', 'opacity', 60],
    ['photo-scale', 'scale', 120],
    ['photo-x', 'x', 15],
    ['photo-y', 'y', -10],
  ]) {
    elementById(id).value = String(value);
    elementById(id).dispatch('input');
    assert.equal(state.photo[key], value);
  }
  elementById('btn-photo-clear').dispatch('click');
  assert.equal(state.photo.src, null);
  elementById('btn-new').dispatch('click');
  assert.ok(svg().startsWith('<svg'));
  assert.ok(PANEL_SECTION_IDS.every((id) => !elementById(id).open));
  assert.ok(freshPanels().every((node) => !node.open));
});

test('der Zufall-Knopf erzeugt ein neues, vollständiges Topo', () => {
  const before = JSON.stringify(state.topo);
  elementById('btn-random').dispatch('click');
  const topo = state.topo;
  assert.notEqual(JSON.stringify(topo), before, 'das Topo hat sich nicht geändert');
  const segmentTypes = new Set(topo.segments.map((segment) => segment.type));
  for (const type of SEGMENT_TYPES) {
    assert.ok(segmentTypes.has(type), `Segmenttyp ${type} fehlt`);
  }
  const variants = new Set(
    topo.segments.flatMap((segment) =>
      segment.elements.map((element) => `${element.type}${element.dead ? ':dead' : ''}`),
    ),
  );
  for (const category of symbolOptions()) {
    for (const symbol of category.symbols) {
      assert.ok(
        variants.has(`${symbol.type}${symbol.dead ? ':dead' : ''}`),
        `Symbolvariante ${symbol.type} fehlt`,
      );
    }
  }
  assert.ok(svg().startsWith('<svg'), 'kein SVG gerendert');
  assert.ok(svg().includes(topo.canyon_name), 'Name fehlt im Rendering');
  assert.deepEqual(validateTopo(topo), [], 'Zufalls-Topo ist nicht valide');

  // Zwei Klicks ergeben zwei verschiedene Topos.
  const first = JSON.stringify(topo);
  elementById('btn-random').dispatch('click');
  assert.notEqual(JSON.stringify(state.topo), first);

  // Rückgängig führt zurück – wie beim Beispiel-Knopf.
  elementById('btn-undo').dispatch('click');
  assert.equal(JSON.stringify(state.topo), first);
  elementById('btn-undo').dispatch('click');
});

test('die App startet und rendert ein SVG', () => {
  assert.ok(svg().startsWith('<svg'), 'kein SVG gerendert');
  assert.ok(svg().includes(state.topo.canyon_name));
});

test('Alpin klassisch lässt sich auswählen und wird in den Ansichten gespeichert', () => {
  const select = elementById('select-theme');
  select.value = 'alpiner_classic';
  select.dispatch('change');

  assert.equal(state.view.theme, 'alpiner_classic');
  assert.ok(svg().includes('stop-color="#cbd5d8"'));
  assert.equal(
    JSON.parse(localStorage.getItem('canyon-topo-generator/state/v1')).view.theme,
    'alpiner_classic',
  );
});

test('Stil Standard (eau_froide) lässt sich auswählen und wird in den Ansichten gespeichert', () => {
  const select = elementById('select-theme');
  select.value = 'eau_froide';
  select.dispatch('change');

  assert.equal(state.view.theme, 'eau_froide');
  assert.ok(svg().includes('topo-marble'));
  assert.equal(
    JSON.parse(localStorage.getItem('canyon-topo-generator/state/v1')).view.theme,
    'eau_froide',
  );
});

/* ------------------------------------------------- Legende: live, wie Name */

test('der Name aktualisiert das Topo sofort beim Tippen', () => {
  type('topo-name', 'Rio Live');
  assert.equal(state.topo.canyon_name, 'Rio Live');
  assert.ok(svg().includes('Rio Live'), 'Name fehlt im gerenderten SVG');
});

test('Author erscheint ohne Blur in der Legende – exakt wie der Name', () => {
  assert.ok(!svg().includes('data-meta="author"'), 'Vorbedingung: noch kein Author');
  type('topo-author', 'Marco');
  assert.equal(state.topo.author, 'Marco');
  assert.ok(svg().includes('data-meta="author"'), 'Author-Zeile fehlt');
  assert.ok(svg().includes('Marco'), 'Author-Wert fehlt');
});

test('Dauer erscheint ohne Blur in der Legende', () => {
  type('topo-duration', '3-4 h');
  assert.equal(state.topo.duration, '3-4 h');
  assert.ok(svg().includes('data-meta="duration"'));
  assert.ok(svg().includes('3-4 h'));
});

test('Name, Author und Dauer sind an denselben Ereignissen gebunden', () => {
  const events = (id) => [...elementById(id).listeners.keys()].sort();
  assert.deepEqual(events('topo-author'), events('topo-name'));
  assert.deepEqual(events('topo-duration'), events('topo-name'));
  assert.ok(events('topo-name').includes('input'), 'kein input-Listener');
});

test('leeren der Felder entfernt die Legendenzeilen wieder', () => {
  type('topo-author', '');
  type('topo-duration', '');
  assert.ok(
    !svg().includes('data-meta="author"'),
    'leere Werte dürfen keine Zeile zeigen',
  );
  assert.ok(!svg().includes('data-meta="duration"'));
});

test('Author und Datum stehen am Ende der Legende', () => {
  type('topo-author', 'Marco');
  const yOf = (key) =>
    Number(new RegExp(`data-meta="${key}" x="[-\\d.]+" y="([-\\d.]+)"`).exec(svg())[1]);
  const lastEntry = Number(
    /<text x="[-\d.]+" y="([-\d.]+)"[^>]*>\(le\) = left<\/text>/.exec(svg())[1],
  );
  assert.ok(yOf('author') > lastEntry, 'Author steht nicht am Legendenende');
  assert.ok(yOf('date') > yOf('author'), 'Datum steht nicht nach dem Author');
  type('topo-author', '');
});

test('das Datum aktualisiert die Legende sofort beim Ändern', () => {
  const input = elementById('topo-date');
  input.value = '2024-03-07';
  input.dispatch('input');
  assert.equal(state.topo.date, '2024-03-07');
  assert.ok(svg().includes('07.03.2024'), 'lesbares Datum fehlt im SVG');

  input.value = '2025-11-30';
  input.dispatch('input');
  assert.ok(svg().includes('30.11.2025'), 'Datum aktualisiert sich nicht live');
  assert.ok(!svg().includes('07.03.2024'), 'altes Datum bleibt stehen');
});

test('eine Eingabe ergibt genau einen Undo-Schritt', () => {
  type('topo-author', 'Team', { commit: true });
  assert.equal(state.topo.author, 'Team');
  elementById('btn-undo').dispatch('click');
  assert.equal(state.topo.author, '');
  assert.ok(!svg().includes('data-meta="author"'));
  elementById('btn-redo').dispatch('click');
  assert.equal(state.topo.author, 'Team');
  elementById('btn-undo').dispatch('click');
});

test('die Verkürzungsschwelle ist leer deaktiviert und Undo/Redo-fähig', () => {
  const input = elementById('topo-length-shortening-threshold');
  const segment = state.topo.segments[0];
  const originalSegment = structuredClone(segment);
  segment.type = 'RAPPEL';
  segment.length_in_meters = 80;
  segment.angle_in_degrees = 90;
  segment.elements = [];
  state.topo.length_shortening_threshold_meters = null;
  input.value = '';
  input.dispatch('input');
  assert.equal(state.topo.length_shortening_threshold_meters, null);

  input.value = '3';
  input.dispatch('input');
  assert.equal(state.topo.length_shortening_threshold_meters, 3);
  assert.match(svg(), /class="topo-shortening-break"/, 'input-Event rendert die Kürzung sofort');
  assert.match(svg(), /> ?80<\/tspan>/, 'Beschriftung zeigt weiter die echte Länge');

  input.value = '30';
  input.dispatch('input');
  assert.equal(state.topo.length_shortening_threshold_meters, 30);
  assert.match(svg(), /class="topo-shortening-break"/, 'Folge-Input rendert ebenfalls live');
  assert.equal(JSON.parse(localStorage.getItem('canyon-topo-generator/state/v1'))
    .topo.length_shortening_threshold_meters, 30);

  elementById('btn-undo').dispatch('click');
  assert.equal(state.topo.length_shortening_threshold_meters, null);
  assert.equal(input.value, '');
  assert.doesNotMatch(svg(), /topo-shortening-break/);
  elementById('btn-redo').dispatch('click');
  assert.equal(state.topo.length_shortening_threshold_meters, 30);
  Object.assign(segment, originalSegment);
  state.topo.length_shortening_threshold_meters = null;
  input.value = '';
  input.dispatch('input');
});

/* ------------------------------------------------------- Format und Layout */

test('die Formatwahl ändert die Zeileneinteilung sichtbar', () => {
  elementById('btn-example').dispatch('click');
  // Ohne Netz lädt das Beispiel nicht – deshalb direkt genügend Segmente setzen.
  const select = elementById('select-new-segment');
  select.value = 'POOL';
  for (let index = 0; index < 14; index += 1) {
    elementById('btn-add-segment').dispatch('click');
  }
  for (const segment of state.topo.segments) {
    segment.type = 'POOL';
    segment.length_in_meters = 12;
    segment.angle_in_degrees = 0;
  }
  elementById('topo-line-distance').value = '60';
  elementById('topo-line-distance').dispatch('change');

  const rowsFor = (paper) => {
    const select = elementById('select-paper');
    select.value = paper;
    select.dispatch('change');
    return (svg().match(/class="topo-row"/g) || []).length;
  };

  const screen = rowsFor('screen');
  const landscape = rowsFor('a4_landscape');
  const portrait = rowsFor('a4_portrait');
  assert.ok(screen >= 1 && landscape >= 1 && portrait >= 1);
  assert.ok(
    portrait > landscape,
    `A4 hoch (${portrait}) muss mehr Zeilen zeigen als A4 quer (${landscape})`,
  );
  assert.equal(elementById('select-paper').value, 'a4_portrait');
});

test('Linear zeigt weiterhin genau eine Zeile', () => {
  const layoutSelect = elementById('select-layout');
  layoutSelect.value = 'linear';
  layoutSelect.dispatch('change');
  assert.equal((svg().match(/class="topo-row"/g) || []).length, 1);
  assert.ok(!svg().includes('Infinity'));
  layoutSelect.value = 'serpentine';
  layoutSelect.dispatch('change');
});

test('Kaskadiert steht im Layout-Menü zwischen Serpentine und Linear', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const select = /<select id="select-layout">([\s\S]*?)<\/select>/.exec(html)[1];
  const options = [...select.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(
    (match) => [match[1], match[2]],
  );
  assert.deepEqual(options, [
    ['serpentine', 'Serpentine (Zeilen)'],
    ['cascaded', 'Kaskadiert (Spalten)'],
    ['linear', 'Linear (eine Zeile)'],
  ]);
});

test('Kaskadiert rendert Spalten, reagiert auf Format und Flags und wird gespeichert', () => {
  // Die folgenden Tests bauen auf den flachen Segmenten und dem Format auf.
  const segmentsBefore = JSON.parse(JSON.stringify(state.topo.segments));
  const paperBefore = state.view.paper;
  for (const segment of state.topo.segments) {
    segment.type = 'RAPPEL';
    segment.length_in_meters = 10;
    segment.angle_in_degrees = 90;
    segment.force_cut_row_after_this_segment = false;
    segment.do_not_cut_row_after_this_segment = false;
  }
  const layoutSelect = elementById('select-layout');
  layoutSelect.value = 'cascaded';
  layoutSelect.dispatch('change');
  assert.equal(state.view.layout, 'cascaded');

  const columnsFor = (paper) => {
    const select = elementById('select-paper');
    select.value = paper;
    select.dispatch('change');
    assert.ok(!/NaN|Infinity/.test(svg()), `${paper}: NaN/Infinity im SVG`);
    return (svg().match(/class="topo-row"/g) || []).length;
  };
  const screen = columnsFor('screen');
  const landscape = columnsFor('a4_landscape');
  const portrait = columnsFor('a4_portrait');
  assert.ok(screen > 1, `Bildschirm: mehrere Spalten erwartet (${screen})`);
  assert.ok(
    portrait < landscape,
    `A4 hoch (${portrait}) muss weniger Spalten zeigen als A4 quer (${landscape})`,
  );

  // Erzwingen wirkt als Spaltenwechsel direkt nach dem ersten Segment.
  columnsFor('screen');
  state.selection = { kind: 'segment', segmentIndex: 0 };
  elementById('topo-name').dispatch('input');
  const force = elementById('segment-force-cut');
  force.checked = true;
  force.dispatch('change');
  const first = /<g class="topo-row" data-row="0">([\s\S]*?)<\/g>\s*<g class="topo-row" data-row="1">/.exec(
    svg(),
  );
  assert.ok(first, 'mindestens zwei Spalten erwartet');
  assert.equal((first[1].match(/topo-segment-hit[^>]*data-seg="/g) || []).length, 1);
  elementById('segment-force-cut').checked = false;
  elementById('segment-force-cut').dispatch('change');

  const saved = JSON.parse(localStorage.getItem('canyon-topo-generator/state/v1'));
  assert.equal(saved.view.layout, 'cascaded', 'Layoutwahl muss im Autosave landen');

  layoutSelect.value = 'serpentine';
  layoutSelect.dispatch('change');
  assert.equal(
    JSON.parse(localStorage.getItem('canyon-topo-generator/state/v1')).view.layout,
    'serpentine',
  );

  state.topo.segments = segmentsBefore;
  state.selection = null;
  elementById('select-paper').value = paperBefore;
  elementById('select-paper').dispatch('change');
});

/* -------------------------------------------------------- Umbruch-Optionen */

test('erzwingen und verhindern schliessen sich in der UI gegenseitig aus', () => {
  state.selection = { kind: 'segment', segmentIndex: 0 };
  // Ein beliebiges Feld-Event rendert Inspector und Topo neu.
  elementById('topo-name').dispatch('input');

  const force = elementById('segment-force-cut');
  const prevent = elementById('segment-prevent-cut');
  assert.equal(force.checked, false);
  assert.equal(prevent.checked, false);

  prevent.checked = true;
  prevent.dispatch('change');
  assert.equal(state.topo.segments[0].do_not_cut_row_after_this_segment, true);
  assert.equal(state.topo.segments[0].force_cut_row_after_this_segment, false);

  const forceAgain = elementById('segment-force-cut');
  forceAgain.checked = true;
  forceAgain.dispatch('change');
  assert.equal(state.topo.segments[0].force_cut_row_after_this_segment, true);
  assert.equal(
    state.topo.segments[0].do_not_cut_row_after_this_segment,
    false,
    'die widersprüchliche Option muss zurückgesetzt werden',
  );
  assert.equal(elementById('segment-prevent-cut').checked, false);
});

test('ein erzwungener Umbruch schlägt sofort auf das Rendering durch', () => {
  const segmentsInFirstRow = () => {
    const row = /<g class="topo-row" data-row="0">([\s\S]*?)<\/g>\s*<g class="topo-row" data-row="1">/.exec(
      svg(),
    );
    assert.ok(row, 'es müssen mindestens zwei Zeilen gerendert sein');
    return (row[1].match(/topo-segment-hit[^>]*data-seg="/g) || []).length;
  };

  state.topo.segments[0].force_cut_row_after_this_segment = false;
  state.selection = { kind: 'segment', segmentIndex: 0 };
  elementById('topo-name').dispatch('input');
  const without = segmentsInFirstRow();
  assert.ok(without > 1, 'Vorbedingung: die erste Zeile trägt mehrere Segmente');

  const force = elementById('segment-force-cut');
  force.checked = true;
  force.dispatch('change');
  assert.equal(
    segmentsInFirstRow(),
    1,
    'nach dem erzwungenen Umbruch steht nur noch das erste Segment in Zeile 1',
  );
});

/* ------------------------------------------------------------ Wanddistanz */

/** Ist ein Feld gerade im Inspector sichtbar? (elementById legt IDs lazy an.) */
function inspectorHas(id) {
  return elementById('inspector')
    .descendants()
    .some((node) => node.id === id);
}

function selectFirstSegmentAs(type) {
  state.topo.segments[0].type = type;
  state.selection = { kind: 'segment', segmentIndex: 0 };
  elementById('topo-name').dispatch('input');
}

test('die Wanddistanz erscheint nur bei den drei Abseiltypen', () => {
  for (const type of ['RAPPEL', 'RAPPEL_DRY', 'RAPPEL_WET']) {
    selectFirstSegmentAs(type);
    assert.ok(inspectorHas('segment-wall-distance'), `${type}: Feld fehlt`);
  }
  for (const type of ['WALK', 'JUMP', 'POOL', 'SLIDE']) {
    selectFirstSegmentAs(type);
    assert.equal(inspectorHas('segment-wall-distance'), false, `${type}: Feld zu viel`);
  }
});

test('die Wanddistanz wirkt sofort auf das Rendering und bleibt nie negativ', () => {
  selectFirstSegmentAs('RAPPEL');
  const input = elementById('segment-wall-distance');
  assert.equal(input.min, '0');

  input.value = '8';
  input.dispatch('change');
  assert.equal(state.topo.segments[0].wall_distance_in_meters, 8);
  assert.ok(/ Q [-\d.]+ [-\d.]+ /.test(svg()), 'gerundete Wand fehlt im SVG');

  input.value = '-5';
  input.dispatch('change');
  assert.equal(state.topo.segments[0].wall_distance_in_meters, 0);
});

test('ein Typwechsel weg vom Abseilen räumt die Wanddistanz auf', () => {
  selectFirstSegmentAs('RAPPEL');
  const input = elementById('segment-wall-distance');
  input.value = '6';
  input.dispatch('change');
  assert.equal(state.topo.segments[0].wall_distance_in_meters, 6);

  const typeSelect = elementById('inspector')
    .descendants()
    .find((node) => node.tagName === 'SELECT');
  typeSelect.value = 'WALK';
  typeSelect.dispatch('change');
  assert.equal(state.topo.segments[0].wall_distance_in_meters, 0);
  assert.equal(inspectorHas('segment-wall-distance'), false);
});

/* ---------------------------------------------------------------- Gehzeit */

test('Tiefe (m) erscheint nur bei POOL', () => {
  selectFirstSegmentAs('POOL');
  assert.ok(inspectorHas('segment-depth'));
  assert.ok(inspectorHasField('Tiefe (m)'));
  assert.equal(elementById('segment-depth').type, 'number');
  assert.equal(elementById('segment-depth').min, '0');
  for (const type of ['WALK', 'RAPPEL', 'RAPPEL_DRY', 'RAPPEL_WET', 'JUMP', 'SLIDE', 'CLIMB', 'WEIR']) {
    selectFirstSegmentAs(type);
    assert.equal(inspectorHas('segment-depth'), false, type);
  }
});

test('Tiefe wirkt sofort auf die Gumpe; leer, negativ und ungültig bedeuten unbekannt', () => {
  selectFirstSegmentAs('POOL');
  state.topo.segments[0].depth_in_meters = null;
  elementById('topo-name').dispatch('input');
  const before = svg();
  const input = elementById('segment-depth');
  assert.equal(input.value, '');
  input.value = '8';
  input.dispatch('change');
  assert.equal(state.topo.segments[0].depth_in_meters, 8);
  assert.ok(svg().includes('>T 8 m</text>'));
  assert.notEqual(svg().replace(/<text class="topo-pool-depth"[^>]*>.*?<\/text>/g, ''), before);
  for (const value of ['', '-5', 'x']) {
    input.value = value;
    input.dispatch('change');
    assert.equal(state.topo.segments[0].depth_in_meters, null);
    assert.equal(svg(), before, 'unbekannte Tiefe muss ursprüngliches Rendering wiederherstellen');
  }
  input.value = '0';
  input.dispatch('change');
  assert.equal(state.topo.segments[0].depth_in_meters, 0);
  assert.ok(svg().includes('>T 0 m</text>'));
});

test('Typwechsel weg von POOL löscht Tiefe auch bei Rückwechsel', () => {
  selectFirstSegmentAs('POOL');
  const input = elementById('segment-depth');
  input.value = '4';
  input.dispatch('change');
  const select = elementById('inspector').descendants().find((node) => node.tagName === 'SELECT');
  select.value = 'WEIR';
  select.dispatch('change');
  assert.equal(state.topo.segments[0].depth_in_meters, null);
  assert.equal(inspectorHas('segment-depth'), false);
  assert.equal(svg().includes('topo-pool-depth'), false);
  const back = elementById('inspector').descendants().find((node) => node.tagName === 'SELECT');
  back.value = 'POOL';
  back.dispatch('change');
  assert.equal(state.topo.segments[0].depth_in_meters, null);
  assert.equal(elementById('segment-depth').value, '');
});

/** Sucht ein Inspector-Feld über seinen Labeltext (viele Felder haben keine ID). */
function inspectorHasField(labelText) {
  return elementById('inspector')
    .descendants()
    .some((node) => node.tagName === 'LABEL' && node.textContent === labelText);
}

function segmentTypeSelect() {
  return elementById('inspector')
    .descendants()
    .find((node) => node.tagName === 'SELECT');
}

test('die Gehzeit erscheint beim Segment nur bei WALK', () => {
  selectFirstSegmentAs('WALK');
  assert.ok(inspectorHasField('Gehzeit (min)'), 'WALK: Feld fehlt');

  for (const type of ['RAPPEL', 'RAPPEL_DRY', 'RAPPEL_WET', 'JUMP', 'POOL']) {
    selectFirstSegmentAs(type);
    assert.equal(
      inspectorHasField('Gehzeit (min)'),
      false,
      `${type}: Feld zu viel`,
    );
  }
});

test('ein Typwechsel blendet die Gehzeit aus und wieder ein, ohne den Wert zu verlieren', () => {
  selectFirstSegmentAs('WALK');
  const input = elementById('inspector')
    .descendants()
    .find((node) => node.tagName === 'INPUT' && node.type === 'number');
  state.topo.segments[0].duration_to_walk_in_min = 12;
  elementById('topo-name').dispatch('input');
  assert.ok(input, 'Gehzeit-Feld erwartet');

  segmentTypeSelect().value = 'RAPPEL';
  segmentTypeSelect().dispatch('change');
  assert.equal(inspectorHasField('Gehzeit (min)'), false);
  assert.equal(
    state.topo.segments[0].duration_to_walk_in_min,
    12,
    'der gespeicherte Wert bleibt erhalten',
  );

  segmentTypeSelect().value = 'WALK';
  segmentTypeSelect().dispatch('change');
  assert.ok(inspectorHasField('Gehzeit (min)'), 'nach der Rückkehr fehlt das Feld');
  assert.equal(state.topo.segments[0].duration_to_walk_in_min, 12);
});

test('die Gehzeit gibt es beim Symbol nur am Fluchtweg', () => {
  selectFirstSegmentAs('WALK');
  state.topo.segments[0].elements = [
    { type: 'ESCAPE_EXIT_LEFT', horizontal_start_rel_to_segment_start: 1 },
  ];
  state.selection = { kind: 'element', segmentIndex: 0, elementIndex: 0 };
  elementById('topo-name').dispatch('input');
  assert.ok(inspectorHas('element-walk-time'), 'Fluchtweg: Feld fehlt');

  const input = elementById('element-walk-time');
  input.value = '25';
  input.dispatch('change');
  assert.equal(state.topo.segments[0].elements[0].duration_to_walk_in_min, 25);
  assert.match(svg(), /25 min/, 'die Gehzeit fehlt am Schild');

  input.value = '-5';
  input.dispatch('change');
  assert.equal(state.topo.segments[0].elements[0].duration_to_walk_in_min, 0);

  const typeSelect = elementById('inspector')
    .descendants()
    .find((node) => node.tagName === 'SELECT');
  typeSelect.value = 'STONE';
  typeSelect.dispatch('change');
  assert.equal(inspectorHas('element-walk-time'), false, 'STONE: Feld zu viel');
  assert.equal(state.topo.segments[0].elements[0].duration_to_walk_in_min, null);
});


test('das Auswahlfeld für die Prompt-Vorlage kennt alle Vorlagen', () => {
  const markup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(markup, /id="ai-prompt-template"/, 'Auswahlfeld fehlt in index.html');
  assert.match(markup, /id="ai-prompt-custom"/, 'Textfeld fehlt in index.html');

  const select = elementById('ai-prompt-template');
  assert.deepEqual(
    select.options.map((option) => option.value),
    PROMPT_TEMPLATES.map((entry) => entry.id),
  );
  assert.equal(select.value, 'optimized', 'Standard ist die optimierte Vorlage');
  assert.equal(elementById('ai-prompt-custom-row').hidden, true, 'Textfeld erst bei "custom"');
  assert.ok(elementById('ai-prompt-hint').textContent.length > 0);
});

test('"Eigener Prompt" zeigt das Textfeld, vorbelegt und gespeichert', () => {
  const select = elementById('ai-prompt-template');
  try {
    select.value = 'custom';
    select.dispatch('change');
    assert.equal(getAiSettings().promptTemplate, 'custom');
    assert.equal(elementById('ai-prompt-custom-row').hidden, false);
    const prefilled = elementById('ai-prompt-custom').value;
    assert.match(prefilled, /Canyoning-Topo-Experte/, 'Vorbelegung fehlt');
    assert.equal(getAiSettings().customPrompt, prefilled, 'Vorbelegung muss gespeichert sein');

    type('ai-prompt-custom', 'Nur JSON.');
    assert.equal(getAiSettings().customPrompt, 'Nur JSON.');
  } finally {
    select.value = 'optimized';
    select.dispatch('change');
  }
  assert.equal(getAiSettings().promptTemplate, 'optimized');
  assert.equal(elementById('ai-prompt-custom-row').hidden, true);
});

test('die Platzhalter nennen Endpoint und Modell der Swiss AI Platform', () => {
  const markup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(
    markup,
    /id="ai-endpoint"[^>]*placeholder="https:\/\/api\.swisscom\.com\/products\/swiss-ai-platform\/internal-all-models\/v1"/,
  );
  assert.match(markup, /placeholder="qwen\/qwen3\.6-35b-a3b"/);
  assert.equal(markup.includes('placeholder="gpt-4o"'), false);
});

test('ein Anbieterwechsel setzt Endpoint und Modell des Anbieters', () => {
  const select = elementById('ai-provider');
  try {
    select.value = 'anthropic';
    select.dispatch('change');
    assert.equal(getAiSettings().endpoint, 'https://api.anthropic.com/v1');
    assert.equal(getAiSettings().model, 'claude-sonnet-4-20250514');

    select.value = 'openai';
    select.dispatch('change');
    const spec = providerById('openai');
    assert.equal(getAiSettings().endpoint, spec.defaultEndpoint);
    assert.equal(getAiSettings().model, spec.defaultModel);
    // Die Felder zeigen den Wert auch wirklich an.
    assert.equal(elementById('ai-endpoint').value, spec.defaultEndpoint);
    assert.equal(elementById('ai-model').value, spec.defaultModel);
  } finally {
    select.value = 'openai';
    select.dispatch('change');
  }
});


/* ------------------------------------------------------------- Rappel Guide */

test('Rappel Guide lässt sich hinzufügen, Endpunkt ist gesetzt und unabhängig bewegbar', () => {
  state.topo = createEmptyTopo();
  state.topo.segments[0].length_in_meters = 30;
  state.selection = { kind: 'segment', segmentIndex: 0 };
  elementById('topo-name').dispatch('input');

  const button = elementById('symbol-palette')
    .descendants()
    .find(
      (node) => node.tagName === 'BUTTON' && node.textContent === 'Rappel Guide (RG)',
    );
  assert.ok(button, 'Rappel-Guide-Knopf fehlt in der Palette Verankerung');

  button.dispatch('click');
  const segment = state.topo.segments[0];
  const element = segment.elements[segment.elements.length - 1];
  assert.equal(element.type, 'RAPPEL_GUIDE');
  assert.ok(
    Number.isFinite(element.horizontal_end_rel_to_segment_start),
    'horizontaler Endpunkt nicht gesetzt',
  );
  assert.ok(
    Number.isFinite(element.vertical_end_rel_to_segment_start),
    'vertikaler Endpunkt nicht gesetzt',
  );

  // Inspector bietet die End-Felder an.
  assert.ok(inspectorHasField('Ende entlang (m)'), 'Feld Ende entlang fehlt');
  assert.ok(inspectorHasField('Ende quer (m)'), 'Feld Ende quer fehlt');

  // Endpunkt lässt sich unabhängig vom Startpunkt ändern.
  const endLabel = elementById('inspector')
    .descendants()
    .find(
      (node) => node.tagName === 'LABEL' && node.textContent === 'Ende entlang (m)',
    );
  const endInput = endLabel.children[0];
  const startHorizontal = element.horizontal_start_rel_to_segment_start;
  endInput.value = '27';
  endInput.dispatch('change');
  assert.equal(element.horizontal_end_rel_to_segment_start, 27, 'Ende-entlang nicht übernommen');
  assert.equal(
    element.horizontal_start_rel_to_segment_start,
    startHorizontal,
    'Start wurde versehentlich verschoben',
  );

  // Render-Ausgabe enthält RG und keine ungültigen Koordinaten.
  assert.ok(svg().includes('>RG<'), 'RG fehlt im gerenderten SVG');
  assert.equal(/NaN|Infinity/.test(svg()), false, 'NaN/Infinity im SVG');
});

/* ------------------------------------- Wiederherstellen (eigene App-Instanz) */

async function restoredAppWith(view, tag) {
  const saved = JSON.parse(localStorage.getItem('canyon-topo-generator/state/v1'));
  localStorage.setItem(
    'canyon-topo-generator/state/v1',
    JSON.stringify({ ...saved, view }),
  );
  return import(`../src/app.js?${tag}`);
}

{
  const restoredCascaded = await restoredAppWith(
    { layout: 'cascaded', theme: 'color', paper: 'screen', zoom: 1 },
    'restore-cascaded',
  );
  test('eine gespeicherte Layoutwahl Kaskadiert wird wiederhergestellt', () => {
    assert.equal(restoredCascaded.state.view.layout, 'cascaded');
    assert.equal(elementById('select-layout').value, 'cascaded');
    assert.ok(svg().startsWith('<svg') && !/NaN|Infinity/.test(svg()));
  });

  const restoredClassic = await restoredAppWith(
    { layout: 'linear', theme: 'alpiner_classic', paper: 'screen', zoom: 1 },
    'restore-alpiner-classic',
  );
  test('Alpin klassisch wird nach einem Reload samt SVG-Stil wiederhergestellt', () => {
    assert.equal(restoredClassic.state.view.theme, 'alpiner_classic');
    assert.equal(elementById('select-theme').value, 'alpiner_classic');
    assert.ok(svg().includes('stop-color="#cbd5d8"'));
  });

  const restoredEau = await restoredAppWith(
    { layout: 'linear', theme: 'eau_froide', paper: 'screen', zoom: 1 },
    'restore-eau-froide',
  );
  test('Stil Standard (eau_froide) wird nach einem Reload wiederhergestellt', () => {
    assert.equal(restoredEau.state.view.theme, 'eau_froide');
    assert.equal(elementById('select-theme').value, 'eau_froide');
    assert.ok(svg().includes('topo-marble'));
  });

  // Ältere Stände kennen nur Serpentine/Linear oder gar kein Layout.
  const legacy = await restoredAppWith({ theme: 'bw', paper: 'a4_portrait' }, 'restore-legacy');
  test('ältere gespeicherte Zustände bleiben kompatibel', () => {
    assert.equal(legacy.state.view.layout, 'serpentine');
    assert.equal(legacy.state.view.paper, 'a4_portrait');
    assert.equal(elementById('select-layout').value, 'serpentine');
    assert.ok(svg().startsWith('<svg'));
  });
}

test('Auswahl, Symbolpalette, AI-Einstellungen, Rendering und Reloads öffnen keinen Abschnitt automatisch', () => {
  assert.ok(PANEL_SECTION_IDS.every((id) => !elementById(id).open));
  assert.ok(freshPanels().every((node) => !node.open));
});

/* ------------------------------------------------------------- Responsiv */

const responsiveCss = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

function cssBlock(prelude) {
  const start = responsiveCss.indexOf(`${prelude} {`);
  assert.ok(start >= 0, `Media Query fehlt: ${prelude}`);
  let depth = 0;
  for (let index = responsiveCss.indexOf('{', start); index < responsiveCss.length; index += 1) {
    if (responsiveCss[index] === '{') depth += 1;
    if (responsiveCss[index] === '}' && --depth === 0) return responsiveCss.slice(start, index + 1);
  }
  throw new Error(`unvollständiger Block: ${prelude}`);
}

test('Viewport-Meta erlaubt Zoom und nutzt Gerätebreite', () => {
  assert.match(markup, /<meta name="viewport" content="width=device-width, initial-scale=1" \/>/);
  assert.doesNotMatch(markup, /maximum-scale|user-scalable/);
});

test('Ansichtsumschaltung ist eine zugängliche Tab-Liste für genau die drei Bereiche', () => {
  const list = /<div class="view-switch" role="tablist" aria-label="Ansicht">([\s\S]*?)<\/div>/.exec(markup);
  assert.ok(list, 'tablist fehlt');
  const tabs = [...list[1].matchAll(/<button type="button" role="tab" id="([^"]+)" aria-controls="([^"]+)" aria-selected="(true|false)"[^>]*>([^<]+)<\/button>/g)];
  assert.deepEqual(tabs.map((tab) => [tab[1], tab[2], tab[4]]), [
    ['view-tab-edit', 'panel-left', 'Bearbeiten'],
    ['view-tab-topo', 'canvas', 'Topo'],
    ['view-tab-symbols', 'panel-right', 'Symbole'],
  ]);
  assert.deepEqual(VIEWS.map((entry) => [entry.tab, entry.panel]), tabs.map((tab) => [tab[1], tab[2]]));
  assert.deepEqual(tabs.map((tab) => tab[3]), ['false', 'true', 'false']);
  assert.equal(DEFAULT_VIEW, 'topo');
  assert.match(markup, /<main class="workspace" id="workspace" data-view="topo">/);
  assert.match(markup, /<aside class="panel panel--left" id="panel-left"/);
  assert.match(markup, /<section class="canvas" id="canvas">/);
  assert.match(markup, /<aside class="panel panel--right" id="panel-right"/);
  assert.ok(markup.indexOf('class="view-switch"') < markup.indexOf('<main'), 'Tabs stehen vor dem Inhalt');
});

test('Menü-Knopf steuert die Toolbar-Gruppen, Undo/Redo bleibt immer sichtbar', () => {
  const button = /<button\s+type="button"\s+class="toolbar__menu"\s+id="btn-menu"\s+aria-expanded="false"\s+aria-controls="([^"]+)"\s*>[^<]*Menü<\/button>/.exec(markup);
  assert.ok(button, 'Menü-Knopf fehlt');
  for (const id of button[1].split(' ')) {
    assert.match(markup, new RegExp(`<div class="toolbar__group" id="${id}">`), id);
  }
  assert.match(markup, /<div class="toolbar__group toolbar__group--history">\s*<button type="button" id="btn-undo"/);
  const header = /<header class="toolbar">([\s\S]*?)<\/header>/.exec(markup)[1];
  for (const id of ['btn-new', 'btn-example', 'btn-random', 'file-open', 'btn-save-json', 'btn-save-xml',
    'btn-export-svg', 'btn-export-png', 'btn-print', 'btn-undo', 'btn-redo', 'select-layout', 'select-theme', 'select-paper']) {
    assert.ok(header.includes(`id="${id}"`), `${id} bleibt in der Kopfzeile`);
  }
});

test('Media Queries: Desktop-Basis unverändert, Tablet zweispaltig, Smartphone einspaltig, nur screen', () => {
  assert.match(responsiveCss, /\.workspace\s*\{\s*flex: 1;\s*display: grid;\s*grid-template-columns: 17rem minmax\(0, 1fr\) 19rem;/);
  assert.match(responsiveCss, /\.toolbar__menu,\s*\.view-switch\s*\{\s*display: none;\s*\}/);
  const tablet = cssBlock('@media screen and (min-width: 768px) and (max-width: 1199.98px)');
  assert.match(tablet, /grid-template-areas:\s*'canvas canvas'\s*'left right';/);
  assert.match(tablet, /\.canvas\s*\{[^}]*grid-area: canvas;[^}]*height: clamp\(/);
  const phone = cssBlock(`@media ${MOBILE_QUERY}`);
  assert.match(phone, /\.view-switch\s*\{\s*display: flex;/);
  assert.match(phone, /\.toolbar__menu\s*\{\s*display: inline-flex;/);
  assert.match(phone, /\.toolbar:not\(\.is-menu-open\) \.toolbar__group:not\(\.toolbar__group--history\)\s*\{\s*display: none;/);
  assert.match(phone, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(phone, /\.workspace\[data-view='edit'\] > :not\(\.panel--left\),\s*\.workspace\[data-view='topo'\] > :not\(\.canvas\),\s*\.workspace\[data-view='symbols'\] > :not\(\.panel--right\)\s*\{\s*display: none;/);
  assert.match(phone, /\[role='tab'\]\s*\{[^}]*min-height: 44px;/);
  for (const [, prelude] of responsiveCss.matchAll(/@media ([^{]*width[^{]*)\{/g)) {
    assert.ok(prelude.split(',').every((part) => /^\s*screen and /.test(part) || /pointer: coarse/.test(part)),
      `Breiten-Query muss screen-only sein (Druck bleibt unverändert): ${prelude}`);
  }
  assert.match(responsiveCss, /@media print\s*\{\s*\.toolbar,\s*\.panel,\s*\.canvas__zoom\s*\{\s*display: none;/);
});

test('Touch: Zielflächen ≥ 44px und Eingaben ≥ 16px gegen iOS-Auto-Zoom', () => {
  const coarse = cssBlock('@media (pointer: coarse)');
  assert.match(coarse, /button,\s*\.button,\s*\.panel__section > summary,\s*#ai-settings > summary\s*\{\s*min-height: 44px;/);
  assert.match(coarse, /button,\s*\.button\s*\{\s*min-width: 44px;/);
  assert.match(coarse, /input\[type='password'\]\s*\{\s*min-height: 44px;/);
  const fonts = cssBlock(`@media ${MOBILE_QUERY}, (pointer: coarse)`);
  assert.match(fonts, /select,\s*input,\s*textarea,\s*input\[type='text'\],\s*input\[type='number'\],\s*input\[type='date'\],\s*input\[type='password'\]\s*\{\s*font-size: 16px;/,
    'gleiche Spezifität wie die Basisregel, damit 16px gewinnt');
});

test('Zeichenfläche nutzt Pointer Events; Ziehen per Touch scrollt die Seite nicht', () => {
  assert.match(responsiveCss, /\.topo-element\s*\{[^}]*touch-action: none;/);
  assert.doesNotMatch(responsiveCss, /\.(canvas|workspace)\s*\{[^}]*touch-action/, 'ausserhalb der Elemente bleibt Scrollen/Zoomen nativ');
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    assert.ok(appSource.includes(`'${type}'`), type);
  }
  assert.doesNotMatch(appSource, /'(mouse|touch)(down|move|up|start|end)'/);
  assert.match(appSource, /if \(event\.isPrimary === false\) return;/);
  assert.match(appSource, /pointerId: event\.pointerId,/);
});

function fakeResponsiveRoot() {
  const nodes = new Map();
  const node = (id, tag = 'button') => {
    const item = new FakeNode(tag);
    item._id = id;
    item.focused = false;
    item.focus = () => {
      for (const other of nodes.values()) other.focused = false;
      item.focused = true;
    };
    item.removeAttribute = (name) => delete item.attributes[name];
    nodes.set(id, item);
    return item;
  };
  for (const entry of VIEWS) {
    node(entry.tab);
    node(entry.panel, 'aside');
  }
  node('workspace', 'main');
  const toolbar = node('toolbar', 'header');
  toolbar.classList.add('toolbar');
  const menu = node('btn-menu');
  menu.closest = (selector) => (selector === '.toolbar' ? toolbar : null);
  const listeners = [];
  const query = {
    matches: true,
    addEventListener: (type, handler) => listeners.push(handler),
  };
  const win = { matchMedia: (text) => (assert.equal(text, MOBILE_QUERY), query) };
  const api = initResponsive({ root: { getElementById: (id) => nodes.get(id) }, win });
  const setMobile = (value) => {
    query.matches = value;
    for (const handler of listeners) handler({ matches: value });
  };
  return { nodes, api, setMobile, get: (id) => nodes.get(id) };
}

test('Tabs schalten per Klick und Tastatur (Pfeile, Pos1, Ende) mit aria-selected und roving tabindex', () => {
  const { get } = fakeResponsiveRoot();
  const state = () => VIEWS.map((entry) => [get(entry.tab).getAttribute('aria-selected'), get(entry.tab).tabIndex]);
  assert.equal(get('workspace').dataset.view, 'topo');
  assert.deepEqual(state(), [['false', -1], ['true', 0], ['false', -1]]);
  get('view-tab-symbols').dispatch('click');
  assert.equal(get('workspace').dataset.view, 'symbols');
  assert.deepEqual(state(), [['false', -1], ['false', -1], ['true', 0]]);
  get('view-tab-symbols').dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(get('workspace').dataset.view, 'edit');
  assert.ok(get('view-tab-edit').focused, 'Fokus folgt dem Tab');
  get('view-tab-edit').dispatch('keydown', { key: 'ArrowLeft' });
  assert.equal(get('workspace').dataset.view, 'symbols');
  get('view-tab-symbols').dispatch('keydown', { key: 'Home' });
  assert.equal(get('workspace').dataset.view, 'edit');
  get('view-tab-edit').dispatch('keydown', { key: 'End' });
  assert.equal(get('workspace').dataset.view, 'symbols');
  get('view-tab-symbols').dispatch('keydown', { key: 'a' });
  assert.equal(get('workspace').dataset.view, 'symbols', 'andere Tasten ändern nichts');
});

test('tabpanel-Rollen gelten nur im Smartphone-Layout', () => {
  const { get, setMobile } = fakeResponsiveRoot();
  for (const entry of VIEWS) {
    assert.equal(get(entry.panel).getAttribute('role'), 'tabpanel');
    assert.equal(get(entry.panel).getAttribute('aria-labelledby'), entry.tab);
  }
  setMobile(false);
  for (const entry of VIEWS) {
    assert.equal(get(entry.panel).getAttribute('role'), null);
    assert.equal(get(entry.panel).getAttribute('aria-labelledby'), null);
  }
  setMobile(true);
  assert.equal(get('canvas').getAttribute('role'), 'tabpanel');
});

test('Menü-Knopf klappt die Toolbar auf und zu, Escape schliesst und fokussiert ihn', () => {
  const { get } = fakeResponsiveRoot();
  const menu = get('btn-menu');
  const toolbar = get('toolbar');
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
  menu.dispatch('click');
  assert.equal(menu.getAttribute('aria-expanded'), 'true');
  assert.ok(toolbar.classList.contains('is-menu-open'));
  toolbar.dispatch('keydown', { key: 'Escape' });
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
  assert.equal(toolbar.classList.contains('is-menu-open'), false);
  assert.ok(menu.focused);
  menu.dispatch('click');
  menu.dispatch('click');
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
});

test('ohne matchMedia (Desktop/Tests) bleibt alles sichtbar und die App ist verdrahtet', () => {
  assert.equal(elementById('workspace').dataset.view, 'topo');
  elementById('view-tab-edit').dispatch('click');
  assert.equal(elementById('workspace').dataset.view, 'edit');
  elementById('view-tab-topo').dispatch('click');
  assert.equal(elementById('workspace').dataset.view, 'topo');
  assert.equal(elementById('canvas').getAttribute('role'), null);
  assert.equal(elementById('btn-menu').getAttribute('aria-expanded'), 'false');
});

console.log(`\n${passed} Test(s) bestanden.`);
