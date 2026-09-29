/**
 * Export-Funktionen: SVG, PNG und Druck (PDF via Browser-Druckdialog).
 * Alles läuft clientseitig, es werden keine Daten hochgeladen.
 */

export function downloadText(filename, text, mimeType = 'text/plain') {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  downloadBlob(filename, blob);
}

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

/** Rastert ein SVG-Dokument über ein Offscreen-Canvas nach PNG. */
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
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
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
