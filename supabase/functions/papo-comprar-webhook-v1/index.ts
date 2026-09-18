import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const PROVIDER_KEY="papoai";
const ADAPTER_VERSION="cm1.14-v1";
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

function getPath(body:any,path:string){
  let current:any=body;
  for(const part of path.split('.'))current=current&&typeof current==='object'?current[part]:undefined;
  return current;
}

function pick(body:any,paths:string[]){
  for(const path of paths){
    const value=clean(getPath(body,path),1000);
    if(value)return value;
  }
  return '';
}

function pickRaw(body:any,paths:string[]){
  for(const path of paths){
    const value=getPath(body,path);
    if(value!==undefined&&value!==null)return {path,value};
  }
  return {path:'',value:null};
}

function normalizeTags(body:any){
  const found=pickRaw(body,[
    'tags','labels','etiquetas',
    'contact.tags','contact.labels','contact.etiquetas',
    'sender.tags','sender.labels','data.contact.tags','payload.contact.tags'
  ]);
  if(!found.path)return {present:false,source:null,tags:[] as string[]};
  const sourceValue=found.value;
  const raw=Array.isArray(sourceValue)
    ?sourceValue
    :typeof sourceValue==='string'
      ?sourceValue.split(/[,;|]/g)
      :[];
  const tags=[...new Set(raw.map((x:any)=>clean(typeof x==='object'?(x?.name||x?.label||x?.title||x?.value):x,100)).filter(Boolean))].slice(0,100);
  return {present:true,source:found.path,tags};
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
    const params=new URLSearchParams(raw),body:Record<string,string>={};
    for(const [key,value] of params)body[key]=value;
    return body;
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

  // Provider-specific parsing ends here. Everything below uses the canonical adapter contract.
  const rawPhone=pick(body,['phone','whatsapp','phone_number','sender_phone','from','sender.phone','sender.whatsapp','contact.phone','contact.phone_number']);
  const phone=normalizePhone(rawPhone);
  if(!phone)return response({ok:false,error:'invalid_phone'},400);

  const contactName=pick(body,['name','contact_name','sender.name','contact.name']);
  const contactId=pick(body,['contact_id','sender.id','contact.id','id']);
  const message=pick(body,['message','text','body','content','message.text','message.body']);
  const externalMessageId=pick(body,['message_id','messageId','message.id','data.message.id','payload.message.id']);
  const externalEventId=pick(body,['event_id','eventId','event.id','data.event.id','payload.event.id']);
  const rawMessageType=pick(body,['message_type','type','message.type','data.message.type']).toLowerCase();
  const allowedMessageTypes=new Set(['text','image','audio','video','document','location','reaction','button','quick_reply']);
  const normalizedMessageType=allowedMessageTypes.has(rawMessageType)?rawMessageType:(message?'text':'unknown');
  const tagObservation=normalizeTags(body);
  const receivedAt=new Date().toISOString();

  const [{data:channelAccount,error:channelAccountError},{data:account,error:accountError}]=await Promise.all([
    sb.from('channel_accounts').select('id').eq('channel','whatsapp').eq('status','active').order('updated_at',{ascending:false}).limit(1).maybeSingle(),
    sb.from('whatsapp_accounts').select('id').eq('is_active',true).order('updated_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  if(channelAccountError||!channelAccount?.id)return response({ok:false,error:'channel_account_unavailable'},503);
  if(accountError||!account?.id)return response({ok:false,error:'whatsapp_account_unavailable'},503);

  const providerContext={
    adapter_version:ADAPTER_VERSION,
    event_type:rawMessageType||normalizedMessageType,
    tags_field_present:tagObservation.present,
    tags_source:tagObservation.source,
    provider_contact_id:contactId||null
  };

  const {data:ingested,error:ingestError}=await sb.rpc('ingest_channel_adapter_event_v1',{
    p_provider_key:PROVIDER_KEY,
    p_channel:'whatsapp',
    p_channel_account_id:channelAccount.id,
    p_whatsapp_account_id:account.id,
    p_external_user_id:phone,
    p_external_contact_id:contactId||null,
    p_phone:phone,
    p_display_name:contactName||null,
    p_external_message_id:externalMessageId||null,
    p_external_event_id:externalEventId||null,
    p_direction:'inbound',
    p_message_type:normalizedMessageType,
    p_body_text:message||null,
    p_media_refs:[],
    p_tags:tagObservation.tags,
    p_provider_context:providerContext,
    p_referral:{provider_adapter:PROVIDER_KEY},
    p_occurred_at:receivedAt
  });
  if(ingestError)return response({ok:false,error:'adapter_ingest_failed',detail:clean(ingestError.message,500)},500);
  if(ingested?.ignored)return response({...ingested,provider:PROVIDER_KEY});

  if(tagObservation.present){
    await sb.from('channel_provider_adapters')
      .update({
        tag_read_state:'observed_webhook',
        capabilities:{
          normalized_event_ingest:true,
          identity_resolution:true,
          shopping_handoff:true,
          tags_read_verified:false,
          tags_write_verified:false,
          tags_observed_in_webhook:true
        },
        updated_at:receivedAt
      })
      .eq('provider_key',PROVIDER_KEY).eq('channel','whatsapp').eq('channel_account_id',channelAccount.id)
      .eq('tag_read_state','unknown');
  }

  const conversationId=clean(ingested?.conversation_id,80);
  if(!conversationId)return response({ok:false,error:'adapter_conversation_missing'},500);

  // Shopping is a downstream consumer of the canonical conversation, not a PapoAI rule.
  const {data:room,error:roomError}=await sb.rpc('room_start_for_conversation_v1',{
    p_conversation_id:conversationId,
    p_entry_intent:'home',
    p_entry_message:message||''
  });
  if(roomError||!room?.session_id||!room?.url)return response({ok:false,error:'shopping_room_failed'},500);

  const {data:session}=await sb.from('catalog_sessions').select('metadata').eq('id',room.session_id).maybeSingle();
  await sb.from('catalog_sessions').update({metadata:{
    ...((session?.metadata&&typeof session.metadata==='object')?session.metadata:{}),
    entry_source:'channel_adapter',
    provider_key:PROVIDER_KEY,
    provider_contact_id:contactId||null,
    provider_contact_name:contactName||null,
    provider_external_user_id:phone,
    adapter_customer_found:Boolean(ingested?.customer_id),
    adapter_received_at:receivedAt,
    adapter_version:ADAPTER_VERSION
  }}).eq('id',room.session_id);

  let customer:any=null;
  if(ingested?.customer_id){
    const customerR=await sb.from('customers').select('id,name,primary_whatsapp_e164').eq('id',ingested.customer_id).maybeSingle();
    customer=customerR.data||null;
  }

  return response({
    ok:true,
    provider:PROVIDER_KEY,
    adapter_version:ADAPTER_VERSION,
    duplicate:Boolean(ingested?.duplicate),
    customer_found:Boolean(ingested?.customer_id),
    identity_resolution:ingested?.identity_resolution||null,
    customer:customer?{id:customer.id,name:customer.name||contactName||null,phone:customer.primary_whatsapp_e164||phone}:null,
    contact:{name:customer?.name||contactName||null,phone,contact_id:contactId||null},
    tags_observed:tagObservation.present,
    tag_count:tagObservation.tags.length,
    shopping_url:room.url,
    session_id:room.session_id,
    conversation_id:conversationId,
    normalized_event_id:ingested?.normalized_event_id||null,
    external_side_effect:false
  });
});
