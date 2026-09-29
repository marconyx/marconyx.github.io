# Canyoning Topo Generator

Statische Web-App zum Erstellen, Bearbeiten und Exportieren von Canyoning-Topos.
Läuft ohne Build-Step und ohne Backend direkt auf GitHub Pages — alle Daten bleiben im Browser.



## Funktionen

- **Editor**: Segmente anlegen, sortieren, duplizieren, Winkel/Länge/Gehzeit setzen
- **Symbole**: 28 Topo-Symbole (Bolts, Blöcke, Bäume, Brücken, Funk- und Liftmasten, Fluchtwege, Warnungen …)
  per Klick einfügen und im Topo frei verschieben. Ist bereits ein Symbol ausgewählt,
  entsteht das neue an derselben Stelle und direkt dahinter in der Reihenfolge —
  sonst in der Segmentmitte und am Ende.
- **Layout**: Serpentine (automatischer Zeilenumbruch) oder Linear, Farbe oder Schwarz/Weiß,
  Bildschirm / A4 quer / A4 hoch
- **Foto-/PDF-Referenz**: Bild **oder PDF** als halbtransparenten Hintergrund einblenden und
  das Topo darüber nachzeichnen (Deckkraft, Größe, Position regelbar). Bei mehrseitigen PDFs
  lässt sich die Seite auswählen.
- **AI-Erkennung**: Foto oder PDF-Seite per Vision-Modell in ein Topo umwandeln
  (OpenAI-kompatibel, Anthropic oder eigener Proxy) — siehe unten
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
npm test          # Round-Trip, Rendering und AI-Antwortverarbeitung
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
| `angle_in_degrees` | 0 = flach nach rechts, 90 = senkrecht nach unten, > 90 = überhängender Untergrund; bei RAPPEL bleibt der Abseilpfeil senkrecht |
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
| Natur | `STONE`, `TRUNK`, `LEAF_TREE`, `CONIFER_TREE` (beide auch abgestorben), `CAVE`, `INLET_LEFT`, `INLET_RIGHT` |
| Infrastruktur | `LADDER`, `STONE_BRIDGE`, `WOODEN_BRIDGE`, `STONE_HOUSE`, `RADIO_MAST` (Funkmast), `LIFT_MAST` (Liftmast), `SQUARE_CONCRETE_BASE` (Betonsockel eckig), `STEEL_BEAM` (Stahlträger), `ROPE_RAILING_LEFT`, `ROPE_RAILING_RIGHT` |
| Beschriftung | `ELEMENT_NUMBER`, `CUSTOM_TEXT`, `ESCAPE_EXIT_LEFT`, `ESCAPE_EXIT_RIGHT` |

Streckenelemente (`ROPE_RAILING_*`) benötigen zusätzlich die `*_end_*`-Koordinaten.

`LEAF_TREE` und `CONIFER_TREE` kennen zusätzlich `dead` (Boolean): Ein abgestorbener
Baum wird kahl und graubraun gezeichnet. Die Palette bietet beide Varianten direkt
an, im Inspektor lässt sich der Zustand über die Checkbox „Abgestorben" umschalten.

> **Hinweis zur Kompatibilität:** `dead` ist eine Erweiterung gegenüber dem
> Canyon-Explore-Format. Das Feld wird deshalb nur geschrieben, wenn es gesetzt
> ist — ein Topo ohne abgestorbene Bäume exportiert unverändert und bleibt dort
> einlesbar. Umgekehrt ignoriert Canyon-Explore ein `dead="true"` schlicht, der
> Baum erscheint dann wieder lebend.

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

## AI-Erkennung: Foto/PDF → Topo

Der Button **„Aus Foto erzeugen (AI)“** schickt das geladene Referenzbild an ein
Vision-Modell und baut aus der Antwort ein Topo.

GitHub Pages liefert nur statische Dateien — es gibt also keinen Server, der einen
API-Key verwahren könnte. Der Aufruf geht deshalb **direkt aus dem Browser** an den
konfigurierten Endpoint; der Key liegt ausschließlich im `localStorage` dieses
Browsers und wird nie ins Repository übertragen.

### Anbieter

| Modus | Wofür | Key im Browser |
|---|---|---|
| **OpenAI-kompatibel** | OpenAI, Azure OpenAI, OpenRouter, Groq, LM Studio, Ollama (`/v1`) | ja |
| **Anthropic (Claude)** | Claude Messages API | ja |
| **Eigener Proxy** | Firmen-Gateways ohne CORS, geteilte Deployments — `tools/proxy.mjs` liegt bei | nein |

Einstellen unter *AI-Erkennung → Einstellungen*. Der Button bleibt gesperrt, solange
etwas fehlt, und nennt im Tooltip den Grund.

### Modelle werden selbst gefunden

