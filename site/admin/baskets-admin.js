(() => {
  "use strict";

  const products = window.DonaAdminProductBridge;
  if (!products?.request) return;

  const { request, esc, money, effectivePrice, productCache, openProduct, toast } = products;
  const $ = (id) => document.getElementById(id);
  const state = {
    baskets: [],
    types: [],
    pickerTypeKey: "",
    pickerQuery: "",
    pickerOffset: 0,
    pickerTotal: 0,
    pickerStatus: "all",
    pickerStockOnly: false,
    pickerProducts: [],
    pickerLoading: false,
    pickerError: "",
    pickerRequestId: 0,
    pickerDebounce: null,
    expandedTypeKey: "",
    draggedOption: null,
    loading: false,
    saving: false,
    dirty: false,
    creating: false,
    loaded: false,
    loadPromise: null,
  };

  function syncCatalogBasketMembership() {
    const catalogAdmin = window.DonaCatalogAdmin;
    if (typeof catalogAdmin?.syncBasketMembership === "function") {
      catalogAdmin.syncBasketMembership(productMembershipSnapshot());
    }
  }

  function markDirty() {
    state.dirty = true;
    const status = $("basket-dirty-state");
    if (status) status.hidden = false;
    syncCatalogBasketMembership();
  }

  function clearDirty() {
    state.dirty = false;
    const status = $("basket-dirty-state");
    if (status) status.hidden = true;
    syncCatalogBasketMembership();
  }

  function populateBasketSources() {
    const select = $("basket-source-template");
    if (!select) return;
    const selected = select.value;
    const activeBaskets = state.baskets.filter((basket) => basket.is_active !== false);
    select.innerHTML = activeBaskets.map((basket) =>
      '<option value="' + esc(basket.id) + '">' + esc(basket.name) + '</option>'
    ).join("");
    if (activeBaskets.some((basket) => String(basket.id) === selected)) select.value = selected;
  }

  function openCreateBasketDialog() {
    if (state.dirty) {
      toast("Salve as alterações da composição antes de criar outra cesta.");
      return;
    }
    populateBasketSources();
    const form = $("basket-create-form");
    form?.reset();
    const dialog = $("basket-create-dialog");
    if (dialog && !dialog.open) dialog.showModal();
    $("basket-new-name")?.focus();
  }

  async function createBasketDraft(event) {
    event.preventDefault();
    if (state.creating || state.dirty) {
      if (state.dirty) toast("Salve as alterações da composição antes de criar outra cesta.");
      return;
    }
    const name = $("basket-new-name").value.trim();
    const sourceBasketId = $("basket-source-template").value;
    if (!name || !sourceBasketId) {
      toast("Informe o nome e escolha uma cesta para copiar.");
      return;
    }
    const submit = $("create-basket-submit");
    state.creating = true;
    submit.disabled = true;
    submit.textContent = "Criando…";
    try {
      const result = await request("basket_grid_create", {
        method: "POST",
        body: { name, source_basket_id: sourceBasketId },
      });
      $("basket-create-dialog").close();
      toast("Rascunho criado. Revise a composição e o valor antes de ativar.");
      await loadBaskets();
      const createdId = result.basket?.id;
      if (createdId) document.querySelector('[data-basket-card="' + createdId + '"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      toast(error.message || "Não foi possível criar a nova cesta.");
    } finally {
      state.creating = false;
      submit.disabled = false;
      submit.textContent = "Criar rascunho";
    }
  }

  async function activateBasket(basketId) {
    if (state.dirty) {
      toast("Salve as alterações antes de ativar a cesta.");
      return;
    }
    const basket = state.baskets.find((item) => String(item.id) === String(basketId));
    if (!basket || basket.is_active) return;
    if (!window.confirm("Ativar “" + basket.name + "” na loja? Ela ficará disponível para venda.")) return;
    const button = document.querySelector('[data-activate-basket="' + basket.id + '"]');
    if (button) { button.disabled = true; button.textContent = "Ativando…"; }
    try {
      await request("basket_set_active", {
        method: "POST",
        body: { basket_id: basket.id, is_active: true },
      });
      toast("Cesta ativada na loja.");
      await loadBaskets();
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = "Ativar na loja"; }
      toast(error.message || "Não foi possível ativar a cesta.");
    }
  }

  function typeKey(type, index = 0) {
    return String(type.id || type._key || ("new-" + index));
  }

  function findType(key) {
    return state.types.find((type, index) => typeKey(type, index) === String(key));
  }

  function quantityValue(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? String(number) : "0";
  }

  function priceInputValue(value) {
    if (typeof value === "string") return value;
    return (Math.max(0, Number(value || 0)) / 100).toFixed(2);
  }

  function parsePriceCents(value) {
    const normalized = String(value ?? "").trim().replace(",", ".");
    if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) return null;
    const number = Number(normalized);
    return Number.isFinite(number) && number >= 0 && number <= 1000000
      ? Math.round(number * 100)
      : null;
  }

  function productSellableStock(product) {
    if (product?.sellable_stock == null || product.sellable_stock === "") return null;
    const value = Number(product.sellable_stock);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  function canSelectAsBasketDefault(product) {
    const sellable = productSellableStock(product);
    return product?.is_active !== false && (sellable === null || sellable > 0);
  }

  function productStatus(product) {
    if (product?.is_active === true && productSellableStock(product) === 0) return { text: "Sem saldo vendável", className: "is-no-stock" };
    if (product?.is_active === true) return { text: "Ativo", className: "is-active" };
    if (product?.is_active === false) return { text: "Inativo", className: "is-inactive" };
    return { text: "Status indisponível", className: "is-unknown" };
  }

  function optionProduct(option) {
    return option.product || productCache.get(String(option.product_id)) || {};
  }

  function safeProductImageUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw, window.location.href);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function productImageMarkup(product, className) {
    const imageUrl = safeProductImageUrl(product?.image_url);
    return '<span class="' + esc(className || "basket-product-photo") + '">' +
      (imageUrl ? '<img src="' + esc(imageUrl) + '" alt="" loading="lazy" decoding="async" draggable="false" data-basket-product-image>' : "") +
      '<span class="basket-product-photo-placeholder"' + (imageUrl ? " hidden" : "") + '>DA</span></span>';
  }

  function optionPriceCents(option) {
    const product = optionProduct(option);
    return Number(product.effective_price_cents ?? effectivePrice(product)) || 0;
  }

  function chooseDefaultOption(type, preferredId, referencePriceCents) {
    const options = Array.isArray(type.options) ? type.options : [];
    const preferred = options.find((option) => String(option.product_id) === String(preferredId || ""));
    if (preferred && canSelectAsBasketDefault(optionProduct(preferred))) return preferred;
    const candidates = options.filter((option) => canSelectAsBasketDefault(optionProduct(option)));
    candidates.sort((a, b) => {
      const aPrice = optionPriceCents(a);
      const bPrice = optionPriceCents(b);
      const aDelta = Number.isFinite(Number(referencePriceCents)) ? Math.abs(aPrice - Number(referencePriceCents)) : 0;
      const bDelta = Number.isFinite(Number(referencePriceCents)) ? Math.abs(bPrice - Number(referencePriceCents)) : 0;
      const aStock = productSellableStock(optionProduct(a)) ?? Number(optionProduct(a).stock || 0);
      const bStock = productSellableStock(optionProduct(b)) ?? Number(optionProduct(b).stock || 0);
      return aDelta - bDelta || bStock - aStock ||
        String(optionProduct(a).name || "").localeCompare(String(optionProduct(b).name || ""), "pt-BR");
    });
    const activePreferred = preferred && optionProduct(preferred).is_active !== false ? preferred : null;
    return candidates[0] || activePreferred || options.find((option) => optionProduct(option).is_active !== false) || options[0] || null;
  }

  function setTypeDefault(type, preferredId, referencePriceCents) {
    const options = Array.isArray(type.options) ? type.options : [];
    const chosen = chooseDefaultOption(type, preferredId, referencePriceCents);
    type.default_product_id = String(chosen?.product_id || "");
    if (chosen) type.options = [chosen, ...options.filter((option) => option !== chosen)];
    return chosen;
  }

  function renderOptions(type, key) {
    const options = Array.isArray(type.options) ? type.options : [];
    const defaultProductId = String(
      type.default_product_id ||
      options.find((option) => option.metadata?.preferred === true)?.product_id ||
      options[0]?.product_id ||
      ""
    );
    const list = options.map((option, index) => {
      const product = optionProduct(option);
      const status = productStatus(product);
      const price = product.effective_price_cents ?? effectivePrice(product);
      const physicalStock = product.stock == null ? "Estoque físico não informado" : "Estoque físico " + quantityValue(product.stock);
      const sellableStock = productSellableStock(product);
      const stock = sellableStock == null ? "Vendável não informado" : "Vendável " + quantityValue(sellableStock);
      const costNumber = product.cost == null || product.cost === "" ? null : Number(product.cost);
      const costText = costNumber != null && Number.isFinite(costNumber) && costNumber >= 0
        ? "Custo " + money(Math.round(costNumber * 100))
        : "Custo não informado";
      const productId = String(option.product_id);
      const brand = [product.brand, product.sku && ("SKU " + product.sku)].filter(Boolean).join(" · ");
      const isDefault = String(option.product_id) === defaultProductId;
      const cannotSelectDefault = !canSelectAsBasketDefault(product);
      const isDraggable = !isDefault;
      const moveUpDisabled = isDefault || index <= 1;
      const moveDownDisabled = isDefault || index >= options.length - 1;
      return '<article class="basket-grid-option' + (isDefault ? " is-default" : "") + '" role="listitem" data-option-id="' + esc(productId) + '" data-type-key="' + esc(key) + '" data-is-default="' + (isDefault ? "true" : "false") + '" draggable="' + (isDraggable ? "true" : "false") + '" aria-label="Posição ' + (index + 1) + ': ' + esc(product.name || "Produto") + '">' +
        '<div class="basket-grid-option-order"><span class="basket-option-drag-grip" aria-hidden="true">⠿</span><span class="basket-option-rank">' + (index + 1) + '</span></div>' +
        productImageMarkup(product, "basket-grid-option-photo") +
        '<div class="basket-grid-option-copy"><strong>' + esc(product.name || "Produto") + '</strong><span>' + esc(brand || "Marca e SKU não informados") + '</span><small>' + esc(physicalStock) + ' · ' + esc(costText) + '</small></div>' +
        '<div class="basket-grid-option-price"><small>Venda / unidade</small><strong>' + money(price) + '</strong><small>' + esc(stock) + '</small></div>' +
        '<small class="basket-option-status ' + status.className + '">' + status.text + '</small>' +
        '<label class="basket-grid-option-default" title="' + (isDefault ? "Produto padrão do tipo" : "Definir como produto padrão") + '"><input type="radio" name="basket-default-' + esc(key) + '" data-default-option data-type-key="' + esc(key) + '" data-product-id="' + esc(productId) + '"' + (isDefault ? " checked" : "") + (cannotSelectDefault ? " disabled" : "") + '><span>' + (isDefault ? "Padrão" : "Definir padrão") + '</span></label>' +
        '<div class="basket-grid-option-actions"><div class="basket-option-move-buttons">' +
          '<button class="text-button" type="button" data-move-option="-1" data-type-key="' + esc(key) + '" data-product-id="' + esc(productId) + '" aria-label="Mover ' + esc(product.name || "produto") + ' para cima"' + (moveUpDisabled ? " disabled" : "") + '>↑</button>' +
          '<button class="text-button" type="button" data-move-option="1" data-type-key="' + esc(key) + '" data-product-id="' + esc(productId) + '" aria-label="Mover ' + esc(product.name || "produto") + ' para baixo"' + (moveDownDisabled ? " disabled" : "") + '>↓</button>' +
        '</div><button class="text-button product-edit-mini" type="button" data-edit-product="' + esc(productId) + '">Editar</button>' +
        '<button class="text-button danger-text" type="button" data-remove-option="true" data-type-key="' + esc(key) + '" data-product-id="' + esc(productId) + '" aria-label="Remover ' + esc(product.name || "Produto") + '">×</button></div></article>';
    }).join("");
    return '<div class="basket-grid-products-heading"><div><h4>Produtos no carrossel</h4><p>Arraste para ordenar como aparece no site. O produto padrão permanece em primeiro.</p></div><button class="button button-outline basket-grid-add-option" type="button" data-add-variation="' + esc(key) + '">Adicionar produtos</button></div>' +
      '<div class="basket-grid-options" role="list" aria-label="Produtos do carrossel de ' + esc(type.title || "tipo") + '">' + (list || '<p class="admin-muted basket-grid-empty-options">Nenhum produto nesta posição. Busque e adicione produtos no painel ao lado.</p>') + '</div>';
  }

  function basketProductsSumCents(basketId) {
    return state.types.reduce((total, type) => {
      const quantity = Number(type.quantities?.[basketId] || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return total;
      const option = Array.isArray(type.options) ? type.options[0] : null;
      if (!option) return total;
      const product = option.product || productCache.get(String(option.product_id)) || {};
      const unitPrice = Number(product.effective_price_cents ?? effectivePrice(product));
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return total;
      return total + Math.round(unitPrice) * quantity;
    }, 0);
  }

  function basketProductsCostSummary(basketId) {
    let totalCents = 0;
    let missingProducts = 0;
    state.types.forEach((type) => {
      const quantity = Number(type.quantities?.[basketId] || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      const option = Array.isArray(type.options) ? type.options[0] : null;
      const product = option?.product || (option ? productCache.get(String(option.product_id)) : null);
      const rawCost = product?.cost;
      if (rawCost == null || String(rawCost).trim() === "") {
        missingProducts += 1;
        return;
      }
      const unitCost = Number(rawCost);
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        missingProducts += 1;
        return;
      }
      totalCents += Math.round((unitCost * quantity + Number.EPSILON) * 100);
    });
    return { totalCents, missingProducts };
  }

  function basketPriceCostMarkup(basketId, rawPrice) {
    const cost = basketProductsCostSummary(basketId);
    const priceCents = parsePriceCents(rawPrice);
    if (cost.missingProducts) return { state: "incomplete", value: "Não calculável" };
    if (priceCents == null) return { state: "unavailable", value: "Informe o preço" };
    if (cost.totalCents <= 0) return { state: "unavailable", value: "Custo zerado" };

    const differencePercent = ((priceCents - cost.totalCents) / cost.totalCents) * 100;
    const formatted = Math.abs(differencePercent).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    const sign = differencePercent > 0 ? "+" : differencePercent < 0 ? "−" : "";
    return {
      state: differencePercent > 0 ? "positive" : differencePercent < 0 ? "negative" : "neutral",
      value: sign + formatted + "%",
    };
  }

  function updateBasketProductSums() {
    document.querySelectorAll("[data-basket-product-sum]").forEach((summary) => {
      const value = summary.querySelector("strong");
      if (value) value.textContent = money(basketProductsSumCents(summary.dataset.basketProductSum));
    });
    document.querySelectorAll("[data-basket-product-cost]").forEach((summary) => {
      const label = summary.querySelector(".basket-default-price-cost-label");
      const value = summary.querySelector("strong");
      const note = summary.querySelector(".basket-default-price-cost-note");
      const cost = basketProductsCostSummary(summary.dataset.basketProductCost);
      if (label) label.textContent = cost.missingProducts ? "Custo parcial:" : "Soma de custo:";
      if (value) value.textContent = money(cost.totalCents);
      if (note) note.textContent = cost.missingProducts
        ? " · " + cost.missingProducts + (cost.missingProducts === 1 ? " produto sem custo" : " produtos sem custo")
        : "";
      summary.dataset.incomplete = cost.missingProducts ? "true" : "false";
    });
    document.querySelectorAll("[data-basket-price-markup]").forEach((summary) => {
      const card = summary.closest("[data-basket-card]");
      const input = card?.querySelector("[data-basket-price]");
      const markup = basketPriceCostMarkup(summary.dataset.basketPriceMarkup, input?.value);
      const value = summary.querySelector("strong");
      if (value) value.textContent = markup.value;
      summary.dataset.state = markup.state;
    });
  }

  function basketPriceCardsMarkup(baskets) {
    return '<section class="basket-default-prices" aria-labelledby="basket-default-prices-title">' +
      '<div class="basket-default-prices-heading"><h3 id="basket-default-prices-title">Valores padrão das cestas</h3><p>O preço inicial de venda, o custo e a diferença sobre o custo atualizam enquanto você edita.</p></div>' +
      '<div class="basket-default-prices-grid">' + baskets.map((basket) => {
        const cost = basketProductsCostSummary(basket.id);
        const defaultPrice = priceInputValue(basket.default_price_value ?? basket.default_price_cents);
        const markup = basketPriceCostMarkup(basket.id, defaultPrice);
        const basketIsActive = basket.is_active !== false;
        const status = basketIsActive
          ? '<span class="basket-state-badge is-live">Ativa na loja</span>'
          : '<span class="basket-state-badge is-draft">Rascunho · fora da loja</span>';
        const activateButton = basketIsActive ? ""
          : '<button class="button button-outline basket-activate-button" type="button" data-activate-basket="' + esc(basket.id) + '">Ativar na loja</button>';
        return '<div class="basket-default-price" data-basket-card="' + esc(basket.id) + '"><div class="basket-default-price-heading"><span>' + esc(basket.name) + '</span>' + status + '</div><label class="basket-default-price-input"><span>R$</span><input type="number" min="0" max="1000000" step="0.01" inputmode="decimal" value="' + esc(defaultPrice) + '" data-basket-price="' + esc(basket.id) + '" aria-label="Valor padrão da cesta ' + esc(basket.name) + '"></label><small class="basket-default-price-sum" data-basket-product-sum="' + esc(basket.id) + '" aria-live="polite">Soma de venda: <strong>' + money(basketProductsSumCents(basket.id)) + '</strong></small><small class="basket-default-price-sum basket-default-price-cost" data-basket-product-cost="' + esc(basket.id) + '" data-incomplete="' + (cost.missingProducts ? "true" : "false") + '" aria-live="polite"><span class="basket-default-price-cost-label">' + (cost.missingProducts ? "Custo parcial:" : "Soma de custo:") + '</span><strong>' + money(cost.totalCents) + '</strong><span class="basket-default-price-cost-note">' + (cost.missingProducts ? " · " + cost.missingProducts + (cost.missingProducts === 1 ? " produto sem custo" : " produtos sem custo") : "") + '</span></small><small class="basket-default-price-sum basket-default-price-markup" data-basket-price-markup="' + esc(basket.id) + '" data-state="' + markup.state + '" aria-live="polite" title="(preço manual − custo total) ÷ custo total × 100">Diferença sobre custo: <strong>' + esc(markup.value) + '</strong></small>' + activateButton + '</div>';
      }).join("") + '</div></section>';
  }

  function syncPickerTypeSelect() {
    const select = $("picker-type-select");
    if (!select) return;
    const current = state.pickerTypeKey;
    select.innerHTML = state.types.map((type, index) => {
      const key = typeKey(type, index);
      const label = String(type.title || "Novo tipo").trim() || "Novo tipo";
      return '<option value="' + esc(key) + '">' + esc(label) + '</option>';
    }).join("");
    if (state.types.some((type, index) => typeKey(type, index) === current)) select.value = current;
    else if (state.types.length) {
      state.pickerTypeKey = typeKey(state.types[0], 0);
      select.value = state.pickerTypeKey;
    }
    select.disabled = state.types.length === 0;
  }

  function renderPickerResults() {
    const host = $("picker-results");
    if (!host) return;
    const targetType = findType(state.pickerTypeKey);
    if (!targetType) {
      host.innerHTML = '<p class="admin-muted basket-picker-empty">Adicione um tipo à composição para escolher onde incluir os produtos.</p>';
      const count = $("picker-result-count");
      if (count) count.textContent = "selecione uma posição";
      const more = $("picker-more");
      if (more) { more.hidden = true; more.disabled = true; }
      return;
    }
    const targetIds = new Set((targetType.options || []).map((option) => String(option.product_id)));
    const rows = state.pickerProducts.map((product) => {
      const id = String(product.id);
      const sameType = targetIds.has(id);
      const memberships = state.types.filter((type) => (type.options || []).some((option) => String(option.product_id) === id));
      const elsewhere = memberships.some((type) => type !== targetType);
      const status = productStatus(product);
      const stock = productSellableStock(product);
      const actionText = sameType ? "Já adicionado" : (elsewhere ? "Mover para cá" : "Adicionar");
      return '<article class="basket-picker-product"><div class="basket-picker-product-photo">' + productImageMarkup(product, "basket-picker-photo") + '</div><div class="basket-picker-product-info"><strong>' + esc(product.name || "Produto sem nome") + '</strong><small>' + esc([product.brand, product.sku && ("SKU " + product.sku), product.gtin && ("EAN " + product.gtin)].filter(Boolean).join(" · ") || "Marca e código não informados") + '</small><span class="basket-picker-product-meta"><b>' + money(product.effective_price_cents ?? effectivePrice(product)) + '</b><small>' + (stock == null ? "Saldo não informado" : "Vendável " + quantityValue(stock)) + '</small></span><span class="basket-option-status ' + status.className + '">' + status.text + '</span></div><button class="button ' + (sameType ? "button-outline" : "button-primary") + ' basket-picker-add" type="button" data-add-picker-product="' + esc(id) + '"' + (sameType ? " disabled" : "") + '>' + actionText + '</button></article>';
    }).join("");
    if (rows) host.innerHTML = rows + (state.pickerLoading ? '<p class="basket-picker-loading">Buscando mais produtos…</p>' : "");
    else if (state.pickerLoading) host.innerHTML = '<p class="admin-muted basket-picker-loading">Buscando produtos…</p>';
    else if (state.pickerError) host.innerHTML = '<p class="admin-muted basket-picker-error" role="alert">' + esc(state.pickerError) + '</p>';
    else host.innerHTML = '<p class="admin-muted basket-picker-empty">Nenhum produto encontrado. Ajuste a busca ou os filtros.</p>';
    const count = $("picker-result-count");
    if (count) count.textContent = state.pickerProducts.length + (state.pickerTotal ? " de " + state.pickerTotal : "") + " produtos";
    const more = $("picker-more");
    if (more) {
      more.hidden = state.pickerOffset >= state.pickerTotal || state.pickerTotal === 0;
      more.disabled = state.pickerLoading;
      more.textContent = state.pickerLoading ? "Carregando…" : "Carregar mais produtos";
    }
  }

  function renderGrid() {
    const host = $("admin-baskets");
    const pricesHost = $("basket-default-prices");
    if (!host) return;
    const baskets = state.baskets || [];
    const types = state.types || [];
    if (pricesHost) pricesHost.innerHTML = basketPriceCardsMarkup(baskets);
    if (!types.length) {
      host.innerHTML = '<p class="admin-muted basket-grid-empty">Nenhum tipo cadastrado. Adicione um tipo para começar a montar as cestas.</p>';
      syncPickerTypeSelect();
      renderPickerResults();
      return;
    }
    const rows = types.map((type, index) => {
      const key = typeKey(type, index);
      const quantities = type.quantities || {};
      const expanded = state.expandedTypeKey === key;
      const optionCount = (type.options || []).length;
      const quantityCards = baskets.map((basket) => {
        const value = quantityValue(quantities[basket.id]);
        return '<label class="basket-type-quantity"><span title="' + esc(basket.name) + '">' + esc(basket.name) + '</span><input type="number" min="0" max="999" step="1" value="' + esc(value) + '" data-type-quantity="' + esc(key) + '" data-basket-id="' + esc(basket.id) + '" aria-label="Quantidade de ' + esc(type.title || "tipo") + ' na cesta ' + esc(basket.name) + '"></label>';
      }).join("");
      return '<article class="basket-type-card' + (expanded ? " is-expanded" : "") + '" id="basket-type-' + esc(key) + '" data-type-card="' + esc(key) + '"><div class="basket-type-summary"><button class="basket-type-toggle" type="button" data-toggle-type="' + esc(key) + '" aria-expanded="' + (expanded ? "true" : "false") + '" aria-controls="basket-type-details-' + esc(key) + '"><span class="basket-type-chevron" aria-hidden="true">' + (expanded ? "−" : "+") + '</span><span class="basket-type-summary-copy"><strong data-type-heading="' + esc(key) + '">' + esc(type.title || "Novo tipo") + '</strong><small>' + optionCount + (optionCount === 1 ? " produto no carrossel" : " produtos no carrossel") + '</small></span></button><div class="basket-type-quantity-grid">' + quantityCards + '</div><div class="basket-type-actions"><div class="basket-grid-order"><button class="text-button" type="button" data-move-type="-1" data-type-key="' + esc(key) + '" aria-label="Subir tipo"' + (index === 0 ? " disabled" : "") + '>↑</button><button class="text-button" type="button" data-move-type="1" data-type-key="' + esc(key) + '" aria-label="Descer tipo"' + (index === types.length - 1 ? " disabled" : "") + '>↓</button></div><button class="text-button danger-text" type="button" data-delete-type="' + esc(key) + '" aria-label="Excluir tipo ' + esc(type.title || "sem título") + '">Excluir</button></div></div><div class="basket-type-details" id="basket-type-details-' + esc(key) + '"' + (expanded ? "" : " hidden") + '><label class="basket-grid-title-field"><span>Título exibido no site</span><input type="text" maxlength="180" placeholder="Ex.: Arroz" value="' + esc(type.title || "") + '" data-type-title="' + esc(key) + '"></label><div class="basket-grid-variations">' + renderOptions(type, key) + '</div></div></article>';
    }).join("");
    host.innerHTML = '<div class="basket-type-list-heading"><div><strong>Composição por tipo de produto</strong><span>O primeiro produto é o padrão; as alternativas seguem a ordem do carrossel.</span></div><span>' + types.length + (types.length === 1 ? " tipo" : " tipos") + '</span></div><div class="basket-type-list">' + rows + '</div>';
    syncPickerTypeSelect();
    renderPickerResults();
  }

  async function loadBaskets() {
    const host = $("admin-baskets");
    if (!host) return false;
    if (state.loading && state.loadPromise) return state.loadPromise;
    state.loading = true;
    host.innerHTML = '<p class="admin-muted">Carregando tipos e cestas…</p>';
    const operation = (async () => {
      try {
        const data = await request("basket_grid", { params: {} });
        const createButton = $("add-basket-template");
        if (createButton) createButton.hidden = data.basket_drafts_enabled !== true;
        state.baskets = (data.baskets || []).map((basket) => ({
          ...basket,
          default_price_value: priceInputValue(basket.default_price_cents),
        }));
        state.types = (data.types || []).map((type, index) => ({
          ...type,
          _key: type.id || ("loaded-" + index),
          default_product_id: type.default_product_id || (type.options || []).find((option) => option.metadata?.preferred === true)?.product_id || type.options?.[0]?.product_id || "",
          options: (type.options || []).map((option) => {
            if (option.product) productCache.set(String(option.product_id), option.product);
            return option;
          }),
          quantities: Object.fromEntries(state.baskets.map((basket) => [basket.id, Number(type.quantities?.[basket.id] || 0)])),
        }));
        state.types.forEach((type) => {
          const defaultId = String(type.default_product_id || type.options[0]?.product_id || "");
          const defaultOption = type.options.find((option) => String(option.product_id) === defaultId);
          if (defaultOption) type.options = [defaultOption, ...type.options.filter((option) => option !== defaultOption)];
        });
        const hasExpandedType = state.types.some((type, index) => typeKey(type, index) === state.expandedTypeKey);
        if (!hasExpandedType) state.expandedTypeKey = state.types.length ? typeKey(state.types[0], 0) : "";
        const hasPickerType = state.types.some((type, index) => typeKey(type, index) === state.pickerTypeKey);
        if (!hasPickerType) state.pickerTypeKey = state.expandedTypeKey;
        state.loaded = true;
        clearDirty();
        populateBasketSources();
        renderGrid();
        if (state.types.length) loadPickerProducts(true);
        return true;
      } catch (error) {
        state.loaded = false;
        host.innerHTML = '<p class="admin-muted" role="alert">' + esc(error.message || "Não foi possível carregar a grade de cestas.") + '</p><button id="retry-baskets" class="button button-outline" type="button">Tentar novamente</button>';
        return false;
      } finally {
        state.loading = false;
        state.loadPromise = null;
      }
    })();
    state.loadPromise = operation;
    return operation;
  }

  function productMembershipSnapshot() {
    const memberships = new Map();
    state.types.forEach((type) => {
      (type.options || []).forEach((option) => {
        const productId = String(option.product_id || "");
        const typeId = String(type.id || "");
        if (!productId || !typeId) return;
        const ids = memberships.get(productId) || [];
        if (!ids.includes(typeId)) ids.push(typeId);
        memberships.set(productId, ids);
      });
    });
    return {
      types: state.types.map((type) => ({ id: String(type.id || ""), title: String(type.title || ""), sort_order: Number(type.sort_order || 0) })),
      memberships,
      dirty: state.dirty
    };
  }

  async function getProductMembershipData() {
    if (state.loading && state.loadPromise) await state.loadPromise;
    if (state.dirty) return productMembershipSnapshot();
    if (!state.loaded) {
      const loaded = await loadBaskets();
      if (!loaded) throw new Error("Não foi possível carregar os tipos da cesta.");
    }
    return productMembershipSnapshot();
  }

  async function setProductType(productId, productTypeId, product) {
    const id = String(productId || "");
    const targetId = String(productTypeId || "");
    if (!id) throw new Error("Produto inválido.");
    if (state.saving) throw new Error("A grade de cestas está sendo salva. Tente novamente.");
    if (state.dirty) throw new Error("Salve as alterações da grade de cestas antes de alterar o vínculo do produto.");
    if (state.loading && state.loadPromise) await state.loadPromise;
    if (!state.loaded) {
      const loaded = await loadBaskets();
      if (!loaded) throw new Error("Não foi possível carregar os tipos da cesta.");
    }
    if (state.dirty) throw new Error("Salve as alterações da grade de cestas antes de alterar o vínculo do produto.");

    const targetIndex = targetId
      ? state.types.findIndex((type) => String(type.id || "") === targetId)
      : -1;
    if (targetId && targetIndex < 0) throw new Error("A posição selecionada não existe mais. Atualize a lista e tente novamente.");
    const memberships = state.types.filter((type) => (type.options || []).some((option) => String(option.product_id) === id));
    if (targetId && memberships.length === 1 && String(memberships[0].id || "") === targetId) return productMembershipSnapshot();
    if (!targetId && memberships.length === 0) return productMembershipSnapshot();

    const previousOption = state.types.flatMap((type) => type.options || []).find((option) => String(option.product_id) === id);
    const nextTypes = state.types.map((type) => ({
      ...type,
      options: (type.options || []).filter((option) => String(option.product_id) !== id)
    }));
    if (targetIndex >= 0) {
      const target = nextTypes[targetIndex];
      const existingTarget = state.types[targetIndex].options.find((option) => String(option.product_id) === id);
      target.options.push(existingTarget || previousOption || {
        product_id: id,
        product: product || productCache.get(id) || {},
        metadata: {}
      });
    }
    const emptiedRequiredType = nextTypes.find((type) =>
      (type.options || []).length === 0 &&
      Object.values(type.quantities || {}).some((quantity) => Number(quantity || 0) > 0)
    );
    if (emptiedRequiredType) {
      throw new Error("Não é possível remover o último produto da posição “" + (emptiedRequiredType.title || "sem título") + "” enquanto ela estiver incluída em uma cesta. Adicione outra opção ou ajuste a grade primeiro.");
    }

    const previousTypes = state.types;
    state.types = nextTypes;
    markDirty();
    renderGrid();
    const saved = await saveGrid();
    if (saved !== true) {
      const reloaded = await loadBaskets();
      if (!reloaded) {
        state.types = previousTypes;
        state.loaded = false;
        clearDirty();
        throw new Error("Não foi possível confirmar o vínculo salvo. Atualize a página e tente novamente.");
      }
      const persistedMemberships = state.types.filter((type) =>
        (type.options || []).some((option) => String(option.product_id) === id)
      );
      const persistedMatches = targetId
        ? persistedMemberships.length === 1 && String(persistedMemberships[0].id || "") === targetId
        : persistedMemberships.length === 0;
      if (!persistedMatches) {
        throw new Error("O vínculo não foi alterado. Confira a grade de cestas e tente novamente.");
      }
    }
    return productMembershipSnapshot();
  }

  function addType() {
    if (state.types.length >= 80) {
      toast("A grade aceita até 80 tipos de produto.");
      return;
    }
    const key = "new-" + Date.now().toString(36) + "-" + state.types.length;
    state.types.push({
      id: null,
      _key: key,
      title: "",
      sort_order: state.types.length,
      options: [],
      quantities: Object.fromEntries(state.baskets.map((basket) => [basket.id, 0])),
    });
    state.expandedTypeKey = key;
    state.pickerTypeKey = key;
    markDirty();
    renderGrid();
    const row = document.getElementById("basket-type-" + key);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
    row?.querySelector("[data-type-title]")?.focus();
    if (!state.pickerProducts.length && !state.pickerLoading) loadPickerProducts(true);
  }

  function openPicker(key) {
    const type = findType(key);
    if (!type) return;
    state.expandedTypeKey = String(key);
    state.pickerTypeKey = String(key);
    renderGrid();
    $("picker-type-select").value = String(key);
    document.getElementById("basket-type-" + key)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    $("picker-query")?.focus({ preventScroll: true });
    if (!state.pickerProducts.length && !state.pickerLoading) loadPickerProducts(true);
  }

  function loadPickerProducts(reset) {
    const host = $("picker-results");
    if (!host) return;
    if (reset) {
      state.pickerOffset = 0;
      state.pickerTotal = 0;
      state.pickerProducts = [];
      state.pickerError = "";
      state.pickerRequestId += 1;
    } else if (state.pickerLoading || state.pickerOffset >= state.pickerTotal) {
      return;
    }
    const requestId = state.pickerRequestId;
    state.pickerLoading = true;
    renderPickerResults();
    const params = {
      q: state.pickerQuery,
      status: state.pickerStatus,
      offset: reset ? 0 : state.pickerOffset,
      limit: 24,
    };
    if (state.pickerStockOnly) params.segment = "substitution";
    request("products", { params }).then((data) => {
      if (requestId !== state.pickerRequestId) return;
      const products = data.products || [];
      state.pickerTotal = Number(data.total || 0);
      products.forEach((product) => productCache.set(String(product.id), product));
      state.pickerProducts = reset ? products : state.pickerProducts.concat(products);
      state.pickerOffset = (reset ? 0 : state.pickerOffset) + products.length;
      state.pickerError = "";
    }).catch((error) => {
      if (requestId !== state.pickerRequestId) return;
      state.pickerError = error.message || "Falha ao buscar produtos.";
    }).finally(() => {
      if (requestId !== state.pickerRequestId) return;
      state.pickerLoading = false;
      renderPickerResults();
    });
  }

  function addPickerProduct(productId) {
    const id = String(productId || "");
    const targetIndex = state.types.findIndex((type, index) => typeKey(type, index) === state.pickerTypeKey);
    if (!id || targetIndex < 0) return;
    const target = state.types[targetIndex];
    if ((target.options || []).some((option) => String(option.product_id) === id)) return;

    const previousOption = state.types.flatMap((type) => type.options || []).find((option) => String(option.product_id) === id);
    const product = productCache.get(id) || previousOption?.product || {};
    const nextTypes = state.types.map((type) => ({ ...type, options: (type.options || []).slice() }));
    const previousDefaults = new Map(nextTypes.map((type) => {
      const defaultId = String(type.default_product_id || type.options[0]?.product_id || "");
      const defaultOption = type.options.find((option) => String(option.product_id) === defaultId);
      return [type, { id: defaultId, price: defaultOption ? optionPriceCents(defaultOption) : null }];
    }));
    nextTypes.forEach((type) => {
      type.options = type.options.filter((option) => String(option.product_id) !== id);
    });
    const emptiedRequiredType = nextTypes.find((type) =>
      (type.options || []).length === 0 && Object.values(type.quantities || {}).some((quantity) => Number(quantity || 0) > 0)
    );
    if (emptiedRequiredType) {
      toast("Não é possível mover o último produto da posição “" + (emptiedRequiredType.title || "sem título") + "” enquanto ela estiver incluída em uma cesta. Adicione outra opção primeiro.");
      return;
    }
    nextTypes.forEach((type) => {
      const oldDefault = previousDefaults.get(type);
      if (oldDefault?.id === id) setTypeDefault(type, "", oldDefault.price);
    });
    const nextTarget = nextTypes[targetIndex];
    nextTarget.options.push(previousOption || { product_id: id, product, metadata: {} });
    if (nextTarget.options.length === 1) setTypeDefault(nextTarget, id);
    state.types = nextTypes;
    state.expandedTypeKey = state.pickerTypeKey;
    markDirty();
    renderGrid();
    toast("Produto adicionado ao carrossel.");
  }

  function moveOption(typeKeyValue, productId, delta) {
    const type = findType(typeKeyValue);
    if (!type) return;
    const options = type.options || [];
    const defaultId = String(type.default_product_id || options[0]?.product_id || "");
    const index = options.findIndex((option) => String(option.product_id) === String(productId));
    const nextIndex = index + delta;
    if (index <= 0 || String(productId) === defaultId || nextIndex <= 0 || nextIndex >= options.length) return;
    [options[index], options[nextIndex]] = [options[nextIndex], options[index]];
    state.expandedTypeKey = String(typeKeyValue);
    markDirty();
    renderGrid();
  }

  function reorderOption(typeKeyValue, productId, targetProductId) {
    const type = findType(typeKeyValue);
    if (!type) return;
    const options = type.options || [];
    const defaultId = String(type.default_product_id || options[0]?.product_id || "");
    if (String(productId) === defaultId || String(targetProductId) === defaultId || String(productId) === String(targetProductId)) return;
    const from = options.findIndex((option) => String(option.product_id) === String(productId));
    const to = options.findIndex((option) => String(option.product_id) === String(targetProductId));
    if (from <= 0 || to <= 0) return;
    const [item] = options.splice(from, 1);
    const targetIndex = options.findIndex((option) => String(option.product_id) === String(targetProductId));
    options.splice(targetIndex, 0, item);
    state.expandedTypeKey = String(typeKeyValue);
    markDirty();
    renderGrid();
  }

  function moveType(key, delta) {
    const index = state.types.findIndex((type, itemIndex) => typeKey(type, itemIndex) === String(key));
    const next = index + delta;
    if (index < 0 || next < 0 || next >= state.types.length) return;
    const item = state.types.splice(index, 1)[0];
    state.types.splice(next, 0, item);
    markDirty();
    renderGrid();
  }

  function parseQuantity(value) {
    if (value === "" || value == null) return 0;
    const number = Number(String(value).replace(",", "."));
    return Number.isInteger(number) ? number : null;
  }

  async function saveGrid() {
    if (state.saving) return false;
    const button = $("save-basket-grid");
    const payload = [];
    for (const [index, type] of state.types.entries()) {
      const title = String(type.title || "").trim();
      if (!title) {
        toast("Informe o título de cada tipo de produto.");
        document.getElementById("basket-type-" + typeKey(type, index))?.querySelector("[data-type-title]")?.focus();
        return false;
      }
      const quantities = {};
      for (const basket of state.baskets) {
        const value = parseQuantity(type.quantities?.[basket.id]);
        if (value == null || value < 0 || value > 999) {
          toast("Informe uma quantidade inteira de 0 a 999 para " + title + " na cesta " + basket.name + ".");
          return false;
        }
        quantities[basket.id] = value;
      }
      if (Object.values(quantities).some((quantity) => quantity > 0) && !type.options?.length) {
        toast("Adicione uma variação para “" + title + "” ou deixe sua quantidade em zero em todas as cestas.");
        document.getElementById("basket-type-" + typeKey(type, index))?.scrollIntoView({ behavior: "smooth", block: "center" });
        return false;
      }
      payload.push({
        id: type.id || null,
        title,
        quantities,
        default_product_id: type.default_product_id || type.options[0]?.product_id || null,
        options: type.options.map((option) => ({ product_id: option.product_id, metadata: option.metadata || {} })),
      });
    }
    if (!payload.length) {
      toast("Adicione pelo menos um tipo de produto.");
      return false;
    }
    const basketPrices = {};
    for (const basket of state.baskets) {
      const price = parsePriceCents(basket.default_price_value ?? priceInputValue(basket.default_price_cents));
      if (price == null) {
        toast("Informe um valor entre R$ 0,00 e R$ 1.000.000,00 para “" + basket.name + "”.");
        document.querySelector('[data-basket-price="' + basket.id + '"]')?.focus();
        return false;
      }
      basketPrices[basket.id] = price;
    }
    state.saving = true;
    if (button) {
      button.disabled = true;
      button.textContent = "Salvando…";
    }
    try {
      await request("basket_grid_save", { method: "POST", body: { types: payload, basket_prices: basketPrices } });
      toast("Grade de cestas salva.");
      if (!await loadBaskets()) return false;
      return true;
    } catch (error) {
      toast(error.message || "Não foi possível salvar a grade de cestas.");
      return false;
    } finally {
      state.saving = false;
      if (button) {
        button.disabled = false;
        button.textContent = "Salvar alterações";
      }
    }
  }

  async function productSaved(product) {
    const productId = String(product.id);
    const wasDirty = state.dirty;
    productCache.set(productId, product);

    const affectedDefaults = [];
    state.types.forEach((type) => {
      const options = type.options || [];
      const currentDefaultId = String(type.default_product_id || options[0]?.product_id || "");
      const currentDefault = options.find((option) => String(option.product_id) === currentDefaultId);
      const previousDefaultPrice = currentDefault ? optionPriceCents(currentDefault) : null;
      if (!options.some((option) => String(option.product_id) === productId)) return;
      options.forEach((option) => {
        if (String(option.product_id) === productId) option.product = product;
      });
      if (!canSelectAsBasketDefault(product) && currentDefaultId === productId) {
        setTypeDefault(type, "", previousDefaultPrice);
        affectedDefaults.push(type);
      }
    });

    let defaultsSynced = affectedDefaults.length === 0;
    if (affectedDefaults.length && !wasDirty) {
      try {
        const currentGrid = await request("basket_grid", { params: {} });
        const remoteTypes = new Map((currentGrid.types || []).map((type) => [String(type.id), type]));
        defaultsSynced = affectedDefaults.every((type) => {
          const remote = remoteTypes.get(String(type.id));
          const remoteId = String(remote?.default_product_id || "");
          const option = type.options.find((item) => String(item.product_id) === remoteId);
          if (!option || optionProduct(option).is_active === false) return false;
          setTypeDefault(type, remoteId);
          return true;
        });
      } catch (_) {
        defaultsSynced = false;
      }
    }
    if (affectedDefaults.length && (wasDirty || !defaultsSynced)) markDirty();

    state.types.forEach((type, index) => {
      const row = document.getElementById("basket-type-" + typeKey(type, index));
      const variations = row?.querySelector(".basket-grid-variations");
      if (!variations) return;
      const previousOptions = variations.querySelector(".basket-grid-options");
      const scrollTop = previousOptions?.scrollTop || 0;
      variations.innerHTML = renderOptions(type, typeKey(type, index));
      const updatedOptions = variations.querySelector(".basket-grid-options");
      if (updatedOptions) updatedOptions.scrollTop = scrollTop;
    });

    updateBasketProductSums();
    renderPickerResults();
  }

  function bind() {
    document.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.id === "retry-baskets") { loadBaskets(); return; }
      if (target.id === "add-basket-type") { addType(); return; }
      if (target.id === "add-basket-template") { openCreateBasketDialog(); return; }
      if (target.dataset.activateBasket) { activateBasket(target.dataset.activateBasket); return; }
      if (target.id === "reload-baskets") {
        if (state.dirty && !window.confirm("Há alterações não salvas. Atualizar e descartá-las?")) return;
        loadBaskets(); return;
      }
      if (target.id === "save-basket-grid") { saveGrid(); return; }
      if (target.dataset.toggleType != null) {
        const key = String(target.dataset.toggleType);
        state.expandedTypeKey = state.expandedTypeKey === key ? "" : key;
        if (state.expandedTypeKey) state.pickerTypeKey = key;
        renderGrid();
        return;
      }
      if (target.dataset.addVariation != null) { openPicker(target.dataset.addVariation); return; }
      if (target.dataset.addPickerProduct != null) { addPickerProduct(target.dataset.addPickerProduct); return; }
      if (target.dataset.moveOption != null) { moveOption(target.dataset.typeKey, target.dataset.productId, Number(target.dataset.moveOption)); return; }
      if (target.dataset.moveType != null) { moveType(target.dataset.typeKey, Number(target.dataset.moveType)); return; }
      if (target.dataset.removeOption != null) {
        const type = findType(target.dataset.typeKey);
        if (!type) return;
        const productId = String(target.dataset.productId);
        if (type.options.length === 1 && Object.values(type.quantities || {}).some((quantity) => Number(quantity || 0) > 0)) {
          toast("Esta é a única opção de “" + (type.title || "sem título") + "” usada nas cestas. Adicione uma alternativa antes de removê-la.");
          return;
        }
        const currentDefault = String(type.default_product_id || type.options[0]?.product_id || "");
        const oldOption = type.options.find((option) => String(option.product_id) === currentDefault);
        const oldPrice = oldOption ? optionPriceCents(oldOption) : null;
        type.options = type.options.filter((option) => String(option.product_id) !== productId);
        if (productId === currentDefault) setTypeDefault(type, "", oldPrice);
        markDirty();
        renderGrid();
        return;
      }
      if (target.dataset.deleteType != null) {
        const type = findType(target.dataset.deleteType);
        if (!type) return;
        if (!window.confirm("Excluir o tipo “" + (type.title || "sem título") + "” e removê-lo das cestas?")) return;
        state.types = state.types.filter((item, index) => typeKey(item, index) !== target.dataset.deleteType);
        if (state.expandedTypeKey === target.dataset.deleteType) state.expandedTypeKey = state.types[0] ? typeKey(state.types[0], 0) : "";
        if (state.pickerTypeKey === target.dataset.deleteType) state.pickerTypeKey = state.expandedTypeKey;
        markDirty();
        renderGrid();
        return;
      }
      if (target.dataset.editProduct) openProduct(productCache.get(String(target.dataset.editProduct)));
      if (target.id === "picker-more") loadPickerProducts(false);
      if (target.dataset.dialogClose === "basket-create-dialog") $("basket-create-dialog").close();
    });

    $("admin-baskets").addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.matches("[data-default-option]") || !input.checked) return;
      const type = findType(input.dataset.typeKey);
      if (!type) return;
      const selected = type.options.find((option) => String(option.product_id) === String(input.dataset.productId));
      if (!selected || !canSelectAsBasketDefault(optionProduct(selected))) return;
      setTypeDefault(type, input.dataset.productId);
      state.expandedTypeKey = input.dataset.typeKey;
      markDirty();
      renderGrid();
    });

    $("admin-baskets").addEventListener("input", (event) => {
      const key = event.target.dataset.typeTitle || event.target.dataset.typeQuantity;
      if (!key) return;
      const type = findType(key);
      if (!type) return;
      if (event.target.dataset.typeTitle != null) {
        type.title = event.target.value;
        const heading = document.querySelector('[data-type-heading="' + CSS.escape(String(key)) + '"]');
        if (heading) heading.textContent = type.title || "Novo tipo";
        syncPickerTypeSelect();
      }
      markDirty();
      if (event.target.dataset.typeQuantity != null) {
        const quantity = parseQuantity(event.target.value);
        type.quantities[event.target.dataset.basketId] = quantity == null ? event.target.value : quantity;
        updateBasketProductSums();
      }
    });

    document.addEventListener("input", (event) => {
      if (event.target.dataset.basketPrice == null) return;
      const basket = state.baskets.find((item) => String(item.id) === String(event.target.dataset.basketPrice));
      if (basket) basket.default_price_value = event.target.value;
      updateBasketProductSums();
      markDirty();
    });

    $("basket-create-form").addEventListener("submit", createBasketDraft);

    $("picker-search").addEventListener("submit", (event) => {
      event.preventDefault();
      state.pickerQuery = $("picker-query").value.trim();
      loadPickerProducts(true);
    });
    $("picker-query").addEventListener("input", () => {
      state.pickerQuery = $("picker-query").value.trim();
      window.clearTimeout(state.pickerDebounce);
      state.pickerDebounce = window.setTimeout(() => loadPickerProducts(true), 280);
    });
    $("picker-status").addEventListener("change", () => {
      state.pickerStatus = $("picker-status").value;
      loadPickerProducts(true);
    });
    $("picker-stock-only").addEventListener("change", () => {
      state.pickerStockOnly = $("picker-stock-only").checked;
      loadPickerProducts(true);
    });
    $("picker-type-select").addEventListener("change", () => {
      state.pickerTypeKey = $("picker-type-select").value;
      renderPickerResults();
    });

    const list = $("admin-baskets");
    list.addEventListener("dragstart", (event) => {
      const card = event.target.closest(".basket-grid-option[draggable=" + CSS.escape("true") + "]");
      if (!card || card.dataset.isDefault === "true") { event.preventDefault(); return; }
      state.draggedOption = { typeKey: card.dataset.typeKey, productId: card.dataset.optionId };
      card.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.dataset.optionId);
    });
    list.addEventListener("dragover", (event) => {
      const card = event.target.closest(".basket-grid-option");
      if (!state.draggedOption || !card || card.dataset.typeKey !== state.draggedOption.typeKey || card.dataset.isDefault === "true") return;
      event.preventDefault();
      card.classList.add("is-drop-target");
    });
    list.addEventListener("dragleave", (event) => event.target.closest(".basket-grid-option")?.classList.remove("is-drop-target"));
    list.addEventListener("drop", (event) => {
      const card = event.target.closest(".basket-grid-option");
      if (!state.draggedOption || !card || card.dataset.typeKey !== state.draggedOption.typeKey) return;
      event.preventDefault();
      reorderOption(state.draggedOption.typeKey, state.draggedOption.productId, card.dataset.optionId);
    });
    list.addEventListener("dragend", () => {
      state.draggedOption = null;
      list.querySelectorAll(".is-dragging, .is-drop-target").forEach((card) => card.classList.remove("is-dragging", "is-drop-target"));
    });
    document.addEventListener("error", (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.matches("[data-basket-product-image]")) return;
      image.hidden = true;
      const placeholder = image.nextElementSibling;
      if (placeholder?.classList.contains("basket-product-photo-placeholder")) placeholder.hidden = false;
    }, true);
  }

  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  bind();
  window.DonaBasketAdmin = { loadBaskets, productSaved, getProductMembershipData, setProductType };
})();
