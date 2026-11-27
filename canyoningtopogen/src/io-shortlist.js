/**
 * Verlustarme Kurzlisten (TXT) mit genau einem Segmentkürzel und einer Länge
 * pro Zeile. Das Format speichert absichtlich keine Topo-Metadaten oder
 * Elementdaten; der Import normalisiert nur dann, wenn jede nichtleere Zeile
 * gültig ist. `SEGMENT_SHORTCUTS` enthält ausschliesslich Exportkürzel: WALK
 * wird als `W` ausgegeben und das alte `WA` beim Kurzlistenimport abgewiesen.
 */
import { SEGMENT_SHORTCUTS, createSegment, normalizeTopo, parseSegmentShortcut } from './model.js?v=0.18';

// Die Werte sind eindeutig; das Modell führt hier nur kanonische Kürzel auf.
const CODE_BY_TYPE = Object.fromEntries(
  Object.entries(SEGMENT_SHORTCUTS).map(([code, type]) => [type, code]),
);

/**
 * Fehler einer atomar abgebrochenen Kurzlistenoperation.
 * `issues` enthält `{position, code}` mit einsbasierter Quellzeile bzw.
 * Segmentposition; Position 0 bezeichnet eine vollständig leere Datei.
 */
export class ShortListError extends Error {
  constructor(issues) {
    super('Invalid short list');
    this.issues = issues;
  }
}

// Number#toString may use exponent notation, which the shortcut grammar rejects.
function decimalString(value) {
  const [mantissa, exponent] = String(value).toLowerCase().split('e');
  if (exponent === undefined) return mantissa;
  const [integer, fraction = ''] = mantissa.split('.');
  const digits = integer + fraction;
  const point = integer.length + Number(exponent);
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * Exportiert alle Segmente in Topo-Reihenfolge.
 *
 * Fehlerhafte Typen und Längen werden gesammelt; bei mindestens einem Fehler
 * wird keine teilweise Kurzliste zurückgegeben.
 *
 * @returns {{text: string, count: number}} UTF-8-Textinhalt und Segmentanzahl
 * @param {object} topo Modell mit Segmenten und numerischen Längen
 * @throws {ShortListError} wenn ein Segment nicht verlustfrei exportiert werden kann
 */
export function topoToShortList(topo) {
  const lines = [];
  const issues = [];
  (topo?.segments ?? []).forEach((segment, index) => {
    const type = segment?.type;
    const code = Object.hasOwn(CODE_BY_TYPE, type) ? CODE_BY_TYPE[type] : null;
    const length = segment?.length_in_meters;
    if (!code) issues.push({ position: index + 1, code: 'type' });
    if (typeof length !== 'number' || !Number.isFinite(length) || length <= 0) {
      issues.push({ position: index + 1, code: 'length' });
    }
    if (code && typeof length === 'number' && Number.isFinite(length) && length > 0) {
      lines.push(`${code}${decimalString(length)}`);
    }
  });
  if (issues.length) throw new ShortListError(issues);
  return { text: lines.length ? `${lines.join('\n')}\n` : '', count: lines.length };
}

/**
 * Importiert moderne Kürzelzeilen oder das nummerierte Altformat.
 *
 * Leere Zeilen und BOM sind zulässig; alle Fehler werden mit Quellzeile
 * gesammelt und verhindern den gesamten Import. Nicht gespeicherte Topo-Felder
 * erhalten Modell-Defaults.
 *
 * @param {string} text Dateiinhalt; Zeilenenden CR, LF und CRLF sind zulässig
 * @returns {object} normalisiertes Topo mit den gelesenen Segmenten
 * @throws {ShortListError} bei ungültigen Zeilen oder einer leeren Datei
 */
export function topoFromShortList(text) {
  const segments = [];
  const issues = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // Older exports used "1. RAPPEL_DRY: 12.5 m" and Number#toString.
    const legacy = /^\d+\.\s*([A-Z_]+):\s*(\d+(?:[.,]\d+)?(?:e[+-]?\d+)?)\s*m$/i.exec(trimmed);
    let input = trimmed;
    if (legacy) {
      if (legacy[1].toUpperCase() === 'WEIR') {
        issues.push({ position: index + 1, code: 'shortcut.removed_weir' });
        return;
      }
      const code = Object.hasOwn(CODE_BY_TYPE, legacy[1].toUpperCase())
        ? CODE_BY_TYPE[legacy[1].toUpperCase()] : null;
      const length = Number(legacy[2].replace(',', '.'));
      if (!code) {
        issues.push({ position: index + 1, code: 'type' });
        return;
      }
      if (!Number.isFinite(length) || length <= 0) {
        issues.push({ position: index + 1, code: 'length' });
        return;
      }
      input = `${code}${decimalString(length)}`;
    }
    // Der gemeinsame Parser akzeptiert WA weiterhin interaktiv, nicht im TXT-Format.
    const code = /^([a-z]+)/i.exec(input)?.[1].toUpperCase();
    if (code === 'WA') {
      issues.push({ position: index + 1, code: 'shortcut.unknown' });
      return;
    }
    const parsed = parseSegmentShortcut(input);
    if (parsed.error) {
      issues.push({ position: index + 1, code: parsed.error });
      return;
    }
    segments.push(createSegment(parsed.type, { length_in_meters: parsed.length_in_meters }));
  });
  if (issues.length) throw new ShortListError(issues);
  if (!segments.length) throw new ShortListError([{ position: 0, code: 'empty' }]);
  return normalizeTopo({ segments });
}
