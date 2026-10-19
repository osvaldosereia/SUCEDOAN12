import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {sendTemplateViaMeta,MetaTransportError} from "../_shared/whatsapp-meta-transport-v1.mjs";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const META_TOKEN=Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"";
const GRAPH_VERSION=Deno.env.get("META_WHATSAPP_GRAPH_VERSION")||"v24.0";
const INTERNAL_HEADER="x-dona-antonia-marketing-worker-key";
const MAX_BODY_BYTES=2048;
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(value:unknown,max=120)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);
function safeEquals(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
async function hashKey(){const r=await db.rpc("marketing_campaign_worker_internal_key_v1");return !r.error&&typeof r.data==="string"?r.data:""}
async function authorized(req:Request){const supplied=clean(req.headers.get(INTERNAL_HEADER),5000);if(!supplied)return false;const expected=await hashKey();return Boolean(expected)&&safeEquals(supplied,expected)}
async function readBody(req:Request){
  const raw=await req.text();
  if(raw.length>MAX_BODY_BYTES)return {ok:false as const,error:"payload_too_large"};
  if(!raw.trim())return {ok:true as const,body:{}};
  try{
    const body=JSON.parse(raw);
    if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>k!=="limit"))return {ok:false as const,error:"invalid_body"};
    return {ok:true as const,body};
  }catch{return {ok:false as const,error:"invalid_body"}}
}
function requestedLimit(value:unknown){const n=Number(value??10);return Number.isInteger(n)&&n>0?Math.min(n,25):10}
function templateVariables(templateComponents:unknown,customerName:unknown,basketName:unknown,categories:unknown,templateName:unknown){
  const rows=Array.isArray(templateComponents)?templateComponents:[];
  const header=rows.find((x:any)=>String(x?.type||"").toUpperCase()==="HEADER");
  if(header&&/\{\{\s*\d+\s*\}\}/.test(String(header?.text||"")))throw Error("template_header_variables_not_supported");
  const body=rows.find((x:any)=>String(x?.type||"").toUpperCase()==="BODY");
  const text=String(body?.text||"");
  const matches=[...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(x=>Number(x[1]));
  const indexes=[...new Set(matches)].sort((a,b)=>a-b);
  if(indexes.length===0)return [];
  if(indexes.length>2||indexes.some((n,i)=>n!==i+1))throw Error("template_variables_not_supported");
  const categoryList=Array.isArray(categories)?categories.map(x=>clean(x,32)).filter(Boolean).slice(0,3).join(", "):"";
  const secondaryValue=String(templateName||"").startsWith("ofertacategoria")?categoryList||"diversas categorias":clean(basketName,60)||"cesta básica";
  const firstName=clean(customerName,80).split(/\s+/)[0]||"cliente";
  const values=[firstName,secondaryValue];
  return [{type:"body",parameters:indexes.map(index=>({type:"text",text:values[index-1]}))}];
}
async function finish(id:string,status:string,providerId:string|null=null,error:string|null=null){
  const r=await db.rpc("marketing_repurchase_finish_dispatch_v1",{
    p_dispatch_id:id,p_status:status,p_provider_message_id:providerId,p_error:error
  });
  if(r.error||r.data?.ok!==true)throw Error("dispatch_ledger_update_failed");
  return r.data;
}
async function process(item:any){
  const id=String(item?.id||"");if(!/^[0-9a-f-]{36}$/i.test(id))return {status:"invalid"};
  const validated=await db.rpc("marketing_repurchase_validate_dispatch_v1",{p_dispatch_id:id});
  const data=validated.data?.item;
  if(validated.error||validated.data?.ok!==true||!data){
    await finish(id,"suppressed",null,"dispatch_not_eligible");
    return {status:"suppressed"};
  }
  let components:unknown[];
  try{components=templateVariables(data.template_components,data.customer_name,data.basket_name,data.product_categories,data.template_name)}
  catch(error){
    await finish(id,"failed",null,clean(error instanceof Error?error.message:error));
    return {status:"failed",error:"template_variables_not_supported"};
  }
  try{
    const sent=await sendTemplateViaMeta({
      accessToken:META_TOKEN,
      phoneNumberId:String(data.phone_number_id),
      toE164:String(data.to_phone_e164),
      templateName:String(data.template_name),
      languageCode:String(data.language_code||"pt_BR"),
      components,
      graphVersion:GRAPH_VERSION,
      timeoutMs:15000,
    });
    await finish(id,"accepted",String(sent.providerMessageId||""));
    return {status:"accepted"};
  }catch(error){
    const code=clean(error instanceof MetaTransportError?error.code:error instanceof Error?error.message:error,160)||"meta_send_failed";
    const state=error instanceof MetaTransportError&&error.uncertain===true?"uncertain":"failed";
    await finish(id,state,null,code);
    return {status:state,error:code};
  }
}
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SERVICE_KEY||!META_TOKEN)return json({ok:false,error:"server_not_configured"},503);
  if(!await authorized(req))return json({ok:false,error:"unauthorized"},403);
  const parsed=await readBody(req);if(!parsed.ok)return json({ok:false,error:parsed.error},400);
  const claimed=await db.rpc("marketing_repurchase_claim_due_v1",{p_limit:requestedLimit(parsed.body.limit)});
  if(claimed.error||claimed.data?.ok!==true)return json({ok:false,error:"claim_failed"},503);
  const items=Array.isArray(claimed.data?.items)?claimed.data.items:[];
  const results=[];
  for(const item of items){
    try{results.push({id:item.id,...await process(item)})}
    catch(error){results.push({id:item.id,status:"error",error:clean(error instanceof Error?error.message:error,160)})}
  }
  return json({ok:true,claimed:items.length,results});
});