Sobald Endpoint und Key stehen, fragt die App `GET <endpoint>/models` ab und füllt
damit die Vorschlagsliste am Modellfeld — ohne Knopfdruck. Blockiert das Gateway
den Aufruf, läuft er automatisch über den lokalen Proxy (siehe unten); die Liste
sagt dann „(über den lokalen Proxy)".

Bewusst eine Vorschlagsliste und **kein** Auswahlfeld: Neue Modelle erscheinen oft,
bevor eine Liste sie kennt, und manche Gateways kennen gar kein `/models`. Ein frei
getippter Name bleibt deshalb immer möglich — steht er nicht in der Liste, weist
die App nur darauf hin, statt ihn zu verhindern.

Ein Fehlschlag wird nicht wiederholt, sonst entstünde bei falscher Konfiguration
ein Dauerfeuer auf die API. Nach einer Korrektur läuft es von selbst wieder, und
*Modelle laden* erzwingt es jederzeit.

### Firmen-Gateways: der mitgelieferte Proxy

Viele Unternehmens-Gateways beantworten den CORS-Preflight des Browsers mit `401`
und **ohne** `Access-Control-Allow-Origin`. Der Browser bricht den Aufruf dann ab,
bevor er überhaupt stattfindet — sichtbar nur als nichtssagender Netzwerkfehler.
Beispiel (nachgeprüft):

```bash
curl -i -X OPTIONS https://api.swisscom.com/products/swiss-ai-platform/internal-all-models/v1/chat/completions \
  -H "Origin: http://localhost:8080" -H "Access-Control-Request-Method: POST"
# HTTP/1.1 401 — kein Access-Control-Allow-Origin
```

Daran lässt sich clientseitig nichts ändern. `tools/proxy.mjs` löst es: Zwischen
Servern gelten keine CORS-Regeln. Der Proxy **serviert zusätzlich die App selbst**,
damit laufen App und API auf demselben Origin und CORS entfällt vollständig.

#### Der übliche Weg: einmal starten, danach alles in der Oberfläche

```bash
npm start
```

Dann **http://127.0.0.1:8787/** öffnen und unter *AI-Erkennung → Einstellungen*
Anbieter, Endpoint, Modell und Key eintragen. Mehr nicht — **keine
Umgebungsvariablen, kein Neustart, kein Anbieterwechsel.**

Das funktioniert, weil beide Seiten mitdenken:

- Der Proxy nimmt Endpoint, Modell und Key **pro Anfrage** entgegen. Änderungen in
  der Oberfläche wirken sofort; er muss nie neu gestartet werden.
- Die App erkennt einen laufenden Proxy von selbst. Scheitert ein Direktaufruf an
  CORS, **wiederholt sie ihn still über den Proxy** und schreibt „(über den lokalen
  Proxy)" in die Statuszeile. Die Einstellungen zeigen oben an, ob er läuft.

Ein Browser kann keinen Prozess starten — dieser eine Schritt bleibt. Wer ihn auch
sparen will, lässt den Proxy ab Login mitlaufen:

```bash
npm run autostart:install    # macOS: LaunchAgent · Linux: systemd-User-Service
npm run autostart:status
npm run autostart:uninstall
```

**Abwägung:** Auf diesem Weg liegt der Key im Browser (`localStorage`) und wird pro
Anfrage mitgeschickt — vertretbar, weil der Proxy ausschliesslich an `127.0.0.1`
lauscht. Soll der Key **den Rechner nie im Browser sehen**, weiter wie bisher:

```bash
AI_KEY=dein-key \
AI_UPSTREAM=https://api.swisscom.com/products/swiss-ai-platform/internal-all-models/v1 \
AI_MODEL=gpt-4o \
npm start
```

… und in der App den Anbieter **Eigener Proxy** wählen; das Key-Feld bleibt leer.
Mit `AI_ALLOW_CLIENT_CONFIG=false` ignoriert der Proxy Angaben aus dem Browser
vollständig.

Nur Node ≥ 18 nötig, keine Abhängigkeiten. Der Proxy bietet drei Wege an:
`POST /api/topo` (Foto → Topo), `POST /api/models` (Modell-Liste) und
`GET /api/health` (aktive Konfiguration ohne den Key, plus ob Angaben aus der App
akzeptiert werden).

#### Auth-Schema anpassen

Vorgabe ist `Authorization: Bearer <key>`. Erwartet dein Gateway etwas anderes:

```bash
# roher Key in eigenem Header
AI_AUTH_HEADER=X-Api-Key AI_AUTH_SCHEME= AI_KEY=... npm start

# Anthropic-Format statt OpenAI
AI_API=anthropic AI_AUTH_HEADER=x-api-key AI_AUTH_SCHEME= AI_KEY=... npm start
```

