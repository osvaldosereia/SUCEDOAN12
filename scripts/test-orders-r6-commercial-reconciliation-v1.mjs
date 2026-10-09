import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { reconcileSeparatedCommercialOrder as reconcile } from "../supabase/functions/_shared/order-commercial-reconciliation-v1.mjs";

const orderId="synthetic-order-001";
const row=(id,product_id,qty,unit,kind="product",metadata={})=>({
  id,order_id:orderId,product_id,quantity:qty,unit_price:unit,
  metadata:{history_kind:kind,...metadata}
});
const sep=(row,state,lineTotal)=>({
  order_id:orderId,order_item_id:row.id,product_id:row.product_id,
  state,quantity:row.quantity,unit_price:row.unit_price,line_total:lineTotal
});
function fixture() {
  const a=row("rice","product-rice",3,66);
  const b=row("soap","product-soap",1,32);
  return {
    order:{id:orderId,status:"ready",total:198,subtotal:198,fiscal_subtotal:198,other_expenses:0,basket_hidden_adjustment:0,discount:0},
    orderItems:[a,b],
    separationItems:[sep(a,"separated",198),sep(b,"missing",32)],
    completion:{
      order_id:orderId,completed_at:"2026-10-08T20:30:00Z",
      metadata:{stock_applied:true},
      original_total:230,final_total:198,missing_subtotal:32,
      original_discount:0,original_other_expenses:0,original_basket_hidden_adjustment:0,
      deliverable_order_item_ids:["rice"]
    },
    reservations:[
      {order_id:orderId,product_id:"product-rice",quantity:3,status:"consumed"},
      {order_id:orderId,product_id:"product-soap",quantity:1,status:"released"}
    ]
  };
}
const clone=value=>structuredClone(value);
const blocks=(caseName,mutate,reason)=>{
  test(caseName,()=>{
    const data=fixture();
    mutate(data);
    const result=reconcile(data);
    assert.equal(result.ok,false,JSON.stringify(result));
    assert.ok(result.blockers.includes(reason),JSON.stringify(result.blockers));
  });
};

test("R06 validates R$230 -> R$198, one missing item, correct physical loose stock",()=>{
  const verdict=reconcile(fixture());
  assert.deepEqual(verdict.blockers,[]);
  assert.equal(verdict.ok,true);
  assert.deepEqual(verdict.snapshot.missing_order_item_ids,["soap"]);
  assert.deepEqual(verdict.snapshot.delivered_order_item_ids,["rice"]);
  assert.equal(verdict.snapshot.total_cents,19800);
  assert.equal(verdict.snapshot.physical_line_cents,19800);
  assert.deepEqual(verdict.snapshot.expected_loose_stock,[{product_id:"product-rice",quantity:3}]);
});

test("R06 is pure and replay produces the identical final commercial snapshot",()=>{
  const a=fixture(),before=clone(a);
  const first=reconcile(a),second=reconcile(a);
  assert.deepEqual(a,before);
  assert.deepEqual(first,second);
});

blocks("R06 rejects stale uncompleted separation",d=>{d.completion.completed_at=null;},"separation_not_finalized");
blocks("R06 rejects unconsumed stock flag",d=>{d.completion.metadata.stock_applied=false;},"separation_not_finalized");
blocks("R06 rejects pending item instead of billing",d=>{d.separationItems[0].state="pending";},"separation_pending_or_invalid");
blocks("R06 rejects wrong order id",d=>{d.completion.order_id="other-order";},"completion_wrong_order");
blocks("R06 rejects duplicate item picks",d=>{d.separationItems.push({...d.separationItems[0]});},"unknown_or_duplicate_separation_item");
blocks("R06 rejects item without recorded pick",d=>{d.separationItems.pop();},"missing_separation_record");
blocks("R06 rejects partial quantity without explicit line accounting",d=>{d.separationItems[0].quantity=2;},"partial_quantity_not_supported");
blocks("R06 rejects line price not matching quantity",d=>{d.separationItems[0].line_total=184;},"line_price_quantity_mismatch");
blocks("R06 rejects missing subtotal inflation",d=>{d.completion.missing_subtotal=50;},"missing_line_sum_mismatch");
blocks("R06 rejects final order money discrepancy",d=>{d.order.total=211;},"order_final_total_mismatch");
blocks("R06 rejects deliverable list diverging from recorded picks",d=>{d.completion.deliverable_order_item_ids=["rice","soap"];},"deliverable_snapshot_mismatch");
blocks("R06 rejects stock reserve consumed for missing item",d=>{d.reservations[1].status="consumed";},"missing_stock_not_released");
blocks("R06 rejects omitted stock reservation",d=>{d.reservations.shift();},"reserved_stock_quantity_mismatch");
blocks("R06 rejects overclaimed loose inventory",d=>{d.reservations[0].quantity=5;},"reserved_stock_quantity_mismatch");
blocks("R06 rejects fully missing order",d=>{
  d.separationItems[0].state="missing";
  d.completion.deliverable_order_item_ids=[];
  d.completion.missing_subtotal=230;
  d.completion.final_total=0;
  d.order.total=0;
  d.reservations[0].status="released";
},"nothing_billable_after_missing_items");

