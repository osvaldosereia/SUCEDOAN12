import { FIREBASE_BASE, text, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, patchMug, invalidateMugs } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260903-admin-canecas-inline-category-v3-github-catalog';
const REF_PATH = 'canecas/integracoes/loja_integrada/catalog_refs';
const FALLBACK_LABELS = Object.freeze({
  padronizadas: 'Canecas Padronizadas',
  personalizaveis: 'Canecas Personalizáveis',
  empresas: 'Canecas para Empresas',
});

const state = { refs: null, refsAt: 0, installing: false, saving: new Set() };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const keyOf = p => text(p?.__key || p?.firebaseKey || p?.id);

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 6000 : 3000);
}

function installStyles() {
  if ($('#cfInlineCategoryStylesV3')) return;
  const style = document.createElement('style');
  style.id = 'cfInlineCategoryStylesV3';
  style.textContent = `
    .cf-mug-inline-category{display:grid;gap:4px;min-height:55px}
    .cf-mug-inline-category span{font-size:9px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#70766e}
    .cf-mug-inline-category select{width:100%;min-height:36px;padding:0 9px;border:1px solid #d9ddd6;border-radius:9px;background:#fff;color:#202320;font-size:11px;font-weight:750}
    .cf-mug-inline-category select:disabled{opacity:.55;cursor:wait}
    .cf-li-catalog-status{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;font-size:10px;color:#687068}
    .cf-li-catalog-status b{color:#176232}
    .cf-li-catalog-status[data-alert="1"] b{color:#8a4b00}
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

function categoryType(product = {}) {
  const direct = text(product.loja_integrada_categoria_tipo || product.loja_integrada?.categoria_tipo);
  return FALLBACK_LABELS[direct] ? direct : (product.personalizavel === true ? 'personalizaveis' : 'padronizadas');
}
function typeMapping(type) {
  const item = state.refs?.tipos?.[type];
  if (!item || item.resolvido === false || !text(item.resource_uri)) return null;
  return item;
}
function optionLabel(type) {
  const mapping = typeMapping(type);
  if (mapping) return mapping.nome || FALLBACK_LABELS[type];
  return `⚠ ${FALLBACK_LABELS[type]} · não localizada`;
}
function selectHtml(type) {
  return `<label class="cf-mug-inline-category"><span>Categoria Loja Integrada · GitHub</span><select data-grid-category>
    <option value="padronizadas" ${type === 'padronizadas' ? 'selected' : ''}>${optionLabel('padronizadas')}</option>
    <option value="personalizaveis" ${type === 'personalizaveis' ? 'selected' : ''}>${optionLabel('personalizaveis')}</option>
    <option value="empresas" ${type === 'empresas' ? 'selected' : ''}>${optionLabel('empresas')}</option>
  </select></label>`;
}

function installCatalogStatus() {
  const panel = $('#cfDualSyncPanel');
  if (!panel || $('#cfLiCatalogStatus', panel)) return;
  const unresolved = Object.keys(FALLBACK_LABELS).filter(type => !typeMapping(type));
  const el = document.createElement('div');
  el.id = 'cfLiCatalogStatus';
  el.className = 'cf-li-catalog-status';
  el.dataset.alert = unresolved.length ? '1' : '0';
  const total = Number(state.refs?.total_categorias || Object.keys(state.refs?.categorias || {}).length || 0);
  const updated = text(state.refs?.atualizado_em);
  const when = updated ? new Date(updated).toLocaleString('pt-BR') : 'aguardando primeira leitura';
  el.innerHTML = unresolved.length
    ? `<b>⚠ Catálogo LI via GitHub</b><span>${total} categorias · ${when} · ${unresolved.length} vínculo(s) precisa(m) revisão</span>`
    : `<b>✓ Catálogo LI via GitHub</b><span>${total} categorias · atualizado ${when} · Make não utilizado</span>`;
  panel.appendChild(el);
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
  const cards = $$('[data-grid-mug]', root);
  if (!root) return;
  state.installing = true;
  try {
    installStyles();
    await loadRefs();
    installCatalogStatus();
    if (!cards.length) return;
    const products = await loadMugs();
    const byKey = new Map(products.map(p => [keyOf(p), p]));

    for (const card of cards) {
      const key = text(card.dataset.gridMug);
      const product = byKey.get(key);
      const actions = $('.cf-mug-card-actions', card);
      if (!product || !actions) continue;

      const old = $('.cf-mug-inline-category', card);
      if (old) old.remove();
      actions.insertAdjacentHTML('beforebegin', selectHtml(categoryType(product)));
      const select = $('[data-grid-category]', card);
      if (select) bindSelect(key, select);
    }
  } finally {
    state.installing = false;
  }
}

async function saveCategory(key, select) {
  if (state.saving.has(key)) return;
  const type = text(select.value);
  if (!FALLBACK_LABELS[type]) return;
  state.saving.add(key);
  select.disabled = true;
  try {
    await loadRefs(true);
    const mapping = typeMapping(type);
    if (!mapping) {
      throw new Error(`O GitHub ainda não conseguiu identificar a categoria correspondente a “${FALLBACK_LABELS[type]}” na Loja Integrada.`);
    }
    const products = await loadMugs();
    const product = products.find(p => keyOf(p) === key);
    if (!product) throw new Error('Caneca não encontrada.');

    const li = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
    const linked = Boolean(text(li.produto_id));
    await patchMug(key, {
      loja_integrada_categoria_tipo: type,
      loja_integrada_categoria_nome: text(mapping.nome),
      loja_integrada_categoria_uri: text(mapping.resource_uri),
      loja_integrada: {
        ...li,
        categoria_tipo: type,
        categoria_nome: text(mapping.nome),
        categoria_uri: text(mapping.resource_uri),
        ...(linked ? { sync_status: 'pendente', sync_error: '', sync_via: 'github_actions' } : {}),
      },
      updated_at: nowIso(),
      last_update: Date.now(),
    });
    invalidateMugs('categoria loja integrada via github');
    toast(linked
      ? `Categoria definida como ${mapping.nome}. Atualização pela fila GitHub pendente.`
      : `Categoria definida como ${mapping.nome}.`);
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
