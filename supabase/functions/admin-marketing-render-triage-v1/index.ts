import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=200)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const fail=(error:string,detail:string,status=400)=>json({ok:false,error,detail,external_side_effect:false},status);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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