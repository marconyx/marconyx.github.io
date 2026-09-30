/**
 * SVG-Symbolbibliothek für Topo-Elemente.
 *
 * Jedes Symbol zeichnet in einem lokalen System, in dem 1 Einheit ≈ 1 Meter ist
 * und (0,0) der Ankerpunkt des Elements ist (y nach unten).
 * Der Renderer setzt `translate(x, y) scale(size)` davor.
 *
 * Neue Symbole lassen sich allein durch einen Eintrag in SYMBOLS ergänzen.
 */
import { DEAD_CAPABLE_ELEMENT_TYPES } from './model.js';

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const stroke = 'stroke="#111" stroke-width="0.08" stroke-linejoin="round" stroke-linecap="round"';
const thin = 'stroke="#111" stroke-width="0.05"';

function label(text, x, y, extra = '') {
  if (!text) return '';
  return `<text x="${x}" y="${y}" font-size="0.55" text-anchor="middle" ${extra}>${esc(text)}</text>`;
}

function bolt(side, text) {
  const sideText = side === 'left' ? '(le)' : side === 'right' ? '(ri)' : '';
  const offset = side === 'left' ? -0.75 : 0.75;
  return `
    <circle cx="0" cy="0" r="0.22" fill="#fff" ${stroke}/>
    <circle cx="0" cy="0" r="0.07" fill="#111"/>
    ${sideText ? `<text x="${offset}" y="0.2" font-size="0.45" text-anchor="middle">${sideText}</text>` : ''}
    ${label(text, 0, -0.5)}`;
}

function tree(kind, text, dead = false) {
  if (dead) return deadTree(kind, text);
  const crown =
    kind === 'conifer'
      ? `<path d="M0,-2.2 L0.75,-1.1 L0.3,-1.1 L0.95,-0.2 L-0.95,-0.2 L-0.3,-1.1 L-0.75,-1.1 Z" fill="#1f7a34" ${stroke}/>`
      : `<path d="M0,-2.3 C0.95,-2.3 1.25,-1.5 1,-1.05 C1.25,-0.6 0.7,-0.2 0,-0.35 C-0.7,-0.2 -1.25,-0.6 -1,-1.05 C-1.25,-1.5 -0.95,-2.3 0,-2.3 Z" fill="#1f7a34" ${stroke}/>`;
  return `
    <path d="M-0.12,0 L-0.12,-1 L0.12,-1 L0.12,0 Z" fill="#6b3f1d" ${stroke}/>
    ${crown}
    ${label(text, 0, -2.6)}`;
}

/**
 * Abgestorbener Baum: kahl, graubraun, kein Blattwerk.
 *
 * Die Silhouette bleibt bewusst typgetreu – der Nadelbaum behält die schmale
 * Form mit kurzen, hängenden Ästen, der Laubbaum die breite Gabelung. Sonst
 * sähen beide tot gleich aus, und im Topo geht es genau darum, den Baum
 * wiederzuerkennen. Ein toter Baum ist ein Verankerungshinweis: er sieht aus
 * wie ein Baum, trägt aber nicht.
 */
function deadTree(kind, text) {
  const wood = 'stroke="#7a6a58" stroke-width="0.14" stroke-linecap="round" fill="none"';
  const branches =
    kind === 'conifer'
      ? `<g ${wood}>
        <line x1="0" y1="-0.35" x2="-0.8" y2="-0.05"/>
        <line x1="0" y1="-0.35" x2="0.8" y2="-0.05"/>
        <line x1="0" y1="-0.95" x2="-0.62" y2="-0.7"/>
        <line x1="0" y1="-0.95" x2="0.62" y2="-0.7"/>
        <line x1="0" y1="-1.5" x2="-0.45" y2="-1.3"/>
        <line x1="0" y1="-1.5" x2="0.45" y2="-1.3"/>
        <line x1="0" y1="-1.95" x2="-0.28" y2="-1.8"/>
        <line x1="0" y1="-1.95" x2="0.28" y2="-1.8"/>
      </g>`
      : `<g ${wood}>
        <path d="M0,-1.15 L-0.75,-1.75 L-1.0,-2.15"/>
        <path d="M-0.75,-1.75 L-0.95,-1.45"/>
        <path d="M0,-1.15 L0.7,-1.7 L0.95,-2.1"/>
        <path d="M0.7,-1.7 L0.9,-1.4"/>
        <path d="M0,-1.6 L-0.3,-2.25"/>
        <path d="M0,-1.6 L0.35,-2.2"/>
      </g>`;
  const trunkTop = kind === 'conifer' ? -2.25 : -1.7;
  return `
    <path d="M-0.12,0 L-0.12,${trunkTop} L0.12,${trunkTop} L0.12,0 Z" fill="#8a7864" ${stroke}/>
    ${branches}
    ${label(text, 0, -2.6)}`;
}

