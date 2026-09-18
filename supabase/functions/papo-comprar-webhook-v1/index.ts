import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const clean=(value:unknown,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const digits=(value:unknown)=>String(value??'').replace(/\D/g,'');
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});

function safeEqual(a:string,b:string){
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
  if(x.length!==y.length)return false;
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}

function normalizePhone(value:unknown){
  let valueDigits=digits(value);
  if(valueDigits.startsWith('00'))valueDigits=valueDigits.slice(2);
  if(valueDigits.startsWith('0')&&(valueDigits.length===11||valueDigits.length===12))valueDigits=valueDigits.slice(1);
  if(valueDigits.length===10||valueDigits.length===11)valueDigits=`55${valueDigits}`;
  if(!valueDigits.startsWith('55')||(valueDigits.length!==12&&valueDigits.length!==13))return '';
  return `+${valueDigits}`;
}

function pick(body:any,paths:string[]){
  for(const path of paths){
    let current:any=body;
    for(const part of path.split('.'))current=current&&typeof current==='object'?current[part]:undefined;
    const value=clean(current,1000);if(value)return value;
  }
  return '';
}

async function parseBody(req:Request){
  const type=(req.headers.get('content-type')||'').toLowerCase();
  if(type.includes('application/json'))return await req.json().catch(()=>({}));
  if(type.includes('form')){
    const form=await req.formData().catch(()=>null);const body:Record<string,string>={};
    if(form)for(const [key,value] of form.entries())if(typeof value==='string')body[key]=value;
    return body;
  }
  const raw=await req.text().catch(()=>'');
  if(!raw)return {};
  try{return JSON.parse(raw)}catch{
    const params=new URLSearchParams(raw),body:Record<string,string>={};for(const [key,value] of params)body[key]=value;return body;
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return response({ok:false,error:'method_not_allowed'},405);

  const supabaseUrl=Deno.env.get('SUPABASE_URL');
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!supabaseUrl||!serviceKey)return response({ok:false,error:'server_config'},500);
  const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const body:any=await parseBody(req);

  const {data:expected,error:secretError}=await sb.rpc('get_dona_antonia_papo_comprar_webhook_token_v1');
  if(secretError||!expected)return response({ok:false,error:'webhook_not_configured'},503);
  const url=new URL(req.url);
  const bearer=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const supplied=clean(req.headers.get('x-papo-webhook-token')||url.searchParams.get('webhook_token')||body?.webhook_token||bearer,200);
  if(!supplied||!safeEqual(supplied,String(expected)))return response({ok:false,error:'unauthorized'},401);

  const rawPhone=pick(body,['phone','whatsapp','phone_number','sender_phone','from','sender.phone','sender.whatsapp','contact.phone','contact.phone_number']);
  const phone=normalizePhone(rawPhone);
  if(!phone)return response({ok:false,error:'invalid_phone'},400);

  const contactName=pick(body,['name','contact_name','sender.name','contact.name']);
  const contactId=pick(body,['contact_id','sender.id','contact.id','id']);
  const message=pick(body,['message','text','body','content','message.text','message.body']);
  const receivedAt=new Date().toISOString();

  const [{data:channelAccount,error:channelAccountError},{data:account,error:accountError}]=await Promise.all([
    sb.from('channel_accounts').select('id').eq('channel','whatsapp').eq('status','active').order('updated_at',{ascending:false}).limit(1).maybeSingle(),
    sb.from('whatsapp_accounts').select('id').eq('is_active',true).order('updated_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  if(channelAccountError||!channelAccount?.id)return response({ok:false,error:'channel_account_unavailable'},503);
  if(accountError||!account?.id)return response({ok:false,error:'whatsapp_account_unavailable'},503);

  const {data:resolution,error:resolutionError}=await sb.rpc('resolve_customer_identity_v1',{
    p_phone:phone,
    p_channel:'whatsapp',
    p_channel_account_id:channelAccount.id,
    p_external_user_id:phone,
    p_source:'papoai_webhook',
    p_persist:true
  });
  if(resolutionError)return response({ok:false,error:'identity_resolution_failed'},500);
  const identityDecision=clean(resolution?.decision,40)||'unmatched';
  const matchedCustomerId=identityDecision==='matched'?clean(resolution?.customer_id,80)||null:null;
  const {data:observedIdentity,error:observeIdentityError}=await sb.rpc('observe_customer_channel_identity_v1',{
    p_channel:'whatsapp',
    p_channel_account_id:channelAccount.id,
    p_external_user_id:phone,
    p_identity_kind:'whatsapp_user',
    p_source:'papoai_webhook',
    p_evidence:{
      provider:'papoai',
      papo_contact_id:contactId||null,
      candidate_customer_id:matchedCustomerId,
      resolution_decision:identityDecision,
      resolution_confidence:Number(resolution?.confidence||0)
    }
  });
  if(observeIdentityError)return response({ok:false,error:'channel_identity_observation_failed'},500);

  const {data:matchedCustomer,error:matchedCustomerError}=matchedCustomerId
    ?await sb.from('customers').select('id,name,preferred_reply').eq('id',matchedCustomerId).maybeSingle()
    :{data:null,error:null};
  if(matchedCustomerError)return response({ok:false,error:'customer_lookup_failed'},500);

  const {data:openConversation,error:conversationLookupError}=await sb.from('conversations')
    .select('id,customer_id,referral,source')
    .eq('whatsapp_account_id',account.id).eq('wa_contact_e164',phone).neq('status','closed')
    .order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(conversationLookupError)return response({ok:false,error:'conversation_lookup_failed'},500);

  const papoReferral={
    ...((openConversation?.referral&&typeof openConversation.referral==='object')?openConversation.referral:{}),
    provider:'papoai',
    papo_contact_id:contactId||null,
    papo_contact_name:contactName||null,
    papo_last_seen_at:receivedAt,
    channel_identity_id:observedIdentity?.identity_id||null
  };
  let conversationId=openConversation?.id||null;
  const customerId=matchedCustomerId||openConversation?.customer_id||null;

  if(conversationId){
    const {error:updateError}=await sb.from('conversations').update({
      customer_id:customerId,
      last_inbound_at:receivedAt,
      updated_at:receivedAt,
      referral:papoReferral,
      external_user_id:contactId||phone
    }).eq('id',conversationId);
    if(updateError)return response({ok:false,error:'conversation_update_failed'},500);
  }else{
    const {data:created,error:createError}=await sb.from('conversations').insert({
      whatsapp_account_id:account.id,
      customer_id:customerId,
      wa_contact_e164:phone,
      source:'organic',
      channel:'whatsapp',
      external_user_id:contactId||phone,
      last_inbound_at:receivedAt,
      referral:papoReferral,
      context_summary:contactName?`Contato iniciado no PapoAI: ${contactName}`:'Contato iniciado no PapoAI'
    }).select('id').single();
    if(createError||!created?.id)return response({ok:false,error:'conversation_create_failed'},500);
    conversationId=created.id;
  }

  const {data:room,error:roomError}=await sb.rpc('room_start_for_conversation_v1',{
    p_conversation_id:conversationId,
    p_entry_intent:'home',
    p_entry_message:message||''
  });
  if(roomError||!room?.session_id||!room?.url)return response({ok:false,error:'shopping_room_failed'},500);

  const {data:session}=await sb.from('catalog_sessions').select('metadata').eq('id',room.session_id).maybeSingle();
  await sb.from('catalog_sessions').update({metadata:{
    ...((session?.metadata&&typeof session.metadata==='object')?session.metadata:{}),
    entry_source:'papoai',
    papo_contact_id:contactId||null,
    papo_contact_name:contactName||null,
    papo_phone:phone,
    papo_customer_found:Boolean(matchedCustomerId),
    papo_received_at:receivedAt
  }}).eq('id',room.session_id);

  const canonicalName=clean(matchedCustomer?.name||contactName,160)||null;
  return response({
    ok:true,
    customer_found:Boolean(matchedCustomerId),
    identity_resolution:{decision:identityDecision,confidence:Number(resolution?.confidence||0),conflict:identityDecision==='conflict',channel_identity_id:observedIdentity?.identity_id||null},
    customer:matchedCustomerId?{id:matchedCustomerId,name:canonicalName,phone}:null,
    contact:{name:canonicalName,phone,contact_id:contactId||null},
    shopping_url:room.url,
    session_id:room.session_id,
    conversation_id:conversationId
  });
});
