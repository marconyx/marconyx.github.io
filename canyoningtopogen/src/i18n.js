/**
 * Übersetzungen der Bedienoberfläche (DE/EN/FR/IT).
 *
 * Bewusst ein eigenes, reines Datenmodul ohne DOM-Zugriff: `app.js` liest die
 * Wörterbücher aus und schreibt sie in die konkreten Elemente. So bleibt
 * dieses Modul in Node-Tests (ohne echtes DOM) ebenso benutzbar wie im
 * Browser, und die Trennung hält die riesige Textmenge an einem Ort.
 *
 * Deutsch ist überall die erste Sprache UND der Standardwert jeder Anzeige
 * (leeres/undefiniertes `state.view.language`). Die deutschen Einträge sind
 * bewusst wortgleich mit dem bisherigen, fest codierten Text, damit bestehende
 * Tests und Baseline-SVGs ohne Sprachauswahl unverändert bleiben.
 */

export const LANGUAGES = ['de', 'en', 'fr', 'it'];
export const DEFAULT_LANGUAGE = 'de';

/** Ersetzt `{name}`-Platzhalter im Template durch `vars.name`. */
function format(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match,
  );
}

function pick(entry, lang) {
  if (!entry) return '';
  return entry[lang] ?? entry[DEFAULT_LANGUAGE] ?? '';
}

