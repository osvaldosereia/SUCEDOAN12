import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {sendTemplateViaMeta,MetaTransportError} from "../_shared/whatsapp-meta-transport-v1.mjs";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const META_TOKEN=Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"";
const GRAPH_VERSION=Deno.env.get("META_WHATSAPP_GRAPH_VERSION")||"";
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

const DEFAULT_BATCH=10;
const MAX_BATCH=25;
const MAX_BODY_BYTES=4096;
const INTERNAL_HEADER="x-dona-antonia-marketing-worker-key";
const ALLOWED_BODY_FIELDS=new Set(["limit","tick_id"]);
const TRACKING_MEDIA_HOSTS=new Set([
  "donaantonia.com.br","www.donaantonia.com.br","ssbesxgaijknwsjbsbcz.supabase.co",
  "firebasestorage.googleapis.com","storage.googleapis.com",
]);

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const normalizeDigits=(value:unknown)=>String(value??"").replace(/\D+/g,"");
const officialChannel=(phone:unknown)=>{const digits=normalizeDigits(phone);return digits.endsWith("0975")||digits.endsWith("1018")};
const text=(value:unknown,max=300)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);

function safeEquals(a:string,b:string){
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
function safeTrackingImage(value:unknown){
  const raw=text(value,2000);if(!raw)return null;
  try{
    const url=new URL(raw);
    if(url.protocol!=="https:"||url.username||url.password||!TRACKING_MEDIA_HOSTS.has(url.hostname.toLowerCase()))return null;
    return url.toString();
  }catch{return null}
}

async function authenticate(req:Request){
  const provided=text(req.headers.get(INTERNAL_HEADER),5000);
  if(!provided)return false;
  const expected=await db.rpc("marketing_campaign_worker_internal_key_v1");
  if(expected.error||typeof expected.data!=="string"||!expected.data)return false;
  return safeEquals(provided,expected.data);
}

async function readBody(req:Request){
  const raw=await req.text();
  if(raw.length>MAX_BODY_BYTES)return {ok:false as const,error:"payload_too_large"};
  if(!raw.trim())return {ok:true as const,body:{}};
  try{
    const body=JSON.parse(raw);
    if(!body||typeof body!=="object"||Array.isArray(body))return {ok:false as const,error:"invalid_json_body"};
    if(Object.keys(body).some(key=>!ALLOWED_BODY_FIELDS.has(key)))return {ok:false as const,error:"fields_not_allowed"};
    return {ok:true as const,body:body as Record<string,unknown>};
  }catch{return {ok:false as const,error:"invalid_json_body"}}
}

function requestedLimit(value:unknown){
  const n=Number(value??DEFAULT_BATCH);if(!Number.isInteger(n)||n<1)return DEFAULT_BATCH;return Math.min(n,MAX_BATCH);
}

function bodyComponents(templateComponents:unknown,variableValues:unknown,trackingLinks:any[]=[]){
  const vars=(variableValues&&typeof variableValues==="object"&&!Array.isArray(variableValues))?{...(variableValues as Record<string,unknown>)}:{};
  const components=Array.isArray(templateComponents)?templateComponents:[];
  const body=components.find((item:any)=>String(item?.type||"").toUpperCase()==="BODY");
  const required=[...new Set([...String(body?.text||"").matchAll(/\{\{(\d+)\}\}/g)].map(match=>Number(match[1])).filter(Number.isInteger))].sort((a,b)=>a-b);
  if(required.includes(3)&&trackingLinks.length===1&&text(trackingLinks[0]?.url,2000))vars["3"]=text(trackingLinks[0].url,2000);
  const indexes=required.length?required:Object.keys(vars).filter(key=>/^\d+$/.test(key)).map(Number).sort((a,b)=>a-b);
  if(!indexes.length)return [];
  const parameters=indexes.map(index=>{
    const value=text(vars[String(index)],2000);
    if(!value)throw new Error(`template_variable_missing:${index}`);
    return {type:"text",text:value};
  });
  return [{type:"body",parameters}];
}

function carouselTrackingComponent(templateComponents:unknown,trackingLinks:any[]=[],trackingRequired=false){
  const components=Array.isArray(templateComponents)?templateComponents:[];
  const carousel=components.find((item:any)=>String(item?.type||"").toUpperCase()==="CAROUSEL");
  if(!carousel||!trackingRequired)return null;
  const cards=Array.isArray(carousel.cards)?carousel.cards:[];
  if(!cards.length)throw new Error("carousel_template_cards_missing");
  if(trackingLinks.length!==cards.length)throw new Error("carousel_tracking_links_mismatch");
  return {
    type:"carousel",
    cards:trackingLinks.map((link:any,index:number)=>{
      const token=text(link?.tracking_token,120);
      const cardIndex=Number(link?.card_index);
      const imageUrl=safeTrackingImage(link?.image_url);
      if(!/^[0-9a-f]{36}$/.test(token)||!Number.isInteger(cardIndex)||cardIndex!==index||!imageUrl)throw new Error("carousel_tracking_link_invalid");
      return {card_index:cardIndex,components:[
        {type:"header",parameters:[{type:"image",image:{link:imageUrl}}]},
        {type:"button",sub_type:"url",index:"0",parameters:[{type:"text",text:token}]},
      ]};
    }),
  };
}

function messageComponents(templateComponents:unknown,variableValues:unknown,trackingLinks:any[]=[],trackingRequired=false){
  const output=bodyComponents(templateComponents,variableValues,trackingLinks);
  const carousel=carouselTrackingComponent(templateComponents,trackingLinks,trackingRequired);
  if(carousel)output.push(carousel);
  return output;
}

async function finish(dispatchId:string,status:string,lastError:string|null=null,retryAfter:number|null=null){
  const result=await db.rpc("marketing_finish_dispatch_v1",{
    p_dispatch_id:dispatchId,p_status:status,p_provider_message_id:null,p_last_error:lastError,p_retry_after_seconds:retryAfter
  });
  return result.error?{ok:false,error:"finish_failed"}:result.data;
}

async function loadExecutionRows(){
  const result=await db.from("marketing_campaign_execution_runtime_v1")
    .select("whatsapp_account_id,mode,max_batch_size").in("mode",["canary","live"]);
  if(result.error)throw new Error("execution_runtime_lookup_failed");
  return result.data||[];
}

async function officialCanaryPhones(){
  const result=await db.from("whatsapp_accounts").select("id,phone_e164,is_active").eq("is_active",true);
  if(result.error)throw new Error("accounts_lookup_failed");
  return new Set((result.data||[]).filter((row:any)=>officialChannel(row.phone_e164)).map((row:any)=>normalizeDigits(row.phone_e164)));
}

async function loadRunnableAccount(accountId:string){
  const channel=await db.from("whatsapp_channel_runtime_v1")
    .select("whatsapp_account_id,campaigns_enabled,send_enabled,outbound_provider").eq("whatsapp_account_id",accountId).maybeSingle();
  if(channel.error||!channel.data||channel.data.campaigns_enabled!==true||channel.data.send_enabled!==true||channel.data.outbound_provider!=="meta")return null;
  const account=await db.from("whatsapp_accounts")
    .select("id,phone_e164,phone_number_id,is_active").eq("id",accountId).eq("is_active",true).maybeSingle();
  if(account.error||!account.data||!/^\d{5,30}$/.test(String(account.data.phone_number_id||"")))return null;
  return account.data;
}

async function processDispatch(item:any,mode:string,account:any,canaryPhones:Set<string>){
  const dispatchId=String(item?.id||"");
  const attemptCount=Number(item?.attempt_count||0);
  if(!dispatchId)return {status:"invalid"};

  const validated=await db.rpc("marketing_revalidate_dispatch_v1",{p_dispatch_id:dispatchId});
  if(validated.error)return {status:"error",error:"revalidate_failed"};
  const data=validated.data||{};
  if(data.ok!==true)return {status:data.error==="dispatch_skipped"?"skipped":"blocked",error:data.error||"revalidate_blocked"};

  const toDigits=normalizeDigits(data.to_phone_e164);
  if(mode==="canary"&&!canaryPhones.has(toDigits)){
    await finish(dispatchId,"skipped","canary_recipient_not_allowed",null);
    return {status:"skipped",error:"canary_recipient_not_allowed"};
  }

  const tracking=await db.rpc("marketing_issue_tracking_links_v1",{p_dispatch_id:dispatchId});
  if(tracking.error||tracking.data?.ok!==true){
    await finish(dispatchId,"failed","tracking_links_unavailable",null);
    return {status:"failed",error:"tracking_links_unavailable"};
  }
  const tracking_links=Array.isArray(tracking.data?.tracking_links)?tracking.data.tracking_links:[];
  const strategyTracked=tracking.data?.strategy_tracked===true;

  let components:any[];
  try{components=messageComponents(data.template_components,data.variable_values,tracking_links,strategyTracked)}
  catch(error){await finish(dispatchId,"failed",text(error instanceof Error?error.message:error,500),null);return {status:"failed",error:"template_variables_invalid"}}

  try{
    const sent=await sendTemplateViaMeta({
      accessToken:META_TOKEN,
      phoneNumberId:account.phone_number_id,
      toE164:data.to_phone_e164,
      templateName:data.template_name,
      languageCode:data.language_code,
      components,
      graphVersion:GRAPH_VERSION,
      timeoutMs:10000,
    });
    const accepted=await db.rpc("marketing_accept_meta_dispatch_v1",{
      p_dispatch_id:dispatchId,p_provider_message_id:sent.providerMessageId,p_accepted_at:new Date().toISOString()
    });
    if(accepted.error||accepted.data?.ok!==true){
      await finish(dispatchId,"uncertain",`meta_accept_persist_failed:${sent.providerMessageId}`,null);
      return {status:"uncertain",error:"meta_accept_persist_failed"};
    }
    return {status:"accepted",provider_message_id:sent.providerMessageId};
  }catch(error){
    const code=text(error instanceof Error?((error as any).code||error.message):error,500)||"meta_send_failed";
    if(error instanceof MetaTransportError&&error.uncertain===true){await finish(dispatchId,"uncertain",code,null);return {status:"uncertain",error:code}}
    if(error instanceof MetaTransportError&&error.retryable===true&&attemptCount<2){
      const retryAfter=attemptCount===0?30:120;
      await finish(dispatchId,"retry",code,retryAfter);return {status:"retry",error:code,retry_after_seconds:retryAfter};
    }
    await finish(dispatchId,"failed",code,null);return {status:"failed",error:code};
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SERVICE_KEY)return json({ok:false,error:"server_config"},500);
  if(!(await authenticate(req)))return json({ok:false,error:"worker_auth_failed"},401);
  const parsed=await readBody(req);if(!parsed.ok)return json({ok:false,error:parsed.error},parsed.error==="payload_too_large"?413:400);
  const limit=requestedLimit(parsed.body.limit);

  try{
    const runtimes=await loadExecutionRows();
    if(!runtimes.length)return json({ok:true,mode:"off",claimed:0,processed:0,results:[]});
    if(!META_TOKEN||!/^v\d+\.\d+$/.test(GRAPH_VERSION))return json({ok:false,error:"meta_transport_not_configured"},503);
    const canaryPhones=await officialCanaryPhones();
    const results:any[]=[];
    let claimed=0;
    for(const runtime of runtimes){
      const mode=String(runtime.mode||"off");if(mode==="off")continue;
      const account=await loadRunnableAccount(String(runtime.whatsapp_account_id||""));if(!account)continue;
      const batch=Math.min(limit,Number(runtime.max_batch_size||DEFAULT_BATCH),MAX_BATCH);
      const claim=await db.rpc("marketing_claim_dispatch_batch_v1",{p_whatsapp_account_id:runtime.whatsapp_account_id,p_limit:batch});
      if(claim.error||claim.data?.ok!==true)continue;
      const items=Array.isArray(claim.data?.items)?claim.data.items:[];claimed+=items.length;
      for(const item of items)results.push(await processDispatch(item,mode,account,canaryPhones));
    }
    return json({ok:true,claimed,processed:results.length,results});
  }catch(error){
    console.error("whatsapp_marketing_worker_v1",error instanceof Error?error.message:String(error));
    return json({ok:false,error:"worker_internal_error"},500);
  }
});