/**
 * Gehzeit unterhalb des Fluchtweg-Schilds. Ohne eigenes `fill`, damit die
 * Schrift die Themefarbe der Elementgruppe erbt und in Farbe wie in
 * Schwarz/Weiss lesbar bleibt.
 */
function walkTimeLabel(minutes) {
  if (!(minutes > 0)) return '';
  return `<text x="0" y="0.78" font-size="0.55" text-anchor="middle" font-weight="600">${esc(
    `${Number(minutes)} min`,
  )}</text>`;
}

function exitSign(direction, text, minutes) {
  const arrow =
    direction === 'left'
      ? '<path d="M-0.75,-0.75 L-1.15,-0.45 L-0.75,-0.15 L-0.75,-0.35 L-0.3,-0.35 L-0.3,-0.55 L-0.75,-0.55 Z" fill="#fff"/>'
      : '<path d="M0.75,-0.75 L1.15,-0.45 L0.75,-0.15 L0.75,-0.35 L0.3,-0.35 L0.3,-0.55 L0.75,-0.55 Z" fill="#fff"/>';
  return `
    <rect x="-1.3" y="-1.05" width="2.6" height="1.2" rx="0.08" fill="#0b7a45"/>
    ${arrow}
    <path d="M0.55,-0.95 a0.11,0.11 0 1,0 0.01,0 Z" fill="#fff"/>
    <path d="M0.45,-0.8 L0.75,-0.65 L0.62,-0.4 L0.8,-0.2 L0.68,-0.15 L0.5,-0.4 L0.35,-0.15 L0.24,-0.22 L0.4,-0.5 Z" fill="#fff"/>
    ${label(text, 0, -1.25)}
    ${walkTimeLabel(minutes)}`;
}

function inlet(direction, text) {
  const flip = direction === 'left' ? -1 : 1;
  return `
    <g transform="scale(${flip},1)">
      <path d="M-0.9,-1.1 L0.15,-1.1 L0.15,-0.55 L0.75,-0.55 L-0.1,0.35 L-0.9,-0.4 Z" fill="#1b3fb5" ${thin}/>
    </g>
    ${text ? `<text x="0" y="-1.35" font-size="0.62" text-anchor="middle" fill="#1b3fb5" font-weight="600">${esc(text)}</text>` : ''}`;
}

function ropeRailing(side) {
  return {
    range: true,
    render(a, b, options) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const ringCount = Math.max(2, Math.round(length / (options.ringSpacing || 1.6)));
      const rings = [];
      for (let i = 0; i <= ringCount; i += 1) {
        const t = i / ringCount;
        rings.push(
          `<circle cx="${a.x + dx * t}" cy="${a.y + dy * t}" r="${0.22 * options.size}" fill="#fff" ${stroke}/>`,
        );
      }
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${stroke} fill="none"/>${rings.join('')}
        <text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 0.55 * options.size}" font-size="${0.55 * options.size}" text-anchor="middle">${side === 'left' ? '(le)' : '(ri)'}</text>`;
    },
  };
}

/**
 * Totenkopf als eigenständiges Gefahrenzeichen: "hier ist der Fehler tödlich".
 * Bewusst getrennt vom abgestorbenen Baum – der warnt vor einer untauglichen
 * Verankerung, dieses Zeichen vor der Stelle selbst.
 */
function deathHazard(text) {
  const bone = 'stroke="#111" stroke-width="0.17" stroke-linecap="round" fill="none"';
  return `
    <g ${bone}>
      <line x1="-0.8" y1="-0.1" x2="0.8" y2="-0.5"/>
      <line x1="-0.8" y1="-0.5" x2="0.8" y2="-0.1"/>
    </g>
    <circle cx="0" cy="-1.0" r="0.52" fill="#fff" ${stroke}/>
    <path d="M-0.26,-0.6 L0.26,-0.6 L0.26,-0.32 L-0.26,-0.32 Z" fill="#fff" ${stroke}/>
    <g fill="#111">
      <circle cx="-0.19" cy="-1.07" r="0.14"/>
      <circle cx="0.19" cy="-1.07" r="0.14"/>
      <path d="M0,-0.88 L-0.1,-0.68 L0.1,-0.68 Z"/>
    </g>
    <g ${thin}>
      <line x1="0" y1="-0.58" x2="0" y2="-0.34"/>
      <line x1="-0.13" y1="-0.58" x2="-0.13" y2="-0.34"/>
      <line x1="0.13" y1="-0.58" x2="0.13" y2="-0.34"/>
    </g>
    ${label(text, 0, -1.75)}`;
}

