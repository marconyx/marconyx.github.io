/**
 * Übersetzungen der Bedienoberfläche (DE/EN/FR/IT/ES).
 *
 * Die Wörterbücher und Übersetzungshilfen benötigen kein globales DOM;
 * `applyStaticTranslations` erhält einen Lookup und aktualisiert darüber die
 * konkreten Elemente. So sind sie in Node-Tests und im Browser benutzbar.
 *
 * Deutsch ist überall die erste Sprache UND der Standardwert jeder Anzeige
 * (leeres/undefiniertes `state.view.language`). Die deutschen Einträge sind
 * bewusst wortgleich mit dem bisherigen, fest codierten Text, damit bestehende
 * Tests und Baseline-SVGs ohne Sprachauswahl unverändert bleiben.
 */

export const LANGUAGES = ['de', 'en', 'fr', 'it', 'es'];
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

/** Statischer Text (`textContent`) je Element-ID; alle Sprachen müssen vollständig sein. */
export const UI_TEXT = {
  'status-details-title': {
    de: 'Statusmeldung', en: 'Status message', fr: 'Message d’état',
    it: 'Messaggio di stato', es: 'Mensaje de estado',
  },
  'btn-close-status-details': {
    de: 'Schliessen', en: 'Close', fr: 'Fermer', it: 'Chiudi', es: 'Cerrar',
  },
  'shortcut-help-title': {
    de: 'Shortcut-Hilfe', en: 'Shortcut help', fr: 'Aide aux raccourcis',
    it: 'Aiuto scorciatoie', es: 'Ayuda de atajos',
  },
  'btn-close-shortcut-help': {
    de: 'Schliessen', en: 'Close', fr: 'Fermer', it: 'Chiudi', es: 'Cerrar',
  },
  'hint-shortlist-data': {
    de: 'Kurzlisten (TXT) enthalten nur Segmenttyp und Länge; Metadaten, Symbole und weitere Einstellungen werden nicht gespeichert.',
    en: 'Short lists (TXT) contain only segment type and length; metadata, symbols and other settings are not saved.',
    fr: 'Les listes courtes (TXT) contiennent uniquement le type et la longueur des segments ; métadonnées, symboles et autres réglages ne sont pas enregistrés.',
    it: 'Gli elenchi brevi (TXT) contengono solo tipo e lunghezza dei segmenti; metadati, simboli e altre impostazioni non vengono salvati.',
    es: 'Las listas breves (TXT) solo contienen el tipo y la longitud de los segmentos; no guardan metadatos, símbolos ni otros ajustes.',
  },
  'lbl-segment-shortcut': {
    de: 'Segment-Shortcut (m)', en: 'Segment shortcut (m)', fr: 'Raccourci de segment (m)',
    it: 'Scorciatoia segmento (m)', es: 'Atajo de segmento (m)',
  },
  'hint-segment-shortcut': {
    de: 'Enter oder + fügt Kürzel mit positiver Länge unten an. Mehrere mit Komma trennen, z. B. R10,RW3, RD23.5; R12,5 ist eine Dezimalzahl.',
    en: 'Enter or + appends codes with positive lengths. Separate several with commas, e.g. R10,RW3, RD23.5; R12,5 is a decimal.',
    fr: 'Entrée ou + ajoute les codes avec longueur positive. Séparer par des virgules, p. ex. R10,RW3, RD23.5 ; R12,5 est un décimal.',
    it: 'Invio o + aggiunge codici con lunghezza positiva. Separali con virgole, ad es. R10,RW3, RD23.5; R12,5 è un decimale.',
    es: 'Intro o + añade códigos con longitud positiva. Separa varios con comas, p. ej. R10,RW3, RD23.5; R12,5 es un decimal.',
  },
  'shortcut-mapping': {
    de: 'R=RAPPEL · RD=RAPPEL_DRY · RW=RAPPEL_WET · P=POOL · J=JUMP · S=SLIDE · C=CLIMB · W=WALK',
    en: 'R=RAPPEL · RD=RAPPEL_DRY · RW=RAPPEL_WET · P=POOL · J=JUMP · S=SLIDE · C=CLIMB · W=WALK',
    fr: 'R=RAPPEL · RD=RAPPEL_DRY · RW=RAPPEL_WET · P=POOL · J=JUMP · S=SLIDE · C=CLIMB · W=WALK',
    it: 'R=RAPPEL · RD=RAPPEL_DRY · RW=RAPPEL_WET · P=POOL · J=JUMP · S=SLIDE · C=CLIMB · W=WALK',
    es: 'R=RAPPEL · RD=RAPPEL_DRY · RW=RAPPEL_WET · P=POOL · J=JUMP · S=SLIDE · C=CLIMB · W=WALK',
  },
  'lbl-menu': { de: 'Menü', en: 'Menu', fr: 'Menu', it: 'Menu', es: 'Menú' },
  'lbl-language': { de: 'Sprache', en: 'Language', fr: 'Langue', it: 'Lingua', es: 'Idioma' },
  'btn-new': { de: 'Neu', en: 'New', fr: 'Nouveau', it: 'Nuovo', es: 'Nuevo' },
  'btn-new-default': { de: 'Neu', en: 'New', fr: 'Nouveau', it: 'Nuovo', es: 'Nuevo' },
  'btn-new-empty': { de: 'Leer', en: 'Empty', fr: 'Vide', it: 'Vuoto', es: 'Vacío' },
  'btn-example': { de: 'Beispiel', en: 'Example', fr: 'Exemple', it: 'Esempio', es: 'Ejemplo' },
  'btn-random': { de: 'Zufall', en: 'Random', fr: 'Aléatoire', it: 'Casuale', es: 'Aleatorio' },
  'lbl-file-open': { de: 'Öffnen…', en: 'Open…', fr: 'Ouvrir…', it: 'Apri…', es: 'Abrir…' },
  'btn-open-oc': { de: 'Von OC öffnen', en: 'Open from OC', fr: 'Ouvrir depuis OC', it: 'Apri da OC', es: 'Abrir desde OC' },
  'btn-save-oc': { de: 'Auf OC speichern', en: 'Save to OC', fr: 'Enregistrer sur OC', it: 'Salva su OC', es: 'Guardar en OC' },
  'btn-save': { de: 'Speichern…', en: 'Save…', fr: 'Enregistrer…', it: 'Salva…', es: 'Guardar…' },
  'btn-save-json': { de: 'JSON speichern', en: 'Save JSON', fr: 'Enregistrer JSON', it: 'Salva JSON', es: 'Guardar JSON' },
  'btn-save-xml': { de: 'XML speichern', en: 'Save XML', fr: 'Enregistrer XML', it: 'Salva XML', es: 'Guardar XML' },
  'btn-export-svg': { de: 'SVG', en: 'SVG', fr: 'SVG', it: 'SVG', es: 'SVG' },
  'btn-export-png': { de: 'PNG', en: 'PNG', fr: 'PNG', it: 'PNG', es: 'PNG' },
  'btn-export-shortlist': { de: 'Kurzliste', en: 'Short list', fr: 'Liste courte', it: 'Elenco breve', es: 'Lista breve' },
  'btn-print': { de: 'Drucken / PDF', en: 'Print / PDF', fr: 'Imprimer / PDF', it: 'Stampa / PDF', es: 'Imprimir / PDF' },
  'lbl-select-layout': { de: 'Layout', en: 'Layout', fr: 'Disposition', it: 'Layout', es: 'Diseño' },
  'opt-layout-serpentine': {
    de: 'Serpentine (Zeilen)',
    en: 'Serpentine (rows)',
    fr: 'Serpentin (lignes)',
    it: 'Serpentina (righe)',
    es: 'Serpentina (filas)',
  },
  'opt-layout-cascaded': {
    de: 'Kaskadiert (Spalten)',
    en: 'Cascaded (columns)',
    fr: 'En cascade (colonnes)',
    it: 'A cascata (colonne)',
    es: 'En cascada (columnas)',
  },
  'opt-layout-linear': {
    de: 'Linear (eine Zeile)',
    en: 'Linear (one row)',
    fr: 'Linéaire (une ligne)',
    it: 'Lineare (una riga)',
    es: 'Lineal (una fila)',
  },
  'lbl-select-theme': { de: 'Stil', en: 'Style', fr: 'Style', it: 'Stile', es: 'Estilo' },
  'opt-theme-color': { de: 'Farbe', en: 'Color', fr: 'Couleur', it: 'Colore', es: 'Color' },
  'opt-theme-alpiner-classic': {
    de: 'Alpin klassisch',
    en: 'Alpine classic',
    fr: 'Alpin classique',
    it: 'Alpino classico',
    es: 'Alpino clásico',
  },
  'opt-theme-eau-froide': { de: 'Standard', en: 'Default', fr: 'Standard', it: 'Standard', es: 'Estándar' },
  'opt-theme-pencil-sketch': {
    de: 'Bleistiftskizze',
    en: 'Pencil sketch',
    fr: 'Croquis au crayon',
    it: 'Schizzo a matita',
    es: 'Boceto a lápiz',
  },
  'lbl-select-paper': { de: 'Format', en: 'Format', fr: 'Format', it: 'Formato', es: 'Formato' },
  'opt-paper-screen': { de: 'Bildschirm', en: 'Screen', fr: 'Écran', it: 'Schermo', es: 'Pantalla' },
  'opt-paper-a4-landscape': { de: 'A4 quer', en: 'A4 landscape', fr: 'A4 paysage', it: 'A4 orizzontale', es: 'A4 horizontal' },
  'opt-paper-a4-portrait': { de: 'A4 hoch', en: 'A4 portrait', fr: 'A4 portrait', it: 'A4 verticale', es: 'A4 vertical' },
  'opt-paper-a5-landscape': { de: 'A5 quer', en: 'A5 landscape', fr: 'A5 paysage', it: 'A5 orizzontale', es: 'A5 horizontal' },
  'opt-paper-a5-portrait': { de: 'A5 hoch', en: 'A5 portrait', fr: 'A5 portrait', it: 'A5 verticale', es: 'A5 vertical' },
  'view-tab-edit': { de: 'Bearbeiten', en: 'Edit', fr: 'Modifier', it: 'Modifica', es: 'Editar' },
  'view-tab-topo': { de: 'Topo', en: 'Topo', fr: 'Topo', it: 'Topo', es: 'Topo' },
  'view-tab-symbols': { de: 'Symbole', en: 'Symbols', fr: 'Symboles', it: 'Simboli', es: 'Símbolos' },
  'h-panel-topo': { de: 'Topo', en: 'Topo', fr: 'Topo', it: 'Topo', es: 'Topo' },
  'lbl-topo-name': { de: 'Name', en: 'Name', fr: 'Nom', it: 'Nome', es: 'Nombre' },
  'lbl-topo-author': { de: 'Author', en: 'Author', fr: 'Auteur', it: 'Autore', es: 'Autor' },
  'lbl-topo-duration': { de: 'Dauer', en: 'Duration', fr: 'Durée', it: 'Durata', es: 'Duración' },
  'lbl-topo-date': { de: 'Datum', en: 'Date', fr: 'Date', it: 'Data', es: 'Fecha' },
  'lbl-topo-max-walk': {
    de: 'Max. Abseillänge (m)',
    en: 'Max. rappel length (m)',
    fr: 'Longueur max. de rappel (m)',
    it: 'Lunghezza max. calata (m)',
    es: 'Long. máx. de rápel (m)',
  },
  'lbl-topo-recommended-rope-length': {
    de: 'Empfohlene Seillänge',
    en: 'Recommended rope length',
    fr: 'Longueur de corde recommandée',
    it: 'Lunghezza della corda consigliata',
    es: 'Longitud de cuerda recomendada',
  },
  'lbl-topo-line-distance': {
    de: 'Zeilenbreite (m)',
    en: 'Row width (m)',
    fr: 'Largeur de ligne (m)',
    it: 'Larghezza riga (m)',
    es: 'Ancho de fila (m)',
  },
  'lbl-topo-length-shortening-threshold': {
    de: 'Segmente verkürzen ab (m): ',
    en: 'Shorten segments from (m): ',
    fr: 'Raccourcir les segments à partir de (m) : ',
    it: 'Accorcia i segmenti da (m): ',
    es: 'Acortar segmentos a partir de (m): ',
  },
  'h-panel-segments': { de: 'Segmente', en: 'Segments', fr: 'Segments', it: 'Segmenti', es: 'Segmentos' },
  'btn-add-segment': { de: '+', en: '+', fr: '+', it: '+', es: '+' },
  'h-panel-photo': { de: 'Foto-Referenz', en: 'Photo reference', fr: 'Référence photo', it: 'Riferimento foto', es: 'Referencia de foto' },
  'hint-photo-usage': {
    de: 'Foto oder PDF als Hintergrund einblenden und Topo darüber nachzeichnen.',
    en: 'Show a photo or PDF as background and trace the topo over it.',
    fr: 'Afficher une photo ou un PDF en arrière-plan et dessiner le topo par-dessus.',
    it: 'Mostra una foto o un PDF come sfondo e ricalca il topo sopra.',
    es: 'Mostrar una foto o un PDF como fondo y calcar el topo encima.',
  },
  'lbl-file-photo': {
    de: 'Foto oder PDF wählen…',
    en: 'Choose photo or PDF…',
    fr: 'Choisir une photo ou un PDF…',
    it: 'Scegli foto o PDF…',
    es: 'Elegir foto o PDF…',
  },
  'lbl-photo-page': { de: 'PDF-Seite', en: 'PDF page', fr: 'Page PDF', it: 'Pagina PDF', es: 'Página PDF' },
  'lbl-photo-opacity': { de: 'Deckkraft', en: 'Opacity', fr: 'Opacité', it: 'Opacità', es: 'Opacidad' },
  'lbl-photo-scale': { de: 'Größe', en: 'Size', fr: 'Taille', it: 'Dimensione', es: 'Tamaño' },
  'lbl-photo-x': { de: 'Horizontal', en: 'Horizontal', fr: 'Horizontal', it: 'Orizzontale', es: 'Horizontal' },
  'lbl-photo-y': { de: 'Vertikal', en: 'Vertical', fr: 'Vertical', it: 'Verticale', es: 'Vertical' },
  'btn-photo-clear': {
    de: 'Referenz entfernen',
    en: 'Remove reference',
    fr: 'Supprimer la référence',
    it: 'Rimuovi riferimento',
    es: 'Quitar referencia',
  },
  'h-panel-ai': { de: 'AI-Erkennung', en: 'AI detection', fr: 'Détection IA', it: 'Rilevamento IA', es: 'Detección IA' },
  'h-ai-lock': {
    de: 'AI-Erkennung entsperren',
    en: 'Unlock AI detection',
    fr: 'Déverrouiller la détection IA',
    it: 'Sblocca rilevamento IA',
    es: 'Desbloquear detección IA',
  },
  'lbl-ai-lock-password': { de: 'Passwort', en: 'Password', fr: 'Mot de passe', it: 'Password', es: 'Contraseña' },
  'ai-lock-error': { de: 'Falsches Passwort.', en: 'Wrong password.', fr: 'Mot de passe incorrect.', it: 'Password errata.', es: 'Contraseña incorrecta.' },
  'btn-ai-lock-cancel': { de: 'Abbrechen', en: 'Cancel', fr: 'Annuler', it: 'Annulla', es: 'Cancelar' },
  'btn-ai-lock-submit': { de: 'Entsperren', en: 'Unlock', fr: 'Déverrouiller', it: 'Sblocca', es: 'Desbloquear' },
  'btn-photo-ai': {
    de: 'Aus Foto erzeugen (AI)',
    en: 'Generate from photo (AI)',
    fr: 'Générer depuis la photo (IA)',
    it: 'Genera dalla foto (IA)',
    es: 'Generar desde la foto (IA)',
  },
  'btn-ai-cancel': { de: 'Abbrechen', en: 'Cancel', fr: 'Annuler', it: 'Annulla', es: 'Cancelar' },
  'lbl-ai-settings': { de: 'Einstellungen', en: 'Settings', fr: 'Paramètres', it: 'Impostazioni', es: 'Ajustes' },
  'lbl-ai-provider': { de: 'Anbieter', en: 'Provider', fr: 'Fournisseur', it: 'Fornitore', es: 'Proveedor' },
  'lbl-ai-endpoint': { de: 'Endpoint', en: 'Endpoint', fr: 'Endpoint', it: 'Endpoint', es: 'Endpoint' },
  'lbl-ai-model': { de: 'Modell', en: 'Model', fr: 'Modèle', it: 'Modello', es: 'Modelo' },
  'btn-ai-models': { de: 'Modelle laden', en: 'Load models', fr: 'Charger les modèles', it: 'Carica modelli', es: 'Cargar modelos' },
  'lbl-ai-key': { de: 'API-Key', en: 'API key', fr: 'Clé API', it: 'Chiave API', es: 'Clave API' },
  'lbl-ai-prompt-template': { de: 'Prompt-Vorlage', en: 'Prompt template', fr: 'Modèle de prompt', it: 'Modello di prompt', es: 'Plantilla de prompt' },
  'lbl-ai-prompt-custom': { de: 'Eigener Prompt', en: 'Custom prompt', fr: 'Prompt personnalisé', it: 'Prompt personalizzato', es: 'Prompt propio' },
  'lbl-ai-notes': {
    de: 'Zusatzinfo für das Modell (optional)',
    en: 'Extra info for the model (optional)',
    fr: 'Infos supplémentaires pour le modèle (optionnel)',
    it: 'Informazioni aggiuntive per il modello (opzionale)',
    es: 'Información adicional para el modelo (opcional)',
  },
  'btn-ai-forget': { de: 'Key löschen', en: 'Delete key', fr: 'Supprimer la clé', it: 'Elimina chiave', es: 'Borrar clave' },
  'btn-zoom-fit': { de: 'Einpassen', en: 'Fit', fr: 'Ajuster', it: 'Adatta', es: 'Ajustar' },
  'h-panel-selection': { de: 'Auswahl', en: 'Selection', fr: 'Sélection', it: 'Selezione', es: 'Selección' },
  'h-panel-symbols': { de: 'Symbole', en: 'Symbols', fr: 'Symboles', it: 'Simboli', es: 'Símbolos' },
  'hint-symbol-palette': {
    de: 'Auf ein ausgewähltes Segment klicken, um ein Symbol hinzuzufügen.',
    en: 'Click a selected segment to add a symbol.',
    fr: 'Cliquer sur un segment sélectionné pour ajouter un symbole.',
    it: 'Clicca su un segmento selezionato per aggiungere un simbolo.',
    es: 'Haz clic en un segmento seleccionado para añadir un símbolo.',
  },
  'h-panel-validation': { de: 'Prüfung', en: 'Validation', fr: 'Vérification', it: 'Verifica', es: 'Verificación' },
};

