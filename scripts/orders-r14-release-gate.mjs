#!/usr/bin/env node
// R14 - offline evidence gate. NO credentials, network, deployment or fiscal writes.
// Only a staged, externally verified release can advance to human review.
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const validTime=x=>typeof x==="string"&&Number.isFinite(Date.parse(x));
const sha=x=>typeof x==="string"&&/^[a-f0-9]{40}$/i.test(x);
const str=x=>typeof x==="string"&&x.trim().length>0;
const obj=x=>x&&typeof x==="object"&&!Array.isArray(x)?x:{};
const bool=x=>x===true;
const all=x=>Array.isArray(x)&&x.length>0&&x.every(bool);
const fresh=(t,clock,hours)=>{
  if(!validTime(t)||!validTime(clock))return false;
  const age=Date.parse(clock)-Date.parse(t);
  return age>=-300_000&&age<=hours*3600_000;
};
const attested=(e,clock,hours=72)=>e?.verified===true
  &&e.environment==="staging"&&str(e.ticket)
  &&str(e.source_url)&&e.source_url.startsWith("https://")
  &&fresh(e.checked_at,clock,hours);

export function evaluateR14Readiness(data,{asOf=new Date().toISOString()}={}){
 const x=obj(data),integration=obj(x.integration),schema=obj(x.schema),
  checkout=obj(x.checkout),meta=obj(x.meta),bling=obj(x.bling),
  fiscal=obj(x.fiscal),delivery=obj(x.delivery),rollout=obj(x.rollout),
  checks=[],record=(id,pass,reason)=>checks.push({
    id,passed:pass===true,reason:pass===true?null:reason});
 record("merged_release_chain",bool(integration.merged_to_main)
   &&sha(integration.release_commit)&&integration.unmerged_pr_count===0
   &&integration.conflicting_migrations===0
   &&attested(integration.staging_deploy,asOf,48),
   "Pending PRs, migration conflicts, or no verified canonical staging deploy");
 record("canonical_schema_rls_triggers",attested(schema.attestation,asOf,48)
   &&schema.production_tables_checked>=11
   &&schema.missing_critical_tables===0
   &&schema.rls_mismatches===0
   &&schema.missing_triggers===0
   &&schema.unsafe_public_privileges===0
   &&schema.default_acl_unreviewed===0
   &&schema.critical_rpc_signature_mismatches===0,
   "Missing critical triggers/RLS parity, unsafe public table grants, or no staging attestation");
 record("checkout_and_stock",attested(checkout.attestation,asOf)
   &&all([checkout.real_checkout,checkout.minimum_75,checkout.concurrent_reservations,
    checkout.linked_food_hygiene,checkout.mold_hidden_values,
    checkout.weekly_immutable_number,checkout.stock_authority_reconciled]),
   "Real canonical checkout, basket lot/stock authority, or race evidence absent");
 const channels=Array.isArray(meta.channels)?meta.channels:[];
 record("meta_confirmation_both_channels",attested(meta.attestation,asOf)
   &&channels.length===2&&new Set(channels.map(z=>z.phone_suffix)).size===2
   &&["0975","1018"].every(id=>channels.some(c=>c.phone_suffix===id
     &&c.utility_template_approved===true&&c.signed_webhook_test===true
     &&c.confirm_button_accepted===true&&c.plain_text_rejected===true))
   &&meta.replay_deduplicated===true,
   "No signed Meta webhook/template/button evidence for both phone channels");
 record("bling_deduplicated_sale",attested(bling.attestation,asOf)
   &&all([bling.order_readback_match,bling.picked_only_lines,
     bling.receipt_hash_stable,bling.no_duplicate_post_after_timeout,
     bling.existing_order_id_reused])
   &&Number.isInteger(bling.verified_order_id)&&bling.verified_order_id>0,
   "Bling remote readback/idempotency of picked items is unverified");
 record("outbound_tax_rules",attested(fiscal.tax_approval,asOf,365*24)
   &&str(fiscal.tax_approval.responsible_role)
   &&all([fiscal.cfop_validated,fiscal.cst_csosn_validated,
     fiscal.ncm_cest_validated,fiscal.ibs_cbs_regime_reviewed,
     fiscal.payment_treatment_validated]),
   "CFOP/CST/CSOSN/NCM/CEST/2026 tax regime lacks qualified approval");
 record("sefaz_authorization",attested(fiscal.sefaz_attestation,asOf)
   &&all([fiscal.single_generation_claim,fiscal.no_reissue_on_timeout,
     fiscal.xml_received_from_bling,fiscal.access_key_and_cstat_validated,
     fiscal.authorized_sefaz_protocol_verified])
   &&str(fiscal.sefaz_attestation.protocol_reference),
   "Authorized SEFAZ protocol and one-attempt NF-e have not been verified");
 record("dispatch_payment_and_return",attested(delivery.attestation,asOf)
   &&all([delivery.proof_before_loading,delivery.proof_before_driver_handoff,
     delivery.split_payment_supported,delivery.return_blocks_release,
     delivery.driver_reconciliation,delivery.status_reaches_delivered]),
   "Delivery chain, fiscal custody, partial payment or return E2E is unproven");
 record("controlled_canary_and_rollback",attested(rollout.attestation,asOf,48)
   &&all([rollout.backup_restored_in_staging,rollout.migration_rollback_rehearsed,
     rollout.monitoring_alarms_tested,rollout.failure_injection_passed,
     rollout.operator_signoff,rollout.tax_responsible_signoff,
     rollout.canary_scope_approved])
   &&str(rollout.rollback_runbook_url)
   &&rollout.rollback_runbook_url.startsWith("https://"),
   "Rollback, backup restore, failure injection, monitoring or human signoff absent");
 const blockers=checks.filter(x=>!x.passed).map(x=>x.id);
 return {schema_version:1,as_of:asOf,
   status:blockers.length===0?"staging_release_candidate":"blocked",
   eligible_for_review:blockers.length===0,
   canary_automatically_enabled:false,production_changes_performed:false,
   deployment_authorized:false,
   passed:checks.length-blockers.length,total:checks.length,
   blockers,checks,
   note:"An offline JSON checklist cannot authenticate external facts or authorize production changes."};
}
function cli(){
 const a=process.argv.slice(2),opt=k=>{const i=a.indexOf(k);return i>=0?a[i+1]:null};
 if(!opt("--evidence"))throw Error("provide --evidence file.json");
 const data=JSON.parse(readFileSync(resolve(opt("--evidence")),"utf8"));
 const result=evaluateR14Readiness(data,{asOf:opt("--as-of")||new Date().toISOString()});
 const out=JSON.stringify(result,null,2)+"\n";
 if(opt("--output")){const p=resolve(opt("--output"));mkdirSync(dirname(p),{recursive:true});writeFileSync(p,out);}
 if(opt("--summary")){
   const lines=["### Dona Antônia - R14 Release Evidence","",
     "**Status: "+result.status+" ("+result.passed+"/"+result.total+")**","",
     "| Gate | Result | Outstanding |","|---|---|---|"];
   for(const c of result.checks)lines.push("| "+c.id+" | "+(c.passed?"PASS":"BLOCK")+" | "+(c.reason||"verified")+" |");
   lines.push("","No deployment or external write was performed.","");
   const p=resolve(opt("--summary"));mkdirSync(dirname(p),{recursive:true});writeFileSync(p,lines.join("\n"));
 }
 process.stdout.write(out);
 if(a.includes("--require-ready")&&!result.eligible_for_review)process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{cli()}catch(e){process.stderr.write("R14 evidence error: "+String(e.message||"invalid")+"\n");process.exitCode=3;}
}