/** Statischer Text (`textContent`) je Element-ID. */
export const UI_TEXT = {
  'lbl-menu': { de: 'Menü', en: 'Menu', fr: 'Menu', it: 'Menu' },
  'lbl-language': { de: 'Sprache', en: 'Language', fr: 'Langue', it: 'Lingua' },
  'btn-new': { de: 'Neu', en: 'New', fr: 'Nouveau', it: 'Nuovo' },
  'btn-example': { de: 'Beispiel', en: 'Example', fr: 'Exemple', it: 'Esempio' },
  'btn-random': { de: 'Zufall', en: 'Random', fr: 'Aléatoire', it: 'Casuale' },
  'lbl-file-open': { de: 'Öffnen…', en: 'Open…', fr: 'Ouvrir…', it: 'Apri…' },
  'btn-save': { de: 'Speichern…', en: 'Save…', fr: 'Enregistrer…', it: 'Salva…' },
  'btn-save-json': { de: 'JSON speichern', en: 'Save JSON', fr: 'Enregistrer JSON', it: 'Salva JSON' },
  'btn-save-xml': { de: 'XML speichern', en: 'Save XML', fr: 'Enregistrer XML', it: 'Salva XML' },
  'btn-export-svg': { de: 'SVG', en: 'SVG', fr: 'SVG', it: 'SVG' },
  'btn-export-png': { de: 'PNG', en: 'PNG', fr: 'PNG', it: 'PNG' },
  'btn-export-shortlist': { de: 'Kurzliste', en: 'Short list', fr: 'Liste courte', it: 'Elenco breve' },
  'btn-print': { de: 'Drucken / PDF', en: 'Print / PDF', fr: 'Imprimer / PDF', it: 'Stampa / PDF' },
  'lbl-select-layout': { de: 'Layout', en: 'Layout', fr: 'Disposition', it: 'Layout' },
  'opt-layout-serpentine': {
    de: 'Serpentine (Zeilen)',
    en: 'Serpentine (rows)',
    fr: 'Serpentin (lignes)',
    it: 'Serpentina (righe)',
  },
  'opt-layout-cascaded': {
    de: 'Kaskadiert (Spalten)',
    en: 'Cascaded (columns)',
    fr: 'En cascade (colonnes)',
    it: 'A cascata (colonne)',
  },
  'opt-layout-linear': {
    de: 'Linear (eine Zeile)',
    en: 'Linear (one row)',
    fr: 'Linéaire (une ligne)',
    it: 'Lineare (una riga)',
  },
  'lbl-select-theme': { de: 'Stil', en: 'Style', fr: 'Style', it: 'Stile' },
  'opt-theme-color': { de: 'Farbe', en: 'Color', fr: 'Couleur', it: 'Colore' },
  'opt-theme-bw': { de: 'Schwarz/Weiß', en: 'Black/White', fr: 'Noir/Blanc', it: 'Bianco/Nero' },
  'opt-theme-alpiner-classic': {
    de: 'Alpin klassisch',
    en: 'Alpine classic',
    fr: 'Alpin classique',
    it: 'Alpino classico',
  },
  'opt-theme-eau-froide': { de: 'Standard', en: 'Default', fr: 'Standard', it: 'Standard' },
  'opt-theme-pencil-sketch': {
    de: 'Bleistiftskizze',
    en: 'Pencil sketch',
    fr: 'Croquis au crayon',
    it: 'Schizzo a matita',
  },
  'lbl-select-paper': { de: 'Format', en: 'Format', fr: 'Format', it: 'Formato' },
  'opt-paper-screen': { de: 'Bildschirm', en: 'Screen', fr: 'Écran', it: 'Schermo' },
  'opt-paper-a4-landscape': { de: 'A4 quer', en: 'A4 landscape', fr: 'A4 paysage', it: 'A4 orizzontale' },
  'opt-paper-a4-portrait': { de: 'A4 hoch', en: 'A4 portrait', fr: 'A4 portrait', it: 'A4 verticale' },
  'view-tab-edit': { de: 'Bearbeiten', en: 'Edit', fr: 'Modifier', it: 'Modifica' },
  'view-tab-topo': { de: 'Topo', en: 'Topo', fr: 'Topo', it: 'Topo' },
  'view-tab-symbols': { de: 'Symbole', en: 'Symbols', fr: 'Symboles', it: 'Simboli' },
  'btn-renumber': {
    de: 'Nummern neu vergeben',
    en: 'Renumber',
    fr: 'Renuméroter',
    it: 'Rinumera',
  },
  'h-panel-topo': { de: 'Topo', en: 'Topo', fr: 'Topo', it: 'Topo' },
  'lbl-topo-name': { de: 'Name', en: 'Name', fr: 'Nom', it: 'Nome' },
  'lbl-topo-author': { de: 'Author', en: 'Author', fr: 'Auteur', it: 'Autore' },
  'lbl-topo-duration': { de: 'Dauer', en: 'Duration', fr: 'Durée', it: 'Durata' },
  'lbl-topo-date': { de: 'Datum', en: 'Date', fr: 'Date', it: 'Data' },
  'lbl-topo-max-walk': {
    de: 'Max. Abseillänge (m)',
    en: 'Max. rappel length (m)',
    fr: 'Longueur max. de rappel (m)',
    it: 'Lunghezza max. calata (m)',
  },
  'lbl-topo-line-distance': {
    de: 'Zeilenbreite (m)',
    en: 'Row width (m)',
    fr: 'Largeur de ligne (m)',
    it: 'Larghezza riga (m)',
  },
  'lbl-topo-legend-offset': {
    de: 'Legende Offset (m)',
    en: 'Legend offset (m)',
    fr: 'Décalage légende (m)',
    it: 'Offset legenda (m)',
  },
  'lbl-topo-length-shortening-threshold': {
    de: 'Segmente verkürzen ab (m): ',
    en: 'Shorten segments from (m): ',
    fr: 'Raccourcir les segments à partir de (m) : ',
    it: 'Accorcia i segmenti da (m): ',
  },
  'h-panel-segments': { de: 'Segmente', en: 'Segments', fr: 'Segments', it: 'Segmenti' },
  'btn-add-segment': { de: '+ hinzufügen', en: '+ add', fr: '+ ajouter', it: '+ aggiungi' },
  'h-panel-photo': { de: 'Foto-Referenz', en: 'Photo reference', fr: 'Référence photo', it: 'Riferimento foto' },
  'hint-photo-usage': {
    de: 'Foto oder PDF als Hintergrund einblenden und Topo darüber nachzeichnen.',
    en: 'Show a photo or PDF as background and trace the topo over it.',
    fr: 'Afficher une photo ou un PDF en arrière-plan et dessiner le topo par-dessus.',
    it: 'Mostra una foto o un PDF come sfondo e ricalca il topo sopra.',
  },
  'lbl-file-photo': {
    de: 'Foto oder PDF wählen…',
    en: 'Choose photo or PDF…',
    fr: 'Choisir une photo ou un PDF…',
    it: 'Scegli foto o PDF…',
  },
  'lbl-photo-page': { de: 'PDF-Seite', en: 'PDF page', fr: 'Page PDF', it: 'Pagina PDF' },
  'lbl-photo-opacity': { de: 'Deckkraft', en: 'Opacity', fr: 'Opacité', it: 'Opacità' },
  'lbl-photo-scale': { de: 'Größe', en: 'Size', fr: 'Taille', it: 'Dimensione' },
  'lbl-photo-x': { de: 'Horizontal', en: 'Horizontal', fr: 'Horizontal', it: 'Orizzontale' },
  'lbl-photo-y': { de: 'Vertikal', en: 'Vertical', fr: 'Vertical', it: 'Verticale' },
  'btn-photo-clear': {
    de: 'Referenz entfernen',
    en: 'Remove reference',
    fr: 'Supprimer la référence',
    it: 'Rimuovi riferimento',
  },
  'h-panel-ai': { de: 'AI-Erkennung', en: 'AI detection', fr: 'Détection IA', it: 'Rilevamento IA' },
  'btn-photo-ai': {
    de: 'Aus Foto erzeugen (AI)',
    en: 'Generate from photo (AI)',
    fr: 'Générer depuis la photo (IA)',
    it: 'Genera dalla foto (IA)',
  },
  'btn-ai-cancel': { de: 'Abbrechen', en: 'Cancel', fr: 'Annuler', it: 'Annulla' },
  'lbl-ai-settings': { de: 'Einstellungen', en: 'Settings', fr: 'Paramètres', it: 'Impostazioni' },
  'lbl-ai-provider': { de: 'Anbieter', en: 'Provider', fr: 'Fournisseur', it: 'Fornitore' },
  'lbl-ai-endpoint': { de: 'Endpoint', en: 'Endpoint', fr: 'Endpoint', it: 'Endpoint' },
  'lbl-ai-model': { de: 'Modell', en: 'Model', fr: 'Modèle', it: 'Modello' },
  'btn-ai-models': { de: 'Modelle laden', en: 'Load models', fr: 'Charger les modèles', it: 'Carica modelli' },
  'lbl-ai-key': { de: 'API-Key', en: 'API key', fr: 'Clé API', it: 'Chiave API' },
  'lbl-ai-prompt-template': { de: 'Prompt-Vorlage', en: 'Prompt template', fr: 'Modèle de prompt', it: 'Modello di prompt' },
  'lbl-ai-prompt-custom': { de: 'Eigener Prompt', en: 'Custom prompt', fr: 'Prompt personnalisé', it: 'Prompt personalizzato' },
  'lbl-ai-notes': {
    de: 'Zusatzinfo für das Modell (optional)',
    en: 'Extra info for the model (optional)',
    fr: 'Infos supplémentaires pour le modèle (optionnel)',
    it: 'Informazioni aggiuntive per il modello (opzionale)',
  },
  'btn-ai-forget': { de: 'Key löschen', en: 'Delete key', fr: 'Supprimer la clé', it: 'Elimina chiave' },
  'btn-zoom-fit': { de: 'Einpassen', en: 'Fit', fr: 'Ajuster', it: 'Adatta' },
  'h-panel-selection': { de: 'Auswahl', en: 'Selection', fr: 'Sélection', it: 'Selezione' },
  'h-panel-symbols': { de: 'Symbole', en: 'Symbols', fr: 'Symboles', it: 'Simboli' },
  'hint-symbol-palette': {
    de: 'Auf ein ausgewähltes Segment klicken, um ein Symbol hinzuzufügen.',
    en: 'Click a selected segment to add a symbol.',
    fr: 'Cliquer sur un segment sélectionné pour ajouter un symbole.',
    it: 'Clicca su un segmento selezionato per aggiungere un simbolo.',
  },
  'h-panel-validation': { de: 'Prüfung', en: 'Validation', fr: 'Vérification', it: 'Verifica' },
};

