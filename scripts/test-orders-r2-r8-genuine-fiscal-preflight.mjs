// R02-R08: exercise the ORIGINAL R08 read-only validator with receipts
// genuinely created by the ORIGINAL R02 checkout -> Meta R04/R05 gates ->
// real R06 completion -> original R07 verified/uncertain SQL transitions.
// All provider/CFOP/tax evidences here are EXPLICITLY SYNTHETIC; the
// production R08 Admin intentionally lacks tax attestation and GET evidence.
import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluateOrderFiscalR8 } from "../r08-source/supabase/functions/_shared/order-fiscal-r8-preflight-v1.mjs";
const path=process.argv[2];
if(!path)throw Error("path_to_genuine_R07_receipts_required");
const rows=fs.readFileSync(path,"utf8").trim().split(/\r?\n/).map(JSON.parse);
assert.equal(rows.length,2);
const byKind=Object.fromEntries(rows.map(x=>[x.kind,x]));
assert.deepEqual(Object.keys(byKind).sort(),["basket","mold"]);
const clock="2026-10-09T12:00:00-04:00";
const extra=id=>({
  // All these credentials and approvals exist ONLY in the test process,
  // are intentionally not stored into the CI database or source project.
  fiscal_control:{},existing_fiscal_jobs:[],
  fiscal_runtime:{enabled:true,execution_mode:"homologation",
    bling_invoice_prepare_enabled:true,
    require_fiscal_authorization_before_dispatch:true},
  bling_runtime:{hub_enabled:true,orders_enabled:true},
  active_rule_sets:[{status:"active",activated_at:"2026-10-01T12:00:00Z",
    jurisdiction:"MT",tax_kind:"icms",valid_to:null}],
  approved_sales_tax_rules:[],
  product_links:[],fiscal_profiles:[],
  bling_remote_evidence:null,
  as_of:clock
});
function input(row){
  assert.ok(row.order.id);
  assert.equal(row.completion.order_id,row.order.id);
  assert.equal(row.r7_intent.order_id,row.order.id);
  const preflight={order:row.order,completion:row.completion,
    r7_intent:row.r7_intent,
    order_bling_link:{source_id:row.order.id,bling_id:row.order.bling_order_id,
      status:"matched"},...extra(row.order.id)};
  return preflight;
}
function addSyntheticProof(input){
  // Mirrors the structure of an authorized tax classification and read-back;
  // does NOT imply that a real tax accountant or provider approved anything.
  const manifest=input.completion.metadata.r6_reconciliation;
  const items=manifest.lines.filter(x=>x.state==="separated"&&x.deliverable===true);
  assert.equal(items.length,1,"one genuine picked product after shortage");
  input.fiscal_profiles=items.map(x=>({product_id:x.product_id,
    ncm:"10063021",origin_code:0,
    review_status:"auto_validated",validated_at:clock,
    open_issue_count:0,st_status:"not_applicable",cest:null}));
  input.product_links=items.map((x,i)=>({
    source_id:x.product_id,bling_id:555+i,status:"matched"}));
  input.approved_sales_tax_rules=items.map(x=>({
    product_id:x.product_id,approved:true,approved_at:clock,
    cfop:"5102",icms_kind:"CSOSN",icms_code:"102"}));
  input.bling_remote_evidence={
    source:"bling_get",commercial_match:true,
    bling_order_id:input.r7_intent.bling_order_id,
    r7_payload_hash:input.r7_intent.payload_hash,
    invoice_linked:false,checked_at:clock};
  return input;
}
function assertBlocked(input,code,caseName){
  const result=evaluateOrderFiscalR8(input);
  assert.equal(result.ready,false,caseName+" must not release NF-e");
  assert.ok(result.blockers.includes(code),
    caseName+" missing "+code+": "+JSON.stringify(result.blockers));
  assert.equal(result.external_write,false);
  assert.equal(result.invoice_created,false);
}
const basket=input(byKind.basket);
assert.equal(basket.order.total,140);
assert.equal(basket.r7_intent.status,"verified");
assert.equal(basket.order.order_number,
  basket.completion.metadata.r6_reconciliation.public_order_number);
