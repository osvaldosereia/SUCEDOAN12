import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=200)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const fail=(error:string,detail:string,status=400)=>json({ok:false,error,detail,external_side_effect:false},status);

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
  const action=clean(b.action,40)||"overview";

  if(action==="metrics"){
    const days=Number(b.days||30);
    if(![7,30,90].includes(days))return fail("invalid_metric_window","Use 7, 30 ou 90 dias");
    const to=new Date(),from=new Date(to.getTime()-days*86400000);
    const [{data,error},{data:renderData,error:renderError},{data:diagnosticData,error:diagnosticError}]=await Promise.all([
      sb.rpc("marketing_metrics_read_model_v1",{p_from:from.toISOString(),p_to:to.toISOString()}),
      sb.rpc("marketing_render_metrics_read_model_v1",{p_from:from.toISOString(),p_to:to.toISOString()}),
      sb.rpc("marketing_render_diagnostics_read_model_v1",{p_from:from.toISOString(),p_to:to.toISOString(),p_stuck_after_seconds:600,p_limit:25})
    ]);
    if(error||renderError||diagnosticError)return fail("metrics_failed",error?.message||renderError?.message||diagnosticError?.message||"Falha nas métricas",500);
    const raw=(data&&typeof data==="object")?data as Record<string,any>:{};
    const render=(renderData&&typeof renderData==="object")?renderData as Record<string,any>:{};
    const diagnostics=(diagnosticData&&typeof diagnosticData==="object")?diagnosticData as Record<string,any>:{};
    if(render?.external_side_effect!==false)return fail("unsafe_render_metrics","Read-model de render recusado",500);
    if(diagnostics?.external_side_effect!==false||diagnostics?.redaction?.raw_error_exposed!==false||diagnostics?.redaction?.input_spec_exposed!==false||diagnostics?.redaction?.output_spec_exposed!==false||diagnostics?.redaction?.lease_owner_exposed!==false)return fail("unsafe_render_diagnostics","Diagnóstico de render recusado",500);
    const attribution=(raw?.attribution&&typeof raw.attribution==="object")?raw.attribution:{status:"unavailable",touchpoints:{}};
    const metrics={counts:{
      assets_created:Number(raw?.assets?.total||0),
      assets_approved:Number(raw?.assets?.approved||0),
      publication_jobs:Number(raw?.publication_jobs?.total||0),
      scheduled_jobs:Number(raw?.publication_jobs?.scheduled||0),
      review_required:Number(raw?.publication_jobs?.review_required||0),
      actual_cost_cents:Number(raw?.assets?.actual_cost_cents||0),
      estimated_cost_cents:Number(raw?.assets?.estimated_cost_cents||0),
      external_side_effects:Number(raw?.events?.external_side_effects||0),
      attribution_clicks:Number(attribution?.touchpoints?.clicks||0),
      attribution_conversations:Number(attribution?.touchpoints?.conversations||0),
      attribution_orders:Number(attribution?.touchpoints?.orders||0),
      render_jobs:Number(render?.jobs?.total||0),
      render_queued:Number(render?.jobs?.queued||0),
      render_processing:Number(render?.jobs?.processing||0),
      render_rendered:Number(render?.jobs?.rendered||0),
      render_failed:Number(render?.jobs?.failed||0),
      render_review_required:Number(render?.jobs?.review_required||0),
      render_avg_ms:Number(render?.latency_ms?.avg_render||0),
      render_p95_ms:Number(render?.latency_ms?.p95_render||0),
      render_success_rate_percent:Number(render?.quality?.success_rate_percent||0),
      render_expired_leases:Number(diagnostics?.summary?.expired_leases||0),
      render_processing_without_lease:Number(diagnostics?.summary?.processing_without_lease||0),
      render_queued_over_threshold:Number(diagnostics?.summary?.queued_over_threshold||0)
    },by_mode:raw?.assets?.by_mode||{},by_status:raw?.publication_jobs?.by_status||{},by_channel:raw?.publication_jobs?.by_channel||{},render,render_diagnostics:diagnostics,attribution,raw};
    return json({ok:true,days,from:from.toISOString(),to:to.toISOString(),metrics,attribution_mode:clean(attribution?.status,80)||"unavailable",external_side_effect:false});
  }

  if(action==="editorial_plan"){
    const days=Number(b.days||14);
    if(![7,14,30].includes(days))return fail("invalid_editorial_window","Use 7, 14 ou 30 dias");
    const {data,error}=await sb.rpc("marketing_editorial_plan_v1",{p_days:days});
    if(error)return fail("editorial_plan_failed",error.message||"Falha no plano editorial",500);
    if(data?.external_side_effect!==false||data?.mode!=="preview_only")return fail("unsafe_editorial_plan","Plano editorial recusado",500);
    return json({ok:true,plan:data,external_side_effect:false});
  }

  if(action==="tracking_preview"){
    const assetId=clean(b.asset_id,80),channel=clean(b.channel,80),destination=clean(b.destination,1200)||null;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId))return fail("invalid_asset_id","Asset inválido");
    const {data,error}=await sb.rpc("marketing_tracking_link_v1",{p_asset_id:assetId,p_channel:channel,p_destination:destination});
    if(error)return fail("tracking_preview_failed",error.message||"Falha no link de rastreio",500);
    if(data?.ok===false)return json(data,400);
    if(data?.external_side_effect!==false||data?.preview_only!==true)return fail("unsafe_tracking_preview","Preview de rastreio recusado",500);
    return json({ok:true,tracking:data,external_side_effect:false});
  }

  if(action==="learning"){
    const days=Number(b.days||90);
    if(![30,90,180].includes(days))return fail("invalid_learning_window","Use 30, 90 ou 180 dias");
    const to=new Date(),from=new Date(to.getTime()-days*86400000);
    const {data,error}=await sb.rpc("marketing_learning_read_model_v1",{p_from:from.toISOString(),p_to:to.toISOString()});
    if(error)return fail("learning_failed",error.message||"Falha no Learning Engine",500);
    if(data?.external_side_effect!==false||data?.policy?.auto_optimization!==false)return fail("unsafe_learning_model","Learning Engine recusado",500);
    return json({ok:true,days,learning:data,external_side_effect:false});
  }

  if(action==="daily_plan_preview"){
    const {data,error}=await sb.rpc("marketing_daily_plan_preview_v1");
    if(error)return fail("daily_plan_preview_failed",error.message||"Falha no plano diário",500);
    if(data?.external_side_effect!==false||data?.mode!=="preview_only"||data?.automation_active!==false)return fail("unsafe_daily_plan","Plano diário recusado",500);
    return json({ok:true,preview:data,external_side_effect:false});
  }

  if(action==="overview"){
    const [
      {data:assets,error:e1},
      {data:media,error:e2},
      {data:runtime,error:e3},
      {data:campaigns,error:e4},
      {data:templates,error:e5},
      {data:jobs,error:e6},
      {data:renderJobs,error:e7},
      {data:channelAccounts,error:e8},
      {data:metaSnapshot,error:e9}
    ]=await Promise.all([
      sb.from("marketing_assets").select("id,campaign_id,title,media_kind,generation_mode,status,version,template_id,source_refs,edit_spec,render_spec,output_spec,editable,approval_note,review_requested_at,reviewed_at,estimated_cost_cents,actual_cost_cents,updated_at").neq("status","archived").order("updated_at",{ascending:false}).limit(100),
      sb.from("marketing_media_objects").select("id,asset_id,version,role,mime_type,width,height,duration_ms,byte_size,created_at").order("created_at",{ascending:false}).limit(300),
      sb.from("marketing_runtime_config").select("enabled,execution_mode,canary_percent,kill_switch,generation_enabled,deterministic_render_enabled,ai_image_enabled,ai_video_enabled,publishing_enabled,attribution_recording_enabled,whatsapp_status_publish_enabled,instagram_feed_publish_enabled,instagram_story_publish_enabled,instagram_reel_publish_enabled,instagram_carousel_publish_enabled,facebook_post_publish_enabled,facebook_story_publish_enabled,facebook_reel_publish_enabled,pinterest_publish_enabled,google_business_publish_enabled,require_approval,default_timezone,max_daily_publications,max_daily_ai_image_generations,max_daily_ai_video_seconds,max_daily_ai_cost_cents,metadata,updated_at").eq("id",1).maybeSingle(),
      sb.from("marketing_campaigns").select("id,name,objective,status,enabled,execution_mode,canary_percent,kill_switch,content_policy,product_selection,schedule_rule,channel_plan,ai_policy,max_cost_cents,max_publications_per_day,created_at,updated_at").order("updated_at",{ascending:false}).limit(100),
      sb.from("marketing_content_templates").select("id,template_key,version,name,media_kind,status,created_at").eq("status","approved").order("name",{ascending:true}).limit(100),
      sb.from("marketing_publication_jobs").select("id,campaign_id,asset_id,channel,content_type,status,manual_confirmation_required,scheduled_for,estimated_cost_cents,external_ref,last_error,published_at,created_at,updated_at").order("updated_at",{ascending:false}).limit(200),
      sb.from("marketing_render_jobs").select("id,asset_id,render_kind,status,attempt_count,ai_used,estimated_cost_cents,actual_cost_cents,created_at,updated_at,finished_at").order("updated_at",{ascending:false}).limit(200),
      sb.from("marketing_channel_accounts").select("id,channel,provider,display_name,status,capabilities,last_verified_at,token_expires_at").order("channel",{ascending:true}),
      sb.rpc("get_meta_control_plane_snapshot_v1")
    ]);
    if(e1||e2||e3||e4||e5||e6||e7||e8||e9)return fail("overview_failed",e1?.message||e2?.message||e3?.message||e4?.message||e5?.message||e6?.message||e7?.message||e8?.message||e9?.message||"Falha de leitura",500);
    const runtimeSafe=runtime||{};
    const metaRaw=(metaSnapshot&&typeof metaSnapshot==="object")?metaSnapshot as Record<string,any>:{};
    const metaSafe={
      version:clean(metaRaw.version,80)||null,
      policy_registry:metaRaw.policy_registry||{},
      webhook_events_24h:Number(metaRaw.webhook_events_24h||0),
      unresolved_errors:Number(metaRaw.unresolved_errors||0),
      accounts:(Array.isArray(metaRaw.accounts)?metaRaw.accounts:[]).map((a:any)=>({
        channel:clean(a?.channel,80)||null,
        display_name:clean(a?.display_name,160)||null,
        channel_status:clean(a?.channel_status,80)||null,
        provider_state:clean(a?.provider_state,80)||null,
        graph_api_version:clean(a?.graph_api_version,40)||null,
        webhook_state:clean(a?.webhook_state,80)||null,
        readiness_state:clean(a?.readiness_state,80)||null,
        permission_count:Number(a?.permission_count||0),
        granted_permissions:Number(a?.granted_permissions||0),
        blocking_permissions:Number(a?.blocking_permissions||0),
        meta_direct_ready:a?.capabilities?.meta_direct_ready===true,
        meta_direct_outbound_enabled:a?.capabilities?.meta_direct_outbound_enabled===true
      }))
    };
    const safety={
      external_actions_locked:runtimeSafe?.publishing_enabled!==true||runtimeSafe?.kill_switch===true||runtimeSafe?.execution_mode==="off",
      ai_video_generative_allowed:runtimeSafe?.ai_video_enabled===true,
      approval_required:runtimeSafe?.require_approval!==false
    };
    return json({
      ok:true,
      user:{role:admin.role,display_name:admin.display_name},
      campaigns:campaigns||[],
      assets:assets||[],
      media:media||[],
      jobs:jobs||[],
      channel_accounts:channelAccounts||[],
      meta_control_plane:metaSafe,
      templates:templates||[],
      runtime:runtimeSafe,
      safety,
      external_side_effect:false
    });
  }
  return fail("unknown_action","Ação não permitida");
});