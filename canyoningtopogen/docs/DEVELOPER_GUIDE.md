# Einstieg für Entwicklerinnen und Entwickler

Dieser Leitfaden führt durch den Canyoning Topo Generator, damit man eine
Änderung vom sichtbaren Eingabefeld bis zur gespeicherten oder exportierten
Datei verfolgen kann. Die App ist eine statische Browser-Anwendung mit
JavaScript-ES-Modulen. Es gibt keinen Build-Schritt; `index.html` lädt die
Oberfläche und `src/app.js` verbindet sie mit den Fachmodulen.

## Loslegen

Im Projektordner `canyoningtopogen/`:

```sh
npm test
npm start
```

`npm start` startet den lokalen AI-Proxy und liefert zugleich die App unter
`http://127.0.0.1:8787/`. Ohne AI-Funktionen kann die statische App auch mit
einem lokalen Webserver geöffnet werden, zum Beispiel:

```sh
python3 -m http.server 8000
```

Dann `http://localhost:8000/` aufrufen. Module und PDF.js-Worker müssen über
HTTP geladen werden; ein direktes `file://`-Öffnen ist dafür nicht geeignet.
Die Tests sind Node-Testdateien unter `test/` und laufen mit dem eingebauten
Node-Test-Runner.

## Karte der Module

| Datei | Aufgabe |
|---|---|
| `index.html`, `styles.css` | DOM-Grundgerüst, IDs für die Bindings und visuelles Layout |
| `src/app.js` | Anwendungsstart, Editorzustand, DOM-Ereignisse, Undo/Redo, Speichern und Verbindung der Module |
| `src/model.js` | Kanonisches Datenmodell, Standardwerte, Normalisierung und fachliche Validierung |
| `src/layout.js` | Meterkoordinaten, Segmentplatzierung und Aufteilung in Zeilen oder Spalten |
| `src/sheet.js` | Papierformate, Legendeninhalt und gemeinsame Blatt-/Legenden-Bounds |
| `src/renderer.js` | Umwandlung von Modell plus Layout in SVG |
| `src/symbols.js` | SVG-Zeichenfunktionen und Symbolpalette |
| `src/i18n.js` | UI-Texte, Beschriftungen und Übersetzungen |
| `src/io-json.js`, `src/io-xml.js` | JSON- und XML-Import/-Export |
| `src/io-shortlist.js` | Verlustarme Segment-Kurzliste im TXT-Format |
| `src/exporters.js` | Browser-Downloads, SVG-zu-PNG und Druckdialog |
| `src/pdf.js` | Lokales Rendern einer PDF-Seite als Referenzbild |
| `src/ai.js`, `src/ai-lock.js` | AI-Einstellungen, Prompt, Provider, Antwortbereinigung und UI-Zugangshürde |
| `src/panel-sections.js`, `src/responsive.js` | Persistenz klappbarer Bereiche und mobile Bedienung |
| `src/random-topo.js` | Vollständiges, reproduzierbares Demo-Topo |
| `tools/proxy.mjs`, `tools/proxy_flask.py`, `tools/proxy_flask_wsgi.py`, `tools/worker.js` | AI-Proxy-Varianten für lokal, Flask/WSGI und Cloudflare Worker |
| `tools/autostart.sh` | Einrichtung des lokalen Proxys als Login-Dienst |
| `test/` | Modell-Roundtrips, Layout, UI, Export, AI, Proxy und deterministische Zufallsdaten |

Die Module enthalten zusätzliche JSDoc-Kommentare zu ihren Schnittstellen und
zu den Stellen, an denen die Implementierung leicht missverstanden werden
kann. Für eine konkrete Aufgabe ist der beste Einstieg meist die passende
Datei aus der Tabelle, danach die dort importierten Helfer.

## Datenfluss: vom Formular bis zum SVG

1. `app.js` hält `state.topo` als normalisiertes Modell. Auswahl,
   Zoom-/Layout-Ansicht und Referenzfoto sind UI-Zustand und gehören nicht zu
   den Topo-Segmentdaten.
