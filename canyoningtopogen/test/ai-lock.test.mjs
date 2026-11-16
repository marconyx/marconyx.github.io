/**
 * Passwortsperre der AI-Erkennung:
 *   node test/ai-lock.test.mjs
 */
import assert from 'node:assert/strict';
import { AI_UNLOCK_KEY, initAiLock } from '../src/ai-lock.js';

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error.message}`);
    process.exitCode = 1;
  }
}

class Node {
  constructor() {
    this.listeners = {};
    this.open = false;
    this.hidden = false;
    this.value = '';
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  async fire(type, extra = {}) {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    for (const fn of this.listeners[type] || []) await fn(event);
    return event;
  }
  focus() {}
}

function setup({ open = false, stored = null } = {}) {
  const nodes = {
    'panel-ai': new Node(),
    'ai-lock-dialog': new Node(),
    'ai-lock-form': new Node(),
    'ai-lock-password': new Node(),
    'ai-lock-error': new Node(),
    'btn-ai-lock-cancel': new Node(),
  };
  const section = nodes['panel-ai'];
  section.open = open;
  const summary = { parentElement: section, closest: () => summary };
  const dialog = nodes['ai-lock-dialog'];
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  nodes['ai-lock-error'].hidden = true;
  const store = new Map(stored ? [[AI_UNLOCK_KEY, stored]] : []);
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const messages = [];
  initAiLock({
    root: { getElementById: (id) => nodes[id] },
    storage,
    onMessage: (key) => messages.push(key),
  });
  const submit = async (password) => {
    nodes['ai-lock-password'].value = password;
    await nodes['ai-lock-form'].fire('submit');
  };
  return { nodes, section, dialog, store, messages, submit, clickSummary: () => section.fire('click', { target: summary }) };
}

console.log('AI-Sperre Tests');

await test('gesperrt: Aufklappen fragt nach Passwort statt zu öffnen; gespeichertes Offen wird geschlossen', async () => {
  const { section, dialog, clickSummary } = setup({ open: true });
  assert.equal(section.open, false);
  const event = await clickSummary();
  assert.equal(event.defaultPrevented, true);
  assert.equal(section.open, false);
  assert.equal(dialog.open, true);
});

await test('gesperrt: anderweitiges Öffnen (toggle) wird zurückgenommen', async () => {
  const { section, dialog } = setup();
  section.open = true;
  await section.fire('toggle');
  assert.equal(section.open, false);
  assert.equal(dialog.open, true);
});

await test('falsches Passwort zeigt Fehler und bleibt gesperrt', async () => {
  const { section, dialog, store, nodes, submit, clickSummary } = setup();
  await clickSummary();
  await submit('B4CH4B');
  assert.equal(nodes['ai-lock-error'].hidden, false);
  assert.equal(dialog.open, true);
  assert.equal(section.open, false);
  assert.equal(store.has(AI_UNLOCK_KEY), false);
  await submit('');
  assert.equal(section.open, false);
});

await test('richtiges Passwort öffnet den Abschnitt und merkt die Freischaltung', async () => {
  const { section, dialog, store, messages, nodes, submit, clickSummary } = setup();
  await clickSummary();
  await submit('b4ch4b');
  assert.equal(section.open, true);
  assert.equal(dialog.open, false);
  assert.equal(nodes['ai-lock-password'].value, '');
  assert.equal(store.get(AI_UNLOCK_KEY), '1');
  assert.deepEqual(messages, ['status.ai_unlocked']);
  section.open = false;
  const event = await clickSummary();
  assert.equal(event.defaultPrevented, false, 'danach wieder frei klappbar');
});

await test('bereits freigeschaltete Sitzung fragt nicht und behält gespeichertes Offen', async () => {
  const { section, dialog, clickSummary } = setup({ open: true, stored: '1' });
  assert.equal(section.open, true);
  section.open = false;
  assert.equal((await clickSummary()).defaultPrevented, false);
  assert.equal(dialog.open, false);
});

await test('Abbrechen schliesst die Abfrage, Abschnitt bleibt zu', async () => {
  const { section, dialog, nodes, clickSummary } = setup();
  await clickSummary();
  nodes['ai-lock-password'].value = 'xyz';
  await nodes['btn-ai-lock-cancel'].fire('click');
  assert.equal(dialog.open, false);
  assert.equal(section.open, false);
  assert.equal(nodes['ai-lock-password'].value, '');
});

console.log(`\n${passed} Test(s) bestanden.`);
