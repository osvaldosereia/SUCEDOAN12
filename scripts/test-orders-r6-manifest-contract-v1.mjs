import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql=fs.readFileSync("supabase/sql/orders-r6-picked-manifest-contract-v1.sql","utf8");
const api=fs.readFileSync("supabase/functions/admin-products-live-v1/index.ts","utf8");
const main=api.slice(api.indexOf("async function orderSeparationComplete("),
  api.indexOf("async function completeDeliveryV3("));

test("R06 full picked-line manifest records actual separated states without sending to Bling",()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.ops2_preview_order_reconciliation_v1/i);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.ops2_record_order_reconciliation_v1/i);
  assert.match(sql,/state='separated'/i);
  assert.match(sql,/state='missing'/i);
  assert.match(sql,/deliverable.*state='separated'/i);
  assert.match(sql,/basket_hidden_adjustment/i);
  assert.match(sql,/original_other_expenses/i);
  assert.match(sql,/original_discount/i);
  assert.doesNotMatch(sql,/(?:http|https):\/\//i);
  assert.doesNotMatch(sql,/fiscal_dispatch_canary_human_execute/i);
});
test("R06 detects all-missing orders, bad basket pricing, duplicate reservations",()=>{
  for(const blocker of [
    "no_deliverable_items","duplicate_reservations_for_product",
    "priced_basket_parent_duplicates_components",
    "missing_adjustment_exceeds_order_value",
    "order_item_mismatch","separation_incomplete",
    "invalid_item_amount_or_quantity"
  ]) assert.ok(sql.includes(blocker),"Missing guard: "+blocker);
  assert.match(sql,/SELECT count\(\*\) INTO v_duplicate_reservations/i);
  assert.match(sql,/AND status='reserved'/i);
  assert.match(sql,/display_only/i);
});
test("R06 manifest uses exactly-once durable metadata, not additional stock debits",()=>{
  assert.match(sql,/FROM public\.order_separation_completions_v1\s+WHERE order_id=p_order_id FOR UPDATE/i);
  assert.match(sql,/IF v_existing IS NOT NULL THEN/i);
  assert.match(sql,/r6_reconciliation_recorded_at/i);
  assert.match(sql,/r6_reconciliation',v_manifest/i);
  assert.match(sql,/invalid_reconciliation_phase/i);
  assert.doesNotMatch(sql,/UPDATE public\.vitrine_stock_reservations/i);
  assert.doesNotMatch(sql,/UPDATE public\.orders\s+SET/i);
});
test("R06 service-role-only and default OFF canary",()=>{
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.ops2_preview_order_reconciliation_v1\(uuid\)\s+FROM PUBLIC,anon,authenticated/i);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.ops2_record_order_reconciliation_v1\(uuid\)\s+FROM PUBLIC,anon,authenticated/i);
  assert.match(api,/ORDER_R6_RECONCILIATION_ENABLED=\(Deno\.env\.get\("ORDER_R6_RECONCILIATION_ENABLED"\)\|\|""\)\.trim\(\)==="true"/);
});
test("R06 preflight before financial prepare; freeze receipt before stock",()=>{
  const preview=main.indexOf("const preflight=await orderR6ManifestPreview(oid)");
  const prepared=main.indexOf("db.rpc(\"ops2_prepare_order_separation_completion_v2\"");
  const receipt=main.indexOf("const receipt=await orderR6ManifestRecord(oid)");
  const stock=main.indexOf("db.rpc(\"ops2_apply_order_separation_stock_v2\"");
  assert.ok(preview>=0&&prepared>preview&&receipt>prepared&&stock>receipt);
  assert.match(main,/await markSeparationNeedsAttention\(oid,"r6_reconciliation"/);
  assert.match(main,/const integrationTask=runSeparationPostCompletionIntegrations/);
  assert.match(main,/order_separation_completed/);
});
test("R06 uses R02's production-captured pure PostgreSQL functions",()=>{
  const f=fs.readFileSync("scripts/sql/orders-r6-canonical-separation-functions.sql","utf8");
  for(const name of [
    "ops2_prepare_order_separation_completion_v2",
    "ops2_apply_order_separation_stock_v2",
    "ops2_mark_order_separation_completion_v2"
  ]) assert.ok(f.includes("FUNCTION public."+name),name);
});
