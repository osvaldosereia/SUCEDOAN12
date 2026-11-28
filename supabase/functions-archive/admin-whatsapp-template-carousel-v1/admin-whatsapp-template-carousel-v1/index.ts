import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {buildTemplateCacheRows,listTemplatesViaMeta} from "../_shared/whatsapp-meta-templates-v1.mjs";
import {createCarouselTemplateViaMeta,uploadTemplateMediaSampleViaMeta,MetaCarouselError} from "../_shared/whatsapp-meta-carousel-v1.mjs";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const META_WHATSAPP_ACCESS_TOKEN=(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"").trim();
const META_WHATSAPP_GRAPH_VERSION=(Deno.env.get("META_WHATSAPP_GRAPH_VERSION")||"").trim();
const META_APP_ID=(Deno.env.get("META_APP_ID")||Deno.env.get("WHATSAPP_APP_ID")||"").trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);

const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"POST,OPTIONS"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const validUuid=(v:unknown)=>{const s=String(v??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)return {ok:false as const,status:401,error:"admin_auth_required"};
  const user=await db.auth.getUser(token);if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid"};
  const row=await db.from("admin_users").select("user_id,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed"};if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized"};return {ok:true as const,status:200,user_id:user.data.user.id};
}
async function accountById(accountId:string){const q=await db.from("whatsapp_accounts").select("id,waba_id,is_active").eq("id",accountId).eq("is_active",true).maybeSingle();if(q.error)throw q.error;return q.data||null}
async function syncTemplates(account:any){
  const existing=await db.from("whatsapp_templates_v1").select("name,language,metadata").eq("whatsapp_account_id",account.id);if(existing.error)throw existing.error;
  const existingByKey=new Map((existing.data||[]).map((row:any)=>[`${row.name}\u0000${row.language}`,row]));
  const remote=await listTemplatesViaMeta({accessToken:META_WHATSAPP_ACCESS_TOKEN,wabaId:account.waba_id,graphVersion:META_WHATSAPP_GRAPH_VERSION,timeoutMs:12000,maxPages:20});
  if(remote.truncated)throw new Error('meta_templates_pagination_truncated');
  const syncedAt=new Date().toISOString();const rows=buildTemplateCacheRows({items:remote.items,account,existingByKey,syncedAt});
  if(rows.length){const saved=await db.from("whatsapp_templates_v1").upsert(rows,{onConflict:"waba_id,name,language"});if(saved.error)throw saved.error}
  return {synced:rows.length,last_synced_at:syncedAt};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SERVICE_KEY||!META_WHATSAPP_ACCESS_TOKEN||!/^v\d+\.\d+$/.test(META_WHATSAPP_GRAPH_VERSION))return json(req,{ok:false,error:"server_config"},500);
  const auth=await adminAuth(req);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
  const action=String(new URL(req.url).searchParams.get("action")||"").trim().toLowerCase();
  try{
    if(action==='upload_media'){
      if(!META_APP_ID)return json(req,{ok:false,error:"meta_app_id_not_configured"},503);
      const form=await req.formData();const accountId=validUuid(form.get('account_id'));const file=form.get('file');
      if(!accountId||!(file instanceof File))return json(req,{ok:false,error:"invalid_upload_payload"},400);
      const account=await accountById(accountId);if(!account)return json(req,{ok:false,error:"account_not_found"},404);
      const bytes=new Uint8Array(await file.arrayBuffer());
      const uploaded=await uploadTemplateMediaSampleViaMeta({accessToken:META_WHATSAPP_ACCESS_TOKEN,appId:META_APP_ID,graphVersion:META_WHATSAPP_GRAPH_VERSION,fileName:file.name,mimeType:file.type,bytes});
      return json(req,{ok:true,handle:uploaded.handle,mime_type:uploaded.mime_type,size_bytes:uploaded.size_bytes},200);
    }
    if(action==='create'){
      const body=await req.json().catch(()=>({}));const accountId=validUuid(body?.account_id);if(!accountId)return json(req,{ok:false,error:"invalid_account_id"},400);
      if(body?.to_phone_e164!==undefined||body?.destination_phone!==undefined||body?.phone_number_id!==undefined||body?.waba_id!==undefined)return json(req,{ok:false,error:"destination_fields_not_allowed"},400);
      const account=await accountById(accountId);if(!account)return json(req,{ok:false,error:"account_not_found"},404);
      const created=await createCarouselTemplateViaMeta({accessToken:META_WHATSAPP_ACCESS_TOKEN,wabaId:account.waba_id,graphVersion:META_WHATSAPP_GRAPH_VERSION,draft:body?.draft});
      const sync=await syncTemplates(account).catch(()=>null);
      return json(req,{ok:true,meta_template_id:String(created?.payload?.id||'')||null,status:created?.payload?.status||'PENDING',sync},200);
    }
    return json(req,{ok:false,error:"action_not_allowed"},404);
  }catch(error){
    if(error instanceof MetaCarouselError)return json(req,{ok:false,error:error.code,retryable:error.retryable,http_status:error.httpStatus},error.httpStatus&&error.httpStatus>=400?502:400);
    console.error('admin_whatsapp_template_carousel_error',error instanceof Error?error.message:String(error));return json(req,{ok:false,error:"internal_error"},500);
  }
});