2. Eingaben ändern das Modell. Segment- und Elementauswahl referenzieren
   Indizes statt DOM-Knoten. Eine Änderung zeichnet anschließend erneut; bei
   einem gezogenen Element wird während des Pointer-Drags nur dessen SVG-Transform
   aktualisiert, damit der Pointer-Capture nicht verloren geht.
3. `model.js` beschreibt `topo.segments[]` und darin `segment.elements[]`.
   Segmentlängen, Symbolpositionen und Layoutkoordinaten sind Meter; Winkel
   sind Grad. Ein Streckenelement hat einen Anfang und optional ein Ende,
   während ein Punktsymbol an einem Anker sitzt.
4. `layout.js` berechnet zuerst die tatsächlich gezeichnete Länge und
   Platzierungsmasse. Für Zeilen und kaskadierte Spalten gruppiert es
   zusammenzuhaltende Segmente und respektiert erzwungene Schnitte. Die
   dynamische Programmierung versucht, freie Zeilenbreiten gleichmäßig zu
   verteilen, indem sie die Summe der quadrierten Restbreiten minimiert.
   `linear` lässt alle Segmente in einer Spur. Beim Ziehen wird ein
   Layout-`frame` wiederverwendet, sodass sich Umbrüche nicht mitten im Drag
   ändern.
5. `sheet.js` berechnet Bounds, Papier-Seitenverhältnis und Legendenabmessungen.
   Layout-Optimierung, Renderer und Ziehen der Legende verwenden diese
   gemeinsamen Helfer; getrennte Berechnungen würden zu abgeschnittenen
   Legenden oder unterschiedlichen Hitboxen führen.
6. `renderer.js` wandelt die Platzierungen und Symbole in SVG-Markup um.
   Das SVG kann interaktive `data-*`-Trefferflächen für die App enthalten oder
   als eigenständige Exportversion ohne diese Trefferflächen gerendert werden.
   SVG-Text wird für XML-Markup escaped. Einfacher UI-Text gehört in DOM-APIs
   wie `textContent`, nicht in `innerHTML`.

Die Stile verändern Farben und Symbolgestaltung, nicht das Topo-Modell oder
seine Geometrie. Ein nicht bekanntes Symbol bleibt als sichtbarer Platzhalter
erhalten, statt beim Laden still verloren zu gehen.

## Modell, Import und Export

`normalizeTopo(raw)` ist die gemeinsame Grenze für JSON-, XML- und AI-Daten.
Sie überführt Eingaben in dieselbe interne Form und ergänzt nötige
Darstellungs-Defaults. `validateTopo(topo)` meldet fachliche Probleme, ohne
das Modell dabei zu reparieren. Deshalb bedeutet „normalisiert“ nicht
automatisch „inhaltlich geprüft“.

Unbekannte Felder werden in `_extra` auf ihrer jeweiligen Ebene bewahrt und
von JSON/XML wieder ausgegeben. So kann eine ältere App Daten öffnen und
wieder speichern, ohne fremde Erweiterungen zu entfernen. Unbekannte
Elementtypen bleiben ebenfalls sichtbar. Der entfernte Typ `WEIR` wird dagegen
explizit abgewiesen, weil ihn als einen anderen Typ zu deuten die Daten
verfälschen würde.

- **JSON** verwendet das Canyon-Explore-Objektformat und ist das vollständige
  Datenformat.
- **XML** bildet dieselben Modellfelder auf Attribute von `<topo>`,
  `<segment>` und `<element>` ab. Der Importer ist ein kleiner Scanner für
  dieses App-Format, kein allgemeiner XML-Parser und keine XSD-Validierung.
  Externe DTDs werden nicht ausgewertet; `app.js` weist `DOCTYPE` beim
  Remote-XML-Laden zurück.
- **TXT-Kurzliste** enthält nur Segmenttyp und Länge. Metadaten und Symbole
  sind darin nicht darstellbar. Der Import sammelt Zeilenfehler und übernimmt
  nicht nur einen gültigen Teil. Der interaktive Shortcut-Parser ist
  toleranter als dieses Exportformat: `W20` ergibt ein 20-m-WALK-Segment,
  und `W20,R10` ergibt zwei Segmente. Dezimalkommas bleiben möglich, weil ein
  Batch-Trenner nur ein Komma vor dem nächsten Buchstaben ist.
