(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const root = String(config.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/" + (config.storefrontFunction || "storefront-v2");
  const key = config.publishableKey || "";
  const state = { cards: [], baskets: new Map(), activeKey: "", customizing: false, customer: null, toastTimer: 0 };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const plain = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const money = (cents) => (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
      detailPromise: null
    };
  }

  async function toggleItemOptions(positionId) {
    const sizeKey = state.activeKey;
    const data = state.baskets.get(sizeKey);
    if (!data || !state.customizing || data.changing) return;
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
      $("customize-button").disabled = true;
      return;
    }
    $("detail-title").textContent = data.basket.name || "Produtos da cesta";
    $("detail-total").textContent = data.changing ? "Atualizando…" : money(data.totalCents ?? data.basket.display_price_cents);
    $("customize-button").textContent = state.customizing ? "Concluir personalização" : "Personalizar";
    const rows = data.items.map((item) => {
      const alternatives = item._alternatives || [];
      const selected = alternatives.find((alt) => String(alt.product_id) === String(item.product_id));
      const image = selected && selected.image_url || item.image_url || "../img/cestas/cesta-mini.jpg";
      const expanded = state.customizing && item._expanded === true;
      const optionCount = Math.max(Number(item.alternative_count || 0), alternatives.length);
      const changingThisItem = String(data.changingPosition || "") === String(item.position_id);
      const changeStatus = changingThisItem ? '<p class="variation-status" role="status">Atualizando a cesta e o valor…</p>' : "";
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
        ? changeStatus || (item._optionsLoading
          ? '<p class="variation-status" role="status">Buscando somente as opções deste produto…</p>'
          : alternatives.length > 1
            ? '<p class="variation-panel-label">Opções disponíveis</p><div class="product-option-picker" role="group" aria-label="Opções para ' + esc(item.label || item.name) + '">' + choices + '</div>'
            : '<p class="variation-status">Não há outras opções disponíveis para este produto.</p>')
        : "";
      const optionPicker = state.customizing && optionCount > 1
        ? '<div class="variation-disclosure">' +
          '<button class="variation-toggle" type="button" data-toggle-position="' + esc(item.position_id) + '" aria-expanded="' + String(Boolean(expanded)) + '" aria-controls="item-options-' + esc(item.position_id) + '"' + (data.changing || item._optionsLoading ? ' disabled' : '') + '>' +
          '<span>' + (item._optionsLoading ? "Carregando opções…" : item._optionsError ? "Tentar novamente" : expanded ? "Ocultar opções" : "Escolher marca ou variação") + '</span>' +
          '<span class="variation-chevron" aria-hidden="true">' + (expanded ? "−" : "+") + '</span>' +
          '</button>' +
          '<div class="variation-panel" id="item-options-' + esc(item.position_id) + '"' + (expanded ? "" : " hidden") + ' aria-busy="' + String(Boolean(item._optionsLoading || changingThisItem)) + '">' +
          panelContent +
          '</div></div>'
        : "";
      return '<article class="product-row" data-product-row="' + esc(item.position_id) + '"><div class="product-row-main"><img src="' + esc(image) + '" alt="" width="58" height="58" loading="lazy" decoding="async">' +
        '<div><h3 class="product-name">' + esc(item.name || "Produto") + '</h3><p class="product-quantity">' + esc(item.quantity || item.base_quantity || 0) + " " + esc(item.packaging || "") + '</p></div></div>' +
        optionPicker + "</article>";
    }).join("");
    const note = data.orderable ? "" : '<p class="helper stock-note">Esta composição está sem estoque disponível no momento.</p>';
    $("detail-content").innerHTML = note + '<div class="product-list">' + rows + "</div>";
    $("order-button").disabled = !data.orderable || Boolean(data.changing);
    $("customize-button").disabled = !data.orderable || Boolean(data.changing);
    $("detail-content").querySelectorAll("[data-toggle-position]").forEach((button) => button.addEventListener("click", () => toggleItemOptions(button.dataset.togglePosition)));
    $("detail-content").querySelectorAll("[data-select-position]").forEach((button) => button.addEventListener("click", () => changeProduct(button.dataset.selectPosition, button.dataset.selectProduct)));
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

  async function changeProduct(positionId, productId) {
    const data = state.baskets.get(state.activeKey);
    if (!data || data.changing) return;

    const item = data.items.find((row) => String(row.position_id) === String(positionId));
    const choice = item && (item._alternatives || []).find((option) => String(option.product_id) === String(productId));
    if (!item || !choice || String(item.product_id) === String(productId)) return;

    const previousItems = data.items.map((row) => Object.assign({}, row));
    data.changing = true;
    data.changingPosition = String(positionId);
    Object.assign(item, {
      product_id: choice.product_id,
      name: choice.name || item.name,
      image_url: choice.image_url || item.image_url,
      packaging: choice.packaging || item.packaging,
      stock_quantity: choice.stock_quantity,
      price_cents: choice.price_cents
    });
    const selections = data.items.map((row) => ({
      position_id: row.position_id,
      product_id: row.product_id,
      quantity: Number(row.quantity || row.base_quantity || 0)
    }));
    const content = $("detail-content");
    content.setAttribute("aria-busy", "true");
    renderDetailPreservingScroll(positionId);

    try {
      const quote = await quoteBasket(data.basket, selections, data.items);
      Object.assign(data, quote, { orderable: true, detailLoaded: true });
      renderCards();
    } catch (_) {
      data.items = previousItems;
      toast("Essa troca não está disponível agora. A escolha anterior foi mantida.");
    } finally {
      data.changing = false;
      data.changingPosition = "";
      content.removeAttribute("aria-busy");
      renderDetailPreservingScroll(positionId);
      const selectedButton = Array.from(content.querySelectorAll("[data-select-position]")).find((button) =>
        button.dataset.selectPosition === String(positionId) && button.dataset.selectProduct === String(
          data.items.find((row) => String(row.position_id) === String(positionId))?.product_id || ""
        )
      );
      if (selectedButton) selectedButton.focus({ preventScroll: true });
    }
  }

  function openDetail(sizeKey) {
    const data = state.baskets.get(sizeKey);
    if (!data) return;
    state.activeKey = sizeKey;
    state.customizing = false;
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

  function toggleCustomization() {
    const data = state.baskets.get(state.activeKey);
    if (!data || !data.detailLoaded || !data.orderable || data.changing) return;
    state.customizing = !state.customizing;
    if (!state.customizing) data.items.forEach((item) => { item._expanded = false; });
    renderDetailPreservingScroll();
  }

  function addressLines(address) {
    if (!address) return [];
    const first = [address.street, address.number, address.complement].filter(Boolean).join(", ");
    const second = [address.neighborhood, address.city, address.state].filter(Boolean).join(" · ");
    const third = address.postal_code ? "CEP " + address.postal_code : "";
    const fourth = address.reference ? "Referência: " + address.reference : "";
    return [first, second, third, fourth].filter(Boolean);
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
      $("lookup-message").textContent = "Cadastro encontrado. Escolha a forma de pagamento.";
      $("confirm-order").disabled = !document.querySelector('input[name="payment"]:checked');
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
    const customer = state.customer || {};
    const payment = document.querySelector('input[name="payment"]:checked');
    if (!data || !customer || !payment) return;
    const recipient = whatsappNumber(customer.phone || $("customer-phone").value);
    if (!recipient) {
      toast("O telefone cadastrado não está em um formato válido.");
      return;
    }
    const button = $("confirm-order");
    button.disabled = true;
    button.textContent = "Registrando…";
    try {
      const result = await request("submit_order", {
        method: "POST",
        body: {
          whatsapp_phone: customer.phone || $("customer-phone").value,
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
              quantity: Number(item.quantity || item.base_quantity || 0)
            })).filter((item) => item.quantity > 0)
          }]
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
        customer_name_required: "O cadastro precisa ter o nome do cliente.",
        all_items_unavailable: "Os produtos ficaram sem estoque. Atualize a cesta e tente novamente.",
        invalid_whatsapp_phone: "O telefone do cadastro não está em um formato válido.",
        invalid_payment: "A forma de pagamento não foi reconhecida. Selecione novamente e tente outra vez."
      };
      toast(messages[reason] || "Não foi possível registrar o pedido. Confira os dados e tente novamente.");
    } finally {
      button.textContent = "Confirmar pedido";
      button.disabled = !state.customer || !document.querySelector('input[name="payment"]:checked');
    }
  }

  $("retry-catalog").addEventListener("click", loadCatalog);
  $("order-button").addEventListener("click", () => {
    const basket = state.baskets.get(state.activeKey);
    if (!basket || !basket.orderable) return;
    closeSheet("detail-sheet");
    showSheet("order-sheet");
    $("customer-phone").focus({ preventScroll: true });
  });
  $("customize-button").addEventListener("click", toggleCustomization);
  $("lookup-button").addEventListener("click", lookupCustomer);
  $("customer-phone").addEventListener("keydown", (event) => { if (event.key === "Enter") lookupCustomer(); });
  $("payment-options").addEventListener("change", () => {
    $("confirm-order").disabled = !state.customer || !document.querySelector('input[name="payment"]:checked');
  });
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
