/**
 * Editor-Anwendung: Zustand, UI-Bindings, Interaktion.
 */
import {
  DEAD_CAPABLE_ELEMENT_TYPES,
  SEGMENT_TYPES,
  WALK_TIME_ELEMENT_TYPES,
  WALK_TIME_SEGMENT_TYPES,
  WALL_DISTANCE_SEGMENT_TYPES,
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
import { createRandomTopo } from './random-topo.js';
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
import {
  AI_PROVIDERS,
  LOCAL_PROXY_PORT,
  PROMPT_TEMPLATES,
  buildOptimizedInstructions,
  detectLocalProxy,
  getAiSettings,
  isTopoProviderAvailable,
  listModels,
  loadAiSettings,
  photoToTopo,
  promptTemplateById,
  providerById,
  providerStatusText,
  saveAiSettings,
} from './ai.js';
import { isPdfFile, openPdf } from './pdf.js';

const STORAGE_KEY = 'canyon-topo-generator/state/v1';

const state = {
  topo: createEmptyTopo(),
  selection: null,
  view: { layout: 'serpentine', theme: 'color', paper: 'screen', zoom: 1 },
  photo: { src: null, opacity: 45, scale: 100, x: 0, y: 0, page: 1, pageCount: 0 },
};

// Das geöffnete PDF-Dokument lebt nur im Speicher: In localStorage landet
// ausschließlich die gerenderte Seite als Data-URL.
let pdfDoc = null;

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
  replaceTopo(topoFromJson(history.past.pop()));
}

function redo() {
  if (!history.future.length) return;
  history.past.push(topoToJson(state.topo, 0));
  replaceTopo(topoFromJson(history.future.pop()));
}

/**
 * Ersetzt das komplette Topo. Die Kopffelder müssen dabei mitgezogen werden,
 * sonst zeigt die Seitenleiste weiter den alten Namen und überschreibt ihn beim
 * nächsten Tippen wieder. Beim Bearbeiten einzelner Segmente wird bewusst nur
 * render() gerufen, damit ein Eingabefeld unter dem Cursor nicht neu gesetzt wird.
 */
