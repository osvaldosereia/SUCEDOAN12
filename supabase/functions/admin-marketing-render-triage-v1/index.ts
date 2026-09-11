import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=200)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const fail=(error:string,detail:string,status=400)=>json({ok:false,error,detail,external_side_effect:false},status);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_LIST_STATUSES=["pending_review","approved","blocked"];
const HISTORY_LIST_STATUSES=["cancelled"];

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return fail("method_not_allowed","POST obrigatório",405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return fail("server_config","Supabase indisponível",500);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return fail("missing_token","Faça login",401);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:u,error:ue}=await sb.auth.getUser(token);
  if(ue||!u?.user?.id)return fail("invalid_user","Sessão inválida",401);
  const {data:admin,error:ae}=await sb.from("admin_users").select("role,is_active,display_name").eq("user_id",u.user.id).maybeSingle();
  if(ae)return fail("admin_lookup_failed","Não foi possível validar o perfil",500);
  if(!admin?.is_active||!["owner","operator"].includes(admin.role))return fail("admin_not_authorized","Sem permissão",403);

  let b:Record<string,unknown>={};try{b=await req.json()}catch{return fail("invalid_json","JSON inválido")}
  const action=clean(b.action,40)||"preview";
  const stuckSeconds=Math.max(60,Math.min(Number(b.stuck_after_seconds||600)||600,86400));

  if(action==="list"){
    const limit=Math.max(1,Math.min(Number(b.limit||30)||30,100));
    const includeCancelled=b.include_cancelled===true;
    const statuses=includeCancelled?[...ACTIVE_LIST_STATUSES,...HISTORY_LIST_STATUSES]:ACTIVE_LIST_STATUSES;
    const {data:runtime,error:re}=await sb.from("marketing_runtime_config")
      .select("render_triage_enabled,render_requeue_enabled,render_triage_kill_switch,enabled,execution_mode,kill_switch,generation_enabled")
      .eq("id",1).maybeSingle();
    if(re||!runtime)return fail("runtime_lookup_failed","Não foi possível consultar os gates",500);
    const {data:metrics,error:me}=await sb.rpc("marketing_render_triage_metrics_v1");
    if(me)return fail("triage_metrics_failed","Não foi possível consultar os contadores",500);
    if(!metrics||typeof metrics!=="object"||(metrics as Record<string,unknown>).external_side_effect!==false)return fail("unsafe_triage_metrics","Contadores recusados",500);
    const redaction=(metrics as Record<string,any>).redaction||{};
    if(redaction.eligibility_snapshot_exposed!==false||redaction.result_snapshot_exposed!==false||redaction.idempotency_key_exposed!==false||redaction.actor_ids_exposed!==false||redaction.raw_error_exposed!==false||redaction.job_payload_exposed!==false)return fail("unsafe_triage_metrics_redaction","Contadores recusados por redaction",500);
    const {data:rows,error:le}=await sb.from("marketing_render_triage_requests")
      .select("id,job_id,asset_id,reason_code,status,requested_at,reviewed_at,executed_at")
      .in("status",statuses).order("created_at",{ascending:false}).limit(limit);
    if(le)return fail("triage_list_failed","Não foi possível consultar a triagem",500);
    const jobIds=[...new Set((rows||[]).map((r:any)=>r.job_id).filter(Boolean))];
    const jobs=new Map<string,any>();
    if(jobIds.length){
      const {data:j,error:je}=await sb.from("marketing_render_jobs").select("id,render_kind,status,attempt_count").in("id",jobIds);
      if(je)return fail("triage_jobs_failed","Não foi possível consultar os jobs",500);
      for(const row of j||[])jobs.set(row.id,row);
    }
    const items=(rows||[]).map((r:any)=>{const j=jobs.get(r.job_id)||{};return {
      request_id:r.id,job_id:r.job_id,asset_id:r.asset_id,reason_code:r.reason_code,status:r.status,
      requested_at:r.requested_at,reviewed_at:r.reviewed_at,executed_at:r.executed_at,
      render_kind:j.render_kind||null,job_status:j.status||null,attempt_count:Number(j.attempt_count||0)
    }});
    return json({ok:true,items,metrics,runtime:{
      triage_enabled:runtime.render_triage_enabled===true,
      requeue_enabled:runtime.render_requeue_enabled===true,
      triage_kill_switch:runtime.render_triage_kill_switch!==false,
      marketing_enabled:runtime.enabled===true,
      execution_mode:clean(runtime.execution_mode,20)||"off",
      marketing_kill_switch:runtime.kill_switch!==false,
      generation_enabled:runtime.generation_enabled===true
    },redaction:{eligibility_snapshot_exposed:false,result_snapshot_exposed:false,idempotency_key_exposed:false,actor_ids_exposed:false,raw_error_exposed:false,job_payload_exposed:false},user:{role:admin.role,display_name:admin.display_name},external_side_effect:false});
  }

  if(action==="preview"){
    const jobId=clean(b.job_id,40);if(!UUID.test(jobId))return fail("invalid_job_id","Job inválido");
    const {data,error}=await sb.rpc("preview_marketing_render_requeue_v1",{p_job_id:jobId,p_stuck_after_seconds:stuckSeconds});
    if(error)return fail("preview_failed",error.message,500);
    if(!data||typeof data!=="object"||(data as Record<string,unknown>).external_side_effect!==false)return fail("unsafe_preview","Preview recusado",500);
    return json({ok:true,eligibility:data,user:{role:admin.role,display_name:admin.display_name},external_side_effect:false});
  }

  if(action==="request"){
    const jobId=clean(b.job_id,40),reason=clean(b.reason_code,40),idem=clean(b.idempotency_key,160);
    if(!UUID.test(jobId))return fail("invalid_job_id","Job inválido");
    if(idem.length<12)return fail("invalid_idempotency_key","Chave idempotente obrigatória");
    const {data,error}=await sb.rpc("request_marketing_render_requeue_v1",{p_job_id:jobId,p_reason_code:reason,p_idempotency_key:idem,p_actor:u.user.id,p_stuck_after_seconds:stuckSeconds});
    if(error)return fail("request_failed",error.message,500);
    if(!data||typeof data!=="object"||(data as Record<string,unknown>).external_side_effect!==false)return fail("unsafe_request","Solicitação recusada",500);
    return json(data);
  }

  if(action==="cancel"){
    const requestId=clean(b.request_id,40);if(!UUID.test(requestId))return fail("invalid_request_id","Solicitação inválida");
    const {data,error}=await sb.rpc("cancel_marketing_render_requeue_v1",{p_request_id:requestId,p_actor:u.user.id});
    if(error)return fail("cancel_failed",error.message,500);
    if(!data||typeof data!=="object"||(data as Record<string,unknown>).external_side_effect!==false)return fail("unsafe_cancel_response","Cancelamento recusado",500);
    if((data as Record<string,unknown>).status!=="cancelled")return fail("unsafe_cancel_status","Cancelamento recusado: estado final inválido",500);
    return json(data);
  }

  if(action==="approve"||action==="execute"){
    if(admin.role!=="owner")return fail("owner_required","Somente owner pode aprovar ou executar triagem",403);
    const requestId=clean(b.request_id,40);if(!UUID.test(requestId))return fail("invalid_request_id","Solicitação inválida");
    const rpc=action==="approve"?"approve_marketing_render_requeue_v1":"execute_marketing_render_requeue_v1";
    const {data,error}=await sb.rpc(rpc,{p_request_id:requestId,p_actor:u.user.id,p_stuck_after_seconds:stuckSeconds});
    if(error)return fail(`${action}_failed`,error.message,500);
    if(!data||typeof data!=="object"||(data as Record<string,unknown>).external_side_effect!==false)return fail("unsafe_triage_response","Resposta recusada",500);
    return json(data);
  }

  return fail("unknown_action","Ação não permitida");
});