import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {ANA_DRY_RUN_INSTRUCTIONS,ANA_DRY_RUN_SCHEMA,buildAnaDryRunInput,normalizeAnaDryRunResult} from "../_shared/ana-policy-v1.mjs";
import {linkedCustomerFirstName} from "../_shared/ana-customer-context-v1.mjs";
import {authorizeAnaAdmin,anaAdminPermission} from "../_shared/ana-admin-auth-v1.mjs";
import {validateAnaConfiguration} from "../_shared/ana-admin-config-v1.mjs";
import {buildAnaRuntimeInstructions,routeAnaMessage} from "../_shared/ana-admin-config-v1.mjs";
import {shouldSendAnaLiveReply} from "../_shared/ana-live-policy-v1.mjs";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SUPABASE_ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")||"";
const SUPABASE_SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const OPENAI_API_KEY=Deno.env.get("OPENAI_API_KEY")||"";
const ANA_MODEL=(Deno.env.get("ANA_OPENAI_MODEL")||"gpt-6-luna").trim();
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const clean=(value:unknown,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const validUuid=(value:unknown)=>{const s=String(value??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"POST,OPTIONS"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});

function outputText(data:any){return (Array.isArray(data?.output)?data.output:[]).flatMap((item:any)=>Array.isArray(item?.content)?item.content:[]).filter((item:any)=>item?.type==="output_text").map((item:any)=>String(item?.text||"")).join("").trim()}
function dbFor(req:Request){const authorization=req.headers.get("Authorization")||"";return createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}})}
function serviceDb(){return createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})}
async function openaiKey(){
  if(OPENAI_API_KEY)return OPENAI_API_KEY;
  if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY)return "";
  try{
    const q=await serviceDb().rpc("get_conversation_worker_provider_secret_v1");
    return typeof q.data==="string"?q.data.trim():"";
  }catch{return ""}
}
async function adminAuth(req:Request,db:any){const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)return {ok:false as const,status:401,error:"admin_auth_required"};const user=await db.auth.getUser(token);if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid"};return {ok:true as const,user_id:user.data.user.id}}

