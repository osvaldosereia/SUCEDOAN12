import { collectionSearch, resolveCollectionItem } from './core/collections.js';
import {
  escapeHtml, money, number, productCode, productImage, productKey, productName, text,
} from './core/utils.js';

const PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="#f1f2ef"/><text x="50%" y="53%" text-anchor="middle" fill="#899087" font-family="Arial" font-size="11">sem foto</text></svg>')}`;

function collectionModule() {
  return window.__adminV2CollectionsModule || null;
}

function allProducts() {
  return collectionModule()?.store?.state?.products || window.__adminV2OffersStore?.state?.products || [];
}

function findProduct(key) {
  const wanted = text(key);
  return allProducts().find(product => [
    productKey(product), productCode(product), product?.gtin, product?.ean, product?.sku,
  ].map(text).includes(wanted)) || null;
}

function installStyles() {
  if (document.getElementById('commerceEnhancementStyles')) return;
  const style = document.createElement('style');
  style.id = 'commerceEnhancementStyles';
  style.textContent = `
    .collection-search-top{position:sticky;top:38px;z-index:7;margin:10px 0 12px;padding:10px;border:1px solid #cbd7ca;border-radius:11px;background:rgba(255,255,255,.97);box-shadow:0 6px 18px rgba(24,32,25,.06);backdrop-filter:blur(10px)}
    .collection-search-top>label{font-size:9px!important}.collection-search-top>label::before{content:'Adicionar produto';display:block;margin-bottom:2px;color:var(--text);font-size:11px;font-weight:900}
    .collection-item-product{display:grid!important;grid-template-columns:64px minmax(0,1fr);column-gap:10px;align-items:center}
    .collection-item-photo{grid-row:1/6;width:64px;height:64px;object-fit:contain;border:1px solid var(--line);border-radius:10px;background:#fff;padding:4px}
    .collection-item-product>span,.collection-item-product>strong,.collection-item-product>small,.collection-item-product>.collection-item-badges,.collection-item-product>.collection-substitute-photos{grid-column:2}
    .collection-substitute-photos{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
    .collection-substitute-chip{display:flex;align-items:center;gap:5px;padding:4px 6px;border:1px solid var(--line);border-radius:8px;background:#fafbf9;color:var(--muted);font-size:8px}
    .collection-substitute-chip img{width:26px;height:26px;object-fit:contain;border-radius:6px;background:#fff}
    .inline-product-picker{grid-column:1/-1;margin-top:8px;padding:10px;border:1px solid #9fbad5;border-radius:11px;background:#f3f8fd}
    .inline-product-picker-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.inline-product-picker-head strong{font-size:11px}.inline-product-picker-head small{display:block;margin-top:2px;color:var(--muted);font-size:8px}
    .inline-product-picker input{width:100%;min-height:40px;padding:8px 10px;border:1px solid var(--line-strong);border-radius:9px;background:#fff;font-size:11px}
    .inline-product-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:7px;max-height:330px;overflow:auto}
    .inline-product-result{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:7px;align-items:center;padding:7px;border:1px solid var(--line);border-radius:9px;background:#fff;text-align:left}
    .inline-product-result.low-stock{border-color:#e4bc67;background:#fffaf0}.inline-product-result img{width:48px;height:48px;object-fit:contain;border-radius:7px;background:#fff}.inline-product-result strong,.inline-product-result small{display:block}.inline-product-result strong{font-size:10px}.inline-product-result small{margin-top:3px;color:var(--muted);font-size:8px}.inline-product-result b{font-size:9px;color:var(--info)}
    .visual-product-header{width:58px;height:58px;flex:0 0 58px;object-fit:contain;border:1px solid var(--line);border-radius:10px;background:#fff;padding:4px;order:-1}
    .offer-product-visual,.review-product-visual{display:flex;align-items:center;gap:8px}.offer-product-visual img,.review-product-visual img{width:44px;height:44px;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#fff;padding:3px}
    .quick-read-matches button{display:grid!important;grid-template-columns:46px minmax(0,1fr)!important;column-gap:8px!important;align-items:center!important}.quick-read-match-photo{grid-row:1/3;width:46px;height:46px;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#fff;padding:3px}.quick-read-matches button span,.quick-read-matches button small{grid-column:2}
    .collection-search-top [data-collection-add-product]{grid-template-columns:50px minmax(0,1fr) auto!important;align-items:center}.collection-search-photo{grid-row:1/3;width:50px;height:50px;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#fff;padding:3px}.collection-search-top [data-collection-add-product] strong,.collection-search-top [data-collection-add-product] small{grid-column:2!important}.collection-search-top [data-collection-add-product] span{grid-column:3!important}
    @media(max-width:760px){.inline-product-results{grid-template-columns:1fr}.collection-item-product{grid-template-columns:54px minmax(0,1fr)}.collection-item-photo{width:54px;height:54px}.collection-search-top{top:34px}}
  `;
  document.head.appendChild(style);
}

