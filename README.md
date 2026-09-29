# Canyoning Topo Generator

Statische Web-App zum Erstellen, Bearbeiten und Exportieren von Canyoning-Topos.
Läuft ohne Build-Step und ohne Backend direkt auf GitHub Pages — alle Daten bleiben im Browser.



## Funktionen

- **Editor**: Segmente anlegen, sortieren, duplizieren, Winkel/Länge/Gehzeit setzen
- **Symbole**: 24 Topo-Symbole (Bolts, Blöcke, Bäume, Brücken, Leiter, Fluchtwege, Warnungen …)
  per Klick einfügen und im Topo frei verschieben
- **Layout**: Serpentine (automatischer Zeilenumbruch) oder Linear, Farbe oder Schwarz/Weiß,
  Bildschirm / A4 quer / A4 hoch
- **Foto-Referenz**: Foto als halbtransparenten Hintergrund einblenden und das Topo darüber
  nachzeichnen (Deckkraft, Größe, Position regelbar)
- **Speichern**: JSON (kompatibel zum Canyon-Explore-Format) und XML (mit XSD)
- **Export**: SVG, PNG, Druck/PDF über den Browser-Druckdialog
- **Komfort**: Undo/Redo, Autosave in `localStorage`, Live-Validierung, Auto-Nummerierung

## Schnellstart

```bash
# lokal starten (irgendein statischer Server genügt)
python3 -m http.server 8080
# dann http://localhost:8080 öffnen
```

Tests (ohne Abhängigkeiten):

```bash
node test/roundtrip.test.mjs
```

## Deployment auf GitHub Pages

1. Repository anlegen und den Inhalt dieses Ordners committen.
2. In den Repository-Einstellungen unter *Pages* → *Source* **GitHub Actions** wählen.
3. Der mitgelieferte Workflow `.github/workflows/deploy.yml` veröffentlicht das Repository
   bei jedem Push auf `main`. Ein Build ist nicht nötig, die Dateien werden 1:1 ausgeliefert.

Die Datei `.nojekyll` verhindert, dass GitHub Pages den Ordner durch Jekyll verarbeitet.

## Datenformat

Primärformat ist das **Canyon-Explore-JSON**. Import und Export sind verlustfrei:
unbekannte Felder und Typen bleiben erhalten (Round-Trip durch Tests abgesichert).

### Kopf

| Feld | Bedeutung |
| --- | --- |
| `canyon_name` | Titel im Topo |
| `date` | Datum (ISO, `YYYY-MM-DD`) |
| `maximum_walk_length` | maximale **gezeichnete** Länge eines WALK-Segments in Metern; längere Gehstrecken werden gestaucht und erhalten eine Dauer-Klammer |
| `distance_of_single_line` | maximale horizontale Breite einer Topo-Zeile in Metern |
| `legend_offset_top` | vertikaler Versatz der Legende in Metern |
| `segments` | Liste der Abschnitte, von oben nach unten |

### Segment

| Feld | Bedeutung |
| --- | --- |
| `type` | `WALK`, `POOL`, `RAPPEL`, `RAPPEL_DRY`, `RAPPEL_WET`, `JUMP`, `SLIDE`, `CLIMB`, `WEIR` |
| `length_in_meters` | reale Länge |
| `angle_in_degrees` | 0 = flach nach rechts, 90 = senkrecht nach unten, > 90 = überhängend |
| `duration_to_walk_in_min` | optionale Gehzeit (wird bei gestauchten WALK-Segmenten angezeigt) |
| `do_not_cut_row_after_this_segment` | Zeilenumbruch nach diesem Segment unterdrücken |
| `force_cut_row_after_this_segment` | Zeilenumbruch nach diesem Segment erzwingen |
| `elements` | Symbole auf diesem Segment |

### Element

| Feld | Bedeutung |
| --- | --- |
| `type` | Symboltyp (siehe unten) |
| `horizontal_start_rel_to_segment_start` | Versatz **entlang** der Segmentrichtung in Metern |
| `vertical_start_rel_to_segment_start` | Versatz **quer** dazu, positiv = links der Laufrichtung (bei flachem Gelände nach oben) |
| `horizontal_end_rel_to_segment_start` | Endpunkt für Streckenelemente, sonst `null` |
| `vertical_end_rel_to_segment_start` | Endpunkt für Streckenelemente, sonst `null` |
| `size` | Skalierungsfaktor des Symbols |
| `text` | Beschriftung (Nummer, Warntext, Name eines Zuflusses …) |

