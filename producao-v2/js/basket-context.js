import { resolveCollectionItem } from './core/collections.js';
import { productCode, productKey, productName, text } from './core/utils.js';

const context = {
  active: false,
  opening: false,
  refreshing: false,
  collectionScroll: 0,
  replaceScroll: 0,
  productKey: '',
  productName: '',
  returnFocus: null,
};

function toast(message, type = '') {
  const region = document.getElementById('toastRegion');
  const normalized = text(message);
  if (!region || !normalized) return;
  const duplicate = [...region.querySelectorAll('.toast')].some(node => node.textContent === normalized);
  if (duplicate) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = normalized;
  region.appendChild(node);
  setTimeout(() => node.remove(), type === 'error' ? 6500 : 3500);
}

function collectionModule() {
  return window.__adminV2CollectionsModule || null;
}

function collectionScrollHost() {
  return document.querySelector('#collectionEditor .editor-body');
}

function installStyles() {
  if (document.getElementById('basketContextStyles')) return;
  const style = document.createElement('style');
  style.id = 'basketContextStyles';
  style.textContent = `
    .collection-flow-tabs{position:sticky;top:-17px;z-index:8;display:flex;gap:5px;margin:-17px -17px 14px;padding:9px 14px;border-bottom:1px solid var(--line);background:rgba(250,251,249,.97);backdrop-filter:blur(10px)}
    .collection-flow-tabs button{min-height:34px;padding:0 11px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--muted);font-size:9px;font-weight:900;white-space:nowrap}
    .collection-flow-tabs button.active{border-color:var(--primary);background:var(--primary);color:#fff}
    .collection-flow-tabs button:disabled{opacity:.45}
    .editor-drawer.collection-product-context{z-index:112;width:min(790px,calc(100vw - 44px));box-shadow:-30px 0 90px rgba(15,19,16,.34)}
    .editor-drawer.collection-product-context .editor-header{border-bottom-color:#d8c891;background:#fffdf7}
    .editor-drawer.collection-product-context .editor-header .eyebrow{color:var(--info)}
    .mobile-overlay.collection-product-context-overlay{z-index:110;background:rgba(15,19,16,.56);backdrop-filter:blur(2px)}
    .collection-editor.context-paused{box-shadow:-20px 0 70px rgba(20,27,21,.25)}
    .collection-item-actions [data-collection-open-product]{border-color:#9fbad5;background:#f3f8fd;color:var(--info)}
    .make-automation-actions.unified{min-width:210px}
    .make-automation-actions.unified .button{width:100%;min-height:40px}
    @media(max-width:760px){
      .editor-drawer.collection-product-context{width:100%;max-width:none}
      .collection-flow-tabs{top:-13px;margin:-13px -13px 12px;padding-left:10px;padding-right:10px;overflow:auto}
    }
  `;
  document.head.appendChild(style);
}

function ensureFlowTabs() {
  const body = collectionScrollHost();
  if (!body || body.querySelector('.collection-flow-tabs')) return;
  const tabs = document.createElement('div');
  tabs.className = 'collection-flow-tabs';
  tabs.innerHTML = `
    <button type="button" class="active" data-collection-flow="basket">1. Cesta</button>
    <button type="button" data-collection-flow="search">2. Pesquisar / trocar</button>
    <button type="button" data-collection-flow="product" disabled>3. Ajustar produto</button>
  `;
  body.prepend(tabs);
  tabs.addEventListener('click', event => {
    const button = event.target.closest('[data-collection-flow]');
    if (!button) return;
    const flow = button.dataset.collectionFlow;
    if (flow === 'basket') {
      if (context.active) document.getElementById('closeEditorButton')?.click();
      requestAnimationFrame(() => { body.scrollTop = context.collectionScroll || 0; });
      setFlow('basket');
    }
    if (flow === 'search') {
      setFlow('search');
      document.querySelector('#collectionEditor .collection-product-search')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => document.getElementById('collectionProductSearch')?.focus(), 220);
    }
    if (flow === 'product' && context.active) document.getElementById('productEditor')?.focus?.({ preventScroll: true });
  });
}

function setFlow(flow, label = '') {
  ensureFlowTabs();
  const tabs = document.querySelector('.collection-flow-tabs');
  if (!tabs) return;
  tabs.querySelectorAll('[data-collection-flow]').forEach(button => button.classList.toggle('active', button.dataset.collectionFlow === flow));
  const productTab = tabs.querySelector('[data-collection-flow="product"]');
  if (productTab) {
    productTab.disabled = !context.active;
    productTab.textContent = context.active ? `3. ${label || context.productName || 'Ajustar produto'}` : '3. Ajustar produto';
  }
}

