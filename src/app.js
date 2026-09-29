/**
 * Editor-Anwendung: Zustand, UI-Bindings, Interaktion.
 */
import {
  SEGMENT_TYPES,
  cloneTopo,
  createEmptyTopo,
  createElement,
  createSegment,
  defaultAngleFor,
  defaultLengthFor,
  normalizeTopo,
  renumberElements,
  validateTopo,
} from './model.js';
import { topoFromJson, topoToJson } from './io-json.js';
import { topoFromXml, topoToXml } from './io-xml.js';
import { layoutTopo, worldToLocal } from './layout.js';
import { renderTopoSvg } from './renderer.js';
import { SYMBOLS, symbolOptions } from './symbols.js';
import {
  downloadBlob,
  downloadText,
  printSvg,
  slugify,
  svgToPngBlob,
} from './exporters.js';
import { isTopoProviderAvailable, photoToTopo } from './ai.js';

const STORAGE_KEY = 'canyon-topo-generator/state/v1';

const state = {
  topo: createEmptyTopo(),
  selection: null,
  view: { layout: 'serpentine', theme: 'color', paper: 'screen', zoom: 1 },
  photo: { src: null, opacity: 45, scale: 100, x: 0, y: 0 },
};

let history = { past: [], future: [] };
let currentLayout = null;
let currentSvgText = '';

const $ = (id) => document.getElementById(id);

/* ----------------------------------------------------------------- Zustand */

function pushHistory() {
  history.past.push(topoToJson(state.topo, 0));
  if (history.past.length > 80) history.past.shift();
  history.future = [];
}

function undo() {
  if (!history.past.length) return;
  history.future.push(topoToJson(state.topo, 0));
  state.topo = topoFromJson(history.past.pop());
  state.selection = null;
  render();
}

function redo() {
  if (!history.future.length) return;
  history.past.push(topoToJson(state.topo, 0));
  state.topo = topoFromJson(history.future.pop());
  state.selection = null;
  render();
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        topo: JSON.parse(topoToJson(state.topo, 0)),
        view: state.view,
        photo: state.photo,
      }),
    );
  } catch {
    /* Speicher voll oder nicht verfügbar – Autosave ist optional. */
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    state.topo = normalizeTopo(saved.topo);
    Object.assign(state.view, saved.view || {});
    Object.assign(state.photo, saved.photo || {});
    return true;
  } catch {
    return false;
  }
}

function setStatus(message) {
  $('status').textContent = message;
}

/* ------------------------------------------------------------------ Render */

function render() {
  currentLayout = layoutTopo(state.topo, { layout: state.view.layout });
  currentSvgText = renderTopoSvg(state.topo, currentLayout, {
    theme: state.view.theme,
    paper: state.view.paper,
  });

  $('svg-host').innerHTML = renderTopoSvg(state.topo, currentLayout, {
    theme: state.view.theme,
    paper: state.view.paper,
    interactive: true,
    selection: state.selection,
  });

  renderSegmentList();
  renderInspector();
  renderIssues();
  applyZoom();
  applyPhoto();
  persist();
}

function segmentSummary(segment, index) {
  const parts = [`${index + 1}.`, segment.type, `${segment.length_in_meters} m`];
  if (segment.angle_in_degrees) parts.push(`${segment.angle_in_degrees}°`);
  if (segment.elements.length) parts.push(`· ${segment.elements.length} Sym.`);
  return parts.join(' ');
}

