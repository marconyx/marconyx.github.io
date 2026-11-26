/**
 * Editor-Anwendung: Zustand, UI-Bindings, Interaktion und Browser-Persistenz.
 *
 * Dieses Modul ist der Zusammenschluss der reinen Fachmodule: Ereignisse
 * ändern das Topo-Modell, `render()` leitet daraus Liste, Prüfergebnis, Layout
 * und SVG ab, und erfolgreiche Bearbeitungsschritte werden gespeichert.
 * Datei-Importer normalisieren vor dem Austausch des aktuellen Topos; dadurch
 * schlägt ein fehlerhafter Import nicht teilweise auf den sichtbaren Zustand
 * oder den Undo-Verlauf durch.
 *
 * Modell, Auswahl und Ansicht haben getrennte Lebenszyklen: Undo/Redo enthält
 * JSON-Snapshots des Topos, nicht Foto oder Ansicht. Der Autosave umfasst
 * zusätzlich `view` und `photo`; ein PDF-Dokument selbst bleibt nur im Speicher.
 * Die SVG-Exportzeichenkette ist separat vom interaktiven DOM und enthält keine
 * Auswahl-Hitflächen. Abschnittszustand und AI-Einstellungen verwenden eigene
 * Speicherschlüssel in ihren Modulen.
 */
import {
  DEAD_CAPABLE_ELEMENT_TYPES,
  DEPTH_SEGMENT_TYPES,
  RemovedSegmentError,
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
  parseSegmentShortcutList,
  validateTopo,
} from './model.js?v=0.14';
import { topoFromJson, topoToJson } from './io-json.js?v=0.14';
import { createRandomTopo } from './random-topo.js?v=0.14';
import { topoFromXml, topoToXml } from './io-xml.js?v=0.14';
import { ShortListError, topoFromShortList, topoToShortList } from './io-shortlist.js?v=0.14';
import { layoutTopo, worldToLocal } from './layout.js?v=0.14';
import { legendRectFor, renderTopoSvg } from './renderer.js?v=0.14';
import { SYMBOLS, symbolOptions } from './symbols.js?v=0.14';
import {
  downloadBlob,
  downloadText,
  printSvg,
  slugify,
  svgToPngBlob,
} from './exporters.js?v=0.14';
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
} from './ai.js?v=0.14';
import { isPdfFile, openPdf } from './pdf.js?v=0.14';
import { initPanelSections } from './panel-sections.js?v=0.14';
import { initAiLock } from './ai-lock.js?v=0.14';
import { initResponsive } from './responsive.js?v=0.14';
import { contentBoundsFor, fitBoundsToPaper } from './sheet.js?v=0.14';
import {
  DEFAULT_LANGUAGE,
  applyStaticTranslations,
  t,
  translateCategoryLabel,
  translateProviderHint,
  translateProviderLabel,
  translatePromptHint,
  translatePromptLabel,
  translateSymbolLabel,
} from './i18n.js?v=0.14';

const STORAGE_KEY = 'canyon-topo-generator/state/v1';

/**
 * Laufender Editorzustand. `topo` ist stets normalisiert; `selection` referenziert
 * Segment-/Elementindizes statt DOM-Knoten. `view` und `photo` sind UI-Zustand
 * und werden getrennt von Topo-Daten behandelt, wenn gespeichert oder exportiert
 * wird.
 */
const state = {
  topo: createEmptyTopo(),
  selection: null,
  view: { layout: 'serpentine', theme: 'color', paper: 'screen', zoom: 1, language: DEFAULT_LANGUAGE },
  photo: { src: null, opacity: 45, scale: 100, x: 0, y: 0, page: 1, pageCount: 0 },
};

// Das geöffnete PDF-Dokument lebt nur im Speicher: In localStorage landet
// ausschließlich die gerenderte Seite als Data-URL.
let pdfDoc = null;

// Historie enthält serialisierte Topos: spätere Änderungen können ältere
// Einträge dadurch nicht über gemeinsam referenzierte Objekte verändern.
let history = { past: [], future: [] };
let storageProtected = false;
let currentLayout = null;
let currentSvgText = '';
const cameraOffset = { x: 0, y: 0 };

const $ = (id) => document.getElementById(id);
const lang = () => state.view.language || DEFAULT_LANGUAGE;
function applyTranslations() {
  applyStaticTranslations($, lang());
  renderPalette();
  refreshStatusTranslation();
  refreshAiTranslations();
  refreshShortcutError();
}

let shortcutError = null;

function refreshShortcutError() {
  $('segment-shortcut-error').textContent = shortcutError
    ? `${shortcutError.entry ? `${shortcutError.entry}: ` : ''}${t(lang(), shortcutError.error)}`
    : '';
  $('segment-shortcut').setAttribute('aria-invalid', String(!!shortcutError));
}

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
  if (drag || legendDrag) onPointerUp();
  state.topo = topo;
  state.selection = null;
  render();
  syncTopoFields();
}