/** Baumverhau: übereinandergeschobenes Treibholz, das den Bachlauf sperrt. */
function treeJam(text) {
  return `
    <g fill="#6b3f1d" ${stroke}>
      <path d="M-1.25,0.15 L0.95,-0.5 L1.05,-0.16 L-1.15,0.49 Z"/>
      <path d="M-1.05,-0.7 L1.1,0.0 L1.0,0.34 L-1.15,-0.36 Z"/>
      <path d="M-0.2,-1.15 L0.2,-1.1 L0.05,0.4 L-0.35,0.35 Z"/>
    </g>
    <g ${thin} fill="none">
      <path d="M1.0,-0.33 L1.5,-0.62"/>
      <path d="M1.05,0.17 L1.55,0.3"/>
      <path d="M0.12,-1.12 L0.45,-1.5"/>
    </g>
    ${label(text, 0, -1.5)}`;
}

/** Felsblockverhau: mehrere verkeilte Blöcke, Durchstieg nur zwischendurch. */
function boulderJam(text) {
  return `
    <g fill="#8d8d8d" ${stroke}>
      <path d="M-1.3,0.3 L-1.1,-0.35 L-0.4,-0.52 L-0.15,0.05 L-0.6,0.35 Z"/>
      <path d="M0.1,0.35 L0.2,-0.3 L0.95,-0.55 L1.3,0.05 L0.8,0.4 Z"/>
      <path d="M-0.6,-0.55 L-0.2,-1.2 L0.6,-1.1 L0.8,-0.55 L0.15,-0.32 Z"/>
    </g>
    ${label(text, 0, -1.5)}`;
}

/** Steinschlag: Blöcke lösen sich aus der Wand, Fallspuren als dünne Striche. */
function rockfall(text) {
  return `
    <path d="M-1.45,-1.6 L-0.75,-0.15 L-1.45,-0.15 Z" fill="#b9b2a6" ${stroke}/>
    <g fill="#8d8d8d" ${stroke}>
      <path d="M-0.35,-1.15 L-0.02,-1.35 L0.25,-1.1 L0.05,-0.8 L-0.3,-0.85 Z"/>
      <path d="M0.45,-0.45 L0.8,-0.68 L1.1,-0.4 L0.9,-0.05 L0.5,-0.1 Z"/>
      <path d="M-0.2,0.05 L0.08,-0.15 L0.32,0.08 L0.12,0.38 L-0.2,0.32 Z"/>
    </g>
    <g ${thin} fill="none">
      <path d="M-0.55,-1.5 L-0.35,-1.25"/>
      <path d="M0.3,-0.9 L0.55,-0.6"/>
      <path d="M0.0,-0.55 L0.05,-0.25"/>
    </g>
    ${label(text, 0, -1.8)}`;
}

/** Unterspülung: ausgewaschener Fels, das Wasser zieht unter die Wand. */
function undercut(text) {
  return `
    <path d="M-1.25,-1.5 L1.25,-1.5 L1.25,-0.35 L0.35,-0.42 C-0.15,-0.5 -0.45,-0.85 -1.25,-0.75 Z"
          fill="#8d8d8d" ${stroke}/>
    <g fill="none" stroke="#1b3fb5" stroke-width="0.14" stroke-linecap="round">
      <path d="M1.15,0.15 C0.35,0.15 0.1,-0.2 -0.45,-0.3"/>
    </g>
    <path d="M-0.35,-0.55 L-0.75,-0.18 L-0.3,-0.02 Z" fill="#1b3fb5"/>
    ${label(text, 0, -1.8)}`;
}

/** Gefährliche Strömung: kräftige Pfeile plus rotes Ausrufezeichen. */
function dangerousCurrent(text) {
  return `
    <g fill="none" stroke="#1b3fb5" stroke-width="0.16" stroke-linecap="round">
      <path d="M-1.35,-0.8 C-0.95,-1.1 -0.5,-0.5 -0.1,-0.8 C0.2,-1.02 0.45,-0.65 0.7,-0.8"/>
      <path d="M-1.35,-0.15 C-0.95,-0.45 -0.5,0.15 -0.1,-0.15 C0.2,-0.37 0.45,0.0 0.7,-0.15"/>
    </g>
    <g fill="#1b3fb5">
      <path d="M0.65,-1.05 L1.2,-0.8 L0.65,-0.55 Z"/>
      <path d="M0.65,-0.4 L1.2,-0.15 L0.65,0.1 Z"/>
    </g>
    <circle cx="0.95" cy="-1.45" r="0.32" fill="#c81e1e" ${thin}/>
    <g fill="#fff">
      <rect x="0.89" y="-1.62" width="0.12" height="0.22"/>
      <circle cx="0.95" cy="-1.33" r="0.07"/>
    </g>
    ${label(text, 0, -1.95)}`;
}

