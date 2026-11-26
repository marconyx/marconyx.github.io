import { SEGMENT_SHORTCUTS, createSegment, normalizeTopo, parseSegmentShortcut } from './model.js?v=0.5';

const CODE_BY_TYPE = Object.fromEntries(
  Object.entries(SEGMENT_SHORTCUTS).map(([code, type]) => [type, code]),
);

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
