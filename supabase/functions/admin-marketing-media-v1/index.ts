import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store, private"}});
const clean=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);
const isUuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);

  const url=Deno.env.get("SUPABASE_URL");
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceKey)return json({ok:false,error:"server_config"},500);

  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return json({ok:false,error:"missing_token"},401);

  const sb=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await sb.auth.getUser(token);
  if(userError||!userData?.user?.id)return json({ok:false,error:"invalid_user"},401);
  const user=userData.user;

  const {data:admin,error:adminError}=await sb.from("admin_users").select("role,is_active").eq("user_id",user.id).maybeSingle();
  if(adminError)return json({ok:false,error:"admin_lookup_failed"},500);
  if(!admin?.is_active||!["owner","operator"].includes(admin.role))return json({ok:false,error:"admin_not_authorized"},403);

  let body:Record<string,unknown>={};
  try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const action=clean(body.action||"signed_url",40).toLowerCase();
  if(action!=="signed_url")return json({ok:false,error:"unknown_or_not_allowed_action"},400);

  const mediaId=clean(body.media_id,80);
  if(!isUuid(mediaId))return json({ok:false,error:"invalid_media_id"},400);
  const requested=Number(body.expires_in||300);
  const expiresIn=Math.max(30,Math.min(900,Number.isFinite(requested)?Math.floor(requested):300));

  const {data:rows,error:resolveError}=await sb.rpc("marketing_media_signable_v1",{p_media_id:mediaId});
  if(resolveError)return json({ok:false,error:"media_resolve_failed",detail:resolveError.message},500);
  const media=Array.isArray(rows)?rows[0]:null;
  if(!media)return json({ok:false,error:"media_not_signable"},404);
  if(media.bucket_name!=="marketing-private")return json({ok:false,error:"invalid_media_bucket"},409);

  const {data:signed,error:signError}=await sb.storage.from(media.bucket_name).createSignedUrl(media.object_path,expiresIn);
  if(signError||!signed?.signedUrl)return json({ok:false,error:"signed_url_failed",detail:signError?.message||"missing_signed_url"},500);

  await sb.from("marketing_events").insert({
    entity_type:"media_object",
    entity_id:media.media_id,
    event_type:"admin_preview_signed",
    actor_id:user.id,
    data:{asset_id:media.asset_id,version:media.version,role:media.role,expires_in:expiresIn},
    external_side_effect:false
  });

  return json({
    ok:true,
    media:{id:media.media_id,asset_id:media.asset_id,version:media.version,role:media.role,mime_type:media.mime_type,width:media.width,height:media.height,duration_ms:media.duration_ms,byte_size:media.byte_size},
    signed_url:signed.signedUrl,
    expires_in:expiresIn,
    external_side_effect:false
  });
});
