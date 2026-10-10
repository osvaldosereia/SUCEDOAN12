import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const MAX_BODY_BYTES=32000;
const MAX_FILTER_BYTES=16000;
const FORBIDDEN_FIELDS=new Set(["waba_id","phone_number_id","to_phone_e164","destination_phone","outbox_id","schedule_at","send_at","runtime_mode","worker_url","service_role","service_key","access_token","authorization"]);
const CREATE_FIELDS=new Set(["name","whatsapp_account_id","template_id","filters","variable_values","deep_link","idempotency_key"]);
const UPDATE_FIELDS=new Set(["campaign_id","expected_revision","patch"]);
const PATCH_FIELDS=new Set(["name","whatsapp_account_id","template_id","filters","variable_values","deep_link","notes"]);
const SNAPSHOT_FIELDS=new Set(["campaign_id","expected_revision","idempotency_key"]);
const TRANSITION_FIELDS=new Set(["campaign_id","expected_revision","to_status","reason"]);
const INTERNAL_TEST_FIELDS=new Set(["campaign_id","expected_revision"]);
const SCHEDULE_FIELDS=new Set(["campaign_id","expected_revision","scheduled_for"]);
const PAUSE_FIELDS=new Set(["campaign_id","reason"]);
const RESUME_FIELDS=new Set(["campaign_id","scheduled_for"]);
const CANCEL_EXECUTION_FIELDS=new Set(["campaign_id","reason"]);
const ALLOWED_TRANSITIONS=new Set(["draft","ready_for_review","approved","scheduled","running","paused","completed","failed","cancelled"]);

