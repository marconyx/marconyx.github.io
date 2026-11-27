/**
 * UI-Tests gegen ein minimales DOM: die echte App (`src/app.js`) wird geladen,
 * Eingaben werden wie im Browser als Events ausgelöst und das gerenderte SVG
 * geprüft.
 *   node test/ui.test.mjs
 */
import assert from 'node:assert/strict';
import * as i18n from '../src/i18n.js';

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
    this.scrollLeft = 0;
    this.scrollTop = 0;
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
  click() { this.dispatch('click'); }
  focus() { document.activeElement = this; }
  contains(node) { return node === this || this.descendants().includes(node); }
  matches(selector) { return selector === ':popover-open' && !!this.popoverOpen; }
  getBoundingClientRect() { return { left: 100, bottom: 50 }; }
  get offsetWidth() { return 288; }
  get offsetHeight() { return 240; }
  showPopover() {
    this.dispatch('beforetoggle', { newState: 'open' });
    this.popoverOpen = true;
    this.dispatch('toggle', { newState: 'open' });
  }
  hidePopover() {
    this.popoverOpen = false;
    this.dispatch('toggle', { newState: 'closed' });
  }

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
    const viewBox = /viewBox="([^"]+)"/.exec(this._innerHTML)?.[1].split(' ').map(Number);
    if (!width) return null;
    return {
      getAttribute: (name) =>
        name === 'width' ? width[1] : name === 'height' ? height?.[1] : null,
      clientWidth: Number(width[1]),
      clientHeight: Number(height?.[1] || 0),
      getScreenCTM: () => {
        const transform = elementById('stage').style.transform || '';
        const zoom = Number(/scale\(([^)]+)\)/.exec(transform)?.[1] || 1);
        const pan = /translate\(([^p]+)px, ([^p]+)px\)/.exec(transform);
        const scale = Number(width[1]) / viewBox[2] * zoom;
        const matrix = {
          a: scale, b: 0, c: 0, d: scale,
          e: -viewBox[0] * scale + Number(pan?.[1] || 0) - elementById('canvas').scrollLeft,
          f: -viewBox[1] * scale + Number(pan?.[2] || 0) - elementById('canvas').scrollTop,
        };
        matrix.inverse = () => ({
          a: 1 / scale, b: 0, c: 0, d: 1 / scale, e: -matrix.e / scale, f: -matrix.f / scale,
        });
        return matrix;
      },
      createSVGPoint: () => new DOMPoint(),
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

const documentEvents = new FakeNode('document');
const documentStub = {
  getElementById: elementById,
  createElement: (tag) => new FakeNode(tag),
  body: new FakeNode('body'),
  addEventListener: (...args) => documentEvents.addEventListener(...args),
};

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
globalThis.document = documentStub;
globalThis.DOMPoint = class {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  matrixTransform(m) {
    return new DOMPoint(m.a * this.x + m.c * this.y + m.e, m.b * this.x + m.d * this.y + m.f);
  }
};
const windowEvents = new FakeNode('window');
globalThis.window = {
  addEventListener: (...args) => windowEvents.addEventListener(...args),
  removeEventListener() {},
  location: { href: 'http://localhost/', origin: 'http://localhost' },
};
globalThis.fetch = async () => {
  throw new Error('offline');
};
globalThis.FileReader = class {
  readAsDataURL() {}
};

import { readFileSync, readdirSync } from 'node:fs';

import { SEGMENT_TYPES, SEGMENT_SHORTCUTS, parseSegmentShortcut, validateTopo, createEmptyTopo, defaultAngleFor, normalizeTopo } from '../src/model.js';
import { symbolOptions } from '../src/symbols.js';
import { topoToJson } from '../src/io-json.js';
import { topoToXml } from '../src/io-xml.js';
import { layoutTopo } from '../src/layout.js';
import { initPanelSections, PANEL_SECTION_IDS, PANEL_STORAGE_KEY } from '../src/panel-sections.js';
import { initResponsive, MOBILE_QUERY, VIEWS, DEFAULT_VIEW } from '../src/responsive.js';

const markup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
testAssetVersions();
const appVersion = /id="app-version">v([\d.]+)</.exec(markup)[1];
const { PROMPT_TEMPLATES, getAiSettings, providerById } = await import(`../src/ai.js?v=${appVersion}`);