| Variable | Vorgabe | Zweck |
|---|---|---|
| `AI_KEY` | — | Optional. Gesetzt: Key bleibt serverseitig. Sonst schickt ihn die App. |
| `AI_UPSTREAM` | Swisscom-Endpoint | Basis-URL **ohne** `/chat/completions` |
| `AI_MODEL` | `gpt-4o` | Vorgabe, falls die App kein Modell schickt |
| `AI_AUTH_HEADER` | `Authorization` | Header-Name für den Key |
| `AI_AUTH_SCHEME` | `Bearer ` | Präfix; leer setzen für rohe Keys |
| `AI_API` | `openai` | oder `anthropic` |
| `PORT` | `8787` | |
| `AI_ALLOW_CLIENT_CONFIG` | `true` | `false` ignoriert Endpoint/Modell/Key aus der App |

Bei `401`/`403` nennt der Proxy den Klartext des Gateways und weist auf die
Auth-Variablen hin — im Browser wäre diese Information nicht sichtbar gewesen.

### Dauerbetrieb: Cloudflare Worker

Der lokale Proxy läuft nur auf dem eigenen Rechner. Ist die App gehostet, deploy
`tools/worker.js` — gleiche Variablen, gleicher Vertrag:

```bash
npx wrangler deploy tools/worker.js --name canyon-topo-proxy --compatibility-date 2025-01-01
npx wrangler secret put AI_KEY
```

`ALLOWED_ORIGIN` unbedingt auf den eigenen Origin setzen, sonst kann jeder den
Worker — und damit deinen Key — benutzen.

Der Worker nimmt **bewusst keine** Konfiguration aus dem Browser entgegen: Er ist
öffentlich erreichbar, dort gehört der Key ausschliesslich in die Secrets.

### Eigener Proxy von Hand

Jeder Endpoint, der diesen Vertrag erfüllt, funktioniert. Er bekommt:

```json
{ "image": "data:image/png;base64,…", "prompt": "…", "hints": { "canyonName": "…", "notes": "…" } }
```

und antwortet entweder direkt mit dem Topo-JSON oder mit dem durchgereichten
Modelltext als JSON-String. Damit verlässt der Key nie den Server.

### Was die App aus der Antwort macht

Modelle antworten selten sauber. `src/ai.js` fängt das ab:

- JSON wird auch aus Fließtext und Markdown-Codefences herausgeschnitten
  (klammerzählender Scanner, robust gegen `{` `}` in Strings).
- Synonyme werden auf gültige Typen abgebildet (`hike` → `WALK`, `anchor` → `BOLT`,
  `swim` → `POOL`, …).
- Unbekannte Segment- und Elementtypen werden verworfen statt eingebaut; die Anzahl
  steht in der Statuszeile, die Details in der Browser-Konsole.
- Punktelemente bekommen zwingend `null` als Endkoordinaten, Streckenelemente
  zwingend Zahlen — sonst zeichnet der Renderer Strecken ins Nichts.
- Erst danach läuft `normalizeTopo()`.

Das Ergebnis landet über die normale Undo-Historie im Editor: **ein Klick auf ↶ stellt
das vorherige Topo wieder her.** Abgedeckt von `test/ai.test.mjs`.

### Grenzen

Die Erkennung liefert einen *Entwurf*, keine fertige Dokumentation. Längen, Winkel und
Symbolpositionen müssen nachgeprüft werden — deshalb blendet die App nach jedem Lauf
„Bitte gegenprüfen“ ein. Am besten funktionieren klar gezeichnete Topos; Fotos einer
realen Schlucht liefern erwartungsgemäß deutlich schwächere Ergebnisse.

### Eigener Provider

`registerTopoProvider()` überschreibt alles und bleibt der Erweiterungspunkt:

```js
import { registerTopoProvider } from './src/ai.js';

registerTopoProvider(async (image, options) => {
  // image ist immer eine PNG-Data-URL – bei PDFs die gerenderte Seite.
  return { canyon_name: '…', date: '…', segments: [ /* … */ ] };
});
```

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
src/ai.js             Foto/PDF → Topo per Vision-Modell (+ Antwort-Sanitizing)
src/pdf.js            PDF-Seiten als Referenzbild rendern (pdf.js)
src/app.js            Editor-Logik und UI-Bindings
tools/proxy.mjs       Lokaler AI-Proxy (löst CORS) + serviert die App
tools/worker.js       Derselbe Proxy als Cloudflare Worker
tools/autostart.sh    Proxy ab Login mitlaufen lassen (LaunchAgent/systemd)
test/                 Round-Trip-, Rendering- und AI-Tests
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
- Ohne AI-Erkennung verlassen Foto, PDF und Topo den Browser nicht. Wird die AI genutzt,
  geht genau das Referenzbild an den von dir eingestellten Endpoint — sonst nichts.
- Der API-Key liegt nur im `localStorage` dieses Browsers. Auf gemeinsam genutzten
  Rechnern oder öffentlichen Instanzen stattdessen den Proxy-Modus verwenden.
