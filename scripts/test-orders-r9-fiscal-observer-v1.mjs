import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  compareBlingR9Order,classifyBlingR9Invoices,runFiscalR9ObserverPass
} from "../supabase/functions/_shared/order-fiscal-r9-observer-v1.mjs";
const oid="00000000-0000-4000-8000-000000000050",pid="00000000-0000-4000-8000-000000000152";
const input={order_id:oid,bling_order_id:12345,final_total:140,manifest:{lines:[
  {order_item_id:"00000000-0000-4000-8000-000000000051",product_id:null,
    display_only:true,deliverable:false,state:"separated",quantity:1,unit_price:0},
  {order_item_id:"00000000-0000-4000-8000-000000000052",product_id:pid,
    display_only:false,deliverable:true,state:"separated",quantity:2,unit_price:70},
  {order_item_id:"00000000-0000-4000-8000-000000000053",product_id:"00000000-0000-4000-8000-000000000153",
    display_only:false,deliverable:false,state:"missing",quantity:1,unit_price:20}
]}};
const links=[{source_id:pid,bling_id:555,status:"matched"}];
const remote={id:12345,numeroLoja:"VITRINE-"+oid,total:140,
  itens:[{produto:{id:555},quantidade:2,valor:70}]};
const clone=x=>structuredClone(x);
test("R09 matches only the actual separated items; removes missing and basket header",()=>{
 const x=compareBlingR9Order(input,remote,links);
 assert.equal(x.match,true,JSON.stringify(x.blockers));
 assert.equal(x.checked_items,1);
 assert.equal(x.external_write,false);
});
test("R09 rejects wrong sale, wrong total, extra or changed products",()=>{
 for(const [change,msg] of [
  [{...remote,id:999},"remote_bling_order_id_mismatch"],
  [{...remote,numeroLoja:"OTHER"},"remote_order_identity_mismatch"],
  [{...remote,total:160},"remote_order_total_mismatch"],
  [{...remote,itens:[...remote.itens,{produto:{id:556},quantidade:1,valor:20}]},"remote_order_items_mismatch"],
  [{...remote,itens:[{produto:{id:555},quantidade:1,valor:70}]},"remote_order_items_mismatch"],
  [{...remote,itens:[{produto:{id:555},quantidade:2,valor:60}]},"remote_order_items_mismatch"]
 ])assert.ok(compareBlingR9Order(input,change,links).blockers.includes(msg),msg);
 assert.ok(compareBlingR9Order(input,remote,[]).blockers.includes("missing_verified_bling_product_link"));
});
test("R09 never assumes a listed invoice is SEFAZ authorized",()=>{
 assert.deepEqual(classifyBlingR9Invoices({ok:true,matches:[]},null,null),
   {verdict:"no_invoice",invoice_count:0,invoice_id:null});
 assert.equal(classifyBlingR9Invoices({ok:true,matches:[{id:3},{id:4}]},null,null).verdict,"conflict");
 assert.equal(classifyBlingR9Invoices({ok:false,matches:[]},null,null).verdict,"uncertain");
 assert.equal(classifyBlingR9Invoices({ok:true,matches:[]},null,3).verdict,"conflict");
 assert.equal(classifyBlingR9Invoices({ok:true,matches:[{id:3}]},{ok:false},3).verdict,"uncertain");
 const yes=classifyBlingR9Invoices({ok:true,matches:[{id:3}]},{
   ok:true,invoice:{id:3,chaveAcesso:"1".repeat(44),situation:{label:"Autorizada"}}},3);
 assert.equal(yes.verdict,"one_invoice");
 assert.equal(yes.access_key_present,true);
 assert.equal(yes.sefaz_label,"Autorizada");
 assert.equal("authorized" in yes,false,"R09 should never confer official authorization");
});
test("R09 orchestration may only GET/re-observe, never create an NF-e",async()=>{
 const calls=[],claimed=[{order_id:oid,claim_token:"synthetic"}];
 const run=await runFiscalR9ObserverPass({
  claim:async n=>{calls.push("claim:"+n);return {ok:true,claimed};},
  probe:async()=>{calls.push("read");return {verdict:"no_invoice",evidence:{invoice_count:0}};},
  finish:async(_row,result)=>{calls.push("finish:"+result.verdict);return {ok:true};}
 });
 assert.equal(run.invoice_created,false);
 assert.equal(run.external_write,false);
 assert.deepEqual(calls,["claim:3","read","finish:no_invoice"]);
});
test("R09 errors become uncertain read-only observations; no blind POST",async()=>{
 const out=await runFiscalR9ObserverPass({
   claim:async()=>({ok:true,claimed:[{order_id:oid,claim_token:"T"}]}),
   probe:async()=>{throw Error("synthetic timeout");},
   finish:async(_row,x)=>{
     assert.equal(x.verdict,"uncertain");
     assert.equal(x.error,"read_only_probe_failed");
     return {ok:true};
   }
 });
 assert.equal(out.results[0].verdict,"uncertain");
});
test("R09 service endpoint has OFF flag, secret and only GET-only hub action",()=>{
 const edge=fs.readFileSync("supabase/functions/orders-r9-fiscal-observer-v1/index.ts","utf8");
 assert.match(edge,/R9_FISCAL_OBSERVER_ENABLED/);
 assert.match(edge,/R9_FISCAL_OBSERVER_RUN_KEY/);
 assert.match(edge,/secureEquals/);
 assert.match(edge,/ops2_seed_fiscal_r9_observations_v1/);
 assert.match(edge,/ops2_claim_fiscal_r9_observation_v1/);
 assert.match(edge,/ops2_finish_fiscal_r9_observation_v1/);
 assert.match(edge,/fiscal_r9_observe_readonly/);
 assert.doesNotMatch(edge,/fiscal_dispatch_canary_human_execute|emitir_nfe|\/nfe\/gerar/);
});
test("R09 hub route does not call state-mutating old fiscal previews",()=>{
 const hub=fs.readFileSync("supabase/functions/admin-service-intelligence-v1/index.ts","utf8");
 const first=hub.indexOf("async function blingHubFiscalR9ObserveReadOnly(");
 const last=hub.indexOf("async function blingHubVitrineDispatchFiscalPreview(",first);
 assert.ok(first>0&&last>first);
 const s=hub.slice(first,last);
 assert.match(s,/blingHubGet\(sb,token,"\/pedidos\/vendas\/"/);
 assert.match(s,/blingHubFindNfeByExternalKey/);
 assert.match(s,/blingHubGetNfe/);
 assert.doesNotMatch(s,/fiscal_dispatch_canary_human_execute|blingHubPostOnce|refresh_order_fiscal_readiness_v1|\.update\(|\.upsert\(/);
});
test("R09 SQL uses SKIP LOCKED and cannot queue a second invoice writer",()=>{
 const sql=fs.readFileSync("supabase/sql/orders-r9-fiscal-observation-contract-v1.sql","utf8");
 assert.match(sql,/order_id uuid PRIMARY KEY REFERENCES public\.orders/);
 assert.match(sql,/FOR UPDATE SKIP LOCKED/);
 assert.match(sql,/lease_until<now\(\)/);
 assert.match(sql,/p_verdict NOT IN \('no_invoice','one_invoice','uncertain','conflict'\)/);
 assert.match(sql,/REVOKE ALL ON TABLE public\.order_fiscal_r9_observations_v1 FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.ops2_claim_fiscal_r9_observation_v1\(integer\)/);
 assert.doesNotMatch(sql,/INSERT INTO public\.dispatch_fiscal_jobs|UPDATE public\.order_fiscal_controls/i);
});