- **SVG/PNG/Druck** werden aus dem aktuellen Modell erzeugt. PNG rastert das
  SVG im Browser; „Drucken / PDF“ öffnet den Browser-Druckdialog.

Beim Bearbeiten speichert `app.js` Undo/Redo als JSON-Snapshots des Topos.
Der Verlauf ist auf 80 Einträge begrenzt. Autosave in `localStorage` enthält
Topo, Ansichtsoptionen und Referenzbild. AI-Einstellungen, mobile Ansicht und
klappbare Bereiche nutzen getrennte Schlüssel. Das aktive PDF-Dokument lebt
nur im Speicher; gespeichert wird nur die gerenderte Seite. Die Datei selbst
wird nicht in den Autosave übernommen.

## Startparameter `source` und `apiUrl`

`app.js` liest beim Start `source`, `apiURL` und `apiUrl` aus der URL. Wenn
beide Schreibweisen der API-Option gesetzt sind, hat `apiURL` Vorrang. Ein
`source`-Wert muss auf eine XML-Datei desselben Origins zeigen. Bei
`source` plus API lädt die App zuerst dieses XML und legt anschließend die
API-Metadaten darüber; Segmentdaten und andere XML-Inhalte bleiben bestehen.

Die API kann entweder direkt die Metadaten enthalten oder sie unter `canyon`
liefern. Unterstützte Felder:

| API-Antwort | Topo-Modell/Feld |
|---|---|
| `name` | `canyon_name` |
| `time_trip` | `duration` |
| `max_descent` | `maximum_walk_length` |
| `ropes` | `recommended_rope_length` |
| `last_update_date` | `date` |

Beispiel mit synthetischen Daten:

```json
{
  "canyon": {
    "name": "Beispielbach",
    "time_trip": 255,
    "max_descent": 15,
    "ropes": "2 x 40 m",
    "last_update_date": "2026-08-14"
  }
}
```

`time_trip` wird ohne Einheitenumrechnung als Text angezeigt. Fehlende
Properties lassen bestehende Werte unangetastet; `null` leert Textfelder.
`last_update_date` akzeptiert ein echtes Kalenderdatum im Format `YYYY-MM-DD`;
`null` oder leer leert das Feld. Ein ungültiger Wert verwirft die ganze
Metadatenübernahme, nicht nur das einzelne Feld. Die API-Antwort wird vor der
Mutation geprüft und als Text behandelt, nie als HTML.

Während eines Link-Loads hat die erste Benutzerinteraktion Vorrang: verspätete
Antworten werden verworfen. Link-Sitzungen überschreiben den bisherigen
Autosave nicht; ohne Linkparameter wird der gespeicherte Entwurf normal
wiederhergestellt. Das ist absichtlich so, damit ein geteiltes XML/API-Linkziel
den lokalen Entwurf nicht dauerhaft ersetzt.

Für den API-Aufruf gelten Browser-Sicherheitsregeln: absolute oder relative
HTTP(S)-URL, keine URL-Zugangsdaten, keine Credentials/Browser-Cookies, keine
HTTPS-zu-HTTP-Abstufung und keine Redirects. Ein fremder API-Origin muss selbst
CORS erlauben. Die App baut keinen Proxy für dieses Metadaten-API-Mapping.
Signierte URL-Parameter sind Zugriffsdaten und gehören nicht in Logs,
Screenshots, Tests oder Dokumentation.

## Symbole und Layout erweitern

Bei einem **neuen Segmenttyp** zuerst `SEGMENT_TYPES` und Defaults in
`model.js` ergänzen. Shortcut und Kurzlabel folgen dem Muster in
`SEGMENT_SHORTCUTS` und `SEGMENT_LABELS`; danach die Bezeichnung in `i18n.js`,
Zeichenlogik in `symbols.js` oder Segmentdarstellung in `renderer.js`, falls
erforderlich. Prüfen, ob Typ-spezifische Regeln nötig sind, etwa Gehzeit,
Wanddistanz oder Gumpentiefe. Import/Export und `topo.xsd` aktualisieren,
wenn das neue Merkmal persistierte Felder benötigt.

