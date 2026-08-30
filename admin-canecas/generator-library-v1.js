import { FIREBASE_BASE, text, safeKey, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, getMug, patchMug } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260830-admin-canecas-generator-library-v1.1';
const MODELS_NODE = 'canecas/modelos_criacao';
const PAGE_SIZE = 4;
const state = {
  installed: false,
  loading: false,
  mugs: [],
  modelRecords: [],
  modelsVisible: PAGE_SIZE,
  othersVisible: PAGE_SIZE,
  marking: new Set(),
};

const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

function keyOf(product = {}) {
  return text(product.firebaseKey || product.__key || product.id);
}

function productFlaggedAsModel(product = {}) {
  return product.modelo_caneca === true || product.modelo_publico === true;
}

function artOf(product = {}, model = null) {
  const candidates = [
    product.arte_horizontal,
    product.arte_personalizacao,
    product.arte_impressao?.url,
    product.art_source_public_url,
    product.url_arte,
    model?.arte_horizontal,
    model?.imagem,
    ...(Array.isArray(model?.mockups) ? model.mockups : []),
    model?.mockup_1,
    product.mockup_1,
    product.url_imagem,
    product.imagem_url,
    product.imagem,
  ];
  return candidates.map(text).find(value => /^https?:\/\//i.test(value)) || '';
}

function sorted(list) {
  return [...list].sort((a, b) => Number(b.last_update || b._sort || 0) - Number(a.last_update || a._sort || 0)
    || text(a.nome).localeCompare(text(b.nome), 'pt-BR', { sensitivity: 'base' }));
}

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 5200 : 2600);
}

