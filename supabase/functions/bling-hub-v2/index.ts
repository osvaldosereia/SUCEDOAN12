import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const API_BASE="https://api.bling.com.br/Api/v3";
const OAUTH_URL="https://api.bling.com.br/oauth/token";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const clean=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

function safeEqual(a:string,b:string){
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
  if(x.length!==y.length)return false;
  let diff=0;
  for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
  return diff===0;
}

async function reserveSlot(sb:any){
  const {data,error}=await sb.rpc("reserve_bling_hub_rate_slot_v2",{});
  if(error)throw new Error("rate_slot_failed");
  const wait=Math.max(0,Number(data||0));
  if(wait)await sleep(wait);
}

async function oauth(sb:any){
  const owner=crypto.randomUUID();
  const lock=await sb.rpc("claim_bling_hub_oauth_lock_v2",{p_owner:owner,p_ttl_seconds:90});
  if(lock.error)throw new Error("oauth_lock_failed");
  if(lock.data!==true)throw new Error("oauth_busy");

  try{
    const {data:credentials,error}=await sb.rpc("get_bling_api_credentials_v1");
    if(error)throw new Error("credentials_lookup_failed");
    const clientId=clean(credentials?.client_id,500);
    const clientSecret=clean(credentials?.client_secret,500);
    const refreshToken=clean(credentials?.refresh_token,5000);
    if(!clientId||!clientSecret||!refreshToken)throw new Error("bling_credentials_missing");

    await sb.from("bling_hub_runtime_v2").update({
      last_oauth_check_at:new Date().toISOString(),
      last_oauth_error:null,
      updated_at:new Date().toISOString()
    }).eq("id",1);

    const basic=btoa(`${clientId}:${clientSecret}`);
    const body=new URLSearchParams({grant_type:"refresh_token",refresh_token:refreshToken});
    const response=await fetch(OAUTH_URL,{
      method:"POST",
      headers:{
        Authorization:`Basic ${basic}`,
        "Content-Type":"application/x-www-form-urlencoded",
        Accept:"1.0",
        "enable-jwt":"1"
      },
      body,
      signal:AbortSignal.timeout(10000)
    });
    const raw=await response.text();
    let payload:any={};
    try{payload=raw?JSON.parse(raw):{}}catch{}
    if(!response.ok||!clean(payload?.access_token,5000)){
      await sb.from("bling_hub_runtime_v2").update({
        last_oauth_error:`oauth_http_${response.status}`,
        updated_at:new Date().toISOString()
      }).eq("id",1);
      throw new Error(`bling_oauth_http_${response.status}`);
    }

    const rotated=clean(payload?.refresh_token,5000);
    if(rotated&&rotated!==refreshToken){
      const save=await sb.rpc("set_bling_api_refresh_token_v1",{p_refresh_token:rotated});
      if(save.error)throw new Error("refresh_token_persist_failed");
    }

    await sb.from("bling_hub_runtime_v2").update({
      last_oauth_ok_at:new Date().toISOString(),
      last_oauth_error:null,
      updated_at:new Date().toISOString()
    }).eq("id",1);

    return clean(payload.access_token,5000);
  } finally {
    await sb.rpc("release_bling_hub_oauth_lock_v2",{p_owner:owner});
  }
}

