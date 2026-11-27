/**
 * SVG-Renderer: zeichnet ein Layout als eigenständiges SVG-Dokument.
 *
 * Die Layout-Engine liefert Meterkoordinaten, der Renderer ergänzt Gelände,
 * Segmente, Symbole, Hit-Areas und Legende. Blatt- und Legendengeometrie kommt
 * aus `sheet.js`, damit Layoutoptimierung, Drag-Hit-Testing und SVG dieselben
 * Grenzen verwenden. Themen ändern nur die Darstellung, nicht die Geometrie.
 * `renderTopoSvg` erzeugt Markup als String, keine DOM-Knoten. Die interaktive
 * Variante trägt Trefferflächen und Modellindizes; die Exportvariante wird
 * separat ohne Auswahl-/Drag-Markierungen erzeugt. Sichtbare Nutztexte werden
 * vor dem Einfügen in SVG escaped.
 */
import { SEGMENT_LABELS, WATER_SEGMENT_TYPES } from './model.js?v=0.24';
import {
  symbolFor,
  renderUnknownSymbol,
  renderEauFroideSymbol,
  renderEauFroideRange,
  EAU_FROIDE_PALETTE,
} from './symbols.js?v=0.24';
import {
  DEFAULT_LANGUAGE,
  translateLegendLabel,
} from './i18n.js?v=0.24';
import {
  PAPER_PRESETS,
  contentBoundsFor,
  fitBoundsToPaper,
  formatNumber,
  LEGEND_LINE_HEIGHT_METERS,
  legendEntriesFor,
  legendFooterLinesFor,
  legendHeadLinesFor,
  LEGEND_TEXT_INSET_METERS,
  legendPanelRectFor,
  legendTitleWidthMeters,
  paperPreset,
  poolDepthLabelFor,
  poolDrawingDepthOf,
} from './sheet.js?v=0.24';

export { PAPER_PRESETS };

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Visuelle Paletten und Stilmerkmale; unbekannte Schlüssel fallen auf Farbe zurück. */
export const THEMES = {
  color: {
    label: 'Farbe',
    terrainTop: '#e8cfae',
    terrainBottom: '#f8efe2',
    terrainLine: '#111111',
    water: '#1b3fb5',
    text: '#111111',
    accent: '#111111',
    background: '#ffffff',
  },
  alpiner_classic: {
    label: 'Alpin klassisch',
    terrainTop: '#cbd5d8',
    terrainBottom: '#eef1ef',
    terrainLine: '#303a3e',
    water: '#5e8799',
    text: '#252d30',
    accent: '#303a3e',
    background: '#fbfbf8',
    classic: true,
  },
  eau_froide: {
    label: 'Standard',
    terrainTop: '#d9dde0',
    terrainBottom: '#f4f4f4',
    terrainLine: EAU_FROIDE_PALETTE.line,
    water: EAU_FROIDE_PALETTE.water,
    cascade: EAU_FROIDE_PALETTE.water,
    shadow: EAU_FROIDE_PALETTE.shadow,
    text: '#000000',
    accent: '#000000',
    background: '#ffffff',
    eauFroide: true,
  },
  pencil_sketch: {
    label: 'Bleistiftskizze',
    terrainTop: '#d8d8d6',
    terrainBottom: '#f7f7f6',
    terrainLine: '#3a3a3a',
    water: '#8f8f8f',
    text: '#2b2b2b',
    accent: '#2b2b2b',
    background: '#ffffff',
    sketch: true,
  },
};

// Segmente, die im Stil Eau Froide als cyanfarbene Kaskadenlinie gezeichnet werden.
const CASCADE_SEGMENT_TYPES = new Set(['RAPPEL', 'RAPPEL_WET', 'CLIMB', 'JUMP', 'SLIDE']);

/**
 * Deterministische Marmorierung: feine graue Adern und weiche Flecken als
 * wiederholbares Muster, ganz ohne Zufall.
 */