/** Text mit bewusst erlaubtem Markup (`innerHTML`) je Element-ID; keine Nutzerdaten. */
export const UI_HTML = {
  'hint-ai-cors': {
    de: 'Erzeugt aus dem geladenen Bild bzw. der PDF-Seite ein Topo. Der Aufruf läuft direkt aus deinem Browser zum Modell — blockiert ein Gateway das (CORS), springt automatisch der lokale Proxy ein, sofern er läuft (<code>npm start</code>).',
    en: 'Generates a topo from the loaded image or PDF page. The call goes directly from your browser to the model — if a gateway blocks that (CORS), the local proxy steps in automatically as long as it is running (<code>npm start</code>).',
    fr: 'Génère un topo à partir de l\u2019image ou de la page PDF chargée. L\u2019appel part directement de votre navigateur vers le modèle — si une passerelle le bloque (CORS), le proxy local prend automatiquement le relais s\u2019il est lancé (<code>npm start</code>).',
    it: 'Genera un topo dall\u2019immagine o dalla pagina PDF caricata. La chiamata parte direttamente dal browser verso il modello — se un gateway la blocca (CORS), il proxy locale subentra automaticamente se è in esecuzione (<code>npm start</code>).',
    es: 'Genera un topo a partir de la imagen o la página PDF cargada. La llamada va directamente de tu navegador al modelo — si una pasarela la bloquea (CORS), el proxy local interviene automáticamente siempre que esté en marcha (<code>npm start</code>).',
  },
  'hint-ai-key-storage': {
    de: 'Der Key wird nur im <code>localStorage</code> dieses Browsers gespeichert und ausschließlich an den angegebenen Endpoint gesendet. Auf gemeinsam genutzten Rechnern besser einen eigenen Proxy verwenden.',
    en: 'The key is only stored in this browser\u2019s <code>localStorage</code> and sent exclusively to the given endpoint. On shared computers, use your own proxy instead.',
    fr: 'La clé est uniquement stockée dans le <code>localStorage</code> de ce navigateur et envoyée exclusivement à l\u2019endpoint indiqué. Sur un ordinateur partagé, préférez votre propre proxy.',
    it: 'La chiave viene salvata solo nel <code>localStorage</code> di questo browser e inviata esclusivamente all\u2019endpoint indicato. Su computer condivisi è meglio usare un proxy proprio.',
    es: 'La clave solo se guarda en el <code>localStorage</code> de este navegador y se envía exclusivamente al endpoint indicado. En ordenadores compartidos, mejor usar un proxy propio.',
  },
};

