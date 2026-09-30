/**
 * Datenmodell des Canyoning-Topos.
 *
 * Das In-Memory-Modell ist identisch zum Canyon-Explore-JSON, damit Import/Export
 * verlustfrei bleiben. Unbekannte Felder werden in `_extra` konserviert.
 */

export const SEGMENT_TYPES = [
  'WALK',
  'POOL',
  'RAPPEL',
  'RAPPEL_DRY',
  'RAPPEL_WET',
  'JUMP',
  'SLIDE',
  'CLIMB',
  'WEIR',
];

/** Kurzlabel im Topo, z. B. R_d10 / J6 / S6. */
export const SEGMENT_LABELS = {
  RAPPEL: { base: 'R', sub: '' },
  RAPPEL_DRY: { base: 'R', sub: 'd' },
  RAPPEL_WET: { base: 'R', sub: 'w' },
  JUMP: { base: 'J', sub: '' },
  SLIDE: { base: 'S', sub: '' },
  CLIMB: { base: 'C', sub: '' },
  WEIR: { base: 'W', sub: '' },
};

export const ELEMENT_TYPES = [
  'BOLT',
  'BOLT_LEFT',
  'BOLT_RIGHT',
  'STONE',
  'TRAPPED_STONE',
  'SHARP_EDGE',
  'LADDER',
  'TRUNK',
  'LEAF_TREE',
  'CONIFER_TREE',
  'CAVE',
  'BACKWATER',
  'STONE_BRIDGE',
  'WOODEN_BRIDGE',
  'STONE_HOUSE',
  'RADIO_MAST',
  'LIFT_MAST',
  'SQUARE_CONCRETE_BASE',
  'STEEL_BEAM',
  'INLET_LEFT',
  'INLET_RIGHT',
  'ESCAPE_EXIT_LEFT',
  'ESCAPE_EXIT_RIGHT',
  'ROPE_RAILING_LEFT',
  'ROPE_RAILING_RIGHT',
  'RAPPEL_GUIDE',
  'ELEMENT_NUMBER',
  'CUSTOM_TEXT',
  'WARNING_AND_TEXT',
  'DEATH_HAZARD',
  'TREE_JAM',
  'BOULDER_JAM',
  'ROCKFALL',
  'UNDERCUT',
  'DANGEROUS_CURRENT',
  'SIPHON',
  'WATER_DIVERSION',
  'PATH',
  'ROAD',
  'BYPASS',
  'ENTRY_POINT',
  'EXIT_POINT',
];

/** Elemente mit Start- UND Endpunkt (Strecken statt Punkte). */
export const RANGE_ELEMENT_TYPES = new Set([
  'ROPE_RAILING_LEFT',
  'ROPE_RAILING_RIGHT',
  'RAPPEL_GUIDE',
  'PATH',
  'ROAD',
]);

/**
 * Elemente, die den Zustand "abgestorben" kennen. Bei allen anderen wäre das
 * Feld bedeutungslos und landete nur als toter Ballast in der Datei.
 */
export const DEAD_CAPABLE_ELEMENT_TYPES = new Set(['LEAF_TREE', 'CONIFER_TREE']);

/** Segmenttypen, die Wasser am Grund zeigen. */
export const WATER_SEGMENT_TYPES = new Set(['POOL', 'WEIR']);

/**
 * Segmenttypen mit Gehzeit. Nur bei der Gehstrecke ist die Angabe sinnvoll –
 * abgeseilt, gesprungen oder geschwommen wird nicht gegangen.
 * Das Datenfeld bleibt bei allen Typen erhalten, es wird nur nicht angeboten.
 */
export const WALK_TIME_SEGMENT_TYPES = new Set(['WALK']);

/**
 * Elementtypen mit Gehzeit: Fluchtwege. Dort ist die Angabe die wichtigste
 * Information überhaupt – wie lange dauert der Ausstieg.
 */
export const WALK_TIME_ELEMENT_TYPES = new Set([
  'ESCAPE_EXIT_LEFT',
  'ESCAPE_EXIT_RIGHT',
]);

/**
 * Segmenttypen mit Wanddistanz. Nur beim Abseilen hängt das Seil frei vor der
 * Wand; bei allen anderen Typen wäre das Feld bedeutungslos.
 */
export const WALL_DISTANCE_SEGMENT_TYPES = new Set([
  'RAPPEL',
  'RAPPEL_DRY',
  'RAPPEL_WET',
]);