const MARBLE_PATTERN = `<pattern id="topo-marble" patternUnits="userSpaceOnUse" width="36" height="24" patternTransform="scale(0.4)">
      <g fill="#c4c9cd" opacity="0.2">
        <ellipse cx="6" cy="5" rx="5.5" ry="2.2"/>
        <ellipse cx="24" cy="10" rx="7" ry="2.6"/>
        <ellipse cx="14" cy="19" rx="6" ry="2"/>
        <ellipse cx="31" cy="21" rx="4" ry="1.8"/>
      </g>
      <g fill="none" stroke-linecap="round">
        <path d="M0.5,4 C5,1.5 8,7 13,4 S21,1 25,5" stroke="#9aa0a6" stroke-width="0.3" opacity="0.42"/>
        <path d="M2,14 C8,10 12,16 18,12 S28,9 34,13" stroke="#aab0b5" stroke-width="0.5" opacity="0.35"/>
        <path d="M10,22 C14,18 19,23 24,19 S31,16 35,20" stroke="#9aa0a6" stroke-width="0.3" opacity="0.39"/>
        <path d="M26,0.5 C28,4 31,3 33,7" stroke="#b5bbc0" stroke-width="0.6" opacity="0.32"/>
        <path d="M18,6 C20,9 23,8 24,12" stroke="#9aa0a6" stroke-width="0.25" opacity="0.45"/>
        <path d="M5,18 C7,20 10,19 12,23" stroke="#b5bbc0" stroke-width="0.5" opacity="0.32"/>
        <path d="M30,16 C32,18 34,17 35.5,19.5" stroke="#9aa0a6" stroke-width="0.25" opacity="0.42"/>
      </g>
    </pattern>`;

/**
 * Deterministische Schraffur fürs Gelände im Bleistiftskizzen-Stil: feine
 * diagonale Linien wie Schattierstriche eines Bleistifts, ganz ohne Zufall.
 */
const SKETCH_HATCH_PATTERN = `<pattern id="topo-sketch-hatch" patternUnits="userSpaceOnUse" width="1.6" height="1.6" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="1.6" stroke="#8a8a8a" stroke-width="0.1" opacity="0.4"/>
    </pattern>`;

const LEGEND_LINE_HEIGHT = LEGEND_LINE_HEIGHT_METERS;

const TERRAIN_DEPTH_METERS = 14;
const CLASSIC_SYMBOL_COLORS = {
  '#000': '#303a3e',
  '#000000': '#303a3e',
  '#111': '#303a3e',
  '#111111': '#303a3e',
  '#14100c': '#303a3e',
  '#1a1a1a': '#303a3e',
  '#fff': '#fbfbf8',
  '#ffffff': '#fbfbf8',
  '#1b3fb5': '#5e8799',
  '#1f7a34': '#62766e',
  '#2a9d48': '#377b4d',
  '#14532d': '#214f32',
  '#0b7a45': '#62766e',
  '#c81e1e': '#76564c',
  '#c52b24': '#76564c',
  '#f0b400': '#a18b5d',
  '#6b3f1d': '#71685d',
  '#5b4632': '#71685d',
  '#7a6a58': '#71685d',
  '#8a7864': '#8a8175',
  '#b5651d': '#887b68',
  '#b5451d': '#887b68',
  '#e8dcb5': '#d7dddc',
  '#8d8d8d': '#899195',
  '#9a9a9a': '#899195',
  '#b9b2a6': '#aeb5b6',
  '#cfcfcf': '#d7dddc',
  '#d7d4c9': '#d7dddc',
  '#92918a': '#aeb5b6',
  '#bcbab1': '#c5cccb',
  '#aab9c6': '#aebbc0',
  '#71889a': '#84979e',
  '#899eae': '#aebbc0',
  '#768898': '#84979e',
  '#52687a': '#677a82',
  '#7a7a7a': '#899195',
  '#555': '#56666c',
  '#777': '#68767b',
  '#888': '#778388',
  '#aaa': '#aeb5b6',
  '#bbb': '#c5cccb',
  '#ddd': '#d7dddc',
  '#eee': '#eef1ef',
};

function classicSymbolStyle(svg) {
  return svg
    .replace(/#[\da-f]{3,8}(?=["'])/gi, (color) =>
      CLASSIC_SYMBOL_COLORS[color.toLowerCase()] || color,
    )
    .replace(/stroke-width="([\d.]+)"/g, (_match, value) =>
      `stroke-width="${Number((Number(value) * 0.82).toFixed(3))}"`,
    );
}

/**
 * Wandelt eine Hex-Farbe in einen echten Grauton (wahrgenommene Helligkeit)
 * um. Generisch statt Lookup-Tabelle, damit künftige Symbolfarben automatisch
 * mitgezogen werden – anders als `classicSymbolStyle`, das feste Zielfarben
 * je Ausgangsfarbe pflegt.
 */
