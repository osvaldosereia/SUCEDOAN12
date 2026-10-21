import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {sendTemplateViaMeta} from "../_shared/whatsapp-meta-transport-v1.mjs";
import {runPostSaleWorkerBatch} from "../_shared/marketing-post-sale-worker-v1.mjs";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const META_TOKEN=Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"";
const GRAPH_VERSION=Deno.env.get("META_WHATSAPP_GRAPH_VERSION")||"v24.0";
const INTERNAL_HEADER="x-dona-antonia-marketing-worker-key";
const MAX_BODY_BYTES=2048;
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(value:unknown,max=160)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);
function safeEquals(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let index=0;index<a.length;index++)diff|=a.charCodeAt(index)^b.charCodeAt(index);return diff===0}

async function authorized(req:Request){
  const supplied=clean(req.headers.get(INTERNAL_HEADER),5000);
  if(!supplied)return false;
  const result=await db.rpc("marketing_campaign_worker_internal_key_v1");
  const expected=!result.error&&typeof result.data==="string"?result.data:"";
  return Boolean(expected)&&safeEquals(supplied,expected);
}

async function readBody(req:Request){
  const raw=await req.text();
  if(raw.length>MAX_BODY_BYTES)return {ok:false as const,error:"payload_too_large"};
  if(!raw.trim())return {ok:true as const,body:{limit:10}};
  try{
    const body=JSON.parse(raw);
    if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(key=>key!=="limit"))return {ok:false as const,error:"invalid_body"};
    if(body.limit!==undefined&&(!Number.isInteger(Number(body.limit))||Number(body.limit)<1||Number(body.limit)>25))return {ok:false as const,error:"invalid_limit"};
    return {ok:true as const,body};
  }catch{return {ok:false as const,error:"invalid_body"}}
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SERVICE_KEY||!META_TOKEN||!/^v\d+\.\d+$/.test(GRAPH_VERSION))return json({ok:false,error:"server_not_configured"},503);
  if(!await authorized(req))return json({ok:false,error:"unauthorized"},403);
  const parsed=await readBody(req);
  if(!parsed.ok)return json({ok:false,error:parsed.error},400);
  try{
    const results=await runPostSaleWorkerBatch({
      db,
      limit:parsed.body.limit,
      accessToken:META_TOKEN,
      graphVersion:GRAPH_VERSION,
      sendTemplate:request=>sendTemplateViaMeta(request),
    });
    return json({ok:true,claimed:results.length,results});
  }catch(error){
    console.error("marketing_post_sale_worker_failed",clean(error instanceof Error?error.message:error));
    return json({ok:false,error:"post_sale_worker_failed"},503);
  }
});
