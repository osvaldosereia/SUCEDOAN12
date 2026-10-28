(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const root = String(config.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/" + (config.storefrontFunction || "storefront-v2");
  const key = config.publishableKey || "";
  const state = { cards: [], baskets: new Map(), activeKey: "", customer: null, toastTimer: 0, deliveryOptions: [], deliveryPromise: null, submittingOrder: false };
  const EXTRA_CATEGORIES = [
    { key: "mercearia", label: "Mercearia" },
    { key: "limpeza_lavanderia", label: "Limpeza e lavanderia" },
    { key: "higiene_beleza", label: "Higiene e beleza" },
    { key: "casa_pet", label: "Casa e pet" }
  ];
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const plain = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const money = (cents) => (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function quantityOf(item) {
    return Math.max(0, Math.trunc(Number(item ? (item.quantity ?? item.base_quantity ?? 0) : 0)));
  }

  function extraTotalCents(data) {
    const selections = data && data.extraSelections instanceof Map ? data.extraSelections : new Map();
    return Array.from(selections.values()).reduce((total, item) =>
      total + Math.max(0, Number(item.price_cents || 0)) * Math.max(0, Math.trunc(Number(item.quantity || 0))), 0);
  }

  function displayedTotalCents(data) {
    return Math.max(0, Number(data && data.totalCents || 0)) + extraTotalCents(data);
  }

  function extraCategoriesFor(data) {
    if (!Array.isArray(data.extraCategories)) {
      data.extraCategories = EXTRA_CATEGORIES.map((category) => ({
        key: category.key, label: category.label, expanded: false, loaded: false,
        loading: false, error: false, products: [], nextOffset: 0, hasMore: true
      }));
    }
    if (!(data.extraSelections instanceof Map)) data.extraSelections = new Map();
    return data.extraCategories;
  }

  function extraProductMarkup(data, product) {
    const id = String(product.id || "");
    const selected = data.extraSelections.get(id);
    const quantity = selected ? Number(selected.quantity || 0) : 0;
    const stock = Math.max(0, Number(product.stock_quantity || 0));
    return '<article class="extra-product-card" role="listitem" data-extra-product="' + esc(id) + '">' +
      '<img src="' + esc(product.image_url || "../img/logoantonia5.png") + '" alt="" width="52" height="52" loading="lazy" decoding="async">' +
      '<div class="extra-product-copy"><strong>' + esc(product.name || "Produto") + '</strong><span>' + esc(money(product.price_cents)) + '</span>' +
      '<div class="extra-quantity"><span>Quantidade:</span><div class="quantity-stepper">' +
      '<button class="quantity-button" type="button" data-extra-adjust="' + esc(id) + '" data-delta="-1" aria-label="Diminuir ' + esc(product.name || "produto") + '"' + (quantity <= 0 ? " disabled" : "") + '>−</button>' +
      '<output class="quantity-value" data-extra-quantity="' + esc(id) + '" aria-live="polite">' + quantity + '</output>' +
      '<button class="quantity-button" type="button" data-extra-adjust="' + esc(id) + '" data-delta="1" aria-label="Adicionar ' + esc(product.name || "produto") + '"' + (quantity >= stock ? " disabled" : "") + '>+</button>' +
      '</div></div></div></article>';
  }

  function extraCategoriesMarkup(data) {
    const categories = extraCategoriesFor(data);
    return '<section class="extras-section" aria-labelledby="extras-title"><h3 id="extras-title">Produtos Extras</h3><div class="extra-category-list">' +
      categories.map((category) => {
        const panelId = "extra-panel-" + category.key;
        const status = category.loading
          ? category.products.length ? "Carregando mais produtos…" : "Carregando produtos…"
          : category.error ? "Não foi possível carregar. Toque na categoria para tentar novamente."
            : category.loaded && !category.products.length ? "Nenhum produto disponível nesta categoria."
              : "";
        const products = category.products.map((product) => extraProductMarkup(data, product)).join("");
        return '<section class="extra-category" data-extra-category-card="' + esc(category.key) + '">' +
          '<button class="extra-category-toggle" type="button" data-extra-category="' + esc(category.key) + '" aria-expanded="' + String(category.expanded) + '" aria-controls="' + esc(panelId) + '">' +
          '<span>' + esc(category.label) + '</span><span class="variation-chevron" aria-hidden="true">' + (category.expanded ? "−" : "+") + '</span></button>' +
          '<div class="extra-category-panel" id="' + esc(panelId) + '"' + (category.expanded ? "" : " hidden") + '>' +
          '<div class="extra-product-scroll" data-extra-scroll="' + esc(category.key) + '" role="list" aria-label="Produtos de ' + esc(category.label) + '">' + products + '</div>' +
          '<p class="extra-product-status" data-extra-status="' + esc(category.key) + '" role="status">' + esc(status) + '</p></div></section>';
      }).join("") + '</div></section>';
  }


  function bindExtraProductControls(container) {
    container.querySelectorAll("[data-extra-adjust]").forEach((button) => {
      button.addEventListener("click", () => changeExtraQuantity(button.dataset.extraAdjust, Number(button.dataset.delta || 0), button));
    });
  }

  function toggleExtraCategory(categoryKey) {
    const data = state.baskets.get(state.activeKey);
    const category = data && extraCategoriesFor(data).find((entry) => entry.key === String(categoryKey));
    if (!data || !category) return;
    category.expanded = !category.expanded;
    const content = $("detail-content");
    const button = content.querySelector('[data-extra-category="' + category.key + '"]');
    const scroll = content.querySelector('[data-extra-scroll="' + category.key + '"]');
    const panel = scroll && scroll.parentElement;
    if (button) {
      button.setAttribute("aria-expanded", String(category.expanded));
      const icon = button.querySelector(".variation-chevron");
      if (icon) icon.textContent = category.expanded ? "−" : "+";
    }
    if (panel) panel.hidden = !category.expanded;
    if (category.expanded && (!category.loaded || category.error)) {
      loadExtraCategory(data, category, scroll);
    }
  }

  function loadMoreExtraProducts(categoryKey, scrollElement) {
    const data = state.baskets.get(state.activeKey);
    const category = data && extraCategoriesFor(data).find((entry) => entry.key === String(categoryKey));
    if (category && category.expanded && category.loaded && category.hasMore) {
      loadExtraCategory(data, category, scrollElement);
    }
  }

  async function loadExtraCategory(data, category, scrollElement) {
    if (!category || category.loading || !category.hasMore) return;
    category.loading = true;
    category.error = false;
    const status = $("detail-content").querySelector('[data-extra-status="' + category.key + '"]');
    if (status) status.textContent = category.products.length ? "Carregando mais produtos…" : "Carregando produtos…";
    try {
      let fetched = [];
      let pages = 0;
      do {
        const result = await request("products", { params: {
          category: category.key, limit: 3, offset: category.nextOffset
        } });
        fetched = Array.isArray(result.products) ? result.products : [];
        category.nextOffset = result.next_offset == null ? category.nextOffset : Number(result.next_offset);
        category.hasMore = result.next_offset != null;
        pages += 1;
      } while (!fetched.length && category.hasMore && pages < 8);
      category.products = category.products.concat(fetched);
      category.loaded = true;
      if (scrollElement && scrollElement.isConnected && state.baskets.get(state.activeKey) === data && !$("detail-sheet").hidden) {
        if (fetched.length) {
          scrollElement.insertAdjacentHTML("beforeend", fetched.map((product) => extraProductMarkup(data, product)).join(""));
          scrollElement.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => { image.src = "../img/logoantonia5.png"; }, { once: true }));
          bindExtraProductControls(scrollElement);
        }
        const currentStatus = $("detail-content").querySelector('[data-extra-status="' + category.key + '"]');
        if (currentStatus) currentStatus.textContent = !category.products.length ? "Nenhum produto disponível nesta categoria." : "";
      }
    } catch (_) {
      category.error = true;
      if (scrollElement && scrollElement.isConnected) {
        const currentStatus = $("detail-content").querySelector('[data-extra-status="' + category.key + '"]');
        if (currentStatus) currentStatus.textContent = "Não foi possível carregar. Toque na categoria para tentar novamente.";
      }
    } finally {
      category.loading = false;
    }
  }

  function changeExtraQuantity(productId, delta, button) {
    const data = state.baskets.get(state.activeKey);
    if (!data || !productId || !delta) return;
    const category = extraCategoriesFor(data).find((entry) => entry.products.some((product) => String(product.id) === String(productId)));
    const product = category && category.products.find((entry) => String(entry.id) === String(productId));
    if (!product) return;
    const current = data.extraSelections.get(String(productId));
    const currentQuantity = Number(current && current.quantity || 0);
    const quantity = Math.max(0, Math.min(Number(product.stock_quantity || 0), currentQuantity + delta));
    if (quantity === currentQuantity) return;
    if (quantity === 0) data.extraSelections.delete(String(productId));
    else data.extraSelections.set(String(productId), {
      id: String(product.id), name: product.name || "Produto", image_url: product.image_url || "",
      price_cents: Number(product.price_cents || 0), quantity
    });
    const card = button && button.closest("[data-extra-product]");
    if (card) {
      const output = card.querySelector('[data-extra-quantity="' + productId + '"]');
      const minus = card.querySelector('[data-delta="-1"]');
      const plus = card.querySelector('[data-delta="1"]');
      if (output) output.textContent = String(quantity);
      if (minus) minus.disabled = quantity <= 0;
      if (plus) plus.disabled = quantity >= Number(product.stock_quantity || 0);
    }
    $("detail-total").textContent = money(displayedTotalCents(data));
  }

  async function changeBasketItemQuantity(positionId, delta) {
    const sizeKey = state.activeKey;
    const data = state.baskets.get(sizeKey);
    if (!data || data.changing) return;
    const current = data.items.find((row) => String(row.position_id) === String(positionId));
    if (!current) return;
    const currentQuantity = quantityOf(current);
    const nextQuantity = Math.max(0, Math.min(1000, currentQuantity + delta));
    if (nextQuantity === currentQuantity) return;
    const selectedItems = data.items.map((row) => Object.assign({}, row));
    const selected = selectedItems.find((row) => String(row.position_id) === String(positionId));
    selected.quantity = nextQuantity;
    const selections = selectedItems.map((row) => ({
      position_id: row.position_id, product_id: row.product_id, quantity: quantityOf(row)
    }));
    data.changing = true;
    data.changingPosition = String(positionId);
    setQuotePendingControls(sizeKey, positionId, true);
    const update = (async () => {
      try {
        const quote = await quoteBasket(data.basket, selections, selectedItems);
        const currentItems = new Map(data.items.map((row) => [String(row.position_id), row]));
        quote.items = quote.items.map((row) => {
          const previous = currentItems.get(String(row.position_id));
          return previous ? Object.assign({}, row, {
            _alternatives: previous._alternatives || row._alternatives || [],
            _optionsLoaded: previous._optionsLoaded === true || row._optionsLoaded === true,
            _optionsLoading: previous._optionsLoading === true,
            _optionsError: previous._optionsError === true,
            _expanded: previous._expanded === true
          }) : row;
        });
        Object.assign(data, quote, { orderable: true, detailLoaded: true });
        updateSelectedProductInPlace(sizeKey, positionId);
      } catch (_) {
        toast("Não foi possível atualizar a quantidade. A quantidade anterior foi mantida.");
      } finally {
        data.changing = false;
        data.changingPosition = "";
        setQuotePendingControls(sizeKey, positionId, false);
        if (data.changePromise === update) data.changePromise = null;
      }
    })();
    data.changePromise = update;
    await update;
  }

  const keyOf = (value) => plain(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const phoneDigits = (value) => String(value || "").replace(/\D/g, "");
  const whatsappNumber = (value) => {
    let digits = phoneDigits(value);
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("55")) return digits.length === 12 || digits.length === 13 ? digits : "";
    return digits.length === 10 || digits.length === 11 ? "55" + digits : "";
  };

  async function request(action, options) {
    const opts = options || {};
    const url = new URL(root);
    url.searchParams.set("action", action);
    Object.keys(opts.params || {}).forEach((name) => url.searchParams.set(name, String(opts.params[name] == null ? "" : opts.params[name])));
    const headers = { apikey: key };
    const init = { method: opts.method || "GET", headers, cache: "default" };
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    const response = await fetch(url.toString(), init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "Não foi possível carregar agora.");
    return data;
  }

  function imageForBasket(card, keyName) {
    return "assets/cestas/cesta-" + keyName + ".jpg";
  }

  async function optionsForItem(basket, item) {
    let alternatives = Array.isArray(item.alternatives) ? item.alternatives.slice() : [];
    const count = Number(item.alternative_count || alternatives.length);
    let offset = alternatives.length;
    while (offset < count && offset < 100) {
      const page = await request("basket_mold_options", { params: {
        basket_id: basket.id,
        composition_number: basket.composition_number || 1,
        position_id: item.position_id,
        selected_product_id: item.product_id || "",
        quantity: item.quantity || item.base_quantity || 0,
        offset
      } });
      const rows = Array.isArray(page.alternatives) ? page.alternatives : [];
      if (!rows.length) break;
      alternatives = alternatives.concat(rows);
      offset = page.next_offset == null ? count : Number(page.next_offset);
    }
    if (!alternatives.length && item.product_id && Number(item.stock_quantity || 0) > 0) alternatives.push({
      product_id: item.product_id, name: item.name, image_url: item.image_url,
      price_cents: item.price_cents, stock_quantity: item.stock_quantity
    });
    const unique = new Map();
    alternatives.forEach((option) => {
      if (option && option.product_id) unique.set(String(option.product_id), option);
    });
    return Array.from(unique.values()).sort((a, b) =>
      Number(a.price_cents || 0) - Number(b.price_cents || 0) ||
      String(a.name || "").localeCompare(String(b.name || ""), "pt-BR")
    );
  }

  async function quoteBasket(basket, selections, alternativesByPosition) {
    const quoted = await request("basket_mold_quote", {
      method: "POST",
      body: {
        basket_id: basket.id,
        composition_number: basket.composition_number || 1,
        items: selections,
        lightweight: true
      }
    });
    const original = new Map((alternativesByPosition || []).map((item) => [String(item.position_id), item]));
    const items = (quoted.items || []).map((item) => {
      const previous = original.get(String(item.position_id)) || {};
      return Object.assign({}, item, {
        _alternatives: previous._alternatives || [],
        _optionsLoaded: previous._optionsLoaded === true,
        _optionsLoading: false,
        _optionsError: false,
        _expanded: previous._expanded === true
      });
    });
    return { basket: quoted.basket, items, totalCents: Number(quoted.total_cents || quoted.basket && quoted.basket.display_price_cents || 0) };
  }

  async function basketForSize(sizeKey) {
    const initial = await request("basket_by_size", { params: { size_key: sizeKey, lightweight: "1" } });
    const basket = initial.basket;
    const rawItems = Array.isArray(initial.items) ? initial.items : [];
    return {
      basket,
      items: rawItems.map((item) => Object.assign({}, item, {
        _alternatives: [],
        _optionsLoaded: false,
        _optionsLoading: false,
        _optionsError: false,
        _expanded: false
      })),
      totalCents: Number(basket.display_price_cents || 0),
      orderable: Number(basket.stock_quantity || 0) > 0,
      detailLoaded: true,
      detailPromise: null,
      changePromise: null,
      extraCategories: null,
      extraSelections: new Map()
    };
  }

  async function toggleItemOptions(positionId) {
    const sizeKey = state.activeKey;
    const data = state.baskets.get(sizeKey);
    if (!data || data.changing) return;
    const item = data.items.find((row) => String(row.position_id) === String(positionId));
    if (!item || item._optionsLoading) return;

    if (item._expanded) {
      item._expanded = false;
      renderDetailPreservingScroll(positionId);
      return;
    }

    item._expanded = true;
    item._optionsError = false;
    if (item._optionsLoaded) {
      renderDetailPreservingScroll(positionId);
      return;
    }

    item._optionsLoading = true;
    renderDetailPreservingScroll(positionId);
    try {
      const seed = Array.isArray(item.alternatives) ? item.alternatives.slice() : [];
      item._alternatives = await optionsForItem(data.basket, Object.assign({}, item, {
        alternatives: seed,
        alternative_count: Number(item.alternative_count || seed.length)
      }));
      item._optionsLoaded = true;
    } catch (_) {
      item._expanded = false;
      item._optionsError = true;
      toast("Não foi possível carregar as opções deste item. Tente novamente.");
    } finally {
      item._optionsLoading = false;
      if (state.activeKey === sizeKey && !$("detail-sheet").hidden) renderDetailPreservingScroll(positionId);
    }
  }

  function renderCards() {
    const host = $("basket-grid");
    host.setAttribute("aria-busy", "false");
    host.innerHTML = state.cards.map((card, index) => {
      const sizeKey = card.size_key || keyOf(card.name);
      const title = plain(card.name || card.model_name || "Cesta básica");
      const loading = index < 2 ? "eager" : "lazy";
      const priority = index === 0 ? "high" : "low";
      return '<article class="basket-card">' +
        '<img class="basket-photo" src="' + esc(imageForBasket(card, sizeKey)) + '" alt="Cesta ' + esc(title) + '" width="420" height="420" loading="' + loading + '" fetchpriority="' + priority + '" decoding="async">' +
        '<div class="basket-body"><h3 class="basket-title">' + esc(title) + '</h3>' +
        '<button class="button button-primary card-button" type="button" data-open-basket="' + esc(sizeKey) + '">Ver Produtos</button></div></article>';
    }).join("");
    host.querySelectorAll("[data-open-basket]").forEach((button) => button.addEventListener("click", () => openDetail(button.dataset.openBasket)));
  }

  function showEmpty(message, canRetry) {
    $("basket-grid").setAttribute("aria-busy", "false");
    $("basket-grid").innerHTML = '<div class="empty-state">' + esc(message) + "</div>";
    $("catalog-status").textContent = canRetry ? "Não carregou" : "";
    $("retry-catalog").hidden = !canRetry;
  }

  async function loadCatalog() {
    $("retry-catalog").hidden = true;
    $("catalog-status").textContent = "Carregando cestas…";
    $("basket-grid").setAttribute("aria-busy", "true");
    state.baskets.clear();
    try {
      const result = await request("home_size_cards");
      state.cards = Array.isArray(result.baskets) ? result.baskets : [];
      if (!state.cards.length) throw new Error("Nenhuma cesta disponível no momento.");
      state.cards.forEach((card) => {
        const sizeKey = card.size_key || keyOf(card.name);
        state.baskets.set(sizeKey, {
          summary: card,
          basket: null,
          items: [],
          totalCents: null,
          orderable: false,
          detailLoaded: false,
          detailPromise: null,
          changePromise: null,
        });
      });
      renderCards();
      $("catalog-status").textContent = state.cards.length + " tamanhos";
    } catch (error) {
      showEmpty("Não foi possível carregar as cestas. Confira sua conexão e tente novamente.", true);
    }
  }

  function toast(message) {
    const node = $("toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.classList.remove("show"), 2900);
  }

  function showSheet(id) {
    $(id).hidden = false;
    document.body.classList.add("sheet-open");
  }

  function closeSheet(id) {
    $(id).hidden = true;
    if ($("detail-sheet").hidden && $("order-sheet").hidden) document.body.classList.remove("sheet-open");
    if (id === "order-sheet") {
      state.customer = null;
      $("customer-card").hidden = true;
      $("payment-options").disabled = true;
      $("confirm-order").disabled = true;
      $("lookup-message").textContent = "Buscaremos o cadastro e o endereço já registrado.";
    }
  }

  function renderDetail() {
    const data = state.baskets.get(state.activeKey);
    if (!data || data.error) {
      $("detail-content").innerHTML = '<div class="empty-state">Não foi possível carregar os produtos. Tente novamente.</div>';
      $("detail-total").textContent = "—";
      return;
    }
    if (!data.detailLoaded) {
      $("detail-title").textContent = data.summary?.name || "Produtos da cesta";
      $("detail-total").textContent = data.totalCents == null ? "—" : money(data.totalCents);
      $("detail-content").innerHTML = '<div class="empty-state" aria-live="polite">Carregando produtos da cesta…</div>';
      $("order-button").disabled = true;
      return;
    }
    $("detail-title").textContent = data.basket.name || "Produtos da cesta";
    $("detail-total").textContent = money(displayedTotalCents(data));
    const rows = data.items.map((item) => {
      const alternatives = item._alternatives || [];
      const selected = alternatives.find((alt) => String(alt.product_id) === String(item.product_id));
      const image = selected && selected.image_url || item.image_url || "../img/cestas/cesta-mini.jpg";
      const expanded = item._expanded === true;
      const optionCount = Math.max(Number(item.alternative_count || 0), alternatives.length);
      const changingThisItem = String(data.changingPosition || "") === String(item.position_id);

      const choices = alternatives.map((alt) => {
        const selectedOption = String(alt.product_id) === String(item.product_id);
        const optionPrice = alt.price_cents == null ? "Preço indisponível" : money(alt.price_cents);
        return '<button class="product-choice' + (selectedOption ? ' is-selected' : '') + '" type="button" data-select-position="' + esc(item.position_id) + '" data-select-product="' + esc(alt.product_id) + '" aria-pressed="' + String(selectedOption) + '"' + (data.changing ? ' disabled' : '') + '>' +
          '<img src="' + esc(alt.image_url || "../img/logoantonia5.png") + '" alt="" width="44" height="44" loading="lazy" decoding="async">' +
          '<span class="product-choice-copy"><strong>' + esc(alt.name || "Produto") + '</strong><small>' + esc(optionPrice) + '</small></span>' +
          (selectedOption ? '<span class="product-choice-check" aria-hidden="true">✓</span>' : '') +
          '</button>';
      }).join("");
      const panelContent = expanded
        ? (item._optionsLoading
          ? '<p class="variation-status" role="status">Buscando somente as opções deste produto…</p>'
          : alternatives.length > 1
            ? '<p class="variation-panel-label">Opções disponíveis</p><div class="product-option-picker" role="group" aria-label="Opções para ' + esc(item.label || item.name) + '">' + choices + '</div>'
            : '<p class="variation-status">Não há outras opções disponíveis para este produto.</p>')
        : "";
      const optionPicker = optionCount > 1
        ? '<div class="variation-disclosure">' +
          '<button class="variation-toggle" type="button" data-toggle-position="' + esc(item.position_id) + '" aria-expanded="' + String(Boolean(expanded)) + '" aria-controls="item-options-' + esc(item.position_id) + '"' + (data.changing || item._optionsLoading ? ' disabled' : '') + '>' +
          '<span>' + (item._optionsLoading ? "Carregando opções…" : item._optionsError ? "Tentar novamente" : expanded ? "Ocultar opções" : "Trocar Marca") + '</span>' +
          '<span class="variation-chevron" aria-hidden="true">' + (expanded ? "−" : "+") + '</span>' +
          '</button>' +
          '<div class="variation-panel" id="item-options-' + esc(item.position_id) + '"' + (expanded ? "" : " hidden") + ' aria-busy="' + String(Boolean(item._optionsLoading || changingThisItem)) + '">' +
          panelContent +
          '</div></div>'
        : "";
      const itemQuantity = quantityOf(item);
      return '<article class="product-row" data-product-row="' + esc(item.position_id) + '"><div class="product-row-main"><img src="' + esc(image) + '" alt="" width="58" height="58" loading="lazy" decoding="async">' +
        '<div class="product-row-copy"><h3 class="product-name">' + esc(item.name || "Produto") + '</h3><div class="product-quantity-line"><strong>Quantidade:</strong><div class="quantity-stepper">' +
        '<button class="quantity-button" type="button" data-adjust-position="' + esc(item.position_id) + '" data-delta="-1" aria-label="Diminuir quantidade de ' + esc(item.name || "produto") + '"' + (itemQuantity <= 0 || data.changing ? " disabled" : "") + '>−</button>' +
        '<output class="quantity-value" data-quantity-value="' + esc(item.position_id) + '" aria-live="polite">' + itemQuantity + '</output>' +
        '<button class="quantity-button" type="button" data-adjust-position="' + esc(item.position_id) + '" data-delta="1" aria-label="Aumentar quantidade de ' + esc(item.name || "produto") + '"' + (data.changing ? " disabled" : "") + '>+</button></div></div></div></div>' +
        optionPicker + "</article>";
    }).join("");
    const note = data.orderable ? "" : '<p class="helper stock-note">Esta composição está sem estoque disponível no momento.</p>';
    $("detail-content").innerHTML = note + '<div class="product-list">' + rows + "</div>" + extraCategoriesMarkup(data);
    $("order-button").disabled = !data.orderable;
    $("detail-content").querySelectorAll("[data-toggle-position]").forEach((button) => button.addEventListener("click", () => toggleItemOptions(button.dataset.togglePosition)));
    $("detail-content").querySelectorAll("[data-select-position]").forEach((button) => button.addEventListener("click", () => changeProduct(button.dataset.selectPosition, button.dataset.selectProduct)));
    $("detail-content").querySelectorAll("[data-adjust-position]").forEach((button) => button.addEventListener("click", () => changeBasketItemQuantity(button.dataset.adjustPosition, Number(button.dataset.delta || 0))));
    $("detail-content").querySelectorAll("[data-extra-category]").forEach((button) => button.addEventListener("click", () => toggleExtraCategory(button.dataset.extraCategory)));
    $("detail-content").querySelectorAll("[data-extra-scroll]").forEach((scrollElement) => scrollElement.addEventListener("scroll", () => {
      if (scrollElement.scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - 56) loadMoreExtraProducts(scrollElement.dataset.extraScroll, scrollElement);
    }, { passive: true }));
    bindExtraProductControls($("detail-content"));
    $("detail-content").querySelectorAll("img").forEach((image) => image.addEventListener("error", () => { image.src = "../img/logoantonia5.png"; }, { once: true }));
  }

  function renderDetailPreservingScroll(positionId) {
    const content = $("detail-content");
    const scrollTop = content.scrollTop;
    const viewport = content.getBoundingClientRect();
    const rows = Array.from(content.querySelectorAll("[data-product-row]"));
    const anchor = (positionId
      ? rows.find((row) => row.dataset.productRow === String(positionId))
      : null) || rows.find((row) => {
        const rect = row.getBoundingClientRect();
        return rect.bottom > viewport.top && rect.top < viewport.bottom;
      }) || rows[0];
    const anchorId = anchor && anchor.dataset.productRow;
    const anchorOffset = anchor ? anchor.getBoundingClientRect().top - viewport.top : null;
    const pickerScroll = new Map();
    content.querySelectorAll(".product-option-picker").forEach((picker) => {
      const row = picker.closest("[data-product-row]");
      if (row) pickerScroll.set(row.dataset.productRow, picker.scrollTop);
    });
    const active = document.activeElement;
    const focusKind = active && content.contains(active)
      ? active.matches("[data-select-position]") ? "choice"
        : active.matches("[data-toggle-position]") ? "toggle"
          : ""
      : "";
    const focusPosition = focusKind && (active.dataset.selectPosition || active.dataset.togglePosition);
    const focusProduct = focusKind === "choice" ? active.dataset.selectProduct : "";

    renderDetail();

    const nextAnchor = anchorId
      ? Array.from(content.querySelectorAll("[data-product-row]")).find((row) => row.dataset.productRow === anchorId)
      : null;
    let targetScrollTop = scrollTop;
    if (nextAnchor && anchorOffset != null) {
      const nextViewportTop = content.getBoundingClientRect().top;
      const nextOffset = nextAnchor.getBoundingClientRect().top - nextViewportTop;
      targetScrollTop = Math.max(0, scrollTop + nextOffset - anchorOffset);
    }
    const restorePickers = () => {
      content.querySelectorAll(".product-option-picker").forEach((picker) => {
        const row = picker.closest("[data-product-row]");
        if (row && pickerScroll.has(row.dataset.productRow)) {
          picker.scrollTop = pickerScroll.get(row.dataset.productRow);
        }
      });
    };
    content.scrollTop = targetScrollTop;
    restorePickers();

    if (focusKind && focusPosition) {
      const selector = focusKind === "choice" ? "[data-select-position]" : "[data-toggle-position]";
      const focusTarget = Array.from(content.querySelectorAll(selector)).find((button) =>
        (focusKind === "choice" ? button.dataset.selectPosition : button.dataset.togglePosition) === String(focusPosition) &&
        (focusKind !== "choice" || button.dataset.selectProduct === String(focusProduct))
      );
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }
    content.scrollTop = targetScrollTop;
    restorePickers();
  }

  function setQuotePendingControls(sizeKey, positionId, pending) {
    if (state.activeKey !== sizeKey || $("detail-sheet").hidden) return;
    const data = state.baskets.get(sizeKey);
    const content = $("detail-content");
    content.querySelectorAll("[data-select-position], [data-toggle-position], [data-adjust-position]").forEach((button) => {
      const buttonPosition = button.dataset.selectPosition || button.dataset.togglePosition || button.dataset.adjustPosition;
      const item = data.items.find((row) => String(row.position_id) === String(buttonPosition));
      const delta = Number(button.dataset.delta || 0);
      const atMinimum = button.dataset.adjustPosition && delta < 0 && quantityOf(item) <= 0;
      const atLimit = button.dataset.adjustPosition && delta > 0 && quantityOf(item) >= 1000;
      button.disabled = Boolean(pending || item && item._optionsLoading || atMinimum || atLimit);
    });
    content.querySelectorAll(".variation-panel").forEach((panel) => {
      const row = panel.closest("[data-product-row]");
      const item = row && data.items.find((entry) => String(entry.position_id) === row.dataset.productRow);
      const changingThisItem = Boolean(pending && row && row.dataset.productRow === String(positionId));
      if (changingThisItem || item && item._optionsLoading) panel.setAttribute("aria-busy", "true");
      else panel.removeAttribute("aria-busy");
    });
  }

  function updateSelectedProductInPlace(sizeKey, positionId) {
    if (state.activeKey !== sizeKey || $("detail-sheet").hidden) return;
    const data = state.baskets.get(sizeKey);
    const item = data && data.items.find((row) => String(row.position_id) === String(positionId));
    const content = $("detail-content");
    const row = Array.from(content.querySelectorAll("[data-product-row]")).find((entry) => entry.dataset.productRow === String(positionId));
    if (!data || !item || !row) return;

    const image = row.querySelector(".product-row-main img");
    const name = row.querySelector(".product-name");
    const quantity = row.querySelector(".product-quantity-line strong");
    if (image) image.src = item.image_url || "../img/cestas/cesta-mini.jpg";
    if (name) name.textContent = item.name || "Produto";
    if (quantity) quantity.textContent = "Quantidade:";
    const quantityValue = row.querySelector("[data-quantity-value]");
    if (quantityValue) quantityValue.textContent = String(quantityOf(item));
    row.querySelectorAll("[data-adjust-position]").forEach((button) => {
      button.disabled = Number(button.dataset.delta || 0) < 0 ? quantityOf(item) <= 0 : quantityOf(item) >= 1000;
    });

    row.querySelectorAll("[data-select-product]").forEach((button) => {
      const selected = String(button.dataset.selectProduct) === String(item.product_id);
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      let marker = button.querySelector(".product-choice-check");
      if (selected && !marker) {
        marker = document.createElement("span");
        marker.className = "product-choice-check";
        marker.setAttribute("aria-hidden", "true");
        marker.textContent = "✓";
        button.appendChild(marker);
      } else if (!selected && marker) {
        marker.remove();
      }
    });
    $("detail-total").textContent = money(displayedTotalCents(data));
  }

  async function changeProduct(positionId, productId) {
    const sizeKey = state.activeKey;
    const data = state.baskets.get(sizeKey);
    if (!data || data.changing) return;

    const item = data.items.find((row) => String(row.position_id) === String(positionId));
    const choice = item && (item._alternatives || []).find((option) => String(option.product_id) === String(productId));
    if (!item || !choice || String(item.product_id) === String(productId)) return;
    if (data.items.some((row) => row._optionsLoading)) {
      toast("Aguarde o carregamento das opções antes de trocar outro produto.");
      return;
    }

    const selectedItems = data.items.map((row) => Object.assign({}, row));
    const selectedItem = selectedItems.find((row) => String(row.position_id) === String(positionId));
    Object.assign(selectedItem, {
      product_id: choice.product_id,
      name: choice.name || selectedItem.name,
      image_url: choice.image_url || selectedItem.image_url,
      packaging: choice.packaging || selectedItem.packaging,
      stock_quantity: choice.stock_quantity,
      price_cents: choice.price_cents
    });
    const selections = selectedItems.map((row) => ({
      position_id: row.position_id,
      product_id: row.product_id,
      quantity: quantityOf(row)
    }));

    data.changing = true;
    data.changingPosition = String(positionId);
    setQuotePendingControls(sizeKey, positionId, true);

    const update = (async () => {
      try {
        const quote = await quoteBasket(data.basket, selections, selectedItems);
        const currentItems = new Map(data.items.map((row) => [String(row.position_id), row]));
        quote.items = quote.items.map((row) => {
          const current = currentItems.get(String(row.position_id));
          return current ? Object.assign({}, row, {
            _alternatives: current._alternatives || row._alternatives || [],
            _optionsLoaded: current._optionsLoaded === true || row._optionsLoaded === true,
            _optionsLoading: current._optionsLoading === true,
            _optionsError: current._optionsError === true,
            _expanded: current._expanded === true
          }) : row;
        });
        Object.assign(data, quote, { orderable: true, detailLoaded: true });
        updateSelectedProductInPlace(sizeKey, positionId);
        return true;
      } catch (_) {
        toast("Essa troca não está disponível agora. A escolha anterior foi mantida.");
        return false;
      } finally {
        data.changing = false;
        data.changingPosition = "";
        setQuotePendingControls(sizeKey, positionId, false);
        if (data.changePromise === update) data.changePromise = null;
      }
    })();
    data.changePromise = update;
    await update;
  }

  function openDetail(sizeKey) {
    const data = state.baskets.get(sizeKey);
    if (!data) return;
    state.activeKey = sizeKey;
    $("detail-content").scrollTop = 0;
    if (data.detailLoaded) data.items.forEach((item) => { item._expanded = false; });
    if (data.error) data.error = false;
    renderDetail();
    showSheet("detail-sheet");
    if (data.detailLoaded || data.detailPromise) return;
    data.detailPromise = basketForSize(sizeKey).then((detail) => {
      Object.assign(data, detail, { summary: data.summary, detailLoaded: true, error: false });
      renderCards();
    }).catch(() => {
      data.error = true;
    }).finally(() => {
      data.detailPromise = null;
      if (state.activeKey === sizeKey && !$('detail-sheet').hidden) renderDetail();
    });
  }

  function addressLines(address) {
    if (!address) return [];
    const first = [address.street, address.number, address.complement].filter(Boolean).join(", ");
    const second = [address.neighborhood, address.city, address.state].filter(Boolean).join(" · ");
    const third = address.postal_code ? "CEP " + address.postal_code : "";
    const fourth = address.reference ? "Referência: " + address.reference : "";
    return [first, second, third, fourth].filter(Boolean);
  }

  function updateConfirmOrderAvailability() {
    const select = $("delivery-date");
    const payment = document.querySelector('input[name="payment"]:checked');
    const selectedDateIsAvailable = select && !select.disabled && state.deliveryOptions.some((option) => option.date === select.value);
    $("confirm-order").disabled = state.submittingOrder || !state.customer || !payment || !selectedDateIsAvailable;
  }

  function loadDeliveryOptions() {
    if (state.deliveryPromise) return state.deliveryPromise;
    const select = $("delivery-date");
    const message = $("delivery-date-message");
    const previousDate = select.value;
    state.deliveryOptions = [];
    select.disabled = true;
    select.innerHTML = '<option value="">Carregando datas disponíveis…</option>';
    message.textContent = "Carregando as datas de entrega…";
    updateConfirmOrderAvailability();

    state.deliveryPromise = request("delivery_options")
      .then((result) => {
        const options = (Array.isArray(result.options) ? result.options : [])
          .filter((option) => option && /^\d{4}-\d{2}-\d{2}$/.test(String(option.date || "")) && String(option.label || "").trim())
          .slice(0, 10);
        state.deliveryOptions = options;
        if (!options.length) {
          select.innerHTML = '<option value="">Nenhuma data disponível</option>';
          select.disabled = true;
          message.textContent = "No momento não há datas de entrega disponíveis.";
          return;
        }
        select.innerHTML = '<option value="">Selecione uma data</option>' +
          options.map((option) => '<option value="' + esc(option.date) + '">' + esc(option.label) + "</option>").join("");
        select.value = options.some((option) => option.date === previousDate) ? previousDate : "";
        select.disabled = false;
        message.textContent = "As datas disponíveis são atualizadas ao abrir o checkout.";
      })
      .catch(() => {
        state.deliveryOptions = [];
        select.innerHTML = '<option value="">Não foi possível carregar as datas</option>';
        select.disabled = true;
        message.textContent = "Não foi possível carregar as datas. Feche e reabra o checkout para tentar novamente.";
      })
      .finally(() => {
        state.deliveryPromise = null;
        updateConfirmOrderAvailability();
      });
    return state.deliveryPromise;
  }

  async function lookupCustomer() {
    const phone = phoneDigits($("customer-phone").value);
    state.customer = null;
    $("customer-card").hidden = true;
    $("payment-options").disabled = true;
    $("confirm-order").disabled = true;
    if (phone.length < 10 || phone.length > 13) {
      $("lookup-message").textContent = "Digite um telefone com DDD.";
      return;
    }
    $("lookup-button").disabled = true;
    $("lookup-button").textContent = "Buscando…";
    $("lookup-message").textContent = "Consultando cadastro…";
    try {
      const result = await request("customer_lookup", { params: { phone } });
      if (!result.found || !result.customer) {
        $("lookup-message").textContent = "Não encontramos esse telefone. Peça à loja para cadastrar seu endereço.";
        return;
      }
      state.customer = result.customer;
      const customer = result.customer;
      const lines = addressLines(customer.address);
      $("customer-card").innerHTML = "<strong>" + esc(customer.display_name || "Cliente") + "</strong>" +
        '<span class="muted-line">' + esc(customer.phone || $("customer-phone").value) + "</span><br>" +
        (lines.length ? lines.map(esc).join("<br>") : "Endereço cadastrado sem detalhes.");
      $("customer-card").hidden = false;
      $("payment-options").disabled = false;
      $("lookup-message").textContent = "Cadastro encontrado. Escolha a data de entrega e a forma de pagamento.";
      updateConfirmOrderAvailability();
    } catch (error) {
      $("lookup-message").textContent = error.message === "rate_limited" ? "Muitas buscas. Aguarde um pouco e tente novamente." : "Não foi possível consultar agora. Tente novamente.";
    } finally {
      $("lookup-button").disabled = false;
      $("lookup-button").textContent = "Buscar";
    }
  }

  function buildOrderMessage() {
    const data = state.baskets.get(state.activeKey);
    const customer = state.customer || {};
    const payment = document.querySelector('input[name="payment"]:checked');
    const address = addressLines(customer.address);
    const lines = [
      "Pedido de cesta básica — Dona Antônia",
      "",
      "Cesta: " + (data.basket.name || "Cesta básica"),
      "Produtos:",
      ...data.items.map((item) => "• " + (item.quantity || item.base_quantity || 0) + " × " + item.name + (item.packaging ? " (" + item.packaging + ")" : "")),
      "",
      "Valor total: " + money(data.totalCents),
      "Forma de pagamento: " + (payment ? payment.value : ""),
      "",
      "Cliente: " + (customer.display_name || ""),
      "Telefone: " + (customer.phone || $("customer-phone").value),
      "Endereço:",
      ...(address.length ? address.map((line) => "  " + line) : ["  Endereço não informado"])
    ];
    return lines.join("\n");
  }

  async function confirmOrder() {
    const data = state.baskets.get(state.activeKey);
    const customer = state.customer;
    const payment = document.querySelector('input[name="payment"]:checked');
    const deliveryDate = $("delivery-date").value;
    const dateIsAvailable = state.deliveryOptions.some((option) => option.date === deliveryDate);
    if (!data || !customer || !payment || !dateIsAvailable) return;
    const recipient = whatsappNumber(customer.phone || $("customer-phone").value);
    if (!recipient) {
      toast("O telefone cadastrado não está em um formato válido.");
      return;
    }
    const button = $("confirm-order");
    state.submittingOrder = true;
    updateConfirmOrderAvailability();
    button.textContent = "Registrando…";
    try {
      const result = await request("submit_order", {
        method: "POST",
        body: {
          whatsapp_phone: customer.phone || $("customer-phone").value,
          delivery_date: deliveryDate,
          payment_method: payment.value,
          customer_details: {
            name: customer.display_name || "",
            address: {
              street: customer.address && customer.address.street || "",
              number: customer.address && customer.address.number || "",
              district: customer.address && (customer.address.district || customer.address.neighborhood) || "",
              city: customer.address && customer.address.city || "",
              state: customer.address && customer.address.state || "",
              postal_code: customer.address && customer.address.postal_code || "",
              complement: customer.address && customer.address.complement || ""
            }
          },
          items: [{
            type: "basket_mold",
            id: data.basket.id,
            qty: 1,
            composition_number: data.basket.composition_number || 1,
            components: data.items.map((item) => ({
              position_id: item.position_id,
              product_id: item.product_id,
              quantity: quantityOf(item)
            }))
          }, ...Array.from(data.extraSelections.values()).filter((item) => Number(item.quantity || 0) > 0).map((item) => ({
            type: "product", id: item.id, qty: Number(item.quantity)
          }))]
        }
      });
      closeSheet("order-sheet");
      toast(result.stock_adjustment
        ? "Pedido " + (result.order_number || "") + " registrado no Admin com ajuste de estoque."
        : "Pedido " + (result.order_number || "") + " registrado no Admin.");
    } catch (error) {
      const reason = String(error && error.message || "");
      const messages = {
        delivery_details_required: "Complete o endereço de entrega antes de concluir o pedido.",
        required_checkout_data: "A data de entrega é obrigatória. Reabra o checkout para carregar as datas disponíveis e tente novamente.",
        customer_name_required: "O cadastro precisa ter o nome do cliente.",
        all_items_unavailable: "Os produtos ficaram sem estoque. Atualize a cesta e tente novamente.",
        invalid_whatsapp_phone: "O telefone do cadastro não está em um formato válido.",
        invalid_payment: "A forma de pagamento não foi reconhecida. Selecione novamente e tente outra vez."
      };
      toast(messages[reason] || "Não foi possível registrar o pedido. Confira os dados e tente novamente.");
    } finally {
      state.submittingOrder = false;
      button.textContent = "Confirmar pedido";
      updateConfirmOrderAvailability();
    }
  }

  $("retry-catalog").addEventListener("click", loadCatalog);
  $("order-button").addEventListener("click", async () => {
    const sizeKey = state.activeKey;
    const basket = state.baskets.get(sizeKey);
    if (!basket || !basket.orderable) return;
    const pendingChange = basket.changePromise;
    if (pendingChange && !(await pendingChange)) return;
    if (state.activeKey !== sizeKey || $("detail-sheet").hidden || !basket.orderable) return;
    closeSheet("detail-sheet");
    showSheet("order-sheet");
    loadDeliveryOptions();
    $("customer-phone").focus({ preventScroll: true });
  });
  $("lookup-button").addEventListener("click", lookupCustomer);
  $("customer-phone").addEventListener("keydown", (event) => { if (event.key === "Enter") lookupCustomer(); });
  $("payment-options").addEventListener("change", updateConfirmOrderAvailability);
  $("delivery-date").addEventListener("change", updateConfirmOrderAvailability);
  $("confirm-order").addEventListener("click", confirmOrder);
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => closeSheet(button.dataset.close + "-sheet")));
  document.querySelectorAll(".sheet-backdrop").forEach((backdrop) => backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeSheet(backdrop.id);
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!$("order-sheet").hidden) closeSheet("order-sheet");
      else if (!$("detail-sheet").hidden) closeSheet("detail-sheet");
    }
  });

  loadCatalog();
})();