/** `title`-Attribut je Element-ID. */
export const UI_TITLES = {
  'btn-shortcut-help': {
    de: 'Shortcut-Hilfe öffnen', en: 'Open shortcut help', fr: 'Ouvrir l’aide aux raccourcis',
    it: 'Apri aiuto scorciatoie', es: 'Abrir ayuda de atajos',
  },
  'btn-add-shortcut': {
    de: 'Segment aus Shortcut hinzufügen', en: 'Add segment from shortcut',
    fr: 'Ajouter un segment à partir du raccourci', it: 'Aggiungi segmento dalla scorciatoia',
    es: 'Añadir segmento desde el atajo',
  },
  'btn-add-segment': {
    de: 'Segment hinzufügen',
    en: 'Add segment',
    fr: 'Ajouter un segment',
    it: 'Aggiungi segmento',
    es: 'Añadir segmento',
  },
  'btn-random': {
    de: 'Zufälliges Topo mit allen Segmenttypen und Symbolen',
    en: 'Random topo with all segment types and symbols',
    fr: 'Topo aléatoire avec tous les types de segments et symboles',
    it: 'Topo casuale con tutti i tipi di segmento e simboli',
    es: 'Topo aleatorio con todos los tipos de segmento y símbolos',
  },
  'btn-undo': {
    de: 'Rückgängig (Cmd/Ctrl+Z)',
    en: 'Undo (Cmd/Ctrl+Z)',
    fr: 'Annuler (Cmd/Ctrl+Z)',
    it: 'Annulla (Cmd/Ctrl+Z)',
    es: 'Deshacer (Cmd/Ctrl+Z)',
  },
  'btn-redo': {
    de: 'Wiederholen (Cmd/Ctrl+Shift+Z)',
    en: 'Redo (Cmd/Ctrl+Shift+Z)',
    fr: 'Rétablir (Cmd/Ctrl+Shift+Z)',
    it: 'Ripeti (Cmd/Ctrl+Shift+Z)',
    es: 'Rehacer (Cmd/Ctrl+Shift+Z)',
  },
  'btn-photo-page-prev': {
    de: 'Vorherige Seite',
    en: 'Previous page',
    fr: 'Page précédente',
    it: 'Pagina precedente',
    es: 'Página anterior',
  },
  'btn-photo-page-next': { de: 'Nächste Seite', en: 'Next page', fr: 'Page suivante', it: 'Pagina successiva', es: 'Página siguiente' },
  'lbl-topo-line-distance-row': {
    de: 'Serpentine: Zeilenbreite · Kaskadiert: Spaltenhöhe (Format Bildschirm)',
    en: 'Serpentine: row width · Cascaded: column height (screen format)',
    fr: 'Serpentin : largeur de ligne · En cascade : hauteur de colonne (format écran)',
    it: 'Serpentina: larghezza riga · A cascata: altezza colonna (formato schermo)',
    es: 'Serpentina: ancho de fila · En cascada: alto de columna (formato pantalla)',
  },
};

/** `placeholder`-Attribut je Element-ID. */
export const UI_PLACEHOLDERS = {
  'segment-shortcut': {
    de: 'shortcuts', en: 'shortcuts', fr: 'shortcuts', it: 'shortcuts', es: 'shortcuts',
  },
  'ai-notes': {
    de: 'z. B. Gerätebezeichnungen, Sprache, Region',
    en: 'e.g. device names, language, region',
    fr: 'p. ex. noms d\u2019appareils, langue, région',
    it: 'per es. nomi dei dispositivi, lingua, regione',
    es: 'p. ej. nombres de dispositivos, idioma, región',
  },
};

/** `aria-label`-Attribut je Element-ID. */
export const UI_ARIA_LABELS = {
  'btn-status-details': {
    de: 'Vollständige Statusmeldung anzeigen', en: 'Show full status message',
    fr: 'Afficher le message d’état complet', it: 'Mostra il messaggio di stato completo',
    es: 'Mostrar el mensaje de estado completo',
  },
  'btn-shortcut-help': {
    de: 'Shortcut-Hilfe öffnen', en: 'Open shortcut help', fr: 'Ouvrir l’aide aux raccourcis',
    it: 'Apri aiuto scorciatoie', es: 'Abrir ayuda de atajos',
  },
  'btn-add-shortcut': {
    de: 'Segment aus Shortcut hinzufügen', en: 'Add segment from shortcut',
    fr: 'Ajouter un segment à partir du raccourci', it: 'Aggiungi segmento dalla scorciatoia',
    es: 'Añadir segmento desde el atajo',
  },
  'btn-add-segment': {
    de: 'Segment hinzufügen',
    en: 'Add segment',
    fr: 'Ajouter un segment',
    it: 'Aggiungi segmento',
    es: 'Añadir segmento',
  },
  'view-switch': { de: 'Ansicht', en: 'View', fr: 'Vue', it: 'Vista', es: 'Vista' },
  'panel-left': {
    de: 'Topo, Segmente und Foto-Referenz',
    en: 'Topo, segments and photo reference',
    fr: 'Topo, segments et référence photo',
    it: 'Topo, segmenti e riferimento foto',
    es: 'Topo, segmentos y referencia de foto',
  },
  'panel-right': {
    de: 'Auswahl, Symbole und Prüfung',
    en: 'Selection, symbols and validation',
    fr: 'Sélection, symboles et vérification',
    it: 'Selezione, simboli e verifica',
    es: 'Selección, símbolos y verificación',
  },
  'save-menu': { de: 'Speichern', en: 'Save', fr: 'Enregistrer', it: 'Salva', es: 'Guardar' },
  'new-menu': { de: 'Neu', en: 'New', fr: 'Nouveau', it: 'Nuovo', es: 'Nuevo' },
};

/** Kategorie-Labels der Symbolpalette, je Kategorie-ID. */
export const SYMBOL_CATEGORY_LABELS = {
  anchors: { de: 'Verankerung', en: 'Anchors', fr: 'Ancrages', it: 'Ancoraggi', es: 'Anclajes' },
  hazards: { de: 'Gefahren', en: 'Hazards', fr: 'Dangers', it: 'Pericoli', es: 'Peligros' },
  nature: { de: 'Natur', en: 'Nature', fr: 'Nature', it: 'Natura', es: 'Naturaleza' },
  infrastructure: { de: 'Infrastruktur', en: 'Infrastructure', fr: 'Infrastructure', it: 'Infrastruttura', es: 'Infraestructura' },
  annotation: { de: 'Beschriftung', en: 'Annotation', fr: 'Annotation', it: 'Annotazione', es: 'Anotación' },
};