function testAssetVersions() {
  const version = /id="app-version">v([\d.]+)</.exec(markup)?.[1];
  assert.ok(version);
  const escaped = version.replaceAll('.', '\\.');
  assert.match(markup, new RegExp(`src="src/app\\.js\\?v=${escaped}"`));
  assert.match(markup, new RegExp(`href="styles\\.css\\?v=${escaped}"`));
  const src = new URL('../src/', import.meta.url);
  for (const name of readdirSync(src).filter((file) => file.endsWith('.js'))) {
    const source = readFileSync(new URL(name, src), 'utf8');
    const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.[^'"]+\.js(?:\?[^'"]*)?)['"]/g)];
    for (const [, path] of imports) {
      assert.match(path, new RegExp(`\\?v=${escaped}$`), `${name}: ${path}`);
      readFileSync(new URL(path, new URL(name, src)));
    }
  }
  const pdf = readFileSync(new URL('pdf.js', src), 'utf8');
  for (const asset of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
    assert.ok(pdf.includes(`${asset}?v=${version}`), `versioned ${asset}`);
  }
}
const panelHeaders = [...markup.matchAll(
  /<details class="panel__section" id="([^"]+)"( open)?>\s*<summary>(.*?)<\/summary>\s*<div class="panel__content">/gs,
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
for (const [, id, open] of panelHeaders) {
  const node = new FakeNode('details');
  node.id = id;
  node.open = Boolean(open);
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

try {
  const fileInput = elementById('file-open');
  const open = async (name, text) => {
    fileInput.files = [{ name, text: async () => text }];
    await fileInput.listeners.get('change')[0]({ target: fileInput });
  };
  assert.match(markup, /id="file-open" accept="[^"]*\.txt/);
  elementById('btn-new-default').dispatch('click');
  const previous = topoToJson(state.topo);
  await open('route.TXT', 'R10\r\nRD23\nrw12,5\nW7\n');
  assert.deepEqual(state.topo.segments.map((s) => [s.type, s.length_in_meters]), [
    ['RAPPEL', 10], ['RAPPEL_DRY', 23], ['RAPPEL_WET', 12.5], ['WALK', 7],
  ]);
  assert.match(elementById('status').textContent, /nur Typ und Länge/);
  assert.equal(elementById('status').title, elementById('status').textContent);
  const imported = topoToJson(state.topo);
  elementById('btn-undo').dispatch('click');
  assert.equal(topoToJson(state.topo), previous);
  elementById('btn-redo').dispatch('click');
  assert.equal(topoToJson(state.topo), imported);
  const persisted = storage.get('canyon-topo-generator/state/v1');
  await open('old-wa.txt', 'R10\nWA20\nW30');
  assert.equal(topoToJson(state.topo), imported);
  assert.equal(storage.get('canyon-topo-generator/state/v1'), persisted);
  assert.match(elementById('status').textContent, /Zeile 2:.*Unbekanntes Kürzel/);
  for (const [name, text] of [
    ['old.json', JSON.stringify({ segments: [{ type: 'WALK' }, { type: 'WEIR', depth_in_meters: 4 }] })],
    ['old.xml', '<topo><segment type="WALK"/><segment type="WEIR" depth_in_meters="4"/></topo>'],
    ['old.txt', 'R10\nWE4'],
  ]) {
    await open(name, text);
    assert.equal(topoToJson(state.topo), imported);
    assert.equal(storage.get('canyon-topo-generator/state/v1'), persisted);
    assert.match(elementById('status').textContent, /WEIR/);
  }
  await open('bad.txt', 'J3\n\nX10\nRD\n');
  assert.equal(topoToJson(state.topo), imported);
  assert.equal(storage.get('canyon-topo-generator/state/v1'), persisted);
  assert.match(elementById('status').textContent, /Zeile 3:.*Unbekanntes Kürzel.*Zeile 4:/);
  assert.equal(elementById('status').title, elementById('status').textContent);
  const language = elementById('select-language');
  language.value = 'en';
  language.dispatch('change');
  assert.match(elementById('status').textContent, /Line 3:.*Unknown code.*Line 4:/);
  assert.equal(elementById('status').title, elementById('status').textContent);
  language.value = 'de';
  language.dispatch('change');
  elementById('btn-undo').dispatch('click');
  assert.equal(topoToJson(state.topo), previous, 'fehlgeschlagener Import erzeugt keinen Undo-Schritt');
  elementById('btn-redo').dispatch('click');
  await open('old.txt', '1. WALK: 20 m\n2. RAPPEL_DRY: 12.5 m\n');
  assert.deepEqual(state.topo.segments.map((s) => s.type), ['WALK', 'RAPPEL_DRY']);
  const old = topoToJson(state.topo);
  await open('bad.json', '{');
  assert.equal(topoToJson(state.topo), old);
  elementById('btn-undo').dispatch('click');
  assert.equal(topoToJson(state.topo), imported, 'fehlerhaftes JSON erzeugt keinen Undo-Schritt');
  fileInput.files = [{ name: 'unreadable.txt', text: async () => { throw new Error('read failed'); } }];
  await fileInput.listeners.get('change')[0]({ target: fileInput });
  assert.equal(topoToJson(state.topo), imported);
  assert.match(elementById('status').textContent, /read failed/);
  await open('test.json', JSON.stringify({ canyon_name: 'JSON', segments: [{ type: 'POOL', length_in_meters: 9 }] }));
  assert.equal(state.topo.canyon_name, 'JSON');
  assert.equal(state.topo.segments[0].length_in_meters, 9);
  elementById('btn-undo').dispatch('click');
  assert.equal(topoToJson(state.topo), imported);
  const hostile = `Ä😀 & <svg onload="globalThis.pwned=1"> ' "</text><script>attack()</script>`;
  await open('hostile.json', JSON.stringify({ canyon_name: hostile, segments: [{ type: 'WALK', length_in_meters: 2 }] }));
  assert.equal(state.topo.canyon_name, hostile);
  assert.match(svg(), /&lt;svg onload="globalThis\.pwned=1"&gt;/);
  assert.doesNotMatch(svg(), /<svg onload=|<script>/);
  elementById('btn-undo').dispatch('click');
  assert.equal(topoToJson(state.topo), imported);

  const originalCreateObjectURL = URL.createObjectURL;
  const originalCreateElement = document.createElement;
  let downloaded = null;
  let filename = null;
  URL.createObjectURL = (blob) => { downloaded = blob; return 'blob:test'; };
  document.createElement = (tag) => {
    const node = originalCreateElement(tag);
    if (tag === 'a') node.click = () => { filename = node.download; };
    return node;
  };
  try {
    elementById('btn-export-shortlist').dispatch('click');
    assert.match(filename, /-kurzliste\.txt$/);
    assert.equal(downloaded.type, 'text/plain;charset=utf-8');
    assert.equal(await downloaded.text(), 'R10\nRD23\nRW12.5\nW7\n');
    assert.match(elementById('status').textContent, /nur Typ und Länge/);
    downloaded = null;
    state.topo = normalizeTopo({ segments: [
      { type: 'UNKNOWN', length_in_meters: 4 },
      { type: 'POOL', length_in_meters: 0 },
    ] });
    elementById('btn-export-shortlist').dispatch('click');
    assert.equal(downloaded, null);
    assert.match(elementById('status').textContent, /Segment 1:.*Segmenttyp.*Segment 2:.*Länge/);
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    document.createElement = originalCreateElement;
  }
  passed += 1;
  console.log('  ok  TXT-Download und Import: atomar, lokalisiert, Undo/Redo und alte Listen');
} catch (error) {
  console.error(`  FAIL TXT-Download und Import\n       ${error.stack}`);
  process.exitCode = 1;
}