const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
  "Vary":"Origin",
  "Access-Control-Allow-Headers":"content-type,authorization,apikey",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS"
}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const validUuid=(v:unknown)=>{const s=String(v??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const clean=(v:unknown,max=300)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const objectLike=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==="object"&&!Array.isArray(v);
const onlyKeys=(body:Record<string,unknown>,allowed:Set<string>)=>Object.keys(body).every(key=>allowed.has(key));
const channelByPhone=(value:unknown)=>{const digits=String(value||"").replace(/\D/g,"");return digits.endsWith("0975")?"0975":digits.endsWith("1018")?"1018":null};

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

function hasForbiddenField(value:unknown):boolean{
  if(Array.isArray(value))return value.some(hasForbiddenField);
  if(!objectLike(value))return false;
  for(const [key,nested] of Object.entries(value)){
    if(FORBIDDEN_FIELDS.has(String(key).toLowerCase()))return true;
    if(hasForbiddenField(nested))return true;
  }
  return false;
}

async function readJsonBody(req:Request){
  const raw=await req.text();
  if(raw.length>MAX_BODY_BYTES)return {ok:false as const,error:"payload_too_large"};
  if(!raw.trim())return {ok:true as const,body:{}};
  try{
    const parsed=JSON.parse(raw);
    if(!objectLike(parsed))return {ok:false as const,error:"invalid_json_body"};
    return {ok:true as const,body:parsed as Record<string,unknown>};
  }catch{return {ok:false as const,error:"invalid_json_body"}}
}

function rpcStatus(data:any){
  if(data?.ok===true)return 200;
  const error=String(data?.error||"");
  if(error==="campaign_not_found")return 404;
  if(error==="revision_conflict")return 409;
  if(error==="campaigns_disabled")return 409;
  if(error==="campaign_not_draft"||error==="campaign_invalid_transition"||error==="snapshot_stale"||error==="template_not_sendable")return 409;
  if(error==="account_not_available")return 422;
  return 400;
}

function validateFilters(filters:unknown){
  if(!objectLike(filters))return "invalid_filters";
  if(JSON.stringify(filters).length>MAX_FILTER_BYTES)return "filters_too_large";
  return null;
}

function normalizedDateTime(value:unknown){
  const raw=String(value??"").trim();
  if(!raw)return null;
  const ms=Date.parse(raw);
  if(!Number.isFinite(ms))return null;
  return new Date(ms).toISOString();
}

async function listCampaigns(status:string|null){
  let query=db.from("marketing_campaigns_v1")
    .select("id,name,whatsapp_account_id,template_id,status,revision,template_name_snapshot,template_language_snapshot,template_category_snapshot,scheduled_for,started_at,paused_at,completed_at,failed_at,execution_last_error,created_at,updated_at,ready_for_review_at,approved_at,cancelled_at")
    .order("updated_at",{ascending:false}).limit(100);
  if(status){if(!ALLOWED_TRANSITIONS.has(status))return {status:400,data:{ok:false,error:"invalid_status"}};query=query.eq("status",status)}
  const rows=await query;if(rows.error)throw rows.error;
  return {status:200,data:{ok:true,items:rows.data||[]}};
}

async function campaignDetail(campaignId:string){
  const result=await db.rpc("marketing_campaign_detail_v1",{p_campaign_id:campaignId});
  if(result.error)throw result.error;
  const data=result.data||{ok:false,error:"campaign_not_found"};
  return {status:rpcStatus(data),data};
}

async function executionStatus(campaignId:string){
  const result=await db.rpc("marketing_campaign_execution_status_v1",{p_campaign_id:campaignId});
  if(result.error)throw result.error;
  const data=result.data||{ok:false,error:"campaign_not_found"};
  return {status:rpcStatus(data),data};
}

async function options(accountId:string){
  const account=await db.from("whatsapp_accounts").select("id,display_name,phone_e164,is_active").eq("id",accountId).eq("is_active",true).maybeSingle();
  if(account.error)throw account.error;
  if(!account.data)return {status:404,data:{ok:false,error:"account_not_available"}};
  const templates=await db.from("whatsapp_templates_v1")
    .select("id,whatsapp_account_id,name,language,category,status,components,quality_rating,last_synced_at")
    .eq("whatsapp_account_id",accountId).eq("category","MARKETING").eq("status","APPROVED")
    .order("name",{ascending:true});
  if(templates.error)throw templates.error;
  return {status:200,data:{ok:true,account:{id:account.data.id,display_name:account.data.display_name,channel:channelByPhone(account.data.phone_e164)},templates:templates.data||[]}};
}

async function createCampaign(body:Record<string,unknown>){
  if(!onlyKeys(body,CREATE_FIELDS))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  if(hasForbiddenField(body))return {status:400,data:{ok:false,error:"transport_fields_not_allowed"}};
  const accountId=validUuid(body.whatsapp_account_id),templateId=validUuid(body.template_id);
  if(!accountId||!templateId)return {status:400,data:{ok:false,error:"invalid_reference"}};
  const name=clean(body.name,160);if(!name)return {status:400,data:{ok:false,error:"invalid_name"}};
  const filters=body.filters??{};const filterError=validateFilters(filters);if(filterError)return {status:filterError==="filters_too_large"?413:400,data:{ok:false,error:filterError}};
  const variables=body.variable_values??{},deepLink=body.deep_link??{};
  if(!objectLike(variables)||!objectLike(deepLink))return {status:400,data:{ok:false,error:"invalid_payload"}};
  const result=await db.rpc("marketing_create_campaign_v1",{
    p_name:name,p_whatsapp_account_id:accountId,p_template_id:templateId,p_filters:filters,
    p_variable_values:variables,p_deep_link:deepLink,p_idempotency_key:clean(body.idempotency_key,180)||null,
  });
  if(result.error)throw result.error;const data=result.data||{ok:false,error:"create_failed"};return {status:rpcStatus(data),data};
}

async function updateDraft(body:Record<string,unknown>){
  if(!onlyKeys(body,UPDATE_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const campaignId=validUuid(body.campaign_id);const revision=Number(body.expected_revision);const patch=body.patch;
  if(!campaignId||!Number.isInteger(revision)||revision<1||!objectLike(patch))return {status:400,data:{ok:false,error:"invalid_payload"}};
  if(!onlyKeys(patch,PATCH_FIELDS)||hasForbiddenField(patch))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  if(patch.filters!==undefined){const filterError=validateFilters(patch.filters);if(filterError)return {status:filterError==="filters_too_large"?413:400,data:{ok:false,error:filterError}}}
  if(JSON.stringify(patch).length>MAX_BODY_BYTES-1000)return {status:413,data:{ok:false,error:"payload_too_large"}};
  const result=await db.rpc("marketing_update_campaign_draft_v1",{p_campaign_id:campaignId,p_expected_revision:revision,p_patch:patch});
  if(result.error)throw result.error;const data=result.data||{ok:false,error:"update_failed"};return {status:rpcStatus(data),data};
}

async function createSnapshot(body:Record<string,unknown>){
  if(!onlyKeys(body,SNAPSHOT_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const campaignId=validUuid(body.campaign_id),revision=Number(body.expected_revision);
  if(!campaignId||!Number.isInteger(revision)||revision<1)return {status:400,data:{ok:false,error:"invalid_payload"}};
  const result=await db.rpc("marketing_create_campaign_snapshot_v1",{p_campaign_id:campaignId,p_expected_revision:revision,p_idempotency_key:clean(body.idempotency_key,180)||`admin:${campaignId}:r${revision}`});
  if(result.error)throw result.error;const data=result.data||{ok:false,error:"snapshot_failed"};return {status:rpcStatus(data),data};
}

async function transition(body:Record<string,unknown>){
  if(!onlyKeys(body,TRANSITION_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const campaignId=validUuid(body.campaign_id),revision=Number(body.expected_revision),toStatus=clean(body.to_status,40).toLowerCase();
  if(!campaignId||!Number.isInteger(revision)||revision<1||!ALLOWED_TRANSITIONS.has(toStatus))return {status:400,data:{ok:false,error:"invalid_transition"}};
  const result=await db.rpc("marketing_transition_campaign_v1",{p_campaign_id:campaignId,p_expected_revision:revision,p_to_status:toStatus,p_reason:clean(body.reason,500)||null});
  if(result.error)throw result.error;const data=result.data||{ok:false,error:"transition_failed"};return {status:rpcStatus(data),data};
}

async function scheduleCampaign(body:Record<string,unknown>,startNow=false){
  if(!onlyKeys(body,SCHEDULE_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const campaignId=validUuid(body.campaign_id),revision=Number(body.expected_revision);
  if(!campaignId||!Number.isInteger(revision)||revision<1)return {status:400,data:{ok:false,error:"invalid_payload"}};
  const scheduledFor=startNow?new Date().toISOString():normalizedDateTime(body.scheduled_for);
  if(!scheduledFor)return {status:400,data:{ok:false,error:"invalid_scheduled_for"}};
  const result=await db.rpc("marketing_schedule_campaign_v1",{p_campaign_id:campaignId,p_expected_revision:revision,p_scheduled_for:scheduledFor});
  if(result.error)throw result.error;const data=result.data||{ok:false,error:"schedule_failed"};return {status:rpcStatus(data),data};
}

async function pauseCampaign(body:Record<string,unknown>){
  if(!onlyKeys(body,PAUSE_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const campaignId=validUuid(body.campaign_id);if(!campaignId)return {status:400,data:{ok:false,error:"invalid_campaign_id"}};
  const result=await db.rpc("marketing_pause_campaign_v1",{p_campaign_id:campaignId,p_reason:clean(body.reason,500)||null});
  if(result.error)throw result.error;const data=result.data||{ok:false,error:"pause_failed"};return {status:rpcStatus(data),data};
}

async function resumeCampaign(body:Record<string,unknown>){
  if(!onlyKeys(body,RESUME_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const campaignId=validUuid(body.campaign_id);if(!campaignId)return {status:400,data:{ok:false,error:"invalid_campaign_id"}};
  const scheduledFor=body.scheduled_for===undefined?new Date().toISOString():normalizedDateTime(body.scheduled_for);
  if(!scheduledFor)return {status:400,data:{ok:false,error:"invalid_scheduled_for"}};
  const result=await db.rpc("marketing_resume_campaign_v1",{p_campaign_id:campaignId,p_scheduled_for:scheduledFor});
  if(result.error)throw result.error;const data=result.data||{ok:false,error:"resume_failed"};return {status:rpcStatus(data),data};
}

async function cancelExecution(body:Record<string,unknown>){
  if(!onlyKeys(body,CANCEL_EXECUTION_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const campaignId=validUuid(body.campaign_id);if(!campaignId)return {status:400,data:{ok:false,error:"invalid_campaign_id"}};
  const result=await db.rpc("marketing_cancel_campaign_execution_v1",{p_campaign_id:campaignId,p_reason:clean(body.reason,500)||null});
  if(result.error)throw result.error;const data=result.data||{ok:false,error:"cancel_failed"};return {status:rpcStatus(data),data};
}

async function prepareInternalTest(body:Record<string,unknown>){
  if(!onlyKeys(body,INTERNAL_TEST_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const campaignId=validUuid(body.campaign_id),revision=Number(body.expected_revision);
  if(!campaignId||!Number.isInteger(revision)||revision<1)return {status:400,data:{ok:false,error:"invalid_payload"}};
  const detail=await db.rpc("marketing_campaign_detail_v1",{p_campaign_id:campaignId});if(detail.error)throw detail.error;
  const data=detail.data||{};if(data?.ok!==true)return {status:rpcStatus(data),data};
  if(Number(data?.campaign?.revision||0)!==revision)return {status:409,data:{ok:false,error:"revision_conflict",revision:data?.campaign?.revision}};
  const accounts=await db.from("whatsapp_accounts").select("id,display_name,phone_e164,is_active").eq("is_active",true);
  if(accounts.error)throw accounts.error;
  const canaries=(accounts.data||[]).map((row:any)=>({account_id:row.id,display_name:row.display_name,channel:channelByPhone(row.phone_e164)})).filter((row:any)=>row.channel==="0975"||row.channel==="1018");
  return {status:200,data:{ok:true,campaign_id:campaignId,revision,dispatch_allowed:false,mode:"internal_test_only",message:"Nenhuma mensagem será enviada nesta fase",canary_channels:canaries}};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="GET"&&req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);
  const auth=await adminAuth(req);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
  try{
    const url=new URL(req.url);const action=clean(url.searchParams.get("action"),60).toLowerCase();
    if(req.method==="GET"){
      if(action==="list"){const result=await listCampaigns(clean(url.searchParams.get("status"),40).toLowerCase()||null);return json(req,result.data,result.status)}
      if(action==="detail"){const id=validUuid(url.searchParams.get("campaign_id"));if(!id)return json(req,{ok:false,error:"invalid_campaign_id"},400);const result=await campaignDetail(id);return json(req,result.data,result.status)}
      if(action==="options"){const id=validUuid(url.searchParams.get("whatsapp_account_id"));if(!id)return json(req,{ok:false,error:"invalid_account_id"},400);const result=await options(id);return json(req,result.data,result.status)}
      if(action==="execution_status"){const id=validUuid(url.searchParams.get("campaign_id"));if(!id)return json(req,{ok:false,error:"invalid_campaign_id"},400);const result=await executionStatus(id);return json(req,result.data,result.status)}
      return json(req,{ok:false,error:"action_not_allowed"},404);
    }
    const parsed=await readJsonBody(req);if(!parsed.ok)return json(req,{ok:false,error:parsed.error},parsed.error==="payload_too_large"?413:400);
    let result:{status:number,data:any};
    if(action==="create")result=await createCampaign(parsed.body);
    else if(action==="update_draft")result=await updateDraft(parsed.body);
    else if(action==="create_snapshot")result=await createSnapshot(parsed.body);
    else if(action==="transition")result=await transition(parsed.body);
    else if(action==="prepare_internal_test")result=await prepareInternalTest(parsed.body);
    else if(action==="schedule")result=await scheduleCampaign(parsed.body,false);
    else if(action==="start_now")result=await scheduleCampaign(parsed.body,true);
    else if(action==="pause")result=await pauseCampaign(parsed.body);
    else if(action==="resume")result=await resumeCampaign(parsed.body);
    else if(action==="cancel_execution")result=await cancelExecution(parsed.body);
    else return json(req,{ok:false,error:"action_not_allowed"},404);
    return json(req,result.data,result.status);
  }catch(error){
    console.error("admin_marketing_campaigns_error",error instanceof Error?error.message:String(error));
    return json(req,{ok:false,error:"internal_error"},500);
  }
});
