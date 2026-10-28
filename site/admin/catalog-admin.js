(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.publishableKey || "";
  const adminCode = () => window.DonaAdminAuth?.getCode?.() || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const cents = (value) => Math.round(Number(value || 0));
  const money = (value) => (cents(value) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const numberFromPrice = (value) => {
    if (value === "" || value == null) return null;
    const number = Number(String(value).replace(",", "."));
    return Number.isFinite(number) ? number : null;
  };
  const priceToCents = (value) => Math.round((numberFromPrice(value) || 0) * 100);
  const state = {
    baskets: [], basket: null, pickerIndex: -1, pickerQuery: "", pickerOffset: 0, pickerTotal: 0,
    pickerSelected: new Set(), productCache: new Map(), productsOffset: 0, productsTotal: 0,
    productsQuery: "", productsStatus: "active", productsSegment: "all", basketsStatus: "active", toastTimer: 0,
  };

  async function request(action, options = {}) {
    const url = new URL(`${supabaseUrl}/functions/v1/site-admin-v1`);
    if (options.method !== "POST") {
      url.searchParams.set("action", action);
      Object.entries(options.params || {}).forEach(([key, value]) => url.searchParams.set(key, String(value ?? "")));
    }
    const headers = { apikey: publishableKey, "x-admin-code": adminCode() };
    const init = { method: options.method || "GET", headers, cache: "no-store" };
    if (options.method === "POST") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify({ action, ...(options.body || {}) });
    }
    const response = await fetch(url.toString(), init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Não foi possível concluir a operação.");
    return data;
  }

  function toast(message) {
    const node = $("admin-toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.classList.remove("show"), 3200);
  }

  function basketProductTotal(basket) {
    return (basket.positions || []).reduce((total, position) => {
      const product = position.options && position.options[0] && position.options[0].product;
      return total + Math.round(Number(product?.effective_price_cents || 0) * Number(position.quantity || 0));
    }, 0);
  }

  function conditionalAdjustment(basket) {
    if (!basket.conditional_hidden_enabled || !basket.conditional_hidden_product_id) return 0;
    const present = (basket.positions || []).some((position) => String(position.options?.[0]?.product_id) === String(basket.conditional_hidden_product_id) && Number(position.quantity) > 0);
    return present ? Number(basket.conditional_hidden_adjustment_cents || 0) : 0;
  }

  function currentBasketPrice(basket) {
    return Math.max(0, basketProductTotal(basket) + Number(basket.hidden_adjustment_cents || 0) + conditionalAdjustment(basket));
  }

  function renderBaskets() {
    const host = $("admin-baskets");
    host.innerHTML = state.baskets.map((basket) => {
      const positions = basket.positions || [];
      const quantity = positions.reduce((sum, position) => sum + Number(position.quantity || 0), 0);
      const options = positions.reduce((sum, position) => sum + (position.options || []).length, 0);
      const normalizedName = String(basket.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const sizeKey = normalizedName.includes("econom") ? "economica" : normalizedName.includes("grande") ? "grande" : normalizedName.includes("media") ? "media" : normalizedName.includes("pequena") ? "pequena" : normalizedName.includes("mini") ? "mini" : "";
      const image = sizeKey ? `../assets/cestas/cesta-${sizeKey}.jpg` : basket.image_url;
      const imageMarkup = image
        ? `<img src="${esc(image)}" alt="" width="76" height="76" loading="lazy" decoding="async">`
        : '<span class="product-image-placeholder">DA</span>';
      const action = basket.is_active === false
        ? `<button class="button button-outline" type="button" data-set-basket-active="true" data-basket-id="${esc(basket.id)}">Reativar</button>`
        : positions.length
          ? `<button class="button button-primary" type="button" data-edit-basket="${esc(basket.id)}">Editar</button>`
          : `<button class="button button-outline danger-button" type="button" data-set-basket-active="false" data-basket-id="${esc(basket.id)}">Desativar kit</button>`;
      const summary = positions.length
        ? `${positions.length} itens · ${quantity} unidades · ${options} opções`
        : "Sem composição cadastrada · não aparece na vitrine";
      const price = positions.length ? money(currentBasketPrice(basket)) : "Sem composição";
      return `<article class="catalog-basket-card">
        ${imageMarkup}
        <div class="catalog-basket-info"><h3>${esc(basket.name)}</h3><span>${summary}</span><strong>${price}</strong></div>
        ${action}
      </article>`;
    }).join("") || '<p class="admin-muted">Nenhuma cesta encontrada.</p>';
  }

  async function loadBaskets() {
    const host = $("admin-baskets");
    if (!host) return;
    host.innerHTML = '<p class="admin-muted">Carregando cestas…</p>';
    try {
      const result = await request("baskets", { params: { status: state.basketsStatus } });
      state.baskets = result.baskets || [];
      renderBaskets();
    } catch (error) {
      host.innerHTML = `<p class="admin-muted">${esc(error.message || "Não foi possível carregar as cestas.")}</p>`;
    }
  }

  function renderPositions() {
    const host = $("basket-position-editor");
    if (!state.basket) return;
    host.innerHTML = (state.basket.positions || []).map((position, index) => {
      const options = position.options || [];
      return `<article class="basket-position-card" data-position="${index}">
        <header><strong>Item ${index + 1}</strong><button class="text-button danger-text" type="button" data-remove-position="${index}">Remover item</button></header>
        <div class="position-fields"><label>Nome do item<input data-position-label="${index}" value="${esc(position.label || "")}" maxlength="180" placeholder="Ex.: Arroz"></label>
          <label>Unidades na cesta<input data-position-quantity="${index}" type="number" min="0.01" max="999" step="0.01" value="${esc(position.quantity ?? 1)}"></label></div>
        <div class="position-options"><strong>Marcas/opções <small>Marque o padrão</small></strong>
          ${options.length ? options.map((option, optionIndex) => {
            const product = option.product || state.productCache.get(String(option.product_id)) || {};
            const status = product.is_active === true ? "Ativo" : product.is_active === false ? "Inativo" : "Status indisponível";
            const statusClass = product.is_active === true ? "is-active" : product.is_active === false ? "is-inactive" : "is-unknown";
            return `<div class="basket-option-row">
              <label class="basket-option-choice">
                <input type="radio" name="basket-default-${index}" value="${esc(option.product_id)}" data-default-option="${index}" ${optionIndex === 0 ? "checked" : ""}>
                <span class="basket-option-copy"><strong>${esc(product.name || "Produto")}${product.brand ? ` · ${esc(product.brand)}` : ""}</strong>
                  <small>${esc(product.sku || "Sem SKU")} · ${money(product.effective_price_cents || 0)}/un.</small>
                  <small class="basket-option-status ${statusClass}">${status}</small></span>
              </label>
              <div class="basket-option-actions">
                <button class="text-button product-edit-mini" type="button" data-edit-product="${esc(option.product_id)}">Editar</button>
                <button class="text-button danger-text" type="button" data-remove-option="${index}" data-product-id="${esc(option.product_id)}" aria-label="Remover opção" title="Remover opção">×</button>
              </div>
            </div>`;
          }).join("") : '<p class="admin-muted">Nenhuma marca selecionada. Adicione produtos para esta posição.</p>'}
        </div>
        <button class="button button-outline button-wide" type="button" data-pick-products="${index}">Buscar e marcar produtos</button>
      </article>`;
    }).join("");
    updateBasketPrice();
  }

  function updateBasketPrice() {
    if (!state.basket) return;
    const priceCents = currentBasketPrice(state.basket);
    $("basket-default-price").value = (priceCents / 100).toFixed(2);
    $("basket-price-hint").textContent = `Produtos padrão: ${money(basketProductTotal(state.basket))} · ajuste da cesta: ${money(state.basket.hidden_adjustment_cents)}. O total será atualizado ao trocar marcas ou quantidades.`;
  }

  function openBasket(basket) {
    state.basket = JSON.parse(JSON.stringify(basket));
    state.basket.positions = state.basket.positions || [];
    state.basket.positions.forEach((position) => (position.options || []).forEach((option) => state.productCache.set(String(option.product_id), option.product || {})));
    $("basket-dialog-title").textContent = `Editar ${basket.name}`;
    $("basket-save-message").textContent = "";
    renderPositions();
    const dialog = $("basket-dialog");
    if (!dialog.open) dialog.showModal();
  }

  function addPosition() {
    if (!state.basket) return;
    state.basket.positions.push({ label: "", quantity: 1, sort_order: state.basket.positions.length, metadata: {}, options: [] });
    renderPositions();
    $("basket-position-editor").lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function openPicker(positionIndex) {
    state.pickerIndex = positionIndex;
    state.pickerSelected = new Set((state.basket.positions[positionIndex].options || []).map((option) => String(option.product_id)));
    state.pickerQuery = "";
    state.pickerOffset = 0;
    $("picker-query").value = "";
    $("picker-results").innerHTML = '<p class="admin-muted">Carregando produtos…</p>';
    $("product-picker-dialog").showModal();
    await loadPickerProducts(true);
  }

  async function loadPickerProducts(reset) {
    if (reset) state.pickerOffset = 0;
    const host = $("picker-results");
    if (reset) host.innerHTML = '<p class="admin-muted">Buscando…</p>';
    try {
      const data = await request("products", { params: { q: state.pickerQuery, status: "all", offset: state.pickerOffset, limit: 24 } });
      state.pickerTotal = Number(data.total || 0);
      (data.products || []).forEach((product) => state.productCache.set(String(product.id), product));
      const rows = (data.products || []).map((product) => `<label class="picker-product-row">
        <input type="checkbox" value="${esc(product.id)}" data-picker-product ${state.pickerSelected.has(String(product.id)) ? "checked" : ""}>
        <span><strong>${esc(product.name)}</strong><small>${esc([product.brand, product.sku && `SKU ${product.sku}`, product.is_active ? "Ativo" : "Inativo"].filter(Boolean).join(" · "))}</small></span><b>${money(product.effective_price_cents ?? effectivePrice(product))}</b>
      </label>`).join("");
      if (reset) host.innerHTML = "";
      if (!rows && reset) host.innerHTML = '<p class="admin-muted">Nenhum produto encontrado.</p>';
      host.insertAdjacentHTML("beforeend", rows);
      state.pickerOffset += (data.products || []).length;
      $("picker-more").hidden = state.pickerOffset >= state.pickerTotal;
    } catch (error) {
      host.innerHTML = `<p class="admin-muted">${esc(error.message || "Falha ao buscar produtos.")}</p>`;
    }
  }

  function effectivePrice(product) {
    const value = product.is_offer && product.offer_price != null ? product.offer_price : product.price;
    return Math.round(Number(value || 0) * 100);
  }

  function applyPicker() {
    const position = state.basket.positions[state.pickerIndex];
    const previous = new Map((position.options || []).map((option) => [String(option.product_id), option]));
    position.options = [...state.pickerSelected].map((id) => {
      const existing = previous.get(id);
      const product = state.productCache.get(id) || existing?.product || {};
      return { product_id: id, product, metadata: existing?.metadata || {} };
    });
    $("product-picker-dialog").close();
    renderPositions();
  }

  function syncProductSearchForm(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  const MOST_SOLD_TAG = "mais-vendidos";
  function isMostSoldTag(value) {
    return String(value || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("pt-BR")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === MOST_SOLD_TAG;
  }
  function isMostSoldProduct(product) {
    const tags = Array.isArray(product?.tags) ? product.tags : [];
    return product?.storefront_featured === true || tags.some(isMostSoldTag);
  }

  function renderProducts(products, append) {
    const host = $("products-result");
    const rows = products.map((product) => `<article class="admin-product-card">
      ${product.image_url ? `<img src="${esc(product.image_url)}" alt="" width="64" height="64" loading="lazy" decoding="async">` : '<span class="product-image-placeholder">DA</span>'}
      <div class="admin-product-info"><strong>${esc(product.name)}</strong><span>${esc([product.brand, product.sku && `SKU ${product.sku}`].filter(Boolean).join(" · "))}</span><b>${money(effectivePrice(product))}${product.is_offer ? " · oferta" : ""}</b></div>
      <div class="admin-product-actions"><label class="product-active-toggle"><input type="checkbox" data-toggle-product="${esc(product.id)}" aria-label="Ativar ${esc(product.name)} no catálogo" ${product.is_active === true ? "checked" : ""}><span class="product-switch" aria-hidden="true"></span><span>${product.is_active === true ? "Ativo" : "Inativo"}</span></label><label class="product-active-toggle product-most-sold-toggle"><input type="checkbox" data-toggle-most-sold="${esc(product.id)}" aria-label="Exibir ${esc(product.name)} em Mais Vendidos" ${isMostSoldProduct(product) ? "checked" : ""}><span class="product-switch" aria-hidden="true"></span><span>Mais Vendidos</span></label><button class="button button-outline" type="button" data-edit-product="${esc(product.id)}">Editar</button></div>
    </article>`).join("");
    if (!append) host.innerHTML = rows || '<p class="admin-muted">Nenhum produto encontrado.</p>';
    else host.insertAdjacentHTML("beforeend", rows);
    $("products-more").hidden = state.productsOffset >= state.productsTotal;
  }

  async function loadProducts(reset = true) {
    if (reset) state.productsOffset = 0;
    const host = $("products-result");
    if (reset) host.innerHTML = '<p class="admin-muted">Carregando produtos…</p>';
    try {
      const data = await request("products", { params: { q: state.productsQuery, status: state.productsStatus, segment: state.productsSegment, offset: state.productsOffset, limit: 24 } });
      state.productsTotal = Number(data.total || 0);
      (data.products || []).forEach((product) => state.productCache.set(String(product.id), product));
      if (reset) state.productsOffset = 0;
      renderProducts(data.products || [], !reset);
      state.productsOffset += (data.products || []).length;
      $("products-more").hidden = state.productsOffset >= state.productsTotal;
    } catch (error) {
      host.innerHTML = `<p class="admin-muted">${esc(error.message || "Não foi possível carregar produtos.")}</p>`;
    }
  }

  async function setProductActive(event) {
    const input = event.target;
    if (!input.matches("[data-toggle-product]")) return;
    const productId = String(input.dataset.toggleProduct);
    const isActive = input.checked;
    const card = input.closest(".admin-product-card");
    input.disabled = true;
    try {
      const result = await request("product_set_active", { method: "POST", body: { id: productId, is_active: isActive } });
      if (result?.product?.is_active !== isActive) {
        throw new Error("O servidor não confirmou a alteração do produto. Tente novamente.");
      }
      const confirmedActive = result.product.is_active;
      const cached = state.productCache.get(productId) || {};
      state.productCache.set(productId, Object.assign({}, cached, result.product, { is_active: confirmedActive }));
      input.checked = confirmedActive;
      const statusLabel = input.closest(".product-active-toggle")?.querySelector("span:last-child");
      if (statusLabel) statusLabel.textContent = confirmedActive ? "Ativo" : "Inativo";
      toast(confirmedActive ? "Produto ativado no catálogo." : "Produto desativado no catálogo.");

      const leavesCurrentFilter =
        (state.productsStatus === "active" && !isActive) ||
        (state.productsStatus === "inactive" && isActive);
      if (leavesCurrentFilter && card) {
        card.remove();
        state.productsTotal = Math.max(0, state.productsTotal - 1);
        state.productsOffset = Math.max(0, state.productsOffset - 1);
        $("products-more").hidden = state.productsOffset >= state.productsTotal;
        if (!$("products-result").querySelector(".admin-product-card")) {
          $("products-result").innerHTML = '<p class="admin-muted">Nenhum produto encontrado.</p>';
        }
      }
    } catch (error) {
      input.checked = !isActive;
      toast(error.message || "Não foi possível alterar o produto.");
    } finally {
      input.disabled = false;
    }
  }

  async function setProductMostSold(event) {
    const input = event.target;
    if (!input.matches("[data-toggle-most-sold]")) return;
    const productId = String(input.dataset.toggleMostSold);
    const isMostSold = input.checked;
    input.disabled = true;
    try {
      const result = await request("product_set_most_sold", {
        method: "POST",
        body: { id: productId, is_most_sold: isMostSold }
      });
      if (result?.product?.storefront_featured !== isMostSold) {
        throw new Error("O servidor não confirmou a alteração de Mais Vendidos. Tente novamente.");
      }
      const cached = state.productCache.get(productId) || {};
      state.productCache.set(productId, Object.assign({}, cached, result.product));
      input.checked = result.product.storefront_featured;
      toast(isMostSold ? "Produto incluído em Mais Vendidos." : "Produto removido de Mais Vendidos.");
    } catch (error) {
      input.checked = !isMostSold;
      toast(error.message || "Não foi possível alterar Mais Vendidos.");
    } finally {
      input.disabled = false;
    }
  }

  function openProduct(product = null) {
    const form = $("product-form");
    form.reset();
    $("product-id").value = product?.id || "";
    $("product-dialog-title").textContent = product ? "Editar produto" : "Novo produto";
    $("product-save-message").textContent = "";
    const textFields = ["name", "brand", "sku", "gtin", "ncm", "packaging", "unit", "supplier", "category", "subcategory", "subsubcategory", "storefront_category", "sales_category", "validity_date", "gondola", "shelf", "sort_order", "image_url", "description_short", "description_long", "customer_category", "customer_subcategory", "customer_subsubcategory"];
    textFields.forEach((name) => { form.elements[name].value = product?.[name] ?? (name === "sort_order" ? 0 : ""); });
    ["price", "offer_price", "cost", "stock", "min_stock"].forEach((name) => { form.elements[name].value = product?.[name] ?? ""; });
    const productTags = Array.isArray(product?.tags) ? product.tags : String(product?.tags || "").split(",");
    form.elements.tags.value = productTags.filter((tag) => !isMostSoldTag(tag)).join(", ");
    ["is_active", "is_offer", "is_whatsapp_active", "is_upsell"].forEach((name) => { form.elements[name].checked = product ? product[name] === true : ["is_active", "is_whatsapp_active"].includes(name); });
    form.elements.storefront_featured.checked = product ? isMostSoldProduct(product) : false;
    $("product-dialog").showModal();
  }

  async function saveProduct(event) {
    event.preventDefault();
    const button = $("save-product");
    const data = syncProductSearchForm(event.currentTarget);
    data.id = $("product-id").value || null;
    ["is_active", "is_offer", "is_whatsapp_active", "is_upsell", "storefront_featured"].forEach((name) => { data[name] = event.currentTarget.elements[name].checked; });
    const productTags = String(data.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
    data.storefront_featured = data.storefront_featured === true || productTags.some(isMostSoldTag);
    data.tags = productTags.filter((tag) => !isMostSoldTag(tag));
    if (data.storefront_featured) data.tags.push(MOST_SOLD_TAG);
    button.disabled = true;
    button.textContent = "Salvando…";
    $("product-save-message").textContent = "";
    try {
      const result = await request("product_save", { method: "POST", body: data });
      const product = Object.assign({}, result.product, { effective_price_cents: effectivePrice(result.product) });
      state.productCache.set(String(product.id), product);
      let basketChanged = false;
      (state.basket?.positions || []).forEach((position) => (position.options || []).forEach((option) => {
        if (String(option.product_id) !== String(product.id)) return;
        option.product = product;
        basketChanged = true;
      }));
      const basketDialog = $("basket-dialog");
      const basketScrollTop = basketDialog.scrollTop;
      $("product-dialog").close();
      if (basketChanged) {
        renderPositions();
        basketDialog.scrollTop = basketScrollTop;
      }
      toast("Produto salvo.");
      await Promise.all([loadProducts(true), loadBaskets()]);
    } catch (error) {
      $("product-save-message").textContent = error.message || "Não foi possível salvar o produto.";
    } finally {
      button.disabled = false;
      button.textContent = "Salvar produto";
    }
  }

  async function saveBasket(event) {
    event.preventDefault();
    const basket = state.basket;
    if (!basket) return;
    const button = $("save-basket");
    const targetPrice = priceToCents($("basket-default-price").value);
    button.disabled = true;
    button.textContent = "Salvando…";
    $("basket-save-message").textContent = "";
    try {
      const result = await request("basket_save", { method: "POST", body: {
        basket_id: basket.id,
        target_price_cents: targetPrice,
        public_composition_count: basket.public_composition_count || 1,
        positions: basket.positions.map((position, index) => ({
          label: position.label,
          quantity: numberFromPrice(position.quantity),
          sort_order: index,
          metadata: position.metadata || {},
          options: (position.options || []).map((option, optionIndex) => ({ product_id: option.product_id, metadata: option.metadata || {}, sort_order: optionIndex })),
        })),
      } });
      basket.hidden_adjustment_cents = Number(result.hidden_adjustment_cents || 0);
      basket.display_price_cents = targetPrice;
      $("basket-dialog").close();
      toast("Composição da cesta salva.");
      await loadBaskets();
    } catch (error) {
      $("basket-save-message").textContent = error.message || "Não foi possível salvar a cesta.";
    } finally {
      button.disabled = false;
      button.textContent = "Salvar cesta";
    }
  }

  function bind() {
    document.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.dataset.editBasket) {
        const basket = state.baskets.find((item) => String(item.id) === target.dataset.editBasket);
        if (basket) openBasket(basket);
      }
      if (target.dataset.editProduct) openProduct(state.productCache.get(String(target.dataset.editProduct)));
      if (target.dataset.setBasketActive != null) {
        const active = target.dataset.setBasketActive === "true";
        target.disabled = true;
        request("basket_set_active", { method: "POST", body: { basket_id: target.dataset.basketId, is_active: active } })
          .then(() => { toast(active ? "Cesta reativada." : "Kit desativado; você pode reativá-lo no filtro Inativas."); return loadBaskets(); })
          .catch((error) => toast(error.message || "Não foi possível alterar a situação da cesta."))
          .finally(() => { target.disabled = false; });
      }
      if (target.id === "new-product") openProduct();
      if (target.id === "add-basket-position") addPosition();
      if (target.dataset.pickProducts != null) openPicker(Number(target.dataset.pickProducts));
      if (target.dataset.removePosition != null) {
        state.basket.positions.splice(Number(target.dataset.removePosition), 1);
        renderPositions();
      }
      if (target.dataset.removeOption != null) {
        const position = state.basket.positions[Number(target.dataset.removeOption)];
        position.options = position.options.filter((option) => String(option.product_id) !== target.dataset.productId);
        renderPositions();
      }
      if (target.id === "apply-picker-products") applyPicker();
      if (target.id === "picker-more") loadPickerProducts(false);
      if (target.id === "products-more") loadProducts(false);
      if (target.dataset.dialogClose) $(target.dataset.dialogClose).close();
    });

    $("basket-position-editor").addEventListener("input", (event) => {
      const labelIndex = event.target.dataset.positionLabel;
      const quantityIndex = event.target.dataset.positionQuantity;
      if (labelIndex != null) state.basket.positions[Number(labelIndex)].label = event.target.value;
      if (quantityIndex != null) state.basket.positions[Number(quantityIndex)].quantity = numberFromPrice(event.target.value) || 0;
      if (labelIndex != null || quantityIndex != null) updateBasketPrice();
    });
    $("basket-position-editor").addEventListener("change", (event) => {
      if (event.target.dataset.defaultOption == null) return;
      const index = Number(event.target.dataset.defaultOption);
      const options = state.basket.positions[index].options;
      const selected = options.find((option) => String(option.product_id) === String(event.target.value));
      if (selected) state.basket.positions[index].options = [selected, ...options.filter((option) => option !== selected)];
      renderPositions();
    });
    $("basket-default-price").addEventListener("input", (event) => {
      if (!state.basket) return;
      const desired = priceToCents(event.target.value);
      state.basket.hidden_adjustment_cents = desired - basketProductTotal(state.basket) - conditionalAdjustment(state.basket);
      $("basket-price-hint").textContent = `Ajuste da cesta atualizado para ${money(state.basket.hidden_adjustment_cents)}. O total acompanha os produtos padrão e quantidades.`;
    });
    $("basket-form").addEventListener("submit", saveBasket);
    $("product-form").addEventListener("submit", saveProduct);
    $("products-result").addEventListener("change", setProductActive);
    $("products-result").addEventListener("change", setProductMostSold);
    $("product-search").addEventListener("submit", (event) => {
      event.preventDefault();
      state.productsQuery = $("product-query").value.trim();
      state.productsStatus = $("product-status").value;
      state.productsSegment = $("product-segment").value;
      loadProducts(true);
    });
    $("product-status").addEventListener("change", () => $("product-search").requestSubmit());
    $("product-segment").addEventListener("change", () => $("product-search").requestSubmit());
    $("basket-status").addEventListener("change", () => {
      state.basketsStatus = $("basket-status").value;
      loadBaskets();
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
    $("reload-baskets").addEventListener("click", loadBaskets);
  }

  bind();
  window.DonaCatalogAdmin = { loadBaskets, loadProducts };
})();
