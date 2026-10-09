import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {sendTemplateViaMeta,MetaTransportError} from "../_shared/whatsapp-meta-transport-v1.mjs";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const META_WHATSAPP_ACCESS_TOKEN=(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"").trim();
const META_WHATSAPP_GRAPH_VERSION=(Deno.env.get("META_WHATSAPP_GRAPH_VERSION")||"").trim();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});

type Channel="0975"|"1018";
type Kind="prepared_ok"|"prepared_adjusted";
type JsonRecord=Record<string,unknown>;

const TEMPLATE_BY_KIND:Record<Kind,Record<Channel,string>>={
  prepared_ok:{
    "0975":"pedidopreparadook0975v1",
    "1018":"pedidopreparadook1018v1"
  },
  prepared_adjusted:{
    "0975":"pedidopreparadoajuste0975v1",
    "1018":"pedidopreparadoajuste1018v1"
  }
};
const TEMPLATE_LANGUAGE="pt_BR";
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const uuid=(v:unknown)=>{const s=clean(v,80);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
const digits=(v:unknown)=>String(v??"").replace(/\D+/g,"");
const obj=(v:unknown):JsonRecord=>v&&typeof v==="object"&&!Array.isArray(v)?v as JsonRecord:{};
const money=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n):"R$ 0,00"};
const qty=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat("pt-BR",{maximumFractionDigits:3}).format(n):"1"};
const channelFromPhone=(v:unknown):Channel|null=>{const d=digits(v);if(d.endsWith("1018"))return "1018";if(d.endsWith("0975"))return "0975";return null};
const metaReady=()=>Boolean(META_WHATSAPP_ACCESS_TOKEN&&/^v\d+\.\d+$/.test(META_WHATSAPP_GRAPH_VERSION));

function missingItemsText(value:unknown){
  const items=Array.isArray(value)?value:[];
  const lines=items.map((raw:any)=>`• ${qty(raw?.quantity)}x ${clean(raw?.name,160)||"Produto"}`);
  if(!lines.length)return "Consulte os itens ajustados na vitrine do pedido.";
  const kept:string[]=[];let used=0;
  for(const line of lines){
    if(used+line.length+1>850)break;
    kept.push(line);used+=line.length+1;
  }
  const omitted=lines.length-kept.length;
  if(omitted>0)kept.push(`• +${omitted} item(ns) — veja os detalhes na vitrine do pedido`);
  return kept.join("\n");
}

async function activeAccount(accountId:string|null,channel:Channel){
  if(accountId){
    const q=await db.from("whatsapp_accounts").select("id,phone_e164,phone_number_id,is_active").eq("id",accountId).eq("is_active",true).maybeSingle();
    if(q.error)throw q.error;
    if(q.data&&channelFromPhone(q.data.phone_e164)===channel)return q.data;
  }
  const q=await db.from("whatsapp_accounts").select("id,phone_e164,phone_number_id,is_active").eq("is_active",true);
  if(q.error)throw q.error;
  return (q.data||[]).find((row:any)=>channelFromPhone(row.phone_e164)===channel)||null;
}

async function templateApprovedForAccount(accountId:string,templateName:string){
  const q=await db.from("whatsapp_templates_v1").select("status").eq("whatsapp_account_id",accountId).eq("name",templateName).eq("language",TEMPLATE_LANGUAGE).maybeSingle();
  if(q.error)throw q.error;
  return String(q.data?.status||"").toUpperCase()==="APPROVED";
}

async function canonicalConversation(route:any,order:any,account:any){
  const direct=uuid(route?.conversation_id)||uuid(order?.conversation_id);
  if(direct)return direct;
  const r=await db.rpc("whatsapp_resolve_conversation_v1",{
    p_whatsapp_account_id:account.id,
    p_wa_contact_e164:route.phone_e164,
    p_customer_id:order.customer_id||null,
    p_source:"website"
  });
  if(r.error)return null;
  return uuid(r.data?.conversation_id)||null;
}

