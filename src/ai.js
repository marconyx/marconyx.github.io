/**
 * Foto/PDF → Topo per Vision-Modell.
 *
 * GitHub Pages liefert nur statische Dateien, es gibt also keinen Server, der
 * einen API-Key verwahren könnte. Die App ruft das Modell deshalb direkt aus dem
 * Browser auf; der Key liegt ausschließlich in `localStorage` dieses Browsers und
 * wird nie ins Repository oder an Dritte übertragen.
 *
 * Drei Betriebsarten:
 *   1. `openai`    – OpenAI und jede kompatible API (Azure OpenAI, OpenRouter,
 *                    Groq, LM Studio, Ollama mit /v1). Chat-Completions + Bild.
 *   2. `anthropic` – Claude Messages API. Braucht den Opt-in-Header für direkte
 *                    Browser-Aufrufe.
 *   3. `proxy`     – eigener Endpoint (Worker, Lambda, …), der den Key serverseitig
 *                    hält. Bekommt `{ image, prompt, hints }`, liefert Topo-JSON.
 *
 * `registerTopoProvider(fn)` überschreibt alles und bleibt der Erweiterungspunkt
 * für eigene Implementierungen.
 */
import {
  DEAD_CAPABLE_ELEMENT_TYPES,
  ELEMENT_TYPES,
  RANGE_ELEMENT_TYPES,
  SEGMENT_LABELS,
  SEGMENT_TYPES,
  WALK_TIME_ELEMENT_TYPES,
  defaultAngleFor,
  defaultLengthFor,
  normalizeTopo,
  todayIso,
} from './model.js';
import { SYMBOLS } from './symbols.js';

const SETTINGS_KEY = 'canyon-topo-generator/ai/v1';

export const AI_PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI-kompatibel',
    defaultEndpoint:
      'https://api.swisscom.com/products/swiss-ai-platform/internal-all-models/v1',
    defaultModel: 'qwen/qwen3.6-35b-a3b',
    needsKey: true,
    hint: 'Standard: Swisscom Swiss AI Platform; funktioniert auch mit OpenAI, Azure OpenAI, OpenRouter, Groq, LM Studio oder Ollama (/v1).',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultEndpoint: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    needsKey: true,
    hint: 'Direkte Browser-Aufrufe müssen im Anthropic-Konto erlaubt sein.',
  },
  {
    id: 'proxy',
    label: 'Eigener Proxy (ohne Key im Browser)',
    defaultEndpoint: 'http://127.0.0.1:8787/api/topo',
    defaultModel: '',
    needsKey: false,
    hint: 'Nötig für Gateways ohne CORS (z. B. api.swisscom.com). Proxy starten: AI_KEY=… node tools/proxy.mjs',
  },
];

const DEFAULT_SETTINGS = {
  providerId: 'openai',
  endpoint:
    'https://api.swisscom.com/products/swiss-ai-platform/internal-all-models/v1',
  model: 'qwen/qwen3.6-35b-a3b',
  apiKey: '',
  notes: '',
  // Prompt-Vorlage und eigener Text werden wie Endpoint und Modell gemerkt.
  promptTemplate: 'optimized',
  customPrompt: '',
};

let customProvider = null;
let settings = { ...DEFAULT_SETTINGS };

/* ------------------------------------------------------------- Einstellungen */

export function loadAiSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const stored = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      const migrated = migrateLegacyDefaults(withDefaultsForProvider(stored));
      settings = migrated.settings;
      // Ein migrierter Wert muss zurück in den Speicher, sonst liefe die
      // Umstellung bei jedem Start erneut und ein späterer Standardwechsel
      // liesse sich nicht mehr von einem echten Nutzerwert unterscheiden.
      if (migrated.changed) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      }
    }
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
  return { ...settings };
}

/**
 * Frühere Versionen haben die damaligen Standardwerte beim ersten Start
 * ausdrücklich in den Speicher geschrieben. Für die App sind sie deshalb
 * nicht von selbst gewählten Werten zu unterscheiden – der neue Standard
 * käme nie an. Diese Migration ersetzt genau die beiden alten Vorgaben,
 * jede für sich. Alles andere bleibt unangetastet, auch der Key.
 */
const LEGACY_OPENAI_DEFAULTS = {
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o',
};

function migrateLegacyDefaults(candidate) {
  if (candidate.providerId !== 'openai') return { settings: candidate, changed: false };
  const spec = providerById('openai');
  const next = { ...candidate };
  let changed = false;

  // Abschliessende Slashes sind für den Aufruf bedeutungslos, für einen
  // Textvergleich aber nicht – deshalb vorher abschneiden.
  if (
    String(next.endpoint ?? '').trim().replace(/\/+$/, '') ===
    LEGACY_OPENAI_DEFAULTS.endpoint
  ) {
    next.endpoint = spec.defaultEndpoint;
    changed = true;
  }
  if (String(next.model ?? '').trim() === LEGACY_OPENAI_DEFAULTS.model) {
    next.model = spec.defaultModel;
    changed = true;
  }
  return { settings: next, changed };
}

/**
 * Füllt leere oder fehlende Endpoint-/Modellwerte mit den Vorgaben des
 * gespeicherten Anbieters auf.
 *
 * Nötig, weil ein leerer String beim Zusammenführen mit den Standardwerten
 * gewinnt: Wer das Feld einmal geleert hat, stünde sonst dauerhaft ohne
 * Endpoint da. Ausdrücklich gesetzte, nicht leere Nutzerwerte bleiben
 * unangetastet – auch dann, wenn sich der Standard später ändert.
 */
function withDefaultsForProvider(candidate) {
  const spec = providerById(candidate.providerId);
  const endpoint = String(candidate.endpoint ?? '').trim();
  const model = String(candidate.model ?? '').trim();
  return {
    ...candidate,
    endpoint: endpoint || spec.defaultEndpoint,
    model: model || spec.defaultModel,
  };
}

export function getAiSettings() {
  return { ...settings };
}

export function saveAiSettings(patch) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* Privater Modus o. Ä. – die Einstellungen gelten dann nur für diese Sitzung. */
  }
  return { ...settings };
}

export function providerById(id) {
  return AI_PROVIDERS.find((entry) => entry.id === id) || AI_PROVIDERS[0];
}

export function registerTopoProvider(fn) {
  customProvider = typeof fn === 'function' ? fn : null;
}

/**
 * Holt die Liste verfügbarer Modelle. Versucht zuerst direkt, fällt bei
 * CORS-Blockade still auf den lokalen Proxy zurück – genau wie die Topo-Erkennung.
 * Gibt immer ein Ergebnisobjekt zurück statt zu werfen, weil der Aufrufer hier
 * nur eine Auswahlliste füllt und ein Fehlschlag folgenlos bleiben soll.
 */
export async function listModels({ signal } = {}) {
  const spec = providerById(settings.providerId);
  if (spec.id === 'proxy') {
    return { ok: false, reason: 'Im Proxy-Modus bestimmt der Proxy das Modell.' };
  }
  if (!settings.endpoint) return { ok: false, reason: 'Kein Endpoint hinterlegt.' };
  if (!settings.apiKey) return { ok: false, reason: 'Kein API-Key hinterlegt.' };
  const bad = badKeyCharacter(settings.apiKey);
  if (bad) return { ok: false, reason: `Der Key enthält ein unzulässiges Zeichen ("${bad}").` };

  const base = settings.endpoint.trim().replace(/\/+$/, '');
  const headers =
    spec.id === 'anthropic'
      ? { 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${settings.apiKey}` };

  try {
    const response = await fetch(`${base}/models`, { method: 'GET', headers, signal });
    if (!response.ok) {
      return { ok: false, reason: await modelErrorText(response) };
    }
    const models = pickModelIds(await response.json());
    if (!models.length) return { ok: false, reason: 'Keine Modell-Liste erkennbar.' };
    return { ok: true, models, viaProxy: false };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (!(error instanceof TypeError)) {
      return { ok: false, reason: error.message };
    }
    // Vermutlich CORS – derselbe Weg wie bei der Topo-Erkennung.
    return listModelsViaProxy({ signal });
  }
}

async function listModelsViaProxy({ signal } = {}) {
  const proxy = await detectLocalProxy({ force: true });
  if (!proxy) {
    return {
      ok: false,
      reason:
        'Der Endpoint ist aus dem Browser nicht erreichbar (CORS). ' +
        `Proxy starten mit "npm start" und http://127.0.0.1:${LOCAL_PROXY_PORT}/ öffnen.`,
    };
  }
  if (!proxy.canListModels) {
    return { ok: false, reason: 'Dieser Proxy ist zu alt und kennt /api/models noch nicht.' };
  }
  try {
    const response = await fetch(`${proxy.base}/api/models`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: settings.endpoint,
        apiKey: settings.apiKey || undefined,
        api: settings.providerId === 'anthropic' ? 'anthropic' : 'openai',
      }),
    });
    const data = await readJson(response);
    const models = pickModelIds(data);
    if (!models.length) return { ok: false, reason: 'Keine Modell-Liste erkennbar.' };
    return { ok: true, models, viaProxy: true };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return { ok: false, reason: error.message };
  }
}

