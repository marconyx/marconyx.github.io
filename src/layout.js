/**
 * Layout-Engine: rechnet das Topo-Modell in Geometrie um.
 *
 * Koordinatensystem: Meter, x nach rechts, y nach unten (Abstieg = +y).
 *
 * Konventionen (aus Beispieldatei + Referenzrendering abgeleitet):
 *  - `angle_in_degrees` ist der Winkel der Fortbewegungsrichtung gegen die Horizontale,
 *    0 = flach nach rechts, 90 = senkrecht nach unten, >90 = überhängend.
 *  - Elementkoordinaten liegen im lokalen Segmentsystem:
 *    `horizontal_*` = Versatz entlang der Segmentrichtung,
 *    `vertical_*`   = Versatz senkrecht dazu, positiv = links der Laufrichtung
 *    (bei flachem Gelände also nach oben).
 *  - `maximum_walk_length` begrenzt die gezeichnete Länge von WALK-Segmenten;
 *    gestauchte Segmente bekommen eine Dauer-Klammer (|← 5min →|).
 *  - `distance_of_single_line` ist die maximale horizontale Breite einer Zeile.
 */
import { WATER_SEGMENT_TYPES } from './model.js';

const ROW_GAP_METERS = 14;
const ROW_PADDING_METERS = 4;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/** Gezeichnete Länge eines Segments (WALK wird gestaucht). */
export function drawnLengthOf(segment, maximumWalkLength) {
  if (segment.type === 'WALK' && segment.length_in_meters > maximumWalkLength) {
    return maximumWalkLength;
  }
  return segment.length_in_meters;
}

function localToWorld(origin, dir, perp, along, across) {
  return {
    x: origin.x + dir.x * along + perp.x * across,
    y: origin.y + dir.y * along + perp.y * across,
  };
}

function placeElements(segment, placement) {
  const { start, dir, perp, scaleAlong } = placement;
  return segment.elements.map((element, elementIndex) => {
    const along = element.horizontal_start_rel_to_segment_start * scaleAlong;
    const across = element.vertical_start_rel_to_segment_start;
    const point = localToWorld(start, dir, perp, along, across);
    let endPoint = null;
    if (
      element.horizontal_end_rel_to_segment_start != null &&
      element.vertical_end_rel_to_segment_start != null
    ) {
      endPoint = localToWorld(
        start,
        dir,
        perp,
        element.horizontal_end_rel_to_segment_start * scaleAlong,
        element.vertical_end_rel_to_segment_start,
      );
    }
    return {
      element,
      elementIndex,
      segmentIndex: placement.index,
      point,
      endPoint,
      angle: placement.angle,
    };
  });
}

/** Weltkoordinate -> lokale Segmentkoordinate (entlang / quer), inkl. Walk-Stauchung. */
export function worldToLocal(placement, point) {
  const dx = point.x - placement.start.x;
  const dy = point.y - placement.start.y;
  const along = dx * placement.dir.x + dy * placement.dir.y;
  const across = dx * placement.perp.x + dy * placement.perp.y;
  return {
    horizontal: placement.scaleAlong ? along / placement.scaleAlong : along,
    vertical: across,
  };
}

/**
 * @param {object} topo normalisiertes Topo
 * @param {object} [options] `{ layout: 'serpentine' | 'linear', frame }`
 *
 * `frame` ist ein früheres Layout, dessen Zeilenversatz und Aussenmasse
 * übernommen werden. Nötig beim Ziehen eines Symbols: Elementpositionen gehen
 * sonst in die Zeilengrenzen ein, das Bild würde bei jedem Mausschritt neu
 * skaliert und verschöbe sich unter dem Zeiger weg.
 */
