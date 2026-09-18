import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const CORS={"Access-Control-Allow-Origin":"https://donaantonia.com.br","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,max=1000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");
const validUuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));
const secureReady=()=>Boolean(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")&&Deno.env.get("META_APP_SECRET")&&Deno.env.get("META_WEBHOOK_VERIFY_TOKEN"));
async function sha256(bytes:Uint8Array){const hash=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("")}
function parseButtons(input:unknown){const rows=Array.isArray(input)?input.slice(0,3):[];if(Array.isArray(input)&&input.length>3)throw new Error("max_3_buttons");return rows.map((x:any,i)=>{if(x?.url||x?.link||String(x?.type||"").toLowerCase().includes("url"))throw new Error("url_buttons_not_allowed");const id=clean(x?.id||`button_${i+1}`,256),title=clean(x?.title,20);if(!id||!title)throw new Error("invalid_button");return {id,title,type:"reply"}})}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";if(!url||!service)return json({ok:false,error:"server_config"},500);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)return json({ok:false,error:"missing_token"},401);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const userResult=await sb.auth.getUser(token);if(userResult.error||!userResult.data?.user?.id)return json({ok:false,error:"invalid_user"},401);
  const user=userResult.data.user;const adminResult=await sb.from("admin_users").select("role,is_active,display_name").eq("user_id",user.id).maybeSingle();if(adminResult.error)return json({ok:false,error:"admin_lookup_failed"},500);if(!adminResult.data?.is_active)return json({ok:false,error:"admin_not_authorized"},403);
  const role=adminResult.data.role,isOwner=role==="owner",canWrite=isOwner||role==="operator";
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}const action=clean(body?.action||"dashboard",80).toLowerCase();

  if(action==="dashboard"){
    const [cfgR,accountR,eventR,stateR,basketR]=await Promise.all([
      sb.from("whatsapp_direct_config").select("*").eq("id",1).maybeSingle(),
      sb.from("whatsapp_accounts").select("id,slug,display_name,phone_e164,phone_number_id,waba_id,is_active").eq("is_active",true).order("created_at",{ascending:true}).limit(1).maybeSingle(),
      sb.from("whatsapp_direct_events").select("id,event_type,direction,payload,created_at").order("created_at",{ascending:false}).limit(30),
      sb.from("whatsapp_direct_state").select("state"),
      sb.from("basket_templates").select("id",{count:"exact",head:true}).eq("is_active",true)
    ]);
    if(cfgR.error||accountR.error||eventR.error||stateR.error)return json({ok:false,error:"dashboard_failed"},500);
    const counts:Record<string,number>={};for(const x of stateR.data||[])counts[x.state]=(counts[x.state]||0)+1;
    const callback=`${url.replace(/\/$/,"")}/functions/v1/whatsapp-meta-direct-v1`;
    return json({ok:true,user:{role,display_name:adminResult.data.display_name||null},config:cfgR.data||null,account:accountR.data||null,readiness:{ready:secureReady(),access:Boolean(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")),app_secret:Boolean(Deno.env.get("META_APP_SECRET")),verify_token:Boolean(Deno.env.get("META_WEBHOOK_VERIFY_TOKEN")),graph_version:true,graph_version_value:Deno.env.get("META_GRAPH_VERSION")||"v26.0",callback_url:callback},state_counts:counts,active_baskets:basketR.count||0,recent_events:eventR.data||[]});
  }
  if(action==="templates"){const {data,error}=await sb.from("whatsapp_direct_templates").select("*").order("template_key",{ascending:true});if(error)return json({ok:false,error:"templates_failed",detail:error.message},500);return json({ok:true,templates:data||[]})}
  if(action==="basket_assets"){
    const [basketR,assetR]=await Promise.all([sb.from("basket_templates").select("id,name,base_price,image_url,sort_order,is_active,basket_template_items(id,quantity,sort_order,product:products(id,name,brand,packaging))").eq("is_active",true).order("sort_order",{ascending:true}).order("name",{ascending:true}),sb.from("whatsapp_basket_media_assets").select("*")]);
    if(basketR.error||assetR.error)return json({ok:false,error:"basket_assets_failed",detail:basketR.error?.message||assetR.error?.message},500);const assets=new Map((assetR.data||[]).map((x:any)=>[x.basket_id,x]));return json({ok:true,baskets:(basketR.data||[]).map((b:any)=>({...b,asset:assets.get(b.id)||null}))});
  }
  if(!canWrite)return json({ok:false,error:"read_only"},403);
  if(action==="save_config"){
    const current=await sb.from("whatsapp_direct_config").select("*").eq("id",1).maybeSingle();if(current.error||!current.data)return json({ok:false,error:"config_not_found"},404);const patch:any={updated_at:new Date().toISOString()};
    if(body.storefront_url!==undefined){const v=clean(body.storefront_url,1000);if(!/^https:\/\/donaantonia\.com\.br\//i.test(v))return json({ok:false,error:"invalid_storefront_url"},400);patch.storefront_url=v}
    if(body.public_phone!==undefined){const d=digits(body.public_phone);if(d&&![10,11,12,13].includes(d.length))return json({ok:false,error:"invalid_public_phone"},400);patch.public_phone=clean(body.public_phone,40)||null}
    for(const [key,max] of [["greeting_text",500],["catalog_text",2000],["address_request_text",3000],["address_audio_url",1200]] as const)if(body[key]!==undefined)patch[key]=clean(body[key],max)||null;
    if(typeof body.require_location==="boolean")patch.require_location=body.require_location;
    if(body.enabled!==undefined||body.release_mode!==undefined){if(!isOwner)return json({ok:false,error:"owner_required"},403);const nextEnabled=body.enabled===undefined?current.data.enabled:body.enabled===true;const mode=body.release_mode===undefined?current.data.release_mode:clean(body.release_mode,20);if(!["off","homologation","live"].includes(mode))return json({ok:false,error:"invalid_release_mode"},400);if((nextEnabled||mode!=="off")&&!secureReady())return json({ok:false,error:"meta_credentials_missing"},409);patch.enabled=nextEnabled;patch.release_mode=mode}
    const {data,error}=await sb.from("whatsapp_direct_config").update(patch).eq("id",1).select("*").single();if(error)return json({ok:false,error:"config_save_failed",detail:error.message},400);return json({ok:true,config:data});
  }
  if(action==="save_template"){
    const key=clean(body.template_key,120),purpose=clean(body.purpose,500),bodyText=clean(body.body_text,4096);if(!key||!purpose||!bodyText)return json({ok:false,error:"template_fields_required"},400);let buttons:any[]=[];try{buttons=parseButtons(body.buttons)}catch(error){return json({ok:false,error:clean((error as Error).message,100)},400)}
    const mediaKind=clean(body.media_kind||"none",20);if(!["none","image"].includes(mediaKind))return json({ok:false,error:"invalid_media_kind"},400);const mediaUrl=clean(body.media_url,1200)||null;if(mediaKind==="image"&&mediaUrl&&!/^https:\/\//i.test(mediaUrl))return json({ok:false,error:"invalid_media_url"},400);
    const row={template_key:key,meta_template_name:clean(body.meta_template_name,512)||null,category:"UTILITY",language_code:clean(body.language_code||"pt_BR",20),purpose,body_text:bodyText,media_kind:mediaKind,media_url:mediaUrl,buttons,enabled:body.enabled===true,meta_status:clean(body.meta_status||"not_configured",40),updated_at:new Date().toISOString()};const {data,error}=await sb.from("whatsapp_direct_templates").upsert(row,{onConflict:"template_key"}).select("*").single();if(error)return json({ok:false,error:"template_save_failed",detail:error.message},400);return json({ok:true,template:data});
  }
  if(action==="sync_meta_templates"){
    const access=Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"",version=Deno.env.get("META_GRAPH_VERSION")||"v26.0";if(!access)return json({ok:false,error:"meta_credentials_missing"},409);const account=await sb.from("whatsapp_accounts").select("waba_id").eq("is_active",true).limit(1).maybeSingle();if(account.error||!account.data?.waba_id)return json({ok:false,error:"waba_missing"},409);
    const endpoint=`https://graph.facebook.com/${version}/${encodeURIComponent(account.data.waba_id)}/message_templates?fields=name,status,category,language,components&limit=100`;const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${access}`}});const payload=await response.json().catch(()=>({}));if(!response.ok)return json({ok:false,error:"meta_templates_failed",detail:clean(payload?.error?.message||"Meta error",500)},400);const templates=Array.isArray(payload?.data)?payload.data:[];for(const t of templates){const name=clean(t?.name,512);if(!name)continue;await sb.from("whatsapp_direct_templates").update({meta_status:clean(t?.status,40)||"unknown",updated_at:new Date().toISOString()}).eq("meta_template_name",name)}return json({ok:true,templates:templates.map((t:any)=>({name:t.name,status:t.status,category:t.category,language:t.language,components:t.components}))});
  }
  if(action==="save_basket_asset"){
    const basketId=clean(body.basket_id,80);if(!validUuid(basketId))return json({ok:false,error:"invalid_basket_id"},400);const dataUrl=String(body.data_url||"");const match=dataUrl.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);if(!match)return json({ok:false,error:"invalid_image_data"},400);const binary=atob(match[2]);if(binary.length>5*1024*1024)return json({ok:false,error:"image_too_large"},413);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));const hash=await sha256(bytes),ext=match[1]==="jpeg"?"jpg":"png",bucket="whatsapp-public-assets",path=`baskets/${basketId}/${hash.slice(0,20)}.${ext}`;
    const bucketResult=await sb.storage.getBucket(bucket);if(bucketResult.error){const created=await sb.storage.createBucket(bucket,{public:true,fileSizeLimit:5242880,allowedMimeTypes:["image/png","image/jpeg"]});if(created.error)return json({ok:false,error:"bucket_create_failed",detail:created.error.message},500)}
    const upload=await sb.storage.from(bucket).upload(path,bytes,{contentType:match[1]==="jpeg"?"image/jpeg":"image/png",upsert:true});if(upload.error)return json({ok:false,error:"asset_upload_failed",detail:upload.error.message},500);const publicUrl=sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;const {data,error}=await sb.from("whatsapp_basket_media_assets").upsert({basket_id:basketId,vertical_image_url:publicUrl,source_hash:hash,width:1080,height:1920,status:"ready",updated_at:new Date().toISOString()},{onConflict:"basket_id"}).select("*").single();if(error)return json({ok:false,error:"asset_record_failed",detail:error.message},500);return json({ok:true,asset:data});
  }
  return json({ok:false,error:"unknown_action"},400);
});