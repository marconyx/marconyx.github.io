# Canyoning Topo Generator

Statische Web-App zum Erstellen, Bearbeiten und Exportieren von Canyoning-Topos.
Läuft ohne Build-Step und ohne Backend direkt auf GitHub Pages — alle Daten bleiben im Browser.



## Funktionen

- **Editor**: Segmente anlegen, sortieren, duplizieren, Winkel/Länge/Gehzeit setzen,
  bei Abseilstellen zusätzlich die Wanddistanz für frei hängende Überhänge
- **Symbole**: 28 Topo-Symbole (Bolts, Blöcke, Bäume, Brücken, Funk- und Liftmasten, Fluchtwege, Warnungen …)
  per Klick einfügen und im Topo frei verschieben. Ist bereits ein Symbol ausgewählt,
  entsteht das neue an derselben Stelle und direkt dahinter in der Reihenfolge —
  sonst in der Segmentmitte und am Ende.
- **Layout**: Serpentine (automatischer Zeilenumbruch) oder Linear, Farbe oder Schwarz/Weiß,
  Bildschirm / A4 quer / A4 hoch. In der Serpentine bestimmt das Format die nutzbare
  Zeilenbreite — siehe [Zeilenumbruch](#zeilenumbruch).
- **Foto-/PDF-Referenz**: Bild **oder PDF** als halbtransparenten Hintergrund einblenden und
  das Topo darüber nachzeichnen (Deckkraft, Größe, Position regelbar). Bei mehrseitigen PDFs
  lässt sich die Seite auswählen.
- **AI-Erkennung**: Foto oder PDF-Seite per Vision-Modell in ein Topo umwandeln
  (OpenAI-kompatibel, Anthropic oder eigener Proxy), mit wählbarer Prompt-Vorlage — siehe unten
- **Speichern**: JSON (kompatibel zum Canyon-Explore-Format) und XML (mit XSD)
- **Export**: SVG, PNG, Druck/PDF über den Browser-Druckdialog
- **Komfort**: Undo/Redo, Autosave in `localStorage`, Live-Validierung, Auto-Nummerierung
- **Zufall**: Knopf *Zufall* erzeugt per Klick ein vollständiges Demo-Topo — mit
  jedem Segmenttyp und jedem Symbol der Palette mindestens einmal

## Schnellstart

```bash
# lokal starten (irgendein statischer Server genügt)
python3 -m http.server 8080
# dann http://localhost:8080 öffnen
```

Tests (ohne Abhängigkeiten):

```bash
npm test          # Round-Trip, Layout, Zufalls-Topo, UI, AI und Proxy
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
| `author` | optionaler Autor als Freitext |
| `duration` | optionale Gesamtdauer als Freitext, z. B. `3-4 h` |
| `date` | Datum (ISO, `YYYY-MM-DD`) |
| `maximum_walk_length` | maximale **gezeichnete** Länge eines WALK-Segments in Metern; längere Gehstrecken werden gestaucht und erhalten eine Dauer-Klammer |
| `distance_of_single_line` | Zeilenbreite in Metern für das Format *Bildschirm*; bei A4 wird die Breite aus dem Format abgeleitet |
| `legend_offset_top` | vertikaler Versatz der Legende in Metern |
| `segments` | Liste der Abschnitte, von oben nach unten |

### Segment

| Feld | Bedeutung |
| --- | --- |
| `type` | `WALK`, `POOL`, `RAPPEL`, `RAPPEL_DRY`, `RAPPEL_WET`, `JUMP`, `SLIDE`, `CLIMB`, `WEIR` |
| `length_in_meters` | reale Länge |
| `angle_in_degrees` | 0 = flach nach rechts, 90 = senkrecht nach unten, > 90 = überhängender Untergrund; bei RAPPEL bleibt der Abseilpfeil senkrecht |
| `duration_to_walk_in_min` | optionale Gehzeit; im Inspector nur bei `WALK` sichtbar (siehe [Gehzeit](#gehzeit)) |
| `wall_distance_in_meters` | nur `RAPPEL`, `RAPPEL_DRY`, `RAPPEL_WET`: grösster Abstand zwischen frei hängendem Seil und Wand; 0 = Seil liegt an (siehe [Wanddistanz](#wanddistanz)) |
| `do_not_cut_row_after_this_segment` | harte Keep-Together-Regel: hält dieses und das folgende Segment in derselben Zeile |
| `force_cut_row_after_this_segment` | harte Trennstelle: die Zeile endet nach diesem Segment |
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
| `duration_to_walk_in_min` | nur `ESCAPE_EXIT_LEFT`/`ESCAPE_EXIT_RIGHT`: Gehzeit bis zum sicheren Ort (siehe [Gehzeit](#gehzeit)) |

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

### Gehzeit

`duration_to_walk_in_min` gibt es an zwei Stellen:

* **Am Segment** – die Gehzeit einer Gehstrecke. Das Feld **Gehzeit (min)** steht
  im Inspector nur noch bei `WALK`; bei allen anderen Typen ist es fachlich ohne
  Bedeutung. Der Wert bleibt bei einem Typwechsel erhalten und wird weiterhin
  gelesen und geschrieben, damit JSON/XML byte-identisch bleiben.
* **Am Fluchtweg-Symbol** – `ESCAPE_EXIT_LEFT` und `ESCAPE_EXIT_RIGHT` kennen
  dasselbe Feld als geschätzte Gehzeit bis zum sicheren Ort. Ist es gesetzt,
  zeichnet der Renderer die Zeit („25 min") unter das Fluchtweg-Schild, in Farbe
  wie in Schwarz/Weiss.

> **Hinweis zur Kompatibilität:** Die Gehzeit am Symbol ist – wie `dead` – eine
> Erweiterung gegenüber Canyon-Explore. Sie wird nur geschrieben, wenn sie
> gesetzt ist, und ein Typwechsel weg vom Fluchtweg räumt sie auf.

## Zeilenumbruch

Im Layout **Serpentine** verteilt der Generator die Segmente selbständig auf Zeilen.

- **Zielbreite**: Beim Format *Bildschirm* gilt `distance_of_single_line`. Bei *A4 quer*
  und *A4 hoch* wird die Zeilenbreite gesucht, deren fertiges Blatt (inklusive Rand und
  Legendenspalte) dem Seitenverhältnis des Formats am nächsten kommt. *A4 hoch* ergibt
  dadurch schmalere Zeilen und mehr davon als *A4 quer*.
- **Aufteilung**: Die Zeilen werden per Dynamischer Programmierung gleichmäßig gefüllt
  (minimale Summe der quadrierten Restbreiten), nicht gierig von links nach rechts und
  nicht nach einer festen Segmentzahl.
- **Zeilenumbruch erzwingen** (`force_cut_row_after_this_segment`) trennt hart nach dem
  Segment — auch wenn die Zeile noch Platz hätte.
- **Umbruch verhindern** (`do_not_cut_row_after_this_segment`) hält das Segment mit dem
  folgenden zusammen — auch wenn die Zielbreite dabei überschritten wird. Das Blatt wächst
  in diesem Fall mit, abgeschnitten wird nichts.
- **Konflikt**: Sind beide Flags am selben Übergang gesetzt, gewinnt das Erzwingen. Die
  Oberfläche schließt die Kombination aus (das Setzen der einen Option löscht die andere);
  ältere Dateien mit beiden Flags bleiben lesbar und werden nach dieser Regel ausgewertet.

Das Layout **Linear** stellt weiterhin alle Segmente in eine einzige Zeile und ignoriert
Format und Umbruch-Flags.

### Zufalls-Topo

Der Knopf **Zufall** neben *Beispiel* erzeugt bei jedem Klick ein neues, zufälliges
Topo. Es enthält garantiert jeden Segmenttyp aus `SEGMENT_TYPES` und jede Variante der
Symbolpalette (inklusive Sonderformen wie *abgestorbener Baum*) mindestens einmal —
beide Listen leitet `src/random-topo.js` aus den bestehenden Katalogen ab, neue Typen
kommen also automatisch mit. Zufällig variieren Reihenfolge, Längen, Winkel (inklusive
Überhängen > 90° beim Abseilen), Wanddistanz, Symbolpositionen und Umbruch-Flags;
Erzwingen und Verhindern treffen dabei nie am selben Übergang zusammen. Laden,
Undo-Schritt und Autosave verhalten sich wie beim Beispiel-Topo.

Die Zufallsquelle ist injizierbar, damit Tests deterministisch bleiben:

```js
import { createRandomTopo } from './src/random-topo.js';

createRandomTopo({ seed: 42 });        // reproduzierbar
createRandomTopo({ rng: Math.random }) // eigene Quelle
createRandomTopo();                    // wie der Knopf
```

### Legende

Die Legende zeigt oben den Titel und — sofern gefüllt — die `duration`, darunter die
Abkürzungen der verwendeten Segmenttypen. **`author` und das Datum schliessen die
Legende ab**, in dieser Reihenfolge, nach dem letzten Legendeneintrag. Das Datum wird
lesbar als `TT.MM.JJJJ` ausgegeben (ein Nicht-ISO-Wert bleibt unverändert stehen).
Leere Werte erzeugen keine Zeile; Legendenkasten, Blattbreite und Blatthöhe wachsen mit
dem Inhalt, damit nichts überlappt oder abgeschnitten wird — in jedem Format, in Farbe
wie in Schwarz/Weiss und damit auch in jedem Export. Änderungen an Name, Author, Dauer
und Datum erscheinen sofort beim Tippen im Topo.

Auch `author` und `duration` sind optionale Erweiterungen. Leere Werte werden
weder im JSON noch im XML geschrieben, damit ältere Dateien beim Round-Trip
unverändert bleiben. Beim Import fehlende Werte werden als leere Eingabefelder
behandelt.

### Wanddistanz

Abseilstellen hängen oft frei vor der Wand. Das Feld `wall_distance_in_meters`
(Inspector: **Wanddistanz (m)**, nur bei `RAPPEL`, `RAPPEL_DRY`, `RAPPEL_WET`)
gibt den grössten waagrechten Abstand zwischen Seil und Wand an. Gezeichnet wird
die Wand dann als gerundeter Überhang: Sie weicht in der Mitte genau um diesen
Betrag zurück und mündet oben wie unten wieder exakt in die Nachbarsegmente. Der
Abseilpfeil bleibt dabei senkrecht auf der Seillinie, auch bei Winkeln über 90°.

Die Ausbuchtung geht in die Zeilen- und Blattbreite ein, wird also nie
abgeschnitten. Der Wert ist nie negativ, und `0` bedeutet „Seil liegt an der
Wand" – dann wird die Wand wie bisher als Gerade gezeichnet. Nur Werte grösser 0
werden in JSON/XML geschrieben, ältere Dateien bleiben damit byte-identisch. Ein
Typwechsel weg vom Abseilen setzt den Wert zurück.

### XML

`topo.xsd` beschreibt das XML-Gegenstück. Die Abbildung ist 1:1:

```xml
<topo version="1" canyon_name="My Canyon" author="Max Muster" duration="3-4 h"
      date="2026-09-29"
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
| **OpenAI-kompatibel** | Swisscom Swiss AI Platform (Standard), OpenAI, Azure OpenAI, OpenRouter, Groq, LM Studio, Ollama (`/v1`) | ja |
| **Anthropic (Claude)** | Claude Messages API | ja |
| **Eigener Proxy** | Firmen-Gateways ohne CORS, geteilte Deployments — `tools/proxy.mjs` liegt bei | nein |

Einstellen unter *AI-Erkennung → Einstellungen*. Der Button bleibt gesperrt, solange
etwas fehlt, und nennt im Tooltip den Grund.

Vorbelegt ist „OpenAI-kompatibel" mit dem Endpoint
`https://api.swisscom.com/products/swiss-ai-platform/internal-all-models/v1` und
dem Modell `qwen/qwen3.6-35b-a3b`. Ein leeres Endpoint- oder Modellfeld wird beim
Laden wieder mit diesen Vorgaben gefüllt; ein selbst eingetragener Wert bleibt
unverändert stehen.

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

### Prompt-Vorlagen

Der Prompt entscheidet über die Erkennungsqualität mehr als das Modell. Unter
*AI-Erkennung → Einstellungen → Prompt-Vorlage* lässt er sich deshalb auswählen:

| Vorlage | Wofür |
|---|---|
| **Optimiert (empfohlen)** | Standard. Rolle, Schritt-für-Schritt-Vorgehen, vollständiger Typkatalog mit Erkennungsmerkmalen, Einheiten und Wertebereiche, Regeln bei Unsicherheit, Beispiel-JSON. |
| **Kompakt** | Kurzfassung für kleine Modelle oder enges Kontextfenster. |
| **Bisheriger Prompt** | Der Prompt vor der Überarbeitung — zum Vergleichen. |
| **Eigener Prompt** | Freitext, vorbelegt mit der optimierten Vorlage. |

Die Listen der gültigen Segment- und Symboltypen erzeugt `src/ai.js` aus
`src/model.js` und `src/symbols.js`. Neue Typen stehen damit automatisch im
Prompt — nichts ist doppelt gepflegt.

Auswahl und eigener Text liegen wie Endpoint und Modell im `localStorage`. Ein
leerer eigener Prompt wird abgelehnt, statt einen nutzlosen Aufruf abzusetzen.

Bei „Optimiert“ und „Kompakt“ geht die Anweisung als **System-Nachricht** raus
(Anthropic: `system`-Feld), Bild und kurze Aufgabe als User-Nachricht — Modelle
befolgen die Vorgaben so zuverlässiger. Dazu kommt `temperature: 0.15` und, wo
unterstützt, `response_format: {"type": "json_object"}`; lehnt ein Gateway den
JSON-Modus ab, wiederholen App und Proxy den Aufruf automatisch ohne ihn.
„Bisheriger Prompt“ und „Eigener Prompt“ bleiben bewusst eine einzige
User-Nachricht — der eine ist byte-identisch zum alten Aufruf, der andere geht
unverändert so raus, wie er eingetippt wurde.

Der Prompt kommt in allen Wegen aus dem Browser: direkt, über `tools/proxy.mjs`
und über `tools/worker.js`. Beide Proxys formulieren nichts selbst, sie reichen
`prompt` und `system` durch (je 32 000 Zeichen Obergrenze).

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
AI_MODEL=qwen/qwen3.6-35b-a3b \
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
| `AI_MODEL` | `qwen/qwen3.6-35b-a3b` | Vorgabe, falls die App kein Modell schickt |
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
src/sheet.js          Formatvorgaben, Legenden- und Blattmasse
src/symbols.js        SVG-Symbolbibliothek
src/random-topo.js    Zufalls-Topo mit allen Segmenttypen und Symbolen
src/renderer.js       SVG-Renderer inkl. Terrain und Legende
src/exporters.js      SVG-/PNG-/Druck-Export
src/ai.js             Foto/PDF → Topo per Vision-Modell (+ Antwort-Sanitizing)
src/pdf.js            PDF-Seiten als Referenzbild rendern (pdf.js)
src/app.js            Editor-Logik und UI-Bindings
tools/proxy.mjs       Lokaler AI-Proxy (löst CORS) + serviert die App
tools/worker.js       Derselbe Proxy als Cloudflare Worker
tools/autostart.sh    Proxy ab Login mitlaufen lassen (LaunchAgent/systemd)
test/                 Round-Trip-, Layout-, Zufalls-, UI-, AI- und Proxy-Tests
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
