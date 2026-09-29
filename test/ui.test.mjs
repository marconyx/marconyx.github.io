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
  assert.ok(!svg().includes('data-meta='), 'leere Werte dürfen keine Zeile zeigen');
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

console.log(`\n${passed} Test(s) bestanden.`);
