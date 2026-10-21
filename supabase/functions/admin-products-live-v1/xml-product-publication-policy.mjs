function validGtin(value) {
  const gtin = String(value || "").replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(gtin.length)) return false;
  let sum = 0;
  for (let i = gtin.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += Number(gtin[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(gtin.at(-1));
}

export async function ensureXmlProductInBling(product, ensureLinked) {
  const id = String(product?.id || "");
  const gtin = String(product?.gtin || "").replace(/\D/g, "");
  if (!id || !validGtin(gtin)) return { ok: false, error: "valid_gtin_required_for_xml_publish" };
  const result = await ensureLinked({ product_id: id, gtin, idempotency_key: `purchase-xml-publish:${id}:${gtin}` });
  const blingId = Number(result?.bling_id || 0);
  if (result?.ok !== true || !Number.isSafeInteger(blingId) || blingId <= 0) {
    return { ok: false, error: result?.error || "xml_product_bling_link_unconfirmed", result };
  }
  return { ok: true, bling_product_id: blingId, created: result.created === true, linked: true };
}
