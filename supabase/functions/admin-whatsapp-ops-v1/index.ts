import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {validUuid,serviceWindowState,normalizeProductQuery,normalizeOutboundText,normalizeIdempotencyKey} from "../_shared/admin-attendance-domain-v1.mjs";
import {findProviderMediaDescriptor,isAllowedProviderMediaUrl,isAllowedAttendanceMime,normalizedAttendanceMime,safeAttendanceFilename,readBodyLimited} from "../_shared/attendance-media-v1.mjs";
import {sendTextViaMeta,MetaTransportError} from "../_shared/whatsapp-meta-transport-v1.mjs";
import {fetchMetaMediaInfo,fetchMetaMediaResponse,MetaMediaError} from "../_shared/whatsapp-meta-media-v1.mjs";
import {sendAttendanceMediaViaMeta} from "../_shared/admin-attendance-media-send-v1.mjs";
import {listAttendanceLibrary,prepareAttendanceLibraryUpload,completeAttendanceLibraryUpload,signAttendanceLibraryPreview,updateAttendanceLibraryItem,deactivateAttendanceLibraryItem} from "../_shared/admin-attendance-library-v1.mjs";
import {sendAttendanceLibraryItemViaMeta} from "../_shared/admin-attendance-library-send-v1.mjs";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const META_WHATSAPP_ACCESS_TOKEN=(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"").trim();
const META_WHATSAPP_GRAPH_VERSION=(Deno.env.get("META_WHATSAPP_GRAPH_VERSION")||"").trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const READ_ACTIONS=new Set(["accounts","queue","conversation","context","products","media","labels","conversation_labels","quick_replies","library_list","library_preview"]);
const SAFE_POST_ACTIONS=new Set(["mark_read","follow_up","issue_catalog","marketing_opt_out","label_save","label_deactivate","conversation_labels_set","quick_reply_save","quick_reply_deactivate","send_text","send_media","library_upload_prepare","library_upload_complete","library_update","library_deactivate","library_send"]);
const MEDIA_BUCKET="attendance-media-v1";
const MEDIA_RETENTION_DAYS=30;
const MEDIA_SIGNED_URL_SECONDS=600;
const MEDIA_MAX_BYTES=20*1024*1024;

const clean=(v:unknown,max=200)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const num=(v:unknown,fallback:number,min:number,max:number)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.trunc(n))):fallback};
const isoOrNull=(v:unknown)=>{const s=clean(v,50);if(!s)return null;const t=Date.parse(s);return Number.isFinite(t)?new Date(t).toISOString():null};
const channelKeyFromPhone=(value:unknown)=>{const d=String(value??"").replace(/\D+/g,"");if(d.endsWith("0975"))return "0975";if(d.endsWith("1018"))return "1018";return null};
const metaConfigReady=()=>Boolean(META_WHATSAPP_ACCESS_TOKEN&&/^v\d+\.\d+$/.test(META_WHATSAPP_GRAPH_VERSION));
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
  "Vary":"Origin",
  "Access-Control-Allow-Headers":"content-type,authorization,apikey",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS"
}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false as const,status:401,error:"admin_auth_required"};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid"};
  const row=await db.from("admin_users").select("user_id,role,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed"};
  if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized"};
  return {ok:true as const,status:200,user_id:user.data.user.id,role:row.data.role||"viewer"};
}

async function productSearch(q:string,limit:number){
  const fields="id,name,gtin,image_url,image_ai_url,price,is_offer,offer_price,is_active";
  const nameResult=await db.from("products").select(fields).eq("is_active",true).ilike("name",`%${q}%`).order("name").limit(limit);
  if(nameResult.error)throw nameResult.error;
  let rows=[...(nameResult.data||[])];
  if(/^\d{2,14}$/.test(q)&&rows.length<limit){
    const eanResult=await db.from("products").select(fields).eq("is_active",true).eq("gtin",q).limit(limit);
    if(eanResult.error)throw eanResult.error;
    const seen=new Set(rows.map((x:any)=>String(x.id)));
    for(const item of eanResult.data||[])if(!seen.has(String(item.id))){rows.push(item);seen.add(String(item.id))}
  }
  rows=rows.slice(0,limit);
  const ids=rows.map((x:any)=>x.id).filter(Boolean);
  const stock=new Map<string,number>();
  if(ids.length){
    const sr=await db.from("ops2_loose_sellable_stock_v1").select("product_id,effective_sellable_stock").in("product_id",ids);
    if(sr.error)throw sr.error;
    for(const x of sr.data||[])stock.set(String(x.product_id),Math.max(0,Number(x.effective_sellable_stock||0)));
  }
  return rows.map((p:any)=>({
    id:p.id,name:p.name||"",gtin:p.gtin||null,image_url:p.image_ai_url||p.image_url||null,
    sale_price:Number(p.price||0),sellable_stock:stock.get(String(p.id))??0,
    offer:p.is_offer===true&&p.offer_price!=null?{active:true,price:Number(p.offer_price)}:null
  }));
}

