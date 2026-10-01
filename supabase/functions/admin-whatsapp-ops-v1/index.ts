import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {validUuid,attendanceFilter,serviceWindowState,normalizeProductQuery,normalizeOutboundText,normalizeIdempotencyKey} from "../_shared/admin-attendance-domain-v1.mjs";
import {channelKeyFromPhone,sendSecretName,controlSecretName,providerMessageId,sanitizeTransportError} from "../_shared/papoai-attendance-transport-v1.mjs";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const READ_ACTIONS=new Set(["accounts","queue","conversation","context","products"]);
const SAFE_POST_ACTIONS=new Set(["mark_read","follow_up","issue_catalog","marketing_opt_out","send_text","takeover","release"]);
const CONTROL_ENABLED=String(Deno.env.get("PAPOAI_ATTENDANCE_CONTROL_ENABLED")||"").toLowerCase()==="true";
const SEND_SECRET_0975="PAPOAI_ATTENDANCE_SEND_0975_URL";
const SEND_SECRET_1018="PAPOAI_ATTENDANCE_SEND_1018_URL";
const TAKEOVER_SECRET="PAPOAI_ATTENDANCE_TAKEOVER_URL";
const RELEASE_SECRET="PAPOAI_ATTENDANCE_RELEASE_URL";
void [SEND_SECRET_0975,SEND_SECRET_1018,TAKEOVER_SECRET,RELEASE_SECRET];

const clean=(v:unknown,max=200)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const num=(v:unknown,fallback:number,min:number,max:number)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.trunc(n))):fallback};
const isoOrNull=(v:unknown)=>{const s=clean(v,50);if(!s)return null;const t=Date.parse(s);return Number.isFinite(t)?new Date(t).toISOString():null};
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

async function markTransportFailure(claim:any,error:unknown){
  const message=sanitizeTransportError(error instanceof Error?error.message:error);
  const now=new Date().toISOString();
  await Promise.all([
    db.from("whatsapp_outbox_v1").update({status:"failed",last_error:message,updated_at:now}).eq("id",claim?.outbox_id).eq("status","claimed"),
    db.from("whatsapp_messages_v1").update({status_current:'failed'}).eq("id",claim?.message_id).in("status_current",["queued","sending"])
  ]);
  return {ok:false,error:"papoai_transport_failed"};
}

async function dispatchQueuedOutbox(outboxId:string){
  const id=validUuid(outboxId);
  if(!id)return {ok:false,error:"invalid_outbox_id"};
  const claimed=await db.rpc("ops2_admin_attendance_claim_outbox_v1",{p_outbox_id:id});
  if(claimed.error)throw claimed.error;
  const claim=claimed.data||{ok:false,error:"outbox_claim_failed"};
  if(claim?.already_sent===true)return {ok:true,status:'accepted',outbox_status:'sent',duplicate:true};
  if(claim?.ok!==true)return claim;

  const channel=channelKeyFromPhone(claim.account_phone_e164);
  const secretName=sendSecretName(channel);
  const webhookUrl=secretName?String(Deno.env.get(secretName)||"").trim():"";
  if(!channel||!secretName||!webhookUrl){await markTransportFailure(claim,"transport_config_missing");return {ok:false,error:"transport_config_missing"};}

  try{
    const response=await fetch(webhookUrl,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({phone:claim.to_phone_e164,text:claim.text,event_ref:claim.idempotency_key}),
      signal:AbortSignal.timeout(15000)
    });
    const raw=(await response.text()).slice(0,4000);
    let payload:any={};try{payload=raw?JSON.parse(raw):{}}catch{payload={}}
    if(!response.ok)throw new Error(`papoai_http_${response.status}`);
    const providerId=providerMessageId(payload);
    const sentAt=new Date().toISOString();
    const [outboxUpdate,messageUpdate]=await Promise.all([
      db.from("whatsapp_outbox_v1").update({status:'sent',sent_at:sentAt,provider_message_id:providerId,last_error:null,updated_at:sentAt}).eq("id",claim.outbox_id).eq("status","claimed"),
      db.from("whatsapp_messages_v1").update({status_current:'accepted',provider_message_id:providerId,sent_at:sentAt}).eq("id",claim.message_id).eq("status_current","sending")
    ]);
    if(outboxUpdate.error||messageUpdate.error)throw outboxUpdate.error||messageUpdate.error;
    await db.from("conversations").update({last_outbound_at:sentAt}).eq("id",claim.conversation_id);
    return {ok:true,status:'accepted',outbox_status:'sent',provider_message_id:providerId};
  }catch(error){
    await markTransportFailure(claim,error);
    return {ok:false,error:"papoai_transport_failed"};
  }
}