function moveCollectionSearchToTop() {
  const composition = document.querySelector('#collectionEditor .collection-composition');
  const heading = composition?.querySelector('.collection-section-head');
  const search = composition?.querySelector('.collection-product-search');
  if (!composition || !heading || !search) return;
  search.classList.add('collection-search-top');
  if (heading.nextElementSibling !== search) heading.insertAdjacentElement('afterend', search);
  const input = search.querySelector('#collectionProductSearch');
  if (input) input.placeholder = 'Digite nome, código ou EAN para adicionar';
}

function substitutePhotos(item) {
  const substitutes = Array.isArray(item?.substitutos) ? item.substitutos : [];
  if (!substitutes.length) return '';
  return substitutes.map((code, index) => {
    const product = findProduct(code);
    return `<span class="collection-substitute-chip"><img src="${escapeHtml(productImage(product || {}) || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'" alt=""><span>Subst. ${index + 1}: ${escapeHtml(product ? productName(product) : code)}</span></span>`;
  }).join('');
}

function enhanceCollectionItems() {
  const module = collectionModule();
  if (!module?.draft) return;
  document.querySelectorAll('#collectionItems .collection-item[data-collection-item]').forEach(row => {
    const index = Number(row.dataset.collectionItem);
    const item = module.draft?.produtos?.[index];
    if (!item) return;
    const resolved = resolveCollectionItem(item, module.store?.state?.products || []);
    const main = module.findProduct?.(item.codigo) || resolved.product;
    const active = resolved.product || main;
    const productBlock = row.querySelector('.collection-item-product');
    if (productBlock && !productBlock.querySelector('.collection-item-photo')) {
      productBlock.insertAdjacentHTML('afterbegin', `<img class="collection-item-photo" src="${escapeHtml(productImage(active || main || {}) || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'" alt="${escapeHtml(active ? productName(active) : 'Produto')}">`);
    }
    if (productBlock && !productBlock.querySelector('.collection-substitute-photos')) {
      const html = substitutePhotos(item);
      if (html) productBlock.insertAdjacentHTML('beforeend', `<div class="collection-substitute-photos">${html}</div>`);
    }
    const replace = row.querySelector('[data-collection-replace-main]');
    if (replace) {
      replace.textContent = 'Trocar aqui';
      replace.title = 'Pesquisa e troca neste mesmo item.';
    }
  });
}

function enhanceCollectionSearchResults() {
  document.querySelectorAll('#collectionSearchResults [data-collection-add-product]').forEach(button => {
    if (button.querySelector('.collection-search-photo')) return;
    const product = findProduct(button.dataset.collectionAddProduct);
    button.insertAdjacentHTML('afterbegin', `<img class="collection-search-photo" src="${escapeHtml(productImage(product || {}) || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'" alt="">`);
  });
}

function inlineResults(module, query, target) {
  const products = collectionSearch(module.store?.state?.products || [], query, 18);
  const label = target.mode === 'main' ? 'Trocar' : `Subst. ${target.slot + 1}`;
  return products.length ? products.map(product => {
    const stock = number(product.estoque);
    return `<button class="inline-product-result ${stock < 30 ? 'low-stock' : ''}" type="button" data-inline-product="${escapeHtml(productKey(product))}"><img src="${escapeHtml(productImage(product) || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'" alt=""><span><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(productCode(product) || productKey(product))} · estoque ${stock} · ${money(product.preco)}</small></span><b>${label}</b></button>`;
  }).join('') : '<div class="empty-state">Nenhum produto encontrado.</div>';
}

