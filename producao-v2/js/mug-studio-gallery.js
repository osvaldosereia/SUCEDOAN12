import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { ProductsModule } from './modules/products.js';
import { archiveProduct, loadProduct } from './services/firebase.js';

const BUILD = '20260825-mug-studio-gallery-v8';
const RECENT_LIMIT = 6;
const CATEGORY_QUERY_LIMIT = 12;
const CATEGORY_NAMES = ['Caneca de Porcelana', 'Canecas de Porcelana', 'Canecas'];
const MODELS_NODE = 'canecas/modelos_criacao';
const COMMANDS_NODE = 'canecas/comandos_criacao';
const SELECTED_KEY = 'da_admin_v2_mug_saved_commands_selected';
let loading = false;
let deleting = false;
let refreshTimer = null;
let galleryProducts = [];
let quickModels = [];
let pendingRecipe = null;
let commandCache = { at: 0, items: [] };

function text(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function firebaseBase() {
  return text(loadConfig().firebaseUrl || DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/, '');
}

function productsNode() {
  return text(loadConfig().productsNode || DEFAULT_CONFIG.productsNode || 'produtos')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.json$/i, '') || 'produtos';
}

function productKey(product = {}, fallback = '') {
  return text(product.firebaseKey || product.id || product.codigo || fallback);
}

function productImage(product = {}) {
  const images = [
    product.mockup_1,
    product.url_imagem,
    product.imagem_url,
    product.imagem,
    ...(Array.isArray(product.imagens_site) ? product.imagens_site : []),
    ...(Array.isArray(product.imagens) ? product.imagens : []),
  ];
  return images.map(text).find(Boolean) || '../site/img/logoantonia5.png';
}

function isMug(product = {}) {
  return normalize(product.categoria).includes('caneca')
    || normalize(product.tipo_produto).includes('caneca')
    || normalize(product.origem_cadastro).includes('caneca');
}

function timestamp(product = {}) {
  const numeric = Number(product.last_update || product.timestamp || 0);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(product.updated_at || product.criado_em || product.created_at || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCollection(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([key, value]) => ({ firebaseKey: productKey(value, key), ...value }))
    .filter(isMug)
    .sort((a, b) => timestamp(b) - timestamp(a) || text(a.nome).localeCompare(text(b.nome), 'pt-BR'));
}

async function fetchCategory(base, node, category) {
  const params = new URLSearchParams();
  params.set('orderBy', JSON.stringify('categoria'));
  params.set('equalTo', JSON.stringify(category));
  params.set('limitToLast', String(CATEGORY_QUERY_LIMIT));
  const response = await fetch(`${base}/${node}.json?${params.toString()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status} ao consultar ${category}.`);
  return normalizeCollection(await response.json());
}

async function fetchCanecas() {
  const base = firebaseBase();
  const node = productsNode();
  if (!base) throw new Error('Firebase não está configurado.');

  const results = await Promise.allSettled(CATEGORY_NAMES.map(category => fetchCategory(base, node, category)));
  const merged = new Map();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const product of result.value) merged.set(productKey(product), product);
  }
  if (merged.size) {
    return [...merged.values()]
      .sort((a, b) => timestamp(b) - timestamp(a) || text(a.nome).localeCompare(text(b.nome), 'pt-BR'))
      .slice(0, RECENT_LIMIT);
  }

  const response = await fetch(`${base}/${node}.json`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status}.`);
  return normalizeCollection(await response.json()).slice(0, RECENT_LIMIT);
}

function normalizeModels(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([key, value]) => ({
      id: text(value.id || key),
      product_key: text(value.product_key || value.firebaseKey || key),
      nome: text(value.nome || 'Modelo de caneca'),
      imagem: text(value.imagem),
      comandos_ids: Array.isArray(value.comandos_ids) ? value.comandos_ids.map(text).filter(Boolean) : [],
      instrucao_manual: text(value.instrucao_manual),
      instrucao_efetiva: text(value.instrucao_efetiva),
      atualizado_em: text(value.atualizado_em),
    }))
    .filter(model => model.product_key)
    .sort((a, b) => Date.parse(b.atualizado_em || '') - Date.parse(a.atualizado_em || '') || a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function fetchModels() {
  const base = firebaseBase();
  if (!base) return [];
  const response = await fetch(`${base}/${MODELS_NODE}.json`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status} ao carregar modelos.`);
  return normalizeModels(await response.json());
}

