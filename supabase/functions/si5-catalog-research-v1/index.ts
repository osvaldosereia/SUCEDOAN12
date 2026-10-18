import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {si5Proposal} from "./si5-mapper.mjs";
// Required secrets: SI5_API_TOKEN, SI5_WORKER_SECRET, Supabase service key.
// Disabled by default: no cron or product changes.
const URL=Deno.env.get("SUPABASE_URL")||"";
const KEY=(()=>{
 try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||
   Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}
 catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}
})();
const db=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 "content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
async function save(request,requestState,httpStatus,researchStatus,patch={},errorCode=null){
 const now=new Date().toISOString();
 const a=await db.from("si5_research_requests").update({
   state:requestState,http_status:httpStatus||null,completed_at:now,error_code:errorCode
 }).eq("id",request.request_id);
 if(a.error)throw a.error;
 const b=await db.from("si5_product_research").update({
   status:researchStatus,last_http_status:httpStatus||null,last_error:errorCode,
   identity_verified:patch.exact===true,source_license_confirmed:false,
   observed_fields:patch.observedFields||[],
   proposed_attributes:patch.proposed||{},
   response_summary:patch.summary||{},
   researched_at:researchStatus==="review"?now:null,
   retry_after:patch.retryAfter||null,updated_at:now
 }).eq("product_id",request.selected_product_id).eq("gtin",request.selected_gtin);
 if(b.error)throw b.error;
}
Deno.serve(async(req)=>{
 if(req.method!=="POST")return respond({error:"method_not_allowed"},405);
 const secret=Deno.env.get("SI5_WORKER_SECRET")||"";
 let authorized=!!secret && req.headers.get("x-si5-worker-secret")===secret;
 if(!authorized){
   // Secondary internal trigger credential: SHA-256 fingerprint, raw value remains in Vault.
   // Supabase Gateway JWT validation remains required on this Edge Function.
   const trigger=req.headers.get("x-si5-db-trigger")||"";
   if(/^[0-9a-f]{64}$/.test(trigger)){
     const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(trigger));
     const hash=Array.from(new Uint8Array(digest))
       .map(b=>b.toString(16).padStart(2,"0")).join("");
     const guard=await db.from("si5_internal_trigger_guard_v1")
       .select("secret_sha256").eq("id",true).maybeSingle();
     authorized=!guard.error && !!guard.data && guard.data.secret_sha256===hash;
   }
 }
 if(!authorized)return respond({error:"unauthorized"},401);
 let input={};
 try{input=await req.json()}catch{return respond({error:"invalid_json"},400)}
 const cfg=await db.from("si5_research_config")
   .select("enabled,daily_limit,max_batch,research_mode").eq("id",true).maybeSingle();
 if(cfg.error||!cfg.data)return respond({error:"config_unavailable"},500);
 if(input.mode!=="execute")return respond({mode:"preview",config:cfg.data,
   si5_token_configured:!!Deno.env.get("SI5_API_TOKEN"),
   worker_secret_configured:!!Deno.env.get("SI5_WORKER_SECRET"),
   updates_products:false,updates_fiscal:false,updates_bling:false});
 if(!cfg.data.enabled)return respond({mode:"disabled",processed_count:0,updates_products:false});
 const token=Deno.env.get("SI5_API_TOKEN")||"";
 if(!token)return respond({error:"si5_token_not_configured"},503);
 const requested=Number(input.max_items);
 const batch=Number.isInteger(requested)&&requested>0?Math.min(requested,5):1;
 const limit=Math.min(batch,Math.max(1,Math.min(5,Number(cfg.data.max_batch)||1)));
 const processed=[];
 for(let i=0;i<limit;i++){
  const r=await db.rpc("si5_research_reserve_next");
  if(r.error)return respond({error:"queue_reservation_failed",processed},500);
  const item=r.data?.[0];if(!item)break;
  let httpCode=0;
  try{
   const response=await fetch("https://global.si5.com.br/api/produtos/"+encodeURIComponent(item.selected_gtin),{
     headers:{"Authorization":"Bearer "+token,"Accept":"application/json"},
     signal:AbortSignal.timeout(12000)
   });
   httpCode=response.status;
   if(httpCode===404){
     await save(item,"not_found",404,"not_found");
     processed.push({gtin:item.selected_gtin,status:"not_found"});continue;
   }
   if(httpCode===429){
     await save(item,"rate_limited",429,"retry",{
       retryAfter:new Date(Date.now()+30*3600000).toISOString()
     },"si5_quota_reached");
     processed.push({gtin:item.selected_gtin,status:"rate_limited"});break;
   }
   if(!response.ok){
     await save(item,"http_error",httpCode,"retry",{
       retryAfter:new Date(Date.now()+48*3600000).toISOString()
     },"si5_http_"+httpCode);
     processed.push({gtin:item.selected_gtin,status:"http_error"});
     if(httpCode===401||httpCode===403)break;
     continue;
   }
   const raw=await response.text();
   if(raw.length>1200000)throw new Error("response_too_large");
   const proposal=si5Proposal(JSON.parse(raw),item.selected_gtin);
   if(!proposal.exact){
     await save(item,"invalid_identity",200,"blocked",{},"gtin_mismatch");
     processed.push({gtin:item.selected_gtin,status:"gtin_mismatch"});continue;
   }
   await save(item,"found",200,"review",{
     exact:true,observedFields:proposal.observedFields,proposed:proposal.proposed,
     summary:{source:"si5_global",gtin:item.selected_gtin,
       observed_at:new Date().toISOString(),review_required:true}
   });
   processed.push({gtin:item.selected_gtin,status:"review"});
  }catch(e){
   await save(item,"network_error",httpCode,"retry",{
     retryAfter:new Date(Date.now()+48*3600000).toISOString()
   },String(e instanceof Error?e.name:"unknown_error").slice(0,60));
   processed.push({gtin:item.selected_gtin,status:"retry"});
  }
 }
 return respond({mode:"execute",processed_count:processed.length,processed,
   updates_products:false,updates_fiscal:false,updates_bling:false,
   automatic_tax_approval:false,variant_inheritance:false});
});