function simplifyMakePanel(root = document) {
  root.querySelectorAll('.make-automation-panel').forEach(panel => {
    const actions = panel.querySelector('.make-automation-actions');
    const original = actions?.querySelector('[data-make-product="full"]');
    if (!actions || !original || actions.dataset.unified === '1') return;
    const key = original.dataset.key || '';
    const button = document.createElement('button');
    button.className = 'button primary compact';
    button.type = 'button';
    button.dataset.makeProduct = 'full';
    button.dataset.key = key;
    button.textContent = 'Ajustar cadastro com IA';
    button.disabled = original.disabled;
    if (original.classList.contains('is-running')) button.classList.add('is-running');
    actions.replaceChildren(button);
    actions.dataset.unified = '1';
    const title = panel.querySelector('strong');
    const help = panel.querySelector('small');
    if (title) title.textContent = 'Ajuste geral por IA';
    if (help) help.textContent = 'Um único comando revisa nome, descrição, embalagem, tags, categoria, marca e demais textos do cadastro.';
  });
}

function enhanceCollectionButtons(root = document) {
  root.querySelectorAll('[data-collection-open-product]').forEach(button => {
    button.textContent = 'Ajustar produto';
    button.title = 'Abre o cadastro em uma aba sobre a cesta, sem perder sua posição.';
  });
  const help = document.querySelector('#collectionEditor .collection-section-head p');
  if (help) help.textContent = 'Troque itens ou ajuste o cadastro em abas, mantendo a cesta aberta e na mesma posição.';
}

function resetProductFilters() {
  const category = document.getElementById('categoryFilter');
  const status = document.getElementById('statusFilter');
  const quality = document.getElementById('qualityFilter');
  const sort = document.getElementById('sortFilter');
  if (category) category.value = '';
  if (status) status.value = '';
  if (quality) quality.value = '';
  if (sort) sort.value = 'name';
  category?.dispatchEvent(new Event('change', { bubbles: true }));
}

function findProductRow(key) {
  return [...document.querySelectorAll('[data-product-key]')]
    .find(button => String(button.dataset.productKey) === String(key)) || null;
}

function waitForProductRow(key, timeout = 3000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const row = findProductRow(key);
      if (row) return resolve(row);
      if (Date.now() - started >= timeout) return reject(new Error('O produto não apareceu na lista de edição. Atualize os dados e tente novamente.'));
      setTimeout(check, 60);
    };
    check();
  });
}

function decorateProductContext(product) {
  const editor = document.getElementById('productEditor');
  const overlay = document.getElementById('mobileOverlay');
  const collectionEditor = document.getElementById('collectionEditor');
  const close = document.getElementById('closeEditorButton');
  if (!editor || !overlay || !collectionEditor || !close) return;
  editor.classList.add('collection-product-context');
  overlay.classList.add('collection-product-context-overlay');
  collectionEditor.classList.add('context-paused');
  overlay.hidden = false;
  const eyebrow = editor.querySelector('.editor-header .eyebrow');
  if (eyebrow) {
    eyebrow.dataset.defaultText ||= eyebrow.textContent || 'Cadastro do produto';
    eyebrow.textContent = 'Produto da cesta · aba de correção';
  }
  close.dataset.defaultText ||= close.textContent || '×';
  close.textContent = '←';
  close.title = 'Voltar à cesta';
  close.setAttribute('aria-label', 'Voltar à cesta');
  context.active = true;
  context.productKey = productKey(product);
  context.productName = productName(product);
  setFlow('product', productName(product));
}

function cleanupProductContext() {
  if (!context.active) return;
  const editor = document.getElementById('productEditor');
  const overlay = document.getElementById('mobileOverlay');
  const collectionEditor = document.getElementById('collectionEditor');
  const close = document.getElementById('closeEditorButton');
  editor?.classList.remove('collection-product-context');
  overlay?.classList.remove('collection-product-context-overlay');
  collectionEditor?.classList.remove('context-paused');
  const eyebrow = editor?.querySelector('.editor-header .eyebrow');
  if (eyebrow?.dataset.defaultText) eyebrow.textContent = eyebrow.dataset.defaultText;
  if (close) {
    close.textContent = close.dataset.defaultText || '×';
    close.title = '';
    close.setAttribute('aria-label', 'Fechar editor');
  }
  context.active = false;
  context.productKey = '';
  context.productName = '';
  setFlow('basket');
  requestAnimationFrame(() => {
    const host = collectionScrollHost();
    if (host) host.scrollTop = context.collectionScroll;
    context.returnFocus?.focus?.({ preventScroll: true });
    context.returnFocus = null;
  });
}