const ROOT_KNOWN_KEYS = new Set([
  'canyon_name',
  'author',
  'duration',
  'date',
  'maximum_walk_length',
  'distance_of_single_line',
  'legend_offset_top',
  'segments',
]);

const SEGMENT_KNOWN_KEYS = new Set([
  'type',
  'length_in_meters',
  'angle_in_degrees',
  'duration_to_walk_in_min',
  'wall_distance_in_meters',
  'do_not_cut_row_after_this_segment',
  'force_cut_row_after_this_segment',
  'elements',
]);

const ELEMENT_KNOWN_KEYS = new Set([
  'type',
  'horizontal_start_rel_to_segment_start',
  'vertical_start_rel_to_segment_start',
  'horizontal_end_rel_to_segment_start',
  'vertical_end_rel_to_segment_start',
  'size',
  'text',
  'dead',
  'duration_to_walk_in_min',
]);

function collectExtra(obj, knownKeys) {
  const extra = {};
  let has = false;
  for (const key of Object.keys(obj || {})) {
    if (!knownKeys.has(key)) {
      extra[key] = obj[key];
      has = true;
    }
  }
  return has ? extra : undefined;
}

function num(value, fallback) {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Wie nullableNum, aber negative Werte gelten als "nicht gesetzt". */
function nonNegativeOrNull(value) {
  const parsed = nullableNum(value);
  return parsed === null || parsed < 0 ? null : parsed;
}

function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function createElement(type, overrides = {}) {
  return normalizeElement({ type, ...overrides });
}

export function normalizeElement(raw) {
  const type = String(raw?.type ?? 'STONE');
  const element = {
    type,
    horizontal_start_rel_to_segment_start: num(
      raw?.horizontal_start_rel_to_segment_start,
      0,
    ),
    vertical_start_rel_to_segment_start: num(
      raw?.vertical_start_rel_to_segment_start,
      0,
    ),
    horizontal_end_rel_to_segment_start: nullableNum(
      raw?.horizontal_end_rel_to_segment_start,
    ),
    vertical_end_rel_to_segment_start: nullableNum(
      raw?.vertical_end_rel_to_segment_start,
    ),
    size: num(raw?.size, 1),
    text: raw?.text == null ? '' : String(raw.text),
    // Abgestorbener Baum – eine Erweiterung gegenüber dem Canyon-Explore-Format.
    // Nur bei Bäumen zulässig und nur geschrieben, wenn gesetzt (siehe io-json.js).
    dead: DEAD_CAPABLE_ELEMENT_TYPES.has(type) && bool(raw?.dead),
    // Gehzeit des Fluchtwegs. Ebenfalls eine Erweiterung: nur bei den beiden
    // ESCAPE_EXIT_*-Symbolen zulässig, nie negativ und nur geschrieben, wenn
    // gesetzt – sonst wären bestehende Dateien nicht mehr byte-identisch.
    duration_to_walk_in_min: WALK_TIME_ELEMENT_TYPES.has(type)
      ? nonNegativeOrNull(raw?.duration_to_walk_in_min)
      : null,
  };
  const extra = collectExtra(raw, ELEMENT_KNOWN_KEYS);
  if (extra) element._extra = extra;
  return element;
}

export function createSegment(type = 'WALK', overrides = {}) {
  return normalizeSegment({ type, ...overrides });
}

export function normalizeSegment(raw) {
  const type = String(raw?.type ?? 'WALK');
  const segment = {
    type,
    length_in_meters: num(raw?.length_in_meters, defaultLengthFor(type)),
    angle_in_degrees: num(raw?.angle_in_degrees, defaultAngleFor(type)),
    duration_to_walk_in_min: nullableNum(raw?.duration_to_walk_in_min),
    // Abstand der Wand zum frei hängenden Seil. Nur beim Abseilen sinnvoll und
    // nie negativ; 0 heisst "Seil liegt an der Wand" (siehe io-json.js).
    wall_distance_in_meters: WALL_DISTANCE_SEGMENT_TYPES.has(type)
      ? Math.max(0, num(raw?.wall_distance_in_meters, 0))
      : 0,
    do_not_cut_row_after_this_segment: bool(
      raw?.do_not_cut_row_after_this_segment,
    ),
    force_cut_row_after_this_segment: bool(
      raw?.force_cut_row_after_this_segment,
    ),
    elements: Array.isArray(raw?.elements)
      ? raw.elements.map(normalizeElement)
      : [],
  };
  const extra = collectExtra(raw, SEGMENT_KNOWN_KEYS);
  if (extra) segment._extra = extra;
  return segment;
}

export function defaultAngleFor(type) {
  if (type === 'RAPPEL' || type === 'RAPPEL_DRY' || type === 'RAPPEL_WET') {
    return 90;
  }
  if (type === 'JUMP') return 90;
  if (type === 'SLIDE') return 45;
  if (type === 'CLIMB') return 70;
  return 0;
}

export function defaultLengthFor(type) {
  if (type === 'WALK') return 20;
  if (type === 'POOL') return 8;
  if (type === 'WEIR') return 5;
  return 10;
}

export function normalizeTopo(raw) {
  const topo = {
    canyon_name: String(raw?.canyon_name ?? 'My Canyon'),
    author: raw?.author == null ? '' : String(raw.author),
    duration: raw?.duration == null ? '' : String(raw.duration),
    date: String(raw?.date ?? todayIso()),
    maximum_walk_length: num(raw?.maximum_walk_length, 30),
    distance_of_single_line: num(raw?.distance_of_single_line, 60),
    legend_offset_top: num(raw?.legend_offset_top, 0),
    segments: Array.isArray(raw?.segments)
      ? raw.segments.map(normalizeSegment)
      : [],
  };
  const extra = collectExtra(raw, ROOT_KNOWN_KEYS);
  if (extra) topo._extra = extra;
  return topo;
}

export function createEmptyTopo() {
  return normalizeTopo({
    canyon_name: 'My Canyon',
    author: '',
    duration: '',
    date: todayIso(),
    maximum_walk_length: 30,
    distance_of_single_line: 60,
    legend_offset_top: 0,
    segments: [
      createSegment('WALK', { length_in_meters: 15 }),
      createSegment('RAPPEL_DRY', { length_in_meters: 12 }),
      createSegment('POOL', { length_in_meters: 8 }),
    ],
  });
}

export function cloneTopo(topo) {
  return JSON.parse(JSON.stringify(topo));
}

/** Prüft die Struktur und liefert Hinweise (keine harten Fehler bei unbekannten Typen). */
export function validateTopo(topo) {
  const issues = [];
  if (!topo || typeof topo !== 'object') {
    return [{ level: 'error', message: 'Kein gültiges Topo-Objekt.' }];
  }
  if (!Array.isArray(topo.segments) || topo.segments.length === 0) {
    issues.push({ level: 'warning', message: 'Topo enthält keine Segmente.' });
  }
  if (topo.distance_of_single_line <= 0) {
    issues.push({
      level: 'error',
      message: 'distance_of_single_line muss größer als 0 sein.',
    });
  }
  if (topo.maximum_walk_length <= 0) {
    issues.push({
      level: 'error',
      message: 'maximum_walk_length muss größer als 0 sein.',
    });
  }
  (topo.segments || []).forEach((segment, index) => {
    if (!SEGMENT_TYPES.includes(segment.type)) {
      issues.push({
        level: 'warning',
        message: `Segment ${index + 1}: unbekannter Typ "${segment.type}" (wird unverändert erhalten).`,
      });
    }
    if (!(segment.length_in_meters > 0)) {
      issues.push({
        level: 'error',
        message: `Segment ${index + 1}: Länge muss größer als 0 sein.`,
      });
    }
    (segment.elements || []).forEach((element, elementIndex) => {
      if (!ELEMENT_TYPES.includes(element.type)) {
        issues.push({
          level: 'warning',
          message: `Segment ${index + 1}, Element ${elementIndex + 1}: unbekannter Typ "${element.type}".`,
        });
      }
      if (
        RANGE_ELEMENT_TYPES.has(element.type) &&
        element.horizontal_end_rel_to_segment_start == null
      ) {
        issues.push({
          level: 'warning',
          message: `Segment ${index + 1}, Element ${elementIndex + 1}: Streckenelement ohne Endpunkt.`,
        });
      }
    });
  });
  return issues;
}

/** Automatische Nummerierung aller ELEMENT_NUMBER-Marker, von unten nach oben gezählt. */
export function renumberElements(topo) {
  const markers = [];
  topo.segments.forEach((segment) => {
    segment.elements.forEach((element) => {
      if (element.type === 'ELEMENT_NUMBER') markers.push(element);
    });
  });
  markers.forEach((element, index) => {
    element.text = String(markers.length - index);
  });
  return topo;
}