function toGraphiteGray(hex) {
  let value = hex.slice(1);
  if (value.length === 3 || value.length === 4) {
    value = value.split('').map((char) => char + char).join('');
  }
  if (value.length !== 6 && value.length !== 8) return hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return hex;
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const byte = gray.toString(16).padStart(2, '0');
  return `#${byte}${byte}${byte}`;
}

/** Entfärbt Symbolzeichnungen für den Bleistiftskizzen-Stil zu echtem Graustufenbild. */
function sketchSymbolStyle(svg) {
  return svg.replace(/#[\da-f]{3,8}(?=["'])/gi, (color) => toGraphiteGray(color));
}

/** Abstand zwischen Stützpunkten beim Auflösen der Wandlinie in ein Polygon (Meter). */
const WOBBLE_SAMPLE_SPACING = 0.9;

/**
 * Löst eine Linie/Quadratic-Bezier-Teilstrecke in mehrere Punkte auf, damit
 * die Wandstruktur anschliessend wellig verformt werden kann. `from` wird
 * nicht erneut ausgegeben (ist bereits im vorherigen Punkt enthalten).
 */
function sampleWallSegment(from, to, control) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y) || 0.0001;
  const steps = Math.max(2, Math.min(220, Math.round(dist / WOBBLE_SAMPLE_SPACING)));
  const points = [];
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    if (control) {
      // Quadratische Bezier-Formel (Wandrücksprung/Gumpenrundung).
      const mt = 1 - t;
      points.push({
        x: mt * mt * from.x + 2 * mt * t * control.x + t * t * to.x,
        y: mt * mt * from.y + 2 * mt * t * control.y + t * t * to.y,
      });
    } else {
      points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
  }
  return points;
}

/**
 * Verformt eine Wandlinie (Gelände-/Felsstruktur) zu einem natürlicher
 * wirkenden, leicht welligen Verlauf, wie von Hand nachgezeichnet. Start-
 * und Endpunkt bleiben exakt erhalten, damit die Zeile weiterhin an den
 * Nachbarsegmenten andockt. Zwei überlagerte Sinuswellen mit fester
 * Frequenz/Amplitude sorgen für eine unregelmässig wirkende, aber komplett
 * deterministische Kurve (kein Zufall, bytegleiche Exporte/Tests bleiben
 * möglich). Betrifft nur die gezeichnete Wandlinie, nicht die Abseil-/
 * Rappel-Guide-Linien, die unverändert als eigene, exakt gerade Pfade
 * gerendert werden.
 */
function wobbleWallPath(d) {
  const tokens = d.trim().split(/\s+/);
  const points = [];
  let current = null;
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === 'M') {
      current = { x: Number(tokens[i + 1]), y: Number(tokens[i + 2]) };
      points.push(current);
      i += 3;
    } else if (cmd === 'L') {
      const to = { x: Number(tokens[i + 1]), y: Number(tokens[i + 2]) };
      points.push(...sampleWallSegment(current, to));
      current = to;
      i += 3;
    } else if (cmd === 'Q') {
      const control = { x: Number(tokens[i + 1]), y: Number(tokens[i + 2]) };
      const to = { x: Number(tokens[i + 3]), y: Number(tokens[i + 4]) };
      points.push(...sampleWallSegment(current, to, control));
      current = to;
      i += 5;
    } else {
      // Unbekanntes Pfadkommando: unverändert zurückgeben, statt zu raten.
      return d;
    }
  }
  if (points.length < 3) return d;

  const wobbled = points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;
    const prev = points[index - 1];
    const next = points[index + 1];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const perpX = -ty / len;
    const perpY = tx / len;
    const offset = 0.09 * Math.sin(index * 0.7) + 0.035 * Math.sin(index * 1.9 + 1.1);
    return { x: point.x + perpX * offset, y: point.y + perpY * offset };
  });

  return wobbled
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`)
    .join(' ');
}

/**
 * Zeichnet eine Linie als mehrfach leicht versetzten Strich, wie ein von
 * Hand nachgezogener Bleistiftstrich. Rein deterministisch (feste Versätze),
 * damit Export/Druck und Tests bytegleich bleiben.
 */
function sketchStrokesFor(d, color) {
  const passes = [
    { dx: -0.1, dy: 0.07, width: 0.1, opacity: 0.5 },
    { dx: 0.08, dy: -0.05, width: 0.09, opacity: 0.6 },
    { dx: 0, dy: 0, width: 0.12, opacity: 1 },
  ];
  return passes
    .map(
      ({ dx, dy, width, opacity }) =>
        `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" opacity="${opacity}" transform="translate(${dx},${dy})"/>`,
    )
    .join('');
}