/** Text mit erlaubtem Markup (`innerHTML`) je Element-ID. */
export const UI_HTML = {
  'hint-ai-cors': {
    de: 'Erzeugt aus dem geladenen Bild bzw. der PDF-Seite ein Topo. Der Aufruf läuft direkt aus deinem Browser zum Modell — blockiert ein Gateway das (CORS), springt automatisch der lokale Proxy ein, sofern er läuft (<code>npm start</code>).',
    en: 'Generates a topo from the loaded image or PDF page. The call goes directly from your browser to the model — if a gateway blocks that (CORS), the local proxy steps in automatically as long as it is running (<code>npm start</code>).',
    fr: 'Génère un topo à partir de l\u2019image ou de la page PDF chargée. L\u2019appel part directement de votre navigateur vers le modèle — si une passerelle le bloque (CORS), le proxy local prend automatiquement le relais s\u2019il est lancé (<code>npm start</code>).',
    it: 'Genera un topo dall\u2019immagine o dalla pagina PDF caricata. La chiamata parte direttamente dal browser verso il modello — se un gateway la blocca (CORS), il proxy locale subentra automaticamente se è in esecuzione (<code>npm start</code>).',
  },
  'hint-ai-key-storage': {
    de: 'Der Key wird nur im <code>localStorage</code> dieses Browsers gespeichert und ausschließlich an den angegebenen Endpoint gesendet. Auf gemeinsam genutzten Rechnern besser einen eigenen Proxy verwenden.',
    en: 'The key is only stored in this browser\u2019s <code>localStorage</code> and sent exclusively to the given endpoint. On shared computers, use your own proxy instead.',
    fr: 'La clé est uniquement stockée dans le <code>localStorage</code> de ce navigateur et envoyée exclusivement à l\u2019endpoint indiqué. Sur un ordinateur partagé, préférez votre propre proxy.',
    it: 'La chiave viene salvata solo nel <code>localStorage</code> di questo browser e inviata esclusivamente all\u2019endpoint indicato. Su computer condivisi è meglio usare un proxy proprio.',
  },
};

/** `title`-Attribut je Element-ID. */
export const UI_TITLES = {
  'btn-random': {
    de: 'Zufälliges Topo mit allen Segmenttypen und Symbolen',
    en: 'Random topo with all segment types and symbols',
    fr: 'Topo aléatoire avec tous les types de segments et symboles',
    it: 'Topo casuale con tutti i tipi di segmento e simboli',
  },
  'btn-undo': {
    de: 'Rückgängig (Cmd/Ctrl+Z)',
    en: 'Undo (Cmd/Ctrl+Z)',
    fr: 'Annuler (Cmd/Ctrl+Z)',
    it: 'Annulla (Cmd/Ctrl+Z)',
  },
  'btn-redo': {
    de: 'Wiederholen (Cmd/Ctrl+Shift+Z)',
    en: 'Redo (Cmd/Ctrl+Shift+Z)',
    fr: 'Rétablir (Cmd/Ctrl+Shift+Z)',
    it: 'Ripeti (Cmd/Ctrl+Shift+Z)',
  },
  'btn-photo-page-prev': {
    de: 'Vorherige Seite',
    en: 'Previous page',
    fr: 'Page précédente',
    it: 'Pagina precedente',
  },
  'btn-photo-page-next': { de: 'Nächste Seite', en: 'Next page', fr: 'Page suivante', it: 'Pagina successiva' },
  'lbl-topo-line-distance-row': {
    de: 'Serpentine: Zeilenbreite · Kaskadiert: Spaltenhöhe (Format Bildschirm)',
    en: 'Serpentine: row width · Cascaded: column height (screen format)',
    fr: 'Serpentin : largeur de ligne · En cascade : hauteur de colonne (format écran)',
    it: 'Serpentina: larghezza riga · A cascata: altezza colonna (formato schermo)',
  },
};

/** `placeholder`-Attribut je Element-ID. */
export const UI_PLACEHOLDERS = {
  'ai-notes': {
    de: 'z. B. Gerätebezeichnungen, Sprache, Region',
    en: 'e.g. device names, language, region',
    fr: 'p. ex. noms d\u2019appareils, langue, région',
    it: 'per es. nomi dei dispositivi, lingua, regione',
  },
};

/** `aria-label`-Attribut je Element-ID. */
export const UI_ARIA_LABELS = {
  'view-switch': { de: 'Ansicht', en: 'View', fr: 'Vue', it: 'Vista' },
  'panel-left': {
    de: 'Topo, Segmente und Foto-Referenz',
    en: 'Topo, segments and photo reference',
    fr: 'Topo, segments et référence photo',
    it: 'Topo, segmenti e riferimento foto',
  },
  'panel-right': {
    de: 'Auswahl, Symbole und Prüfung',
    en: 'Selection, symbols and validation',
    fr: 'Sélection, symboles et vérification',
    it: 'Selezione, simboli e verifica',
  },
  'save-menu': { de: 'Speichern', en: 'Save', fr: 'Enregistrer', it: 'Salva' },
};

/** Kategorie-Labels der Symbolpalette, je Kategorie-ID. */
export const SYMBOL_CATEGORY_LABELS = {
  anchors: { de: 'Verankerung', en: 'Anchors', fr: 'Ancrages', it: 'Ancoraggi' },
  hazards: { de: 'Gefahren', en: 'Hazards', fr: 'Dangers', it: 'Pericoli' },
  nature: { de: 'Natur', en: 'Nature', fr: 'Nature', it: 'Natura' },
  infrastructure: { de: 'Infrastruktur', en: 'Infrastructure', fr: 'Infrastructure', it: 'Infrastruttura' },
  annotation: { de: 'Beschriftung', en: 'Annotation', fr: 'Annotation', it: 'Annotazione' },
};