test('Shortcut-Hilfe ist ein beschriftetes Popover und mit Escape schliessbar', () => {
  assert.match(markup, /<label class="sr-only" for="segment-shortcut"><span id="lbl-segment-shortcut">Segment-Shortcut \(m\)<\/span><\/label>/);
  assert.match(markup, /<button[^>]*id="btn-shortcut-help"[^>]*popovertarget="shortcut-help"[^>]*aria-controls="shortcut-help"[^>]*aria-expanded="false"[^>]*aria-label="[^"]+"[^>]*><svg[^>]*aria-hidden="true"[^>]*focusable="false"[^>]*><circle[^>]*\/><path[^>]*\/><circle[^>]*\/><\/svg><\/button>/);
  assert.match(markup, /id="shortcut-help" popover="auto" role="dialog" aria-labelledby="shortcut-help-title"/);
  const help = /<div class="shortcut-help" id="shortcut-help"[\s\S]*?<\/div>/.exec(markup)[0];
  assert.ok(help.includes('R10,RW3, RD23.5; R12,5 ist eine Dezimalzahl.'));
  assert.ok(help.includes('R=RAPPEL · RD=RAPPEL_DRY · RW=RAPPEL_WET · P=POOL · J=JUMP · S=SLIDE · C=CLIMB · W=WALK'));
  assert.ok(help.includes('Kurzlisten (TXT) enthalten nur Segmenttyp und Länge; Metadaten, Symbole und weitere Einstellungen werden nicht gespeichert.'));
  assert.match(help, /id="btn-close-shortcut-help" popovertarget="shortcut-help" popovertargetaction="hide"/);
  const popover = elementById('shortcut-help');
  const button = elementById('btn-shortcut-help');
  popover.showPopover();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, elementById('btn-close-shortcut-help'));
  let prevented = false;
  popover.dispatch('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(popover.popoverOpen, false);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, button);
  popover.showPopover();
  popover.hidePopover();
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  popover.showPopover();
  documentEvents.dispatch('focusin', { target: elementById('segment-shortcut') });
  assert.equal(popover.popoverOpen, false);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('Segmentauswahl folgt dem Shortcut-Feld und dessen Fehleranzeige', () => {
  const section = /<details class="panel__section" id="panel-segments"[\s\S]*?<\/details>/.exec(markup)[0];
  const ids = ['lbl-segment-shortcut', 'segment-shortcut', 'btn-shortcut-help',
    'btn-add-shortcut', 'segment-shortcut-error', 'select-new-segment', 'btn-add-segment', 'segment-list'];
  const positions = ids.map((id) => section.indexOf(`id="${id}"`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  for (const language of i18n.LANGUAGES) {
    assert.equal(i18n.UI_PLACEHOLDERS['segment-shortcut'][language], 'shortcuts');
    assert.ok(i18n.UI_TEXT['lbl-segment-shortcut'][language]);
  }
});

test('Plus neben Shortcut verwendet dieselbe Validierung und Undo-Historie wie Enter', () => {
  assert.match(markup, /<div class="segment-add">\s*<input[^>]*id="segment-shortcut"[^>]*placeholder="shortcuts"[^>]*\/>\s*<button[^>]*id="btn-shortcut-help"[^>]*><svg[^>]*>[\s\S]*?<\/svg><\/button>\s*<button type="button" id="btn-add-shortcut"[^>]*aria-label="[^"]+"[^>]*>\+<\/button>/);
  elementById('btn-new-default').dispatch('click');
  state.selection = { kind: 'segment', segmentIndex: 0 };
  const selection = state.selection;
  const before = topoToJson(state.topo);
  const count = state.topo.segments.length;
  const input = elementById('segment-shortcut');
  const button = elementById('btn-add-shortcut');
  for (const invalid of ['X10', 'RD', 'R0', 'R10 J3', '']) {
    input.value = invalid;
    input.dispatch('input');
    button.dispatch('click');
    assert.equal(topoToJson(state.topo), before);
    assert.equal(state.selection, selection);
    assert.equal(input.value, invalid);
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.ok(elementById('segment-shortcut-error').textContent);
  }
  input.value = 'rd23,5';
  input.dispatch('input');
  button.dispatch('click');
  assert.equal(state.topo.segments.length, count + 1);
  assert.equal(state.topo.segments.at(-1).type, 'RAPPEL_DRY');
  assert.equal(state.topo.segments.at(-1).length_in_meters, 23.5);
  assert.equal(state.selection, selection);
  assert.equal(input.value, '');
  assert.equal(document.activeElement, input);
  assert.equal(input.getAttribute('aria-invalid'), 'false');
  assert.equal(JSON.parse(storage.get('canyon-topo-generator/state/v1')).topo.segments.at(-1).length_in_meters, 23.5);
  const clicked = topoToJson(state.topo);
  elementById('btn-undo').dispatch('click');
  assert.equal(topoToJson(state.topo), before);
  elementById('btn-redo').dispatch('click');
  assert.equal(topoToJson(state.topo), clicked);
  input.value = 'R10';
  let prevented = false;
  input.dispatch('keydown', { key: 'Enter', preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(state.topo.segments.at(-1).type, 'RAPPEL');
  assert.equal(state.topo.segments.at(-1).length_in_meters, 10);
  const beforeRw = topoToJson(state.topo);
  input.value = 'RW3';
  input.dispatch('input');
  button.dispatch('click');
  assert.equal(state.topo.segments.at(-1).type, 'RAPPEL_WET');
  assert.equal(state.topo.segments.at(-1).length_in_meters, 3);
  assert.match(elementById('segment-list').children.at(-1).children[0].textContent, /RAPPEL_WET 3 m/);
  assert.match(svg(), /> ?3<\/tspan>/);
  elementById('btn-undo').dispatch('click');
  assert.equal(topoToJson(state.topo), beforeRw);
  elementById('btn-redo').dispatch('click');
  assert.equal(state.topo.segments.at(-1).type, 'RAPPEL_WET');
  assert.equal(state.topo.segments.at(-1).length_in_meters, 3);
  const language = elementById('select-language');
  language.value = 'en';
  language.dispatch('change');
  assert.equal(button.getAttribute('aria-label'), 'Add segment from shortcut');
  assert.equal(button.title, 'Add segment from shortcut');
  language.value = 'de';
  language.dispatch('change');
});


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

test('freies Pointer-Dragging behält SVG-Ziel, Maßstab, Range-Spanne und eine Undo-Stufe', () => {
  for (const layout of ['serpentine', 'cascaded', 'linear']) {
    for (const paper of ['screen', 'a4_portrait']) {
      for (const threshold of [null, 10]) {
        elementById('btn-new-default').dispatch('click');
        Object.assign(state.topo, {
          length_shortening_threshold_meters: threshold,
          segments: [{
            type: 'WALK', length_in_meters: 60, angle_in_degrees: 30,
            do_not_cut_row_after_this_segment: false, force_cut_row_after_this_segment: false,
            elements: [{
              type: 'PATH', size: 1, text: '', dead: false,
              horizontal_start_rel_to_segment_start: 15, vertical_start_rel_to_segment_start: 2,
              horizontal_end_rel_to_segment_start: 30, vertical_end_rel_to_segment_start: 4,
            }],
          }],
        });
        state.view.layout = layout;
        state.view.paper = paper;
        state.view.zoom = 0.7;
        elementById('topo-name').dispatch('change');
        const original = topoToJson(state.topo);
        const placement = layoutTopo(state.topo, { layout, paper }).placements[0];
        const p = placement.elements[0].point;
        const matrix = elementById('svg-host').querySelector('svg').getScreenCTM();
        const start = new DOMPoint(p.x, p.y).matrixTransform(matrix);
        const node = new FakeNode('g');
        node.dataset = { seg: '0', el: '0' };
        node.closest = (selector) => selector === '.topo-element' ? node : null;
        let captured = false;
        node.setPointerCapture = () => { captured = true; };
        node.hasPointerCapture = () => captured;
        node.releasePointerCapture = () => { captured = false; };
        elementById('svg-host').dispatch('pointerdown', {
          target: node, pointerId: 7, button: 0, clientX: start.x, clientY: start.y,
        });
        const originalSvg = svg();
        assert.equal(captured, true);
        // Unrelated pointers and sub-grid jitter do not mutate or record history.
        windowEvents.dispatch('pointermove', { pointerId: 8, clientX: start.x + 80, clientY: start.y });
        windowEvents.dispatch('pointermove', { pointerId: 7, clientX: start.x, clientY: start.y });
        assert.equal(topoToJson(state.topo), original);
        for (const delta of [10, 20, 30]) {
          windowEvents.dispatch('pointermove', {
            pointerId: 7, clientX: start.x + delta, clientY: start.y - delta,
          });
        }
        assert.equal(svg(), originalSvg, 'ursprüngliches SVG bleibt während der Geste verbunden');
        assert.match(node.getAttribute('transform'), /^translate\(/);
        const element = state.topo.segments[0].elements[0];
        assert.equal(element.horizontal_end_rel_to_segment_start - element.horizontal_start_rel_to_segment_start, 15);
        assert.equal(element.vertical_end_rel_to_segment_start - element.vertical_start_rel_to_segment_start, 2);
        const dragged = topoToJson(state.topo);
        assert.notEqual(dragged, original);
        const point = layoutTopo(state.topo, { layout, paper, frame: layoutTopo(JSON.parse(original), { layout, paper }) })
          .placements[0].elements[0].point;
        const beforeRelease = new DOMPoint(point.x, point.y).matrixTransform(matrix);
        windowEvents.dispatch('pointerup', { pointerId: 7 });
        assert.equal(captured, false);
        const finalPoint = layoutTopo(state.topo, { layout, paper }).placements[0].elements[0].point;
        const finalMatrix = elementById('svg-host').querySelector('svg').getScreenCTM();
        const finalScreen = new DOMPoint(finalPoint.x, finalPoint.y).matrixTransform(finalMatrix);
        assert.ok(Math.abs(finalScreen.x - beforeRelease.x) < 1e-6);
        assert.ok(Math.abs(finalScreen.y - beforeRelease.y) < 1e-6);
        assert.ok(Math.abs(finalMatrix.a - matrix.a) < 1e-6);
        assert.equal(topoToJson(state.topo), dragged, 'Kamerakorrektur ändert keine Modelldaten');
        assert.ok(topoToXml(state.topo).includes('horizontal_end_rel_to_segment_start'));
        elementById('btn-undo').dispatch('click');
        assert.equal(topoToJson(state.topo), original);
        elementById('btn-redo').dispatch('click');
        assert.equal(topoToJson(state.topo), dragged);
        const again = layoutTopo(state.topo, { layout, paper }).placements[0].elements[0].point;
        const againMatrix = elementById('svg-host').querySelector('svg').getScreenCTM();
        const againScreen = new DOMPoint(again.x, again.y).matrixTransform(againMatrix);
        const previous = { ...state.topo.segments[0].elements[0] };
        elementById('svg-host').dispatch('pointerdown', {
          target: node, pointerId: 9, button: 0, clientX: againScreen.x, clientY: againScreen.y,
        });
        windowEvents.dispatch('pointermove', {
          pointerId: 9, clientX: againScreen.x + 30, clientY: againScreen.y - 30,
        });
        windowEvents.dispatch('pointerup', { pointerId: 9 });
        const repeated = state.topo.segments[0].elements[0];
        assert.equal(
          repeated.horizontal_start_rel_to_segment_start - previous.horizontal_start_rel_to_segment_start,
          previous.horizontal_start_rel_to_segment_start - 15,
          'wiederholtes Ziehen akkumuliert keinen Griff-Offset',
        );
        assert.equal(
          repeated.vertical_start_rel_to_segment_start - previous.vertical_start_rel_to_segment_start,
          previous.vertical_start_rel_to_segment_start - 2,
        );
        elementById('btn-undo').dispatch('click');
        assert.equal(topoToJson(state.topo), dragged, 'zweite Geste ist ein eigener Undo-Schritt');
      }
    }
  }
  Object.assign(state.view, { layout: 'serpentine', paper: 'screen', zoom: 1 });
  elementById('btn-new-default').dispatch('click');
  elementById('btn-zoom-fit').dispatch('click');
});

test('Touch-Scrollen wird nur auf Symbolen verhindert, nicht auf freiem Gelände', () => {
  const host = elementById('svg-host');
  let prevented = false;
  host.dispatch('touchstart', {
    target: { closest: () => ({}) }, preventDefault: () => { prevented = true; },
  });
  assert.equal(prevented, true);
  prevented = false;
  host.dispatch('touchstart', {
    target: { closest: () => null }, preventDefault: () => { prevented = true; },
  });
  assert.equal(prevented, false);
});

test('bachab-Logo steht nur in der responsiven App-Kopfzeile neben Titel und Status', () => {
  const header = /<header class="toolbar">([\s\S]*?)<\/header>/.exec(markup)?.[1];
  assert.ok(header);
  assert.match(header, /<div class="toolbar__brand">\s*<div class="toolbar__logo-wrap">\s*<img class="toolbar__logo" src="assets\/logo\.png" alt="bachab" width="35" height="29" \/>\s*<span class="toolbar__version" id="app-version">v0\.\d+<\/span>\s*<\/div>\s*<div class="toolbar__brand-text">\s*<strong>Canyoning Topo Generator<\/strong>\s*<span class="toolbar__hint" id="status" title="bereit" role="status" aria-live="polite">bereit<\/span>/);
  assert.equal((markup.match(/assets\/logo\.png/g) || []).length, 1);
  const image = readFileSync(new URL('../assets/logo.png', import.meta.url));
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16), 35);
  assert.equal(image.readUInt32BE(20), 29);
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.toolbar\s*\{[^}]*flex-wrap: wrap;/);
  assert.match(css, /\.toolbar__brand\s*\{[^}]*align-items: center;[^}]*min-width: 0;[^}]*max-width: 100%;/);
  assert.match(css, /\.toolbar__logo\s*\{[^}]*flex: none;[^}]*width: auto;[^}]*height: 1rem;/);
  assert.match(css, /\.toolbar__brand-text\s*\{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, max-content\);[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/);
  assert.match(css, /\.toolbar__hint\s*\{[^}]*width: 0;[^}]*min-width: 100%;[^}]*overflow: hidden;[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/);
  assert.match(css, /\.toolbar__group\s*\{[^}]*flex-wrap: wrap;[^}]*max-width: 100%;/);
  for (const id of ['btn-new', 'btn-save-json', 'btn-export-svg', 'btn-export-png', 'btn-print', 'btn-undo']) {
    assert.ok(header.includes(`id="${id}"`), `${id} bleibt in der Kopfzeile`);
  }
  assert.doesNotMatch(svg(), /assets\/logo\.png|alt="bachab"/, 'kein Logo im Topo-Export');
});