async function modelErrorText(response) {
  let detail = '';
  try {
    const data = await response.json();
    detail = data?.error?.message || data?.message || '';
  } catch {
    /* Viele Gateways antworten mit HTML. */
  }
  if (response.status === 404) {
    return 'Dieser Endpoint kennt keine Modell-Liste – Modellname von Hand eintragen.';
  }
  return `Fehler ${response.status}${detail ? `: ${detail}` : ''}`;
}

/** Akzeptiert alle gängigen Formen: {data:[{id}]}, {models:[…]} oder ein nacktes Array. */
export function pickModelIds(data) {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
        ? data.models
        : [];
  const ids = list
    .map((entry) => (typeof entry === 'string' ? entry : entry?.id || entry?.name || ''))
    .map((id) => String(id).trim())
    .filter(Boolean);
  return [...new Set(ids)].sort();
}

/** True, sobald ein Aufruf sinnvoll möglich ist (konfiguriert oder eigener Provider). */
export function isTopoProviderAvailable() {
  if (customProvider) return true;
  const spec = providerById(settings.providerId);
  if (!settings.endpoint) return false;
  if (spec.needsKey && !settings.apiKey) return false;
  if (spec.needsKey && badKeyCharacter(settings.apiKey)) return false;
  if (spec.id !== 'proxy' && !settings.model) return false;
  return true;
}

/** Erklärt, warum der Button gesperrt ist – für das title-Attribut. */
export function providerStatusText() {
  if (customProvider) return 'Eigener Provider über registerTopoProvider() aktiv.';
  const spec = providerById(settings.providerId);
  if (!settings.endpoint) return 'Kein Endpoint hinterlegt.';
  if (spec.needsKey && !settings.apiKey) return 'Kein API-Key hinterlegt.';
  if (spec.needsKey) {
    const bad = badKeyCharacter(settings.apiKey);
    if (bad) return `Der Key enthält ein unzulässiges Zeichen ("${bad}") – vermutlich ein Kopierfehler.`;
  }
  if (spec.id !== 'proxy' && !settings.model) return 'Kein Modell hinterlegt.';
  return `Bereit: ${spec.label}${settings.model ? ` · ${settings.model}` : ''}`;
}

/**
 * HTTP-Header sind auf Latin-1 beschränkt. Wird versehentlich ein Platzhalter
 * wie "AI_KEY=…" oder ein Text mit Umlauten eingefügt, scheitert der Aufruf
 * sonst tief in fetch mit einer Meldung, die niemandem weiterhilft.
 */
export function badKeyCharacter(key) {
  return [...String(key || '')].find((char) => char.charCodeAt(0) > 255) || null;
}

/* -------------------------------------------------------------------- Prompt */

/**
 * Wählbare Prompt-Vorlagen.
 *
 * Der Prompt steuert Vorgehen und Ausgabe der Erkennung.
 * Deshalb ist er wählbar: Die optimierte Vorlage erklärt Rolle, Vorgehen,
 * Typkatalog und Ausgabeformat ausführlich, die kompakte spart Kontext für
 * kleine Modelle, "legacy" bleibt als Vergleichsmassstab wortgleich erhalten
 * und "custom" gibt die Kontrolle ganz ab.
 */
export const PROMPT_TEMPLATES = [
  {
    id: 'optimized',
    label: 'Optimiert (empfohlen)',
    hint: 'Vorlagengetreue Rekonstruktion mit Symbolzuordnung, Lesereihenfolge und belegten Angaben.',
  },
  {
    id: 'compact',
    label: 'Kompakt',
    hint: 'Kurzfassung für kleine Modelle oder enges Kontextfenster.',
  },
  {
    id: 'legacy',
    label: 'Bisheriger Prompt',
    hint: 'Der Prompt vor der Überarbeitung – zum Vergleichen.',
  },
  {
    id: 'custom',
    label: 'Eigener Prompt',
    hint: 'Frei editierbar, vorbelegt mit der optimierten Vorlage.',
  },
];

export const DEFAULT_PROMPT_TEMPLATE = 'optimized';

/** Obergrenze für einen eigenen Prompt – schützt Proxy und Upstream. */
export const MAX_PROMPT_CHARS = 32000;

export function promptTemplateById(id) {
  return (
    PROMPT_TEMPLATES.find((entry) => entry.id === id) ||
    PROMPT_TEMPLATES.find((entry) => entry.id === DEFAULT_PROMPT_TEMPLATE)
  );
}


/**
 * Typlisten des bisherigen Prompts – bewusst eingefroren.
 *
 * Die Vorlage "legacy" ist der Vergleichsmassstab gegen die überarbeiteten
 * Prompts; sie muss deshalb wortgleich bleiben, auch wenn die Symbolbibliothek
 * wächst. Neue Typen erscheinen in "optimized" und "compact", die aus
 * ELEMENT_TYPES abgeleitet werden. Der Import kennt die neuen Typen ohnehin,
 * unabhängig davon, welche Vorlage das Bild beschrieben hat.
 */
const LEGACY_POINT_ELEMENTS = [
  'BOLT', 'BOLT_LEFT', 'BOLT_RIGHT', 'STONE', 'TRAPPED_STONE', 'SHARP_EDGE',
  'LADDER', 'TRUNK', 'LEAF_TREE', 'CONIFER_TREE', 'CAVE', 'BACKWATER',
  'STONE_BRIDGE', 'WOODEN_BRIDGE', 'STONE_HOUSE', 'RADIO_MAST', 'LIFT_MAST',
  'SQUARE_CONCRETE_BASE', 'STEEL_BEAM', 'INLET_LEFT', 'INLET_RIGHT',
  'ESCAPE_EXIT_LEFT', 'ESCAPE_EXIT_RIGHT', 'ELEMENT_NUMBER', 'CUSTOM_TEXT',
  'WARNING_AND_TEXT',
];

const LEGACY_RANGE_ELEMENTS = ['ROPE_RAILING_LEFT', 'ROPE_RAILING_RIGHT'];

export function buildLegacyPrompt(hints = {}) {
  return `Du analysierst ein Bild eines Canyoning-Topos (Schluchten-Abstiegsskizze) oder ein Foto einer Schlucht und erzeugst daraus ein strukturiertes Topo.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Fließtext und ohne Markdown-Codefence.

Schema:
{
  "canyon_name": string,
  "author": string,                       // "" wenn nicht erkennbar
  "duration": string,                     // freie Angabe, z. B. "3-4 h"
  "date": "YYYY-MM-DD",
  "maximum_walk_length": number,      // gezeichnete Maximallänge von Gehstrecken, üblich 30
  "distance_of_single_line": number,  // Zeilenbreite vor dem Umbruch, üblich 60
  "legend_offset_top": number,        // üblich 0
  "segments": [
    {
      "type": string,                   // siehe Segmenttypen
      "length_in_meters": number,       // Höhe bei Abseilstellen/Sprüngen, Länge bei Geh-/Wasserstrecken
      "angle_in_degrees": number,       // 0 = flach, 90 = senkrecht, >90 = überhängend
      "duration_to_walk_in_min": number|null,  // nur bei WALK sinnvoll
      "wall_distance_in_meters": number,       // nur bei RAPPEL*, 0 = Seil liegt an der Wand
      "do_not_cut_row_after_this_segment": boolean,
      "force_cut_row_after_this_segment": boolean,
      "elements": [
        {
          "type": string,               // siehe Elementtypen
          "horizontal_start_rel_to_segment_start": number,
          "vertical_start_rel_to_segment_start": number,
          "horizontal_end_rel_to_segment_start": number|null,
          "vertical_end_rel_to_segment_start": number|null,
          "size": number,               // 1 = normal
          "text": string,               // "" wenn ohne Beschriftung
          "dead": boolean               // nur bei LEAF_TREE/CONIFER_TREE, true = abgestorben
        }
      ]
    }
  ]
}

Segmenttypen: ${SEGMENT_TYPES.join(', ')}.
- WALK = Gehstrecke, POOL = Schwimmstelle/Gumpen, WEIR = Wehr/Verblockung
- RAPPEL_DRY = trockene Abseilstelle, RAPPEL_WET = Abseilen im Wasserfall, RAPPEL = unspezifisch
- JUMP = Sprung, SLIDE = Rutsche, CLIMB = Kletterstelle

Elementtypen mit nur einem Punkt (End-Koordinaten müssen null sein):
${LEGACY_POINT_ELEMENTS.join(', ')}.
Elementtypen mit Start UND Ende (alle vier Koordinaten als Zahl angeben):
${LEGACY_RANGE_ELEMENTS.join(', ')}.

Koordinatensystem der Elemente (wichtig):
- Es ist LOKAL pro Segment, Einheit Meter.
- "horizontal_*" misst ENTLANG der Segmentrichtung, 0 = Segmentanfang.
- "vertical_*" misst QUER dazu, positiv = links der Laufrichtung (bei flachem
  Gelände also oberhalb), negativ = rechts/unterhalb.
- Beispiel: ein Stein auf dem Boden einer Gehstrecke liegt bei vertical 0,
  eine Brücke darüber bei etwa vertical 4, eine Höhle darunter bei etwa -0.5.
- Bohrhaken (BOLT*) am Kopf einer Abseilstelle liegen nahe horizontal 0.

Regeln:
- Reihenfolge der Segmente = Abstiegsreihenfolge von oben nach unten.
- Nur Typen aus den obigen Listen verwenden, keine erfundenen.
- Lieber weniger, dafür plausible Segmente als geratene Details.
- Wenn im Bild Höhenangaben stehen (z. B. "R 25m", "S6"), übernimm die Zahl als length_in_meters.
- Beschriftungen aus dem Bild gehören als CUSTOM_TEXT-Element mit "text" ins passende Segment.
- Ein kahler, toter Baum (kein Laub, keine Nadeln) ist LEAF_TREE bzw. CONIFER_TREE
  mit "dead": true – wichtig, weil er als Verankerung nicht taugt.
- Ist gar kein Topo erkennbar, gib ein leeres "segments"-Array zurück.

${hints.canyonName ? `Der Canyon heißt "${hints.canyonName}".` : ''}
${hints.notes ? `Zusatzinfo vom Nutzer: ${hints.notes}` : ''}`.trim();
}


