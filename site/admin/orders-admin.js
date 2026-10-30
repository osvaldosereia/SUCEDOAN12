(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const adminFunction = String(config.adminFunction || "site-admin-v1");
  const publishableKey = config.publishableKey || "";
  const accessCode = () => window.DonaAdminAuth?.getCode?.() || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const state = { stage: "new", orders: [], currentOrder: null, separation: null, busy: false, refreshTimer: 0, separatorKey: "", replacementSearch: null, deletingOrderId: "" };
  const separatorNames = { jose: "José", claudio: "Cláudio", jovenil: "Jovenil", kelly: "Kelly" };

  async function api(method, action, payload) {
    const url = new URL(supabase + "/functions/v1/" + adminFunction);
    const headers = { apikey: publishableKey, "x-admin-code": accessCode() };
    const init = { method: method, headers: headers, cache: "no-store" };
    if (method === "GET") {
      url.searchParams.set("action", action);
      Object.entries(payload || {}).forEach(([key, value]) => url.searchParams.set(key, String(value == null ? "" : value)));
    } else {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(Object.assign({ action: action }, payload || {}));
    }
    const response = await fetch(url.toString(), init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Não foi possível concluir a operação.");
    return data;
  }

  function toast(message) {
    const node = $("admin-toast");
    node.textContent = message;
    node.classList.add("show");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => node.classList.remove("show"), 3800);
  }

  function date(value) {
    if (!value) return "Data não informada";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "Data não informada" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(parsed);
  }

  function customerName(order) {
    const customer = order.customer_snapshot || {};
    return customer.display_name || customer.name || customer.full_name || "Cliente";
  }

  function orderNumber(order) {
    return order.public_code || order.order_number || String(order.id || "").slice(0, 8).toUpperCase();
  }

  function renderList() {
    const list = $("orders-list");
    const status = $("orders-status");
    status.textContent = state.orders.length ? state.orders.length + (state.orders.length === 1 ? " pedido" : " pedidos") : "Nenhum pedido nesta etapa.";
    list.innerHTML = state.orders.map((order) => {
      const delivered = order.status === "delivered";
      const action = state.stage === "new"
        ? "<button class='button button-primary order-action' type='button' data-order-confirm='" + esc(order.id) + "'>Confirmar</button>"
        : state.stage === "separating"
          ? "<button class='button button-primary order-action' type='button' data-order-separate='" + esc(order.id) + "'>SEPARAR</button>"
          : delivered
            ? "<div class='delivered-stamp' aria-label='Pedido entregue'>ENTREGUE</div>"
            : "<button class='button button-primary order-action' type='button' data-order-deliver='" + esc(order.id) + "'>Entregue</button>";
      const cancelable = ["storefront_received", "received", "confirmed", "processing"].includes(String(order.status || ""))
        && !order.bling_order_id && order.sync_status === "local";
      const deleteAction = cancelable
        ? "<button class='button button-outline order-delete' type='button' data-order-delete='" + esc(order.id) + "'" + (state.deletingOrderId === order.id ? " disabled" : "") + ">Excluir</button>"
        : "";
      const phone = order.phone_e164 || order.phone || "Telefone não informado";
      return "<article class='order-card'>" +
        "<button class='order-card-open' type='button' data-order-open='" + esc(order.id) + "' aria-label='Ver produtos do pedido " + esc(orderNumber(order)) + "'>" +
          "<span class='order-card-top'><strong>" + esc(orderNumber(order)) + "</strong><time>" + esc(date(order.created_at)) + "</time></span>" +
          "<span class='order-card-name'>" + esc(customerName(order)) + "</span>" +
          "<span class='order-card-phone'>" + esc(phone) + "</span>" +
          "<span class='order-card-bottom'><span>Valor do pedido</span><strong>" + esc(money(order.total)) + "</strong></span>" +
        "</button>" +
        "<div class='order-card-action'>" + action + deleteAction + "</div>" +
      "</article>";
    }).join("");
    if (!state.orders.length) list.innerHTML = "<div class='orders-empty'>Os pedidos aparecerão aqui quando forem registrados.</div>";
  }

  async function loadOrders() {
    const status = $("orders-status");
    const list = $("orders-list");
    if (!list || $("admin-view").hidden) return;
    status.textContent = "Carregando pedidos…";
    try {
      const result = await api("GET", "orders_list", { stage: state.stage });
      state.orders = Array.isArray(result.orders) ? result.orders : [];
      renderList();
    } catch (error) {
      status.textContent = error.message || "Não foi possível carregar os pedidos.";
      list.innerHTML = "";
    }
  }

  function setStage(stage) {
    state.stage = stage;
    document.querySelectorAll("[data-order-stage]").forEach((button) => button.classList.toggle("active", button.dataset.orderStage === stage));
    loadOrders();
  }

  async function openOrder(id) {
    const dialog = $("order-detail-dialog");
    $("order-detail-title").textContent = "Carregando pedido…";
    $("order-detail-summary").innerHTML = "";
    $("order-detail-items").innerHTML = "<p class='admin-muted'>Carregando produtos…</p>";
    dialog.showModal();
    try {
      const result = await api("GET", "order_detail", { order_id: id });
      const order = result.order || {};
      state.currentOrder = order;
      $("order-detail-title").textContent = "Pedido " + orderNumber(order);
      $("order-detail-summary").innerHTML =
        "<div><span>Cliente</span><strong>" + esc(customerName(order)) + "</strong></div>" +
        "<div><span>Telefone</span><strong>" + esc(order.phone_e164 || order.phone || "—") + "</strong></div>" +
        "<div><span>Data</span><strong>" + esc(date(order.created_at)) + "</strong></div>" +
        "<div><span>Total</span><strong>" + esc(money(order.total)) + "</strong></div>";
      const items = Array.isArray(result.items) ? result.items : [];
      $("order-detail-items").innerHTML = items.length ? items.map((item) =>
        "<article class='order-detail-item'><img src='" + esc(item.image_url || "../img/logoantonia5.png") + "' alt='' loading='lazy'><div><strong>" + esc(item.name || "Produto") + "</strong><span>Quantidade: " + esc(item.quantity) + "</span></div><strong>" + esc(money(item.line_total)) + "</strong></article>"
      ).join("") : "<p class='admin-muted'>Este pedido não possui produtos visíveis.</p>";
      $("order-detail-items").querySelectorAll("img").forEach((image) => image.addEventListener("error", () => { image.src = "../img/logoantonia5.png"; }, { once: true }));
    } catch (error) {
      $("order-detail-items").innerHTML = "<p class='form-message'>" + esc(error.message || "Não foi possível abrir os produtos.") + "</p>";
    }
  }

  function unwrapSeparation(result) {
    return result.separation || result.data || result;
  }

  async function loadSeparation(orderId, options = {}) {
    const list = $("separation-items");
    const previousScrollTop = options.preserveScroll && list ? list.scrollTop : 0;
    const result = await api("GET", "order_separation", { order_id: orderId });
    const separation = unwrapSeparation(result);
    const details = await api("GET", "order_detail", { order_id: orderId });
    const sourceOrder = details.order || {};
    const rows = Array.isArray(separation.items) ? separation.items : [];
    state.separation = {
      orderId: orderId,
      order: sourceOrder,
      orderUpdatedAt: separation.order_updated_at || separation.orderUpdatedAt || separation.updated_at || sourceOrder.updated_at || "",
      items: rows.map((item) => Object.assign({}, item, {
        id: item.order_item_id || item.orderItemId || item.id,
        name: item.name || item.name_snapshot || item.product_name || "Produto",
        image_url: item.image_url || item.metadata && item.metadata.image_url || "",
        quantity: item.quantity ?? item.qty ?? 0,
        unit_price: item.unit_price ?? item.price ?? 0,
        line_total: item.line_total ?? Number(item.unit_price || item.price || 0) * Number(item.quantity || item.qty || 0),
        state: item.state || item.status || "pending",
        substitution: item.substitution || null
      })),
      separatorKey: separation.separator_key || separation.assignment && separation.assignment.separator_key || separation.separator && (separation.separator.key || separation.separator) || ""
    };
    state.separatorKey = state.separation.separatorKey;
    renderSeparation();
    if (options.preserveScroll && list) list.scrollTop = previousScrollTop;
  }

  function separationMissingValue() {
    const separation = state.separation;
    if (!separation) return 0;
    return separation.items.filter((item) => item.state === "missing").reduce((sum, item) => sum + Number(item.line_total || 0), 0);
  }

  function renderSeparation() {
    const separation = state.separation;
    if (!separation) return;
    const totalCount = separation.items.length;
    const doneCount = separation.items.filter((item) => ["separated", "missing", "substituted"].includes(item.state)).length;
    const total = Math.max(0, Number(separation.order.total || 0) - separationMissingValue());
    const hasSeparator = Boolean(separation.separatorKey);
    const assignmentHint = $("separation-assignment-hint");
    if (assignmentHint) {
      assignmentHint.textContent = hasSeparator
        ? "Marque cada produto como encontrado, não encontrado ou substituído."
        : "Selecione o responsável para liberar os botões dos produtos.";
      assignmentHint.classList.toggle("is-ready", hasSeparator);
    }
    $("separation-title").textContent = "Pedido " + orderNumber(separation.order);
    $("order-separator").value = separation.separatorKey;
    $("separation-progress").textContent = doneCount + " de " + totalCount + " produtos conferidos";
    $("separation-total-value").textContent = money(total);
    $("separation-items").innerHTML = separation.items.map((item) => {
      const done = ["separated", "missing", "substituted"].includes(item.state);
      const chosenLabel = item.state === "separated" ? "Encontrado"
        : item.state === "missing" ? "Não encontrado"
          : item.state === "substituted" ? "Substituído por " + ((item.substitution && item.substitution.replacement_name) || item.name)
            : "Pendente";
      const displayName = item.state === "substituted" && item.substitution && item.substitution.original_name
        ? item.substitution.original_name + " → " + item.name
        : item.name;
      const cardClass = item.state === "missing" ? "is-missing"
        : item.state === "separated" ? "is-separated"
          : item.state === "substituted" ? "is-substituted" : "";
      const replacementSearch = state.replacementSearch && state.replacementSearch.itemId === String(item.id)
        ? "<div class='separation-replacement-search'><label>Buscar produto substituto<input type='search' autocomplete='off' data-replacement-query='" + esc(item.id) + "' value='" + esc(state.replacementSearch.query || "") + "' placeholder='Nome, marca ou código'></label><div class='replacement-results' data-replacement-results='" + esc(item.id) + "' role='listbox' aria-label='Produtos disponíveis'>Digite pelo menos 2 caracteres.</div></div>"
        : "";
      return "<article class='separation-item " + cardClass + "'>" +
        "<img src='" + esc(item.image_url || "../img/logoantonia5.png") + "' alt='' loading='lazy'>" +
        "<div class='separation-item-copy'><strong>" + esc(displayName) + "</strong><span class='separation-item-quantity'>Quantidade: " + esc(item.quantity) + "</span><small>" + esc(chosenLabel) + (item.state === "missing" ? " · abatido " + esc(money(item.line_total)) : "") + "</small></div>" +
        "<div class='separation-item-actions'><button type='button' data-separation-item='" + esc(item.id) + "' data-separation-state='separated' aria-label='Confirmar produto encontrado' " + (state.busy || done || !hasSeparator ? "disabled" : "") + ">OK<span class='separation-action-label'> · Encontrado</span></button><button type='button' data-separation-item='" + esc(item.id) + "' data-separation-state='missing' aria-label='Confirmar produto não encontrado' " + (state.busy || done || !hasSeparator ? "disabled" : "") + ">X<span class='separation-action-label'> · Não encontrado</span></button><button type='button' data-separation-item='" + esc(item.id) + "' data-separation-state='substituted' aria-label='Substituir produto' " + (state.busy || done || !hasSeparator ? "disabled" : "") + ">↔<span class='separation-action-label'> · Substituir</span></button></div>" +
        replacementSearch +
      "</article>";
    }).join("");
    $("separation-items").querySelectorAll("img").forEach((image) => image.addEventListener("error", () => { image.src = "../img/logoantonia5.png"; }, { once: true }));
    $("confirm-separation").disabled = state.busy || totalCount === 0 || doneCount !== totalCount || !separation.separatorKey;
  }

  async function openSeparation(id) {
    $("separation-message").textContent = "";
    $("separation-items").innerHTML = "<p class='admin-muted'>Carregando produtos…</p>";
    $("separation-total-value").textContent = "—";
    $("order-separation-dialog").showModal();
    try {
      await loadSeparation(id);
    } catch (error) {
      $("separation-message").textContent = error.message || "Não foi possível abrir a separação.";
    }
  }

  function openReplacementSearch(itemId) {
    if (!state.separation || state.busy) return;
    if (state.replacementSearch && state.replacementSearch.timer) window.clearTimeout(state.replacementSearch.timer);
    state.replacementSearch = { itemId: String(itemId), query: "", requestId: 0, timer: 0 };
    renderSeparation();
    const input = Array.from($("separation-items").querySelectorAll("[data-replacement-query]"))
      .find((node) => node.dataset.replacementQuery === String(itemId));
    if (input) {
      input.focus({ preventScroll: true });
      input.scrollIntoView({ block: "nearest" });
    }
  }

  function replacementResultsNode(itemId) {
    return Array.from($("separation-items").querySelectorAll("[data-replacement-results]"))
      .find((node) => node.dataset.replacementResults === String(itemId));
  }

  async function searchReplacementProducts(itemId, query) {
    const search = state.replacementSearch;
    if (!search || search.itemId !== String(itemId)) return;
    const term = String(query || "").trim();
    const requestId = ++search.requestId;
    const resultsNode = replacementResultsNode(itemId);
    if (!resultsNode) return;
    if (term.length < 2) {
      resultsNode.innerHTML = "<p>Digite pelo menos 2 caracteres.</p>";
      return;
    }
    resultsNode.innerHTML = "<p>Buscando produtos…</p>";
    try {
      const result = await api("GET", "products", { q: term, status: "active", segment: "substitution", limit: 20 });
      if (!state.replacementSearch || state.replacementSearch.itemId !== String(itemId) || state.replacementSearch.requestId !== requestId) return;
      const current = state.separation && state.separation.items.find((row) => String(row.id) === String(itemId));
      const products = (Array.isArray(result.products) ? result.products : [])
        .filter((product) => String(product.id) !== String(current && current.product_id) && Number(product.stock) > 0);
      if (!products.length) {
        resultsNode.innerHTML = "<p>Nenhum produto ativo com estoque encontrado.</p>";
        return;
      }
      resultsNode.innerHTML = products.map((product) => {
        const productPrice = product.is_offer === true && product.offer_price != null ? product.offer_price : product.price;
        const stock = Number(product.stock);
        return "<button type='button' class='replacement-option' role='option' data-replacement-choice='1' data-order-item-id='" + esc(itemId) + "' data-product-id='" + esc(product.id) + "' data-product-name='" + esc(product.name || "Produto") + "'>" +
          "<img src='" + esc(product.image_url || "../img/logoantonia5.png") + "' alt='' loading='lazy'>" +
          "<span><strong>" + esc(product.name || "Produto") + "</strong><small>" + esc(product.brand || "") + " · estoque " + esc(Number.isFinite(stock) ? stock.toLocaleString("pt-BR") : "—") + " · " + esc(money(productPrice)) + "</small></span>" +
          "<b>Usar</b></button>";
      }).join("");
      resultsNode.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => { image.src = "../img/logoantonia5.png"; }, { once: true }));
    } catch (error) {
      if (state.replacementSearch && state.replacementSearch.requestId === requestId && resultsNode.isConnected) {
        resultsNode.innerHTML = "<p class='form-message'>" + esc(error.message || "Não foi possível buscar produtos.") + "</p>";
      }
    }
  }

  function scheduleReplacementSearch(input) {
    const search = state.replacementSearch;
    if (!search || search.itemId !== input.dataset.replacementQuery) return;
    search.query = input.value;
    search.requestId += 1;
    if (search.timer) window.clearTimeout(search.timer);
    const itemId = search.itemId;
    const query = search.query;
    search.timer = window.setTimeout(() => searchReplacementProducts(itemId, query), 220);
  }

  async function useReplacement(itemId, productId, productName) {
    const separation = state.separation;
    if (!separation || state.busy || !separation.separatorKey) return;
    state.busy = true;
    renderSeparation();
    $("separation-message").textContent = "Registrando substituição e reservando estoque…";
    try {
      await api("POST", "order_separation_item", {
        order_id: separation.orderId,
        order_item_id: itemId,
        state: "substituted",
        replacement_product_id: productId,
        expected_order_updated_at: separation.orderUpdatedAt,
        separator_key: separation.separatorKey
      });
      state.replacementSearch = null;
      await loadSeparation(separation.orderId, { preserveScroll: true });
      $("separation-message").textContent = "Produto substituído por " + productName + ". O valor original foi mantido.";
    } catch (error) {
      $("separation-message").textContent = error.message || "Não foi possível substituir o produto.";
      try { await loadSeparation(separation.orderId, { preserveScroll: true }); } catch (_) {}
    } finally {
      state.busy = false;
      renderSeparation();
      if (state.replacementSearch) searchReplacementProducts(state.replacementSearch.itemId, state.replacementSearch.query);
    }
  }

  async function deleteOrder(id) {
    const order = state.orders.find((row) => String(row.id) === String(id));
    if (!order) return;
    if (!window.confirm("Excluir o pedido " + orderNumber(order) + "? Ele será cancelado e removido das listas. O histórico será preservado.")) return;
    state.deletingOrderId = String(id);
    renderList();
    try {
      await api("POST", "order_cancel", { order_id: id });
      toast("Pedido " + orderNumber(order) + " excluído da operação.");
      await loadOrders();
    } catch (error) {
      toast(error.message || "Não foi possível excluir o pedido.");
    } finally {
      state.deletingOrderId = "";
      renderList();
    }
  }

  async function confirmOrder(id) {
    if (!window.confirm("Confirmar o pedido e enviá-lo para Separar?")) return;
    try {
      await api("POST", "order_confirm", { order_id: id });
      toast("Pedido confirmado e enviado para Separar.");
      setStage("separating");
    } catch (error) {
      toast(error.message || "Não foi possível confirmar o pedido.");
    }
  }

  async function chooseSeparator(key) {
    if (!state.separation || !key || state.busy) return;
    state.busy = true;
    renderSeparation();
    $("separation-message").textContent = "Salvando responsável…";
    try {
      await api("POST", "order_set_separator", { order_id: state.separation.orderId, separator_key: key });
      await loadSeparation(state.separation.orderId);
      $("separation-message").textContent = "";
    } catch (error) {
      $("separation-message").textContent = error.message || "Não foi possível salvar o separador.";
      $("order-separator").value = state.separatorKey;
    } finally {
      state.busy = false;
      renderSeparation();
    }
  }

  async function markItem(id, itemState) {
    const separation = state.separation;
    if (!separation || state.busy || !separation.separatorKey) {
      $("separation-message").textContent = "Selecione o separador antes de conferir os produtos.";
      return;
    }
    state.busy = true;
    renderSeparation();
    $("separation-message").textContent = "Salvando conferência…";
    try {
      await api("POST", "order_separation_item", {
        order_id: separation.orderId,
        order_item_id: id,
        state: itemState,
        expected_order_updated_at: separation.orderUpdatedAt,
        separator_key: separation.separatorKey
      });
      await loadSeparation(separation.orderId, { preserveScroll: true });
      $("separation-message").textContent = itemState === "separated"
        ? "Produto marcado como encontrado."
        : "Produto marcado como não encontrado.";
    } catch (error) {
      $("separation-message").textContent = error.message || "Não foi possível salvar a conferência.";
      try { await loadSeparation(separation.orderId, { preserveScroll: true }); } catch (_) {}
    } finally {
      state.busy = false;
      renderSeparation();
    }
  }

  async function completeSeparation() {
    const separation = state.separation;
    if (!separation || state.busy) return;
    state.busy = true;
    renderSeparation();
    $("separation-message").textContent = "Atualizando pedido e estoque…";
    try {
      const result = await api("POST", "order_complete_separation", {
        order_id: separation.orderId,
        expected_order_updated_at: separation.orderUpdatedAt
      });
      const applied = result.applied || {};
      $("order-separation-dialog").close();
      state.separation = null;
      toast("Separação confirmada. Total atualizado para " + money(applied.final_total ?? (result.prepared && result.prepared.final_total) ?? result.total ?? separation.order.total ?? 0) + ".");
      setStage("expedition");
    } catch (error) {
      $("separation-message").textContent = error.message || "Não foi possível concluir a separação.";
      try { await loadSeparation(separation.orderId); } catch (_) {}
    } finally {
      state.busy = false;
      renderSeparation();
    }
  }

  async function deliverOrder(id) {
    if (!window.confirm("Marcar este pedido como entregue?")) return;
    try {
      await api("POST", "order_mark_delivered", { order_id: id });
      toast("Pedido marcado como entregue.");
      loadOrders();
    } catch (error) {
      toast(error.message || "Não foi possível registrar a entrega.");
    }
  }

  document.querySelectorAll("[data-order-stage]").forEach((button) => button.addEventListener("click", () => setStage(button.dataset.orderStage)));
  $("orders-reload").addEventListener("click", loadOrders);
  $("order-separator").addEventListener("change", (event) => chooseSeparator(event.target.value));
  $("confirm-separation").addEventListener("click", completeSeparation);
  $("orders-list").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.orderOpen) openOrder(button.dataset.orderOpen);
    if (button.dataset.orderConfirm) confirmOrder(button.dataset.orderConfirm);
    if (button.dataset.orderSeparate) openSeparation(button.dataset.orderSeparate);
    if (button.dataset.orderDeliver) deliverOrder(button.dataset.orderDeliver);
    if (button.dataset.orderDelete) deleteOrder(button.dataset.orderDelete);
  });
  $("separation-items").addEventListener("click", (event) => {
    const choice = event.target.closest("[data-replacement-choice]");
    if (choice) {
      useReplacement(choice.dataset.orderItemId, choice.dataset.productId, choice.dataset.productName);
      return;
    }
    const button = event.target.closest("[data-separation-item]");
    if (!button) return;
    if (button.dataset.separationState === "substituted") openReplacementSearch(button.dataset.separationItem);
    else markItem(button.dataset.separationItem, button.dataset.separationState);
  });
  $("separation-items").addEventListener("input", (event) => {
    const input = event.target.closest("[data-replacement-query]");
    if (input) scheduleReplacementSearch(input);
  });
  document.querySelectorAll("[data-orders-close]").forEach((button) => button.addEventListener("click", () => $(button.dataset.ordersClose).close()));
  $("order-detail-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  $("order-separation-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  window.DonaOrdersAdmin = { loadOrders: loadOrders };
  window.setInterval(() => { if (!$("admin-view").hidden && !document.querySelector("[data-panel='orders']").hidden) loadOrders(); }, 45000);
})();