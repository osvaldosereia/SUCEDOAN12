import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=3000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const arr=(v:unknown)=>Array.isArray(v)?v:[];
const httpsUrl=(v:unknown)=>{try{const u=new URL(String(v??""));return u.protocol==="https:"?u.toString():null}catch{return null}};
const fail=(error:string,detail:string,status=400)=>json({ok:false,error,detail,dry_run:true,external_side_effect:false},status);
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return fail("method_not_allowed","POST obrigatório",405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return fail("server_config","Supabase indisponível",500);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)return fail("missing_token","Faça login",401);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const {data:u,error:ue}=await sb.auth.getUser(token);if(ue||!u?.user?.id)return fail("invalid_user","Sessão inválida",401);
  const {data:admin}=await sb.from("admin_users").select("role,is_active").eq("user_id",u.user.id).maybeSingle();if(!admin?.is_active||!["owner","operator"].includes(admin.role))return fail("admin_not_authorized","Sem permissão",403);
  let b:Record<string,unknown>={};try{b=await req.json()}catch{return fail("invalid_json","JSON inválido")};
  const channel=clean(b.channel,40),media=arr(b.media).slice(0,10).map((m:any)=>({url:httpsUrl(m?.url),mime_type:clean(m?.mime_type,80),alt_text:clean(m?.alt_text,500)}));
  if(media.some((m:any)=>!m.url))return fail("https_media_required","Toda mídia precisa usar URL HTTPS");
  const title=clean(b.title,100),caption=clean(b.caption,5000),link=httpsUrl(b.link),scheduled=clean(b.scheduled_for,80)||null;
  const source={verified_at:"2026-09-10",network_call:false,credentials_used:false};
  if(channel==="pinterest_pin"){
    const board=clean(b.board_id,120);if(!board)return fail("pinterest_board_required","board_id é obrigatório para o preview");if(media.length!==1)return fail("pinterest_single_media","Preview V1 aceita uma mídia por Pin");const video=/video\//i.test(media[0]?.mime_type||"");
    return json({ok:true,channel,provider:"pinterest",method:"POST",endpoint:"https://api.pinterest.com/v5/pins",required_scopes:["pins:write"],request:{body:{board_id:board,title,description:caption,link:link||undefined,media_source:video?{source_type:"video_id",media_id:"DRY_RUN_MEDIA_ID",cover_image_url:media[0].url}:{source_type:"image_url",url:media[0].url}}},source:{...source,documentation:"Pinterest API v5 / Create Pin; Sandbox list reviewed 2026-09-08"},dry_run:true,external_side_effect:false});
  }
  if(channel==="google_business_post"){
    const parent=clean(b.parent,240);if(!/^accounts\/[^/]+\/locations\/[^/]+$/.test(parent))return fail("google_parent_required","Use accounts/{account}/locations/{location}");if(media.length>1)return fail("google_single_media_only","Preview V1 limita Local Post a uma mídia");
    const body:any={languageCode:clean(b.language_code,20)||"pt-BR",summary:caption||title,topicType:clean(b.topic_type,20)||"STANDARD"};if(media[0]?.url)body.media=[{mediaFormat:/video\//i.test(media[0].mime_type)?"VIDEO":"PHOTO",sourceUrl:media[0].url}];if(link)body.callToAction={actionType:"LEARN_MORE",url:link};if(scheduled)body.scheduledTime=scheduled;
    return json({ok:true,channel,provider:"google_business_profile",method:"POST",endpoint:`https://mybusiness.googleapis.com/v4/${parent}/localPosts`,required_scopes:["https://www.googleapis.com/auth/business.manage"],request:{body},source:{...source,documentation:"Google Business Profile accounts.locations.localPosts.create; reviewed 2026-09-10"},dry_run:true,external_side_effect:false});
  }
  if(channel==="whatsapp_status"){
    if(media.length!==1)return fail("single_media_required","Status exige uma mídia no preview V1");return json({ok:true,channel,provider:"meta_whatsapp",publication_path:"manual_confirm",request:null,notes:["Status continua manual_confirm; nenhuma publicação automática é executada."],source,dry_run:true,external_side_effect:false});
  }
  if(!["instagram_story","facebook_story","instagram_carousel"].includes(channel))return fail("unsupported_channel","Canal não suportado");
  const account=clean(b.account_id,120);if(!account)return fail("meta_account_required","account_id é obrigatório para o preview");if(channel==="instagram_carousel"&&(media.length<2||media.length>10))return fail("instagram_carousel_media_count","Carrossel exige 2–10 mídias");if(channel!=="instagram_carousel"&&media.length!==1)return fail("single_media_required","Story exige uma mídia no preview V1");
  return json({ok:true,channel,provider:"meta",publication_path:"official_api_planned",request_preview:{account_id:account,container_type:channel==="instagram_carousel"?"CAROUSEL":"STORIES",children:media.map((m:any)=>({media_url:m.url,mime_type:m.mime_type})),caption},notes:["Estrutura validada localmente; token, versão Graph e publish ficam para homologação explícita."],source,dry_run:true,external_side_effect:false});
});