function segmentLabelText(segment) {
  const config = Object.hasOwn(SEGMENT_LABELS, segment.type) ? SEGMENT_LABELS[segment.type] : null;
  if (!config) return null;
  return {
    base: config.base,
    sub: config.sub,
    value: formatNumber(segment.length_in_meters),
  };
}

function groundPathFor(row) {
  const commands = [];
  row.placements.forEach((placement, index) => {
    const { start, end } = placement;
    if (index === 0) commands.push(`M ${start.x} ${start.y}`);
    if (WATER_SEGMENT_TYPES.has(placement.segment.type)) {
      const midX = (start.x + end.x) / 2;
      const midY = Math.max(start.y, end.y) + poolDrawingDepthOf(placement.segment);
      commands.push(`Q ${midX} ${midY} ${end.x} ${end.y}`);
    } else if (placement.wallBulge) {
      // Frei hängendes Abseilen: die Wand weicht gerundet zurück.
      const { control } = placement.wallBulge;
      commands.push(`Q ${control.x} ${control.y} ${end.x} ${end.y}`);
    } else {
      commands.push(`L ${end.x} ${end.y}`);
    }
  });
  return commands.join(' ');
}

function waterShapeFor(placement) {
  const { start, end } = placement;
  const midX = (start.x + end.x) / 2;
  const midY = Math.max(start.y, end.y) + poolDrawingDepthOf(placement.segment);
  const surfaceY = Math.min(start.y, end.y);
  return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y} L ${end.x} ${surfaceY} L ${start.x} ${surfaceY} Z`;
}

function cascadePathFor(placement) {
  const { start, end, wallBulge } = placement;
  if (wallBulge) return `M ${start.x} ${start.y} Q ${wallBulge.control.x} ${wallBulge.control.y} ${end.x} ${end.y}`;
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
}

function depthLabelFor(placement, theme) {
  const label = poolDepthLabelFor(placement);
  if (!label) return '';
  return `<text class="topo-pool-depth" x="${label.x}" y="${label.y}" font-size="0.85" text-anchor="middle" fill="${theme.text}"${theme.classic ? ' font-style="italic"' : ''} stroke="${theme.background}" stroke-width="${theme.eauFroide ? 0.3 : 0.2}" paint-order="stroke">${esc(label.text)}</text>`;
}

function arrowFor(placement, theme) {
  const { start, end, perp, angle } = placement;
  const offset = 1.0;
  if (angle > 90) {
    const x = start.x + offset;
    return `<line x1="${x}" y1="${start.y}" x2="${x}" y2="${end.y}" stroke="${theme.accent}" stroke-width="0.14" marker-end="url(#topo-arrow)"/>`;
  }
  const ax = start.x + perp.x * offset;
  const ay = start.y + perp.y * offset;
  const bx = end.x + perp.x * offset;
  const by = end.y + perp.y * offset;
  return `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${theme.accent}" stroke-width="0.14" marker-end="url(#topo-arrow)"/>`;
}

function shorteningMarkerFor(placement, theme) {
  if (!placement.shortened) return '';
  const { start, end, segment, wallBulge } = placement;
  let center;
  if (wallBulge) {
    center = {
      x: (start.x + 2 * wallBulge.control.x + end.x) / 4,
      y: (start.y + 2 * wallBulge.control.y + end.y) / 4,
    };
  } else if (WATER_SEGMENT_TYPES.has(segment.type)) {
    const control = {
      x: (start.x + end.x) / 2,
      y: Math.max(start.y, end.y) + poolDrawingDepthOf(segment),
    };
    center = {
      x: (start.x + 2 * control.x + end.x) / 4,
      y: (start.y + 2 * control.y + end.y) / 4,
    };
  } else {
    center = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };
  }

  const scale = Math.min(1, placement.drawnLength / 0.9);
  const gap = 0.18 * scale;
  const slashHalf = 0.32 * scale;
  const paths = [-gap, gap]
    // Feste SVG-Richtung; senkrechter Abstand hält auch parallele Segmente lesbar.
    .map((offset) =>
      `M ${offset - slashHalf} ${offset + slashHalf} L ${offset + slashHalf} ${offset - slashHalf}`)
    .join(' ');
  return `<g class="topo-shortening-break" data-seg="${placement.index}" data-center-x="${center.x}" data-center-y="${center.y}" transform="translate(${center.x},${center.y})"><path d="${paths}" fill="none" stroke="${theme.background}" stroke-width="0.34" stroke-linecap="round"/><path d="${paths}" fill="none" stroke="${theme.accent}" stroke-width="0.16" stroke-linecap="round"/></g>`;
}

