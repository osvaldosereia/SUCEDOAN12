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
  const state = { stage: "new", orders: [], currentOrder: null, separation: null, busy: false, refreshTimer: 0, separatorKey: "" };
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
      const phone = order.phone_e164 || order.phone || "Telefone não informado";
      return "<article class='order-card'>" +
        "<button class='order-card-open' type='button' data-order-open='" + esc(order.id) + "' aria-label='Ver produtos do pedido " + esc(orderNumber(order)) + "'>" +
          "<span class='order-card-top'><strong>" + esc(orderNumber(order)) + "</strong><time>" + esc(date(order.created_at)) + "</time></span>" +
          "<span class='order-card-name'>" + esc(customerName(order)) + "</span>" +
          "<span class='order-card-phone'>" + esc(phone) + "</span>" +
          "<span class='order-card-bottom'><span>Valor do pedido</span><strong>" + esc(money(order.total)) + "</strong></span>" +
        "</button>" +
        "<div class='order-card-action'>" + action + "</div>" +
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

  async function loadSeparation(orderId) {
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
        state: item.state || item.status || "pending"
      })),
      separatorKey: separation.separator_key || separation.assignment && separation.assignment.separator_key || separation.separator && (separation.separator.key || separation.separator) || ""
    };
    state.separatorKey = state.separation.separatorKey;
    renderSeparation();
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
    const doneCount = separation.items.filter((item) => item.state === "separated" || item.state === "missing").length;
    const total = Math.max(0, Number(separation.order.total || 0) - separationMissingValue());
    $("separation-title").textContent = "Pedido " + orderNumber(separation.order);
    $("order-separator").value = separation.separatorKey;
    $("separation-progress").textContent = doneCount + " de " + totalCount + " produtos conferidos";
    $("separation-total-value").textContent = money(total);
    $("separation-items").innerHTML = separation.items.map((item) => {
      const done = item.state === "separated" || item.state === "missing";
      const chosenLabel = item.state === "separated" ? "Encontrado" : item.state === "missing" ? "Não encontrado" : "Pendente";
      return "<article class='separation-item " + (item.state === "missing" ? "is-missing" : item.state === "separated" ? "is-separated" : "") + "'>" +
        "<img src='" + esc(item.image_url || "../img/logoantonia5.png") + "' alt='' loading='lazy'>" +
        "<div class='separation-item-copy'><strong>" + esc(item.name) + "</strong><span class='separation-item-quantity'>Quantidade: " + esc(item.quantity) + "</span><small>" + esc(chosenLabel) + (item.state === "missing" ? " · abatido " + esc(money(item.line_total)) : "") + "</small></div>" +
        "<div class='separation-item-actions'><button type='button' data-separation-item='" + esc(item.id) + "' data-separation-state='separated' aria-label='Confirmar produto encontrado' " + (state.busy || done ? "disabled" : "") + ">OK<span class='separation-action-label'> · Encontrado</span></button><button type='button' data-separation-item='" + esc(item.id) + "' data-separation-state='missing' aria-label='Confirmar produto não encontrado' " + (state.busy || done ? "disabled" : "") + ">X<span class='separation-action-label'> · Não encontrado</span></button></div>" +
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
      await loadSeparation(separation.orderId);
      $("separation-message").textContent = "";
    } catch (error) {
      $("separation-message").textContent = error.message || "Não foi possível salvar a conferência.";
      try { await loadSeparation(separation.orderId); } catch (_) {}
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
  });
  $("separation-items").addEventListener("click", (event) => {
    const button = event.target.closest("[data-separation-item]");
    if (button) markItem(button.dataset.separationItem, button.dataset.separationState);
  });
  document.querySelectorAll("[data-orders-close]").forEach((button) => button.addEventListener("click", () => $(button.dataset.ordersClose).close()));
  $("order-detail-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  $("order-separation-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  window.DonaOrdersAdmin = { loadOrders: loadOrders };
  window.setInterval(() => { if (!$("admin-view").hidden && !document.querySelector("[data-panel='orders']").hidden) loadOrders(); }, 45000);
})();