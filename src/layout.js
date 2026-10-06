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
 *  - `distance_of_single_line` ist die Zeilenbreite für das freie Bildschirm-
 *    format. Bei A4 ergibt sich die nutzbare Breite aus dem Format, siehe
 *    `planTrackLimit`.
 *
 * Kaskadiert (Spalten): dieselbe Aufteilung, aber nach Höhe statt Breite.
 *  Die Segmentfolge läuft in einer Spalte von oben nach unten (echte
 *  Geometrie), die nächste Spalte beginnt wieder oben rechts daneben. Als
 *  Zielhöhe dient beim Bildschirmformat ebenfalls `distance_of_single_line`
 *  (generisches Aufteilungsmass je Spur), bei A4 wird sie wie die Zeilenbreite
 *  gegen das Seitenverhältnis optimiert, siehe `planTrackLimit`.
 *
 * Zeilen- bzw. Spaltenumbruch (Serpentine und Kaskadiert):
 *  - `force_cut_row_after_this_segment` ist eine harte Trennstelle NACH dem
 *    Segment – auch wenn die Zeile/Spalte noch Platz hätte.
 *  - `do_not_cut_row_after_this_segment` hält das Segment mit dem folgenden
 *    zusammen – auch wenn die Zielbreite/-höhe dabei überschritten wird. Das
 *    Blatt wächst dann mit, abgeschnitten wird nichts.
 *  - Konflikt (beide Flags am selben Übergang): Erzwingen gewinnt. Es ist die
 *    explizitere Ansage und immer erfüllbar. Die UI schliesst die Kombination
 *    zusätzlich aus; alte Dateien bleiben dadurch trotzdem lesbar.
 */
import { WATER_SEGMENT_TYPES } from './model.js';
import {
  contentBoundsFor,
  paperAspectRatio,
  poolDepthLabelFor,
  poolDrawingDepthOf,
  wallBulgeFor,
} from './sheet.js';

const ROW_GAP_METERS = 14;
const ROW_PADDING_METERS = 4;
// Kaskadiert: seitlicher Innenrand je Spalte (Platz für Beschriftungskästen
// links senkrechter Abseiler und die Fortsetzungsmarken) und konstanter
// Abstand zwischen den Spaltenkästen.
const COLUMN_PADDING_METERS = 5;
const COLUMN_GAP_METERS = 6;

export const LAYOUT_MODES = ['serpentine', 'cascaded', 'linear'];

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

/* ------------------------------------------------------- Zeilenaufteilung */

function segmentMetricsFor(topo, maximumWalkLength) {
  return topo.segments.map((segment) => {
    const drawn = drawnLengthOf(segment, maximumWalkLength);
    const angle = segment.angle_in_degrees;
    const rad = toRadians(angle);
    const dir = { x: Math.cos(rad), y: Math.sin(rad) };
    // Eine ausweichende Wand braucht zusätzlich Platz in der Breite.
    const wallSpan =
      Math.abs(dir.y) * (segment.wall_distance_in_meters || 0);
    return {
      segment,
      drawn,
      angle,
      dir,
      perp: { x: dir.y, y: -dir.x },
      // Überhänge laufen nach links; für die Zeilenbreite zählt der Betrag.
      horizontalSpan: Math.abs(dir.x * drawn) + wallSpan,
      // Kaskadiert: benötigte Höhe. Eine Wand weicht bei flachen Stücken nach
      // oben bzw. unten aus und kostet dann Höhe statt Breite.
      verticalSpan:
        Math.abs(dir.y * drawn) +
        Math.abs(dir.x) * (segment.wall_distance_in_meters || 0) +
        (segment.type === 'POOL' && segment.depth_in_meters != null
          ? poolDrawingDepthOf(segment) / 2 + 1.4
          : 0),
    };
  });
}

/**
 * Harte Umbruchregeln je Übergang i -> i+1.
 * Der Index bezeichnet das Segment VOR dem Übergang.
 */
export function rowBreakRulesFor(segments) {
  const forced = [];
  const keepTogether = [];
  const list = segments || [];
  for (let index = 0; index < Math.max(list.length - 1, 0); index += 1) {
    const segment = list[index];
    const force = !!segment.force_cut_row_after_this_segment;
    const prevent = !!segment.do_not_cut_row_after_this_segment;
    forced[index] = force;
    // Konfliktregel: Erzwingen schlägt Verhindern.
    keepTogether[index] = prevent && !force;
  }
  return { forced, keepTogether };
}

