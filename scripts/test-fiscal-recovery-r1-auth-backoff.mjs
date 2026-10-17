import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("../supabase/functions/admin-service-intelligence-v1/index.ts",import.meta.url),"utf8");
const a=source.indexOf("async function blingHubOauth(");
const b=source.indexOf("function blingHubProviderDetails(",a);
assert.ok(a>0&&b>a,"OAuth function extraction required");
const js=source.slice(a,b)
  .replace("blingHubOauth(sb:any)","blingHubOauth(sb)")
  .replace("let response:Response|null=null;","let response=null;")
  .replace("let data:any={};","let data={};")
  .replace("let parsed:any={};","let parsed={};");
const work=source.slice(source.indexOf("async function blingHubFiscalNfeAutoRecovery("),source.indexOf("async function blingHubVitrineDispatchFiscalCanary("));
for(const v of [
 "const last=await sb.from(\"fiscal_nfe_recovery_events_v1\")",
 "10*60000",
 "4*3600000",
 "fiscal-nfe-recovery-v3",
 "invoice_probe_unavailable_retry",
 "preview.invoice_lookup?.performed",
 "generation_result_uncertain_manual_reconcile_required",
 "oauth_busy_retry",
 "if(prior.data)continue"
]) assert.ok(work.includes(v),"missing recovery guard "+v);
assert.ok(source.includes("if(!lockAcquired)throw new Error(\"oauth_busy\")"));
assert.ok(source.includes("if(attempt<3)await sleep([800,1800,3200][attempt])"));
assert.ok(work.indexOf("invoice_probe_unavailable_retry")<work.indexOf("preview.invoice_id||preview.invoice"),
  "provider failure must be checked before invoice-not-found");
let locks=0,releases=0,fetches=0,delays=[];
const makeContext=()=>({
 crypto:{randomUUID:()=> "test-owner"},
 BLING_OAUTH_URLS:["https://mock.invalid/oauth"],
 clean:(v,n)=>String(v??"").slice(0,n),
 btoa:(v)=>Buffer.from(v).toString("base64"),
 URLSearchParams,AbortSignal,
 sleep:async(ms)=>delays.push(ms),
 fetch:async()=>{fetches++;return {ok:true,status:200,text:async()=>JSON.stringify({access_token:"safe-access",refresh_token:"safe-refresh"})}}
});
const makeSb=(busyUntil)=>({
 rpc:async(name)=>{
   if(name==="claim_bling_hub_oauth_lock_v2"){locks++;return {data:locks>busyUntil,error:null};}
   if(name==="get_bling_api_credentials_v1")return {data:{client_id:"x",client_secret:"y",refresh_token:"safe-refresh"},error:null};
   if(name==="release_bling_hub_oauth_lock_v2"){releases++;return {data:true,error:null};}
   throw new Error("Unexpected RPC: "+name);
 },
 from:()=>({update:()=>({eq:async()=>({error:null})})})
});
const oauth=runInNewContext(js+"\nblingHubOauth;",makeContext());
assert.equal(await oauth(makeSb(2)),"safe-access");
assert.equal(locks,3);
assert.equal(releases,1);
assert.deepEqual(delays,[800,1800]);
assert.equal(fetches,1);
locks=0;releases=0;fetches=0;delays=[];
await assert.rejects(oauth(makeSb(4)),/oauth_busy/);
assert.equal(locks,4);
assert.equal(fetches,0,"never refresh without lock");
assert.equal(releases,0);
assert.deepEqual(delays,[800,1800,3200]);
console.log("PASS: lock contention waits safely, retry cooldown exists, and uncertain POST is not duplicated.");
