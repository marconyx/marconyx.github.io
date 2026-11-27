/**
 * Verlustfreier XML-Export/-Import (1:1-Abbildung des JSON-Modells).
 *
 * Mapping-Regeln:
 *  - Root  <topo>    : alle Kopffelder als Attribute
 *  - <segment>       : Segmentfelder als Attribute
 *  - <element>       : Elementfelder als Attribute
 *  - null-Werte      : Attribut wird weggelassen
 *  - unbekannte Felder: als JSON im Attribut `extra`
 */
import { normalizeTopo } from './model.js?v=0.21';

const ROOT_NUMBER_FIELDS = [
  'maximum_walk_length',
  'distance_of_single_line',
  'legend_offset_top',
  'legend_offset_left',
  'length_shortening_threshold_meters',
];
const SEGMENT_NUMBER_FIELDS = ['length_in_meters', 'angle_in_degrees'];
const SEGMENT_BOOL_FIELDS = [
  'do_not_cut_row_after_this_segment',
  'force_cut_row_after_this_segment',
];
const ELEMENT_NUMBER_FIELDS = [
  'horizontal_start_rel_to_segment_start',
  'vertical_start_rel_to_segment_start',
  'horizontal_end_rel_to_segment_start',
  'vertical_end_rel_to_segment_start',
  'size',
];

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#9;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;');
}

function unescapeXml(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

function attrs(pairs) {
  return pairs
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
    .join(' ');
}

function extraAttr(node) {
  return node._extra ? [['extra', JSON.stringify(node._extra)]] : [];
}

/**
 * Serialisiert das normalisierte Modell in das attributbasierte `<topo>`-XML.
 * Nullwerte werden ausgelassen und unbekannte Modellfelder als JSON im
 * `extra`-Attribut abgelegt, damit Erweiterungen einen Round-Trip überstehen.
 * @param {object} topo normalisiertes Topo
 * @returns {string} XML-Dokument mit Attributen statt Elementtext
 */
export function topoToXml(topo) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push(
    `<topo ${attrs([
      ['version', '1'],
      ['canyon_name', topo.canyon_name],
      ['author', topo.author || null],
      ['duration', topo.duration || null],
      ['recommended_rope_length', topo.recommended_rope_length || null],
      ['date', topo.date],
      ...ROOT_NUMBER_FIELDS.map((field) => [field, topo[field]]),
      ...extraAttr(topo),
    ])}>`,
  );
  for (const segment of topo.segments) {
    const segmentAttrs = attrs([
      ['type', segment.type],
      ...SEGMENT_NUMBER_FIELDS.map((field) => [field, segment[field]]),
      ['duration_to_walk_in_min', segment.duration_to_walk_in_min],
      // Wie im JSON nur bei gesetztem Wert, damit bestehende Dateien
      // byte-identisch bleiben.
      [
        'wall_distance_in_meters',
        segment.wall_distance_in_meters > 0
          ? segment.wall_distance_in_meters
          : null,
      ],
      ['depth_in_meters', segment.depth_in_meters],
      ...SEGMENT_BOOL_FIELDS.map((field) => [field, segment[field]]),
      ...extraAttr(segment),
    ]);
    if (!segment.elements.length) {
      lines.push(`  <segment ${segmentAttrs}/>`);
      continue;
    }
    lines.push(`  <segment ${segmentAttrs}>`);
    for (const element of segment.elements) {
      lines.push(
        `    <element ${attrs([
          ['type', element.type],
          ...ELEMENT_NUMBER_FIELDS.map((field) => [field, element[field]]),
          ['text', element.text],
          // Wie im JSON nur bei true, damit bestehende Dateien unverändert bleiben.
          ['dead', element.dead ? 'true' : null],
          // Gehzeit am Fluchtweg – ebenfalls nur, wenn gesetzt.
          [
            'duration_to_walk_in_min',
            element.duration_to_walk_in_min > 0
              ? element.duration_to_walk_in_min
              : null,
          ],
          ...extraAttr(element),
        ])}/>`,
      );
    }
    lines.push('  </segment>');
  }
  lines.push('</topo>');
  return lines.join('\n');
}

/**
 * Minimaler Tag-Scanner für das app-eigene Attributformat, kein allgemeiner
 * XML-Parser und keine XSD-Validierung. Kommentare werden entfernt; Tags oder
 * Syntax, die das Muster nicht erkennt, werden nicht separat beanstandet.
 * Externe Entitäten und DTDs werden weder geladen noch ausgewertet.
 */