/** Symbol-Labels der Palette/Inspektor-Auswahl, je Element-Typ. */
export const SYMBOL_LABELS = {
  BOLT: { de: 'Bolt', en: 'Bolt', fr: 'Spit', it: 'Spit' },
  BOLT_LEFT: { de: 'Bolt links', en: 'Bolt left', fr: 'Spit gauche', it: 'Spit sinistro' },
  BOLT_RIGHT: { de: 'Bolt rechts', en: 'Bolt right', fr: 'Spit droit', it: 'Spit destro' },
  RAPPEL_GUIDE: {
    de: 'Rappel Guide (RG)',
    en: 'Rappel Guide (RG)',
    fr: 'Guide de rappel (RG)',
    it: 'Guida calata (RG)',
  },
  LADDER: { de: 'Leiter', en: 'Ladder', fr: 'Échelle', it: 'Scala' },
  STONE: { de: 'Block', en: 'Boulder', fr: 'Bloc', it: 'Masso' },
  TRAPPED_STONE: { de: 'Klemmblock', en: 'Chockstone', fr: 'Bloc coincé', it: 'Masso incastrato' },
  SHARP_EDGE: { de: 'Scharfe Kante', en: 'Sharp edge', fr: 'Arête coupante', it: 'Spigolo tagliente' },
  TRUNK: { de: 'Baumstamm', en: 'Tree trunk', fr: 'Tronc d\u2019arbre', it: 'Tronco d\u2019albero' },
  LEAF_TREE: { de: 'Laubbaum', en: 'Deciduous tree', fr: 'Arbre feuillu', it: 'Albero a foglie larghe' },
  CONIFER_TREE: { de: 'Nadelbaum', en: 'Conifer tree', fr: 'Conifère', it: 'Conifera' },
  CAVE: { de: 'Höhle', en: 'Cave', fr: 'Grotte', it: 'Grotta' },
  BACKWATER: { de: 'Rückstrom', en: 'Backwater', fr: 'Contre-courant', it: 'Controcorrente' },
  STONE_BRIDGE: { de: 'Steinbrücke', en: 'Stone bridge', fr: 'Pont en pierre', it: 'Ponte in pietra' },
  WOODEN_BRIDGE: { de: 'Holzbrücke', en: 'Wooden bridge', fr: 'Pont en bois', it: 'Ponte in legno' },
  STONE_HOUSE: { de: 'Haus / Hütte', en: 'House / hut', fr: 'Maison / cabane', it: 'Casa / rifugio' },
  HELICOPTER: { de: 'Helikopter', en: 'Helicopter', fr: 'Hélicoptère', it: 'Elicottero' },
  RADIO_MAST: { de: 'Funkmast', en: 'Radio mast', fr: 'Pylône radio', it: 'Traliccio radio' },
  LIFT_MAST: { de: 'Liftmast', en: 'Lift pylon', fr: 'Pylône de télésiège', it: 'Pilone della funivia' },
  SQUARE_CONCRETE_BASE: {
    de: 'Betonsockel eckig',
    en: 'Square concrete base',
    fr: 'Socle en béton carré',
    it: 'Basamento in cemento squadrato',
  },
  STEEL_BEAM: { de: 'Stahlträger', en: 'Steel beam', fr: 'Poutre en acier', it: 'Trave in acciaio' },
  INLET_LEFT: { de: 'Zufluss links', en: 'Inlet left', fr: 'Affluent gauche', it: 'Afflusso sinistro' },
  INLET_RIGHT: { de: 'Zufluss rechts', en: 'Inlet right', fr: 'Affluent droit', it: 'Afflusso destro' },
  ESCAPE_EXIT_LEFT: { de: 'Fluchtweg links', en: 'Escape route left', fr: 'Échappatoire gauche', it: 'Via di fuga sinistra' },
  ESCAPE_EXIT_RIGHT: {
    de: 'Fluchtweg rechts',
    en: 'Escape route right',
    fr: 'Échappatoire droite',
    it: 'Via di fuga destra',
  },
  ROPE_RAILING_LEFT: {
    de: 'Seilgeländer links',
    en: 'Rope railing left',
    fr: 'Main courante gauche',
    it: 'Corrimano in corda sinistro',
  },
  ROPE_RAILING_RIGHT: {
    de: 'Seilgeländer rechts',
    en: 'Rope railing right',
    fr: 'Main courante droite',
    it: 'Corrimano in corda destro',
  },
  ELEMENT_NUMBER: { de: 'Nummer', en: 'Number', fr: 'Numéro', it: 'Numero' },
  CUSTOM_TEXT: { de: 'Freitext', en: 'Free text', fr: 'Texte libre', it: 'Testo libero' },
  WARNING_AND_TEXT: { de: 'Warnung + Text', en: 'Warning + text', fr: 'Avertissement + texte', it: 'Avviso + testo' },
  DEATH_HAZARD: { de: 'Lebensgefahr', en: 'Mortal danger', fr: 'Danger de mort', it: 'Pericolo di morte' },
  TREE_JAM: { de: 'Baumverhau', en: 'Tree jam', fr: 'Embâcle de bois', it: 'Ostruzione di tronchi' },
  BOULDER_JAM: { de: 'Felsblockverhau', en: 'Boulder jam', fr: 'Embâcle rocheux', it: 'Ostruzione di massi' },
  ROCKFALL: { de: 'Steinschlag', en: 'Rockfall', fr: 'Chute de pierres', it: 'Caduta massi' },
  UNDERCUT: { de: 'Unterspülung', en: 'Undercut', fr: 'Sape', it: 'Sottoescavazione' },
  DANGEROUS_CURRENT: {
    de: 'Gefährliche Strömung',
    en: 'Dangerous current',
    fr: 'Courant dangereux',
    it: 'Corrente pericolosa',
  },
  SIPHON: { de: 'Siphon', en: 'Siphon', fr: 'Siphon', it: 'Sifone' },
  WATER_DIVERSION: {
    de: 'Wasserableitung',
    en: 'Water diversion',
    fr: 'Dérivation d\u2019eau',
    it: 'Deviazione d\u2019acqua',
  },
  PATH: { de: 'Pfad', en: 'Path', fr: 'Sentier', it: 'Sentiero' },
  ROAD: { de: 'Weg / Strasse', en: 'Track / road', fr: 'Chemin / route', it: 'Via / strada' },
  BYPASS: { de: 'Umgehung', en: 'Bypass', fr: 'Contournement', it: 'Deviazione' },
  ENTRY_POINT: { de: 'Einstieg', en: 'Entry point', fr: 'Entrée', it: 'Ingresso' },
  EXIT_POINT: { de: 'Ausstieg', en: 'Exit point', fr: 'Sortie', it: 'Uscita' },
};

/** Zusatz für „abgestorben“-Varianten (Laub-/Nadelbaum). */
const DEAD_SUFFIX = {
  de: ' (abgestorben)',
  en: ' (dead)',
  fr: ' (mort)',
  it: ' (morto)',
};

/** Übersetzt ein Symbol-Label; `dead` hängt das passende Suffix an. */
export function translateSymbolLabel(type, lang, { dead = false } = {}) {
  const base = pick(SYMBOL_LABELS[type], lang) || type;
  return dead ? `${base}${pick(DEAD_SUFFIX, lang)}` : base;
}

