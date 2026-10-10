import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {buildTemplateCacheRows,listTemplatesViaMeta,createTemplateViaMeta,MetaTemplatesError} from "../_shared/whatsapp-meta-templates-v1.mjs";
import {sendTemplateViaMeta,MetaTransportError} from "../_shared/whatsapp-meta-transport-v1.mjs";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const META_WHATSAPP_ACCESS_TOKEN=(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"").trim();
const META_WHATSAPP_GRAPH_VERSION=(Deno.env.get("META_WHATSAPP_GRAPH_VERSION")||"").trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);

const WEEKLY_CONSENT_TEMPLATE_NAME="ofertas_semanais_consentimento_v1";
const WEEKLY_CONSENT_TEMPLATE_LANGUAGE="pt_BR";
const WEEKLY_CONSENT_TEMPLATE_DRAFT={
  name:WEEKLY_CONSENT_TEMPLATE_NAME,
  language:WEEKLY_CONSENT_TEMPLATE_LANGUAGE,
  category:"MARKETING",
  components:[
    {type:"BODY",text:"Quer receber ofertas e cupons da Dona Antônia pelo WhatsApp? Enviamos no máximo 1 vez por semana. Você pode cancelar quando quiser."},
    {type:"FOOTER",text:"Você pode cancelar a qualquer momento."},
    {type:"BUTTONS",buttons:[
      {type:"QUICK_REPLY",text:"SIM, QUERO RECEBER"},
      {type:"QUICK_REPLY",text:"AGORA NÃO"}
    ]}
  ]
};
const WEEKLY_CONSENT_SEND_COMPONENTS=[
  {type:"button",sub_type:"quick_reply",index:"0",parameters:[{type:"payload",payload:"WEEKLY_OFFERS_OPT_IN"}]},
  {type:"button",sub_type:"quick_reply",index:"1",parameters:[{type:"payload",payload:"WEEKLY_OFFERS_OPT_OUT"}]}
];

const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
  "Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"POST,OPTIONS"
}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const validUuid=(v:unknown)=>{const s=String(v??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const clean=(v:unknown,max=200)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const metaReady=()=>Boolean(META_WHATSAPP_ACCESS_TOKEN&&/^v\d+\.\d+$/.test(META_WHATSAPP_GRAPH_VERSION));

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false as const,status:401,error:"admin_auth_required"};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid"};
  const row=await db.from("admin_users").select("user_id,is_active,role").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed"};
  if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized"};
  if(String(row.data.role||"viewer")==="viewer")return {ok:false as const,status:403,error:"admin_write_forbidden"};
  return {ok:true as const,status:200,user_id:user.data.user.id};
}

async function accountForConversation(conversationId:string){
  const conversation=await db.from("conversations").select("id,whatsapp_account_id").eq("id",conversationId).maybeSingle();
  if(conversation.error)throw conversation.error;
  if(!conversation.data?.whatsapp_account_id)return null;
  const account=await db.from("whatsapp_accounts").select("id,slug,display_name,waba_id,phone_number_id,is_active").eq("id",conversation.data.whatsapp_account_id).eq("is_active",true).maybeSingle();
  if(account.error)throw account.error;
  return account.data||null;
}

