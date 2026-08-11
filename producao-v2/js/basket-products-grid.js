(() => {
  'use strict';

  const INSTALL_FLAG = '__basketVerticalGridV1';
  const PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="100%" height="100%" fill="#f1f2ef"/><text x="50%" y="53%" text-anchor="middle" fill="#899087" font-family="Arial" font-size="13">sem imagem</text></svg>')}`;

  const text = value => String(value ?? '').trim();
  const number = value => {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const money = value => number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function productKey(product = {}) {
    return text(product.firebaseKey || product.id || product.codigo || product.sku);
  }

  function productCode(product = {}) {
    return text(product.codigo || product.sku || product.id || product.firebaseKey);
  }

  function productName(product = {}) {
    return text(product.nome || product.titulo || product.descricao || productCode(product) || 'Produto sem nome');
  }

  function productImage(product = {}) {
    const source = text(product.url_imagem || product.imagem_url || product.imagem || product.image || product.foto || product.foto_url);
    if (!source) return PLACEHOLDER;
    if (/^site\//i.test(source)) return `/${source.replace(/^\/+/, '')}`;
    if (/^img\//i.test(source)) return `/site/${source.replace(/^\/+/, '')}`;
    return source;
  }

  function isActive(product = {}) {
    const status = text(product.situacao ?? product.status ?? 'A').toLocaleLowerCase('pt-BR');
    return !['i', 'inativo', 'false', '0', 'excluido', 'excluído'].includes(status)
      && product.ativo !== false
      && product.visivel !== false;
  }

  function productReferences(product = {}) {
    return [productKey(product), productCode(product), product.sku, product.gtin, product.ean]
      .map(text).filter(Boolean);
  }

  function ensureIndexes(module) {
    const products = Array.isArray(module?.store?.state?.products) ? module.store.state.products : [];
    const current = module.__basketProductIndexes;
    if (current?.source === products && current?.size === products.length) return current;

    const byReference = new Map();
    const searchable = [];
    products.forEach(product => {
      productReferences(product).forEach(reference => {
        byReference.set(reference, product);
        byReference.set(normalize(reference), product);
      });
      searchable.push({
        product,
        search: normalize([
          productName(product), productCode(product), product.gtin, product.ean,
          product.marca, product.categoria, product.subcategoria,
        ].join(' ')),
      });
    });
    module.__basketProductIndexes = { source: products, size: products.length, byReference, searchable };
    return module.__basketProductIndexes;
  }

  function findIndexed(module, code) {
    const raw = text(code);
    if (!raw) return null;
    const index = ensureIndexes(module).byReference;
    return index.get(raw) || index.get(normalize(raw)) || null;
  }

  function resolveItem(module, item = {}) {
    const product = findIndexed(module, item.codigo);
    return {
      product,
      selectedCode: product ? text(item.codigo) : '',
      usedSubstitute: false,
    };
  }

  function allowedSwapChips(module, item = {}, index) {
    const codes = Array.isArray(item.trocas_permitidas) ? item.trocas_permitidas : [];
    if (!codes.length) return '<small class="basket-swap-empty">Nenhuma troca configurada</small>';
    return codes.map(code => {
      const product = findIndexed(module, code);
      const stock = number(product?.estoque);
      const kind = product && stock > 0 ? (stock < 30 ? 'warning' : 'success') : 'danger';
      const label = product ? productName(product) : code;
      return `<span class="basket-swap-chip ${kind}" title="${escapeHtml(label)}"><span>${escapeHtml(label)}</span><button type="button" aria-label="Remover ${escapeHtml(label)}" data-collection-remove-swap="${index}" data-code="${escapeHtml(code)}">×</button></span>`;
    }).join('');
  }

  function basketCard(module, item, index) {
    const main = findIndexed(module, item.codigo);
    const resolved = resolveItem(module, item);
    const active = resolved.product || main;
    const stock = number(active?.estoque);
    const lowStock = !active || stock < 30;
    const code = text(item.codigo || productCode(main));
    const image = productImage(main || {});

    return `<article class="collection-item basket-product-card ${lowStock ? 'low-stock' : ''}" data-collection-item="${index}">
      <div class="basket-product-image"><img loading="lazy" decoding="async" src="${escapeHtml(image)}" onerror="this.src='${PLACEHOLDER}'" alt=""></div>
      <div class="basket-product-info">
        <span>Produto principal</span>
        <strong title="${escapeHtml(main ? productName(main) : code || 'Produto não encontrado')}">${escapeHtml(main ? productName(main) : code || 'Produto não encontrado')}</strong>
        <small>${escapeHtml(code || 'sem código')}</small>
      </div>
      <div class="basket-product-meta">
        <span class="badge ${stock >= 30 ? 'success' : stock > 0 ? 'warning' : 'danger'}">Estoque ${stock}</span>
        <label class="basket-product-quantity">Quantidade<input type="number" min="1" step="1" value="${escapeHtml(item.qtd || 1)}" data-collection-item-qty="${index}"></label>
      </div>
      <div class="basket-swap-section"><strong>Trocas permitidas</strong><div class="basket-swap-chips">${allowedSwapChips(module, item, index)}</div></div>
      <div class="collection-item-actions basket-product-actions">
        <button class="button secondary compact" type="button" data-collection-open-product="${index}" ${main ? '' : 'disabled'}>Ajustar produto</button>
        <button class="button secondary compact" type="button" data-collection-replace-main="${index}">Trocar principal</button>
        <button class="button primary compact basket-manage-swaps" type="button" data-collection-manage-swaps="${index}">Pesquisar e marcar trocas</button>
        <button class="button ghost compact danger-text" type="button" data-collection-remove-item="${index}">Remover da cesta</button>
      </div>
    </article>`;
  }

  function installStyles() {
    if (document.getElementById('basketProductsVerticalGridStyles')) return;
    const style = document.createElement('style');
    style.id = 'basketProductsVerticalGridStyles';
    style.textContent = `
      #collectionEditor .collection-composition #collectionItems.basket-products-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:stretch;margin-top:10px}
      #collectionEditor .basket-product-card{display:flex;min-width:0;flex-direction:column;gap:9px;margin:0;padding:10px;border-radius:12px;background:#fff;content-visibility:auto;contain-intrinsic-size:390px}
      #collectionEditor .basket-product-card.low-stock{border-color:#e4bc67;background:#fffaf0;box-shadow:inset 0 4px 0 #d39b2f}
      #collectionEditor .basket-product-image{aspect-ratio:1/1;display:grid;place-items:center;overflow:hidden;border:1px solid var(--line);border-radius:9px;background:#f8f9f7}
      #collectionEditor .basket-product-image img{width:100%;height:100%;object-fit:contain;padding:5px}
      #collectionEditor .basket-product-info{min-width:0;min-height:62px}
      #collectionEditor .basket-product-info>span,#collectionEditor .basket-product-info>strong,#collectionEditor .basket-product-info>small{display:block}
      #collectionEditor .basket-product-info>span{color:var(--muted);font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
      #collectionEditor .basket-product-info>strong{display:-webkit-box;min-height:36px;margin-top:4px;overflow:hidden;font-size:11px;line-height:1.4;-webkit-box-orient:vertical;-webkit-line-clamp:2}
      #collectionEditor .basket-product-info>small{margin-top:3px;overflow:hidden;color:var(--muted);font-size:8px;text-overflow:ellipsis;white-space:nowrap}
      #collectionEditor .basket-product-meta{display:flex;justify-content:space-between;align-items:center;gap:8px}
      #collectionEditor .basket-product-quantity{display:grid;grid-template-columns:auto 52px;align-items:center;gap:6px;color:var(--muted);font-size:8px;font-weight:900}
      #collectionEditor .basket-swap-section{display:grid;gap:5px;padding:8px;border:1px solid var(--line);border-radius:9px;background:#fafbf9}
      #collectionEditor .basket-swap-section>strong{font-size:8px;text-transform:uppercase;color:var(--muted)}
      #collectionEditor .basket-swap-chips{display:flex;max-height:82px;overflow:auto;flex-wrap:wrap;gap:4px}
      #collectionEditor .basket-swap-chip{display:inline-flex;max-width:100%;align-items:center;gap:4px;min-height:23px;padding:2px 3px 2px 7px;border-radius:999px;font-size:7px;font-weight:850}
      #collectionEditor .basket-swap-chip>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #collectionEditor .basket-swap-chip button{display:grid;width:18px;height:18px;flex:0 0 18px;place-items:center;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.75);color:currentColor;font:700 12px/1 Arial;cursor:pointer}
      #collectionEditor .basket-swap-chip.success{background:var(--success-soft);color:var(--success)}
      #collectionEditor .basket-swap-chip.warning{background:var(--warning-soft);color:var(--warning)}
      #collectionEditor .basket-swap-chip.danger{background:var(--danger-soft);color:var(--danger)}
      #collectionEditor .basket-swap-empty{color:var(--muted);font-size:8px}
      #collectionEditor .basket-product-quantity input{min-height:32px;padding:5px;text-align:center}
      #collectionEditor .basket-product-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin-top:auto}
      #collectionEditor .basket-product-actions .button{min-width:0;min-height:30px;padding:0 5px;font-size:7px}
      #collectionEditor .basket-product-actions .basket-manage-swaps,#collectionEditor .basket-product-actions .danger-text{grid-column:1/-1}
      #collectionEditor .basket-products-grid .collection-items-empty{grid-column:1/-1}
      #collectionEditor .collection-product-search button[data-collection-add-product].selected{border-color:var(--success);background:var(--success-soft);box-shadow:inset 3px 0 0 var(--success)}
      @media(max-width:1050px){#collectionEditor .collection-composition #collectionItems.basket-products-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:820px){#collectionEditor .collection-composition #collectionItems.basket-products-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:610px){#collectionEditor .collection-composition #collectionItems.basket-products-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:390px){#collectionEditor .collection-composition #collectionItems.basket-products-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function patchModule(module) {
    if (!module || module[INSTALL_FLAG]) return false;
    module[INSTALL_FLAG] = true;
    installStyles();

    const originalFindProduct = module.findProduct.bind(module);
    const originalRenderItems = module.renderItems.bind(module);
    const originalRenderAudit = module.renderAudit.bind(module);
    const originalAudits = module.audits.bind(module);

    module.findProduct = function fastFindProduct(code) {
      return findIndexed(this, code) || originalFindProduct(code);
    };

    let auditTimer = null;
    module.renderAudit = function batchedRenderAudit() {
      clearTimeout(auditTimer);
      auditTimer = setTimeout(() => {
        auditTimer = null;
        originalRenderAudit();
      }, 55);
    };

    let auditCache = null;
    module.audits = function cachedAudits() {
      const state = this.store?.state || {};
      if (auditCache
        && auditCache.products === state.products
        && auditCache.baskets === state.baskets
        && auditCache.kits === state.kits
        && auditCache.queue === state.queue) return auditCache.value;
      const value = originalAudits();
      auditCache = { products: state.products, baskets: state.baskets, kits: state.kits, queue: state.queue, value };
      return value;
    };

    module.renderItems = function renderBasketItemsGrid() {
      if (this.type !== 'basket') {
        this.elements.collectionItems.classList.remove('basket-products-grid');
        return originalRenderItems();
      }
      ensureIndexes(this);
      const items = Array.isArray(this.draft?.produtos) ? this.draft.produtos : [];
      this.elements.collectionItems.classList.add('basket-products-grid');
      this.elements.collectionItems.innerHTML = items.length
        ? items.map((item, index) => basketCard(this, item, index)).join('')
        : '<div class="empty-state collection-items-empty">Adicione produtos à composição.</div>';
      this.renderSearchMode();
    };

    module.renderSearchResults = function fastSearchResults() {
      const query = normalize(this.elements.collectionProductSearch.value);
      if (!query) {
        this.elements.collectionSearchResults.innerHTML = '';
        return;
      }
      const rows = ensureIndexes(this).searchable.filter(row => row.search.includes(query)).slice(0, 20);
      const label = this.replaceTarget
        ? (this.replaceTarget.mode === 'main' ? 'Usar como principal' : this.replaceTarget.mode === 'allowed' ? 'Marcar para troca' : 'Selecionar')
        : 'Adicionar';
      const mainCode = text(this.replaceTarget?.mode === 'allowed' ? this.draft?.produtos?.[this.replaceTarget.index]?.codigo : '');
      this.elements.collectionSearchResults.innerHTML = rows.length ? rows
        .filter(({ product }) => this.replaceTarget?.mode !== 'allowed' || text(productCode(product) || productKey(product)) !== mainCode)
        .map(({ product }) => {
          const stock = number(product.estoque);
          const code = productCode(product) || productKey(product);
          const selected = this.replaceTarget?.mode === 'allowed'
            && (this.draft?.produtos?.[this.replaceTarget.index]?.trocas_permitidas || []).some(value => text(value) === text(code));
          return `<button class="${stock < 30 ? 'low-stock' : ''} ${selected ? 'selected' : ''}" type="button" data-collection-add-product="${escapeHtml(productKey(product))}"><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(code)} · estoque ${stock} · ${money(product.preco)}</small><span>${escapeHtml(selected ? 'Desmarcar' : label)}</span></button>`;
        }).join('') : (query.length > 1 ? '<small>Nenhum produto encontrado.</small>' : '');
    };

    if (module.draft) {
      module.renderItems();
      module.renderAudit();
    }
    return true;
  }

  function tryInstall() {
    patchModule(window.__adminV2CollectionsModule);
  }

  window.addEventListener('admin-v2-route-ready', event => {
    if (['baskets', 'kits'].includes(event.detail?.route)) setTimeout(tryInstall, 0);
  });
  document.addEventListener('click', event => {
    if (event.target.closest?.('[data-route="baskets"], [data-route="kits"]')) setTimeout(tryInstall, 100);
  }, true);
  tryInstall();
})();