/* ------------------------------------------------- Typkatalog für den Prompt */

/**
 * Bedeutung und Erkennungsmerkmale je Typ. Die *Liste* der Typen kommt immer
 * aus dem Modell bzw. der Symbolbibliothek – hier stehen nur die Erklärungen.
 * Fehlt zu einem neuen Typ eine Erklärung, erscheint er trotzdem im Prompt,
 * dann mit dem Label aus der Symbolpalette.
 */
const SEGMENT_DESCRIPTIONS = {
  WALK: 'Gehstrecke/Zustieg – flacher Bachlauf, Pfad, Geröll; oft mit Zeitangabe in Minuten.',
  POOL: 'Gumpen/Schwimmstelle – stehendes Wasser, Schwimmpfeil, blaue Fläche.',
  RAPPEL: 'Abseilstelle ohne nähere Angabe – Seillinie an einer Wandstufe, Label "R".',
  RAPPEL_DRY: 'Trockenes Abseilen neben dem Wasser – Label "R_d", Seil abseits des Strahls.',
  RAPPEL_WET: 'Abseilen im Wasserfall – Label "R_w", Seil mitten im Strahl.',
  JUMP: 'Sprung – Label "J", Pfeil senkrecht nach unten in eine Gumpe.',
  SLIDE: 'Rutsche – Label "S", schräge glatte Rampe ins Wasser.',
  CLIMB: 'Kletterstelle/Abklettern – Label "C" nur bei eindeutigem Klettern ohne Seillinie; C (Cascade) ist RAPPEL_WET.',
  WEIR: 'Wehr oder Verblockung – Label "W", künstliche Stufe, Betonkante.',
};

const ELEMENT_DESCRIPTIONS = {
  BOLT: 'Bohrhaken/Standplatz – kleiner Kreis mit Punkt, am Kopf einer Abseilstelle.',
  BOLT_LEFT: 'Bohrhaken links (in Abstiegsrichtung), im Bild oft mit "(le)".',
  BOLT_RIGHT: 'Bohrhaken rechts (in Abstiegsrichtung), im Bild oft mit "(ri)".',
  RAPPEL_GUIDE: 'Rappel Guide (RG) – geführtes Abseilen entlang eines gespannten Führungsseils; Strecke mit Start UND Ende, Pfeil zeigt zum Endpunkt.',
  STONE: 'Loser Block/Felsbrocken am Grund.',
  TRAPPED_STONE: 'Klemmblock zwischen zwei Wänden – Block mit Wandbögen links und rechts.',
  SHARP_EDGE: 'Scharfe Kante – Seilrisiko, meist als Kreuz mit roten Ringen markiert.',
  LADDER: 'Fixe Leiter – zwei Holme mit Sprossen.',
  TRUNK: 'Liegender Baumstamm/Totholz, quer im Bachbett.',
  LEAF_TREE: 'Laubbaum – runde Krone. Als Verankerung nur brauchbar, wenn lebend.',
  CONIFER_TREE: 'Nadelbaum – spitze Krone.',
  CAVE: 'Höhle/Unterstand – dunkler Bogen in der Wand.',
  BACKWATER: 'Rückstrom/Walze – Gefahrenstelle unterhalb einer Stufe, Spiralpfeil.',
  STONE_BRIDGE: 'Steinbrücke über der Schlucht – Bogen mit Geländer.',
  WOODEN_BRIDGE: 'Holzbrücke/Steg über der Schlucht.',
  STONE_HOUSE: 'Gebäude, Hütte oder Stall am Rand der Schlucht.',
  RADIO_MAST: 'Funkmast – Gittermast mit Antennen, dient als Orientierungspunkt.',
  LIFT_MAST: 'Liftmast/Seilbahnstütze mit Querträger und Rollen.',
  SQUARE_CONCRETE_BASE: 'Eckiger Betonsockel – Fundament, oft mit Ankerschrauben.',
  STEEL_BEAM: 'Stahlträger/Doppel-T-Träger, z. B. als Verankerung einer Brücke.',
  INLET_LEFT: 'Seitlicher Zufluss von links (Abstiegsrichtung) – blauer Pfeil.',
  INLET_RIGHT: 'Seitlicher Zufluss von rechts (Abstiegsrichtung) – blauer Pfeil.',
  ESCAPE_EXIT_LEFT: 'Fluchtweg/Ausstieg nach links – grünes Schild mit Pfeil.',
  ESCAPE_EXIT_RIGHT: 'Fluchtweg/Ausstieg nach rechts – grünes Schild mit Pfeil.',
  ROPE_RAILING_LEFT: 'Seilgeländer/Handlauf links – Strecke mit Ringen, braucht Start UND Ende.',
  ROPE_RAILING_RIGHT: 'Seilgeländer/Handlauf rechts – Strecke mit Ringen, braucht Start UND Ende.',
  ELEMENT_NUMBER: 'Nummerierter Marker im Kreis – die App nummeriert selbst neu.',
  CUSTOM_TEXT: 'Freie Beschriftung aus dem Bild; der Text gehört ins Feld "text".',
  WARNING_AND_TEXT: 'Warndreieck mit Text – allgemeine Gefahrenstelle mit Erklärung im Feld "text".',
  DEATH_HAZARD: 'Totenkopf – Lebensgefahr an genau dieser Stelle (Walze, Siphonzug, Sperre).',
  TREE_JAM: 'Baumverhau – verkeiltes Treibholz quer im Bachbett, oft nicht durchschwimmbar.',
  BOULDER_JAM: 'Felsblockverhau – mehrere verkeilte Blöcke, Durchstieg nur zwischen den Blöcken.',
  ROCKFALL: 'Steinschlag – Blöcke lösen sich aus der Wand, Fallspuren als Striche.',
  UNDERCUT: 'Unterspülung – ausgewaschene Wand, das Wasser zieht unter den Fels.',
  DANGEROUS_CURRENT: 'Gefährliche Strömung – kräftige Pfeile im Wasser, Verdriftungsgefahr.',
  SIPHON: 'Siphon – das Wasser verschwindet unter einer Verblockung, kein sichtbarer Ausgang.',
  WATER_DIVERSION: 'Wasserableitung – künstliche Fassung/Wehrklappe, die Wasser seitlich abzweigt.',
  PATH: 'Pfad – gestrichelte Strecke neben der Schlucht, braucht Start UND Ende.',
  ROAD: 'Weg oder Strasse – doppelte Linie, braucht Start UND Ende.',
  BYPASS: 'Umgehung – gestrichelter Bogen um ein Hindernis, Text nennt Seite oder Hinweis.',
  ENTRY_POINT: 'Einstieg in die Schlucht – Pfeil zwischen den Wänden nach unten.',
  EXIT_POINT: 'Ausstieg aus der Schlucht am Ende der Tour – grüner Pfeil nach oben.',
};

function symbolLabelFor(type) {
  return SYMBOLS[type]?.label || type;
}

/** Zeilen "TYPE = Erklärung" für alle Segmenttypen des Modells. */
export function segmentTypeCatalogLines() {
  return SEGMENT_TYPES.map((type) => {
    const label = SEGMENT_LABELS[type];
    const short = label ? ` [Kurzlabel ${label.base}${label.sub}]` : '';
    return `- ${type}${short} = ${SEGMENT_DESCRIPTIONS[type] || 'Abschnitt im Abstieg.'}`;
  });
}

/** Zeilen "TYPE (Label) = Erklärung" für alle Elementtypen der Symbolpalette. */
export function elementTypeCatalogLines() {
  return ELEMENT_TYPES.map((type) => {
    const range = RANGE_ELEMENT_TYPES.has(type) ? ' [Strecke: Start UND Ende]' : '';
    const dead = DEAD_CAPABLE_ELEMENT_TYPES.has(type) ? ' [kennt "dead": true]' : '';
    const walkTime = WALK_TIME_ELEMENT_TYPES.has(type)
      ? ' [kennt "duration_to_walk_in_min": Gehzeit bis zum sicheren Ort]'
      : '';
    const text =
      ELEMENT_DESCRIPTIONS[type] || `Symbol "${symbolLabelFor(type)}" aus der Palette.`;
    return `- ${type} (${symbolLabelFor(type)})${range}${dead}${walkTime} = ${text}`;
  });
}

