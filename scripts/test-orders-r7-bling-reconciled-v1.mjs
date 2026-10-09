import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildReconciledBlingSnapshot,
  fingerprintBlingPayload,stableJson,eligiblePostCheckoutShortageBelowMinimum
} from "../supabase/functions/_shared/order-bling-r7-manifest-v1.mjs";
const pid="00000000-0000-4000-8000-000000000152";
const missing="00000000-0000-4000-8000-000000000153";
const oid="00000000-0000-4000-8000-000000000050";
const lines=[
  {order_item_id:"00000000-0000-4000-8000-000000000051",product_id:null,
   state:"separated",display_only:true,deliverable:false,
   history_kind:"basket",quantity:1,unit_price:0,line_total:0,name:"CESTA"},
  {order_item_id:"00000000-0000-4000-8000-000000000052",product_id:pid,
   state:"separated",display_only:false,deliverable:true,
   history_kind:"basket_component",quantity:2,unit_price:70,line_total:140,name:"ALIMENTO"},
  {order_item_id:"00000000-0000-4000-8000-000000000053",product_id:missing,
   state:"missing",display_only:false,deliverable:false,
   history_kind:"basket_component",quantity:1,unit_price:20,line_total:20,name:"SABAO FALTANTE"}
];
const financial={original_total:160,missing_subtotal:20,final_total:140,
  original_subtotal:150,final_subtotal:130,
  original_fiscal_subtotal:150,final_fiscal_subtotal:130,
  discount:2,other_expenses:12,basket_hidden_adjustment:10};
const manifest={ok:true,ready:true,order_id:oid,public_order_number:"08|10|2026 - 005",
  blockers:[],financial,lines};
const base={source_order_id:oid,order_number:"08|10|2026 - 005",status:"ready",
  customer:{name:"CLIENTE FICTICIO"},delivery:{street:"RUA FAKE"},
  payment:{method:"pix"},queue_reason:"separation_completed",
  items:[{product_id:pid,sku:"ARZ-1",gtin:"0000000000000",name:"ARROZ",
    quantity:99,unit_price_cents:200},{product_id:missing,quantity:1,unit_price_cents:2000}],
  totals:{commercial_order_cents:14000,individual_products_cents:19800,
    commercial_delta_cents:-5800}};
const clone=v=>structuredClone(v);
test("R07 sends exactly separated R06 quantities; no basket visual row or missing item",()=>{
  const snap=buildReconciledBlingSnapshot(base,manifest);
  assert.equal(snap.items.length,1);
  assert.equal(snap.items[0].product_id,pid);
  assert.equal(snap.items[0].quantity,2);
  assert.equal(snap.items[0].unit_price_cents,7000);
  assert.equal(snap.items[0].source_kind,"basket_component");
  assert.equal(snap.totals.individual_products_cents,14000);
  assert.equal(snap.totals.commercial_order_cents,14000);
  assert.equal(snap.totals.commercial_delta_cents,0);
  assert.equal(snap.r7_reconciliation.missing_line_count,1);
  assert.equal(snap.r7_reconciliation.discount_cents,200);
  assert.equal(snap.r7_reconciliation.other_expenses_cents,1200);
  assert.equal(snap.r7_reconciliation.basket_hidden_adjustment_cents,1000);
  assert.equal(snap.order_number,"08|10|2026 - 005");
  assert.equal(snap.queue_reason,"ean_verified");
});
test("R07 actual picked quantity wins over stale order_items; stable hashes",async()=>{
  const snap=buildReconciledBlingSnapshot(base,manifest);
  const reversed={...manifest,financial:{...financial},lines:clone(lines).reverse()};
  const v=buildReconciledBlingSnapshot(base,reversed);
  assert.deepEqual(v.items,snap.items);
  assert.equal(await fingerprintBlingPayload(v),await fingerprintBlingPayload(snap));
  assert.equal((await fingerprintBlingPayload(snap)).length,64);
  assert.equal(stableJson({z:1,a:2}),stableJson({a:2,z:1}));
});
test("R07 rejects wrong order, unready, pending and false deliverability",()=>{
  for(const changes of [
    {order_id:"00000000-0000-4000-8000-000000000060"},
    {ready:false},
    {blockers:["pending_items"]},
    {lines:[...lines,{...lines[1],order_item_id:"00000000-0000-4000-8000-000000000054",state:"pending",deliverable:false}]},
    {lines:lines.map((x,i)=>i===2?{...x,deliverable:true}:x)}
  ]){
    const m={...manifest,...changes};
    assert.throws(()=>buildReconciledBlingSnapshot(base,m));
  }
});
test("R07 rejects stale total, bad quantity, duplicate items and fake pricing",()=>{
  assert.throws(()=>buildReconciledBlingSnapshot({...base,totals:{commercial_order_cents:15000}},manifest),/stale/);
  for(const bad of [
    {quantity:0},{quantity:1.0005},{product_id:null},{line_total:139},
    {unit_price:-1},{line_total:"NaN"}
  ]){
    const m={...manifest,lines:lines.map((x,i)=>i===1?{...x,...bad}:x)};
    assert.throws(()=>buildReconciledBlingSnapshot(base,m));
  }
  assert.throws(()=>buildReconciledBlingSnapshot(base,
    {...manifest,lines:[...lines,clone(lines[1])]}),/duplicated/);
});
test("R07 handles commercial delta without adding hidden fees twice",()=>{
  const m={...manifest,financial:{...financial,final_total:142,original_total:162}};
  const b={...base,totals:{commercial_order_cents:14200}};
  const snap=buildReconciledBlingSnapshot(b,m);
  assert.equal(snap.totals.individual_products_cents,14000);
  assert.equal(snap.totals.commercial_delta_cents,200);
  assert.equal(snap.r7_reconciliation.other_expenses_cents,1200);
  assert.equal(snap.r7_reconciliation.discount_cents,200);
  // Remote existing hub only applies commercial_delta_cents, not each fee again.
});
test("R07 integrates ONLY after completion, default-off, with SQL claim before hub write",()=>{
  const s=fs.readFileSync("supabase/functions/admin-products-live-v1/index.ts","utf8");
  const start=s.indexOf("async function runR7BlingReconciliation(");
  const end=s.indexOf("async function runSeparationPostCompletionIntegrations(",start);
  const sub=s.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(s,/ORDER_R7_BLING_MANIFEST_ENABLED=\(Deno.env.get\("ORDER_R7_BLING_MANIFEST_ENABLED"\)\|\|""\)\.trim\(\)==="true"/);
  assert.match(s,/buildReconciledBlingSnapshot\(baseline,receipt\)/);
  assert.ok(sub.indexOf("ops2_claim_bling_r7_sync_v1")<sub.indexOf('await hub("ops2_ensure_order_state"'));
  assert.match(sub,/ops2_finish_bling_r7_sync_v1/);
  assert.match(sub,/p_status:success\?"verified":"uncertain"/);
  assert.match(s,/stage:"awaiting_r08_fiscal_preflight"/);
});
test("R07 SQL ledger is private and uncertain outcome cannot auto-retry",()=>{
  const sql=fs.readFileSync("supabase/sql/orders-r7-bling-manifest-sync-contract-v1.sql","utf8");
  assert.match(sql,/order_id uuid PRIMARY KEY REFERENCES public\.orders/i);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql,/FROM PUBLIC,anon,authenticated/i);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.ops2_claim_bling_r7_sync_v1\(uuid,text\)\s+TO service_role/i);
  assert.match(sql,/j\.manifest IS DISTINCT FROM v_manifest/i);
  assert.match(sql,/IF j\.status<>'pending' THEN/i);
  assert.match(sql,/r7_remote_reconciliation_required/i);
  assert.match(sql,/verified_bling_order_id_required/i);
});