function labelBoxFor(placement, theme) {
  const info = segmentLabelText(placement.segment);
  if (!info) return '';
  const { start, end, perp } = placement;
  const midX = (start.x + end.x) / 2 - perp.x * 2.2;
  const midY = (start.y + end.y) / 2 - perp.y * 2.2;
  const text = `${info.base}${info.sub}${info.value}`;
  const width = 0.62 * text.length + 0.7;
  if (theme.eauFroide) {
    return `
    <g transform="translate(${midX},${midY})">
      <text x="0" y="0.45" font-size="1.25" font-weight="700" text-anchor="middle" fill="${theme.text}" stroke="${theme.background}" stroke-width="0.35" paint-order="stroke">${esc(info.base)}<tspan font-size="0.8" dy="0.25">${esc(info.sub)}</tspan><tspan dy="-0.25"> ${esc(info.value)}</tspan></text>
    </g>`;
  }
  return `
    <g transform="translate(${midX},${midY})">
      <rect x="${-width / 2}" y="-0.85" width="${width}" height="1.7"
            rx="${theme.classic ? 0 : 0.18}" fill="${theme.background}"
            stroke="${theme.terrainLine}" stroke-width="${theme.classic ? 0.07 : 0.09}"/>
      <text x="0" y="0.45" font-size="1.15" text-anchor="middle" fill="${theme.text}">${esc(info.base)}<tspan font-size="0.75" dy="0.25">${esc(info.sub)}</tspan><tspan dy="-0.25">${esc(info.value)}</tspan></text>
    </g>`;
}

// Verkürzte Gehstrecken haben kein eigenes Längen-Label (anders als R/J/S…),
// daher zeigt die Klammer die echte Länge statt der Gehzeit.
function lengthBracketFor(placement, theme) {
  const segment = placement.segment;
  if (!placement.compressed || segment.type !== 'WALK') return '';
  const { start, end } = placement;
  const y = (start.y + end.y) / 2 - 1.6;
  const x1 = start.x + (end.x - start.x) * 0.3;
  const x2 = start.x + (end.x - start.x) * 0.7;
  const text = `|← ${formatNumber(segment.length_in_meters)} m →|`;
  const width = 0.55 * text.length + 0.6;
  return `
    <g class="topo-length-bracket" data-seg="${placement.index}" transform="translate(${(x1 + x2) / 2},${y})">
      <rect x="${-width / 2}" y="-0.8" width="${width}" height="1.6" rx="0.15"
            fill="${theme.background}" stroke="${theme.terrainLine}" stroke-width="0.09"/>
      <text x="0" y="0.35" font-size="0.9" text-anchor="middle" fill="${theme.text}">${esc(text)}</text>
    </g>`;
}

function renderElement(placed, theme, options = {}) {
  const { element, point, endPoint } = placed;
  const symbol = symbolFor(element.type);
  const size = element.size > 0 ? element.size : 1;
  const selected =
    options.selection &&
    options.selection.kind === 'element' &&
    options.selection.segmentIndex === placed.segmentIndex &&
    options.selection.elementIndex === placed.elementIndex;
  const hooks = options.interactive
    ? ` class="topo-element${selected ? ' is-selected' : ''}" data-seg="${placed.segmentIndex}" data-el="${placed.elementIndex}"`
    : '';

  if (symbol && symbol.range) {
    if (!endPoint) return '';
    const rangeOptions = { size, element, color: theme.accent };
    const drawing = theme.eauFroide
      ? renderEauFroideRange(element.type, point, endPoint, rangeOptions)
      : symbol.render(point, endPoint, rangeOptions);
    const styledDrawing = theme.classic
      ? classicSymbolStyle(drawing)
      : theme.sketch
      ? sketchSymbolStyle(drawing)
      : drawing;
    return `<g${hooks} fill="${theme.text}" stroke-linejoin="round">${styledDrawing}</g>`;
  }
  let body = theme.eauFroide
    ? renderEauFroideSymbol(element.type, element)
    : symbol
    ? symbol.render(element, 'color')
    : renderUnknownSymbol(element);
  if (theme.classic) {
    body = classicSymbolStyle(body);
    if (element.type === 'CUSTOM_TEXT') {
      body = body.replace(/<text\b/g, '<text font-style="italic"');
    }
  } else if (theme.sketch) {
    body = sketchSymbolStyle(body);
  }
  const halo = selected
    ? `<circle cx="0" cy="0" r="${1.6}" fill="none" stroke="#1668dc" stroke-width="0.22"/>`
    : '';
  return `<g${hooks} transform="translate(${point.x},${point.y}) scale(${size})" fill="${theme.text}">${halo}${body}</g>`;
}

