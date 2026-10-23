export function moldProductIdsForRead(positions, options, requested, defaultSelected, includeAlternatives) {
  const allIds = options.map(option => String(option.product_id || "")).filter(Boolean);
  if (includeAlternatives) return [...new Set(allIds)];

  const ids = [];
  for (const position of positions) {
    const positionId = String(position.id);
    const selectedId = requested.get(positionId)?.product_id || defaultSelected.get(positionId) || "";
    if (selectedId) {
      ids.push(String(selectedId));
      continue;
    }
    // Some generated public compositions intentionally omit positions without a saved default.
    // Load alternatives only for those positions so the public detail can choose a sellable one.
    for (const option of options) {
      if (String(option.position_id) === positionId && option.product_id) ids.push(String(option.product_id));
    }
  }
  return [...new Set(ids)];
}

export function moldFirstAvailableOption(options, products, availableStock, quantity) {
  const ordered = options.slice().sort((a, b) =>
    Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
    String(a.product_id || "").localeCompare(String(b.product_id || ""))
  );
  for (const option of ordered) {
    const id = String(option.product_id || "");
    const product = products.get(id);
    if (product && Number(availableStock.get(id) || 0) >= quantity) return product;
  }
  return null;
}
