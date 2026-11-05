const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeRouteOrderIds(values, maxOrders = 30) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("driver_and_orders_required");
  if (values.length > maxOrders) throw new Error("route_too_many_orders");
  const ids = values.map((value) => String(value || "").trim().toLowerCase());
  if (ids.some((value) => !UUID_RE.test(value))) throw new Error("invalid_order_id");
  if (new Set(ids).size !== ids.length) throw new Error("duplicate_order_in_route");
  return ids;
}

export function normalizeStopIds(values, maxStops = 30) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("invalid_stop_order");
  if (values.length > maxStops) throw new Error("route_too_many_stops");
  const ids = values.map((value) => String(value || "").trim().toLowerCase());
  if (ids.some((value) => !UUID_RE.test(value))) throw new Error("invalid_stop_id");
  if (new Set(ids).size !== ids.length) throw new Error("duplicate_stop_in_route");
  return ids;
}

export function mergePlannedRouteOrderIds(existingIds, selectedIds, maxOrders = 30) {
  const selected = normalizeRouteOrderIds(selectedIds, maxOrders);
  const existing = Array.isArray(existingIds) ? existingIds : [];
  return normalizeRouteOrderIds([...new Set([...existing.map((id) => String(id || "").trim().toLowerCase()), ...selected])], maxOrders);
}

export function driverVisibleRuns(runs, driverId) {
  return (Array.isArray(runs) ? runs : []).filter((run) =>
    run?.driver_id === driverId && ["planned", "dispatched", "completed"].includes(run?.status));
}

export function channelForWhatsappAccount(account) {
  const digits = String(account?.phone_e164 || "").replace(/\D+/g, "");
  const slug = String(account?.slug || "").toLowerCase();
  if (digits.endsWith("1018") || /(?:^|[-_])1018$/.test(slug)) return "1018";
  if (digits.endsWith("0975") || /(?:^|[-_])0975$/.test(slug)) return "0975";
  return null;
}

export function normalizeDriverPhone(value, required = false) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) {
    if (required) throw new Error("driver_phone_required");
    return null;
  }
  const international = digits.startsWith("55") ? digits : "55" + digits;
  if (!/^55\d{10,11}$/.test(international)) throw new Error("driver_phone_invalid");
  return "+" + international;
}
