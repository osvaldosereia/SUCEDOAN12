import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";
import {ImageMagick,initializeImageMagick,MagickFormat} from "npm:@imagemagick/magick-wasm@0.0.30";
import {clean,num,artSvg,textSlideSvg} from "./marketing-art-v1.mjs";

const wasmBytes=await Deno.readFile(new URL("magick.wasm",import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.30")));
await initializeImageMagick(wasmBytes);

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store, private"}});
const isUuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));
const arr=(v:unknown)=>Array.isArray(v)?v:[];
const ALLOWED_HOSTS=new Set(["ssbesxgaijknwsjbsbcz.supabase.co","raw.githubusercontent.com","donaantonia.com.br","www.donaantonia.com.br"]);
const MAX_SOURCE_BYTES=5*1024*1024;

function bytesBase64(bytes:Uint8Array){let out="";for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(out)}
async function sha256Hex(bytes:Uint8Array){const d=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));return [...d].map(b=>b.toString(16).padStart(2,"0")).join("")}
async function fetchImageData(value:unknown){
  let u:URL;try{u=new URL(clean(value,2000))}catch{throw new Error("invalid_source_url")}
  if(u.protocol!=="https:"||!ALLOWED_HOSTS.has(u.hostname))throw new Error("source_host_not_allowed");
  const res=await fetch(u.toString(),{redirect:"follow"});
  if(!res.ok)throw new Error("source_fetch_failed_"+res.status);
  const declared=Number(res.headers.get("content-length")||0);if(declared>MAX_SOURCE_BYTES)throw new Error("source_too_large");
  const bytes=new Uint8Array(await res.arrayBuffer());if(bytes.length<32||bytes.length>MAX_SOURCE_BYTES)throw new Error("source_size_invalid");
  let mime=clean(res.headers.get("content-type")||"image/webp",120).split(";")[0];if(mime==="image/jpg")mime="image/jpeg";
  if(!["image/webp","image/png","image/jpeg"].includes(mime))throw new Error("source_mime_not_allowed");
  return {bytes,mime};
}
function rasterWebp(svg:string){
  return ImageMagick.read(new TextEncoder().encode(svg),(img):Uint8Array=>img.write(MagickFormat.WebP,(data)=>data));
}
function normalizePng(bytes:Uint8Array){
  return ImageMagick.read(bytes,(img):Uint8Array=>img.write(MagickFormat.Png,(data)=>data));
}
async function renderProduct(p:any,width:number,height:number,headline:string,cta:string){
  const fetched=await fetchImageData(p.image_url),normalized=normalizePng(fetched.bytes),uri=`data:image/png;base64,${bytesBase64(normalized)}`;
  return rasterWebp(artSvg({width,height,headline,cta,product:p,imageDataUri:uri}));
}
async function storePreview(sb:any,userId:string,asset:any,bytes:Uint8Array,role:string,file:string,width:number,height:number,metadata:any){
  const path=`${asset.id}/v${asset.version}/${file}`;
  const {error:up}=await sb.storage.from("marketing-private").upload(path,bytes,{contentType:"image/webp",cacheControl:"3600",upsert:true});
  if(up)throw new Error("storage_upload_failed:"+up.message);
  const sha=await sha256Hex(bytes);
  const {data,error}=await sb.rpc("register_marketing_private_media_v2",{
    p_asset_id:asset.id,p_version:asset.version,p_role:role,p_object_path:path,p_mime_type:"image/webp",
    p_width:width,p_height:height,p_duration_ms:null,p_byte_size:bytes.length,p_sha256:sha,
    p_metadata:{...metadata,bucket_name:"marketing-private",renderer:"magick_wasm",ai_used:false,external_side_effect:false},p_actor:userId
  });
  if(error||!data?.ok)throw new Error("media_register_failed:"+(error?.message||data?.error||"unknown"));
  return {media_id:data.media_id,object_path:path,byte_size:bytes.length,sha256:sha};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceKey)return json({ok:false,error:"server_config"},500);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)return json({ok:false,error:"missing_token"},401);
  const sb=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await sb.auth.getUser(token);if(userError||!userData?.user?.id)return json({ok:false,error:"invalid_user"},401);
  const user=userData.user;
  const {data:admin,error:adminError}=await sb.from("admin_users").select("role,is_active").eq("user_id",user.id).maybeSingle();
  if(adminError)return json({ok:false,error:"admin_lookup_failed"},500);
  if(!admin?.is_active||!["owner","operator"].includes(admin.role))return json({ok:false,error:"admin_not_authorized"},403);
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const action=clean(body.action||"signed_url",40).toLowerCase();

  if(action==="signed_url"){
    const mediaId=clean(body.media_id,80);if(!isUuid(mediaId))return json({ok:false,error:"invalid_media_id"},400);
    const requested=Number(body.expires_in||300),expiresIn=Math.max(30,Math.min(900,Number.isFinite(requested)?Math.floor(requested):300));
    const {data:rows,error:resolveError}=await sb.rpc("marketing_media_signable_v1",{p_media_id:mediaId});
    if(resolveError)return json({ok:false,error:"media_resolve_failed",detail:resolveError.message},500);
    const media=Array.isArray(rows)?rows[0]:null;if(!media)return json({ok:false,error:"media_not_signable"},404);
    if(media.bucket_name!=="marketing-private")return json({ok:false,error:"invalid_media_bucket"},409);
    const {data:signed,error:signError}=await sb.storage.from(media.bucket_name).createSignedUrl(media.object_path,expiresIn);
    if(signError||!signed?.signedUrl)return json({ok:false,error:"signed_url_failed",detail:signError?.message||"missing_signed_url"},500);
    await sb.from("marketing_events").insert({entity_type:"media_object",entity_id:media.media_id,event_type:"admin_preview_signed",actor_id:user.id,data:{asset_id:media.asset_id,version:media.version,role:media.role,expires_in:expiresIn},external_side_effect:false});
    return json({ok:true,media:{id:media.media_id,asset_id:media.asset_id,version:media.version,role:media.role,mime_type:media.mime_type,width:media.width,height:media.height,duration_ms:media.duration_ms,byte_size:media.byte_size},signed_url:signed.signedUrl,expires_in:expiresIn,external_side_effect:false});
  }

  if(action==="queue_light_video"){
    const assetId=clean(body.asset_id,80);if(!isUuid(assetId))return json({ok:false,error:"invalid_asset_id"},400);
    const {data,error}=await sb.rpc("queue_marketing_light_video_preview_v1",{p_asset_id:assetId,p_actor:user.id});
    if(error)return json({ok:false,error:"light_video_queue_failed",detail:error.message},400);
    if(!data?.ok)return json({ok:false,error:data?.error||"light_video_queue_blocked",result:data,external_side_effect:false},409);
    return json({ok:true,result:data,external_side_effect:false});
  }

  if(action==="render_preview"){
    const assetId=clean(body.asset_id,80);if(!isUuid(assetId))return json({ok:false,error:"invalid_asset_id"},400);
    const {data:runtime,error:runtimeError}=await sb.from("marketing_runtime_config").select("metadata").eq("id",1).maybeSingle();
    if(runtimeError||runtime?.metadata?.draft_preview_render_enabled!==true)return json({ok:false,error:"preview_render_disabled"},409);
    const {data:asset,error:assetError}=await sb.from("marketing_assets")
      .select("id,version,title,media_kind,generation_mode,status,edit_spec,render_spec").eq("id",assetId).maybeSingle();
    if(assetError||!asset)return json({ok:false,error:"asset_not_found"},404);
    if(asset.generation_mode!=="no_ai"||!["draft","failed","rendered"].includes(asset.status))return json({ok:false,error:"asset_not_preview_renderable"},409);
    const edit=asset.edit_spec||{},render=asset.render_spec||{},headline=clean(edit.headline||asset.title,160),cta=clean(edit.cta||"Peça na Dona Antônia",120),outputs:any[]=[];
    try{
      if(asset.media_kind==="image"){
        const p=edit.product||arr(edit.products)[0];if(!p?.image_url)throw new Error("product_image_missing");
        const width=Math.max(320,Math.min(2500,num(render.width,1080))),height=Math.max(320,Math.min(2500,num(render.height,1080)));
        const bytes=await renderProduct(p,width,height,headline,cta);
        outputs.push(await storePreview(sb,user.id,asset,bytes,"preview","preview.webp",width,height,{content_role:edit.content_role||"image"}));
      }else if(asset.media_kind==="carousel"){
        const plan=arr(edit.slide_plan).slice(0,5),width=1080,height=1350;let n=0;
        for(const slide of plan){n++;let bytes:Uint8Array;if(slide?.type==="product"&&slide?.product?.image_url)bytes=await renderProduct(slide.product,width,height,"",cta);else bytes=rasterWebp(textSlideSvg(width,height,clean(slide?.headline||headline,160),cta));
          outputs.push(await storePreview(sb,user.id,asset,bytes,"preview",`slide-${String(n).padStart(2,"0")}.webp`,width,height,{content_role:"instagram_carousel",slide_no:n,slide_type:clean(slide?.type||"text",40)}));
        }
      }else if(asset.media_kind==="video"){
        const p=arr(edit.products)[0]||edit.product;if(!p?.image_url)throw new Error("video_product_image_missing");
        const bytes=await renderProduct(p,1080,1920,headline,cta);
        const poster=await storePreview(sb,user.id,asset,bytes,"poster","poster.webp",1080,1920,{content_role:"reel_light_10s",duration_ms:10000,motion:arr(edit.motion),timeline:render.timeline||[],generative_video:false});
        outputs.push(poster);
        await sb.from("marketing_assets").update({output_spec:{preview_ready:true,mp4_ready:false,poster_media_id:poster.media_id,motion_manifest:{schema:"marketing.light_motion.v1",duration_ms:10000,motion:arr(edit.motion),timeline:render.timeline||[],codec_target:"h264"},renderer:"magick_wasm_poster",ai_used:false},updated_at:new Date().toISOString()}).eq("id",asset.id);
      }else return json({ok:false,error:"unsupported_media_kind"},400);
      await sb.from("marketing_events").insert({entity_type:"asset",entity_id:asset.id,event_type:"preview_render_completed",actor_id:user.id,data:{media_kind:asset.media_kind,outputs:outputs.map(x=>({media_id:x.media_id,byte_size:x.byte_size})),renderer:"magick_wasm",ai_used:false},external_side_effect:false});
      return json({ok:true,asset_id:asset.id,media_kind:asset.media_kind,outputs,ai_used:false,external_publish:false,mp4_ready:asset.media_kind==="video"?false:null});
    }catch(error){
      await sb.from("marketing_events").insert({entity_type:"asset",entity_id:asset.id,event_type:"preview_render_failed",actor_id:user.id,data:{renderer:"magick_wasm",error:clean((error as Error)?.message,300)},external_side_effect:false});
      return json({ok:false,error:"preview_render_failed",detail:clean((error as Error)?.message,500)},500);
    }
  }
  return json({ok:false,error:"unknown_or_not_allowed_action"},400);
});