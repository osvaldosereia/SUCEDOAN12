import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {deleteTemplateViaMeta,MetaTemplatesError} from "../_shared/whatsapp-meta-templates-v1.mjs";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const META_WHATSAPP_ACCESS_TOKEN=(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"").trim();
const META_WHATSAPP_GRAPH_VERSION=(Deno.env.get("META_WHATSAPP_GRAPH_VERSION")||"").trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const MAX_BODY_BYTES=6000;
const POST_ACTIONS=new Set(["set_protected","delete_meta"]);

const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
  "Vary":"Origin",
  "Access-Control-Allow-Headers":"content-type,authorization,apikey",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const objectLike=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
const validUuid=(value:unknown)=>{const s=String(value??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const clean=(value:unknown,max=300)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);
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
async function readBody(req:Request){
  const raw=await req.text();
  if(raw.length>MAX_BODY_BYTES)return {ok:false as const,error:"payload_too_large"};
  if(!raw.trim())return {ok:true as const,body:{}};
  try{const parsed=JSON.parse(raw);if(!objectLike(parsed))return {ok:false as const,error:"invalid_json_body"};return {ok:true as const,body:parsed as Record<string,unknown>}}
  catch{return {ok:false as const,error:"invalid_json_body"}}
}
function statusFor(data:any){
  if(data?.ok===true)return 200;
  const code=String(data?.error||"");
  if(code==="template_not_found")return 404;
  if(["template_protected","template_not_deletion_candidate","template_campaign_dependency","template_strategy_dependency","template_unused_window_not_met","template_delete_not_approved"].includes(code))return 409;
  return 400;
}
async function list(accountId:string|null){
  const refreshed=await db.rpc("marketing_template_lifecycle_refresh_v1");
  if(refreshed.error)throw refreshed.error;
  const result=await db.rpc("marketing_template_lifecycle_list_v1",{p_whatsapp_account_id:accountId});
  if(result.error)throw result.error;
  return result.data||{ok:true,items:[],candidate_count:0,minimum_unused_days:60};
}
async function setProtected(body:Record<string,unknown>,actor:string){
  if(Object.keys(body).some(key=>!["template_id","protected"].includes(key)))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const templateId=validUuid(body.template_id);if(!templateId||typeof body.protected!=="boolean")return {status:400,data:{ok:false,error:"invalid_payload"}};
  const result=await db.rpc("marketing_template_lifecycle_set_protected_v1",{p_template_id:templateId,p_protected:body.protected,p_actor_user_id:actor});
  if(result.error)throw result.error;return {status:statusFor(result.data),data:result.data};
}
async function deleteMeta(body:Record<string,unknown>,actor:string){
  if(Object.keys(body).some(key=>!["template_id","confirm_delete"].includes(key)))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const templateId=validUuid(body.template_id);
  if(!templateId||body.confirm_delete!==true)return {status:400,data:{ok:false,error:"explicit_delete_confirmation_required"}};
  if(!metaReady())return {status:503,data:{ok:false,error:"meta_transport_not_configured"}};

  const approved=await db.rpc("marketing_template_lifecycle_approve_delete_v1",{p_template_id:templateId,p_actor_user_id:actor});
  if(approved.error)throw approved.error;
  if(approved.data?.ok!==true)return {status:statusFor(approved.data),data:approved.data};
  if(approved.data?.lifecycle_status==="deleted_meta")return {status:200,data:approved.data};

  const template=await db.from("whatsapp_templates_v1")
    .select("id,name,meta_template_id,waba_id,whatsapp_account_id,metadata")
    .eq("id",templateId).maybeSingle();
  if(template.error)throw template.error;
  if(!template.data)return {status:404,data:{ok:false,error:"template_not_found"}};

  const account=await db.from("whatsapp_accounts").select("id,waba_id,is_active").eq("id",template.data.whatsapp_account_id).eq("is_active",true).maybeSingle();
  if(account.error)throw account.error;
  if(!account.data?.waba_id)return {status:409,data:{ok:false,error:"template_account_not_available"}};

  const metaTemplateId=/^\d{5,30}$/.test(String(template.data.meta_template_id||""))?String(template.data.meta_template_id):null;
  let providerPayload:Record<string,unknown>={};
  try{
    const result=await deleteTemplateViaMeta({
      accessToken:META_WHATSAPP_ACCESS_TOKEN,
      wabaId:account.data.waba_id,
      graphVersion:META_WHATSAPP_GRAPH_VERSION,
      name:String(template.data.name||""),
      templateId:metaTemplateId,
      timeoutMs:15000,
    });
    providerPayload={deleted:true,meta_template_id:metaTemplateId,payload:result.payload||{}};
  }catch(error){
    if(error instanceof MetaTemplatesError&&error.httpStatus===404){
      providerPayload={deleted:true,already_missing:true,http_status:404,meta_template_id:metaTemplateId};
    }else{
      const code=error instanceof MetaTemplatesError?error.code:clean(error instanceof Error?error.message:String(error),180)||"meta_template_delete_failed";
      return {status:502,data:{ok:false,error:code,retryable:error instanceof MetaTemplatesError?error.retryable===true:false,delete_approved:true}};
    }
  }

  const marked=await db.rpc("marketing_template_lifecycle_mark_deleted_v1",{p_template_id:templateId,p_actor_user_id:actor,p_provider_payload:providerPayload});
  if(marked.error)throw marked.error;
  return {status:statusFor(marked.data),data:{...marked.data,provider:providerPayload}};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="GET"&&req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);
  const auth=await adminAuth(req);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
  try{
    const url=new URL(req.url),action=clean(url.searchParams.get("action"),40).toLowerCase();
    if(req.method==="GET"){
      if(action!=="list")return json(req,{ok:false,error:"action_not_allowed"},404);
      const rawAccount=String(url.searchParams.get("account_id")||"").trim();
      const accountId=rawAccount?validUuid(rawAccount):null;if(rawAccount&&!accountId)return json(req,{ok:false,error:"invalid_account_id"},400);
      return json(req,await list(accountId));
    }
    if(!POST_ACTIONS.has(action))return json(req,{ok:false,error:"action_not_allowed"},404);
    const parsed=await readBody(req);if(!parsed.ok)return json(req,{ok:false,error:parsed.error},parsed.error==="payload_too_large"?413:400);
    const result=action==="set_protected"?await setProtected(parsed.body,auth.user_id):await deleteMeta(parsed.body,auth.user_id);
    return json(req,result.data,result.status);
  }catch(error){
    console.error("admin_marketing_template_lifecycle_error",error instanceof Error?error.message:String(error));
    return json(req,{ok:false,error:"internal_error"},500);
  }
});
