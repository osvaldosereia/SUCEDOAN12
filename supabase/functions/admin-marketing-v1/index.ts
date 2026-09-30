import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=1000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));
const nullableUuid=(v:unknown)=>{const x=clean(v,80);return x&&uuid(x)?x:null};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const array=(v:unknown):unknown[]=>Array.isArray(v)?v:[];

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

  let body:Record<string,unknown>={};
  try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const action=clean(body.action||"overview",80).toLowerCase();

  if(action==="overview"){
    const {data,error}=await sb.rpc("marketing_admin_snapshot_v1");
    if(error)return json({ok:false,error:"marketing_snapshot_failed",detail:error.message},500);
    return json({ok:true,user:{id:user.id,role:admin.role,display_name:admin.display_name},snapshot:data});
  }

  if(action==="create_command"){
    const {data,error}=await sb.rpc("create_marketing_command_draft_v1",{
      p_command_key:clean(body.command_key,100),
      p_name:clean(body.name,160),
      p_media_kind:clean(body.media_kind,30),
      p_generation_mode:clean(body.generation_mode,30),
      p_command_text:clean(body.command_text,10000),
      p_provider_hint:clean(body.provider_hint||"auto",80),
      p_negative_prompt:clean(body.negative_prompt,5000)||null,
      p_variables:object(body.variables),
      p_settings:object(body.settings),
      p_actor:user.id,
    });
    if(error)return json({ok:false,error:"command_draft_failed",detail:error.message},400);
    if(!data?.ok)return json(data,409);
    return json({ok:true,result:data});
  }

  if(action==="create_template"){
    const {data,error}=await sb.rpc("create_marketing_template_draft_v1",{
      p_template_key:clean(body.template_key,100),
      p_name:clean(body.name,160),
      p_media_kind:clean(body.media_kind,30),
      p_canvas_spec:object(body.canvas_spec),
      p_layout_spec:object(body.layout_spec),
      p_brand_spec:object(body.brand_spec),
      p_variable_schema:object(body.variable_schema),
      p_actor:user.id,
    });
    if(error)return json({ok:false,error:"template_draft_failed",detail:error.message},400);
    if(!data?.ok)return json(data,409);
    return json({ok:true,result:data});
  }

  if(action==="create_campaign"){
    const {data,error}=await sb.rpc("create_marketing_campaign_draft_v1",{
      p_name:clean(body.name,180),
      p_objective:clean(body.objective,500)||null,
      p_content_policy:object(body.content_policy),
      p_product_selection:object(body.product_selection),
      p_schedule_rule:object(body.schedule_rule),
      p_channel_plan:object(body.channel_plan),
      p_ai_policy:object(body.ai_policy),
      p_actor:user.id,
    });
    if(error)return json({ok:false,error:"campaign_draft_failed",detail:error.message},400);
    if(!data?.ok)return json(data,409);
    return json({ok:true,result:data});
  }

  if(action==="update_campaign"){
    const campaignId=clean(body.campaign_id,80);
    if(!uuid(campaignId))return json({ok:false,error:"invalid_campaign_id"},400);
    const {data,error}=await sb.rpc("update_marketing_campaign_draft_v1",{
      p_campaign_id:campaignId,
      p_name:body.name===undefined?null:clean(body.name,180),
      p_objective:body.objective===undefined?null:clean(body.objective,500),
      p_content_policy:body.content_policy===undefined?null:object(body.content_policy),
      p_product_selection:body.product_selection===undefined?null:object(body.product_selection),
      p_schedule_rule:body.schedule_rule===undefined?null:object(body.schedule_rule),
      p_channel_plan:body.channel_plan===undefined?null:object(body.channel_plan),
      p_ai_policy:body.ai_policy===undefined?null:object(body.ai_policy),
      p_actor:user.id,
    });
    if(error)return json({ok:false,error:"campaign_update_failed",detail:error.message},400);
    if(!data?.ok)return json(data,409);
    return json({ok:true,result:data});
  }

  if(action==="create_asset"){
    const campaignId=nullableUuid(body.campaign_id),templateId=nullableUuid(body.template_id),commandId=nullableUuid(body.command_preset_id);
    const {data,error}=await sb.rpc("create_marketing_asset_draft_v1",{
      p_title:clean(body.title,180),
      p_media_kind:clean(body.media_kind,30),
      p_generation_mode:clean(body.generation_mode,30),
      p_campaign_id:campaignId,
      p_template_id:templateId,
      p_command_preset_id:commandId,
      p_source_refs:array(body.source_refs),
      p_edit_spec:object(body.edit_spec),
      p_render_spec:object(body.render_spec),
      p_actor:user.id,
    });
    if(error)return json({ok:false,error:"asset_draft_failed",detail:error.message},400);
    if(!data?.ok)return json(data,409);
    return json({ok:true,result:data});
  }

  if(action==="update_asset"){
    const assetId=clean(body.asset_id,80);
    if(!uuid(assetId))return json({ok:false,error:"invalid_asset_id"},400);
    const {data,error}=await sb.rpc("update_marketing_asset_draft_v1",{
      p_asset_id:assetId,
      p_title:body.title===undefined?null:clean(body.title,180),
      p_generation_mode:body.generation_mode===undefined?null:clean(body.generation_mode,30),
      p_template_id:body.template_id===undefined?null:nullableUuid(body.template_id),
      p_command_preset_id:body.command_preset_id===undefined?null:nullableUuid(body.command_preset_id),
      p_source_refs:body.source_refs===undefined?null:array(body.source_refs),
      p_edit_spec:body.edit_spec===undefined?null:object(body.edit_spec),
      p_render_spec:body.render_spec===undefined?null:object(body.render_spec),
      p_actor:user.id,
    });
    if(error)return json({ok:false,error:"asset_update_failed",detail:error.message},400);
    if(!data?.ok)return json(data,409);
    return json({ok:true,result:data});
  }

  if(action==="create_publication_draft"){
    const assetId=clean(body.asset_id,80);
    if(!uuid(assetId))return json({ok:false,error:"invalid_asset_id"},400);
    const {data,error}=await sb.rpc("create_marketing_publication_draft_v1",{
      p_asset_id:assetId,
      p_channel:clean(body.channel,40),
      p_content_type:clean(body.content_type,30),
      p_payload:object(body.payload),
      p_scheduled_for:clean(body.scheduled_for,80)||null,
      p_idempotency_key:clean(body.idempotency_key,220)||null,
      p_actor:user.id,
    });
    if(error)return json({ok:false,error:"publication_draft_failed",detail:error.message},400);
    if(!data?.ok)return json(data,409);
    return json({ok:true,result:data});
  }

  if(action==="kill"){
    if(admin.role!=="owner")return json({ok:false,error:"owner_required"},403);
    const {data,error}=await sb.rpc("kill_marketing_runtime_v1",{p_reason:clean(body.reason,500)||"admin_marketing_kill",p_actor:user.id});
    if(error)return json({ok:false,error:"marketing_kill_failed",detail:error.message},500);
    return json({ok:true,result:data});
  }

  // Deliberately absent: approve, schedule, publish, enable, canary, token write and paid-provider actions.
  return json({ok:false,error:"unknown_or_not_allowed_action"},400);
});
