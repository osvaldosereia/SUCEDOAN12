import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const MAX_BODY_BYTES=512;
const ACTIONS=new Set(["open","checkout"]);

const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
  "Vary":"Origin",
  "Access-Control-Allow-Headers":"content-type,apikey",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
const validToken=(value:unknown)=>{const token=String(value??"").trim().toLowerCase();return /^[0-9a-f]{36}$/.test(token)?token:null};

async function body(req:Request){
  const raw=await req.text();if(raw.length>MAX_BODY_BYTES)return {ok:false as const,error:"payload_too_large"};
  try{const parsed=JSON.parse(raw||"{}");if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return {ok:false as const,error:"invalid_body"};return {ok:true as const,value:parsed as Record<string,unknown>}}
  catch{return {ok:false as const,error:"invalid_body"}}
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);
  const action=String(new URL(req.url).searchParams.get("action")||"").trim().toLowerCase();
  if(!ACTIONS.has(action))return json(req,{ok:false,error:"action_not_allowed"},404);
  const parsed=await body(req);if(!parsed.ok)return json(req,{ok:false,error:parsed.error},parsed.error==="payload_too_large"?413:400);
  if(Object.keys(parsed.value).some(key=>key!=="token"))return json(req,{ok:false,error:"fields_not_allowed"},400);
  const token=validToken(parsed.value.token);if(!token)return json(req,{ok:false,error:"tracking_token_invalid"},400);

  try{
    const rpc=action==="open"?"marketing_resolve_tracking_token_v1":"marketing_track_checkout_v1";
    const result=await db.rpc(rpc,{p_token:token});
    if(result.error)throw result.error;
    const data=result.data||{ok:false,error:"tracking_unavailable"};
    if(data?.ok!==true){const status=data?.error==="tracking_token_not_found"?404:400;return json(req,{ok:false,error:data?.error||"tracking_unavailable"},status)}
    // As RPCs públicas por esta Edge retornam apenas contexto comercial seguro, nunca PII.
    return json(req,data,200);
  }catch(error){
    console.error("marketing_tracking_v1",error instanceof Error?error.message:String(error));
    return json(req,{ok:false,error:"tracking_unavailable"},500);
  }
});
