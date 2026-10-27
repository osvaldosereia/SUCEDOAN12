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

  async function request(action, options) {
    const opts = options || {};
    const url = new URL(root);
    url.searchParams.set("action", action);
    Object.keys(opts.params || {}).forEach((name) => url.searchParams.set(name, String(opts.params[name] == null ? "" : opts.params[name])));
    const headers = { apikey: key, Authorization: "Bearer " + key };
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
    const fallback = "../img/cestas/cesta-" + keyName + ".jpg";
    const image = plain(card && card.image_url);
    return image || fallback;
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
    if (!alternatives.length && item.product_id) alternatives.push({
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
    const initial = await request("basket_by_size", { params: { size_key: sizeKey } });
    const basket = initial.basket;
    const rawItems = Array.isArray(initial.items) ? initial.items : [];
    const withOptions = await Promise.all(rawItems.map(async (item) => Object.assign({}, item, {
      _alternatives: await optionsForItem(basket, item)
    })));
    const cheapest = withOptions.map((item) => {
      const option = item._alternatives[0];
      return {
        position_id: item.position_id,
        product_id: option ? option.product_id : item.product_id,
        quantity: Number(item.quantity || item.base_quantity || 0)
      };
    });
    const quote = await quoteBasket(basket, cheapest, withOptions);
    return { basket: quote.basket, items: quote.items, totalCents: quote.totalCents };
  }

  function renderCards() {
    const host = $("basket-grid");
    host.innerHTML = state.cards.map((card) => {
      const sizeKey = card.size_key || keyOf(card.name);
      const title = plain(card.name || card.model_name || "Cesta básica");
      const data = state.baskets.get(sizeKey);
      const ready = Boolean(data && !data.error);
      const price = ready ? money(data.totalCents) : data && data.error ? "Indisponível" : "Carregando…";
      const disabled = ready ? "" : " disabled";
      return '<article class="basket-card">' +
        '<img class="basket-photo" src="' + esc(imageForBasket(card, sizeKey)) + '" alt="Cesta ' + esc(title) + '" width="420" height="420" loading="lazy" decoding="async">' +
        '<div class="basket-body"><h3 class="basket-title">' + esc(title) + '</h3>' +
        '<p class="basket-price"><small>A partir de</small>' + esc(price) + '</p>' +
        '<button class="button button-primary card-button" type="button" data-open-basket="' + esc(sizeKey) + '"' + disabled + '>Ver Produtos</button></div></article>';
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
    try {
      const result = await request("home_size_cards");
      state.cards = Array.isArray(result.baskets) ? result.baskets : [];
      if (!state.cards.length) throw new Error("Nenhuma cesta disponível no momento.");
      renderCards();
      $("catalog-status").textContent = "5 tamanhos";
      await Promise.all(state.cards.map(async (card) => {
        const sizeKey = card.size_key || keyOf(card.name);
        try {
          state.baskets.set(sizeKey, await basketForSize(sizeKey));
        } catch (error) {
          state.baskets.set(sizeKey, { error: true });
        }
        renderCards();
      }));
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
      $("detail-content").innerHTML = '<div class="empty-state">Não foi possível abrir esta cesta. Feche e tente novamente.</div>';
      $("detail-total").textContent = "—";
      return;
    }
    $("detail-title").textContent = data.basket.name || "Produtos da cesta";
    $("detail-total").textContent = money(data.totalCents);
    $("customize-button").textContent = state.customizing ? "Concluir personalização" : "Personalizar";
    const rows = data.items.map((item) => {
      const alternatives = item._alternatives || [];
      const selected = alternatives.find((alt) => String(alt.product_id) === String(item.product_id));
      const image = selected && selected.image_url || item.image_url || "../img/cestas/cesta-mini.jpg";
      const select = state.customizing && alternatives.length > 1
        ? '<select class="product-edit" data-position="' + esc(item.position_id) + '" aria-label="Trocar produto para ' + esc(item.label || item.name) + '">' +
          alternatives.map((alt) => '<option value="' + esc(alt.product_id) + '"' + (String(alt.product_id) === String(item.product_id) ? " selected" : "") + '>' + esc(alt.name) + (alt.packaging ? " · " + esc(alt.packaging) : "") + "</option>").join("") +
          "</select>" : "";
      return '<article class="product-row"><img src="' + esc(image) + '" alt="" width="58" height="58" loading="lazy" decoding="async">' +
        '<div><h3 class="product-name">' + esc(item.name || "Produto") + '</h3><p class="product-quantity">' + esc(item.quantity || item.base_quantity || 0) + " " + esc(item.packaging || "") + '</p></div>' +
        select + "</article>";
    }).join("");
    $("detail-content").innerHTML = '<div class="product-list">' + rows + "</div>";
    $("detail-content").querySelectorAll("[data-position]").forEach((select) => select.addEventListener("change", () => changeProduct(select.dataset.position, select.value)));
    $("detail-content").querySelectorAll("img").forEach((image) => image.addEventListener("error", () => { image.src = "../img/logoantonia5.png"; }, { once: true }));
  }

  async function changeProduct(positionId, productId) {
    const data = state.baskets.get(state.activeKey);
    if (!data) return;
    const selections = data.items.map((item) => ({
      position_id: item.position_id,
      product_id: String(item.position_id) === String(positionId) ? productId : item.product_id,
      quantity: Number(item.quantity || item.base_quantity || 0)
    }));
    $("detail-content").setAttribute("aria-busy", "true");
    try {
      const quote = await quoteBasket(data.basket, selections, data.items);
      state.baskets.set(state.activeKey, quote);
      renderDetail();
      renderCards();
    } catch (error) {
      toast("Essa troca não está disponível agora.");
    } finally {
      $("detail-content").removeAttribute("aria-busy");
    }
  }

  function openDetail(sizeKey) {
    if (!state.baskets.has(sizeKey) || state.baskets.get(sizeKey).error) return;
    state.activeKey = sizeKey;
    state.customizing = false;
    renderDetail();
    showSheet("detail-sheet");
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
    const lines = [
      "Pedido de cesta básica — Dona Antônia",
      "",
      "Cesta: " + (data.basket.name || "Cesta básica"),
      ...data.items.map((item) => "• " + (item.quantity || item.base_quantity || 0) + " " + (item.packaging || "") + " — " + item.name),
      "",
      "Total da cesta: " + money(data.totalCents),
      "Pagamento: " + (payment ? payment.value : ""),
      "Cliente: " + (customer.display_name || ""),
      "Telefone: " + (customer.phone || $("customer-phone").value),
      "Endereço: " + addressLines(customer.address).join(", ")
    ];
    return lines.join("\n");
  }

  async function confirmOrder() {
    if (!state.customer || !document.querySelector('input[name="payment"]:checked')) return;
    const message = buildOrderMessage();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Pedido Dona Antônia", text: message });
        toast("Compartilhamento aberto. Envie o pedido pelo app escolhido.");
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(message);
        toast("Resumo copiado. Cole no WhatsApp para enviar.");
      } else {
        window.prompt("Copie o resumo do pedido:", message);
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(message);
        toast("Resumo copiado. Cole no WhatsApp para enviar.");
      } catch (_) {
        window.prompt("Copie o resumo do pedido:", message);
      }
    }
  }

  $("retry-catalog").addEventListener("click", loadCatalog);
  $("order-button").addEventListener("click", () => {
    closeSheet("detail-sheet");
    showSheet("order-sheet");
    $("customer-phone").focus({ preventScroll: true });
  });
  $("customize-button").addEventListener("click", () => {
    state.customizing = !state.customizing;
    renderDetail();
  });
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