async function fbJson(path, options = {}) {
  const write = Boolean(options.method);
  const response = await fetch(`${FIREBASE_BASE}/${path}.json${write ? '' : `?_=${Date.now()}`}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}

function normalizeModels(data) {
  return Object.entries(data || {})
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([id, value]) => ({
      ...value,
      id: text(value.id || id),
      product_key: text(value.product_key || value.firebaseKey || value.id || id),
      nome: text(value.nome || 'Modelo de caneca'),
      _sort: Date.parse(value.atualizado_em || value.criado_em || '') || 0,
    }))
    .filter(model => model.product_key);
}

async function loadModelRecords() {
  return normalizeModels(await fbJson(MODELS_NODE).catch(() => ({})));
}

function modelKeySet() {
  return new Set(state.modelRecords.map(model => model.product_key));
}

function mergedModels() {
  const products = new Map(state.mugs.map(product => [keyOf(product), product]));
  const merged = new Map();
  for (const model of state.modelRecords) {
    const product = products.get(model.product_key) || {};
    merged.set(model.product_key, {
      ...model,
      ...product,
      __modelRecord: model,
      __key: model.product_key,
      _sort: Math.max(Number(product.last_update || 0), Number(model._sort || 0)),
    });
  }
  for (const product of state.mugs) {
    const key = keyOf(product);
    if (productFlaggedAsModel(product) && !merged.has(key)) {
      merged.set(key, { ...product, __key: key, __modelRecord: null, _sort: Number(product.last_update || 0) });
    }
  }
  return sorted([...merged.values()]);
}

function existingNonModels() {
  const keys = new Set(mergedModels().map(keyOf));
  return sorted(state.mugs.filter(product => !keys.has(keyOf(product))));
}

function ensureSection() {
  const panel = $('#mugAutomationPanel');
  if (!panel) return false;
  let section = $('#mugExistingLibrary');
  if (section) return true;

  section = document.createElement('section');
  section.id = 'mugExistingLibrary';
  section.className = 'mug-existing-library';
  section.innerHTML = `
    <div class="mug-existing-library-head">
      <div>
        <span class="eyebrow">Biblioteca</span>
        <h2>Modelos e canecas existentes</h2>
        <p>Mostra 4 por vez. Os modelos salvos no Produção/Caneca10 aparecem primeiro.</p>
      </div>
      <button class="secondary" id="mugExistingRefresh" type="button">Atualizar</button>
    </div>
    <div class="mug-existing-status" id="mugExistingStatus">Carregando canecas…</div>
    <section class="mug-existing-group">
      <div class="mug-existing-group-head"><div><h3>Modelos</h3><small id="mugModelsCount">0</small></div></div>
      <div class="mug-existing-grid" id="mugModelsGrid"></div>
      <div class="mug-existing-more"><button class="secondary" id="mugModelsMore" type="button" hidden>Ver mais</button></div>
    </section>
    <section class="mug-existing-group">
      <div class="mug-existing-group-head"><div><h3>Canecas existentes</h3><small id="mugOthersCount">0</small></div></div>
      <div class="mug-existing-grid" id="mugOthersGrid"></div>
      <div class="mug-existing-more"><button class="secondary" id="mugOthersMore" type="button" hidden>Ver mais</button></div>
    </section>`;

  panel.appendChild(section);
  $('#mugExistingRefresh')?.addEventListener('click', () => loadLibrary(true));
  $('#mugModelsMore')?.addEventListener('click', () => {
    state.modelsVisible += PAGE_SIZE;
    renderLibrary();
  });
  $('#mugOthersMore')?.addEventListener('click', () => {
    state.othersVisible += PAGE_SIZE;
    renderLibrary();
  });
  section.addEventListener('click', event => {
    const button = event.target.closest('[data-make-model]');
    if (button) void makeModel(button.dataset.makeModel, button);
  });
  return true;
}

function modelCard(product) {
  const key = keyOf(product);
  const image = artOf(product, product.__modelRecord);
  const source = product.__modelRecord ? 'Modelo salvo' : 'Modelo do produto';
  return `<article class="mug-existing-card is-model" data-existing-mug="${esc(key)}">
    <div class="mug-existing-art">${image ? `<img src="${esc(image)}" alt="${esc(product.nome || 'Caneca')}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<div class="mug-existing-empty">Sem arte horizontal</div>'}<span class="mug-existing-model-badge">MODELO</span></div>
    <div class="mug-existing-card-body"><strong title="${esc(product.nome || 'Caneca')}">${esc(product.nome || 'Caneca')}</strong><small>${esc(product.codigo || product.sku || key)} · ${source}</small></div>
  </article>`;
}

function otherCard(product) {
  const key = keyOf(product);
  const image = artOf(product);
  const busy = state.marking.has(key);
  return `<article class="mug-existing-card" data-existing-mug="${esc(key)}">
    <div class="mug-existing-art">${image ? `<img src="${esc(image)}" alt="${esc(product.nome || 'Caneca')}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<div class="mug-existing-empty">Sem arte horizontal</div>'}</div>
    <div class="mug-existing-card-body"><strong title="${esc(product.nome || 'Caneca')}">${esc(product.nome || 'Caneca')}</strong><small>${esc(product.codigo || product.sku || key)}</small><button class="secondary mug-make-model" data-make-model="${esc(key)}" type="button" ${busy ? 'disabled' : ''}>${busy ? 'Marcando…' : 'Tornar modelo'}</button></div>
  </article>`;
}

function renderLibrary() {
  if (!ensureSection()) return;
  const models = mergedModels();
  const others = existingNonModels();
  const modelGrid = $('#mugModelsGrid');
  const othersGrid = $('#mugOthersGrid');

  if ($('#mugModelsCount')) $('#mugModelsCount').textContent = `${models.length} modelo${models.length === 1 ? '' : 's'}`;
  if ($('#mugOthersCount')) $('#mugOthersCount').textContent = `${others.length} caneca${others.length === 1 ? '' : 's'} fora dos modelos`;

  if (modelGrid) modelGrid.innerHTML = models.length
    ? models.slice(0, state.modelsVisible).map(modelCard).join('')
    : '<div class="notice mug-existing-empty-row">Nenhuma caneca marcada como modelo.</div>';

  if (othersGrid) othersGrid.innerHTML = others.length
    ? others.slice(0, state.othersVisible).map(otherCard).join('')
    : '<div class="notice mug-existing-empty-row">Todas as canecas exibidas já são modelos.</div>';

  const modelMore = $('#mugModelsMore');
  if (modelMore) modelMore.hidden = state.modelsVisible >= models.length;
  const othersMore = $('#mugOthersMore');
  if (othersMore) othersMore.hidden = state.othersVisible >= others.length;

  const status = $('#mugExistingStatus');
  if (status && !state.loading) status.textContent = `${models.length + others.length} caneca(s) carregadas · 4 por vez.`;
}

async function loadLibrary(force = false) {
  if (state.loading) return;
  if (!ensureSection()) return;
  state.loading = true;
  const status = $('#mugExistingStatus');
  if (status) status.textContent = 'Carregando canecas e modelos…';
  try {
    const [mugs, modelRecords] = await Promise.all([
      loadMugs({ force }),
      loadModelRecords(),
    ]);
    state.mugs = mugs;
    state.modelRecords = modelRecords;
  } catch (error) {
    if (status) status.textContent = `Erro ao carregar: ${error?.message || error}`;
    toast(`Biblioteca de canecas: ${error?.message || error}`, true);
  } finally {
    state.loading = false;
    renderLibrary();
  }
}

function modelRecipe(product = {}) {
  const ids = product.modelo_comandos_ids
    || product.configuracao_arte?.comandos_salvos_ids
    || product.configuracao_arte?.comandos_ids
    || product.configuracao_arte?.comandos
    || [];
  const commands = Array.isArray(ids) ? [...new Set(ids.map(text).filter(Boolean))] : [];
  const effective = text(product.modelo_instrucao_efetiva || product.configuracao_arte?.instrucao_complementar);
  const manual = text(product.modelo_instrucao_manual || product.configuracao_arte?.instrucao_manual);
  return { commands, effective, manual };
}

function buildModelRecord(product = {}) {
  const key = keyOf(product);
  const recipe = modelRecipe(product);
  const mockups = [product.mockup_1, product.mockup_2, product.mockup_3].map(text).filter(value => /^https?:\/\//i.test(value));
  const now = nowIso();
  return {
    id: key,
    product_key: key,
    nome: text(product.nome || 'Modelo de caneca'),
    arte_horizontal: text(product.arte_horizontal || product.arte_personalizacao || product.arte_impressao?.url),
    mockup_1: text(product.mockup_1),
    mockup_2: text(product.mockup_2),
    mockup_3: text(product.mockup_3),
    mockups,
    comandos_ids: recipe.commands,
    instrucao_manual: recipe.manual,
    instrucao_efetiva: recipe.effective,
    criado_em: now,
    atualizado_em: now,
    origem: BUILD,
  };
}

async function writeModelRecord(product) {
  const record = buildModelRecord(product);
  await fbJson(`${MODELS_NODE}/${safeKey(record.product_key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  return record;
}

async function makeModel(key, button) {
  if (!key || state.marking.has(key)) return;
  const product = state.mugs.find(item => keyOf(item) === key) || await getMug(key).catch(() => null);
  if (!product || modelKeySet().has(key)) return;
  state.marking.add(key);
  if (button) { button.disabled = true; button.textContent = 'Marcando…'; }
  let recordWritten = false;
  try {
    const record = await writeModelRecord(product);
    recordWritten = true;
    const now = nowIso();
    await patchMug(key, {
      modelo_caneca: true,
      modelo_marcado_em: now,
      modelo_marcado_origem: BUILD,
      updated_at: now,
      last_update: Date.now(),
    });
    product.modelo_caneca = true;
    product.modelo_marcado_em = now;
    product.modelo_marcado_origem = BUILD;
    product.last_update = Date.now();
    state.modelRecords = [record, ...state.modelRecords.filter(item => item.product_key !== key)];
    state.modelsVisible = Math.max(PAGE_SIZE, state.modelsVisible);
    renderLibrary();
    toast('Caneca marcada como modelo e salva na biblioteca de modelos.');
  } catch (error) {
    if (recordWritten) {
      await fbJson(`${MODELS_NODE}/${safeKey(key)}`, { method: 'DELETE' }).catch(() => null);
      state.modelRecords = state.modelRecords.filter(item => item.product_key !== key);
    }
    toast(`Não foi possível marcar como modelo: ${error?.message || error}`, true);
  } finally {
    state.marking.delete(key);
    renderLibrary();
  }
}

async function reconcileCreatedModel(key) {
  if (!key) return;
  const product = await getMug(key).catch(() => null);
  if (!product || !productFlaggedAsModel(product)) return;
  if (state.modelRecords.some(model => model.product_key === key)) return;
  try {
    const record = await writeModelRecord(product);
    state.modelRecords = [record, ...state.modelRecords.filter(item => item.product_key !== key)];
  } catch (error) {
    console.warn('[Gerador Admin Canecas] não foi possível registrar modelo recém-criado:', error);
  }
}

function install(attempt = 0) {
  if (ensureSection()) {
    if (!state.installed) {
      state.installed = true;
      document.documentElement.dataset.adminCanecasGeneratorLibrary = BUILD;
    }
    void loadLibrary(false);
    return;
  }
  if (attempt < 40) setTimeout(() => install(attempt + 1), 120);
}

document.addEventListener('click', event => {
  if (event.target.closest?.('#mugGeneratorNav')) setTimeout(() => {
    ensureSection();
    void loadLibrary(false);
  }, 0);
});
window.addEventListener('admin-canecas:mug-created', event => {
  state.modelsVisible = PAGE_SIZE;
  const key = text(event.detail?.key);
  setTimeout(async () => {
    await reconcileCreatedModel(key);
    await loadLibrary(true);
  }, 250);
});
window.addEventListener('admin-canecas:category-updated', () => setTimeout(() => loadLibrary(true), 250));

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(), { once: true });
else install();

export { BUILD, loadLibrary, makeModel, productFlaggedAsModel };