async function attendanceSendCapability(accountId:string|null,windowOpen:boolean){
  if(!accountId||!windowOpen)return {enabled:false,reason:windowOpen?"account_unavailable":"service_window_closed",provider:null};
  const runtime=await db.from("whatsapp_channel_runtime_v1").select("send_enabled,human_send_enabled,homologated_at,outbound_provider").eq("whatsapp_account_id",accountId).maybeSingle();
  if(runtime.error)throw runtime.error;
  const provider=clean(runtime.data?.outbound_provider,20)||null;
  const gated=runtime.data?.send_enabled===true&&runtime.data?.human_send_enabled===true&&Boolean(runtime.data?.homologated_at);
  if(!gated)return {enabled:false,reason:"human_send_not_homologated",provider};
  if(provider==="papoai")return {enabled:true,reason:null,provider};
  if(provider!=="meta")return {enabled:false,reason:"outbound_provider_unavailable",provider};
  if(!metaConfigReady())return {enabled:false,reason:"meta_transport_not_configured",provider};
  const account=await db.from("whatsapp_accounts").select("phone_number_id,is_active").eq("id",accountId).eq("is_active",true).maybeSingle();
  if(account.error)throw account.error;
  if(!/^\d{5,30}$/.test(String(account.data?.phone_number_id||"")))return {enabled:false,reason:"meta_transport_not_configured",provider};
  return {enabled:true,reason:null,provider};
}

async function attendanceProviderUrl(channel:string|null){
  if(!channel)return null;
  const r=await db.rpc("ops2_papoai_attendance_provider_url_v1",{p_channel:channel});
  if(r.error)throw r.error;
  return clean(r.data,2048)||null;
}

async function markClaimFailed(claim:any,errorCode:string){
  const now=new Date().toISOString();
  const code=clean(errorCode,180)||"transport_error";
  const updated=await db.from("whatsapp_outbox_v1").update({status:"failed",last_error:code,updated_at:now}).eq("id",claim?.outbox_id).eq("status","claimed");
  if(updated.error)throw updated.error;
}

async function markMetaUncertain(claim:any,errorCode:string){
  const now=new Date().toISOString();
  const code=`meta_send_uncertain:${clean(errorCode,120)||"unknown"}`;
  const updated=await db.from("whatsapp_outbox_v1").update({last_error:code,updated_at:now}).eq("id",claim?.outbox_id).eq("status","claimed");
  if(updated.error)throw updated.error;
  return {ok:false,error:"meta_send_uncertain",uncertain:true,retryable:false,outbox_id:claim?.outbox_id};
}

async function dispatchPapoAi(claim:any){
  const channel=channelKeyFromPhone(claim.account_phone_e164);
  const webhookUrl=await attendanceProviderUrl(channel);
  if(!channel||!webhookUrl){await markClaimFailed(claim,"transport_config_missing");return {ok:false,error:"transport_config_missing",provider:"papoai"};}
  try{
    const response=await fetch(webhookUrl,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        phone_e164:claim.to_phone_e164,
        message_text:claim.text,
        event_id:claim.idempotency_key,
        conversation_id:claim.conversation_id,
        source:"vitrine_admin_attendance"
      }),
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)throw new Error(`papoai_http_${response.status}`);
    const acceptedAt=new Date().toISOString();
    const updated=await db.from("whatsapp_outbox_v1").update({status:"sent",sent_at:acceptedAt,last_error:null,updated_at:acceptedAt}).eq("id",claim.outbox_id).eq("status","claimed");
    if(updated.error)throw updated.error;
    return {ok:true,status:"accepted",outbox_status:"sent",channel,provider:"papoai"};
  }catch(error){
    await markClaimFailed(claim,clean(error instanceof Error?error.message:error,180)||"papoai_transport_failed");
    return {ok:false,error:"papoai_transport_failed",provider:"papoai"};
  }
}