Bei einem **neuen Punktsymbol** wird es in `symbols.js` in der passenden
Kategorie registriert. Zeichenfunktionen nutzen ein lokales Koordinatensystem
mit Anker `(0,0)` und ungefähr Meter als Einheit; der Renderer übernimmt
Translation und Skalierung. Ein Streckensymbol muss Anfang und Ende
verarbeiten. Nutztexte in SVG müssen mit dem bestehenden `esc`-Muster geschützt
werden. `symbolOptions()` leitet die Palette aus dem Katalog ab, damit
Katalog und Auswahl nicht unabhängig voneinander gepflegt werden.

Neue UI-Texte gehören in alle vorhandenen Sprachen (`de`, `en`, `fr`, `it`,
`es`) im `i18n.js`; kein sichtbarer Text sollte nur in einem Renderer fest
verdrahtet sein, wenn er zur Oberfläche oder Legende gehört.

## AI und Vertrauen

`ai.js` erstellt Prompts, sendet Bild und Prompt zum ausgewählten Provider und
bereinigt die Modellantwort, bevor `normalizeTopo` daraus ein Topo erzeugt.
Diese Bereinigung garantiert keine sachliche Richtigkeit: erkannte Messwerte
und Routen müssen anhand der Vorlage überprüft werden. Die PDF-Unterstützung
lädt pdf.js lokal aus `vendor/pdfjs/` und rendert nur die ausgewählte Seite.

Bei direktem AI-Zugriff liegt der Key im Browser-`localStorage` und wird an
den konfigurierten Anbieter gesendet. Der lokale Node-Proxy kann den Key
serverseitig halten, erlaubt aber standardmäßig Client-Konfiguration und ist
keine authentifizierte Sicherheitsgrenze. CORS ist keine Zugriffskontrolle.
Flask- und Worker-Varianten haben eigene Bindungs-/Deployment-Eigenschaften;
vor einem Netz- oder Cloud-Deployment die jeweiligen Datei-Header und
README-Sicherheitshinweise lesen. Niemals echte Schlüssel in Quelltext oder
Tests eintragen.

## Debugging und Tests

| Testdatei | Was sie absichert |
|---|---|
| `test/roundtrip.test.mjs` | JSON/XML/TXT, Modellnormalisierung und Format-Roundtrips |
| `test/layout.test.mjs` | Segmentplatzierung, Umbrüche, Papierformate und Geometrie |
| `test/ui.test.mjs` | DOM-Bindings, Startparameter, Status, Autosave und Interaktionen |
| `test/exporters.test.mjs` | Download- und Exportfunktionen |
| `test/ai.test.mjs`, `test/ai-lock.test.mjs` | Prompt-/Provider-Regeln, Antwortbereinigung und UI-Sperre |
| `test/proxy.test.mjs` | Proxy-Routen und Fehlerantworten |
| `test/random.test.mjs` | Seed-stabile vollständige Demodaten |

Bei einem UI-Fehler zuerst den DOM-Knoten und sein Binding in `index.html` und
`app.js` verfolgen. Bei falscher Darstellung prüfen, ob der Modellwert schon
vor `layoutTopo` falsch ist; ist er korrekt, die Platzierung in `layout.js`
und anschließend das erzeugte SVG in `renderer.js` untersuchen. Bei
Importproblemen Formatparser und danach `normalizeTopo` prüfen. Bei
Linkparametern `loadStartupLinks`, den Network-Tab und die Statusmeldung
ansehen; CORS-Fehler müssen vom API-Anbieter gelöst werden.

Wenn du einen Versionsparameter für lokale Module oder Assets änderst, müssen
`index.html`, die lokalen Modulimporte sowie PDF.js und sein Worker dieselbe
Cache-Version tragen. Der passende Test erkennt auseinanderlaufende Werte.
Eine reine Dokumentationsänderung braucht keinen Versionssprung.
