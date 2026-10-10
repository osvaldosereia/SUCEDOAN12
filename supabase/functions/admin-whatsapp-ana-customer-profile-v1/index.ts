import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {ANA_CUSTOMER_PROFILE_INSTRUCTIONS,ANA_CUSTOMER_PROFILE_SCHEMA,buildAnaCustomerProfileInput,normalizeAnaCustomerProfileResult} from "../_shared/ana-customer-profile-policy-v1.mjs";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SUPABASE_ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")||"";
const SUPABASE_SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const OPENAI_API_KEY=Deno.env.get("OPENAI_API_KEY")||"";
const ANA_MODEL=(Deno.env.get("ANA_CUSTOMER_PROFILE_MODEL")||Deno.env.get("ANA_OPENAI_MODEL")||"gpt-6-luna").trim();
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);

const clean=(value:unknown,max=1000)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const validUuid=(value:unknown)=>{const s=String(value??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"POST,OPTIONS"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});

function requestDb(req:Request){const authorization=req.headers.get("Authorization")||"";return createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}})}
function serviceDb(){return createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})}
function outputText(data:any){return (Array.isArray(data?.output)?data.output:[]).flatMap((item:any)=>Array.isArray(item?.content)?item.content:[]).filter((item:any)=>item?.type==="output_text").map((item:any)=>String(item?.text||"")).join("").trim()}
async function adminAuth(req:Request,db:any){const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)return {ok:false as const,status:401,error:"admin_auth_required"};const user=await db.auth.getUser(token);if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid"};return {ok:true as const,user_id:user.data.user.id}}
async function openaiKey(){if(OPENAI_API_KEY)return OPENAI_API_KEY;if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY)return "";try{const q=await serviceDb().rpc("get_conversation_worker_provider_secret_v1");return typeof q.data==="string"?q.data.trim():""}catch{return ""}}
async function sha256(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("")}

async function generateProfile(context:any){
  const apiKey=await openaiKey();if(!apiKey)return {ok:false as const,error:"openai_not_configured"};
  const input=buildAnaCustomerProfileInput(context);const started=Date.now();
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:ANA_MODEL,store:false,max_output_tokens:1200,reasoning:{effort:"low"},instructions:ANA_CUSTOMER_PROFILE_INSTRUCTIONS,input:[{role:"user",content:[{type:"input_text",text:JSON.stringify(input)}]}],text:{format:{type:"json_schema",name:"ana_customer_profile_candidates",strict:true,schema:ANA_CUSTOMER_PROFILE_SCHEMA}}}),signal:AbortSignal.timeout(18000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return {ok:false as const,error:"openai_http_error",status:response.status,response_id:data?.id||null,latency_ms:Date.now()-started};
    let parsed:any={};try{parsed=JSON.parse(outputText(data)||"{}")}catch{return {ok:false as const,error:"openai_parse_error",response_id:data?.id||null,latency_ms:Date.now()-started}}
    return {ok:true as const,result:normalizeAnaCustomerProfileResult(parsed),response_id:data?.id||null,latency_ms:Date.now()-started,usage:data?.usage||null};
  }catch(error:any){return {ok:false as const,error:clean(error?.name||"openai_request_error",120),latency_ms:Date.now()-started}}
}

async function existingSnapshot(svc:any,conversationId:string,snapshotKey:string){
  const run=await svc.from("customer_profile_extraction_runs_v1").select("id,status,model,provider_response_id,created_at").eq("conversation_id",conversationId).eq("snapshot_key",snapshotKey).maybeSingle();
  if(run.error)throw run.error;if(!run.data)return null;
  const suggestions=await svc.from("customer_profile_suggestions_v1").select("id,run_id,field_name,normalized_value,confidence,classification,recommendation,evidence_message_ids,status,created_at").eq("run_id",run.data.id).order("created_at",{ascending:true});
  if(suggestions.error)throw suggestions.error;return {run:run.data,suggestions:suggestions.data||[]};
}

