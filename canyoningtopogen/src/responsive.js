/**
 * Responsive Bedienung für schmale Bildschirme (Smartphone):
 *  - Ansichtsumschaltung „Bearbeiten | Topo | Symbole“ als zugängliche Tabs
 *  - Menü-Knopf, der die Toolbar-Gruppen ein- und ausblendet
 *  - Speichern-Popover mit den bestehenden Exportaktionen auf allen Breiten
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

  const saveButton = root.getElementById('btn-save');
  const saveMenu = root.getElementById('save-menu');
  const saveActions = ['btn-save-json', 'btn-save-xml', 'btn-export-svg', 'btn-export-png', 'btn-export-shortlist', 'btn-print']
    .map((id) => root.getElementById(id));
  saveButton.setAttribute('aria-expanded', 'false');
  saveMenu.addEventListener('beforetoggle', (event) => {
    if (event.newState !== 'open') return;
    setMenuOpen(false);
  });
  saveMenu.addEventListener('toggle', (event) => {
    const open = event.newState === 'open';
    saveButton.setAttribute('aria-expanded', String(open));
    if (open) {
      const rect = saveButton.getBoundingClientRect();
      saveMenu.style.left = `${Math.max(8, Math.min(rect.left, win.innerWidth - saveMenu.offsetWidth - 8))}px`;
      saveMenu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, win.innerHeight - saveMenu.offsetHeight - 8))}px`;
      saveActions[0].focus?.();
    }
  });
  saveMenu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      saveMenu.hidePopover();
      saveButton.focus?.();
      return;
    }
    const index = saveActions.indexOf(event.target);
    let next = null;
    if (event.key === 'ArrowDown') next = (index + 1) % saveActions.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + saveActions.length) % saveActions.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = saveActions.length - 1;
    if (next != null) {
      event.preventDefault();
      saveActions[next].focus?.();
    }
  });
  for (const action of saveActions) {
    action.addEventListener('click', () => {
      saveMenu.hidePopover();
      saveButton.focus?.();
    });
  }
  root.addEventListener?.('focusin', (event) => {
    if (saveMenu.matches?.(':popover-open') && event.target !== saveButton && !saveMenu.contains(event.target)) {
      saveMenu.hidePopover();
    }
  });
  win.addEventListener?.('resize', () => {
    if (saveMenu.matches?.(':popover-open')) saveMenu.hidePopover();
  });

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