function renderSegmentList() {
  const list = $('segment-list');
  list.innerHTML = '';
  state.topo.segments.forEach((segment, index) => {
    const item = document.createElement('li');
    const selected =
      state.selection && state.selection.segmentIndex === index;
    if (selected) item.classList.add('is-selected');

    const label = document.createElement('span');
    label.className = 'segment-list__label';
    label.textContent = segmentSummary(segment, index);
    item.appendChild(label);

    for (const [text, title, action] of [
      ['↑', 'nach oben', () => moveSegment(index, -1)],
      ['↓', 'nach unten', () => moveSegment(index, 1)],
      ['⧉', 'duplizieren', () => duplicateSegment(index)],
      ['✕', 'löschen', () => deleteSegment(index)],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.title = title;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        action();
      });
      item.appendChild(button);
    }

    item.addEventListener('click', () => {
      state.selection = { kind: 'segment', segmentIndex: index };
      render();
    });
    list.appendChild(item);
  });
}

function field(labelText, input, full = false) {
  const label = document.createElement('label');
  if (full) label.classList.add('full');
  label.append(labelText, input);
  return label;
}

function numberInput(value, onChange, step = 1) {
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step);
  input.value = value ?? '';
  input.addEventListener('change', () => {
    pushHistory();
    onChange(input.value === '' ? null : Number(input.value));
    render();
  });
  return input;
}

function textInput(value, onChange) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value ?? '';
  input.addEventListener('change', () => {
    pushHistory();
    onChange(input.value);
    render();
  });
  return input;
}

function selectInput(options, value, onChange) {
  const select = document.createElement('select');
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option;
    node.textContent = option;
    if (option === value) node.selected = true;
    select.appendChild(node);
  }
  select.addEventListener('change', () => {
    pushHistory();
    onChange(select.value);
    render();
  });
  return select;
}

function checkboxInput(value, onChange) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!value;
  input.addEventListener('change', () => {
    pushHistory();
    onChange(input.checked);
    render();
  });
  return input;
}

