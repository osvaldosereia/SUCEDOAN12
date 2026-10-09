import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {buildTemplateCacheRows,listTemplatesViaMeta,createTemplateViaMeta,editTemplateViaMeta,deleteTemplateViaMeta,MetaTemplatesError} from "../_shared/whatsapp-meta-templates-v1.mjs";
import {sendTemplateViaMeta,MetaTransportError} from "../_shared/whatsapp-meta-transport-v1.mjs";

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
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS"
}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const validUuid=(v:unknown)=>{const s=String(v??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const clean=(v:unknown,max=200)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const validIdempotency=(v:unknown)=>{const s=String(v??"").trim();return s.length>=8&&s.length<=120&&/^[A-Za-z0-9._:-]+$/.test(s)?s:null};
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

async function templateRowById(templateId:string){
  const q=await db.from("whatsapp_templates_v1")
    .select("id,whatsapp_account_id,waba_id,meta_template_id,name,language,category,status,components,quality_rating,last_synced_at,metadata,updated_at")
    .eq("id",templateId)
    .maybeSingle();
  if(q.error)throw q.error;
  return q.data||null;
}

async function templateEvents(row:any){
  if(!row)return [];
  let q=db.from("whatsapp_template_events_v1")
    .select("id,event_type,status,quality_rating,reason,occurred_at,received_at")
    .eq("waba_id",row.waba_id)
    .order("occurred_at",{ascending:false})
    .limit(50);
  if(/^\d{5,30}$/.test(String(row.meta_template_id||"")))q=q.eq("meta_template_id",row.meta_template_id);
  else q=q.eq("template_name",row.name).eq("language",row.language);
  const result=await q;
  if(result.error)throw result.error;
  return result.data||[];
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
  const remote=await listTemplatesViaMeta({accessToken:META_WHATSAPP_ACCESS_TOKEN,wabaId:account.waba_id,graphVersion:META_WHATSAPP_GRAPH_VERSION,timeoutMs:12000,maxPages:20});
  if(remote.truncated)return {ok:false,error:"meta_templates_pagination_truncated",page_count:remote.page_count};
  const syncedAt=new Date().toISOString();
  const rows=buildTemplateCacheRows({items:remote.items,account,existingByKey,syncedAt});
  if(rows.length){const saved=await db.from("whatsapp_templates_v1").upsert(rows,{onConflict:"waba_id,name,language"});if(saved.error)throw saved.error}
  return {ok:true,synced:rows.length,last_synced_at:syncedAt,page_count:remote.page_count};
}

async function mutationResult(account:any,mutation:string,remote:any){
  const sync=await syncTemplates(account);
  const items=sync?.ok===true?await cachedTemplates(account.id):[];
  return {
    ok:true,
    mutation,
    account_id:account.id,
    meta_template_id:clean(remote?.payload?.id??remote?.meta_template_id,80)||null,
    sync,
    sync_pending:sync?.ok!==true,
    items,
  };
}

function mutationFieldsBlocked(body:any,action:string){
  const forbidden=["waba_id","phone_number_id","access_token","to_phone_e164","conversation_id","customer_id","whatsapp_account_id"];
  if(forbidden.some(key=>body?.[key]!==undefined))return true;
  if(action!=="create"&&body?.account_id!==undefined)return true;
  if(action==="create"&&body?.template_id!==undefined)return true;
  return false;
}

async function markFailed(claim:any,errorCode:string){
  const now=new Date().toISOString();
  const updated=await db.from("whatsapp_outbox_v1").update({status:"failed",last_error:clean(errorCode,180)||"template_transport_failed",updated_at:now}).eq("id",claim?.outbox_id).eq("status","claimed");
  if(updated.error)throw updated.error;
}

async function markUncertain(claim:any,errorCode:string){
  const now=new Date().toISOString();
  const code=`meta_send_uncertain:${clean(errorCode,120)||"unknown"}`;
  const updated=await db.from("whatsapp_outbox_v1").update({last_error:code,updated_at:now}).eq("id",claim?.outbox_id).eq("status","claimed");
  if(updated.error)throw updated.error;
  return {ok:false,error:"meta_send_uncertain",uncertain:true,retryable:false,outbox_id:claim?.outbox_id};
}

async function dispatchTemplate(outboxId:string){
  const claimed=await db.rpc("ops2_admin_attendance_claim_template_outbox_v1",{p_outbox_id:outboxId});
  if(claimed.error)throw claimed.error;
  const claim=claimed.data||{ok:false,error:"outbox_claim_failed"};
  if(claim?.already_sent===true)return {ok:true,status:"accepted",outbox_status:"sent",duplicate:true,provider:"meta",message_type:"template"};
  if(claim?.ok!==true)return claim;
  if(!metaReady()||!/^\d{5,30}$/.test(String(claim?.phone_number_id||""))){await markFailed(claim,"meta_transport_not_configured");return {ok:false,error:"meta_transport_not_configured",provider:"meta"}}
  try{
    const result=await sendTemplateViaMeta({
      accessToken:META_WHATSAPP_ACCESS_TOKEN,
      phoneNumberId:claim.phone_number_id,
      toE164:claim.to_phone_e164,
      templateName:claim.template_name,
      languageCode:claim.language_code,
      components:Array.isArray(claim.components)?claim.components:[],
      graphVersion:META_WHATSAPP_GRAPH_VERSION,
      timeoutMs:15000
    });
    const acceptedAt=new Date().toISOString();
    const accepted=await db.rpc("ops2_admin_attendance_accept_meta_template_outbound_v1",{p_outbox_id:claim.outbox_id,p_provider_message_id:result.providerMessageId,p_accepted_at:acceptedAt});
    if(accepted.error||accepted.data?.ok!==true)return await markUncertain(claim,accepted.error?.message||accepted.data?.error||"canonical_template_persist_failed");
    return {ok:true,status:"accepted",outbox_status:"sent",provider:"meta",message_type:"template",provider_message_id:result.providerMessageId,message_id:accepted.data?.message_id||null,status_current:accepted.data?.status_current||"accepted",template_name:claim.template_name};
  }catch(error){
    if(error instanceof MetaTransportError){
      if(error.uncertain)return await markUncertain(claim,error.code);
      await markFailed(claim,error.code);
      return {ok:false,error:error.code,provider:"meta",retryable:error.retryable===true,uncertain:false,http_status:error.httpStatus};
    }
    return await markUncertain(claim,"unexpected_template_transport_error");
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="GET"&&req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);
  const auth=await adminAuth(req);
  if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);

  try{
    const url=new URL(req.url);
    const action=String(url.searchParams.get("action")||(req.method==="POST"?"send":"list")).trim().toLowerCase();

    if(req.method==="POST"){
      const body=await req.json().catch(()=>({}));

      if(action==="send"||action==="send_template"){
        if(body?.to_phone_e164!==undefined||body?.whatsapp_account_id!==undefined||body?.account_id!==undefined||body?.customer_id!==undefined||body?.phone_number_id!==undefined||body?.waba_id!==undefined){
          return json(req,{ok:false,error:"destination_fields_not_allowed"},400);
        }
        if(body?.template_name!==undefined||body?.language_code!==undefined||body?.components!==undefined){return json(req,{ok:false,error:"template_identity_fields_not_allowed"},400)}
        const conversationId=validUuid(body?.conversation_id);if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);
        const templateId=validUuid(body?.template_id);if(!templateId)return json(req,{ok:false,error:"invalid_template_id"},400);
        if(!Array.isArray(body?.parameters)||body.parameters.length>100||body.parameters.some((value:any)=>typeof value!=="string"||!value.trim()||value.length>1024))return json(req,{ok:false,error:"template_parameters_invalid"},400);
        const idempotencyKey=validIdempotency(body?.idempotency_key);if(!idempotencyKey)return json(req,{ok:false,error:"invalid_idempotency_key"},400);
        const queued=await db.rpc("ops2_admin_attendance_enqueue_template_v1",{p_conversation_id:conversationId,p_template_id:templateId,p_parameters:body.parameters,p_idempotency_key:idempotencyKey});
        if(queued.error)throw queued.error;
        const data=queued.data||{ok:false,error:"enqueue_failed"};
        if(data?.ok!==true){
          const error=String(data?.error||"enqueue_failed");
          const status=error==="rate_limited"?429:["meta_template_send_not_homologated","meta_canary_destination_blocked","meta_send_uncertain","template_not_sendable"].includes(error)?409:400;
          return json(req,data,status);
        }
        if(data?.duplicate===true){
          if(data?.status==="sent")return json(req,{ok:true,status:"accepted",duplicate:true,outbox_id:data.outbox_id,provider:"meta",message_type:"template"},200);
          if(data?.status!=="queued")return json(req,{ok:false,error:"duplicate_not_dispatchable",outbox_id:data.outbox_id,status:data.status,provider:"meta"},409);
        }
        const dispatched=await dispatchTemplate(data.outbox_id);
        return json(req,dispatched,dispatched?.ok===true?200:502);
      }

      if(action!=="create"&&action!=="edit"&&action!=="delete")return json(req,{ok:false,error:"action_not_allowed"},404);
      if(mutationFieldsBlocked(body,action))return json(req,{ok:false,error:"mutation_fields_not_allowed"},400);
      if(!metaReady())return json(req,{ok:false,error:"meta_transport_not_configured"},503);

      try{
        if(action==="create"){
          const accountId=validUuid(body?.account_id);if(!accountId)return json(req,{ok:false,error:"invalid_account_id"},400);
          const account=await accountById(accountId);if(!account)return json(req,{ok:false,error:"account_not_found"},404);
          const remote=await createTemplateViaMeta({accessToken:META_WHATSAPP_ACCESS_TOKEN,wabaId:account.waba_id,graphVersion:META_WHATSAPP_GRAPH_VERSION,template:body?.draft,timeoutMs:15000});
          return json(req,await mutationResult(account,"create",remote),200);
        }

        const templateId=validUuid(body?.template_id);if(!templateId)return json(req,{ok:false,error:"invalid_template_id"},400);
        const row=await templateRowById(templateId);if(!row)return json(req,{ok:false,error:"template_not_found"},404);
        const account=await accountById(row.whatsapp_account_id);if(!account)return json(req,{ok:false,error:"account_not_found"},404);
        if(!/^\d{5,30}$/.test(String(row.meta_template_id||"")))return json(req,{ok:false,error:"meta_template_id_missing"},409);

        if(action==="edit"){
          const remote=await editTemplateViaMeta({accessToken:META_WHATSAPP_ACCESS_TOKEN,templateId:row.meta_template_id,graphVersion:META_WHATSAPP_GRAPH_VERSION,template:body?.draft,timeoutMs:15000});
          return json(req,await mutationResult(account,"edit",remote),200);
        }

        if(action==="delete"){
          const remote=await deleteTemplateViaMeta({accessToken:META_WHATSAPP_ACCESS_TOKEN,wabaId:account.waba_id,graphVersion:META_WHATSAPP_GRAPH_VERSION,name:row.name,templateId:row.meta_template_id,timeoutMs:15000});
          return json(req,await mutationResult(account,"delete",remote),200);
        }
      }catch(error){
        if(error instanceof MetaTemplatesError&&(error.code==="meta_templates_timeout"||error.code==="meta_templates_network_error")){
          return json(req,{ok:false,error:"meta_template_mutation_uncertain",uncertain:true,retryable:false,requires_sync:true},409);
        }
        throw error;
      }
    }

    if(action!=="list"&&action!=="sync"&&action!=="detail")return json(req,{ok:false,error:"action_not_allowed"},404);

    if(action==="detail"){
      const templateId=validUuid(url.searchParams.get("template_id"));
      if(!templateId)return json(req,{ok:false,error:"invalid_template_id"},400);
      const initial=await templateRowById(templateId);
      if(!initial)return json(req,{ok:false,error:"template_not_found"},404);
      const account=await accountById(initial.whatsapp_account_id);
      if(!account)return json(req,{ok:false,error:"account_not_found"},404);
      const sync=await syncTemplates(account);
      const item=await templateRowById(templateId)||initial;
      const events=await templateEvents(item);
      return json(req,{ok:true,item,events,sync,live:sync?.ok===true},200);
    }

    const accountId=validUuid(url.searchParams.get("account_id"));
    if(!accountId)return json(req,{ok:false,error:"invalid_account_id"},400);
    const account=await accountById(accountId);
    if(!account)return json(req,{ok:false,error:"account_not_found"},404);
    let sync=null;
    if(action==="sync"){
      sync=await syncTemplates(account);
      if(sync?.ok!==true){const status=sync?.error==="meta_transport_not_configured"?503:502;return json(req,sync,status)}
    }
    const items=await cachedTemplates(account.id);
    return json(req,{ok:true,account:{id:account.id,slug:account.slug,display_name:account.display_name,waba_id:account.waba_id},sync,items});
  }catch(error){
    if(error instanceof MetaTemplatesError){
      console.error("admin-whatsapp-templates-v1",error.code,error.httpStatus||"");
      return json(req,{ok:false,error:error.code,retryable:error.retryable===true},error.httpStatus&&error.httpStatus<500?502:503);
    }
    console.error("admin-whatsapp-templates-v1",error instanceof Error?error.message:String(error));
    return json(req,{ok:false,error:"templates_backend_error"},500);
  }
});