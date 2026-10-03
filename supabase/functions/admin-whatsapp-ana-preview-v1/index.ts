import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const clean=(value:unknown,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const validUuid=(value:unknown)=>{const s=String(value??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
  "Vary":"Origin",
  "Access-Control-Allow-Headers":"content-type,authorization,apikey",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false as const,status:401,error:"admin_auth_required"};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid"};
  const row=await db.from("admin_users").select("user_id,role,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed"};
  if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized"};
  return {ok:true as const,user_id:user.data.user.id,role:row.data.role||"viewer"};
}

async function latestInboundText(conversationId:string){
  const result=await db.from("whatsapp_messages_v1")
    .select("id,conversation_id,direction,message_type,text_body,received_at,created_at")
    .eq("conversation_id",conversationId)
    .eq("direction","inbound")
    .eq("message_type","text")
    .not("text_body","is",null)
    .order("received_at",{ascending:false,nullsFirst:false})
    .order("created_at",{ascending:false})
    .limit(10);
  if(result.error)throw result.error;
  return (result.data||[]).find((row:any)=>String(row.text_body||"").trim())||null;
}

Deno.serve(async(req:Request)=>{
  try{
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
    if(req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
    if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);

    const auth=await adminAuth(req);
    if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);

    const body=await req.json().catch(()=>({}));
    const conversationId=validUuid(body?.conversation_id);
    if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);

    const conversation=await db.from("conversations").select("id,whatsapp_account_id,mode,human_required").eq("id",conversationId).maybeSingle();
    if(conversation.error)throw conversation.error;
    if(!conversation.data)return json(req,{ok:false,error:"conversation_not_found"},404);

    const inbound=await latestInboundText(conversationId);
    if(!inbound)return json(req,{ok:false,error:"ana_preview_no_text_inbound"},409);

    const enqueue=await db.rpc("ops2_ana_enqueue_dry_run_v1",{p_inbound_message_id:inbound.id});
    if(enqueue.error)throw enqueue.error;
    const enqueueData=enqueue.data||{ok:false,error:"ana_preview_enqueue_failed"};
    if(enqueueData.ok!==true){
      const error=String(enqueueData.error||"ana_preview_enqueue_failed");
      return json(req,{ok:false,error,dry_run_not_sendable:true},error==="ai_gate_closed"?409:400);
    }

    const worker=await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-ana-worker-v1`,{
      method:"POST",
      headers:{Authorization:`Bearer ${SERVICE_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify({job_id:enqueueData.job_id}),
      signal:AbortSignal.timeout(20000)
    });
    const workerData=await worker.json().catch(()=>({}));
    if(!worker.ok||workerData?.ok===false)return json(req,{ok:false,error:"ana_preview_worker_failed",dry_run_not_sendable:true},502);

    const job=await db.from("whatsapp_ana_jobs_v1")
      .select("id,inbound_message_id,conversation_id,status,decision,suggestion_text,confidence,reason,model,metadata,completed_at,created_at")
      .eq("id",enqueueData.job_id)
      .eq("conversation_id",conversationId)
      .maybeSingle();
    if(job.error)throw job.error;
    if(!job.data)return json(req,{ok:false,error:"ana_preview_job_not_found",dry_run_not_sendable:true},404);

    const metadata:any=job.data.metadata&&typeof job.data.metadata==="object"?job.data.metadata:{};
    const missingContext=Array.isArray(metadata.missing_context)?metadata.missing_context.map((x:any)=>clean(x,120)).filter(Boolean).slice(0,5):[];
    return json(req,{
      ok:true,
      dry_run:true,
      dry_run_not_sendable:true,
      job:{
        id:job.data.id,
        inbound_message_id:job.data.inbound_message_id,
        conversation_id:job.data.conversation_id,
        status:job.data.status,
        decision:job.data.decision,
        suggestion_text:job.data.suggestion_text,
        confidence:job.data.confidence===null?null:Number(job.data.confidence),
        reason:job.data.reason,
        model:job.data.model,
        missing_context:missingContext,
        completed_at:job.data.completed_at,
        created_at:job.data.created_at
      }
    });
  }catch(error){
    console.error("admin-whatsapp-ana-preview-v1",clean(error instanceof Error?error.message:error,500));
    return json(req,{ok:false,error:"ana_preview_internal_error",dry_run_not_sendable:true},500);
  }
});
