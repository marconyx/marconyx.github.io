/**
 * Passwortsperre der AI-Erkennung. Beim Aufklappen wird ein Passwort verlangt;
 * erst danach ist der Abschnitt bedienbar. Die Freischaltung gilt für die
 * Browser-Sitzung (sessionStorage).
 *
 * Hinweis: Rein clientseitig – das ist eine Zugangshürde, kein echter Schutz.
 * Im Code steht nur der SHA-256-Hash, nicht das Passwort im Klartext.
 */

export const AI_UNLOCK_KEY = 'canyon-topo-generator/ai-unlocked/v1';
export const AI_PASSWORD_SHA256 = '6ab3deaaec2f9b345e324d903981afccef7a1f07ea98b87527c6ff9a2590a8b4';

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sessionStore() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Schützt den AI-Abschnitt vor versehentlicher Aktivierung.
 *
 * Speicher, Digest-Funktion und Statuscallback sind injizierbar, damit die
 * Dialogzustände ohne echten Browser-Dialog getestet werden können. Der Hash
 * ist clientseitig prüfbar und stellt ausdrücklich keine Sicherheitsgrenze dar.
 * Erfolgreiche Prüfung speichert nur den Marker `1` für diese Browsersitzung,
 * nicht das eingegebene Passwort. Bei nicht verfügbarem sessionStorage gilt die
 * Freischaltung nur bis zum Reload; ein Digest-Fehler lässt den Dialog gesperrt.
 *
 * @param {object} [options] `root`, `storage`, asynchrones `digest` und `onMessage`
 * @returns {{isUnlocked: () => boolean}}
 */
export function initAiLock({
  root = document,
  storage = sessionStore(),
  digest = sha256Hex,
  onMessage = () => {},
} = {}) {
  const section = root.getElementById('panel-ai');
  const dialog = root.getElementById('ai-lock-dialog');
  const form = root.getElementById('ai-lock-form');
  const input = root.getElementById('ai-lock-password');
  const error = root.getElementById('ai-lock-error');
  const cancel = root.getElementById('btn-ai-lock-cancel');

  let unlocked = false;
  try {
    unlocked = storage?.getItem(AI_UNLOCK_KEY) === '1';
  } catch {
    unlocked = false;
  }

  const closeDialog = () => {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    dialog.open = false;
  };

  const askPassword = () => {
    input.value = '';
    error.hidden = true;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.open = true;
    input.focus();
  };

  if (!unlocked && section.open) section.open = false;

  section.addEventListener('click', (event) => {
    if (unlocked || section.open) return;
    const summary = event.target?.closest?.('summary');
    if (summary && summary.parentElement !== section) return;
    event.preventDefault();
    askPassword();
  });
  // Sicherheitsnetz für jedes andere Öffnen (Tastatur, gespeicherter Zustand).
  section.addEventListener('toggle', () => {
    if (unlocked || !section.open) return;
    section.open = false;
    askPassword();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let ok = false;
    try {
      ok = (await digest(input.value)) === AI_PASSWORD_SHA256;
    } catch (failure) {
      console.warn('Passwort konnte nicht geprüft werden.', failure);
    }
    if (!ok) {
      error.hidden = false;
      input.value = '';
      input.focus();
      return;
    }
    unlocked = true;
    try {
      storage?.setItem(AI_UNLOCK_KEY, '1');
    } catch {
      // Ohne Sitzungsspeicher gilt die Freischaltung nur bis zum Neuladen.
    }
    input.value = '';
    closeDialog();
    section.open = true;
    onMessage('status.ai_unlocked');
  });
  cancel.addEventListener('click', () => {
    input.value = '';
    closeDialog();
  });

  return { isUnlocked: () => unlocked };
}
