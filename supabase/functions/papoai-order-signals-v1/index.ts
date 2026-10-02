import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const text=(v:unknown,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const uid=(v:unknown)=>{const s=text(v,80);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
async function finish(id:string,status:string,externalRef:string|null,error:string|null,retry=300){
  return db.rpc("ops2_finish_papoai_order_signal_v1",{p_outbox_id:id,p_status:status,p_external_ref:externalRef,p_last_error:error,p_retry_after_seconds:retry});
}
Deno.serve(async(req:Request)=>{
  if(!U||!K)return respond({ok:false,error:"server_config"},500);
  const internal=req.headers.get("x-internal-key")||"",serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(internal!==K&&internal!==serviceRole)return respond({ok:false,error:"forbidden"},403);
  if(req.method!=="POST"&&req.method!=="GET")return respond({ok:false,error:"method_not_allowed"},405);
  let processed=0,sent=0,retried=0,failed=0;
  for(let i=0;i<20;i++){
    const claim=await db.rpc("ops2_claim_papoai_order_signal_v1");
    if(claim.error)return respond({ok:false,error:"claim_failed",detail:text(claim.error.message)},503);
    const item=claim.data?.found===true?claim.data.item:null;
    if(!item)break;
    processed++;
    const id=uid(item.id),channel=text(item.channel_origin,4),signal=text(item.signal_key,60),phone=text(item.phone_e164,40);
    const provider=await db.rpc("ops2_papoai_signal_provider_url_v1",{p_channel:channel,p_signal:signal});
    const url=text(provider.data,2048);
    if(provider.error||!url){await finish(id,"retry",null,"provider_not_configured",900);retried++;continue}
    try{
      const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"order_signal",order_id:item.order_id,phone_e164:phone,channel_origin:channel,signal_key:signal})});
      const data=await response.json().catch(()=>({}));
      if(response.ok){const external=text(data?.external_message_id||data?.message_id||data?.id||"",200)||null;await finish(id,"sent",external,null,0);sent++;continue}
      const retryable=response.status===429||response.status>=500;
      await finish(id,retryable?"retry":"failed",null,`provider_http_${response.status}: ${text(data?.error||data?.message||response.statusText,260)}`,retryable?300:0);
      if(retryable)retried++;else failed++;
    }catch(error){await finish(id,"retry",null,`provider_unreachable: ${text((error as Error)?.message||error,260)}`,300);retried++}
  }
  return respond({ok:true,processed,sent,retried,failed});
});