async function openProductContext(product, sourceButton) {
  if (!product || context.opening) return;
  context.opening = true;
  const host = collectionScrollHost();
  context.collectionScroll = host?.scrollTop || 0;
  context.returnFocus = sourceButton || null;
  try {
    const key = productKey(product);
    resetProductFilters();
    const search = document.getElementById('productSearch');
    if (!search) throw new Error('A lista de produtos ainda não foi inicializada.');
    search.value = productCode(product) || key;
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const row = await waitForProductRow(key);
    row.click();
    requestAnimationFrame(() => decorateProductContext(product));
  } finally {
    context.opening = false;
  }
}

async function refreshCollectionAfterSave() {
  if (!context.active || context.refreshing) return;
  context.refreshing = true;
  const module = collectionModule();
  try {
    if (module?.onReload) await module.onReload();
    const host = collectionScrollHost();
    const top = context.collectionScroll;
    module?.renderItems?.();
    module?.renderAudit?.();
    document.getElementById('closeEditorButton')?.click();
    requestAnimationFrame(() => { if (host) host.scrollTop = top; });
    toast('Produto salvo. A cesta foi atualizada e permaneceu na mesma posição.', 'success');
  } catch (error) {
    toast(error?.message || String(error), 'error');
  } finally {
    context.refreshing = false;
  }
}

function productFromCollectionButton(button) {
  const module = collectionModule();
  const index = Number(button.dataset.collectionOpenProduct);
  const item = module?.draft?.produtos?.[index];
  if (!item) return null;
  const resolved = resolveCollectionItem(item, module.store?.state?.products || []);
  return resolved.product || module.findProduct?.(item.codigo) || null;
}

function installInteractionBridge() {
  document.addEventListener('click', event => {
    const open = event.target.closest('[data-collection-open-product]');
    if (open) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const product = productFromCollectionButton(open);
      if (!product) return toast('Produto não encontrado para ajuste.', 'error');
      openProductContext(product, open).catch(error => toast(error?.message || String(error), 'error'));
      return;
    }

    const host = collectionScrollHost();
    const replace = event.target.closest('[data-collection-replace-main], [data-collection-set-substitute]');
    if (replace) {
      context.replaceScroll = host?.scrollTop || 0;
      setTimeout(() => setFlow('search'), 0);
      return;
    }

    const selection = event.target.closest('[data-collection-add-product]');
    const cancel = event.target.closest('[data-collection-cancel-replace]');
    if (selection || cancel) {
      const restore = context.replaceScroll;
      setTimeout(() => {
        setFlow('basket');
        if (host) host.scrollTop = restore;
      }, 30);
      return;
    }

    if (context.active && (event.target.closest('#closeEditorButton') || event.target.closest('#mobileOverlay'))) {
      setTimeout(cleanupProductContext, 0);
    }
  }, true);
}

function installToastObserver() {
  const region = document.getElementById('toastRegion');
  if (!region || region.dataset.basketContextObserved === '1') return;
  region.dataset.basketContextObserved = '1';
  const observer = new MutationObserver(records => {
    if (!context.active) return;
    records.flatMap(record => [...record.addedNodes]).forEach(node => {
      if (!(node instanceof HTMLElement) || !node.classList.contains('toast') || !node.classList.contains('success')) return;
      if (/salvo com segurança/i.test(node.textContent || '')) refreshCollectionAfterSave();
    });
  });
  observer.observe(region, { childList: true });
}

let enhanceScheduled = false;
function scheduleEnhance() {
  if (enhanceScheduled) return;
  enhanceScheduled = true;
  requestAnimationFrame(() => {
    enhanceScheduled = false;
    installStyles();
    ensureFlowTabs();
    enhanceCollectionButtons();
    simplifyMakePanel();
    installToastObserver();
  });
}

installInteractionBridge();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true });
else scheduleEnhance();
new MutationObserver(scheduleEnhance).observe(document.documentElement, { childList: true, subtree: true });