async function anaAdminAction(req:Request,body:any,action:string,authClient:any){
  if(!SUPABASE_SERVICE_ROLE_KEY)return json(req,{ok:false,error:"server_config"},500);
  const privileged=serviceDb();
  const principal=await authorizeAnaAdmin({authorization:req.headers.get("Authorization")||"",authClient,serviceClient:privileged});
  if(!principal.ok)return json(req,{ok:false,error:principal.error},principal.status);
  if(!anaAdminPermission(principal.role,action))return json(req,{ok:false,error:"admin_role_insufficient"},403);
  const actor=principal.user_id;
  if(action==="admin_load"||action==="admin_history"){
    const loaded=await privileged.rpc("ops2_ana_admin_load_v1");if(loaded.error)throw loaded.error;
    const result=loaded.data||{ok:false,error:"ana_admin_load_failed"};if(result.ok!==true)return json(req,{ok:false,error:result.error||"ana_admin_load_failed"},409);
    if(action==="admin_history"){
      const jobs=await privileged.from("whatsapp_ana_jobs_v1").select("whatsapp_account_id,status,decision,reason,created_at,completed_at").eq("dry_run",false).order("created_at",{ascending:false}).limit(20);
      if(jobs.error)throw jobs.error;
      const accountIds=[...new Set((jobs.data||[]).map((job:any)=>job.whatsapp_account_id).filter(Boolean))];
      const accountRows=accountIds.length?await privileged.from("whatsapp_accounts").select("id,phone_e164").in("id",accountIds):{data:[],error:null};if(accountRows.error)throw accountRows.error;
      const last4=new Map((accountRows.data||[]).map((account:any)=>[account.id,String(account.phone_e164||"").replace(/\D/g,"").slice(-4)]));
      const safeReasons=new Set(["admin_trigger_fixed_reply","admin_trigger_handoff","admin_trigger_label_applied","human_takeover_during_generation","human_takeover_before_trigger_label","human_review_required","active_config_invalid","first_greeting_of_day","ai_gate_closed_before_generation","inbound_not_supported"]);
      const liveOutcomes=(jobs.data||[]).map((job:any)=>({channel_last4:last4.get(job.whatsapp_account_id)||"",status:job.status,decision:job.decision||"handoff",reason:safeReasons.has(job.reason)?job.reason:"other_or_needs_review",created_at:job.created_at,completed_at:job.completed_at}));
      return json(req,{ok:true,history:[...(result.events||[]),...liveOutcomes].slice(0,40),versions:result.versions||[],test_runs:result.test_runs||[]});
    }
    const runtime=await privileged.from("whatsapp_channel_runtime_v1").select("whatsapp_account_id,inbound_provider,outbound_provider,capture_enabled,send_enabled,ana_enabled,campaigns_enabled,human_send_enabled,homologated_at,updated_at,metadata,whatsapp_accounts(phone_e164,display_name,slug)");
    if(runtime.error)throw runtime.error;
    const channels=(runtime.data||[]).map((row:any)=>({id:row.whatsapp_account_id,phone_last4:String(row.whatsapp_accounts?.phone_e164||"").replace(/\D/g,"").slice(-4),name:clean(row.whatsapp_accounts?.display_name||row.whatsapp_accounts?.slug,60),inbound_provider:row.inbound_provider,outbound_provider:row.outbound_provider,capture_enabled:row.capture_enabled,send_enabled:row.send_enabled,ana_enabled:row.ana_enabled,campaigns_enabled:row.campaigns_enabled,human_send_enabled:row.human_send_enabled,homologated_at:row.homologated_at,updated_at:row.updated_at}));
    const labelsResult=await privileged.from("attendance_labels_v1").select("id,name,color,sort_order").eq("is_active",true).order("sort_order",{ascending:true});if(labelsResult.error)throw labelsResult.error;
    return json(req,{ok:true,role:principal.role,...result,channels,labels:labelsResult.data||[]});
  }
  if(action==="admin_save_draft"){
    const validation=validateAnaConfiguration(body?.configuration);if(!validation.ok)return json(req,{ok:false,error:"configuration_invalid",details:validation.errors},400);
    const labelIds=[...new Set(body.configuration.triggers.flatMap((trigger:any)=>Array.isArray(trigger.actions)?trigger.actions:[{type:trigger.action,label_id:trigger.label_id}]).filter((action:any)=>action.type==="label").map((action:any)=>String(action.label_id)))];
    if(labelIds.length){const activeLabels=await privileged.from("attendance_labels_v1").select("id").eq("is_active",true).in("id",labelIds);if(activeLabels.error)throw activeLabels.error;const found=new Set((activeLabels.data||[]).map((label:any)=>label.id));if(labelIds.some(id=>!found.has(id)))return json(req,{ok:false,error:"trigger_label_not_active"},400)}
    const revision=Number(body?.expected_revision);if(!Number.isSafeInteger(revision)||revision<1)return json(req,{ok:false,error:"revision_invalid"},400);
    const saved=await privileged.rpc("ops2_ana_admin_save_draft_v1",{p_configuration:body.configuration,p_expected_revision:revision,p_note:clean(body?.note,240),p_actor_id:actor});
    if(saved.error)throw saved.error;const result=saved.data||{ok:false,error:"draft_save_failed"};return json(req,result,result.ok===true?200:409);
  }
  if(action==="admin_publish"){
    const testRunId=validUuid(body?.test_run_id);if(!testRunId)return json(req,{ok:false,error:"test_run_required"},400);
    const current=await privileged.rpc("ops2_ana_admin_load_v1");if(current.error)throw current.error;
    const valid=validateAnaConfiguration(current.data?.draft?.configuration);if(!valid.ok)return json(req,{ok:false,error:"configuration_invalid",details:valid.errors},409);
    const labelIds=[...new Set(current.data.draft.configuration.triggers.flatMap((trigger:any)=>Array.isArray(trigger.actions)?trigger.actions:[{type:trigger.action,label_id:trigger.label_id}]).filter((action:any)=>action.type==="label").map((action:any)=>String(action.label_id)))];
    if(labelIds.length){const activeLabels=await privileged.from("attendance_labels_v1").select("id").eq("is_active",true).in("id",labelIds);if(activeLabels.error)throw activeLabels.error;const found=new Set((activeLabels.data||[]).map((label:any)=>label.id));if(labelIds.some(id=>!found.has(id)))return json(req,{ok:false,error:"trigger_label_not_active"},409)}
    const published=await privileged.rpc("ops2_ana_admin_publish_v1",{p_test_run_id:testRunId,p_note:clean(body?.note,240),p_actor_id:actor});
    if(published.error)throw published.error;const result=published.data||{ok:false,error:"publish_failed"};return json(req,result,result.ok===true?200:409);
  }
  if(action==="admin_rollback"){
    const versionId=Number(body?.version_id);if(!Number.isSafeInteger(versionId)||versionId<1)return json(req,{ok:false,error:"version_invalid"},400);
    const rolled=await privileged.rpc("ops2_ana_admin_rollback_v1",{p_version_id:versionId,p_note:clean(body?.note,240),p_actor_id:actor});
    if(rolled.error)throw rolled.error;const result=rolled.data||{ok:false,error:"rollback_failed"};return json(req,result,result.ok===true?200:409);
  }
  if(action==="admin_set_channel"){
    const accountId=validUuid(body?.whatsapp_account_id);if(!accountId||typeof body?.enabled!=="boolean")return json(req,{ok:false,error:"channel_toggle_invalid"},400);
    const changed=await privileged.rpc("ops2_ana_admin_set_channel_v1",{p_whatsapp_account_id:accountId,p_enabled:body.enabled,p_actor_id:actor});
    if(changed.error)throw changed.error;const result=changed.data||{ok:false,error:"channel_toggle_failed"};return json(req,result,result.ok===true?200:409);
  }
  if(action==="admin_test"){
    const loaded=await privileged.rpc("ops2_ana_admin_load_v1");if(loaded.error)throw loaded.error;const draft=loaded.data?.draft;
    const validation=validateAnaConfiguration(draft?.configuration);if(!validation.ok)return json(req,{ok:false,error:"configuration_invalid",details:validation.errors},409);
    const revision=Number(draft?.revision);if(Number(body?.expected_revision)!==revision)return json(req,{ok:false,error:"revision_conflict"},409);
    const suite=draft.configuration.test_cases.slice(0,20);if(!suite.length)return json(req,{ok:false,error:"required_test_cases_missing"},409);
    const began=Date.now();let passed=0,failed=0;const safeReasons:string[]=[];const scenarioResults:any[]=[];
    const simulate=async(input:string,channel:string,context:any={})=>{
      const route=routeAnaMessage(draft.configuration,input,channel,context);
      const trace:any[]=[];
      if(route.triggerKey)trace.push({step:"automation",trigger_key:route.triggerKey});
      if(route.path==="actions"){
        let responseText="";let outcome="no_reply";let continueAi=false;
        for(const action of route.actions||[]){
          if(action.type==="label"){trace.push({step:"action",type:"label",label_id:action.labelId});outcome="label"}
          if(action.type==="fixed_reply"){trace.push({step:"action",type:"fixed_reply",response_text:action.responseText});responseText=action.responseText;outcome="reply"}
          if(action.type==="handoff"){trace.push({step:"action",type:"handoff"});return {outcome:"handoff",reason:"trigger_actions_handoff",response_text:"",latency_ms:0,trace}}
          if(action.type==="continue_ai"){trace.push({step:"action",type:"continue_ai"});continueAi=true}
        }
        if(responseText)return {outcome:"reply",reason:"trigger_actions_reply",response_text:responseText,latency_ms:0,trace};
        if(!continueAi)return {outcome,reason:"trigger_actions_completed",response_text:"",latency_ms:0,trace};
        trace.push({step:"ai",type:"would_call_ai"});
      }
      if(route.path==="fixed_reply")return {outcome:"reply",reason:"fixed_reply_trigger",response_text:route.responseText,latency_ms:0,trace};
      if(route.path==="handoff")return {outcome:"handoff",reason:route.reason||"trigger_handoff",response_text:"",latency_ms:0,trace};
      if(route.path==="label")return {outcome:"label",reason:"trigger_label",response_text:"",latency_ms:0,trace};
      const generated=await generateSuggestion(input,[],"",buildAnaRuntimeInstructions(draft.configuration));
      if(!generated.ok)return {outcome:"handoff",reason:"ai_fallback_handoff",response_text:"",latency_ms:Number(generated.latency_ms)||0,trace};
      const result=generated.result;
      if(result.decision==="no_reply")return {outcome:"no_reply",reason:"ai_no_reply",response_text:"",latency_ms:Number(generated.latency_ms)||0,trace};
      if(!shouldSendAnaLiveReply({decision:result.decision,confidence:result.confidence,responseText:result.response_text}))return {outcome:"handoff",reason:"ai_low_confidence_handoff",response_text:"",latency_ms:Number(generated.latency_ms)||0,trace};
      trace.push({step:"ai",type:"reply_eligible",confidence:result.confidence});return {outcome:"reply",reason:"ai_reply_eligible",response_text:result.response_text,latency_ms:Number(generated.latency_ms)||0,trace};
    };
    for(const scenario of suite){
      const result=await simulate(String(scenario.input||""),String(scenario.channel||"0975"));const ok=result.outcome===scenario.expected;
      if(ok)passed++;else failed++;safeReasons.push(ok?"scenario_pass":"scenario_failed");
      scenarioResults.push({key:scenario.key,expected:scenario.expected,actual:result.outcome,passed:ok,reason:result.reason});
    }
    let customResult:any=null;const customInput=clean(body?.input,500),channel=clean(body?.channel,4);
    if(customInput){if(!["0975","1018"].includes(channel))return json(req,{ok:false,error:"test_channel_invalid",dry_run:true,dry_run_not_sendable:true},400);const value=await simulate(customInput,channel,{customerLinked:Boolean(body?.customer_linked),humanMode:false});customResult={outcome:value.outcome,reason:value.reason,response_text:value.response_text,trace:value.trace||[]};}
    const recorded=await privileged.rpc("ops2_ana_admin_record_test_run_v1",{p_draft_revision:revision,p_scenario_keys:suite.map((scenario:any)=>String(scenario.key)),p_passed_count:passed,p_failed_count:failed,p_safe_reasons:safeReasons,p_latency_ms:Math.max(0,Date.now()-began),p_actor_id:actor});
    if(recorded.error)throw recorded.error;const saved=recorded.data||{ok:false,error:"test_run_record_failed"};if(saved.ok!==true)return json(req,{ok:false,error:saved.error||"test_run_record_failed"},409);
    return json(req,{ok:true,dry_run:true,dry_run_not_sendable:true,test_run:saved,results:scenarioResults,custom_result:customResult});
  }
  return json(req,{ok:false,error:"admin_action_invalid"},400);
}