function scanTags(xml) {
  const tags = [];
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, '');
  const tagPattern = /<\/?([A-Za-z_][\w.-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let match;
  while ((match = tagPattern.exec(withoutComments)) !== null) {
    const [full, name, rawAttrs, selfClosing] = match;
    tags.push({
      name,
      closing: full.startsWith('</'),
      selfClosing: selfClosing === '/',
      attributes: parseAttributes(rawAttrs),
    });
  }
  return tags;
}

function parseAttributes(raw) {
  const result = {};
  const pattern = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = pattern.exec(raw || '')) !== null) {
    result[match[1]] = unescapeXml(match[2] ?? match[3]);
  }
  return result;
}

function maybeExtra(attributes) {
  if (!attributes.extra) return {};
  try {
    return JSON.parse(attributes.extra);
  } catch {
    return {};
  }
}

function mergeExtra(target, attributes) {
  // Unbekannte Dateifelder dürfen den Prototyp des Rohobjekts nicht setzen.
  for (const [key, value] of Object.entries(maybeExtra(attributes) ?? {})) {
    Object.defineProperty(target, key, {
      value, enumerable: true, writable: true, configurable: true,
    });
  }
}

/**
 * Liest XML mit dem abhängigenkeitsfreien Scanner ein und übergibt das
 * rekonstruierte Objekt an dieselbe Modellnormalisierung wie JSON.
 *
 * Der Scanner wertet XML-Attribute und Elementverschachtelung aus, nicht aber
 * beliebigen Elementtext oder externe DTDs. Fehlendes `<topo>` und entfernte
 * WEIR-Segmente sind harte Importfehler.
 * Ungültiges JSON im `extra`-Attribut wird ignoriert; der Scanner garantiert
 * keine vollständige Prüfung beliebiger XML-Dokumente gegen die XSD.
 *
 * @param {string} xml XML-Text im unterstützten Attributformat
 * @returns {object} normalisiertes Topo
 * @throws {Error} bei fehlender Wurzel oder entferntem WEIR-Segment
 */
export function topoFromXml(xml) {
  const tags = scanTags(xml);
  const root = tags.find((tag) => tag.name === 'topo' && !tag.closing);
  if (!root) throw new Error('Kein <topo>-Wurzelelement gefunden.');

  const raw = {
    canyon_name: root.attributes.canyon_name,
    author: root.attributes.author,
    duration: root.attributes.duration,
    recommended_rope_length: root.attributes.recommended_rope_length,
    date: root.attributes.date,
    segments: [],
  };
  for (const field of ROOT_NUMBER_FIELDS) {
    if (root.attributes[field] !== undefined) {
      raw[field] = Number(root.attributes[field]);
    }
  }
  mergeExtra(raw, root.attributes);

  let currentSegment = null;
  for (const tag of tags) {
    if (tag.name === 'segment' && !tag.closing) {
      currentSegment = { type: tag.attributes.type, elements: [] };
      for (const field of SEGMENT_NUMBER_FIELDS) {
        if (tag.attributes[field] !== undefined) {
          currentSegment[field] = Number(tag.attributes[field]);
        }
      }
      currentSegment.duration_to_walk_in_min =
        tag.attributes.duration_to_walk_in_min === undefined
          ? null
          : Number(tag.attributes.duration_to_walk_in_min);
      if (tag.attributes.wall_distance_in_meters !== undefined) {
        currentSegment.wall_distance_in_meters = Number(
          tag.attributes.wall_distance_in_meters,
        );
      }
      currentSegment.depth_in_meters = tag.attributes.depth_in_meters;
      for (const field of SEGMENT_BOOL_FIELDS) {
        currentSegment[field] = tag.attributes[field] === 'true';
      }
      mergeExtra(currentSegment, tag.attributes);
      raw.segments.push(currentSegment);
      if (tag.selfClosing) currentSegment = null;
    } else if (tag.name === 'segment' && tag.closing) {
      currentSegment = null;
    } else if (tag.name === 'element' && !tag.closing && currentSegment) {
      const element = {
        type: tag.attributes.type,
        text: tag.attributes.text ?? '',
        dead: tag.attributes.dead === 'true',
        duration_to_walk_in_min:
          tag.attributes.duration_to_walk_in_min === undefined
            ? null
            : Number(tag.attributes.duration_to_walk_in_min),
      };
      for (const field of ELEMENT_NUMBER_FIELDS) {
        element[field] =
          tag.attributes[field] === undefined
            ? null
            : Number(tag.attributes[field]);
      }
      mergeExtra(element, tag.attributes);
      currentSegment.elements.push(element);
    }
  }
  return normalizeTopo(raw);
}