async function syncTemplates(account:any){
  if(!metaReady())return {ok:false,error:"meta_transport_not_configured"};
  if(!/^\d{5,30}$/.test(String(account?.waba_id||"")))return {ok:false,error:"waba_not_configured"};
  const existing=await db.from("whatsapp_templates_v1").select("name,language,metadata").eq("whatsapp_account_id",account.id);
  if(existing.error)throw existing.error;
  const existingByKey=new Map((existing.data||[]).map((row:any)=>[`${row.name}\u0000${row.language}`,row]));
  const remote=await listTemplatesViaMeta({accessToken:META_WHATSAPP_ACCESS_TOKEN,wabaId:account.waba_id,graphVersion:META_WHATSAPP_GRAPH_VERSION,timeoutMs:12000,maxPages:20});
  if(remote.truncated)return {ok:false,error:"meta_templates_pagination_truncated"};
  const syncedAt=new Date().toISOString();
  const rows=buildTemplateCacheRows({items:remote.items,account,existingByKey,syncedAt});
  if(rows.length){const saved=await db.from("whatsapp_templates_v1").upsert(rows,{onConflict:"waba_id,name,language"});if(saved.error)throw saved.error}
  return {ok:true,synced:rows.length};
}
async function weeklyTemplateRow(accountId:string){
  const row=await db.from("whatsapp_templates_v1").select("id,whatsapp_account_id,waba_id,meta_template_id,name,language,category,status,components,metadata,updated_at").eq("whatsapp_account_id",accountId).eq("name",WEEKLY_CONSENT_TEMPLATE_NAME).eq("language",WEEKLY_CONSENT_TEMPLATE_LANGUAGE).maybeSingle();
  if(row.error)throw row.error;return row.data||null;
}
async function enableAttendanceTemplate(row:any){
  const prior=row?.metadata&&typeof row.metadata==="object"?row.metadata:{};
  const attendance=prior?.attendance&&typeof prior.attendance==="object"?prior.attendance:{};
  const metadata={...prior,attendance:{...attendance,enabled:true,kind:"weekly_offers_consent",parameter_count:0,parameter_labels:[]}};
  const updated=await db.from("whatsapp_templates_v1").update({metadata,updated_at:new Date().toISOString()}).eq("id",row.id).select("id,whatsapp_account_id,waba_id,meta_template_id,name,language,category,status,components,metadata").maybeSingle();
  if(updated.error)throw updated.error;return updated.data||{...row,metadata};
}
async function ensureWeeklyConsentTemplate(account:any){
  const synced=await syncTemplates(account);if(synced?.ok!==true)return synced;
  let row=await weeklyTemplateRow(account.id);let created=false;let remoteId:string|null=null;
  if(!row){
    const remote=await createTemplateViaMeta({accessToken:META_WHATSAPP_ACCESS_TOKEN,wabaId:account.waba_id,graphVersion:META_WHATSAPP_GRAPH_VERSION,template:WEEKLY_CONSENT_TEMPLATE_DRAFT,timeoutMs:15000});
    created=true;remoteId=clean(remote?.payload?.id,80)||null;
    const resynced=await syncTemplates(account);if(resynced?.ok!==true)return resynced;row=await weeklyTemplateRow(account.id);
  }
  if(!row)return {ok:false,error:"weekly_consent_template_pending_approval",created,template_status:"PENDING",meta_template_id:remoteId};
  const status=String(row.status||"").toUpperCase();
  if(status==="REJECTED"||status==="PAUSED"||status==="DISABLED")return {ok:false,error:"weekly_consent_template_unavailable",created,template_status:status,template_id:row.id};
  if(status!=="APPROVED")return {ok:false,error:"weekly_consent_template_pending_approval",created,template_status:status||"PENDING",template_id:row.id};
  return {ok:true,template:await enableAttendanceTemplate(row),created:false,template_status:"APPROVED"};
}