async function dispatchMeta(claim:any){
  if(!metaConfigReady()||!/^\d{5,30}$/.test(String(claim?.phone_number_id||""))){
    await markClaimFailed(claim,"meta_transport_not_configured");
    return {ok:false,error:"meta_transport_not_configured",provider:"meta"};
  }
  try{
    const result=await sendTextViaMeta({
      accessToken:META_WHATSAPP_ACCESS_TOKEN,
      phoneNumberId:claim.phone_number_id,
      toE164:claim.to_phone_e164,
      text:claim.text,
      graphVersion:META_WHATSAPP_GRAPH_VERSION,
      timeoutMs:15000
    });
    const acceptedAt=new Date().toISOString();
    const accepted=await db.rpc("ops2_admin_attendance_accept_meta_outbound_v1",{
      p_outbox_id:claim.outbox_id,
      p_provider_message_id:result.providerMessageId,
      p_accepted_at:acceptedAt
    });
    if(accepted.error||accepted.data?.ok!==true){
      return await markMetaUncertain(claim,accepted.error?.message||accepted.data?.error||"canonical_persist_failed");
    }
    return {
      ok:true,status:"accepted",outbox_status:"sent",provider:"meta",
      provider_message_id:result.providerMessageId,message_id:accepted.data?.message_id||null,
      status_current:accepted.data?.status_current||"accepted"
    };
  }catch(error){
    if(error instanceof MetaTransportError){
      if(error.uncertain)return await markMetaUncertain(claim,error.code);
      await markClaimFailed(claim,error.code);
      return {ok:false,error:error.code,provider:"meta",retryable:error.retryable===true,uncertain:false,http_status:error.httpStatus};
    }
    return await markMetaUncertain(claim,"unexpected_transport_error");
  }
}

async function dispatchQueuedOutbox(outboxId:string){
  const id=validUuid(outboxId);
  if(!id)return {ok:false,error:"invalid_outbox_id"};
  const claimed=await db.rpc("ops2_admin_attendance_claim_outbox_v3",{p_outbox_id:id});
  if(claimed.error)throw claimed.error;
  const claim=claimed.data||{ok:false,error:"outbox_claim_failed"};
  if(claim?.already_sent===true)return {ok:true,status:"accepted",outbox_status:"sent",duplicate:true,provider:claim?.provider||null};
  if(claim?.ok!==true)return claim;
  if(claim.provider==="meta")return await dispatchMeta(claim);
  if(claim.provider==="papoai")return await dispatchPapoAi(claim);
  await markClaimFailed(claim,"outbound_provider_unavailable");
  return {ok:false,error:"outbound_provider_unavailable",provider:claim.provider||null};
}

async function signedMedia(objectPath:string,mimeType:string|null,filename:string|null){
  const signed=await db.storage.from(MEDIA_BUCKET).createSignedUrl(objectPath,MEDIA_SIGNED_URL_SECONDS,{download:false});
  if(signed.error||!signed.data?.signedUrl)throw signed.error||new Error("media_sign_failed");
  return {ok:true,url:signed.data.signedUrl,mime_type:mimeType,filename,expires_at:new Date(Date.now()+MEDIA_SIGNED_URL_SECONDS*1000).toISOString()};
}

async function cleanupExpiredMediaCache(){
  const now=new Date().toISOString();
  const old=await db.from("attendance_media_cache_v1").select("message_id,object_path").lt("expires_at",now).limit(10);
  if(old.error||!(old.data||[]).length)return;
  const paths=(old.data||[]).map((x:any)=>String(x.object_path||"")).filter(Boolean);
  if(paths.length)await db.storage.from(MEDIA_BUCKET).remove(paths);
  const ids=(old.data||[]).map((x:any)=>x.message_id).filter(Boolean);
  if(ids.length)await db.from("attendance_media_cache_v1").delete().in("message_id",ids);
}