function renderInspector() {
  const host = $('inspector');
  host.innerHTML = '';
  const selection = state.selection;
  if (!selection) {
    host.innerHTML = '<p class="hint">Segment oder Symbol im Topo anklicken.</p>';
    return;
  }
  const segment = state.topo.segments[selection.segmentIndex];
  if (!segment) {
    state.selection = null;
    host.innerHTML = '<p class="hint">Auswahl nicht mehr vorhanden.</p>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'inspector-grid';

  if (selection.kind === 'segment') {
    grid.append(
      field(
        'Typ',
        selectInput(SEGMENT_TYPES, segment.type, (value) => {
          segment.type = value;
        }),
        true,
      ),
      field(
        'Länge (m)',
        numberInput(segment.length_in_meters, (value) => {
          segment.length_in_meters = value ?? 1;
        }),
      ),
      field(
        'Winkel (°)',
        numberInput(segment.angle_in_degrees, (value) => {
          segment.angle_in_degrees = value ?? 0;
        }),
      ),
      field(
        'Gehzeit (min)',
        numberInput(segment.duration_to_walk_in_min, (value) => {
          segment.duration_to_walk_in_min = value;
        }),
      ),
      field(
        'Zeilenumbruch erzwingen',
        checkboxInput(segment.force_cut_row_after_this_segment, (value) => {
          segment.force_cut_row_after_this_segment = value;
        }),
      ),
      field(
        'Umbruch verhindern',
        checkboxInput(segment.do_not_cut_row_after_this_segment, (value) => {
          segment.do_not_cut_row_after_this_segment = value;
        }),
      ),
    );
    host.appendChild(grid);
    return;
  }

  const element = segment.elements[selection.elementIndex];
  if (!element) {
    state.selection = { kind: 'segment', segmentIndex: selection.segmentIndex };
    renderInspector();
    return;
  }
  const isRange = !!(SYMBOLS[element.type] && SYMBOLS[element.type].range);

  grid.append(
    field(
      'Typ',
      selectInput(Object.keys(SYMBOLS), element.type, (value) => {
        element.type = value;
        if (SYMBOLS[value]?.range && element.horizontal_end_rel_to_segment_start == null) {
          element.horizontal_end_rel_to_segment_start =
            element.horizontal_start_rel_to_segment_start + 5;
          element.vertical_end_rel_to_segment_start =
            element.vertical_start_rel_to_segment_start;
        }
      }),
      true,
    ),
    field(
      'Position entlang (m)',
      numberInput(
        element.horizontal_start_rel_to_segment_start,
        (value) => {
          element.horizontal_start_rel_to_segment_start = value ?? 0;
        },
        0.5,
      ),
    ),
    field(
      'Position quer (m)',
      numberInput(
        element.vertical_start_rel_to_segment_start,
        (value) => {
          element.vertical_start_rel_to_segment_start = value ?? 0;
        },
        0.5,
      ),
    ),
  );

  if (isRange) {
    grid.append(
      field(
        'Ende entlang (m)',
        numberInput(
          element.horizontal_end_rel_to_segment_start,
          (value) => {
            element.horizontal_end_rel_to_segment_start = value;
          },
          0.5,
        ),
      ),
      field(
        'Ende quer (m)',
        numberInput(
          element.vertical_end_rel_to_segment_start,
          (value) => {
            element.vertical_end_rel_to_segment_start = value;
          },
          0.5,
        ),
      ),
    );
  }

  grid.append(
    field(
      'Größe',
      numberInput(
        element.size,
        (value) => {
          element.size = value ?? 1;
        },
        0.1,
      ),
    ),
    field(
      'Text',
      textInput(element.text, (value) => {
        element.text = value;
      }),
      true,
    ),
  );

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Symbol löschen';
  remove.addEventListener('click', () => {
    pushHistory();
    segment.elements.splice(selection.elementIndex, 1);
    state.selection = { kind: 'segment', segmentIndex: selection.segmentIndex };
    render();
  });

  host.append(grid, remove);
}

function renderIssues() {
  const list = $('issues');
  list.innerHTML = '';
  const issues = validateTopo(state.topo);
  if (!issues.length) {
    const item = document.createElement('li');
    item.className = 'ok';
    item.textContent = 'Keine Auffälligkeiten.';
    list.appendChild(item);
    return;
  }
  for (const issue of issues) {
    const item = document.createElement('li');
    item.className = issue.level;
    item.textContent = issue.message;
    list.appendChild(item);
  }
}

function renderPalette() {
  const host = $('symbol-palette');
  host.innerHTML = '';
  for (const group of symbolOptions()) {
    if (!group.symbols.length) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'symbol-group';
    const title = document.createElement('h3');
    title.textContent = group.label;
    const items = document.createElement('div');
    items.className = 'symbol-group__items';
    for (const symbol of group.symbols) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = symbol.label;
      button.addEventListener('click', () => addSymbol(symbol.type));
      items.appendChild(button);
    }
    wrapper.append(title, items);
    host.appendChild(wrapper);
  }
}

/* -------------------------------------------------------------- Mutationen */

function selectedSegmentIndex() {
  if (state.selection) return state.selection.segmentIndex;
  return state.topo.segments.length ? state.topo.segments.length - 1 : -1;
}

function addSymbol(type) {
  const index = selectedSegmentIndex();
  if (index < 0) {
    setStatus('Zuerst ein Segment anlegen.');
    return;
  }
  const segment = state.topo.segments[index];
  pushHistory();
  const element = createElement(type, {
    horizontal_start_rel_to_segment_start: segment.length_in_meters / 2,
    vertical_start_rel_to_segment_start: 0,
  });
  if (SYMBOLS[type]?.range) {
    element.horizontal_end_rel_to_segment_start =
      element.horizontal_start_rel_to_segment_start + 5;
    element.vertical_end_rel_to_segment_start = 0;
  }
  segment.elements.push(element);
  state.selection = {
    kind: 'element',
    segmentIndex: index,
    elementIndex: segment.elements.length - 1,
  };
  render();
  setStatus(`${SYMBOLS[type]?.label || type} hinzugefügt.`);
}