function operationalContext(customerFirstName=''){
  return {
    catalog_ordering:"Para consultar produtos e fazer pedido, direcione o cliente ao catálogo/site oficial. O atendimento pode orientar e oferecer atendimento humano, mas esta prévia não cria pedido.",
    human_support:"Atendimento humano está disponível quando o cliente pedir ajuda, quando faltar contexto confiável ou quando houver exceção operacional.",
    never_collect_in_chat:["CPF/CNPJ","endereço completo"],
    dynamic_data_rule:"Preço, estoque, total, composição de cesta, prazo/entrega, pagamento e dados do pedido são dinâmicos. Só afirme esses dados quando vierem explicitamente no contexto; caso contrário, encaminhe para humano ou para o catálogo/site oficial.",
    known_customer_first_name:customerFirstName
  };
}

async function generateSuggestion(inboundText:string,history:any[],customerFirstName='',instructions=ANA_DRY_RUN_INSTRUCTIONS){
  const apiKey=await openaiKey();
  if(!apiKey)return {ok:false as const,error:"openai_not_configured"};
  const input=buildAnaDryRunInput({inboundText,history,operationalContext:operationalContext(customerFirstName)});
  const started=Date.now();
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:ANA_MODEL,store:false,max_output_tokens:500,reasoning:{effort:"low"},instructions,input:[{role:"user",content:[{type:"input_text",text:JSON.stringify(input)}]}],text:{format:{type:"json_schema",name:"ana_dry_run_suggestion",strict:true,schema:ANA_DRY_RUN_SCHEMA}}}),signal:AbortSignal.timeout(15000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return {ok:false as const,error:"openai_http_error",status:response.status,response_id:data?.id||null,latency_ms:Date.now()-started};
    let parsed:any={};try{parsed=JSON.parse(outputText(data)||"{}")}catch{return {ok:false as const,error:"openai_parse_error",response_id:data?.id||null,latency_ms:Date.now()-started}}
    return {ok:true as const,result:normalizeAnaDryRunResult(parsed),response_id:data?.id||null,latency_ms:Date.now()-started};
  }catch(error:any){return {ok:false as const,error:clean(error?.name||"openai_request_error",120),latency_ms:Date.now()-started}}
}

