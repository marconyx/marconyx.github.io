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

  // Ältere Stände kennen nur Serpentine/Linear oder gar kein Layout.
  const legacy = await restoredAppWith({ theme: 'bw', paper: 'a4_portrait' }, 'restore-legacy');
  test('ältere gespeicherte Zustände bleiben kompatibel', () => {
    assert.equal(legacy.state.view.layout, 'serpentine');
    assert.equal(legacy.state.view.paper, 'a4_portrait');
    assert.equal(elementById('select-layout').value, 'serpentine');
    assert.ok(svg().startsWith('<svg'));
  });
}

console.log(`\n${passed} Test(s) bestanden.`);
