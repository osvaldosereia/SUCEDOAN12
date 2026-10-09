/**
 * R06 — pure, read-only commercial reconciliation.
 * No Bling, stock, NF-e, Meta or database writes. Reject uncertain input:
 * fiscal operations MUST NOT use a guessed final item list or hidden charge.
 */
const cents = value => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) : null;
};
const quantity = value => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && Math.round(n * 1000) === n * 1000 ? n : null;
};
const kind = row => String(row?.metadata?.history_kind ?? row?.history_kind ?? "product");
const stockLoose = (row, sep) => {
  const q = quantity(sep.quantity);
  if (q === null) return null;
  if (kind(row) !== "basket_component") return q;
  const preassembled = quantity(row.metadata?.preassembled_units ?? 0);
  return preassembled === null || preassembled > q ? null : Math.max(0, q - preassembled);
};
const clean = n => Math.round(n * 1000) / 1000;

/** @returns {{ok:boolean,blockers:string[],snapshot?:object}} */
export function reconcileSeparatedCommercialOrder({
  order, orderItems, separationItems, completion, reservations = [], requireReservations = true
} = {}) {
  const blockers = new Set();
  const reject = code => blockers.add(code);
  if (!order?.id || !completion || !Array.isArray(orderItems)
      || !Array.isArray(separationItems) || !Array.isArray(reservations)) {
    return { ok: false, blockers: ["incomplete_reconciliation_inputs"] };
  }
  if (completion.order_id && String(completion.order_id) !== String(order.id)) reject("completion_wrong_order");
  if (order.status !== "ready" || !completion.completed_at
      || completion.metadata?.stock_applied !== true) reject("separation_not_finalized");

  const original = cents(completion.original_total);
  const final = cents(completion.final_total);
  const finalOrder = cents(order.total);
  const missingFromCompletion = cents(completion.missing_subtotal);
  if ([original, final, finalOrder, missingFromCompletion].some(x => x === null)
      || original < 0 || final < 0 || finalOrder < 0 || missingFromCompletion < 0) {
    reject("invalid_final_money");
  }
  if (final !== null && finalOrder !== null && final !== finalOrder) reject("order_final_total_mismatch");
  if (original !== null && final !== null && missingFromCompletion !== null
      && original - missingFromCompletion !== final) reject("missing_financial_adjustment_mismatch");

  const itemById = new Map();
  const sepById = new Map();
  const all = [];
  for (const row of orderItems) {
    const id = String(row?.id ?? "");
    if (!id || itemById.has(id)) { reject("duplicate_order_item"); continue; }
    if (row.order_id && String(row.order_id) !== String(order.id)) reject("item_wrong_order");
    itemById.set(id,row);
  }
  for (const sep of separationItems) {
    const id = String(sep?.order_item_id ?? "");
    if (!itemById.has(id) || sepById.has(id)) { reject("unknown_or_duplicate_separation_item"); continue; }
    if (sep.order_id && String(sep.order_id) !== String(order.id)) reject("separation_wrong_order");
    if (!["separated","missing"].includes(sep.state)) reject("separation_pending_or_invalid");
    const row = itemById.get(id);
    const q = quantity(row.quantity),sq = quantity(sep.quantity);
    if (q === null || sq === null || q <= 0 || sq !== q) reject("partial_quantity_not_supported");
    const unit = cents(sep.unit_price), line = cents(sep.line_total);
    if (unit === null || line === null || line < 0 || unit < 0) reject("invalid_separation_prices");
    if (unit !== null && line !== null && sq !== null && Math.abs(unit * sq - line) > 1) {
      reject("line_price_quantity_mismatch");
    }
    sepById.set(id,sep);
    all.push({id,row,sep,line:line ?? 0,kind:kind(row)});
  }
  for (const id of itemById.keys()) if (!sepById.has(id)) reject("missing_separation_record");

  // A basket header is a presentation line, NOT a second billable product.
  // A parent missing while children have different outcomes is ambiguous:
  // it can cause double discounting and must be reviewed.
  const children = all.filter(x => ["basket_component","basket_mold_component"].includes(x.kind));
  const parents = all.filter(x => ["basket","basket_mold"].includes(x.kind));
  if (parents.length && !children.length) reject("basket_without_components");
  for (const parent of parents) {
    if (parent.sep.state === "missing") reject("basket_parent_missing_requires_review");
    if (parent.sep.state !== "separated") reject("basket_parent_invalid_state");
  }

  const sepDeliverable = all.filter(x => x.sep.state === "separated");
  const physical = sepDeliverable.filter(x => !["basket","basket_mold"].includes(x.kind));
  const missing = all.filter(x => x.sep.state === "missing");
  const actualIds = sepDeliverable.map(x => x.id).sort();
  const storedIds = Array.isArray(completion.deliverable_order_item_ids)
    ? completion.deliverable_order_item_ids.map(String).sort() : null;
  if (!storedIds || actualIds.length !== storedIds.length
      || actualIds.some((id,i) => id !== storedIds[i])) reject("deliverable_snapshot_mismatch");
  const missingTotal = missing.reduce((sum,x) => sum + x.line,0);
  if (missingFromCompletion !== null && missingTotal !== missingFromCompletion) {
    reject("missing_line_sum_mismatch");
  }
  if (!physical.length) reject("nothing_billable_after_missing_items");
  if (physical.some(x => !x.row.product_id)) reject("deliverable_product_identity_missing");

  const physicalLineCents = physical.reduce((sum,x) => sum + x.line,0);
  const delta = final !== null ? final - physicalLineCents : null;
  const expenses = cents(completion.original_other_expenses ?? order.other_expenses ?? 0);
  const hidden = cents(completion.original_basket_hidden_adjustment ?? order.basket_hidden_adjustment ?? 0);
  const discount = cents(completion.original_discount ?? order.discount ?? 0);
  if ([expenses,hidden,discount].some(x => x === null)) reject("invalid_commercial_adjustment");
  const expectedDelta = expenses !== null && hidden !== null && discount !== null
    ? expenses + hidden - discount : null;

  // Hidden per-product surcharges must be recomputed on shortage; blindly
  // keeping a fixed adjustment would charge for goods not delivered.
  if (missing.length && hidden !== null && hidden !== 0) {
    reject("hidden_adjustment_with_missing_items_requires_review");
  }
  if (delta !== null && expectedDelta !== null && Math.abs(delta - expectedDelta) > 1) {
    reject("commercial_delta_unattributed");
  }
  if (final === 0 || physicalLineCents === 0 && expectedDelta === 0) {
    reject("nothing_billable_after_missing_items");
  }

  const expectedStock = new Map();
  for (const item of physical) {
    const loose = stockLoose(item.row,item.sep);
    if (loose === null) { reject("invalid_preassembled_quantity"); continue; }
    if (loose <= 0) continue;
    const id = String(item.row.product_id);
    expectedStock.set(id,clean((expectedStock.get(id) || 0) + loose));
  }
  const reservedStock = new Map();
  for (const r of reservations) {
    if (r.order_id && String(r.order_id) !== String(order.id)) reject("reservation_wrong_order");
    const id=String(r.product_id ?? "");
    if (!id || reservedStock.has(id)) { reject("duplicate_reservation_product"); continue; }
    const q=quantity(r.quantity);
    if (q === null || !["consumed","released"].includes(String(r.status))) {
      reject("reservation_state_not_reconciled");
    }
    reservedStock.set(id,{ quantity:q ?? 0,status:r.status });
  }
  if (requireReservations) {
    for (const [id,n] of expectedStock) {
      const res=reservedStock.get(id);
      if (!res || res.status !== "consumed" || Math.abs(res.quantity-n)>0.0001) {
        reject("reserved_stock_quantity_mismatch");
      }
    }
    for (const [id,res] of reservedStock) {
      if (!expectedStock.has(id) && res.status !== "released") {
        reject("missing_stock_not_released");
      }
    }
  }
  if (blockers.size) return {ok:false,blockers:[...blockers].sort()};
  return {
    ok:true,blockers:[],
    snapshot:{
      order_id:String(order.id),
      total_cents:final,
      physical_line_cents:physicalLineCents,
      commercial_delta_cents:delta,
      commercial_delta_classified_cents:expectedDelta,
      delivered_order_item_ids:physical.map(x => x.id),
      missing_order_item_ids:missing.map(x => x.id),
      physical_lines:physical.map(x => ({
        order_item_id:x.id,product_id:String(x.row.product_id),
        quantity:Number(x.sep.quantity),line_total_cents:x.line,source_kind:x.kind
      })),
      expected_loose_stock:[...expectedStock].sort(([a],[b])=>a.localeCompare(b)).map(([product_id,quantity])=>({product_id,quantity}))
    }
  };
}