### Symbolliste

| Kategorie | Typen |
| --- | --- |
| Verankerung | `BOLT`, `BOLT_LEFT`, `BOLT_RIGHT` |
| Gefahren | `SHARP_EDGE`, `TRAPPED_STONE`, `BACKWATER`, `WARNING_AND_TEXT` |
| Natur | `STONE`, `TRUNK`, `LEAF_TREE`, `CONIFER_TREE`, `CAVE`, `INLET_LEFT`, `INLET_RIGHT` |
| Infrastruktur | `LADDER`, `STONE_BRIDGE`, `WOODEN_BRIDGE`, `STONE_HOUSE`, `ROPE_RAILING_LEFT`, `ROPE_RAILING_RIGHT` |
| Beschriftung | `ELEMENT_NUMBER`, `CUSTOM_TEXT`, `ESCAPE_EXIT_LEFT`, `ESCAPE_EXIT_RIGHT` |

Streckenelemente (`ROPE_RAILING_*`) benötigen zusätzlich die `*_end_*`-Koordinaten.

### XML

`topo.xsd` beschreibt das XML-Gegenstück. Die Abbildung ist 1:1:

```xml
<topo version="1" canyon_name="My Canyon" date="2026-09-29"
      maximum_walk_length="30" distance_of_single_line="60" legend_offset_top="0">
  <segment type="RAPPEL_DRY" length_in_meters="10" angle_in_degrees="90"
           do_not_cut_row_after_this_segment="false"
           force_cut_row_after_this_segment="false">
    <element type="BOLT_LEFT" horizontal_start_rel_to_segment_start="-1"
             vertical_start_rel_to_segment_start="1" size="1" text=""/>
  </segment>
</topo>
```

`null`-Werte werden als fehlendes Attribut dargestellt, unbekannte Felder wandern
als JSON in das Attribut `extra`.

## AI-Anbindung (vorbereitet, nicht aktiv)

Version 1 arbeitet bewusst ohne AI: ein Foto dient als Referenzlayer zum Nachzeichnen.
Die Schnittstelle für eine automatische Erkennung existiert bereits in `src/ai.js`:

```js
import { registerTopoProvider } from './src/ai.js';

registerTopoProvider(async (image, options) => {
  // Bild an ein Vision-Modell schicken und ein Topo-Objekt zurückgeben
  return { canyon_name: '…', date: '…', segments: [ /* … */ ] };
});
```

Sobald ein Provider registriert ist, aktiviert die UI den Button
**„Aus Foto erzeugen (AI)“**. Das Ergebnis wird über `normalizeTopo()` validiert.
API-Keys gehören in `localStorage` oder hinter einen Proxy — **niemals ins Repository**.

## Projektstruktur

```
index.html            UI-Gerüst
styles.css            Layout und Themes der Oberfläche
src/model.js          Datenmodell, Defaults, Validierung
src/io-json.js        JSON-Import/-Export (Originalformat)
src/io-xml.js         XML-Import/-Export
src/layout.js         Geometrie, Zeilenumbruch, Walk-Stauchung
src/symbols.js        SVG-Symbolbibliothek
src/renderer.js       SVG-Renderer inkl. Terrain und Legende
src/exporters.js      SVG-/PNG-/Druck-Export
src/ai.js             Schnittstelle für spätere AI-Erkennung
src/app.js            Editor-Logik und UI-Bindings
test/                 Round-Trip- und Rendering-Tests
examples/             Beispiel-Topo (JSON + XML)
topo.xsd              XML-Schema
```

## Hinweise

- Alle Symbole sind eigens gezeichnet; es werden keine fremden Assets verwendet.
- Die Layout-Regeln der Referenz-App sind nicht dokumentiert und wurden aus Beispieldatei
  und gerendertem Topo rekonstruiert — Abweichungen im Detail sind möglich, die Daten
  bleiben aber vollständig kompatibel.
- Es werden keine Daten an Server gesendet; Foto und Topo verlassen den Browser nicht.