const EXAMPLE_JSON = `{
  "canyon_name": "Rio Barbaira",
  "author": "",
  "duration": "3-4 h",
  "date": "2024-06-15",
  "maximum_walk_length": 30,
  "distance_of_single_line": 60,
  "legend_offset_top": 0,
  "length_shortening_threshold_meters": null,
  "segments": [
    { "type": "WALK", "length_in_meters": 40, "angle_in_degrees": 0,
      "duration_to_walk_in_min": 10, "wall_distance_in_meters": 0, "depth_in_meters": null,
      "do_not_cut_row_after_this_segment": false,
      "force_cut_row_after_this_segment": false, "elements": [] },
    { "type": "RAPPEL_WET", "length_in_meters": 25, "angle_in_degrees": 95,
      "duration_to_walk_in_min": null, "wall_distance_in_meters": 3, "depth_in_meters": null,
      "do_not_cut_row_after_this_segment": false,
      "force_cut_row_after_this_segment": false,
      "elements": [
        { "type": "BOLT_LEFT", "horizontal_start_rel_to_segment_start": 0.5,
          "vertical_start_rel_to_segment_start": 1,
          "horizontal_end_rel_to_segment_start": null,
          "vertical_end_rel_to_segment_start": null,
          "size": 1, "text": "2x10", "dead": false }
      ] }
  ]
}`;

const SCHEMA_BLOCK = `{
  "canyon_name": string,
  "author": string,                        // "" wenn nicht erkennbar
  "duration": string,                      // freie Angabe, z. B. "3-4 h"
  "date": "YYYY-MM-DD",
  "maximum_walk_length": number,           // gezeichnete Maximallänge von Gehstrecken, üblich 30
  "distance_of_single_line": number,       // Zeilenbreite vor dem Umbruch, üblich 60
  "legend_offset_top": number,             // üblich 0
  "length_shortening_threshold_meters": number|null, // null = ausgeschaltet; nicht aus dem Bild ableiten
  "segments": [
    {
      "type": string,                      // nur Werte aus der Segmentliste
      "length_in_meters": number,          // Höhe bei Abseilstellen/Sprüngen, Länge bei Geh-/Wasserstrecken
      "angle_in_degrees": number,          // 0 = flach, 90 = senkrecht, >90 = überhängend
      "duration_to_walk_in_min": number|null,  // nur bei WALK sinnvoll
      "wall_distance_in_meters": number,       // nur bei RAPPEL*, 0 = Seil liegt an der Wand
      "depth_in_meters": number|null,          // nur bei POOL, null = unbekannt
      "do_not_cut_row_after_this_segment": boolean,
      "force_cut_row_after_this_segment": boolean,
      "elements": [
        {
          "type": string,                  // nur Werte aus der Elementliste
          "horizontal_start_rel_to_segment_start": number,
          "vertical_start_rel_to_segment_start": number,
          "horizontal_end_rel_to_segment_start": number|null,
          "vertical_end_rel_to_segment_start": number|null,
          "size": number,                  // 1 = normal
          "text": string,                  // "" wenn ohne Beschriftung
          "dead": boolean,                 // nur bei Bäumen, true = abgestorben
          "duration_to_walk_in_min": number|null  // nur bei ESCAPE_EXIT_LEFT/RIGHT, sonst null
        }
      ]
    }
  ]
}`;

function drawingDefaultsText() {
  return SEGMENT_TYPES.map(
    (type) => `${type}: Länge ${defaultLengthFor(type)}, Winkel ${defaultAngleFor(type)}`,
  ).join('; ');
}

const RECONSTRUCTION_RULES = `VORLAGENTREUE (Vorrang vor generischer Canyon-Plausibilität):
- Rekonstruiere die tatsächlich sichtbare Vorlage möglichst vollständig; erzeuge keinen neuen, nur plausiblen Canyon. Die Bildvorlage und ihre Legende haben Vorrang vor allgemeinen Symbolkonventionen; Nutzerhinweise ergänzen nur, sie ersetzen keine sichtbaren Befunde.
- Scanne die gesamte Seite einschliesslich aller Spalten, Ränder, Detailausschnitte, Fortsetzungspfeile, Beschriftungen und Legende. Die Legende dient nur der Zuordnung: ihre Muster-Symbole sind keine Routenelemente. Übersichts-/Detailbilder derselben Stelle nicht doppelt als Route erfassen.
- Erfasse jede erkennbare Symbolinstanz in Segmentnähe einzeln. Wiederholte gleichartige Symbole nicht deduplizieren. Ordne sie anhand von Verbindungslinien, Position und Beschriftung dem richtigen Segment zu, nicht pauschal dem nächsten Abschnitt.
- Unbekannte Symbole nicht willkürlich approximieren: nur bei belegbarem semantischem Match auf einen echten ELEMENT_TYPES-Wert aus dem Katalog mappen. Keine Standplätze, Gefahren, Bäume oder Geometrien aus Landschaftsfotos erfinden. Ohne erkennbare Topo-Skizze keine Route konstruieren.
- Erhalte lesbare Originalbeschriftungen, Einheiten, Dezimalwerte und Nummern. Nutze "text" am passenden Symbol, wenn es dort angezeigt wird; freie Beschriftung als CUSTOM_TEXT im passenden Segment. WARNING_AND_TEXT nur bei tatsächlich vorhandenem Warndreieck, nicht für jede Notiz.
- ROPE_RAILING_LEFT/RIGHT, PATH und ROAD zeigen keinen freien Text: ihre Beschriftungen separat als CUSTOM_TEXT platzieren. ELEMENT_NUMBER wird von der App neu nummeriert; eine abweichende Originalnummer zusätzlich als CUSTOM_TEXT erhalten. Segment-Kurzlabels werden automatisch erzeugt; abweichende Originalnotation (z. B. C25) als CUSTOM_TEXT erhalten, identische Labels nicht doppelt zeichnen.
- Das bestehende Ausgabeformat unterstützt keine warnings/evidence-Felder. Füge keine solchen Felder hinzu. Unsicherheit, unlesbare Zuordnung oder nicht darstellbare Details ausdrücklich als CUSTOM_TEXT mit Präfix "AI-Hinweis:" beim betroffenen Segment kennzeichnen; solche Hinweise klar von Originaltext unterscheiden und keine unlesbaren Texte vervollständigen.`;

function measuredValuesText() {
  return `BELEGTE WERTE UND DARSTELLUNG:
- Länge/Höhe, Gehzeit, Gumpentiefe und Wanddistanz nur aus lesbaren, eindeutig zugeordneten Angaben übernehmen; Einheiten korrekt in Meter bzw. Minuten umrechnen. Keine typischen Canyonwerte oder Beispielwerte als Befund verwenden.
- Unbekannte duration_to_walk_in_min und depth_in_meters bleiben null, nicht 0. Winkel nur aus einer Zahl oder der eindeutig gezeichneten Segmentneigung ableiten, nicht aus vermeintlich typischem Gelände.
- length_in_meters, angle_in_degrees und wall_distance_in_meters erlauben im bestehenden Schema kein null. Fehlt die Grundlage, verwende ausschliesslich die App-Darstellungsdefaults: ${drawingDefaultsText()}; Wanddistanz 0. Kennzeichne jedes solche unbekannte Feld als CUSTOM_TEXT, z. B. "AI-Hinweis: Länge unbekannt; Darstellungswert 10 m". Diese Defaults sind KEINE erkannten Messwerte. Ein sichtbarer freier Seilabstand ohne Massangabe belegt keine Meterzahl.
- Bewahre Vorlagenproportionen, Symbolabstände und Abschnittsanordnung soweit mit dem Format abbildbar. Die Zeichnung ist nicht zwingend massstäblich: niemals absolute Pixelkoordinaten als Meter oder relative Werte ausgeben. Ohne belegten Massstab keine Längen aus Pixelabständen ableiten. Unbekannte Masse nicht zugunsten optischer Ähnlichkeit erfinden.`;
}