/** Siphon: das Wasser verschwindet unter einer Verblockung – kein Ausgang sichtbar. */
function siphon(text) {
  return `
    <path d="M-0.5,-1.35 L0.7,-1.25 L0.95,-0.5 L-0.25,-0.42 Z" fill="#8d8d8d" ${stroke}/>
    <g fill="none" stroke="#1b3fb5" stroke-width="0.15" stroke-linecap="round">
      <path d="M-1.4,-0.85 C-0.85,-0.85 -0.7,-0.15 -0.05,-0.1 C0.35,-0.07 0.6,-0.14 0.8,-0.28"/>
    </g>
    <path d="M0.6,-0.5 L1.05,-0.32 L0.72,-0.02 Z" fill="#1b3fb5"/>
    <g stroke="#c81e1e" stroke-width="0.15" stroke-linecap="round">
      <line x1="1.25" y1="-0.72" x2="1.25" y2="0.1"/>
    </g>
    ${label(text, 0, -1.8)}`;
}

/** Wasserableitung: Wehrklappe zweigt einen Teil des Baches seitlich ab. */
function waterDiversion(text) {
  return `
    <g fill="none" stroke="#1b3fb5" stroke-width="0.14" stroke-linecap="round">
      <path d="M-1.45,-0.85 L0.2,-0.85"/>
      <path d="M-0.45,-0.85 C-0.15,-0.85 -0.05,-0.4 0.0,-0.05"/>
    </g>
    <g fill="#1b3fb5">
      <path d="M0.15,-1.05 L0.75,-0.85 L0.15,-0.65 Z"/>
      <path d="M-0.22,-0.05 L0.22,-0.05 L0.0,0.5 Z"/>
    </g>
    <path d="M-0.62,-1.35 L-0.38,-1.35 L-0.38,-0.55 L-0.62,-0.55 Z" fill="#9a9a9a" ${stroke}/>
    ${label(text, 0, -1.6)}`;
}

/** Umgehung: gestrichelter Bogen um das Hindernis herum. */
function bypass(text) {
  return `
    <path d="M-0.35,0.35 L-0.2,-0.15 L0.3,-0.25 L0.45,0.3 Z" fill="#8d8d8d" ${stroke}/>
    <path d="M-1.2,0.35 C-1.15,-1.15 0.85,-1.35 1.15,-0.5"
          fill="none" stroke="#111" stroke-width="0.11" stroke-linecap="round"
          stroke-dasharray="0.32 0.22"/>
    <path d="M0.88,-0.62 L1.3,-0.3 L0.85,-0.12 Z" fill="#111"/>
    ${label(text, 0, -1.6)}`;
}

/**
 * Einstieg/Ausstieg: Schluchtwände als Klammer, Pfeil hinein bzw. hinaus.
 * Der Ausstieg bleibt grün wie das Fluchtweg-Schild, der Einstieg neutral.
 */
function entryExit(kind, text) {
  const arrow =
    kind === 'entry'
      ? `<path d="M0,0.2 L-0.42,-0.4 L-0.16,-0.4 L-0.16,-1.3 L0.16,-1.3 L0.16,-0.4 L0.42,-0.4 Z" fill="#111" ${thin}/>`
      : `<path d="M0,-1.4 L0.42,-0.8 L0.16,-0.8 L0.16,0.2 L-0.16,0.2 L-0.16,-0.8 L-0.42,-0.8 Z" fill="#0b7a45" ${thin}/>`;
  return `
    <g ${stroke} fill="none">
      <path d="M-1.15,-1.3 L-0.6,0.4"/>
      <path d="M1.15,-1.3 L0.6,0.4"/>
    </g>
    ${arrow}
    ${label(text, 0, -1.7)}`;
}

/**
 * Weg-Strecken (Pfad, Weg/Strasse) zwischen zwei Punkten. Der Text steht
 * mittig darüber, damit Wegnamen und Ziele beschriftet werden können.
 */