let negative=evaluateOrderFiscalR8(basket);
for(const code of ["product_fiscal_profile_missing",
  "active_mt_tax_rules_not_approved",
  "fresh_bling_order_readback_required"]){
 assert.ok(negative.blockers.includes(code),
   "original R08 must be fail closed without external approval: "+code);
}
assert.equal(negative.ready,false);
assert.equal(negative.invoice_created,false);
const noApprovedSaleTax=addSyntheticProof(input(structuredClone(byKind.basket)));
noApprovedSaleTax.approved_sales_tax_rules=[];
assertBlocked(noApprovedSaleTax,"sales_tax_rule_unapproved",
  "product profile exists but outbound CFOP/CSOSN approval absent");
console.log("PASS REAL R02-R07 basket, R08 requires real fiscal approval and Bling GET");

const fullySynthetic=addSyntheticProof(input(byKind.basket));
const accepted=evaluateOrderFiscalR8(fullySynthetic);
assert.equal(accepted.ready,true,
  "R08 positive ONLY with explicit synthetic tax and remote evidence: "+JSON.stringify(accepted.blockers));
assert.equal(accepted.line_counts.picked,1);
assert.equal(accepted.line_counts.missing,1);
assert.equal(accepted.monetary.total_cents,14000);
assert.equal(accepted.monetary.product_lines_cents,5000);
assert.equal(accepted.monetary.commercial_delta_cents,9000);
assert.equal(accepted.order_number,byKind.basket.order.order_number);
assert.equal(accepted.invoice_created,false);
console.log("PASS R08 pure evaluator with 100% synthetic fiscal and GET attestation");

const changes=[
 ["invoice_already_exists_reconcile_only",x=>x.fiscal_control.bling_invoice_id=999,"prior invoice"],
 ["fiscal_total_reconciliation_failed",x=>x.order.total=141,"wrong checkout total"],
 ["manifest_changed_after_bling_sync",x=>
    x.r7_intent.manifest.financial.final_total=139,"altered R06 receipt"],
 ["r7_bling_order_not_verified",x=>x.r7_intent.status="uncertain","uncertain Bling"],
 ["product_ncm_missing_or_invalid",x=>x.fiscal_profiles[0].ncm="123","invalid NCM"],
 ["sales_tax_rule_unapproved",x=>x.approved_sales_tax_rules=[],"tax approval missing"],
 ["st_applicability_undetermined",x=>x.fiscal_profiles[0].st_status="unknown","ST ambiguous"],
 ["cest_required_for_st_item",x=>x.fiscal_profiles[0].st_status="applicable","CEST required"],
 ["fiscal_runtime_not_ready",x=>x.fiscal_runtime.enabled=false,"runtime disabled"],
 ["dispatch_fiscal_authorization_gate_disabled",
  x=>x.fiscal_runtime.require_fiscal_authorization_before_dispatch=false,"gate disabled"],
 ["active_mt_tax_rules_not_approved",x=>x.active_rule_sets=[],"draft-only MT rules"],
 ["fresh_bling_order_readback_required",x=>x.bling_remote_evidence.checked_at="2026-10-09T11:45:00-04:00",
  "stale GET evidence"],
 ["bling_order_identity_mismatch",x=>x.order.bling_order_id=999,"wrong sale"],
 ["fiscal_job_already_exists_reconcile_only",x=>x.existing_fiscal_jobs=[{status:"processing"}],
  "existing job"],
];
for(const [code,edit,name] of changes){
  const payload=addSyntheticProof(input(structuredClone(byKind.basket)));
  edit(payload);assertBlocked(payload,code,name);
}
const mold=input(byKind.mold);
assert.equal(mold.order.total,75);
assert.equal(mold.r7_intent.status,"uncertain");
assertBlocked(mold,"r7_bling_order_not_verified","uncertain original R07 mold");
assert.equal(mold.completion.metadata.r6_reconciliation.public_order_number,
  mold.order.order_number);
console.log("PASS R08: 14 negative controls + genuine uncertain mold; no invoice dispatched");
// Guard against accidentally wiring real host actions into the CI.
const workflow=fs.readFileSync(
  ".github/workflows/orders-r2-r8-fiscal-chain-ci.yml","utf8");
assert.match(workflow,/FISCAL_LIVE_ENABLED: 'false'/);
assert.match(workflow,/R08_FISCAL_PRODUCTION_ENABLED: 'false'/);
assert.doesNotMatch(workflow,/curl.*bling\.com\.br|fiscal_dispatch_canary_human_execute/);
