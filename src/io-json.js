/**
 * Import/Export im Canyon-Explore-JSON-Format (verlustfreier Round-Trip).
 */
import { normalizeTopo } from './model.js';

/** Serialisiert das Modell in exakt die Feldreihenfolge des Originalformats. */
export function topoToJsonObject(topo) {
  const out = {
    canyon_name: topo.canyon_name,
  };
  if (topo.author) out.author = topo.author;
  if (topo.duration) out.duration = topo.duration;
  Object.assign(out, {
    date: topo.date,
    maximum_walk_length: topo.maximum_walk_length,
    distance_of_single_line: topo.distance_of_single_line,
    legend_offset_top: topo.legend_offset_top,
    segments: topo.segments.map((segment) => {
      const segmentOut = {
        type: segment.type,
        length_in_meters: segment.length_in_meters,
        angle_in_degrees: segment.angle_in_degrees,
        duration_to_walk_in_min: segment.duration_to_walk_in_min ?? null,
        do_not_cut_row_after_this_segment:
          segment.do_not_cut_row_after_this_segment,
        force_cut_row_after_this_segment:
          segment.force_cut_row_after_this_segment,
        elements: segment.elements.map((element) => {
          const elementOut = {
            type: element.type,
            horizontal_start_rel_to_segment_start:
              element.horizontal_start_rel_to_segment_start,
            vertical_start_rel_to_segment_start:
              element.vertical_start_rel_to_segment_start,
            horizontal_end_rel_to_segment_start:
              element.horizontal_end_rel_to_segment_start ?? null,
            vertical_end_rel_to_segment_start:
              element.vertical_end_rel_to_segment_start ?? null,
            size: element.size,
            text: element.text ?? '',
          };
          // Erweiterung gegenüber Canyon-Explore: nur schreiben, wenn gesetzt.
          // Sonst trüge jede exportierte Datei ein Feld, das das Originalformat
          // nicht kennt – und bestehende Topos wären nicht mehr byte-identisch.
          if (element.dead) elementOut.dead = true;
          if (element.duration_to_walk_in_min > 0) {
            elementOut.duration_to_walk_in_min = element.duration_to_walk_in_min;
          }
          return Object.assign(elementOut, element._extra || {});
        }),
      };
      // Erweiterung gegenüber Canyon-Explore: nur schreiben, wenn gesetzt.
      if (segment.wall_distance_in_meters > 0) {
        segmentOut.wall_distance_in_meters = segment.wall_distance_in_meters;
      }
      return Object.assign(segmentOut, segment._extra || {});
    }),
  });
  return Object.assign(out, topo._extra || {});
}

export function topoToJson(topo, indent = 1) {
  return JSON.stringify(topoToJsonObject(topo), null, indent);
}

export function topoFromJson(text) {
  const raw = typeof text === 'string' ? JSON.parse(text) : text;
  return normalizeTopo(raw);
}
