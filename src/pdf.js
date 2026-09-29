/**
 * PDF-Unterstützung für den Foto-Referenzlayer.
 *
 * Viele Canyoning-Topos liegen als PDF vor (Führerliteratur, Scans, Exporte
 * anderer Topo-Tools). Dieses Modul rendert eine PDF-Seite in ein Canvas und
 * liefert eine PNG-Data-URL, die der Editor genauso behandelt wie ein Foto.
 *
 * pdf.js liegt unter vendor/pdfjs/ im Repository, damit die App ohne Netzzugriff
 * und ohne CDN funktioniert. Das Modul wird erst beim ersten PDF geladen, damit
 * die 1,6 MB niemanden belasten, der nur Bilder benutzt.
 */

const PDF_LIB_URL = new URL('../vendor/pdfjs/pdf.min.mjs', import.meta.url).href;
const PDF_WORKER_URL = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

/** Längste Kante der gerenderten Seite in Pixeln. */
const MAX_EDGE_PX = 2200;

let libPromise = null;

async function loadLibrary() {
  if (!libPromise) {
    libPromise = import(PDF_LIB_URL).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      return lib;
    });
  }
  return libPromise;
}

export function isPdfFile(file) {
  if (!file) return false;
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
}

/**
 * Öffnet ein PDF und liefert ein Handle mit Seitenzahl und Render-Funktion.
 * Das Dokument bleibt geöffnet, damit ein Seitenwechsel die Datei nicht erneut
 * einlesen muss.
 */
export async function openPdf(file) {
  const lib = await loadLibrary();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data }).promise;

  return {
    pageCount: doc.numPages,
    name: file.name,
    async renderPage(pageNumber) {
      const clamped = Math.min(Math.max(1, Math.round(pageNumber) || 1), doc.numPages);
      const page = await doc.getPage(clamped);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(MAX_EDGE_PX / Math.max(base.width, base.height), 4);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const context = canvas.getContext('2d');

      // PDF-Seiten haben oft keinen eigenen Hintergrund. Ohne die weiße Fläche
      // wäre der Referenzlayer im dunklen Theme kaum lesbar.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: context, viewport }).promise;
      page.cleanup();
      return canvas.toDataURL('image/png');
    },
    destroy() {
      doc.destroy();
    },
  };
}
