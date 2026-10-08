// ANA V3 R9: read-only reorder preview. Never creates an order or reserves stock.
// Catalog rows must be fetched from the trusted backend, never supplied by a browser.
const int = v => Number.isSafeInteger(v) && v >= 0;
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
export function buildAnaReorderPreviewV1({previousItems=[],catalogItems=[],maxLines=80}={}) {
  if (!Array.isArray(previousItems) || !Array.isArray(catalogItems) ||
      !int(maxLines) || maxLines < 1 || maxLines > 80 || previousItems.length > maxLines) {
    return {status:'invalid_input',checkout_allowed:false,items:[]};
  }
  const catalog = new Map(catalogItems.filter(x => x && id(x.product_id)).map(x => [x.product_id,x]));
  const grouped = new Map();
  for (const line of previousItems) {
    if (!line || !id(line.product_id) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000) {
      return {status:'invalid_input',checkout_allowed:false,items:[]};
    }
    const next=(grouped.get(line.product_id)||0)+line.quantity;
    if (next > 1000) return {status:'invalid_input',checkout_allowed:false,items:[]};
    grouped.set(line.product_id,next);
  }
  const items=[];
  let subtotal_cents=0;
  for (const [product_id,quantity] of grouped) {
    const p=catalog.get(product_id);
    const price=p?.price_cents;
    const stock=p?.sellable_stock;
    const valid=Boolean(p?.is_active===true && int(price) && int(stock));
    const available=valid && stock >= quantity;
    if (!available) {
      items.push({product_id,requested_quantity:quantity,status:valid?'insufficient_stock':'unavailable',available_quantity:valid?stock:0});
      continue;
    }
    const lineTotal=price*quantity;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(subtotal_cents+lineTotal)) {
      return {status:'invalid_input',checkout_allowed:false,items:[]};
    }
    subtotal_cents+=lineTotal;
    items.push({product_id,requested_quantity:quantity,status:'available',current_unit_price_cents:price,current_line_total_cents:lineTotal});
  }
  return {
    status:'review_required',items,subtotal_cents,
    has_unavailable:items.some(x=>x.status!=='available'),
    checkout_allowed:false,
    creates_order:false,reserves_stock:false,
    price_source:'current_canonical_catalog',
    next_action:'customer_reviews_and_confirms_normal_checkout'
  };
}