/** Segmente, die zwingend in derselben Zeile bleiben, zu Blöcken bündeln. */
function chunksOf(metrics, keepTogether, spanKey = 'horizontalSpan') {
  const chunks = [];
  let current = null;
  metrics.forEach((metric, index) => {
    if (!current) current = { from: index, to: index, span: 0 };
    current.span += metric[spanKey];
    current.to = index;
    if (!keepTogether[index]) {
      chunks.push(current);
      current = null;
    }
  });
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Zeilen eines Abschnitts optimal füllen (Knuth-artige DP): minimiert die
 * Summe der quadrierten Restbreiten, die letzte Zeile eines Abschnitts zählt
 * nicht mit. Das nutzt das Format deutlich besser aus als gieriges Füllen und
 * hängt – anders als eine feste Segmentzahl – allein an der Zielbreite.
 */
function solveBlock(prefix, from, to, limit) {
  const best = new Array(to + 1).fill(Number.POSITIVE_INFINITY);
  const next = new Array(to + 1).fill(-1);
  best[to] = 0;
  for (let i = to - 1; i >= from; i -= 1) {
    for (let j = i + 1; j <= to; j += 1) {
      const width = prefix[j] - prefix[i];
      const overfull = width > limit;
      // Mehrere Blöcke passen nicht mehr; ein einzelner zu breiter Block muss
      // wegen Keep-Together so stehen bleiben.
      if (overfull && j > i + 1) break;
      // Auch die letzte Zeile wird bewertet. Sonst bliebe ein gieriges
      // 3/3/1 stehen, wo 3/2/2 das Blatt gleichmässig füllt.
      const penalty = overfull ? 0 : (limit - width) ** 2;
      const total = penalty + best[j];
      if (total < best[i]) {
        best[i] = total;
        next[i] = j;
      }
    }
  }
  const rows = [];
  let cursor = from;
  while (cursor < to) {
    const stop = next[cursor];
    rows.push({ from: cursor, to: stop });
    cursor = stop;
  }
  return rows;
}

/** Chunk-Folge in Zeilen aufteilen, harte Trennstellen respektiert. */
function partitionChunks(chunks, forced, limit) {
  const prefix = [0];
  chunks.forEach((chunk, index) => {
    prefix.push(prefix[index] + chunk.span);
  });

  const rows = [];
  let blockStart = 0;
  for (let index = 1; index <= chunks.length; index += 1) {
    const isBlockEnd =
      index === chunks.length || forced[chunks[index - 1].to] === true;
    if (!isBlockEnd) continue;
    rows.push(...solveBlock(prefix, blockStart, index, limit));
    blockStart = index;
  }
  return rows;
}

function assignmentFor(chunks, rows, segmentCount) {
  const assignment = new Array(segmentCount).fill(0);
  rows.forEach((row, rowIndex) => {
    for (let index = row.from; index < row.to; index += 1) {
      const chunk = chunks[index];
      for (let seg = chunk.from; seg <= chunk.to; seg += 1) {
        assignment[seg] = rowIndex;
      }
    }
  });
  return assignment;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Zielbreite einer Zeile. Beim freien Bildschirmformat bleibt es bei
 * `distance_of_single_line`. Bei A4 wird die Breite gesucht, deren fertiges
 * Blatt dem Seitenverhältnis des Formats am nächsten kommt – A4 hoch wird
 * dadurch schmaler (mehr Zeilen), A4 quer breiter (weniger Zeilen).
 *
 * Generisch für beide Spurarten (Zeilenbreite bzw. Spaltenhöhe). Kandidaten
 * sind die Basisgrösse und die ausgeglichenen Teilungen der Gesamtausdehnung
 * in 1..n Spuren; gewählt wird der Kandidat, dessen fertiges Blatt (inkl. Rand
 * und Legende) dem Seitenverhältnis am nächsten kommt. Bei Spalten heisst das:
 * A4 hoch bekommt höhere, dafür weniger Spalten als A4 quer.
 */
function planTrackLimit(topo, chunks, baseWidth, paperKey, buildFor) {
  const aspect = paperAspectRatio(paperKey);
  if (!aspect || !chunks.length) return baseWidth;

  const spans = chunks.map((chunk) => chunk.span);
  const total = spans.reduce((sum, span) => sum + span, 0);
  const widest = Math.max(...spans, 1);

  const candidates = new Set([round(baseWidth)]);
  for (let rows = 1; rows <= chunks.length; rows += 1) {
    candidates.add(round(Math.max(total / rows, widest)));
  }

  let best = null;
  for (const limit of [...candidates].sort((a, b) => a - b)) {
    if (!(limit > 0)) continue;
    const layout = buildFor(limit);
    const bounds = contentBoundsFor(topo, layout);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (!(width > 0) || !(height > 0)) continue;
    // Logarithmisch, damit "doppelt so breit" und "halb so breit" gleich
    // schlecht bewertet werden.
    const score = Math.abs(Math.log(width / height / aspect));
    if (!best || score < best.score - 1e-9) best = { score, limit };
  }
  return best ? best.limit : baseWidth;
}

/* -------------------------------------------------------------- Platzieren */

function placeTracks(metrics, assignment) {
  const rows = [];
  const placements = [];

  const rowCount = metrics.length ? Math.max(...assignment) + 1 : 1;
  for (let index = 0; index < rowCount; index += 1) {
    rows.push({
      index,
      placements: [],
      minY: 0,
      maxY: 0,
      minX: 0,
      maxX: 0,
      continuesBefore: index > 0,
      continuesAfter: index < rowCount - 1,
    });
  }

  let cursor = { x: 0, y: 0 };
  let previousRow = 0;

  metrics.forEach((metric, index) => {
    const rowIndex = assignment[index];
    if (rowIndex !== previousRow) {
      cursor = { x: 0, y: 0 };
      previousRow = rowIndex;
    }

    const { segment, dir, perp, drawn, angle } = metric;
    const start = { ...cursor };
    const end = { x: start.x + dir.x * drawn, y: start.y + dir.y * drawn };

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
    placement.wallBulge = wallBulgeFor(placement);

    placements.push(placement);
    const row = rows[rowIndex];
    row.placements.push(placement);

    const trackedPoints = [start, end, ...placement.elements.map((e) => e.point)];
    const depthLabel = poolDepthLabelFor(placement);
    if (depthLabel) {
      trackedPoints.push(
        { x: depthLabel.x - depthLabel.halfWidth, y: depthLabel.y + 0.3 },
        { x: depthLabel.x + depthLabel.halfWidth, y: depthLabel.y + 0.3 },
      );
    }
    if (placement.wallBulge) trackedPoints.push(placement.wallBulge.apex);
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
  });

  return { rows, placements };
}

function buildLayout(metrics, assignment, rowWidthLimit, mode, frame) {
  const { rows, placements } = placeTracks(metrics, assignment);

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
      if (placement.wallBulge) {
        placement.wallBulge.control.y += row.offsetY;
        placement.wallBulge.apex.y += row.offsetY;
      }
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
  // Eine Zeile darf breiter als die Zielbreite werden (Keep-Together). Das
  // Blatt wächst dann mit, statt den Überhang abzuschneiden.
  const plainWidth = Math.max(
    maxX - minX,
    Number.isFinite(rowWidthLimit) ? rowWidthLimit : maxX,
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
    rowAssignment: assignment,
    maximumWalkLength: 0,
    mode,
  };
}

function shiftPlacement(placement, dx, dy) {
  const points = [placement.start, placement.end];
  if (placement.wallBulge) {
    points.push(placement.wallBulge.control, placement.wallBulge.apex);
  }
  for (const element of placement.elements) {
    points.push(element.point);
    if (element.endPoint) points.push(element.endPoint);
  }
  for (const point of points) {
    point.x += dx;
    point.y += dy;
  }
}

/**
 * Kaskadiert: Spalten nebeneinander, jede oben bündig. Innerhalb einer Spalte
 * bleibt die echte Geometrie stehen; die Spaltenbreite ergibt sich aus den
 * tatsächlichen Ausdehnungen (Elemente, Streckenenden, Wandausbeulung), der
 * Abstand zwischen den Spaltenkästen ist konstant. Die Spalten behalten aus
 * Kompatibilitätsgründen den Namen `rows` (generische Spuren).
 */
function buildColumnLayout(metrics, assignment, columnHeightLimit, mode, frame) {
  const { rows: columns, placements } = placeTracks(metrics, assignment);

  let boxRight = null;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let plainHeight = 1;
  for (const column of columns) {
    const frozen = frame?.rows?.[column.index];
    column.offsetY =
      frozen?.offsetY == null ? ROW_PADDING_METERS - column.minY : frozen.offsetY;
    column.offsetX =
      frozen?.offsetX == null
        ? boxRight == null
          ? 0
          : boxRight + COLUMN_GAP_METERS + COLUMN_PADDING_METERS - column.minX
        : frozen.offsetX;

    for (const placement of column.placements) {
      shiftPlacement(placement, column.offsetX, column.offsetY);
    }

    column.top = column.offsetY + column.minY;
    column.bottom = column.offsetY + column.maxY;
    column.contentLeft = column.offsetX + column.minX;
    column.contentRight = column.offsetX + column.maxX;
    // Kastenkanten der Spalte: dort endet die Geländefüllung.
    column.left = column.contentLeft - COLUMN_PADDING_METERS;
    column.right = column.contentRight + COLUMN_PADDING_METERS;
    column.height = column.maxY - column.minY + 2 * ROW_PADDING_METERS;
    boxRight = column.right;

    minX = Math.min(minX, column.contentLeft);
    maxX = Math.max(maxX, column.contentRight);
    plainHeight = Math.max(plainHeight, column.bottom + ROW_PADDING_METERS);
  }
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(maxX)) maxX = 0;

  // Wie bei der Serpentine: Während des Ziehens wächst das Blatt, schrumpft
  // aber nie – sonst würde es unter dem Zeiger neu skaliert.
  if (frame) {
    minX = frame.minX;
    maxX = Math.max(frame.maxX, maxX);
  }
  const plainWidth = Math.max(maxX - minX, 1);
  const height = frame ? Math.max(frame.height, plainHeight) : plainHeight;
  const width = frame ? Math.max(frame.width, plainWidth) : plainWidth;

  return {
    rows: columns,
    columns,
    placements,
    minX,
    maxX,
    width,
    height,
    // Spalten haben keine Zielbreite; die Blattbreite folgt dem Inhalt.
    rowWidthLimit: Number.POSITIVE_INFINITY,
    columnHeightLimit,
    rowAssignment: assignment,
    columnAssignment: assignment,
    orientation: 'columns',
    maximumWalkLength: 0,
    mode,
  };
}

/**
 * @param {object} topo normalisiertes Topo
 * @param {object} [options]
 *   `{ layout: 'serpentine' | 'cascaded' | 'linear', paper, frame }`
 *
 * `paper` ist der Formatschlüssel aus `sheet.js` und bestimmt in der Serpentine
 * die nutzbare Zeilenbreite, bei Kaskadiert die Spaltenhöhe.
 *
 * `frame` ist ein früheres Layout, dessen Zeilenaufteilung, Zeilenversatz und
 * Aussenmasse übernommen werden. Nötig beim Ziehen eines Symbols:
 * Elementpositionen gehen sonst in die Zeilengrenzen ein, das Bild würde bei
 * jedem Mausschritt neu skaliert und verschöbe sich unter dem Zeiger weg.
 */
export function layoutTopo(topo, options = {}) {
  const mode = options.layout || 'serpentine';
  const frame = options.frame || null;
  const maxWalk = topo.maximum_walk_length > 0 ? topo.maximum_walk_length : 30;
  const baseWidth =
    topo.distance_of_single_line > 0 ? topo.distance_of_single_line : 60;

  const metrics = segmentMetricsFor(topo, maxWalk);

  let rowWidthLimit;
  let assignment;

  if (mode === 'cascaded') {
    let columnHeightLimit;
    if (
      frame?.rowAssignment &&
      frame.rowAssignment.length === metrics.length &&
      frame.mode === mode
    ) {
      // Während des Ziehens bleiben Spaltenzuordnung und -lage stehen.
      columnHeightLimit = frame.columnHeightLimit;
      assignment = frame.rowAssignment;
    } else {
      const { forced, keepTogether } = rowBreakRulesFor(topo.segments);
      const chunks = chunksOf(metrics, keepTogether, 'verticalSpan');
      const partitionFor = (limit) =>
        assignmentFor(
          chunks,
          partitionChunks(chunks, forced, limit),
          metrics.length,
        );
      columnHeightLimit = planTrackLimit(
        topo,
        chunks,
        baseWidth,
        options.paper,
        (limit) =>
          buildColumnLayout(metrics, partitionFor(limit), limit, mode, null),
      );
      assignment = partitionFor(columnHeightLimit);
    }
    const layout = buildColumnLayout(
      metrics,
      assignment,
      columnHeightLimit,
      mode,
      frame,
    );
    layout.maximumWalkLength = maxWalk;
    return layout;
  }

  if (mode === 'linear') {
    rowWidthLimit = Number.POSITIVE_INFINITY;
    assignment = metrics.map(() => 0);
  } else if (
    frame?.rowAssignment &&
    frame.rowAssignment.length === metrics.length &&
    frame.mode === mode
  ) {
    // Während des Ziehens darf sich die Zeilenaufteilung nicht ändern.
    rowWidthLimit = frame.rowWidthLimit;
    assignment = frame.rowAssignment;
  } else {
    const { forced, keepTogether } = rowBreakRulesFor(topo.segments);
    const chunks = chunksOf(metrics, keepTogether);
    const partitionFor = (limit) =>
      assignmentFor(
        chunks,
        partitionChunks(chunks, forced, limit),
        metrics.length,
      );
    rowWidthLimit = planTrackLimit(
      topo,
      chunks,
      baseWidth,
      options.paper,
      (limit) => buildLayout(metrics, partitionFor(limit), limit, mode, null),
    );
    assignment = partitionFor(rowWidthLimit);
  }

  const layout = buildLayout(metrics, assignment, rowWidthLimit, mode, frame);
  layout.maximumWalkLength = maxWalk;
  return layout;
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