async function markOutboxFailed(claim:any,errorCode:string){const updated=await db.from("whatsapp_outbox_v1").update({status:"failed",last_error:clean(errorCode,180)||"template_transport_failed",updated_at:new Date().toISOString()}).eq("id",claim?.outbox_id).eq("status","claimed");if(updated.error)throw updated.error;}
async function markOutboxUncertain(claim:any,errorCode:string){const code=`meta_send_uncertain:${clean(errorCode,120)||"unknown"}`;const updated=await db.from("whatsapp_outbox_v1").update({last_error:code,updated_at:new Date().toISOString()}).eq("id",claim?.outbox_id).eq("status","claimed");if(updated.error)throw updated.error;return {ok:false,error:"meta_send_uncertain",uncertain:true,retryable:false,outbox_id:claim?.outbox_id};}
async function dispatchTemplate(outboxId:string){
  const claimed=await db.rpc("ops2_admin_attendance_claim_template_outbox_v1",{p_outbox_id:outboxId});if(claimed.error)throw claimed.error;
  const claim=claimed.data||{ok:false,error:"outbox_claim_failed"};
  if(claim?.already_sent===true)return {ok:true,status:"accepted",outbox_status:"sent",duplicate:true,provider:"meta",message_type:"template",outbox_id:claim.outbox_id||outboxId,provider_message_id:claim.provider_message_id||null};
  if(claim?.ok!==true)return claim;
  if(!metaReady()||!/^\d{5,30}$/.test(String(claim?.phone_number_id||""))){await markOutboxFailed(claim,"meta_transport_not_configured");return {ok:false,error:"meta_transport_not_configured",provider:"meta",outbox_id:claim.outbox_id}}
  try{
    const result=await sendTemplateViaMeta({accessToken:META_WHATSAPP_ACCESS_TOKEN,phoneNumberId:claim.phone_number_id,toE164:claim.to_phone_e164,templateName:claim.template_name,languageCode:claim.language_code,components:WEEKLY_CONSENT_SEND_COMPONENTS,graphVersion:META_WHATSAPP_GRAPH_VERSION,timeoutMs:15000});
    const accepted=await db.rpc("ops2_admin_attendance_accept_meta_template_outbound_v1",{p_outbox_id:claim.outbox_id,p_provider_message_id:result.providerMessageId,p_accepted_at:new Date().toISOString()});
    if(accepted.error||accepted.data?.ok!==true)return await markOutboxUncertain(claim,accepted.error?.message||accepted.data?.error||"canonical_template_persist_failed");
    return {ok:true,status:"accepted",outbox_status:"sent",provider:"meta",message_type:"template",outbox_id:claim.outbox_id,provider_message_id:result.providerMessageId,message_id:accepted.data?.message_id||null,status_current:accepted.data?.status_current||"accepted",template_name:claim.template_name};
  }catch(error){if(error instanceof MetaTransportError){if(error.uncertain)return await markOutboxUncertain(claim,error.code);await markOutboxFailed(claim,error.code);return {ok:false,error:error.code,provider:"meta",outbox_id:claim.outbox_id,retryable:error.retryable===true,uncertain:false,http_status:error.httpStatus}}return await markOutboxUncertain(claim,"unexpected_template_transport_error");}
}
async function markRequestFailed(requestId:string){const failed=await db.rpc("ops2_admin_attendance_weekly_consent_mark_failed_v1",{p_request_id:requestId});if(failed.error)throw failed.error;}
async function sendWeeklyConsent(conversationId:string){
  const prepared=await db.rpc("ops2_admin_attendance_weekly_consent_prepare_v1",{p_conversation_id:conversationId});if(prepared.error)throw prepared.error;
  const request=prepared.data||{ok:false,error:"weekly_consent_prepare_failed"};if(request?.ok!==true)return request;
  const account=await accountForConversation(conversationId);if(!account)return {ok:false,error:"account_not_found"};
  const ensured=await ensureWeeklyConsentTemplate(account);if(ensured?.ok!==true)return {...ensured,request_id:request.request_id};
  const idempotencyKey=`weekly-consent:${request.request_id}:${request.attempt_count}`;
  const queued=await db.rpc("ops2_admin_attendance_enqueue_template_v1",{p_conversation_id:conversationId,p_template_id:ensured.template.id,p_parameters:[],p_idempotency_key:idempotencyKey});if(queued.error)throw queued.error;
  const data=queued.data||{ok:false,error:"enqueue_failed"};if(data?.ok!==true)return {...data,request_id:request.request_id};
  if(data?.duplicate===true&&data?.status==="sent"){const marked=await db.rpc("ops2_admin_attendance_weekly_consent_mark_sent_v1",{p_request_id:request.request_id,p_outbox_id:data.outbox_id,p_provider_message_id:null});if(marked.error)throw marked.error;return {ok:true,status:"accepted",duplicate:true,request_id:request.request_id,outbox_id:data.outbox_id,template_name:WEEKLY_CONSENT_TEMPLATE_NAME};}
  if(data?.duplicate===true&&!['queued'].includes(String(data?.status||"")))return {ok:false,error:"weekly_consent_send_in_progress",request_id:request.request_id,outbox_id:data.outbox_id,status:data.status};
  const dispatched=await dispatchTemplate(data.outbox_id);if(dispatched?.ok!==true){if(dispatched?.uncertain!==true)await markRequestFailed(request.request_id);return {...dispatched,request_id:request.request_id};}
  const marked=await db.rpc("ops2_admin_attendance_weekly_consent_mark_sent_v1",{p_request_id:request.request_id,p_outbox_id:data.outbox_id,p_provider_message_id:dispatched.provider_message_id||null});if(marked.error)throw marked.error;if(marked.data?.ok!==true)return marked.data;
  return {ok:true,status:"pending",request_id:request.request_id,outbox_id:data.outbox_id,provider_message_id:dispatched.provider_message_id||null,template_name:WEEKLY_CONSENT_TEMPLATE_NAME};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});if(req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);
  const auth=await adminAuth(req);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);if(!metaReady())return json(req,{ok:false,error:"meta_transport_not_configured"},503);
  try{
    const body=await req.json().catch(()=>({}));if(body?.to_phone_e164!==undefined||body?.whatsapp_account_id!==undefined||body?.account_id!==undefined||body?.customer_id!==undefined||body?.phone_number_id!==undefined||body?.waba_id!==undefined||body?.template_id!==undefined)return json(req,{ok:false,error:"destination_fields_not_allowed"},400);
    const conversationId=validUuid(body?.conversation_id);if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);
    const result=await sendWeeklyConsent(conversationId);if(result?.ok===true)return json(req,result,200);
    const error=String(result?.error||"weekly_consent_failed");const status=["weekly_consent_template_pending_approval","weekly_consent_template_unavailable","weekly_consent_send_in_progress","service_window_closed","weekly_consent_already_requested","weekly_consent_already_decided","meta_canary_destination_blocked","template_not_sendable","duplicate_not_dispatchable","meta_send_uncertain"].includes(error)?409:error==="conversation_not_found"?404:400;return json(req,result,status);
  }catch(error){if(error instanceof MetaTemplatesError){const uncertain=error.code==="meta_templates_timeout"||error.code==="meta_templates_network_error";return json(req,{ok:false,error:uncertain?"weekly_consent_template_creation_uncertain":error.code,uncertain},uncertain?409:502)}console.error("admin-whatsapp-weekly-consent-v1",error instanceof Error?error.message:String(error));return json(req,{ok:false,error:"weekly_consent_backend_error"},500)}
});