async function finalizeFailedPreview(db:any,jobId:string,generated:any){
  try{
    const failed=await db.rpc("ops2_admin_ana_preview_finish_v1",{
      p_job_id:jobId,p_status:"failed",p_reason:generated?.error||"ana_preview_generation_failed",
      p_model:ANA_MODEL,p_provider_response_id:generated?.response_id||null,
      p_last_error:generated?.error||"ana_preview_generation_failed",p_missing_context:[]
    });
    if(failed?.error){console.error("admin-whatsapp-ana-preview-v1","failed_preview_finalize",clean(failed.error?.message||failed.error,240));return false}
    if(failed?.data?.ok===false){console.error("admin-whatsapp-ana-preview-v1","failed_preview_finalize_result",clean(failed.data?.error||"finish_not_ok",240));return false}
    return true;
  }catch(error){
    console.error("admin-whatsapp-ana-preview-v1","failed_preview_finalize_exception",clean(error instanceof Error?error.message:error,240));
    return false;
  }
}

async function observePreview(db:any,jobId:string,latencyMs:number,cached=false){
  try{
    const observed=await db.rpc("ops2_admin_ana_preview_observe_v1",{
      p_job_id:jobId,p_latency_ms:Math.max(0,Math.round(Number(latencyMs)||0)),p_cached:Boolean(cached)
    });
    if(observed?.error)console.error("admin-whatsapp-ana-preview-v1","preview_observe",clean(observed.error?.message||observed.error,240));
  }catch(error){
    console.error("admin-whatsapp-ana-preview-v1","preview_observe_exception",clean(error instanceof Error?error.message:error,240));
  }
}

