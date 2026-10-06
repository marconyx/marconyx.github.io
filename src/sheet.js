/**
 * Blattgeometrie: Formatvorgaben, Legendenmasse und Aussenmasse des Topos.
 *
 * Bewusst eigenes Modul, weil sowohl die Layout-Engine (`layout.js`) als auch
 * der Renderer (`renderer.js`) dieselben Masse brauchen: Die Layout-Engine muss
 * wissen, wie breit eine Zeile im gewählten Format sein darf, und dafür zählt
 * das fertige Blatt inklusive Rand und Legende – nicht nur die nackte Zeile.
 */

/** Zielformate. `width`/`height` in Pixeln (A4 bei 96 dpi), `null` = frei. */
export const PAPER_PRESETS = {
  screen: { label: 'Bildschirm (frei)', width: null, height: null },
  a4_landscape: { label: 'A4 quer', width: 1122, height: 793 },
  a4_portrait: { label: 'A4 hoch', width: 793, height: 1122 },
};

export function paperPreset(key) {
  return PAPER_PRESETS[key] || PAPER_PRESETS.screen;
}

/** Seitenverhältnis Breite/Höhe, oder `null` für das freie Bildschirmformat. */
export function paperAspectRatio(key) {
  const paper = paperPreset(key);
  if (!paper.width || !paper.height) return null;
  return paper.width / paper.height;
}

export const MARGIN_METERS = 6;

export function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

/** Kontrollpunkt-Tiefe der Wasserlinie; unbekannte Gumpen und Wehre bleiben unverändert. */
export function poolDrawingDepthOf(segment) {
  return segment.type === 'POOL' && segment.depth_in_meters != null
    ? Math.min(5, Math.max(1.2, 1 + 0.4 * segment.depth_in_meters))
    : 2.2;
}

/** Gemeinsame Labelgeometrie für Renderer und Layout, nur bei bekannter Tiefe. */
export function poolDepthLabelFor(placement) {
  const { segment, start, end } = placement;
  if (segment.type !== 'POOL' || segment.depth_in_meters == null) return null;
  const text = `T ${formatNumber(segment.depth_in_meters)} m`;
  return {
    text,
    x: (start.x + end.x) / 2,
    y: Math.max(start.y, end.y) + poolDrawingDepthOf(segment) / 2 + 1.1,
    halfWidth: text.length * 0.28 + 0.3,
  };
}

const LEGEND_TITLE_CHAR_METERS = 1.08;
const LEGEND_ENTRY_CHAR_METERS = 0.55;
const LEGEND_MIN_WIDTH_METERS = 16;
const LEGEND_GAP_METERS = 4;

const SEGMENT_LEGEND_TEXTS = {
  RAPPEL: 'R = Rappel',
  RAPPEL_DRY: 'R_d = Rappel (dry)',
  RAPPEL_WET: 'R_w = Rappel (wet)',
  JUMP: 'J = Jump',
  SLIDE: 'S = Slide',
  CLIMB: 'C = Climb',
  WEIR: 'W = Weir',
};

/** Abkürzungserklärungen der tatsächlich verwendeten Segmenttypen. */
export function legendEntriesFor(topo) {
  const used = new Set((topo.segments || []).map((segment) => segment.type));
  const entries = [];
  for (const [type, text] of Object.entries(SEGMENT_LEGEND_TEXTS)) {
    if (used.has(type)) entries.push(text);
  }
  entries.push('(ri) = right', '(le) = left');
  return entries;
}

