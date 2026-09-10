import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=1000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));

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
  const action=clean(body.action||"calendar",80).toLowerCase();
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
