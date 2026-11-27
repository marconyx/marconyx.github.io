# Canyoning Topo Generator

Statische Web-App zum Erstellen, Bearbeiten und Exportieren von Canyoning-Topos.
Läuft ohne Build-Step und ohne Backend direkt auf GitHub Pages — alle Daten bleiben im Browser.

Die responsive App-Kopfzeile zeigt das bachab-Logo neben dem App-Titel, darunter die
App-Version (`#app-version` in `index.html`). Sie beginnt bei `v0.1` und wird mit jedem
Commit um eine Nebenversion erhöht (`v0.2`, `v0.3` …).
Topo-Titel und SVG-, PNG- sowie PDF-Exporte bleiben ohne dieses Logo.

Das Stylesheet, der JS-Einstiegspunkt, alle lokalen Modulimporte sowie PDF.js
und sein Worker tragen dieselbe Versionsnummer als URL-Query (`?v=0.22`). Bei
jedem Versionswechsel müssen alle diese Queries mit erhöht werden; ein Test
prüft die Übereinstimmung. So kann eine neue HTML-Version nicht versehentlich
ältere Browser-Cache-Versionen der Module verwenden.


## Funktionen

- **Neu**: Die Auswahl bündelt das bisherige Start-Topo mit drei Segmenten,
  **Leer** (ein neues Topo ohne Segmente), **Beispiel**, **Zufall**,
  **Öffnen…** (JSON/XML/TXT) und **Von OC öffnen**. Letzteres ist ein
  Platzhalter: Die API ist noch nicht verfügbar; es werden keine Daten geladen
  oder verändert. **Auf OC speichern** in der Speichern-Auswahl ist ebenfalls
  ein Platzhalter für das spätere Speichern des generierten XML; es wird noch
  keine Anfrage gesendet. Die Auswahlen unterstützen Tastatur und Smartphone-Toolbar.
- **Editor**: Segmente anlegen, sortieren, duplizieren, Winkel/Länge/Gehzeit setzen,
  bei Abseilstellen zusätzlich die Wanddistanz für frei hängende Überhänge
- **Segment-Shortcuts**: Das Feld `shortcuts` über der Segmentauswahl hängt mit
  Enter oder dem Plus-Knopf rechts daneben Segmente **am Listenende** an,
  unabhängig von der aktuellen Auswahl.
  `R10` ergibt RAPPEL mit 10 m, `RD23` RAPPEL_DRY mit 23 m, `RW12,5`
  RAPPEL_WET mit 12.5 m. Alle Kürzel: `R`=RAPPEL, `RD`=RAPPEL_DRY,
  `RW`=RAPPEL_WET, `P`=POOL, `J`=JUMP, `S`=SLIDE, `C`=CLIMB,
  `W`=WALK. Das alte `WA` wird beim Import von Kurzlisten abgewiesen;
  das frühere WEIR-Kürzel `WE` wird abgewiesen;
  alle Kürzel stehen auch in der Hilfe hinter dem `?` zwischen Feld und Plus. Das
  Pop-up lässt sich mit dem Schliessen-Knopf, Escape oder einem Klick ausserhalb
  schliessen. Gross-/Kleinschreibung, äusserer
  Leerraum und Leerraum zwischen Kürzel und Zahl sind erlaubt. Die Länge muss
  endlich und grösser als 0 sein; Dezimalpunkt und Dezimalkomma sind möglich.
  Fehlende/negative Zahlen, Einheiten, Exponentialschreibweise und andere
  ungültige Einträge werden mit einer übersetzten Meldung abgewiesen, ohne
  das Topo oder die Undo-Historie zu ändern. Mehrere Einträge werden durch
  Komma vor dem nächsten Kürzel getrennt, z. B. `R10,RW3, RD23.5`.
  Ein Komma zwischen Ziffern ist ein Dezimalzeichen: `R12,5` ist ein Segment;
  `R12,5,P3` sind zwei. Der gesamte Stapel ist ein Undo/Redo-Schritt.
  Nach Erfolg bleibt der Fokus im
  geleerten Feld; bestehende Auswahl, normale Plus-Aktion und Autosave bleiben
  erhalten.
- **Symbole**: 44 Topo-Symbole (Bolts, Blöcke, Büsche, Bäume, Brücken, Helikopter, Funk- und Liftmasten,
  Fluchtwege, Gefahrenzeichen wie Lebensgefahr, Baum- und Felsblockverhau, Steinschlag,
  Unterspülung, Siphon, Wege und Umgehungen …)
  per Klick einfügen und im Topo frei verschieben. Ist bereits ein Symbol ausgewählt,
  entsteht das neue an derselben Stelle und direkt dahinter in der Reihenfolge —
  sonst in der Segmentmitte und am Ende.