function trimmed(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * Datum lesbar machen: ein ISO-Datum wird zu TT.MM.JJJJ, jede andere Eingabe
 * bleibt unverändert stehen (das Feld ist ein freies Textfeld).
 */
export function formatLegendDate(value) {
  const raw = trimmed(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : raw;
}

/**
 * Kopfdaten der Legende: direkt unter dem Titel. Nur die Dauer – Author und
 * Datum stehen bewusst am Ende der Legende, unter den Abkürzungen.
 */
export function legendHeadLinesFor(topo) {
  const lines = [];
  const duration = trimmed(topo?.duration);
  if (duration) lines.push({ key: 'duration', label: 'Dauer', value: duration });
  return lines;
}

/**
 * Fusszeilen der Legende, nach dem letzten Legendeneintrag: erst Author, dann
 * Datum. Leere Felder dürfen keine leere Beschriftungszeile erzeugen.
 */
export function legendFooterLinesFor(topo) {
  const lines = [];
  const author = trimmed(topo?.author);
  if (author) lines.push({ key: 'author', label: 'Author', value: author });
  const date = formatLegendDate(topo?.date);
  if (date) lines.push({ key: 'date', label: 'Datum', value: date });
  return lines;
}

/** Author und Dauer als beschriftete Zeilen – unabhängig von ihrer Position. */
export function legendMetaLinesFor(topo) {
  return [
    ...legendHeadLinesFor(topo),
    ...legendFooterLinesFor(topo).filter((line) => line.key !== 'date'),
  ];
}

export function legendMetaTextsFor(topo) {
  return legendMetaLinesFor(topo).map((line) => `${line.label}: ${line.value}`);
}

function legendLineTexts(topo) {
  return [...legendHeadLinesFor(topo), ...legendFooterLinesFor(topo)].map(
    (line) => `${line.label}: ${line.value}`,
  );
}

export function legendTitleWidthMeters(topo) {
  return LEGEND_TITLE_CHAR_METERS * String(topo?.canyon_name ?? '').length + 2.5;
}

/**
 * Breite des Legendenkastens. Wächst mit dem längsten Text, damit Author,
 * Dauer und Datum nicht über den Rand oder ins Topo hinauslaufen.
 */
export function legendPanelWidthMeters(topo) {
  const texts = [...legendEntriesFor(topo), ...legendLineTexts(topo)];
  const longest = texts.reduce(
    (max, text) => Math.max(max, LEGEND_ENTRY_CHAR_METERS * text.length + 1.5),
    0,
  );
  return Math.max(
    legendTitleWidthMeters(topo),
    LEGEND_MIN_WIDTH_METERS,
    longest,
  );
}

/** Platz, den die Legende rechts neben dem Topo beansprucht. */
export function legendReservedWidthMeters(topo) {
  return legendPanelWidthMeters(topo) + LEGEND_GAP_METERS;
}

/** Zeilenhöhe innerhalb der Legende (Renderer und Blattmass teilen sie sich). */
export const LEGEND_LINE_HEIGHT_METERS = 1.4;

/**
 * Höhe des Legendenkastens. Kopfzeilen (Dauer), Abkürzungen und Fusszeilen
 * (Author, Datum) zählen gleichermassen – sonst würden die unteren Zeilen aus
 * dem Kasten laufen.
 */
export function legendPanelHeightMeters(topo) {
  const lines =
    legendHeadLinesFor(topo).length +
    legendEntriesFor(topo).length +
    legendFooterLinesFor(topo).length;
  return 6.5 + lines * LEGEND_LINE_HEIGHT_METERS + 3;
}

/** Oberkante des Legendenkastens in Blattkoordinaten. */
export function legendPanelTopMeters(topo) {
  return -MARGIN_METERS + 1 + (topo?.legend_offset_top || 0) - 0.5;
}

/** Rechte Zeichenkante des Topos ohne Legende (Linear hat keine Zeilengrenze). */
export function drawingRightEdge(layout) {
  return Number.isFinite(layout.rowWidthLimit)
    ? Math.max(layout.maxX, layout.rowWidthLimit)
    : layout.maxX;
}

/** Aussenmasse des Blatts in Metern, inkl. Rand und Legendenspalte. */
export function contentBoundsFor(topo, layout) {
  // Die Legende kann bei kurzen Topos tiefer reichen als die Zeichnung – dann
  // wächst das Blatt nach unten mit, statt die unteren Zeilen abzuschneiden.
  const legendBottom =
    legendPanelTopMeters(topo) + legendPanelHeightMeters(topo) + 1;
  return {
    minX: layout.minX - MARGIN_METERS,
    maxX:
      drawingRightEdge(layout) + MARGIN_METERS + legendReservedWidthMeters(topo),
    minY: -MARGIN_METERS,
    maxY: Math.max(layout.height + MARGIN_METERS, legendBottom),
  };
}

/**
 * Dehnt die Aussenmasse auf das Seitenverhältnis des Formats – nach rechts bzw.
 * unten, damit sich nichts verschiebt. Ohne das würde der Inhalt beim Export
 * auf A4 verzerrt, weil viewBox und Pixelmass unterschiedliche Verhältnisse
 * hätten.
 */
export function fitBoundsToPaper(bounds, paperKey) {
  const aspect = paperAspectRatio(paperKey);
  if (!aspect) return { ...bounds };
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (width <= 0 || height <= 0) return { ...bounds };
  if (width / height < aspect) {
    return { ...bounds, maxX: bounds.minX + height * aspect };
  }
  return { ...bounds, maxY: bounds.minY + width / aspect };
}

/**
 * Wandverlauf eines Abseilers, der frei vor der Wand hängt.
 *
 * `wall_distance_in_meters` ist der grösste waagrechte Abstand zwischen Seil
 * (Gerade Start→Ende) und Wand. Die Wand weicht nach hinten aus – also entgegen
 * der Seilseite, auf der auch der Pfeil sitzt – und mündet oben wie unten
 * wieder exakt in den Nachbarsegmenten. Gezeichnet wird eine quadratische
 * Bézier-Kurve: Legt man den Kontrollpunkt auf die doppelte Auslenkung, ist die
 * maximale Abweichung der Kurve exakt die Wanddistanz.
 *
 * Bewusst hier und nicht im Renderer, weil die Layout-Engine denselben
 * Extrempunkt braucht: Ohne ihn liefe die Wand über den Blattrand hinaus.
 */
export function wallBulgeFor(placement) {
  const distance = placement?.segment?.wall_distance_in_meters || 0;
  if (!(distance > 0)) return null;
  const { start, end, dir } = placement;
  // Normale zur Laufrichtung, zeigt von der Seilseite weg in die Wand hinein.
  const normal = { x: -dir.y, y: dir.x };
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  return {
    distance,
    normal,
    // Kontrollpunkt der Bézier-Kurve (doppelte Auslenkung).
    control: { x: midX + normal.x * 2 * distance, y: midY + normal.y * 2 * distance },
    // Tatsächlicher Scheitel der Kurve – nur der zählt für die Blattgrenzen.
    apex: { x: midX + normal.x * distance, y: midY + normal.y * distance },
  };
}