/** Die ausführliche Anleitung – als System-Nachricht gedacht. */
export function buildOptimizedInstructions() {
  return `Du bist ein erfahrener Canyoning-Topo-Experte. Deine Aufgabe ist die möglichst genaue Rekonstruktion eines abgebildeten Canyon-Topos aus einem Foto oder einer gerenderten PDF-Seite als strukturiertes JSON, nicht die Erzeugung eines generischen Canyons.

${RECONSTRUCTION_RULES}

VORGEHEN (in dieser Reihenfolge):
0. Erkenne zuerst das Layout der gesamten Seite: KASKADIERTES Topo (Treppen-/Kaskadenform, mehrere versetzte Spalten), lineares oder serpentinenartiges Zeilen-Topo? Trenne die Route von Legende, Übersicht und dekorativen Zeichnungen.
1. Lies das Bild in Abstiegsreihenfolge von OBEN (Einstieg) nach UNTEN (Ausstieg). Bei einem KASKADIERTEN Topo lies von oben nach unten UND von links nach rechts: erst eine Spalte vollständig, dann die nächste rechts, wieder oben beginnend. Explizite Fortsetzungen, Pfeile und übereinstimmende Anschlussmarken haben Vorrang vor dieser Standardleserichtung. Bildsprünge/Zeilenumbrüche sind keine zusätzlichen WALK-Segmente; nur eingezeichnete Gehstrecken übernehmen. Verbinde alle Abschnitte in EIN geordnetes segments-Array, ohne Auslassen, Wiederholung oder Sortieren nach Höhe. Setze am letzten Segment vor jedem belegten Spalten-/Zeilenwechsel force_cut_row_after_this_segment auf true, nicht erst im nächsten Abschnitt. Innerhalb eines ausdrücklich zusammengehörigen Abschnitts hält do_not_cut_row_after_this_segment das Segment mit dem folgenden zusammen. Diese Flags steuern Umbrüche, wählen aber keinen Layoutmodus; keine neuen Felder für Spalten oder absolute Seitenpositionen einführen.
2. Zerlege die Route an tatsächlich sichtbaren Übergängen in Segmente. Jede eigenständige Abseilstelle, Gumpe, Gehstrecke, Rutsche, Sprung- oder Kletterstelle bleibt erhalten; keine zusammenfassen oder ergänzen. Ein Sprungpfeil ins Wasser ist JUMP, ein Fortsetzungspfeil ist kein JUMP. Alternative Sprung-/Rutschmöglichkeiten nicht als zusätzliche hintereinander zu begehende Hauptstrecke erfinden; erkennbare Alternativen als Originaltext beim betreffenden Segment erhalten.
3. Bestimme für jeden Abschnitt den Typ aus der Segmentliste unten. Nutze das untenstehende KODIERUNGS-MAPPING, um Kurzlabels aus dem Bild (z. B. "C", "T", "S") den korrekten JSON-Segmenttypen zuzuordnen. Kurzlabels wie "R_d10", "J6" oder "S6" verraten auch die Höhe.
4. Übernimm belegte Werte nach BELEGTE WERTE UND DARSTELLUNG unten, keine frei geschätzten Messwerte.
5. Ordne alle erkennbaren Routensymbole mit Beschriftungen, Seite, Grösse und gegebenenfalls Start-/Endpunkt ihrem tatsächlichen Segment zu.
6. Lies Name, Author, Dauer und Datum aus Titel/Metadaten. Was nicht dasteht, bleibt leer (Datum: heutiges Datum als App-Default, nicht als erkannter Befund).

KODIERUNGS-MAPPING (Priorität!):
Prüfe zuerst die Legende und den lokalen Kontext der Vorlage. Wenn sie keine abweichende Bedeutung belegen, gilt folgendes Mapping mit Vorrang vor Kurzlabels und Erkennungsmerkmalen in der Segmentliste. Ein einzelner Buchstabe ohne Kontext reicht nicht für eine sichere Zuordnung:

C (Cascade) → RAPPEL_WET (Wasserfall-Abseilen/Abfahrt)
T / TP (Toboggan) → SLIDE (Rutsche)
Ausnahme: "T 4 m" an einer Gumpe bezeichnet deren Tiefe (POOL, depth_in_meters), keine Rutsche.
R / Rd / Rw → RAPPEL / RAPPEL_DRY / RAPPEL_WET
MC (Main-Courante) → Elementtyp ROPE_RAILING_LEFT oder ROPE_RAILING_RIGHT (je nach Lage)
RG (Rappel Guide) → Elementtyp RAPPEL_GUIDE

AUSGABE:
- Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt.
- Kein Fließtext, keine Erklärung, kein Markdown-Codefence.
- Exakt dieses Schema, alle Felder vorhanden:
${SCHEMA_BLOCK}

SEGMENTTYPEN (nur diese Werte sind gültig):
${segmentTypeCatalogLines().join('\n')}

ELEMENTTYPEN (nur diese Werte sind gültig):
${elementTypeCatalogLines().join('\n')}

Punktelemente (alle Elementtypen ausser den mit [Strecke] markierten) müssen
"horizontal_end_rel_to_segment_start" und "vertical_end_rel_to_segment_start" auf null setzen.
Streckenelemente brauchen alle vier Koordinaten als Zahl.

KOORDINATENSYSTEM DER ELEMENTE (wichtig):
- Lokal pro Segment, Einheit Meter, Ursprung ist der Segmentanfang.
- "horizontal_*" misst ENTLANG der Segmentrichtung, 0 = Segmentanfang.
- "vertical_*" misst QUER dazu, positiv = links der Laufrichtung (bei flachem Gelände oberhalb), negativ = rechts/unterhalb.
- Beispiel: ein Block am Boden einer Gehstrecke liegt bei vertical 0, eine Brücke darüber bei etwa vertical 4, eine Höhle darunter bei etwa -0.5.
- Bohrhaken am Kopf einer Abseilstelle liegen nahe horizontal 0.
- Links/rechts und Standplatzseite beziehen sich auf die Abstiegsrichtung, NICHT auf die Bildschirmseite. Bei senkrechtem Abstieg zeigt positives vertical nach Bildschirm-rechts; eine Spaltenverschiebung ändert die Seite nicht. Unklare Standplatzseite: BOLT statt geratenem BOLT_LEFT/RIGHT.
- Position entlang des Segments aus dem sichtbaren Anteil ableiten (z. B. halbe Strecke = horizontal 0.5 * length_in_meters), nicht alle Symbole bei 0 sammeln. Querabstände anhand desselben lokalen Massstabs und der Lage zur Route abbilden; ohne Massstab nur vorsichtige Darstellungsabstände mit AI-Hinweis, keine behaupteten Messungen.
- Bei gestauchten WALK-Strecken beziehen sich entlang-Koordinaten auf die ungekürzte length_in_meters; die App staucht sie mit. Niemals globale Seiten-/Spaltenkoordinaten übertragen.
- Bei ${[...RANGE_ELEMENT_TYPES].join(', ')} Start UND Ende relativ zum SELBEN Segmentanfang angeben, auch wenn das Ende optisch bei einer anderen Stelle liegt. Sichtbare Streckenrichtung erhalten; RAPPEL_GUIDE-Pfeil zeigt zum Endpunkt. Keine Endkoordinaten aus einem anderen Segmentkoordinatensystem mischen.
- size ist ein dimensionsloser Skalierungsfaktor (1 = normale Symbolgrösse), keine Pixelgrösse. Das Format unterstützt keine freie Rotation/Spiegelung für Punktelemente: Orientierung nur über passende LEFT/RIGHT-Typen bzw. Streckenendpunkte erhalten; nicht darstellbare Drehungen als AI-Hinweis benennen, keine rotate-Felder erfinden.

${measuredValuesText()}

EINHEITEN UND WERTEBEREICHE:
- length_in_meters: > 0; belegte Werte nicht auf typische Grössen beschränken.
- angle_in_degrees: 0 = flach, 90 = senkrecht, >90 = ÜBERHÄNGEND (nur bei RAPPEL* sinnvoll, typisch bis 115).
- wall_distance_in_meters: nur bei RAPPEL, RAPPEL_DRY, RAPPEL_WET; belegte 0 = Seil liegt an der Wand. Unbekannt: Darstellungsdefault 0 mit AI-Hinweis. Bei allen anderen Typen 0.
- depth_in_meters: nur bei POOL und nur wenn die Tiefe im Topo explizit angegeben ist; Zahl >= 0, sonst null (unbekannt). Bei allen anderen Typen immer null. Nicht aus der gezeichneten Gumpenform oder einem Foto schätzen.
- duration_to_walk_in_min: beim Segment nur bei WALK, sonst null. Beim Element nur bei ${[...WALK_TIME_ELEMENT_TYPES].join(', ')} – explizit angegebene Gehzeit in Minuten vom Fluchtweg bis zum sicheren Ort, unbekannt oder sonst null. Keine Gehzeit schätzen.
- size: 1 = normal, 0.5–2 sind sinnvolle Abweichungen.
- do_not_cut_row_after_this_segment / force_cut_row_after_this_segment: Zeilenumbruch des Topos. Im Zweifel beide false und NIE beide zugleich true am selben Segment.

UMGANG MIT UNSICHERHEIT:
- Keine sichtbaren, sicher zugeordneten Details zugunsten eines kürzeren Topos weglassen. Unsichere Details nicht als sicher ausgeben; vorhandene lesbare Beschriftung erhalten und AI-Hinweis ergänzen.
- Erfinde keine Typen, Werte oder Beschriftungen, die im Bild nicht stehen.
- Nicht erkennbare Metadaten bleiben leer ("" bzw. das heutige Datum).
- Ein kahler, toter Baum ohne Laub bzw. Nadeln ist LEAF_TREE oder CONIFER_TREE mit "dead": true – er trägt als Verankerung nicht.
- Beschriftungen und Hinweise nach VORLAGENTREUE im passenden Segment erhalten.
- Ist gar kein Topo erkennbar, gib ein leeres "segments"-Array zurück.

INTERNE VOLLSTÄNDIGKEITSPRÜFUNG VOR DER ANTWORT:
Prüfe still alle Spalten und Übergänge, die Anzahl und Zuordnung sichtbarer Segment-/Symbolinstanzen, Wiederholungen, Originaltexte, Standplatzseiten, belegte Werte und markierte Ungewissheit. Prüfe gültiges JSON nach Schema: nur echte Typen, Zahlen statt Strings, null nur in erlaubten Feldern, keine NaN/Infinity, vollständige Streckenendpunkte, Punkte-Enden null, NIE beide Umbruchflags true. Gib keine Chain-of-thought, Analyse oder Prüfliste aus, nur das JSON.

BEISPIEL (nur Form, nicht Inhalt; keine Namen, Werte oder Symbole daraus kopieren):
${EXAMPLE_JSON}`;
}

