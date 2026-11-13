(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const root = String(config.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/" + (config.storefrontFunction || "storefront-v2");
  const key = config.publishableKey || "";
  const catalogCode = new URLSearchParams(window.location.search).get("catalog_code") || "";
  const state = { cards: [], baskets: new Map(), activeKey: "", customer: null, toastTimer: 0, deliveryOptions: [], deliveryPromise: null, submittingOrder: false, catalogCode: /^\d{4}$/.test(catalogCode) ? catalogCode : "", identityLookupStarted: false };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const plain = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const money = (cents) => (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Salva os itens do carrinho, sem dados pessoais ou do checkout.
  const CART_STORAGE_KEY = "dona-antonia:storefront-cart:v1";
  const CART_STORAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  let pendingCartSnapshot = readCartSnapshot();
  let cartPersistenceReady = !pendingCartSnapshot;
  let cartRestorePromise = null;

  function storedProductRows(rows) {
    return (Array.isArray(rows) ? rows : []).slice(0, 200).map((row) => {
      const id = String(row && row.id || "").slice(0, 120);
      const quantity = Math.max(0, Math.min(1000, Math.trunc(Number(row && row.quantity || 0))));
      if (!id || quantity <= 0) return null;
      return {
        id,
        quantity,
        name: String(row && row.name || "Produto").slice(0, 160),
        image_url: String(row && row.image_url || "").slice(0, 500),
        price_cents: Math.max(0, Math.trunc(Number(row && row.price_cents || 0))),
        stock_quantity: Math.max(0, Math.trunc(Number(row && row.stock_quantity || 0)))
      };
    }).filter(Boolean);
  }

  function readCartSnapshot() {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      const savedAt = Number(saved && saved.saved_at || 0);
      if (!saved || saved.version !== 1 || !Number.isFinite(savedAt) ||
          savedAt <= 0 || Date.now() - savedAt > CART_STORAGE_MAX_AGE_MS ||
          savedAt > Date.now() + 60000) {
        window.localStorage.removeItem(CART_STORAGE_KEY);
        return null;
      }
      const items = (Array.isArray(saved.items) ? saved.items : []).slice(0, 200).map((row) => {
        const positionId = String(row && row.position_id || "").slice(0, 120);
        const productId = String(row && row.product_id || "").slice(0, 120);
        if (!positionId || !productId) return null;
        const options = (Array.isArray(row && row.options) ? row.options : []).slice(0, 100).map((option) => ({
          product_id: String(option && option.product_id || "").slice(0, 120),
          quantity: Math.max(0, Math.min(1000, Math.trunc(Number(option && option.quantity || 0))))
        })).filter((option) => option.product_id && option.quantity > 0);
        return {
          position_id: positionId,
          product_id: productId,
          quantity: Math.max(0, Math.min(1000, Math.trunc(Number(row && row.quantity || 0)))),
          options
        };
      }).filter(Boolean);
      return {
        version: 1,
        saved_at: savedAt,
        size_key: String(saved.size_key || "").slice(0, 40),
        custom: saved.custom === true,
        items,
        extras: storedProductRows(saved.extras),
        home_extras: storedProductRows(saved.home_extras)
      };
    } catch (_) {
      return null;
    }
  }

  function clearPersistedCart() {
    pendingCartSnapshot = null;
    cartPersistenceReady = true;
    try { window.localStorage.removeItem(CART_STORAGE_KEY); } catch (_) {}
  }

  function selectionsForStorage(map) {
    if (!(map instanceof Map)) return [];
    return Array.from(map.entries()).map(([key, item]) => ({
      id: String(item && item.id || key || ""),
      quantity: Math.max(0, Math.min(1000, Math.trunc(Number(item && item.quantity || 0)))),
      name: String(item && item.name || "Produto"),
      image_url: String(item && (item.image_url || item.image) || ""),
      price_cents: Number(item && item.price_cents || 0),
      stock_quantity: Number(item && item.stock_quantity || 0)
    })).filter((item) => item.id && item.quantity > 0).slice(0, 200);
  }

  function persistCartSnapshot() {
    if (!cartPersistenceReady) return;
    const data = state.baskets.get(state.activeKey);
    if (state.activeKey && data && data.customOrder !== true && !data.detailLoaded) return;

    const basketData = data && data.customOrder !== true && data.detailLoaded && data.basket ? data : null;
    const items = basketData ? basketData.items.map((item) => ({
      position_id: String(item.position_id || ""),
      product_id: String(item.product_id || ""),
      quantity: quantityOf(item),
      options: (Array.isArray(item.selected_options) ? item.selected_options : [])
        .filter((option) => option && option.product_id && Number(option.quantity || 0) > 0)
        .map((option) => ({
          product_id: String(option.product_id),
          quantity: Math.max(0, Math.min(1000, Math.trunc(Number(option.quantity || 0))))
        }))
    })).filter((item) => item.position_id && item.product_id) : [];
    const extras = selectionsForStorage(data && data.extraSelections);
    const homeExtras = selectionsForStorage(state.homeExtraSelections);
    if (pendingCartSnapshot && pendingCartSnapshot.size_key && !basketData && !(data && data.customOrder === true)) {
      const preserved = Object.assign({}, pendingCartSnapshot, {
        saved_at: Date.now(),
        home_extras: homeExtras
      });
      try {
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(preserved));
        pendingCartSnapshot = preserved;
      } catch (_) {}
      return;
    }
    const hasBasketItems = items.some((item) => item.quantity > 0);
    if (!hasBasketItems && !extras.length && !homeExtras.length) {
      clearPersistedCart();
      return;
    }

    const snapshot = {
      version: 1,
      saved_at: Date.now(),
      size_key: basketData ? String(state.activeKey) : "",
      custom: Boolean(data && data.customOrder === true),
      items,
      extras,
      home_extras: homeExtras
    };
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(snapshot));
      pendingCartSnapshot = snapshot;
    } catch (_) {}
  }

  async function restoreCartSnapshot() {
    if (!pendingCartSnapshot || !state.cards.length) return;
    if (cartRestorePromise) return cartRestorePromise;
    const saved = pendingCartSnapshot;
    cartRestorePromise = (async () => {
      const productRows = new Map();
      const uniqueProducts = new Map();
      [...saved.extras, ...saved.home_extras].forEach((item) => {
        if (item && item.id && !uniqueProducts.has(item.id)) uniqueProducts.set(item.id, item);
      });
      const loadedProducts = await Promise.all(Array.from(uniqueProducts.values()).map(async (item) => {
        let product = null;
        try {
          const result = await request("product", { params: { product_id: item.id } });
          product = result && result.product || null;
        } catch (error) {
          if (String(error && error.message || "") !== "product_not_found") {
            product = Object.assign({}, item, { id: item.id, _cartPriceMayBeStale: true });
          }
        }
        if (product && Number(product.stock_quantity || 0) > 0) productRows.set(item.id, product);
        return productRows.get(item.id) || null;
      }));
      const loadSelections = (rows) => {
        const selections = new Map();
        rows.forEach((item) => {
          const product = productRows.get(String(item.id));
          if (!product) return;
          const stock = Math.max(0, Math.trunc(Number(product.stock_quantity || 0)));
          const quantity = Math.min(stock, Math.max(0, Math.trunc(Number(item.quantity || 0))));
          if (!quantity) return;
          selections.set(String(item.id), Object.assign({}, product, {
            id: String(item.id),
            quantity,
            price_cents: Number(product.price_cents || 0),
            stock_quantity: stock
          }));
        });
        return selections;
      };

      if (!(state.homeExtraSelections instanceof Map)) state.homeExtraSelections = new Map();
      else state.homeExtraSelections.clear();
      if (!(state.homeExtraProducts instanceof Map)) state.homeExtraProducts = new Map();
      const homeSelections = loadSelections(saved.home_extras);
      homeSelections.forEach((item, id) => {
        state.homeExtraSelections.set(id, item);
        state.homeExtraProducts.set(id, productRows.get(id) || item);
      });

      let restoredBasket = false;
      let basketRestoreFailed = false;
      let restoredQuoteRefreshed = true;
      let basketConfigurationChanged = false;
      const sizeKey = saved.size_key;
      if (sizeKey && saved.custom !== true && state.baskets.has(sizeKey)) {
        const data = state.baskets.get(sizeKey);
        try {
          const detail = await basket.basketForSize(sizeKey);
          const restored = await basket.restoreBasketSelections(detail, saved.items);
          Object.assign(data, restored, { summary: data.summary, detailLoaded: true, error: false });
          data.extraSelections = loadSelections(saved.extras);
          data.homeExtraProductIds = new Set(Array.from(homeSelections.keys()));
          extras.attachHomeSelections(data);
          state.activeKey = sizeKey;
          restoredBasket = true;
          restoredQuoteRefreshed = restored.cartQuoteRefreshed !== false;
          basketConfigurationChanged = restored.cartConfigurationChanged === true;
        } catch (_) {
          state.activeKey = "";
          basketRestoreFailed = true;
        }
      } else if (sizeKey && saved.custom !== true) {
        basketRestoreFailed = true;
      } else if (saved.custom === true) {
        const customSelections = loadSelections(saved.extras.length ? saved.extras : saved.home_extras);
        if (customSelections.size) {
          const customKey = "__custom_products__";
          state.baskets.set(customKey, {
            customOrder: true,
            summary: { name: "Pedido personalizado" },
            basket: null,
            items: [],
            totalCents: 0,
            orderable: true,
            extraSelections: customSelections,
            homeExtraProductIds: new Set(Array.from(homeSelections.keys()))
          });
          state.activeKey = customKey;
        }
      }

      if (!basketRestoreFailed) pendingCartSnapshot = null;
      cartPersistenceReady = true;
      if (typeof extras.syncHomeExtraSelection === "function") {
        homeSelections.forEach((_, id) => extras.syncHomeExtraSelection(id));
        if (!homeSelections.size) extras.syncHomeExtraSelection("");
      }
      if (typeof state.updateSidebarCheckoutCount === "function") state.updateSidebarCheckoutCount();
      renderCards();
      if (state.activeKey) renderDetail();
      const unavailableProducts = Array.from(uniqueProducts.keys()).filter((id) => !productRows.has(id)).length;
      if (basketRestoreFailed) {
        toast("Não foi possível atualizar a cesta agora; mantivemos o carrinho salvo. Tente novamente.");
      } else if (restoredBasket || state.activeKey === "__custom_products__" || homeSelections.size) {
        const usedFallbackPrice = loadedProducts.some((product) => product && product._cartPriceMayBeStale);
        const message = unavailableProducts
          ? "Atualizamos o carrinho; alguns produtos não estão mais disponíveis e foram removidos."
          : basketConfigurationChanged
            ? "A composição da cesta mudou. Confira os itens atuais antes de enviar."
            : !restoredQuoteRefreshed
              ? "Carrinho restaurado; confira os itens atualizados antes de enviar."
              : usedFallbackPrice
                ? "Carrinho restaurado. Preços e estoque serão revalidados ao enviar."
                : "Carrinho restaurado com preços e disponibilidade atualizados.";
        toast(message);
      }
      persistCartSnapshot();
    })().catch(() => {
      cartPersistenceReady = true;
    }).finally(() => {
      cartRestorePromise = null;
    });
    return cartRestorePromise;
  }

  function quantityOf(item) {
    return Math.max(0, Math.trunc(Number(item ? (item.quantity ?? item.base_quantity ?? 0) : 0)));
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
    // Leituras não podem deixar a loja travada por minutos quando a API falha.
    // Gravações de pedidos não são abortadas automaticamente para evitar pedidos duplicados.
    const readRequest = init.method === "GET" || opts.readOnly === true;
    const timeoutMs = action.startsWith("basket_mold_options") ? 10000 : action === "home_size_cards" ? 16000 : 22000;
    const controller = readRequest && typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    if (controller) init.signal = controller.signal;
    try {
      const response = await fetch(url.toString(), init);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        const failure = new Error(data.error || "Não foi possível carregar agora.");
        failure.status = response.status;
        failure.data = data;
        throw failure;
      }
      return data;
    } catch (error) {
      if (controller?.signal.aborted) throw new Error("A consulta demorou além do esperado. Tente novamente.");
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  function imageForBasket(card, keyName) {
    return "assets/cestas/cesta-" + keyName + ".jpg";
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
    const contact = "https://wa.me/5565998150975?text=" + encodeURIComponent("Olá, gostaria de consultar as cestas básicas da Dona Antônia.");
    $("basket-grid").innerHTML = '<div class="empty-state" role="alert"><p>' + esc(message) +
      '</p><a class="button button-primary" href="' + esc(contact) + '" target="_blank" rel="noopener noreferrer">Consultar cestas pelo WhatsApp</a></div>';
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
      $("home-extras").hidden = false;
      initHomeExtras();
      restoreCartSnapshot();
    } catch (error) {
      $("home-extras").hidden = true;
      showEmpty("O catálogo está temporariamente indisponível. Você ainda pode consultar nossas cestas pelo WhatsApp.", true);
    }
  }

  function toast(message) {
    const node = $("toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.classList.remove("show"), 2900);
  }

  function syncSheetScrollState() {
    const detailOpen = !$("detail-sheet").hidden;
    const orderOpen = !$("order-sheet").hidden;
    document.body.classList.toggle("basket-detail-open", detailOpen);
    document.body.classList.toggle("sheet-open", orderOpen);
    document.body.classList.remove("sheet-scroll-chain");
  }

  function showSheet(id) {
    $(id).hidden = false;
    syncSheetScrollState();
  }

  function closeSheet(id, preserveCheckout = false) {
    $(id).hidden = true;
    syncSheetScrollState();
    if (id === "order-sheet" && !preserveCheckout) {
      state.customer = null;
      $("customer-card").hidden = true;
      $("payment-options").disabled = true;
      $("confirm-order").disabled = true;
      $("lookup-message").textContent = "Buscaremos o cadastro e o endereço já registrado.";
    }
  }

  document.addEventListener("click", (event) => {
    const navigation = event.target instanceof Element
      ? event.target.closest("[data-experiment-nav]")
      : null;
    if (navigation && navigation.dataset.experimentNav !== "basket" && !$("detail-sheet").hidden) {
      closeSheet("detail-sheet");
    }
  }, true);

  let basket = null;

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
      const selectedOptions = (Array.isArray(item.selected_options) ? item.selected_options : [])
        .filter((option) => option && option.product_id && Number(option.quantity || 0) > 0);
      const selectedById = new Map(selectedOptions.map((option) => [String(option.product_id), option]));
      const choiceById = new Map(alternatives.filter((option) => option && option.product_id).map((option) => [String(option.product_id), option]));
      selectedOptions.forEach((option) => {
        if (!choiceById.has(String(option.product_id))) choiceById.set(String(option.product_id), option);
      });
      const fallbackId = String(item.product_id || "");
      if (fallbackId && !choiceById.has(fallbackId)) {
        choiceById.set(fallbackId, {
          product_id: fallbackId, name: item.name, image_url: item.image_url,
          price_cents: item.price_cents, stock_quantity: item.stock_quantity,
          packaging: item.packaging
        });
      }
      const optionChoices = Array.from(choiceById.values());
      const originalOptionIndex = optionChoices.findIndex((option) => String(option.product_id) === fallbackId);
      if (originalOptionIndex > 0) optionChoices.unshift(optionChoices.splice(originalOptionIndex, 1)[0]);
      const optionCount = Math.max(Number(item.alternative_count || 0), optionChoices.length);
      const changingThisItem = String(data.changingPosition || "") === String(item.position_id);
      const title = item.label || "Produto";
      const itemQuantityAtLimit = (row) => quantityOf(row) >= 1000;
      const renderChoice = (alt) => {
        const productId = String(alt.product_id || "");
        const selected = selectedById.get(productId);
        const quantity = Math.max(0, Math.trunc(Number(selected && selected.quantity || 0)));
        const stock = Math.max(0, Math.trunc(Number(alt.stock_quantity || selected && selected.stock_quantity || 0)));
        const disabled = data.changing || item._optionsLoading;
        const optionName = alt.name || selected && selected.name || "Produto";
        const optionPrice = alt.price_cents == null ? "Preço indisponível" : money(alt.price_cents);
        return '<div class="product-choice' + (quantity > 0 ? ' is-selected' : '') + '" data-option-card="' + esc(productId) + '">' +
          '<img src="' + esc(alt.image_url || "../img/logoantonia5.png") + '" alt="" width="76" height="76" loading="lazy" decoding="async">' +
          '<span class="product-choice-copy"><strong>' + esc(optionName) + '</strong><small>' + esc(optionPrice) + '</small></span>' +
          '<span class="product-option-stepper" role="group" aria-label="Quantidade de ' + esc(optionName) + '">' +
            '<button class="quantity-button option-quantity-button" type="button" data-adjust-option data-adjust-position="' + esc(item.position_id) + '" data-adjust-product="' + esc(productId) + '" data-delta="-1" aria-label="Diminuir ' + esc(optionName) + '"' + (disabled || quantity <= 0 ? ' disabled' : '') + '>−</button>' +
            '<output class="product-option-quantity" data-option-quantity="' + esc(productId) + '" aria-live="polite">' + quantity + '</output>' +
            '<button class="quantity-button option-quantity-button" type="button" data-adjust-option data-adjust-position="' + esc(item.position_id) + '" data-adjust-product="' + esc(productId) + '" data-delta="1" aria-label="Adicionar ' + esc(optionName) + '"' + (disabled || quantity >= stock || itemQuantityAtLimit(item) ? ' disabled' : '') + '>+</button>' +
          '</span>' +
        '</div>';
      };
      const selectedChoice = optionChoices.find((option) => String(option.product_id) === fallbackId)
        || selectedOptions[0]
        || optionChoices[0]
        || { product_id: fallbackId, name: item.name, image_url: item.image_url, price_cents: item.price_cents, stock_quantity: item.stock_quantity };
      const selectedCard = selectedChoice && selectedChoice.product_id ? renderChoice(selectedChoice) : "";
      const choices = optionChoices.map(renderChoice).join("");
      const moreOptionsStatus = item._optionsMoreLoading
        ? item._optionsPageError
          ? '<p class="variation-status" role="alert">Não foi possível carregar as demais opções.</p><button class="button button-outline variation-retry" type="button" data-retry-position="' + esc(item.position_id) + '">Tentar novamente</button>'
          : item._optionsPageLoading
            ? '<p class="variation-status" role="status">Carregando mais opções…</p>'
            : '<p class="variation-status">As próximas opções serão carregadas ao chegar aqui.</p>'
        : "";
      const panelContent = item._optionsError
        ? selectedCard + '<p class="variation-status" role="alert">Não foi possível carregar outras opções.</p><button class="button button-outline variation-retry" type="button" data-retry-position="' + esc(item.position_id) + '">Tentar novamente</button>'
        : !item._optionsLoaded && optionCount > 1
          ? selectedCard + '<p class="variation-status" role="status">Carregando opções disponíveis…</p>'
          : choices
            ? '<div class="product-option-picker" role="group" aria-label="Opções para ' + esc(title) + '">' + choices + '</div>' + moreOptionsStatus
            : selectedCard + moreOptionsStatus;
      const optionPicker = '<div class="variation-disclosure"><div class="variation-panel" id="item-options-' + esc(item.position_id) + '" aria-busy="' + String(Boolean(item._optionsLoading || item._optionsPageLoading || changingThisItem)) + '">' +
        panelContent +
        '</div></div>';
      return '<article class="product-row" data-product-row="' + esc(item.position_id) + '"><div class="product-row-main"><h3 class="product-name">' + esc(title) + '</h3></div>' +
        optionPicker + "</article>";
    }).join("");
    const note = data.orderable ? "" : '<p class="helper stock-note">Esta composição está sem estoque disponível no momento.</p>';
    const manualReplacementNote = data.items.some((item) => item.manual_replacement_required === true)
      ? '<p class="helper stock-note">Alguns itens podem ser substituídos durante a separação do pedido.</p>'
      : "";
    $("detail-content").innerHTML = note + manualReplacementNote + '<div class="product-list">' + rows + "</div>" +
      '<div data-home-extra-review-mount>' + homeSelectionReviewMarkup(data) + "</div>" + extraCategoriesMarkup(data);
    $("order-button").disabled = !data.orderable;
    $("detail-content").querySelectorAll("[data-retry-position]").forEach((button) => button.addEventListener("click", () => retryItemOptions(button.dataset.retryPosition)));
    $("detail-content").querySelectorAll("[data-adjust-option]").forEach((button) => button.addEventListener("click", () => basket.changeProductQuantity(button.dataset.adjustPosition, button.dataset.adjustProduct, Number(button.dataset.delta || 0))));
    $("detail-content").querySelectorAll("[data-adjust-position]:not([data-adjust-option])").forEach((button) => button.addEventListener("click", () => changeBasketItemQuantity(button.dataset.adjustPosition, Number(button.dataset.delta || 0))));
    $("detail-content").querySelectorAll("[data-extra-category]").forEach((button) => button.addEventListener("click", () => toggleExtraCategory(button.dataset.extraCategory)));
    bindExtraProductControls($("detail-content"));
    bindHomeSelectionControls($("detail-content"), data);
    $("detail-content").querySelectorAll("img").forEach((image) => image.addEventListener("error", () => { image.src = "../img/logoantonia5.png"; }, { once: true }));
    if (basket) basket.queuePendingOptions();
  }

  function renderDetailPreservingScroll(positionId) {
    const content = $("detail-content");
    const rows = Array.from(content.querySelectorAll("[data-product-row]"));
    const viewportBottom = window.innerHeight || document.documentElement.clientHeight;
    const anchor = (positionId
      ? rows.find((row) => row.dataset.productRow === String(positionId))
      : null) || rows.find((row) => {
        const rect = row.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < viewportBottom;
      }) || rows[0];
    const anchorId = anchor && anchor.dataset.productRow;
    const anchorOffset = anchor ? anchor.getBoundingClientRect().top : null;
    const active = document.activeElement;
    const focusPosition = active && content.contains(active) && active.matches("[data-adjust-option]")
      ? active.dataset.adjustPosition : "";
    const focusProduct = focusPosition ? active.dataset.adjustProduct : "";
    const focusDelta = focusPosition ? active.dataset.delta : "";

    renderDetail();

    const nextAnchor = anchorId
      ? Array.from(content.querySelectorAll("[data-product-row]")).find((row) => row.dataset.productRow === anchorId)
      : null;
    if (nextAnchor && anchorOffset != null) {
      const nextOffset = nextAnchor.getBoundingClientRect().top;
      const targetScrollTop = Math.max(0, window.scrollY + nextOffset - anchorOffset);
      window.scrollTo(window.scrollX || 0, targetScrollTop);
    }

    if (focusPosition) {
      const focusTarget = Array.from(content.querySelectorAll("[data-adjust-option]")).find((button) =>
        button.dataset.adjustPosition === String(focusPosition) &&
        button.dataset.adjustProduct === String(focusProduct) &&
        button.dataset.delta === String(focusDelta)
      );
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }
  }

  function activateBasketNavigation(sizeKey, data) {
    const basketName = keyOf(data && (data.basket && data.basket.name || data.summary && data.summary.name) || sizeKey);
    const links = Array.from(document.querySelectorAll('.experiment-nav-link[data-experiment-nav="basket"]'));
    const target = links.find((link) => {
      const label = keyOf(link.dataset.size || "");
      return basketName === label || basketName.endsWith(" " + label);
    });
    if (!target) return;
    document.querySelectorAll(".experiment-nav-link").forEach((link) => {
      const active = link === target;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function openDetail(sizeKey) {
    const data = state.baskets.get(sizeKey);
    if (!data) return;
    activateBasketNavigation(sizeKey, data);
    state.activeKey = sizeKey;
    if (typeof state.updateSidebarCheckoutCount === "function") state.updateSidebarCheckoutCount();
    if (data.error) data.error = false;
    attachHomeSelections(data);
    renderDetail();
    showSheet("detail-sheet");
    window.scrollTo(0, 0);
    if (data.detailLoaded || data.detailPromise) return;
    data.detailPromise = basketForSize(sizeKey).then((detail) => {
      Object.assign(data, detail, { summary: data.summary, detailLoaded: true, error: false });
      attachHomeSelections(data);
      if (typeof state.updateSidebarCheckoutCount === "function") state.updateSidebarCheckoutCount();
      renderCards();
    }).catch(() => {
      data.error = true;
    }).finally(() => {
      data.detailPromise = null;
      if (state.activeKey === sizeKey && !$('detail-sheet').hidden) renderDetail();
    });
  }

  const extras = window.DonaStorefrontExtras.create({ state, $, esc, money, request, toast });
  basket = window.DonaStorefrontBasket.create({
    state, $, request, toast, renderDetailPreservingScroll, quantityOf, money,
    displayedTotalCents: extras.displayedTotalCents
  });
  const checkout = window.DonaStorefrontCheckout.create({
    state, $, esc, phoneDigits, money, toast, request, whatsappNumber, quantityOf, closeSheet, showSheet,
    changeBasketItemQuantity: basket.changeBasketItemQuantity,
    attachHomeSelections: extras.attachHomeSelections,
    onHomeExtraQuantityChanged: extras.syncHomeExtraSelection,
    onCustomOrderSubmitted: extras.clearHomeExtraSelections,
    onCartCleared: clearPersistedCart,
    onOrderSubmitted: clearPersistedCart
  });
  state.clearPersistedCart = clearPersistedCart;
  state.updateSidebarCheckoutCount = () => {
    const count = checkout.updateSidebarCheckoutCount();
    persistCartSnapshot();
    return count;
  };
  const {
    displayedTotalCents, extraCategoriesFor, extraCategoriesMarkup,
    bindExtraProductControls, toggleExtraCategory,
    initHomeExtras, homeSelectionReviewMarkup, bindHomeSelectionControls, attachHomeSelections
  } = extras;
  const { basketForSize, retryItemOptions, changeBasketItemQuantity } = basket;

  checkout.init();
  $("retry-catalog").addEventListener("click", loadCatalog);
  loadCatalog();
})();