function segmentHitArea(placement, options) {
  if (!options.interactive) return '';
  const selected =
    options.selection &&
    options.selection.kind === 'segment' &&
    options.selection.segmentIndex === placement.index;
  return `<line class="topo-segment-hit${selected ? ' is-selected' : ''}" data-seg="${placement.index}"
    x1="${placement.start.x}" y1="${placement.start.y}" x2="${placement.end.x}" y2="${placement.end.y}"
    stroke="${selected ? '#1668dc' : 'transparent'}" stroke-opacity="${selected ? 0.55 : 1}" stroke-width="1.6" stroke-linecap="round"/>`;
}

function romanNumeral(number) {
  const values = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let result = '';
  for (const [value, symbol] of values) {
    while (number >= value) {
      result += symbol;
      number -= value;
    }
  }
  return result;
}

function continuationMarkers(row, theme) {
  const markers = [];
  const first = row.placements[0];
  const last = row.placements[row.placements.length - 1];
  if (!first || !last) return '';
  if (row.continuesBefore) {
    markers.push(
      `<text x="${first.start.x - 2.2}" y="${first.start.y + 0.4}" font-size="1.1" text-anchor="middle" fill="${theme.text}">(${romanNumeral(row.index)})</text>`,
    );
  }
  if (row.continuesAfter) {
    markers.push(
      `<text x="${last.end.x + 2.2}" y="${last.end.y + 0.4}" font-size="1.1" text-anchor="middle" fill="${theme.text}">(${romanNumeral(row.index + 1)})</text>`,
    );
  }
  return markers.join('');
}

function metaLineSvg(line, right, y, theme) {
  return `<text class="topo-legend-meta" data-meta="${line.key}" x="${right}" y="${y}" font-size="1.05" text-anchor="end" fill="${theme.text}"><tspan font-weight="700">${esc(line.label)}:</tspan> ${esc(line.value)}</text>`;
}

/**
 * Gibt die Legenden-Hitbox im selben Stil-Inset wie der Renderer zurück.
 * Die UI verwendet sie, um den Ziehbereich der Legende zu treffen.
 */
export function legendRectFor(topo, layout, bounds, themeKey, lang = DEFAULT_LANGUAGE) {
  const theme = Object.hasOwn(THEMES, themeKey) ? THEMES[themeKey] : THEMES.color;
  return legendPanelRectFor(topo, layout, bounds, lang, theme.eauFroide ? LEGEND_TEXT_INSET_METERS : 0);
}

