// A basket must be sellable both in the storefront and when the order is saved.
export function basketSellableStock(website, checkout, today) {
  if (!website) return { quantity: 0, reason: "stock_unavailable" };
  if (website.is_active !== true) return { quantity: 0, reason: "inactive" };
  const expiry = website.validity_date ? String(website.validity_date).slice(0, 10) : "";
  if (expiry && expiry < today) return { quantity: 0, reason: "expired" };
  if (!(Number(website.price) > 0)) return { quantity: 0, reason: "price_unavailable" };
  if (!checkout || checkout.is_active !== true) return { quantity: 0, reason: "stock_unavailable" };
  const ean = checkout.stock_authority === "bling"
    ? checkout.loose_sellable_stock : checkout.ean_sellable_stock ?? checkout.loose_sellable_stock;
  const quantity = Math.min(Number(website.sellable_stock || 0), Number(ean || 0));
  const safeQuantity = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  return { quantity: safeQuantity, reason: safeQuantity > 0 ? "available" : "out_of_stock" };
}

export function todayInCuiaba(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}
