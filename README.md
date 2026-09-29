# Canyoning Topo Generator

Statische Web-App zum Erstellen, Bearbeiten und Exportieren von Canyoning-Topos.
Läuft ohne Build-Step und ohne Backend direkt auf GitHub Pages — alle Daten bleiben im Browser.



## Funktionen

- **Editor**: Segmente anlegen, sortieren, duplizieren, Winkel/Länge/Gehzeit setzen
- **Symbole**: 24 Topo-Symbole (Bolts, Blöcke, Bäume, Brücken, Leiter, Fluchtwege, Warnungen …)
  per Klick einfügen und im Topo frei verschieben
- **Layout**: Serpentine (automatischer Zeilenumbruch) oder Linear, Farbe oder Schwarz/Weiß,
  Bildschirm / A4 quer / A4 hoch
- **Foto-/PDF-Referenz**: Bild **oder PDF** als halbtransparenten Hintergrund einblenden und
  das Topo darüber nachzeichnen (Deckkraft, Größe, Position regelbar). Bei mehrseitigen PDFs
  lässt sich die Seite auswählen.
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

## Repository

<https://github.com/marco-wahler_Swisscom/canyoning-topo-generator> (privat)

## Deployment auf GitHub Pages

Das Repository ist **privat**, weil der Enterprise-Account keine öffentlichen Repos
erlaubt. GitHub Pages steht für private Repos in diesem Plan nicht zur Verfügung —
der Deploy-Workflow ist deshalb auf `workflow_dispatch` gestellt und läuft nicht
automatisch.

Sobald Pages verfügbar ist (Repo öffentlich schalten oder in einen Account mit
Pages-Unterstützung übertragen):

1. In den Repository-Einstellungen unter *Pages* → *Source* **GitHub Actions** wählen.
2. Den Workflow `.github/workflows/deploy.yml` starten (Actions → *Deploy to GitHub
   Pages* → *Run workflow*) oder den `on:`-Block wieder auf `push: branches: [main]`
   umstellen.

Ein Build ist nicht nötig, die Dateien werden 1:1 ausgeliefert. Die Datei `.nojekyll`
verhindert, dass GitHub Pages den Ordner durch Jekyll verarbeitet.

`.github/workflows/ci.yml` (Tests + XSD-Validierung) und `deploy.yml` sind beide auf
`workflow_dispatch` gestellt: Hosted Runner sind für dieses Repo per
Enterprise-Policy deaktiviert. Die Verifikation läuft deshalb lokal:

```bash
npm test
xmllint --noout --schema topo.xsd examples/my-canyon-inferiore.xml
```

## Lokal starten

```bash
python3 -m http.server 8080
# danach http://127.0.0.1:8080 öffnen
```

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
Der Provider bekommt immer eine PNG-Data-URL — bei PDFs die gerade angezeigte,
bereits gerenderte Seite. Er muss PDFs also nicht selbst verstehen.
API-Keys gehören in `localStorage` oder hinter einen Proxy — **niemals ins Repository**.

## PDF-Referenz

Viele Topos liegen als PDF vor. Beim Auswählen einer PDF-Datei rendert die App die
gewünschte Seite über [pdf.js](https://mozilla.github.io/pdf.js/) in ein Canvas und
benutzt das Ergebnis als Referenzbild — ab da ist der Ablauf identisch zu einem Foto.

- pdf.js liegt unter `vendor/pdfjs/` **im Repository** (Apache-2.0, Lizenz beiliegend),
  damit die App ohne CDN und ohne Netzzugriff funktioniert.
- Das Modul wird per dynamischem `import()` erst beim ersten PDF geladen. Wer nur Bilder
  benutzt, lädt die 1,6 MB nie.
- Seiten werden auf maximal 2200 px längste Kante gerendert und auf weißem Grund
  gezeichnet, damit transparente PDFs auch im dunklen Theme lesbar bleiben.
- Gespeichert wird in `localStorage` nur das gerenderte Bild. Nach einem Reload ist die
  Seite weiterhin sichtbar, zum Blättern muss die Datei erneut gewählt werden.
- Alles läuft lokal im Browser; die PDF-Datei wird nicht hochgeladen.

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
src/pdf.js            PDF-Seiten als Referenzbild rendern (pdf.js)
src/app.js            Editor-Logik und UI-Bindings
test/                 Round-Trip- und Rendering-Tests
examples/             Beispiel-Topo (JSON + XML)
vendor/pdfjs/         pdf.js (Apache-2.0), lokal eingebunden
topo.xsd              XML-Schema
```

## Hinweise

- Alle Symbole sind eigens gezeichnet; es werden keine fremden Assets verwendet.
  Einzige Fremdbibliothek ist pdf.js unter `vendor/pdfjs/` (Apache-2.0).
- Die Layout-Regeln der Referenz-App sind nicht dokumentiert und wurden aus Beispieldatei
  und gerendertem Topo rekonstruiert — Abweichungen im Detail sind möglich, die Daten
  bleiben aber vollständig kompatibel.
- Es werden keine Daten an Server gesendet; Foto, PDF und Topo verlassen den Browser nicht.