/** Kurzfassung für kleine Modelle oder enges Kontextfenster. */
export function buildCompactInstructions() {
  return `Du bist Canyoning-Topo-Experte. Rekonstruiere die sichtbare Vorlage, keinen generischen Canyon. Scanne die ganze Seite. Lies ein kaskadiertes Topo spaltenweise von oben nach unten und von links nach rechts; explizite Fortsetzungspfeile/Anschlussmarken haben Vorrang. Alle Abschnitte in EIN geordnetes segments-Array; Bildsprünge nicht als Gehstrecken erfinden. force_cut_row_after_this_segment am letzten Segment vor dem belegten Abschnittswechsel; nie beide Umbruchflags true.

${RECONSTRUCTION_RULES}

${measuredValuesText()}

Antworte NUR mit einem JSON-Objekt, ohne Text und ohne Markdown-Codefence.

Schema: canyon_name, author, duration, date ("YYYY-MM-DD"), maximum_walk_length (30), distance_of_single_line (60), legend_offset_top (0), length_shortening_threshold_meters (null = ausgeschaltet), segments[].
Segment: type, length_in_meters, angle_in_degrees, duration_to_walk_in_min (nur WALK, sonst null), wall_distance_in_meters (nur RAPPEL*, sonst 0), depth_in_meters (number|null, nur POOL), do_not_cut_row_after_this_segment, force_cut_row_after_this_segment, elements[].
Element: type, horizontal_start_rel_to_segment_start, vertical_start_rel_to_segment_start, horizontal_end_rel_to_segment_start, vertical_end_rel_to_segment_start, size, text, dead, duration_to_walk_in_min.

Segmenttypen: ${SEGMENT_TYPES.join(', ')}.
Elementtypen: ${ELEMENT_TYPES.join(', ')}.
Streckenelemente (alle vier Koordinaten als Zahl): ${[...RANGE_ELEMENT_TYPES].join(', ')}.
Alle übrigen Elemente setzen beide End-Koordinaten auf null.
"dead": true nur bei ${[...DEAD_CAPABLE_ELEMENT_TYPES].join(', ')} (kahler, toter Baum).
"duration_to_walk_in_min" beim Element nur bei ${[...WALK_TIME_ELEMENT_TYPES].join(', ')} (Gehzeit in Minuten bis zum sicheren Ort), sonst null.
"depth_in_meters": nur bei POOL und nur wenn die Tiefe im Topo explizit angegeben ist; Zahl >= 0, sonst null (unbekannt). Bei allen anderen Typen immer null. Nicht aus Gumpenform oder Foto schätzen. "T 4 m" an einer Gumpe ist eine Tiefe, keine Rutsche.

Regeln: Legende/Kontext zuerst, sonst C (Cascade) = RAPPEL_WET, T/TP (Toboggan) = SLIDE, R/Rd/Rw = RAPPEL/RAPPEL_DRY/RAPPEL_WET, MC = ROPE_RAILING_LEFT/RIGHT, RG = RAPPEL_GUIDE.
Elementkoordinaten lokal pro Segment in Meter, horizontal entlang, vertical quer (positiv = links der Laufrichtung, nicht Bildschirm-links; bei senkrechtem Abstieg Bildschirm-rechts). Standplatzseite unbekannt: BOLT. Positionen entlang proportional zur Segmentlänge; WALK-Koordinaten vor Stauchung. Streckenstart und -ende relativ zum selben Segmentanfang, Richtung erhalten. size dimensionslos, keine Pixel-/Rotationsfelder. angle 0 = flach, 90 = senkrecht, >90 = überhängend.
Prüfe intern Vollständigkeit, Originaltexte, Symbolinstanzen, Seiten und gültiges JSON; keine Chain-of-thought ausgeben. Kein Topo erkennbar: leeres "segments"-Array.`;
}

/** Kurze Aufgabenstellung samt Nutzerhinweisen – als User-Nachricht zum Bild. */
export function buildTaskText(hints = {}) {
  const lines = ['Erzeuge aus diesem Bild das vorlagengetreue Topo als JSON nach den Vorgaben; übernimm die erkennbaren Routensymbole und Beschriftungen.'];
  if (hints.canyonName) lines.push(`Der Canyon heißt "${hints.canyonName}".`);
  if (hints.notes) lines.push(`Zusatzinfo vom Nutzer: ${hints.notes}`);
  return lines.join('\n');
}

/**
 * Prompt in System- und User-Teil zerlegt.
 *
 * Anweisungen gehören in die System-Nachricht, Bild und Aufgabe in die
 * User-Nachricht – Modelle befolgen die Vorgaben so deutlich zuverlässiger.
 * "legacy" und "custom" bleiben bewusst ein einziger User-Text: Der eine soll
 * byte-identisch zum alten Aufruf bleiben, der andere unverändert so
 * abgeschickt werden, wie der Nutzer ihn eingetippt hat.
 */
export function buildPromptParts(hints = {}, options = {}) {
  const templateId = promptTemplateById(
    options.template || settings.promptTemplate || DEFAULT_PROMPT_TEMPLATE,
  ).id;

  if (templateId === 'custom') {
    const custom = String(
      options.customPrompt ?? settings.customPrompt ?? '',
    ).trim();
    if (!custom) {
      throw new Error(
        'Der eigene Prompt ist leer. Bitte Text eintragen oder eine andere Vorlage wählen.',
      );
    }
    if (custom.length > MAX_PROMPT_CHARS) {
      throw new Error(
        `Der eigene Prompt ist zu lang (${custom.length} Zeichen, erlaubt sind ${MAX_PROMPT_CHARS}).`,
      );
    }
    return { template: templateId, system: '', user: custom };
  }

  if (templateId === 'legacy') {
    return { template: templateId, system: '', user: buildLegacyPrompt(hints) };
  }

  const system =
    templateId === 'compact'
      ? buildCompactInstructions()
      : buildOptimizedInstructions();
  return { template: templateId, system, user: buildTaskText(hints) };
}

/** Prompt als ein Text – für Wege ohne System-Nachricht und für Tests. */
export function buildPrompt(hints = {}, options = {}) {
  const { system, user } = buildPromptParts(hints, options);
  return [system, user].filter(Boolean).join('\n\n');
}

/* ------------------------------------------------------------ Antwort-Parsing */

/**
 * Holt das Topo-JSON aus einer Modellantwort.
 *
 * Manche Modelle stellen dem eigentlichen Objekt ein leeres voran (`{}{"…"}`)
 * oder plaudern zwischen zwei Objekten. Darum werden alle vollständigen
 * Objekte der obersten Ebene gesammelt und das beste gewählt: bevorzugt das
 * grösste mit einem `segments`-Array.
 */
export function extractJsonObject(text) {
  if (typeof text !== 'string') throw new Error('Leere Antwort vom Modell.');
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '');

  if (cleaned.indexOf('{') === -1) throw new Error('Die Antwort enthält kein JSON-Objekt.');

  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      if (depth > 0) inString = true;
    } else if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0) candidates.push(cleaned.slice(start, i + 1));
    }
  }
  if (candidates.length === 0) {
    throw new Error('Die Antwort enthält kein vollständiges JSON-Objekt.');
  }

  const parsed = [];
  for (const candidate of candidates) {
    try {
      parsed.push(JSON.parse(candidate));
    } catch {
      /* Ein unbrauchbares Bruchstück darf ein gutes Objekt nicht verdecken. */
    }
  }
  if (parsed.length === 0) return JSON.parse(candidates[0]);

  const withSegments = parsed.filter((value) => value && Array.isArray(value.segments));
  const pool = withSegments.length ? withSegments : parsed;
  return pool.reduce((best, value) =>
    JSON.stringify(value).length > JSON.stringify(best).length ? value : best,
  );
}

const SEGMENT_SET = new Set(SEGMENT_TYPES);
const ELEMENT_SET = new Set(ELEMENT_TYPES);

/**
 * Räumt eine Modellantwort auf: unbekannte Typen werden auf plausible bekannte
 * abgebildet, statt das Topo mit Fantasietypen zu füllen. Was sich nicht
 * zuordnen lässt, fliegt raus und wird gemeldet.
 */
