import { FIREBASE_BASE, text, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, patchMug, invalidateMugs } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260903-admin-canecas-inline-category-v4-real-catalog';
const REF_PATH = 'canecas/integracoes/loja_integrada/catalog_refs';
const QUEUE_PATH = 'canecas/integracoes/loja_integrada/fila';
const LOGICAL_TYPES = ['padronizadas', 'personalizaveis', 'empresas'];
const state = { refs: null, refsAt: 0, installing: false, saving: new Set() };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const keyOf = p => text(p?.__key || p?.firebaseKey || p?.id);
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const esc = value => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 6000 : 3200);
}

function installStyles() {
  if ($('#cfInlineCategoryStylesV4')) return;
  const style = document.createElement('style');
  style.id = 'cfInlineCategoryStylesV4';
  style.textContent = `
    .cf-mug-inline-category{display:grid;gap:4px;min-height:55px}
    .cf-mug-inline-category span{font-size:9px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#70766e}
    .cf-mug-inline-category select{width:100%;min-height:36px;padding:0 9px;border:1px solid #d9ddd6;border-radius:9px;background:#fff;color:#202320;font-size:11px;font-weight:750}
    .cf-mug-inline-category select:disabled{opacity:.55;cursor:wait}
    .cf-li-catalog-status{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;font-size:10px;color:#687068}
    .cf-li-catalog-status b{color:#176232}.cf-li-catalog-status[data-alert="1"] b{color:#8a4b00}
  `;
  document.head.appendChild(style);
}