- **Layout**: Serpentine (automatischer Zeilenumbruch), Kaskadiert (automatische
  Aufteilung in Spalten) oder Linear, Farbe, Alpin klassisch, Standard
  oder Bleistiftskizze, Bildschirm / A4 quer / A4 hoch / A5 quer / A5 hoch. In der Serpentine bestimmt das Format die
  nutzbare Zeilenbreite, bei Kaskadiert die Spaltenhöhe — siehe
  [Zeilenumbruch](#zeilenumbruch) und [Kaskadiert (Spalten)](#kaskadiert-spalten).
- **Lange Strecken kürzen**: Unter *Topo* lässt sich bei „Segmente verkürzen ab (m)“ ein
  Schwellenwert setzen. Längen darüber werden in der Zeichnung auf den Schwellenwert
  gekappt und mit einem Doppelbruch markiert; Beschriftungen zeigen weiterhin das
  echte Mass. Leer oder `0` schaltet die Funktion aus. Gumpentiefen bleiben davon
  unberührt, da sie separat und bewusst nicht linear als Wasserbeckenform gezeichnet
  werden.
- **Foto-/PDF-Referenz**: Bild **oder PDF** als halbtransparenten Hintergrund einblenden und
  das Topo darüber nachzeichnen (Deckkraft, Größe, Position regelbar). Bei mehrseitigen PDFs
  lässt sich die Seite auswählen.
- **AI-Erkennung unter Foto-Referenz**: Foto oder PDF-Seite per Vision-Modell in ein Topo umwandeln
  (OpenAI-kompatibel, Anthropic oder eigener Proxy), mit wählbarer Prompt-Vorlage — siehe unten
- **Speichern**: JSON (kompatibel zum Canyon-Explore-Format) und XML (mit XSD)
- **Export**: SVG, PNG, Kurzliste (TXT), Druck/PDF über den Browser-Druckdialog
- **Komfort**: Undo/Redo, Autosave in `localStorage`, Live-Validierung, Auto-Nummerierung
- **Mehrsprachige Oberfläche**: Auswahl links neben „Neu“ (DE/EN/FR/IT/ES) übersetzt alle
  Oberflächentexte (Labels, Buttons, Hinweise, Symbolpalette, Statuszeile, Legende im
  Topo-SVG inkl. „Dauer“/„Max. Abseil“/„Empfohlene Seillänge“/„Author“/„Datum“/„Legende:“) sofort und ohne
  Neuladen. Ausgenommen bleibt bewusst nur der feste Produktname „Canyoning Topo
  Generator“ im Kopfbereich. Nicht übersetzt werden ausserdem technische
  Segmenttyp-Codes (z. B. `RAPPEL_DRY`), die kurzen Legenden-Abkürzungen
  (R/J/… sowie „(ri)“/„(le)“) und Konsolenmeldungen — diese sind absichtlich
  sprachneutral, damit Datenformate und Fehlerdiagnose unverändert bleiben.
  Die gewählte Sprache ist Teil der Ansichtseinstellungen, wird wie Layout/Stil/Format
  in `localStorage` gespeichert und wirkt nicht auf das Topo-Modell selbst. Standard
  ist Deutsch; ohne Auswahl bleibt jedes bestehende Topo bytegleich wie zuvor.
- **Klappbare Seitenleisten**: Topo, Segmente, Foto-Referenz, Auswahl,
  Symbole und Prüfung lassen sich einzeln per Klick auf die Überschrift oder mit
  Tab und Enter/Leertaste öffnen und schliessen. ◀ bedeutet offen, ▶ geschlossen.
  Anfangs sind alle Abschnitte offen; der individuelle Zustand bleibt in diesem
  Browser über `localStorage` erhalten, unabhängig von Topo-Daten und Exporten.
  AI-Erkennung ist ein eingerückter, separat klappbarer Unterabschnitt von
  Foto-Referenz; ihre Überschrift hat dieselbe Schrift wie „Einstellungen“ darunter.
  Das Schliessen der Foto-Referenz versteckt auch AI-Erkennung;
  beim erneuten Öffnen bleibt deren eigener Klappzustand erhalten.
  Auch bei einer neuen Auswahl oder einem neuen Topo bleiben geschlossene Abschnitte
  geschlossen. Ist Browserspeicher nicht verfügbar, funktioniert das Klappen
  weiterhin, aber ohne Speicherung.
- **Responsiv (Smartphone, Tablet, Desktop)**: Ab 1200 px bleibt das dreispaltige
  Desktop-Layout unverändert. Auf Tablets (768–1199 px, hoch und quer) steht die
  Zeichenfläche in voller Breite oben, die beiden Seitenleisten zweispaltig darunter.
  Auf Smartphones (unter 768 px) ist alles einspaltig: Die Leiste
  *Bearbeiten | Topo | Symbole* schaltet zwischen linker Seitenleiste, Zeichenfläche
  und rechter Seitenleiste um (Tabs, per Pfeiltasten/Pos1/Ende bedienbar); der Knopf
  *☰ Menü* klappt Datei- und Ansichtsaktionen ein und aus, Undo/Redo bleiben
  immer sichtbar. Auf Touchgeräten sind Knöpfe und Abschnittsüberschriften mindestens
  44 px hoch, Eingabefelder nutzen 16 px Schrift (kein iOS-Auto-Zoom). Die Zeichenfläche
  arbeitet mit Pointer Events: Antippen wählt aus, Ziehen verschiebt Elemente ohne die
  Seite zu scrollen; ausserhalb der Elemente scrollt und zoomt der Browser normal.
  Druck und Exporte sind davon nicht betroffen.
- **Speichern…**: Die Auswahl bündelt **JSON speichern**, **XML speichern**,
  **SVG**, **PNG**, **Kurzliste**, **Drucken / PDF** und den Platzhalter
  **Auf OC speichern**. **Kurzliste** lädt
  `<canyon-name>-kurzliste.txt` (UTF-8) herunter: ein Shortcut pro Segment in
  Topo-Reihenfolge, z. B. `W120` oder `RD12.5`, mit denselben Kürzeln wie das Eingabefeld.
  Angegeben wird die tatsächliche Länge, auch wenn die Darstellung verkürzt ist.
  **TXT speichert ausschliesslich Segmenttypen und Längen**; Metadaten, Winkel,
  Symbole, Gehzeiten, Tiefen und andere Einstellungen fehlen. Bei unbekannten
  Typen oder fehlenden, nicht endlichen bzw. nicht positiven Längen wird keine
  unvollständige Datei erzeugt; die Statuszeile nennt die betroffenen Segmente.
  Ein leeres Topo wird ebenfalls nicht exportiert.
  Über **Öffnen…** lassen sich `.txt`-Kurzlisten als neues Topo öffnen. Dabei
  erhalten alle nicht enthaltenen Daten Standardwerte; für vollständige Topos
  JSON oder XML verwenden. Punkt und Komma, Gross-/Kleinschreibung, Leerzeilen
  und übliche Zeilenenden sind erlaubt; alte `WA`-Einträge sind ungültig und
  müssen vor dem Import durch `W` ersetzt werden.
  Auch das frühere Format wie
  `2. RAPPEL_DRY: 12.5 m` wird für bekannte Typen importiert. Ungültige Zeilen
  werden mit Zeilennummern gemeldet und es wird nichts teilweise importiert.
  Frühere Kurzlisten können bereits beim damaligen Export ungültige Längen
  ausgelassen haben; solche fehlenden Segmente lassen sich nicht rekonstruieren.
  Die Auswahl bleibt auch auf Smartphones direkt
  erreichbar, unabhängig vom Toolbar-Menü. Tab oder Pfeiltasten/Pos1/Ende wählen
  eine Aktion; Escape, Klick ausserhalb oder Fokuswechsel schliessen die Auswahl.
- **Freies Symbolziehen**: Das ursprüngliche SVG-Ziel bleibt während der Maus-
  oder Touchgeste verbunden. Blattmasse und Layout bleiben währenddessen fest;
  beim Loslassen wird das normale Layout neu berechnet, die Kamera hält jedoch
  Symbolposition und sichtbaren Massstab konstant (auch A4). Die bestehende
  Viertelmeter-Rundung, lokale Segmentkoordinaten, Bereichsspannen und ein
  Undo-Schritt pro Drag bleiben erhalten. Scrollen/Pinch ausserhalb der Symbole
  bleibt nativ; ein echtes `pointercancel` beendet die Geste am letzten Stand.
- **Zufall**: Knopf *Zufall* erzeugt per Klick ein vollständiges Demo-Topo — mit
  jedem Segmenttyp und jedem Symbol der Palette mindestens einmal

**Alpin klassisch** ist ein zusätzlicher, optionaler Darstellungsstil mit blaugrauer
Terrain-Schattierung, feiner dunkler Linienführung, zurückhaltend blauen Wasserflächen
und kompakter Symbolzeichnung. Er umfasst auch Streckensymbole wie Rappel Guide, Wege
und Seilgeländer. Wie Layout und Papierformat ist die Stilwahl eine Ansichtspräferenz:
sie wird im Browser-Autosave gespeichert, aber nicht in die inhaltskompatiblen
Canyon-Explore-JSON/XML-Dateien geschrieben.

**Standard** (Stil-Key `eau_froide`) ist ein weiterer Stil nach dem Vorbild des Topos „Eau Froide“:
weisser Hintergrund, hellgrau marmorierter Fels (deterministisches SVG-Pattern) mit
schwarzer Kontur, cyanfarbene Kaskaden und Becken (`#00ffff`), leuchtend grüne Bäume
(`#00ff00`) mit Zweigstruktur, rote Anker-Punkte (`#ff0000`) mit fettem RG/RD, graue
Blöcke mit Schattierung, braune Holzkreuze (`#993300`), dunkelrote Strassen/Pfade
(`#800000`), Hütte mit rotem Dach, rot-weisses Warndreieck, Läufer-Piktogramm sowie ein
Titelkasten mit grauem Schlagschatten. Auch dieser Stil ist nur eine Ansichtspräferenz
im Autosave und ändert JSON/XML nicht.

**Bleistiftskizze** (Stil-Key `pencil_sketch`) stellt das Topo wie eine Handzeichnung
dar: alle Farben (Terrain, Wasser, Symbole) werden deterministisch über eine
Luminanz-Formel in Graphit-Grautöne umgerechnet, das Gelände bekommt eine
diagonale Schraffur statt Flächenfüllung, und die Geländelinie wird als drei
leicht versetzte, unterschiedlich deckende Striche gezeichnet, um einen
handgezeichneten Mehrfachstrich nachzuahmen. Alles ist ohne Zufall berechnet,
damit Export/Druck/Tests weiterhin bytegleich reproduzierbar bleiben. Auch
dieser Stil ist nur eine Ansichtspräferenz im Autosave und ändert JSON/XML nicht.

Die frühere Stilwahl Schwarz/Weiß wird beim Wiederherstellen des Autosaves
durch Farbe ersetzt; das gespeicherte Topo bleibt unverändert.

In Farbe und Alpin klassisch zeigt das rechte Fluchtweg-Schild
eine nach rechts laufende Person links und einen getrennten Rechtspfeil rechts.
Kopf, Arme und Beine bleiben klar erkennbar; Beschriftung und Gehzeit stehen
aufrecht. Das linke Schild und Standard (`eau_froide`) bleiben unverändert.

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

### XML über einen Link öffnen

Ein Webserver kann eine XML-Datei beim Start direkt öffnen, zum Beispiel
`http://localhost:8080/index.html?source=examples/staubbach.xml` (Server im
Verzeichnis `canyoningtopogen`). Relative Pfade beziehen sich auf die Seite;
`/examples/staubbach.xml` bezieht sich auf das Root der Website. Nur XML-Dateien
derselben HTTP(S)-Origin ohne Zugangsdaten sind erlaubt; Weiterleitungen werden
abgelehnt. XML muss wohlgeformt sein und darf keine DTD enthalten; die übliche
Topo-Validierung wird weiterhin im Editor angezeigt. Lade- und Importfehler
lassen das aktuelle Topo unverändert. Beginnt die Bedienung vor der Antwort,
wird das Laden verworfen.

Ein per Link geöffnetes Topo ist eine temporäre Sitzung: Autosave ist darin
deaktiviert, auch nach weiteren Änderungen oder Aktionen. Änderungen deshalb
manuell speichern. Der vorherige lokale Entwurf bleibt erhalten und wird beim
erneuten Öffnen der App ohne `source` und API-Parameter wiederhergestellt; innerhalb
der Sitzung ist er auch über Rückgängig erreichbar.

### Topo-Metadaten über eine API laden

`index.html?apiURL=https%3A%2F%2Fapi.example.com%2Ftopo%3Fid%3D42`
ruft beim Start die angegebene HTTP(S)-Adresse per GET ab. Die URL kann auch
relativ zur App sein. Alternativ wird `apiUrl` unterstützt. Sind beide angegeben,
hat `apiURL` Vorrang, auch wenn dieser Wert leer ist. Die API-Adresse muss als
Parameterwert URL-kodiert sein, insbesondere eigene `?` und `&`. Erwartet wird
ein direktes JSON-Objekt, zum Beispiel
`{"name":"Staubbach","time_trip":"4 STD","max_descent":175,"ropes":"2 x 200 m"}`.
`name`, `time_trip` und `ropes` (empfohlene Seillänge) sind Texte;
`max_descent` ist eine nichtnegative endliche Meterzahl
(auch als numerischer Text). Fehlende oder null-Felder bleiben unverändert;
ungültige Felder verhindern die gesamte Metadatenübernahme. Segmente und übrige
Topo-Felder bleiben unverändert.

Mit `source` und `apiURL` wird zuerst das XML geöffnet und danach werden die
API-Metadaten darübergelegt. Schlägt das XML fehl, wird die API nicht aufgerufen;
bei API-Fehler bleibt das bereits geladene XML sichtbar. Beginnt die Bedienung
während des Ladens, werden spätere Antworten verworfen. Wie beim XML-Link ist
der bisherige Autosave geschützt: Nach erfolgreicher Übernahme Änderungen
manuell speichern; den Entwurf durch Öffnen ohne `source`, `apiURL` und `apiUrl`
wiederherstellen.

Der API-Anbieter muss für fremde Origins CORS erlauben. Zugangsdaten in der URL,
Browser-Credentials und Weiterleitungen werden nicht unterstützt; HTTPS-Seiten
benötigen eine HTTPS-API. Keine vertraulichen Schlüssel in URLs einfügen, da
URLs beispielsweise im Browserverlauf gespeichert werden können.
Bei einem Netzwerk-, CORS- oder Weiterleitungsfehler kann der Browser den
HTTP-Status unter Umständen nicht auslesen. In diesem Fall Erreichbarkeit,
CORS-Freigabe und Weiterleitungen beim API-Anbieter prüfen.

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
| `recommended_rope_length` | optionale empfohlene Seillänge als Freitext, z. B. `2 x 40 m`; wird in der Legende angezeigt |
| `date` | Datum (ISO, `YYYY-MM-DD`) |
| `maximum_walk_length` | optionale maximale Abseillänge in Metern; reine Legendenangabe, beeinflusst Zeichnung und Layout nicht |
| `distance_of_single_line` | Zeilenbreite in Metern für das Format *Bildschirm* (bei *Kaskadiert* als Zielhöhe einer Spalte); bei A4 wird das Mass aus dem Format abgeleitet |
| `legend_offset_top` | vertikaler Versatz der Legende in Metern |
| `legend_offset_left` | optional: horizontale Lage der frei verschobenen Legende (linke Kastenkante ab linker Zeichenkante, Meter); fehlt der Wert, steht die Legende automatisch rechts oben |
| `length_shortening_threshold_meters` | optionaler Schwellenwert für zeichnerisch verkürzte Segmentlängen; nur bei aktivierter Verkürzung exportiert |
| `segments` | Liste der Abschnitte, von oben nach unten |

### Segment

| Feld | Bedeutung |
| --- | --- |
| `type` | `WALK`, `POOL`, `RAPPEL`, `RAPPEL_DRY`, `RAPPEL_WET`, `JUMP`, `SLIDE`, `CLIMB` |
| `length_in_meters` | reale Länge |
| `angle_in_degrees` | 0 = flach nach rechts, 90 = senkrecht nach unten, > 90 = überhängender Untergrund; bei RAPPEL bleibt der Abseilpfeil senkrecht |
| `duration_to_walk_in_min` | optionale Gehzeit; im Inspector nur bei `WALK` sichtbar (siehe [Gehzeit](#gehzeit)) |
| `wall_distance_in_meters` | nur `RAPPEL`, `RAPPEL_DRY`, `RAPPEL_WET`: grösster Abstand zwischen frei hängendem Seil und Wand; 0 = Seil liegt an (siehe [Wanddistanz](#wanddistanz)) |
| `depth_in_meters` | optionale Gumpentiefe, nur `POOL`: `null` = unbekannt, Zahl >= 0 (siehe [Gumpentiefe](#gumpentiefe)) |
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
| Verankerung | `BOLT`, `BOLT_LEFT`, `BOLT_RIGHT`, `RAPPEL_GUIDE` (Rappel Guide, RG) |
| Gefahren | `SHARP_EDGE`, `TRAPPED_STONE`, `BACKWATER`, `WARNING_AND_TEXT`, `DEATH_HAZARD` (Lebensgefahr), `TREE_JAM` (Baumverhau), `BOULDER_JAM` (Felsblockverhau), `ROCKFALL` (Steinschlag), `UNDERCUT` (Unterspülung), `DANGEROUS_CURRENT` (gefährliche Strömung), `SIPHON` |
| Natur | `STONE`, `TRUNK`, `BUSH`, `LEAF_TREE`, `CONIFER_TREE` (beide auch abgestorben), `CAVE`, `INLET_LEFT`, `INLET_RIGHT` |
| Infrastruktur | `LADDER`, `STONE_BRIDGE`, `WOODEN_BRIDGE`, `STONE_HOUSE`, `HELICOPTER` (Helikopter), `RADIO_MAST` (Funkmast), `LIFT_MAST` (Liftmast), `SQUARE_CONCRETE_BASE` (Betonsockel eckig), `STEEL_BEAM` (Stahlträger), `WATER_DIVERSION` (Wasserableitung), `ROPE_RAILING_LEFT`, `ROPE_RAILING_RIGHT`, `PATH` (Pfad), `ROAD` (Weg / Strasse) |
| Beschriftung | `ELEMENT_NUMBER`, `CUSTOM_TEXT`, `ESCAPE_EXIT_LEFT`, `ESCAPE_EXIT_RIGHT`, `BYPASS` (Umgehung), `ENTRY_POINT` (Einstieg), `EXIT_POINT` (Ausstieg) |

Der Helikopter ist ein frei platzierbares Punktsymbol mit Rotoren, Kabine und Kufen.
Wie andere Punktsymbole lässt er sich verschieben, skalieren und beschriften;
Position und Größe bleiben beim JSON-/XML-Speichern sowie Undo/Redo erhalten.

Streckenelemente (`ROPE_RAILING_*`, `RAPPEL_GUIDE`, `PATH`, `ROAD`) benötigen zusätzlich die
`*_end_*`-Koordinaten. `PATH` und `ROAD` schreiben ein vorhandenes `text` mittig
über die Strecke (Wegname, Ziel); `RAPPEL_GUIDE` zeichnet eine gerade Füh­rungs­linie
zwischen Start und Ende mit der Kennung `RG` und einem Richtungspfeil zum Endpunkt;
alle übrigen neuen Symbole beschriften sich
oberhalb des Zeichens, wenn `text` gesetzt ist.

Die Gefahrenzeichen folgen der üblichen Schluchtentopo-Legende, sind aber eigens
gezeichnet: `DEATH_HAZARD` warnt vor der Stelle selbst (tödliche Folge), während
ein abgestorbener Baum (`dead`) vor einer untauglichen Verankerung warnt. Was
bereits ein Segmenttyp abbildet (Wehr, Gumpe, Abklettern, Gehpassage), gibt es
bewusst nicht doppelt als Symbol.

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
  zeichnet der Renderer die Zeit („25 min") unter das Fluchtweg-Schild, in allen
  Darstellungsstilen.

> **Hinweis zur Kompatibilität:** Die Gehzeit am Symbol ist – wie `dead` – eine
> Erweiterung gegenüber Canyon-Explore. Sie wird nur geschrieben, wenn sie
> gesetzt ist, und ein Typwechsel weg vom Fluchtweg räumt sie auf.

## Zeilenumbruch

Im Layout **Serpentine** verteilt der Generator die Segmente selbständig auf Zeilen.

- **Zielbreite**: Beim Format *Bildschirm* gilt `distance_of_single_line`. Bei den Papierformaten
  (*A4/A5 quer/hoch*) wird die Zeilenbreite gesucht, deren fertiges Blatt (inklusive Rand und
  Legendenspalte) dem Seitenverhältnis des Formats am nächsten kommt. *A4 hoch* (bzw. *A5 hoch*) ergibt
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

## Kaskadiert (Spalten)

Das Layout **Kaskadiert (Spalten)** arbeitet wie die Serpentine, teilt die Segmente aber
nach ihrer **Höhe** auf Spalten auf statt nach ihrer Breite auf Zeilen.

- **Fluss**: Innerhalb einer Spalte läuft das Topo mit seiner echten Geometrie von oben
  nach unten. Beim Spaltenwechsel beginnt das nächste Segment wieder **oben** in der
  nächsten Spalte **rechts** daneben. Alle Spalten laufen gleich, ohne abwechselnde
  Richtung; Fortsetzungsmarken `(l)` stehen am Spaltenende und -anfang.
- **Höhenbedarf** je Segment: `|sin(Winkel)| · gezeichnete Länge` plus die Wanddistanz,
  soweit sie in die Höhe ausweicht (`|cos(Winkel)| · wall_distance_in_meters`). Flache
  Gehstücke kosten keine Höhe, machen die Spalte aber breiter.
- **Zielhöhe**: Beim Format *Bildschirm* dient `distance_of_single_line` als generisches
  Aufteilungsmass je Spur, hier also als Spaltenhöhe — ein eigenes Dateifeld gibt es
  bewusst nicht. Bei den Papierformaten (*A4/A5 quer/hoch*) werden Kandidatenhöhen (Basiswert und die
  ausgeglichenen Teilungen der Gesamthöhe in 1…n Spalten) durchprobiert; gewählt wird die
  Höhe, deren fertiges Blatt inklusive Rand und Legende dem Seitenverhältnis am nächsten
  kommt. *A4 hoch* bekommt dadurch typischerweise höhere und weniger Spalten als *A4 quer*.
- **Aufteilung**: dieselbe Dynamische Programmierung wie bei den Zeilen (minimale Summe der
  quadrierten Resthöhen), also ausgeglichen statt gierig.
- **Umbruch-Flags**: *Zeilenumbruch erzwingen* erzwingt hier einen **Spaltenwechsel**,
  *Umbruch verhindern* hält die Segmente in **derselben Spalte** — auch über die Zielhöhe
  hinaus; das Blatt wächst dann mit. Im Konflikt gewinnt wie immer das Erzwingen.
- **Geometrie**: Die Breite jeder Spalte ergibt sich aus den tatsächlichen Ausdehnungen
  (Symbole, Endpunkte von Streckensymbolen, Ausbeulung der Wanddistanz). Zwischen den
  Spaltenkästen liegt ein konstanter Abstand, jede Spalte beginnt oben bündig — auch wenn
  Symbole über den Start hinausragen. Die Geländefüllung bleibt je Spalte in ihrem Kasten,
  die Legende steht rechts neben der letzten Spalte.
- **Ziehen**: Während ein Symbol gezogen wird, bleiben Spaltenzuordnung, Spaltenlage und
  Blattgrösse eingefroren (das Blatt darf nur wachsen) — wie bei der Serpentine.

Einschränkung: Sehr flache Schluchten (viel Gehen, wenig Höhe) ergeben breite Spalten; hier
nutzt die Serpentine das Format meist besser.

### Zufalls-Topo

Die Aktion **Zufall** in der Auswahl *Neu* erzeugt bei jedem Klick ein neues, zufälliges
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

Die Legende zeigt oben den Titel und — sofern gefüllt — die `duration`, maximale
Abseillänge und empfohlene Seillänge, darunter die Abkürzungen der verwendeten
Segmenttypen. **`author` und das Datum schliessen die
Legende ab**, in dieser Reihenfolge, nach dem letzten Legendeneintrag. Das Datum wird
lesbar als `TT.MM.JJJJ` ausgegeben (ein Nicht-ISO-Wert bleibt unverändert stehen).
Leere Werte erzeugen keine Zeile; Legendenkasten, Blattbreite und Blatthöhe wachsen mit
dem Inhalt, damit nichts überlappt oder abgeschnitten wird — in jedem Format und Stil
und damit auch in jedem Export. Änderungen an Name, Author, Dauer
Datum und empfohlener Seillänge erscheinen sofort beim Tippen im Topo.

**Frei verschiebbar:** Die Legende lässt sich mit Maus oder Finger an jede Stelle im
Topo ziehen (Raster 0,25 m, mit Rückgängig). Die Lage landet in `legend_offset_left`
und `legend_offset_top` und wird mit JSON und XML gespeichert. Das Blatt wächst mit,
die Zeilenaufteilung bleibt unverändert. Eigene Eingabefelder für den Versatz gibt es
nicht mehr; ohne gespeicherte Lage steht die Legende automatisch rechts oben.

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

### Gumpentiefe

Bei `POOL` zeigt der Inspector **Tiefe (m)**. Leer bedeutet unbekannt (`null`);
negative oder ungültige Werte werden ebenfalls `null`, Zahlen als Text werden
akzeptiert. Ein Typwechsel weg von `POOL` löscht die Tiefe.
Nur gesetzte Werte (auch `0`) werden in JSON/XML geschrieben; ohne Tiefe bleiben
Dateien, Zeichnung und Layout unverändert.

### Verkürzung langer Strecken

`length_shortening_threshold_meters` wird in der UI im Abschnitt *Topo* bei den
Legenden-Offsets über **Segmente verkürzen ab (m)** eingegeben. Die Änderung wirkt
bereits während der Eingabe live auf das Topo; eine zusammenhängende Eingabe bildet
einen Undo-Schritt. Für Segmente über dem positiven Schwellenwert nutzt
das Layout die gekappte Länge; die Werte bis einschliesslich Schwelle bleiben
unverändert. Das Doppelbruchzeichen bleibt auf der geometrischen Segmentmitte;
seine Striche laufen immer als `//` von links unten nach rechts oben (45° im
SVG), unabhängig von Segmentrichtung, Stil oder Layout. Die Striche sind
symmetrisch senkrecht zu ihrer eigenen Richtung versetzt, damit sie auch auf
parallel steigenden Segmenten erkennbar bleiben. Das Label zeigt weiterhin
die Original-Länge. Verkürzte Gehstrecken (`WALK`) haben kein eigenes
Längen-Label; über ihnen steht deshalb die echte Länge als `|← 120 m →|`
(nicht die Gehzeit). Bereichselemente werden mit dem Segment
proportional mitskaliert.

Die Einstellung ist optional und standardmässig leer; `0` und leer deaktivieren
die Kürzung und werden im JSON/XML nicht exportiert. Sie ist Teil des Topo-Modells,
Autosaves sowie Undo/Redo und bleibt in JSON/XML erhalten, wenn sie aktiviert ist.
Die Tiefe von `POOL`-Segmenten bleibt separat skaliert und wird nicht gekürzt:
ihre gezeichnete Beckenform ist eine stilisierte Darstellung und kein linearer
Meter-Massstab.

`maximum_walk_length` wird aus Kompatibilitätsgründen weiterhin im Modell sowie
in JSON/XML gespeichert. Es beeinflusst weder Geometrie noch Skalierung oder
Segmentdarstellung und erscheint bei positivem Wert nur als **Max. Abseil**
unter **Dauer** in der Legende.

Eine bekannte Tiefe wird in allen Stilen als **T 4 m** bzw. **T 2.5 m** unter der
Gumpe beschriftet. Die Zeichnung skaliert gedämpft: Der Kontrollpunkt der
Gumpenkurve liegt um `clamp(1 + 0.4 * Tiefe, 1.2, 5)` Meter tiefer; die
quadratische Kurve selbst ist flacher. Der Platz für Gumpe und Beschriftung wird
im Layout berücksichtigt. Ohne Angabe bleibt die bisherige Zeichentiefe `2.2`.
Die AI übernimmt nur explizit im Topo angegebene Tiefen, sie schätzt keine.
Zufalls-Topos enthalten gelegentlich Gumpentiefen von 1 bis 8 Metern.

### XML

Dateien mit dem entfernten Segmenttyp `WEIR` (auch alte TXT-Listen mit `WE`)
werden vollständig abgewiesen; das aktuelle Topo und die Quelldatei bleiben
unverändert. Ein automatisch gespeichertes WEIR-Topo bleibt im Browserspeicher
erhalten; in dieser Sitzung ist Autosave deaktiviert. Zur Weiterbearbeitung
eine ältere App-Version verwenden und das Topo dort exportieren. Andere
unbekannte Typen bleiben wie bisher erhalten. Das XSD lässt deshalb weiterhin
freie Typnamen zu; die App prüft WEIR beim Import. Die ursprünglichen
Beispieldateien liegen unverändert als `my-canyon-inferiore-legacy.*` vor;
das aktuelle Beispiel lässt das WEIR-Segment samt seinen Elementen weg.

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

Unter **Foto-Referenz → AI-Erkennung** schickt der Button **„Aus Foto erzeugen (AI)“** das geladene Referenzbild an ein
Vision-Modell und baut aus der Antwort ein Topo.

Der Abschnitt **AI-Erkennung** ist passwortgeschützt: Beim Aufklappen fragt ein Dialog
nach dem Passwort, erst danach sind Button und Einstellungen erreichbar. Die
Freischaltung gilt bis zum Schliessen des Tabs (`sessionStorage`). Im Code steht nur
der SHA-256-Hash des Passworts. Weil alles im Browser läuft, ist das eine Zugangshürde,
kein echter Schutz.

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

Einstellen unter *Foto-Referenz → AI-Erkennung → Einstellungen*. Der Button bleibt gesperrt, solange
etwas fehlt, und nennt im Tooltip den Grund.

Vorbelegt ist „OpenAI-kompatibel" mit dem Endpoint
`https://api.swisscom.com/products/swiss-ai-platform/internal-all-models/v1` und
dem Modell `qwen/qwen3.6-35b-a3b`. Ein leeres Endpoint- oder Modellfeld wird beim
Laden wieder mit diesen Vorgaben gefüllt; ein selbst eingetragener Wert bleibt
unverändert stehen. Wer noch die früheren Vorgaben `https://api.openai.com/v1`
bzw. `gpt-4o` gespeichert hat, bekommt sie beim Laden einmalig auf die neuen
Standards umgestellt — beide Felder unabhängig voneinander.

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

Der Prompt steuert Vorgehen und Ausgabe der Erkennung. Unter
*Foto-Referenz → AI-Erkennung → Einstellungen → Prompt-Vorlage* lässt er sich deshalb auswählen:

| Vorlage | Wofür |
|---|---|
| **Optimiert (empfohlen)** | Standard. Vorlagengetreue Rekonstruktion: ganze Seite und Legende prüfen, Spalten/Fortsetzungen in eine Abstiegsfolge bringen, jede erkennbare Symbolinstanz samt Beschriftung und lokaler Geometrie erfassen; nur belegte Messwerte übernehmen. Vollständiger Typkatalog, Strukturprüfung und Beispiel-JSON. |
| **Kompakt** | Kurzfassung für kleine Modelle oder enges Kontextfenster, inkl. Kurzregel zu kaskadierten Topos. |
| **Bisheriger Prompt** | Der Prompt vor der Überarbeitung — zum Vergleichen. Seine Typlisten sind eingefroren, damit er als Massstab wortgleich bleibt; neue Symbole stehen nur in den aktiven Vorlagen. |
| **Eigener Prompt** | Freitext, vorbelegt mit der optimierten Vorlage. |

Die Erkennung verarbeitet ein Foto oder die **ausgewählte, gerenderte PDF-Seite**,
nicht automatisch das gesamte PDF. Die Legende erklärt Symbole, wird aber nicht
als Route übernommen. Wiederholte Symbole bleiben erhalten; Links/Rechts gilt in
Abstiegsrichtung. Explizite Fortsetzungen haben Vorrang vor der üblichen
Spaltenleserichtung. Umbruchflags erhalten Abschnittsgrenzen; den passenden
Layoutmodus (z. B. *Kaskadiert*) wählt man weiterhin in der Darstellung.

Unbekannte Gehzeiten und Gumpentiefen bleiben `null`. Das bestehende Format hat
für Länge, Winkel und Wanddistanz keine unbekannten Zahlenwerte und keinen
`warnings`-/`evidence`-Vertrag: notwendige App-Darstellungsdefaults werden daher
mit `CUSTOM_TEXT` und dem Präfix **AI-Hinweis:** ausdrücklich gekennzeichnet,
nicht als erkannte Messwerte ausgegeben. Auch nicht darstellbare Details werden
so benannt. Keine Pixelkoordinaten als Meter, keine erfundenen Routen aus reinen
Landschaftsfotos. Originaltexte bleiben in passenden Textfeldern; bei Symbolen
ohne sichtbaren Textslot oder automatisch neu nummerierten Markern hilft
zusätzlicher Freitext.

Ein Prompt garantiert **keine exakte Bildrekonstruktion**: Lesbarkeit,
Modellqualität, schematische Massstäbe und das Format (z. B. keine freie
Punktsymbolrotation/Seitenpositionierung) begrenzen das Ergebnis. Gegen die
Vorlage prüfen; Darstellungsdefaults sind keine Planungs- oder Sicherheitsdaten.
Lokale Regressiontests prüfen Regeln, Schema und Provider-Weitergabe, nicht die
Erkennungsqualität eines Modells anhand eines Bildbenchmarks.

Die Listen der gültigen Segment- und Symboltypen erzeugt `src/ai.js` aus
`src/model.js` und `src/symbols.js`. Neue Typen stehen damit automatisch in den
Vorlagen *Optimiert* und *Kompakt* — nichts ist doppelt gepflegt. Nur die Vorlage
*Bisheriger Prompt* führt ihre historischen Listen fest mit, damit der Vergleich
byte-identisch bleibt; der Import erkennt die neuen Typen unabhängig davon.
Die Legende und der lokale Kontext der Vorlage haben Vorrang. Ohne abweichenden
Beleg gilt das Kodierungs-Mapping vor den Kurzlabels im Katalog:
`C` als Cascade bedeutet `RAPPEL_WET` (nicht `CLIMB`),
`T`/`TP` als Toboggan bedeutet `SLIDE`, `R`/`Rd`/`Rw` entsprechen
`RAPPEL`/`RAPPEL_DRY`/`RAPPEL_WET` und `MC` (Main-Courante) wird je nach
Lage als `ROPE_RAILING_LEFT` oder `ROPE_RAILING_RIGHT` erfasst.
`RG` (Rappel Guide) wird als `RAPPEL_GUIDE` kodiert.

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

### Denkmodelle (Qwen3 & Co.)

Modelle mit Denkmodus — etwa `qwen/qwen3.6-35b-a3b` auf vLLM — denken vor der
Antwort laut. Beim langen Topo-Prompt verbrauchen sie dabei das gesamte
Token-Budget: `content` bleibt leer, `finish_reason` ist `length`, und die App
meldete früher nur „Upstream-Antwort enthielt keinen Text“.

Darum schicken App, Proxy und Worker bei OpenAI-kompatiblen Aufrufen
`chat_template_kwargs: {"enable_thinking": false}` mit. Kennt ein Gateway diesen
vLLM-Parameter nicht und lehnt ihn ab, wird der Aufruf einmal ohne ihn
wiederholt — genau wie beim JSON-Modus, und beides ist kombinierbar. Das
Antwortbudget liegt bei 8000 Tokens, damit auch lange Topos vollständig
ankommen. Bleibt der Text trotzdem leer, nennt die Fehlermeldung den Grund
(aufgebrauchtes Token-Budget) statt nur „kein Text“. Anthropic bleibt unverändert.

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

Dann **http://127.0.0.1:8787/** öffnen und unter *Foto-Referenz → AI-Erkennung → Einstellungen*
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
  (klammerzählender Scanner, robust gegen `{` `}` in Strings). Liefert ein Modell
  mehrere Objekte hintereinander — manche stellen ein leeres `{}` voran —, gewinnt
  das grösste mit einem `segments`-Array.
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
src/i18n.js           Übersetzungswörterbücher (DE/EN/FR/IT/ES) und Anwendungshelfer
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
src/panel-sections.js Klappbare Seitenleisten-Abschnitte mit Persistenz
src/ai-lock.js        Passwortabfrage beim Aufklappen der AI-Erkennung
src/responsive.js     Smartphone-Tabs, Toolbar-Menü und Speichern-Auswahl
tools/proxy.mjs       Lokaler AI-Proxy (löst CORS) + serviert die App
tools/worker.js       Derselbe Proxy als Cloudflare Worker
tools/autostart.sh    Proxy ab Login mitlaufen lassen (LaunchAgent/systemd)
test/                 Round-Trip-, Layout-, Zufalls-, UI-, AI- und Proxy-Tests
examples/             Beispiel-Topo (JSON + XML)
vendor/pdfjs/         pdf.js (Apache-2.0), lokal eingebunden
topo.xsd              XML-Schema
```

## Hinweise

- Texte bleiben im Modell und in JSON als Original erhalten. Bei HTML-/SVG- und
  XML-Ausgabe werden sie für den jeweiligen Kontext kodiert; XML-Attribute
  erhalten dabei auch Tabulatoren und Zeilenumbrüche. KI-Endpoints müssen absolute
  HTTP- oder HTTPS-URLs sein. Das macht einen Endpoint nicht automatisch
  vertrauenswürdig: Bei der KI-Nutzung gehen Bild und Prompt an den gewählten
  Dienst und gegebenenfalls auch der API-Key.
- Alle Symbole sind eigens gezeichnet; es werden keine fremden Assets verwendet.
  Einzige Fremdbibliothek ist pdf.js unter `vendor/pdfjs/` (Apache-2.0).
- Die Layout-Regeln der Referenz-App sind nicht dokumentiert und wurden aus Beispieldatei
  und gerendertem Topo rekonstruiert — Abweichungen im Detail sind möglich, die Daten
  bleiben aber vollständig kompatibel.
- Ohne AI-Erkennung verlassen Foto, PDF und Topo den Browser nicht. Die AI-Anfrage
  enthält das Referenzbild, den Prompt und gegebenenfalls Hinweise zum Topo.
- Ein in der App eingetragener API-Key liegt im `localStorage` dieses Browsers und
  wird an den konfigurierten Dienst beziehungsweise beim Fallback an den lokalen
  Proxy gesendet. Für gemeinsam genutzte Rechner ist ein entsprechend abgesicherter
  Proxy mit serverseitigem Key vorzuziehen.