export function layoutTopo(topo, options = {}) {
  const mode = options.layout || 'serpentine';
  const frame = options.frame || null;
  const maxWalk = topo.maximum_walk_length > 0 ? topo.maximum_walk_length : 30;
  const rowWidthLimit =
    mode === 'linear'
      ? Number.POSITIVE_INFINITY
      : topo.distance_of_single_line > 0
        ? topo.distance_of_single_line
        : 60;

  const rows = [];
  const placements = [];

  let rowIndex = 0;
  let cursor = { x: 0, y: 0 };
  let rowHorizontalUsed = 0;
  let pendingBreak = false;

  const startRow = () => {
    rows[rowIndex] = rows[rowIndex] || {
      index: rowIndex,
      placements: [],
      minY: 0,
      maxY: 0,
      minX: 0,
      maxX: 0,
      continuesBefore: rowIndex > 0,
      continuesAfter: false,
    };
    return rows[rowIndex];
  };

  startRow();

  topo.segments.forEach((segment, index) => {
    const drawn = drawnLengthOf(segment, maxWalk);
    const angle = segment.angle_in_degrees;
    const rad = toRadians(angle);
    const dir = { x: Math.cos(rad), y: Math.sin(rad) };
    const perp = { x: dir.y, y: -dir.x };
    const horizontalSpan = Math.abs(dir.x * drawn);

    const wouldOverflow =
      rowHorizontalUsed > 0 && rowHorizontalUsed + horizontalSpan > rowWidthLimit;

    if ((pendingBreak || wouldOverflow) && mode !== 'linear') {
      rows[rowIndex].continuesAfter = true;
      rowIndex += 1;
      cursor = { x: 0, y: 0 };
      rowHorizontalUsed = 0;
      startRow();
    }
    pendingBreak = false;

    const start = { ...cursor };
    const end = {
      x: start.x + dir.x * drawn,
      y: start.y + dir.y * drawn,
    };

    const placement = {
      index,
      segment,
      rowIndex,
      start,
      end,
      dir,
      perp,
      angle,
      drawnLength: drawn,
      realLength: segment.length_in_meters,
      compressed: drawn < segment.length_in_meters,
      scaleAlong:
        segment.length_in_meters > 0 ? drawn / segment.length_in_meters : 1,
      isWater: WATER_SEGMENT_TYPES.has(segment.type),
    };
    placement.elements = placeElements(segment, placement);

    placements.push(placement);
    const row = rows[rowIndex];
    row.placements.push(placement);

    const trackedPoints = [start, end, ...placement.elements.map((e) => e.point)];
    for (const element of placement.elements) {
      if (element.endPoint) trackedPoints.push(element.endPoint);
    }
    for (const point of trackedPoints) {
      row.minY = Math.min(row.minY, point.y);
      row.maxY = Math.max(row.maxY, point.y);
      row.minX = Math.min(row.minX, point.x);
      row.maxX = Math.max(row.maxX, point.x);
    }

    cursor = end;
    rowHorizontalUsed += horizontalSpan;

    if (segment.force_cut_row_after_this_segment) pendingBreak = true;
    if (segment.do_not_cut_row_after_this_segment) pendingBreak = false;
  });

  // Zeilen vertikal stapeln und lokale Koordinaten in Weltkoordinaten überführen.
  let offsetY = 0;
  let minX = 0;
  let maxX = 0;
  for (const row of rows) {
    row.height = row.maxY - row.minY + 2 * ROW_PADDING_METERS;
    const frozen = frame?.rows?.[row.index]?.offsetY;
    row.offsetY =
      frozen == null ? offsetY - row.minY + ROW_PADDING_METERS : frozen;
    // Oberkante des Zeilenkastens – daraus wächst der Versatz der nächsten Zeile.
    offsetY = row.offsetY + row.minY - ROW_PADDING_METERS + row.height + ROW_GAP_METERS;

    for (const placement of row.placements) {
      placement.start.y += row.offsetY;
      placement.end.y += row.offsetY;
      for (const element of placement.elements) {
        element.point.y += row.offsetY;
        if (element.endPoint) element.endPoint.y += row.offsetY;
      }
    }
    row.top = row.offsetY + row.minY;
    row.bottom = row.offsetY + row.maxY;
    minX = Math.min(minX, row.minX);
    maxX = Math.max(maxX, row.maxX);
  }

  if (frame) {
    minX = frame.minX;
    maxX = Math.max(frame.maxX, maxX);
  }
  // Das Blatt darf während des Ziehens wachsen, aber nie schrumpfen: Die
  // Skalierung ist konstant (Pixel je Meter), Wachstum nach rechts/unten
  // verschiebt also nichts, verhindert aber, dass ein weit gezogenes Symbol
  // am Blattrand abgeschnitten wird und kurz verschwindet.
  const plainHeight = Math.max(offsetY - ROW_GAP_METERS, 1);
  const plainWidth = Math.max(
    maxX - minX,
    rowWidthLimit === Infinity ? maxX : rowWidthLimit,
  );
  const height = frame ? Math.max(frame.height, plainHeight) : plainHeight;
  const width = frame ? Math.max(frame.width, plainWidth) : plainWidth;

  return {
    rows,
    placements,
    minX,
    maxX,
    width,
    height,
    rowWidthLimit,
    maximumWalkLength: maxWalk,
    mode,
  };
}

/** Zusammenhängende Gelände-Polylinie je Zeile (für Terrain-Füllung). */
export function groundPathsFor(layout) {
  return layout.rows.map((row) => {
    const points = [];
    row.placements.forEach((placement, i) => {
      if (i === 0) points.push({ ...placement.start });
      points.push({ ...placement.end });
    });
    return { row, points };
  });
}
