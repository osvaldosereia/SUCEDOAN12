export function moldProductIdsForRead(positions, options, requested, defaultSelected, includeAlternatives) {
  const allIds = options.map(option => String(option.product_id || "")).filter(Boolean);
  if (includeAlternatives) return [...new Set(allIds)];

  const ids = [];
  for (const position of positions) {
    const positionId = String(position.id);
    const selection = requested.get(positionId);
    const selectedOptions = Array.isArray(selection?.options) && selection.options.length
      ? selection.options
      : selection?.product_id ? [selection] : [];
    if (selectedOptions.length) {
      for (const option of selectedOptions) {
        const selectedId = String(option?.product_id || "");
        if (selectedId) ids.push(selectedId);
      }
      continue;
    }
    const selectedId = defaultSelected.get(positionId) || "";
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

function orderedByDefaultAndStock(options, stockById) {
  return options.slice().sort((a, b) => {
    const aOrder = Number(a.sort_order || 0);
    const bOrder = Number(b.sort_order || 0);
    const aDefault = aOrder === 0 ? 0 : 1;
    const bDefault = bOrder === 0 ? 0 : 1;
    return aDefault - bDefault
      || Number(stockById?.get(String(b.product_id || "")) || 0) - Number(stockById?.get(String(a.product_id || "")) || 0)
      || aOrder - bOrder
      || String(a.product_id || "").localeCompare(String(b.product_id || ""));
  });
}

export function moldFirstAvailableOption(options, products, availableStock, quantity) {
  const ordered = orderedByDefaultAndStock(options, availableStock);
  for (const option of ordered) {
    const id = String(option.product_id || "");
    const product = products.get(id);
    if (product?.is_active === true && Number(availableStock.get(id) || 0) >= Math.max(1, quantity)) return product;
  }
  return null;
}

export function moldFirstConfiguredOption(options, products) {
  const ordered = orderedByDefaultAndStock(options);
  for (const option of ordered) {
    const product = products.get(String(option.product_id || ""));
    if (product?.is_active === true) return product;
  }
  return null;
}