Deno.serve(async(req:Request)=>{
  let requestDb:any=null;
  let claimedJobId:string|null=null;
  try{
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
    if(req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
    if(!SUPABASE_URL||!SUPABASE_ANON_KEY)return json(req,{ok:false,error:"server_config"},500);
    requestDb=dbFor(req);const db=requestDb;const auth=await adminAuth(req,db);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
    const body=await req.json().catch(()=>({}));
    const action=clean(body?.action||"preview",30).toLowerCase()||"preview";

    if(action.startsWith("admin_"))return await anaAdminAction(req,body,action,requestDb);

    if(action==="review"){
      const jobId=validUuid(body?.job_id);const outcome=clean(body?.outcome,30).toLowerCase();const note=clean(body?.note,500)||null;
      if(!jobId)return json(req,{ok:false,error:"job_required",dry_run_not_sendable:true},400);
      if(!["used","helpful","rejected"].includes(outcome))return json(req,{ok:false,error:"review_outcome_invalid",dry_run_not_sendable:true},400);
      const reviewed=await db.rpc("ops2_admin_ana_preview_review_v1",{p_job_id:jobId,p_outcome:outcome,p_note:note});
      if(reviewed.error)throw reviewed.error;const review=reviewed.data||{ok:false,error:"ana_review_failed"};
      if(review.ok!==true)return json(req,{ok:false,error:review.error||"ana_review_failed",dry_run_not_sendable:true},review.error==="admin_not_authorized"?403:409);
      return json(req,{ok:true,dry_run:true,dry_run_not_sendable:true,review});
    }

    if(action==="metrics"){
      const measured=await db.rpc("ops2_admin_ana_preview_metrics_v1");if(measured.error)throw measured.error;
      const metrics=measured.data||{ok:false,error:"ana_metrics_failed"};
      if(metrics.ok!==true)return json(req,{ok:false,error:metrics.error||"ana_metrics_failed",dry_run_not_sendable:true},metrics.error==="admin_not_authorized"?403:409);
      return json(req,{ok:true,dry_run:true,dry_run_not_sendable:true,metrics});
    }

    if(action!=="preview")return json(req,{ok:false,error:"action_invalid",dry_run_not_sendable:true},400);
    const conversationId=validUuid(body?.conversation_id);if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id",dry_run_not_sendable:true},400);
    const started=await db.rpc("ops2_admin_ana_preview_start_v1",{p_conversation_id:conversationId});if(started.error)throw started.error;const start=started.data||{ok:false,error:"ana_preview_start_failed"};
    if(start.ok!==true){const error=String(start.error||"ana_preview_start_failed");const status=["ai_gate_closed","ana_preview_no_text_inbound","ana_preview_busy"].includes(error)?409:error==="conversation_not_found"?404:error==="admin_not_authorized"?403:400;return json(req,{ok:false,error,dry_run_not_sendable:true},status)}
    if(start.cached===true)return json(req,{ok:true,dry_run:true,dry_run_not_sendable:true,job:{id:start.job_id,status:start.status,decision:start.decision,suggestion_text:start.suggestion_text,confidence:start.confidence===null?null:Number(start.confidence),reason:start.reason,model:start.model,latency_ms:null,missing_context:Array.isArray(start.missing_context)?start.missing_context:[],completed_at:start.completed_at,cached:true}});
    const jobId=validUuid(start.job_id);if(!jobId)return json(req,{ok:false,error:"ana_preview_job_invalid",dry_run_not_sendable:true},500);claimedJobId=jobId;
    const customerFirstName=await linkedCustomerFirstName(serviceDb(),conversationId);
    const generated=await generateSuggestion(String(start.inbound_text||""),Array.isArray(start.history)?start.history:[],customerFirstName);
    if(!generated.ok){const finalized=await finalizeFailedPreview(db,jobId,generated);if(finalized)claimedJobId=null;await observePreview(db,jobId,generated.latency_ms,false);return json(req,{ok:false,error:"ana_preview_generation_failed",dry_run_not_sendable:true},502)}
    const result=generated.result;const finished=await db.rpc("ops2_admin_ana_preview_finish_v1",{p_job_id:jobId,p_status:"completed",p_decision:result.decision,p_suggestion_text:result.response_text,p_confidence:result.confidence,p_reason:result.reason,p_model:ANA_MODEL,p_provider_response_id:generated.response_id||null,p_last_error:null,p_missing_context:result.missing_context});if(finished.error)throw finished.error;const job=finished.data||{ok:false,error:"ana_preview_finish_failed"};
    if(job.ok!==true){const finalized=await finalizeFailedPreview(db,jobId,{error:job.error||"ana_preview_finish_failed"});if(finalized)claimedJobId=null;return json(req,{ok:false,error:job.error||"ana_preview_finish_failed",dry_run_not_sendable:true},409)}
    claimedJobId=null;
    await observePreview(db,jobId,generated.latency_ms,false);
    return json(req,{ok:true,dry_run:true,dry_run_not_sendable:true,job:{id:job.job_id,status:job.status,decision:job.decision,suggestion_text:job.suggestion_text,confidence:job.confidence===null?null:Number(job.confidence),reason:job.reason,model:job.model||ANA_MODEL,latency_ms:generated.latency_ms,missing_context:Array.isArray(job.missing_context)?job.missing_context:[],completed_at:job.completed_at,cached:false}});
  }catch(error){
    if(requestDb&&claimedJobId)await finalizeFailedPreview(requestDb,claimedJobId,{error:"ana_preview_internal_error"});
    console.error("admin-whatsapp-ana-preview-v1",clean(error instanceof Error?error.message:error,500));
    return json(req,{ok:false,error:"ana_preview_internal_error",dry_run_not_sendable:true},500)
  }
});

