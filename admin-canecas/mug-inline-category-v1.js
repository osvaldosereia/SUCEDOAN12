(() => {
  'use strict';

  const BUILD = '20260829-admin-canecas-inline-category-v1.1';
  const FIREBASE_BASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const REF_PATH = 'canecas/integracoes/loja_integrada/catalog_refs';
  const CATEGORY_NAMES = Object.freeze({
    padronizadas: 'Canecas Padronizadas',
    personalizaveis: 'Canecas Personalizáveis',
    empresas: 'Canecas para Empresas'
  });
  const state = { refs: null, saving: new Set() };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const text = value => String(value ?? '').trim();
  const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

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
      .cf-mug-inline-category{display:grid;gap:4px}
      .cf-mug-inline-category span{font-size:9px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#70766e}
      .cf-mug-inline-category select{width:100%;min-height:36px;padding:0 9px;border:1px solid #d9ddd6;border-radius:9px;background:#fff;color:#202320;font-size:11px;font-weight:750}
      .cf-mug-inline-category select:disabled{opacity:.55;cursor:wait}
    `;
    document.head.appendChild(style);
  }

  async function getProduct(key) {
    const response = await fetch(`${FIREBASE_BASE}/produtos/${encodeURIComponent(key)}.json?_=${Date.now()}`, {
      cache: 'no-store', headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    const data = await response.json();
    return data ? { __key: key, ...data } : null;
  }

  async function patchProduct(key, patch) {
    const response = await fetch(`${FIREBASE_BASE}/produtos/${encodeURIComponent(key)}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
  }

  async function loadRefs() {
    if (state.refs) return state.refs;
    const response = await fetch(`${FIREBASE_BASE}/${REF_PATH}.json?_=${Date.now()}`, {
      cache: 'no-store', headers: { Accept: 'application/json' }
    });
    state.refs = response.ok ? ((await response.json()) || {}) : {};
    return state.refs;
  }

  function categoryType(product = {}) {
    const direct = text(product.loja_integrada_categoria_tipo || product.loja_integrada?.categoria_tipo);
    if (CATEGORY_NAMES[direct]) return direct;
    return 'padronizadas';
  }

  function categoryUri(name) {
    const bucket = state.refs?.categorias;
    if (!bucket || typeof bucket !== 'object') return '';
    if (text(bucket[name])) return text(bucket[name]);
    const target = norm(name);
    for (const [key, value] of Object.entries(bucket)) {
      if (norm(key) === target) return text(value);
    }
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

  async function installCard(card) {
    if (!card || ['1', 'loading'].includes(card.dataset.inlineCategoryReady)) return;
    const key = text(card.dataset.gridMug);
    if (!key) return;
    card.dataset.inlineCategoryReady = 'loading';
    try {
      const existing = $$('.cf-mug-inline-category', card);
      if (existing.length) {
        existing.slice(1).forEach(node => node.remove());
        bindSelect(key, $('[data-grid-category]', existing[0]));
        card.dataset.inlineCategoryReady = '1';
        return;
      }

      const product = await getProduct(key);
      if (!product) throw new Error('Caneca não encontrada.');
      const actions = $('.cf-mug-card-actions', card);
      if (!actions) throw new Error('Card ainda não está pronto.');
      actions.insertAdjacentHTML('beforebegin', selectHtml(categoryType(product)));
      const select = $('[data-grid-category]', card);
      bindSelect(key, select);
      card.dataset.inlineCategoryReady = '1';
    } catch (error) {
      card.dataset.inlineCategoryReady = '';
      console.warn('[Admin Canecas] categoria rápida:', error);
    }
  }

  async function saveCategory(key, select) {
    if (state.saving.has(key)) return;
    const type = text(select.value);
    if (!CATEGORY_NAMES[type]) return;
    state.saving.add(key);
    select.disabled = true;
    try {
      const [product] = await Promise.all([getProduct(key), loadRefs()]);
      if (!product) throw new Error('Caneca não encontrada.');
      const li = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
      const name = CATEGORY_NAMES[type];
      const uri = categoryUri(name);
      const linked = Boolean(text(li.produto_id));
      const nextLi = {
        ...li,
        categoria_tipo: type,
        categoria_nome: name,
        categoria_uri: uri,
        ...(linked ? { sync_status: 'pendente', sync_error: '' } : {})
      };
      await patchProduct(key, {
        loja_integrada_categoria_tipo: type,
        loja_integrada_categoria_uri: uri,
        loja_integrada: nextLi,
        updated_at: new Date().toISOString(),
        last_update: Date.now()
      });
      toast(linked
        ? `Categoria alterada para ${select.options[select.selectedIndex].text}. Sincronização Caneca Fácil pendente.`
        : `Categoria alterada para ${select.options[select.selectedIndex].text}.`);
      window.dispatchEvent(new CustomEvent('admin-canecas:category-updated', { detail: { key, type, linked, source: BUILD } }));
    } catch (error) {
      toast(`Categoria: ${error?.message || error}`, true);
      const product = await getProduct(key).catch(() => null);
      if (product) select.value = categoryType(product);
    } finally {
      state.saving.delete(key);
      select.disabled = false;
    }
  }

  function installAll() {
    installStyles();
    $$('[data-grid-mug]', $('#mugs')).forEach(card => installCard(card));
  }

  function scheduleInstall(attempt = 0) {
    if (!location.hash.includes('mugs')) return;
    installAll();
    const cards = $$('[data-grid-mug]', $('#mugs'));
    const pending = cards.length === 0 || cards.some(card => !['1', 'loading'].includes(card.dataset.inlineCategoryReady));
    if (pending && attempt < 35) setTimeout(() => scheduleInstall(attempt + 1), 140);
  }

  window.addEventListener('admin-canecas:route', event => {
    if (event.detail?.route === 'mugs') setTimeout(() => scheduleInstall(), 0);
  });
  document.addEventListener('click', event => {
    if (event.target.closest?.('#cfMugReload')) setTimeout(() => scheduleInstall(), 350);
  }, true);
  window.addEventListener('hashchange', () => {
    if (location.hash.includes('mugs')) setTimeout(() => scheduleInstall(), 0);
  });

  if (location.hash.includes('mugs')) scheduleInstall();
  document.documentElement.dataset.cfInlineCategory = BUILD;
})();
