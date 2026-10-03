import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {buildTemplateCacheRows,listTemplatesViaMeta,MetaTemplatesError} from "../_shared/whatsapp-meta-templates-v1.mjs";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const META_WHATSAPP_ACCESS_TOKEN=(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"").trim();
const META_WHATSAPP_GRAPH_VERSION=(Deno.env.get("META_WHATSAPP_GRAPH_VERSION")||"").trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);

const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
  "Vary":"Origin",
  "Access-Control-Allow-Headers":"content-type,authorization,apikey",
  "Access-Control-Allow-Methods":"GET,OPTIONS"
}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const validUuid=(v:unknown)=>{const s=String(v??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const metaReady=()=>Boolean(META_WHATSAPP_ACCESS_TOKEN&&/^v\d+\.\d+$/.test(META_WHATSAPP_GRAPH_VERSION));

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false as const,status:401,error:"admin_auth_required"};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid"};
  const row=await db.from("admin_users").select("user_id,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed"};
  if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized"};
  return {ok:true as const,status:200,user_id:user.data.user.id};
}

async function accountById(accountId:string){
  const q=await db.from("whatsapp_accounts").select("id,slug,display_name,waba_id,phone_number_id,is_active").eq("id",accountId).eq("is_active",true).maybeSingle();
  if(q.error)throw q.error;
  return q.data||null;
}

async function cachedTemplates(accountId:string){
  const q=await db.from("whatsapp_templates_v1")
    .select("id,whatsapp_account_id,waba_id,meta_template_id,name,language,category,status,components,quality_rating,last_synced_at,metadata,updated_at")
    .eq("whatsapp_account_id",accountId)
    .order("name")
    .order("language");
  if(q.error)throw q.error;
  return (q.data||[]).map((row:any)=>{
    const attendance=row?.metadata?.attendance&&typeof row.metadata.attendance==="object"?row.metadata.attendance:{};
    const approved=String(row.status||"").toUpperCase()==="APPROVED";
    return {...row,sendable:approved&&attendance.enabled===true,attendance};
  });
}

async function syncTemplates(account:any){
  if(!metaReady())return {ok:false,error:"meta_transport_not_configured"};
  if(!/^\d{5,30}$/.test(String(account?.waba_id||"")))return {ok:false,error:"waba_not_configured"};

  const existing=await db.from("whatsapp_templates_v1").select("name,language,metadata").eq("whatsapp_account_id",account.id);
  if(existing.error)throw existing.error;
  const existingByKey=new Map((existing.data||[]).map((row:any)=>[`${row.name}\u0000${row.language}`,row]));

  const remote=await listTemplatesViaMeta({
    accessToken:META_WHATSAPP_ACCESS_TOKEN,
    wabaId:account.waba_id,
    graphVersion:META_WHATSAPP_GRAPH_VERSION,
    timeoutMs:12000,
    maxPages:20,
  });
  if(remote.truncated)return {ok:false,error:"meta_templates_pagination_truncated",page_count:remote.page_count};

  const syncedAt=new Date().toISOString();
  const rows=buildTemplateCacheRows({items:remote.items,account,existingByKey,syncedAt});
  if(rows.length){
    const saved=await db.from("whatsapp_templates_v1").upsert(rows,{onConflict:"waba_id,name,language"});
    if(saved.error)throw saved.error;
  }
  return {ok:true,synced:rows.length,last_synced_at:syncedAt,page_count:remote.page_count};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="GET")return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);

  const auth=await adminAuth(req);
  if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);

  try{
    const url=new URL(req.url);
    const action=String(url.searchParams.get("action")||"list").trim().toLowerCase();
    if(action!=="list"&&action!=="sync")return json(req,{ok:false,error:"action_not_allowed"},404);
    const accountId=validUuid(url.searchParams.get("account_id"));
    if(!accountId)return json(req,{ok:false,error:"invalid_account_id"},400);
    const account=await accountById(accountId);
    if(!account)return json(req,{ok:false,error:"account_not_found"},404);

    let sync=null;
    if(action==="sync"){
      sync=await syncTemplates(account);
      if(sync?.ok!==true){
        const status=sync?.error==="meta_transport_not_configured"?503:502;
        return json(req,sync,status);
      }
    }
    if(action==="list"||action==="sync"){
      const items=await cachedTemplates(account.id);
      return json(req,{ok:true,account:{id:account.id,slug:account.slug,display_name:account.display_name,waba_id:account.waba_id},sync,items});
    }
    return json(req,{ok:false,error:"action_not_allowed"},404);
  }catch(error){
    if(error instanceof MetaTemplatesError){
      console.error("admin-whatsapp-templates-v1",error.code,error.httpStatus||"");
      return json(req,{ok:false,error:error.code,retryable:error.retryable===true},error.httpStatus&&error.httpStatus<500?502:503);
    }
    console.error("admin-whatsapp-templates-v1",error instanceof Error?error.message:String(error));
    return json(req,{ok:false,error:"templates_backend_error"},500);
  }
});