function replaceTopo(topo) {
  state.topo = topo;
  state.selection = null;
  render();
  syncTopoFields();
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
    // Das PDF-Dokument selbst überlebt den Reload nicht, nur das gerenderte
    // Bild. Ohne Dokument gibt es nichts zu blättern.
    state.photo.pageCount = 0;
    state.photo.page = 1;
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
  // Während des Ziehens bleibt der Rahmen des vorigen Layouts stehen, sonst
  // würde das Bild dem Zeiger davonlaufen (siehe layoutTopo, Option `frame`).
  currentLayout = layoutTopo(state.topo, {
    layout: state.view.layout,
    paper: state.view.paper,
    frame: drag ? drag.frame : null,
  });
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

function numberInput(value, onChange, step = 1, options = {}) {
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step);
  if (options.id) input.id = options.id;
  if (options.min != null) input.min = String(options.min);
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

function checkboxInput(value, onChange, id) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  if (id) input.id = id;
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
          // Die Wanddistanz gibt es nur beim Abseilen – sonst bliebe ein Wert
          // hängen, den weder UI noch Datei nach dem Laden wieder kennen.
          if (!WALL_DISTANCE_SEGMENT_TYPES.has(value)) {
            segment.wall_distance_in_meters = 0;
          }
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
      ...(WALK_TIME_SEGMENT_TYPES.has(segment.type)
        ? [
            field(
              'Gehzeit (min)',
              numberInput(segment.duration_to_walk_in_min, (value) => {
                segment.duration_to_walk_in_min = value;
              }),
            ),
          ]
        : []),
      ...(WALL_DISTANCE_SEGMENT_TYPES.has(segment.type)
        ? [
            field(
              'Wanddistanz (m)',
              numberInput(
                segment.wall_distance_in_meters,
                (value) => {
                  segment.wall_distance_in_meters = Math.max(0, value ?? 0);
                },
                0.5,
                { id: 'segment-wall-distance', min: 0 },
              ),
            ),
          ]
        : []),
      field(
        'Zeilenumbruch erzwingen',
        checkboxInput(
          segment.force_cut_row_after_this_segment,
          (value) => {
            segment.force_cut_row_after_this_segment = value;
            // Beides zusammen wäre widersprüchlich. Die Layout-Engine gibt dem
            // Erzwingen den Vorrang; die UI macht das direkt sichtbar.
            if (value) segment.do_not_cut_row_after_this_segment = false;
          },
          'segment-force-cut',
        ),
      ),
      field(
        'Umbruch verhindern',
        checkboxInput(
          segment.do_not_cut_row_after_this_segment,
          (value) => {
            segment.do_not_cut_row_after_this_segment = value;
            if (value) segment.force_cut_row_after_this_segment = false;
          },
          'segment-prevent-cut',
        ),
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
        // Die Gehzeit gehört nur zum Fluchtweg – bei anderen Symbolen würde
        // sie sonst unsichtbar weiterleben und beim Speichern wieder auftauchen.
        if (!WALK_TIME_ELEMENT_TYPES.has(value)) {
          element.duration_to_walk_in_min = null;
        }
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

  if (WALK_TIME_ELEMENT_TYPES.has(element.type)) {
    grid.append(
      field(
        'Gehzeit (min)',
        numberInput(
          element.duration_to_walk_in_min,
          (value) => {
            element.duration_to_walk_in_min =
              value == null ? null : Math.max(0, value);
          },
          1,
          { id: 'element-walk-time', min: 0 },
        ),
      ),
    );
  }

  if (DEAD_CAPABLE_ELEMENT_TYPES.has(element.type)) {
    grid.append(
      field(
        'Abgestorben',
        checkboxInput(element.dead, (value) => {
          element.dead = value;
        }),
      ),
    );
  }

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
      button.addEventListener('click', () => addSymbol(symbol.type, { dead: symbol.dead }));
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

function addSymbol(type, { dead = false } = {}) {
  const index = selectedSegmentIndex();
  if (index < 0) {
    setStatus('Zuerst ein Segment anlegen.');
    return;
  }
  const segment = state.topo.segments[index];

  // Ist ein Symbol ausgewählt, entsteht das neue an derselben Stelle und direkt
  // dahinter in der Reihenfolge – sonst hinten und in der Segmentmitte.
  const anchorIndex =
    state.selection?.kind === 'element' && state.selection.segmentIndex === index
      ? state.selection.elementIndex
      : -1;
  const anchor = anchorIndex >= 0 ? segment.elements[anchorIndex] : null;
  const insertAt = anchor ? anchorIndex + 1 : segment.elements.length;

  pushHistory();
  const element = createElement(type, {
    horizontal_start_rel_to_segment_start: anchor
      ? anchor.horizontal_start_rel_to_segment_start
      : segment.length_in_meters / 2,
    vertical_start_rel_to_segment_start: anchor
      ? anchor.vertical_start_rel_to_segment_start
      : 0,
    dead,
  });
  if (SYMBOLS[type]?.range) {
    element.horizontal_end_rel_to_segment_start =
      element.horizontal_start_rel_to_segment_start + 5;
    element.vertical_end_rel_to_segment_start =
      element.vertical_start_rel_to_segment_start;
  }
  segment.elements.splice(insertAt, 0, element);
  state.selection = {
    kind: 'element',
    segmentIndex: index,
    elementIndex: insertAt,
  };
  render();
  setStatus(
    `${SYMBOLS[type]?.label || type}${dead ? ' (abgestorben)' : ''} hinzugefügt.`,
  );
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
        // Eingefrorenes Layout: hält Zeilenversatz und Bildmasse still, solange
        // gezogen wird. Ohne das verschiebt jede Mausbewegung das ganze Topo.
        frame: currentLayout,
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
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  // Erst jetzt darf sich das Layout wieder an den neuen Stand anpassen.
  if (moved) render();
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
  syncPhotoPageControls();
  if (!state.photo.src) {
    photo.hidden = true;
    return;
  }
  photo.hidden = false;
  photo.src = state.photo.src;
  photo.style.opacity = String(state.photo.opacity / 100);
  photo.style.transform = `translate(${state.photo.x * 4}px, ${state.photo.y * 4}px) scale(${state.photo.scale / 100})`;
}

function syncPhotoPageControls() {
  const row = $('photo-page-row');
  const multiPage = state.photo.pageCount > 1;
  row.hidden = !multiPage;
  if (!multiPage) return;
  const input = $('photo-page');
  input.max = String(state.photo.pageCount);
  input.value = String(state.photo.page);
  $('photo-page-info').textContent = `von ${state.photo.pageCount}`;
  $('btn-photo-page-prev').disabled = state.photo.page <= 1;
  $('btn-photo-page-next').disabled = state.photo.page >= state.photo.pageCount;
}

async function showPdfPage(pageNumber) {
  if (!pdfDoc) return;
  const target = Math.min(Math.max(1, pageNumber), pdfDoc.pageCount);
  setStatus(`Rendere PDF-Seite ${target}…`);
  try {
    state.photo.src = await pdfDoc.renderPage(target);
    state.photo.page = target;
    applyPhoto();
    persist();
    setStatus(`PDF-Seite ${target} von ${pdfDoc.pageCount} als Referenzlayer geladen.`);
  } catch (error) {
    setStatus(`PDF-Seite konnte nicht gerendert werden: ${error.message}`);
  }
}

function clearPhoto() {
  if (pdfDoc) {
    pdfDoc.destroy();
    pdfDoc = null;
  }
  state.photo.src = null;
  state.photo.page = 1;
  state.photo.pageCount = 0;
  applyPhoto();
  persist();
}

async function loadReferenceFile(file) {
  if (isPdfFile(file)) {
    setStatus('PDF wird geöffnet…');
    try {
      if (pdfDoc) pdfDoc.destroy();
      pdfDoc = await openPdf(file);
      state.photo.pageCount = pdfDoc.pageCount;
      await showPdfPage(1);
    } catch (error) {
      pdfDoc = null;
      state.photo.pageCount = 0;
      syncPhotoPageControls();
      setStatus(`PDF konnte nicht gelesen werden: ${error.message}`);
    }
    return;
  }

  if (pdfDoc) {
    pdfDoc.destroy();
    pdfDoc = null;
  }
  state.photo.pageCount = 0;
  state.photo.page = 1;
  const reader = new FileReader();
  reader.onload = () => {
    state.photo.src = reader.result;
    applyPhoto();
    persist();
    setStatus('Foto als Referenzlayer geladen.');
  };
  reader.onerror = () => setStatus('Foto konnte nicht gelesen werden.');
  reader.readAsDataURL(file);
}

/* --------------------------------------------------------------- Dateien */

async function openFile(file) {
  const text = await file.text();
  try {
    pushHistory();
    replaceTopo(/^\s*</.test(text) ? topoFromXml(text) : topoFromJson(text));
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
    replaceTopo(topoFromJson(await response.text()));
    fitZoom();
    setStatus('Beispiel-Topo geladen.');
  } catch (error) {
    setStatus(`Beispiel nicht ladbar: ${error.message}`);
  }
}

/* ---------------------------------------------------------------- Bindings */

/**
 * Kopffelder binden. `input` statt `change`: Name, Author und Dauer stehen in
 * der Legende und sollen beim Tippen sofort im Topo erscheinen, ohne dass das
 * Feld erst verlassen werden muss. Für die Undo-Historie zählt trotzdem die
 * ganze Eingabe als ein Schritt – sonst läge nach dem Tippen für jeden
 * Buchstaben ein Eintrag im Stapel.
 */
function bindTopoFields() {
  const bindings = [
    ['topo-name', 'canyon_name', (value) => value],
    ['topo-author', 'author', (value) => value],
    ['topo-duration', 'duration', (value) => value],
    ['topo-date', 'date', (value) => value],
    ['topo-max-walk', 'maximum_walk_length', Number],
    ['topo-line-distance', 'distance_of_single_line', Number],
    ['topo-legend-offset', 'legend_offset_top', Number],
  ];
  for (const [id, key, transform] of bindings) {
    const input = $(id);
    let valueBeforeEdit;

    input.addEventListener('input', (event) => {
      if (valueBeforeEdit === undefined) valueBeforeEdit = state.topo[key];
      state.topo[key] = transform(event.target.value);
      render();
    });

    input.addEventListener('change', (event) => {
      const next = transform(event.target.value);
      if (valueBeforeEdit !== undefined && valueBeforeEdit !== next) {
        const edited = state.topo[key];
        state.topo[key] = valueBeforeEdit;
        pushHistory();
        state.topo[key] = edited;
      } else if (valueBeforeEdit === undefined && state.topo[key] !== next) {
        pushHistory();
      }
      valueBeforeEdit = undefined;
      state.topo[key] = next;
      render();
    });
  }
}

function syncTopoFields() {
  $('topo-name').value = state.topo.canyon_name;
  $('topo-author').value = state.topo.author;
  $('topo-duration').value = state.topo.duration;
  $('topo-date').value = state.topo.date;
  $('topo-max-walk').value = state.topo.maximum_walk_length;
  $('topo-line-distance').value = state.topo.distance_of_single_line;
  $('topo-legend-offset').value = state.topo.legend_offset_top;
}

function bindToolbar() {
  $('btn-new').addEventListener('click', () => {
    pushHistory();
    replaceTopo(createEmptyTopo());
    setStatus('Neues Topo.');
  });
  $('btn-example').addEventListener('click', loadExample);
  $('btn-random').addEventListener('click', () => {
    pushHistory();
    replaceTopo(createRandomTopo());
    fitZoom();
    setStatus(`Zufalls-Topo „${state.topo.canyon_name}“ erzeugt.`);
  });
  $('file-open').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    if (file) await openFile(file);
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
    event.target.value = '';
    if (file) loadReferenceFile(file);
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
  $('photo-page').addEventListener('change', (event) => {
    showPdfPage(Number(event.target.value) || 1);
  });
  $('btn-photo-page-prev').addEventListener('click', () => showPdfPage(state.photo.page - 1));
  $('btn-photo-page-next').addEventListener('click', () => showPdfPage(state.photo.page + 1));
  $('btn-photo-clear').addEventListener('click', clearPhoto);
}

/* -------------------------------------------------------------------- AI */

let aiAbort = null;

function setAiStatus(message, isError = false) {
  const node = $('ai-status');
  node.textContent = message || '';
  node.classList.toggle('is-error', Boolean(isError));
}

function syncAiControls() {
  const spec = providerById(getAiSettings().providerId);
  const ready = isTopoProviderAvailable();
  const button = $('btn-photo-ai');
  button.disabled = !ready || aiAbort !== null;
  button.title = providerStatusText();
  $('ai-provider-hint').textContent = spec.hint;
  $('ai-key-row').hidden = !spec.needsKey;
  $('ai-model-row').hidden = spec.id === 'proxy';
  const template = promptTemplateById(getAiSettings().promptTemplate);
  $('ai-prompt-hint').textContent = template.hint;
  $('ai-prompt-custom-row').hidden = template.id !== 'custom';
  $('btn-ai-models').disabled = modelsState.busy || spec.id === 'proxy';
  // Die Einstellungen von Anfang an aufklappen, solange noch etwas fehlt.
  if (!ready) $('ai-settings').open = true;
  refreshProxyState();
  scheduleModelLoad();
}

/**
 * Modell-Liste: identisch konfigurierte Aufrufe sollen sich nicht wiederholen,
 * deshalb merken wir uns, wofür zuletzt geladen wurde. Endpoint und Key werden
 * getippt – ohne Verzögerung entstünde pro Tastenanschlag ein API-Aufruf.
 */
let modelsState = { identity: '', busy: false };
let modelsTimer = null;

function modelsIdentity() {
  const s = getAiSettings();
  return `${s.providerId}|${s.endpoint}|${s.apiKey}`;
}

function scheduleModelLoad() {
  const s = getAiSettings();
  // Bewusst NICHT isTopoProviderAvailable(): das verlangt ein eingetragenes
  // Modell – genau das, was hier erst gefunden werden soll. Endpoint und Key
  // reichen.
  if (s.providerId === 'proxy' || !s.endpoint || !s.apiKey) return;
  if (modelsState.busy || modelsIdentity() === modelsState.identity) return;
  clearTimeout(modelsTimer);
  modelsTimer = setTimeout(() => loadModelOptions(), 900);
}

/**
 * Füllt die Vorschlagsliste. Bewusst ein datalist und kein select: Neue Modelle
 * erscheinen oft, bevor eine Liste sie kennt – ein freier Name muss möglich
 * bleiben. Fehlschläge sind folgenlos, sie stehen nur als Hinweis darunter.
 */
async function loadModelOptions({ manual = false } = {}) {
  const spec = providerById(getAiSettings().providerId);
  if (spec.id === 'proxy') return;
  const identity = modelsIdentity();
  if (!manual && identity === modelsState.identity) return;

  modelsState = { identity, busy: true };
  syncAiControls();
  setModelHint('Modelle werden geladen …');

  let result;
  try {
    result = await listModels();
  } catch (error) {
    result = { ok: false, reason: error.message };
  }

  modelsState = { identity, busy: false };
  const list = $('ai-model-options');
  list.replaceChildren();

  if (!result.ok) {
    // identity bewusst gesetzt lassen: eine kaputte Konfiguration soll nicht
    // im Sekundentakt erneut versucht werden. Ändert der Nutzer etwas, ändert
    // sich die identity von selbst; "Modelle laden" erzwingt es jederzeit.
    setModelHint(result.reason, manual);
    syncAiControls();
    return;
  }

  for (const id of result.models) {
    const option = document.createElement('option');
    option.value = id;
    list.appendChild(option);
  }

  const current = getAiSettings().model;
  const known = result.models.includes(current);
  setModelHint(
    `${result.models.length} Modell(e) gefunden${result.viaProxy ? ' (über den lokalen Proxy)' : ''}.` +
      (current && !known ? ` "${current}" ist nicht darunter – trotzdem nutzbar.` : ''),
  );
  syncAiControls();
}

function setModelHint(text, isError = false) {
  const el = $('ai-model-hint');
  el.textContent = text;
  el.style.color = isError ? 'var(--danger, #e2554c)' : '';
}

/**
 * Zeigt an, ob der lokale Proxy läuft. Er wird erst gebraucht, wenn ein Gateway
 * den Direktaufruf blockiert – aber es hilft, das vorher zu wissen statt erst im
 * Fehlerfall.
 */
async function refreshProxyState() {
  const target = $('ai-proxy-state');
  if (!target) return;

  const settings = getAiSettings();
  if (settings.providerId === 'proxy') {
    target.textContent = '';
    return;
  }

  const proxy = await detectLocalProxy();
  if (proxy) {
    target.textContent =
      `Lokaler Proxy auf Port ${LOCAL_PROXY_PORT} erreichbar – ` +
      'er springt automatisch ein, falls das Gateway den Direktaufruf blockiert.';
    target.classList.remove('is-error');
  } else {
    target.textContent =
      `Kein lokaler Proxy auf Port ${LOCAL_PROXY_PORT}. Wird nur gebraucht, wenn der ` +
      'Direktaufruf an CORS scheitert – dann im Projektordner "npm start" ausführen.';
    target.classList.remove('is-error');
  }
}

function bindAi() {
  const saved = loadAiSettings();

  const providerSelect = $('ai-provider');
  for (const spec of AI_PROVIDERS) {
    const option = document.createElement('option');
    option.value = spec.id;
    option.textContent = spec.label;
    providerSelect.appendChild(option);
  }
  providerSelect.value = saved.providerId;

  const promptSelect = $('ai-prompt-template');
  for (const entry of PROMPT_TEMPLATES) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.label;
    promptSelect.appendChild(option);
  }
  promptSelect.value = promptTemplateById(saved.promptTemplate).id;
  // Ein leeres Feld wäre eine Sackgasse – die optimierte Vorlage ist der Startpunkt.
  $('ai-prompt-custom').value = saved.customPrompt || buildOptimizedInstructions();

  promptSelect.addEventListener('change', () => {
    const patch = { promptTemplate: promptTemplateById(promptSelect.value).id };
    // Das Textfeld zeigt die Vorlage – dann muss sie auch gespeichert sein,
    // sonst liefe "Eigener Prompt" trotz sichtbarem Text ins Leere.
    if (!getAiSettings().customPrompt) {
      patch.customPrompt = buildOptimizedInstructions();
      $('ai-prompt-custom').value = patch.customPrompt;
    }
    saveAiSettings(patch);
    syncAiControls();
  });

  $('ai-prompt-custom').addEventListener('input', (event) => {
    saveAiSettings({ customPrompt: event.target.value });
    syncAiControls();
  });

  $('ai-endpoint').value = saved.endpoint;
  $('ai-model').value = saved.model;
  $('ai-key').value = saved.apiKey;
  $('ai-notes').value = saved.notes || '';

  providerSelect.addEventListener('change', () => {
    const spec = providerById(providerSelect.value);
    // Endpoint und Modell auf die Vorgaben des neuen Anbieters setzen, sonst
    // zeigt der OpenAI-Endpoint plötzlich auf Anthropic.
    const patch = {
      providerId: spec.id,
      endpoint: spec.defaultEndpoint,
      model: spec.defaultModel,
    };
    $('ai-endpoint').value = patch.endpoint;
    $('ai-model').value = patch.model;
    // Die alte Liste gehört zum alten Anbieter – sie hier stehen zu lassen wäre irreführend.
    $('ai-model-options').replaceChildren();
    setModelHint('');
    saveAiSettings(patch);
    syncAiControls();
  });

  for (const [id, key] of [
    ['ai-endpoint', 'endpoint'],
    ['ai-model', 'model'],
    ['ai-key', 'apiKey'],
    ['ai-notes', 'notes'],
  ]) {
    $(id).addEventListener('input', (event) => {
      saveAiSettings({ [key]: event.target.value.trim() });
      syncAiControls();
    });
  }

  $('btn-ai-models').addEventListener('click', () => loadModelOptions({ manual: true }));

  $('btn-ai-forget').addEventListener('click', () => {    saveAiSettings({ apiKey: '' });
    $('ai-key').value = '';
    syncAiControls();
    setAiStatus('API-Key gelöscht.');
  });

  $('btn-ai-cancel').addEventListener('click', () => {
    if (aiAbort) aiAbort.abort();
  });

  $('btn-photo-ai').addEventListener('click', runAi);
  syncAiControls();
}

async function runAi() {
  if (!state.photo.src) {
    setAiStatus('Zuerst ein Foto oder eine PDF-Seite laden.', true);
    return;
  }

  aiAbort = new AbortController();
  const report = [];
  let usedProxy = false;
  syncAiControls();
  $('btn-ai-cancel').hidden = false;
  $('btn-photo-ai').classList.add('is-busy');
  setAiStatus('Modell analysiert das Bild…');
  setStatus('AI-Erkennung läuft…');

  try {
    const topo = await photoToTopo(state.photo.src, {
      signal: aiAbort.signal,
      report,
      onNotice: (message) => {
        usedProxy = true;
        setAiStatus(message);
      },
      hints: {
        canyonName: state.topo.canyon_name,
        notes: getAiSettings().notes || '',
      },
    });
    pushHistory();
    replaceTopo(topo);
    fitZoom();
    persist();

    const count = topo.segments.length;
    const skipped = report.length ? ` ${report.length} Angabe(n) verworfen.` : '';
    const via = usedProxy ? ' (über den lokalen Proxy)' : '';
    setAiStatus(`${count} Segment(e) erkannt${via}.${skipped} Bitte gegenprüfen.`);
    setStatus(`Topo aus Foto erzeugt: ${count} Segmente.`);
    if (report.length) console.warn('AI-Erkennung, verworfen:', report);
  } catch (error) {
    if (error?.name === 'AbortError') {
      setAiStatus('Abgebrochen.');
      setStatus('AI-Erkennung abgebrochen.');
    } else {
      setAiStatus(error.message, true);
      setStatus('AI-Erkennung fehlgeschlagen.');
    }
  } finally {
    aiAbort = null;
    $('btn-ai-cancel').hidden = true;
    $('btn-photo-ai').classList.remove('is-busy');
    syncAiControls();
  }
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
  bindAi();
  bindCanvas();
  renderPalette();
  syncTopoFields();
  render();
  fitZoom();
  setStatus(restored ? 'Letzter Stand wiederhergestellt.' : 'Bereit.');
}

init();

export { state, cloneTopo };