/**
 * Schreibt das externe JSON-Topo und die Editoransicht als einen Autosave.
 * Bei `storageProtected` bleibt ein nicht unterstützter alter Speicherstand
 * unangetastet; quota-/speicherbedingte Fehler sind hier bewusst optional.
 */
function persist() {
  if (storageProtected) return;
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

/**
 * Stellt Autosave wieder her und migriert die entfernte Stilwahl `bw` zu Farbe.
 * @returns {true|false|string} Erfolg, kein lesbarer Stand oder `removed_weir`;
 *   letzteres schützt den vorhandenen Speicher vor Überschreiben.
 */
function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    state.topo = normalizeTopo(saved.topo);
    Object.assign(state.view, saved.view || {});
    if (state.view.theme === 'bw') state.view.theme = 'color';
    Object.assign(state.photo, saved.photo || {});
    // Das PDF-Dokument selbst überlebt den Reload nicht, nur das gerenderte
    // Bild. Ohne Dokument gibt es nichts zu blättern.
    state.photo.pageCount = 0;
    state.photo.page = 1;
    return true;
  } catch (error) {
    if (error instanceof RemovedSegmentError) {
      storageProtected = true;
      return 'removed_weir';
    }
    return false;
  }
}

function setStatus(message) {
  const warning = storageProtected ? t(lang(), 'status.removed_weir_storage') : '';
  const status = $('status');
  status.textContent = warning && message !== warning ? `${warning} ${message}` : message;
  status.title = status.textContent;
}

// Merkt sich den zuletzt gesetzten Statustext als Übersetzungs-Key, damit ein
// Sprachwechsel auch die aktuell sichtbare Statuszeile sofort nachzieht statt
// bis zur nächsten Aktion in der alten Sprache stehen zu bleiben.
let lastStatusKey = null;
let lastStatusParams = undefined;

function setStatusKey(key, params) {
  lastStatusKey = key;
  lastStatusParams = params;
  setStatus(t(lang(), key, typeof params === 'function' ? params() : params));
}

function refreshStatusTranslation() {
  if (lastStatusKey) {
    const params = typeof lastStatusParams === 'function' ? lastStatusParams() : lastStatusParams;
    setStatus(t(lang(), lastStatusKey, params));
  }
}

/* ------------------------------------------------------------------ Render */

/**
 * Berechnet Layout und exportierbares SVG aus dem aktuellen Modell, aktualisiert
 * interaktive Ansicht, Inspector und Validierung und persistiert den Zustand.
 * Während eines Element-Drags bleibt der erfasste SVG-Knoten verbunden; nur
 * sein Transform wird aktualisiert, damit Pointer-Capture nicht verloren geht.
 */
