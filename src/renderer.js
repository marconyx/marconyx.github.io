/**
 * SVG-Renderer: zeichnet ein Layout als eigenständiges SVG-Dokument.
 */
import { SEGMENT_LABELS, WATER_SEGMENT_TYPES } from './model.js';
import {
  symbolFor,
  renderUnknownSymbol,
  renderEauFroideSymbol,
  renderEauFroideRange,
  EAU_FROIDE_PALETTE,
} from './symbols.js';
import {
  PAPER_PRESETS,
  contentBoundsFor,
  fitBoundsToPaper,
  LEGEND_LINE_HEIGHT_METERS,
  legendEntriesFor,
  legendFooterLinesFor,
  legendHeadLinesFor,
  legendPanelHeightMeters,
  legendPanelWidthMeters,
  legendTitleWidthMeters,
  paperPreset,
} from './sheet.js';

export { PAPER_PRESETS };

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

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
  bw: {
    label: 'Schwarz/Weiß',
    terrainTop: '#d8d8d8',
    terrainBottom: '#ffffff',
    terrainLine: '#000000',
    water: '#555555',
    text: '#000000',
    accent: '#000000',
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

const LEGEND_LINE_HEIGHT = LEGEND_LINE_HEIGHT_METERS;

const POOL_DEPTH_METERS = 2.2;
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

function segmentLabelText(segment) {
  const config = SEGMENT_LABELS[segment.type];
  if (!config) return null;
  return {
    base: config.base,
    sub: config.sub,
    value: formatNumber(segment.length_in_meters),
  };
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function groundPathFor(row) {
  const commands = [];
  row.placements.forEach((placement, index) => {
    const { start, end } = placement;
    if (index === 0) commands.push(`M ${start.x} ${start.y}`);
    if (WATER_SEGMENT_TYPES.has(placement.segment.type)) {
      const midX = (start.x + end.x) / 2;
      const midY = Math.max(start.y, end.y) + POOL_DEPTH_METERS;
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
  const midY = Math.max(start.y, end.y) + POOL_DEPTH_METERS;
  const surfaceY = Math.min(start.y, end.y);
  return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y} L ${end.x} ${surfaceY} L ${start.x} ${surfaceY} Z`;
}

function cascadePathFor(placement) {
  const { start, end, wallBulge } = placement;
  if (wallBulge) return `M ${start.x} ${start.y} Q ${wallBulge.control.x} ${wallBulge.control.y} ${end.x} ${end.y}`;
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
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

function durationBracketFor(placement, theme) {
  const segment = placement.segment;
  if (!placement.compressed || !segment.duration_to_walk_in_min) return '';
  const { start, end } = placement;
  const y = (start.y + end.y) / 2 - 1.6;
  const x1 = start.x + (end.x - start.x) * 0.3;
  const x2 = start.x + (end.x - start.x) * 0.7;
  const text = `|← ${formatNumber(segment.duration_to_walk_in_min)}min →|`;
  const width = 0.55 * text.length + 0.6;
  return `
    <g transform="translate(${(x1 + x2) / 2},${y})">
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
    const styledDrawing = theme.classic ? classicSymbolStyle(drawing) : drawing;
    return `<g${hooks} fill="${theme.text}" stroke-linejoin="round">${styledDrawing}</g>`;
  }
  let body = theme.eauFroide
    ? renderEauFroideSymbol(element.type, element)
    : symbol
    ? symbol.render(
        element,
        options.theme === 'bw' ? 'bw' : 'color',
      )
    : renderUnknownSymbol(element);
  if (theme.classic) {
    body = classicSymbolStyle(body);
    if (element.type === 'CUSTOM_TEXT') {
      body = body.replace(/<text\b/g, '<text font-style="italic"');
    }
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

function continuationMarkers(row, layout, theme) {
  const markers = [];
  const first = row.placements[0];
  const last = row.placements[row.placements.length - 1];
  if (!first || !last) return '';
  if (row.continuesBefore) {
    markers.push(
      `<text x="${first.start.x - 2.2}" y="${first.start.y + 0.4}" font-size="1.1" text-anchor="middle" fill="${theme.text}">(l)</text>`,
    );
  }
  if (row.continuesAfter) {
    markers.push(
      `<text x="${last.end.x + 2.2}" y="${last.end.y + 0.4}" font-size="1.1" text-anchor="middle" fill="${theme.text}">(l)</text>`,
    );
  }
  return markers.join('');
}

function metaLineSvg(line, right, y, theme) {
  return `<text class="topo-legend-meta" data-meta="${line.key}" x="${right}" y="${y}" font-size="1.05" text-anchor="end" fill="${theme.text}"><tspan font-weight="700">${esc(line.label)}:</tspan> ${esc(line.value)}</text>`;
}

function renderLegend(topo, layout, theme, bounds) {
  const entries = legendEntriesFor(topo);
  const headLines = legendHeadLinesFor(topo);
  const footerLines = legendFooterLinesFor(topo);
  const right = bounds.maxX - 2;
  const top = bounds.minY + 1 + (topo.legend_offset_top || 0);
  const titleWidth = legendTitleWidthMeters(topo);
  const panelWidth = legendPanelWidthMeters(topo);
  const panelHeight = legendPanelHeightMeters(topo);

  const frame = theme.eauFroide
    ? `<rect x="${right - panelWidth}" y="${top - 0.5}" width="${panelWidth}" height="${panelHeight}" fill="${theme.background}" stroke="${theme.terrainLine}" stroke-width="0.1"/>`
    : `<rect x="${right - panelWidth}" y="${top - 0.5}" width="${panelWidth}" height="${panelHeight}" fill="${theme.background}" opacity="0.92"/>`;
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
    parts.push(metaLineSvg(line, right, y, theme));
    y += LEGEND_LINE_HEIGHT;
  }
  if (headLines.length) y += 0.4;
  parts.push(
    `<text x="${right}" y="${y}" font-size="1.1" font-weight="700"${theme.eauFroide ? ' font-style="italic"' : ''} text-anchor="end" fill="${theme.text}">Legend:</text>`,
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
      `<text x="${right}" y="${y}" font-size="1.05" text-anchor="end" fill="${theme.text}">${formatted}</text>`,
    );
    y += LEGEND_LINE_HEIGHT;
  }
  // Author und Datum schliessen die Legende ab – nach dem letzten Eintrag.
  if (footerLines.length) y += LEGEND_LINE_HEIGHT - 0.4;
  for (const line of footerLines) {
    parts.push(metaLineSvg(line, right, y, theme));
    y += LEGEND_LINE_HEIGHT;
  }
  return parts.join('');
}

/**
 * @param {object} topo normalisiertes Topo
 * @param {object} layout Ergebnis aus layoutTopo()
 * @param {object} [options] `{ theme, pxPerMeter, paper }`
 */
export function renderTopoSvg(topo, layout, options = {}) {
  const theme = THEMES[options.theme] || THEMES.color;

  // Aussenmasse aus dem Layout, danach auf das Seitenverhältnis des Formats
  // gedehnt. Ohne das würde der Inhalt auf A4 verzerrt.
  const bounds = fitBoundsToPaper(
    contentBoundsFor(topo, layout),
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

      const labels = row.placements
        .map((placement) => labelBoxFor(placement, theme))
        .join('');

      const brackets = row.placements
        .map((placement) => durationBracketFor(placement, theme))
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
        ${theme.eauFroide ? `<path d="${terrain}" fill="url(#topo-marble)" stroke="none"/>` : ''}
        <path d="${ground}" fill="none" stroke="${theme.terrainLine}" stroke-width="0.14" stroke-linejoin="round"/>
        ${cascades}
        ${water}
        ${arrows}
        ${hits}
        ${elements}
        ${labels}
        ${brackets}
        ${continuationMarkers(row, layout, theme)}
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
    ${theme.eauFroide ? MARBLE_PATTERN : ''}
    <marker id="topo-arrow" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${theme.accent}"/>
    </marker>
  </defs>
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${widthMeters}" height="${heightMeters}" fill="${theme.background}"/>
  ${rowsSvg}
  ${renderLegend(topo, layout, theme, bounds)}
</svg>`;
}