test("R07 permits below R$75 ONLY when a once-valid checkout has proven missing goods",()=>{
  const payload={
    source_order_id:oid,status:"ready",queue_reason:"ean_verified",
    r7_reconciliation:{source:"frozen_r6_manifest",order_id:oid,
      original_total_cents:8500,missing_subtotal_cents:2000,final_total_cents:6500}
  };
  const receipt={phase:"completed",metadata:{stock_applied:true,
    r6_reconciliation:{ok:true,ready:true,order_id:oid,blockers:[],
      financial:{original_total:85,missing_subtotal:20,final_total:65}}}};
  assert.equal(eligiblePostCheckoutShortageBelowMinimum(payload,receipt,6500),true);
  for(const [changed,rec,final] of [
    [{...payload,status:"confirmed"},receipt,6500],
    [{...payload,queue_reason:"approved_early_order"},receipt,6500],
    [{...payload,r7_reconciliation:{...payload.r7_reconciliation,original_total_cents:7400}},receipt,6500],
    [{...payload,r7_reconciliation:{...payload.r7_reconciliation,missing_subtotal_cents:0}},receipt,6500],
    [payload,{...receipt,phase:"prepared"},6500],
    [payload,{...receipt,metadata:{...receipt.metadata,stock_applied:false}},6500],
    [payload,{...receipt,metadata:{...receipt.metadata,
      r6_reconciliation:{...receipt.metadata.r6_reconciliation,
        financial:{original_total:83,missing_subtotal:20,final_total:63}}}},6500],
    [payload,receipt,7500],
    [{...payload,source_order_id:"00000000-0000-4000-8000-000000000060"},receipt,6500]
  ])assert.equal(eligiblePostCheckoutShortageBelowMinimum(changed,rec,final),false);
});

test("remote Bling preflight still rejects new under-minimum orders",()=>{
  const source=fs.readFileSync("supabase/functions/admin-service-intelligence-v1/index.ts","utf8");
  assert.match(source,/if\(Number\.isFinite\(orderTotal\)&&orderTotal<7500\)/);
  assert.match(source,/queueReason==="ean_verified"/);
  assert.match(source,/order_separation_completions_v1/);
  assert.match(source,/eligiblePostCheckoutShortageBelowMinimum\(\s*payload,receipt\.data,orderTotal/);
  assert.match(source,/if\(!provenPostCheckoutShortage\)operationalBlockers\.push\("minimum_order_not_met"\)/);
});