/** Symbol-Labels der Palette/Inspektor-Auswahl, je Element-Typ. */
export const SYMBOL_LABELS = {
  BOLT: { de: 'Bolt', en: 'Bolt', fr: 'Spit', it: 'Spit', es: 'Spit' },
  BOLT_LEFT: { de: 'Bolt links', en: 'Bolt left', fr: 'Spit gauche', it: 'Spit sinistro', es: 'Spit izquierda' },
  BOLT_RIGHT: { de: 'Bolt rechts', en: 'Bolt right', fr: 'Spit droit', it: 'Spit destro', es: 'Spit derecha' },
  RAPPEL_GUIDE: {
    de: 'Rappel Guide (RG)',
    en: 'Rappel Guide (RG)',
    fr: 'Guide de rappel (RG)',
    it: 'Guida calata (RG)',
    es: 'Guía de rápel (RG)',
  },
  LADDER: { de: 'Leiter', en: 'Ladder', fr: 'Échelle', it: 'Scala', es: 'Escalera' },
  STONE: { de: 'Block', en: 'Boulder', fr: 'Bloc', it: 'Masso', es: 'Bloque' },
  TRAPPED_STONE: { de: 'Klemmblock', en: 'Chockstone', fr: 'Bloc coincé', it: 'Masso incastrato', es: 'Bloque empotrado' },
  SHARP_EDGE: { de: 'Scharfe Kante', en: 'Sharp edge', fr: 'Arête coupante', it: 'Spigolo tagliente', es: 'Arista cortante' },
  TRUNK: { de: 'Baumstamm', en: 'Tree trunk', fr: 'Tronc d\u2019arbre', it: 'Tronco d\u2019albero', es: 'Tronco' },
  BUSH: { de: 'Busch', en: 'Bush', fr: 'Buisson', it: 'Cespuglio', es: 'Arbusto' },
  LEAF_TREE: { de: 'Laubbaum', en: 'Deciduous tree', fr: 'Arbre feuillu', it: 'Albero a foglie larghe', es: 'Árbol de hoja caduca' },
  CONIFER_TREE: { de: 'Nadelbaum', en: 'Conifer tree', fr: 'Conifère', it: 'Conifera', es: 'Conífera' },
  CAVE: { de: 'Höhle', en: 'Cave', fr: 'Grotte', it: 'Grotta', es: 'Cueva' },
  BACKWATER: { de: 'Rückstrom', en: 'Recirculation', fr: 'Contre-courant', it: 'Rullo', es: 'Rebufo' },
  STONE_BRIDGE: { de: 'Steinbrücke', en: 'Stone bridge', fr: 'Pont en pierre', it: 'Ponte in pietra', es: 'Puente de piedra' },
  WOODEN_BRIDGE: { de: 'Holzbrücke', en: 'Wooden bridge', fr: 'Pont en bois', it: 'Ponte in legno', es: 'Puente de madera' },
  STONE_HOUSE: { de: 'Haus / Hütte', en: 'House / hut', fr: 'Maison / cabane', it: 'Casa / rifugio', es: 'Casa / cabaña' },
  HELICOPTER: { de: 'Helikopter', en: 'Helicopter', fr: 'Hélicoptère', it: 'Elicottero', es: 'Helicóptero' },
  RADIO_MAST: { de: 'Funkmast', en: 'Radio mast', fr: 'Pylône radio', it: 'Traliccio radio', es: 'Mástil de radio' },
  LIFT_MAST: { de: 'Liftmast', en: 'Lift pylon', fr: 'Pylône de télésiège', it: 'Pilone dell\u2019impianto di risalita', es: 'Pilón de remonte' },
  SQUARE_CONCRETE_BASE: {
    de: 'Betonsockel eckig',
    en: 'Square concrete base',
    fr: 'Socle en béton carré',
    it: 'Basamento in cemento squadrato',
    es: 'Base de hormigón cuadrada',
  },
  STEEL_BEAM: { de: 'Stahlträger', en: 'Steel beam', fr: 'Poutre en acier', it: 'Trave in acciaio', es: 'Viga de acero' },
  INLET_LEFT: { de: 'Zufluss links', en: 'Inlet left', fr: 'Affluent gauche', it: 'Affluente sinistro', es: 'Afluente izquierda' },
  INLET_RIGHT: { de: 'Zufluss rechts', en: 'Inlet right', fr: 'Affluent droit', it: 'Affluente destro', es: 'Afluente derecha' },
  ESCAPE_EXIT_LEFT: { de: 'Fluchtweg links', en: 'Escape route left', fr: 'Échappatoire gauche', it: 'Via di fuga sinistra', es: 'Escapatoria izquierda' },
  ESCAPE_EXIT_RIGHT: {
    de: 'Fluchtweg rechts',
    en: 'Escape route right',
    fr: 'Échappatoire droite',
    it: 'Via di fuga destra',
    es: 'Escapatoria derecha',
  },
  ROPE_RAILING_LEFT: {
    de: 'Seilgeländer links',
    en: 'Rope railing left',
    fr: 'Main courante gauche',
    it: 'Corrimano in corda sinistro',
    es: 'Pasamanos izquierda',
  },
  ROPE_RAILING_RIGHT: {
    de: 'Seilgeländer rechts',
    en: 'Rope railing right',
    fr: 'Main courante droite',
    it: 'Corrimano in corda destro',
    es: 'Pasamanos derecha',
  },
  ELEMENT_NUMBER: { de: 'Nummer', en: 'Number', fr: 'Numéro', it: 'Numero', es: 'Número' },
  CUSTOM_TEXT: { de: 'Freitext', en: 'Free text', fr: 'Texte libre', it: 'Testo libero', es: 'Texto libre' },
  WARNING_AND_TEXT: { de: 'Warnung + Text', en: 'Warning + text', fr: 'Avertissement + texte', it: 'Avviso + testo', es: 'Aviso + texto' },
  DEATH_HAZARD: { de: 'Lebensgefahr', en: 'Danger to life', fr: 'Danger de mort', it: 'Pericolo di morte', es: 'Peligro de muerte' },
  TREE_JAM: { de: 'Baumverhau', en: 'Tree jam', fr: 'Embâcle de bois', it: 'Ostruzione di tronchi', es: 'Tapón de troncos' },
  BOULDER_JAM: { de: 'Felsblockverhau', en: 'Boulder jam', fr: 'Embâcle rocheux', it: 'Ostruzione di massi', es: 'Tapón de bloques' },
  ROCKFALL: { de: 'Steinschlag', en: 'Rockfall', fr: 'Chute de pierres', it: 'Caduta massi', es: 'Caída de piedras' },
  UNDERCUT: { de: 'Unterspülung', en: 'Undercut', fr: 'Sape', it: 'Sottoescavazione', es: 'Socavón' },
  DANGEROUS_CURRENT: {
    de: 'Gefährliche Strömung',
    en: 'Dangerous current',
    fr: 'Courant dangereux',
    it: 'Corrente pericolosa',
    es: 'Corriente peligrosa',
  },
  SIPHON: { de: 'Siphon', en: 'Siphon', fr: 'Siphon', it: 'Sifone', es: 'Sifón' },
  WATER_DIVERSION: {
    de: 'Wasserableitung',
    en: 'Water diversion',
    fr: 'Dérivation d\u2019eau',
    it: 'Deviazione d\u2019acqua',
    es: 'Desvío de agua',
  },
  PATH: { de: 'Pfad', en: 'Path', fr: 'Sentier', it: 'Sentiero', es: 'Sendero' },
  ROAD: { de: 'Weg / Strasse', en: 'Track / road', fr: 'Chemin / route', it: 'Pista / strada', es: 'Camino / carretera' },
  BYPASS: { de: 'Umgehung', en: 'Bypass', fr: 'Contournement', it: 'Deviazione', es: 'Desvío' },
  ENTRY_POINT: { de: 'Einstieg', en: 'Entry point', fr: 'Départ', it: 'Attacco', es: 'Entrada' },
  EXIT_POINT: { de: 'Ausstieg', en: 'Exit point', fr: 'Sortie', it: 'Uscita', es: 'Salida' },
};

/** Zusatz für „abgestorben“-Varianten (Laub-/Nadelbaum). */
const DEAD_SUFFIX = {
  de: ' (abgestorben)',
  en: ' (dead)',
  fr: ' (mort)',
  it: ' (morto)',
  es: ' (muerto)',
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
  openai: { de: 'OpenAI-kompatibel', en: 'OpenAI-compatible', fr: 'Compatible OpenAI', it: 'Compatibile OpenAI', es: 'Compatible con OpenAI' },
  anthropic: { de: 'Anthropic (Claude)', en: 'Anthropic (Claude)', fr: 'Anthropic (Claude)', it: 'Anthropic (Claude)', es: 'Anthropic (Claude)' },
  proxy: {
    de: 'Eigener Proxy (ohne Key im Browser)',
    en: 'Custom proxy (no key in the browser)',
    fr: 'Proxy personnalisé (sans clé dans le navigateur)',
    it: 'Proxy personale (senza chiave nel browser)',
    es: 'Proxy propio (sin clave en el navegador)',
  },
};

export const AI_PROVIDER_HINTS = {
  openai: {
    de: 'Standard: Swisscom Swiss AI Platform; funktioniert auch mit OpenAI, Azure OpenAI, OpenRouter, Groq, LM Studio oder Ollama (/v1).',
    en: 'Default: Swisscom Swiss AI Platform; also works with OpenAI, Azure OpenAI, OpenRouter, Groq, LM Studio or Ollama (/v1).',
    fr: 'Par défaut : Swisscom Swiss AI Platform ; fonctionne aussi avec OpenAI, Azure OpenAI, OpenRouter, Groq, LM Studio ou Ollama (/v1).',
    it: 'Predefinito: Swisscom Swiss AI Platform; funziona anche con OpenAI, Azure OpenAI, OpenRouter, Groq, LM Studio o Ollama (/v1).',
    es: 'Por defecto: Swisscom Swiss AI Platform; también funciona con OpenAI, Azure OpenAI, OpenRouter, Groq, LM Studio u Ollama (/v1).',
  },
  anthropic: {
    de: 'Direkte Browser-Aufrufe müssen im Anthropic-Konto erlaubt sein.',
    en: 'Direct browser calls must be allowed in the Anthropic account.',
    fr: 'Les appels directs depuis le navigateur doivent être autorisés dans le compte Anthropic.',
    it: 'Le chiamate dirette dal browser devono essere consentite nell\u2019account Anthropic.',
    es: 'Las llamadas directas desde el navegador deben estar permitidas en la cuenta de Anthropic.',
  },
  proxy: {
    de: 'Nötig für Gateways ohne CORS (z. B. api.swisscom.com). Proxy starten: AI_KEY=… node tools/proxy.mjs',
    en: 'Needed for gateways without CORS (e.g. api.swisscom.com). Start proxy: AI_KEY=… node tools/proxy.mjs',
    fr: 'Nécessaire pour les passerelles sans CORS (p. ex. api.swisscom.com). Démarrer le proxy : AI_KEY=… node tools/proxy.mjs',
    it: 'Necessario per gateway senza CORS (per es. api.swisscom.com). Avvia il proxy: AI_KEY=… node tools/proxy.mjs',
    es: 'Necesario para pasarelas sin CORS (p. ej. api.swisscom.com). Iniciar el proxy: AI_KEY=… node tools/proxy.mjs',
  },
};

/** Prompt-Vorlagen-Labels/-Hinweise der AI-Erkennung, je Vorlagen-ID. */
export const AI_PROMPT_LABELS = {
  optimized: { de: 'Optimiert (empfohlen)', en: 'Optimized (recommended)', fr: 'Optimisé (recommandé)', it: 'Ottimizzato (consigliato)', es: 'Optimizado (recomendado)' },
  compact: { de: 'Kompakt', en: 'Compact', fr: 'Compact', it: 'Compatto', es: 'Compacto' },
  legacy: { de: 'Bisheriger Prompt', en: 'Previous prompt', fr: 'Ancien prompt', it: 'Prompt precedente', es: 'Prompt anterior' },
  custom: { de: 'Eigener Prompt', en: 'Custom prompt', fr: 'Prompt personnalisé', it: 'Prompt personalizzato', es: 'Prompt propio' },
};

export const AI_PROMPT_HINTS = {
  optimized: {
    de: 'Vorlagengetreue Rekonstruktion mit Symbolzuordnung, Lesereihenfolge und belegten Angaben.',
    en: 'Faithful reconstruction with symbol mapping, reading order and evidenced values.',
    fr: 'Reconstruction fidèle avec correspondance des symboles, ordre de lecture et valeurs justifiées.',
    it: 'Ricostruzione fedele con mappatura dei simboli, ordine di lettura e valori documentati.',
    es: 'Reconstrucción fiel con asignación de símbolos, orden de lectura y valores justificados.',
  },
  compact: {
    de: 'Kurzfassung für kleine Modelle oder enges Kontextfenster.',
    en: 'Short version for small models or a narrow context window.',
    fr: 'Version courte pour petits modèles ou fenêtre de contexte réduite.',
    it: 'Versione breve per modelli piccoli o finestra di contesto ridotta.',
    es: 'Versión corta para modelos pequeños o una ventana de contexto reducida.',
  },
  legacy: {
    de: 'Der Prompt vor der Überarbeitung – zum Vergleichen.',
    en: 'The prompt before the revision – for comparison.',
    fr: 'Le prompt avant la révision – pour comparaison.',
    it: 'Il prompt prima della revisione – per confronto.',
    es: 'El prompt antes de la revisión – para comparar.',
  },
  custom: {
    de: 'Frei editierbar, vorbelegt mit der optimierten Vorlage.',
    en: 'Freely editable, pre-filled with the optimized template.',
    fr: 'Librement modifiable, pré-rempli avec le modèle optimisé.',
    it: 'Liberamente modificabile, precompilato con il modello ottimizzato.',
    es: 'Libremente editable, prerrellenado con la plantilla optimizada.',
  },
};

