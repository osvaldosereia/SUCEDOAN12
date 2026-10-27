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
    const original = new Map((alternativesByPosition || []).map((item) => [String(item.position_id), item._alternatives || []]));
    const items = (quoted.items || []).map((item) => Object.assign({}, item, {
      _alternatives: original.get(String(item.position_id)) || []
    }));
    return { basket: quoted.basket, items, totalCents: Number(quoted.total_cents || quoted.basket && quoted.basket.display_price_cents || 0) };
  }

  async function basketForSize(sizeKey) {
    const initial = await request("basket_by_size", { params: { size_key: sizeKey, lightweight: "1" } });
    const basket = initial.basket;
    const rawItems = Array.isArray(initial.items) ? initial.items : [];
    return {
      basket,
      items: rawItems,
      totalCents: Number(basket.display_price_cents || 0),
      orderable: Number(basket.stock_quantity || 0) > 0,
      detailLoaded: true,
      detailPromise: null,
      optionsLoaded: false,
      optionsPromise: null
    };
  }

  async function mapLimit(items, limit, task) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index], index);
      }
    });
    await Promise.all(workers);
    return results;
  }

  function sortAlternatives(options) {
    return (Array.isArray(options) ? options : []).slice().sort((a, b) =>
      Number(a.price_cents || 0) - Number(b.price_cents || 0) ||
      String(a.name || "").localeCompare(String(b.name || ""), "pt-BR")
    );
  }

  async function loadBasketOptions(sizeKey) {
    const data = state.baskets.get(sizeKey);
    if (!data || data.error || data.optionsLoaded) return data;
    if (data.optionsPromise) return data.optionsPromise;
    data.optionsPromise = (async () => {
      const basket = data.basket;
      let optionRows = new Map();
      if (Number(basket.stock_quantity || 0) > 0) {
        try {
          const batch = await request("basket_mold_options_batch", {
            method: "POST",
            body: {
              basket_id: basket.id,
              composition_number: basket.composition_number || 1,
              positions: data.items.map((item) => ({
                position_id: item.position_id,
                selected_product_id: item.product_id || "",
                quantity: Number(item.quantity || item.base_quantity || 0)
              }))
            }
          });
          (batch.positions || []).forEach((row) => optionRows.set(String(row.position_id), row));
        } catch (_) {
          // If the batch route cannot serve this basket, fall back to its read-only per-position route.
        }
      }

      const items = await mapLimit(data.items, 6, async (item) => {
        const batchRow = optionRows.get(String(item.position_id));
        const batchOptions = sortAlternatives(batchRow && batchRow.alternatives);
        const availableCount = Number(batchRow && batchRow.alternative_count || 0);
        let alternatives = batchOptions;
        if (!alternatives.length || availableCount > alternatives.length) {
          try { alternatives = await optionsForItem(basket, item); } catch (_) { alternatives = batchOptions; }
        }
        alternatives = sortAlternatives(alternatives);
        const configuredDefault = alternatives.find((option) => String(option.product_id) === String(item.product_id));
        const defaultOption = configuredDefault || alternatives[0];
        return Object.assign({}, item, defaultOption ? {
          product_id: defaultOption.product_id,
          name: defaultOption.name || item.name,
          image_url: defaultOption.image_url || item.image_url,
          packaging: defaultOption.packaging || item.packaging,
          stock_quantity: defaultOption.stock_quantity,
          _alternatives: alternatives
        } : { _alternatives: [] });
      });

      const hasStock = Number(basket.stock_quantity || 0) > 0;
      if (hasStock && items.every((item) => item._alternatives.length > 0)) {
        const selections = items.map((item) => ({
          position_id: item.position_id,
          product_id: item.product_id,
          quantity: Number(item.quantity || item.base_quantity || 0)
        }));
        try {
          const quote = await quoteBasket(basket, selections, items);
          Object.assign(data, quote, { orderable: true });
        } catch (_) {
          Object.assign(data, { items, orderable: false, totalCents: Number(basket.display_price_cents || 0) });
        }
      } else {
        Object.assign(data, { items, orderable: false, totalCents: Number(basket.display_price_cents || 0) });
      }
      data.optionsLoaded = true;
      return data;
    })().finally(() => { data.optionsPromise = null; });
    return data.optionsPromise;
  }

  function renderCards() {
    const host = $("basket-grid");
    host.innerHTML = state.cards.map((card, index) => {
      const sizeKey = card.size_key || keyOf(card.name);
      const title = plain(card.name || card.model_name || "Cesta básica");
      const data = state.baskets.get(sizeKey);
      const ready = data && data.summary.display_price_cents != null && Number.isFinite(Number(data.summary.display_price_cents));
      const price = ready ? money(data.summary.display_price_cents) : "Preço indisponível";
      const loading = index < 2 ? "eager" : "lazy";
      const priority = index === 0 ? "high" : "low";
      return '<article class="basket-card">' +
        '<img class="basket-photo" src="' + esc(imageForBasket(card, sizeKey)) + '" alt="Cesta ' + esc(title) + '" width="420" height="420" loading="' + loading + '" fetchpriority="' + priority + '" decoding="async">' +
        '<div class="basket-body"><h3 class="basket-title">' + esc(title) + '</h3>' +
        '<p class="basket-price"><small>A partir de</small>' + esc(price) + '</p>' +
        '<button class="button button-primary card-button" type="button" data-open-basket="' + esc(sizeKey) + '">Ver Produtos</button></div></article>';
    }).join("");
    host.querySelectorAll("[data-open-basket]").forEach((button) => button.addEventListener("click", () => openDetail(button.dataset.openBasket)));
  }

  function showEmpty(message, canRetry) {
    $("basket-grid").innerHTML = '<div class="empty-state">' + esc(message) + "</div>";
    $("catalog-status").textContent = canRetry ? "Não carregou" : "";
    $("retry-catalog").hidden = !canRetry;
  }

  async function loadCatalog() {
    $("retry-catalog").hidden = true;
    $("catalog-status").textContent = "Carregando cestas…";
    state.baskets.clear();
    try {
      const result = await request("home_catalog_cards");
      state.cards = Array.isArray(result.baskets) ? result.baskets : [];
      if (!state.cards.length) throw new Error("Nenhuma cesta disponível no momento.");
      state.cards.forEach((card) => {
        const sizeKey = card.size_key || keyOf(card.name);
        state.baskets.set(sizeKey, {
          summary: card,
          basket: null,
          items: [],
          totalCents: Number(card.display_price_cents || 0),
          orderable: Number(card.stock_quantity || 0) > 0,
          detailLoaded: false,
          detailPromise: null,
          optionsLoaded: false,
          optionsPromise: null,
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
      $("detail-total").textContent = money(data.totalCents);
      $("detail-content").innerHTML = '<div class="empty-state" aria-live="polite">Carregando produtos da cesta…</div>';
      $("order-button").disabled = true;
      $("customize-button").disabled = true;
      return;
    }
    $("detail-title").textContent = data.basket.name || "Produtos da cesta";
    $("detail-total").textContent = money(data.totalCents ?? data.basket.display_price_cents);
    $("customize-button").textContent = data.optionsLoading ? "Buscando opções…" : state.customizing ? "Concluir personalização" : "Personalizar";
    const rows = data.items.map((item) => {
      const alternatives = item._alternatives || [];
      const selected = alternatives.find((alt) => String(alt.product_id) === String(item.product_id));
      const image = selected && selected.image_url || item.image_url || "../img/cestas/cesta-mini.jpg";
      const optionPicker = state.customizing && alternatives.length > 1
        ? '<div class="product-option-picker" role="group" aria-label="Opções para ' + esc(item.label || item.name) + '">' +
          alternatives.map((alt) => {
            const selectedOption = String(alt.product_id) === String(item.product_id);
            const optionPrice = alt.price_cents == null ? "Preço indisponível" : money(alt.price_cents);
            return '<button class="product-choice' + (selectedOption ? ' is-selected' : '') + '" type="button" data-select-position="' + esc(item.position_id) + '" data-select-product="' + esc(alt.product_id) + '" aria-pressed="' + String(selectedOption) + '"' + (data.changing ? ' disabled' : '') + '>' +
              '<img src="' + esc(alt.image_url || "../img/logoantonia5.png") + '" alt="" width="44" height="44" loading="lazy" decoding="async">' +
              '<span class="product-choice-copy"><strong>' + esc(alt.name || "Produto") + '</strong><small>' + esc(optionPrice) + '</small></span>' +
              (selectedOption ? '<span class="product-choice-check" aria-hidden="true">✓</span>' : '') +
              '</button>';
          }).join("") +
          "</div>" : "";
      return '<article class="product-row"><img src="' + esc(image) + '" alt="" width="58" height="58" loading="lazy" decoding="async">' +
        '<div><h3 class="product-name">' + esc(item.name || "Produto") + '</h3><p class="product-quantity">' + esc(item.quantity || item.base_quantity || 0) + " " + esc(item.packaging || "") + '</p></div>' +
        optionPicker + "</article>";
    }).join("");
    const note = data.orderable ? data.optionsLoading
      ? '<p class="helper stock-note">Buscando as marcas disponíveis…</p>'
      : "" : '<p class="helper stock-note">Esta composição está sem estoque disponível no momento.</p>';
    $("detail-content").innerHTML = note + '<div class="product-list">' + rows + "</div>";
    $("order-button").disabled = !data.orderable;
    $("customize-button").disabled = !data.orderable || Boolean(data.optionsLoading) || Boolean(data.changing);
    $("detail-content").querySelectorAll("[data-select-position]").forEach((button) => button.addEventListener("click", () => changeProduct(button.dataset.selectPosition, button.dataset.selectProduct)));
    $("detail-content").querySelectorAll("img").forEach((image) => image.addEventListener("error", () => { image.src = "../img/logoantonia5.png"; }, { once: true }));
  }

  async function changeProduct(positionId, productId) {
    const data = state.baskets.get(state.activeKey);
    if (!data || data.changing) return;
    data.changing = true;
    const selections = data.items.map((item) => ({
      position_id: item.position_id,
      product_id: String(item.position_id) === String(positionId) ? productId : item.product_id,
      quantity: Number(item.quantity || item.base_quantity || 0)
    }));
    $("detail-content").setAttribute("aria-busy", "true");
    try {
      const quote = await quoteBasket(data.basket, selections, data.items);
      state.baskets.set(state.activeKey, Object.assign(data, quote, { orderable: true, optionsLoaded: true, detailLoaded: true }));
      renderDetail();
      renderCards();
    } catch (error) {
      toast("Essa troca não está disponível agora.");
    } finally {
      data.changing = false;
      $("detail-content").removeAttribute("aria-busy");
      renderDetail();
    }
  }

  function openDetail(sizeKey) {
    const data = state.baskets.get(sizeKey);
    if (!data) return;
    state.activeKey = sizeKey;
    state.customizing = false;
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

  async function toggleCustomization() {
    const sizeKey = state.activeKey;
    const data = state.baskets.get(sizeKey);
    if (!data || !data.detailLoaded || !data.orderable) return;
    if (state.customizing) {
      state.customizing = false;
      renderDetail();
      return;
    }
    if (!data.optionsLoaded) {
      data.optionsLoading = true;
      renderDetail();
      try {
        await loadBasketOptions(sizeKey);
      } catch (_) {
        toast("Não foi possível carregar as marcas agora.");
      } finally {
        data.optionsLoading = false;
      }
    }
    state.customizing = data.optionsLoaded && data.orderable;
    if (!state.customizing && data.orderable) toast("As opções não estão disponíveis agora.");
    renderDetail();
    renderCards();
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
    if (!state.customer || !document.querySelector('input[name="payment"]:checked')) return;
    const recipient = whatsappNumber(state.customer.phone || $("customer-phone").value);
    if (!recipient) {
      toast("O telefone cadastrado não está em um formato válido para WhatsApp.");
      return;
    }
    const message = buildOrderMessage();
    const link = document.createElement("a");
    link.href = "https://wa.me/" + recipient + "?text=" + encodeURIComponent(message);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast("WhatsApp aberto com o pedido preenchido. Confira e toque em Enviar.");
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
