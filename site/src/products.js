export function mergeProductPages(current = [], incoming = []) {
  const positions = new Map(current.map((product, index) => [String(product.product_id || product.id || ''), index]));
  const merged = current.slice();
  for (const product of incoming) {
    const id = String(product.product_id || product.id || '');
    if (!id) continue;
    const position = positions.get(id);
    if (position == null) {
      positions.set(id, merged.length);
      merged.push(product);
    } else {
      merged[position] = product;
    }
  }
  return merged;
}

export function nextPageOffset(page = {}) {
  const offset = Number(page.next_offset);
  return page.next_offset != null && Number.isSafeInteger(offset) && offset >= 0 ? offset : null;
}

export function sortProducts(products = [], mode = 'default', getPrice = product => Number(product.price_cents || 0)) {
  const sorted = products.slice();
  if (mode === 'name') sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  if (mode === 'price') sorted.sort((a, b) => getPrice(a) - getPrice(b));
  return sorted;
}