function renderLegend(topo, layout, theme, bounds, lang = DEFAULT_LANGUAGE) {
  const entries = legendEntriesFor(topo);
  const headLines = legendHeadLinesFor(topo, lang);
  const footerLines = legendFooterLinesFor(topo, lang);
  // Im Stil "Standard" hat der Kasten einen sichtbaren Rahmen: Die Textzeilen
  // halten dort rund zwei Leerzeichen Abstand zum rechten Rand. Der Kasten
  // wächst dafür nach links, damit lange Zeilen nicht links anstossen.
  const textInset = theme.eauFroide ? LEGEND_TEXT_INSET_METERS : 0;
  const rect = legendPanelRectFor(topo, layout, bounds, lang, textInset);
  const right = rect.right;
  const top = rect.anchorTop;
  const titleWidth = legendTitleWidthMeters(topo);
  const textRight = right - textInset;

  const frame = theme.eauFroide
    ? `<rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" fill="${theme.background}" stroke="${theme.terrainLine}" stroke-width="0.1"/>`
    : `<rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" fill="${theme.background}" opacity="0.92"/>`;
  const titleShadow = theme.eauFroide
    ? `<rect class="topo-title-shadow" x="${right - titleWidth + 0.6}" y="${top + 0.6}" width="${titleWidth}" height="3.2" fill="${theme.shadow}"/>`
    : '';
  const parts = [
    frame,
    `<g>
      ${titleShadow}
      <rect x="${right - titleWidth}" y="${top}" width="${titleWidth}" height="3.2" rx="${theme.eauFroide ? 0 : 0.3}"
            fill="${theme.background}" stroke="${theme.terrainLine}" stroke-width="${theme.eauFroide ? 0.16 : 0.12}"/>
      <text x="${right - titleWidth / 2}" y="${top + 2.3}" font-size="1.9" font-weight="700"
            text-anchor="middle" fill="${theme.text}">${esc(topo.canyon_name)}</text>
    </g>`,
  ];
  let y = top + 5;
  // Die Dauer steht direkt unter dem Titel – nur wenn gefüllt, sonst bliebe
  // eine leere Beschriftungszeile stehen.
  for (const line of headLines) {
    parts.push(metaLineSvg(line, textRight, y, theme));
    y += LEGEND_LINE_HEIGHT;
  }
  if (headLines.length) y += 0.4;
  parts.push(
    `<text x="${textRight}" y="${y}" font-size="1.1" font-weight="700"${theme.eauFroide ? ' font-style="italic"' : ''} text-anchor="end" fill="${theme.text}">${esc(translateLegendLabel('title', lang))}</text>`,
  );
  y += 1.6;
  for (const entry of entries) {
    const match = /^([A-Z])_([a-z]) (.*)$/.exec(entry);
    const formatted = match
      ? theme.eauFroide
        ? `<tspan font-weight="700">${match[1]}<tspan font-size="0.75" dy="0.25">${esc(match[2])}</tspan></tspan><tspan dy="-0.25"> ${esc(match[3])}</tspan>`
        : `${match[1]}<tspan font-size="0.75" dy="0.25">${esc(match[2])}</tspan><tspan dy="-0.25"> ${esc(match[3])}</tspan>`
      : esc(entry);
    parts.push(
      `<text x="${textRight}" y="${y}" font-size="1.05" text-anchor="end" fill="${theme.text}">${formatted}</text>`,
    );
    y += LEGEND_LINE_HEIGHT;
  }
  // Author und Datum schliessen die Legende ab – nach dem letzten Eintrag.
  if (footerLines.length) y += LEGEND_LINE_HEIGHT - 0.4;
  for (const line of footerLines) {
    parts.push(metaLineSvg(line, textRight, y, theme));
    y += LEGEND_LINE_HEIGHT;
  }
  return parts.join('');
}

/**
 * Rendert das normalisierte Modell und sein Layout zu einem eigenständigen SVG.
 *
 * Optionen steuern Thema, Sprache, Zielformat, Meter-zu-Pixel-Skalierung und
 * optionale vorab berechnete Bounds. Die Hit-Areas tragen Datenattribute, damit
 * die App Segment-/Elementinteraktionen im SVG auf Modellindizes abbilden kann.
 * Die `viewBox` bleibt in Metern; Pixelmasse kommen bei festen Papierformaten
 * aus dem Preset und sonst aus `pxPerMeter`. Eine unbekannte Stil-ID fällt auf
 * Farbe zurück. `bounds` überschreibt die übliche Berechnung und hält während
 * eines Drags den sichtbaren Ausschnitt stabil.
 *
 * @param {object} topo normalisiertes Topo
 * @param {object} layout Ergebnis aus `layoutTopo`
 * @param {object} [options] `{theme, language, pxPerMeter, paper, bounds,
 *   interactive, selection}`; `interactive` aktiviert Trefferflächen
 * @returns {string} serialisierbares SVG-Markup
 */