function openInlinePicker(button, mode, slot = 0) {
  const module = collectionModule();
  const row = button.closest('.collection-item');
  const index = Number(button.dataset.collectionReplaceMain ?? button.dataset.collectionSetSubstitute);
  if (!module || !row || !Number.isFinite(index)) return;
  document.querySelectorAll('.inline-product-picker').forEach(node => node.remove());
  module.replaceTarget = { index, mode, slot: Number(slot) || 0 };
  const picker = document.createElement('section');
  picker.className = 'inline-product-picker';
  picker.innerHTML = `<div class="inline-product-picker-head"><div><strong>${mode === 'main' ? 'Trocar produto principal' : `Escolher substituto ${Number(slot) + 1}`}</strong><small>A busca acontece aqui; a cesta não muda de posição.</small></div><button class="button ghost compact" type="button" data-inline-close>Cancelar</button></div><input type="search" placeholder="Nome, código, EAN ou marca" autocomplete="off"><div class="inline-product-results"></div>`;
  row.appendChild(picker);
  const input = picker.querySelector('input');
  const results = picker.querySelector('.inline-product-results');
  const render = () => { results.innerHTML = inlineResults(module, input.value, module.replaceTarget); };
  input.addEventListener('input', render);
  picker.addEventListener('click', event => {
    if (event.target.closest('[data-inline-close]')) {
      module.replaceTarget = null;
      picker.remove();
      button.focus({ preventScroll: true });
      return;
    }
    const select = event.target.closest('[data-inline-product]');
    if (!select) return;
    const host = document.querySelector('#collectionEditor .editor-body');
    const top = host?.scrollTop || 0;
    module.addProduct(select.dataset.inlineProduct);
    requestAnimationFrame(() => { if (host) host.scrollTop = top; });
  });
  render();
  input.focus({ preventScroll: true });
  picker.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function enhanceProductEditorHeader() {
  const editor = document.getElementById('productEditor');
  if (!editor?.classList.contains('open')) return;
  const header = editor.querySelector('.editor-header');
  if (!header || header.querySelector('.visual-product-header')) return;
  const preview = editor.querySelector('#editorImagePreview');
  const imageField = editor.querySelector('[data-field="url_imagem"]');
  const src = preview?.getAttribute('src') || imageField?.value || PLACEHOLDER;
  header.insertAdjacentHTML('afterbegin', `<img class="visual-product-header" src="${escapeHtml(src)}" onerror="this.src='${PLACEHOLDER}'" alt="Foto do produto">`);
}

function enhanceStockEditorHeader() {
  const editor = document.getElementById('stockEditor');
  if (!editor?.classList.contains('open')) return;
  const header = editor.querySelector('.editor-header');
  if (!header || header.querySelector('.visual-product-header')) return;
  const title = text(document.getElementById('stockEditorTitle')?.textContent);
  const product = allProducts().find(row => productName(row) === title);
  header.insertAdjacentHTML('afterbegin', `<img class="visual-product-header" src="${escapeHtml(productImage(product || {}) || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'" alt="Foto do produto">`);
}

function enhanceOfferRows() {
  document.querySelectorAll('#offerRows tr').forEach(row => {
    const key = row.querySelector('[data-offer-select]')?.dataset.offerSelect;
    const cell = row.children?.[1];
    if (!key || !cell || cell.querySelector('.offer-product-visual')) return;
    const product = findProduct(key);
    const current = cell.innerHTML;
    cell.innerHTML = `<div class="offer-product-visual"><img src="${escapeHtml(productImage(product || {}) || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'" alt=""><span>${current}</span></div>`;
  });
}

function enhanceQuickReadMatches() {
  document.querySelectorAll('.quick-read-matches [data-quick-select]').forEach(button => {
    if (button.querySelector('.quick-read-match-photo')) return;
    const product = findProduct(button.dataset.quickSelect);
    button.insertAdjacentHTML('afterbegin', `<img class="quick-read-match-photo" src="${escapeHtml(productImage(product || {}) || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'" alt="">`);
  });
}

function enhancePublishIssues() {
  document.querySelectorAll('#publishIssues [data-review-product]').forEach(button => {
    const first = button.firstElementChild;
    if (!first || first.classList.contains('review-product-visual')) return;
    const product = findProduct(button.dataset.reviewProduct);
    const wrapper = document.createElement('span');
    wrapper.className = 'review-product-visual';
    wrapper.innerHTML = `<img src="${escapeHtml(productImage(product || {}) || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'" alt="">`;
    wrapper.appendChild(first);
    button.prepend(wrapper);
  });
}

function runEnhancements() {
  installStyles();
  moveCollectionSearchToTop();
  enhanceCollectionItems();
  enhanceCollectionSearchResults();
  enhanceProductEditorHeader();
  enhanceStockEditorHeader();
  enhanceOfferRows();
  enhanceQuickReadMatches();
  enhancePublishIssues();
}

document.addEventListener('click', event => {
  const replace = event.target.closest('[data-collection-replace-main]');
  const substitute = event.target.closest('[data-collection-set-substitute]');
  if (!replace && !substitute) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (replace) openInlinePicker(replace, 'main', 0);
  else openInlinePicker(substitute, 'substitute', substitute.dataset.slot);
}, true);

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    runEnhancements();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
else schedule();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
