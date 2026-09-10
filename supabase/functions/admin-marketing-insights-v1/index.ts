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
    const {data,error}=await sb.rpc("marketing_metrics_read_model_v1",{p_from:from.toISOString(),p_to:to.toISOString()});
    if(error)return fail("metrics_failed",error.message,500);
    return json({ok:true,days,from:from.toISOString(),to:to.toISOString(),metrics:data||{},attribution_mode:"foundation_only",external_side_effect:false});
  }
  if(action==="overview"){
    const [{data:assets,error:e1},{data:media,error:e2},{data:runtime,error:e3}]=await Promise.all([
      sb.from("marketing_assets").select("id,title,media_kind,generation_mode,status,version,updated_at").neq("status","archived").order("updated_at",{ascending:false}).limit(100),
      sb.from("marketing_media_objects").select("id,asset_id,version,role,mime_type,width,height,duration_ms,byte_size,created_at").order("created_at",{ascending:false}).limit(300),
      sb.from("marketing_runtime_config").select("enabled,execution_mode,canary_percent,kill_switch,generation_enabled,deterministic_render_enabled,ai_image_enabled,ai_video_enabled,publishing_enabled,whatsapp_status_publish_enabled,instagram_story_publish_enabled,facebook_story_publish_enabled,instagram_carousel_publish_enabled,pinterest_publish_enabled,google_business_publish_enabled").eq("id",1).maybeSingle()
    ]);
    if(e1||e2||e3)return fail("overview_failed",e1?.message||e2?.message||e3?.message||"Falha de leitura",500);
    return json({ok:true,user:{role:admin.role,display_name:admin.display_name},assets:assets||[],media:media||[],runtime:runtime||{},external_side_effect:false});
  }
  return fail("unknown_action","Ação não permitida");
});
