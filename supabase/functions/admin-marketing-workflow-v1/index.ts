import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=1000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));
const jsonObject=(v:unknown)=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
const jsonArray=(v:unknown)=>Array.isArray(v)?v:[];
const payloadSizeOk=(v:unknown,max=120000)=>{try{return JSON.stringify(v??null).length<=max}catch{return false}};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceKey)return json({ok:false,error:"server_config"},500);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return json({ok:false,error:"missing_token"},401);
  const sb=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await sb.auth.getUser(token);
  if(userError||!userData?.user?.id)return json({ok:false,error:"invalid_user"},401);
  const user=userData.user;
  const {data:admin,error:adminError}=await sb.from("admin_users").select("role,is_active,display_name").eq("user_id",user.id).maybeSingle();
  if(adminError)return json({ok:false,error:"admin_lookup_failed"},500);
  if(!admin?.is_active||!["owner","operator"].includes(admin.role))return json({ok:false,error:"admin_not_authorized"},403);
  let body:Record<string,unknown>={}; try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  if(!payloadSizeOk(body))return json({ok:false,error:"payload_too_large"},413);
  const action=clean(body.action||"calendar",80).toLowerCase();

  if(action==="workflow_overview"){
    const [{data:assets,error:assetsError},{data:jobs,error:jobsError},{data:calendar,error:calendarError}]=await Promise.all([
      sb.from("marketing_assets").select("id,title,media_kind,generation_mode,status,updated_at,review_requested_at,reviewed_at").in("status",["draft","rendered","review","approved"]).order("updated_at",{ascending:false}).limit(100),
      sb.from("marketing_publication_jobs").select("id,asset_id,channel,content_type,status,scheduled_for,manual_confirmation_required,marketing_assets(title)").in("status",["approved","scheduled"]).order("scheduled_for",{ascending:true,nullsFirst:false}).limit(200),
      sb.rpc("marketing_calendar_v1",{})
    ]);
    if(assetsError||jobsError||calendarError)return json({ok:false,error:"workflow_overview_failed",detail:assetsError?.message||jobsError?.message||calendarError?.message},500);
    const normalizedJobs=(jobs||[]).map((j:any)=>({...j,title:j.marketing_assets?.title||null,marketing_assets:undefined}));
    return json({ok:true,user:{role:admin.role,display_name:admin.display_name},assets:assets||[],jobs:normalizedJobs,calendar:calendar||[],external_side_effect:false});
  }
  if(action==="editor_overview"){
    const [{data:assets,error:assetsError},{data:revisions,error:revisionsError},{data:runtime,error:runtimeError}]=await Promise.all([
      sb.from("marketing_assets").select("id,campaign_id,parent_asset_id,version,title,media_kind,generation_mode,status,source_refs,edit_spec,render_spec,output_spec,editable,updated_at,review_requested_at,reviewed_at").neq("status","archived").order("updated_at",{ascending:false}).limit(100),
      sb.from("marketing_asset_revisions").select("id,asset_id,revision_no,title,generation_mode,status_at_revision,edit_spec,render_spec,change_note,created_at").order("created_at",{ascending:false}).limit(300),
      sb.from("marketing_runtime_config").select("enabled,execution_mode,kill_switch,generation_enabled,deterministic_render_enabled,ai_image_enabled,ai_video_enabled,publishing_enabled").eq("id",1).maybeSingle()
    ]);
    if(assetsError||revisionsError||runtimeError)return json({ok:false,error:"editor_overview_failed",detail:assetsError?.message||revisionsError?.message||runtimeError?.message},500);
    return json({ok:true,user:{role:admin.role,display_name:admin.display_name},runtime:runtime||{},assets:assets||[],revisions:revisions||[],external_side_effect:false});
  }
  if(action==="editor_save"){
    const id=clean(body.asset_id,80); if(!uuid(id))return json({ok:false,error:"invalid_asset_id"},400);
    const mode=clean(body.generation_mode,20); if(!["no_ai","ai","hybrid","manual"].includes(mode))return json({ok:false,error:"invalid_generation_mode"},400);
    const editSpec=jsonObject(body.edit_spec),renderSpec=jsonObject(body.render_spec),sourceRefs=jsonArray(body.source_refs);
    if(!payloadSizeOk({editSpec,renderSpec,sourceRefs},90000))return json({ok:false,error:"editor_spec_too_large"},413);
    const {data,error}=await sb.rpc("marketing_save_asset_edit_v1",{
      p_asset_id:id,p_title:clean(body.title,180),p_generation_mode:mode,p_source_refs:sourceRefs,
      p_edit_spec:editSpec,p_render_spec:renderSpec,p_change_note:clean(body.change_note,1000)||null,p_actor:user.id
    });
    if(error)return json({ok:false,error:"editor_save_failed",detail:error.message},400);
    if(!data?.ok)return json(data,409);
    return json({ok:true,result:data,external_side_effect:false});
  }
  if(action==="editor_fork"){
    const id=clean(body.asset_id,80); if(!uuid(id))return json({ok:false,error:"invalid_asset_id"},400);
    const {data,error}=await sb.rpc("marketing_fork_asset_version_v1",{p_asset_id:id,p_change_note:clean(body.change_note,1000)||null,p_actor:user.id});
    if(error)return json({ok:false,error:"editor_fork_failed",detail:error.message},400);
    if(!data?.ok)return json(data,409);
    return json({ok:true,result:data,external_side_effect:false});
  }
  if(action==="calendar"){
    const now=new Date(),to=new Date(now.getTime()+31*86400000);
    const fromRaw=clean(body.from,80),toRaw=clean(body.to,80);
    const from=fromRaw&&!Number.isNaN(Date.parse(fromRaw))?fromRaw:new Date(now.getTime()-86400000).toISOString();
    const until=toRaw&&!Number.isNaN(Date.parse(toRaw))?toRaw:to.toISOString();
    const {data,error}=await sb.rpc("marketing_calendar_v1",{p_from:from,p_to:until});
    if(error)return json({ok:false,error:"calendar_failed",detail:error.message},500);
    return json({ok:true,items:data||[],external_side_effect:false});
  }
  if(action==="submit_review"){
    const id=clean(body.asset_id,80); if(!uuid(id))return json({ok:false,error:"invalid_asset_id"},400);
    const {data,error}=await sb.rpc("submit_marketing_asset_review_v1",{p_asset_id:id,p_actor:user.id});
    if(error)return json({ok:false,error:"review_failed",detail:error.message},400); if(!data?.ok)return json(data,409); return json({ok:true,result:data});
  }
  if(action==="approve_asset"){
    if(admin.role!=="owner")return json({ok:false,error:"owner_required"},403);
    const id=clean(body.asset_id,80); if(!uuid(id))return json({ok:false,error:"invalid_asset_id"},400);
    const {data,error}=await sb.rpc("approve_marketing_asset_v1",{p_asset_id:id,p_note:clean(body.note,1000)||null,p_actor:user.id});
    if(error)return json({ok:false,error:"approval_failed",detail:error.message},400); if(!data?.ok)return json(data,409); return json({ok:true,result:data});
  }
  if(action==="schedule_job"){
    if(admin.role!=="owner")return json({ok:false,error:"owner_required"},403);
    const id=clean(body.job_id,80),when=clean(body.scheduled_for,80); if(!uuid(id)||!when||Number.isNaN(Date.parse(when)))return json({ok:false,error:"invalid_schedule"},400);
    const {data,error}=await sb.rpc("schedule_marketing_publication_v1",{p_job_id:id,p_scheduled_for:new Date(when).toISOString(),p_actor:user.id});
    if(error)return json({ok:false,error:"schedule_failed",detail:error.message},400); if(!data?.ok)return json(data,409); return json({ok:true,result:data});
  }
  if(action==="unschedule_job"){
    if(admin.role!=="owner")return json({ok:false,error:"owner_required"},403);
    const id=clean(body.job_id,80); if(!uuid(id))return json({ok:false,error:"invalid_job_id"},400);
    const {data,error}=await sb.rpc("unschedule_marketing_publication_v1",{p_job_id:id,p_actor:user.id});
    if(error)return json({ok:false,error:"unschedule_failed",detail:error.message},400); if(!data?.ok)return json(data,409); return json({ok:true,result:data});
  }
  // Deliberately absent: publish, enable, canary, token write, paid provider and external dispatch.
  return json({ok:false,error:"unknown_or_not_allowed_action"},400);
});
