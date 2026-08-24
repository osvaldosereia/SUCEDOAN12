import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { ProductsModule } from './modules/products.js';
import { archiveProduct, loadProduct } from './services/firebase.js';

const BUILD = '20260824-mug-studio-gallery-v2';
const PAGE_SIZE = 6;
const CATEGORY_NAMES = ['Canecas de Porcelana', 'Canecas'];
let loading = false;
let deleting = false;
let refreshTimer = null;
let observedStatus = null;
let galleryProducts = [];
let currentPage = 0;

function text(value) {
  return String(value ?? '').trim();
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
  const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
  const order = encodeURIComponent('"categoria"');
  const equal = encodeURIComponent(JSON.stringify(category));
  const url = `${base}/${node}.json?orderBy=${order}&equalTo=${equal}&_=${Date.now()}`;
  const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status} ao consultar ${category}.`);
  return normalizeCollection(await response.json());
}

async function fetchCanecas() {
  const config = loadConfig();
  const base = text(config.firebaseUrl || DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/, '');
  const node = text(config.productsNode || DEFAULT_CONFIG.productsNode || 'produtos').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '');

  const results = await Promise.allSettled(CATEGORY_NAMES.map(category => fetchCategory(base, node, category)));
  const merged = new Map();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const product of result.value) merged.set(productKey(product), product);
  }
  if (merged.size) return [...merged.values()].sort((a, b) => timestamp(b) - timestamp(a) || text(a.nome).localeCompare(text(b.nome), 'pt-BR'));

  const response = await fetch(`${base}/${node}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status}.`);
  return normalizeCollection(await response.json());
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
    section.className = 'panel mug-created-section';
    section.innerHTML = `
      <div class="mug-created-head">
        <div><span class="eyebrow">Cadastro de canecas</span><h2>Canecas criadas</h2><p>Mostrando apenas 6 por página para manter o Criador leve.</p></div>
        <div class="mug-created-actions"><span class="badge neutral" id="mugCreatedCount">0</span><button class="button secondary compact" id="mugCreatedRefresh" type="button">Atualizar</button></div>
      </div>
      <div class="mug-created-status muted" id="mugCreatedStatus">Carregando canecas…</div>
      <div class="mug-created-grid" id="mugCreatedCards"></div>
      <div class="mug-created-pager" id="mugCreatedPager" hidden>
        <button class="button secondary compact" type="button" data-mug-page="prev">Anterior</button>
        <span id="mugCreatedPageInfo">Página 1 de 1</span>
        <button class="button secondary compact" type="button" data-mug-page="next">Próxima</button>
      </div>`;
    view.appendChild(section);
    section.querySelector('#mugCreatedRefresh')?.addEventListener('click', () => {
      currentPage = 0;
      refresh(true);
    });
    section.addEventListener('click', event => {
      const editButton = event.target.closest('[data-edit-mug]');
      if (editButton) {
        const key = text(editButton.dataset.editMug);
        if (key) window.dispatchEvent(new CustomEvent('admin-v2-open-product', { detail: { key, source: 'mug-studio-gallery' } }));
        return;
      }

      const deleteButton = event.target.closest('[data-delete-mug]');
      if (deleteButton) {
        const key = text(deleteButton.dataset.deleteMug);
        if (key) deleteMug(key, deleteButton);
        return;
      }

      const pageButton = event.target.closest('[data-mug-page]');
      if (!pageButton) return;
      const totalPages = Math.max(1, Math.ceil(galleryProducts.length / PAGE_SIZE));
      if (pageButton.dataset.mugPage === 'prev') currentPage = Math.max(0, currentPage - 1);
      if (pageButton.dataset.mugPage === 'next') currentPage = Math.min(totalPages - 1, currentPage + 1);
      renderPage();
    });
  }

  const generator = document.getElementById('mugAutomationPanel');
  if (generator?.parentElement === view && generator.nextElementSibling !== section) generator.insertAdjacentElement('afterend', section);
  return section;
}

function renderPage() {
  const section = ensureShell();
  if (!section) return;
  const cards = section.querySelector('#mugCreatedCards');
  const count = section.querySelector('#mugCreatedCount');
  const status = section.querySelector('#mugCreatedStatus');
  const pager = section.querySelector('#mugCreatedPager');
  const pageInfo = section.querySelector('#mugCreatedPageInfo');
  const prev = section.querySelector('[data-mug-page="prev"]');
  const next = section.querySelector('[data-mug-page="next"]');
  const total = galleryProducts.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(Math.max(0, currentPage), totalPages - 1);
  const start = currentPage * PAGE_SIZE;
  const visible = galleryProducts.slice(start, start + PAGE_SIZE);

  if (count) count.textContent = String(total);
  if (status) {
    status.textContent = total
      ? `${total} caneca${total === 1 ? '' : 's'} cadastrada${total === 1 ? '' : 's'} · exibindo ${start + 1}–${Math.min(start + PAGE_SIZE, total)}.`
      : 'Nenhuma caneca cadastrada ainda.';
  }
  if (pager) pager.hidden = total <= PAGE_SIZE;
  if (pageInfo) pageInfo.textContent = `Página ${currentPage + 1} de ${totalPages}`;
  if (prev) prev.disabled = currentPage <= 0;
  if (next) next.disabled = currentPage >= totalPages - 1;
  if (!cards) return;

  cards.innerHTML = visible.length ? visible.map(product => {
    const key = productKey(product);
    const active = text(product.situacao).toUpperCase() !== 'I' && product.ativo !== false;
    return `<article class="mug-created-card">
      <div class="mug-created-image"><img loading="lazy" decoding="async" src="${escapeHtml(productImage(product))}" alt="${escapeHtml(product.nome || 'Caneca')}"><span class="mug-created-state ${active ? 'active' : 'inactive'}" title="${active ? 'Ativa' : 'Inativa'}"></span></div>
      <div class="mug-created-info"><strong title="${escapeHtml(product.nome || key)}">${escapeHtml(product.nome || 'Caneca')}</strong><small>${escapeHtml(product.subcategoria || product.codigo || '')}</small></div>
      <div class="mug-created-card-actions">
        <button class="button primary compact mug-created-edit" type="button" data-edit-mug="${escapeHtml(key)}">Editar</button>
        <button class="button secondary compact mug-created-delete" type="button" data-delete-mug="${escapeHtml(key)}">Apagar</button>
      </div>
    </article>`;
  }).join('') : '<div class="mug-created-empty">As canecas criadas aparecerão aqui automaticamente.</div>';
}

function render(products) {
  galleryProducts = Array.isArray(products) ? products : [];
  const totalPages = Math.max(1, Math.ceil(galleryProducts.length / PAGE_SIZE));
  if (currentPage >= totalPages) currentPage = totalPages - 1;
  renderPage();
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
    await archiveProduct(loadConfig(), key, {
      reason: 'Apagada pelo Criador de Canecas',
      source: 'mug-studio-gallery',
    });
    galleryProducts = galleryProducts.filter(item => productKey(item) !== key);
    const totalPages = Math.max(1, Math.ceil(galleryProducts.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages - 1);
    renderPage();
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
  if (status) status.textContent = 'Atualizando canecas…';
  if (button) button.disabled = true;
  try {
    render(await fetchCanecas());
  } catch (error) {
    if (status) status.textContent = `Não foi possível carregar as canecas: ${error?.message || error}`;
  } finally {
    loading = false;
    if (button) button.disabled = false;
  }
}

function scheduleRefresh(delay = 250) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    currentPage = 0;
    refresh(true);
  }, delay);
}

function observeGeneratorCompletion() {
  const status = document.getElementById('mugAutomationStatus');
  if (!status || status === observedStatus) return;
  observedStatus = status;
  const observer = new MutationObserver(() => {
    if (/conclu[ií]do|produto salvo como inativo/i.test(status.textContent || '')) scheduleRefresh(350);
  });
  observer.observe(status, { childList: true, characterData: true, subtree: true });
}

function installStyle() {
  if (document.getElementById('mugStudioGalleryStyle')) return;
  const style = document.createElement('style');
  style.id = 'mugStudioGalleryStyle';
  style.textContent = `
    .mug-created-section{margin-top:16px}.mug-created-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.mug-created-head h2{margin:3px 0 4px}.mug-created-head p{margin:0;color:#747970}.mug-created-actions{display:flex;align-items:center;gap:8px}.mug-created-grid{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:12px;margin-top:12px}.mug-created-card{min-width:0;border:1px solid #e3e5df;border-radius:14px;padding:8px;background:#fff;display:grid;gap:7px}.mug-created-image{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;background:#f6f6f3}.mug-created-image img{width:100%;height:100%;object-fit:contain;display:block}.mug-created-state{position:absolute;right:6px;top:6px;width:9px;height:9px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.18)}.mug-created-state.active{background:#2c9b54}.mug-created-state.inactive{background:#b9bdb5}.mug-created-info{min-width:0;display:grid;gap:2px}.mug-created-info strong,.mug-created-info small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mug-created-info strong{font-size:12px}.mug-created-info small{font-size:10px;color:#777}.mug-created-card-actions{display:grid;grid-template-columns:1fr 1fr;gap:5px}.mug-created-edit,.mug-created-delete{width:100%}.mug-created-delete{border-color:#e3b4b4!important;color:#a53232!important;background:#fff8f8!important}.mug-created-empty{grid-column:1/-1;padding:22px;text-align:center;color:#767a73;border:1px dashed #d8dbd3;border-radius:12px}.mug-created-pager{display:flex;justify-content:center;align-items:center;gap:10px;margin-top:12px}.mug-created-pager span{font-size:12px;font-weight:700;color:#666}
    @media(max-width:980px){.mug-created-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}}
    @media(max-width:600px){.mug-created-section{padding:10px}.mug-created-head{align-items:center}.mug-created-head p,.mug-created-head .eyebrow{display:none}.mug-created-head h2{font-size:15px;margin:0}.mug-created-actions .button{padding:5px 7px;font-size:9px}.mug-created-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.mug-created-card{padding:5px;border-radius:8px;gap:5px}.mug-created-image{border-radius:6px}.mug-created-state{width:7px;height:7px;right:3px;top:3px;border-width:1px}.mug-created-info strong{font-size:9px;line-height:1.15}.mug-created-info small{font-size:8px}.mug-created-edit,.mug-created-delete{min-height:25px;padding:3px 2px!important;font-size:8px!important;border-radius:6px!important}.mug-created-status,.mug-created-pager span{font-size:9px}}
  `;
  document.head.appendChild(style);
}

function activate() {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  ensureShell();
  observeGeneratorCompletion();
  refresh(true);
}

installEditorFallback();
installStyle();
window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') activate();
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') setTimeout(activate, 0);
});
window.addEventListener('admin-v2-products-invalidated', () => scheduleRefresh(500));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(activate, 0), { once: true });
else setTimeout(activate, 0);

export { fetchCanecas, refresh };
