export const PANEL_SECTION_IDS = [
  'panel-topo',
  'panel-segments',
  'panel-photo',
  'panel-ai',
  'panel-selection',
  'panel-symbols',
  'panel-validation',
];

export const PANEL_STORAGE_KEY = 'canyon-topo-generator/panels/v1';

export function initPanelSections(root = document) {
  const sections = PANEL_SECTION_IDS.map((id) => root.getElementById(id));
  let saved = {};
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (raw !== null) {
      saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
        throw new TypeError('Ungültige Seitenleisten-Einstellungen');
      }
    }
  } catch (error) {
    console.warn('Seitenleisten-Zustand konnte nicht geladen werden.', error);
    saved = {};
  }

  for (const section of sections) {
    if (typeof saved[section.id] === 'boolean') {
      section.open = saved[section.id];
    }
    section.addEventListener('toggle', () => {
      try {
        localStorage.setItem(
          PANEL_STORAGE_KEY,
          JSON.stringify(Object.fromEntries(sections.map((node) => [node.id, node.open]))),
        );
      } catch (error) {
        console.warn('Seitenleisten-Zustand konnte nicht gespeichert werden.', error);
      }
    });
  }
}
