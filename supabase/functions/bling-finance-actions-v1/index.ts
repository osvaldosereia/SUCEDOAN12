import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const API="https://api.bling.com.br/Api/v3";
const OAUTH=["https://api.bling.com.br/oauth/token","https://api.bling.com.br/Api/v3/oauth/token"];
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-dona-antonia-bling-hub-key","Access-Control-Allow-Methods":"POST,OPTIONS"};
const clean=(v:any,n=1000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,n);
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const num=(v:any)=>Number.isFinite(Number(v))?Number(v):null;
const date=(v:any)=>/^\d{4}-\d{2}-\d{2}$/.test(clean(v,10))?clean(v,10):"";

async function authorized(sb:any,req:Request){
  const supplied=clean(req.headers.get("x-dona-antonia-bling-hub-key"),200);if(!supplied)return false;
  const q=await sb.rpc("get_bling_hub_key_v2");if(q.error||!q.data)return false;
  const a=new TextEncoder().encode(supplied),b=new TextEncoder().encode(String(q.data));if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
async function reserve(sb:any){const q=await sb.rpc("reserve_bling_hub_rate_slot_v2",{});if(q.error)throw new Error("rate_slot_failed");const w=Math.max(0,Number(q.data||0));if(w)await sleep(w)}
async function token(sb:any){
  const owner=crypto.randomUUID();const l=await sb.rpc("claim_bling_hub_oauth_lock_v2",{p_owner:owner,p_ttl_seconds:90});if(l.error||l.data!==true)throw new Error("oauth_busy");
  try{
    const c=await sb.rpc("get_bling_api_credentials_v1");const id=clean(c.data?.client_id,500),secret=clean(c.data?.client_secret,500),refresh=clean(c.data?.refresh_token,5000);if(!id||!secret||!refresh)throw new Error("bling_credentials_missing");
    let last:any=null;
    for(const url of OAUTH){
      const r=await fetch(url,{method:"POST",headers:{Authorization:"Basic "+btoa(id+":"+secret),"Content-Type":"application/x-www-form-urlencoded",Accept:"1.0","enable-jwt":"1"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:refresh}),signal:AbortSignal.timeout(10000)});
      const raw=await r.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{};last={r,data};
      if(r.ok&&clean(data.access_token,5000))break;if(![403,404,405].includes(r.status))break;
    }
    if(!last?.r?.ok||!clean(last.data?.access_token,5000))throw new Error("oauth_http_"+String(last?.r?.status||0));
    const rotated=clean(last.data?.refresh_token,5000);if(rotated&&rotated!==refresh){const s=await sb.rpc("set_bling_api_refresh_token_v1",{p_refresh_token:rotated});if(s.error)throw new Error("refresh_token_persist_failed")}
    return clean(last.data.access_token,5000);
  }finally{await sb.rpc("release_bling_hub_oauth_lock_v2",{p_owner:owner})}
}
async function call(sb:any,t:string,path:string,method="GET",body?:any){
  let last:any=null;
  for(let attempt=1;attempt<=4;attempt++){
    await reserve(sb);
    try{
      const r=await fetch(API+path,{method,headers:{Authorization:"Bearer "+t,Accept:"application/json","Content-Type":"application/json","enable-jwt":"1"},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
      const raw=await r.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{};last={ok:r.ok,status:r.status,data};
      if(r.ok)return last;if(r.status!==429&&r.status<500)return last;
      const ra=Number(r.headers.get("retry-after"));await sleep(Number.isFinite(ra)&&ra>0?ra*1000:attempt*attempt*900);
    }catch(e){last={ok:false,status:0,error:clean((e as Error)?.message||e,500)};if(attempt<4)await sleep(attempt*attempt*900)}
  }
  return last||{ok:false,status:0,error:"bling_unavailable"};
}
function kind(v:any){return v==="payable"?"payable":v==="receivable"?"receivable":""}
function basePath(k:string){return k==="payable"?"/contas/pagar":"/contas/receber"}
function savePayload(k:string,p:any){
  const out:any={};const venc=date(p?.vencimento),valor=num(p?.valor),contato=num(p?.contato?.id??p?.contato_id),forma=num(p?.formaPagamento?.id??p?.forma_pagamento_id);
  if(venc)out.vencimento=venc;if(valor!==null&&valor>0)out.valor=valor;if(contato&&contato>0)out.contato={id:contato};if(forma&&forma>0)out.formaPagamento={id:forma};
  for(const f of ["numeroDocumento","historico"]){const v=clean(p?.[f],250);if(v)out[f]=v}
  const emissao=date(p?.dataEmissao);if(emissao)out.dataEmissao=emissao;
  const categoria=num(p?.categoria?.id??p?.categoria_id);if(categoria&&categoria>0)out.categoria={id:categoria};
  const portador=num(p?.portador?.id??p?.portador_id);if(portador&&portador>0)out.portador={id:portador};
  if(k==="payable"){const competencia=date(p?.competencia);if(competencia)out.competencia=competencia}
  return out;
}
function validateSave(p:any){const missing=[];if(!p.vencimento)missing.push("vencimento");if(!(Number(p.valor)>0))missing.push("valor");if(!p.contato?.id)missing.push("contato.id");return missing}
function settlePayload(p:any){
  const out:any={};const d=date(p?.data),v=num(p?.valorRecebido),des=num(p?.desconto),jur=num(p?.juros),acr=num(p?.acrescimo),tar=num(p?.tarifa);
  if(d)out.data=d;if(v!==null&&v>0)out.valorRecebido=v;if(des!==null&&des>=0)out.desconto=des;if(jur!==null&&jur>=0)out.juros=jur;if(acr!==null&&acr>=0)out.acrescimo=acr;if(tar!==null&&tar>=0)out.tarifa=tar;
  const conta=num(p?.conta?.id??p?.conta_id);if(conta&&conta>0)out.conta={id:conta};return out;
}
async function audit(sb:any,event_type:string,severity:string,details:any){await sb.from("bling_hub_audit_v2").insert({event_type,severity,domain:"finance",details:{...details,make_used:false}})}
async function seen(sb:any,key:string){const q=await sb.from("bling_hub_audit_v2").select("id,created_at,details").eq("domain","finance").contains("details",{idempotency_key:key}).order("created_at",{ascending:false}).limit(1);return q.data?.[0]||null}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";if(!url||!key)return json({ok:false,error:"server_config_missing"},500);
  const sb=createClient(url,key,{auth:{persistSession:false}});if(!await authorized(sb,req))return json({ok:false,error:"unauthorized"},401);
  const input=await req.json().catch(()=>({}));const action=clean(input?.action,80);
  try{
    const t=await token(sb);
    if(action==="capabilities"){
      const probes:any={receivables:"/contas/receber?pagina=1&limite=1",payables:"/contas/pagar?pagina=1&limite=1",financial_accounts:"/contas-contabeis?pagina=1&limite=1&ocultarInvisiveis=true"};const result:any={};
      for(const [name,path] of Object.entries(probes)){const r=await call(sb,t,String(path));result[name]={ok:r.ok,http_status:r.status,scope_missing:r.status===403}}
      return json({ok:true,readonly:!Object.values(result).every((x:any)=>x.ok),actions_enabled:Object.values(result).every((x:any)=>x.ok),probes:result});
    }
    const k=kind(input?.kind);if(!k)return json({ok:false,error:"invalid_kind"},400);const root=basePath(k);const id=Math.trunc(Number(input?.id||0));
    if(action==="detail"){
      if(id<=0)return json({ok:false,error:"invalid_id"},400);const r=await call(sb,t,root+"/"+id);if(!r.ok)return json({ok:false,error:r.status===403?"bling_finance_scope_missing":"bling_finance_read_failed",http_status:r.status},r.status||502);return json({ok:true,kind:k,account:r.data?.data||null});
    }
    if(action==="boletos"){
      if(k!=="receivable")return json({ok:false,error:"boletos_receivable_only"},400);const origin=Math.trunc(Number(input?.origin_id||0));if(origin<=0)return json({ok:false,error:"invalid_origin_id"},400);
      const qs=new URLSearchParams({idOrigem:String(origin)});for(const s of Array.isArray(input?.situacoes)?input.situacoes:[])qs.append("situacoes[]",String(Math.trunc(Number(s))));const r=await call(sb,t,"/contas/receber/boletos?"+qs.toString());if(!r.ok&&r.status!==404)return json({ok:false,error:r.status===403?"bling_finance_scope_missing":"bling_boleto_read_failed",http_status:r.status},r.status||502);return json({ok:true,boletos:r.status===404?[]:(r.data?.data??r.data??[])});
    }
    if(["create_preview","update_preview"].includes(action)){
      if(action==="update_preview"&&id<=0)return json({ok:false,error:"invalid_id"},400);const payload=savePayload(k,input?.payload||{});const missing=validateSave(payload);return json({ok:missing.length===0,preview:true,external_write:false,kind:k,operation:action.startsWith("create")?"create":"update",id:id||null,payload,missing,confirmation_required:true,confirmation_phrase:"CONFIRMAR"},missing.length?400:200);
    }
    if(action==="settle_preview"){
      if(id<=0)return json({ok:false,error:"invalid_id"},400);const payload=settlePayload(input?.payload||{});return json({ok:true,preview:true,external_write:false,kind:k,operation:"settle",id,payload,confirmation_required:true,confirmation_phrase:"CONFIRMAR",warning:"A baixa registra pagamento/recebimento no Bling; não executa transferência bancária."});
    }
    if(["create_execute","update_execute","settle_execute"].includes(action)){
      if(clean(input?.confirmation,40)!=="CONFIRMAR")return json({ok:false,error:"human_confirmation_required"},409);const idem=clean(input?.idempotency_key,160);if(idem.length<16)return json({ok:false,error:"idempotency_key_required"},400);const prior=await seen(sb,idem);if(prior)return json({ok:true,idempotent_replay:true,previous:prior,external_write:false});
      let path=root,method="POST",payload:any={};
      if(action==="create_execute"){payload=savePayload(k,input?.payload||{});const missing=validateSave(payload);if(missing.length)return json({ok:false,error:"validation_failed",missing},400)}
      if(action==="update_execute"){if(id<=0)return json({ok:false,error:"invalid_id"},400);path=root+"/"+id;method="PUT";payload=savePayload(k,input?.payload||{});const missing=validateSave(payload);if(missing.length)return json({ok:false,error:"validation_failed",missing},400)}
      if(action==="settle_execute"){if(id<=0)return json({ok:false,error:"invalid_id"},400);path=root+"/"+id+"/baixar";payload=settlePayload(input?.payload||{});if(!payload.data)return json({ok:false,error:"payment_date_required"},400)}
      await audit(sb,"finance_action_attempt","warning",{action,kind:k,id:id||null,idempotency_key:idem,external_write:true});const r=await call(sb,t,path,method,payload);
      if(!r.ok){await audit(sb,"finance_action_failed","error",{action,kind:k,id:id||null,idempotency_key:idem,http_status:r.status,external_write:false});return json({ok:false,error:r.status===403?"bling_finance_scope_missing":"bling_finance_write_failed",http_status:r.status,provider:r.data?.error||null},r.status||502)}
      await audit(sb,"finance_action_succeeded","warning",{action,kind:k,id:id||null,idempotency_key:idem,http_status:r.status,external_write:true,result_id:r.data?.data?.id||r.data?.bordero?.id||null});return json({ok:true,external_write:true,http_status:r.status,result:r.data||null});
    }
    return json({ok:false,error:"unknown_action"},404);
  }catch(e){await audit(sb,"finance_service_error","error",{action,error:clean((e as Error)?.message||e,500),external_write:false});return json({ok:false,error:"finance_service_error",detail:clean((e as Error)?.message||e,500)},500)}
});
