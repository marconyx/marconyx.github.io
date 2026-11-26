/**
 * Export-Funktionen: SVG, PNG und Druck (PDF via Browser-Druckdialog).
 * Alles läuft clientseitig, es werden keine Daten hochgeladen.
 */

export function downloadText(filename, text, mimeType = 'text/plain') {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  downloadBlob(filename, blob);
}

/** Startet einen Browser-Download für einen Blob und widerruft seine URL danach. */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Erzeugt einen stabilen, diakritikfreien Dateinamensteil aus Nutzereingabe. */
export function slugify(value) {
  return (
    String(value || 'topo')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'topo'
  );
}

/**
 * Rastert ein SVG-Dokument über ein Offscreen-Canvas nach PNG.
 *
 * Die SVG-Pixelmasse wird aus den Root-Attributen gelesen; wenn sie fehlen,
 * gelten brauchbare Fallback-Masse. Der weisse Canvas-Hintergrund verhindert
 * transparente PNGs, die je nach Bildbetrachter schwarz erscheinen könnten.
 * Die temporäre Blob-URL wird nach Laden oder Bildfehler freigegeben; ein
 * fehlgeschlagenes Canvas-Encoding lehnt das Promise ab.
 * @param {string} svgText eigenständiges SVG-Markup
 * @param {number} [scale=2] Raster-Skalierungsfaktor
 * @returns {Promise<Blob>} PNG-Daten
 * @throws {Error} als Promise-Ablehnung bei Raster- oder Encodingfehlern
 */
export function svgToPngBlob(svgText, scale = 2) {
  return new Promise((resolve, reject) => {
    const widthMatch = /width="(\d+(?:\.\d+)?)"/.exec(svgText);
    const heightMatch = /height="(\d+(?:\.\d+)?)"/.exec(svgText);
    const width = widthMatch ? Number(widthMatch[1]) : 1600;
    const height = heightMatch ? Number(heightMatch[1]) : 1200;

    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG-Export fehlgeschlagen.'));
      }, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG konnte nicht gerastert werden.'));
    };
    image.src = url;
  });
}

/** Öffnet den Druckdialog mit nur dem Topo – dort lässt sich "Als PDF sichern" wählen. */
export function printSvg(svgText, title) {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  doc.open();
  // Der Titel stammt aus dem frei editierbaren Canyon-Namen und muss daher
  // escaped werden, sonst kann z. B. ein "<" das Druckdokument zerbrechen.
  const escapedTitle = String(title ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapedTitle}</title>
    <style>
      @page { margin: 8mm; }
      html, body { margin: 0; padding: 0; }
      svg { width: 100%; height: auto; }
    </style></head><body>${svgText}</body></html>`);
  doc.close();

  frame.contentWindow.focus();
  setTimeout(() => {
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1000);
  }, 250);
}
