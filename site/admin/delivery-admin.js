import { addRouteSelection, buildMapsHref, latestLocationEvidence, partitionDeliveryOrders, prepaidPaymentMethod, routeSelectionAfterAction } from "./delivery-domain.mjs?v=3";

(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const base = String(config.supabaseUrl || "").replace(/\/$/, "");
  const key = config.publishableKey || "";
  const endpoint = base + "/functions/v1/delivery-ops-v1";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const state = { data: null, loading: false, selected: new Set(), busy: false, focusOrderId: "", accessLink: "" };

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

  function orderIdsInRuns() {
    return new Set((state.data?.runs || []).flatMap((run) => (run.stops || []).map((stop) => stop.order_id)));
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
      const candidate = evidence ? { address: order.delivery_address, destination_latitude: evidence.latitude, destination_longitude: evidence.longitude, destination_confidence: "confirmed" } : { delivery_address: order.delivery_address };
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
        ${prepaidControl}${evidenceMarkup}
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
    const mapStop = { ...stop, order, address: stop.address || order.delivery_address };
    const mapHref = buildMapsHref(mapStop) || (evidence ? buildMapsHref({ destination_latitude: evidence.latitude, destination_longitude: evidence.longitude, destination_confidence: "confirmed" }) : "");
    const delivered = stop.status === "delivered";
    const planned = run.status === "planned" && !run.loading_started_at && !run.loaded_at && stop.status === "planned";
    const phone = order.phone_e164 || stop.phone || "";
    const paid = order.delivery_paid_ahead === true;
    const contact = phone ? `<a class="delivery-card-action" href="${esc(phoneHref(phone))}" target="_blank" rel="noopener">WhatsApp</a>` : "";
    const map = mapHref ? `<a class="delivery-card-action" href="${esc(mapHref)}" target="_blank" rel="noopener">Abrir no Maps</a>` : "";
    const move = planned ? `<p class="delivery-mobile-sort-note">O entregador pode ordenar as paradas no celular antes de confirmar a carga.</p>` : "";
    const unpaidAction = paid
      ? `<span class="delivery-prepaid-badge">PAGO ADIANTADO · NÃO COBRAR</span>`
      : delivered
        ? `<span class="delivery-payment-recorded">Pagamento registrado na entrega</span>`
        : `<div class="delivery-prepaid-control"><select data-prepaid-method="${esc(order.id)}" aria-label="Forma de pagamento antecipado"><option value="" selected disabled>Selecione se já foi pago</option><option value="pix">Pix pago</option><option value="credit_card">Link/cartão pago</option></select><input type="text" data-prepaid-reference maxlength="120" placeholder="Referência opcional"><button type="button" class="button button-outline" data-prepaid-order="${esc(order.id)}">Marcar como pago</button></div>`;
    const location = evidence && order.delivery_customer_address_id
      ? `<div class="delivery-location-preview"><strong>Localizador recente ${evidence.direction === "outbound" ? "enviado pela loja" : "enviado pelo cliente"}</strong><span>${esc(formatDate(evidence.captured_at))}</span><button type="button" class="button button-outline" data-confirm-location="${esc(order.id)}" data-evidence-id="${esc(evidence.id)}">Salvar no cadastro do cliente</button></div>`
      : evidence ? `<div class="delivery-location-preview"><strong>Localizador recente ${evidence.direction === "outbound" ? "enviado pela loja" : "enviado pelo cliente"}</strong><span>${esc(formatDate(evidence.captured_at))} · ao confirmar, ele será salvo no cadastro do cliente.</span><button type="button" class="button button-outline" data-confirm-location="${esc(order.id)}" data-evidence-id="${esc(evidence.id)}">Salvar no cadastro do cliente</button></div>` : "";
    const items = Array.isArray(order.items) && order.items.length
      ? `<details class="delivery-items"><summary>${order.items.length} item${order.items.length === 1 ? "" : "s"} no pedido</summary><ul>${order.items.map((item) => `<li>${esc(item.quantity)} × ${esc(item.name)}</li>`).join("")}</ul></details>` : "";
    return `<article class="delivery-stop-card ${delivered ? "is-delivered" : ""}" data-delivery-order-card="${esc(order.id)}">
      <div class="delivery-stop-main"><span class="delivery-stop-sequence">${esc(stop.sequence)}.</span><div class="delivery-stop-copy"><strong>Pedido ${esc(orderNumber(order))} · ${esc(customerName(order))}</strong><span>${esc(addressText(order))}</span><span>${phone ? esc(phone) : "Telefone não informado"} · ${esc(money(order.total))}</span><span>Pagamento: ${esc(order.payment_display || stop.payment_method || "A confirmar")}</span>${items}${unpaidAction}${location}</div></div>
      <div class="delivery-stop-actions">${contact}${map}${delivered ? `<span class="delivery-delivered-label">ENTREGUE</span>` : `<span class="delivery-stop-status">${run.status === "dispatched" ? "Em rota" : "Aguardando saída"}</span>`}</div>
      ${move}
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
      const canDispatch = run.status === "planned" && loaded && stops.length > 0;
      const stateLabel = run.status === "dispatched" ? "Em rota" : run.status === "completed" ? "Concluída" : "Planejada";
      const loadControl = run.status === "planned" && !loaded
        ? `<button class="button button-outline" type="button" data-run-loading="${esc(run.id)}">Confirmar carga conferida</button>`
        : "";
      const dispatchControl = canDispatch
        ? `<button class="button button-primary" type="button" data-run-dispatch="${esc(run.id)}">Liberar saída do entregador</button>`
        : "";
      return `<section class="delivery-route-card"><header class="delivery-route-heading"><div><p class="eyebrow">Rota de ${esc(run.service_date || "hoje")}</p><h4>${esc(run.driver?.name || "Entregador não atribuído")}</h4><span>${esc(run.region?.name || "Região não definida")}${run.vehicle?.label ? " · " + esc(run.vehicle.label) : ""}</span></div><strong class="delivery-route-state ${run.status === "dispatched" ? "is-dispatched" : ""}">${stateLabel}</strong></header><div class="delivery-route-stops">${stops.map((stop) => renderRouteStop(run, stop)).join("")}</div><footer class="delivery-route-footer"><span>${stops.length} entrega${stops.length === 1 ? "" : "s"}${loaded ? " · carga conferida" : ""}</span>${loadControl}${dispatchControl}</footer></section>`;
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
      service_date_unavailable: "não foi possível confirmar a data local da rota. Atualize a tela e tente novamente.",
      vehicle_already_dispatched: "este entregador já saiu em uma rota hoje.",
      order_already_dispatched: "um pedido já está em uma rota que saiu.",
      delivery_loading_confirmation_required: "confirme o carregamento de todos os pedidos antes de liberar a saída.",
      run_not_ready_for_dispatch: "a rota ainda não está pronta para sair.",
      route_locked: "a rota já foi carregada ou saiu; não dá mais para mudar a ordem.",
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
      showMessage(success);
      await load();
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
    if (!window.confirm("Gerar um link individual para este entregador? O link dará acesso apenas às rotas dele e ficará válido por 30 dias.")) return;
    try {
      const result = await api("issue_driver_access", "POST", { driver_id: driverId });
      const link = new URL("/site/entregador/", window.location.origin);
      link.hash = "token=" + result.token;
      state.accessLink = link.toString();
      showMessage(`Acesso criado para ${result.driver_name}. Copie e entregue o link diretamente ao entregador. Ele não foi enviado automaticamente.`);
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
        await runAction("revoke_driver_access", { driver_id: button.dataset.revokeDriverAccess }, "Acesso revogado.");
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
