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
    const readRequest = init.method === "GET";
    const timeoutMs = action === "home_size_cards" ? 16000 : 22000;
    const controller = readRequest && typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    if (controller) init.signal = controller.signal;
    try {
      const response = await fetch(url.toString(), init);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || "Não foi possível carregar agora.");
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
    document.body.classList.toggle("sheet-open", detailOpen || orderOpen);
    document.body.classList.toggle("sheet-scroll-chain", detailOpen && !orderOpen);
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
    const optionsBusy = data.items.some((row) => row._optionsLoading);
    const rows = data.items.map((item) => {
      const alternatives = item._alternatives || [];
      const selected = alternatives.find((alt) => String(alt.product_id) === String(item.product_id));
      const image = selected && selected.image_url || item.image_url || "../img/cestas/cesta-mini.jpg";
      const optionCount = Math.max(Number(item.alternative_count || 0), alternatives.length);
      const changingThisItem = String(data.changingPosition || "") === String(item.position_id);

      const choices = alternatives.map((alt) => {
        const selectedOption = String(alt.product_id) === String(item.product_id);
        const optionPrice = alt.price_cents == null ? "Preço indisponível" : money(alt.price_cents);
        return '<button class="product-choice' + (selectedOption ? ' is-selected' : '') + '" type="button" data-select-position="' + esc(item.position_id) + '" data-select-product="' + esc(alt.product_id) + '" aria-pressed="' + String(selectedOption) + '"' + (data.changing || optionsBusy ? ' disabled' : '') + '>' +
          '<img src="' + esc(alt.image_url || "../img/logoantonia5.png") + '" alt="" width="52" height="52" loading="lazy" decoding="async">' +
          '<span class="product-choice-copy"><strong>' + esc(alt.name || "Produto") + '</strong><small>' + esc(optionPrice) + '</small></span>' +
          (selectedOption ? '<span class="product-choice-check" aria-hidden="true">✓</span>' : '') +
          '</button>';
      }).join("");
      const panelContent = item._optionsError
        ? '<p class="variation-panel-label">Escolha uma marca</p><p class="variation-status" role="alert">Não foi possível carregar as opções.</p><button class="button button-outline variation-retry" type="button" data-retry-position="' + esc(item.position_id) + '">Tentar novamente</button>'
        : item._optionsLoading || !item._optionsLoaded
          ? '<p class="variation-panel-label">Escolha uma marca</p><p class="variation-status" role="status">Carregando opções disponíveis…</p>'
          : alternatives.length > 1
            ? '<p class="variation-panel-label">Escolha uma marca</p><div class="product-option-picker" role="group" aria-label="Opções para ' + esc(item.label || item.name) + '">' + choices + '</div>'
            : '<p class="variation-panel-label">Escolha uma marca</p><p class="variation-status">Só há esta opção disponível no momento.</p>';
      const optionPicker = optionCount > 1
        ? '<div class="variation-disclosure"><div class="variation-panel" id="item-options-' + esc(item.position_id) + '" aria-busy="' + String(Boolean(item._optionsLoading || changingThisItem)) + '">' +
          panelContent +
          '</div></div>'
        : "";
      const itemQuantity = quantityOf(item);
      return '<article class="product-row" data-product-row="' + esc(item.position_id) + '"><div class="product-row-main"><img src="' + esc(image) + '" alt="" width="64" height="64" loading="lazy" decoding="async">' +
        '<div class="product-row-copy"><h3 class="product-name">' + esc(item.name || "Produto") + '</h3><div class="product-quantity-line"><strong>Quantidade:</strong><div class="quantity-stepper">' +
        '<button class="quantity-button" type="button" data-adjust-position="' + esc(item.position_id) + '" data-delta="-1" aria-label="Diminuir quantidade de ' + esc(item.name || "produto") + '"' + (itemQuantity <= 0 || data.changing || optionsBusy ? " disabled" : "") + '>−</button>' +
        '<output class="quantity-value" data-quantity-value="' + esc(item.position_id) + '" aria-live="polite">' + itemQuantity + '</output>' +
        '<button class="quantity-button" type="button" data-adjust-position="' + esc(item.position_id) + '" data-delta="1" aria-label="Aumentar quantidade de ' + esc(item.name || "produto") + '"' + (data.changing || optionsBusy ? " disabled" : "") + '>+</button></div></div></div></div>' +
        optionPicker + "</article>";
    }).join("");
    const note = data.orderable ? "" : '<p class="helper stock-note">Esta composição está sem estoque disponível no momento.</p>';
    $("detail-content").innerHTML = note + '<div class="product-list">' + rows + "</div>" +
      '<div data-home-extra-review-mount>' + homeSelectionReviewMarkup(data) + "</div>" + extraCategoriesMarkup(data);
    $("order-button").disabled = !data.orderable;
    $("detail-content").querySelectorAll("[data-retry-position]").forEach((button) => button.addEventListener("click", () => retryItemOptions(button.dataset.retryPosition)));
    $("detail-content").querySelectorAll("[data-select-position]").forEach((button) => button.addEventListener("click", () => changeProduct(button.dataset.selectPosition, button.dataset.selectProduct)));
    $("detail-content").querySelectorAll("[data-adjust-position]").forEach((button) => button.addEventListener("click", () => changeBasketItemQuantity(button.dataset.adjustPosition, Number(button.dataset.delta || 0))));
    $("detail-content").querySelectorAll("[data-extra-category]").forEach((button) => button.addEventListener("click", () => toggleExtraCategory(button.dataset.extraCategory)));
    bindExtraProductControls($("detail-content"));
    bindHomeSelectionControls($("detail-content"), data);
    $("detail-content").querySelectorAll("img").forEach((image) => image.addEventListener("error", () => { image.src = "../img/logoantonia5.png"; }, { once: true }));
    if (basket) basket.queueVisibleOptions();
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
    const active = document.activeElement;
    const focusPosition = active && content.contains(active) && active.matches("[data-select-position]")
      ? active.dataset.selectPosition : "";
    const focusProduct = focusPosition ? active.dataset.selectProduct : "";

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
    content.scrollTop = targetScrollTop;

    if (focusPosition) {
      const focusTarget = Array.from(content.querySelectorAll("[data-select-position]")).find((button) =>
        button.dataset.selectPosition === String(focusPosition) &&
        button.dataset.selectProduct === String(focusProduct)
      );
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }
    content.scrollTop = targetScrollTop;
  }

  function openDetail(sizeKey) {
    const data = state.baskets.get(sizeKey);
    if (!data) return;
    state.activeKey = sizeKey;
    $("detail-content").scrollTop = 0;
    if (data.error) data.error = false;
    attachHomeSelections(data);
    renderDetail();
    showSheet("detail-sheet");
    if (data.detailLoaded || data.detailPromise) return;
    data.detailPromise = basketForSize(sizeKey).then((detail) => {
      Object.assign(data, detail, { summary: data.summary, detailLoaded: true, error: false });
      attachHomeSelections(data);
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
    onCustomOrderSubmitted: extras.clearHomeExtraSelections
  });
  const {
    displayedTotalCents, extraCategoriesFor, extraCategoriesMarkup,
    bindExtraProductControls, toggleExtraCategory,
    initHomeExtras, homeSelectionReviewMarkup, bindHomeSelectionControls, attachHomeSelections
  } = extras;
  const { basketForSize, retryItemOptions, changeBasketItemQuantity, changeProduct } = basket;

  checkout.init();
  $("retry-catalog").addEventListener("click", loadCatalog);
  loadCatalog();
})();