async function persistCanonicalMessage(args:{notificationId:string;order:any;route:any;account:any;conversationId:string|null;providerMessageId:string;templateName:string;acceptedAt:string}){
  const {notificationId,order,route,account,conversationId,providerMessageId,templateName,acceptedAt}=args;
  if(!conversationId)return;
  try{
    const existing=await db.from("whatsapp_messages_v1").select("id").eq("whatsapp_account_id",account.id).eq("provider_message_id",providerMessageId).maybeSingle();
    if(existing.error)throw existing.error;
    if(!existing.data){
      const inserted=await db.from("whatsapp_messages_v1").insert({
        conversation_id:conversationId,whatsapp_account_id:account.id,customer_id:order.customer_id||null,
        direction:"outbound",message_type:"template",provider:"meta",provider_message_id:providerMessageId,
        status_current:"accepted",sender_kind:"automation",sent_at:acceptedAt,
        metadata:{source:"order_separation_notification",transport:"meta_cloud_api",notification_id:notificationId,order_id:order.id,template_name:templateName,template_language:TEMPLATE_LANGUAGE}
      });
      if(inserted.error&&String(inserted.error.code||"")!=="23505")throw inserted.error;
    }
    await db.from("conversations").update({last_outbound_at:acceptedAt,updated_at:acceptedAt}).eq("id",conversationId);
    try{await db.rpc("whatsapp_record_status_v1",{
      p_whatsapp_account_id:account.id,p_provider:"meta",p_provider_message_id:providerMessageId,p_status:"accepted",
      p_occurred_at:acceptedAt,p_received_at:acceptedAt,p_error_code:null,p_error_title:null,p_error_message:null,
      p_payload:{source:"order_separation_notification",notification_id:notificationId,order_id:order.id}
    })}catch{}
  }catch(error){
    console.error("order_separation_notify_canonical_persist",clean((error as Error)?.message||error,220));
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return respond({ok:false,error:"method_not_allowed"},405);
  if(!U||!K)return respond({ok:false,error:"server_config"},500);
  const internal=req.headers.get("x-internal-key")||"",serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(internal!==K&&internal!==serviceRole)return respond({ok:false,error:"forbidden"},403);
  if(!metaReady())return respond({ok:false,error:"meta_transport_not_configured"},503);

  const body=await req.json().catch(()=>({}));
  const orderId=uuid(body?.order_id);
  if(!orderId)return respond({ok:false,error:"order_id_required"},400);

  try{
    const [orderQ,completionQ,routeQ]=await Promise.all([
      db.from("orders").select("id,order_number,customer_id,conversation_id,whatsapp_account_id,phone_e164,total,delivery_address,checkout_snapshot").eq("id",orderId).maybeSingle(),
      db.from("order_separation_completions_v1").select("order_id,phase,original_total,missing_subtotal,final_total,missing_items,metadata,prepared_at,completed_at").eq("order_id",orderId).maybeSingle(),
      db.from("ops2_whatsapp_outbox_v1").select("id,customer_id,conversation_id,whatsapp_account_id,phone_e164,channel_origin,channel_phone_e164,status").eq("order_id",orderId).eq("recipient_kind","customer").eq("message_kind","order_received").order("created_at",{ascending:false}).limit(1).maybeSingle()
    ]);
    if(orderQ.error)throw orderQ.error;if(!orderQ.data)return respond({ok:false,error:"order_not_found"},404);
    if(completionQ.error)throw completionQ.error;if(!completionQ.data)return respond({ok:false,error:"separation_completion_missing"},409);
    if(routeQ.error)throw routeQ.error;

    const order=orderQ.data,completion=completionQ.data,meta=obj(completion.metadata);
    if(meta.stock_applied!==true)return respond({ok:false,error:"separation_not_consolidated"},409);

    const publicLinkQ=await db.rpc("ops2_order_public_link_v1",{p_order_id:orderId});
    if(publicLinkQ.error)throw publicLinkQ.error;
    const publicCode=clean(publicLinkQ.data?.public_code,24),orderUrl=clean(publicLinkQ.data?.public_url,300);
    if(!/^(?:[A-Z]{2}[0-9]{3}|[0-9]{4}|[0-9]{2}[|][0-9]{2}[|][0-9]{4} - [0-9]{3})$/.test(publicCode)||!orderUrl)return respond({ok:false,error:"public_order_identity_missing"},409);

    const missingItems=Array.isArray(completion.missing_items)?completion.missing_items:[];
    const missingSubtotal=Number(completion.missing_subtotal||0);
    const kind:Kind=missingItems.length>0||missingSubtotal>0?"prepared_adjusted":"prepared_ok";
    const route=routeQ.data||{};
    const routePhone=clean(route.phone_e164||order.phone_e164,30);
    if(!routePhone)return respond({ok:false,error:"customer_phone_missing"},409);
    const channel=(clean(route.channel_origin,4)==="1018"?"1018":clean(route.channel_origin,4)==="0975"?"0975":channelFromPhone(route.channel_phone_e164)||"0975") as Channel;
    const account=await activeAccount(uuid(route.whatsapp_account_id)||uuid(order.whatsapp_account_id)||null,channel);
    if(!account||!/^\d{5,30}$/.test(String(account.phone_number_id||"")))return respond({ok:false,error:"whatsapp_account_missing",channel_origin:channel},409);
    const templateName=TEMPLATE_BY_KIND[kind][channel];
    const templateApproved=await templateApprovedForAccount(account.id,templateName);
    const originalTotal=completion.original_total??order.total??0,finalTotal=completion.final_total??order.total??0;
    const missingText=missingItemsText(missingItems);
    const components=kind==="prepared_adjusted"?[{type:"body",parameters:[
      {type:"text",text:publicCode},{type:"text",text:missingText},{type:"text",text:money(originalTotal)},
      {type:"text",text:money(missingSubtotal)},{type:"text",text:money(finalTotal)},{type:"text",text:orderUrl}
    ]}]:[{type:"body",parameters:[
      {type:"text",text:publicCode},{type:"text",text:money(finalTotal)},{type:"text",text:orderUrl}
    ]}];

    const payload={public_code:publicCode,order_url:orderUrl,missing_items:missingItems,missing_items_text:missingText,original_total:originalTotal,missing_subtotal:missingSubtotal,final_total:finalTotal,template_name:templateName,components};
    const initialStatus=templateApproved?"sending":"pending";
    const insert=await db.from("order_separation_customer_notifications_v1").insert({
      order_id:orderId,notification_kind:kind,status:initialStatus,whatsapp_account_id:account.id,
      conversation_id:uuid(route.conversation_id)||uuid(order.conversation_id)||null,customer_id:order.customer_id||null,
      phone_e164:routePhone,channel_origin:channel,template_name:templateName,attempt_count:templateApproved?1:0,payload
    }).select("id,status,provider_message_id").maybeSingle();

    let notification:any=insert.data;
    if(insert.error){
      if(String(insert.error.code||"")!=="23505")throw insert.error;
      const existing=await db.from("order_separation_customer_notifications_v1").select("id,status,provider_message_id,last_error").eq("order_id",orderId).eq("notification_kind",kind).maybeSingle();
      if(existing.error)throw existing.error;
      if(existing.data?.status==="accepted")return respond({ok:true,status:"accepted",duplicate:true,notification_id:existing.data.id,provider_message_id:existing.data.provider_message_id,public_code:publicCode});
      if(existing.data?.status==="sending"||existing.data?.status==="uncertain")return respond({ok:false,error:"notification_not_retryable",status:existing.data.status,notification_id:existing.data.id},409);
      if(existing.data?.status==="pending"&&!templateApproved)return respond({ok:true,status:"pending",reason:"template_pending_approval",notification_id:existing.data.id,template_name:templateName,public_code:publicCode},202);
      const automaticPendingClaim=existing.data?.status==="pending"&&templateApproved;
      if(!automaticPendingClaim&&body?.retry!==true)return respond({ok:false,error:"notification_requires_explicit_retry",status:existing.data?.status||"failed",notification_id:existing.data?.id||null},409);
      const claimable=automaticPendingClaim?["pending"]:["retry","failed"];
      const claimed=await db.from("order_separation_customer_notifications_v1").update({status:"sending",last_error:null,attempt_count:automaticPendingClaim?1:2,updated_at:new Date().toISOString(),payload}).eq("id",existing.data.id).in("status",claimable).select("id,status,provider_message_id").maybeSingle();
      if(claimed.error)throw claimed.error;if(!claimed.data)return respond({ok:false,error:"notification_claim_failed"},409);
      notification=claimed.data;
    }

    if(!templateApproved)return respond({ok:true,status:"pending",reason:"template_pending_approval",notification_id:notification?.id||null,template_name:templateName,public_code:publicCode},202);

    let result:any=null;
    for(let attempt=1;attempt<=2;attempt++){
      try{
        result=await sendTemplateViaMeta({
          accessToken:META_WHATSAPP_ACCESS_TOKEN,phoneNumberId:String(account.phone_number_id||""),toE164:routePhone,
          templateName,languageCode:TEMPLATE_LANGUAGE,components,graphVersion:META_WHATSAPP_GRAPH_VERSION,timeoutMs:15000
        });
        break;
      }catch(error){
        if(error instanceof MetaTransportError){
          if(error.uncertain){
            await db.from("order_separation_customer_notifications_v1").update({status:"uncertain",last_error:error.code,updated_at:new Date().toISOString()}).eq("id",notification.id);
            return respond({ok:false,error:"meta_send_uncertain",uncertain:true,notification_id:notification.id},503);
          }
          if(error.retryable&&attempt<2){await new Promise(resolve=>setTimeout(resolve,750));continue}
          await db.from("order_separation_customer_notifications_v1").update({status:error.retryable?"retry":"failed",last_error:error.code,updated_at:new Date().toISOString()}).eq("id",notification.id);
          return respond({ok:false,error:error.code,retryable:error.retryable===true,notification_id:notification.id},error.retryable?503:502);
        }
        await db.from("order_separation_customer_notifications_v1").update({status:"uncertain",last_error:"unexpected_transport_error",updated_at:new Date().toISOString()}).eq("id",notification.id);
        return respond({ok:false,error:"meta_send_uncertain",uncertain:true,notification_id:notification.id},503);
      }
    }

    if(!result?.providerMessageId)return respond({ok:false,error:"meta_invalid_response"},502);
    const acceptedAt=new Date().toISOString();
    const conversationId=await canonicalConversation({...route,phone_e164:routePhone},order,account);
    const saved=await db.from("order_separation_customer_notifications_v1").update({
      status:"accepted",provider_message_id:result.providerMessageId,accepted_at:acceptedAt,conversation_id:conversationId,
      last_error:null,updated_at:acceptedAt,payload:{...payload,provider:"meta",meta_accepted_at:acceptedAt}
    }).eq("id",notification.id).eq("status","sending");
    if(saved.error)throw saved.error;
    await persistCanonicalMessage({notificationId:notification.id,order,route:{...route,phone_e164:routePhone},account,conversationId,providerMessageId:result.providerMessageId,templateName,acceptedAt});

    return respond({ok:true,status:"accepted",notification_id:notification.id,notification_kind:kind,public_code:publicCode,channel_origin:channel,template_name:templateName,provider_message_id:result.providerMessageId});
  }catch(error){
    console.error("order-separation-notify-v1",clean((error as Error)?.message||error,300));
    return respond({ok:false,error:"notification_backend_error"},500);
  }
});
