import { addRouteSelection, buildMapsHref, deliveryStopCapabilities, isValidDeliveryRescheduleDate, latestLocationEvidence, partitionDeliveryOrders, prepaidPaymentMethod, routeSelectionAfterAction } from "./delivery-domain.mjs?v=4";

(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const base = String(config.supabaseUrl || "").replace(/\/$/, "");
  const key = config.publishableKey || "";
  const endpoint = base + "/functions/v1/delivery-ops-v1";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const state = { data: null, loading: false, selected: new Set(), busy: false, focusOrderId: "", accessLink: "", lastAccessDriverId: "", accessLinks: {} };

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

  function orderIdsInRuns() {
    return new Set((state.data?.runs || []).flatMap((run) => (run.stops || [])
      .filter((stop) => stop.status !== "cancelled")
      .map((stop) => stop.order_id)));
  }

  function readyDeliveryQueue() {
    const ready = (state.data?.orders || []).filter((order) => order.status === "ready");
    return partitionDeliveryOrders(ready, state.data?.service_date);
  }

  function renderDriverOptions() {
    const catalog = state.data?.catalog || {};
    const drivers = Array.isArray(catalog.drivers) ? catalog.drivers : [];
    const regions = Array.isArray(catalog.regions) ? catalog.regions : [];
    const option = (row, label) => `<option value="${esc(row.id)}">${esc(label(row))}</option>`;
    $("delivery-driver-select").innerHTML = `<option value="">Selecione o entregador</option>` + drivers.filter((driver) => driver.is_active && driver.phone_e164).map((driver) => option(driver, (row) => row.name)).join("");
    const regionOptions = `<option value="">Usar região dos pedidos</option>` + regions.filter((region) => region.is_active).map((region) => option(region, (row) => [row.name, row.city].filter(Boolean).join(" · "))).join("");
    $("delivery-region-select").innerHTML = regionOptions;
    $("delivery-driver-region").innerHTML = `<option value="">Sem região definida</option>` + regions.filter((region) => region.is_active).map((region) => option(region, (row) => row.name)).join("");
  }

  function renderReadyOrders() {
    const assigned = orderIdsInRuns();
    const ready = readyDeliveryQueue().today.filter((order) => !assigned.has(order.id));
    $("delivery-ready-count").textContent = String(ready.length);
    const host = $("delivery-ready-orders");
    if (!ready.length) {
      host.innerHTML = `<div class="delivery-empty">Não há pedidos programados para hoje sem entregador atribuído.</div>`;
      updateSelectedCount();
      return;
    }
    host.innerHTML = ready.map((order) => {
      const evidence = evidenceFor(order);
      const addressReference = order.address_reference;
      const candidate = evidence
        ? { address: order.delivery_address, destination_latitude: evidence.latitude, destination_longitude: evidence.longitude, destination_confidence: "confirmed" }
        : addressReference?.address_has_primary_location
          ? { address: order.delivery_address, destination_latitude: addressReference.primary_latitude, destination_longitude: addressReference.primary_longitude, destination_confidence: "saved" }
          : { delivery_address: order.delivery_address };
      const maps = buildMapsHref(candidate);
      const phone = order.phone_e164 || "";
      const prepaid = order.delivery_paid_ahead === true;
      const prepaidControl = prepaid
        ? `<span class="delivery-prepaid-badge">PAGO ADIANTADO · NÃO COBRAR</span>`
        : `<div class="delivery-prepaid-control"><select data-prepaid-method="${esc(order.id)}" aria-label="Forma de pagamento antecipado"><option value="" selected disabled>Selecione se já foi pago</option><option value="pix">Pix pago</option><option value="credit_card">Link/cartão pago</option></select><input type="text" data-prepaid-reference maxlength="120" placeholder="Referência opcional"><button type="button" class="button button-outline" data-prepaid-order="${esc(order.id)}">Marcar como pago</button></div>`;
      const evidenceMarkup = evidence
        ? `<div class="delivery-location-preview"><strong>Localizador recente ${evidence.direction === "outbound" ? "enviado pela loja" : "enviado pelo cliente"}</strong><span>${esc(formatDate(evidence.captured_at))}${evidence.label ? " · " + esc(evidence.label) : ""}</span><button type="button" class="button button-outline" data-confirm-location="${esc(order.id)}" data-evidence-id="${esc(evidence.id)}">Salvar no cadastro do cliente</button></div>`
        : `<p class="delivery-no-location">Nenhum localizador válido encontrado nesta conversa ou no cadastro.</p>`;
      return `<article class="delivery-ready-card" data-delivery-order-card="${esc(order.id)}">
        <label class="delivery-ready-select"><input type="checkbox" data-select-delivery-order="${esc(order.id)}" ${state.selected.has(order.id) ? "checked" : ""}><span><strong>Pedido ${esc(orderNumber(order))}</strong><small>${esc(customerName(order))}</small></span><b>${esc(money(order.total))}</b></label>
        <div class="delivery-order-details"><span>${esc(addressText(order))}</span><span>${phone ? `<a href="${esc(phoneHref(phone))}" target="_blank" rel="noopener">WhatsApp ${esc(phone)}</a>` : "Telefone não informado"}</span><span>Pagamento: ${esc(order.payment_display || "A confirmar")}</span></div>
        ${maps ? `<a class="delivery-map-link" href="${esc(maps)}" target="_blank" rel="noopener">Abrir endereço no Google Maps</a>` : ""}
        ${prepaidControl}${evidenceMarkup}${addressReferenceMarkup(addressReference)}
      </article>`;
    }).join("");
    updateSelectedCount();
  }

  function formatDate(value) {
    const date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? "Data não informada" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function updateSelectedCount() {
    const count = state.selected.size;
    $("delivery-selected-count").textContent = count ? `${count} pedido${count === 1 ? "" : "s"} selecionado${count === 1 ? "" : "s"}` : "Nenhum pedido selecionado";
    $("delivery-plan-run").disabled = !count || !$("delivery-driver-select").value || state.busy;
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
        <div><strong>${esc(driver.name)}</strong><small>${esc(driver.phone_e164 || "WhatsApp não informado")}${region ? " · " + esc(region.name) : ""}</small><em>${driver.is_active ? "Ativo" : "Inativo"}</em>${driver.is_active && !driver.phone_e164 ? `<small class="delivery-driver-phone-warning">Informe o WhatsApp para receber entregas e avisar os clientes.</small>` : ""}</div>
        <div class="delivery-driver-actions"><button type="button" class="button button-outline" data-edit-driver="${esc(driver.id)}">Editar</button><button type="button" class="button button-outline" data-driver-access="${esc(driver.id)}" ${driver.is_active && driver.phone_e164 ? "" : "disabled"}>Gerar acesso</button><button type="button" class="button button-outline" data-revoke-driver-access="${esc(driver.id)}">Revogar acesso</button></div>
      </article>`;
    }).join("");
  }

  function latestEvidenceForStop(order) {
    return order ? evidenceFor(order) : null;
  }

  function renderRouteStop(run, stop) {
    const order = stop.order || {};
    const evidence = latestEvidenceForStop(order);
    const addressReference = stop.address_reference || order.address_reference;
    const hasRoutePoint = ["confirmed", "saved"].includes(String(stop.destination_confidence || "")) &&
      hasValidMapPoint(stop.destination_latitude, stop.destination_longitude);
    const mapStop = hasRoutePoint || !addressReference?.address_has_primary_location
      ? { ...stop, order, address: stop.address || order.delivery_address }
      : {
        ...stop,
        order,
        address: stop.address || order.delivery_address,
        destination_latitude: addressReference.primary_latitude,
        destination_longitude: addressReference.primary_longitude,
        destination_confidence: "saved",
      };
    const mapHref = buildMapsHref(mapStop) || (evidence ? buildMapsHref({ destination_latitude: evidence.latitude, destination_longitude: evidence.longitude, destination_confidence: "confirmed" }) : "");
    const capabilities = deliveryStopCapabilities(run, stop);
    const delivered = capabilities.isDelivered;
    const cancelled = capabilities.isCancelled;
    const stopId = stop.id || stop.stop_id;
    const phone = order.phone_e164 || stop.phone || "";
    const paid = order.delivery_paid_ahead === true;
    const contact = phone ? `<a class="delivery-card-action" href="${esc(phoneHref(phone))}" target="_blank" rel="noopener">WhatsApp</a>` : "";
    const map = mapHref ? `<a class="delivery-card-action" href="${esc(mapHref)}" target="_blank" rel="noopener">Abrir no Maps</a>` : "";
    const viewOrder = order.id ? `<button class="delivery-card-action" type="button" data-view-delivery-order="${esc(order.id)}">Ver pedido</button>` : "";
    const unpaidAction = capabilities.canMarkDelivered
      ? ""
      : paid
      ? `<span class="delivery-prepaid-badge">PAGO ADIANTADO · NÃO COBRAR</span>`
      : delivered
        ? `<span class="delivery-payment-recorded">Pagamento registrado na entrega</span>`
        : capabilities.isCancelled ? ""
            : `<div class="delivery-prepaid-control"><select data-prepaid-method="${esc(order.id)}" aria-label="Forma de pagamento antecipado"><option value="" selected disabled>Selecione se já foi pago</option><option value="pix">Pix pago</option><option value="credit_card">Link/cartão pago</option></select><input type="text" data-prepaid-reference maxlength="120" placeholder="Referência opcional"><button type="button" class="button button-outline" data-prepaid-order="${esc(order.id)}">Marcar como pago</button></div>`;
    const location = evidence && order.delivery_customer_address_id
      ? `<div class="delivery-location-preview"><strong>Localizador recente ${evidence.direction === "outbound" ? "enviado pela loja" : "enviado pelo cliente"}</strong><span>${esc(formatDate(evidence.captured_at))}</span><button type="button" class="button button-outline" data-confirm-location="${esc(order.id)}" data-evidence-id="${esc(evidence.id)}">Salvar no cadastro do cliente</button></div>`
      : evidence ? `<div class="delivery-location-preview"><strong>Localizador recente ${evidence.direction === "outbound" ? "enviado pela loja" : "enviado pelo cliente"}</strong><span>${esc(formatDate(evidence.captured_at))} · ao confirmar, ele será salvo no cadastro do cliente.</span><button type="button" class="button button-outline" data-confirm-location="${esc(order.id)}" data-evidence-id="${esc(evidence.id)}">Salvar no cadastro do cliente</button></div>` : "";
    const items = Array.isArray(order.items) && order.items.length
      ? `<details class="delivery-items"><summary>${order.items.length} item${order.items.length === 1 ? "" : "s"} no pedido</summary><ul>${order.items.map((item) => `<li>${esc(item.quantity)} × ${esc(item.name)}</li>`).join("")}</ul></details>` : "";
    const routeLockedDrivers = new Set((state.data?.runs || [])
      .filter((candidate) => candidate.status === "dispatched" ||
        (candidate.status === "planned" && (candidate.loading_started_at || candidate.loaded_at)))
      .map((candidate) => candidate.driver_id || candidate.driver?.id)
      .filter(Boolean));
    const activeDrivers = (state.data?.catalog?.drivers || []).filter((driver) =>
      driver.is_active && driver.phone_e164 && normalizePhone(driver.phone_e164) !== "invalid" && driver.id !== run.driver_id &&
      !routeLockedDrivers.has(driver.id));
    const stopManagement = capabilities.canCancel
      ? `<div class="delivery-stop-management">
          <label class="delivery-stop-field">Passar para outro entregador<select data-route-target-driver="${esc(stopId)}"><option value="">${activeDrivers.length ? "Selecione o entregador" : "Nenhum outro entregador ativo"}</option>${activeDrivers.map((driver) => `<option value="${esc(driver.id)}">${esc(driver.name)}</option>`).join("")}</select></label>
          <button class="button button-outline" type="button" data-stop-reassign="${esc(stopId)}" ${activeDrivers.length ? "" : "disabled"}>Passar pedido</button>
          <label class="delivery-stop-field">Novo dia da entrega<input type="date" data-reschedule-date="${esc(stopId)}" min="${esc(state.data?.service_date || "")}" value="${esc(run.service_date || state.data?.service_date || "")}"></label>
          <button class="button button-outline" type="button" data-stop-reschedule="${esc(stopId)}">Salvar novo dia</button>
          <button class="button button-danger" type="button" data-stop-cancel="${esc(stopId)}">Cancelar entrega</button>
        </div>`
      : capabilities.canMarkDelivered
        ? `<div class="delivery-stop-management delivery-stop-complete">
            ${paid ? `<span class="delivery-prepaid-badge">PAGO ADIANTADO · NÃO COBRAR</span>` : `<label class="delivery-stop-field">Recebido por<select data-admin-delivery-payment="${esc(stopId)}"><option value="">Selecione como recebeu</option><option value="cash">Dinheiro</option><option value="pix">Pix</option><option value="credit_card">Cartão/link</option><option value="food_card">Cartão alimentação</option><option value="meal_card">Cartão refeição</option><option value="other">Outro</option></select></label>`}
            <button class="button button-primary" type="button" data-admin-delivered="${esc(stopId)}">Marcar como entregue</button>
          </div>`
        : "";
    const status = delivered ? `<span class="delivery-delivered-label">ENTREGUE</span>`
      : cancelled ? `<span class="delivery-cancelled-label">ENTREGA CANCELADA · PEDIDO NA EXPEDIÇÃO</span>`
        : `<span class="delivery-stop-status">${run.status === "dispatched" ? "Em rota" : "Aguardando saída"}</span>`;
    return `<article class="delivery-stop-card ${delivered ? "is-delivered" : ""} ${cancelled ? "is-cancelled" : ""}" data-delivery-order-card="${esc(order.id)}" data-delivery-route-date="${esc(run.service_date || "")}">
      <div class="delivery-stop-main"><span class="delivery-stop-sequence">${esc(stop.sequence)}.</span><div class="delivery-stop-copy"><strong>Pedido ${esc(orderNumber(order))} · ${esc(customerName(order))}</strong><span class="delivery-stop-address">${esc(addressText(order))}</span><span>${phone ? esc(phone) : "Telefone não informado"} · ${esc(money(order.total))}</span><span>Pagamento: ${esc(order.payment_display || stop.payment_method || "A confirmar")}</span>${items}${unpaidAction}${location}${addressReferenceMarkup(addressReference)}${stopManagement}</div></div>
      <div class="delivery-stop-actions">${contact}${map}${viewOrder}${status}</div>
    </article>`;
  }

  function renderRoutes() {
    const routes = Array.isArray(state.data?.runs) ? state.data.runs : [];
    const host = $("delivery-routes-list");
    if (!routes.length) {
      host.innerHTML = `<div class="delivery-empty">Nenhuma rota foi criada para hoje.</div>`;
      return;
    }
    host.innerHTML = routes.map((run) => {
      const stops = Array.isArray(run.stops) ? [...run.stops].sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0)) : [];
      const loaded = Boolean(run.loaded_at);
      const activeStops = stops.filter((stop) => stop.status !== "cancelled");
      const cancelledCount = stops.length - activeStops.length;
      const canDispatch = run.status === "planned" && loaded && activeStops.some((stop) => stop.status === "planned");
      const stateLabel = run.status === "dispatched" ? "Em rota" : run.status === "completed" ? "Concluída" : "Planejada";
      const loadControl = run.status === "planned" && !loaded
        ? `<button class="button button-outline" type="button" data-run-loading="${esc(run.id)}">Confirmar carga conferida</button>`
        : "";
      const dispatchControl = canDispatch
        ? `<button class="button button-primary" type="button" data-run-dispatch="${esc(run.id)}">Liberar saída do entregador</button>`
        : "";
      const driverId = run.driver_id || run.driver?.id;
      const portalAccess = driverId
        ? `<div class="delivery-route-portal"><a class="button button-outline" href="../entregador/" target="_blank" rel="noopener">Abrir portal do entregador</a><button class="button button-outline" type="button" data-driver-access="${esc(driverId)}">Gerar link individual</button>${state.accessLinks[driverId] ? `<div class="delivery-route-access-link"><input type="url" readonly value="${esc(state.accessLinks[driverId])}" aria-label="Link individual do entregador"><button class="button button-outline" type="button" data-copy-route-access="${esc(driverId)}">Copiar acesso</button></div>` : `<small>O entregador usa o portal pelo link individual gerado aqui. A rota planejada aparece para ele antes da saída.</small>`}</div>`
        : "";
      return `<section class="delivery-route-card"><header class="delivery-route-heading"><div><p class="eyebrow">Rota de ${esc(run.service_date || "hoje")}</p><h4>${esc(run.driver?.name || "Entregador não atribuído")}</h4><span>${esc(run.region?.name || "Região não definida")}${run.vehicle?.label ? " · " + esc(run.vehicle.label) : ""}</span>${portalAccess}</div><strong class="delivery-route-state ${run.status === "dispatched" ? "is-dispatched" : ""}">${stateLabel}</strong></header><div class="delivery-route-stops">${stops.map((stop) => renderRouteStop(run, stop)).join("")}</div><footer class="delivery-route-footer"><span>${activeStops.length} entrega${activeStops.length === 1 ? "" : "s"}${cancelledCount ? ` · ${cancelledCount} cancelada${cancelledCount === 1 ? "" : "s"}` : ""}${loaded ? " · carga conferida" : ""}</span>${loadControl}${dispatchControl}</footer></section>`;
    }).join("");
  }

  function render() {
    renderDriverOptions();
    renderReadyOrders();
    renderDrivers();
    renderRoutes();
    const assigned = orderIdsInRuns();
    const queue = readyDeliveryQueue();
    const available = queue.today.filter((order) => !assigned.has(order.id)).length;
    const availableText = available
      ? `${available} pedido${available === 1 ? "" : "s"} de hoje disponíve${available === 1 ? "l" : "is"}`
      : "Nenhum pedido disponível para hoje";
    const outsideToday = [];
    if (queue.overdue.length) outsideToday.push(`${queue.overdue.length} atrasado${queue.overdue.length === 1 ? "" : "s"}`);
    if (queue.undated.length) outsideToday.push(`${queue.undated.length} sem data`);
    if (queue.future.length) outsideToday.push(`${queue.future.length} agendado${queue.future.length === 1 ? "" : "s"} para depois`);
    const outsideText = outsideToday.length ? ` Fora da rota de hoje: ${outsideToday.join(", ")}.` : "";
    const runs = state.data?.runs || [];
    $("delivery-admin-status").textContent = `${availableText} · ${runs.length} rota${runs.length === 1 ? "" : "s"} hoje.${outsideText}`;
  }

  async function load() {
    if (state.loading || !$("delivery-admin-status")) return;
    state.loading = true;
    $("delivery-admin-status").textContent = "Carregando pedidos, rotas e entregadores…";
    try {
      state.data = await api("admin_dashboard");
      const assigned = orderIdsInRuns();
      state.selected = new Set([...state.selected].filter((id) =>
        !assigned.has(id) && (state.data.orders || []).some((order) => order.id === id && order.status === "ready")));
      render();
      showMessage("");
      if (state.focusOrderId) {
        const focused = document.querySelector(`[data-delivery-order-card="${CSS.escape(state.focusOrderId)}"]`);
        focused?.scrollIntoView({ behavior: "smooth", block: "center" });
        focused?.classList.add("is-focus");
        window.setTimeout(() => focused?.classList.remove("is-focus"), 1800);
        state.focusOrderId = "";
      }
    } catch (error) {
      $("delivery-admin-status").textContent = "Não foi possível carregar entregas: " + friendlyError(error.message);
      state.data = null;
      $("delivery-ready-orders").innerHTML = "";
      $("delivery-driver-list").innerHTML = "";
      $("delivery-routes-list").innerHTML = "";
    } finally {
      state.loading = false;
      updateSelectedCount();
    }
  }

  function friendlyError(code) {
    const map = {
      admin_code_invalid: "a sessão do admin expirou; acesse novamente.",
      driver_name_required: "informe o nome do entregador.",
      driver_phone_required: "informe o WhatsApp do entregador ativo para enviar a previsão ao cliente.",
      driver_phone_invalid: "confira o WhatsApp do entregador com DDD.",
      driver_not_active: "ative o entregador antes de gerar acesso.",
      driver_and_orders_required: "selecione um entregador e pelo menos um pedido.",
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
      route_locked: "a rota já foi carregada ou saiu; retire o pedido ou ajuste a data antes da conferência da carga.",
      invalid_delivery_date: "escolha uma data válida, a partir de hoje e diferente de domingo.",
      delivery_date_in_past: "a nova data não pode ser anterior a hoje.",
      delivery_not_available_sunday: "não é possível agendar entrega aos domingos.",
      driver_same_as_current: "selecione um entregador diferente do atual.",
      driver_already_dispatched: "o outro entregador já saiu em uma rota hoje.",
      target_driver_route_locked: "o outro entregador já conferiu ou carregou a rota dele.",
      payment_method_required: "selecione a forma de pagamento recebida antes de marcar como entregue.",
      service_date_unavailable: "não foi possível confirmar a data local da rota. Atualize a tela e tente novamente.",
      vehicle_already_dispatched: "este entregador já saiu em uma rota hoje.",
      order_already_dispatched: "um pedido já está em uma rota que saiu.",
      delivery_loading_confirmation_required: "confirme o carregamento de todos os pedidos antes de liberar a saída.",
      run_not_ready_for_dispatch: "a rota ainda não está pronta para sair.",
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
      updateSelectedCount();
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
    if ($("delivery-driver-active").checked && !phone) return showMessage("Informe o WhatsApp do entregador ativo para avisar os clientes sobre a próxima entrega.", true);
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

  async function createRoute() {
    const driverId = $("delivery-driver-select").value;
    if (!driverId || !state.selected.size) return;
    if (!window.confirm(`Montar rota com ${state.selected.size} pedido(s)? O entregador poderá reordená-la pelo celular antes da saída.`)) return;
    const payload = {
      driver_id: driverId,
      region_id: $("delivery-region-select").value || null,
      order_ids: [...state.selected],
      operator: "Admin",
    };
    const succeeded = await runAction("plan_run", payload, "Rota montada. Agora confira a sequência e os pedidos atribuídos.");
    state.selected = routeSelectionAfterAction(state.selected, succeeded);
    if (succeeded) renderReadyOrders();
    updateSelectedCount();
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

  async function issueDriverAccess(driverId) {
    if (!window.confirm("Gerar um link individual para este entregador? Se já existir outro, ele será invalidado. O novo link dá acesso apenas às rotas dele e vale por 30 dias.")) return;
    try {
      const result = await api("issue_driver_access", "POST", { driver_id: driverId });
      const link = new URL("/site/entregador/", window.location.origin);
      link.hash = "token=" + result.token;
      state.accessLink = link.toString();
      state.lastAccessDriverId = driverId;
      state.accessLinks[driverId] = state.accessLink;
      showMessage(`Acesso criado para ${result.driver_name}. Copie e entregue o link diretamente ao entregador. Ele não foi enviado automaticamente.`);
      renderRoutes();
      const output = $("delivery-driver-access-link");
      output.value = state.accessLink;
      output.hidden = false;
      $("delivery-driver-copy-access").hidden = false;
      $("delivery-driver-copy-access").focus();
    } catch (error) {
      showMessage(friendlyError(error.message), true);
    }
  }

  document.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-select-delivery-order]");
    if (checkbox) {
      const id = checkbox.dataset.selectDeliveryOrder;
      if (checkbox.checked) {
        try { state.selected = addRouteSelection(state.selected, id); }
        catch (error) {
          checkbox.checked = false;
          showMessage(error.message === "route_too_many_orders" ? "Uma rota pode ter no máximo 30 pedidos. Monte outra rota para o restante." : friendlyError(error.message), true);
        }
      } else state.selected.delete(id);
      updateSelectedCount();
    }
    if (event.target?.id === "delivery-driver-select") updateSelectedCount();
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.editDriver) editDriver(button.dataset.editDriver);
    if (button.dataset.driverAccess) await issueDriverAccess(button.dataset.driverAccess);
    if (button.dataset.revokeDriverAccess) {
      if (window.confirm("Revogar o acesso atual deste entregador? O link deixará de funcionar imediatamente.")) {
        const driverId = button.dataset.revokeDriverAccess;
        const revoked = await runAction("revoke_driver_access", { driver_id: driverId }, "Acesso revogado.");
        if (revoked) {
          delete state.accessLinks[driverId];
          if (state.lastAccessDriverId === driverId) {
            state.accessLink = "";
            state.lastAccessDriverId = "";
            $("delivery-driver-access-link").value = "";
            $("delivery-driver-access-link").hidden = true;
            $("delivery-driver-copy-access").hidden = true;
          }
          renderRoutes();
        }
      }
    }
    if (button.dataset.viewDeliveryOrder) window.DonaOrdersAdmin?.openOrder(button.dataset.viewDeliveryOrder);
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
    if (button.dataset.copyRouteAccess) {
      const link = state.accessLinks[button.dataset.copyRouteAccess] || "";
      if (!link) return showMessage("Gere um novo link individual para este entregador.", true);
      try { await navigator.clipboard.writeText(link); showMessage("Link individual copiado. Envie-o diretamente ao entregador."); }
      catch (_) {
        const input = button.closest(".delivery-route-access-link")?.querySelector("input");
        input?.select();
        showMessage("Selecione e copie o link individual manualmente.");
      }
    }
    if (button.dataset.prepaidOrder) await markPrepaid(button.dataset.prepaidOrder, button.closest("[data-delivery-order-card]"));
    if (button.dataset.confirmLocation) {
      if (window.confirm("Salvar este localizador como posição confirmada do endereço do cliente? Isso atualizará o cadastro do cliente e o pedido.")) {
        await runAction("confirm_location", {
          order_id: button.dataset.confirmLocation,
          location_evidence_id: button.dataset.evidenceId,
          region_id: $("delivery-region-select").value || null,
        }, "Localizador confirmado e salvo no endereço do cliente.");
      }
    }
    if (button.dataset.runLoading) {
      if (window.confirm("Confirma que todos os pedidos desta rota foram conferidos e carregados no veículo?")) {
        await runAction("confirm_loading", { run_id: button.dataset.runLoading }, "Carga conferida. A saída já pode ser liberada.");
      }
    }
    if (button.dataset.runDispatch) {
      if (window.confirm("Liberar a saída desta rota? Os pedidos entrarão em entrega e poderão receber avisos ao cliente.")) {
        await runAction("dispatch_run", { run_id: button.dataset.runDispatch, operator: "Admin" }, "Rota liberada para entrega.");
      }
    }
  });

  $("delivery-driver-form").addEventListener("submit", submitDriver);
  $("delivery-driver-cancel").addEventListener("click", resetDriverForm);
  $("delivery-plan-run").addEventListener("click", createRoute);
  $("delivery-admin-refresh").addEventListener("click", load);
  $("delivery-driver-copy-access").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(state.accessLink); showMessage("Link copiado. Envie-o diretamente ao entregador."); }
    catch (_) { $("delivery-driver-access-link").select(); showMessage("Selecione e copie o link manualmente."); }
  });

  function openForOrder(orderId) {
    state.focusOrderId = String(orderId || "");
    window.DonaAdminSetView?.("delivery");
    if (!window.DonaAdminSetView) load();
    window.setTimeout(() => {
      const focused = document.querySelector(`[data-delivery-order-card="${CSS.escape(state.focusOrderId)}"]`);
      focused?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 700);
  }

  window.DonaDeliveryAdmin = { load, openForOrder };
  window.setInterval(() => {
    const panel = document.querySelector('[data-panel="delivery"]');
    if (panel && !panel.hidden && !state.loading && !state.busy) load();
  }, 60000);
})();