async function loadRefs(force = false) {
  if (!force && state.refs && Date.now() - state.refsAt < 120000) return state.refs;
  const r = await fetch(`${FIREBASE_BASE}/${REF_PATH}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  state.refs = r.ok ? ((await r.json()) || {}) : {};
  state.refsAt = Date.now();
  return state.refs;
}

function categoryId(value) {
  if (value && typeof value === 'object' && text(value.id)) return text(value.id);
  const uri = typeof value === 'object' ? text(value.resource_uri || value.uri) : text(value);
  return uri.match(/\/categoria\/(\d+)/i)?.[1] || '';
}
function sameCategory(a, b) {
  const x = categoryId(a), y = categoryId(b);
  if (x && y) return x === y;
  const ax = text(typeof a === 'object' ? a?.resource_uri : a).replace(/\/$/, '');
  const bx = text(typeof b === 'object' ? b?.resource_uri : b).replace(/\/$/, '');
  return Boolean(ax && bx && ax === bx);
}
function catalogCategories() {
  const list = Object.values(state.refs?.categorias_lista || {}).filter(Boolean);
  const raw = list.length
    ? list
    : Object.entries(state.refs?.categorias || {}).map(([nome, resource_uri]) => ({ nome, resource_uri, id: categoryId(resource_uri), ativo: true }));
  const seen = new Set();
  return raw.filter(item => {
    const uri = text(item?.resource_uri);
    const nome = text(item?.nome);
    const id = categoryId(item);
    const key = id || uri;
    if (!uri || !nome || item?.ativo === false || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function categoryByUri(uri) {
  return catalogCategories().find(item => sameCategory(item, uri)) || null;
}
function typeMapping(type) {
  const item = state.refs?.tipos?.[type];
  return item && item.resolvido !== false && text(item.resource_uri) ? item : null;
}
function storedCategory(product = {}) {
  const li = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
  return {
    uri: text(product.loja_integrada_categoria_uri || li.categoria_uri),
    nome: text(product.loja_integrada_categoria_nome || li.categoria_nome),
    tipo: text(product.loja_integrada_categoria_tipo || li.categoria_tipo),
  };
}
function fallbackType(product = {}) {
  const saved = storedCategory(product).tipo;
  if (LOGICAL_TYPES.includes(saved)) return saved;
  return product.personalizavel === true ? 'personalizaveis' : 'padronizadas';
}
function selectedCategory(product = {}) {
  const categories = catalogCategories();
  const saved = storedCategory(product);
  if (saved.uri) {
    const byUri = categories.find(item => sameCategory(item, saved.uri));
    if (byUri) return byUri;
  }
  if (saved.nome) {
    const matches = categories.filter(item => norm(item.nome) === norm(saved.nome));
    if (matches.length === 1) return matches[0];
  }
  const mapping = typeMapping(fallbackType(product));
  return mapping ? categoryByUri(mapping.resource_uri) || mapping : null;
}
function logicalTypeFor(category) {
  for (const type of LOGICAL_TYPES) {
    const mapping = typeMapping(type);
    if (mapping && sameCategory(mapping, category)) return type;
  }
  return 'catalogo';
}
function parentId(item) { return categoryId(item?.pai); }
function categoryDepth(item, byId, seen = new Set()) {
  const id = categoryId(item);
  if (!id || seen.has(id)) return 0;
  const pId = parentId(item);
  if (!pId || !byId.has(pId)) return 0;
  seen.add(id);
  return 1 + categoryDepth(byId.get(pId), byId, seen);
}
function categoryPath(item, byId, seen = new Set()) {
  const id = categoryId(item);
  if (!id || seen.has(id)) return [text(item.nome)];
  const pId = parentId(item);
  if (!pId || !byId.has(pId)) return [text(item.nome)];
  seen.add(id);
  return [...categoryPath(byId.get(pId), byId, seen), text(item.nome)];
}
function sortedCategories() {
  const categories = catalogCategories();
  const byId = new Map(categories.map(item => [categoryId(item), item]).filter(([id]) => id));
  return categories.map(item => ({
    ...item,
    _depth: categoryDepth(item, byId),
    _path: categoryPath(item, byId).map(norm).join(' / '),
  })).sort((a, b) => a._path.localeCompare(b._path, 'pt-BR'));
}
function selectHtml(product) {
  const selected = selectedCategory(product);
  const selectedId = categoryId(selected);
  const options = sortedCategories().map(item => {
    const prefix = item._depth ? `${'— '.repeat(Math.min(4, item._depth))}` : '';
    return `<option value="${esc(item.resource_uri)}" ${categoryId(item) === selectedId ? 'selected' : ''}>${esc(prefix + item.nome)}</option>`;
  }).join('');
  const empty = `<option value="" ${selectedId ? '' : 'selected'}>Selecione uma categoria da Loja Integrada</option>`;
  return `<label class="cf-mug-inline-category"><span>Categoria Loja Integrada · catálogo real</span><select data-grid-category>${empty}${options}</select></label>`;
}

function installCatalogStatus() {
  const panel = $('#cfDualSyncPanel');
  if (!panel || $('#cfLiCatalogStatus', panel)) return;
  const categories = catalogCategories();
  const el = document.createElement('div');
  el.id = 'cfLiCatalogStatus';
  el.className = 'cf-li-catalog-status';
  el.dataset.alert = categories.length ? '0' : '1';
  const updated = text(state.refs?.atualizado_em);
  const when = updated ? new Date(updated).toLocaleString('pt-BR') : 'aguardando leitura';
  el.innerHTML = categories.length
    ? `<b>✓ Catálogo LI automático · GitHub</b><span>${categories.length} categorias reais · atualizado ${when} · renomear/criar/excluir na Loja Integrada é refletido aqui</span>`
    : `<b>⚠ Catálogo LI indisponível</b><span>GitHub ainda não carregou as categorias da Loja Integrada.</span>`;
  panel.appendChild(el);
}

function queueKey(key) {
  const bytes = new TextEncoder().encode(text(key));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function enqueueCategorySync(key, product, at) {
  const qKey = queueKey(key);
  const body = {
    product_key: key,
    sku: text(product.codigo || product.sku),
    nome: text(product.nome),
    acao: 'sincronizar',
    status: 'pendente',
    solicitado_em: at,
    atualizado_em: at,
    solicitado_por: 'admin_categoria_catalogo_github',
    tentativas: 0,
  };
  const r = await fetch(`${FIREBASE_BASE}/${QUEUE_PATH}/${qKey}.json`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Não foi possível colocar a categoria na fila GitHub (${r.status}).`);
}

