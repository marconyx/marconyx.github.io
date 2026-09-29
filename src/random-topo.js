/**
 * Zufallsgenerator für vollständige Demo-Topos.
 *
 * Ziel ist nicht ein beliebiges, sondern ein *vollständiges* Topo: jeder
 * Segmenttyp des Modells und jede Variante der Symbolpalette kommt mindestens
 * einmal vor. Beide Listen werden aus den bestehenden Katalogen abgeleitet
 * (`SEGMENT_TYPES`, `symbolOptions()`), damit künftige Typen automatisch
 * mitgeneriert werden.
 *
 * Die Zufallsquelle ist injizierbar (`seed` oder `rng`), damit Tests
 * deterministisch bleiben. Das Ergebnis läuft durch dieselbe Normalisierung
 * wie ein Import (`normalizeTopo`).
 */
import {
  RANGE_ELEMENT_TYPES,
  SEGMENT_TYPES,
  WALL_DISTANCE_SEGMENT_TYPES,
  normalizeTopo,
  renumberElements,
} from './model.js';
import { symbolOptions } from './symbols.js';

/** Kleiner, schneller PRNG mit 32-Bit-Zustand (mulberry32). */
export function createRng(seed = 1) {
  let state = Math.trunc(seed) >>> 0 || 0x9e3779b9;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAME_PREFIXES = [
  'Rio',
  'Torrente',
  'Canyon',
  'Gorge du',
  'Val',
  'Bach',
  'Ruisseau',
];
const NAME_WORDS = [
  'Barbaira',
  'Verdone',
  'Chiusella',
  'Boggera',
  'Pontirone',
  'Cresciano',
  'Iragna',
  'Grosstal',
  'Sorba',
  'Ratikon',
  'Gornerli',
  'Tovanella',
];
const NAME_SUFFIXES = ['', '', ' Superiore', ' Inferiore', ' Integrale', ' Medio'];
const AUTHORS = [
  'M. Wahler',
  'Team Aqua',
  'C. Bianchi',
  'Canyon Crew',
  'L. Meier',
  'S. Rossi',
  'Gruppe Nord',
];
const TEXTS = [
  'Kurze Rast',
  'Sammelplatz',
  'Achtung Stroemung',
  'Umgehung moeglich',
  'Wasserstand pruefen',
  'Abseilen am Baum',
  'Seil 2x30 m',
  'Foto-Spot',
];
const WARNINGS = [
  'Siphon',
  'Steinschlag',
  'Rueckstrom',
  'Kein Ausstieg',
  'Sprung nur bei Hochwasser',
  'Kante scharf',
];
const BOLT_TEXTS = ['', '', '', '2x10', 'neu', 'rostig', 'M12'];

function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

function between(rng, min, max, decimals = 1) {
  const value = min + rng() * (max - min);
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  // -0 vermeiden: JSON schreibt "-0", XML liest daraus 0 – der Round-Trip wäre
  // sonst nicht mehr identisch.
  return rounded === 0 ? 0 : rounded;
}

function intBetween(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function chance(rng, probability) {
  return rng() < probability;
}

function shuffled(rng, list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Alle Varianten der Symbolpalette – inklusive Sondervarianten wie "abgestorben". */
export function requiredSymbolVariants() {
  return symbolOptions().flatMap((category) =>
    category.symbols.map((symbol) => ({
      type: symbol.type,
      dead: !!symbol.dead,
      range: !!symbol.range,
    })),
  );
}

function randomLengthFor(rng, type) {
  switch (type) {
    case 'WALK':
      return between(rng, 10, 60);
    case 'POOL':
      return between(rng, 4, 18);
    case 'WEIR':
      return between(rng, 2, 8);
    case 'JUMP':
      return between(rng, 3, 12);
    case 'SLIDE':
      return between(rng, 4, 16);
    case 'CLIMB':
      return between(rng, 4, 14);
    default:
      // Abseilstellen und unbekannte Typen: klassische Seillängen.
      return between(rng, 6, 45);
  }
}

function randomAngleFor(rng, type) {
  if (WALL_DISTANCE_SEGMENT_TYPES.has(type)) {
    // Gelegentlich überhängend (>90°) – der Fall, den das Layout abbilden soll.
    return chance(rng, 0.3) ? between(rng, 92, 115) : between(rng, 70, 90);
  }
  switch (type) {
    case 'WALK':
      return between(rng, -8, 12);
    case 'POOL':
      return between(rng, -3, 3);
    case 'WEIR':
      return between(rng, 0, 20);
    case 'JUMP':
      return between(rng, 80, 90);
    case 'SLIDE':
      return between(rng, 30, 60);
    case 'CLIMB':
      return between(rng, 55, 80);
    default:
      return between(rng, 0, 45);
  }
}

function textFor(rng, type) {
  if (type === 'CUSTOM_TEXT') return pick(rng, TEXTS);
  if (type === 'WARNING_AND_TEXT') return pick(rng, WARNINGS);
  if (type === 'ELEMENT_NUMBER') return '';
  if (type.startsWith('BOLT')) return pick(rng, BOLT_TEXTS);
  return chance(rng, 0.15) ? pick(rng, TEXTS) : '';
}

function buildElement(rng, variant, segmentLength) {
  const { type } = variant;
  const start = between(rng, 0.5, Math.max(1, segmentLength - 0.5), 1);
  const element = {
    type,
    horizontal_start_rel_to_segment_start: Math.min(start, segmentLength),
    vertical_start_rel_to_segment_start: between(rng, -3.5, 3.5),
    horizontal_end_rel_to_segment_start: null,
    vertical_end_rel_to_segment_start: null,
    size: between(rng, 0.8, 1.4, 2),
    text: textFor(rng, type),
  };
  if (RANGE_ELEMENT_TYPES.has(type) || variant.range) {
    const span = between(rng, 2, Math.max(3, segmentLength * 0.6), 1);
    element.horizontal_end_rel_to_segment_start = Math.min(
      segmentLength,
      element.horizontal_start_rel_to_segment_start + span,
    );
    element.vertical_end_rel_to_segment_start =
      element.vertical_start_rel_to_segment_start + between(rng, -1.5, 1.5);
  }
  if (variant.dead) element.dead = true;
  return element;
}

function buildSegmentTypes(rng) {
  const extras = Array.from({ length: intBetween(rng, 2, 5) }, () =>
    pick(rng, SEGMENT_TYPES),
  );
  const types = shuffled(rng, [...SEGMENT_TYPES, ...extras]);
  // Ein Zustieg zu Fuss steht am Anfang – so liest sich das Topo wie eine Tour.
  const walkIndex = types.indexOf('WALK');
  if (walkIndex > 0) {
    types.splice(walkIndex, 1);
    types.unshift('WALK');
  }
  return types;
}

/**
 * Erzeugt ein vollständiges Zufalls-Topo.
 *
 * @param {object} [options]
 * @param {number} [options.seed] Startwert für die eingebaute Zufallsquelle.
 * @param {() => number} [options.rng] Eigene Zufallsquelle (Werte in [0,1)).
 * @returns {object} normalisiertes Topo
 */
export function createRandomTopo(options = {}) {
  const rng =
    typeof options.rng === 'function'
      ? options.rng
      : createRng(
          options.seed === undefined
            ? Math.floor(Math.random() * 0xffffffff)
            : options.seed,
        );

  const types = buildSegmentTypes(rng);
  const segments = types.map((type) => {
    const length = randomLengthFor(rng, type);
    return {
      type,
      length_in_meters: length,
      angle_in_degrees: randomAngleFor(rng, type),
      duration_to_walk_in_min:
        type === 'WALK' && chance(rng, 0.6) ? intBetween(rng, 2, 25) : null,
      wall_distance_in_meters: WALL_DISTANCE_SEGMENT_TYPES.has(type)
        ? between(rng, 0, 7)
        : 0,
      do_not_cut_row_after_this_segment: false,
      force_cut_row_after_this_segment: false,
      elements: [],
    };
  });

  // Jede Palettenvariante genau einmal garantiert, dazu etwas Streuung.
  const variants = shuffled(rng, requiredSymbolVariants());
  const extraVariants = Array.from({ length: intBetween(rng, 3, 8) }, () =>
    pick(rng, variants),
  );
  for (const variant of [...variants, ...extraVariants]) {
    const segment = segments[intBetween(rng, 0, segments.length - 1)];
    segment.elements.push(
      buildElement(rng, variant, segment.length_in_meters),
    );
  }
  for (const segment of segments) {
    segment.elements.sort(
      (a, b) =>
        a.horizontal_start_rel_to_segment_start -
        b.horizontal_start_rel_to_segment_start,
    );
  }

  // Umbruch-Flags: nie beides am selben Übergang, und nie hinter dem letzten
  // Segment – dort hätte der Umbruch keine Wirkung.
  segments.slice(0, -1).forEach((segment) => {
    if (chance(rng, 0.15)) {
      segment.force_cut_row_after_this_segment = true;
    } else if (chance(rng, 0.15)) {
      segment.do_not_cut_row_after_this_segment = true;
    }
  });

  const date = new Date(Date.UTC(2020, 0, 1) + intBetween(rng, 0, 2200) * 86400000);
  const topo = normalizeTopo({
    canyon_name: `${pick(rng, NAME_PREFIXES)} ${pick(rng, NAME_WORDS)}${pick(rng, NAME_SUFFIXES)}`,
    author: pick(rng, AUTHORS),
    duration: `${intBetween(rng, 2, 6)}-${intBetween(rng, 7, 9)} h`,
    date: date.toISOString().slice(0, 10),
    maximum_walk_length: intBetween(rng, 20, 45),
    distance_of_single_line: intBetween(rng, 50, 90),
    legend_offset_top: chance(rng, 0.3) ? intBetween(rng, 0, 10) : 0,
    segments,
  });
  return renumberElements(topo);
}
