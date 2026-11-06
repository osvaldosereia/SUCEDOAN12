const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function driverRouteKey(driverId) {
  const id = String(driverId || "").trim();
  if (!UUID_RE.test(id)) throw new Error("invalid_driver_id");
  return "driver_" + id.toLowerCase();
}

function validCoordinates(latitude, longitude) {
  if (latitude == null || longitude == null || String(latitude).trim() === "" || String(longitude).trim() === "") return false;
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0);
}

export function latestLocationEvidence(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => validCoordinates(row?.latitude, row?.longitude))
    .sort((a, b) => {
      const time = (Date.parse(b?.captured_at || b?.created_at || "") || 0) -
        (Date.parse(a?.captured_at || a?.created_at || "") || 0);
      return time || String(b?.id || "").localeCompare(String(a?.id || ""));
    })[0] || null;
}

function addressText(stop) {
  const address = stop?.address_snapshot || stop?.address || stop?.delivery_address || {};
  const street = String(address.street || "").trim() || String(address.address_line || "").trim();
  const line = [
    street,
    address.number,
    address.complement,
    address.neighborhood || address.district,
    address.city,
    address.state,
    address.postal_code ? "CEP " + address.postal_code : "",
  ].filter(Boolean).join(", ");
  return line || String(address.raw_text || address.formatted_address || "").trim();
}

export function buildMapsHref(stop) {
  const confidence = String(stop?.destination_confidence || "");
  if (["confirmed", "saved"].includes(confidence) && validCoordinates(stop?.destination_latitude, stop?.destination_longitude)) {
    const target = Number(stop.destination_latitude) + "," + Number(stop.destination_longitude);
    return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(target);
  }
  const address = stop?.address_snapshot || stop?.address || stop?.delivery_address || {};
  const savedMap = String(stop?.maps_url_snapshot || address.google_maps_url || "").trim();
  if (savedMap) {
    try {
      const parsed = new URL(savedMap);
      if (parsed.protocol === "https:" && ["www.google.com", "google.com", "maps.google.com", "maps.app.goo.gl", "goo.gl"].includes(parsed.hostname.toLowerCase())) return parsed.toString();
    } catch (_) {}
  }
  const target = addressText(stop);
  return target ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(target) : "";
}

export function movePlannedStop(stops, stopId, direction, options = {}) {
  if (options.runStatus !== "planned" || options.loadingStarted === true) {
    throw new Error("route_locked");
  }
  const ordered = (Array.isArray(stops) ? stops : [])
    .map((stop) => ({ ...stop }))
    .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
  const movableIndexes = [];
  ordered.forEach((stop, index) => {
    if (stop.status === "planned") movableIndexes.push(index);
  });
  const movable = movableIndexes.map((index) => ordered[index]);
  const currentIndex = movable.findIndex((stop) => String(stop.id || stop.stop_id) === String(stopId));
  if (currentIndex < 0) throw new Error("planned_stop_required");
  const offset = Number(direction);
  if (![-1, 1].includes(offset)) throw new Error("invalid_direction");
  const nextIndex = currentIndex + offset;
  if (nextIndex < 0 || nextIndex >= movable.length) return ordered;
  [movable[currentIndex], movable[nextIndex]] = [movable[nextIndex], movable[currentIndex]];
  movableIndexes.forEach((index, position) => { ordered[index] = movable[position]; });
  return ordered.map((stop, index) => ({ ...stop, sequence: index + 1 }));
}

export function normalizeEtaMinutes(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,3}$/.test(raw)) throw new Error("invalid_eta");
  const minutes = Number(raw);
  if (minutes < 5 || minutes > 120) throw new Error("invalid_eta");
  return minutes;
}

export function addRouteSelection(selected, orderId, maxOrders = 30) {
  const next = new Set(selected || []);
  const id = String(orderId || "").trim();
  if (!id) throw new Error("invalid_order_id");
  if (!next.has(id) && next.size >= maxOrders) throw new Error("route_too_many_orders");
  next.add(id);
  return next;
}

export function routeSelectionAfterAction(selected, succeeded) {
  return succeeded ? new Set() : new Set(selected || []);
}

function isCalendarDate(value) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function dateInTimeZone(value, timeZone) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month && values.day ? `${values.year}-${values.month}-${values.day}` : null;
}

function deliveryDateForQueueOrder(order, timeZone) {
  const rawDate = order?.checkout_snapshot?.delivery?.date;
  if (rawDate != null && String(rawDate).trim()) return isCalendarDate(rawDate) ? String(rawDate).trim() : null;
  return dateInTimeZone(order?.created_at, timeZone);
}

export function partitionDeliveryOrders(orders, serviceDate, timeZone = "America/Cuiaba") {
  if (!isCalendarDate(serviceDate)) throw new Error("invalid_service_date");
  const queue = { today: [], overdue: [], future: [], undated: [] };
  for (const order of Array.isArray(orders) ? orders : []) {
    const deliveryDate = deliveryDateForQueueOrder(order, timeZone);
    if (!deliveryDate) queue.undated.push(order);
    else if (deliveryDate < serviceDate) queue.overdue.push(order);
    else if (deliveryDate > serviceDate) queue.future.push(order);
    else queue.today.push(order);
  }
  return queue;
}

export function prepaidPaymentMethod(value) {
  const method = String(value || "").trim();
  return ["pix", "credit_card"].includes(method) ? method : null;
}

export function deliveryStopCapabilities(run, stop) {
  const route = run || {};
  const delivery = stop || {};
  const editable = route.status === "planned" && delivery.status === "planned" &&
    !route.loading_started_at && !route.loaded_at && !delivery.loaded_at &&
    !delivery.custody_confirmed_at;
  return {
    canCancel: editable,
    canReassign: editable,
    canReschedule: editable,
    canMarkDelivered: route.status === "dispatched" && delivery.status === "out_for_delivery",
    isDelivered: delivery.status === "delivered",
    isCancelled: delivery.status === "cancelled",
  };
}

export function isValidDeliveryRescheduleDate(value, serviceDate) {
  if (!isCalendarDate(value) || !isCalendarDate(serviceDate) || value < serviceDate) return false;
  const dayOfWeek = new Date(value + "T00:00:00.000Z").getUTCDay();
  return dayOfWeek !== 0;
}

export function paidAheadLabel(order) {
  return order?.delivery_paid_ahead === true
    ? "PAGO ADIANTADO · NÃO COBRAR"
    : "RECEBER NA ENTREGA";
}

export function deliveryNoticeFailureMessage(code, friendlyMessage, mapsOpened = false) {
  const mapPrefix = mapsOpened ? "Rota aberta no Google Maps. " : "";
  if (code === "meta_accepted_status_uncertain") {
    return mapPrefix + "O WhatsApp pode ter aceitado o aviso, mas o sistema não confirmou o registro. Confira a conversa antes de tentar novamente.";
  }
  return mapPrefix + "Aviso automático não enviado. " + String(friendlyMessage || code || "erro desconhecido");
}
