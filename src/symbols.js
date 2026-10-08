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
  if (direction === 'right') {
    return `
    <rect x="-1.3" y="-1.05" width="2.6" height="1.2" rx="0.08" fill="#0b7a45"/>
    <g fill="#fff" stroke="none">
      <circle cx="-0.55" cy="-0.84" r="0.1"/>
      <g fill="none" stroke="#fff" stroke-width="0.115" stroke-linecap="round" stroke-linejoin="round">
        <path d="M-0.6,-0.62 L-0.76,-0.3"/>
        <path d="M-0.61,-0.59 L-0.34,-0.42 L-0.18,-0.58 M-0.64,-0.57 L-0.87,-0.49 L-1.02,-0.62"/>
        <path d="M-0.76,-0.3 L-0.47,-0.16 L-0.3,0.01 M-0.76,-0.3 L-0.91,-0.03 L-1.1,-0.03"/>
      </g>
      <path d="M0.75,-0.75 L1.15,-0.45 L0.75,-0.15 L0.75,-0.35 L0.2,-0.35 L0.2,-0.55 L0.75,-0.55 Z"/>
    </g>
    ${label(text, 0, -1.25)}
    ${walkTimeLabel(minutes)}`;
  }
  const arrow = '<path d="M-0.75,-0.75 L-1.15,-0.45 L-0.75,-0.15 L-0.75,-0.35 L-0.3,-0.35 L-0.3,-0.55 L-0.75,-0.55 Z" fill="#fff"/>';
  const graphic = `
    <rect x="-1.3" y="-1.05" width="2.6" height="1.2" rx="0.08" fill="#0b7a45"/>
    ${arrow}
    <path d="M0.55,-0.95 a0.11,0.11 0 1,0 0.01,0 Z" fill="#fff"/>
    <path d="M0.45,-0.8 L0.75,-0.65 L0.62,-0.4 L0.8,-0.2 L0.68,-0.15 L0.5,-0.4 L0.35,-0.15 L0.24,-0.22 L0.4,-0.5 Z" fill="#fff"/>`;
  return `${graphic}
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

/**
 * Rappel Guide (RG): geführte Abseile entlang eines gespannten Führungsseils.
 * Gerade Linie von Start zu Ende wie der Abseilpfeil der Abseilstellen,
 * Pfeilspitze am Endpunkt und das Kürzel "RG" mittig über der Linie.
 * Die Farbe kommt aus dem Theme (options.color), damit SW korrekt bleibt.
 */
function rappelGuide() {
  return {
    range: true,
    render(a, b, options) {
      const size = options.size > 0 ? options.size : 1;
      const color = options.color || '#111';
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      const ux = length ? dx / length : 1;
      const uy = length ? dy / length : 0;
      const px = -uy;
      const py = ux;
      const head = Math.min(0.55 * size, length * 0.4);
      const headWidth = head * 0.55;
      const baseX = b.x - ux * head;
      const baseY = b.y - uy * head;
      const arrow = length
        ? `<path d="M${b.x},${b.y} L${baseX + px * headWidth},${baseY + py * headWidth} L${baseX - px * headWidth},${baseY - py * headWidth} Z" fill="${color}" stroke="none"/>`
        : '';
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      // Beschriftung immer auf der oberen Seite der Linie.
      const side = py > 0 ? -1 : 1;
      const offset = 0.55 * size;
      const text = options.element?.text;
      const caption = text ? ` ${esc(text)}` : '';
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" fill="none"
          stroke="${color}" stroke-width="${0.12 * size}" stroke-linecap="butt"/>
        <circle cx="${a.x}" cy="${a.y}" r="${0.12 * size}" fill="${color}" stroke="none"/>${arrow}
        <text x="${midX + px * offset * side}" y="${midY + py * offset * side + 0.2 * size}" font-size="${0.6 * size}" font-weight="700" text-anchor="middle" fill="${color}">RG${caption}</text>`;
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
  RAPPEL_GUIDE: {
    label: 'Rappel Guide (RG)',
    category: 'anchors',
    ...rappelGuide(),
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

/* ------------------------------------------------------------ Eau Froide */

/**
 * Farbpalette des Stils „Eau Froide“, aus dem Referenz-Topo abgeleitet.
 * Rot (#ff0000) steht für Verankerungen und Dächer, Dunkelrot (#800000) für
 * Weg/Strasse/Pfad, Braun (#993300) für Holz und Hütte, Cyan für Wasser.
 */
export const EAU_FROIDE_PALETTE = {
  water: '#00ffff',
  waterDark: '#33cccc',
  tree: '#00ff00',
  treeLine: '#004d00',
  anchor: '#ff0000',
  road: '#800000',
  wood: '#993300',
  woodDark: '#662200',
  stone: '#b1b1b1',
  stoneLight: '#cfcfcf',
  stoneShade: '#898989',
  shadow: '#bfbfbf',
  line: '#000000',
};

const EF = EAU_FROIDE_PALETTE;
const efStroke = `stroke="${EF.line}" stroke-width="0.07" stroke-linejoin="round" stroke-linecap="round"`;
const efThin = `stroke="${EF.line}" stroke-width="0.05" stroke-linejoin="round"`;

function efLabel(text, x, y) {
  return label(text, x, y, 'font-weight="700"');
}

function efAnchor(side, text) {
  const tag = side === 'left' ? 'RG' : side === 'right' ? 'RD' : '';
  return `
    <g fill="${EF.anchor}">
      <circle cx="-0.28" cy="0" r="0.26"/>
      <circle cx="0.28" cy="0.1" r="0.26"/>
    </g>
    ${tag ? `<text x="0.75" y="-0.2" font-size="0.85" font-weight="700" text-anchor="start">${tag}</text>` : ''}
    ${efLabel(text, 0, tag ? -1.1 : -0.55)}`;
}

/** Grauer Block mit Schattenfläche unten rechts und Lichtkante oben links. */
function efBlock(x, y, scale = 1) {
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <path d="M-0.8,0 L-0.95,-0.65 L-0.35,-1.15 L0.5,-1.1 L0.95,-0.45 L0.7,0 Z" fill="${EF.stone}" ${efStroke}/>
    <path d="M0.1,0 L0.7,0 L0.95,-0.45 L0.5,-1.1 L0.45,-0.45 Z" fill="${EF.stoneShade}" stroke="none"/>
    <path d="M-0.85,-0.6 L-0.35,-1.05 L0.3,-1.02 L-0.15,-0.62 Z" fill="${EF.stoneLight}" stroke="none"/>
    <path d="M-0.8,0 L-0.95,-0.65 L-0.35,-1.15 L0.5,-1.1 L0.95,-0.45 L0.7,0 Z" fill="none" ${efStroke}/>
  </g>`;
}

/** Holzkreuz: zwei gekreuzte braune Stäbe. */
function efWoodCross(x, y, scale = 1, angle = 0) {
  return `<g transform="translate(${x},${y}) rotate(${angle}) scale(${scale})" fill="none"
      stroke="${EF.wood}" stroke-width="0.2" stroke-linecap="butt">
    <line x1="-1" y1="-0.15" x2="1" y2="-0.75"/>
    <line x1="-0.7" y1="-1" x2="0.7" y2="0.1"/>
  </g>`;
}

function efConifer(text) {
  return `
    <path d="M-0.1,0 L-0.1,-0.4 L0.1,-0.4 L0.1,0 Z" fill="${EF.wood}" stroke="none"/>
    <path d="M0,-3.0 L0.4,-2.15 L0.18,-2.15 L0.62,-1.4 L0.28,-1.4 L0.9,-0.4 L-0.9,-0.4 L-0.28,-1.4 L-0.62,-1.4 L-0.18,-2.15 L-0.4,-2.15 Z"
          fill="${EF.tree}" stroke="${EF.treeLine}" stroke-width="0.06" stroke-linejoin="round"/>
    <g stroke="${EF.treeLine}" stroke-width="0.045" stroke-linecap="round" fill="none">
      <line x1="0" y1="-2.9" x2="0" y2="-0.4"/>
      <line x1="0" y1="-2.4" x2="-0.32" y2="-2.2"/><line x1="0" y1="-2.4" x2="0.32" y2="-2.2"/>
      <line x1="0" y1="-1.8" x2="-0.5" y2="-1.45"/><line x1="0" y1="-1.8" x2="0.5" y2="-1.45"/>
      <line x1="0" y1="-1.1" x2="-0.78" y2="-0.55"/><line x1="0" y1="-1.1" x2="0.78" y2="-0.55"/>
    </g>
    ${efLabel(text, 0, -3.3)}`;
}

function efLeafTree(text) {
  return `
    <path d="M-0.1,0 L-0.1,-1 L0.1,-1 L0.1,0 Z" fill="${EF.wood}" stroke="none"/>
    <path d="M0,-2.5 C0.95,-2.5 1.3,-1.6 1,-1.1 C1.25,-0.6 0.7,-0.3 0,-0.45 C-0.7,-0.3 -1.25,-0.6 -1,-1.1 C-1.3,-1.6 -0.95,-2.5 0,-2.5 Z"
          fill="${EF.tree}" stroke="${EF.treeLine}" stroke-width="0.06"/>
    <g stroke="${EF.treeLine}" stroke-width="0.045" fill="none" stroke-linecap="round">
      <line x1="0" y1="-1" x2="-0.5" y2="-1.6"/><line x1="0" y1="-1" x2="0.5" y2="-1.6"/>
      <line x1="0" y1="-1" x2="0" y2="-2.1"/>
    </g>
    ${efLabel(text, 0, -2.8)}`;
}

function efHut(text) {
  return `
    <path d="M0.3,0 L0.3,-1.05 L1.3,-1.45 L1.3,-0.4 Z" fill="${EF.woodDark}" stroke="${EF.road}" stroke-width="0.08" stroke-linejoin="round"/>
    <path d="M-1.3,0 L-1.3,-1.05 L0.3,-1.05 L0.3,0 Z" fill="${EF.wood}" stroke="${EF.road}" stroke-width="0.08" stroke-linejoin="round"/>
    <path d="M-1.45,-1.0 L-0.45,-1.95 L1.45,-1.45 L0.4,-1.0 Z" fill="${EF.anchor}" stroke="${EF.road}" stroke-width="0.08" stroke-linejoin="round"/>
    <path d="M-1.45,-1.0 L-0.45,-1.95 L-0.1,-1.45 Z" fill="#cc0000" stroke="${EF.road}" stroke-width="0.06" stroke-linejoin="round"/>
    ${efLabel(text, 0, -2.3)}`;
}

function efWarning(element) {
  const text = element.text;
  return `
    <path d="M0,-1.6 L1.0,0.1 L-1.0,0.1 Z" fill="#fff" stroke="${EF.anchor}" stroke-width="0.2" stroke-linejoin="round"/>
    <rect x="-0.07" y="-1.05" width="0.14" height="0.62" fill="${EF.line}"/>
    <circle cx="0" cy="-0.22" r="0.1" fill="${EF.line}"/>
    ${text ? `<text x="1.3" y="-0.35" font-size="0.65" font-weight="700" text-anchor="start">${esc(text)}</text>` : ''}`;
}

/** Läufer-Piktogramm, schwarz, nach rechts laufend. */
function efRunner(text, arrow) {
  return `
    <g fill="${EF.line}" stroke="${EF.line}" stroke-width="0.17" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="0.35" cy="-2.0" r="0.22" stroke="none"/>
      <path d="M0.15,-1.65 L-0.15,-0.95" fill="none"/>
      <path d="M0.12,-1.5 L0.7,-1.2 M0.1,-1.45 L-0.5,-1.15" fill="none"/>
      <path d="M-0.15,-0.95 L0.35,-0.45 L0.2,0 M-0.15,-0.95 L-0.6,-0.5 L-0.95,-0.7" fill="none"/>
    </g>
    ${arrow || ''}
    ${efLabel(text, 0, -2.5)}`;
}

function efArrow(direction) {
  return direction === 'up'
    ? `<path d="M-1.35,-1.5 L-1.1,-1.0 L-1.25,-1.0 L-1.25,-0.3 L-1.45,-0.3 L-1.45,-1.0 L-1.6,-1.0 Z" fill="${EF.line}"/>`
    : `<path d="M-1.35,-0.3 L-1.1,-0.8 L-1.25,-0.8 L-1.25,-1.5 L-1.45,-1.5 L-1.45,-0.8 L-1.6,-0.8 Z" fill="${EF.line}"/>`;
}

const EAU_FROIDE_SYMBOLS = {
  BOLT: (e) => efAnchor('none', e.text),
  BOLT_LEFT: (e) => efAnchor('left', e.text),
  BOLT_RIGHT: (e) => efAnchor('right', e.text),
  STONE: (e) => `${efBlock(0, 0)}${efLabel(e.text, 0, -1.4)}`,
  TRAPPED_STONE: (e) => `
    <g fill="none" ${efStroke}>
      <path d="M-1.5,-1.6 C-1.1,-1.0 -1.1,-0.5 -1.5,0.1"/>
      <path d="M1.5,-1.6 C1.1,-1.0 1.1,-0.5 1.5,0.1"/>
    </g>${efBlock(0, 0.1, 0.85)}${efLabel(e.text, 0, -1.7)}`,
  BOULDER_JAM: (e) => `${efBlock(-0.7, 0.2, 0.75)}${efBlock(0.75, 0.2, 0.75)}${efBlock(0, -0.4, 0.8)}${efLabel(e.text, 0, -1.5)}`,
  ROCKFALL: (e) => `
    <path d="M-1.45,-1.6 L-0.75,-0.15 L-1.45,-0.15 Z" fill="${EF.stoneLight}" ${efStroke}/>
    ${efBlock(-0.1, -0.7, 0.45)}${efBlock(0.8, -0.1, 0.5)}${efBlock(0.05, 0.4, 0.35)}${efLabel(e.text, 0, -1.8)}`,
  TRUNK: (e) => `${efWoodCross(0, -0.3, 1, -8)}${efLabel(e.text, 0, -1.2)}`,
  TREE_JAM: (e) => `${efWoodCross(-0.3, -0.3, 1, -6)}${efWoodCross(0.4, -0.5, 0.9, 12)}${efLabel(e.text, 0, -1.6)}`,
  CONIFER_TREE: (e) => (e.dead ? null : efConifer(e.text)),
  LEAF_TREE: (e) => (e.dead ? null : efLeafTree(e.text)),
  STONE_HOUSE: (e) => efHut(e.text),
  WARNING_AND_TEXT: (e) => efWarning(e),
  ELEMENT_NUMBER: (e) => `
    <circle cx="0" cy="-0.55" r="0.55" fill="#fff" ${efStroke}/>
    <text x="0" y="-0.3" font-size="0.65" text-anchor="middle">${esc(e.text || '?')}</text>`,
  ENTRY_POINT: (e) => efRunner(e.text, efArrow('down')),
  EXIT_POINT: (e) => efRunner(e.text, efArrow('up')),
  ESCAPE_EXIT_LEFT: (e) => `<g transform="scale(-1,1)">${efRunner('', '')}</g>${efLabel(e.text, 0, -2.5)}${walkTimeLabel(e.duration_to_walk_in_min)}`,
  ESCAPE_EXIT_RIGHT: (e) => `${efRunner(e.text, '')}${walkTimeLabel(e.duration_to_walk_in_min)}`,
};

const EAU_FROIDE_COLORS = {
  '#1b3fb5': '#00b4c4',
  '#1f7a34': '#00e000',
  '#0b7a45': '#00a000',
  '#c81e1e': '#ff0000',
  '#c52b24': '#ff0000',
  '#f0b400': '#ff0000',
  '#6b3f1d': '#993300',
  '#b5651d': '#993300',
  '#b5451d': '#ff0000',
  '#5b4632': '#666666',
  '#7a6a58': '#666666',
  '#8a7864': '#a0a0a0',
  '#e8dcb5': '#f0f0f0',
  '#8d8d8d': '#b1b1b1',
  '#9a9a9a': '#b1b1b1',
  '#b9b2a6': '#cfcfcf',
  '#d7d4c9': '#e0e0e0',
  '#111': '#000000',
  '#111111': '#000000',
};

function eauFroideRecolor(svg) {
  return svg.replace(/#[\da-f]{3,8}(?=["'])/gi, (color) => EAU_FROIDE_COLORS[color.toLowerCase()] || color);
}

/** Weg/Strasse: durchgezogen dunkelrot; Pfad: dunkelrot gepunktet. */
function efTrackLine(kind) {
  return (a, b, options) => {
    const size = options.size > 0 ? options.size : 1;
    const text = options.element?.text;
    const caption = text
      ? `<text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 0.6 * size}" font-size="${0.55 * size}" text-anchor="middle">${esc(text)}</text>`
      : '';
    const dash =
      kind === 'path'
        ? ` stroke-dasharray="${0.01 * size} ${0.3 * size}" stroke-linecap="round"`
        : ' stroke-linecap="round"';
    const width = kind === 'path' ? 0.2 : 0.16;
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" fill="none"
      stroke="${EF.road}" stroke-width="${width * size}"${dash}/>${caption}`;
  };
}

const EAU_FROIDE_RANGE = { PATH: efTrackLine('path'), ROAD: efTrackLine('road') };

/** Punktsymbol im Stil Eau Froide: eigene Form, sonst an die Palette angepasst. */
export function renderEauFroideSymbol(type, element) {
  const custom = EAU_FROIDE_SYMBOLS[type];
  const own = custom ? custom(element) : null;
  if (own) return own;
  const symbol = SYMBOLS[type];
  return symbol ? eauFroideRecolor(symbol.render(element, 'color')) : renderUnknownSymbol(element);
}

/** Streckensymbol im Stil Eau Froide. */
export function renderEauFroideRange(type, a, b, options) {
  const custom = EAU_FROIDE_RANGE[type];
  if (custom) return custom(a, b, options);
  return eauFroideRecolor(SYMBOLS[type].render(a, b, options));
}

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
