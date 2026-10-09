// R02-R09: original R09 pure GET evaluator and original R08 preflight
// consume the same REAL checkout/R06/R07 receipts created in PostgreSQL 17.
// Bling "GET" is a synthetic OBJECT, never a network request.
import assert from "node:assert/strict";
import fs from "node:fs";
import { compareBlingR9Order, classifyBlingR9Invoices } from
 "../r09-source/supabase/functions/_shared/order-fiscal-r9-observer-v1.mjs";
import { evaluateOrderFiscalR8 } from
 "../r08-source/supabase/functions/_shared/order-fiscal-r8-preflight-v1.mjs";

const path=process.argv[2];
if(!path)throw Error("genuine_receipts_file_missing");
const rows=fs.readFileSync(path,"utf8").trim().split(/\r?\n/).map(JSON.parse);
assert.equal(rows.length,2);
const map=Object.fromEntries(rows.map(x=>[x.kind,x]));
assert.deepEqual(Object.keys(map).sort(),["basket","mold"]);
const basket=map.basket,mold=map.mold;
const original=basket.completion.metadata.r6_reconciliation;
const snapshot=structuredClone(original);
const selected=original.lines.filter(x=>x.deliverable===true&&x.state==="separated");
assert.equal(selected.length,1);
assert.equal(basket.order.total,140);
assert.equal(selected[0].unit_price,50);
assert.equal(basket.r7_intent.status,"verified");
assert.equal(basket.observation.status,"observed_no_invoice");
assert.equal(basket.observation.bling_order_id,123451);
assert.equal(basket.r7_intent.payload_hash,basket.observation.r7_payload_hash);
assert.deepEqual(basket.observation.evidence.r7_payload_hash,
 basket.r7_intent.payload_hash);
assert.equal(basket.observation.attempts,1);
assert.equal(mold.r7_intent.status,"uncertain");
assert.equal(mold.observation,null,"unknown provider write can never queue an invoice observation");

const remote={
 id:123451,numeroLoja:"VITRINE-"+basket.order.id,total:140,
 itens:[{produto:{id:555},quantidade:1,valor:50}]
};
const links=basket.product_links;
assert.deepEqual(links.map(x=>x.source_id),[selected[0].product_id]);
assert.equal(links[0].status,"matched");
let verdict=compareBlingR9Order({
  order_id:basket.order.id,bling_order_id:basket.order.bling_order_id,
  final_total:basket.order.total,manifest:original
},remote,links);
assert.equal(verdict.match,true,JSON.stringify(verdict.blockers));
assert.equal(verdict.checked_items,1);
assert.equal(verdict.external_write,false);
assert.deepEqual(snapshot,original,"R09 must not modify R06 final receipt");
for(const [fake,blocker] of [
  [{...remote,total:160},"remote_order_total_mismatch"],
  [{...remote,numeroLoja:"OTHER"},"remote_order_identity_mismatch"],
  [{...remote,itens:[{produto:{id:555},quantidade:2,valor:50}]},"remote_order_items_mismatch"],
  [{...remote,itens:[...remote.itens,{produto:{id:999},quantidade:1,valor:20}]},"remote_order_items_mismatch"],
  [{...remote,notaFiscal:{id:999},itens:[]},"remote_order_items_mismatch"]
]){
  const checked=compareBlingR9Order({
    order_id:basket.order.id,bling_order_id:123451,
    final_total:140,manifest:original
  },fake,links);
  assert.equal(checked.match,false);
  assert.ok(checked.blockers.includes(blocker),JSON.stringify(checked.blockers));
}
assert.equal(classifyBlingR9Invoices({ok:true,matches:[]},null,null).verdict,"no_invoice");
assert.equal(classifyBlingR9Invoices({ok:false,matches:[]},null,null).verdict,"uncertain");
assert.equal(classifyBlingR9Invoices({ok:true,matches:[{id:9},{id:10}]},null,null).verdict,"conflict");
assert.equal(classifyBlingR9Invoices({ok:true,matches:[]},null,9).verdict,"conflict");
assert.equal(classifyBlingR9Invoices({ok:true,matches:[{id:9}]},{ok:false},9).verdict,"uncertain");
const found=classifyBlingR9Invoices({ok:true,matches:[{id:9}]},
 {ok:true,invoice:{id:9,chaveAcesso:"1".repeat(44),situation:{label:"Autorizada"}}},9);
assert.equal(found.verdict,"one_invoice");
assert.equal("authorized" in found,false,"R09 never grants SEFAZ approval");

const common={
  order:basket.order,completion:basket.completion,r7_intent:basket.r7_intent,
  order_bling_link:{source_id:basket.order.id,status:"matched",bling_id:123451},
  fiscal_control:{},existing_fiscal_jobs:[],
  fiscal_runtime:{enabled:true,execution_mode:"homologation",
    bling_invoice_prepare_enabled:true,
    require_fiscal_authorization_before_dispatch:true},
  bling_runtime:{hub_enabled:true,orders_enabled:true},
  active_rule_sets:[],fiscal_profiles:[],approved_sales_tax_rules:[],
  product_links:links,as_of:new Date().toISOString()
};
const observed=basket.observation.evidence;
assert.equal(observed.source,"bling_get");
assert.equal(observed.invoice_count,0);
assert.equal(observed.commercial_match,true);
assert.equal(observed.external_write,false);
const before=evaluateOrderFiscalR8({...common,bling_remote_evidence:null});
assert.equal(before.ready,false);
assert.ok(before.blockers.includes("fresh_bling_order_readback_required"));
const after=evaluateOrderFiscalR8({...common,bling_remote_evidence:observed});
assert.equal(after.ready,false,"a GET-only observation CANNOT approve missing NCM/tax");
assert.ok(!after.blockers.includes("fresh_bling_order_readback_required"),
  "saved genuine R09 evidence satisfies ONLY the readback part: "+after.blockers);
assert.ok(after.blockers.includes("sales_tax_rule_unapproved")||
  after.blockers.includes("product_fiscal_profile_missing"));
assert.ok(after.blockers.includes("active_mt_tax_rules_not_approved"));
const stale=evaluateOrderFiscalR8({...common,bling_remote_evidence:{
  ...observed,checked_at:"2026-10-08T00:00:00Z"
}});
assert.ok(stale.blockers.includes("fresh_bling_order_readback_required"));
const forged=evaluateOrderFiscalR8({...common,bling_remote_evidence:{
  ...observed,r7_payload_hash:"f".repeat(64)
}});
assert.ok(forged.blockers.includes("fresh_bling_order_readback_required"));
console.log("PASS: actual R02/R06/R07 -> original R09 GET-only; missing/mismatch/duplicate NF-e blocked");
console.log("PASS: original R08 accepts authentic R09 evidence ONLY as GET proof; outbound tax approval remains blocking");
console.log("PASS: uncertain mold never queues R09; no external HTTP/NF-e operations");