Deno.serve(async(req:Request)=>{
  try{
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
    if(req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
    if(!SUPABASE_URL||!SUPABASE_ANON_KEY||!SUPABASE_SERVICE_ROLE_KEY)return json(req,{ok:false,error:"server_config"},500);
    const db=requestDb(req);const auth=await adminAuth(req,db);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
    const body=await req.json().catch(()=>({}));const action=clean(body?.action||"extract",30).toLowerCase();

    if(action==="review"){
      const suggestionId=validUuid(body?.suggestion_id);const outcome=clean(body?.outcome,20).toLowerCase();
      if(!suggestionId)return json(req,{ok:false,error:"suggestion_required"},400);
      if(!["accepted","rejected"].includes(outcome))return json(req,{ok:false,error:"review_outcome_invalid"},400);
      const reviewed=await db.rpc("ops2_admin_ana_customer_profile_review_v1",{p_suggestion_id:suggestionId,p_outcome:outcome});if(reviewed.error)throw reviewed.error;
      const data=reviewed.data||{ok:false,error:"profile_review_failed"};if(data.ok!==true)return json(req,data,data.error==="admin_not_authorized"?403:409);
      return json(req,data);
    }
    if(action==="metrics"){
      const measured=await db.rpc("ops2_admin_ana_customer_profile_metrics_v1");if(measured.error)throw measured.error;
      const data=measured.data||{ok:false,error:"profile_metrics_failed"};if(data.ok!==true)return json(req,data,data.error==="admin_not_authorized"?403:400);
      return json(req,data);
    }

    const conversationId=validUuid(body?.conversation_id);if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);
    if(action==="list"){
      const listed=await db.rpc("ops2_admin_ana_customer_profile_suggestions_v1",{p_conversation_id:conversationId});if(listed.error)throw listed.error;
      const data=listed.data||{ok:false,error:"suggestions_unavailable"};if(data.ok!==true)return json(req,data,data.error==="admin_not_authorized"?403:400);
      return json(req,data);
    }
    if(action!=="extract")return json(req,{ok:false,error:"action_invalid"},400);

    const writeAccess=await db.rpc("ops2_admin_ana_customer_profile_extract_access_v1");if(writeAccess.error)throw writeAccess.error;
    const writeGate=writeAccess.data||{ok:false,error:"admin_not_authorized"};if(writeGate.ok!==true)return json(req,{ok:false,error:writeGate.error||"admin_not_authorized"},403);

    const contextCall=await db.rpc("ops2_admin_ana_customer_profile_context_v1",{p_conversation_id:conversationId});if(contextCall.error)throw contextCall.error;
    const context=contextCall.data||{ok:false,error:"profile_context_unavailable"};
    if(context.ok!==true){const status=context.error==="ambiguous_phone"?409:context.error==="conversation_not_found"?404:context.error==="admin_not_authorized"?403:400;return json(req,{ok:false,error:context.error||"profile_context_unavailable"},status)}

    const snapshotPayload={conversation_id:conversationId,customer_id:context.customer_id||null,current_profile:context.current_profile||{},missing_fields:context.missing_fields||[],messages:context.messages||[]};
    const snapshotKey=await sha256(JSON.stringify(snapshotPayload));
    const svc=serviceDb();const cached=await existingSnapshot(svc,conversationId,snapshotKey);
    if(cached)return json(req,{ok:true,reused:true,run_id:cached.run.id,suggestions:cached.suggestions});

    const generated=await generateProfile(context);if(!generated.ok)return json(req,{ok:false,error:"ana_customer_profile_generation_failed",detail:generated.error},502);
    const allowedEvidence=new Set((Array.isArray(context.messages)?context.messages:[]).map((m:any)=>String(m?.id||"")).filter(Boolean));
    const candidates=(generated.result?.candidates||[]).filter((candidate:any)=>Array.isArray(candidate.evidence_message_ids)&&candidate.evidence_message_ids.length>0&&candidate.evidence_message_ids.every((id:string)=>allowedEvidence.has(String(id))));

    const persisted=await svc.rpc("ops2_ana_customer_profile_persist_v1",{
      p_conversation_id:conversationId,
      p_customer_id:context.customer_id||null,
      p_conversation_phone_e164:context.conversation_phone_e164||null,
      p_snapshot_key:snapshotKey,
      p_model:ANA_MODEL,
      p_provider_response_id:generated.response_id||null,
      p_metadata:{latency_ms:generated.latency_ms||null,usage:generated.usage||null,candidate_count:candidates.length},
      p_created_by_admin_user_id:auth.user_id,
      p_candidates:candidates
    });
    if(persisted.error)throw persisted.error;
    const stored=persisted.data||{ok:false,error:"profile_persist_failed"};
    if(stored.ok!==true)return json(req,{ok:false,error:stored.error||"profile_persist_failed"},409);
    return json(req,{ok:true,reused:stored.reused===true,run_id:stored.run_id,suggestions:Array.isArray(stored.suggestions)?stored.suggestions:[]});
  }catch(error){console.error("admin-whatsapp-ana-customer-profile-v1",clean(error instanceof Error?error.message:error,500));return json(req,{ok:false,error:"ana_customer_profile_internal_error"},500)}
});
