/**
 * Responsive Bedienung für schmale Bildschirme (Smartphone):
 *  - Ansichtsumschaltung „Bearbeiten | Topo | Symbole“ als zugängliche Tabs
 *  - Menü-Knopf, der die Toolbar-Gruppen ein- und ausblendet
 * Ab Tablet-Breite blendet das CSS beides aus; dann gelten wieder alle
 * Bereiche gleichzeitig und die Tab-Rollen werden entfernt.
 */

export const MOBILE_QUERY = 'screen and (max-width: 767.98px)';

export const VIEWS = [
  { view: 'edit', tab: 'view-tab-edit', panel: 'panel-left' },
  { view: 'topo', tab: 'view-tab-topo', panel: 'canvas' },
  { view: 'symbols', tab: 'view-tab-symbols', panel: 'panel-right' },
];

export const DEFAULT_VIEW = 'topo';

export function initResponsive({ root = document, win = globalThis.window } = {}) {
  const workspace = root.getElementById('workspace');
  const entries = VIEWS.map((entry) => ({
    ...entry,
    tabNode: root.getElementById(entry.tab),
    panelNode: root.getElementById(entry.panel),
  }));
  const query = typeof win?.matchMedia === 'function' ? win.matchMedia(MOBILE_QUERY) : null;
  let current = DEFAULT_VIEW;

  function syncRoles() {
    const mobile = !!query?.matches;
    for (const { tab, panelNode } of entries) {
      if (mobile) {
        panelNode.setAttribute('role', 'tabpanel');
        panelNode.setAttribute('aria-labelledby', tab);
      } else {
        panelNode.removeAttribute?.('role');
        panelNode.removeAttribute?.('aria-labelledby');
      }
    }
  }

  function select(view, { focus = false } = {}) {
    if (!entries.some((entry) => entry.view === view)) return;
    current = view;
    workspace.dataset.view = view;
    for (const entry of entries) {
      const selected = entry.view === view;
      entry.tabNode.setAttribute('aria-selected', String(selected));
      entry.tabNode.tabIndex = selected ? 0 : -1;
      if (selected && focus) entry.tabNode.focus?.();
    }
  }

  entries.forEach((entry, index) => {
    entry.tabNode.addEventListener('click', () => select(entry.view));
    entry.tabNode.addEventListener('keydown', (event) => {
      let next = null;
      if (event.key === 'ArrowRight') next = (index + 1) % entries.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + entries.length) % entries.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = entries.length - 1;
      if (next === null) return;
      event.preventDefault();
      select(entries[next].view, { focus: true });
    });
  });

  const menuButton = root.getElementById('btn-menu');
  const toolbar = menuButton.closest?.('.toolbar') || null;

  function setMenuOpen(open) {
    menuButton.setAttribute('aria-expanded', String(open));
    toolbar?.classList.toggle('is-menu-open', open);
  }

  menuButton.addEventListener('click', () => {
    setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true');
  });
  toolbar?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || menuButton.getAttribute('aria-expanded') !== 'true') return;
    setMenuOpen(false);
    menuButton.focus?.();
  });

  query?.addEventListener?.('change', syncRoles);
  setMenuOpen(false);
  select(current);
  syncRoles();

  return {
    select,
    setMenuOpen,
    get view() {
      return current;
    },
  };
}