function trackLine(kind) {
  return {
    range: true,
    render(a, b, options) {
      const size = options.size > 0 ? options.size : 1;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const px = -dy / length;
      const py = dx / length;
      const text = options.element?.text;
      const caption = text
        ? `<text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 0.6 * size}" font-size="${0.55 * size}" text-anchor="middle">${esc(text)}</text>`
        : '';
      if (kind === 'path') {
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" fill="none"
          stroke="#111" stroke-width="${0.1 * size}" stroke-linecap="round"
          stroke-dasharray="${0.4 * size} ${0.26 * size}"/>${caption}`;
      }
      const offset = 0.17 * size;
      const rail = (sign) =>
        `<line x1="${a.x + px * offset * sign}" y1="${a.y + py * offset * sign}" x2="${b.x + px * offset * sign}" y2="${b.y + py * offset * sign}" fill="none" stroke="#111" stroke-width="${0.09 * size}" stroke-linecap="round"/>`;
      return `${rail(1)}${rail(-1)}${caption}`;
    },
  };
}

export const SYMBOL_CATEGORIES = [
  { id: 'anchors', label: 'Verankerung' },
  { id: 'hazards', label: 'Gefahren' },
  { id: 'nature', label: 'Natur' },
  { id: 'infrastructure', label: 'Infrastruktur' },
  { id: 'annotation', label: 'Beschriftung' },
];

export const SYMBOLS = {
  BOLT: {
    label: 'Bolt',
    category: 'anchors',
    render: (element) => bolt('none', element.text),
  },
  BOLT_LEFT: {
    label: 'Bolt links',
    category: 'anchors',
    render: (element) => bolt('left', element.text),
  },
  BOLT_RIGHT: {
    label: 'Bolt rechts',
    category: 'anchors',
    render: (element) => bolt('right', element.text),
  },
  LADDER: {
    label: 'Leiter',
    category: 'infrastructure',
    render: (element) => `
      <g ${stroke} fill="none">
        <line x1="-0.35" y1="0" x2="-0.35" y2="-2"/>
        <line x1="0.35" y1="0" x2="0.35" y2="-2"/>
        <line x1="-0.35" y1="-0.4" x2="0.35" y2="-0.4"/>
        <line x1="-0.35" y1="-0.9" x2="0.35" y2="-0.9"/>
        <line x1="-0.35" y1="-1.4" x2="0.35" y2="-1.4"/>
        <line x1="-0.35" y1="-1.85" x2="0.35" y2="-1.85"/>
      </g>${label(element.text, 0, -2.3)}`,
  },
  STONE: {
    label: 'Block',
    category: 'nature',
    render: (element) => `
      <path d="M-0.8,0 L-0.95,-0.65 L-0.35,-1.15 L0.5,-1.1 L0.95,-0.45 L0.7,0 Z" fill="#8d8d8d" ${stroke}/>
      ${label(element.text, 0, -1.4)}`,
  },
  TRAPPED_STONE: {
    label: 'Klemmblock',
    category: 'hazards',
    render: (element) => `
      <path d="M-1.5,-1.6 C-1.1,-1.0 -1.1,-0.5 -1.5,0.1" fill="none" ${stroke}/>
      <path d="M1.5,-1.6 C1.1,-1.0 1.1,-0.5 1.5,0.1" fill="none" ${stroke}/>
      <path d="M-0.75,-0.35 L-0.85,-0.95 L-0.2,-1.3 L0.6,-1.05 L0.8,-0.45 L0.35,-0.1 Z" fill="#8d8d8d" ${stroke}/>
      ${label(element.text, 0, -1.7)}`,
  },
  SHARP_EDGE: {
    label: 'Scharfe Kante',
    category: 'hazards',
    render: (element) => `
      <g ${stroke} fill="none">
        <line x1="-0.7" y1="-0.75" x2="0.8" y2="0.1"/>
        <line x1="-0.7" y1="0.1" x2="0.8" y2="-0.75"/>
      </g>
      <circle cx="-0.72" cy="-0.72" r="0.25" fill="#fff" stroke="#c81e1e" stroke-width="0.14"/>
      <circle cx="-0.72" cy="0.12" r="0.25" fill="#fff" stroke="#c81e1e" stroke-width="0.14"/>
      ${label(element.text, 0, -1.1)}`,
  },
  TRUNK: {
    label: 'Baumstamm',
    category: 'nature',
    render: (element) => `
      <path d="M-1.1,0.2 L0.9,-0.45 L1.0,-0.1 L-1.0,0.55 Z" fill="#6b3f1d" ${stroke}/>
      <g ${thin} fill="none">
        <line x1="0.9" y1="-0.3" x2="1.5" y2="-0.75"/>
        <line x1="0.9" y1="-0.3" x2="1.55" y2="-0.2"/>
        <line x1="0.9" y1="-0.3" x2="1.3" y2="0.2"/>
      </g>${label(element.text, 0, -0.9)}`,
  },
  LEAF_TREE: {
    label: 'Laubbaum',
    category: 'nature',
    render: (element) => tree('leaf', element.text, element.dead),
  },
  CONIFER_TREE: {
    label: 'Nadelbaum',
    category: 'nature',
    render: (element) => tree('conifer', element.text, element.dead),
  },
  CAVE: {
    label: 'Höhle',
    category: 'nature',
    render: (element) => `
      <path d="M-1.1,0.15 C-1.0,-1.1 1.0,-1.1 1.1,0.15 Z" fill="#5b4632" ${stroke}/>
      <path d="M-0.45,0.15 C-0.4,-0.55 0.4,-0.55 0.45,0.15 Z" fill="#14100c"/>
      ${label(element.text, 0, -1.3)}`,
  },
  BACKWATER: {
    label: 'Rückstrom',
    category: 'hazards',
    render: (element) => `
      <path d="M0.35,-0.75 a0.55,0.55 0 1,1 -0.5,-0.15" fill="none" stroke="#fff" stroke-width="0.14"/>
      <path d="M0.1,-1.15 L-0.2,-0.9 L0.15,-0.7 Z" fill="#fff"/>
      ${label(element.text, 0, -1.6, 'fill="#fff"')}`,
  },
  STONE_BRIDGE: {
    label: 'Steinbrücke',
    category: 'infrastructure',
    render: (element) => `
      <path d="M-1.5,0.1 L-1.5,-0.7 C-1.0,-1.45 1.0,-1.45 1.5,-0.7 L1.5,0.1 L0.85,0.1 C0.85,-0.75 -0.85,-0.75 -0.85,0.1 Z"
            fill="#cfcfcf" ${stroke}/>
      <g ${thin} fill="none" opacity="0.8">
        <line x1="-1.5" y1="-0.7" x2="1.5" y2="-0.7"/>
        <line x1="-1.0" y1="-1.1" x2="-1.0" y2="-0.7"/>
        <line x1="0" y1="-1.35" x2="0" y2="-1.1"/>
        <line x1="1.0" y1="-1.1" x2="1.0" y2="-0.7"/>
      </g>${label(element.text, 0, -1.7)}`,
  },
  WOODEN_BRIDGE: {
    label: 'Holzbrücke',
    category: 'infrastructure',
    render: (element) => `
      <path d="M-1.6,0.15 L1.6,-0.5 L1.6,-0.15 L-1.6,0.5 Z" fill="#b5651d" ${stroke}/>
      <g ${thin} fill="none">
        <line x1="-1.6" y1="-0.35" x2="1.6" y2="-1.0"/>
        <line x1="-1.6" y1="0.15" x2="-1.6" y2="-0.35"/>
        <line x1="0" y1="-0.18" x2="0" y2="-0.68"/>
        <line x1="1.6" y1="-0.5" x2="1.6" y2="-1.0"/>
      </g>${label(element.text, 0, -1.3)}`,
  },
  STONE_HOUSE: {
    label: 'Haus / Hütte',
    category: 'infrastructure',
    render: (element) => `
      <path d="M-1.3,0.1 L-1.3,-1.3 L1.3,-1.3 L1.3,0.1 Z" fill="#e8dcb5" ${stroke}/>
      <path d="M-1.5,-1.3 L0,-2.1 L1.5,-1.3 Z" fill="#b5451d" ${stroke}/>
      <rect x="-0.9" y="-0.95" width="0.5" height="0.45" fill="#1a1a1a"/>
      <rect x="0.4" y="-0.95" width="0.5" height="0.45" fill="#1a1a1a"/>
      <rect x="-0.25" y="-0.6" width="0.5" height="0.7" fill="#6b3f1d" ${thin}/>
      ${label(element.text, 0, -2.4)}`,
  },
  RADIO_MAST: {
    label: 'Funkmast',
    category: 'infrastructure',
    render: (element, theme) => `
      <path d="M-0.65,0 L0,-2.45 L0.65,0 Z" fill="none" ${stroke}/>
      <g ${thin} fill="none">
        <path d="M-0.48,-0.65 L0.3,-1.3 L-0.3,-1.3 L0.48,-0.65 Z"/>
        <path d="M-0.3,-1.3 L0.15,-1.88 L-0.15,-1.88 L0.3,-1.3 Z"/>
        <line x1="-0.72" y1="-0.65" x2="0.72" y2="-0.65"/>
      </g>
      <line x1="0" y1="-2.45" x2="0" y2="-2.8" ${stroke}/>
      <circle cx="0" cy="-2.85" r="0.11" fill="${theme === 'bw' ? '#555' : '#c52b24'}"/>
      <g fill="none" stroke="${theme === 'bw' ? '#555' : '#c52b24'}" stroke-width="0.09" stroke-linecap="round">
        <path d="M-0.24,-2.95 Q-0.55,-2.85 -0.24,-2.55"/>
        <path d="M0.24,-2.95 Q0.55,-2.85 0.24,-2.55"/>
        <path d="M-0.43,-3.12 Q-0.92,-2.85 -0.43,-2.38"/>
        <path d="M0.43,-3.12 Q0.92,-2.85 0.43,-2.38"/>
      </g>${label(element.text, 0, -3.4)}`,
  },
  LIFT_MAST: {
    label: 'Liftmast',
    category: 'infrastructure',
    render: (element, theme) => `
      <path d="M-0.16,0 L-0.16,-2.05 L0.16,-2.05 L0.16,0 Z" fill="${theme === 'bw' ? '#aaa' : '#768898'}" ${stroke}/>
      <path d="M-1.3,-2.05 L1.3,-2.05 L1.3,-1.88 L-1.3,-1.88 Z" fill="${theme === 'bw' ? '#777' : '#52687a'}" ${stroke}/>
      <g fill="#fff" ${thin}>
        <circle cx="-1.05" cy="-2.12" r="0.11"/>
        <circle cx="1.05" cy="-2.12" r="0.11"/>
      </g>
      <path d="M-1.7,-2.27 L1.7,-2.27" fill="none" ${stroke}/>
      <g fill="none" ${thin}>
        <path d="M0.85,-2.27 L0.85,-1.45"/>
        <path d="M0.4,-1.45 L1.3,-1.45 L1.15,-1.1 L0.55,-1.1 Z"/>
      </g>${label(element.text, 0, -2.65)}`,
  },
  SQUARE_CONCRETE_BASE: {
    label: 'Betonsockel eckig',
    category: 'infrastructure',
    render: (element, theme) => `
      <path d="M-0.95,-0.85 L0.65,-0.85 L1.05,-1.15 L-0.55,-1.15 Z"
            fill="${theme === 'bw' ? '#eee' : '#d7d4c9'}" ${stroke}/>
      <path d="M0.65,-0.85 L1.05,-1.15 L1.05,-0.3 L0.65,0 Z"
            fill="${theme === 'bw' ? '#777' : '#92918a'}" ${stroke}/>
      <path d="M-0.95,-0.85 L0.65,-0.85 L0.65,0 L-0.95,0 Z"
            fill="${theme === 'bw' ? '#bbb' : '#bcbab1'}" ${stroke}/>
      <g fill="#111">
        <circle cx="-0.5" cy="-0.98" r="0.06"/>
        <circle cx="0.47" cy="-0.98" r="0.06"/>
      </g>${label(element.text, 0, -1.45)}`,
  },
  STEEL_BEAM: {
    label: 'Stahlträger',
    category: 'infrastructure',
    render: (element, theme) => `
      <path d="M-1.4,-1.1 L1.2,-1.1 L1.4,-0.92 L-1.2,-0.92 Z"
            fill="${theme === 'bw' ? '#ddd' : '#aab9c6'}" ${stroke}/>
      <path d="M-1.2,-0.92 L1.4,-0.92 L1.4,-0.72 L-1.2,-0.72 Z"
            fill="${theme === 'bw' ? '#888' : '#71889a'}" ${stroke}/>
      <path d="M-1.05,-0.72 L1.05,-0.72 L1.05,-0.23 L-1.05,-0.23 Z"
            fill="${theme === 'bw' ? '#bbb' : '#899eae'}" ${stroke}/>
      <path d="M-1.2,-0.23 L1.4,-0.23 L1.4,-0.03 L-1.2,-0.03 Z"
            fill="${theme === 'bw' ? '#888' : '#71889a'}" ${stroke}/>
      <g fill="#111">
        <circle cx="-0.65" cy="-0.47" r="0.06"/>
        <circle cx="0.55" cy="-0.47" r="0.06"/>
      </g>${label(element.text, 0, -1.4)}`,
  },
  INLET_LEFT: {
    label: 'Zufluss links',
    category: 'nature',
    render: (element) => inlet('left', element.text),
  },
  INLET_RIGHT: {
    label: 'Zufluss rechts',
    category: 'nature',
    render: (element) => inlet('right', element.text),
  },
  ESCAPE_EXIT_LEFT: {
    label: 'Fluchtweg links',
    category: 'annotation',
    render: (element) =>
      exitSign('left', element.text, element.duration_to_walk_in_min),
  },
  ESCAPE_EXIT_RIGHT: {
    label: 'Fluchtweg rechts',
    category: 'annotation',
    render: (element) =>
      exitSign('right', element.text, element.duration_to_walk_in_min),
  },
  ROPE_RAILING_LEFT: {
    label: 'Seilgeländer links',
    category: 'infrastructure',
    ...ropeRailing('left'),
  },
  ROPE_RAILING_RIGHT: {
    label: 'Seilgeländer rechts',
    category: 'infrastructure',
    ...ropeRailing('right'),
  },
  ELEMENT_NUMBER: {
    label: 'Nummer',
    category: 'annotation',
    render: (element) => `
      <circle cx="0" cy="-0.55" r="0.62" fill="#fff" ${stroke}/>
      <text x="0" y="-0.33" font-size="0.75" text-anchor="middle">${esc(element.text || '?')}</text>`,
  },
  CUSTOM_TEXT: {
    label: 'Freitext',
    category: 'annotation',
    render: (element) =>
      `<text x="0" y="0" font-size="0.85" text-anchor="middle">${esc(element.text || 'Text')}</text>`,
  },
  WARNING_AND_TEXT: {
    label: 'Warnung + Text',
    category: 'hazards',
    render: (element) => `
      <path d="M0,-1.55 L0.95,0.1 L-0.95,0.1 Z" fill="#f0b400" ${stroke}/>
      <rect x="-0.06" y="-1.15" width="0.12" height="0.7" fill="#111"/>
      <circle cx="0" cy="-0.25" r="0.1" fill="#111"/>
      ${
        element.text
          ? `<rect x="1.15" y="-1.0" width="${Math.max(1.2, element.text.length * 0.42)}" height="0.8" rx="0.1" fill="#f0b400"/>
             <text x="${1.3}" y="-0.4" font-size="0.6">${esc(element.text)}</text>`
          : ''
      }`,
  },
  DEATH_HAZARD: {
    label: 'Lebensgefahr',
    category: 'hazards',
    render: (element) => deathHazard(element.text),
  },
  TREE_JAM: {
    label: 'Baumverhau',
    category: 'hazards',
    render: (element) => treeJam(element.text),
  },
  BOULDER_JAM: {
    label: 'Felsblockverhau',
    category: 'hazards',
    render: (element) => boulderJam(element.text),
  },
  ROCKFALL: {
    label: 'Steinschlag',
    category: 'hazards',
    render: (element) => rockfall(element.text),
  },
  UNDERCUT: {
    label: 'Unterspülung',
    category: 'hazards',
    render: (element) => undercut(element.text),
  },
  DANGEROUS_CURRENT: {
    label: 'Gefährliche Strömung',
    category: 'hazards',
    render: (element) => dangerousCurrent(element.text),
  },
  SIPHON: {
    label: 'Siphon',
    category: 'hazards',
    render: (element) => siphon(element.text),
  },
  WATER_DIVERSION: {
    label: 'Wasserableitung',
    category: 'infrastructure',
    render: (element) => waterDiversion(element.text),
  },
  PATH: {
    label: 'Pfad',
    category: 'infrastructure',
    ...trackLine('path'),
  },
  ROAD: {
    label: 'Weg / Strasse',
    category: 'infrastructure',
    ...trackLine('road'),
  },
  BYPASS: {
    label: 'Umgehung',
    category: 'annotation',
    render: (element) => bypass(element.text),
  },
  ENTRY_POINT: {
    label: 'Einstieg',
    category: 'annotation',
    render: (element) => entryExit('entry', element.text),
  },
  EXIT_POINT: {
    label: 'Ausstieg',
    category: 'annotation',
    render: (element) => entryExit('exit', element.text),
  },
};

export function symbolFor(type) {
  return SYMBOLS[type] || null;
}

/** Fallback für unbekannte Typen: neutraler Marker, damit Daten sichtbar bleiben. */
export function renderUnknownSymbol(element) {
  return `
    <circle cx="0" cy="0" r="0.5" fill="#fff" stroke="#c81e1e" stroke-width="0.1" stroke-dasharray="0.2 0.15"/>
    <text x="0" y="0.2" font-size="0.55" text-anchor="middle" fill="#c81e1e">?</text>
    <text x="0" y="-0.8" font-size="0.45" text-anchor="middle" fill="#c81e1e">${esc(element.type)}</text>`;
}

export function symbolOptions() {
  return SYMBOL_CATEGORIES.map((category) => ({
    ...category,
    symbols: Object.entries(SYMBOLS)
      .filter(([, symbol]) => symbol.category === category.id)
      .flatMap(([type, symbol]) => {
        const base = { type, label: symbol.label, range: !!symbol.range, dead: false };
        // Varianten direkt in der Palette: Wer einen toten Baum sucht, findet ihn
        // dort – statt erst einen lebenden zu setzen und ein Kästchen zu suchen.
        if (!DEAD_CAPABLE_ELEMENT_TYPES.has(type)) return [base];
        return [base, { ...base, label: `${symbol.label} (abgestorben)`, dead: true }];
      }),
  }));
}
