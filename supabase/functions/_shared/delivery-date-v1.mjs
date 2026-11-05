const BUSINESS_TIME_ZONE = "America/Cuiaba";

function isCalendarDate(value) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function dateInTimeZone(value, timeZone = BUSINESS_TIME_ZONE) {
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

export function serviceDateInCuiaba(now = new Date()) {
  return dateInTimeZone(now, BUSINESS_TIME_ZONE);
}

export function deliveryDateForOrder(order, timeZone = BUSINESS_TIME_ZONE) {
  const rawDate = order?.checkout_snapshot?.delivery?.date;
  if (rawDate != null && String(rawDate).trim()) return isCalendarDate(rawDate) ? String(rawDate).trim() : null;
  return dateInTimeZone(order?.created_at, timeZone);
}

export function isScheduledForDate(order, serviceDate) {
  return isCalendarDate(serviceDate) && deliveryDateForOrder(order) === serviceDate;
}
