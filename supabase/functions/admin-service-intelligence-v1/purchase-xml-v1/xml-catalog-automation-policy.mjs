function validGtin(value) {
  const gtin = String(value || "").replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(gtin.length)) return false;
  let sum = 0;
  for (let i = gtin.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += Number(gtin[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(gtin.at(-1));
}

export function isSafeBaseIdentity({ role, gtin } = {}) {
  return role === "base_unit" && validGtin(gtin);
}

export function autoConversion(conversion = {}) {
  const factor = Number(conversion.factor);
  if (!Number.isInteger(factor) || factor < 1 || factor > 100000) return false;
  if (["known", "not_needed"].includes(String(conversion.status || ""))) return true;
  return conversion.status === "inferred_xml" && conversion.suggestion_source === "xml_qtrib_ratio_unit_safe";
}

export function baseUnitCost({ quantity, factor, net_line_total } = {}) {
  const q = Number(quantity), f = Number(factor), net = Number(net_line_total);
  if (!Number.isFinite(q) || q <= 0 || !Number.isInteger(f) || f < 1 || !Number.isFinite(net) || net <= 0) return null;
  const baseQuantity = q * f;
  if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) return null;
  const cost = net / baseQuantity;
  return Number.isFinite(cost) && cost > 0 ? Math.round(cost * 1000000) / 1000000 : null;
}

export function shouldApplyLatestPurchase({ invoiceIssuedAt, latestPurchaseAt, invoiceItemId, latestItemId } = {}) {
  const latest = Date.parse(String(latestPurchaseAt || ""));
  if (!Number.isFinite(latest)) return true;
  const invoice = Date.parse(String(invoiceIssuedAt || ""));
  if (!Number.isFinite(invoice)) return false;
  if (invoice > latest) return true;
  return invoice === latest && Boolean(invoiceItemId) && String(invoiceItemId) === String(latestItemId || "");
}