function addSegment(type) {
  pushHistory();
  const segment = createSegment(type, {
    length_in_meters: defaultLengthFor(type),
    angle_in_degrees: defaultAngleFor(type),
  });
  const index = selectedSegmentIndex();
  const insertAt = index < 0 ? state.topo.segments.length : index + 1;
  state.topo.segments.splice(insertAt, 0, segment);
  state.selection = { kind: 'segment', segmentIndex: insertAt };
  render();
}

function moveSegment(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.topo.segments.length) return;
  pushHistory();
  const [segment] = state.topo.segments.splice(index, 1);
  state.topo.segments.splice(target, 0, segment);
  state.selection = { kind: 'segment', segmentIndex: target };
  render();
}

function duplicateSegment(index) {
  pushHistory();
  const copy = JSON.parse(JSON.stringify(state.topo.segments[index]));
  state.topo.segments.splice(index + 1, 0, copy);
  state.selection = { kind: 'segment', segmentIndex: index + 1 };
  render();
}

function deleteSegment(index) {
  pushHistory();
  state.topo.segments.splice(index, 1);
  state.selection = null;
  render();
}

/* ------------------------------------------------------------- Interaktion */

function svgPoint(event) {
  const svg = $('svg-host').querySelector('svg');
  if (!svg) return null;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(matrix.inverse());
}

let drag = null;

function onPointerDown(event) {
  const elementNode = event.target.closest('.topo-element');
  const segmentNode = event.target.closest('.topo-segment-hit');

  if (elementNode) {
    const segmentIndex = Number(elementNode.dataset.seg);
    const elementIndex = Number(elementNode.dataset.el);
    state.selection = { kind: 'element', segmentIndex, elementIndex };

    const placement = currentLayout.placements[segmentIndex];
    const element = state.topo.segments[segmentIndex].elements[elementIndex];
    const point = svgPoint(event);
    if (placement && point) {
      const local = worldToLocal(placement, point);
      drag = {
        node: elementNode,
        segmentIndex,
        elementIndex,
        element,
        placement,
        offset: {
          horizontal:
            element.horizontal_start_rel_to_segment_start - local.horizontal,
          vertical: element.vertical_start_rel_to_segment_start - local.vertical,
        },
        span:
          element.horizontal_end_rel_to_segment_start == null
            ? null
            : {
                horizontal:
                  element.horizontal_end_rel_to_segment_start -
                  element.horizontal_start_rel_to_segment_start,
                vertical:
                  element.vertical_end_rel_to_segment_start -
                  element.vertical_start_rel_to_segment_start,
              },
        moved: false,
      };
      elementNode.setPointerCapture?.(event.pointerId);
    }
    render();
    return;
  }

  if (segmentNode) {
    state.selection = {
      kind: 'segment',
      segmentIndex: Number(segmentNode.dataset.seg),
    };
    render();
    return;
  }

  state.selection = null;
  render();
}

function onPointerMove(event) {
  if (!drag) return;
  const point = svgPoint(event);
  if (!point) return;
  const local = worldToLocal(drag.placement, point);
  const next = {
    horizontal: round(local.horizontal + drag.offset.horizontal),
    vertical: round(local.vertical + drag.offset.vertical),
  };
  if (!drag.moved) {
    pushHistory();
    drag.moved = true;
  }
  drag.element.horizontal_start_rel_to_segment_start = next.horizontal;
  drag.element.vertical_start_rel_to_segment_start = next.vertical;
  if (drag.span) {
    drag.element.horizontal_end_rel_to_segment_start =
      next.horizontal + drag.span.horizontal;
    drag.element.vertical_end_rel_to_segment_start =
      next.vertical + drag.span.vertical;
  }
  render();
}

function round(value) {
  return Math.round(value * 4) / 4;
}

function onPointerUp() {
  drag = null;
}

/* ------------------------------------------------------------------- Ansicht */

