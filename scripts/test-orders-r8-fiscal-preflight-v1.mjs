import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {evaluateOrderFiscalR8} from "../supabase/functions/_shared/order-fiscal-r8-preflight-v1.mjs";
const oid="00000000-0000-4000-8000-000000000050",
  pid="00000000-0000-4000-8000-000000000152",
  taxRuleId="00000000-0000-4000-8000-000000000900",hash="c".repeat(64);
const clock="2026-10-08T22:00:00-04:00";
function ready(){
  const manifest={ok:true,ready:true,order_id:oid,public_order_number:"08|10|2026 - 005",
    blockers:[],financial:{
      original_total:160,missing_subtotal:20,final_total:140,final_fiscal_subtotal:130,
      other_expenses:12,discount:2,basket_hidden_adjustment:10
    },lines:[
      {order_item_id:"00000000-0000-4000-8000-000000000051",
       product_id:null,state:"separated",display_only:true,deliverable:false,
       quantity:1,unit_price:0,line_total:0,history_kind:"basket",name:"CESTA"},
      {order_item_id:"00000000-0000-4000-8000-000000000052",
       product_id:pid,state:"separated",display_only:false,deliverable:true,
       quantity:2,unit_price:70,line_total:140,history_kind:"basket_component",name:"ALIMENTO"},
      {order_item_id:"00000000-0000-4000-8000-000000000053",
       product_id:"00000000-0000-4000-8000-000000000153",
       state:"missing",display_only:false,deliverable:false,quantity:1,unit_price:20,
       line_total:20,history_kind:"basket_component",name:"SABAO FALTANTE"}
    ]};
  return {
    as_of:clock,
    order:{id:oid,order_number:"08|10|2026 - 005",status:"ready",total:140,
      fiscal_subtotal:130,other_expenses:12,discount:2,basket_hidden_adjustment:10,
      bling_order_id:1001},
    completion:{order_id:oid,phase:"completed",completed_at:clock,
      metadata:{stock_applied:true,r6_reconciliation:manifest}},
    r7_intent:{order_id:oid,manifest:structuredClone(manifest),status:"verified",payload_hash:hash,bling_order_id:1001},
    order_bling_link:{source_id:oid,status:"matched",bling_id:1001},
    fiscal_control:{fiscal_status:"ready",dispatch_fiscal_status:"pending"},
    existing_fiscal_jobs:[],
    fiscal_runtime:{enabled:true,bling_invoice_prepare_enabled:true,
      execution_mode:"homologation",require_fiscal_authorization_before_dispatch:true},
    bling_runtime:{hub_enabled:true,orders_enabled:true},
    active_rule_sets:[{status:"active",activated_at:"2026-10-01T00:00:00Z",
      jurisdiction:"MT",tax_kind:"icms",valid_to:null}],
    fiscal_profiles:[{product_id:pid,ncm:"10063021",cest:"1700100",origin_code:0,
      st_status:"applicable",matched_st_rule_id:taxRuleId,
      review_status:"auto_validated",validated_at:clock,open_issue_count:0}],
    product_links:[{source_id:pid,status:"matched",bling_id:555}],
    approved_sales_tax_rules:[{product_id:pid,approved:true,approved_at:clock,
      cfop:"5102",icms_kind:"CSOSN",icms_code:"102"}],
    bling_remote_evidence:{source:"bling_get",bling_order_id:1001,
      r7_payload_hash:hash,checked_at:clock,commercial_match:true,invoice_linked:false}
  };
}
const clone=v=>structuredClone(v);
function expectBlock(mutator,block){
  const x=ready();mutator(x);
  const r=evaluateOrderFiscalR8(x);
  assert.equal(r.ready,false,block+" expected");
  assert.ok(r.blockers.includes(block),JSON.stringify({block,got:r.blockers}));
}
test("R08 approves only fully-specified synthetic basket after separated final total",()=>{
  const r=evaluateOrderFiscalR8(ready());
  assert.equal(r.ready,true,JSON.stringify(r.blockers));
  assert.deepEqual(r.blockers,[]);
  assert.equal(r.line_counts.picked,1);
  assert.equal(r.line_counts.missing,1);
  assert.equal(r.monetary.total_cents,14000);
  assert.equal(r.monetary.product_lines_cents,14000);
  assert.equal(r.monetary.hidden_adjustment_cents,1000);
  assert.equal(r.order_number,"08|10|2026 - 005");
  assert.equal(r.external_write,false);
  assert.equal(r.invoice_created,false);
});
test("R08 blocks missing proof, stale or changed frozen manifest, and wrong Bling order",()=>{
  expectBlock(x=>{x.completion.metadata.stock_applied=false},"physical_separation_not_completed");
  expectBlock(x=>{x.completion.phase="prepared"},"physical_separation_not_completed");
  expectBlock(x=>{x.r7_intent.status="uncertain"},"r7_bling_order_not_verified");
  expectBlock(x=>{x.r7_intent.payload_hash="bad"},"r7_bling_order_not_verified");
  expectBlock(x=>{x.r7_intent.manifest.financial.final_total=139},"manifest_changed_after_bling_sync");
  expectBlock(x=>{x.order.bling_order_id=1002},"bling_order_identity_mismatch");
  expectBlock(x=>{x.order.status="out_for_delivery"},"order_not_ready");
});
test("R08 blocks fiscal value drift and duplicate priced basket contents",()=>{
  expectBlock(x=>{x.order.total=141},"fiscal_total_reconciliation_failed");
  expectBlock(x=>{x.order.fiscal_subtotal=140},"fiscal_total_reconciliation_failed");
  expectBlock(x=>{x.order.basket_hidden_adjustment=0},"r6_commercial_adjustments_mismatch");
  expectBlock(x=>{x.completion.metadata.r6_reconciliation.lines[1].quantity=0},
    "picked_item_price_or_quantity_invalid");
  expectBlock(x=>{x.completion.metadata.r6_reconciliation.lines.push(
    clone(x.completion.metadata.r6_reconciliation.lines[1]))},
    "duplicate_or_invalid_picked_item");
});
test("R08 CEST is conditional; NCM/origin/ST decision must be validated",()=>{
  expectBlock(x=>{x.fiscal_profiles[0].ncm="12345"},"product_ncm_missing_or_invalid");
  expectBlock(x=>{x.fiscal_profiles[0].origin_code=null},"product_origin_missing");
  expectBlock(x=>{x.fiscal_profiles[0].st_status="candidate"},"st_applicability_undetermined");
  expectBlock(x=>{x.fiscal_profiles[0].st_status="applicable";x.fiscal_profiles[0].cest=null},
    "cest_required_for_st_item");
  expectBlock(x=>{x.fiscal_profiles[0].matched_st_rule_id=null},
    "st_legal_rule_not_validated");
  const x=ready();x.fiscal_profiles[0].st_status="not_applicable";
  x.fiscal_profiles[0].cest=null;
  assert.equal(evaluateOrderFiscalR8(x).ready,true,"CEST must NOT be demanded universally");
});
test("R08 unapproved sale tax classification, missing NCM profile or open evidence issues fail",()=>{
  expectBlock(x=>{x.approved_sales_tax_rules=[]},"sales_tax_rule_unapproved");
  expectBlock(x=>{x.approved_sales_tax_rules[0].cfop="999"},"sales_tax_rule_unapproved");
  expectBlock(x=>{x.approved_sales_tax_rules[0].icms_code="1"},"sales_tax_rule_unapproved");
  expectBlock(x=>{x.fiscal_profiles=[]},"product_fiscal_profile_missing");
  expectBlock(x=>{x.fiscal_profiles[0].review_status="pending"},"product_fiscal_not_approved");
  expectBlock(x=>{x.fiscal_profiles[0].open_issue_count=3},"product_fiscal_issues_open");
  expectBlock(x=>{x.fiscal_profiles[0].open_issue_count=null},"product_readiness_evidence_missing");
  expectBlock(x=>{x.product_links[0].bling_id=0},"bling_product_link_unverified");
});
test("R08 rejects an unapproved legal rule set and disabled dispatch gate",()=>{
  expectBlock(x=>{x.active_rule_sets[0].status="draft"},"active_mt_tax_rules_not_approved");
  expectBlock(x=>{x.active_rule_sets=[]},"active_mt_tax_rules_not_approved");
  expectBlock(x=>{x.fiscal_runtime.require_fiscal_authorization_before_dispatch=false},
    "dispatch_fiscal_authorization_gate_disabled");
  expectBlock(x=>{x.fiscal_runtime.enabled=false},"fiscal_runtime_not_ready");
  expectBlock(x=>{x.bling_runtime.hub_enabled=false},"bling_order_hub_not_ready");
});
test("R08 cannot duplicate existing invoice or pending fiscal worker",()=>{
  expectBlock(x=>{x.fiscal_control.bling_invoice_id=123},"invoice_already_exists_reconcile_only");
  expectBlock(x=>{x.fiscal_control.dispatch_fiscal_status="authorized"},"invoice_already_exists_reconcile_only");
  expectBlock(x=>{x.existing_fiscal_jobs.push({status:"processing"})},
    "fiscal_job_already_exists_reconcile_only");
});
test("R08 fresh real GET required; no fabricated remote verification",()=>{
  expectBlock(x=>{x.bling_remote_evidence=null},"fresh_bling_order_readback_required");
  expectBlock(x=>{x.bling_remote_evidence.commercial_match=false},"fresh_bling_order_readback_required");
  expectBlock(x=>{x.bling_remote_evidence.invoice_linked=true},"fresh_bling_order_readback_required");
  expectBlock(x=>{x.bling_remote_evidence.checked_at="2026-10-08T21:40:00-04:00"},
    "fresh_bling_order_readback_required");
  expectBlock(x=>{x.bling_remote_evidence.r7_payload_hash="e".repeat(64)},
    "fresh_bling_order_readback_required");
});
test("R08 Admin source is guarded, read-only and intentionally has no auto-issue call",()=>{
  const admin=fs.readFileSync("supabase/functions/admin-products-live-v1/index.ts","utf8");
  const start=admin.indexOf("async function orderFiscalR8Preview(");
  const end=admin.indexOf("async function orderSeparationComplete(",start);
  const section=admin.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.match(admin,/ORDER_R8_FISCAL_PREFLIGHT_ENABLED=\(Deno\.env\.get\("ORDER_R8_FISCAL_PREFLIGHT_ENABLED"\)\|\|""\)\.trim\(\)==="true"/);
  assert.match(admin,/order_fiscal_r8_preflight/);
  assert.match(section,/db\.from\("product_fiscal_profiles"\)/);
  assert.match(section,/db\.from\("fiscal_rule_sets"\)/);
  assert.match(section,/approved_sales_tax_rules:\[\]/);
  assert.match(section,/bling_remote_evidence:null/);
  assert.doesNotMatch(section,/autoIssueFiscalAfterSeparation|fiscal_dispatch_canary_human_execute|ops2_fiscal_dispatch_preflight_v1|\.insert\(|\.update\(|\.upsert\(/);
});


test("R08 flag enforces fiscal gate before BOTH manual and legacy auto issue",()=>{
  const admin=fs.readFileSync("supabase/functions/admin-products-live-v1/index.ts","utf8");
  const human=admin.slice(admin.indexOf("async function orderFiscalIssueV4("),
    admin.indexOf("async function orderDispatchStartV4("));
  const auto=admin.slice(admin.indexOf("async function autoIssueFiscalAfterSeparation("),
    admin.indexOf("async function runR7BlingReconciliation("));
  for(const [name,section] of [["human",human],["automatic",auto]]){
    assert.match(section,/if\(ORDER_R8_FISCAL_PREFLIGHT_ENABLED\)/,name);
    assert.match(section,/await orderFiscalR8Preview\(oid,/,name);
    assert.ok(section.indexOf("await orderFiscalR8Preview")<
      section.indexOf('db.rpc("ops2_fiscal_dispatch_preflight_v1"'),name+" checks R08 first");
  }
  assert.match(human,/r8_fiscal_preflight_blocked/);
  assert.match(auto,/r8_fiscal_preflight_blocked/);
  assert.match(human,/confirmation.*EMITIR_NFE/);
});
