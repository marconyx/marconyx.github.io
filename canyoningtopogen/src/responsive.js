/**
 * Responsive Bedienung für schmale Bildschirme (Smartphone):
 *  - Ansichtsumschaltung „Bearbeiten | Topo | Symbole“ als zugängliche Tabs
 *  - Menü-Knopf, der die Toolbar-Gruppen ein- und ausblendet
 *  - Neu- und Speichern-Popover mit den bestehenden Aktionen auf allen Breiten
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

/**
 * Verdrahtet die mobile Ansichtsleiste, Toolbar und Aktions-Popover.
 *
 * Die Tab-Rollen werden nur am Smartphone gesetzt, weil Desktop alle drei
 * Bereiche gleichzeitig zeigt. Die Rückgabe erlaubt dem Editor, die aktuelle
 * Ansicht bei Bedarf gezielt auszuwählen.
 *
 * @param {{root?:Document|Element, win?:Window}} options DOM-Abhängigkeiten
 * @returns {{select: Function, setMenuOpen: Function, view: string}}
 */
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

  function bindActionPopover(buttonId, menuId, actionIds, { closeToolbar = false } = {}) {
    const button = root.getElementById(buttonId);
    const menu = root.getElementById(menuId);
    const actions = actionIds.map((id) => root.getElementById(id));
    button.setAttribute('aria-expanded', 'false');
    menu.addEventListener('beforetoggle', (event) => {
      if (event.newState === 'open' && closeToolbar) setMenuOpen(false);
    });
    menu.addEventListener('toggle', (event) => {
      const open = event.newState === 'open';
      button.setAttribute('aria-expanded', String(open));
      if (open) {
        const rect = button.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(rect.left, win.innerWidth - menu.offsetWidth - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, win.innerHeight - menu.offsetHeight - 8))}px`;
        actions[0].focus?.();
      }
    });
    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        menu.hidePopover();
        button.focus?.();
        return;
      }
      const index = actions.indexOf(event.target);
      let next = null;
      if (event.key === 'ArrowDown') next = (index + 1) % actions.length;
      else if (event.key === 'ArrowUp') next = (index - 1 + actions.length) % actions.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = actions.length - 1;
      if (next != null) {
        event.preventDefault();
        actions[next].focus?.();
      }
    });
    for (const action of actions) {
      action.addEventListener('click', () => {
        menu.hidePopover();
        button.focus?.();
      });
    }
    root.addEventListener?.('focusin', (event) => {
      if (menu.matches?.(':popover-open') && event.target !== button && !menu.contains(event.target)) {
        menu.hidePopover();
      }
    });
    win.addEventListener?.('resize', () => {
      if (menu.matches?.(':popover-open')) menu.hidePopover();
    });
  }

  bindActionPopover('btn-new', 'new-menu',
    ['btn-new-default', 'btn-new-empty', 'btn-example', 'btn-random', 'btn-open-file', 'btn-open-oc']);
  bindActionPopover('btn-save', 'save-menu',
    ['btn-save-json', 'btn-save-xml', 'btn-export-svg', 'btn-export-png', 'btn-export-shortlist', 'btn-print', 'btn-save-oc'],
    { closeToolbar: true });

  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    if (!open && root.getElementById('new-menu').matches?.(':popover-open')) {
      root.getElementById('new-menu').hidePopover();
    }
    setMenuOpen(open);
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