function render() {
  // Während des Ziehens bleibt der Rahmen des vorigen Layouts stehen, sonst
  // würde das Bild dem Zeiger davonlaufen (siehe layoutTopo, Option `frame`).
  currentLayout = layoutTopo(state.topo, {
    layout: state.view.layout,
    paper: state.view.paper,
    frame: drag ? drag.frame : legendDrag ? legendDrag.frame : null,
  });
  currentSvgText = renderTopoSvg(state.topo, currentLayout, {
    theme: state.view.theme,
    paper: state.view.paper,
    bounds: drag?.bounds,
    language: lang(),
  });

  if (drag) {
    const point = currentLayout.placements[drag.segmentIndex].elements[drag.elementIndex].point;
    drag.node.setAttribute('transform',
      `translate(${point.x - drag.initialPoint.x},${point.y - drag.initialPoint.y}) ${drag.initialTransform}`);
    renderInspector();
    renderIssues();
    persist();
    return;
  }

  $('svg-host').innerHTML = renderTopoSvg(state.topo, currentLayout, {
    theme: state.view.theme,
    paper: state.view.paper,
    // Beim Ziehen der Legende bleibt das Blatt stehen, sonst liefe es dem Zeiger davon.
    bounds: legendDrag?.bounds,
    interactive: true,
    selection: state.selection,
    language: lang(),
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
  if (segment.elements.length) {
    parts.push(t(lang(), 'segment.symbol_count_suffix', { count: segment.elements.length }));
  }
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

    for (const [text, titleKey, action] of [
      ['↑', 'segment.action_up', () => moveSegment(index, -1)],
      ['↓', 'segment.action_down', () => moveSegment(index, 1)],
      ['⧉', 'segment.action_duplicate', () => duplicateSegment(index)],
      ['✕', 'segment.action_delete', () => deleteSegment(index)],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.title = t(lang(), titleKey);
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

function selectInput(options, value, onChange, labelFor) {
  const select = document.createElement('select');
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option;
    node.textContent = labelFor ? labelFor(option) : option;
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
    host.innerHTML = `<p class="hint">${t(lang(), 'inspector.pick_hint')}</p>`;
    return;
  }
  const segment = state.topo.segments[selection.segmentIndex];
  if (!segment) {
    state.selection = null;
    host.innerHTML = `<p class="hint">${t(lang(), 'inspector.selection_gone')}</p>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'inspector-grid';

  if (selection.kind === 'segment') {
    grid.append(
      field(
        t(lang(), 'inspector.type'),
        selectInput(SEGMENT_TYPES, segment.type, (value) => {
          segment.type = value;
          // Die Wanddistanz gibt es nur beim Abseilen – sonst bliebe ein Wert
          // hängen, den weder UI noch Datei nach dem Laden wieder kennen.
          if (!WALL_DISTANCE_SEGMENT_TYPES.has(value)) {
            segment.wall_distance_in_meters = 0;
          }
          if (!DEPTH_SEGMENT_TYPES.has(value)) {
            segment.depth_in_meters = null;
          }
        }),
        true,
      ),
      field(
        t(lang(), 'inspector.length_m'),
        numberInput(segment.length_in_meters, (value) => {
          segment.length_in_meters = value ?? 1;
        }),
      ),
      field(
        t(lang(), 'inspector.angle_deg'),
        numberInput(segment.angle_in_degrees, (value) => {
          segment.angle_in_degrees = value ?? 0;
        }),
      ),
      ...(WALK_TIME_SEGMENT_TYPES.has(segment.type)
        ? [
            field(
              t(lang(), 'inspector.walk_time_min'),
              numberInput(segment.duration_to_walk_in_min, (value) => {
                segment.duration_to_walk_in_min = value;
              }),
            ),
          ]
        : []),
      ...(WALL_DISTANCE_SEGMENT_TYPES.has(segment.type)
        ? [
            field(
              t(lang(), 'inspector.wall_distance_m'),
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
      ...(DEPTH_SEGMENT_TYPES.has(segment.type)
        ? [
            field(
              t(lang(), 'inspector.depth_m'),
              numberInput(
                segment.depth_in_meters,
                (value) => {
                  segment.depth_in_meters =
                    !Number.isFinite(value) || value < 0 ? null : value;
                },
                0.5,
                { id: 'segment-depth', min: 0 },
              ),
            ),
          ]
        : []),
      field(
        t(lang(), 'inspector.force_cut_row'),
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
        t(lang(), 'inspector.prevent_cut_row'),
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
      t(lang(), 'inspector.type'),
      selectInput(
        Object.keys(SYMBOLS),
        element.type,
        (value) => {
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
        },
        (type) => translateSymbolLabel(type, lang()),
      ),
      true,
    ),
    field(
      t(lang(), 'inspector.position_along_m'),
      numberInput(
        element.horizontal_start_rel_to_segment_start,
        (value) => {
          element.horizontal_start_rel_to_segment_start = value ?? 0;
        },
        0.5,
      ),
    ),
    field(
      t(lang(), 'inspector.position_across_m'),
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
        t(lang(), 'inspector.end_along_m'),
        numberInput(
          element.horizontal_end_rel_to_segment_start,
          (value) => {
            element.horizontal_end_rel_to_segment_start = value;
          },
          0.5,
        ),
      ),
      field(
        t(lang(), 'inspector.end_across_m'),
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
      t(lang(), 'inspector.size'),
      numberInput(
        element.size,
        (value) => {
          element.size = value ?? 1;
        },
        0.1,
      ),
    ),
    field(
      t(lang(), 'inspector.text'),
      textInput(element.text, (value) => {
        element.text = value;
      }),
      true,
    ),
  );

  if (WALK_TIME_ELEMENT_TYPES.has(element.type)) {
    grid.append(
      field(
        t(lang(), 'inspector.walk_time_min'),
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
        t(lang(), 'inspector.dead'),
        checkboxInput(element.dead, (value) => {
          element.dead = value;
        }),
      ),
    );
  }

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = t(lang(), 'inspector.delete_symbol');
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
    item.textContent = t(lang(), 'issues.none');
    list.appendChild(item);
    return;
  }
  for (const issue of issues) {
    const item = document.createElement('li');
    item.className = issue.level;
    item.textContent = issue.key ? t(lang(), issue.key, issue.params) : issue.message;
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
    title.textContent = translateCategoryLabel(group.id, lang());
    const items = document.createElement('div');
    items.className = 'symbol-group__items';
    for (const symbol of group.symbols) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = translateSymbolLabel(symbol.type, lang(), { dead: symbol.dead });
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
    setStatusKey('status.need_segment_first');
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
    t(lang(), 'status.symbol_added', { label: translateSymbolLabel(type, lang(), { dead }) }),
  );
}

function addSegment(type, { length = defaultLengthFor(type), append = false } = {}) {
  pushHistory();
  const segment = createSegment(type, {
    length_in_meters: length,
    angle_in_degrees: defaultAngleFor(type),
  });
  const index = selectedSegmentIndex();
  const insertAt = append || index < 0 ? state.topo.segments.length : index + 1;
  state.topo.segments.splice(insertAt, 0, segment);
  if (!append) state.selection = { kind: 'segment', segmentIndex: insertAt };
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
  if (drag) onPointerUp();
  pushHistory();
  state.topo.segments.splice(index, 1);
  state.selection = null;
  render();
}

/* ------------------------------------------------------------- Interaktion */

/**
 * Transformiert Browser-Pixel über die inverse SVG-Screen-Matrix in Meter.
 * Ohne SVG oder gültige Matrix kann die Interaktion nicht berechnet werden.
 * @param {PointerEvent} event Zeigerposition in Client-Pixeln
 * @returns {DOMPoint|null} Punkt in SVG-Koordinaten oder null
 */
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
let legendDrag = null;

function currentSheetBounds() {
  return fitBoundsToPaper(contentBoundsFor(state.topo, currentLayout, lang()), state.view.paper);
}

/** Legendenkasten unter dem Zeiger, oder `null`. */
function legendRectAt(point, bounds = currentSheetBounds()) {
  if (!point || !currentLayout) return null;
  const rect = legendRectFor(state.topo, currentLayout, bounds, state.view.theme, lang());
  const inside = point.x >= rect.left && point.x <= rect.right &&
    point.y >= rect.top && point.y <= rect.top + rect.height;
  return inside ? rect : null;
}

function startLegendDrag(event) {
  const point = svgPoint(event);
  const bounds = currentSheetBounds();
  const rect = legendRectAt(point, bounds);
  if (!rect) return false;
  legendDrag = {
    startPoint: { x: point.x, y: point.y },
    startLeft: rect.left - currentLayout.minX,
    startTop: state.topo.legend_offset_top || 0,
    frame: currentLayout,
    bounds,
    moved: false,
    pointerId: event.pointerId,
  };
  $('svg-host').setPointerCapture?.(event.pointerId);
  $('svg-host').classList.add('is-dragging', 'is-dragging-legend');
  event.preventDefault();
  return true;
}

function moveLegend(event) {
  const point = svgPoint(event);
  if (!point) return;
  const left = round(legendDrag.startLeft + point.x - legendDrag.startPoint.x);
  const top = round(legendDrag.startTop + point.y - legendDrag.startPoint.y);
  if (left === state.topo.legend_offset_left && top === state.topo.legend_offset_top) return;
  if (!legendDrag.moved) {
    pushHistory();
    legendDrag.moved = true;
  }
  state.topo.legend_offset_left = left;
  state.topo.legend_offset_top = top;
  render();
}

function finishLegendDrag() {
  const finished = legendDrag;
  const host = $('svg-host');
  const svg = host.querySelector('svg');
  const matrix = svg?.getScreenCTM();
  const legendCorner = () => {
    const rect = legendRectFor(state.topo, currentLayout, currentSheetBounds(), state.view.theme, lang());
    return { x: rect.left, y: rect.top };
  };
  const corner = matrix ? legendCorner() : null;
  const anchor = corner ? new DOMPoint(corner.x, corner.y).matrixTransform(matrix) : null;
  legendDrag = null;
  host.classList.remove('is-dragging', 'is-dragging-legend');
  if (host.hasPointerCapture?.(finished.pointerId)) host.releasePointerCapture(finished.pointerId);
  render();
  if (!finished.moved) return;
  // Das Blatt passt sich jetzt der neuen Legendenlage an. Die Kamera hält die
  // Legende dort, wo sie losgelassen wurde.
  const nextSvg = host.querySelector('svg');
  const nextMatrix = nextSvg?.getScreenCTM();
  if (!anchor || !nextMatrix) return;
  state.view.zoom *= Math.hypot(matrix.a, matrix.b) / Math.hypot(nextMatrix.a, nextMatrix.b);
  applyZoom();
  const nextCorner = legendCorner();
  const nextAnchor = new DOMPoint(nextCorner.x, nextCorner.y).matrixTransform(nextSvg.getScreenCTM());
  const canvas = $('canvas');
  canvas.scrollLeft += nextAnchor.x - anchor.x;
  canvas.scrollTop += nextAnchor.y - anchor.y;
  const settled = new DOMPoint(nextCorner.x, nextCorner.y).matrixTransform(nextSvg.getScreenCTM());
  cameraOffset.x += anchor.x - settled.x;
  cameraOffset.y += anchor.y - settled.y;
  applyZoom();
  persist();
}

/**
 * Erfasst Auswahl und Startzustand eines Drags. Ein Element hat Vorrang vor
 * Legende und Segment; nicht-primäre Pointer starten keine zweite Interaktion.
 * Bei Streckensymbolen bleibt der lokale Abstand zum Endpunkt als `span`
 * erhalten. Undo wird erst beim ersten tatsächlichen Verschieben angelegt.
 */
function onPointerDown(event) {
  // Zweiter Finger (Pinch) startet keine neue Auswahl und keinen Drag.
  if (event.isPrimary === false) return;
  if (event.button != null && event.button !== 0) return;
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
        initialPoint: { ...placement.elements[elementIndex].point },
        initialTransform: elementNode.getAttribute('transform') || '',
        segmentIndex,
        elementIndex,
        element,
        placement,
        // Eingefrorenes Layout: hält Zeilenversatz und Bildmasse still, solange
        // gezogen wird. Ohne das verschiebt jede Mausbewegung das ganze Topo.
        frame: currentLayout,
        bounds: fitBoundsToPaper(contentBoundsFor(state.topo, currentLayout, lang()), state.view.paper),
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
        pointerId: event.pointerId,
      };
      // Das Element bleibt während des Drags verbunden und behält touch-action.
      elementNode.setPointerCapture?.(event.pointerId);
      $('svg-host').classList.add('is-dragging');
      event.preventDefault();
    }
    render();
    return;
  }

  // Die Legende liegt über der Zeichnung und lässt sich frei verschieben.
  if (startLegendDrag(event)) return;

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

/**
 * Rechnet den Zeiger in lokale Segmentkoordinaten zurück und rastet auf 0,25 m.
 * Ein Streckenelement wird als Ganzes verschoben; der gespeicherte `span`
 * verhindert eine unbeabsichtigte Änderung seiner Länge und Richtung.
 */
function onPointerMove(event) {
  if (legendDrag) {
    if (legendDrag.pointerId != null && event.pointerId != null && event.pointerId !== legendDrag.pointerId) return;
    moveLegend(event);
    return;
  }
  if (!drag) return;
  if (drag.pointerId != null && event.pointerId != null && event.pointerId !== drag.pointerId) return;
  const point = svgPoint(event);
  if (!point) return;
  const local = worldToLocal(drag.placement, point);
  const next = {
    horizontal: round(local.horizontal + drag.offset.horizontal),
    vertical: round(local.vertical + drag.offset.vertical),
  };
  if (
    next.horizontal === drag.element.horizontal_start_rel_to_segment_start &&
    next.vertical === drag.element.vertical_start_rel_to_segment_start
  ) return;
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

/**
 * Beendet Pointer-Capture und erlaubt wieder einen vollständigen Layoutlauf.
 * Beim geänderten Blattmass wird die Kamera so angepasst, dass der Loslasspunkt
 * sichtbar stabil bleibt, ohne die Modellkoordinaten nachträglich zu verändern.
 */
function onPointerUp(event) {
  if (legendDrag) {
    if (legendDrag.pointerId != null && event?.pointerId != null && event.pointerId !== legendDrag.pointerId) return;
    finishLegendDrag();
    return;
  }
  if (!drag) return;
  if (drag.pointerId != null && event?.pointerId != null && event.pointerId !== drag.pointerId) return;
  const finished = drag;
  const svg = $('svg-host').querySelector('svg');
  const matrix = svg?.getScreenCTM();
  const point = currentLayout.placements[finished.segmentIndex].elements[finished.elementIndex].point;
  const anchor = matrix ? new DOMPoint(point.x, point.y).matrixTransform(matrix) : null;
  drag = null;
  $('svg-host').classList.remove('is-dragging');
  if (finished.node.hasPointerCapture?.(finished.pointerId)) {
    finished.node.releasePointerCapture(finished.pointerId);
  }
  // Erst jetzt darf sich das Layout wieder an den neuen Stand anpassen.
  if (finished.moved) {
    render();
    const nextSvg = $('svg-host').querySelector('svg');
    const nextMatrix = nextSvg?.getScreenCTM();
    if (anchor && nextMatrix) {
      // A4 passt den Massstab an neue Blattmasse an. Die Kamera hält das
      // gezogene Symbol am Loslasspunkt, ohne Modellkoordinaten zu verändern.
      state.view.zoom *= Math.hypot(matrix.a, matrix.b) / Math.hypot(nextMatrix.a, nextMatrix.b);
      applyZoom();
      const nextPoint = currentLayout.placements[finished.segmentIndex].elements[finished.elementIndex].point;
      const nextAnchor = new DOMPoint(nextPoint.x, nextPoint.y).matrixTransform(nextSvg.getScreenCTM());
      const canvas = $('canvas');
      canvas.scrollLeft += nextAnchor.x - anchor.x;
      canvas.scrollTop += nextAnchor.y - anchor.y;
      // An Scrollgrenzen (besonders mobil) kann Scrollen die Differenz nicht
      // vollständig ausgleichen. Der Rest gehört zur Kamera, nicht zum Modell.
      const settledAnchor = new DOMPoint(nextPoint.x, nextPoint.y).matrixTransform(nextSvg.getScreenCTM());
      cameraOffset.x += anchor.x - settledAnchor.x;
      cameraOffset.y += anchor.y - settledAnchor.y;
      applyZoom();
      persist();
    }
  } else {
    render();
  }
}

/* ------------------------------------------------------------------- Ansicht */

function applyZoom() {
  const stage = $('stage');
  stage.style.transform = `translate(${cameraOffset.x}px, ${cameraOffset.y}px) scale(${state.view.zoom})`;
  $('zoom-label').textContent = `${Math.round(state.view.zoom * 100)}%`;
}

function fitZoom() {
  cameraOffset.x = 0;
  cameraOffset.y = 0;
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
  $('photo-page-info').textContent = t(lang(), 'photo.page_info', { count: state.photo.pageCount });
  $('btn-photo-page-prev').disabled = state.photo.page <= 1;
  $('btn-photo-page-next').disabled = state.photo.page >= state.photo.pageCount;
}

async function showPdfPage(pageNumber) {
  if (!pdfDoc) return;
  const target = Math.min(Math.max(1, pageNumber), pdfDoc.pageCount);
  setStatusKey('status.rendering_pdf_page', { page: target });
  try {
    state.photo.src = await pdfDoc.renderPage(target);
    state.photo.page = target;
    applyPhoto();
    persist();
    setStatusKey('status.pdf_page_loaded', { page: target, count: pdfDoc.pageCount });
  } catch (error) {
    setStatusKey('status.pdf_page_render_failed', { error: error.message });
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
    setStatusKey('status.pdf_opening');
    try {
      if (pdfDoc) pdfDoc.destroy();
      pdfDoc = await openPdf(file);
      state.photo.pageCount = pdfDoc.pageCount;
      await showPdfPage(1);
    } catch (error) {
      pdfDoc = null;
      state.photo.pageCount = 0;
      syncPhotoPageControls();
      setStatusKey('status.pdf_read_failed', { error: error.message });
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
    setStatusKey('status.photo_loaded');
  };
  reader.onerror = () => setStatusKey('status.photo_read_failed');
  reader.readAsDataURL(file);
}

/* --------------------------------------------------------------- Dateien */

async function openFile(file) {
  try {
    const text = await file.text();
    const isShortList = /\.txt$/i.test(file.name);
    const topo = isShortList
      ? topoFromShortList(text)
      : /^\s*</.test(text) ? topoFromXml(text) : topoFromJson(text);
    pushHistory();
    replaceTopo(topo);
    fitZoom();
    setStatusKey(isShortList ? 'status.shortlist_loaded' : 'status.file_loaded', { name: file.name });
  } catch (error) {
    if (error instanceof ShortListError) {
      setStatusKey('status.shortlist_import_failed', () => ({ errors: shortListErrors(error, 'line') }));
      return;
    }
    if (error instanceof RemovedSegmentError) {
      setStatusKey('status.removed_weir_import', { index: error.index });
      return;
    }
    setStatusKey('status.file_load_failed', { error: error.message });
  }
}

function shortListErrors(error, context) {
  return error.issues.map(({ position, code }) => {
    const message = t(lang(), code.startsWith('shortcut.') ? code : `shortlist.error.${code}`);
    return position ? t(lang(), `shortlist.${context}`, { position, message }) : message;
  }).join(' ');
}

async function loadExample() {
  try {
    const response = await fetch('examples/my-canyon-inferiore.json?v=0.14');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const topo = topoFromJson(await response.text());
    pushHistory();
    replaceTopo(topo);
    fitZoom();
    setStatusKey('status.example_loaded');
  } catch (error) {
    setStatusKey('status.example_load_failed', { error: error.message });
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
  ];
  for (const [id, key, transform] of bindings) {
    const input = $(id);
    let editing = false;
    let valueBeforeEdit;

    input.addEventListener('input', (event) => {
      if (!editing) {
        editing = true;
        valueBeforeEdit = state.topo[key];
      }
      state.topo[key] = transform(event.target.value);
      render();
    });

    input.addEventListener('change', (event) => {
      const next = transform(event.target.value);
      if (editing && valueBeforeEdit !== next) {
        const edited = state.topo[key];
        state.topo[key] = valueBeforeEdit;
        pushHistory();
        state.topo[key] = edited;
      } else if (!editing && state.topo[key] !== next) {
        pushHistory();
      }
      editing = false;
      valueBeforeEdit = undefined;
      state.topo[key] = next;
      render();
    });
  }

  const thresholdInput = $('topo-length-shortening-threshold');
  let thresholdEditRecorded = false;
  const thresholdValue = (value) => {
    const threshold = Number(value);
    return value.trim() === '' ||
      !Number.isFinite(threshold) ||
      threshold < 0
      ? null
      : threshold;
  };
  thresholdInput.addEventListener('input', (event) => {
    const next = thresholdValue(event.target.value);
    if (!thresholdEditRecorded && state.topo.length_shortening_threshold_meters !== next) {
      pushHistory();
      thresholdEditRecorded = true;
    }
    state.topo.length_shortening_threshold_meters = next;
    render();
  });
  thresholdInput.addEventListener('change', (event) => {
    const next = thresholdValue(event.target.value);
    if (!thresholdEditRecorded && state.topo.length_shortening_threshold_meters !== next) {
      pushHistory();
    }
    thresholdEditRecorded = false;
    state.topo.length_shortening_threshold_meters = next;
    render();
  });
}

function syncTopoFields() {
  $('topo-name').value = state.topo.canyon_name;
  $('topo-author').value = state.topo.author;
  $('topo-duration').value = state.topo.duration;
  $('topo-date').value = state.topo.date;
  $('topo-max-walk').value = state.topo.maximum_walk_length;
  $('topo-line-distance').value = state.topo.distance_of_single_line;
  $('topo-length-shortening-threshold').value =
    state.topo.length_shortening_threshold_meters ?? '';
}

function bindToolbar() {
  $('btn-new-default').addEventListener('click', () => {
    pushHistory();
    replaceTopo(createEmptyTopo());
    setStatusKey('status.new_topo');
  });
  $('btn-new-empty').addEventListener('click', () => {
    pushHistory();
    replaceTopo(normalizeTopo({ segments: [] }));
    setStatusKey('status.empty_topo');
  });
  $('btn-example').addEventListener('click', loadExample);
  $('btn-random').addEventListener('click', () => {
    pushHistory();
    replaceTopo(createRandomTopo());
    fitZoom();
    setStatusKey('status.random_topo_created', { name: state.topo.canyon_name });
  });
  $('btn-open-file').addEventListener('click', () => $('file-open').click());
  $('btn-open-oc').addEventListener('click', () => setStatusKey('status.oc_unavailable'));
  $('btn-save-oc').addEventListener('click', () => setStatusKey('status.oc_save_unavailable'));
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
    setStatusKey('status.json_saved');
  });
  $('btn-save-xml').addEventListener('click', () => {
    downloadText(
      `${slugify(state.topo.canyon_name)}.xml`,
      topoToXml(state.topo),
      'application/xml',
    );
    setStatusKey('status.xml_saved');
  });
  $('btn-export-svg').addEventListener('click', () => {
    downloadText(
      `${slugify(state.topo.canyon_name)}.svg`,
      currentSvgText,
      'image/svg+xml',
    );
    setStatusKey('status.svg_exported');
  });
  $('btn-export-png').addEventListener('click', async () => {
    try {
      const blob = await svgToPngBlob(currentSvgText, 2);
      downloadBlob(`${slugify(state.topo.canyon_name)}.png`, blob);
      setStatusKey('status.png_exported');
    } catch (error) {
      setStatusKey('status.png_export_failed', { error: error.message });
    }
  });
  $('btn-export-shortlist').addEventListener('click', () => {
    let result;
    try {
      result = topoToShortList(state.topo);
    } catch (error) {
      if (!(error instanceof ShortListError)) throw error;
      setStatusKey('status.shortlist_export_failed', () => ({ errors: shortListErrors(error, 'segment') }));
      return;
    }
    const { text, count } = result;
    if (count === 0) {
      setStatusKey('status.shortlist_empty');
      return;
    }
    downloadText(`${slugify(state.topo.canyon_name)}-kurzliste.txt`, text, 'text/plain');
    setStatusKey('status.shortlist_exported', { count });
  });
  $('btn-print').addEventListener('click', () => {
    printSvg(currentSvgText, state.topo.canyon_name);
  });

  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);

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

  $('select-language').value = state.view.language;
  $('select-language').addEventListener('change', (event) => {
    state.view.language = event.target.value;
    applyTranslations();
    render();
  });

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
  const shortcutInput = $('segment-shortcut');
  const shortcutHelp = $('shortcut-help');
  const shortcutHelpButton = $('btn-shortcut-help');
  shortcutHelp.addEventListener('toggle', (event) => {
    const open = event.newState === 'open';
    shortcutHelpButton.setAttribute('aria-expanded', String(open));
    if (open) $('btn-close-shortcut-help').focus();
  });
  shortcutHelp.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    shortcutHelp.hidePopover();
    shortcutHelpButton.focus();
  });
  $('btn-close-shortcut-help').addEventListener('click', () => shortcutHelpButton.focus());
  document.addEventListener('focusin', (event) => {
    if (shortcutHelp.matches(':popover-open') && event.target !== shortcutHelpButton && !shortcutHelp.contains(event.target)) {
      shortcutHelp.hidePopover();
    }
  });
  shortcutInput.addEventListener('input', () => {
    shortcutError = null;
    refreshShortcutError();
  });
  const addShortcut = () => {
    const parsed = parseSegmentShortcutList(shortcutInput.value);
    shortcutError = parsed.error ? parsed : null;
    refreshShortcutError();
    if (shortcutError) return;
    pushHistory();
    state.topo.segments.push(...parsed.segments.map((segment) => createSegment(segment.type, {
      length_in_meters: segment.length_in_meters,
      angle_in_degrees: defaultAngleFor(segment.type),
    })));
    render();
    shortcutInput.value = '';
    shortcutInput.focus();
    if (parsed.segments.length === 1) {
      const segment = parsed.segments[0];
      setStatusKey('status.shortcut_added', { type: segment.type, length: segment.length_in_meters });
    } else {
      setStatusKey('status.shortcuts_added', { count: parsed.segments.length });
    }
  };
  $('btn-add-shortcut').addEventListener('click', addShortcut);
  shortcutInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    addShortcut();
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
  button.title = providerStatusText(lang());
  $('ai-provider-hint').textContent = translateProviderHint(spec.id, lang());
  $('ai-key-row').hidden = !spec.needsKey;
  $('ai-model-row').hidden = spec.id === 'proxy';
  const template = promptTemplateById(getAiSettings().promptTemplate);
  $('ai-prompt-hint').textContent = translatePromptHint(template.id, lang());
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
  setModelHint(t(lang(), 'ai.models_loading'));

  let result;
  try {
    result = await listModels({ lang: lang() });
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
    t(lang(), 'ai.models_found', {
      count: result.models.length,
      viaProxy: result.viaProxy ? t(lang(), 'ai.models_via_proxy') : '',
    }) + (current && !known ? t(lang(), 'ai.model_unknown_but_usable', { model: current }) : ''),
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
    target.textContent = t(lang(), 'ai.proxy_available', { port: LOCAL_PROXY_PORT });
    target.classList.remove('is-error');
  } else {
    target.textContent = t(lang(), 'ai.proxy_unavailable', { port: LOCAL_PROXY_PORT });
    target.classList.remove('is-error');
  }
}

/** Übersetzt die dynamisch befüllten AI-Auswahllisten und Hinweise neu. */
function refreshAiTranslations() {
  const providerSelect = $('ai-provider');
  if (!providerSelect) return;
  for (const option of providerSelect.options) option.textContent = translateProviderLabel(option.value, lang());
  for (const option of $('ai-prompt-template').options) option.textContent = translatePromptLabel(option.value, lang());
  const settings = getAiSettings();
  $('btn-photo-ai').title = providerStatusText(lang());
  $('ai-provider-hint').textContent = translateProviderHint(providerById(settings.providerId).id, lang());
  $('ai-prompt-hint').textContent = translatePromptHint(promptTemplateById(settings.promptTemplate).id, lang());
  refreshProxyState();
}

function bindAi() {
  const saved = loadAiSettings();

  const providerSelect = $('ai-provider');
  for (const spec of AI_PROVIDERS) {
    const option = document.createElement('option');
    option.value = spec.id;
    option.textContent = translateProviderLabel(spec.id, lang());
    providerSelect.appendChild(option);
  }
  providerSelect.value = saved.providerId;

  const promptSelect = $('ai-prompt-template');
  for (const entry of PROMPT_TEMPLATES) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = translatePromptLabel(entry.id, lang());
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
    setAiStatus(t(lang(), 'ai.key_deleted'));
  });

  $('btn-ai-cancel').addEventListener('click', () => {
    if (aiAbort) aiAbort.abort();
  });

  $('btn-photo-ai').addEventListener('click', runAi);
  syncAiControls();
}

async function runAi() {
  if (!state.photo.src) {
    setAiStatus(t(lang(), 'ai.need_photo_first'), true);
    return;
  }

  aiAbort = new AbortController();
  const report = [];
  let usedProxy = false;
  syncAiControls();
  $('btn-ai-cancel').hidden = false;
  $('btn-photo-ai').classList.add('is-busy');
  setAiStatus(t(lang(), 'ai.analyzing'));
  setStatusKey('status.ai_running');

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
    const skipped = report.length ? t(lang(), 'ai.result_skipped_suffix', { count: report.length }) : '';
    const via = usedProxy ? t(lang(), 'ai.models_via_proxy') : '';
    setAiStatus(t(lang(), 'ai.result_summary', { count, via, skipped }));
    setStatusKey('status.ai_done', { count });
    if (report.length) console.warn('AI-Erkennung, verworfen:', report);
  } catch (error) {
    if (error?.name === 'AbortError') {
      setAiStatus(t(lang(), 'ai.aborted'));
      setStatusKey('status.ai_cancelled');
    } else {
      setAiStatus(error.message, true);
      setStatusKey('status.ai_failed');
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
  // SVG-Touchziele können trotz Pointer-Capture eine native Scrollgeste starten.
  // Nur Symbolgesten blockieren; die übrige Zeichenfläche bleibt scrollbar.
  host.addEventListener('touchstart', (event) => {
    if (event.target.closest('.topo-element')) event.preventDefault();
    else if (event.touches?.length === 1 && legendRectAt(svgPoint(event.touches[0]))) event.preventDefault();
  }, { passive: false });
  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointermove', (event) => {
    if (drag || legendDrag) return;
    host.classList.toggle('is-over-legend', !event.target.closest('.topo-element') && Boolean(legendRectAt(svgPoint(event))));
  });
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

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
      if (drag) onPointerUp();
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
  initPanelSections();
  initAiLock({ onMessage: (key) => setStatusKey(key) });
  initResponsive();
  const restored = restore();
  bindToolbar();
  bindTopoFields();
  bindPhoto();
  bindAi();
  bindCanvas();
  applyTranslations();
  syncTopoFields();
  render();
  fitZoom();
  setStatusKey(restored === 'removed_weir' ? 'status.removed_weir_storage' : restored ? 'status.restored' : 'status.ready_sentence');
}

init();

/** Der Zustandsexport wird von den UI-Tests zum Prüfen echter Interaktionen benutzt. */
export { state, cloneTopo };
