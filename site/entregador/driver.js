import { buildMapsHref, deliveryNoticeFailureMessage, movePlannedStop, paidAheadLabel } from "../admin/delivery-domain.mjs?v=2";

(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const base = String(config.supabaseUrl || "").replace(/\/$/, "");
  const key = config.publishableKey || "";
  const endpoint = base + "/functions/v1/delivery-ops-v1";
  const TOKEN_KEY = "dona-antonia-delivery-driver-token";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const state = {
    token: "", driver: null, runs: [], busy: false, currentStop: null,
    addressStop: null, locationCapture: null, selectedPhoto: null, photoPreviewUrl: "",
    toastTimer: 0, notifiedStops: new Set(),
  };

  function tokenFromHash() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(hash);
    return params.get("token") || ( /^[A-Za-z0-9_-]{40,60}$/.test(hash) ? hash : "" );
  }

  function setAccessState(title, message, retry = false) {
    $("driver-access").hidden = false;
    $("driver-main").hidden = true;
    $("driver-access-title").textContent = title;
    $("driver-access-message").textContent = message;
    $("driver-retry").hidden = !retry;
    $("driver-logout").hidden = !state.token;
  }

  function toast(message, error = false) {
    const node = $("driver-toast");
    node.textContent = message || "";
    node.classList.toggle("is-error", error);
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => { node.textContent = ""; node.classList.remove("is-error"); }, 6200);
  }

  function apiUrl(action) {
    const url = new URL(endpoint);
    url.searchParams.set("action", action);
    return url.toString();
  }

  async function request(action, method = "GET", payload = {}) {
    const headers = { apikey: key, authorization: "Bearer " + state.token };
    const init = { method, headers, cache: "no-store" };
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(payload);
    }
    const response = await fetch(apiUrl(action), init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || "delivery_request_failed");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function requestPhoto(stopId, photo) {
    const body = new FormData();
    body.append("stop_id", stopId);
    body.append("photo", photo, "fachada.jpg");
    const response = await fetch(apiUrl("driver_upload_address_photo"), {
      method: "POST",
      headers: { apikey: key, authorization: "Bearer " + state.token },
      body,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || "delivery_request_failed");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function friendlyError(code) {
    const map = {
      driver_access_invalid: "Este link não é válido. Peça um novo acesso à loja.",
      driver_access_revoked: "Este acesso foi revogado. Peça um novo link à loja.",
      driver_run_not_found: "Esta rota não está mais disponível.",
      driver_stop_not_found: "Esta entrega não pertence à sua rota.",
      stop_is_not_next: "Conclua primeiro a entrega que aparece como próxima.",
      stop_not_out_for_delivery: "Essa entrega ainda não foi iniciada.",
      invalid_location_coordinates: "Não foi possível ler uma coordenada GPS válida. Tente capturar novamente.",
      invalid_location_accuracy: "Não foi possível ler a precisão do GPS. Tente capturar novamente.",
      invalid_location_mode: "Escolha como salvar esse ponto.",
      alternate_location_label_required: "Informe um nome curto para o ponto alternativo.",
      primary_location_required: "Salve primeiro o ponto principal do endereço.",
      saved_location_not_available: "Esse ponto alternativo não pertence a este endereço.",
      invalid_saved_location: "Selecione um ponto alternativo válido.",
      save_location_before_photo: "Salve a localização do endereço antes da foto.",
      customer_address_required: "Salve a localização do endereço antes da foto.",
      address_photo_required: "Escolha ou tire uma foto da fachada.",
      address_photo_type_invalid: "Escolha uma foto JPG, PNG ou WebP.",
      address_photo_empty: "A foto está vazia. Tire outra foto.",
      address_photo_too_large: "A foto ficou grande demais. Tente tirar outra com menor resolução.",
      address_photo_upload_failed: "Não foi possível enviar a foto. Verifique a conexão e tente novamente.",
      address_photo_save_failed: "A foto foi enviada, mas não foi vinculada ao endereço. Tente novamente.",
      address_photo_compression_failed: "Não foi possível preparar a foto. Tente tirar outra imagem.",
      address_photo_decode_failed: "O celular não conseguiu abrir essa imagem. Tente tirar outra foto diretamente pela câmera.",
      customer_address_mismatch: "O endereço não corresponde a este pedido. Peça ajuda à loja.",
      route_locked: "A ordem não pode mais ser alterada depois da conferência da carga.",
      payment_method_required: "Selecione a forma de pagamento recebida.",
      next_stop_template_disabled: "O aviso automático está pausado. Avise o cliente pelo WhatsApp antes de sair.",
      next_stop_template_not_approved: "O modelo do aviso ainda não foi aprovado pela Meta. Avise o cliente manualmente pelo WhatsApp.",
      meta_transport_not_configured: "O aviso automático ainda não está configurado. Avise o cliente manualmente pelo WhatsApp.",
      whatsapp_account_missing: "O WhatsApp vinculado a este pedido não foi identificado. Avise o cliente manualmente pelo WhatsApp.",
      whatsapp_account_inactive: "O WhatsApp vinculado a este pedido está inativo. Avise o cliente manualmente pelo WhatsApp.",
      whatsapp_account_channel_unknown: "Não foi possível identificar o número de WhatsApp usado neste pedido. Avise o cliente manualmente.",
      customer_phone_missing: "O pedido não tem um WhatsApp válido para receber o aviso.",
      meta_send_uncertain: "O WhatsApp não confirmou se o aviso chegou. Confira a conversa antes de tentar novamente.",
      meta_accepted_status_uncertain: "O WhatsApp pode ter aceitado o aviso, mas o sistema não confirmou o registro. Confira a conversa antes de tentar novamente.",
      notification_not_retryable: "O envio ainda está sendo confirmado. Confira a conversa antes de repetir.",
      notification_requires_explicit_retry: "O aviso anterior falhou. Confira a conversa e tente de novo.",
      notification_retry_limit: "O limite de tentativas foi atingido. Confira a conversa e peça ajuda à loja.",
    };
    return map[code] || String(code || "erro desconhecido").replaceAll("_", " ");
  }

  function orderName(order, stop) {
    const customer = order?.customer_snapshot || {};
    const address = order?.delivery_address || stop?.address || {};
    return customer.display_name || customer.name || customer.full_name || address.customer_name || address.recipient_name || stop?.customer_name || "Cliente";
  }

  function orderNumber(order, stop) {
    return order?.public_code || order?.order_number || stop?.order_number || String(order?.id || stop?.order_id || "").slice(0, 8).toUpperCase();
  }

  function stopAddress(stop) {
    const order = stop?.order || {};
    const address = order.delivery_address || stop.address || {};
    const line1 = [address.street || address.address_line, address.number].filter(Boolean).join(", ");
    const line2 = [address.complement, address.neighborhood || address.district].filter(Boolean).join(" · ");
    const line3 = [address.city, address.state].filter(Boolean).join(" - ");
    const reference = address.reference ? "Referência: " + address.reference : "";
    return [line1, line2, line3, reference].filter(Boolean).join(" · ") || address.raw_text || address.formatted_address || "Endereço não informado";
  }

  function stopPhone(stop) {
    return stop?.order?.phone_e164 || stop?.phone || stop?.order?.phone || "";
  }

  function whatsappHref(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return "";
    return "https://wa.me/" + (digits.startsWith("55") ? digits : "55" + digits);
  }

  function mapsHref(stop) {
    const order = stop?.order || {};
    return buildMapsHref({ ...stop, address: order.delivery_address || stop.address });
  }

  function shortDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || !Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function paymentName(order) {
    if (order.delivery_paid_ahead === true) return order.delivery_paid_ahead_method === "pix" ? "Pix pago antecipadamente" : "Link de pagamento já pago";
    return order.payment_display || ({ pix: "Pix na entrega", cash: "Dinheiro na entrega", credit_card: "Cartão ou link na entrega", food_card: "Cartão alimentação", meal_card: "Cartão refeição", other: "Outra forma" })[order.payment_method] || "Forma a confirmar";
  }

  function statusName(run) {
    return run.status === "dispatched" ? "Em rota" : run.status === "completed" ? "Concluída" : "Preparando saída";
  }

  function orderItems(order) {
    const items = Array.isArray(order?.items) ? order.items : [];
    if (!items.length) return "";
    return `<details class="driver-items"><summary>Ver ${items.length} item${items.length === 1 ? "" : "s"} do pedido</summary><ul>${items.map((item) => `<li>${esc(item.quantity)} × ${esc(item.name)}${item.line_total != null ? " · " + esc(money(item.line_total)) : ""}</li>`).join("")}</ul></details>`;
  }

  function orderedStops(run) {
    return [...(Array.isArray(run.stops) ? run.stops : [])].sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
  }

  function nextStop(run) {
    return orderedStops(run).find((stop) => stop.status === "out_for_delivery") || null;
  }

  function renderStop(run, stop, index) {
    const order = stop.order || {};
    const delivered = stop.status === "delivered";
    const isNext = run.status === "dispatched" && nextStop(run)?.id === stop.id;
    const canSort = run.status === "planned" && !run.loading_started_at && !run.loaded_at && stop.status === "planned";
    const sequence = index + 1;
    const phone = stopPhone(stop);
    const wa = whatsappHref(phone);
    const map = mapsHref(stop);
    const prepaid = order.delivery_paid_ahead === true;
    const status = isNext ? `<span class="driver-next-label">PRÓXIMA ENTREGA</span>` : "";
    const payment = prepaid
      ? `<div class="driver-prepaid">${esc(paidAheadLabel(order))}</div>`
      : `<div class="driver-payment"><span>Receber na entrega</span><strong>${esc(paymentName(order))}</strong></div>`;
    const locationSummary = stop.destination_confidence === "confirmed"
      ? `<p class="driver-location-status"><strong>Localizador confirmado</strong>${stop.destination_label ? ` · ${esc(stop.destination_label)}` : ""}${stop.destination_captured_at ? ` · ${esc(shortDate(stop.destination_captured_at))}` : ""}</p>`
      : `<p class="driver-location-status">${stop.destination_latitude != null && stop.destination_longitude != null ? "Ponto do mapa disponível" : "Mapa usará o endereço do pedido"}</p>`;
    const addressPhoto = stop.address_photo?.url
      ? `<figure class="driver-address-photo"><img src="${esc(stop.address_photo.url)}" alt="Foto de referência da fachada" loading="lazy"><figcaption>Foto da fachada${stop.address_photo.captured_at ? ` · ${esc(shortDate(stop.address_photo.captured_at))}` : ""}</figcaption></figure>`
      : "";
    const addressAction = isNext
      ? `<button class="driver-address-action" type="button" data-open-address="${esc(stop.id)}">Confirmar local e foto</button>`
      : "";
    const actions = delivered
      ? `<span class="driver-delivered-stamp">ENTREGUE</span>`
      : `<div class="driver-stop-actions">${wa ? `<a class="driver-action" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp do cliente</a>` : ""}${map ? `<a class="driver-action driver-action-map" href="${esc(map)}" target="_blank" rel="noopener">Abrir no Google Maps</a>` : ""}</div>`;
    const sortActions = canSort
      ? `<div class="driver-sort-actions"><button type="button" aria-label="Mover entrega para cima" data-sort-stop="-1" data-run-id="${esc(run.id)}" data-stop-id="${esc(stop.id)}" ${index === 0 ? "disabled" : ""}>↑ <span>Subir</span></button><button type="button" aria-label="Mover entrega para baixo" data-sort-stop="1" data-run-id="${esc(run.id)}" data-stop-id="${esc(stop.id)}" ${index === orderedStops(run).length - 1 ? "disabled" : ""}>↓ <span>Descer</span></button></div><p class="driver-sort-note">Organize a sequência antes da conferência e do início da rota.</p>`
      : "";
    const notice = isNext
      ? `<div class="driver-eta-box"><label>Previsão para chegar<select data-eta-stop="${esc(stop.id)}"><option value="10">Em até 10 minutos</option><option value="15" selected>Em até 15 minutos</option><option value="20">Em até 20 minutos</option><option value="30">Em até 30 minutos</option><option value="40">Em até 40 minutos</option><option value="60">Em até 60 minutos</option></select></label><button class="driver-action-notify" type="button" data-notify-next="${esc(stop.id)}">Avisar cliente e abrir rota</button></div>`
      : "";
    const complete = isNext
      ? `<button class="driver-mark-delivered" type="button" data-open-deliver="${esc(stop.id)}">Marcar como entregue</button>`
      : "";
    const savedNotice = state.notifiedStops.has(stop.id) ? `<p class="driver-notice-success">Aviso enviado ao cliente.</p>` : "";
    return `<article class="driver-stop ${delivered ? "is-delivered" : ""} ${isNext ? "is-next" : ""}" data-driver-stop="${esc(stop.id)}">
      <div class="driver-stop-top"><span class="driver-stop-number">${sequence}</span><div class="driver-stop-copy">${status}<span class="driver-stop-code">PEDIDO ${esc(orderNumber(order, stop))}</span><h3>${esc(orderName(order, stop))}</h3><span>${esc(stopAddress(stop))}</span><span>${phone ? esc(phone) : "WhatsApp não informado"}</span><span><strong>Total: ${esc(money(order.total ?? (Number(stop.total_cents || 0) / 100)))}</strong></span>${payment}</div></div>
      ${locationSummary}${addressPhoto}${canSort ? sortActions : ""}${actions}${addressAction}${savedNotice}${notice}${complete}${orderItems(order)}
    </article>`;
  }

  function renderRun(run) {
    const stops = orderedStops(run);
    const pending = stops.filter((stop) => stop.status === "out_for_delivery" || stop.status === "planned").length;
    return `<section class="driver-route"><header class="driver-route-head"><div><h2>${run.region?.name ? esc(run.region.name) + " · " : ""}${stops.length} entrega${stops.length === 1 ? "" : "s"}</h2><p>${esc(run.service_date || "Rota de hoje")} · ${pending} pendente${pending === 1 ? "" : "s"}</p></div><span class="driver-route-badge ${run.status === "dispatched" ? "is-running" : ""}">${statusName(run)}</span></header><div class="driver-stops">${stops.map((stop, index) => renderStop(run, stop, index)).join("")}</div></section>`;
  }

  function render() {
    $("driver-name").textContent = state.driver?.name || "Entregador";
    $("driver-routes").innerHTML = state.runs.length
      ? state.runs.map(renderRun).join("")
      : `<div class="driver-empty"><strong>Nenhuma rota atribuída agora</strong><span>Quando a loja montar uma rota para você, ela aparecerá aqui.</span></div>`;
    const stopsCount = state.runs.reduce((sum, run) => sum + (run.stops || []).filter((stop) => stop.status !== "delivered").length, 0);
    $("driver-status").textContent = `Atualizado às ${new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date())} · ${stopsCount} entrega${stopsCount === 1 ? "" : "s"} pendente${stopsCount === 1 ? "" : "s"}.`;
  }

  async function load() {
    if (!state.token || state.busy) return;
    state.busy = true;
    $("driver-status").textContent = "Atualizando a rota…";
    try {
      const data = await request("driver_session");
      state.driver = data.driver || null;
      state.runs = Array.isArray(data.runs) ? data.runs : [];
      $("driver-access").hidden = true;
      $("driver-main").hidden = false;
      $("driver-logout").hidden = false;
      render();
    } catch (error) {
      if (["driver_access_invalid", "driver_access_revoked"].includes(error.message)) {
        try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
        state.token = "";
      }
      setAccessState("Não foi possível abrir as entregas", friendlyError(error.message), Boolean(state.token));
    } finally {
      state.busy = false;
    }
  }

  async function sortStop(runId, stopId, direction) {
    if (state.busy) return;
    const run = state.runs.find((item) => item.id === runId);
    if (!run) return;
    let stops;
    try {
      stops = movePlannedStop(run.stops, stopId, Number(direction), { runStatus: run.status, loadingStarted: Boolean(run.loading_started_at || run.loaded_at) });
    } catch (error) {
      toast(friendlyError(error.message), true);
      return;
    }
    state.busy = true;
    try {
      await request("driver_reorder", "POST", { run_id: runId, stop_ids: stops.map((stop) => stop.id || stop.stop_id) });
      await loadAfterBusy();
      toast("Ordem da rota salva.");
    } catch (error) {
      toast(friendlyError(error.message), true);
    } finally {
      state.busy = false;
    }
  }

  async function loadAfterBusy() {
    const data = await request("driver_session");
    state.driver = data.driver || state.driver;
    state.runs = Array.isArray(data.runs) ? data.runs : [];
    render();
  }

  async function notifyNext(stopId, button) {
    if (state.busy) return;
    const card = document.querySelector(`[data-driver-stop="${CSS.escape(stopId)}"]`);
    const run = state.runs.find((item) => (item.stops || []).some((stop) => stop.id === stopId));
    const stop = run ? nextStop(run) : null;
    if (!stop) return;
    const eta = Number(card?.querySelector(`[data-eta-stop="${CSS.escape(stopId)}"]`)?.value || 15);
    const map = mapsHref(stop);
    if (map) window.open(map, "_blank", "noopener,noreferrer");
    button.disabled = true;
    button.textContent = "Enviando aviso…";
    state.busy = true;
    try {
      let result;
      try {
        result = await request("driver_next_notice", "POST", { stop_id: stopId, eta_minutes: eta });
      } catch (error) {
        if (error.message !== "notification_requires_explicit_retry" || !window.confirm("O envio anterior falhou. Quer tentar enviar novamente? Confira a conversa antes para evitar duplicar o aviso.")) throw error;
        result = await request("driver_next_notice", "POST", { stop_id: stopId, eta_minutes: eta, retry: true });
      }
      state.notifiedStops.add(stopId);
      toast(result.duplicate ? "Este cliente já havia sido avisado. Rota aberta no Maps." : `Aviso aceito pelo WhatsApp. Previsão informada: ${eta} minutos.`);
      render();
    } catch (error) {
      const acceptedButUnconfirmed = error.message === "meta_accepted_status_uncertain";
      toast(deliveryNoticeFailureMessage(error.message, friendlyError(error.message), Boolean(map)), true);
      button.disabled = acceptedButUnconfirmed;
      button.textContent = acceptedButUnconfirmed ? "Confira o envio no WhatsApp" : "Tentar avisar novamente";
    } finally {
      state.busy = false;
    }
  }

  function findStop(stopId) {
    for (const run of state.runs) {
      const found = (run.stops || []).find((stop) => stop.id === stopId);
      if (found) return found;
    }
    return null;
  }

  function openAddressDialog(stopId) {
    const run = state.runs.find((item) => (item.stops || []).some((stop) => stop.id === stopId));
    const stop = run ? nextStop(run) : null;
    if (!stop || stop.id !== stopId) return toast("Confirme o endereço da entrega que aparece como próxima.", true);
    state.addressStop = stop;
    state.locationCapture = null;
    state.selectedPhoto = null;
    if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
    state.photoPreviewUrl = "";
    $("driver-address-title").textContent = "Pedido " + orderNumber(stop.order || {}, stop);
    $("driver-location-mode").value = "primary";
    $("driver-location-label").value = "";
    $("driver-location-label-field").hidden = true;
    $("driver-location-capture-status").textContent = "Toque para capturar o GPS enquanto estiver em frente ao endereço.";
    $("driver-location-error").textContent = "";
    $("driver-location-save").disabled = true;
    $("driver-location-save").textContent = "Salvar localização principal";
    $("driver-address-photo-input").value = "";
    $("driver-address-photo-status").textContent = "Foto opcional. Enquadrar somente a fachada ajuda nas próximas entregas.";
    $("driver-address-photo-save").hidden = true;
    $("driver-address-photo-save").disabled = true;
    $("driver-address-photo-preview").hidden = true;
    $("driver-address-photo-preview").removeAttribute("src");
    $("driver-address-dialog").dataset.stopId = stop.id;
    syncAddressDialog();
    $("driver-address-dialog").showModal();
  }

  function syncAddressDialog() {
    const stop = state.addressStop;
    if (!stop) return;
    const hasCoordinates = stop.destination_latitude != null && stop.destination_longitude != null;
    const label = stop.destination_label ? " · " + stop.destination_label : "";
    $("driver-address-current").textContent = hasCoordinates
      ? `${stop.destination_confidence === "confirmed" ? "Ponto atual confirmado" : "Ponto atual do pedido"}${label}${stop.destination_captured_at ? " · " + shortDate(stop.destination_captured_at) : ""}`
      : "Ainda não há coordenadas salvas para este endereço.";
    const mode = $("driver-location-mode");
    const alternateOption = mode.querySelector('option[value="alternate"]');
    alternateOption.disabled = !stop.address_has_primary_location;
    if (mode.value === "alternate" && alternateOption.disabled) mode.value = "primary";
    $("driver-location-label-field").hidden = mode.value !== "alternate";
    $("driver-location-save").textContent = mode.value === "alternate" ? "Salvar ponto alternativo" : "Salvar localização principal";

    const saved = Array.isArray(stop.saved_locations) ? stop.saved_locations : [];
    const savedSection = $("driver-saved-location-section");
    const savedSelect = $("driver-saved-location-select");
    savedSection.hidden = saved.length === 0;
    savedSelect.innerHTML = `<option value="">Selecione um ponto salvo</option>${saved.map((item) => `<option value="${esc(item.id)}">${esc(item.label)}${item.captured_at ? " · " + esc(shortDate(item.captured_at)) : ""}</option>`).join("")}`;
    $("driver-saved-location-use").disabled = true;

    const hasAddress = Boolean(stop.customer_address_id || stop.order?.delivery_customer_address_id);
    $("driver-address-photo-input").disabled = !hasAddress;
    if (!hasAddress) $("driver-address-photo-status").textContent = "Salve primeiro a localização para vincular a foto ao cadastro do endereço.";
    const savedPhoto = stop.address_photo;
    const savedPhotoPreview = $("driver-address-saved-photo");
    if (savedPhoto?.url) {
      savedPhotoPreview.src = savedPhoto.url;
      savedPhotoPreview.hidden = false;
      $("driver-address-saved-photo-date").textContent = savedPhoto.captured_at ? "Foto cadastrada em " + shortDate(savedPhoto.captured_at) : "Foto cadastrada";
    } else {
      savedPhotoPreview.removeAttribute("src");
      savedPhotoPreview.hidden = true;
      $("driver-address-saved-photo-date").textContent = "";
    }
  }

  function captureAddressLocation() {
    if (!state.addressStop || state.busy) return;
    if (!navigator.geolocation?.getCurrentPosition) {
      $("driver-location-capture-status").textContent = "Este aparelho não disponibilizou o GPS pelo navegador.";
      return;
    }
    state.locationCapture = null;
    $("driver-location-capture").disabled = true;
    $("driver-location-capture").textContent = "Capturando GPS…";
    $("driver-location-save").disabled = true;
    $("driver-location-error").textContent = "";
    $("driver-location-capture-status").textContent = "Aguarde a leitura do GPS do celular.";
    navigator.geolocation.getCurrentPosition((position) => {
      state.locationCapture = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_m: position.coords.accuracy,
      };
      const accuracy = Math.round(position.coords.accuracy);
      $("driver-location-capture-status").textContent = `GPS capturado. Precisão aproximada: ${accuracy} m. Se estiver longe da fachada, tente novamente.`;
      $("driver-location-save").disabled = false;
      $("driver-location-capture").disabled = false;
      $("driver-location-capture").textContent = "Capturar GPS novamente";
    }, (error) => {
      state.locationCapture = null;
      const message = error.code === 1
        ? "Permita o acesso à localização do aparelho para salvar o ponto."
        : error.code === 3 ? "O GPS demorou para responder. Tente novamente em local aberto." : "Não foi possível obter o GPS. Tente novamente em local aberto.";
      $("driver-location-capture-status").textContent = message;
      $("driver-location-capture").disabled = false;
      $("driver-location-capture").textContent = "Tentar capturar GPS";
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  async function saveAddressLocation() {
    const stop = state.addressStop;
    if (!stop || !state.locationCapture || state.busy) return;
    const mode = $("driver-location-mode").value;
    const label = $("driver-location-label").value.trim();
    if (mode === "alternate" && !label) {
      $("driver-location-error").textContent = "Dê um nome ao ponto alternativo, por exemplo: Portão lateral.";
      return;
    }
    if (state.locationCapture.accuracy_m > 100 && !window.confirm(`A precisão informada pelo aparelho é de aproximadamente ${Math.round(state.locationCapture.accuracy_m)} m. Quer salvar mesmo assim?`)) return;
    $("driver-location-save").disabled = true;
    $("driver-location-error").textContent = "Salvando localização…";
    state.busy = true;
    try {
      await request("driver_save_location", "POST", { stop_id: stop.id, ...state.locationCapture, mode, label });
      await loadAfterBusy();
      state.addressStop = findStop(stop.id);
      state.locationCapture = null;
      syncAddressDialog();
      $("driver-location-capture-status").textContent = "Localização salva. O botão do Google Maps já usa este ponto.";
      $("driver-location-error").textContent = "";
      $("driver-location-capture").textContent = "Capturar GPS novamente";
      toast(mode === "alternate" ? "Ponto alternativo salvo para este endereço." : "Localização principal atualizada e salva no endereço do cliente.");
    } catch (error) {
      $("driver-location-error").textContent = friendlyError(error.message);
      $("driver-location-save").disabled = false;
    } finally {
      state.busy = false;
    }
  }

  async function useSavedAddressLocation() {
    const stop = state.addressStop;
    const evidenceId = $("driver-saved-location-select").value;
    if (!stop || !evidenceId || state.busy) return;
    $("driver-location-error").textContent = "Aplicando ponto salvo à entrega atual…";
    state.busy = true;
    try {
      await request("driver_select_saved_location", "POST", { stop_id: stop.id, location_evidence_id: evidenceId });
      await loadAfterBusy();
      state.addressStop = findStop(stop.id);
      syncAddressDialog();
      $("driver-location-error").textContent = "";
      toast("Ponto alternativo aplicado ao Google Maps desta entrega.");
    } catch (error) {
      $("driver-location-error").textContent = friendlyError(error.message);
    } finally {
      state.busy = false;
    }
  }

  function compressAddressPhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//i.test(file.type || "")) return reject(new Error("address_photo_type_invalid"));
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const maxEdge = 1600;
        const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          URL.revokeObjectURL(objectUrl);
          return reject(new Error("address_photo_compression_failed"));
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("address_photo_compression_failed"));
          if (blob.size > 5 * 1024 * 1024) return reject(new Error("address_photo_too_large"));
          resolve(blob);
        }, "image/jpeg", 0.82);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("address_photo_decode_failed"));
      };
      image.src = objectUrl;
    });
  }

  async function selectAddressPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
    state.photoPreviewUrl = "";
    state.selectedPhoto = null;
    $("driver-address-photo-preview").hidden = true;
    $("driver-address-photo-save").hidden = true;
    $("driver-address-photo-status").textContent = "Preparando foto…";
    $("driver-address-photo-save").disabled = true;
    try {
      state.selectedPhoto = await compressAddressPhoto(file);
      if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
      state.photoPreviewUrl = URL.createObjectURL(state.selectedPhoto);
      $("driver-address-photo-preview").src = state.photoPreviewUrl;
      $("driver-address-photo-preview").hidden = false;
      $("driver-address-photo-save").hidden = false;
      $("driver-address-photo-save").disabled = false;
      $("driver-address-photo-status").textContent = "Confira a imagem e salve para usar como referência nas próximas entregas.";
    } catch (error) {
      state.selectedPhoto = null;
      $("driver-address-photo-save").hidden = true;
      $("driver-address-photo-status").textContent = friendlyError(error.message);
    }
  }

  async function saveAddressPhoto() {
    const stop = state.addressStop;
    if (!stop || !state.selectedPhoto || state.busy) return;
    $("driver-address-photo-save").disabled = true;
    $("driver-address-photo-status").textContent = "Enviando e vinculando a foto ao endereço…";
    state.busy = true;
    try {
      await requestPhoto(stop.id, state.selectedPhoto);
      await loadAfterBusy();
      state.addressStop = findStop(stop.id);
      state.selectedPhoto = null;
      if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
      state.photoPreviewUrl = "";
      $("driver-address-photo-preview").hidden = true;
      $("driver-address-photo-save").hidden = true;
      $("driver-address-photo-input").value = "";
      syncAddressDialog();
      $("driver-address-photo-status").textContent = "Foto salva no cadastro deste endereço.";
      toast("Foto da fachada salva para as próximas entregas.");
    } catch (error) {
      $("driver-address-photo-status").textContent = friendlyError(error.message);
      $("driver-address-photo-save").disabled = false;
    } finally {
      state.busy = false;
    }
  }

  function openDeliveryDialog(stopId) {
    const run = state.runs.find((item) => (item.stops || []).some((stop) => stop.id === stopId));
    const stop = run ? nextStop(run) : null;
    if (!stop || stop.id !== stopId) return toast("Conclua primeiro a entrega que está no topo da rota.", true);
    state.currentStop = stop;
    const order = stop.order || {};
    const prepaid = order.delivery_paid_ahead === true;
    $("driver-deliver-title").textContent = "Pedido " + orderNumber(order, stop);
    $("driver-deliver-payment-note").textContent = prepaid
      ? "Pagamento já registrado antecipadamente. Não cobre novamente do cliente."
      : `Confirme a entrega e registre o recebimento de ${money(order.total)}.`;
    $("driver-payment-field").hidden = prepaid;
    $("driver-payment-method").required = !prepaid;
    $("driver-payment-method").value = prepaid ? (order.delivery_paid_ahead_method || "") : "";
    $("driver-deliver-error").textContent = "";
    $("driver-deliver-dialog").showModal();
  }

  async function completeDelivery(event) {
    event.preventDefault();
    if (!state.currentStop || state.busy) return;
    const stop = state.currentStop;
    const order = stop.order || {};
    const prepaid = order.delivery_paid_ahead === true;
    const method = prepaid ? order.delivery_paid_ahead_method : $("driver-payment-method").value;
    if (!prepaid && !method) {
      $("driver-deliver-error").textContent = "Selecione a forma de pagamento recebida.";
      return;
    }
    if (!window.confirm(prepaid ? "Confirma que o pedido foi entregue? O pagamento já está marcado como recebido." : "Confirma que o pedido foi entregue e o pagamento recebido?")) return;
    $("driver-deliver-confirm").disabled = true;
    $("driver-deliver-error").textContent = "Registrando entrega…";
    state.busy = true;
    try {
      await request("driver_complete", "POST", { stop_id: stop.id, method });
      $("driver-deliver-dialog").close();
      state.currentStop = null;
      await loadAfterBusy();
      toast("Entrega registrada. O próximo pedido já está destacado.");
    } catch (error) {
      $("driver-deliver-error").textContent = friendlyError(error.message);
    } finally {
      state.busy = false;
      $("driver-deliver-confirm").disabled = false;
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.sortStop) sortStop(button.dataset.runId, button.dataset.stopId, button.dataset.sortStop);
    if (button.dataset.notifyNext) notifyNext(button.dataset.notifyNext, button);
    if (button.dataset.openDeliver) openDeliveryDialog(button.dataset.openDeliver);
    if (button.dataset.openAddress) openAddressDialog(button.dataset.openAddress);
  });

  $("driver-deliver-form").addEventListener("submit", completeDelivery);
  $("driver-deliver-close").addEventListener("click", () => $("driver-deliver-dialog").close());
  $("driver-address-close").addEventListener("click", () => {
    $("driver-address-dialog").close();
    state.addressStop = null;
    state.locationCapture = null;
    state.selectedPhoto = null;
    if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
    state.photoPreviewUrl = "";
  });
  $("driver-location-capture").addEventListener("click", captureAddressLocation);
  $("driver-location-mode").addEventListener("change", () => {
    $("driver-location-error").textContent = "";
    syncAddressDialog();
  });
  $("driver-location-save").addEventListener("click", saveAddressLocation);
  $("driver-saved-location-select").addEventListener("change", (event) => {
    $("driver-saved-location-use").disabled = !event.target.value;
  });
  $("driver-saved-location-use").addEventListener("click", useSavedAddressLocation);
  $("driver-address-photo-input").addEventListener("change", selectAddressPhoto);
  $("driver-address-photo-save").addEventListener("click", saveAddressPhoto);
  $("driver-refresh").addEventListener("click", load);
  $("driver-retry").addEventListener("click", load);
  $("driver-logout").addEventListener("click", () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    state.token = "";
    state.runs = [];
    state.driver = null;
    setAccessState("Acesso encerrado", "Para abrir suas entregas novamente, use o link individual da loja.");
  });

  const incomingToken = tokenFromHash();
  if (incomingToken) {
    state.token = incomingToken;
    try { localStorage.setItem(TOKEN_KEY, incomingToken); } catch (_) {}
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  } else {
    try { state.token = localStorage.getItem(TOKEN_KEY) || ""; } catch (_) {}
  }

  if (state.token) load();
  else setAccessState("Acesso individual", "Abra o link pessoal que a loja enviou. Se o acesso expirou, solicite outro no admin.");

  window.setInterval(() => { if (state.token && !state.busy) load(); }, 60000);
})();
