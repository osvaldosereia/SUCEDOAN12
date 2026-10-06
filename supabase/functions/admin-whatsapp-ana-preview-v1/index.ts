import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {ANA_DRY_RUN_INSTRUCTIONS,ANA_DRY_RUN_SCHEMA,buildAnaDryRunInput,normalizeAnaDryRunResult} from "../_shared/ana-policy-v1.mjs";
import {linkedCustomerFirstName} from "../_shared/ana-customer-context-v1.mjs";

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

function operationalContext(customerFirstName=''){
  return {
    catalog_ordering:"Para consultar produtos e fazer pedido, direcione o cliente ao catálogo/site oficial. O atendimento pode orientar e oferecer atendimento humano, mas esta prévia não cria pedido.",
    human_support:"Atendimento humano está disponível quando o cliente pedir ajuda, quando faltar contexto confiável ou quando houver exceção operacional.",
    never_collect_in_chat:["CPF/CNPJ","endereço completo"],
    dynamic_data_rule:"Preço, estoque, total, composição de cesta, prazo/entrega, pagamento e dados do pedido são dinâmicos. Só afirme esses dados quando vierem explicitamente no contexto; caso contrário, encaminhe para humano ou para o catálogo/site oficial.",
    known_customer_first_name:customerFirstName
  };
}

async function generateSuggestion(inboundText:string,history:any[],customerFirstName=''){
  const apiKey=await openaiKey();
  if(!apiKey)return {ok:false as const,error:"openai_not_configured"};
  const input=buildAnaDryRunInput({inboundText,history,operationalContext:operationalContext(customerFirstName)});
  const started=Date.now();
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:ANA_MODEL,store:false,max_output_tokens:500,reasoning:{effort:"low"},instructions:ANA_DRY_RUN_INSTRUCTIONS,input:[{role:"user",content:[{type:"input_text",text:JSON.stringify(input)}]}],text:{format:{type:"json_schema",name:"ana_dry_run_suggestion",strict:true,schema:ANA_DRY_RUN_SCHEMA}}}),signal:AbortSignal.timeout(15000)});
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
