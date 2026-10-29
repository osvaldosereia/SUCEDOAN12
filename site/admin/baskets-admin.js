(() => {
  "use strict";

  const products = window.DonaAdminProductBridge;
  if (!products?.request) return;

  const { request, esc, money, effectivePrice, productCache, openProduct, toast } = products;
  const $ = (id) => document.getElementById(id);
  const state = {
    baskets: [],
    basket: null,
    initialPositions: new Map(),
    pickerIndex: -1,
    pickerQuery: "",
    pickerOffset: 0,
    pickerTotal: 0,
    pickerSelected: new Set(),
    basketsStatus: "active",
  };

  function basketProductTotal(basket) {
    return (basket.positions || []).reduce((total, position) => {
      const product = position.options?.[0]?.product;
      const price = Number(product?.effective_price_cents ?? effectivePrice(product || {}));
      return total + Math.round(price * Number(position.quantity || 0));
    }, 0);
  }

  function conditionalAdjustment(basket) {
    if (!basket.conditional_hidden_enabled || !basket.conditional_hidden_product_id) return 0;
    const includesConditionalProduct = (basket.positions || []).some((position) =>
      String(position.options?.[0]?.product_id) === String(basket.conditional_hidden_product_id) && Number(position.quantity) > 0
    );
    return includesConditionalProduct ? Number(basket.conditional_hidden_adjustment_cents || 0) : 0;
  }

  function currentBasketPrice(basket) {
    return Math.max(0, basketProductTotal(basket) + Number(basket.hidden_adjustment_cents || 0) + conditionalAdjustment(basket));
  }

  function renderBaskets() {
    const host = $("admin-baskets");
    if (!host) return;
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
    if (!host || !state.basket) return;
    host.innerHTML = (state.basket.positions || []).map((position, index) => {
      const options = position.options || [];
      const shareChecked = position.share_options_across_baskets === true;
      const shareControl = state.basket.shareable === true ? `<label class="basket-share-toggle">
          <input type="checkbox" data-share-options="${index}" ${shareChecked ? "checked" : ""}>
          <span class="basket-share-copy"><strong>Repetir estas marcas nas outras cestas</strong><small>Apenas nas cestas que já têm este item.</small></span>
        </label>` : "";
      return `<article class="basket-position-card" data-position="${index}">
        <header><strong>Item ${index + 1}</strong><button class="text-button danger-text" type="button" data-remove-position="${index}">Remover item</button></header>
        <div class="position-fields"><label>Nome do item<input data-position-label="${index}" value="${esc(position.label || "")}" maxlength="180" placeholder="Ex.: Arroz"></label>
          <label>Unidades na cesta<input data-position-quantity="${index}" type="number" min="0.01" max="999" step="0.01" value="${esc(position.quantity ?? 1)}"></label></div>
        <div class="position-options"><strong>Marcas/opções <small>Marque o padrão</small></strong>
          ${options.length ? options.map((option, optionIndex) => {
            const product = option.product || productCache.get(String(option.product_id)) || {};
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
        ${shareControl}
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
    state.initialPositions = new Map();
    state.basket.positions.forEach((position, index) => {
      position.options = position.options || [];
      position.options.forEach((option) => productCache.set(String(option.product_id), option.product || {}));
      position.share_key = position.id ? `position:${position.id}` : `new:${index}`;
      position.share_options_across_baskets = Boolean(position.shared_item_id);
      state.initialPositions.set(position.share_key, {
        label: String(position.label || ""),
        sharedItemId: position.shared_item_id || null,
        optionIds: position.options.map((option) => String(option.product_id)),
      });
    });
    $("basket-dialog-title").textContent = `Editar ${basket.name}`;
    $("basket-save-message").textContent = "";
    renderPositions();
    const dialog = $("basket-dialog");
    if (!dialog.open) dialog.showModal();
  }

  function addPosition() {
    if (!state.basket) return;
    state.basket.positions.push({
      label: "",
      quantity: 1,
      sort_order: state.basket.positions.length,
      metadata: {},
      options: [],
      share_key: `new:${Date.now()}:${state.basket.positions.length}`,
      share_options_across_baskets: false,
    });
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
      (data.products || []).forEach((product) => productCache.set(String(product.id), product));
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

  function applyPicker() {
    const position = state.basket?.positions?.[state.pickerIndex];
    if (!position) return;
    const previous = new Map((position.options || []).map((option) => [String(option.product_id), option]));
    position.options = [...state.pickerSelected].map((id) => {
      const existing = previous.get(id);
      const product = productCache.get(id) || existing?.product || {};
      return { product_id: id, product, metadata: existing?.metadata || {} };
    });
    $("product-picker-dialog").close();
    renderPositions();
  }

  function sameOptionSet(before, after) {
    if (before.length !== after.length) return false;
    const previous = new Set(before);
    return after.every((id) => previous.has(id));
  }

  function shareChangesForSave() {
    const changes = [];
    (state.basket?.positions || []).forEach((position) => {
      const original = state.initialPositions.get(position.share_key);
      const previouslyShared = Boolean(original?.sharedItemId);
      const shouldShare = position.share_options_across_baskets === true;

      if (previouslyShared && !shouldShare) {
        changes.push({ action: "disable", shared_item_id: original.sharedItemId });
        return;
      }
      if (!shouldShare) return;

      const optionIds = (position.options || []).map((option) => String(option.product_id));
      const changed = !previouslyShared || original.label !== String(position.label || "") || !sameOptionSet(original.optionIds, optionIds);
      if (!changed) return;
      changes.push({
        action: "upsert",
        shared_item_id: original?.sharedItemId || null,
        old_label: original?.label || String(position.label || ""),
        label: String(position.label || ""),
        options: optionIds,
      });
    });
    return changes;
  }

  function numberFromPrice(value) {
    if (value === "" || value == null) return null;
    const number = Number(String(value).replace(",", "."));
    return Number.isFinite(number) ? number : null;
  }

  function priceToCents(value) {
    return Math.round((numberFromPrice(value) || 0) * 100);
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
        share_changes: shareChangesForSave(),
      } });
      basket.hidden_adjustment_cents = Number(result.hidden_adjustment_cents || 0);
      basket.display_price_cents = targetPrice;
      $("basket-dialog").close();
      const sharedCount = Number(result.shared_item_updates || 0);
      toast(sharedCount
        ? `Composição salva. ${sharedCount} item(ns) compartilhado(s) nas cestas que já os têm.`
        : "Composição da cesta salva.");
      await loadBaskets();
    } catch (error) {
      $("basket-save-message").textContent = error.message || "Não foi possível salvar a cesta.";
    } finally {
      button.disabled = false;
      button.textContent = "Salvar cesta";
    }
  }

  async function productSaved(product) {
    productCache.set(String(product.id), product);
    if (state.basket) {
      let changed = false;
      (state.basket.positions || []).forEach((position) => (position.options || []).forEach((option) => {
        if (String(option.product_id) !== String(product.id)) return;
        option.product = product;
        changed = true;
      }));
      if (changed) {
        const dialog = $("basket-dialog");
        const scrollTop = dialog.scrollTop;
        renderPositions();
        dialog.scrollTop = scrollTop;
      }
    }
    if (state.baskets.length) await loadBaskets();
  }

  function bind() {
    document.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.dataset.editBasket) {
        const basket = state.baskets.find((item) => String(item.id) === target.dataset.editBasket);
        if (basket) openBasket(basket);
      }
      if (target.dataset.editProduct) openProduct(productCache.get(String(target.dataset.editProduct)));
      if (target.dataset.setBasketActive != null) {
        const active = target.dataset.setBasketActive === "true";
        target.disabled = true;
        request("basket_set_active", { method: "POST", body: { basket_id: target.dataset.basketId, is_active: active } })
          .then(() => { toast(active ? "Cesta reativada." : "Kit desativado; você pode reativá-lo no filtro Inativas."); return loadBaskets(); })
          .catch((error) => toast(error.message || "Não foi possível alterar a situação da cesta."))
          .finally(() => { target.disabled = false; });
      }
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
      if (target.dataset.dialogClose === "basket-dialog" || target.dataset.dialogClose === "product-picker-dialog") {
        $(target.dataset.dialogClose).close();
      }
    });

    $("basket-position-editor").addEventListener("input", (event) => {
      const labelIndex = event.target.dataset.positionLabel;
      const quantityIndex = event.target.dataset.positionQuantity;
      if (labelIndex != null) state.basket.positions[Number(labelIndex)].label = event.target.value;
      if (quantityIndex != null) state.basket.positions[Number(quantityIndex)].quantity = numberFromPrice(event.target.value) || 0;
      if (labelIndex != null || quantityIndex != null) updateBasketPrice();
    });
    $("basket-position-editor").addEventListener("change", (event) => {
      if (event.target.dataset.defaultOption != null) {
        const index = Number(event.target.dataset.defaultOption);
        const options = state.basket.positions[index].options;
        const selected = options.find((option) => String(option.product_id) === String(event.target.value));
        if (selected) state.basket.positions[index].options = [selected, ...options.filter((option) => option !== selected)];
        renderPositions();
      }
      if (event.target.dataset.shareOptions != null) {
        const position = state.basket.positions[Number(event.target.dataset.shareOptions)];
        if (position) position.share_options_across_baskets = event.target.checked;
      }
    });
    $("basket-default-price").addEventListener("input", (event) => {
      if (!state.basket) return;
      const desired = priceToCents(event.target.value);
      state.basket.hidden_adjustment_cents = desired - basketProductTotal(state.basket) - conditionalAdjustment(state.basket);
      $("basket-price-hint").textContent = `Ajuste da cesta atualizado para ${money(state.basket.hidden_adjustment_cents)}. O total acompanha os produtos padrão e quantidades.`;
    });
    $("basket-form").addEventListener("submit", saveBasket);
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
  window.DonaBasketAdmin = { loadBaskets, productSaved };
})();