function applyZoom() {
  const stage = $('stage');
  stage.style.transform = `scale(${state.view.zoom})`;
  $('zoom-label').textContent = `${Math.round(state.view.zoom * 100)}%`;
}

function fitZoom() {
  const svg = $('svg-host').querySelector('svg');
  const canvas = $('canvas');
  if (!svg) return;
  const width = Number(svg.getAttribute('width')) || svg.clientWidth;
  if (!width) return;
  state.view.zoom = Math.min(1, (canvas.clientWidth - 64) / width);
  applyZoom();
}

function applyPhoto() {
  const photo = $('photo-layer');
  if (!state.photo.src) {
    photo.hidden = true;
    return;
  }
  photo.hidden = false;
  photo.src = state.photo.src;
  photo.style.opacity = String(state.photo.opacity / 100);
  photo.style.transform = `translate(${state.photo.x * 4}px, ${state.photo.y * 4}px) scale(${state.photo.scale / 100})`;
}

/* --------------------------------------------------------------- Dateien */

async function openFile(file) {
  const text = await file.text();
  try {
    pushHistory();
    state.topo = /^\s*</.test(text) ? topoFromXml(text) : topoFromJson(text);
    state.selection = null;
    render();
    fitZoom();
    setStatus(`${file.name} geladen.`);
  } catch (error) {
    setStatus(`Fehler beim Laden: ${error.message}`);
  }
}

async function loadExample() {
  try {
    const response = await fetch('examples/my-canyon-inferiore.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    pushHistory();
    state.topo = topoFromJson(await response.text());
    state.selection = null;
    render();
    fitZoom();
    setStatus('Beispiel-Topo geladen.');
  } catch (error) {
    setStatus(`Beispiel nicht ladbar: ${error.message}`);
  }
}

/* ---------------------------------------------------------------- Bindings */

function bindTopoFields() {
  const bindings = [
    ['topo-name', 'canyon_name', (value) => value],
    ['topo-date', 'date', (value) => value],
    ['topo-max-walk', 'maximum_walk_length', Number],
    ['topo-line-distance', 'distance_of_single_line', Number],
    ['topo-legend-offset', 'legend_offset_top', Number],
  ];
  for (const [id, key, transform] of bindings) {
    $(id).addEventListener('change', (event) => {
      pushHistory();
      state.topo[key] = transform(event.target.value);
      render();
    });
  }
}

function syncTopoFields() {
  $('topo-name').value = state.topo.canyon_name;
  $('topo-date').value = state.topo.date;
  $('topo-max-walk').value = state.topo.maximum_walk_length;
  $('topo-line-distance').value = state.topo.distance_of_single_line;
  $('topo-legend-offset').value = state.topo.legend_offset_top;
}

function bindToolbar() {
  $('btn-new').addEventListener('click', () => {
    pushHistory();
    state.topo = createEmptyTopo();
    state.selection = null;
    render();
    syncTopoFields();
    setStatus('Neues Topo.');
  });
  $('btn-example').addEventListener('click', async () => {
    await loadExample();
    syncTopoFields();
  });
  $('file-open').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    if (file) {
      await openFile(file);
      syncTopoFields();
    }
    event.target.value = '';
  });

  $('btn-save-json').addEventListener('click', () => {
    downloadText(
      `${slugify(state.topo.canyon_name)}.json`,
      topoToJson(state.topo),
      'application/json',
    );
    setStatus('JSON gespeichert.');
  });
  $('btn-save-xml').addEventListener('click', () => {
    downloadText(
      `${slugify(state.topo.canyon_name)}.xml`,
      topoToXml(state.topo),
      'application/xml',
    );
    setStatus('XML gespeichert.');
  });
  $('btn-export-svg').addEventListener('click', () => {
    downloadText(
      `${slugify(state.topo.canyon_name)}.svg`,
      currentSvgText,
      'image/svg+xml',
    );
    setStatus('SVG exportiert.');
  });
  $('btn-export-png').addEventListener('click', async () => {
    try {
      const blob = await svgToPngBlob(currentSvgText, 2);
      downloadBlob(`${slugify(state.topo.canyon_name)}.png`, blob);
      setStatus('PNG exportiert.');
    } catch (error) {
      setStatus(`PNG-Export fehlgeschlagen: ${error.message}`);
    }
  });
  $('btn-print').addEventListener('click', () => {
    printSvg(currentSvgText, state.topo.canyon_name);
  });

  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);
  $('btn-renumber').addEventListener('click', () => {
    pushHistory();
    renumberElements(state.topo);
    render();
    setStatus('Nummern neu vergeben.');
  });

  for (const [id, key] of [
    ['select-layout', 'layout'],
    ['select-theme', 'theme'],
    ['select-paper', 'paper'],
  ]) {
    $(id).value = state.view[key];
    $(id).addEventListener('change', (event) => {
      state.view[key] = event.target.value;
      render();
    });
  }

  $('btn-zoom-in').addEventListener('click', () => {
    state.view.zoom = Math.min(4, state.view.zoom * 1.25);
    applyZoom();
  });
  $('btn-zoom-out').addEventListener('click', () => {
    state.view.zoom = Math.max(0.1, state.view.zoom / 1.25);
    applyZoom();
  });
  $('btn-zoom-fit').addEventListener('click', fitZoom);

  const segmentSelect = $('select-new-segment');
  for (const type of SEGMENT_TYPES) {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    segmentSelect.appendChild(option);
  }
  $('btn-add-segment').addEventListener('click', () => {
    addSegment(segmentSelect.value);
  });
}

