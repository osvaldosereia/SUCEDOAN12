(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const key = config.publishableKey || "";
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
    confirmed: "Pedido confirmado",
    separating: "Pedido em separação",
    ready_for_delivery: "Pedido em expedição",
    delivered: "Pedido entregue",
    cancelled: "Pedido cancelado"
  })[String(value || "").toLowerCase()] || "Pedido registrado";

  async function getJson(url, headers) {
    const response = await fetch(url, { method: "GET", headers, cache: "no-store", credentials: "omit" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "order_unavailable");
    return data;
  }

  function renderOrder(data) {
    const snapshot = data.snapshot || {};
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const delivery = snapshot.delivery && typeof snapshot.delivery === "object" ? snapshot.delivery : {};
    const dateLabel = delivery.label || delivery.date_label || delivery.date ||
      snapshot.delivery_date_label || snapshot.delivery_date || "";
    $("order-code").textContent = data.public_code ? "Pedido " + data.public_code : "Seu pedido";
    $("order-status").textContent = statusText(data.current_status);
    $("order-delivery").textContent = dateLabel ? "Entrega: " + dateLabel : "Data de entrega conforme combinado com a loja";
    $("order-items").innerHTML = items.map((item) => {
      const quantity = Math.max(0, Number(item.quantity || 0));
      const lineTotal = item.line_total != null
        ? money(item.line_total)
        : item.unit_price != null ? money(Number(item.unit_price) * quantity) : "";
      return '<article class="public-order-item">' +
        '<img src="' + esc(item.image_url || "/img/logoantonia5.png") + '" alt="" width="58" height="58" loading="lazy" decoding="async">' +
        '<div><strong>' + esc(item.name || "Produto") + '</strong><span>Quantidade: ' + quantity + '</span></div>' +
        (lineTotal ? '<b>' + esc(lineTotal) + '</b>' : "") +
        '</article>';
    }).join("");
    const total = snapshot.final_total ?? snapshot.total ?? snapshot.total_amount ?? snapshot.original_total;
    $("order-total").textContent = money(total);
    $("order-result").hidden = false;
    $("order-loading").hidden = true;
    $("order-result").querySelectorAll("img").forEach((image) => image.addEventListener("error", () => { image.src = "/img/logoantonia5.png"; }, { once: true }));
  }

  async function loadOrder() {
    const params = new URLSearchParams(window.location.search);
    const capability = String(params.get("c") || "").trim();
    window.history.replaceState(null, "", window.location.pathname);
    if (!/^[a-f0-9]{64}$/i.test(capability) || !supabase || !key) {
      throw new Error("invalid_link");
    }
    const headers = { apikey: key, "x-customer-action-token": capability };
    const sessionUrl = new URL(supabase + "/functions/v1/order-customer-actions-v1");
    sessionUrl.searchParams.set("action", "session");
    const session = await getJson(sessionUrl.toString(), headers);
    const publicToken = String(session.public_token || "");
    if (!/^[a-f0-9]{16}$/i.test(publicToken)) throw new Error("order_unavailable");
    const viewUrl = new URL(supabase + "/functions/v1/order-public-view-v1");
    viewUrl.searchParams.set("k", publicToken);
    const order = await getJson(viewUrl.toString(), { apikey: key });
    renderOrder(order);
  }

  loadOrder().catch(() => {
    $("order-loading").hidden = true;
    $("order-error").hidden = false;
  });
})();