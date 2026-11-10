import { buildMapsHref, deliveryStopCapabilities, isValidDeliveryRescheduleDate, latestLocationEvidence, prepaidPaymentMethod } from "./delivery-domain.mjs?v=4";

(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const base = String(config.supabaseUrl || "").replace(/\/$/, "");
  const key = config.publishableKey || "";
  const endpoint = base + "/functions/v1/delivery-ops-v1";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const state = { data: null, loading: false, loadPromise: null, busy: false, focusOrderId: "", activeDriverId: "", addressStop: null, locationCapture: null, photoPreviewUrl: "" };

  async function api(action, method = "GET", payload = {}) {
    const url = new URL(endpoint);
    url.searchParams.set("action", action);
    const headers = { apikey: key, "x-admin-code": window.DonaAdminAuth?.getCode?.() || "" };
    const init = { method, headers, cache: "no-store" };
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(payload);
    }
    const response = await fetch(url.toString(), init);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || "delivery_operation_failed");
    return result;
  }

  async function uploadAddressPhoto(stopId, photo) {
    const url = new URL(endpoint);
    url.searchParams.set("action", "admin_upload_address_photo");
    const headers = { apikey: key, "x-admin-code": window.DonaAdminAuth?.getCode?.() || "" };
    const form = new FormData();
    form.append("stop_id", stopId);
    form.append("photo", photo, "fachada.jpg");
    const response = await fetch(url.toString(), { method: "POST", headers, body: form, cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || "address_photo_upload_failed");
    return result;
  }

  function showMessage(message, error = false) {
    const node = $("delivery-admin-action-status");
    node.textContent = message || "";
    node.classList.toggle("is-error", error);
  }

  function orderNumber(order) {
    return order?.public_code || order?.order_number || String(order?.id || "").slice(0, 8).toUpperCase();
  }

  function customerName(order) {
    const customer = order?.customer_snapshot || {};
    const address = order?.delivery_address || {};
    return customer.display_name || customer.name || customer.full_name || address.customer_name || address.recipient_name || "Cliente";
  }

  function addressText(order) {
    const address = order?.delivery_address || {};
    const line1 = [address.street || address.address_line, address.number].filter(Boolean).join(", ");
    const line2 = [address.complement, address.neighborhood || address.district].filter(Boolean).join(" · ");
    const line3 = [address.city, address.state].filter(Boolean).join(" - ");
    const reference = address.reference ? "Referência: " + address.reference : "";
    return [line1, line2, line3, reference].filter(Boolean).join(" · ") || address.raw_text || address.formatted_address || "Endereço não informado";
  }

  function phoneHref(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return "";
    const intl = digits.startsWith("55") ? digits : "55" + digits;
    return "https://wa.me/" + intl;
  }

  function evidenceFor(order) {
    const rows = (state.data?.locations || []).filter((row) =>
      (row.order_id && row.order_id === order.id) ||
      (row.conversation_id && row.conversation_id === order.conversation_id) ||
      (row.customer_id && row.customer_id === order.customer_id));
    return latestLocationEvidence(rows);
  }

  function addressReferenceMarkup(reference) {
    if (!reference) return "";
    const hasPrimary = reference.address_has_primary_location === true;
    const alternatives = Array.isArray(reference.saved_locations) ? reference.saved_locations : [];
    const currentPoint = reference.destination_confidence === "confirmed" && reference.destination_label
      ? `<span>Ponto usado neste pedido: ${esc(reference.destination_label)}${reference.destination_captured_at ? " · " + esc(formatDate(reference.destination_captured_at)) : ""}</span>`
      : "";
    const photo = reference.address_photo?.url
      ? `<a class="delivery-address-reference-photo" href="${esc(reference.address_photo.url)}" target="_blank" rel="noopener"><img src="${esc(reference.address_photo.url)}" alt="Foto de referência da fachada" loading="lazy"><span>Ver foto da fachada${reference.address_photo.captured_at ? " · " + esc(formatDate(reference.address_photo.captured_at)) : ""}</span></a>`
      : "";
    if (!hasPrimary && !alternatives.length && !currentPoint && !photo) return "";
    const primary = hasPrimary
      ? `<span>Localização principal salva no cadastro do cliente</span>`
      : "";
    const otherPoints = alternatives.length
      ? `<span>Pontos alternativos: ${alternatives.map((item) => esc(item.label || "Ponto alternativo")).join(" · ")}</span>`
      : "";
    return `<div class="delivery-address-reference"><strong>Referências do endereço</strong>${primary}${currentPoint}${otherPoints}${photo}</div>`;
  }

  function hasValidMapPoint(latitude, longitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
  }

  function formatDate(value) {
    const date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? "Data não informada" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function renderDriverRegions() {
    const select = $("delivery-driver-region");
    const previous = select.value;
    select.innerHTML = `<option value="">Sem região definida</option>` +
      (state.data?.catalog?.regions || []).filter((region) => region.is_active)
        .map((region) => `<option value="${esc(region.id)}">${esc(region.name)}</option>`).join("");
    if (previous && [...select.options].some((option) => option.value === previous)) select.value = previous;
  }

  function resetDriverForm() {
    $("delivery-driver-id").value = "";
    $("delivery-driver-name").value = "";
    $("delivery-driver-phone").value = "";
    $("delivery-driver-region").value = "";
    $("delivery-driver-active").checked = true;
    $("delivery-driver-save").textContent = "Cadastrar entregador";
    $("delivery-driver-cancel").hidden = true;
  }

  function renderDrivers() {
    const drivers = Array.isArray(state.data?.catalog?.drivers) ? state.data.catalog.drivers : [];
    const host = $("delivery-driver-list");
    if (!drivers.length) {
      host.innerHTML = `<div class="delivery-empty">Cadastre o primeiro entregador para montar rotas.</div>`;
      return;
    }
    host.innerHTML = drivers.map((driver) => {
      const region = (state.data?.catalog?.regions || []).find((item) => item.id === driver.home_region_id);
      return `<article class="delivery-driver-row ${driver.is_active ? "is-active" : "is-inactive"}">
        <div><strong>${esc(driver.name)}</strong><small>${esc(driver.phone_e164 || "WhatsApp opcional")}${region ? " · " + esc(region.name) : ""}</small><em>${driver.is_active ? "Ativo" : "Inativo"}</em></div>
        <div class="delivery-driver-actions"><button type="button" class="button button-outline" data-edit-driver="${esc(driver.id)}">Editar</button></div>
      </article>`;
    }).join("");
  }


  function latestEvidenceForStop(order) {
    return order ? evidenceFor(order) : null;
  }

  function stopIsTerminal(stop) {
    return ["delivered", "failed", "cancelled"].includes(String(stop.status || ""));
  }

  function orderedStopsForRun(run) {
    return [...(run.stops || [])].sort((a, b) =>
      Number(stopIsTerminal(a)) - Number(stopIsTerminal(b)) || Number(a.sequence || 0) - Number(b.sequence || 0));
  }

  function renderDriverTabs() {
    const host = $("delivery-driver-tabs");
    const runs = state.data?.runs || [];
    const routeDriverIds = new Set(runs.map((run) => run.driver_id || run.driver?.id).filter(Boolean));
    const drivers = (state.data?.catalog?.drivers || []).filter((driver) => driver.is_active || routeDriverIds.has(driver.id));
    if (!drivers.some((driver) => driver.id === state.activeDriverId)) {
      state.activeDriverId = (drivers.find((driver) => routeDriverIds.has(driver.id)) || drivers[0])?.id || "";
    }
    if (!drivers.length) {
      host.innerHTML = "<p class='delivery-empty'>Cadastre um entregador para visualizar as entregas.</p>";
      return;
    }
    host.innerHTML = drivers.map((driver) => {
      const assignedRuns = runs.filter((run) => (run.driver_id || run.driver?.id) === driver.id);
      const stops = assignedRuns.flatMap((run) => run.stops || []);
      const pending = stops.filter((stop) => ["planned", "out_for_delivery"].includes(stop.status)).length;
      const completed = stops.filter((stop) => stop.status === "delivered").length;
      const failed = stops.filter((stop) => stop.status === "failed").length;
      const counts = [
        `${pending} pendente${pending === 1 ? "" : "s"}`,
        completed ? `${completed} entregue${completed === 1 ? "" : "s"}` : "",
        failed ? `${failed} não entregue${failed === 1 ? "" : "s"}` : "",
      ].filter(Boolean).join(" · ");
      const active = driver.id === state.activeDriverId;
      return `<button id='delivery-driver-tab-${esc(driver.id)}' class='delivery-driver-tab ${active ? "is-active" : ""}' type='button' role='tab' aria-controls='delivery-routes-list' aria-selected='${active ? "true" : "false"}' tabindex='${active ? "0" : "-1"}' data-driver-tab='${esc(driver.id)}'><strong>${esc(driver.name)}</strong><span>${esc(counts)}</span></button>`;
    }).join("");
    const routesPanel = $("delivery-routes-list");
    if (state.activeDriverId) routesPanel?.setAttribute("aria-labelledby", "delivery-driver-tab-" + state.activeDriverId);
    if (!host.dataset.keyboardReady) {
      host.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const tabs = [...host.querySelectorAll("[data-driver-tab]")];
        if (!tabs.length) return;
        const current = tabs.findIndex((tab) => tab.dataset.driverTab === state.activeDriverId);
        const next = event.key === "Home" ? 0
          : event.key === "End" ? tabs.length - 1
            : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        tabs[next].focus();
        tabs[next].click();
      });
      host.dataset.keyboardReady = "true";
    }
  }


  function renderRouteStop(run, stop, displayIndex, pendingStops) {
    const order = stop.order || {};
    const evidence = latestEvidenceForStop(order);
    const addressReference = stop.address_reference || order.address_reference;
    const hasRoutePoint = ["confirmed", "saved"].includes(String(stop.destination_confidence || "")) &&
      hasValidMapPoint(stop.destination_latitude, stop.destination_longitude);
    const mapStop = hasRoutePoint || !addressReference?.address_has_primary_location
      ? { ...stop, order, address: stop.address || order.delivery_address }
      : { ...stop, order, address: stop.address || order.delivery_address,
          destination_latitude: addressReference.primary_latitude,
          destination_longitude: addressReference.primary_longitude, destination_confidence: "saved" };
    const mapHref = buildMapsHref(mapStop) || (evidence ? buildMapsHref({ destination_latitude: evidence.latitude, destination_longitude: evidence.longitude, destination_confidence: "confirmed" }) : "");
    const capabilities = deliveryStopCapabilities(run, stop);
    const done = stop.status === "delivered";
    const failed = stop.status === "failed";
    const cancelled = stop.status === "cancelled";
    const stopId = stop.id || stop.stop_id;
    const phone = order.phone_e164 || stop.phone || "";
    const paid = order.delivery_paid_ahead === true;
    const pendingIndex = pendingStops.findIndex((item) => (item.id || item.stop_id) === stopId);
    const orderedActive = [...pendingStops].sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
    const currentStopStatus = run.status === "dispatched" ? "out_for_delivery" : "planned";
    const isNext = run.service_date === state.data?.service_date &&
      (orderedActive.find((item) => item.status === currentStopStatus)?.id || orderedActive.find((item) => item.status === currentStopStatus)?.stop_id) === stopId;
    const canMarkDelivered = capabilities.canMarkDelivered ||
      (run.status === "planned" && stop.status === "planned" && run.service_date === state.data?.service_date);
    const contact = phone ? `<a class="delivery-card-action" href="${esc(phoneHref(phone))}" target="_blank" rel="noopener">WhatsApp</a>` : "";
    const map = mapHref ? `<a class="delivery-card-action" href="${esc(mapHref)}" target="_blank" rel="noopener">Abrir no Maps</a>` : "";
    const viewOrder = order.id ? `<button class="delivery-card-action" type="button" data-view-delivery-order="${esc(order.id)}">Ver pedido</button>` : "";
    const items = Array.isArray(order.items) && order.items.length
      ? `<details class="delivery-items"><summary>Ver produtos do pedido · ${order.items.length} item${order.items.length === 1 ? "" : "s"}</summary><ul>${order.items.map((item) => `<li>${esc(item.quantity)} × ${esc(item.name)}</li>`).join("")}</ul></details>` : "";
    const routeLockedDrivers = new Set((state.data?.runs || [])
      .filter((candidate) => candidate.status === "dispatched")
      .map((candidate) => candidate.driver_id || candidate.driver?.id).filter(Boolean));
    const activeDrivers = (state.data?.catalog?.drivers || []).filter((driver) =>
      driver.is_active && driver.id !== run.driver_id && !routeLockedDrivers.has(driver.id));
    const stopManagement = capabilities.canCancel
      ? `<div class="delivery-stop-management"><label class="delivery-stop-field">Passar para outro entregador<select data-route-target-driver="${esc(stopId)}"><option value="">${activeDrivers.length ? "Selecione o entregador" : "Nenhum outro entregador ativo"}</option>${activeDrivers.map((driver) => `<option value="${esc(driver.id)}">${esc(driver.name)}</option>`).join("")}</select></label><button class="button button-outline" type="button" data-stop-reassign="${esc(stopId)}" ${activeDrivers.length ? "" : "disabled"}>Passar pedido</button><label class="delivery-stop-field">Novo dia da entrega<input type="date" data-reschedule-date="${esc(stopId)}" min="${esc(state.data?.service_date || "")}" value="${esc(run.service_date || state.data?.service_date || "")}"></label><button class="button button-outline" type="button" data-stop-reschedule="${esc(stopId)}">Salvar novo dia</button><button class="button button-danger" type="button" data-stop-cancel="${esc(stopId)}">Cancelar entrega</button></div>`
      : "";
    const payment = canMarkDelivered && !paid
      ? `<label class="delivery-stop-field">Forma de recebimento<select data-admin-delivery-payment="${esc(stopId)}"><option value="">Selecione como recebeu</option><option value="cash">Dinheiro</option><option value="pix">Pix</option><option value="credit_card">Cartão/link</option><option value="food_card">Cartão alimentação</option><option value="meal_card">Cartão refeição</option><option value="other">Outro</option></select></label>`
      : "";
    const complete = canMarkDelivered
      ? `<div class="delivery-stop-complete">${payment}<button class="button button-primary" type="button" data-admin-delivered="${esc(stopId)}">Marcar como entregue</button><button class="button button-outline delivery-fail-button" type="button" data-admin-failed="${esc(stopId)}">Não entregue</button></div>`
      : "";
    const movement = !stopIsTerminal(stop) && pendingStops.length > 1
      ? `<div class="delivery-sort-actions"><button type="button" data-sort-stop="-1" data-run-id="${esc(run.id)}" data-stop-id="${esc(stopId)}" ${pendingIndex <= 0 ? "disabled" : ""}>↑ Subir</button><button type="button" data-sort-stop="1" data-run-id="${esc(run.id)}" data-stop-id="${esc(stopId)}" ${pendingIndex < 0 || pendingIndex >= pendingStops.length - 1 ? "disabled" : ""}>↓ Descer</button></div>`
      : "";
    const eta = isNext
      ? `<div class="delivery-eta-box"><label>Previsão<select data-eta-stop="${esc(stopId)}"><option value="10">10 min</option><option value="15" selected>15 min</option><option value="20">20 min</option><option value="30">30 min</option><option value="40">40 min</option><option value="60">60 min</option></select></label><button class="button button-outline delivery-route-start" type="button" data-notify-next="${esc(stopId)}" data-map-href="${esc(mapHref)}" ${order.phone_e164 && run.driver?.phone_e164 ? "" : "disabled"}>${run.status === "planned" ? "Avisar cliente e iniciar entregas" : "Avisar cliente e abrir rota"}</button></div>`
      : "";
    const unpaid = !paid && !stopIsTerminal(stop) && !canMarkDelivered
      ? `<div class="delivery-prepaid-control"><select data-prepaid-method="${esc(order.id)}" aria-label="Forma de pagamento antecipado"><option value="" selected disabled>Selecione se já foi pago</option><option value="pix">Pix pago</option><option value="credit_card">Link/cartão pago</option></select><input type="text" data-prepaid-reference maxlength="120" placeholder="Referência opcional"><button type="button" class="button button-outline" data-prepaid-order="${esc(order.id)}">Marcar como pago</button></div>`
      : "";
    const location = evidence
      ? `<div class="delivery-location-preview"><strong>Localizador recente ${evidence.direction === "outbound" ? "enviado pela loja" : "enviado pelo cliente"}</strong><span>${esc(formatDate(evidence.captured_at))}</span><button type="button" class="button button-outline" data-confirm-location="${esc(order.id)}" data-evidence-id="${esc(evidence.id)}">Salvar no cadastro do cliente</button></div>`
      : "";
    const addressInfo = addressReferenceMarkup(addressReference);
    const addressDetails = addressInfo
      ? `<details class="delivery-extra-details"><summary>Referências do endereço</summary>${addressInfo}</details>`
      : "";
    const addressTools = isNext
      ? `<button class="button button-outline" type="button" data-open-address="${esc(stopId)}">Confirmar local e foto da fachada</button>`
      : "";
    const extras = [items, unpaid, location, addressDetails, addressTools, stopManagement, movement].filter(Boolean).join("");
    const moreOptions = extras
      ? `<details class="delivery-more-options"><summary>Mais opções do pedido</summary><div class="delivery-more-content">${extras}</div></details>`
      : "";
    const status = done ? `<span class="delivery-stop-status is-delivered">ENTREGUE</span>`
      : failed ? `<span class="delivery-stop-status is-failed">NÃO ENTREGUE</span>`
        : cancelled ? `<span class="delivery-stop-status is-cancelled">ENTREGA CANCELADA</span>`
          : `<span class="delivery-stop-status">${run.status === "dispatched" ? "Em entrega" : run.service_date === state.data?.service_date ? "Pronta para entrega" : "Agendada"}</span>`;
    const dateLabel = run.service_date ? `<span class="delivery-stop-date-highlight">Entrega: ${esc(new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(run.service_date + "T12:00:00Z")))}</span>` : "";
    const currentStopLabel = isNext
      ? `<span class="delivery-current-stop">Próxima parada · ${pendingIndex + 1} de ${pendingStops.length}</span>`
      : "";
    const orderTotal = order.total ?? (Number(stop.total_cents || 0) / 100);
    return `<article class="delivery-stop-card ${done ? "is-delivered" : ""} ${failed ? "is-failed" : ""} ${cancelled ? "is-cancelled" : ""} ${isNext ? "is-next" : ""}" data-delivery-order-card="${esc(order.id)}" data-delivery-route-date="${esc(run.service_date || "")}">
      <header class="delivery-stop-heading">
        <div class="delivery-stop-main">
          <span class="delivery-stop-sequence">${displayIndex + 1}</span>
          <div class="delivery-stop-copy">
            <div class="delivery-stop-title-row"><strong>Pedido ${esc(orderNumber(order))}</strong>${status}</div>
            <strong class="delivery-customer-name">${esc(customerName(order))}</strong>
            ${dateLabel}
            <span class="delivery-stop-address">${esc(addressText(order))}</span>
            <div class="delivery-stop-meta">
              <span class="delivery-stop-phone">${phone ? esc(phone) : "Telefone não informado"}</span>
              <strong class="delivery-stop-total">${money(orderTotal)}</strong>
            </div>
            ${paid
              ? `<span class="delivery-prepaid-badge">PAGO ADIANTADO · NÃO COBRAR</span>`
              : `<span class="delivery-stop-payment">Pagamento: ${esc(order.payment_display || stop.payment_method || "A confirmar")}</span>`}
          </div>
        </div>
        ${currentStopLabel}
      </header>
      <div class="delivery-stop-actions">${contact}${map}${viewOrder}</div>
      ${eta}
      ${complete}
      ${moreOptions}
    </article>`;
  }


  function renderRoutes() {
    const allRoutes = Array.isArray(state.data?.runs) ? state.data.runs : [];
    const routes = allRoutes.filter((run) => (run.driver_id || run.driver?.id) === state.activeDriverId);
    const host = $("delivery-routes-list");
    if (!routes.length) {
      host.innerHTML = `<div class='delivery-empty'>Este entregador ainda não tem entregas atribuídas.</div>`;
      return;
    }
    routes.sort((a, b) => String(a.service_date || "").localeCompare(String(b.service_date || "")));
    host.innerHTML = routes.map((run) => {
      const stops = orderedStopsForRun(run);
      const pending = stops.filter((stop) => ["planned", "out_for_delivery"].includes(stop.status));
      const deliveredCount = stops.filter((stop) => stop.status === "delivered").length;
      const failedCount = stops.filter((stop) => stop.status === "failed").length;
      const cancelledCount = stops.filter((stop) => stop.status === "cancelled").length;
      const activeTotal = pending.length + deliveredCount + failedCount;
      const completedCount = deliveredCount + failedCount;
      const progressPercent = activeTotal ? Math.round((completedCount / activeTotal) * 100) : cancelledCount ? 0 : 100;
      const progressText = activeTotal
        ? `${completedCount} de ${activeTotal} paradas finalizadas · ${pending.length} pendentes`
        : cancelledCount ? "Nenhuma entrega ativa nesta rota" : "Nenhuma parada nesta rota";
      const stateLabel = run.status === "dispatched" ? "Em entrega"
        : run.status === "completed" ? "Concluída"
          : run.status === "cancelled" ? "Cancelada"
            : run.service_date === state.data?.service_date ? "Pronta para entrega" : "Agendada";
      const total = stops.filter((stop) => stop.status !== "cancelled").reduce((sum, stop) =>
        sum + Number(stop.order?.total ?? (Number(stop.total_cents || 0) / 100)), 0);
      const summary = pending.length + " pendente" + (pending.length === 1 ? "" : "s") +
        (deliveredCount ? " · " + deliveredCount + " entregue" + (deliveredCount === 1 ? "" : "s") : "") +
        (failedCount ? " · " + failedCount + " não entregue" + (failedCount === 1 ? "" : "s") : "") +
        (cancelledCount ? " · " + cancelledCount + " cancelada" + (cancelledCount === 1 ? "" : "s") : "");
      const dateLabel = run.service_date ? new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" }).format(new Date(run.service_date + "T12:00:00Z")) : "Data não informada";
      return `<section class="delivery-route-card">
        <header class="delivery-route-heading">
          <div><p class="eyebrow">${esc(dateLabel)}</p><h4>${esc(run.driver?.name || "Entregador não atribuído")}</h4><span>${esc(summary)} · ${esc(money(total))}</span></div>
          <strong class="delivery-route-state ${run.status === "dispatched" ? "is-dispatched" : ""}">${stateLabel}</strong>
        </header>
        <div class="delivery-route-progress">
          <div class="delivery-route-progress-copy"><strong>Progresso da rota</strong><span>${progressText}</span></div>
          <div class="delivery-route-progress-track" role="progressbar" aria-label="Progresso das paradas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPercent}"><span style="width:${progressPercent}%"></span></div>
        </div>
        <details class="delivery-route-stops-details" data-run-stops="${esc(run.id)}" open>
          <summary>${pending.length} entrega${pending.length === 1 ? "" : "s"} pendente${pending.length === 1 ? "" : "s"} · ${esc(money(total))}</summary>
          <div class="delivery-route-stops">${stops.map((stop, index) => renderRouteStop(run, stop, index, pending)).join("")}</div>
        </details>
      </section>`;
    }).join("");
  }

  function render() {
    renderDriverRegions();
    renderDrivers();
    const teamPanel = document.querySelector(".delivery-team-management");
    if (teamPanel && !teamPanel.dataset.initialized) {
      const drivers = state.data?.catalog?.drivers || [];
      teamPanel.open = !drivers.some((driver) => driver.is_active);
      teamPanel.dataset.initialized = "true";
    }
    renderDriverTabs();
    renderRoutes();
    const selectedRuns = (state.data?.runs || []).filter((run) => (run.driver_id || run.driver?.id) === state.activeDriverId);
    const selectedStops = selectedRuns.flatMap((run) => run.stops || []);
    const pending = selectedStops.filter((stop) => ["planned", "out_for_delivery"].includes(stop.status)).length;
    const completed = selectedStops.filter((stop) => stop.status === "delivered").length;
    $("delivery-admin-status").textContent = pending
      ? `${pending} entrega${pending === 1 ? "" : "s"} pendente${pending === 1 ? "" : "s"} para ${driversName(state.activeDriverId)}${completed ? ` · ${completed} concluída${completed === 1 ? "" : "s"} hoje` : ""}.`
      : completed ? `${completed} entrega${completed === 1 ? "" : "s"} concluída${completed === 1 ? "" : "s"} para ${driversName(state.activeDriverId)}.`
        : "Nenhuma entrega atribuída para este entregador.";
  }

  function driversName(id) {
    return (state.data?.catalog?.drivers || []).find((driver) => driver.id === id)?.name || "este entregador";
  }

  async function load() {
    if (!$("delivery-admin-status")) return null;
    if (state.loading) return state.loadPromise;
    state.loading = true;
    $("delivery-admin-status").textContent = "Carregando pedidos, rotas e entregadores…";
    state.loadPromise = (async () => {
      try {
        state.data = await api("admin_dashboard");
        render();
        showMessage("");
        if (state.focusOrderId) {
          const focused = document.querySelector(`[data-delivery-order-card="${CSS.escape(state.focusOrderId)}"]`);
          focused?.scrollIntoView({ behavior: "smooth", block: "center" });
          focused?.classList.add("is-focus");
          window.setTimeout(() => focused?.classList.remove("is-focus"), 1800);
          state.focusOrderId = "";
        }
        return state.data;
      } catch (error) {
        $("delivery-admin-status").textContent = "Não foi possível carregar entregas: " + friendlyError(error.message);
        state.data = null;
        $("delivery-driver-list").innerHTML = "";
        $("delivery-driver-tabs").innerHTML = "";
        $("delivery-routes-list").innerHTML = "";
        throw error;
      } finally {
        state.loading = false;
        state.loadPromise = null;
      }
    })();
    return state.loadPromise;
  }

  async function getContext() {
    await load();
    const assignments = new Map();
    for (const run of state.data?.runs || []) {
      const driverId = run.driver_id || run.driver?.id || "";
      const driver = (state.data?.catalog?.drivers || []).find((item) => item.id === driverId) || run.driver || {};
      for (const stop of run.stops || []) {
        if (["planned", "out_for_delivery"].includes(String(stop.status || ""))) {
          assignments.set(stop.order_id, {
            order_id: stop.order_id,
            driver_id: driverId,
            driver_name: driver.name || "Entregador",
            service_date: run.service_date || "",
            locked: stop.status === "out_for_delivery" || run.status === "dispatched",
          });
        }
      }
    }
    return { drivers: state.data?.catalog?.drivers || [], assignments: [...assignments.values()] };
  }

  async function assignOrder(orderId, driverId) {
    const result = await runAction("assign_order", { order_id: orderId, driver_id: driverId, operator: "Admin" }, "Entrega atribuída ao entregador.");
    return result;
  }

  function friendlyError(code) {
    const map = {
      admin_code_invalid: "a sessão do admin expirou; acesse novamente.",
      driver_name_required: "informe o nome do entregador.",
      driver_phone_invalid: "confira o WhatsApp do entregador com DDD.",
      driver_not_active: "ative o entregador para atribuir entregas.",
      route_too_many_orders: "uma rota pode ter no máximo 30 pedidos. Monte outra rota para o restante.",
      invalid_order_id: "um pedido selecionado não é válido. Atualize a lista e tente novamente.",
      duplicate_order_in_route: "há pedido duplicado na rota. Atualize a lista e selecione novamente.",
      order_not_ready: "um dos pedidos não está mais pronto para expedição; atualize a lista.",
      order_delivery_date_mismatch: "um dos pedidos não está programado para hoje; confira a data de entrega e atualize a fila.",
      stop_not_found: "esta entrega não está mais disponível. Atualize a rota.",
      stop_not_planned: "esta entrega já saiu da etapa de planejamento e não pode ser alterada.",
      stop_not_out_for_delivery: "só é possível marcar como entregue uma parada que já saiu para entrega.",
      invalid_stop: "a entrega selecionada não é válida. Atualize a rota.",
      invalid_stop_or_driver: "selecione uma entrega e um entregador válidos.",
      route_driver_missing: "a rota não tem um entregador definido. Atualize os dados da rota.",
      route_locked: "esta rota já está em andamento e não pode ser reorganizada dessa forma.",
      invalid_delivery_date: "escolha uma data válida, a partir de hoje e diferente de domingo.",
      delivery_date_in_past: "a nova data não pode ser anterior a hoje.",
      delivery_not_available_sunday: "não é possível agendar entrega aos domingos.",
      driver_same_as_current: "selecione um entregador diferente do atual.",
      driver_already_dispatched: "o outro entregador já saiu em uma rota hoje.",
      target_driver_route_locked: "a rota do outro entregador já está em andamento.",
      payment_method_required: "selecione a forma de pagamento recebida antes de marcar como entregue.",
      service_date_unavailable: "não foi possível confirmar a data local da rota. Atualize a tela e tente novamente.",
      vehicle_already_dispatched: "este entregador já saiu em uma rota hoje.",
      order_already_dispatched: "um pedido já está em uma rota que saiu.",
      order_not_ready_for_dispatch: "o pedido ainda precisa terminar a separação antes de iniciar a entrega.",
      separation_not_completed: "conclua a separação do pedido antes de iniciar a entrega.",
      separation_stock_not_applied: "o estoque da separação ainda não foi atualizado.",
      separation_has_pending_items: "a separação ainda tem produtos pendentes.",
      delivery_not_due: "esta entrega está programada para outro dia.",
      run_not_ready_for_dispatch: "atribua um entregador antes de iniciar a entrega.",
      stop_is_not_next: "só é possível registrar primeiro a entrega que está no topo da rota.",
      next_stop_template_disabled: "o aviso de próxima entrega está pausado para esse número.",
      next_stop_template_not_approved: "o aviso ainda não foi aprovado pela Meta.",
      meta_transport_not_configured: "a conexão de envio da Meta não está configurada no servidor.",
      prepaid_settlement_mismatch: "o pagamento registrado não confere com o total ou a forma escolhida.",
      invalid_prepaid_payment: "selecione Pix ou link/cartão já pago.",
      location_customer_mismatch: "o localizador pertence a outro cliente.",
      location_conversation_mismatch: "o localizador não está ligado com segurança a esta conversa.",
      location_order_mismatch: "o localizador está vinculado a outro pedido.",
      location_coordinates_invalid: "o localizador não contém coordenadas válidas.",
    };
    return map[code] || String(code || "erro desconhecido").replaceAll("_", " ");
  }

  async function runAction(action, payload, success) {
    if (state.busy) return false;
    state.busy = true;
    showMessage("Salvando…");
    try {
      await api(action, "POST", payload);
      await load();
      showMessage(success);
      return true;
    } catch (error) {
      showMessage(friendlyError(error.message), true);
      return false;
    } finally {
      state.busy = false;
    }
  }

  function normalizePhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("55") && [12, 13].includes(digits.length)) return "+" + digits;
    if ([10, 11].includes(digits.length)) return "+55" + digits;
    return "invalid";
  }

  function editDriver(id) {
    const driver = (state.data?.catalog?.drivers || []).find((row) => row.id === id);
    if (!driver) return;
    $("delivery-driver-id").value = driver.id;
    $("delivery-driver-name").value = driver.name || "";
    $("delivery-driver-phone").value = driver.phone_e164 || "";
    $("delivery-driver-region").value = driver.home_region_id || "";
    $("delivery-driver-active").checked = driver.is_active === true;
    $("delivery-driver-save").textContent = "Salvar entregador";
    $("delivery-driver-cancel").hidden = false;
    $("delivery-driver-name").focus();
  }

  async function submitDriver(event) {
    event.preventDefault();
    const phone = normalizePhone($("delivery-driver-phone").value);
    if (phone === "invalid") return showMessage("Confira o WhatsApp: informe DDD e número.", true);
    const payload = {
      id: $("delivery-driver-id").value || null,
      name: $("delivery-driver-name").value.trim(),
      phone_e164: phone || null,
      home_region_id: $("delivery-driver-region").value || null,
      is_active: $("delivery-driver-active").checked,
    };
    const saved = await runAction("driver_save", payload, payload.id ? "Cadastro do entregador atualizado." : "Entregador cadastrado.");
    if (saved) resetDriverForm();
  }

  async function markPrepaid(orderId, card) {
    const select = card?.querySelector(`[data-prepaid-method="${CSS.escape(orderId)}"]`);
    const method = prepaidPaymentMethod(select?.value);
    if (!method) {
      showMessage("Selecione Pix ou link/cartão já pago antes de confirmar.", true);
      select?.focus();
      return;
    }
    const reference = card?.querySelector("[data-prepaid-reference]")?.value || "";
    const methodLabel = method === "pix" ? "Pix" : "link/cartão";
    if (!window.confirm(`Confirma que o pagamento de ${methodLabel} foi recebido integralmente? O entregador verá “PAGO ADIANTADO · NÃO COBRAR” e não cobrará na entrega.`)) return;
    await runAction("mark_prepaid", { order_id: orderId, method, reference, operator: "Admin" }, "Pagamento marcado como antecipado.");
  }

  async function reorderStops(runId, stopId, direction) {
    const run = (state.data?.runs || []).find((item) => item.id === runId);
    if (!run) return;
    const pending = (run.stops || []).filter((stop) => ["planned", "out_for_delivery"].includes(stop.status))
      .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
    const index = pending.findIndex((stop) => String(stop.id || stop.stop_id) === String(stopId));
    const target = index + Number(direction);
    if (index < 0 || target < 0 || target >= pending.length) return;
    const reordered = [...pending];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    await runAction("admin_reorder_stops", { run_id: runId, stop_ids: reordered.map((stop) => stop.id || stop.stop_id), operator: "Admin" }, "Sequência atualizada.");
  }

  function findStop(stopId) {
    return (state.data?.runs || []).flatMap((run) => run.stops || [])
      .find((stop) => String(stop.id || stop.stop_id) === String(stopId));
  }

  function openAddressDialog(stopId) {
    const stop = findStop(stopId);
    if (!stop) return;
    state.addressStop = stop;
    state.locationCapture = null;
    const dialog = $("delivery-address-dialog");
    dialog.dataset.stopId = stop.id || stop.stop_id;
    $("delivery-address-title").textContent = "Pedido " + orderNumber(stop.order || {}, stop);
    $("delivery-location-mode").value = "primary";
    $("delivery-location-label").value = "";
    $("delivery-location-label-field").hidden = true;
    $("delivery-location-capture-status").textContent = "Capture o GPS enquanto estiver em frente ao endereço.";
    $("delivery-location-error").textContent = "";
    $("delivery-location-save").disabled = true;
    $("delivery-address-photo-input").value = "";
    $("delivery-address-photo-input").disabled = !(stop.customer_address_id || stop.order?.delivery_customer_address_id);
    $("delivery-address-photo-status").textContent = $("delivery-address-photo-input").disabled
      ? "Salve primeiro a localização para vincular a foto ao endereço."
      : "Foto opcional. Enquadre somente a fachada.";
    $("delivery-address-photo-save").hidden = true;
    $("delivery-address-photo-save").disabled = true;
    $("delivery-address-photo-preview").hidden = true;
    $("delivery-address-photo-preview").removeAttribute("src");
    const reference = stop.address_reference || stop.order?.address_reference || {};
    const hasCoordinates = stop.destination_latitude != null && stop.destination_longitude != null;
    $("delivery-address-current").textContent = hasCoordinates
      ? "Ponto atual do pedido" + (stop.destination_label ? " · " + stop.destination_label : "")
      : "Ainda não há localização salva para este endereço.";
    const alternate = $("delivery-location-mode").querySelector("option[value='alternate']");
    alternate.disabled = reference.address_has_primary_location !== true;
    const saved = Array.isArray(reference.saved_locations) ? reference.saved_locations : [];
    $("delivery-saved-location-section").hidden = saved.length === 0;
    $("delivery-saved-location-select").innerHTML = "<option value=''>Selecione um ponto salvo</option>" + saved.map((item) =>
      "<option value='" + esc(item.id) + "'>" + esc(item.label || "Ponto alternativo") + (item.captured_at ? " · " + esc(formatDate(item.captured_at)) : "") + "</option>").join("");
    $("delivery-saved-location-use").disabled = true;
    dialog.showModal();
    syncLocationMode();
  }

  function syncLocationMode() {
    const alternate = $("delivery-location-mode").value === "alternate";
    $("delivery-location-label-field").hidden = !alternate;
    $("delivery-location-save").textContent = alternate ? "Salvar ponto alternativo" : "Salvar localização principal";
    if (alternate && $("delivery-location-mode").querySelector("option[value='alternate']").disabled) {
      $("delivery-location-mode").value = "primary";
      $("delivery-location-label-field").hidden = true;
    }
  }

  function captureAddressLocation() {
    if (!state.addressStop || state.busy) return;
    if (!navigator.geolocation?.getCurrentPosition) {
      $("delivery-location-capture-status").textContent = "O navegador não disponibilizou o GPS.";
      return;
    }
    state.locationCapture = null;
    $("delivery-location-capture").disabled = true;
    $("delivery-location-capture").textContent = "Capturando GPS…";
    $("delivery-location-save").disabled = true;
    navigator.geolocation.getCurrentPosition((position) => {
      state.locationCapture = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy_m: position.coords.accuracy };
      $("delivery-location-capture-status").textContent = "GPS capturado. Precisão aproximada: " + Math.round(position.coords.accuracy) + " m.";
      $("delivery-location-save").disabled = false;
      $("delivery-location-capture").disabled = false;
      $("delivery-location-capture").textContent = "Capturar GPS novamente";
    }, (error) => {
      state.locationCapture = null;
      $("delivery-location-capture-status").textContent = error.code === 1 ? "Permita o acesso à localização do aparelho." : "Não foi possível obter o GPS. Tente novamente em local aberto.";
      $("delivery-location-capture").disabled = false;
      $("delivery-location-capture").textContent = "Tentar capturar GPS";
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  async function saveAddressLocation() {
    const stop = state.addressStop;
    if (!stop || !state.locationCapture || state.busy) return;
    const mode = $("delivery-location-mode").value;
    const label = $("delivery-location-label").value.trim();
    if (mode === "alternate" && !label) {
      $("delivery-location-error").textContent = "Dê um nome ao ponto alternativo.";
      return;
    }
    if (state.locationCapture.accuracy_m > 100 && !window.confirm("A precisão aproximada do GPS é " + Math.round(state.locationCapture.accuracy_m) + " m. Salvar mesmo assim?")) return;
    state.busy = true;
    $("delivery-location-save").disabled = true;
    $("delivery-location-error").textContent = "Salvando localização…";
    try {
      await api("admin_save_location", "POST", { stop_id: stop.id || stop.stop_id, ...state.locationCapture, mode, label });
      await load();
      state.addressStop = findStop(stop.id || stop.stop_id) || stop;
      state.locationCapture = null;
      $("delivery-location-error").textContent = "Localização salva.";
      $("delivery-location-capture-status").textContent = "Localização salva. O Google Maps usará este ponto.";
    } catch (error) {
      $("delivery-location-error").textContent = friendlyError(error.message);
      $("delivery-location-save").disabled = false;
    } finally { state.busy = false; }
  }

  async function useSavedLocation() {
    const stop = state.addressStop;
    const evidenceId = $("delivery-saved-location-select").value;
    if (!stop || !evidenceId || state.busy) return;
    state.busy = true;
    try {
      await api("admin_select_saved_location", "POST", { stop_id: stop.id || stop.stop_id, location_evidence_id: evidenceId });
      await load();
      state.addressStop = findStop(stop.id || stop.stop_id) || stop;
      $("delivery-location-error").textContent = "Ponto aplicado a este pedido.";
    } catch (error) {
      $("delivery-location-error").textContent = friendlyError(error.message);
    } finally { state.busy = false; }
  }

  async function saveAddressPhoto() {
    const stop = state.addressStop;
    const file = $("delivery-address-photo-input").files?.[0];
    if (!stop || !file || state.busy) return;
    state.busy = true;
    $("delivery-address-photo-save").disabled = true;
    $("delivery-address-photo-status").textContent = "Enviando foto…";
    try {
      await uploadAddressPhoto(stop.id || stop.stop_id, file);
      await load();
      $("delivery-address-photo-status").textContent = "Foto da fachada salva.";
      $("delivery-address-photo-input").value = "";
      $("delivery-address-photo-save").hidden = true;
      $("delivery-address-photo-preview").hidden = true;
      if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
      state.photoPreviewUrl = "";
    } catch (error) {
      $("delivery-address-photo-status").textContent = friendlyError(error.message);
      $("delivery-address-photo-save").disabled = false;
    } finally { state.busy = false; }
  }

  document.addEventListener("change", (event) => {
    if (event.target?.id === "delivery-location-mode") syncLocationMode();
    if (event.target?.id === "delivery-saved-location-select") $("delivery-saved-location-use").disabled = !event.target.value;
    if (event.target?.id === "delivery-address-photo-input") {
      const file = event.target.files?.[0];
      if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
      state.photoPreviewUrl = file ? URL.createObjectURL(file) : "";
      $("delivery-address-photo-preview").src = state.photoPreviewUrl;
      $("delivery-address-photo-preview").hidden = !file;
      $("delivery-address-photo-save").hidden = !file;
      $("delivery-address-photo-save").disabled = !file;
      $("delivery-address-photo-status").textContent = file ? "Confira a foto antes de salvar." : "";
    }
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.driverTab) {
      state.activeDriverId = button.dataset.driverTab;
      renderDriverTabs();
      renderRoutes();
      const counts = (state.data?.runs || []).filter((run) => (run.driver_id || run.driver?.id) === state.activeDriverId)
        .flatMap((run) => run.stops || []).filter((stop) => ["planned", "out_for_delivery"].includes(stop.status)).length;
      $("delivery-admin-status").textContent = counts
        ? counts + " entrega" + (counts === 1 ? "" : "s") + " pendente" + (counts === 1 ? "" : "s") + " para " + driversName(state.activeDriverId) + "."
        : "Nenhuma entrega pendente para " + driversName(state.activeDriverId) + ".";
    }
    if (button.dataset.editDriver) editDriver(button.dataset.editDriver);
    if (button.dataset.viewDeliveryOrder) window.DonaOrdersAdmin?.openOrder(button.dataset.viewDeliveryOrder);
    if (button.dataset.sortStop) await reorderStops(button.dataset.runId, button.dataset.stopId, button.dataset.sortStop);
    if (button.dataset.openAddress) openAddressDialog(button.dataset.openAddress);
    if (button.dataset.notifyNext) {
      if (button.dataset.mapHref) window.open(button.dataset.mapHref, "_blank", "noopener,noreferrer");
      const eta = button.closest(".delivery-eta-box")?.querySelector("[data-eta-stop]")?.value || "15";
      await runAction("admin_next_notice", { stop_id: button.dataset.notifyNext, eta_minutes: eta }, "Aviso enviado ao cliente.");
    }
    if (button.dataset.stopCancel) {
      if (window.confirm("Cancelar somente esta entrega e retirá-la da rota? O pedido continuará ativo na expedição para ser reprogramado ou colocado em outra rota.")) {
        await runAction("admin_cancel_stop", { stop_id: button.dataset.stopCancel, operator: "Admin" }, "Entrega retirada da rota. O pedido continua ativo em expedição.");
      }
    }
    if (button.dataset.stopReassign) {
      const card = button.closest("[data-delivery-order-card]");
      const select = card?.querySelector(`[data-route-target-driver="${CSS.escape(button.dataset.stopReassign)}"]`);
      if (!select?.value) {
        showMessage("Selecione o novo entregador.", true);
        select?.focus();
        return;
      }
      if (window.confirm("Passar este pedido para o entregador selecionado? A parada será incluída na rota planejada dele.")) {
        await runAction("admin_reassign_stop", { stop_id: button.dataset.stopReassign, driver_id: select.value, operator: "Admin" }, "Pedido transferido para a rota do novo entregador.");
      }
    }
    if (button.dataset.stopReschedule) {
      const card = button.closest("[data-delivery-order-card]");
      const dateInput = card?.querySelector(`[data-reschedule-date="${CSS.escape(button.dataset.stopReschedule)}"]`);
      const serviceDate = dateInput?.value || "";
      if (serviceDate && serviceDate === card?.dataset.deliveryRouteDate) {
        showMessage("Este pedido já está programado para esse dia.");
        return;
      }
      if (!isValidDeliveryRescheduleDate(serviceDate, state.data?.service_date)) {
        showMessage("Escolha uma data válida a partir de hoje. Não fazemos entregas aos domingos.", true);
        dateInput?.focus();
        return;
      }
      if (window.confirm(`Alterar a entrega para ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(serviceDate + "T12:00:00Z"))}? O pedido sairá da rota de hoje e ficará programado para essa data.`)) {
        const dateLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(serviceDate + "T12:00:00Z"));
        await runAction("admin_reschedule_stop", { stop_id: button.dataset.stopReschedule, service_date: serviceDate, operator: "Admin" }, `Entrega reagendada para ${dateLabel}. O pedido saiu da rota atual e será exibido no dia agendado.`);
      }
    }
    if (button.dataset.adminDelivered) {
      const card = button.closest("[data-delivery-order-card]");
      const selector = card?.querySelector(`[data-admin-delivery-payment="${CSS.escape(button.dataset.adminDelivered)}"]`);
      const prepaid = Boolean(card?.querySelector(".delivery-prepaid-badge"));
      if (!prepaid && !selector?.value) {
        showMessage("Selecione a forma de pagamento recebida.", true);
        selector?.focus();
        return;
      }
      if (window.confirm("Confirmar este pedido como entregue? O sistema registrará a conclusão da entrega e, quando aplicável, a forma de pagamento.")) {
        await runAction("admin_complete_stop", { stop_id: button.dataset.adminDelivered, method: selector?.value || null, operator: "Admin" }, "Pedido marcado como entregue.");
      }
    }
    if (button.dataset.adminFailed) {
      await runAction("admin_fail_stop", { stop_id: button.dataset.adminFailed, operator: "Admin" }, "Entrega registrada como não entregue.");
    }
    if (button.dataset.prepaidOrder) await markPrepaid(button.dataset.prepaidOrder, button.closest("[data-delivery-order-card]"));
    if (button.dataset.confirmLocation) {
      if (window.confirm("Salvar este localizador como posição confirmada do endereço do cliente? Isso atualizará o cadastro do cliente e o pedido.")) {
        await runAction("confirm_location", {
          order_id: button.dataset.confirmLocation,
          location_evidence_id: button.dataset.evidenceId,
        }, "Localizador confirmado e salvo no endereço do cliente.");
      }
    }
  });

  $("delivery-driver-form").addEventListener("submit", submitDriver);
  $("delivery-driver-cancel").addEventListener("click", resetDriverForm);
  $("delivery-location-capture").addEventListener("click", captureAddressLocation);
  $("delivery-location-save").addEventListener("click", saveAddressLocation);
  $("delivery-saved-location-use").addEventListener("click", useSavedLocation);
  $("delivery-address-photo-save").addEventListener("click", saveAddressPhoto);
  $("delivery-admin-refresh").addEventListener("click", load);

  function openForOrder(orderId) {
    state.focusOrderId = String(orderId || "");
    window.DonaAdminSetView?.("delivery");
    if (!window.DonaAdminSetView) load();
    window.setTimeout(() => {
      const focused = document.querySelector(`[data-delivery-order-card="${CSS.escape(state.focusOrderId)}"]`);
      focused?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 700);
  }

  window.DonaDeliveryAdmin = { load, openForOrder, getContext, assignOrder };
  window.setInterval(() => {
    const panel = document.querySelector('[data-panel="delivery"]');
    if (panel && !panel.hidden && !state.loading && !state.busy) load();
  }, 60000);
  if (!document.querySelector('[data-panel="delivery"]')?.hidden) load();
})();