test("R06 accepts FIXED surcharge with all basket components delivered",()=>{
  const d=fixture();
  d.separationItems[1].state="separated";
  d.completion.deliverable_order_item_ids=["rice","soap"];
  d.completion.original_total=262;
  d.completion.final_total=262;
  d.completion.missing_subtotal=0;
  d.completion.original_other_expenses=32;
  d.order.total=262;
  d.order.other_expenses=32;
  d.reservations[1].status="consumed";
  const v=reconcile(d);
  assert.equal(v.ok,true,JSON.stringify(v));
  assert.equal(v.snapshot.commercial_delta_cents,3200);
  assert.equal(v.snapshot.commercial_delta_classified_cents,3200);
});

test("R06 accepts an attributed order discount, including a missing product",()=>{
  const d=fixture();
  d.completion.original_total=210;
  d.completion.final_total=178;
  d.completion.original_discount=20;
  d.order.total=178;
  d.order.discount=20;
  const r=reconcile(d);
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.snapshot.commercial_delta_cents,-2000);
  assert.equal(r.snapshot.commercial_delta_classified_cents,-2000);
});

blocks("R06 rejects unexplained hidden basket price",d=>{
  d.completion.original_total=255;d.completion.final_total=223;d.order.total=223;
},"commercial_delta_unattributed");

blocks("R06 does not silently preserve hidden per-product price on missing goods",d=>{
  d.completion.original_total=262;d.completion.final_total=230;d.order.total=230;
  d.order.basket_hidden_adjustment=32;d.completion.original_basket_hidden_adjustment=32;
},"hidden_adjustment_with_missing_items_requires_review");

test("R06 treats basket parent as PRESENTATION, never double charges kit components",()=>{
  const d=fixture();
  const parent=row("basket-header",null,1,230,"basket");
  d.orderItems.push(parent);
  d.separationItems.push(sep(parent,"separated",230));
  d.completion.deliverable_order_item_ids.push("basket-header");
  const v=reconcile(d);
  assert.equal(v.ok,false,"missing component lineage requires explicit basket component");
  assert.ok(v.blockers.includes("basket_without_components"));
  d.orderItems[0].metadata.history_kind="basket_component";
  d.orderItems[1].metadata.history_kind="basket_component";
  const corrected=reconcile(d);
  assert.equal(corrected.ok,true,JSON.stringify(corrected));
  assert.deepEqual(corrected.snapshot.delivered_order_item_ids,["rice"]);
  assert.equal(corrected.snapshot.physical_line_cents,19800);
});

test("R06 respects preassembled basket kit stock; consumes only loose residual",()=>{
  const d=fixture();
  d.orderItems[0].metadata.history_kind="basket_component";
  d.orderItems[0].metadata.preassembled_units=2;
  d.reservations[0].quantity=1;
  const v=reconcile(d);
  assert.equal(v.ok,true,JSON.stringify(v));
  assert.deepEqual(v.snapshot.expected_loose_stock,[{product_id:"product-rice",quantity:1}]);
});

test("R06 protects fixed cleaning-kit stock with basket_mold_component too",()=>{
  const d=fixture();
  d.orderItems[0].metadata.history_kind="basket_mold_component";
  d.orderItems[0].metadata.preassembled_units=2;
  d.reservations[0].quantity=1;
  const v=reconcile(d);
  assert.equal(v.ok,true,JSON.stringify(v));
  assert.deepEqual(v.snapshot.expected_loose_stock,[{product_id:"product-rice",quantity:1}]);
});

test("R06 optional gate is OFF and only protects final snapshot before Bling hub",()=>{
  const source=fs.readFileSync("supabase/functions/admin-products-live-v1/index.ts","utf8");
  assert.match(source,/ORDER_R6_FINAL_SNAPSHOT_GUARD_ENABLED/);
  assert.match(source,/Deno\.env\.get\("ORDER_R6_FINAL_SNAPSHOT_GUARD_ENABLED"\)\|\|""/);
  assert.match(source,/reconcileSeparatedCommercialOrder\(/);
  assert.match(source,/commercial_reconciliation_blocked:/);
  const build=source.slice(source.indexOf("async function buildSnapshot("),source.indexOf("async function previewOrder("));
  assert.ok(build.indexOf("reconcileSeparatedCommercialOrder(")<build.indexOf("return {source_order_id:"),
    "preflight must block snapshot output before sending to Bling");
  assert.match(build,/individual-verdict\.snapshot\.physical_line_cents/);
});
