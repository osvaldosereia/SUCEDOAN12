import { text, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, patchMug } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260830-admin-canecas-generator-library-v1';
const PAGE_SIZE = 4;
const state = {
  installed: false,
  loading: false,
  mugs: [],
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

function isModel(product = {}) {
  return product.modelo_caneca === true || product.modelo_publico === true;
}

function artOf(product = {}) {
  const candidates = [
    product.arte_horizontal,
    product.arte_personalizacao,
    product.arte_impressao?.url,
    product.art_source_public_url,
    product.url_arte,
    product.mockup_1,
    product.url_imagem,
    product.imagem_url,
    product.imagem,
  ];
  return candidates.map(text).find(value => /^https?:\/\//i.test(value)) || '';
}

function sorted(list) {
  return [...list].sort((a, b) => Number(b.last_update || 0) - Number(a.last_update || 0)
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
        <p>Mostra 4 por vez. As canecas já marcadas como modelo aparecem primeiro.</p>
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
  const image = artOf(product);
  return `<article class="mug-existing-card is-model" data-existing-mug="${esc(key)}">
    <div class="mug-existing-art">${image ? `<img src="${esc(image)}" alt="${esc(product.nome || 'Caneca')}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<div class="mug-existing-empty">Sem arte horizontal</div>'}<span class="mug-existing-model-badge">MODELO</span></div>
    <div class="mug-existing-card-body"><strong title="${esc(product.nome || 'Caneca')}">${esc(product.nome || 'Caneca')}</strong><small>${esc(product.codigo || product.sku || key)}</small></div>
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
  const models = sorted(state.mugs.filter(isModel));
  const others = sorted(state.mugs.filter(product => !isModel(product)));
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
  if (status) status.textContent = 'Carregando canecas…';
  try {
    state.mugs = await loadMugs({ force });
    renderLibrary();
  } catch (error) {
    if (status) status.textContent = `Erro ao carregar: ${error?.message || error}`;
    toast(`Biblioteca de canecas: ${error?.message || error}`, true);
  } finally {
    state.loading = false;
    renderLibrary();
  }
}

async function makeModel(key, button) {
  if (!key || state.marking.has(key)) return;
  const product = state.mugs.find(item => keyOf(item) === key);
  if (!product || isModel(product)) return;
  state.marking.add(key);
  if (button) { button.disabled = true; button.textContent = 'Marcando…'; }
  try {
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
    state.modelsVisible = Math.max(PAGE_SIZE, state.modelsVisible);
    renderLibrary();
    toast('Caneca marcada como modelo.');
  } catch (error) {
    toast(`Não foi possível marcar como modelo: ${error?.message || error}`, true);
  } finally {
    state.marking.delete(key);
    renderLibrary();
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
window.addEventListener('admin-canecas:mug-created', () => {
  state.modelsVisible = PAGE_SIZE;
  setTimeout(() => loadLibrary(true), 250);
});
window.addEventListener('admin-canecas:category-updated', () => setTimeout(() => loadLibrary(true), 250));

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(), { once: true });
else install();

export { BUILD, loadLibrary, makeModel, isModel };