test('alle sieben Abschnitte haben native summary-Überschriften; nur die gesperrte AI startet zu', () => {
  assert.deepEqual(panelHeaders.map((entry) => entry[1]), PANEL_SECTION_IDS);
  assert.equal((markup.match(/class="panel__section"/g) || []).length, 7);
  assert.deepEqual(panelHeaders.map((entry) => /<h[23][^>]*>(.*?)<\/h[23]>/.exec(entry[3])?.[1]),
    ['Topo', 'Segmente', 'Foto-Referenz', 'AI-Erkennung', 'Auswahl', 'Symbole', 'Prüfung']);
  for (const [, id, , summary] of panelHeaders) {
    const heading = id === 'panel-ai' ? 'h3' : 'h2';
    assert.match(
      summary,
      new RegExp(`^<span class="panel__arrow" aria-hidden="true"></span><${heading}[^>]*>`),
    );
    assert.equal(elementById(id).open, id !== 'panel-ai', id);
    assert.equal(elementById(id).listeners.has('keydown'), false, 'Tastatur bleibt nativ');
    if (id !== 'panel-ai') assert.equal(elementById(id).listeners.has('click'), false, 'Klick bleibt nativ');
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
  assert.match(markup, /<summary><span class="panel__arrow" aria-hidden="true"><\/span><h3 id="h-panel-ai">AI-Erkennung<\/h3><\/summary>/);
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
  // Die AI-Sperre hat eigene Tests; hier nur die frei klappbaren Abschnitte.
  const freeIds = PANEL_SECTION_IDS.filter((id) => id !== 'panel-ai');
  for (const id of freeIds) {
    const section = elementById(id);
    section.open = false;
    section.dispatch('toggle');
    assert.equal(JSON.parse(storage.get(PANEL_STORAGE_KEY))[id], false);
    assert.equal(freshPanels().find((node) => node.id === id).open, false);
    for (const otherId of freeIds.filter((other) => other !== id)) {
      assert.equal(elementById(otherId).open, true, otherId);
    }
    section.open = true;
    section.dispatch('toggle');
    assert.equal(JSON.parse(storage.get(PANEL_STORAGE_KEY))[id], true);
    assert.ok(freshPanels().filter((node) => node.id !== 'panel-ai').every((node) => node.open));
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
    ],
    ['select-new-segment', 'btn-add-segment', 'segment-shortcut', 'btn-add-shortcut', 'hint-segment-shortcut', 'shortcut-mapping', 'segment-shortcut-error', 'segment-list'],
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
  assert.match(markup, /<details id="ai-settings">\s*<summary id="lbl-ai-settings">Einstellungen<\/summary>/);
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
  elementById('btn-new-default').dispatch('click');
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

test('die Stilwahl enthält alle verfügbaren Stile ohne Schwarz/Weiß', () => {
  const options = /<select id="select-theme">([\s\S]*?)<\/select>/.exec(markup)[1];
  assert.deepEqual([...options.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]),
    ['color', 'alpiner_classic', 'eau_froide', 'pencil_sketch']);
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

test('Stil Bleistiftskizze lässt sich auswählen und wird in den Ansichten gespeichert', () => {
  const select = elementById('select-theme');
  select.value = 'pencil_sketch';
  select.dispatch('change');

  assert.equal(state.view.theme, 'pencil_sketch');
  assert.ok(svg().includes('topo-sketch-hatch'));
  assert.equal(
    JSON.parse(localStorage.getItem('canyon-topo-generator/state/v1')).view.theme,
    'pencil_sketch',
  );
});

test('die Sprachauswahl übersetzt Oberfläche und Legende und bleibt gespeichert', () => {
  const select = elementById('select-language');
  assert.ok(select, 'Sprachauswahl fehlt');
  const selectMarkup = /<select id="select-language">([\s\S]*?)<\/select>/.exec(markup)[1];
  assert.deepEqual(
    [...selectMarkup.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]),
    [['de', 'DE'], ['en', 'EN'], ['fr', 'FR'], ['it', 'IT'], ['es', 'ES']],
  );
  type('topo-duration', '3-4 h');
  assert.equal(elementById('h-panel-topo').textContent, 'Topo');
  assert.ok(svg().includes('>Dauer:<'), 'Legende ist standardmässig Deutsch');

  select.value = 'en';
  select.dispatch('change');

  assert.equal(state.view.language, 'en');
  assert.equal(elementById('h-panel-topo').textContent, 'Topo');
  assert.equal(elementById('h-panel-segments').textContent, 'Segments');
  assert.equal(elementById('lbl-topo-author').textContent, 'Author');
  assert.ok(svg().includes('>Duration:<'), 'Legende übersetzt die Dauer-Zeile nicht');
  assert.ok(!svg().includes('>Dauer:<'), 'alte deutsche Legendenbeschriftung bleibt nicht stehen');
  assert.equal(
    JSON.parse(localStorage.getItem('canyon-topo-generator/state/v1')).view.language,
    'en',
  );

  select.value = 'de';
  select.dispatch('change');
  assert.equal(state.view.language, 'de');
  assert.equal(elementById('h-panel-segments').textContent, 'Segmente');
  assert.ok(svg().includes('>Dauer:<'), 'zurück auf Deutsch stellt die alte Legendenbeschriftung wieder her');
});

test('jeder Übersetzungseintrag ist in allen Sprachen vorhanden', () => {
  assert.deepEqual(i18n.LANGUAGES, ['de', 'en', 'fr', 'it', 'es']);
  const missing = [];
  for (const [name, dict] of Object.entries(i18n)) {
    if (!dict || typeof dict !== 'object' || Array.isArray(dict)) continue;
    for (const [key, entry] of Object.entries(dict)) {
      for (const language of i18n.LANGUAGES) {
        if (typeof entry[language] !== 'string' || !entry[language]) missing.push(`${name}.${key}.${language}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('Spanisch übersetzt Oberfläche, Legende und die AI-Auswahllisten', () => {
  const select = elementById('select-language');
  const providerOption = () => elementById('ai-provider').options.find((o) => o.value === 'openai');
  const promptOption = () => elementById('ai-prompt-template').options.find((o) => o.value === 'optimized');
  assert.equal(providerOption().textContent, 'OpenAI-kompatibel');
  type('topo-duration', '2 h');

  select.value = 'es';
  select.dispatch('change');
  assert.equal(elementById('h-panel-segments').textContent, 'Segmentos');
  assert.equal(elementById('btn-export-shortlist').textContent, 'Lista breve');
  assert.ok(svg().includes('>Duración:<'), 'Legende ist nicht spanisch');
  assert.equal(providerOption().textContent, 'Compatible con OpenAI');
  assert.equal(promptOption().textContent, 'Optimizado (recomendado)');
  assert.match(elementById('ai-provider-hint').textContent, /^Por defecto:/);

  select.value = 'de';
  select.dispatch('change');
  assert.equal(providerOption().textContent, 'OpenAI-kompatibel');
  assert.equal(promptOption().textContent, 'Optimiert (empfohlen)');
});

/* ------------------------------------------------- Legende: live, wie Name */

test('der Name aktualisiert das Topo sofort beim Tippen', () => {
  type('topo-name', 'Rio Live');
  assert.equal(state.topo.canyon_name, 'Rio Live');
  assert.ok(svg().includes('Rio Live'), 'Name fehlt im gerenderten SVG');
});

test('Nutzereingaben bleiben Rohtext im Modell und werden im SVG als Text ausgegeben', () => {
  const previous = state.topo.canyon_name;
  const input = `Ä😀 & <svg onload="globalThis.pwned=1"> ' </text><script>attack()</script>`;
  type('topo-name', input);
  assert.equal(state.topo.canyon_name, input);
  assert.equal(elementById('topo-name').value, input);
  assert.match(svg(), /&lt;svg onload="globalThis\.pwned=1"&gt;/);
  assert.doesNotMatch(svg(), /<svg onload=|<script>/);
  type('topo-name', previous);
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

test('Shortcuts decken jeden Segmenttyp eindeutig ab und parsen echte Meterwerte', () => {
  assert.deepEqual(Object.values(SEGMENT_SHORTCUTS).sort(), [...SEGMENT_TYPES].sort());
  for (const [code, type] of Object.entries(SEGMENT_SHORTCUTS)) {
    assert.deepEqual(parseSegmentShortcut(`${code}23`), { type, length_in_meters: 23 });
    assert.deepEqual(parseSegmentShortcut(`  ${code.toLowerCase()} 12,5  `), { type, length_in_meters: 12.5 });
  }
  assert.deepEqual(parseSegmentShortcut('R10'), { type: 'RAPPEL', length_in_meters: 10 });
  assert.deepEqual(parseSegmentShortcut('RD23'), { type: 'RAPPEL_DRY', length_in_meters: 23 });
  assert.deepEqual(parseSegmentShortcut('rW0.25'), { type: 'RAPPEL_WET', length_in_meters: 0.25 });
  assert.deepEqual(parseSegmentShortcut('W20'), { type: 'WALK', length_in_meters: 20 });
  assert.deepEqual(parseSegmentShortcut('WA20'), { type: 'WALK', length_in_meters: 20 });
  assert.equal(parseSegmentShortcut('WE10').error, 'shortcut.removed_weir');
  for (const value of [
    '', '10', 'R', 'RD ', 'R0', 'R0,0', 'R-10', 'R+10', 'R1e3', 'RNaN',
    'RInfinity', `R${'9'.repeat(400)}`, 'R10m', 'R10 RD23', 'R1,2.3',
    'R1.', 'R.5', 'R1/2', 'R1 000', 'X10', 'RAPPEL10', 'constructor10',
  ]) {
    assert.ok(parseSegmentShortcut(value).error, `abgewiesen: ${value}`);
  }
});

test('Shortcut-Stapel wird atomar angehängt und in einem Schritt rückgängig gemacht', () => {
  elementById('btn-new-default').dispatch('click');
  const select = elementById('select-new-segment');
  assert.ok(!select.options.some((option) => option.value === 'WEIR'));
  const input = elementById('segment-shortcut');
  const before = topoToJson(state.topo);
  input.value = 'W20,R10';
  elementById('btn-add-shortcut').dispatch('click');
  assert.deepEqual(state.topo.segments.slice(-2).map((s) => [s.type, s.length_in_meters]),
    [['WALK', 20], ['RAPPEL', 10]]);
  const after = topoToJson(state.topo);
  elementById('btn-undo').dispatch('click');
  assert.equal(topoToJson(state.topo), before);
  elementById('btn-redo').dispatch('click');
  assert.equal(topoToJson(state.topo), after);
  input.value = ' j2 , p3 ';
  input.dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(state.topo.segments.slice(-2).map((s) => [s.type, s.length_in_meters]),
    [['JUMP', 2], ['POOL', 3]]);
  elementById('btn-undo').dispatch('click');
  assert.equal(topoToJson(state.topo), after);
  for (const value of ['R10, WE4, P3', 'R10,,P3', 'R10,P0', 'R10,']) {
    input.value = value;
    input.dispatch('keydown', { key: 'Enter' });
    assert.equal(topoToJson(state.topo), after);
    assert.ok(elementById('segment-shortcut-error').textContent);
  }
  assert.match(elementById('segment-shortcut-error').textContent, /R10,/);
  input.value = 'R10, WE4';
  input.dispatch('keydown', { key: 'Enter' });
  assert.match(elementById('segment-shortcut-error').textContent, /WE4.*WEIR/);
});

test('Enter hängt Shortcuts genau einmal am Ende an, erhält Auswahl und speichert echte Längen', () => {
  elementById('btn-new-default').dispatch('click');
  state.selection = { kind: 'segment', segmentIndex: 0 };
  const selection = state.selection;
  const before = [...state.topo.segments];
  const input = elementById('segment-shortcut');
  assert.match(markup, /<label class="sr-only" for="segment-shortcut">/);
  assert.match(markup, /id="segment-shortcut"[^>]*aria-describedby="segment-shortcut-error"/);
  assert.match(markup, /id="segment-shortcut"[^>]*enterkeyhint="done"/);
  assert.match(markup, /id="segment-shortcut-error" aria-live="polite"/);

  const expected = [];
  for (const [code, type] of Object.entries(SEGMENT_SHORTCUTS)) {
    input.value = `${code.toLowerCase()}12,5`;
    input.dispatch('input');
    input.dispatch('keydown', { key: 'Tab' });
    assert.equal(state.topo.segments.length, before.length + expected.length);
    let prevented = false;
    let stopped = false;
    input.dispatch('keydown', {
      key: 'Enter',
      preventDefault() { prevented = true; },
      stopPropagation() { stopped = true; },
    });
    assert.ok(prevented && stopped, 'kein Formular-Submit oder übergeordnetes Enter');
    expected.push(type);
    assert.deepEqual(state.topo.segments.slice(0, before.length), before);
    assert.deepEqual(state.topo.segments.slice(before.length).map((segment) => segment.type), expected);
    const segment = state.topo.segments.at(-1);
    assert.equal(segment.length_in_meters, 12.5);
    assert.equal(segment.angle_in_degrees, defaultAngleFor(type));
    assert.equal(state.selection, selection);
    assert.equal(input.value, '');
    assert.equal(document.activeElement, input);
    assert.equal(input.getAttribute('aria-invalid'), 'false');
    assert.equal(elementById('segment-shortcut-error').textContent, '');
    assert.match(elementById('segment-list').children.at(-1).children[0].textContent, new RegExp(`${type} 12.5 m`));
    assert.equal(JSON.parse(storage.get('canyon-topo-generator/state/v1')).topo.segments.at(-1).length_in_meters, 12.5);
  }
  const after = topoToJson(state.topo);
  input.value = 'R10';
  for (const extra of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
    input.dispatch('keydown', { key: 'Enter', ...extra });
    assert.equal(topoToJson(state.topo), after);
  }
  for (const value of ['X10', 'R', 'R0', 'R-2', 'R10m', 'R10 RD23', '']) {
    input.value = value;
    input.dispatch('input');
    input.dispatch('keydown', { key: 'Enter' });
    assert.equal(topoToJson(state.topo), after);
    assert.equal(state.selection, selection);
    assert.equal(input.value, value);
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.ok(elementById('segment-shortcut-error').textContent);
  }
  input.value = 'X10';
  input.dispatch('keydown', { key: 'Enter' });
  const language = elementById('select-language');
  language.value = 'en';
  language.dispatch('change');
  assert.match(elementById('segment-shortcut-error').textContent, /Unknown code/);
  assert.match(elementById('hint-segment-shortcut').textContent, /Enter or \+ appends/);
  language.value = 'de';
  language.dispatch('change');
  input.dispatch('input');
  assert.equal(input.getAttribute('aria-invalid'), 'false');
  assert.equal(elementById('segment-shortcut-error').textContent, '');
  elementById('btn-undo').dispatch('click');
  assert.equal(state.topo.segments.length, before.length + expected.length - 1, 'Fehler erzeugen keinen Undo-Schritt');
  elementById('btn-redo').dispatch('click');
  assert.equal(topoToJson(state.topo), after);
  elementById('btn-undo').dispatch('click');
  input.value = 'R10';
  input.dispatch('keydown', { key: 'Enter' });
  const branched = topoToJson(state.topo);
  elementById('btn-redo').dispatch('click');
  assert.equal(topoToJson(state.topo), branched, 'neuer Shortcut verwirft Redo wie jede Editieraktion');
  // Die bestehende Plus-Aktion fügt weiterhin hinter der Auswahl ein.
  state.selection = { kind: 'segment', segmentIndex: 0 };
  elementById('select-new-segment').value = 'JUMP';
  elementById('btn-add-segment').dispatch('click');
  assert.equal(state.topo.segments[1].type, 'JUMP');
  assert.equal(state.selection.segmentIndex, 1);
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
  const options = [...select.matchAll(/<option value="([^"]+)"(?: id="[^"]+")?>([^<]+)<\/option>/g)].map(
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
  for (const type of ['WALK', 'RAPPEL', 'RAPPEL_DRY', 'RAPPEL_WET', 'JUMP', 'SLIDE', 'CLIMB']) {
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
  select.value = 'WALK';
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

test('Busch lässt sich über Natur platzieren und per Undo/Redo wiederherstellen', () => {
  state.topo = createEmptyTopo();
  state.selection = { kind: 'segment', segmentIndex: 0 };
  elementById('topo-name').dispatch('input');
  const before = topoToJson(state.topo);
  const button = elementById('symbol-palette').descendants()
    .find((node) => node.tagName === 'BUTTON' && node.textContent === 'Busch');
  assert.ok(button);
  button.dispatch('click');
  assert.equal(state.topo.segments[0].elements.at(-1).type, 'BUSH');
  assert.equal(state.selection.kind, 'element');
  assert.ok(svg().includes('M-1.25,0 C-1.55,-0.25'));
  const after = topoToJson(state.topo);
  assert.match(storage.get('canyon-topo-generator/state/v1'), /"BUSH"/);
  elementById('btn-undo').dispatch('click');
  assert.equal(topoToJson(state.topo), before);
  elementById('btn-redo').dispatch('click');
  assert.equal(topoToJson(state.topo), after);
});

test('Helikopter lässt sich als Punktsymbol platzieren und per Undo/Redo wiederherstellen', () => {
  state.topo = createEmptyTopo();
  state.selection = { kind: 'segment', segmentIndex: 0 };
  elementById('topo-name').dispatch('input');
  const before = topoToJson(state.topo);
  const button = elementById('symbol-palette').descendants()
    .find((node) => node.tagName === 'BUTTON' && node.textContent === 'Helikopter');
  assert.ok(button);
  button.dispatch('click');
  const placed = state.topo.segments[0].elements.at(-1);
  assert.equal(placed.type, 'HELICOPTER');
  assert.equal(placed.horizontal_end_rel_to_segment_start, null);
  assert.equal(placed.vertical_end_rel_to_segment_start, null);
  assert.equal(state.selection.kind, 'element');
  assert.ok(svg().includes('M-1.45,-1.3 L1.65,-1.3'));
  const after = topoToJson(state.topo);
  elementById('btn-undo').dispatch('click');
  assert.equal(topoToJson(state.topo), before);
  elementById('btn-redo').dispatch('click');
  assert.equal(topoToJson(state.topo), after);
});

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
  const savedTopo = JSON.parse(localStorage.getItem('canyon-topo-generator/state/v1')).topo;
  const legacy = await restoredAppWith({ theme: 'bw', paper: 'a4_portrait' }, 'restore-legacy');
  test('ältere gespeicherte Zustände bleiben kompatibel', () => {
    assert.equal(legacy.state.view.layout, 'serpentine');
    assert.equal(legacy.state.view.theme, 'color');
    assert.equal(elementById('select-theme').value, 'color');
    assert.equal(legacy.state.view.paper, 'a4_portrait');
    assert.equal(elementById('select-layout').value, 'serpentine');
    assert.deepEqual(JSON.parse(localStorage.getItem('canyon-topo-generator/state/v1')).topo, savedTopo);
    assert.equal(JSON.parse(localStorage.getItem('canyon-topo-generator/state/v1')).view.theme, 'color');
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
  const list = /<div class="view-switch" id="view-switch" role="tablist" aria-label="Ansicht">([\s\S]*?)<\/div>/.exec(markup);
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
  const button = /<button\s+type="button"\s+class="toolbar__menu"\s+id="btn-menu"\s+aria-expanded="false"\s+aria-controls="([^"]+)"\s*>[\s\S]*?Menü<\/span><\/button>/.exec(markup);
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
  assert.match(phone, /\.toolbar:not\(\.is-menu-open\) \.toolbar__group:not\(\.toolbar__group--history\):not\(#toolbar-export\)\s*\{\s*display: none;/);
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
  assert.doesNotMatch(appSource, /'(mouse|touch)(down|move|up|end)'/);
  assert.match(appSource, /addEventListener\('touchstart',[\s\S]*?\{ passive: false \}/);
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
  node('btn-save');
  node('btn-new');
  const newMenu = node('new-menu', 'div');
  for (const id of ['btn-new-default', 'btn-new-empty', 'btn-example', 'btn-random', 'btn-open-file', 'btn-open-oc']) {
    newMenu.appendChild(node(id));
  }
  const saveMenu = node('save-menu', 'div');
  for (const id of ['btn-save-json', 'btn-save-xml', 'btn-export-svg', 'btn-export-png', 'btn-export-shortlist', 'btn-print', 'btn-save-oc']) {
    saveMenu.appendChild(node(id));
  }
  const root = new FakeNode('document');
  root.getElementById = (id) => nodes.get(id);
  const win = new FakeNode('window');
  win.innerWidth = 400;
  win.innerHeight = 800;
  win.matchMedia = (text) => (assert.equal(text, MOBILE_QUERY), query);
  const api = initResponsive({ root, win });
  const setMobile = (value) => {
    query.matches = value;
    for (const handler of listeners) handler({ matches: value });
  };
  return { nodes, api, root, win, setMobile, get: (id) => nodes.get(id) };
}

test('Neu-Popover bündelt die sechs Aktionen ohne doppelte Toolbar-Knöpfe', () => {
  assert.match(markup, /id="btn-new" popovertarget="new-menu" aria-controls="new-menu" aria-expanded="false">Neu/);
  const menu = /<div id="new-menu"[^>]*popover="auto"[^>]*>([\s\S]*?)<\/div>/.exec(markup)[1];
  const ids = ['btn-new-default', 'btn-new-empty', 'btn-example', 'btn-random', 'btn-open-file', 'btn-open-oc'];
  assert.deepEqual([...menu.matchAll(/<button[^>]*id="([^"]+)"/g)].map((match) => match[1]), ids);
  for (const id of ids) assert.equal((markup.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
});

test('Neu-Auswahl: Tastatur, Fokus, Aussenklick und Smartphone-Toolbar', () => {
  const { get, root, win } = fakeResponsiveRoot();
  const menu = get('new-menu');
  get('btn-menu').dispatch('click');
  menu.showPopover();
  assert.equal(get('btn-menu').getAttribute('aria-expanded'), 'true', 'Auslöser bleibt sichtbar');
  assert.equal(get('btn-new').getAttribute('aria-expanded'), 'true');
  assert.equal(get('btn-new-default').focused, true);
  menu.dispatch('keydown', { key: 'End', target: get('btn-new-default') });
  assert.equal(get('btn-open-oc').focused, true);
  menu.dispatch('keydown', { key: 'ArrowDown', target: get('btn-open-oc') });
  assert.equal(get('btn-new-default').focused, true);
  menu.dispatch('keydown', { key: 'Escape' });
  assert.equal(menu.popoverOpen, false);
  assert.equal(get('btn-new').focused, true);
  assert.equal(get('btn-new').getAttribute('aria-expanded'), 'false');
  menu.showPopover();
  root.dispatch('focusin', { target: get('btn-example') });
  assert.equal(menu.popoverOpen, true);
  root.dispatch('focusin', { target: get('view-tab-topo') });
  assert.equal(menu.popoverOpen, false);
  menu.showPopover();
  win.dispatch('resize');
  assert.equal(menu.popoverOpen, false);
  for (const id of ['btn-new-default', 'btn-new-empty', 'btn-example', 'btn-random', 'btn-open-file', 'btn-open-oc']) {
    menu.showPopover();
    get(id).dispatch('click');
    assert.equal(menu.popoverOpen, false);
    assert.equal(get('btn-new').focused, true);
  }
  menu.showPopover();
  get('btn-menu').dispatch('click');
  assert.equal(menu.popoverOpen, false);
});

test('Leer erzeugt ein Topo ohne Segmente und unterstützt Undo, Redo und Autosave', () => {
  elementById('btn-new-default').dispatch('click');
  const before = topoToJson(state.topo);
  assert.equal(state.topo.segments.length, 3);
  elementById('btn-new-empty').dispatch('click');
  assert.deepEqual(state.topo.segments, []);
  assert.equal(state.selection, null);
  assert.deepEqual(JSON.parse(storage.get('canyon-topo-generator/state/v1')).topo.segments, []);
  assert.match(elementById('status').textContent, /ohne Segmente/);
  elementById('btn-undo').dispatch('click');
  assert.equal(topoToJson(state.topo), before);
  elementById('btn-redo').dispatch('click');
  assert.deepEqual(state.topo.segments, []);
  elementById('btn-undo').dispatch('click');
});

test('Öffnen startet den Dateidialog; OC-Platzhalter ändern keine Daten und senden keine Anfrage', () => {
  const fileInput = elementById('file-open');
  let clicks = 0;
  const oldClick = fileInput.click;
  fileInput.click = () => { clicks += 1; };
  try {
    elementById('btn-open-file').listeners.get('click').at(-1)();
    assert.equal(clicks, 1);
  } finally {
    fileInput.click = oldClick;
  }
  const previous = topoToJson(state.topo);
  elementById('btn-new-default').dispatch('click');
  const before = topoToJson(state.topo);
  const stored = storage.get('canyon-topo-generator/state/v1');
  const oldFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = () => { requests += 1; throw new Error('unexpected request'); };
  try {
    for (const id of ['btn-open-oc', 'btn-save-oc']) {
      elementById(id).dispatch('click');
      assert.equal(topoToJson(state.topo), before);
      assert.equal(storage.get('canyon-topo-generator/state/v1'), stored);
      assert.match(elementById('status').textContent, /API.*noch bereitgestellt/);
    }
    assert.equal(requests, 0);
    elementById('btn-undo').dispatch('click');
    assert.equal(topoToJson(state.topo), previous, 'OC erzeugt keinen Undo-Schritt');
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('Speichern-Popover bündelt Exportaktionen und OC-Platzhalter', () => {
  assert.match(markup, /id="btn-save" popovertarget="save-menu" aria-controls="save-menu" aria-expanded="false">Speichern…/);
  const menu = /<div id="save-menu"[^>]*popover="auto"[^>]*>([\s\S]*?)<\/div>/.exec(markup)[1];
  const ids = ['btn-save-json', 'btn-save-xml', 'btn-export-svg', 'btn-export-png', 'btn-export-shortlist', 'btn-print', 'btn-save-oc'];
  assert.equal((menu.match(/<button /g) || []).length, 7);
  assert.match(menu, /id="btn-export-shortlist">Kurzliste</);
  for (const id of ids) {
    assert.equal((markup.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
    assert.ok(menu.includes(`id="${id}"`));
  }
});

test('Speichern-Auswahl: Fokus, Pfeile, Escape, Fokus-aussen, Resize und Aktionsabschluss', () => {
  const { get, root, win } = fakeResponsiveRoot();
  const menu = get('save-menu');
  get('btn-menu').dispatch('click');
  menu.showPopover();
  assert.equal(get('btn-menu').getAttribute('aria-expanded'), 'false', 'kein verschachteltes Smartphone-Menü');
  assert.equal(get('btn-save').getAttribute('aria-expanded'), 'true');
  assert.equal(get('btn-save-json').focused, true);
  menu.dispatch('keydown', { key: 'End', target: get('btn-save-json') });
  assert.equal(get('btn-save-oc').focused, true);
  menu.dispatch('keydown', { key: 'ArrowDown', target: get('btn-save-oc') });
  assert.equal(get('btn-save-json').focused, true);
  menu.dispatch('keydown', { key: 'Escape' });
  assert.equal(menu.popoverOpen, false);
  assert.equal(get('btn-save').focused, true);
  assert.equal(get('btn-save').getAttribute('aria-expanded'), 'false');
  menu.showPopover();
  root.dispatch('focusin', { target: get('btn-export-svg') });
  assert.equal(menu.popoverOpen, true);
  root.dispatch('focusin', { target: get('view-tab-topo') });
  assert.equal(menu.popoverOpen, false);
  menu.showPopover();
  win.dispatch('resize');
  assert.equal(menu.popoverOpen, false);
  for (const id of ['btn-save-json', 'btn-save-xml', 'btn-export-svg', 'btn-export-png', 'btn-export-shortlist', 'btn-print', 'btn-save-oc']) {
    menu.showPopover();
    get(id).dispatch('click');
    assert.equal(menu.popoverOpen, false);
  }
});

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

{
  const key = 'canyon-topo-generator/state/v1';
  const legacy = JSON.stringify({ topo: { segments: [
    { type: 'WALK', length_in_meters: 10 },
    { type: 'WEIR', length_in_meters: 8, depth_in_meters: 3 },
  ] } });
  storage.set(key, legacy);
  const restored = await import('../src/app.js?restore-removed-weir');
  test('WEIR-Autosave bleibt unverändert und ist während der Sitzung geschützt', () => {
    assert.equal(storage.get(key), legacy);
    assert.ok(restored.state.topo.segments.every((segment) => segment.type !== 'WEIR'));
    assert.match(elementById('status').textContent, /WEIR.*Autosave/);
    const handler = elementById('btn-new-default').listeners.get('click').at(-1);
    handler({ target: elementById('btn-new-default') });
    assert.equal(storage.get(key), legacy);
    assert.match(elementById('status').textContent, /WEIR.*Autosave/);
  });
}

/* --------------------------------------- XML-Link beim Start */

{
  const key = 'canyon-topo-generator/state/v1';
  const originalFetch = globalThis.fetch;
  const originalLocation = window.location;
  const originalParser = globalThis.DOMParser;
  const draft = JSON.stringify({ topo: { canyon_name: 'Gesicherter Entwurf', segments: [] } });
  const xml = '<topo canyon_name="Link"><segment type="WALK" length_in_meters="20"/></topo>';
  let serial = 0;
  let requests;
  globalThis.DOMParser = class {
    parseFromString(text) {
      return {
        documentElement: { nodeName: text.startsWith('<topo') ? 'topo' : 'parsererror' },
        querySelector: () => text.includes('INVALID') ? {} : null,
      };
    }
  };
  async function start(source, fetcher) {
    storage.set(key, draft);
    requests = [];
    window.location = { href: `https://example.test/app/index.html${source === null ? '' : `?source=${encodeURIComponent(source)}`}` };
    globalThis.fetch = (...args) => { requests.push(args); return fetcher(...args); };
    const instance = await import(`../src/app.js?source-test-${serial++}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return instance;
  }
  const ok = async () => ({ ok: true, text: async () => xml });
  try {
    const relative = await start('examples/route.xml', ok);
    test('XML-Link lädt relativ zur App und schützt den Entwurf dauerhaft', () => {
      assert.equal(requests[0][0], 'https://example.test/app/examples/route.xml');
      assert.deepEqual(requests[0][1], { redirect: 'error', credentials: 'omit' });
      assert.equal(relative.state.topo.canyon_name, 'Link');
      assert.equal(relative.state.topo.segments[0].length_in_meters, 20);
      assert.equal(elementById('topo-name').value, 'Link');
      assert.match(svg(), /Link/);
      assert.equal(storage.get(key), draft);
      const name = elementById('topo-name');
      name.value = 'Geändert';
      name.listeners.get('input').at(-1)({ target: name });
      assert.equal(storage.get(key), draft);
      assert.match(elementById('status').textContent, /Autosave.*aus/);
    });
    const root = await start('/examples/route.xml', ok);
    test('Root-relative XML-Links werden vom Origin-Root aufgelöst', () => {
      assert.equal(requests[0][0], 'https://example.test/examples/route.xml');
      assert.equal(root.state.topo.canyon_name, 'Link');
      const undo = elementById('btn-undo').listeners.get('click').at(-1);
      undo({ target: elementById('btn-undo') });
      assert.equal(root.state.topo.canyon_name, 'Gesicherter Entwurf');
      assert.equal(storage.get(key), draft);
    });
    for (const source of ['', 'https://other.test/x.xml', 'https://u:p@example.test/x.xml', 'javascript:alert(1)', '/x.json']) {
      const instance = await start(source, ok);
      test(`ungültige Quelle ${source} wird ohne Request abgewiesen`, () => {
        assert.equal(requests.length, 0);
        assert.equal(instance.state.topo.canyon_name, 'Gesicherter Entwurf');
        assert.equal(storage.get(key), draft);
        assert.match(elementById('status').textContent, /Fehler/);
      });
    }
    for (const [label, fetcher, expected] of [
      ['HTTP', async () => ({ ok: false, status: 404 }), /HTTP 404/],
      ['Netzwerk/Redirect', async () => { throw new Error('network'); }, /network/],
      ['XML', async () => ({ ok: true, text: async () => '<topo>INVALID' }), /XML/],
      ['DTD', async () => ({ ok: true, text: async () => '<!DOCTYPE topo><topo/>' }), /XML/],
      ['WEIR', async () => ({ ok: true, text: async () => '<topo><segment type="WEIR"/></topo>' }), /WEIR/],
    ]) {
      const instance = await start('route.xml', fetcher);
      test(`${label}-Fehler bewahrt Topo und Autosave`, () => {
        assert.equal(instance.state.topo.canyon_name, 'Gesicherter Entwurf');
        assert.equal(storage.get(key), draft);
        assert.match(elementById('status').textContent, expected);
      });
    }
    let resolveFetch;
    const pending = await start('route.xml', () => new Promise((resolve) => { resolveFetch = resolve; }));
    documentEvents.dispatch('input');
    const name = elementById('topo-name');
    name.value = 'Benutzeränderung';
    name.listeners.get('input').at(-1)({ target: name });
    resolveFetch(await ok());
    await new Promise((resolve) => setTimeout(resolve, 0));
    test('späte Netzwerkantwort überschreibt keine Benutzeränderung', () => {
      assert.equal(pending.state.topo.canyon_name, 'Benutzeränderung');
      assert.equal(JSON.parse(storage.get(key)).topo.canyon_name, 'Benutzeränderung');
    });
    const restored = await start(null, ok);
    test('ohne source wird wie bisher der Autosave wiederhergestellt', () => {
      assert.equal(requests.length, 0);
      assert.equal(restored.state.topo.canyon_name, 'Gesicherter Entwurf');
    });
  } finally {
    globalThis.fetch = originalFetch;
    window.location = originalLocation;
    globalThis.DOMParser = originalParser;
  }
}

console.log(`\n${passed} Test(s) bestanden.`);