/** Label-Texte der Legende innerhalb des Topo-SVGs, je Zeilen-Key. */
export const LEGEND_LABELS = {
  duration: { de: 'Dauer', en: 'Duration', fr: 'Durée', it: 'Durata', es: 'Duración' },
  maximum_walk_length: { de: 'Max. Abseil', en: 'Max. rappel', fr: 'Rappel max.', it: 'Calata max.', es: 'Rápel máx.' },
  recommended_rope_length: {
    de: 'Empfohlene Seillänge',
    en: 'Recommended rope length',
    fr: 'Longueur de corde recommandée',
    it: 'Lunghezza della corda consigliata',
    es: 'Longitud de cuerda recomendada',
  },
  author: { de: 'Author', en: 'Author', fr: 'Auteur', it: 'Autore', es: 'Autor' },
  date: { de: 'Datum', en: 'Date', fr: 'Date', it: 'Data', es: 'Fecha' },
  title: { de: 'Legende:', en: 'Legend:', fr: 'Légende :', it: 'Legenda:', es: 'Leyenda:' },
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
  'status.empty_topo': {
    de: 'Leeres Topo ohne Segmente.', en: 'Empty topo without segments.',
    fr: 'Topo vide sans segments.', it: 'Topo vuoto senza segmenti.',
    es: 'Topo vacío sin segmentos.',
  },
  'status.oc_unavailable': {
    de: 'Von OC öffnen ist noch nicht verfügbar: Die API wird noch bereitgestellt.',
    en: 'Open from OC is not available yet: the API is still being provided.',
    fr: 'L’ouverture depuis OC n’est pas encore disponible : l’API est en cours de mise à disposition.',
    it: 'L’apertura da OC non è ancora disponibile: l’API sarà fornita in seguito.',
    es: 'Abrir desde OC aún no está disponible: la API se proporcionará más adelante.',
  },
  'status.oc_save_unavailable': {
    de: 'Auf OC speichern ist noch nicht verfügbar: Die API wird noch bereitgestellt.',
    en: 'Save to OC is not available yet: the API is still being provided.',
    fr: 'L’enregistrement sur OC n’est pas encore disponible : l’API est en cours de mise à disposition.',
    it: 'Il salvataggio su OC non è ancora disponibile: l’API sarà fornita in seguito.',
    es: 'Guardar en OC aún no está disponible: la API se proporcionará más adelante.',
  },
  'shortlist.error.type': {
    de: 'Unbekannter oder fehlender Segmenttyp.', en: 'Unknown or missing segment type.',
    fr: 'Type de segment inconnu ou manquant.', it: 'Tipo di segmento sconosciuto o mancante.',
    es: 'Tipo de segmento desconocido o ausente.',
  },
  'shortlist.error.length': {
    de: 'Länge muss endlich und grösser als 0 sein.', en: 'Length must be finite and greater than 0.',
    fr: 'La longueur doit être finie et supérieure à 0.', it: 'La lunghezza deve essere finita e maggiore di 0.',
    es: 'La longitud debe ser finita y mayor que 0.',
  },
  'shortlist.error.empty': {
    de: 'Die Kurzliste enthält keine Segmente.', en: 'The short list contains no segments.',
    fr: 'La liste courte ne contient aucun segment.', it: 'L’elenco breve non contiene segmenti.',
    es: 'La lista breve no contiene segmentos.',
  },
  'shortlist.line': {
    de: 'Zeile {position}: {message}', en: 'Line {position}: {message}',
    fr: 'Ligne {position} : {message}', it: 'Riga {position}: {message}', es: 'Línea {position}: {message}',
  },
  'shortlist.segment': {
    de: 'Segment {position}: {message}', en: 'Segment {position}: {message}',
    fr: 'Segment {position} : {message}', it: 'Segmento {position}: {message}', es: 'Segmento {position}: {message}',
  },
  'status.shortlist_import_failed': {
    de: 'Kurzliste nicht geladen. {errors}', en: 'Short list not loaded. {errors}',
    fr: 'Liste courte non chargée. {errors}', it: 'Elenco breve non caricato. {errors}', es: 'Lista breve no cargada. {errors}',
  },
  'status.shortlist_export_failed': {
    de: 'Kurzliste nicht exportiert. {errors}', en: 'Short list not exported. {errors}',
    fr: 'Liste courte non exportée. {errors}', it: 'Elenco breve non esportato. {errors}', es: 'Lista breve no exportada. {errors}',
  },
  'status.shortlist_loaded': {
    de: '{name} geladen. TXT enthält nur Typ und Länge; weitere Daten wurden auf Standardwerte gesetzt.',
    en: '{name} loaded. TXT contains only type and length; other data was set to defaults.',
    fr: '{name} chargé. Le TXT ne contient que le type et la longueur ; les autres données ont leurs valeurs par défaut.',
    it: '{name} caricato. Il TXT contiene solo tipo e lunghezza; gli altri dati sono stati impostati ai valori predefiniti.',
    es: '{name} cargado. El TXT solo contiene tipo y longitud; los demás datos tienen valores predeterminados.',
  },
  'shortcut.format': {
    de: 'Ein Kürzel mit Länge eingeben, z. B. R10 oder RD23.',
    en: 'Enter a code and length, e.g. R10 or RD23.',
    fr: 'Saisir un code et une longueur, p. ex. R10 ou RD23.',
    it: 'Inserisci un codice e una lunghezza, ad es. R10 o RD23.',
    es: 'Introduce un código y una longitud, p. ej. R10 o RD23.',
  },
  'shortcut.removed_weir': {
    de: 'WE bzw. WEIR ist ein entfernter Segmenttyp und wird nicht mehr unterstützt.',
    en: 'WE or WEIR is a removed segment type and is no longer supported.',
    fr: 'WE ou WEIR est un type de segment supprimé et ne sera plus pris en charge.',
    it: 'WE o WEIR è un tipo di segmento rimosso e non è più supportato.',
    es: 'WE o WEIR es un tipo de segmento eliminado y ya no es compatible.',
  },
  'shortcut.unknown': {
    de: 'Unbekanntes Kürzel. Gültig sind R, RD, RW, P, J, S, C und W.',
    en: 'Unknown code. Valid codes are R, RD, RW, P, J, S, C and W.',
    fr: 'Code inconnu. Codes valides : R, RD, RW, P, J, S, C et W.',
    it: 'Codice sconosciuto. Codici validi: R, RD, RW, P, J, S, C e W.',
    es: 'Código desconocido. Códigos válidos: R, RD, RW, P, J, S, C y W.',
  },
  'status.removed_weir_import': {
    de: 'Import abgebrochen: Segment {index} ist WEIR und wird nicht mehr unterstützt. Das aktuelle Topo bleibt unverändert.',
    en: 'Import cancelled: segment {index} is WEIR, which is no longer supported. The current topo remains unchanged.',
    fr: 'Import annulé : le segment {index} est WEIR, qui n’est plus pris en charge. Le topo actuel reste inchangé.',
    it: 'Importazione annullata: il segmento {index} è WEIR, non più supportato. Il topo attuale rimane invariato.',
    es: 'Importación cancelada: el segmento {index} es WEIR, que ya no es compatible. El topo actual permanece intacto.',
  },
  'status.removed_weir_storage': {
    de: 'Gespeichertes Topo enthält WEIR und wurde nicht geladen. Es bleibt im Browserspeicher erhalten; Autosave ist in dieser Sitzung deaktiviert.',
    en: 'The saved topo contains WEIR and was not loaded. It remains in browser storage; autosave is disabled for this session.',
    fr: 'Le topo enregistré contient WEIR et n’a pas été chargé. Il reste dans le stockage du navigateur ; la sauvegarde automatique est désactivée pour cette session.',
    it: 'Il topo salvato contiene WEIR e non è stato caricato. Rimane nella memoria del browser; il salvataggio automatico è disattivato per questa sessione.',
    es: 'El topo guardado contiene WEIR y no se ha cargado. Permanece en el almacenamiento del navegador; el guardado automático está desactivado durante esta sesión.',
  },
  'shortcut.length': {
    de: 'Eine endliche Länge grösser als 0 ohne Einheit eingeben, z. B. R10 oder RW12,5.',
    en: 'Enter a finite length greater than 0 without a unit, e.g. R10 or RW12.5.',
    fr: 'Saisir une longueur finie supérieure à 0 sans unité, p. ex. R10 ou RW12,5.',
    it: 'Inserisci una lunghezza finita maggiore di 0 senza unità, ad es. R10 o RW12,5.',
    es: 'Introduce una longitud finita mayor que 0 sin unidad, p. ej. R10 o RW12,5.',
  },
  'status.shortcuts_added': {
    de: '{count} Segmente unten angefügt.',
    en: '{count} segments appended at the end.',
    fr: '{count} segments ajoutés à la fin.',
    it: '{count} segmenti aggiunti alla fine.',
    es: '{count} segmentos añadidos al final.',
  },
  'status.shortcut_added': {
    de: '{type} mit {length} m unten angefügt.',
    en: '{type} with {length} m appended at the end.',
    fr: '{type} de {length} m ajouté à la fin.',
    it: '{type} di {length} m aggiunto alla fine.',
    es: '{type} de {length} m añadido al final.',
  },
  'status.ready': { de: 'bereit', en: 'ready', fr: 'prêt', it: 'pronto', es: 'listo' },
  'status.restored': {
    de: 'Letzter Stand wiederhergestellt.',
    en: 'Last state restored.',
    fr: 'Dernier état restauré.',
    it: 'Ultimo stato ripristinato.',
    es: 'Último estado restaurado.',
  },
  'status.ready_sentence': { de: 'Bereit.', en: 'Ready.', fr: 'Prêt.', it: 'Pronto.', es: 'Listo.' },
  'source.invalid_url': {
    de: 'Nur XML-Dateien derselben Website über HTTP(S) sind erlaubt.',
    en: 'Only same-origin XML files over HTTP(S) are allowed.',
    fr: 'Seuls les fichiers XML de la même origine via HTTP(S) sont autorisés.',
    it: 'Sono consentiti solo file XML della stessa origine tramite HTTP(S).',
    es: 'Solo se permiten archivos XML del mismo origen mediante HTTP(S).',
  },
  'source.invalid_xml': {
    de: 'Ungültiges XML-Topo oder nicht erlaubte Dokumenttypdeklaration.',
    en: 'Invalid XML topo or disallowed document type declaration.',
    fr: 'Topo XML invalide ou déclaration de type de document interdite.',
    it: 'Topo XML non valido o dichiarazione del tipo di documento non consentita.',
    es: 'Topo XML no válido o declaración de tipo de documento no permitida.',
  },
  'source.loaded': {
    de: 'Link-Topo geladen.',
    en: 'Linked topo loaded.',
    fr: 'Topo du lien chargé.',
    it: 'Topo del link caricato.',
    es: 'Topo del enlace cargado.',
  },
  'source.autosave_off': {
    de: 'Autosave ist für diese Sitzung aus; bisherigen Entwurf ohne source und API-Parameter wieder öffnen und Änderungen manuell speichern.',
    en: 'Autosave is off for this session; reopen without source or the API parameter for the previous draft and save changes manually.',
    fr: 'Sauvegarde automatique désactivée pour cette session ; rouvrir sans source ni paramètre API pour retrouver le brouillon et enregistrer manuellement.',
    it: 'Salvataggio automatico disattivato per questa sessione; riaprire senza source e parametro API per la bozza precedente e salvare manualmente.',
    es: 'Autoguardado desactivado durante esta sesión; abre sin source ni el parámetro API para recuperar el borrador y guarda manualmente.',
  },
  'source.cancelled': {
    de: 'Link-Laden abgebrochen, da die Bedienung bereits begonnen hat.',
    en: 'Link loading cancelled because interaction has already started.',
    fr: 'Chargement du lien annulé car une interaction a déjà commencé.',
    it: 'Caricamento del link annullato perché è già iniziata un’interazione.',
    es: 'Carga del enlace cancelada porque ya se ha iniciado una interacción.',
  },
  'api_source.invalid_url': {
    de: 'Ungültige API-Adresse. HTTP(S) ohne Zugangsdaten erforderlich; HTTPS-Seiten benötigen HTTPS.',
    en: 'Invalid API address. HTTP(S) without credentials is required; HTTPS pages require HTTPS.',
    fr: 'Adresse API invalide. HTTP(S) sans identifiants requis ; les pages HTTPS exigent HTTPS.',
    it: 'Indirizzo API non valido. Serve HTTP(S) senza credenziali; le pagine HTTPS richiedono HTTPS.',
    es: 'Dirección API no válida. Se requiere HTTP(S) sin credenciales; las páginas HTTPS requieren HTTPS.',
  },
  'api_source.network_error': {
    de: 'Netzwerk-, CORS- oder Weiterleitungsfehler. API-Erreichbarkeit, CORS-Freigabe und Weiterleitungen beim Anbieter prüfen.',
    en: 'Network, CORS or redirect error. Check API availability, CORS permission and redirects with the provider.',
    fr: 'Erreur réseau, CORS ou de redirection. Vérifier la disponibilité de l’API, les autorisations CORS et les redirections auprès du fournisseur.',
    it: 'Errore di rete, CORS o reindirizzamento. Verificare con il fornitore la disponibilità dell’API, i permessi CORS e i reindirizzamenti.',
    es: 'Error de red, CORS o redirección. Comprueba con el proveedor la disponibilidad de la API, los permisos CORS y las redirecciones.',
  },
  'api_source.invalid_json': {
    de: 'Die API-Antwort ist kein gültiges JSON.',
    en: 'The API response is not valid JSON.',
    fr: 'La réponse API n’est pas un JSON valide.',
    it: 'La risposta API non è JSON valido.',
    es: 'La respuesta de la API no es JSON válido.',
  },
  'api_source.invalid_data': {
    de: 'Ungültige API-Daten: name und ropes müssen Texte, time_trip Text oder Zahl und max_descent eine nichtnegative Zahl sein.',
    en: 'Invalid API data: name and ropes must be strings, time_trip a string or number, and max_descent a non-negative number.',
    fr: 'Données API invalides : name et ropes doivent être des textes, time_trip un texte ou un nombre et max_descent un nombre positif ou nul.',
    it: 'Dati API non validi: name e ropes devono essere testi, time_trip un testo o un numero e max_descent un numero non negativo.',
    es: 'Datos API no válidos: name y ropes deben ser textos, time_trip texto o número y max_descent un número no negativo.',
  },
  'api_source.missing_fields': {
    de: 'Die API-Antwort enthält keines der erwarteten Zuordnungsfelder: name, time_trip, max_descent, ropes.',
    en: 'The API response contains none of the expected mapping fields: name, time_trip, max_descent, ropes.',
    fr: 'La réponse API ne contient aucun des champs de correspondance attendus : name, time_trip, max_descent, ropes.',
    it: 'La risposta API non contiene nessuno dei campi di mappatura previsti: name, time_trip, max_descent, ropes.',
    es: 'La respuesta de la API no contiene ninguno de los campos de mapeo esperados: name, time_trip, max_descent, ropes.',
  },
  'api_source.failed': {
    de: 'API-Daten nicht geladen: {error}', en: 'API data not loaded: {error}',
    fr: 'Données API non chargées : {error}', it: 'Dati API non caricati: {error}', es: 'Datos API no cargados: {error}',
  },
  'api_source.loaded': {
    de: 'API-Daten geladen.', en: 'API data loaded.', fr: 'Données API chargées.',
    it: 'Dati API caricati.', es: 'Datos API cargados.',
  },
  'status.need_segment_first': {
    de: 'Zuerst ein Segment anlegen.',
    en: 'Create a segment first.',
    fr: 'Créer d\u2019abord un segment.',
    it: 'Crea prima un segmento.',
    es: 'Primero crea un segmento.',
  },
  'status.symbol_added': {
    de: '{label} hinzugefügt.',
    en: '{label} added.',
    fr: '{label} ajouté.',
    it: '{label} aggiunto.',
    es: '{label} añadido.',
  },
  'status.rendering_pdf_page': {
    de: 'Rendere PDF-Seite {page}…',
    en: 'Rendering PDF page {page}…',
    fr: 'Rendu de la page PDF {page}…',
    it: 'Rendering pagina PDF {page}…',
    es: 'Renderizando página PDF {page}…',
  },
  'status.pdf_page_loaded': {
    de: 'PDF-Seite {page} von {count} als Referenzlayer geladen.',
    en: 'PDF page {page} of {count} loaded as reference layer.',
    fr: 'Page PDF {page} sur {count} chargée comme calque de référence.',
    it: 'Pagina PDF {page} di {count} caricata come livello di riferimento.',
    es: 'Página PDF {page} de {count} cargada como capa de referencia.',
  },
  'status.pdf_page_render_failed': {
    de: 'PDF-Seite konnte nicht gerendert werden: {error}',
    en: 'PDF page could not be rendered: {error}',
    fr: 'La page PDF n\u2019a pas pu être rendue : {error}',
    it: 'Impossibile eseguire il rendering della pagina PDF: {error}',
    es: 'No se pudo renderizar la página PDF: {error}',
  },
  'status.pdf_opening': {
    de: 'PDF wird geöffnet…',
    en: 'Opening PDF…',
    fr: 'Ouverture du PDF…',
    it: 'Apertura del PDF…',
    es: 'Abriendo PDF…',
  },
  'status.pdf_read_failed': {
    de: 'PDF konnte nicht gelesen werden: {error}',
    en: 'PDF could not be read: {error}',
    fr: 'Le PDF n\u2019a pas pu être lu : {error}',
    it: 'Impossibile leggere il PDF: {error}',
    es: 'No se pudo leer el PDF: {error}',
  },
  'status.photo_loaded': {
    de: 'Foto als Referenzlayer geladen.',
    en: 'Photo loaded as reference layer.',
    fr: 'Photo chargée comme calque de référence.',
    it: 'Foto caricata come livello di riferimento.',
    es: 'Foto cargada como capa de referencia.',
  },
  'status.photo_read_failed': {
    de: 'Foto konnte nicht gelesen werden.',
    en: 'Photo could not be read.',
    fr: 'La photo n\u2019a pas pu être lue.',
    it: 'Impossibile leggere la foto.',
    es: 'No se pudo leer la foto.',
  },
  'status.file_loaded': {
    de: '{name} geladen.',
    en: '{name} loaded.',
    fr: '{name} chargé.',
    it: '{name} caricato.',
    es: '{name} cargado.',
  },
  'status.file_load_failed': {
    de: 'Fehler beim Laden: {error}',
    en: 'Error while loading: {error}',
    fr: 'Erreur lors du chargement : {error}',
    it: 'Errore durante il caricamento: {error}',
    es: 'Error al cargar: {error}',
  },
  'status.example_loaded': {
    de: 'Beispiel-Topo geladen.',
    en: 'Example topo loaded.',
    fr: 'Topo d\u2019exemple chargé.',
    it: 'Topo di esempio caricato.',
    es: 'Topo de ejemplo cargado.',
  },
  'status.example_load_failed': {
    de: 'Beispiel nicht ladbar: {error}',
    en: 'Example could not be loaded: {error}',
    fr: 'Exemple impossible à charger : {error}',
    it: 'Impossibile caricare l\u2019esempio: {error}',
    es: 'No se pudo cargar el ejemplo: {error}',
  },
  'status.new_topo': { de: 'Neues Topo.', en: 'New topo.', fr: 'Nouveau topo.', it: 'Nuovo topo.', es: 'Nuevo topo.' },
  'status.random_topo_created': {
    de: 'Zufalls-Topo „{name}“ erzeugt.',
    en: 'Random topo "{name}" created.',
    fr: 'Topo aléatoire « {name} » créé.',
    it: 'Topo casuale "{name}" creato.',
    es: 'Topo aleatorio «{name}» creado.',
  },
  'status.json_saved': { de: 'JSON gespeichert.', en: 'JSON saved.', fr: 'JSON enregistré.', it: 'JSON salvato.', es: 'JSON guardado.' },
  'status.xml_saved': { de: 'XML gespeichert.', en: 'XML saved.', fr: 'XML enregistré.', it: 'XML salvato.', es: 'XML guardado.' },
  'status.svg_exported': { de: 'SVG exportiert.', en: 'SVG exported.', fr: 'SVG exporté.', it: 'SVG esportato.', es: 'SVG exportado.' },
  'status.png_exported': { de: 'PNG exportiert.', en: 'PNG exported.', fr: 'PNG exporté.', it: 'PNG esportato.', es: 'PNG exportado.' },
  'status.shortlist_exported': {
    de: 'Kurzliste exportiert ({count} Segmente). TXT enthält nur Typ und Länge, keine weiteren Daten.',
    en: 'Short list exported ({count} segments). TXT contains only type and length, no other data.',
    fr: 'Liste courte exportée ({count} segments). Le TXT contient uniquement le type et la longueur.',
    it: 'Elenco breve esportato ({count} segmenti). Il TXT contiene solo tipo e lunghezza.',
    es: 'Lista breve exportada ({count} segmentos). El TXT solo contiene tipo y longitud.',
  },
  'status.ai_unlocked': {
    de: 'AI-Erkennung entsperrt.',
    en: 'AI detection unlocked.',
    fr: 'Détection IA déverrouillée.',
    it: 'Rilevamento IA sbloccato.',
    es: 'Detección IA desbloqueada.',
  },
  'status.shortlist_empty': {
    de: 'Keine Segmente mit Längenangabe – Kurzliste nicht erstellt.',
    en: 'No segments with a length – short list not created.',
    fr: 'Aucun segment avec longueur – liste courte non créée.',
    it: 'Nessun segmento con lunghezza – elenco breve non creato.',
    es: 'No hay segmentos con longitud – lista breve no creada.',
  },
  'status.png_export_failed': {
    de: 'PNG-Export fehlgeschlagen: {error}',
    en: 'PNG export failed: {error}',
    fr: 'Échec de l\u2019export PNG : {error}',
    it: 'Esportazione PNG non riuscita: {error}',
    es: 'Error en la exportación PNG: {error}',
  },
  'status.ai_running': { de: 'AI-Erkennung läuft…', en: 'AI detection running…', fr: 'Détection IA en cours…', it: 'Rilevamento IA in corso…', es: 'Detección IA en curso…' },
  'status.ai_done': {
    de: 'Topo aus Foto erzeugt: {count} Segmente.',
    en: 'Topo generated from photo: {count} segments.',
    fr: 'Topo généré depuis la photo : {count} segments.',
    it: 'Topo generato dalla foto: {count} segmenti.',
    es: 'Topo generado desde la foto: {count} segmentos.',
  },
  'status.ai_cancelled': {
    de: 'AI-Erkennung abgebrochen.',
    en: 'AI detection cancelled.',
    fr: 'Détection IA annulée.',
    it: 'Rilevamento IA annullato.',
    es: 'Detección IA cancelada.',
  },
  'status.ai_failed': {
    de: 'AI-Erkennung fehlgeschlagen.',
    en: 'AI detection failed.',
    fr: 'Échec de la détection IA.',
    it: 'Rilevamento IA non riuscito.',
    es: 'La detección IA ha fallado.',
  },
  'photo.page_info': { de: 'von {count}', en: 'of {count}', fr: 'sur {count}', it: 'di {count}', es: 'de {count}' },
  'segment.action_up': { de: 'nach oben', en: 'move up', fr: 'monter', it: 'sposta su', es: 'subir' },
  'segment.action_down': { de: 'nach unten', en: 'move down', fr: 'descendre', it: 'sposta giù', es: 'bajar' },
  'segment.action_duplicate': { de: 'duplizieren', en: 'duplicate', fr: 'dupliquer', it: 'duplica', es: 'duplicar' },
  'segment.action_delete': { de: 'löschen', en: 'delete', fr: 'supprimer', it: 'elimina', es: 'eliminar' },
  'segment.symbol_count_suffix': {
    de: '· {count} Sym.',
    en: '· {count} sym.',
    fr: '· {count} sym.',
    it: '· {count} sim.',
    es: '· {count} sím.',
  },
  'inspector.pick_hint': {
    de: 'Segment oder Symbol im Topo anklicken.',
    en: 'Click a segment or symbol in the topo.',
    fr: 'Cliquer sur un segment ou un symbole du topo.',
    it: 'Clicca su un segmento o un simbolo nel topo.',
    es: 'Haz clic en un segmento o símbolo del topo.',
  },
  'inspector.selection_gone': {
    de: 'Auswahl nicht mehr vorhanden.',
    en: 'Selection no longer available.',
    fr: 'La sélection n\u2019est plus disponible.',
    it: 'Selezione non più disponibile.',
    es: 'La selección ya no está disponible.',
  },
  'inspector.type': { de: 'Typ', en: 'Type', fr: 'Type', it: 'Tipo', es: 'Tipo' },
  'inspector.length_m': { de: 'Länge (m)', en: 'Length (m)', fr: 'Longueur (m)', it: 'Lunghezza (m)', es: 'Longitud (m)' },
  'inspector.angle_deg': { de: 'Winkel (°)', en: 'Angle (°)', fr: 'Angle (°)', it: 'Angolo (°)', es: 'Ángulo (°)' },
  'inspector.walk_time_min': { de: 'Gehzeit (min)', en: 'Walk time (min)', fr: 'Temps de marche (min)', it: 'Tempo di cammino (min)', es: 'Tiempo de marcha (min)' },
  'inspector.wall_distance_m': {
    de: 'Wanddistanz (m)',
    en: 'Wall distance (m)',
    fr: 'Distance à la paroi (m)',
    it: 'Distanza dalla parete (m)',
    es: 'Distancia a la pared (m)',
  },
  'inspector.depth_m': { de: 'Tiefe (m)', en: 'Depth (m)', fr: 'Profondeur (m)', it: 'Profondità (m)', es: 'Profundidad (m)' },
  'inspector.force_cut_row': {
    de: 'Zeilenumbruch erzwingen',
    en: 'Force row break',
    fr: 'Forcer le saut de ligne',
    it: 'Forza interruzione di riga',
    es: 'Forzar salto de fila',
  },
  'inspector.prevent_cut_row': {
    de: 'Umbruch verhindern',
    en: 'Prevent row break',
    fr: 'Empêcher le saut de ligne',
    it: 'Impedisci interruzione di riga',
    es: 'Impedir salto de fila',
  },
  'inspector.position_along_m': {
    de: 'Position entlang (m)',
    en: 'Position along (m)',
    fr: 'Position le long (m)',
    it: 'Posizione lungo (m)',
    es: 'Posición a lo largo (m)',
  },
  'inspector.position_across_m': {
    de: 'Position quer (m)',
    en: 'Position across (m)',
    fr: 'Position en travers (m)',
    it: 'Posizione trasversale (m)',
    es: 'Posición transversal (m)',
  },
  'inspector.end_along_m': { de: 'Ende entlang (m)', en: 'End along (m)', fr: 'Fin le long (m)', it: 'Fine lungo (m)', es: 'Fin a lo largo (m)' },
  'inspector.end_across_m': {
    de: 'Ende quer (m)',
    en: 'End across (m)',
    fr: 'Fin en travers (m)',
    it: 'Fine trasversale (m)',
    es: 'Fin transversal (m)',
  },
  'inspector.size': { de: 'Größe', en: 'Size', fr: 'Taille', it: 'Dimensione', es: 'Tamaño' },
  'inspector.text': { de: 'Text', en: 'Text', fr: 'Texte', it: 'Testo', es: 'Texto' },
  'inspector.dead': { de: 'Abgestorben', en: 'Dead', fr: 'Mort', it: 'Morto', es: 'Muerto' },
  'inspector.delete_symbol': {
    de: 'Symbol löschen',
    en: 'Delete symbol',
    fr: 'Supprimer le symbole',
    it: 'Elimina simbolo',
    es: 'Eliminar símbolo',
  },
  'issues.none': {
    de: 'Keine Auffälligkeiten.',
    en: 'No issues found.',
    fr: 'Aucune anomalie.',
    it: 'Nessuna anomalia.',
    es: 'Sin incidencias.',
  },
  'validation.not_object': {
    de: 'Kein gültiges Topo-Objekt.',
    en: 'Not a valid topo object.',
    fr: 'Objet topo non valide.',
    it: 'Oggetto topo non valido.',
    es: 'No es un objeto topo válido.',
  },
  'validation.no_segments': {
    de: 'Topo enthält keine Segmente.',
    en: 'Topo contains no segments.',
    fr: 'Le topo ne contient aucun segment.',
    it: 'Il topo non contiene segmenti.',
    es: 'El topo no contiene segmentos.',
  },
  'validation.distance_invalid': {
    de: 'distance_of_single_line muss größer als 0 sein.',
    en: 'distance_of_single_line must be greater than 0.',
    fr: 'distance_of_single_line doit être supérieur à 0.',
    it: 'distance_of_single_line deve essere maggiore di 0.',
    es: 'distance_of_single_line debe ser mayor que 0.',
  },
  'validation.max_walk_invalid': {
    de: 'maximum_walk_length muss größer als 0 sein.',
    en: 'maximum_walk_length must be greater than 0.',
    fr: 'maximum_walk_length doit être supérieur à 0.',
    it: 'maximum_walk_length deve essere maggiore di 0.',
    es: 'maximum_walk_length debe ser mayor que 0.',
  },
  'validation.unknown_segment_type': {
    de: 'Segment {index}: unbekannter Typ "{type}" (wird unverändert erhalten).',
    en: 'Segment {index}: unknown type "{type}" (kept unchanged).',
    fr: 'Segment {index} : type inconnu « {type} » (conservé tel quel).',
    it: 'Segmento {index}: tipo sconosciuto "{type}" (mantenuto invariato).',
    es: 'Segmento {index}: tipo desconocido «{type}» (se conserva sin cambios).',
  },
  'validation.segment_length_invalid': {
    de: 'Segment {index}: Länge muss größer als 0 sein.',
    en: 'Segment {index}: length must be greater than 0.',
    fr: 'Segment {index} : la longueur doit être supérieure à 0.',
    it: 'Segmento {index}: la lunghezza deve essere maggiore di 0.',
    es: 'Segmento {index}: la longitud debe ser mayor que 0.',
  },
  'validation.unknown_element_type': {
    de: 'Segment {index}, Element {elementIndex}: unbekannter Typ "{type}".',
    en: 'Segment {index}, element {elementIndex}: unknown type "{type}".',
    fr: 'Segment {index}, élément {elementIndex} : type inconnu « {type} ».',
    it: 'Segmento {index}, elemento {elementIndex}: tipo sconosciuto "{type}".',
    es: 'Segmento {index}, elemento {elementIndex}: tipo desconocido «{type}».',
  },
  'validation.range_element_no_end': {
    de: 'Segment {index}, Element {elementIndex}: Streckenelement ohne Endpunkt.',
    en: 'Segment {index}, element {elementIndex}: range element without an end point.',
    fr: 'Segment {index}, élément {elementIndex} : élément linéaire sans point final.',
    it: 'Segmento {index}, elemento {elementIndex}: elemento lineare senza punto finale.',
    es: 'Segmento {index}, elemento {elementIndex}: elemento de tramo sin punto final.',
  },
  'ai.models_loading': {
    de: 'Modelle werden geladen …',
    en: 'Loading models …',
    fr: 'Chargement des modèles …',
    it: 'Caricamento modelli …',
    es: 'Cargando modelos …',
  },
  'ai.models_found': {
    de: '{count} Modell(e) gefunden{viaProxy}.',
    en: '{count} model(s) found{viaProxy}.',
    fr: '{count} modèle(s) trouvé(s){viaProxy}.',
    it: '{count} modello/i trovato/i{viaProxy}.',
    es: '{count} modelo(s) encontrado(s){viaProxy}.',
  },
  'ai.models_via_proxy': {
    de: ' (über den lokalen Proxy)',
    en: ' (via the local proxy)',
    fr: ' (via le proxy local)',
    it: ' (tramite il proxy locale)',
    es: ' (a través del proxy local)',
  },
  'ai.model_unknown_but_usable': {
    de: ' "{model}" ist nicht darunter – trotzdem nutzbar.',
    en: ' "{model}" is not among them – still usable.',
    fr: ' « {model} » n\u2019en fait pas partie – reste utilisable.',
    it: ' "{model}" non è tra questi – comunque utilizzabile.',
    es: ' «{model}» no está entre ellos – se puede usar igualmente.',
  },
  'ai.proxy_available': {
    de: 'Lokaler Proxy auf Port {port} erreichbar – er springt automatisch ein, falls das Gateway den Direktaufruf blockiert.',
    en: 'Local proxy reachable on port {port} – it automatically steps in if the gateway blocks the direct call.',
    fr: 'Proxy local joignable sur le port {port} – il prend automatiquement le relais si la passerelle bloque l\u2019appel direct.',
    it: 'Proxy locale raggiungibile sulla porta {port} – subentra automaticamente se il gateway blocca la chiamata diretta.',
    es: 'Proxy local accesible en el puerto {port} – interviene automáticamente si la pasarela bloquea la llamada directa.',
  },
  'ai.need_photo_first': {
    de: 'Zuerst ein Foto oder eine PDF-Seite laden.',
    en: 'Load a photo or PDF page first.',
    fr: 'Charger d\u2019abord une photo ou une page PDF.',
    it: 'Carica prima una foto o una pagina PDF.',
    es: 'Primero carga una foto o una página PDF.',
  },
  'ai.analyzing': {
    de: 'Modell analysiert das Bild…',
    en: 'Model is analyzing the image…',
    fr: 'Le modèle analyse l\u2019image…',
    it: 'Il modello sta analizzando l\u2019immagine…',
    es: 'El modelo está analizando la imagen…',
  },
  'ai.result_summary': {
    de: '{count} Segment(e) erkannt{via}.{skipped} Bitte gegenprüfen.',
    en: '{count} segment(s) detected{via}.{skipped} Please double-check.',
    fr: '{count} segment(s) détecté(s){via}.{skipped} Merci de vérifier.',
    it: '{count} segmento/i rilevato/i{via}.{skipped} Si prega di verificare.',
    es: '{count} segmento(s) detectado(s){via}.{skipped} Por favor, revísalo.',
  },
  'ai.result_skipped_suffix': {
    de: ' {count} Angabe(n) verworfen.',
    en: ' {count} value(s) discarded.',
    fr: ' {count} valeur(s) ignorée(s).',
    it: ' {count} valore/i scartato/i.',
    es: ' {count} valor(es) descartado(s).',
  },
  'ai.aborted': { de: 'Abgebrochen.', en: 'Cancelled.', fr: 'Annulé.', it: 'Annullato.', es: 'Cancelado.' },
  'ai.key_deleted': {
    de: 'API-Key gelöscht.',
    en: 'API key deleted.',
    fr: 'Clé API supprimée.',
    it: 'Chiave API eliminata.',
    es: 'Clave API borrada.',
  },
  'ai.proxy_unavailable': {
    de: 'Kein lokaler Proxy auf Port {port}. Wird nur gebraucht, wenn der Direktaufruf an CORS scheitert – dann im Projektordner "npm start" ausführen.',
    en: 'No local proxy on port {port}. Only needed if the direct call fails due to CORS – then run "npm start" in the project folder.',
    fr: 'Aucun proxy local sur le port {port}. Nécessaire uniquement si l\u2019appel direct échoue à cause de CORS – exécuter alors « npm start » dans le dossier du projet.',
    it: 'Nessun proxy locale sulla porta {port}. Serve solo se la chiamata diretta fallisce per CORS – in tal caso eseguire "npm start" nella cartella del progetto.',
    es: 'No hay proxy local en el puerto {port}. Solo es necesario si la llamada directa falla por CORS – en ese caso ejecuta «npm start» en la carpeta del proyecto.',
  },
  'ai.status_custom_provider': {
    de: 'Eigener Provider über registerTopoProvider() aktiv.',
    en: 'Custom provider active via registerTopoProvider().',
    fr: 'Fournisseur personnalisé actif via registerTopoProvider().',
    it: 'Provider personalizzato attivo tramite registerTopoProvider().',
    es: 'Proveedor propio activo mediante registerTopoProvider().',
  },
  'ai.status_no_endpoint': {
    de: 'Kein Endpoint hinterlegt.',
    en: 'No endpoint configured.',
    fr: 'Aucun endpoint configuré.',
    it: 'Nessun endpoint configurato.',
    es: 'No hay ningún endpoint configurado.',
  },
  'ai.status_invalid_endpoint': {
    de: 'Endpoint muss eine gültige HTTP- oder HTTPS-URL sein.',
    en: 'The endpoint must be a valid HTTP or HTTPS URL.',
    fr: 'Le point de terminaison doit être une URL HTTP ou HTTPS valide.',
    it: "L'endpoint deve essere un URL HTTP o HTTPS valido.",
    es: 'El endpoint debe ser una URL HTTP o HTTPS válida.',
  },
  'ai.status_no_key': {
    de: 'Kein API-Key hinterlegt.',
    en: 'No API key configured.',
    fr: 'Aucune clé API configurée.',
    it: 'Nessuna chiave API configurata.',
    es: 'No hay ninguna clave API configurada.',
  },
  'ai.status_bad_key_char': {
    de: 'Der Key enthält ein unzulässiges Zeichen ("{char}") – vermutlich ein Kopierfehler.',
    en: 'The key contains an invalid character ("{char}") – probably a copy error.',
    fr: 'La clé contient un caractère non autorisé (« {char} ») – probablement une erreur de copie.',
    it: 'La chiave contiene un carattere non consentito ("{char}") – probabilmente un errore di copia.',
    es: 'La clave contiene un carácter no permitido («{char}») – probablemente un error al copiar.',
  },
  'ai.status_no_model': {
    de: 'Kein Modell hinterlegt.',
    en: 'No model configured.',
    fr: 'Aucun modèle configuré.',
    it: 'Nessun modello configurato.',
    es: 'No hay ningún modelo configurado.',
  },
  'ai.status_ready': { de: 'Bereit: {label}', en: 'Ready: {label}', fr: 'Prêt : {label}', it: 'Pronto: {label}', es: 'Listo: {label}' },
  'ai.models_proxy_mode': {
    de: 'Im Proxy-Modus bestimmt der Proxy das Modell.',
    en: 'In proxy mode, the proxy determines the model.',
    fr: 'En mode proxy, c\u2019est le proxy qui détermine le modèle.',
    it: 'In modalità proxy è il proxy a determinare il modello.',
    es: 'En modo proxy, el proxy determina el modelo.',
  },
  'ai.models_bad_key_char': {
    de: 'Der Key enthält ein unzulässiges Zeichen ("{char}").',
    en: 'The key contains an invalid character ("{char}").',
    fr: 'La clé contient un caractère non autorisé (« {char} »).',
    it: 'La chiave contiene un carattere non consentito ("{char}").',
    es: 'La clave contiene un carácter no permitido («{char}»).',
  },
  'ai.models_none_found': {
    de: 'Keine Modell-Liste erkennbar.',
    en: 'No model list recognizable.',
    fr: 'Aucune liste de modèles reconnaissable.',
    it: 'Nessun elenco di modelli riconoscibile.',
    es: 'No se reconoce ninguna lista de modelos.',
  },
  'ai.models_cors': {
    de: 'Der Endpoint ist aus dem Browser nicht erreichbar (CORS). Proxy starten mit "npm start" und http://127.0.0.1:{port}/ öffnen.',
    en: 'The endpoint cannot be reached from the browser (CORS). Start the proxy with "npm start" and open http://127.0.0.1:{port}/.',
    fr: 'L\u2019endpoint n\u2019est pas joignable depuis le navigateur (CORS). Démarrer le proxy avec « npm start » et ouvrir http://127.0.0.1:{port}/.',
    it: 'L\u2019endpoint non è raggiungibile dal browser (CORS). Avvia il proxy con "npm start" e apri http://127.0.0.1:{port}/.',
    es: 'El endpoint no es accesible desde el navegador (CORS). Inicia el proxy con «npm start» y abre http://127.0.0.1:{port}/.',
  },
  'ai.models_proxy_too_old': {
    de: 'Dieser Proxy ist zu alt und kennt /api/models noch nicht.',
    en: 'This proxy is too old and does not support /api/models yet.',
    fr: 'Ce proxy est trop ancien et ne connaît pas encore /api/models.',
    it: 'Questo proxy è troppo vecchio e non supporta ancora /api/models.',
    es: 'Este proxy es demasiado antiguo y aún no admite /api/models.',
  },
  'ai.models_no_list_endpoint': {
    de: 'Dieser Endpoint kennt keine Modell-Liste – Modellname von Hand eintragen.',
    en: 'This endpoint has no model list – enter the model name manually.',
    fr: 'Cet endpoint ne fournit pas de liste de modèles – saisir le nom du modèle à la main.',
    it: 'Questo endpoint non fornisce un elenco di modelli – inserire il nome del modello a mano.',
    es: 'Este endpoint no ofrece lista de modelos – introduce el nombre del modelo a mano.',
  },
};

/**
 * Übersetzt eine Vorlage aus `MESSAGES` und ersetzt `{name}`-Platzhalter.
 * Unbekannte Keys liefern den Key selbst, damit fehlende Übersetzungen sichtbar
 * bleiben statt still eine Erfolgsmeldung zu imitieren.
 * @param {string} lang Sprachcode, unbekannte Sprachen fallen auf Deutsch zurück
 * @param {string} key Schlüssel in `MESSAGES`
 * @param {object} [vars] Werte für Platzhalter
 * @returns {string} übersetzter Text oder unbekannter Schlüssel
 */
export function t(lang, key, vars) {
  const entry = MESSAGES[key];
  if (!entry) return key;
  return format(pick(entry, lang), vars);
}

/**
 * Wendet die statischen Wörterbücher auf passende DOM-IDs an.
 * `getById` wird injiziert, damit das Wörterbuchmodul ohne Browser-DOM testbar ist.
 * `UI_HTML` enthält ausdrücklich HTML-Vorlagen; dynamische Nutzerdaten gehören
 * nicht ungefiltert hinein. Fehlende DOM-IDs werden übersprungen.
 * @param {(id:string)=>Element|null} getById DOM-Lookup
 * @param {string} lang gewünschter Sprachcode
 */
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
