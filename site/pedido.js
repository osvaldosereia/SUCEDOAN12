(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const key = config.publishableKey || "";
  const storefrontFunction = String(config.storefrontFunction || "storefront-v2");
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
  const money = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount)
      ? amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "—";
  };
  const statusText = (value) => ({
    new: "Pedido recebido",
    received: "Pedido recebido",
    storefront_received: "Pedido recebido",
    confirmed: "Pedido confirmado · aguardando separação",
    processing: "Pedido em separação",
    separating: "Pedido em separação",
    ready: "Pedido em expedição",
    ready_for_delivery: "Pedido em expedição",
    out_for_delivery: "Pedido em expedição",
    delivered: "Pedido entregue",
    cancelled: "Pedido cancelado",
    returned: "Pedido devolvido"
  })[String(value || "").toLowerCase()] || "Status em atualização";

  let capability = "";
  let activeSession = null;
  let activeOrderView = null;
  let editCart = [];
  let basketOptionData = new Map();
  let searchSequence = 0;
  let searchTimer = null;

  function makeUrl(functionName, params) {
    const url = new URL(supabase + "/functions/v1/" + functionName);
    Object.entries(params || {}).forEach(([name, value]) => {
      if (value != null && String(value) !== "") url.searchParams.set(name, String(value));
    });
    return url;
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(String(data.error || "order_unavailable"));
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function actionHeaders() {
    return {
      apikey: key,
      "x-customer-action-token": capability
    };
  }

  async function customerAction(action, params) {
    return fetchJson(makeUrl("order-customer-actions-v1", { action, ...(params || {}) }), {
      method: "GET",
      headers: actionHeaders()
    });
  }

  async function publicOrder(publicToken) {
    if (!/^[a-f0-9]{16}$/i.test(String(publicToken || ""))) throw new Error("order_unavailable");
    return fetchJson(makeUrl("order-public-view-v1", { k: publicToken }), {
      method: "GET",
      headers: { apikey: key }
    });
  }

  async function storefrontGet(action, params) {
    return fetchJson(makeUrl(storefrontFunction, { action, ...(params || {}) }), {
      method: "GET",
      headers: { apikey: key }
    });
  }

  async function storefrontPost(action, body) {
    return fetchJson(makeUrl(storefrontFunction, { action }), {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
        "x-customer-action-token": capability
      },
      body: JSON.stringify(body || {})
    });
  }

  function phoneDigits(value) {
    return String(value == null ? "" : value).replace(/\D/g, "");
  }

  function formatPhone(value) {
    const digits = phoneDigits(value);
    const local = digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;
    if (local.length === 11) return "(" + local.slice(0, 2) + ") " + local.slice(2, 7) + "-" + local.slice(7);
    if (local.length === 10) return "(" + local.slice(0, 2) + ") " + local.slice(2, 6) + "-" + local.slice(6);
    return "";
  }

  function whatsappNumber(value) {
    const digits = phoneDigits(value);
    if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
    if (digits.length === 10 || digits.length === 11) return "55" + digits;
    return "";
  }

  function renderCustomer(snapshot, delivery) {
    const name = String(snapshot.customer_name || (snapshot.customer && snapshot.customer.name) || "Cliente").trim() || "Cliente";
    const nameTarget = $("order-customer-name");
    if (nameTarget) nameTarget.textContent = name;

    const phone = String(snapshot.customer_phone || snapshot.phone || "").trim();
    const phoneLink = $("order-customer-phone");
    const phoneEmpty = $("order-customer-phone-empty");
    const number = whatsappNumber(phone);
    if (phoneLink) {
      if (number) {
        phoneLink.href = "https://wa.me/" + number;
        phoneLink.textContent = formatPhone(phone) || phoneDigits(phone);
        phoneLink.setAttribute("aria-label", "Conversar pelo WhatsApp com " + name);
        phoneLink.hidden = false;
        if (phoneEmpty) phoneEmpty.hidden = true;
      } else {
        phoneLink.removeAttribute("href");
        phoneLink.hidden = true;
        if (phoneEmpty) phoneEmpty.hidden = false;
      }
    }

    const address = delivery && typeof delivery === "object" ? delivery : {};
    const firstLine = [address.street, address.number].filter(Boolean).join(", ");
    const secondLine = [address.complement, address.district || address.neighborhood].filter(Boolean).join(" · ");
    const cityLine = [address.city, address.state].filter(Boolean).join(" - ");
    const postal = address.postal_code ? "CEP " + address.postal_code : "";
    const reference = address.reference ? "Referência: " + address.reference : "";
    const addressTarget = $("order-customer-address");
    if (addressTarget) {
      addressTarget.textContent =
        [firstLine, secondLine, cityLine, postal, reference].filter(Boolean).join(" · ") || "Endereço não informado";
    }
  }

  function renderOrder(data, session) {
    const snapshot = data.snapshot || {};
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const delivery = snapshot.delivery && typeof snapshot.delivery === "object" ? snapshot.delivery : {};
    const dateLabel = delivery.delivery_label || delivery.label || delivery.date_label || delivery.delivery_date || delivery.date ||
      snapshot.delivery_date_label || snapshot.delivery_date || "";
    renderCustomer(snapshot, delivery);
    $("order-code").textContent = data.public_code
      ? "Pedido " + data.public_code
      : session && session.public_code ? "Pedido " + session.public_code : "Seu pedido";
    $("order-status").textContent = statusText(data.current_status || (session && session.status));
    $("order-delivery").textContent = dateLabel ? "Entrega: " + dateLabel : "Data de entrega conforme combinado com a loja";
    $("order-items").innerHTML = items.map((item) => {
      const quantity = Math.max(0, Number(item.quantity || 0));
      return '<article class="public-order-item">' +
        '<img src="' + esc(item.image_url || "/img/logoantonia5.png") + '" alt="" width="58" height="58" loading="lazy" decoding="async">' +
        '<div><strong>' + esc(item.name || "Produto") + '</strong><span>Quantidade: ' + quantity + '</span></div>' +
        '</article>';
    }).join("");
    const total = snapshot.final_total ?? snapshot.total ?? snapshot.total_amount ?? snapshot.original_total ??
      (session && session.total);
    $("order-total").textContent = money(total);
    const payment = snapshot.payment_label || (session && session.payment_label) || "";
    $("order-payment").textContent = payment ? "Pagamento: " + payment : "";
    $("order-notice").textContent = "";
    $("order-notice").hidden = true;
    $("order-result").hidden = false;
    $("order-loading").hidden = true;
    $("order-error").hidden = true;
    $("order-result").querySelectorAll("img").forEach((image) => image.addEventListener("error", () => {
      image.src = "/img/logoantonia5.png";
    }, { once: true }));

    const canEdit = Boolean(capability && session && session.can_edit === true);
    $("order-edit-open").hidden = !canEdit;
    $("order-edit-locked").hidden = !capability || canEdit;
    if (capability && session && !canEdit) {
      const reason = String(session.edit_reason || "");
      $("order-edit-locked").textContent = reason === "separation_started"
        ? "A separação já começou. Este pedido fica disponível somente para consulta."
        : reason === "order_cancelled"
          ? "Este pedido foi cancelado e está disponível somente para consulta."
          : "Este pedido não pode mais ser alterado e está disponível somente para consulta.";
    }
    if (!canEdit) $("order-edit-panel").hidden = true;
    $("order-history").hidden = !capability;
  }

  function paymentValue(value) {
    const normalized = String(value || "").trim().toLocaleLowerCase("pt-BR");
    const map = {
      "dinheiro": "Dinheiro",
      "pix": "PIX",
      "cartão de crédito": "Cartão de crédito",
      "cartao de credito": "Cartão de crédito",
      "cartão alimentação/refeição": "Cartão alimentação/refeição",
      "cartao alimentacao/refeicao": "Cartão alimentação/refeição",
      "cash": "Dinheiro",
      "credit_card": "Cartão de crédito",
      "food_card": "Cartão alimentação/refeição"
    };
    return map[normalized] || "Dinheiro";
  }

  function productInfo(productId, session) {
    const raw = Array.isArray(session && session.items) ? session.items : [];
    return raw.find((item) => item && item.kind === "product" && String(item.product_id) === String(productId)) ||
      raw.find((item) => item && String(item.product_id) === String(productId)) || {};
  }

  function basketName(line, session) {
    const baskets = activeOrderView && activeOrderView.snapshot && Array.isArray(activeOrderView.snapshot.baskets)
      ? activeOrderView.snapshot.baskets
      : [];
    const found = baskets.find((basket) => String(basket.id || "") === String(line.id || ""));
    if (found && found.name) return found.name;
    const component = (Array.isArray(session && session.items) ? session.items : [])
      .find((item) => item && item.kind === "basket_mold" && String(item.basket_id || "") === String(line.id || ""));
    return component && component.name || "Cesta";
  }

  function basketSummary(line) {
    const items = activeOrderView && activeOrderView.snapshot && Array.isArray(activeOrderView.snapshot.items)
      ? activeOrderView.snapshot.items
      : [];
    const components = items.filter((item) => String(item.basket_id || "") === String(line.id || ""));
    if (!components.length) return "A composição atual da cesta será mantida.";
    const names = [...new Set(components.map((item) => String(item.name || "").trim()).filter(Boolean))];
    return "Composição mantida: " + names.slice(0, 5).join(", ") + (names.length > 5 ? " e outros itens" : "");
  }

  function basketData(line) {
    const baskets = activeOrderView && activeOrderView.snapshot && Array.isArray(activeOrderView.snapshot.baskets)
      ? activeOrderView.snapshot.baskets
      : [];
    return baskets.find((basket) => String(basket.id || "") === String(line.id || "")) || {};
  }

  function basketPositionHtml(line, cartIndex, component, session) {
    const positionId = String(component.position_id || "");
    const key = String(line.id || "") + ":" + String(line.composition_number || 1) + ":" + positionId;
    const position = basketOptionData.get(key) || {};
    const currentOptions = Array.isArray(component.options) && component.options.length
      ? component.options
      : component.product_id
        ? [{ product_id: component.product_id, quantity: component.quantity || 0 }]
        : [];
    const selectedId = String(currentOptions[0] && currentOptions[0].product_id || component.product_id || "");
    const quantity = currentOptions.reduce((sum, option) => sum + Math.max(0, Number(option.quantity || 0)), 0);
    const existing = (Array.isArray(session && session.items) ? session.items : [])
      .find((item) => item && String(item.position_id || "") === positionId &&
        (String(item.product_id || "") === selectedId || String(item.selected_product_id || "") === selectedId));
    const alternatives = Array.isArray(position.alternatives) ? [...position.alternatives] : [];
    if (selectedId && !alternatives.some((item) => String(item.product_id) === selectedId)) {
      alternatives.unshift({
        product_id: selectedId,
        name: existing && existing.name || "Produto atual",
        price_cents: 0,
        stock_quantity: 0,
        current: true
      });
    }
    const label = existing && existing.position_label || "Produto da cesta";
    const optionsHtml = alternatives.map((option) => {
      const productId = String(option.product_id || "");
      const suffix = option.current && Number(option.stock_quantity || 0) <= 0 ? " · atual" : "";
      return '<option value="' + esc(productId) + '"' + (productId === selectedId ? " selected" : "") + '>' +
        esc(option.name || "Produto") +
        (Number(option.price_cents || 0) > 0 ? " · " + esc(money(Number(option.price_cents) / 100)) : "") +
        suffix + '</option>';
    }).join("");
    return '<div class="order-basket-position">' +
      '<label class="order-edit-field"><span>' + esc(label) + '</span>' +
      '<select data-basket-product data-cart-index="' + cartIndex + '" data-position-id="' + esc(positionId) + '">' +
      optionsHtml + '</select></label>' +
      '<label class="order-edit-quantity">Qtd. por cesta' +
      '<input type="number" min="0" max="1000" step="1" inputmode="numeric" value="' + quantity +
      '" data-basket-quantity data-cart-index="' + cartIndex + '" data-position-id="' + esc(positionId) +
      '" aria-label="Quantidade de ' + esc(label) + '"></label></div>';
  }

  function cartLineHtml(line, index, session) {
    const isBasket = String(line.type || "product") === "basket_mold";
    const product = isBasket ? {} : productInfo(line.id, session);
    const basket = isBasket ? basketData(line) : {};
    const name = isBasket ? basket.name || basketName(line, session) : String(product.name || "Produto");
    const image = isBasket
      ? String(basket.image_url || "/img/logoantonia5.png")
      : String(product.image_url || "/img/logoantonia5.png");
    const quantity = Math.max(1, Math.min(30, Math.trunc(Number(line.qty || 1))));
    const details = isBasket
      ? "Ajuste a quantidade e os produtos que compõem cada cesta."
      : money(Number(product.unit_price || 0)) + " por unidade";
    const components = isBasket && Array.isArray(line.components)
      ? '<div class="order-basket-components">' +
        line.components.map((component) => basketPositionHtml(line, index, component, session)).join("") +
        '</div>'
      : "";
    return '<article class="order-edit-item">' +
      '<img src="' + esc(image) + '" alt="" width="54" height="54" loading="lazy" decoding="async">' +
      '<div class="order-edit-item-copy"><strong>' + esc(name) + '</strong><span>' + esc(details) + '</span>' +
      '</div>' +
      '<label class="order-edit-quantity">Qtd.' +
      '<input type="number" min="0" max="30" step="1" inputmode="numeric" value="' + quantity + '" data-cart-quantity="' + index + '" aria-label="Quantidade de ' + esc(name) + '">' +
      '</label>' +
      (components ? '<div class="order-basket-editor">' + components + '</div>' : '') +
      '</article>';
  }

  function renderEditItems() {
    const container = $("order-edit-items");
    if (!container || !activeSession) return;
    container.innerHTML = editCart.map((line, index) => cartLineHtml(line, index, activeSession)).join("") ||
      '<p class="order-edit-empty">Seu pedido está sem produtos. Adicione pelo menos um item para salvar.</p>';

    container.querySelectorAll("[data-cart-quantity]").forEach((input) => {
      input.addEventListener("change", () => {
        const index = Number(input.dataset.cartQuantity);
        if (!Number.isInteger(index) || !editCart[index]) return;
        const quantity = Math.max(0, Math.min(30, Math.trunc(Number(input.value || 0))));
        if (quantity <= 0) editCart.splice(index, 1);
        else editCart[index].qty = quantity;
        renderEditItems();
      });
    });

    container.querySelectorAll("[data-basket-product]").forEach((select) => {
      select.addEventListener("change", () => {
        const index = Number(select.dataset.cartIndex);
        const line = editCart[index];
        const positionId = String(select.dataset.positionId || "");
        const component = line && Array.isArray(line.components)
          ? line.components.find((item) => String(item.position_id || "") === positionId)
          : null;
        if (!component) return;
        const quantity = Array.isArray(component.options)
          ? component.options.reduce((sum, option) => sum + Math.max(0, Number(option.quantity || 0)), 0)
          : Math.max(0, Number(component.quantity || 0));
        component.product_id = select.value;
        component.quantity = quantity;
        component.options = [{ product_id: select.value, quantity }];
        renderEditItems();
      });
    });

    container.querySelectorAll("[data-basket-quantity]").forEach((input) => {
      input.addEventListener("change", () => {
        const index = Number(input.dataset.cartIndex);
        const line = editCart[index];
        const positionId = String(input.dataset.positionId || "");
        const component = line && Array.isArray(line.components)
          ? line.components.find((item) => String(item.position_id || "") === positionId)
          : null;
        if (!component) return;
        const selectedId = String(
          Array.isArray(component.options) && component.options[0] && component.options[0].product_id ||
          component.product_id || ""
        );
        const quantity = Math.max(0, Math.min(1000, Math.trunc(Number(input.value || 0))));
        component.product_id = selectedId;
        component.quantity = quantity;
        component.options = selectedId ? [{ product_id: selectedId, quantity }] : [];
        renderEditItems();
      });
    });

    container.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => {
      image.src = "/img/logoantonia5.png";
    }, { once: true }));
  }

  function showEditMessage(message, tone) {
    const element = $("order-edit-message");
    element.textContent = message || "";
    element.dataset.tone = tone || "neutral";
  }

  function fillDeliveryDates(session) {
    const select = $("order-edit-date");
    const delivery = session && session.delivery || {};
    const currentDate = String(delivery.delivery_date || "");
    return storefrontGet("delivery_options").then((result) => {
      const options = Array.isArray(result.options) ? result.options.slice(0, 10) : [];
      if (currentDate && !options.some((option) => String(option.date) === currentDate)) {
        options.unshift({
          date: currentDate,
          label: delivery.delivery_label || currentDate + " — data atual"
        });
      }
      select.innerHTML = options.map((option) =>
        '<option value="' + esc(option.date) + '">' + esc(option.label || option.date) + '</option>'
      ).join("");
      if (!options.length) {
        select.innerHTML = '<option value="">Nenhuma data disponível</option>';
        select.disabled = true;
      } else {
        select.disabled = false;
        select.value = currentDate && options.some((option) => String(option.date) === currentDate)
          ? currentDate
          : String(options[0].date || "");
      }
    });
  }

  async function loadBasketOptions() {
    basketOptionData = new Map();
    const baskets = editCart.map((line, index) => ({ line, index }))
      .filter((entry) => String(entry.line.type || "") === "basket_mold" && Array.isArray(entry.line.components));
    for (const entry of baskets) {
      const positions = entry.line.components.map((component) => {
        const options = Array.isArray(component.options) && component.options.length
          ? component.options
          : component.product_id
            ? [{ product_id: component.product_id, quantity: component.quantity || 0 }]
            : [];
        return {
          position_id: component.position_id,
          selected_product_ids: options.map((option) => option.product_id).filter(Boolean),
          quantity: options.reduce((sum, option) => sum + Math.max(0, Number(option.quantity || 0)), 0)
        };
      });
      if (!positions.length) continue;
      const response = await storefrontPost("basket_mold_options_batch", {
        basket_id: entry.line.id,
        composition_number: Number(entry.line.composition_number || 1),
        positions
      });
      for (const position of Array.isArray(response.positions) ? response.positions : []) {
        basketOptionData.set(String(entry.line.id || "") + ":" + String(entry.line.composition_number || 1) + ":" + String(position.position_id), position);
      }
    }
  }

  async function openEditor() {
    if (!activeSession || activeSession.can_edit !== true) return;
    if (!Array.isArray(activeSession.edit_cart)) {
      showEditMessage("Não foi possível carregar a composição atual do pedido. Reabra o link do pedido.", "error");
      return;
    }
    editCart = JSON.parse(JSON.stringify(activeSession.edit_cart));
    $("order-edit-street").value = activeSession.delivery && activeSession.delivery.street || "";
    $("order-edit-number").value = activeSession.delivery && activeSession.delivery.number || "";
    $("order-edit-district").value = activeSession.delivery && activeSession.delivery.district || "";
    $("order-edit-complement").value = activeSession.delivery && activeSession.delivery.complement || "";
    $("order-edit-postal-code").value = activeSession.delivery && activeSession.delivery.postal_code || "";
    $("order-edit-reference").value = activeSession.delivery && activeSession.delivery.reference || "";
    $("order-edit-city-state").value = [
      activeSession.delivery && activeSession.delivery.city,
      activeSession.delivery && activeSession.delivery.state
    ].filter(Boolean).join(" - ");
    $("order-edit-payment").value = paymentValue(activeSession.payment_label);
    $("order-product-query").value = "";
    $("order-product-results").innerHTML = "";
    showEditMessage("", "neutral");
    try {
      await loadBasketOptions();
    } catch {
      basketOptionData = new Map();
      showEditMessage("As opções de alguns produtos da cesta não carregaram. Você ainda pode editar os outros dados do pedido.", "warning");
    }
    renderEditItems();
    await fillDeliveryDates(activeSession);
    $("order-edit-panel").hidden = false;
    $("order-edit-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function editErrorText(error) {
    const code = String(error && error.message || "");
    const messages = {
      order_not_editable: "A separação já começou. O pedido agora está disponível somente para consulta.",
      order_changed: "O pedido mudou em outra tela. Atualizei os detalhes; revise as informações antes de tentar novamente.",
      delivery_details_required: "Preencha rua, número e bairro do endereço de entrega.",
      delivery_date_unavailable: "Essa data não está disponível. Escolha uma das datas apresentadas.",
      invalid_payment: "Selecione uma forma de pagamento válida.",
      cart_empty: "Mantenha ao menos um produto no pedido.",
      minimum_order: "O pedido personalizado precisa continuar com o mínimo de R$ 75,00.",
      product_unavailable: "Um produto ficou indisponível ou sem estoque suficiente. Revise os itens e tente novamente.",
      insufficient_stock: "O estoque de um produto mudou. Ajuste a quantidade e tente novamente.",
      customer_edit_stock_unavailable: "O estoque mudou enquanto você editava. Revise as quantidades e tente novamente.",
      basket_mold_unavailable: "A cesta não está mais disponível para alteração. Revise os produtos do pedido.",
      basket_mold_composition_invalid: "A composição desta cesta foi atualizada. Reabra o pedido para carregar os dados atuais.",
      basket_mold_component_invalid: "A composição desta cesta foi atualizada. Reabra o pedido para carregar os dados atuais.",
      basket_mold_components_required: "Não foi possível validar os produtos desta cesta. Reabra o pedido e tente novamente.",
      rate_limited: "Muitas tentativas em sequência. Aguarde um pouco e tente novamente.",
      edit_failed: "Não foi possível salvar as alterações. Confira os dados e tente novamente."
    };
    return messages[code] || "Não foi possível salvar as alterações. Confira os dados e tente novamente.";
  }

  async function saveOrderEdit(event) {
    event.preventDefault();
    if (!activeSession || activeSession.can_edit !== true) return;
    const items = editCart
      .map((line) => ({ ...line, qty: Math.max(0, Math.min(30, Math.trunc(Number(line.qty || 0)))) }))
      .filter((line) => line.qty > 0);
    if (!items.length) {
      showEditMessage("Mantenha ao menos um produto no pedido.", "error");
      return;
    }
    const save = $("order-edit-save");
    save.disabled = true;
    save.textContent = "Salvando…";
    showEditMessage("Validando estoque e recalculando o pedido…", "neutral");
    try {
      const orderId = activeSession.order_id;
      const result = await storefrontPost("edit_order", {
        order_id: orderId,
        expected_updated_at: activeSession.updated_at,
        items,
        payment_method: $("order-edit-payment").value,
        delivery_date: $("order-edit-date").value,
        address: {
          street: $("order-edit-street").value,
          number: $("order-edit-number").value,
          district: $("order-edit-district").value,
          complement: $("order-edit-complement").value,
          postal_code: $("order-edit-postal-code").value,
          reference: $("order-edit-reference").value
        }
      });
      $("order-edit-panel").hidden = true;
      await openOrder(orderId, false);
      $("order-notice").textContent = "Pedido atualizado. Novo total: " + money(result.total);
      $("order-notice").hidden = false;
      $("order-notice").dataset.tone = "success";
      await loadHistory();
    } catch (error) {
      const code = String(error && error.message || "");
      showEditMessage(editErrorText(error), "error");
      if (code === "order_changed" || code === "order_not_editable") {
        const currentId = activeSession.order_id;
        await openOrder(currentId, false).catch(() => {});
        $("order-notice").textContent = code === "order_not_editable"
          ? "A separação começou antes de salvar. O pedido agora está somente para consulta."
          : "O pedido foi atualizado em outra tela. Confira os dados atuais antes de editar novamente.";
        $("order-notice").hidden = false;
        $("order-notice").dataset.tone = "warning";
      }
    } finally {
      save.disabled = false;
      save.textContent = "Salvar alterações";
    }
  }

  async function searchProducts() {
    const query = String($("order-product-query").value || "").trim();
    const results = $("order-product-results");
    if (query.length < 2) {
      results.innerHTML = '<p class="order-edit-hint">Digite pelo menos duas letras para buscar.</p>';
      return;
    }
    const sequence = ++searchSequence;
    results.innerHTML = '<p class="order-edit-hint">Buscando produtos…</p>';
    try {
      const response = await storefrontGet("products", { q: query, limit: 8, offset: 0 });
      if (sequence !== searchSequence) return;
      const products = Array.isArray(response.products) ? response.products : [];
      if (!products.length) {
        results.innerHTML = '<p class="order-edit-hint">Nenhum produto disponível encontrado.</p>';
        return;
      }
      results.innerHTML = products.map((product) =>
        '<article class="order-product-result">' +
        '<div><strong>' + esc(product.name || "Produto") + '</strong><span>' + money(Number(product.price_cents || 0) / 100) +
        (Number(product.stock_quantity || 0) > 0 ? " · Disponível" : " · Sem estoque") + '</span></div>' +
        '<button class="order-action-button" type="button" data-add-product="' + esc(product.id) + '"' +
        (Number(product.stock_quantity || 0) <= 0 ? " disabled" : "") + '>Adicionar</button>' +
        '</article>'
      ).join("");
      results.querySelectorAll("[data-add-product]").forEach((button) => {
        button.addEventListener("click", () => {
          const product = products.find((item) => String(item.id) === String(button.dataset.addProduct));
          if (!product) return;
          const existing = editCart.find((line) => String(line.type || "product") === "product" && String(line.id) === String(product.id));
          if (existing) existing.qty = Math.min(30, Math.max(1, Math.trunc(Number(existing.qty || 1)) + 1));
          else editCart.push({ type: "product", id: product.id, qty: 1 });
          renderEditItems();
          button.textContent = "Adicionado";
          button.disabled = true;
        });
      });
    } catch {
      if (sequence === searchSequence) results.innerHTML = '<p class="order-edit-hint order-edit-error">Não foi possível buscar produtos agora. Tente novamente.</p>';
    }
  }

  function renderHistory(orders) {
    const container = $("order-history-list");
    const list = Array.isArray(orders) ? orders : [];
    if (!list.length) {
      container.innerHTML = '<p class="order-edit-hint">Não há outros pedidos vinculados a este acesso.</p>';
      return;
    }
    container.innerHTML = list.map((order) => {
      const date = order.created_at
        ? new Date(order.created_at).toLocaleDateString("pt-BR")
        : "Data não informada";
      const editButton = order.can_edit === true
        ? '<button class="order-action-button order-history-edit" type="button" data-history-order="' + esc(order.order_id) + '" data-open-edit="true">Editar</button>'
        : "";
      return '<article class="order-history-item">' +
        '<div class="order-history-copy"><strong>Pedido ' + esc(order.public_code || "") + '</strong>' +
        '<span>' + esc(date) + ' · ' + esc(statusText(order.status)) + '</span>' +
        '<b>' + esc(money(order.total)) + '</b></div>' +
        '<div class="order-history-actions">' +
        '<button class="order-action-button" type="button" data-history-order="' + esc(order.order_id) + '">Ver</button>' +
        editButton +
        '</div></article>';
    }).join("");
  }

  async function loadHistory() {
    if (!capability) return;
    $("order-history").hidden = false;
    $("order-history-list").innerHTML = '<p class="order-edit-hint">Carregando pedidos…</p>';
    try {
      const history = await customerAction("history");
      renderHistory(history.orders);
    } catch {
      $("order-history-list").innerHTML = '<p class="order-edit-hint order-edit-error">Não foi possível carregar o histórico agora.</p>';
    }
  }

  async function openOrder(orderId, shouldEdit) {
    const selected = await customerAction("order_session", { order_id: orderId });
    if (selected.ok !== true) throw new Error(selected.error || "order_unavailable");
    const view = await publicOrder(selected.public_token);
    activeSession = selected;
    activeOrderView = view;
    renderOrder(view, selected);
    if (shouldEdit && selected.can_edit === true) await openEditor();
    $("order-result").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function bindEvents() {
    $("order-edit-open").addEventListener("click", () => {
      openEditor().catch(() => showEditMessage("Não foi possível carregar as datas de entrega. Tente novamente.", "error"));
    });
    $("order-edit-cancel").addEventListener("click", () => {
      $("order-edit-panel").hidden = true;
      showEditMessage("", "neutral");
    });
    $("order-edit-form").addEventListener("submit", (event) => { void saveOrderEdit(event); });
    $("order-product-search-button").addEventListener("click", () => { void searchProducts(); });
    $("order-product-query").addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { void searchProducts(); }, 350);
    });
    $("order-history-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-history-order]");
      if (!button) return;
      const orderId = String(button.dataset.historyOrder || "");
      const shouldEdit = button.dataset.openEdit === "true";
      openOrder(orderId, shouldEdit).catch(() => {
        $("order-history-list").insertAdjacentHTML("afterbegin",
          '<p class="order-edit-hint order-edit-error">Não foi possível abrir esse pedido. Recarregue o link do cliente e tente novamente.</p>');
      });
    });
  }

  async function loadOrder() {
    const params = new URLSearchParams(window.location.search);
    capability = String(params.get("c") || "").trim();
    const publicToken = String(params.get("k") || "").trim();
    window.history.replaceState(null, "", window.location.pathname);
    if (!supabase || !key) throw new Error("invalid_link");

    if (/^[a-f0-9]{16}$/i.test(publicToken)) {
      const order = await publicOrder(publicToken);
      renderOrder(order, null);
      $("order-loading").hidden = true;
      return;
    }

    if (!/^[a-f0-9]{64}$/i.test(capability)) throw new Error("invalid_link");
    const session = await customerAction("session");
    if (session.ok !== true) throw new Error("order_unavailable");
    const view = await publicOrder(session.public_token);
    activeSession = session;
    activeOrderView = view;
    renderOrder(view, session);
    await loadHistory();
  }

  bindEvents();
  loadOrder().catch(() => {
    $("order-loading").hidden = true;
    $("order-error").hidden = false;
  });
})();