async function callControlWebhook(conversationId:string,action:"takeover"|"release"){
  if(!CONTROL_ENABLED)return {ok:false,error:"control_not_homologated"};
  const secretName=controlSecretName(action);
  const webhookUrl=secretName?String(Deno.env.get(secretName)||"").trim():"";
  if(!secretName||!webhookUrl)return {ok:false,error:"transport_config_missing"};

  const conversation=await db.from("conversations").select("id,wa_contact_e164,whatsapp_account_id").eq("id",conversationId).maybeSingle();
  if(conversation.error)throw conversation.error;
  if(!conversation.data?.id||!conversation.data.whatsapp_account_id)return {ok:false,error:"conversation_channel_unavailable"};
  const account=await db.from("whatsapp_accounts").select("id,phone_e164,is_active").eq("id",conversation.data.whatsapp_account_id).eq("is_active",true).maybeSingle();
  if(account.error)throw account.error;
  if(!account.data?.id||!channelKeyFromPhone(account.data.phone_e164))return {ok:false,error:"account_unavailable"};
  const phone=clean(conversation.data.wa_contact_e164,30);
  if(!phone)return {ok:false,error:"conversation_phone_unavailable"};

  try{
    const response=await fetch(webhookUrl,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({phone,event_ref:`attendance-control:${action}:${conversationId}:${Date.now()}`}),
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)return {ok:false,error:"papoai_control_failed"};
    const now=new Date().toISOString();
    const patch=action==="takeover"
      ?{mode:"human",human_takeover_at:now,human_required:false}
      :{mode:"ai",ai_resume_at:now,human_required:false};
    const updated=await db.from("conversations").update(patch).eq("id",conversationId);
    if(updated.error)throw updated.error;
    return {ok:true,action};
  }catch{return {ok:false,error:"papoai_control_failed"}}
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
      const r=await db.rpc("ops2_admin_attendance_queue_v1",{
        p_whatsapp_account_id:accountId,p_limit:num(url.searchParams.get("limit"),50,1,50),
        p_search:clean(url.searchParams.get("search"),80)||null,p_filter:attendanceFilter(url.searchParams.get("filter"))
      });
      if(r.error)throw r.error;
      return json(req,r.data||{ok:false,error:"queue_unavailable"},r.data?.ok===false?400:200);
    }

    if(req.method==="GET"&&action==="conversation"){
      const conversationId=validUuid(url.searchParams.get("conversation_id"));
      if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);
      const beforeRaw=url.searchParams.get("before");const before=beforeRaw?isoOrNull(beforeRaw):null;
      if(beforeRaw&&!before)return json(req,{ok:false,error:"invalid_before"},400);
      const r=await db.rpc("ops2_admin_attendance_conversation_v1",{p_conversation_id:conversationId,p_before:before,p_limit:num(url.searchParams.get("limit"),30,1,50)});
      if(r.error)throw r.error;
      const data=r.data||{ok:false,error:"conversation_unavailable"};
      if(data?.conversation)data.service_window=serviceWindowState(data.conversation.last_inbound_at,new Date().toISOString());
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

    if(req.method==="GET"&&action==="products"){
      const q=normalizeProductQuery(url.searchParams.get("q"));const limit=num(url.searchParams.get("limit"),12,1,12);
      if(!q)return json(req,{ok:true,query:null,items:[]});
      return json(req,{ok:true,query:q,items:await productSearch(q,limit)});
    }

    const body=await req.json().catch(()=>({}));
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
      const r=await db.rpc("ops2_admin_attendance_enqueue_text_v1",{
        p_conversation_id:conversationId,p_text:normalized.text,p_idempotency_key:idempotencyKey
      });
      if(r.error)throw r.error;
      const data=r.data||{ok:false,error:"enqueue_failed"};
      if(data?.ok!==true){
        const error=String(data?.error||'enqueue_failed');
        const status=error==='rate_limited'?429:['service_window_closed','human_send_not_homologated'].includes(error)?409:400;
        return json(req,data,status);
      }
      const dispatch=await dispatchQueuedOutbox(String(data.outbox_id||""));
      return json(req,{...data,dispatch},dispatch?.ok===true?200:502);
    }

    if(action==="takeover"||action==="release"){
      const control=await callControlWebhook(conversationId,action as "takeover"|"release");
      return json(req,control,control?.ok===true?200:control?.error==="control_not_homologated"?409:502);
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