function bindSelect(key, select) {
  if (!select || select.dataset.categoryBound === '1') return;
  select.dataset.categoryBound = '1';
  select.addEventListener('click', event => event.stopPropagation());
  select.addEventListener('change', () => saveCategory(key, select));
}

async function installAll() {
  if (state.installing || !location.hash.includes('mugs')) return;
  const root = $('#mugs');
  if (!root) return;
  state.installing = true;
  try {
    installStyles();
    await loadRefs();
    installCatalogStatus();
    const cards = $$('[data-grid-mug]', root);
    if (!cards.length) return;
    const products = await loadMugs();
    const byKey = new Map(products.map(p => [keyOf(p), p]));
    for (const card of cards) {
      const key = text(card.dataset.gridMug);
      const product = byKey.get(key);
      const actions = $('.cf-mug-card-actions', card);
      if (!product || !actions) continue;
      $('.cf-mug-inline-category', card)?.remove();
      actions.insertAdjacentHTML('beforebegin', selectHtml(product));
      bindSelect(key, $('[data-grid-category]', card));
    }
  } finally {
    state.installing = false;
  }
}

async function saveCategory(key, select) {
  if (state.saving.has(key)) return;
  state.saving.add(key);
  select.disabled = true;
  try {
    await loadRefs(true);
    const category = categoryByUri(select.value);
    if (!category) throw new Error('Selecione uma categoria válida do catálogo atual da Loja Integrada.');
    const products = await loadMugs({ force: true });
    const product = products.find(p => keyOf(p) === key);
    if (!product) throw new Error('Caneca não encontrada.');
    const li = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
    const linked = Boolean(text(li.produto_id || product.loja_integrada_product_id));
    const type = logicalTypeFor(category);
    const at = nowIso();
    const id = categoryId(category);
    await patchMug(key, {
      loja_integrada_categoria_tipo: type,
      loja_integrada_categoria_id: id,
      loja_integrada_categoria_nome: text(category.nome),
      loja_integrada_categoria_uri: text(category.resource_uri),
      loja_integrada: {
        ...li,
        categoria_tipo: type,
        categoria_id: id,
        categoria_nome: text(category.nome),
        categoria_uri: text(category.resource_uri),
        categoria_origem: 'catalogo_real_github',
        ...(linked ? { sync_status: 'pendente', sync_error: '', sync_solicitado_em: at, sync_via: 'github_actions' } : {}),
      },
      updated_at: at,
      last_update: Date.now(),
    });
    if (linked) await enqueueCategorySync(key, product, at);
    invalidateMugs('categoria real loja integrada via github');
    toast(linked
      ? `Categoria: ${category.nome}. Atualização enviada para a fila GitHub.`
      : `Categoria definida como ${category.nome}.`);
  } catch (error) {
    toast(`Categoria Loja Integrada: ${error?.message || error}`, true);
  } finally {
    state.saving.delete(key);
    select.disabled = false;
  }
}

window.addEventListener('admin-canecas:mugs-stable-rendered', () => void installAll());
window.addEventListener('admin-canecas:route', event => {
  if (event.detail?.route === 'mugs') setTimeout(() => void installAll(), 120);
});
window.addEventListener('hashchange', () => {
  if (location.hash.includes('mugs')) setTimeout(() => void installAll(), 120);
});
document.addEventListener('DOMContentLoaded', () => setTimeout(() => void installAll(), 300));
setInterval(() => {
  if (!location.hash.includes('mugs')) return;
  state.refs = null;
  $('#cfLiCatalogStatus')?.remove();
  void installAll();
}, 180000);

document.documentElement.dataset.cfInlineCategory = BUILD;
export { BUILD, installAll, loadRefs };
