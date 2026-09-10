import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=800)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80))?clean(v,80):"";

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return json({ok:false,error:"server_config"},500);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)return json({ok:false,error:"missing_token"},401);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await sb.auth.getUser(token);if(userError||!userData?.user?.id)return json({ok:false,error:"invalid_user"},401);
  const {data:admin,error:adminError}=await sb.from("admin_users").select("role,is_active,display_name").eq("user_id",userData.user.id).maybeSingle();if(adminError)return json({ok:false,error:"admin_lookup_failed"},500);if(!admin?.is_active)return json({ok:false,error:"admin_not_authorized"},403);
  const isOwner=admin.role==="owner";
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const action=clean(body?.action||"dashboard",40).toLowerCase();

  if(action==="dashboard"){
    const [{data:readiness,error:r1},{data:report,error:r2}]=await Promise.all([sb.rpc("get_agent_core_round3_readiness_v1"),sb.rpc("get_agent_core_round3_report_v1",{p_hours:24})]);
    if(r1||r2)return json({ok:false,error:"learning_dashboard_failed"},500);
    return json({ok:true,user:{role:admin.role,display_name:admin.display_name||null},readiness,report,policy:{autopublish:false,approval_creates_draft_only:true,owner_review_required:true}});
  }

  if(action==="list"){
    const status=clean(body?.status,30),limit=Math.max(1,Math.min(200,Number(body?.limit||100)));
    const {data,error}=await sb.rpc("list_agent_core_learning_candidates_v1",{p_status:status||null,p_limit:limit});if(error)return json({ok:false,error:"learning_list_failed"},500);
    return json({ok:true,items:Array.isArray(data)?data:[],policy:{autopublish:false}});
  }

  if(action==="review"){
    if(!isOwner)return json({ok:false,error:"owner_required"},403);
    const id=uuid(body?.id),decision=clean(body?.decision,30),note=clean(body?.note,500);if(!id||!["reject","approve_draft"].includes(decision))return json({ok:false,error:"invalid_review"},400);
    const {data,error}=await sb.rpc("review_agent_core_learning_candidate_v1",{p_candidate_id:id,p_decision:decision,p_actor_user_id:userData.user.id,p_note:note||null});if(error)return json({ok:false,error:"learning_review_failed",detail:error.message},400);
    if(!data?.ok)return json({ok:false,error:data?.reason||"learning_review_rejected"},400);
    return json({ok:true,result:data,policy:{published:false,requires_second_human_publish_step:decision==="approve_draft"}});
  }

  return json({ok:false,error:"unknown_action"},400);
});
