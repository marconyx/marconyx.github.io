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
  ELEMENT_TYPES,
  RANGE_ELEMENT_TYPES,
  SEGMENT_TYPES,
  normalizeTopo,
  todayIso,
} from './model.js';

const SETTINGS_KEY = 'canyon-topo-generator/ai/v1';

export const AI_PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI-kompatibel',
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    needsKey: true,
    hint: 'Funktioniert auch mit Azure OpenAI, OpenRouter, Groq, LM Studio oder Ollama (/v1).',
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
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  apiKey: '',
  notes: '',
};

let customProvider = null;
let settings = { ...DEFAULT_SETTINGS };

/* ------------------------------------------------------------- Einstellungen */

export function loadAiSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
  return { ...settings };
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

const POINT_ELEMENTS = ELEMENT_TYPES.filter((t) => !RANGE_ELEMENT_TYPES.has(t));

export function buildPrompt(hints = {}) {
  return `Du analysierst ein Bild eines Canyoning-Topos (Schluchten-Abstiegsskizze) oder ein Foto einer Schlucht und erzeugst daraus ein strukturiertes Topo.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Fließtext und ohne Markdown-Codefence.

Schema:
{
  "canyon_name": string,
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
          "text": string                // "" wenn ohne Beschriftung
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
${POINT_ELEMENTS.join(', ')}.
Elementtypen mit Start UND Ende (alle vier Koordinaten als Zahl angeben):
${[...RANGE_ELEMENT_TYPES].join(', ')}.

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
- Ist gar kein Topo erkennbar, gib ein leeres "segments"-Array zurück.

${hints.canyonName ? `Der Canyon heißt "${hints.canyonName}".` : ''}
${hints.notes ? `Zusatzinfo vom Nutzer: ${hints.notes}` : ''}`.trim();
}

/* ------------------------------------------------------------ Antwort-Parsing */

/** Holt das erste vollständige JSON-Objekt aus einer Modellantwort. */
export function extractJsonObject(text) {
  if (typeof text !== 'string') throw new Error('Leere Antwort vom Modell.');
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '');

  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error('Die Antwort enthält kein JSON-Objekt.');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(cleaned.slice(start, i + 1));
      }
    }
  }
  throw new Error('Die Antwort enthält kein vollständiges JSON-Objekt.');
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
    LOG: 'TRUNK',
    BRIDGE: 'STONE_BRIDGE',
    HOUSE: 'STONE_HOUSE',
    ESCAPE: 'ESCAPE_EXIT_RIGHT',
    EXIT: 'ESCAPE_EXIT_RIGHT',
    INLET: 'INLET_RIGHT',
    TRIBUTARY: 'INLET_RIGHT',
    HANDLINE: 'ROPE_RAILING_RIGHT',
    TEXT: 'CUSTOM_TEXT',
    LABEL: 'CUSTOM_TEXT',
    NOTE: 'CUSTOM_TEXT',
    WARNING: 'WARNING_AND_TEXT',
    NUMBER: 'ELEMENT_NUMBER',
  };
  return aliases[key] || null;
}

/* ------------------------------------------------------------------- Aufrufe */

async function callOpenAi(image, prompt, { signal }) {
  const base = settings.endpoint.replace(/\/+$/, '');
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      max_tokens: 4000,
    }),
  });
  const data = await readJson(response);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') {
    throw new Error('Unerwartete Antwortstruktur der OpenAI-kompatiblen API.');
  }
  return text;
}

async function callAnthropic(image, prompt, { signal }) {
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
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            { type: 'text', text: prompt },
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

async function callProxy(image, prompt, { signal, hints }) {
  const response = await fetch(settings.endpoint, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, prompt, hints, model: settings.model || undefined }),
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
async function callLocalProxy(image, prompt, { signal, hints }) {
  const response = await fetch(`${localProxyBase()}/api/topo`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image,
      prompt,
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
  const prompt = buildPrompt(hints);
  const context = { signal: options.signal, hints };
  const notify = typeof options.onNotice === 'function' ? options.onNotice : () => {};

  let text;
  try {
    if (settings.providerId === 'anthropic') text = await callAnthropic(image, prompt, context);
    else if (settings.providerId === 'proxy') text = await callProxy(image, prompt, context);
    else text = await callOpenAi(image, prompt, context);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    // fetch wirft bei CORS und Netzproblemen denselben nichtssagenden TypeError.
    if (error instanceof TypeError) {
      text = await recoverViaLocalProxy(image, prompt, context, notify);
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
async function recoverViaLocalProxy(image, prompt, context, notify) {
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
  return callLocalProxy(image, prompt, context);
}
