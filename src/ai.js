/**
 * Vorbereitete Schnittstelle für eine spätere AI-gestützte Foto→Topo-Erkennung.
 *
 * Status: NICHT implementiert (v1 arbeitet manuell mit Foto-Referenzlayer).
 *
 * Erwarteter Vertrag:
 *   photoToTopo(image, options) -> Promise<Topo>
 *   - `image`   : File | Blob | HTMLImageElement
 *   - `options` : { signal?, hints?: { canyonName?, maximumWalkLength? } }
 *   - Rückgabe  : ein Objekt in der Struktur von model.js (wird mit
 *                 normalizeTopo() geprüft, bevor es in den Editor geht).
 *
 * Anbindungsmöglichkeiten ohne eigenen Server:
 *   1. Vision-Modell direkt aus dem Browser mit einem vom Nutzer hinterlegten
 *      API-Key (Key nur in localStorage, nie im Repository).
 *   2. Serverless-Proxy (z. B. GitHub Actions, Worker) als `provider`, damit der
 *      Key nicht im Client liegt.
 *
 * Zum Aktivieren: `registerTopoProvider(fn)` aufrufen; die UI schaltet den
 * Button "Aus Foto erzeugen" dann automatisch frei.
 */
import { normalizeTopo } from './model.js';

let provider = null;

export function registerTopoProvider(fn) {
  provider = typeof fn === 'function' ? fn : null;
}

export function isTopoProviderAvailable() {
  return provider !== null;
}

export async function photoToTopo(image, options = {}) {
  if (!provider) {
    throw new Error(
      'Es ist kein AI-Provider registriert. Das Foto kann aktuell nur als Referenzlayer zum Nachzeichnen genutzt werden.',
    );
  }
  const result = await provider(image, options);
  return normalizeTopo(result);
}
