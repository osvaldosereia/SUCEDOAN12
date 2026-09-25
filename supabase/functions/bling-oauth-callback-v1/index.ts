import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const ADMIN_URL="https://donaantonia.com.br/vitrine/admin/";
const OAUTH_URLS=["https://api.bling.com.br/oauth/token","https://api.bling.com.br/Api/v3/oauth/token"];

const clean=(v:any,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,n);
async function sha256(v:string){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function redirect(status:string,detail=""){
  const u=new URL(ADMIN_URL);
  u.searchParams.set("bling_oauth",status);
  if(detail)u.searchParams.set("detail",detail.slice(0,80));
  u.hash="today";
  return Response.redirect(u.toString(),302);
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="GET")return new Response("Method Not Allowed",{status:405});
  if(!U||!K)return redirect("error","server_config");

  const url=new URL(req.url);
  const code=clean(url.searchParams.get("code"),2000);
  const state=clean(url.searchParams.get("state"),500);
  const oauthError=clean(url.searchParams.get("error"),120);
  if(oauthError)return redirect("error","authorization_denied");
  if(!code||!state)return redirect("error","missing_code_or_state");

  try{
    const runtime=await db.from("bling_hub_runtime_v2").select("metadata").eq("id",1).maybeSingle();
    if(runtime.error)throw runtime.error;
    const exchange=runtime.data?.metadata?.oauth_exchange_v1||{};
    const expected=clean(exchange?.nonce_sha256,128);
    const expiresAt=clean(exchange?.expires_at,80);
    if(!expected||!expiresAt)return redirect("error","oauth_not_started");
    if(Date.parse(expiresAt)<Date.now())return redirect("error","oauth_expired");
    if(await sha256(state)!==expected)return redirect("error","oauth_state_mismatch");

    const creds=await db.rpc("get_bling_api_credentials_v1");
    if(creds.error)throw creds.error;
    const clientId=clean(creds.data?.client_id,500);
    const clientSecret=clean(creds.data?.client_secret,1000);
    if(!clientId||!clientSecret)return redirect("error","credentials_missing");

    const basic=btoa(clientId+":"+clientSecret);
    let response:Response|null=null;
    let data:any={};
    for(const endpoint of OAUTH_URLS){
      const body=new URLSearchParams({grant_type:"authorization_code",code});
      const attempt=await fetch(endpoint,{
        method:"POST",
        headers:{Authorization:"Basic "+basic,"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},
        body,
        signal:AbortSignal.timeout(12000)
      });
      const raw=await attempt.text();
      let parsed:any={};try{parsed=raw?JSON.parse(raw):{}}catch{}
      response=attempt;data=parsed;
      if(attempt.ok&&clean(parsed?.refresh_token,5000))break;
      if(![403,404,405].includes(attempt.status))break;
    }

    const refresh=clean(data?.refresh_token,5000);
    if(!response?.ok||!refresh){
      await db.rpc("merge_bling_hub_runtime_metadata_v2",{p_patch:{oauth_exchange_v1:{
        expires_at:null,consumed_at:new Date().toISOString(),last_result:"token_exchange_failed",
        nonce_sha256:null,http_status:response?.status||0
      }}});
      return redirect("error","token_exchange_failed");
    }

    const saved=await db.rpc("set_bling_api_refresh_token_v1",{p_refresh_token:refresh});
    if(saved.error)throw saved.error;

    const now=new Date().toISOString();
    await db.rpc("merge_bling_hub_runtime_metadata_v2",{p_patch:{oauth_exchange_v1:{
      expires_at:null,consumed_at:now,last_result:"success",nonce_sha256:null
    }}});
    await db.from("bling_hub_runtime_v2").update({
      last_oauth_check_at:now,last_oauth_ok_at:now,last_oauth_error:null,updated_at:now
    }).eq("id",1);
    try{
      await db.rpc("ops_record_event_v1",{
        p_domain:"integration",p_event_type:"bling.oauth_reauthorized",
        p_summary:"Bling reautorizado com novo token OAuth.",p_actor_type:"human",
        p_entity_type:"integration",p_entity_id:"bling",p_correlation_id:null,
        p_actor_id:null,p_actor_label:"Owner",p_source_system:"bling",p_severity:"info",
        p_payload:{oauth:true},p_external_ref:null,
        p_idempotency_key:"bling-oauth:"+now.slice(0,16),p_occurred_at:now
      });
    }catch{}
    return redirect("success");
  }catch(e){
    console.error("bling_oauth_callback",String((e as Error)?.message||e));
    return redirect("error","callback_failed");
  }
});