/** Übersetzt ein Kategorie-Label der Symbolpalette. */
export function translateCategoryLabel(id, lang) {
  return pick(SYMBOL_CATEGORY_LABELS[id], lang) || id;
}

/** Provider-Labels/-Hinweise der AI-Erkennung, je Provider-ID. */
export const AI_PROVIDER_LABELS = {
  openai: { de: 'OpenAI-kompatibel', en: 'OpenAI-compatible', fr: 'Compatible OpenAI', it: 'Compatibile OpenAI' },
  anthropic: { de: 'Anthropic (Claude)', en: 'Anthropic (Claude)', fr: 'Anthropic (Claude)', it: 'Anthropic (Claude)' },
  proxy: {
    de: 'Eigener Proxy (ohne Key im Browser)',
    en: 'Custom proxy (no key in the browser)',
    fr: 'Proxy personnalisé (sans clé dans le navigateur)',
    it: 'Proxy personale (senza chiave nel browser)',
  },
};

export const AI_PROVIDER_HINTS = {
  openai: {
    de: 'Standard: Swisscom Swiss AI Platform; funktioniert auch mit OpenAI, Azure OpenAI, OpenRouter, Groq, LM Studio oder Ollama (/v1).',
    en: 'Default: Swisscom Swiss AI Platform; also works with OpenAI, Azure OpenAI, OpenRouter, Groq, LM Studio or Ollama (/v1).',
    fr: 'Par défaut : Swisscom Swiss AI Platform ; fonctionne aussi avec OpenAI, Azure OpenAI, OpenRouter, Groq, LM Studio ou Ollama (/v1).',
    it: 'Predefinito: Swisscom Swiss AI Platform; funziona anche con OpenAI, Azure OpenAI, OpenRouter, Groq, LM Studio o Ollama (/v1).',
  },
  anthropic: {
    de: 'Direkte Browser-Aufrufe müssen im Anthropic-Konto erlaubt sein.',
    en: 'Direct browser calls must be allowed in the Anthropic account.',
    fr: 'Les appels directs depuis le navigateur doivent être autorisés dans le compte Anthropic.',
    it: 'Le chiamate dirette dal browser devono essere consentite nell\u2019account Anthropic.',
  },
  proxy: {
    de: 'Nötig für Gateways ohne CORS (z. B. api.swisscom.com). Proxy starten: AI_KEY=… node tools/proxy.mjs',
    en: 'Needed for gateways without CORS (e.g. api.swisscom.com). Start proxy: AI_KEY=… node tools/proxy.mjs',
    fr: 'Nécessaire pour les passerelles sans CORS (p. ex. api.swisscom.com). Démarrer le proxy : AI_KEY=… node tools/proxy.mjs',
    it: 'Necessario per gateway senza CORS (per es. api.swisscom.com). Avvia il proxy: AI_KEY=… node tools/proxy.mjs',
  },
};

/** Prompt-Vorlagen-Labels/-Hinweise der AI-Erkennung, je Vorlagen-ID. */
export const AI_PROMPT_LABELS = {
  optimized: { de: 'Optimiert (empfohlen)', en: 'Optimized (recommended)', fr: 'Optimisé (recommandé)', it: 'Ottimizzato (consigliato)' },
  compact: { de: 'Kompakt', en: 'Compact', fr: 'Compact', it: 'Compatto' },
  legacy: { de: 'Bisheriger Prompt', en: 'Previous prompt', fr: 'Ancien prompt', it: 'Prompt precedente' },
  custom: { de: 'Eigener Prompt', en: 'Custom prompt', fr: 'Prompt personnalisé', it: 'Prompt personalizzato' },
};

export const AI_PROMPT_HINTS = {
  optimized: {
    de: 'Vorlagengetreue Rekonstruktion mit Symbolzuordnung, Lesereihenfolge und belegten Angaben.',
    en: 'Faithful reconstruction with symbol mapping, reading order and evidenced values.',
    fr: 'Reconstruction fidèle avec correspondance des symboles, ordre de lecture et valeurs justifiées.',
    it: 'Ricostruzione fedele con mappatura dei simboli, ordine di lettura e valori documentati.',
  },
  compact: {
    de: 'Kurzfassung für kleine Modelle oder enges Kontextfenster.',
    en: 'Short version for small models or a narrow context window.',
    fr: 'Version courte pour petits modèles ou fenêtre de contexte réduite.',
    it: 'Versione breve per modelli piccoli o finestra di contesto ridotta.',
  },
  legacy: {
    de: 'Der Prompt vor der Überarbeitung – zum Vergleichen.',
    en: 'The prompt before the revision – for comparison.',
    fr: 'Le prompt avant la révision – pour comparaison.',
    it: 'Il prompt prima della revisione – per confronto.',
  },
  custom: {
    de: 'Frei editierbar, vorbelegt mit der optimierten Vorlage.',
    en: 'Freely editable, pre-filled with the optimized template.',
    fr: 'Librement modifiable, pré-rempli avec le modèle optimisé.',
    it: 'Liberamente modificabile, precompilato con il modello ottimizzato.',
  },
};

/** Label-Texte der Legende innerhalb des Topo-SVGs, je Zeilen-Key. */
export const LEGEND_LABELS = {
  duration: { de: 'Dauer', en: 'Duration', fr: 'Durée', it: 'Durata' },
  maximum_walk_length: { de: 'Max. Abseil', en: 'Max. rappel', fr: 'Rappel max.', it: 'Calata max.' },
  author: { de: 'Author', en: 'Author', fr: 'Auteur', it: 'Autore' },
  date: { de: 'Datum', en: 'Date', fr: 'Date', it: 'Data' },
  // Bewusst "Legend:" auf Deutsch belassen (bisherige, schon vorher englische
  // Beschriftungskonvention) – nur so bleibt das Standard-SVG ohne gewählte
  // Sprache bytegleich zu allen bestehenden Baselines/Tests.
  title: { de: 'Legend:', en: 'Legend:', fr: 'Légende :', it: 'Legenda:' },
};

export function translateLegendLabel(key, lang) {
  return pick(LEGEND_LABELS[key], lang) || key;
}

export function translateProviderLabel(id, lang) {
  return pick(AI_PROVIDER_LABELS[id], lang) || id;
}

export function translateProviderHint(id, lang) {
  return pick(AI_PROVIDER_HINTS[id], lang) || '';
}