export function sanitizeTopoCandidate(raw, report = []) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Das Modell hat kein Topo-Objekt geliefert.');
  }
  const segmentsIn = Array.isArray(raw.segments) ? raw.segments : [];
  const segments = [];

  for (const segment of segmentsIn) {
    const type = mapSegmentType(segment?.type);
    if (!type) {
      report.push(`Segmenttyp "${segment?.type}" unbekannt – übersprungen.`);
      continue;
    }
    const elements = [];
    for (const element of Array.isArray(segment.elements) ? segment.elements : []) {
      const elementType = mapElementType(element?.type);
      if (!elementType) {
        report.push(`Elementtyp "${element?.type}" unbekannt – übersprungen.`);
        continue;
      }
      const isRange = RANGE_ELEMENT_TYPES.has(elementType);
      elements.push({
        ...element,
        type: elementType,
        // normalizeElement verwirft das Feld bei allem, was kein Baum ist.
        dead: element?.dead === true || deadFromTypeName(element?.type),
        // Punktelemente dürfen keine Endkoordinaten haben, sonst zeichnet der
        // Renderer eine Strecke ins Nichts.
        horizontal_end_rel_to_segment_start: isRange
          ? numberOr(element?.horizontal_end_rel_to_segment_start, 1)
          : null,
        vertical_end_rel_to_segment_start: isRange
          ? numberOr(element?.vertical_end_rel_to_segment_start, 0)
          : null,
      });
    }
    segments.push({ ...segment, type, elements });
  }

  if (segments.length === 0) {
    throw new Error(
      'Im Bild wurde kein verwertbares Topo erkannt. Ein klar gezeichnetes Topo oder ein aussagekräftigeres Foto liefert bessere Ergebnisse.',
    );
  }

  return normalizeTopo({
    ...raw,
    canyon_name: raw.canyon_name || 'My Canyon',
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') ? raw.date : todayIso(),
    segments,
  });
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapSegmentType(value) {
  const key = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (SEGMENT_SET.has(key)) return key;
  const aliases = {
    ABSEIL: 'RAPPEL',
    RAPPEL_DRY_WATERFALL: 'RAPPEL_DRY',
    DRY_RAPPEL: 'RAPPEL_DRY',
    WET_RAPPEL: 'RAPPEL_WET',
    WATERFALL: 'RAPPEL_WET',
    DOWNCLIMB: 'CLIMB',
    SWIM: 'POOL',
    POOL_SWIM: 'POOL',
    BASIN: 'POOL',
    HIKE: 'WALK',
    APPROACH: 'WALK',
    SCRAMBLE: 'WALK',
    TOBOGGAN: 'SLIDE',
    DAM: 'WEIR',
  };
  return aliases[key] || null;
}

function mapElementType(value) {
  const key = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (ELEMENT_SET.has(key)) return key;
  const aliases = {
    ANCHOR: 'BOLT',
    BOLTS: 'BOLT',
    ROCK: 'STONE',
    BOULDER: 'STONE',
    CHOCKSTONE: 'TRAPPED_STONE',
    EDGE: 'SHARP_EDGE',
    TREE: 'LEAF_TREE',
    PINE: 'CONIFER_TREE',
    DEAD_TREE: 'LEAF_TREE',
    DEAD_LEAF_TREE: 'LEAF_TREE',
    SNAG: 'LEAF_TREE',
    DEAD_CONIFER: 'CONIFER_TREE',
    DEAD_CONIFER_TREE: 'CONIFER_TREE',
    DEAD_PINE: 'CONIFER_TREE',
    LOG: 'TRUNK',
    BRIDGE: 'STONE_BRIDGE',
    HOUSE: 'STONE_HOUSE',
    FUNKMAST: 'RADIO_MAST',
    RADIO_TOWER: 'RADIO_MAST',
    CELL_TOWER: 'RADIO_MAST',
    LIFTMAST: 'LIFT_MAST',
    SKI_LIFT_TOWER: 'LIFT_MAST',
    BETONSOCKEL_ECKIG: 'SQUARE_CONCRETE_BASE',
    CONCRETE_BASE: 'SQUARE_CONCRETE_BASE',
    STAHLTRÄGER: 'STEEL_BEAM',
    STEEL_GIRDER: 'STEEL_BEAM',
    I_BEAM: 'STEEL_BEAM',
    ESCAPE: 'ESCAPE_EXIT_RIGHT',
    EXIT: 'ESCAPE_EXIT_RIGHT',
    INLET: 'INLET_RIGHT',
    TRIBUTARY: 'INLET_RIGHT',
    HANDLINE: 'ROPE_RAILING_RIGHT',
    RG: 'RAPPEL_GUIDE',
    RAPPEL_GUIDE: 'RAPPEL_GUIDE',
    GUIDED_RAPPEL: 'RAPPEL_GUIDE',
    GUIDE_LINE: 'RAPPEL_GUIDE',
    GUIDELINE: 'RAPPEL_GUIDE',
    TEXT: 'CUSTOM_TEXT',
    LABEL: 'CUSTOM_TEXT',
    NOTE: 'CUSTOM_TEXT',
    WARNING: 'WARNING_AND_TEXT',
    NUMBER: 'ELEMENT_NUMBER',
    SKULL: 'DEATH_HAZARD',
    DEATH: 'DEATH_HAZARD',
    DANGER_OF_DEATH: 'DEATH_HAZARD',
    LEBENSGEFAHR: 'DEATH_HAZARD',
    TOTENKOPF: 'DEATH_HAZARD',
    BAUMVERHAU: 'TREE_JAM',
    WOOD_JAM: 'TREE_JAM',
    LOG_JAM: 'TREE_JAM',
    LOGJAM: 'TREE_JAM',
    DEBRIS: 'TREE_JAM',
    FELSBLOCKVERHAU: 'BOULDER_JAM',
    BOULDER_CHOKE: 'BOULDER_JAM',
    BLOCK_JAM: 'BOULDER_JAM',
    STEINSCHLAG: 'ROCKFALL',
    ROCK_FALL: 'ROCKFALL',
    FALLING_ROCKS: 'ROCKFALL',
    UNTERSPÜLUNG: 'UNDERCUT',
    UNDERWASH: 'UNDERCUT',
    UNDERCUT_ROCK: 'UNDERCUT',
    STRÖMUNG: 'DANGEROUS_CURRENT',
    CURRENT: 'DANGEROUS_CURRENT',
    STRONG_CURRENT: 'DANGEROUS_CURRENT',
    DANGEROUS_FLOW: 'DANGEROUS_CURRENT',
    SYPHON: 'SIPHON',
    SUMP: 'SIPHON',
    WASSERABLEITUNG: 'WATER_DIVERSION',
    WATER_INTAKE: 'WATER_DIVERSION',
    DIVERSION: 'WATER_DIVERSION',
    INTAKE: 'WATER_DIVERSION',
    UMGEHUNG: 'BYPASS',
    DETOUR: 'BYPASS',
    PORTAGE: 'BYPASS',
    EINSTIEG: 'ENTRY_POINT',
    ENTRY: 'ENTRY_POINT',
    PUT_IN: 'ENTRY_POINT',
    AUSSTIEG: 'EXIT_POINT',
    TAKE_OUT: 'EXIT_POINT',
    END_POINT: 'EXIT_POINT',
    PFAD: 'PATH',
    TRAIL: 'PATH',
    FOOTPATH: 'PATH',
    WEG: 'ROAD',
    STRASSE: 'ROAD',
    STREET: 'ROAD',
    TRACK: 'ROAD',
  };
  return aliases[key] || null;
}

/**
 * Manche Modelle stecken den Zustand in den Typnamen ("DEAD_TREE") statt in das
 * Feld. Das darf nicht verloren gehen – ein toter Baum trägt keine Verankerung.
 */
function deadFromTypeName(value) {
  return /(^|_)(DEAD|SNAG|TOT|ABGESTORBEN)(_|$)/.test(
    String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_'),
  );
}

/* ------------------------------------------------------------------- Aufrufe */

/**
 * Niedrige Temperatur: Wir wollen eine möglichst wörtliche Übersetzung des
 * Bildes in JSON, keine kreative Variante.
 */
export const AI_TEMPERATURE = 0.15;

/** Erkennt die Upstream-Absage an `response_format`, damit der Fallback greift. */
function rejectsJsonMode(status, text) {
  if (status !== 400 && status !== 404 && status !== 422 && status !== 500) return false;
  return /response_format|json_object|json mode|json_schema/i.test(text || '');
}

/**
 * Erkennt, dass der Upstream `chat_template_kwargs` nicht kennt. Der Parameter
 * ist eine vLLM-Erweiterung; strengere Gateways lehnen unbekannte Felder ab.
 */
function rejectsThinkingSwitch(status, text) {
  if (status !== 400 && status !== 422) return false;
  const detail = String(text || '');
  return (
    /chat_template_kwargs/i.test(detail) ||
    /additional\s*propert/i.test(detail) ||
    /(unrecognized|unknown|unexpected|extra)\b[^.]{0,40}\b(argument|field|parameter|propert)/i.test(
      detail,
    )
  );
}

/**
 * Denkmodelle (Qwen3 & Co. auf vLLM) verbrauchen sonst ihr ganzes Token-Budget
 * für `reasoning`: `content` bleibt leer, finish_reason ist "length".
 */
export const NO_THINKING_KWARGS = { enable_thinking: false };

/** Obergrenze der Antwort. Grosszügig, damit lange Topos nicht abreissen. */
export const AI_MAX_TOKENS = 8000;

/**
 * Deutet eine leere Antwort. Leerer `content` mit finish_reason "length" oder
 * vorhandenem `reasoning` heisst: Das Modell hat sich zu Tode gedacht.
 */
function emptyAnswerError(choice) {
  const finish = choice?.finish_reason || choice?.stop_reason;
  const reasoning = choice?.message?.reasoning || choice?.message?.reasoning_content;
  if (finish === 'length' || reasoning) {
    return new Error(
      'Das Modell hat sein Token-Budget komplett zum Nachdenken verbraucht ' +
        `(finish_reason=${finish || 'unbekannt'}) – anderes Modell wählen ` +
        'oder Denkmodus abschalten.',
    );
  }
  return new Error('Das Modell hat keinen Text geliefert.');
}