function bindPhoto() {
  $('file-photo').addEventListener('change', (event) => {
    const [file] = event.target.files;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.photo.src = reader.result;
      applyPhoto();
      persist();
      setStatus('Foto als Referenzlayer geladen.');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  });
  for (const [id, key] of [
    ['photo-opacity', 'opacity'],
    ['photo-scale', 'scale'],
    ['photo-x', 'x'],
    ['photo-y', 'y'],
  ]) {
    $(id).value = state.photo[key];
    $(id).addEventListener('input', (event) => {
      state.photo[key] = Number(event.target.value);
      applyPhoto();
    });
  }
  $('btn-photo-clear').addEventListener('click', () => {
    state.photo.src = null;
    applyPhoto();
    persist();
  });

  const aiButton = $('btn-photo-ai');
  aiButton.disabled = !isTopoProviderAvailable();
  aiButton.addEventListener('click', async () => {
    try {
      setStatus('AI-Erkennung läuft…');
      const topo = await photoToTopo(state.photo.src);
      pushHistory();
      state.topo = topo;
      render();
      syncTopoFields();
      setStatus('Topo aus Foto erzeugt.');
    } catch (error) {
      setStatus(error.message);
    }
  });
}

function bindCanvas() {
  const host = $('svg-host');
  host.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  window.addEventListener('keydown', (event) => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(event.target.tagName);
    if (typing) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    if (
      (event.key === 'Backspace' || event.key === 'Delete') &&
      state.selection
    ) {
      event.preventDefault();
      if (state.selection.kind === 'element') {
        pushHistory();
        state.topo.segments[state.selection.segmentIndex].elements.splice(
          state.selection.elementIndex,
          1,
        );
        state.selection = {
          kind: 'segment',
          segmentIndex: state.selection.segmentIndex,
        };
        render();
      } else {
        deleteSegment(state.selection.segmentIndex);
      }
    }
  });
}

/* -------------------------------------------------------------------- Start */

function init() {
  const restored = restore();
  bindToolbar();
  bindTopoFields();
  bindPhoto();
  bindCanvas();
  renderPalette();
  syncTopoFields();
  render();
  fitZoom();
  setStatus(restored ? 'Letzter Stand wiederhergestellt.' : 'Bereit.');
}

init();

export { state, cloneTopo };