export function translatePromptLabel(id, lang) {
  return pick(AI_PROMPT_LABELS[id], lang) || id;
}

export function translatePromptHint(id, lang) {
  return pick(AI_PROMPT_HINTS[id], lang) || '';
}

/** Vorlagen für dynamische Statusmeldungen, Validierungshinweise usw. */
export const MESSAGES = {
  'status.ready': { de: 'bereit', en: 'ready', fr: 'prêt', it: 'pronto' },
  'status.restored': {
    de: 'Letzter Stand wiederhergestellt.',
    en: 'Last state restored.',
    fr: 'Dernier état restauré.',
    it: 'Ultimo stato ripristinato.',
  },
  'status.ready_sentence': { de: 'Bereit.', en: 'Ready.', fr: 'Prêt.', it: 'Pronto.' },
  'status.need_segment_first': {
    de: 'Zuerst ein Segment anlegen.',
    en: 'Create a segment first.',
    fr: 'Créer d\u2019abord un segment.',
    it: 'Crea prima un segmento.',
  },
  'status.symbol_added': {
    de: '{label} hinzugefügt.',
    en: '{label} added.',
    fr: '{label} ajouté.',
    it: '{label} aggiunto.',
  },
  'status.rendering_pdf_page': {
    de: 'Rendere PDF-Seite {page}…',
    en: 'Rendering PDF page {page}…',
    fr: 'Rendu de la page PDF {page}…',
    it: 'Rendering pagina PDF {page}…',
  },
  'status.pdf_page_loaded': {
    de: 'PDF-Seite {page} von {count} als Referenzlayer geladen.',
    en: 'PDF page {page} of {count} loaded as reference layer.',
    fr: 'Page PDF {page} sur {count} chargée comme calque de référence.',
    it: 'Pagina PDF {page} di {count} caricata come livello di riferimento.',
  },
  'status.pdf_page_render_failed': {
    de: 'PDF-Seite konnte nicht gerendert werden: {error}',
    en: 'PDF page could not be rendered: {error}',
    fr: 'La page PDF n\u2019a pas pu être rendue : {error}',
    it: 'Impossibile eseguire il rendering della pagina PDF: {error}',
  },
  'status.pdf_opening': {
    de: 'PDF wird geöffnet…',
    en: 'Opening PDF…',
    fr: 'Ouverture du PDF…',
    it: 'Apertura del PDF…',
  },
  'status.pdf_read_failed': {
    de: 'PDF konnte nicht gelesen werden: {error}',
    en: 'PDF could not be read: {error}',
    fr: 'Le PDF n\u2019a pas pu être lu : {error}',
    it: 'Impossibile leggere il PDF: {error}',
  },
  'status.photo_loaded': {
    de: 'Foto als Referenzlayer geladen.',
    en: 'Photo loaded as reference layer.',
    fr: 'Photo chargée comme calque de référence.',
    it: 'Foto caricata come livello di riferimento.',
  },
  'status.photo_read_failed': {
    de: 'Foto konnte nicht gelesen werden.',
    en: 'Photo could not be read.',
    fr: 'La photo n\u2019a pas pu être lue.',
    it: 'Impossibile leggere la foto.',
  },
  'status.file_loaded': {
    de: '{name} geladen.',
    en: '{name} loaded.',
    fr: '{name} chargé.',
    it: '{name} caricato.',
  },
  'status.file_load_failed': {
    de: 'Fehler beim Laden: {error}',
    en: 'Error while loading: {error}',
    fr: 'Erreur lors du chargement : {error}',
    it: 'Errore durante il caricamento: {error}',
  },
  'status.example_loaded': {
    de: 'Beispiel-Topo geladen.',
    en: 'Example topo loaded.',
    fr: 'Topo d\u2019exemple chargé.',
    it: 'Topo di esempio caricato.',
  },
  'status.example_load_failed': {
    de: 'Beispiel nicht ladbar: {error}',
    en: 'Example could not be loaded: {error}',
    fr: 'Exemple impossible à charger : {error}',
    it: 'Impossibile caricare l\u2019esempio: {error}',
  },
  'status.new_topo': { de: 'Neues Topo.', en: 'New topo.', fr: 'Nouveau topo.', it: 'Nuovo topo.' },
  'status.random_topo_created': {
    de: 'Zufalls-Topo „{name}“ erzeugt.',
    en: 'Random topo "{name}" created.',
    fr: 'Topo aléatoire « {name} » créé.',
    it: 'Topo casuale "{name}" creato.',
  },
  'status.json_saved': { de: 'JSON gespeichert.', en: 'JSON saved.', fr: 'JSON enregistré.', it: 'JSON salvato.' },
  'status.xml_saved': { de: 'XML gespeichert.', en: 'XML saved.', fr: 'XML enregistré.', it: 'XML salvato.' },
  'status.svg_exported': { de: 'SVG exportiert.', en: 'SVG exported.', fr: 'SVG exporté.', it: 'SVG esportato.' },
  'status.png_exported': { de: 'PNG exportiert.', en: 'PNG exported.', fr: 'PNG exporté.', it: 'PNG esportato.' },
  'status.shortlist_exported': {
    de: 'Kurzliste exportiert ({count} Segmente).',
    en: 'Short list exported ({count} segments).',
    fr: 'Liste courte exportée ({count} segments).',
    it: 'Elenco breve esportato ({count} segmenti).',
  },
  'status.shortlist_empty': {
    de: 'Keine Segmente mit Längenangabe – Kurzliste nicht erstellt.',
    en: 'No segments with a length – short list not created.',
    fr: 'Aucun segment avec longueur – liste courte non créée.',
    it: 'Nessun segmento con lunghezza – elenco breve non creato.',
  },
  'status.png_export_failed': {
    de: 'PNG-Export fehlgeschlagen: {error}',
    en: 'PNG export failed: {error}',
    fr: 'Échec de l\u2019export PNG : {error}',
    it: 'Esportazione PNG non riuscita: {error}',
  },
  'status.renumbered': {
    de: 'Nummern neu vergeben.',
    en: 'Renumbered.',
    fr: 'Renumérotation effectuée.',
    it: 'Rinumerazione eseguita.',
  },
  'status.ai_running': { de: 'AI-Erkennung läuft…', en: 'AI detection running…', fr: 'Détection IA en cours…', it: 'Rilevamento IA in corso…' },
  'status.ai_done': {
    de: 'Topo aus Foto erzeugt: {count} Segmente.',
    en: 'Topo generated from photo: {count} segments.',
    fr: 'Topo généré depuis la photo : {count} segments.',
    it: 'Topo generato dalla foto: {count} segmenti.',
  },
  'status.ai_cancelled': {
    de: 'AI-Erkennung abgebrochen.',
    en: 'AI detection cancelled.',
    fr: 'Détection IA annulée.',
    it: 'Rilevamento IA annullato.',
  },
  'status.ai_failed': {
    de: 'AI-Erkennung fehlgeschlagen.',
    en: 'AI detection failed.',
    fr: 'Échec de la détection IA.',
    it: 'Rilevamento IA non riuscito.',
  },
  'photo.page_info': { de: 'von {count}', en: 'of {count}', fr: 'sur {count}', it: 'di {count}' },
  'segment.action_up': { de: 'nach oben', en: 'move up', fr: 'monter', it: 'sposta su' },
  'segment.action_down': { de: 'nach unten', en: 'move down', fr: 'descendre', it: 'sposta giù' },
  'segment.action_duplicate': { de: 'duplizieren', en: 'duplicate', fr: 'dupliquer', it: 'duplica' },
  'segment.action_delete': { de: 'löschen', en: 'delete', fr: 'supprimer', it: 'elimina' },
  'segment.symbol_count_suffix': {
    de: '· {count} Sym.',
    en: '· {count} sym.',
    fr: '· {count} sym.',
    it: '· {count} sim.',
  },
  'inspector.pick_hint': {
    de: 'Segment oder Symbol im Topo anklicken.',
    en: 'Click a segment or symbol in the topo.',
    fr: 'Cliquer sur un segment ou un symbole du topo.',
    it: 'Clicca su un segmento o un simbolo nel topo.',
  },
  'inspector.selection_gone': {
    de: 'Auswahl nicht mehr vorhanden.',
    en: 'Selection no longer available.',
    fr: 'Sélection n\u2019est plus disponible.',
    it: 'Selezione non più disponibile.',
  },
  'inspector.type': { de: 'Typ', en: 'Type', fr: 'Type', it: 'Tipo' },
  'inspector.length_m': { de: 'Länge (m)', en: 'Length (m)', fr: 'Longueur (m)', it: 'Lunghezza (m)' },
  'inspector.angle_deg': { de: 'Winkel (°)', en: 'Angle (°)', fr: 'Angle (°)', it: 'Angolo (°)' },
  'inspector.walk_time_min': { de: 'Gehzeit (min)', en: 'Walk time (min)', fr: 'Temps de marche (min)', it: 'Tempo di cammino (min)' },
  'inspector.wall_distance_m': {
    de: 'Wanddistanz (m)',
    en: 'Wall distance (m)',
    fr: 'Distance à la paroi (m)',
    it: 'Distanza dalla parete (m)',
  },
  'inspector.depth_m': { de: 'Tiefe (m)', en: 'Depth (m)', fr: 'Profondeur (m)', it: 'Profondità (m)' },
  'inspector.force_cut_row': {
    de: 'Zeilenumbruch erzwingen',
    en: 'Force row break',
    fr: 'Forcer le saut de ligne',
    it: 'Forza interruzione di riga',
  },
  'inspector.prevent_cut_row': {
    de: 'Umbruch verhindern',
    en: 'Prevent row break',
    fr: 'Empêcher le saut de ligne',
    it: 'Impedisci interruzione di riga',
  },
  'inspector.position_along_m': {
    de: 'Position entlang (m)',
    en: 'Position along (m)',
    fr: 'Position le long (m)',
    it: 'Posizione lungo (m)',
  },
  'inspector.position_across_m': {
    de: 'Position quer (m)',
    en: 'Position across (m)',
    fr: 'Position en travers (m)',
    it: 'Posizione trasversale (m)',
  },
  'inspector.end_along_m': { de: 'Ende entlang (m)', en: 'End along (m)', fr: 'Fin le long (m)', it: 'Fine lungo (m)' },
  'inspector.end_across_m': {
    de: 'Ende quer (m)',
    en: 'End across (m)',
    fr: 'Fin en travers (m)',
    it: 'Fine trasversale (m)',
  },
  'inspector.size': { de: 'Größe', en: 'Size', fr: 'Taille', it: 'Dimensione' },
  'inspector.text': { de: 'Text', en: 'Text', fr: 'Texte', it: 'Testo' },
  'inspector.dead': { de: 'Abgestorben', en: 'Dead', fr: 'Mort', it: 'Morto' },
  'inspector.delete_symbol': {
    de: 'Symbol löschen',
    en: 'Delete symbol',
    fr: 'Supprimer le symbole',
    it: 'Elimina simbolo',
  },
  'issues.none': {
    de: 'Keine Auffälligkeiten.',
    en: 'No issues found.',
    fr: 'Aucune anomalie.',
    it: 'Nessuna anomalia.',
  },
  'validation.not_object': {
    de: 'Kein gültiges Topo-Objekt.',
    en: 'Not a valid topo object.',
    fr: 'Objet topo non valide.',
    it: 'Oggetto topo non valido.',
  },
  'validation.no_segments': {
    de: 'Topo enthält keine Segmente.',
    en: 'Topo contains no segments.',
    fr: 'Le topo ne contient aucun segment.',
    it: 'Il topo non contiene segmenti.',
  },
  'validation.distance_invalid': {
    de: 'distance_of_single_line muss größer als 0 sein.',
    en: 'distance_of_single_line must be greater than 0.',
    fr: 'distance_of_single_line doit être supérieur à 0.',
    it: 'distance_of_single_line deve essere maggiore di 0.',
  },
  'validation.max_walk_invalid': {
    de: 'maximum_walk_length muss größer als 0 sein.',
    en: 'maximum_walk_length must be greater than 0.',
    fr: 'maximum_walk_length doit être supérieur à 0.',
    it: 'maximum_walk_length deve essere maggiore di 0.',
  },
  'validation.unknown_segment_type': {
    de: 'Segment {index}: unbekannter Typ "{type}" (wird unverändert erhalten).',
    en: 'Segment {index}: unknown type "{type}" (kept unchanged).',
    fr: 'Segment {index} : type inconnu « {type} » (conservé tel quel).',
    it: 'Segmento {index}: tipo sconosciuto "{type}" (mantenuto invariato).',
  },
  'validation.segment_length_invalid': {
    de: 'Segment {index}: Länge muss größer als 0 sein.',
    en: 'Segment {index}: length must be greater than 0.',
    fr: 'Segment {index} : la longueur doit être supérieure à 0.',
    it: 'Segmento {index}: la lunghezza deve essere maggiore di 0.',
  },
  'validation.unknown_element_type': {
    de: 'Segment {index}, Element {elementIndex}: unbekannter Typ "{type}".',
    en: 'Segment {index}, element {elementIndex}: unknown type "{type}".',
    fr: 'Segment {index}, élément {elementIndex} : type inconnu « {type} ».',
    it: 'Segmento {index}, elemento {elementIndex}: tipo sconosciuto "{type}".',
  },
  'validation.range_element_no_end': {
    de: 'Segment {index}, Element {elementIndex}: Streckenelement ohne Endpunkt.',
    en: 'Segment {index}, element {elementIndex}: range element without an end point.',
    fr: 'Segment {index}, élément {elementIndex} : élément linéaire sans point final.',
    it: 'Segmento {index}, elemento {elementIndex}: elemento lineare senza punto finale.',
  },
  'ai.models_loading': {
    de: 'Modelle werden geladen …',
    en: 'Loading models …',
    fr: 'Chargement des modèles …',
    it: 'Caricamento modelli …',
  },
  'ai.models_found': {
    de: '{count} Modell(e) gefunden{viaProxy}.',
    en: '{count} model(s) found{viaProxy}.',
    fr: '{count} modèle(s) trouvé(s){viaProxy}.',
    it: '{count} modello/i trovato/i{viaProxy}.',
  },
  'ai.models_via_proxy': {
    de: ' (über den lokalen Proxy)',
    en: ' (via the local proxy)',
    fr: ' (via le proxy local)',
    it: ' (tramite il proxy locale)',
  },
  'ai.model_unknown_but_usable': {
    de: ' "{model}" ist nicht darunter – trotzdem nutzbar.',
    en: ' "{model}" is not among them – still usable.',
    fr: ' « {model} » n\u2019en fait pas partie – reste utilisable.',
    it: ' "{model}" non è tra questi – comunque utilizzabile.',
  },
  'ai.proxy_available': {
    de: 'Lokaler Proxy auf Port {port} erreichbar – er springt automatisch ein, falls das Gateway den Direktaufruf blockiert.',
    en: 'Local proxy reachable on port {port} – it automatically steps in if the gateway blocks the direct call.',
    fr: 'Proxy local joignable sur le port {port} – il prend automatiquement le relais si la passerelle bloque l\u2019appel direct.',
    it: 'Proxy locale raggiungibile sulla porta {port} – subentra automaticamente se il gateway blocca la chiamata diretta.',
  },
  'ai.need_photo_first': {
    de: 'Zuerst ein Foto oder eine PDF-Seite laden.',
    en: 'Load a photo or PDF page first.',
    fr: 'Charger d\u2019abord une photo ou une page PDF.',
    it: 'Carica prima una foto o una pagina PDF.',
  },
  'ai.analyzing': {
    de: 'Modell analysiert das Bild…',
    en: 'Model is analyzing the image…',
    fr: 'Le modèle analyse l\u2019image…',
    it: 'Il modello sta analizzando l\u2019immagine…',
  },
  'ai.result_summary': {
    de: '{count} Segment(e) erkannt{via}.{skipped} Bitte gegenprüfen.',
    en: '{count} segment(s) detected{via}.{skipped} Please double-check.',
    fr: '{count} segment(s) détecté(s){via}.{skipped} Merci de vérifier.',
    it: '{count} segmento/i rilevato/i{via}.{skipped} Si prega di verificare.',
  },
  'ai.result_skipped_suffix': {
    de: ' {count} Angabe(n) verworfen.',
    en: ' {count} value(s) discarded.',
    fr: ' {count} valeur(s) ignorée(s).',
    it: ' {count} valore/i scartato/i.',
  },
  'ai.aborted': { de: 'Abgebrochen.', en: 'Cancelled.', fr: 'Annulé.', it: 'Annullato.' },
  'ai.key_deleted': {
    de: 'API-Key gelöscht.',
    en: 'API key deleted.',
    fr: 'Clé API supprimée.',
    it: 'Chiave API eliminata.',
  },
  'ai.proxy_unavailable': {
    de: 'Kein lokaler Proxy auf Port {port}. Wird nur gebraucht, wenn der Direktaufruf an CORS scheitert – dann im Projektordner "npm start" ausführen.',
    en: 'No local proxy on port {port}. Only needed if the direct call fails due to CORS – then run "npm start" in the project folder.',
    fr: 'Aucun proxy local sur le port {port}. Nécessaire uniquement si l\u2019appel direct échoue à cause de CORS – exécuter alors « npm start » dans le dossier du projet.',
    it: 'Nessun proxy locale sulla porta {port}. Serve solo se la chiamata diretta fallisce per CORS – in tal caso eseguire "npm start" nella cartella del progetto.',
  },
};

/** Übersetzt eine Vorlage aus `MESSAGES`; unbekannte Keys liefern den Key selbst zurück. */
export function t(lang, key, vars) {
  const entry = MESSAGES[key];
  if (!entry) return key;
  return format(pick(entry, lang), vars);
}

/** Wendet alle statischen Übersetzungen (Text, HTML, Attribute) auf das DOM an. */
export function applyStaticTranslations(getById, lang) {
  for (const [id, entry] of Object.entries(UI_TEXT)) {
    const node = getById(id);
    if (node) node.textContent = pick(entry, lang);
  }
  for (const [id, entry] of Object.entries(UI_HTML)) {
    const node = getById(id);
    if (node) node.innerHTML = pick(entry, lang);
  }
  for (const [id, entry] of Object.entries(UI_TITLES)) {
    const node = getById(id);
    if (node) node.title = pick(entry, lang);
  }
  for (const [id, entry] of Object.entries(UI_PLACEHOLDERS)) {
    const node = getById(id);
    if (node) node.setAttribute('placeholder', pick(entry, lang));
  }
  for (const [id, entry] of Object.entries(UI_ARIA_LABELS)) {
    const node = getById(id);
    if (node) node.setAttribute('aria-label', pick(entry, lang));
  }
}
