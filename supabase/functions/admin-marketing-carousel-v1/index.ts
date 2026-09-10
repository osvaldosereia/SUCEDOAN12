import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=1000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));
const idem=(assetId:string,version:number)=>`admin-carousel:${assetId}:v${version}:${crypto.randomUUID()}`.slice(0,80);

function preflightSlide(s:any){
  const spec=s?.render_spec&&typeof s.render_spec==="object"?s.render_spec:{};
  const layers=Array.isArray(spec.layers)?spec.layers:[];
  const image=layers.find((x:any)=>x?.type==="image")||null;
  const crop=image?.crop&&typeof image.crop==="object"?image.crop:{};
  const source=image?.source_ref&&typeof image.source_ref==="object"?image.source_ref:{};
  return {
    id:s.id,slide_no:s.slide_no,title:s.title,generation_mode:s.generation_mode,status:s.status,
    canonical:spec.schema==="marketing.carousel.render.v1",
    schema:spec.schema||null,width:Number(spec.width||0),height:Number(spec.height||0),layer_count:layers.length,
    source:{kind:source.kind||null,media_id:source.media_id||null},
    crop:{fit:crop.fit||"contain",x:Number(crop.x??50),y:Number(crop.y??50),scale:Number(crop.scale??1)},
    ai_used:Boolean(spec?.metadata?.ai_used),external_side_effect:Boolean(spec?.metadata?.external_side_effect)
  };
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json({ok:false,error:"server_config"},500);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return json({ok:false,error:"missing_token"},401);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:u,error:ue}=await sb.auth.getUser(token);
  if(ue||!u?.user?.id)return json({ok:false,error:"invalid_user"},401);
  const user=u.user;
  const {data:admin,error:ae}=await sb.from("admin_users").select("role,is_active").eq("user_id",user.id).maybeSingle();
  if(ae)return json({ok:false,error:"admin_lookup_failed"},500);
  if(!admin?.is_active||!["owner","operator"].includes(admin.role))return json({ok:false,error:"admin_not_authorized"},403);
  let body:Record<string,unknown>={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const action=clean(body.action,40).toLowerCase(),assetId=clean(body.asset_id,80);
  if(!uuid(assetId))return json({ok:false,error:"invalid_asset_id"},400);

  const {data:asset,error:assetError}=await sb.from("marketing_assets").select("id,version,title,media_kind,generation_mode,status").eq("id",assetId).maybeSingle();
  if(assetError)return json({ok:false,error:"asset_lookup_failed",detail:assetError.message},500);
  if(!asset)return json({ok:false,error:"asset_not_found"},404);
  if(asset.media_kind!=="carousel")return json({ok:false,error:"asset_not_carousel"},400);

  if(action==="preflight"){
    const {data,error}=await sb.rpc("marketing_carousel_current_v1",{p_asset_id:assetId});
    if(error)return json({ok:false,error:"carousel_read_failed",detail:error.message},400);
    const slides=(Array.isArray(data)?data:[]).map(preflightSlide);
    const canonical=slides.length>=2&&slides.length<=10&&slides.every((s:any)=>s.canonical&&!s.external_side_effect);
    return json({ok:true,asset:{id:asset.id,version:asset.version,title:asset.title,status:asset.status,generation_mode:asset.generation_mode},preflight:{canonical,slide_count:slides.length,slides},external_side_effect:false});
  }

  if(action==="request_render"){
    const keyIn=clean(body.idempotency_key,80);
    const key=keyIn||idem(assetId,Number(asset.version||1));
    if(key.length<8)return json({ok:false,error:"invalid_idempotency_key"},400);
    const {data,error}=await sb.rpc("request_marketing_carousel_renders_v1",{p_asset_id:assetId,p_idempotency_key:key,p_actor:user.id});
    if(error)return json({ok:false,error:"carousel_render_request_failed",detail:error.message},400);
    if(!data?.ok)return json({ok:false,error:data?.error||"carousel_render_blocked",result:data,external_side_effect:false},409);
    return json({ok:true,result:data,external_side_effect:false});
  }

  return json({ok:false,error:"unknown_or_not_allowed_action"},400);
});