async function getBling(sb:any,accessToken:string,path:string){
  await reserveSlot(sb);
  const response=await fetch(`${API_BASE}${path}`,{
    method:"GET",
    headers:{Authorization:`Bearer ${accessToken}`,Accept:"application/json","enable-jwt":"1"},
    signal:AbortSignal.timeout(10000)
  });
  const raw=await response.text();
  let payload:any={};
  try{payload=raw?JSON.parse(raw):{}}catch{}
  return {status:response.status,ok:response.ok,payload};
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);

  const supabaseUrl=Deno.env.get("SUPABASE_URL");
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!supabaseUrl||!serviceKey)return json({ok:false,error:"server_config"},500);
  const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  const expected=await sb.rpc("get_bling_hub_key_v2");
  if(expected.error||!expected.data)return json({ok:false,error:"hub_key_missing"},503);
  const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const supplied=clean(req.headers.get("x-dona-antonia-bling-hub-key")||bearer,200);
  if(!supplied||!safeEqual(supplied,String(expected.data)))return json({ok:false,error:"unauthorized"},401);

  let body:any={};
  try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const action=clean(body?.action||"readiness",60).toLowerCase();

  if(action==="readiness"){
    const r=await sb.rpc("bling_hub_readiness_v2");
    if(r.error)return json({ok:false,error:"readiness_failed",detail:clean(r.error.message,300)},500);
    return json({ok:true,readiness:r.data});
  }

  if(action!=="probe_readonly"){
    return json({ok:false,error:"writes_disabled",mode:"observe"},409);
  }

  const runtime=await sb.from("bling_hub_runtime_v2")
    .select("mode,legacy_queues_frozen")
    .eq("id",1)
    .maybeSingle();
  if(runtime.error||!runtime.data)return json({ok:false,error:"runtime_unavailable"},503);
  if(!["observe","homologation","live"].includes(String(runtime.data.mode)))return json({ok:false,error:"hub_off"},409);

  const checkedAt=new Date().toISOString();
  await sb.from("bling_hub_runtime_v2").update({
    last_readonly_check_at:checkedAt,
    last_readonly_error:null,
    updated_at:checkedAt
  }).eq("id",1);

  try{
    const accessToken=await oauth(sb);
    const probes=[
      {key:"products",path:"/produtos?pagina=1&limite=1"},
      {key:"contacts",path:"/contatos?pagina=1&limite=1"},
      {key:"sales_orders",path:"/pedidos/vendas?pagina=1&limite=1"},
      {key:"deposits",path:"/depositos?pagina=1&limite=100&situacao=1"},
      {key:"invoice",path:"/nfe?pagina=1&limite=1"}
    ];
    const results:any={};
    let allCore=true;
    let depositCandidates:any[]=[];

    for(const probe of probes){
      const r=await getBling(sb,accessToken,probe.path);
      results[probe.key]={
        ok:r.ok,
        http_status:r.status,
        insufficient_scope:r.status===403
      };
      if(["products","contacts","sales_orders","deposits"].includes(probe.key)&&!r.ok)allCore=false;
      if(probe.key==="deposits"&&r.ok){
        const rows=Array.isArray(r.payload?.data)?r.payload.data:[];
        depositCandidates=rows.slice(0,20).map((d:any)=>({
          id:Number(d?.id||0)||null,
          name:clean(d?.descricao||d?.nome,120)||null,
          default:d?.padrao===true||d?.padrao===1||d?.padrao==="true"
        })).filter((d:any)=>d.id);
      }
    }

    const now=new Date().toISOString();
    const err=allCore?null:"one_or_more_core_probes_failed";
    await sb.from("bling_hub_runtime_v2").update({
      last_readonly_ok_at:allCore?now:null,
      last_readonly_error:err,
      metadata:{
        readonly_probe_version:1,
        probes:results,
        deposit_candidates:depositCandidates,
        probed_at:now
      },
      updated_at:now
    }).eq("id",1);

    await sb.from("bling_hub_audit_v2").insert({
      event_type:"readonly_probe",
      severity:allCore?"info":"warning",
      details:{
        probes:results,
        deposit_candidates:depositCandidates,
        external_write:false,
        make_used:false
      }
    });

    const ready=await sb.rpc("bling_hub_readiness_v2");
    return json({
      ok:allCore,
      readonly:true,
      external_write:false,
      probes:results,
      deposit_candidates:depositCandidates,
      readiness:ready.data||null
    },allCore?200:207);
  }catch(e){
    const message=clean((e as Error)?.message||e,300);
    await sb.from("bling_hub_runtime_v2").update({
      last_readonly_error:message,
      updated_at:new Date().toISOString()
    }).eq("id",1);
    await sb.from("bling_hub_audit_v2").insert({
      event_type:"readonly_probe_failed",
      severity:"warning",
      details:{error:message,external_write:false,make_used:false}
    });
    return json({ok:false,error:message,readonly:true,external_write:false},502);
  }
});