async function fetchCommands() {
  if (Date.now() - commandCache.at < 60000 && commandCache.items.length) return commandCache.items;
  const base = firebaseBase();
  if (!base) return [];
  const response = await fetch(`${base}/${COMMANDS_NODE}.json`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status} ao carregar comandos.`);
  const data = await response.json();
  const items = Object.entries(data || {})
    .filter(([, value]) => value && typeof value === 'object')
    .map(([key, value]) => ({ id: text(value.id || key), nome: text(value.nome), texto: text(value.texto) }))
    .filter(item => item.id && item.texto);
  commandCache = { at: Date.now(), items };
  return items;
}

function directCommandIds(product = {}) {
  const values = product.modelo_comandos_ids
    || product.configuracao_arte?.comandos_salvos_ids
    || product.configuracao_arte?.comandos_ids
    || [];
  return Array.isArray(values) ? [...new Set(values.map(text).filter(Boolean))] : [];
}

function extractManualInstruction(effective = '') {
  const raw = text(effective);
  if (!raw) return '';
  const marker = 'INSTRUÇÃO COMPLEMENTAR DIGITADA:';
  const index = raw.lastIndexOf(marker);
  if (index >= 0) return text(raw.slice(index + marker.length));
  return /COMANDO SALVO \d+/i.test(raw) ? '' : raw;
}

async function recipeFromProduct(product = {}) {
  const effective = text(product.configuracao_arte?.instrucao_complementar || product.modelo_instrucao_efetiva);
  let ids = directCommandIds(product);
  if (!ids.length && effective) {
    try {
      const commands = await fetchCommands();
      ids = commands.filter(command => effective.includes(command.texto)).map(command => command.id);
    } catch (error) {
      console.warn('Não foi possível inferir os comandos do modelo:', error);
    }
  }
  if (!ids.length) {
    const current = document.getElementById('mugAutomationPanel')?.__mugCommandState?.selected;
    if (current instanceof Set && current.size) ids = [...current].map(text).filter(Boolean);
  }
  const manual = text(product.configuracao_arte?.instrucao_manual || product.modelo_instrucao_manual) || extractManualInstruction(effective);
  return { ids: [...new Set(ids)], manual, effective };
}

function installEditorFallback() {
  const prototype = ProductsModule.prototype;
  if (prototype.__mugStudioDirectEditBuild === BUILD) return;
  prototype.__mugStudioDirectEditBuild = BUILD;
  const originalOpenEditor = prototype.openEditor;

  prototype.openEditor = function openEditorIncludingFreshMug(key) {
    const normalizedKey = text(key);
    if (!normalizedKey || this.store.getProduct(normalizedKey)) return originalOpenEditor.call(this, key);

    this.onToast?.('Carregando a caneca recém-criada…');
    return loadProduct(this.store.state.config, normalizedKey)
      .then(product => {
        if (!product) throw new Error('Caneca não encontrada no Firebase.');
        this.store.markProductSaved(normalizedKey, product, { emit: false });
        this.render();
        return originalOpenEditor.call(this, normalizedKey);
      })
      .catch(error => {
        console.error('Não foi possível abrir a caneca pelo Criador:', error);
        this.onToast?.(error?.message || String(error), 'error');
      });
  };
}

function ensureShell() {
  const view = document.querySelector('.view[data-view="mug-studio"]');
  if (!view) return null;
  let section = document.getElementById('mugStudioCreatedGrid');
  if (!section) {
    section = document.createElement('section');
    section.id = 'mugStudioCreatedGrid';
    section.className = 'panel mug-created-section mug-created-v8';
    section.innerHTML = `
      <div class="mug-created-head">
        <div><span class="eyebrow">Histórico rápido</span><h2>Últimas 6 canecas</h2><p>Somente as criações mais recentes para conferência, edição e definição de modelos.</p></div>
        <button class="button secondary compact" id="mugCreatedRefresh" type="button">Atualizar</button>
      </div>
      <div class="mug-created-status muted" id="mugCreatedStatus">Carregando as últimas canecas…</div>
      <div class="mug-created-grid" id="mugCreatedCards"></div>`;
    view.appendChild(section);
    section.querySelector('#mugCreatedRefresh')?.addEventListener('click', () => refresh(true));
    section.addEventListener('click', event => {
      const modelButton = event.target.closest('[data-toggle-mug-model]');
      if (modelButton) {
        const key = text(modelButton.dataset.toggleMugModel);
        if (key) toggleModel(key, modelButton);
        return;
      }
      const useButton = event.target.closest('[data-use-mug-model]');
      if (useButton) {
        const key = text(useButton.dataset.useMugModel);
        const model = quickModels.find(item => item.product_key === key);
        if (model) applyModel(model);
        return;
      }
      const editButton = event.target.closest('[data-edit-mug]');
      if (editButton) {
        const key = text(editButton.dataset.editMug);
        if (key) window.dispatchEvent(new CustomEvent('admin-v2-open-product', { detail: { key, source: 'mug-studio-gallery-v8' } }));
        return;
      }
      const deleteButton = event.target.closest('[data-delete-mug]');
      if (deleteButton) {
        const key = text(deleteButton.dataset.deleteMug);
        if (key) deleteMug(key, deleteButton);
      }
    });
  }

  const generator = document.getElementById('mugAutomationPanel');
  if (generator?.parentElement === view && generator.nextElementSibling !== section) generator.insertAdjacentElement('afterend', section);
  return section;
}

function ensureModelShelf() {
  const library = document.getElementById('mugCommandLibrary');
  if (!library) return null;
  let shelf = document.getElementById('mugQuickModels');
  if (!shelf) {
    shelf = document.createElement('section');
    shelf.id = 'mugQuickModels';
    shelf.className = 'mug-quick-models';
    const head = library.querySelector('.mug-command-head');
    if (head) head.insertAdjacentElement('afterend', shelf);
    else library.prepend(shelf);
    shelf.addEventListener('click', event => {
      const use = event.target.closest('[data-quick-model-use]');
      if (use) {
        const model = quickModels.find(item => item.product_key === text(use.dataset.quickModelUse));
        if (model) applyModel(model);
        return;
      }
      const remove = event.target.closest('[data-quick-model-remove]');
      if (remove) unmarkModel(text(remove.dataset.quickModelRemove), remove);
    });
  }
  return shelf;
}

function renderModels() {
  const shelf = ensureModelShelf();
  if (!shelf) return void setTimeout(() => {
    if (window.adminV2CurrentRoute?.() === 'mug-studio') renderModels();
  }, 120);
  shelf.innerHTML = `
    <div class="mug-model-head"><div><strong>Modelos rápidos</strong><small>Restaure os comandos usados em uma criação aprovada.</small></div><span>${quickModels.length}</span></div>
    <div class="mug-model-list">${quickModels.length ? quickModels.slice(0, 12).map(model => `
      <article class="mug-model-card">
        <img loading="lazy" decoding="async" src="${escapeHtml(model.imagem || '../site/img/logoantonia5.png')}" alt="${escapeHtml(model.nome)}">
        <div><strong title="${escapeHtml(model.nome)}">${escapeHtml(model.nome)}</strong><small>${model.comandos_ids.length} comando${model.comandos_ids.length === 1 ? '' : 's'} salvo${model.comandos_ids.length === 1 ? '' : 's'}</small></div>
        <button class="button primary compact" type="button" data-quick-model-use="${escapeHtml(model.product_key)}">Usar</button>
        <button class="mug-model-remove" type="button" title="Remover dos modelos" data-quick-model-remove="${escapeHtml(model.product_key)}">×</button>
      </article>`).join('') : '<div class="mug-model-empty">Marque uma das últimas canecas como <strong>Modelo</strong> para criar atalhos aqui.</div>'}</div>`;
}

function renderRecent() {
  const section = ensureShell();
  if (!section) return;
  const cards = section.querySelector('#mugCreatedCards');
  const status = section.querySelector('#mugCreatedStatus');
  if (status) status.textContent = galleryProducts.length
    ? `${galleryProducts.length} criação${galleryProducts.length === 1 ? '' : 'ões'} recente${galleryProducts.length === 1 ? '' : 's'} · sem paginação.`
    : 'Nenhuma caneca cadastrada ainda.';
  if (!cards) return;
  cards.innerHTML = galleryProducts.length ? galleryProducts.map(product => {
    const key = productKey(product);
    const active = text(product.situacao).toUpperCase() !== 'I' && product.ativo !== false;
    const model = quickModels.find(item => item.product_key === key);
    return `<article class="mug-created-card ${model ? 'is-model' : ''}">
      <div class="mug-created-image"><img loading="lazy" decoding="async" src="${escapeHtml(productImage(product))}" alt="${escapeHtml(product.nome || 'Caneca')}"><span class="mug-created-state ${active ? 'active' : 'inactive'}" title="${active ? 'Ativa' : 'Inativa'}"></span>${model ? '<span class="mug-created-model-badge">★ Modelo</span>' : ''}</div>
      <div class="mug-created-info"><strong title="${escapeHtml(product.nome || key)}">${escapeHtml(product.nome || 'Caneca')}</strong><small>${escapeHtml(product.subcategoria || product.codigo || '')}</small></div>
      <button class="button ${model ? 'primary' : 'secondary'} compact mug-created-model" type="button" data-toggle-mug-model="${escapeHtml(key)}">${model ? '★ Modelo salvo' : '☆ Marcar modelo'}</button>
      ${model ? `<button class="button secondary compact mug-created-use" type="button" data-use-mug-model="${escapeHtml(key)}">Usar modelo</button>` : ''}
      <div class="mug-created-card-actions">
        <button class="button secondary compact mug-created-edit" type="button" data-edit-mug="${escapeHtml(key)}">Editar</button>
        <button class="button secondary compact mug-created-delete" type="button" data-delete-mug="${escapeHtml(key)}">Apagar</button>
      </div>
    </article>`;
  }).join('') : '<div class="mug-created-empty">As 6 canecas mais recentes aparecerão aqui automaticamente.</div>';
}

function renderAll() {
  renderModels();
  renderRecent();
}

async function patchProductModel(key, patch) {
  const base = firebaseBase();
  const node = productsNode();
  const response = await fetch(`${base}/${node}/${encodeURIComponent(key)}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status} ao atualizar o produto.`);
}

async function saveModelRecord(product, recipe) {
  const base = firebaseBase();
  const key = productKey(product);
  const now = new Date().toISOString();
  const model = {
    id: key,
    product_key: key,
    nome: text(product.nome || 'Modelo de caneca'),
    imagem: productImage(product),
    comandos_ids: recipe.ids,
    instrucao_manual: recipe.manual,
    instrucao_efetiva: recipe.effective,
    atualizado_em: now,
  };
  const response = await fetch(`${base}/${MODELS_NODE}/${encodeURIComponent(key)}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(model),
  });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status} ao salvar o modelo.`);
  await patchProductModel(key, {
    modelo_caneca: true,
    modelo_comandos_ids: recipe.ids,
    modelo_instrucao_manual: recipe.manual,
    modelo_atualizado_em: now,
  });
  return model;
}

async function toggleModel(key, button) {
  if (quickModels.some(model => model.product_key === key)) return unmarkModel(key, button);
  const product = galleryProducts.find(item => productKey(item) === key);
  if (!product) return;
  const section = ensureShell();
  const status = section?.querySelector('#mugCreatedStatus');
  const old = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Salvando…'; }
  try {
    const recipe = await recipeFromProduct(product);
    const model = await saveModelRecord(product, recipe);
    quickModels = normalizeModels({ [key]: model, ...Object.fromEntries(quickModels.map(item => [item.product_key, item])) });
    if (status) status.textContent = recipe.ids.length
      ? `Modelo salvo com ${recipe.ids.length} comando${recipe.ids.length === 1 ? '' : 's'}.`
      : 'Modelo salvo. Esta criação não tinha comandos salvos identificáveis; a instrução complementar será reutilizada.';
    renderAll();
  } catch (error) {
    console.error('Não foi possível marcar modelo:', error);
    if (status) status.textContent = `Não foi possível salvar o modelo: ${error?.message || error}`;
  } finally {
    if (button?.isConnected) { button.disabled = false; button.textContent = old || '☆ Marcar modelo'; }
  }
}

async function unmarkModel(key, button) {
  const base = firebaseBase();
  if (!key || !base) return;
  if (button) button.disabled = true;
  try {
    const response = await fetch(`${base}/${MODELS_NODE}/${encodeURIComponent(key)}.json`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`Firebase retornou ${response.status} ao remover o modelo.`);
    await patchProductModel(key, { modelo_caneca: false, modelo_atualizado_em: new Date().toISOString() }).catch(() => {});
    quickModels = quickModels.filter(model => model.product_key !== key);
    renderAll();
  } catch (error) {
    const status = ensureShell()?.querySelector('#mugCreatedStatus');
    if (status) status.textContent = `Não foi possível remover o modelo: ${error?.message || error}`;
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

function applyModel(model) {
  const panel = document.getElementById('mugAutomationPanel');
  if (!panel) return;
  const ids = new Set((model.comandos_ids || []).map(text).filter(Boolean));
  if (panel.__mugCommandState) panel.__mugCommandState.selected = new Set(ids);
  localStorage.setItem(SELECTED_KEY, JSON.stringify([...ids]));
  const instruction = panel.querySelector('#mugv7Instruction');
  if (instruction) instruction.value = model.instrucao_manual || (!ids.size ? model.instrucao_efetiva : '');
  panel.querySelector('#mugCommandRefresh')?.click();
  const status = panel.querySelector('#mugAutomationStatus');
  if (status) status.textContent = `Modelo “${model.nome}” aplicado · ${ids.size} comando${ids.size === 1 ? '' : 's'} restaurado${ids.size === 1 ? '' : 's'}.`;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.dispatchEvent(new CustomEvent('mug-studio-model-applied', { detail: { model, commandIds: [...ids] } }));
}

async function deleteMug(key, button) {
  if (deleting) return;
  const product = galleryProducts.find(item => productKey(item) === key);
  const label = text(product?.nome || key);
  if (!window.confirm(`Apagar a caneca “${label}”?\n\nEla será removida do cadastro ativo e arquivada no Firebase.`)) return;

  deleting = true;
  if (button) button.disabled = true;
  const section = ensureShell();
  const status = section?.querySelector('#mugCreatedStatus');
  if (status) status.textContent = `Apagando ${label}…`;
  try {
    await archiveProduct(loadConfig(), key, { reason: 'Apagada pelo Criador de Canecas', source: 'mug-studio-gallery-v8' });
    const base = firebaseBase();
    if (base) await fetch(`${base}/${MODELS_NODE}/${encodeURIComponent(key)}.json`, { method: 'DELETE' }).catch(() => {});
    galleryProducts = galleryProducts.filter(item => productKey(item) !== key);
    quickModels = quickModels.filter(item => item.product_key !== key);
    renderAll();
  } catch (error) {
    console.error('Não foi possível apagar a caneca:', error);
    if (status) status.textContent = `Não foi possível apagar a caneca: ${error?.message || error}`;
  } finally {
    deleting = false;
    if (button?.isConnected) button.disabled = false;
  }
}

async function refresh(force = false) {
  if (loading) return;
  if (!force && window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  const section = ensureShell();
  if (!section) return;
  loading = true;
  const status = section.querySelector('#mugCreatedStatus');
  const button = section.querySelector('#mugCreatedRefresh');
  if (status) status.textContent = 'Atualizando últimas canecas e modelos…';
  if (button) button.disabled = true;
  try {
    const [mugsResult, modelsResult] = await Promise.allSettled([fetchCanecas(), fetchModels()]);
    if (mugsResult.status === 'fulfilled') galleryProducts = mugsResult.value.slice(0, RECENT_LIMIT);
    else throw mugsResult.reason;
    quickModels = modelsResult.status === 'fulfilled' ? modelsResult.value : quickModels;
    renderAll();
  } catch (error) {
    if (status) status.textContent = `Não foi possível carregar as canecas: ${error?.message || error}`;
  } finally {
    loading = false;
    if (button) button.disabled = false;
  }
}

function scheduleRefresh(delay = 250) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh(true), delay);
}

function captureGenerationRecipe() {
  const panel = document.getElementById('mugAutomationPanel');
  if (!panel) return;
  const selected = panel.__mugCommandState?.selected;
  pendingRecipe = {
    capturedAt: Date.now(),
    ids: selected instanceof Set ? [...selected].map(text).filter(Boolean) : [],
    manual: text(panel.querySelector('#mugv7Instruction')?.value),
  };
}

async function persistGenerationRecipe(key) {
  if (!pendingRecipe || !key || Date.now() - pendingRecipe.capturedAt > 15 * 60 * 1000) return;
  const recipe = pendingRecipe;
  pendingRecipe = null;
  try {
    await patchProductModel(key, {
      'configuracao_arte/comandos_salvos_ids': recipe.ids,
      'configuracao_arte/instrucao_manual': recipe.manual,
      'configuracao_arte/model_recipe_version': 'v8',
    });
  } catch (error) {
    console.warn('A caneca foi criada, mas não foi possível gravar a receita de comandos:', error);
  }
}

function installStyle() {
  if (document.getElementById('mugStudioGalleryStyle')) return;
  const style = document.createElement('style');
  style.id = 'mugStudioGalleryStyle';
  style.textContent = `
    .mug-created-section{margin-top:18px;padding:16px!important}.mug-created-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:8px}.mug-created-head h2{margin:3px 0 4px;font-size:19px}.mug-created-head p{margin:0;color:#747970;font-size:12px}.mug-created-status{font-size:11px;min-height:16px}.mug-created-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-top:10px}.mug-created-card{min-width:0;border:1px solid #e3e5df;border-radius:13px;padding:7px;background:#fff;display:grid;gap:6px;align-content:start}.mug-created-card.is-model{border-color:#b9a86f;box-shadow:0 0 0 1px #e7ddbd inset}.mug-created-image{position:relative;aspect-ratio:1;border-radius:9px;overflow:hidden;background:#f6f6f3}.mug-created-image img{width:100%;height:100%;object-fit:contain;display:block}.mug-created-state{position:absolute;right:6px;top:6px;width:9px;height:9px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.18)}.mug-created-state.active{background:#2c9b54}.mug-created-state.inactive{background:#b9bdb5}.mug-created-model-badge{position:absolute;left:5px;top:5px;background:#171817;color:#fff;border-radius:999px;padding:3px 6px;font-size:8px;font-weight:800}.mug-created-info{min-width:0;display:grid;gap:2px}.mug-created-info strong,.mug-created-info small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mug-created-info strong{font-size:11px;line-height:1.2}.mug-created-info small{font-size:9px;color:#777}.mug-created-model,.mug-created-use{width:100%;min-height:27px!important;padding:4px 5px!important;font-size:8.5px!important}.mug-created-card-actions{display:grid;grid-template-columns:1fr 1fr;gap:5px}.mug-created-edit,.mug-created-delete{width:100%;min-height:26px!important;padding:4px!important;font-size:8px!important}.mug-created-delete{border-color:#e3b4b4!important;color:#a53232!important;background:#fff8f8!important}.mug-created-empty{grid-column:1/-1;padding:22px;text-align:center;color:#767a73;border:1px dashed #d8dbd3;border-radius:12px}
    .mug-quick-models{display:grid;gap:7px;padding:9px;border:1px solid #e5e2d4;border-radius:11px;background:#fffdf6}.mug-model-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.mug-model-head>div{display:grid;gap:1px}.mug-model-head strong{font-size:12px}.mug-model-head small{font-size:9px;color:#747065}.mug-model-head>span{min-width:24px;text-align:center;padding:3px 6px;border-radius:999px;background:#f0ecdd;font-size:9px;font-weight:800}.mug-model-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.mug-model-card{position:relative;display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:6px;padding:5px;border:1px solid #e4e1d5;border-radius:8px;background:#fff;min-width:0}.mug-model-card img{width:38px;height:38px;border-radius:6px;object-fit:contain;background:#f7f7f4}.mug-model-card>div{min-width:0;display:grid;gap:2px}.mug-model-card strong,.mug-model-card small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mug-model-card strong{font-size:9.5px}.mug-model-card small{font-size:8px;color:#777}.mug-model-card .button{min-height:24px!important;padding:3px 6px!important;font-size:8px!important}.mug-model-remove{position:absolute;right:-4px;top:-5px;width:17px;height:17px;border:1px solid #ddd8c8;border-radius:50%;background:#fff;color:#8a8170;font-size:12px;line-height:13px;cursor:pointer}.mug-model-empty{grid-column:1/-1;padding:9px;border:1px dashed #ddd8c8;border-radius:8px;color:#777;font-size:9px;text-align:center}
    @media(max-width:1200px){.mug-created-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.mug-model-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:700px){.mug-created-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mug-model-list{grid-template-columns:1fr}.mug-created-head p,.mug-created-head .eyebrow{display:none}}
  `;
  document.head.appendChild(style);
}

function activate() {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  ensureShell();
  renderModels();
  refresh(true);
}

installEditorFallback();
installStyle();
document.addEventListener('click', event => {
  if (event.target.closest?.('#mugv7Generate')) captureGenerationRecipe();
}, true);
window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') activate();
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') setTimeout(activate, 0);
});
window.addEventListener('admin-v2-products-invalidated', async event => {
  const key = text(event.detail?.key);
  if (pendingRecipe && key) await persistGenerationRecipe(key);
  scheduleRefresh(400);
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(activate, 0), { once: true });
else setTimeout(activate, 0);

export { fetchCanecas, refresh, applyModel };
