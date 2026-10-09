import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {evaluateR14Readiness} from "./orders-r14-release-gate.mjs";
const clock="2026-10-09T18:00:00Z";
const original=JSON.parse(readFileSync("scripts/fixtures/orders-r14-release-evidence-20261009.json","utf8"));
const copy=x=>structuredClone(x);
const att=(date=clock)=>({verified:true,environment:"staging",
 ticket:"SIMULATED-ONLY-NOT-A-REAL-APPROVAL",
 source_url:"https://example.org/test-evidence",checked_at:date});
function mockComplete(){
 const x=copy(original);
 x.integration={merged_to_main:true,release_commit:"a".repeat(40),unmerged_pr_count:0,
  conflicting_migrations:0,staging_deploy:att()};
 x.schema={production_tables_checked:11,missing_critical_tables:0,rls_mismatches:0,
  missing_triggers:0,unsafe_public_privileges:0,default_acl_unreviewed:0,
  critical_rpc_signature_mismatches:0,attestation:att()};
 x.checkout={attestation:att(),real_checkout:true,minimum_75:true,
  concurrent_reservations:true,linked_food_hygiene:true,mold_hidden_values:true,
  weekly_immutable_number:true,stock_authority_reconciled:true};
 x.meta={attestation:att(),replay_deduplicated:true,channels:[
  {phone_suffix:"0975",utility_template_approved:true,signed_webhook_test:true,
   confirm_button_accepted:true,plain_text_rejected:true},
  {phone_suffix:"1018",utility_template_approved:true,signed_webhook_test:true,
   confirm_button_accepted:true,plain_text_rejected:true}
 ]};
 x.bling={attestation:att(),verified_order_id:12345,order_readback_match:true,
  picked_only_lines:true,receipt_hash_stable:true,
  no_duplicate_post_after_timeout:true,existing_order_id_reused:true};
 x.fiscal={tax_approval:{...att(),responsible_role:"accounting_qualified"},
  cfop_validated:true,cst_csosn_validated:true,ncm_cest_validated:true,
  ibs_cbs_regime_reviewed:true,payment_treatment_validated:true,
  sefaz_attestation:{...att(),protocol_reference:"SIMULATED-ONLY"},
  single_generation_claim:true,no_reissue_on_timeout:true,
  xml_received_from_bling:true,access_key_and_cstat_validated:true,
  authorized_sefaz_protocol_verified:true};
 x.delivery={attestation:att(),proof_before_loading:true,
  proof_before_driver_handoff:true,split_payment_supported:true,
  return_blocks_release:true,driver_reconciliation:true,
  status_reaches_delivered:true};
 x.rollout={attestation:att(),backup_restored_in_staging:true,
  migration_rollback_rehearsed:true,monitoring_alarms_tested:true,
  failure_injection_passed:true,operator_signoff:true,
  tax_responsible_signoff:true,canary_scope_approved:true,
  rollback_runbook_url:"https://example.org/test-rollback"};
 return x;
}
test("R14 real checkpoint remains BLOCKED even when synthetic CI passed",()=>{
 const r=evaluateR14Readiness(original,{asOf:clock});
 assert.equal(r.status,"blocked");
 assert.equal(r.eligible_for_review,false);
 assert.equal(r.total,9);
 assert.equal(r.blockers.length,9);
 assert.equal(r.deployment_authorized,false);
 assert.equal(r.production_changes_performed,false);
 assert.equal(r.canary_automatically_enabled,false);
 assert.ok(r.blockers.includes("canonical_schema_rls_triggers"));
 assert.ok(r.blockers.includes("outbound_tax_rules"));
 assert.ok(r.blockers.includes("sefaz_authorization"));
});
test("R14 accepts internally complete mock checklist only for review, NEVER authorizes deployment",()=>{
 const r=evaluateR14Readiness(mockComplete(),{asOf:clock});
 assert.equal(r.status,"staging_release_candidate");
 assert.equal(r.eligible_for_review,true);
 assert.equal(r.blockers.length,0);
 assert.equal(r.deployment_authorized,false);
 assert.equal(r.canary_automatically_enabled,false);
});
test("R14 rejects green CI with 29 missing triggers and public TRUNCATE grants",()=>{
 const x=mockComplete();x.schema.missing_triggers=29;x.schema.unsafe_public_privileges=5;
 const r=evaluateR14Readiness(x,{asOf:clock});
 assert.deepEqual(r.blockers,["canonical_schema_rls_triggers"]);
});
test("R14 rejects false approved tax or fabricated Meta single channel",()=>{
 const x=mockComplete();x.fiscal.tax_approval.verified=false;
 x.meta.channels=x.meta.channels.slice(0,1);
 const r=evaluateR14Readiness(x,{asOf:clock});
 assert.ok(r.blockers.includes("outbound_tax_rules"));
 assert.ok(r.blockers.includes("meta_confirmation_both_channels"));
});
test("R14 rejects stale evidence, synthetic-only environment and forgeable URLs",()=>{
 const x=mockComplete();
 x.bling.attestation.checked_at="2026-09-01T00:00:00Z";
 x.checkout.attestation.environment="synthetic";
 x.delivery.attestation.source_url="file:///tmp/fake.json";
 const r=evaluateR14Readiness(x,{asOf:clock});
 for(const id of ["bling_deduplicated_sale","checkout_and_stock","dispatch_payment_and_return"])
  assert.ok(r.blockers.includes(id),id);
});
test("R14 rejects partial deployment and absent release approval even if fiscal review passes",()=>{
 const x=mockComplete();x.integration.unmerged_pr_count=1;
 x.rollout.operator_signoff=false;
 const r=evaluateR14Readiness(x,{asOf:clock});
 assert.ok(r.blockers.includes("merged_release_chain"));
 assert.ok(r.blockers.includes("controlled_canary_and_rollback"));
});
test("R14 rejects missing genuine SEFAZ protocol despite plausible Bling success",()=>{
 const x=mockComplete();x.fiscal.sefaz_attestation.protocol_reference=null;
 const r=evaluateR14Readiness(x,{asOf:clock});
 assert.deepEqual(r.blockers,["sefaz_authorization"]);
});
test("R14 rejects future-dated evidence beyond clock skew and malformed SHA",()=>{
 const x=mockComplete();x.integration.release_commit="main";
 x.meta.attestation.checked_at="2026-10-10T09:00:00Z";
 const r=evaluateR14Readiness(x,{asOf:clock});
 assert.ok(r.blockers.includes("merged_release_chain"));
 assert.ok(r.blockers.includes("meta_confirmation_both_channels"));
});
