const BUILD = '20260903-admin-canecas-personalization-resilience-v1.1';
const MIN_OPEN_AGE = 900;
const REPAIR_COOLDOWN = 1400;
const $ = (selector, root = document) => root.querySelector(selector);
const text = value => String(value ?? '').trim();

const state = {
  key: '',
  openedAt: 0,
  repairing: false,
  lastRepairAt: 0,
  timer: 0,
  snapshot: null,
  observer: null,
};

function root() {
  return $('#drawerContent');
}

function drawerOpen() {
  const drawer = $('#drawer');
  return Boolean(drawer && (drawer.classList.contains('open') || drawer.getAttribute('aria-hidden') === 'false'));
}

function currentKey() {
  return text(root()?.dataset.productKey || state.key);
}

function section() {
  const node = root();
  return node ? $('#cfPersonalizationConfig', node) : null;
}

function readSnapshot(key = currentKey()) {
  const box = section();
  if (!box || !key) return null;
  const fields = {};
  for (const row of box.querySelectorAll('[data-cf-personal-field]')) {
    const id = text(row.dataset.cfPersonalField);
    if (!id) continue;
    fields[id] = {
      enabled: Boolean(row.querySelector('[data-enabled]')?.checked),
      required: Boolean(row.querySelector('[data-required]')?.checked),
      label: text(row.querySelector('[data-label]')?.value),
    };
  }
  return {
    key,
    active: $('#cfPersonalizationActive', box)?.value ?? '',
    required: $('#cfPersonalizationRequired', box)?.value ?? '',
    prompt: $('#cfPersonalizationPrompt', box)?.value ?? '',
    specific: $('#cfPersonalizationSpecific', box)?.value ?? '',
    correction: $('#cfPersonalizationAllowCorrection', box)?.value ?? '',
    fields,
  };
}

function restoreSnapshot() {
  const snap = state.snapshot;
  const key = currentKey();
  const box = section();
  if (!snap || snap.key !== key || !box) return;

  const setValue = (selector, value) => {
    const element = $(selector, box);
    if (!element || value === undefined || value === null || value === '') return;
    if (element.value !== String(value)) element.value = String(value);
  };

  setValue('#cfPersonalizationActive', snap.active);
  setValue('#cfPersonalizationRequired', snap.required);
  setValue('#cfPersonalizationPrompt', snap.prompt);
  setValue('#cfPersonalizationSpecific', snap.specific);
  setValue('#cfPersonalizationAllowCorrection', snap.correction);

  for (const [id, saved] of Object.entries(snap.fields || {})) {
    const row = [...box.querySelectorAll('[data-cf-personal-field]')]
      .find(item => text(item.dataset.cfPersonalField) === id);
    if (!row) continue;
    const enabled = row.querySelector('[data-enabled]');
    const required = row.querySelector('[data-required]');
    const label = row.querySelector('[data-label]');
    if (enabled) enabled.checked = saved.enabled === true;
    if (required) required.checked = saved.required === true;
    if (label && saved.label) label.value = saved.label;
  }

  $('#cfPersonalizationActive', box)?.dispatchEvent(new Event('change', { bubbles: true }));
  for (const row of box.querySelectorAll('[data-cf-personal-field]')) {
    row.querySelector('[data-enabled]')?.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function dispatchDrawerRepair(key, reason, clearStaleMarker = false) {
  const node = root();
  if (!node || node.dataset.productKey !== key || !drawerOpen()) return false;
  if (!document.documentElement.dataset.cfPersonalizationConfig) return false;

  const now = Date.now();
  if (state.repairing || now - state.lastRepairAt < REPAIR_COOLDOWN) return false;
  state.repairing = true;
  state.lastRepairAt = now;

  if (clearStaleMarker && node.dataset.cfPersonalizationInjected === key && !$('#cfPersonalizationConfig', node)) {
    delete node.dataset.cfPersonalizationInjected;
  }

  window.dispatchEvent(new CustomEvent('admin-canecas:drawer', {
    detail: { kind: 'mug', id: key, source: 'personalization-resilience', reason }
  }));

  setTimeout(() => {
    state.repairing = false;
    if (currentKey() !== key) return;
    if (section()) {
      restoreSnapshot();
      setTimeout(restoreSnapshot, 260);
    } else {
      schedule('retry', 100);
    }
  }, REPAIR_COOLDOWN);
  return true;
}

function check(reason = 'check') {
  clearTimeout(state.timer);
  state.timer = 0;
  const node = root();
  const key = currentKey();
  if (!node || !key || node.dataset.productKey !== key || !drawerOpen()) return;

  const age = Date.now() - state.openedAt;
  if (age < MIN_OPEN_AGE) {
    schedule(reason, MIN_OPEN_AGE - age + 40);
    return;
  }

  const box = section();
  if (box) {
    if (node.dataset.cfPersonalizationInjected !== key) node.dataset.cfPersonalizationInjected = key;
    restoreSnapshot();
    const correctionLoaded = Boolean(document.documentElement.dataset.cfPersonalizationCorrection);
    if (correctionLoaded && !$('#cfPersonalizationAllowCorrection', box)) {
      dispatchDrawerRepair(key, 'correction-field-missing', false);
    }
    return;
  }

  dispatchDrawerRepair(key, reason, true);
}

function schedule(reason = 'mutation', delay = 180) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => check(reason), delay);
}

function observeDrawer() {
  const node = root();
  if (!node || state.observer) return;

  state.observer = new MutationObserver(() => schedule('drawer-mutation', 220));
  state.observer.observe(node, { childList: true, subtree: false });

  const remember = event => {
    if (!event.target?.closest?.('#cfPersonalizationConfig')) return;
    const snap = readSnapshot();
    if (snap) state.snapshot = snap;
  };
  node.addEventListener('input', remember, true);
  node.addEventListener('change', remember, true);
}

window.addEventListener('admin-canecas:drawer', event => {
  const detail = event.detail || {};
  if (detail.kind !== 'mug' || !detail.id) return;
  const key = text(detail.id);
  if (detail.source !== 'personalization-resilience') {
    if (state.key !== key) state.snapshot = null;
    state.key = key;
    state.openedAt = Date.now();
    state.repairing = false;
    state.lastRepairAt = 0;
  }
  observeDrawer();
  schedule('drawer-open', detail.source === 'personalization-resilience' ? REPAIR_COOLDOWN : MIN_OPEN_AGE + 120);
});

window.addEventListener('admin-canecas:mugs-stable-rendered', () => schedule('stable-render', 260));
window.addEventListener('hashchange', () => {
  if (location.hash.includes('mugs')) schedule('hashchange', 500);
});

document.addEventListener('DOMContentLoaded', () => {
  observeDrawer();
  schedule('dom-ready', 1200);
});

observeDrawer();
document.documentElement.dataset.cfPersonalizationResilience = BUILD;