export function renderTopoSvg(topo, layout, options = {}) {
  const theme = Object.hasOwn(THEMES, options.theme) ? THEMES[options.theme] : THEMES.color;
  const lang = options.language || DEFAULT_LANGUAGE;

  // Aussenmasse aus dem Layout, danach auf das Seitenverhältnis des Formats
  // gedehnt. Ohne das würde der Inhalt auf A4 verzerrt.
  const bounds = options.bounds || fitBoundsToPaper(
    contentBoundsFor(topo, layout, lang),
    options.paper,
  );
  const widthMeters = bounds.maxX - bounds.minX;
  const heightMeters = bounds.maxY - bounds.minY;

  const paper = paperPreset(options.paper);
  const pxPerMeter = options.pxPerMeter || 16;
  const pixelWidth = paper.width || widthMeters * pxPerMeter;
  const pixelHeight = paper.height || heightMeters * pxPerMeter;

  const rowsSvg = layout.rows
    .map((row) => {
      if (!row.placements.length) return '';
      const ground = groundPathFor(row);
      const first = row.placements[0];
      const last = row.placements[row.placements.length - 1];
      const bottom = row.bottom + TERRAIN_DEPTH_METERS;
      // Zeilen füllen die ganze Blattbreite, Spalten (Kaskadiert) nur ihren
      // eigenen Kasten – sonst läge das Gelände über der Nachbarspalte.
      const left = row.left ?? bounds.minX;
      const right = row.right ?? bounds.maxX;
      const terrain = `${ground} L ${right} ${last.end.y} L ${right} ${bottom} L ${left} ${bottom} L ${left} ${first.start.y} Z`;

      const water = row.placements
        .filter((placement) => WATER_SEGMENT_TYPES.has(placement.segment.type))
        .map(
          (placement) =>
            `<path d="${waterShapeFor(placement)}" fill="${theme.water}" stroke="${theme.terrainLine}" stroke-width="${theme.eauFroide ? 0.07 : 0.1}"/>`,
        )
        .join('');

      const cascades = theme.eauFroide
        ? row.placements
            .filter((placement) => CASCADE_SEGMENT_TYPES.has(placement.segment.type))
            .map(
              (placement) =>
                `<path class="topo-cascade" d="${cascadePathFor(placement)}" fill="none" stroke="${theme.cascade}" stroke-width="0.3" stroke-linecap="round"/>`,
            )
            .join('')
        : '';

      const arrows = row.placements
        .filter((placement) => placement.segment.type.startsWith('RAPPEL'))
        .map((placement) => arrowFor(placement, theme))
        .join('');

      const shorteningMarkers = row.placements
        .map((placement) => shorteningMarkerFor(placement, theme))
        .join('');

      const labels = row.placements
        .map(
          (placement) => labelBoxFor(placement, theme) + depthLabelFor(placement, theme),
        )
        .join('');

      const brackets = row.placements
        .map((placement) => lengthBracketFor(placement, theme))
        .join('');

      const elements = row.placements
        .flatMap((placement) => placement.elements)
        .map((placed) => renderElement(placed, theme, options))
        .join('');

      const hits = row.placements
        .map((placement) => segmentHitArea(placement, options))
        .join('');

      return `<g class="topo-row" data-row="${row.index}">
        <path d="${terrain}" fill="url(#topo-terrain-${row.index})" stroke="none"/>
        ${theme.eauFroide ? `<path d="${terrain}" fill="url(#topo-marble)" stroke="none"/>` : ''}${theme.sketch ? `<path d="${terrain}" fill="url(#topo-sketch-hatch)" stroke="none"/>` : ''}
        ${
          theme.sketch
            ? sketchStrokesFor(wobbleWallPath(ground), theme.terrainLine)
            : `<path d="${ground}" fill="none" stroke="${theme.terrainLine}" stroke-width="0.14" stroke-linejoin="round"/>`
        }
        ${cascades}
        ${water}
        ${arrows}
        ${hits}
        ${elements}
        ${labels}
        ${brackets}
        ${shorteningMarkers}${continuationMarkers(row, theme)}
      </g>`;
    })
    .join('');

  const gradientDefs = layout.rows
    .filter((row) => row.placements.length)
    .map(
      (row) => `<linearGradient id="topo-terrain-${row.index}" gradientUnits="userSpaceOnUse"
      x1="0" y1="${row.top}" x2="0" y2="${row.bottom + TERRAIN_DEPTH_METERS}">
      <stop offset="0%" stop-color="${theme.terrainTop}"/>
      <stop offset="65%" stop-color="${theme.terrainBottom}"/>
      <stop offset="100%" stop-color="${theme.background}"/>
    </linearGradient>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" version="1.1"
  viewBox="${bounds.minX} ${bounds.minY} ${widthMeters} ${heightMeters}"
  width="${Math.round(pixelWidth)}" height="${Math.round(pixelHeight)}"
  font-family="Helvetica, Arial, sans-serif">
  <defs>
    ${gradientDefs}
    ${theme.eauFroide ? MARBLE_PATTERN : ''}${theme.sketch ? SKETCH_HATCH_PATTERN : ''}
    <marker id="topo-arrow" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${theme.accent}"/>
    </marker>
  </defs>
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${widthMeters}" height="${heightMeters}" fill="${theme.background}"/>
  ${rowsSvg}
  ${renderLegend(topo, layout, theme, bounds, lang)}
</svg>`;
}
