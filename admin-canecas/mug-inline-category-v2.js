import { FIREBASE_BASE, text, norm, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, patchMug, invalidateMugs } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260831-admin-canecas-inline-category-v2';
const REF_PATH = 'canecas/integracoes/loja_integrada/catalog_refs';
const CATEGORY_NAMES = Object.freeze({
  padronizadas: 'Canecas Padronizadas',
  personalizaveis: 'Canecas Personalizáveis',
  empresas: 'Canecas para Empresas',
});

const state = { refs: null, installing: false, saving: new Set() };
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
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 5200 : 2600);
}

function installStyles() {
  if ($('#cfInlineCategoryStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfInlineCategoryStyles';
  style.textContent = `
    .cf-mug-inline-category{display:grid;gap:4px;min-height:55px}
    .cf-mug-inline-category span{font-size:9px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#70766e}
    .cf-mug-inline-category select{width:100%;min-height:36px;padding:0 9px;border:1px solid #d9ddd6;border-radius:9px;background:#fff;color:#202320;font-size:11px;font-weight:750}
    .cf-mug-inline-category select:disabled{opacity:.55;cursor:wait}
  `;
  document.head.appendChild(style);
}

async function loadRefs() {
  if (state.refs) return state.refs;
  const r = await fetch(`${FIREBASE_BASE}/${REF_PATH}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  state.refs = r.ok ? ((await r.json()) || {}) : {};
  return state.refs;
}

function categoryType(product = {}) {
  const direct = text(product.loja_integrada_categoria_tipo || product.loja_integrada?.categoria_tipo);
  return CATEGORY_NAMES[direct] ? direct : 'padronizadas';
}

function categoryUri(name) {
  const bucket = state.refs?.categorias;
  if (!bucket || typeof bucket !== 'object') return '';
  if (text(bucket[name])) return text(bucket[name]);
  const target = norm(name);
  for (const [key, value] of Object.entries(bucket)) if (norm(key) === target) return text(value);
  return '';
}

function selectHtml(type) {
  return `<label class="cf-mug-inline-category"><span>Categoria</span><select data-grid-category>
    <option value="padronizadas" ${type === 'padronizadas' ? 'selected' : ''}>Padronizada</option>
    <option value="personalizaveis" ${type === 'personalizaveis' ? 'selected' : ''}>Personalizada</option>
    <option value="empresas" ${type === 'empresas' ? 'selected' : ''}>Empresa</option>
  </select></label>`;
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
  if (!root || !cards.length) return;
  state.installing = true;
  try {
    installStyles();
    const products = await loadMugs();
    const byKey = new Map(products.map(p => [keyOf(p), p]));

    // Insere em uma única passagem: todos os cards mudam juntos, sem cascata visual.
    for (const card of cards) {
      const key = text(card.dataset.gridMug);
      const product = byKey.get(key);
      const actions = $('.cf-mug-card-actions', card);
      if (!product || !actions) continue;

      let label = $('.cf-mug-inline-category', card);
      if (!label) {
        actions.insertAdjacentHTML('beforebegin', selectHtml(categoryType(product)));
        label = $('.cf-mug-inline-category', card);
      }
      const select = $('[data-grid-category]', label);
      if (select) {
        select.value = categoryType(product);
        bindSelect(key, select);
      }
    }
  } finally {
    state.installing = false;
  }
}

async function saveCategory(key, select) {
  if (state.saving.has(key)) return;
  const type = text(select.value);
  if (!CATEGORY_NAMES[type]) return;
  state.saving.add(key);
  select.disabled = true;
  try {
    const products = await loadMugs();
    const product = products.find(p => keyOf(p) === key);
    if (!product) throw new Error('Caneca não encontrada.');
    await loadRefs();

    const li = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
    const name = CATEGORY_NAMES[type];
    const uri = categoryUri(name);
    const linked = Boolean(text(li.produto_id));
    await patchMug(key, {
      loja_integrada_categoria_tipo: type,
      loja_integrada_categoria_uri: uri,
      loja_integrada: {
        ...li,
        categoria_tipo: type,
        categoria_nome: name,
        categoria_uri: uri,
        ...(linked ? { sync_status: 'pendente', sync_error: '' } : {}),
      },
      updated_at: nowIso(),
      last_update: Date.now(),
    });
    invalidateMugs('categoria rápida');
    toast(linked
      ? `Categoria alterada para ${select.options[select.selectedIndex].text}. Sincronização CanecaFácil pendente.`
      : `Categoria alterada para ${select.options[select.selectedIndex].text}.`);
  } catch (error) {
    toast(`Categoria: ${error?.message || error}`, true);
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

document.documentElement.dataset.cfInlineCategory = BUILD;
export { BUILD, installAll };
