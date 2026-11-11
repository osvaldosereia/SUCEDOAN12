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
    pickerSelected: new Set(),
    loading: false,
    saving: false,
  };

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

  function productStatus(product) {
    if (product?.is_active === true) return { text: "Ativo", className: "is-active" };
    if (product?.is_active === false) return { text: "Inativo", className: "is-inactive" };
    return { text: "Status indisponível", className: "is-unknown" };
  }

  function renderOptions(type, key) {
    const options = Array.isArray(type.options) ? type.options : [];
    const list = options.map((option, index) => {
      const product = option.product || productCache.get(String(option.product_id)) || {};
      const status = productStatus(product);
      const price = product.effective_price_cents ?? effectivePrice(product);
      const stock = product.stock == null ? "Estoque não informado" : "Estoque " + quantityValue(product.stock);
      const brand = product.brand ? " · " + esc(product.brand) : "";
      const defaultBadge = index === 0 ? ' <small class="basket-grid-default">Padrão</small>' : "";
      return '<div class="basket-grid-option">' +
        '<span class="basket-grid-option-order" aria-label="Opção ' + (index + 1) + '">' + (index + 1) + '</span>' +
        '<div class="basket-grid-option-copy"><strong>' + esc(product.name || "Produto") + brand + defaultBadge + '</strong><span>' + money(price) + '/un. · ' + esc(stock) + '</span><small class="basket-option-status ' + status.className + '">' + status.text + '</small></div>' +
        '<div class="basket-grid-option-actions">' +
          '<button class="text-button" type="button" data-move-option="-1" data-type-key="' + esc(key) + '" data-product-id="' + esc(option.product_id) + '" aria-label="Subir opção ' + esc(product.name || "Produto") + '"' + (index === 0 ? " disabled" : "") + '>↑</button>' +
          '<button class="text-button" type="button" data-move-option="1" data-type-key="' + esc(key) + '" data-product-id="' + esc(option.product_id) + '" aria-label="Descer opção ' + esc(product.name || "Produto") + '"' + (index === options.length - 1 ? " disabled" : "") + '>↓</button>' +
          '<button class="text-button danger-text" type="button" data-remove-option="true" data-type-key="' + esc(key) + '" data-product-id="' + esc(option.product_id) + '" aria-label="Remover ' + esc(product.name || "Produto") + '">×</button>' +
          '<button class="text-button product-edit-mini" type="button" data-edit-product="' + esc(option.product_id) + '">Editar</button>' +
        '</div></div>';
    }).join("");
    return '<div class="basket-grid-options">' + (list || '<p class="admin-muted">Nenhuma variação cadastrada.</p>') + '</div>' +
      '<button class="button button-outline basket-grid-add-option" type="button" data-add-variation="' + esc(key) + '">' + (options.length ? "Gerenciar variações" : "Adicionar variações") + '</button>';
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
  }

  function renderGrid() {
    const host = $("admin-baskets");
    if (!host) return;
    const baskets = state.baskets || [];
    const types = state.types || [];
    const prices = '<section class="basket-default-prices" aria-labelledby="basket-default-prices-title">' +
      '<div class="basket-default-prices-heading"><h3 id="basket-default-prices-title">Valores padrão das cestas</h3><p>Preço exibido inicialmente no site. As variações podem alterar o total.</p></div>' +
      '<div class="basket-default-prices-grid">' + baskets.map((basket) => {
        const cost = basketProductsCostSummary(basket.id);
        return '<label class="basket-default-price"><span>' + esc(basket.name) + '</span><span class="basket-default-price-input"><span>R$</span><input type="number" min="0" max="1000000" step="0.01" inputmode="decimal" value="' + esc(priceInputValue(basket.default_price_value ?? basket.default_price_cents)) + '" data-basket-price="' + esc(basket.id) + '" aria-label="Valor padrão da cesta ' + esc(basket.name) + '"></span><small class="basket-default-price-sum" data-basket-product-sum="' + esc(basket.id) + '" aria-live="polite">Soma de venda: <strong>' + money(basketProductsSumCents(basket.id)) + '</strong></small><small class="basket-default-price-sum basket-default-price-cost" data-basket-product-cost="' + esc(basket.id) + '" data-incomplete="' + (cost.missingProducts ? "true" : "false") + '" aria-live="polite"><span class="basket-default-price-cost-label">' + (cost.missingProducts ? "Custo parcial:" : "Soma de custo:") + '</span><strong>' + money(cost.totalCents) + '</strong><span class="basket-default-price-cost-note">' + (cost.missingProducts ? " · " + cost.missingProducts + (cost.missingProducts === 1 ? " produto sem custo" : " produtos sem custo") : "") + '</span></small></label>';
      }).join("") + '</div></section>';
    if (!types.length) {
      host.innerHTML = prices + '<p class="admin-muted basket-grid-empty">Nenhum tipo cadastrado. Adicione um tipo para começar a montar as cestas.</p>';
      return;
    }
    const headers = baskets.map((basket) => '<th scope="col"><span>' + esc(basket.name) + '</span><small>unidades</small></th>').join("");
    const rows = types.map((type, index) => {
      const key = typeKey(type, index);
      const quantities = type.quantities || {};
      const quantityCells = baskets.map((basket) => {
        const value = quantityValue(quantities[basket.id]);
        return '<td><label class="basket-grid-quantity"><span class="visually-hidden">Quantidade de ' + esc(type.title || "tipo") + ' na cesta ' + esc(basket.name) + '</span><input type="number" min="0" max="999" step="1" value="' + esc(value) + '" data-type-quantity="' + esc(key) + '" data-basket-id="' + esc(basket.id) + '"></label></td>';
      }).join("");
      return '<tr id="basket-type-' + esc(key) + '">' +
        '<th scope="row"><div class="basket-grid-title-cell"><div class="basket-grid-order">' +
          '<button class="text-button" type="button" data-move-type="-1" data-type-key="' + esc(key) + '" aria-label="Subir tipo"' + (index === 0 ? " disabled" : "") + '>↑</button>' +
          '<button class="text-button" type="button" data-move-type="1" data-type-key="' + esc(key) + '" aria-label="Descer tipo"' + (index === types.length - 1 ? " disabled" : "") + '>↓</button>' +
        '</div><label class="basket-grid-title-field"><span>Título exibido no site</span><input type="text" maxlength="180" placeholder="Ex.: Arroz" value="' + esc(type.title || "") + '" data-type-title="' + esc(key) + '"></label>' +
        '<button class="text-button danger-text" type="button" data-delete-type="' + esc(key) + '">Excluir tipo</button></div></th>' +
        '<td class="basket-grid-variations">' + renderOptions(type, key) + '</td>' + quantityCells + '</tr>';
    }).join("");
    host.innerHTML = prices + '<div class="basket-grid-table-wrap"><table class="basket-grid-table"><thead><tr><th scope="col">Tipo e título</th><th scope="col">Variações · ordem de substituição</th>' + headers + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  async function loadBaskets() {
    const host = $("admin-baskets");
    if (!host || state.loading) return;
    state.loading = true;
    host.innerHTML = '<p class="admin-muted">Carregando tipos e cestas…</p>';
    try {
      const data = await request("basket_grid", { params: {} });
      state.baskets = (data.baskets || []).map((basket) => ({
        ...basket,
        default_price_value: priceInputValue(basket.default_price_cents),
      }));
      state.types = (data.types || []).map((type, index) => ({
        ...type,
        _key: type.id || ("loaded-" + index),
        options: (type.options || []).map((option) => {
          if (option.product) productCache.set(String(option.product_id), option.product);
          return option;
        }),
        quantities: Object.fromEntries(state.baskets.map((basket) => [basket.id, Number(type.quantities?.[basket.id] || 0)])),
      }));
      renderGrid();
    } catch (error) {
      host.innerHTML = '<p class="admin-muted" role="alert">' + esc(error.message || "Não foi possível carregar a grade de cestas.") + '</p><button id="retry-baskets" class="button button-outline" type="button">Tentar novamente</button>';
    } finally {
      state.loading = false;
    }
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
    renderGrid();
    const row = document.getElementById("basket-type-" + key);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
    row?.querySelector("[data-type-title]")?.focus();
  }

  async function openPicker(key) {
    const type = findType(key);
    if (!type) return;
    state.pickerTypeKey = String(key);
    state.pickerSelected = new Set((type.options || []).map((option) => String(option.product_id)));
    state.pickerQuery = "";
    state.pickerOffset = 0;
    $("picker-query").value = "";
    $("picker-results").innerHTML = '<p class="admin-muted">Carregando produtos…</p>';
    if (!$("product-picker-dialog").open) $("product-picker-dialog").showModal();
    await loadPickerProducts(true);
  }

  async function loadPickerProducts(reset) {
    if (reset) state.pickerOffset = 0;
    const host = $("picker-results");
    if (reset) host.innerHTML = '<p class="admin-muted">Buscando…</p>';
    try {
      const data = await request("products", { params: { q: state.pickerQuery, status: "all", offset: state.pickerOffset, limit: 24 } });
      state.pickerTotal = Number(data.total || 0);
      (data.products || []).forEach((product) => productCache.set(String(product.id), product));
      const rows = (data.products || []).map((product) => '<label class="picker-product-row">' +
        '<input type="checkbox" value="' + esc(product.id) + '" data-picker-product ' + (state.pickerSelected.has(String(product.id)) ? "checked" : "") + '>' +
        '<span><strong>' + esc(product.name) + '</strong><small>' + esc([product.brand, product.sku && ("SKU " + product.sku), product.is_active ? "Ativo" : "Inativo"].filter(Boolean).join(" · ")) + '</small></span><b>' + money(product.effective_price_cents ?? effectivePrice(product)) + '</b></label>').join("");
      if (reset) host.innerHTML = "";
      if (!(data.products || []).length && reset) host.innerHTML = '<p class="admin-muted">Nenhum produto encontrado.</p>';
      host.insertAdjacentHTML("beforeend", rows);
      state.pickerOffset += (data.products || []).length;
      $("picker-more").hidden = state.pickerOffset >= state.pickerTotal;
    } catch (error) {
      host.innerHTML = '<p class="admin-muted" role="alert">' + esc(error.message || "Falha ao buscar produtos.") + '</p>';
    }
  }

  function applyPicker() {
    const type = findType(state.pickerTypeKey);
    if (!type) return;
    const previous = new Map((type.options || []).map((option) => [String(option.product_id), option]));
    const selected = (type.options || []).filter((option) => state.pickerSelected.has(String(option.product_id)));
    const added = [...state.pickerSelected]
      .filter((id) => !previous.has(id))
      .map((id) => ({ product_id: id, product: productCache.get(id) || {}, metadata: {} }));
    type.options = [...selected, ...added];
    $("product-picker-dialog").close();
    renderGrid();
  }

  function moveType(key, delta) {
    const index = state.types.findIndex((type, itemIndex) => typeKey(type, itemIndex) === String(key));
    const next = index + delta;
    if (index < 0 || next < 0 || next >= state.types.length) return;
    const item = state.types.splice(index, 1)[0];
    state.types.splice(next, 0, item);
    renderGrid();
  }

  function moveOption(key, productId, delta) {
    const type = findType(key);
    if (!type) return;
    const index = type.options.findIndex((option) => String(option.product_id) === String(productId));
    const next = index + delta;
    if (index < 0 || next < 0 || next >= type.options.length) return;
    const option = type.options.splice(index, 1)[0];
    type.options.splice(next, 0, option);
    renderGrid();
  }

  function parseQuantity(value) {
    if (value === "" || value == null) return 0;
    const number = Number(String(value).replace(",", "."));
    return Number.isInteger(number) ? number : null;
  }

  async function saveGrid() {
    if (state.saving) return;
    const button = $("save-basket-grid");
    const payload = [];
    for (const [index, type] of state.types.entries()) {
      const title = String(type.title || "").trim();
      if (!title) {
        toast("Informe o título de cada tipo de produto.");
        document.getElementById("basket-type-" + typeKey(type, index))?.querySelector("[data-type-title]")?.focus();
        return;
      }
      const quantities = {};
      for (const basket of state.baskets) {
        const value = parseQuantity(type.quantities?.[basket.id]);
        if (value == null || value < 0 || value > 999) {
          toast("Informe uma quantidade inteira de 0 a 999 para " + title + " na cesta " + basket.name + ".");
          return;
        }
        quantities[basket.id] = value;
      }
      if (Object.values(quantities).some((quantity) => quantity > 0) && !type.options?.length) {
        toast("Adicione uma variação para “" + title + "” ou deixe sua quantidade em zero em todas as cestas.");
        document.getElementById("basket-type-" + typeKey(type, index))?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      payload.push({
        id: type.id || null,
        title,
        quantities,
        options: type.options.map((option) => ({ product_id: option.product_id, metadata: option.metadata || {} })),
      });
    }
    if (!payload.length) {
      toast("Adicione pelo menos um tipo de produto.");
      return;
    }
    const basketPrices = {};
    for (const basket of state.baskets) {
      const price = parsePriceCents(basket.default_price_value ?? priceInputValue(basket.default_price_cents));
      if (price == null) {
        toast("Informe um valor entre R$ 0,00 e R$ 1.000.000,00 para “" + basket.name + "”.");
        document.querySelector('[data-basket-price="' + basket.id + '"]')?.focus();
        return;
      }
      basketPrices[basket.id] = price;
    }
    state.saving = true;
    button.disabled = true;
    button.textContent = "Salvando…";
    try {
      await request("basket_grid_save", { method: "POST", body: { types: payload, basket_prices: basketPrices } });
      toast("Grade de cestas salva.");
      await loadBaskets();
    } catch (error) {
      toast(error.message || "Não foi possível salvar a grade de cestas.");
    } finally {
      state.saving = false;
      button.disabled = false;
      button.textContent = "Salvar alterações";
    }
  }

  async function productSaved(product) {
    const productId = String(product.id);
    productCache.set(productId, product);

    state.types.forEach((type, index) => {
      const options = type.options || [];
      if (!options.some((option) => String(option.product_id) === productId)) return;
      options.forEach((option) => {
        if (String(option.product_id) === productId) option.product = product;
      });

      const row = document.getElementById("basket-type-" + typeKey(type, index));
      const variations = row?.querySelector(".basket-grid-variations");
      if (!variations) return;
      const previousOptions = variations.querySelector(".basket-grid-options");
      const scrollTop = previousOptions?.scrollTop || 0;
      variations.innerHTML = renderOptions(type, typeKey(type, index));
      const updatedOptions = variations.querySelector(".basket-grid-options");
      if (updatedOptions) updatedOptions.scrollTop = scrollTop;
    });

    // Keep the unsaved basket draft; reloading basket_grid here discarded it.
    updateBasketProductSums();
  }

  function bind() {
    document.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.id === "retry-baskets") { loadBaskets(); return; }
      if (target.id === "add-basket-type") { addType(); return; }
      if (target.id === "reload-baskets") { loadBaskets(); return; }
      if (target.id === "save-basket-grid") { saveGrid(); return; }
      if (target.dataset.addVariation != null) { openPicker(target.dataset.addVariation); return; }
      if (target.dataset.moveType != null) { moveType(target.dataset.typeKey, Number(target.dataset.moveType)); return; }
      if (target.dataset.moveOption != null) { moveOption(target.dataset.typeKey, target.dataset.productId, Number(target.dataset.moveOption)); return; }
      if (target.dataset.removeOption != null) {
        const type = findType(target.dataset.typeKey);
        if (type) type.options = type.options.filter((option) => String(option.product_id) !== String(target.dataset.productId));
        renderGrid();
        return;
      }
      if (target.dataset.deleteType != null) {
        const type = findType(target.dataset.deleteType);
        if (!type) return;
        if (!window.confirm("Excluir o tipo “" + (type.title || "sem título") + "” e removê-lo das cestas?")) return;
        state.types = state.types.filter((item, index) => typeKey(item, index) !== target.dataset.deleteType);
        renderGrid();
        return;
      }
      if (target.dataset.editProduct) openProduct(productCache.get(String(target.dataset.editProduct)));
      if (target.id === "picker-more") loadPickerProducts(false);
      if (target.id === "apply-picker-products") applyPicker();
      if (target.dataset.dialogClose === "product-picker-dialog") $("product-picker-dialog").close();
    });

    $("admin-baskets").addEventListener("input", (event) => {
      if (event.target.dataset.basketPrice != null) {
        const basket = state.baskets.find((item) => String(item.id) === String(event.target.dataset.basketPrice));
        if (basket) basket.default_price_value = event.target.value;
        return;
      }
      const key = event.target.dataset.typeTitle || event.target.dataset.typeQuantity;
      if (!key) return;
      const type = findType(key);
      if (!type) return;
      if (event.target.dataset.typeTitle != null) type.title = event.target.value;
      if (event.target.dataset.typeQuantity != null) {
        const quantity = parseQuantity(event.target.value);
        type.quantities[event.target.dataset.basketId] = quantity == null ? event.target.value : quantity;
        updateBasketProductSums();
      }
    });

    $("picker-search").addEventListener("submit", (event) => {
      event.preventDefault();
      state.pickerQuery = $("picker-query").value.trim();
      loadPickerProducts(true);
    });
    $("picker-results").addEventListener("change", (event) => {
      if (!event.target.matches("[data-picker-product]")) return;
      const id = String(event.target.value);
      if (event.target.checked) state.pickerSelected.add(id);
      else state.pickerSelected.delete(id);
    });
  }

  bind();
  window.DonaBasketAdmin = { loadBaskets, productSaved };
})();