async function resolveAttendanceMedia(messageId:string){
  cleanupExpiredMediaCache().catch(()=>{});
  const existing=await db.from("attendance_media_cache_v1").select("message_id,object_path,mime_type,filename,expires_at").eq("message_id",messageId).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data&&Date.parse(existing.data.expires_at)>Date.now())return await signedMedia(existing.data.object_path,existing.data.mime_type,existing.data.filename);
  if(existing.data){
    await db.storage.from(MEDIA_BUCKET).remove([existing.data.object_path]);
    await db.from("attendance_media_cache_v1").delete().eq("message_id",messageId);
  }

  const message=await db.from("whatsapp_messages_v1").select("id,provider,message_type,metadata").eq("id",messageId).maybeSingle();
  if(message.error)throw message.error;
  if(!message.data)return {ok:false,error:"message_not_found"};
  const provider=String(message.data.provider||"");
  const metadata:any=message.data.metadata&&typeof message.data.metadata==="object"?message.data.metadata:{};
  let upstream:Response;
  let fallbackMime:string|null=null;
  let filenameSource:string|null=null;

  if(provider==="meta"){
    if(!metaConfigReady())return {ok:false,error:"meta_transport_not_configured"};
    const providerMediaId=clean(metadata?.media?.provider_media_id,240);
    if(!providerMediaId)return {ok:false,error:"media_capture_unavailable"};
    try{
      const info=await fetchMetaMediaInfo({accessToken:META_WHATSAPP_ACCESS_TOKEN,graphVersion:META_WHATSAPP_GRAPH_VERSION,mediaId:providerMediaId,timeoutMs:15000});
      if(info.fileSize!==null&&info.fileSize>MEDIA_MAX_BYTES)return {ok:false,error:"media_too_large"};
      upstream=await fetchMetaMediaResponse({accessToken:META_WHATSAPP_ACCESS_TOKEN,url:info.url,timeoutMs:15000});
      fallbackMime=normalizedAttendanceMime(info.mimeType)||normalizedAttendanceMime(metadata?.media?.mime_type);
      filenameSource=clean(metadata?.media?.filename,260)||null;
    }catch(error){
      if(error instanceof MetaMediaError)return {ok:false,error:error.code};
      throw error;
    }
  }else if(provider==="papoai"){
    const captureId=validUuid(metadata.legacy_capture_id);
    if(!captureId)return {ok:false,error:"media_capture_unavailable"};
    const capture=await db.from("papoai_webhook_inbox_v2").select("payload").eq("id",captureId).maybeSingle();
    if(capture.error)throw capture.error;
    const descriptor=findProviderMediaDescriptor(capture.data?.payload);
    if(!descriptor||!isAllowedProviderMediaUrl(descriptor.provider_url))return {ok:false,error:"media_unavailable"};
    upstream=await fetch(descriptor.provider_url,{method:"GET",redirect:"error",headers:{"Accept":"*/*"}});
    if(!upstream.ok)return {ok:false,error:"media_provider_fetch_failed"};
    fallbackMime=descriptor.mime_type;
    filenameSource=descriptor.filename||null;
  }else return {ok:false,error:"media_provider_unsupported"};

  const upstreamMime=normalizedAttendanceMime(upstream.headers.get("content-type"));
  const mimeType=isAllowedAttendanceMime(upstreamMime)?upstreamMime:fallbackMime;
  if(!isAllowedAttendanceMime(mimeType))return {ok:false,error:"media_type_not_allowed"};
  const bytes=await readBodyLimited(upstream,MEDIA_MAX_BYTES);
  const filename=safeAttendanceFilename(filenameSource||`arquivo-${messageId}`);
  const objectPath=`${messageId}/${Date.now()}-${filename}`;
  const uploaded=await db.storage.from(MEDIA_BUCKET).upload(objectPath,bytes,{contentType:mimeType,upsert:false,cacheControl:"3600"});
  if(uploaded.error)throw uploaded.error;
  const cacheExpiresAt=new Date(Date.now()+MEDIA_RETENTION_DAYS*86400000).toISOString();
  const cached=await db.from("attendance_media_cache_v1").upsert({message_id:messageId,object_path:objectPath,mime_type:mimeType,filename,cached_at:new Date().toISOString(),expires_at:cacheExpiresAt},{onConflict:"message_id"});
  if(cached.error){await db.storage.from(MEDIA_BUCKET).remove([objectPath]);throw cached.error}
  return await signedMedia(objectPath,mimeType,filename);
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);
  const url=new URL(req.url);
  const action=clean(url.searchParams.get("action"),40).toLowerCase();
  if(req.method==="GET"&&!READ_ACTIONS.has(action))return json(req,{ok:false,error:"action_not_allowed"},404);
  if(req.method==="POST"&&!SAFE_POST_ACTIONS.has(action))return json(req,{ok:false,error:"action_not_allowed"},404);
  if(req.method!=="GET"&&req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);

  const auth=await adminAuth(req);
  if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);

  try{
    if(req.method==="GET"&&action==="accounts"){
      const r=await db.from("whatsapp_accounts").select("id,slug,display_name,phone_e164,is_active").eq("is_active",true).order("phone_e164");
      if(r.error)throw r.error;
      return json(req,{ok:true,items:r.data||[]});
    }

    if(req.method==="GET"&&action==="queue"){
      const accountId=validUuid(url.searchParams.get("account_id"));
      if(!accountId)return json(req,{ok:false,error:"invalid_account_id"},400);
      const r=await db.rpc("ops2_admin_attendance_queue_v4",{
        p_whatsapp_account_id:accountId,
        p_limit:num(url.searchParams.get("limit"),50,1,50),
        p_search:clean(url.searchParams.get("search"),80)||null,
        p_label_id:validUuid(url.searchParams.get("label_id"))
      });
      if(r.error)throw r.error;
      return json(req,r.data||{ok:false,error:"queue_unavailable"},r.data?.ok===false?400:200);
    }

    if(req.method==="GET"&&action==="media"){
      const messageId=validUuid(url.searchParams.get("message_id"));
      if(!messageId)return json(req,{ok:false,error:"invalid_message_id"},400);
      const data=await resolveAttendanceMedia(messageId);
      return json(req,data,data?.ok===false?404:200);
    }

    if(req.method==="GET"&&action==="conversation"){
      const conversationId=validUuid(url.searchParams.get("conversation_id"));
      if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);
      const beforeRaw=url.searchParams.get("before");const before=beforeRaw?isoOrNull(beforeRaw):null;
      if(beforeRaw&&!before)return json(req,{ok:false,error:"invalid_before"},400);
      const r=await db.rpc("ops2_admin_attendance_conversation_v1",{p_conversation_id:conversationId,p_before:before,p_limit:num(url.searchParams.get("limit"),30,1,50)});
      if(r.error)throw r.error;
      const data=r.data||{ok:false,error:"conversation_unavailable"};
      if(data?.conversation){
        data.service_window=serviceWindowState(data.conversation.last_inbound_at,new Date().toISOString());
        data.send_capability=await attendanceSendCapability(data.conversation.whatsapp_account_id,data.service_window.open);
      }
      return json(req,data,data?.ok===false?404:200);
    }

    if(req.method==="GET"&&action==="context"){
      const conversationId=validUuid(url.searchParams.get("conversation_id"));
      if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);
      const r=await db.rpc("ops2_admin_attendance_context_v1",{p_conversation_id:conversationId});
      if(r.error)throw r.error;
      const data=r.data||{ok:false,error:"context_unavailable"};
      if(data?.conversation)data.service_window=serviceWindowState(data.conversation.last_inbound_at,new Date().toISOString());
      return json(req,data,data?.ok===false?404:200);
    }

    if(req.method==="GET"&&action==="labels"){
      const includeInactive=url.searchParams.get("include_inactive")==="1";
      let q=db.from("attendance_labels_v1").select("id,name,color,sort_order,is_active,created_at,updated_at").order("sort_order").order("name");
      if(!includeInactive)q=q.eq("is_active",true);
      const r=await q;if(r.error)throw r.error;return json(req,{ok:true,items:r.data||[]});
    }

    if(req.method==="GET"&&action==="conversation_labels"){
      const conversationId=validUuid(url.searchParams.get("conversation_id"));
      if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);
      const r=await db.from("attendance_conversation_labels_v1").select("label_id").eq("conversation_id",conversationId);
      if(r.error)throw r.error;return json(req,{ok:true,conversation_id:conversationId,label_ids:(r.data||[]).map((x:any)=>x.label_id)});
    }

    if(req.method==="GET"&&action==="quick_replies"){
      const includeInactive=url.searchParams.get("include_inactive")==="1";
      let q=db.from("attendance_quick_replies_v1").select("id,title,content,is_favorite,sort_order,is_active,created_at,updated_at").order("sort_order").order("title");
      if(!includeInactive)q=q.eq("is_active",true);
      const r=await q;if(r.error)throw r.error;return json(req,{ok:true,items:r.data||[]});
    }

    if(req.method==="GET"&&action==="library_list"){
      const data=await listAttendanceLibrary({
        db,query:url.searchParams.get("q")||"",kind:url.searchParams.get("kind"),category:url.searchParams.get("category"),
        limit:num(url.searchParams.get("limit"),40,1,100),cursor:url.searchParams.get("cursor")
      });
      return json(req,data,data?.ok===false?400:200);
    }

    if(req.method==="GET"&&action==="library_preview"){
      const itemId=validUuid(url.searchParams.get("item_id"));
      if(!itemId)return json(req,{ok:false,error:"library_item_invalid"},400);
      const data=await signAttendanceLibraryPreview({db,itemId});
      return json(req,data,data?.ok===false?404:200);
    }

    if(req.method==="GET"&&action==="products"){
      const q=normalizeProductQuery(url.searchParams.get("q"));const limit=num(url.searchParams.get("limit"),12,1,12);
      if(!q)return json(req,{ok:true,query:null,items:[]});
      return json(req,{ok:true,query:q,items:await productSearch(q,limit)});
    }

    if(action==="send_media"){
      const form=await req.formData().catch(()=>null);
      if(!form)return json(req,{ok:false,error:"media_request_invalid"},400);
      const data=await sendAttendanceMediaViaMeta({
        db,form,accessToken:META_WHATSAPP_ACCESS_TOKEN,graphVersion:META_WHATSAPP_GRAPH_VERSION,
        adminUserId:auth.user_id,markClaimFailed,markMetaUncertain
      });
      if(data?.ok===true)return json(req,data,200);
      const error=String(data?.error||"media_send_failed");
      const status=error==="rate_limited"?429:["service_window_closed","human_send_not_homologated","media_provider_unavailable","meta_canary_destination_blocked","meta_send_uncertain","duplicate_not_dispatchable"].includes(error)?409:error.startsWith("meta_")?502:400;
      return json(req,data,status);
    }

    const body=await req.json().catch(()=>({}));

    if(action==="library_upload_prepare"){
      const data=await prepareAttendanceLibraryUpload({db,adminUserId:auth.user_id,input:body});
      return json(req,data,data?.ok===false?400:200);
    }

    if(action==="library_upload_complete"){
      const data=await completeAttendanceLibraryUpload({db,adminUserId:auth.user_id,input:body});
      return json(req,data,data?.ok===false?400:200);
    }

    if(action==="library_update"){
      const data=await updateAttendanceLibraryItem({db,adminUserId:auth.user_id,input:body});
      return json(req,data,data?.ok===false?400:200);
    }

    if(action==="library_deactivate"){
      const data=await deactivateAttendanceLibraryItem({db,adminUserId:auth.user_id,itemId:body?.item_id});
      return json(req,data,data?.ok===false?404:200);
    }

    if(action==="library_send"){
      if(body?.to_phone_e164!==undefined||body?.whatsapp_account_id!==undefined||body?.account_id!==undefined||body?.phone_number_id!==undefined||body?.waba_id!==undefined||body?.customer_id!==undefined){
        return json(req,{ok:false,error:"destination_fields_not_allowed"},400);
      }
      const conversationId=validUuid(body?.conversation_id);const itemId=validUuid(body?.item_id);const idempotencyKey=normalizeIdempotencyKey(body?.idempotency_key);
      if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);
      if(!itemId)return json(req,{ok:false,error:"library_item_invalid"},400);
      if(!idempotencyKey)return json(req,{ok:false,error:"invalid_idempotency_key"},400);
      const data=await sendAttendanceLibraryItemViaMeta({
        db,adminUserId:auth.user_id,conversationId,itemId,idempotencyKey,caption:String(body?.caption||''),
        accessToken:META_WHATSAPP_ACCESS_TOKEN,graphVersion:META_WHATSAPP_GRAPH_VERSION,markClaimFailed,markMetaUncertain
      });
      if(data?.ok===true)return json(req,data,200);
      const error=String(data?.error||"library_send_failed");
      const status=error==="rate_limited"?429:["service_window_closed","human_send_not_homologated","media_provider_unavailable","meta_canary_destination_blocked","meta_send_uncertain","duplicate_not_dispatchable"].includes(error)?409:error.startsWith("meta_")?502:400;
      return json(req,data,status);
    }

    if(action==="label_save"){
      const id=body?.id?validUuid(body.id):null;const name=clean(body?.name,60);const color=clean(body?.color,7)||"#5f6368";const sortOrder=num(body?.sort_order,0,-9999,9999);
      if(!name)return json(req,{ok:false,error:"label_name_required"},400);
      if(!/^#[0-9a-fA-F]{6}$/.test(color))return json(req,{ok:false,error:"invalid_label_color"},400);
      const payload={name,color,sort_order:sortOrder,is_active:true,updated_at:new Date().toISOString()};
      const r=id?await db.from("attendance_labels_v1").update(payload).eq("id",id).select("id,name,color,sort_order,is_active").maybeSingle():await db.from("attendance_labels_v1").insert(payload).select("id,name,color,sort_order,is_active").single();
      if(r.error){if(String(r.error.code)==="23505")return json(req,{ok:false,error:"label_name_conflict"},409);throw r.error}
      if(id&&!r.data)return json(req,{ok:false,error:"label_not_found"},404);return json(req,{ok:true,item:r.data});
    }

    if(action==="label_deactivate"){
      const id=validUuid(body?.id??body?.label_id);if(!id)return json(req,{ok:false,error:"invalid_label_id"},400);
      const r=await db.from("attendance_labels_v1").update({is_active:false,updated_at:new Date().toISOString()}).eq("id",id).select("id").maybeSingle();if(r.error)throw r.error;
      return json(req,r.data?{ok:true,id}:{ok:false,error:"label_not_found"},r.data?200:404);
    }

    if(action==="quick_reply_save"){
      const id=body?.id?validUuid(body.id):null;const title=clean(body?.title,80);const content=clean(body?.content,4000);const sortOrder=num(body?.sort_order,0,-9999,9999);const favorite=body?.is_favorite!==false;
      if(!title)return json(req,{ok:false,error:"quick_reply_title_required"},400);
      if(!content)return json(req,{ok:false,error:"quick_reply_content_required"},400);
      const payload={title,content,is_favorite:favorite,sort_order:sortOrder,is_active:true,updated_at:new Date().toISOString()};
      const r=id?await db.from("attendance_quick_replies_v1").update(payload).eq("id",id).select("id,title,content,is_favorite,sort_order,is_active").maybeSingle():await db.from("attendance_quick_replies_v1").insert(payload).select("id,title,content,is_favorite,sort_order,is_active").single();
      if(r.error){if(String(r.error.code)==="23505")return json(req,{ok:false,error:"quick_reply_title_conflict"},409);throw r.error}
      if(id&&!r.data)return json(req,{ok:false,error:"quick_reply_not_found"},404);return json(req,{ok:true,item:r.data});
    }

    if(action==="quick_reply_deactivate"){
      const id=validUuid(body?.id??body?.quick_reply_id);if(!id)return json(req,{ok:false,error:"invalid_quick_reply_id"},400);
      const r=await db.from("attendance_quick_replies_v1").update({is_active:false,updated_at:new Date().toISOString()}).eq("id",id).select("id").maybeSingle();if(r.error)throw r.error;
      return json(req,r.data?{ok:true,id}:{ok:false,error:"quick_reply_not_found"},r.data?200:404);
    }

    const conversationId=validUuid(body?.conversation_id);
    if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);

    if(action==="send_text"){
      if(body?.to_phone_e164!==undefined||body?.whatsapp_account_id!==undefined||body?.account_id!==undefined||body?.customer_id!==undefined){
        return json(req,{ok:false,error:"destination_fields_not_allowed"},400);
      }
      const normalized=normalizeOutboundText(body?.text);
      if(!normalized.ok)return json(req,{ok:false,error:normalized.error},400);
      const idempotencyKey=normalizeIdempotencyKey(body?.idempotency_key);
      if(!idempotencyKey)return json(req,{ok:false,error:"invalid_idempotency_key"},400);
      const queued=await db.rpc("ops2_admin_attendance_enqueue_text_v3",{p_conversation_id:conversationId,p_text:normalized.text,p_idempotency_key:idempotencyKey});
      if(queued.error)throw queued.error;
      const data=queued.data||{ok:false,error:"enqueue_failed"};
      if(data?.ok!==true){
        const error=String(data?.error||"enqueue_failed");
        const status=error==="rate_limited"?429:["service_window_closed","human_send_not_homologated","meta_transport_not_configured","meta_send_uncertain"].includes(error)?409:400;
        return json(req,data,status);
      }
      if(data?.duplicate===true){
        if(data?.status==="sent")return json(req,{ok:true,status:"accepted",duplicate:true,outbox_id:data.outbox_id,provider:data.provider||null},200);
        if(data?.status!=="queued")return json(req,{ok:false,error:"duplicate_not_dispatchable",outbox_id:data.outbox_id,status:data.status,provider:data.provider||null},409);
      }
      const dispatched=await dispatchQueuedOutbox(data.outbox_id);
      return json(req,dispatched,dispatched?.ok===true?200:502);
    }

    if(action==="conversation_labels_set"){
      if(!Array.isArray(body?.label_ids))return json(req,{ok:false,error:"invalid_label_ids"},400);
      const raw=body.label_ids;const ids=[...new Set(raw.map((x:any)=>validUuid(x)).filter(Boolean))];
      if(ids.length!==raw.length)return json(req,{ok:false,error:"invalid_label_ids"},400);
      const r=await db.rpc("ops2_admin_attendance_set_labels_v1",{p_conversation_id:conversationId,p_label_ids:ids});if(r.error)throw r.error;
      return json(req,r.data||{ok:false,error:"conversation_labels_failed"},r.data?.ok===false?400:200);
    }

    if(action==="mark_read"){
      const messageId=validUuid(body?.message_id);if(!messageId)return json(req,{ok:false,error:"invalid_message_id"},400);
      const r=await db.rpc("ops2_admin_attendance_mark_read_v1",{p_conversation_id:conversationId,p_message_id:messageId});
      if(r.error)throw r.error;return json(req,r.data||{ok:false,error:"mark_read_failed"},r.data?.ok===false?400:200);
    }

    if(action==="follow_up"){
      const followRaw=body?.follow_up_at;const follow=followRaw==null||String(followRaw).trim()===''?null:isoOrNull(followRaw);
      if(followRaw!=null&&String(followRaw).trim()!==''&&!follow)return json(req,{ok:false,error:"invalid_follow_up_at"},400);
      const r=await db.rpc("ops2_admin_attendance_follow_up_v1",{p_conversation_id:conversationId,p_follow_up_at:follow});
      if(r.error)throw r.error;return json(req,r.data||{ok:false,error:"follow_up_failed"},r.data?.ok===false?400:200);
    }

    if(action==="marketing_opt_out"){
      const r=await db.rpc("ops2_admin_attendance_marketing_optout_v1",{p_conversation_id:conversationId});
      if(r.error)throw r.error;
      const data=r.data||{ok:false,error:"marketing_optout_failed"};
      if(data?.ok===true)return json(req,data,200);
      const error=String(data?.error||"marketing_optout_failed");
      return json(req,data,error==="customer_not_linked"?409:error==="conversation_not_found"?404:400);
    }

    if(action==="issue_catalog"){
      const ctx=await db.rpc("ops2_admin_attendance_context_v1",{p_conversation_id:conversationId});
      if(ctx.error)throw ctx.error;const phone=clean(ctx.data?.conversation?.phone_e164,30);
      if(ctx.data?.ok!==true||!phone)return json(req,{ok:false,error:"conversation_phone_unavailable"},409);
      const sourceKey=`attendance:${conversationId}:${Date.now()}`;
      const r=await db.rpc("ops2_issue_papoai_catalog_link_v1",{p_phone:phone,p_conversation_id:conversationId,p_source_event_key:sourceKey});
      if(r.error)throw r.error;return json(req,r.data||{ok:false,error:"catalog_link_failed"},r.data?.ok===false?400:200);
    }

    return json(req,{ok:false,error:"action_not_allowed"},404);
  }catch(error){
    console.error("admin-whatsapp-ops-v1",action,error);
    return json(req,{ok:false,error:"attendance_backend_error"},500);
  }
});