async function callOpenAi(image, parts, { signal }) {
  const base = settings.endpoint.replace(/\/+$/, '');
  const messages = [];
  // Anweisungen als System-Nachricht: Modelle befolgen sie dort zuverlässiger
  // als mitten im Text neben dem Bild.
  if (parts.system) messages.push({ role: 'system', content: parts.system });
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: parts.user },
      { type: 'image_url', image_url: { url: image } },
    ],
  });

  const send = ({ jsonMode, noThinking }) =>
    fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        max_tokens: AI_MAX_TOKENS,
        temperature: AI_TEMPERATURE,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        ...(noThinking ? { chat_template_kwargs: { ...NO_THINKING_KWARGS } } : {}),
      }),
    });

  let options = { jsonMode: true, noThinking: true };
  let response = await send(options);
  // Nicht jedes Gateway kennt JSON-Modus oder Denkschalter – dann je einmal
  // ohne den abgelehnten Parameter wiederholen, notfalls ohne beide.
  while (!response.ok && (options.jsonMode || options.noThinking)) {
    const detail = await response.clone().text();
    if (options.noThinking && rejectsThinkingSwitch(response.status, detail)) {
      options = { ...options, noThinking: false };
    } else if (options.jsonMode && rejectsJsonMode(response.status, detail)) {
      options = { ...options, jsonMode: false };
    } else break;
    response = await send(options);
  }

  const data = await readJson(response);
  const choice = data?.choices?.[0];
  const text = choice?.message?.content;
  if (typeof text !== 'string') {
    throw new Error('Unerwartete Antwortstruktur der OpenAI-kompatiblen API.');
  }
  if (!text.trim()) throw emptyAnswerError(choice);
  return text;
}

async function callAnthropic(image, parts, { signal }) {
  const base = settings.endpoint.replace(/\/+$/, '');
  const { mediaType, data: base64 } = splitDataUrl(image);
  const response = await fetch(`${base}/messages`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: AI_MAX_TOKENS,
      temperature: AI_TEMPERATURE,
      // Anthropic kennt kein response_format, dafür ein eigenes system-Feld.
      ...(parts.system ? { system: parts.system } : {}),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            { type: 'text', text: parts.user },
          ],
        },
      ],
    }),
  });
  const data = await readJson(response);
  const text = data?.content?.find((part) => part.type === 'text')?.text;
  if (typeof text !== 'string') {
    throw new Error('Unerwartete Antwortstruktur der Anthropic-API.');
  }
  return text;
}

async function callProxy(image, parts, { signal, hints }) {
  const response = await fetch(settings.endpoint, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    // "prompt" ist die Aufgabe zum Bild, "system" die Anweisung davor. Ein
    // Proxy, der system nicht kennt, bekommt weiterhin einen sinnvollen Prompt.
    body: JSON.stringify({
      image,
      prompt: parts.user,
      system: parts.system || undefined,
      promptTemplate: parts.template,
      hints,
      model: settings.model || undefined,
    }),
  });
  const data = await readJson(response);
  // Ein Proxy darf entweder direkt das Topo liefern oder den Modelltext durchreichen.
  return typeof data === 'string' ? data : JSON.stringify(data);
}

/* ------------------------------------------------- Lokaler Proxy (Automatik) */

/**
 * Der lokale Proxy aus tools/proxy.mjs. Läuft er, kann die App ihn auch dann
 * verwenden, wenn "OpenAI-kompatibel" eingestellt ist — sie schickt Endpoint,
 * Modell und Key einfach mit. Das ist der Ausweg aus dem CORS-Problem, ohne dass
 * der Nutzer den Anbieter umstellen oder den Proxy neu starten muss.
 */
export const LOCAL_PROXY_PORT = 8787;

function localProxyBase() {
  // Wird die App vom Proxy selbst ausgeliefert, ist er per Definition derselbe Origin.
  if (
    typeof location !== 'undefined' &&
    location.port === String(LOCAL_PROXY_PORT) &&
    /^https?:$/.test(location.protocol)
  ) {
    return location.origin;
  }
  return `http://127.0.0.1:${LOCAL_PROXY_PORT}`;
}

let localProxyCache = { checkedAt: 0, info: null };

/**
 * Prüft, ob der lokale Proxy erreichbar ist. Das Ergebnis wird kurz behalten,
 * damit nicht jeder Tastendruck in den Einstellungen eine Anfrage auslöst.
 */
export async function detectLocalProxy({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - localProxyCache.checkedAt < 5000) return localProxyCache.info;

  let info = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const response = await fetch(`${localProxyBase()}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) {
      const data = await response.json();
      if (data?.ok) info = { ...data, base: localProxyBase() };
    }
  } catch {
    /* Nicht erreichbar ist der Normalfall, kein Fehler. */
  }
  localProxyCache = { checkedAt: now, info };
  return info;
}

/** Ruft den lokalen Proxy mit den aktuellen App-Einstellungen auf. */
async function callLocalProxy(image, parts, { signal, hints }) {
  const response = await fetch(`${localProxyBase()}/api/topo`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image,
      prompt: parts.user,
      system: parts.system || undefined,
      promptTemplate: parts.template,
      hints,
      endpoint: settings.endpoint,
      model: settings.model || undefined,
      apiKey: settings.apiKey || undefined,
      api: settings.providerId === 'anthropic' ? 'anthropic' : 'openai',
    }),
  });
  const data = await readJson(response);
  return typeof data === 'string' ? data : JSON.stringify(data);
}

async function readJson(response) {
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* Fehlerseiten sind oft HTML. */
  }
  if (!response.ok) {
    const detail =
      parsed?.error?.message ||
      (typeof parsed?.error === 'string' ? parsed.error : '') ||
      parsed?.message ||
      text.slice(0, 200) ||
      response.statusText;
    const hint = parsed?.hint ? ` (${parsed.hint})` : '';
    throw new Error(`API-Fehler ${response.status}: ${detail}${hint}`);
  }
  if (parsed === null) throw new Error('Die API hat kein JSON zurückgegeben.');
  return parsed;
}

function splitDataUrl(url) {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url || '');
  if (!match) {
    throw new Error('Das Referenzbild liegt nicht als Data-URL vor.');
  }
  return { mediaType: match[1], data: match[2] };
}

/* -------------------------------------------------------------- Öffentlich */

/**
 * Wandelt ein Bild (Data-URL) in ein Topo um.
 * Bei PDFs ist das die bereits gerenderte Seite – der Provider sieht immer ein Bild.
 */
export async function photoToTopo(image, options = {}) {
  if (!image) {
    throw new Error('Zuerst ein Foto oder eine PDF-Seite als Referenz laden.');
  }

  if (customProvider) {
    return normalizeTopo(await customProvider(image, options));
  }

  if (!isTopoProviderAvailable()) {
    throw new Error(`AI ist noch nicht einsatzbereit: ${providerStatusText()}`);
  }

  const hints = options.hints || {};
  // Wirft bei leerem eigenen Prompt – lieber hier als mit einem Leeraufruf.
  const parts = buildPromptParts(hints, {
    template: options.promptTemplate,
    customPrompt: options.customPrompt,
  });
  const context = { signal: options.signal, hints };
  const notify = typeof options.onNotice === 'function' ? options.onNotice : () => {};

  let text;
  try {
    if (settings.providerId === 'anthropic') text = await callAnthropic(image, parts, context);
    else if (settings.providerId === 'proxy') text = await callProxy(image, parts, context);
    else text = await callOpenAi(image, parts, context);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    // fetch wirft bei CORS und Netzproblemen denselben nichtssagenden TypeError.
    if (error instanceof TypeError) {
      text = await recoverViaLocalProxy(image, parts, context, notify);
    } else {
      throw error;
    }
  }

  const report = options.report || [];
  return sanitizeTopoCandidate(extractJsonObject(text), report);
}

/**
 * Letzte Rettung, wenn der Direktaufruf am CORS-Preflight scheitert: Läuft der
 * lokale Proxy, wird der Aufruf still über ihn wiederholt. Der Nutzer muss dafür
 * nichts umstellen — das ist der Kern der Automatik.
 */
async function recoverViaLocalProxy(image, parts, context, notify) {
  if (settings.providerId === 'proxy') {
    throw new Error(
      `Der Proxy unter ${settings.endpoint} antwortet nicht. Starten mit: npm start`,
    );
  }

  const proxy = await detectLocalProxy({ force: true });
  if (!proxy) {
    throw new Error(
      `Der Endpoint ist aus dem Browser nicht erreichbar (CORS oder Netzwerk): ${settings.endpoint}. ` +
        'Firmen-Gateways blockieren den Preflight. Lokalen Proxy starten mit "npm start", ' +
        `dann http://127.0.0.1:${LOCAL_PROXY_PORT}/ öffnen — der Rest passiert automatisch.`,
    );
  }
  if (!proxy.acceptsClientConfig) {
    throw new Error(
      'Der lokale Proxy nimmt keine Konfiguration aus der App an ' +
        '(AI_ALLOW_CLIENT_CONFIG=false). Anbieter "Eigener Proxy" wählen.',
    );
  }

  notify(`Direktaufruf durch CORS blockiert – nutze den lokalen Proxy auf Port ${LOCAL_PROXY_PORT}.`);
  return callLocalProxy(image, parts, context);
}
