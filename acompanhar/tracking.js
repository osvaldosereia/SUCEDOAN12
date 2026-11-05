(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const base = String(config.supabaseUrl || "").replace(/\/$/, "");
  const key = config.publishableKey || "";
  const TOKEN_KEY = "dona-antonia-order-tracking-token";
  const $ = (id) => document.getElementById(id);
  const statusText = {
    new: "Pedido recebido",
    received: "Pedido recebido",
    storefront_received: "Pedido recebido",
    confirmed: "Pedido confirmado",
    processing: "Em separação",
    separating: "Em separação",
    ready: "Pronto para expedição",
    ready_for_delivery: "Pronto para expedição",
    out_for_delivery: "Saiu para entrega",
    delivered: "Pedido entregue",
    cancelled: "Pedido cancelado",
  };
  const stepForStatus = {
    new: "received", received: "received", storefront_received: "received",
    confirmed: "processing", processing: "processing", separating: "processing",
    ready: "ready", ready_for_delivery: "ready", out_for_delivery: "out_for_delivery", delivered: "delivered",
  };
  let token = "";
  let timer = 0;

  async function load() {
    if (!token || !base || !key) throw new Error("invalid_link");
    const url = new URL(base + "/functions/v1/order-public-view-v1");
    url.searchParams.set("k", token);
    const response = await fetch(url.toString(), { method: "GET", headers: { apikey: key }, cache: "no-store", credentials: "omit" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "order_unavailable");
    render(data);
  }

  function render(data) {
    const current = String(data.current_status || "").toLowerCase();
    const status = statusText[current] || "Status em atualização";
    const step = stepForStatus[current] || "";
    $("tracking-code").textContent = data.public_code ? "Pedido " + data.public_code : "Seu pedido";
    $("tracking-status").textContent = status;
    const progress = $("tracking-progress");
    progress.classList.toggle("is-cancelled", current === "cancelled");
    const steps = ["received", "processing", "ready", "out_for_delivery", "delivered"];
    const currentIndex = steps.indexOf(step);
    progress.querySelectorAll("[data-tracking-step]").forEach((item) => {
      const index = steps.indexOf(item.dataset.trackingStep);
      item.classList.toggle("is-complete", currentIndex >= 0 && index < currentIndex);
      item.classList.toggle("is-current", index === currentIndex && current !== "delivered");
      if (current === "delivered" && item.dataset.trackingStep === "delivered") item.classList.add("is-complete");
    });

    const snapshot = data.snapshot || {};
    const delivery = snapshot.delivery && typeof snapshot.delivery === "object" ? snapshot.delivery : {};
    const windowLabel = delivery.label || delivery.date_label || delivery.date || snapshot.delivery_date_label || snapshot.delivery_date || "";
    $("tracking-delivery-window").textContent = windowLabel ? "Previsão combinada: " + windowLabel : "A data de entrega segue a combinação feita com a loja.";
    const updated = new Date(data.current_status_updated_at || "");
    $("tracking-updated").textContent = Number.isNaN(updated.getTime()) ? "" : "Última atualização: " + new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" }).format(updated);
    $("tracking-live-note").hidden = current !== "out_for_delivery";
    $("tracking-live-note").textContent = current === "out_for_delivery"
      ? "Seu pedido saiu para entrega. Este link mostra o status do pedido; a posição GPS do entregador não está disponível nesta etapa."
      : "";
    $("tracking-order-link").href = "/p/?k=" + encodeURIComponent(token);
    $("tracking-loading").hidden = true;
    $("tracking-error").hidden = true;
    $("tracking-result").hidden = false;
  }

  function showError() {
    window.clearInterval(timer);
    $("tracking-loading").hidden = true;
    $("tracking-result").hidden = true;
    $("tracking-error").hidden = false;
  }

  const params = new URLSearchParams(window.location.search);
  const fromUrl = String(params.get("k") || "").trim();
  if (/^[a-f0-9]{16}$/i.test(fromUrl)) {
    token = fromUrl;
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch (_) {}
    window.history.replaceState(null, "", window.location.pathname);
  } else {
    try { token = sessionStorage.getItem(TOKEN_KEY) || ""; } catch (_) {}
  }
  load().then(() => {
    timer = window.setInterval(() => load().catch(showError), 60000);
  }).catch(showError);
})();
