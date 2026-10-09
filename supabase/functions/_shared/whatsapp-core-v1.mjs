const SECRET_KEYS=new Set(['token','access_token','refresh_token','authorization','apikey','api_key','secret','client_secret','password','senha','key','webhook_key','signature','cookie','set-cookie']);
const clean=(value,max=8000)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const digits=(value,max=24)=>String(value??'').replace(/\D+/g,'').slice(0,max);
const obj=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const arr=(value)=>Array.isArray(value)?value:[];

export function normalizePhone(value){
  let d=digits(value,20);
  if(d.startsWith('00'))d=d.slice(2);
  let local='';
  if(d.startsWith('55')&&(d.length===12||d.length===13))local=d.slice(2);
  else if(d.length===10||d.length===11)local=d;
  else return null;
  if(local.length===10&&/[6-9]/.test(local.charAt(2)))local=local.slice(0,2)+'9'+local.slice(2);
  if(local.length!==11)return null;
  return '+55'+local;
}

export async function hashPayload(raw){
  const source=typeof raw==='string'?raw:JSON.stringify(raw??{});
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function redactWebhookPayload(value,depth=0){
  if(depth>8)return '[depth_limit]';
  if(value===null||value===undefined)return value;
  if(Array.isArray(value))return value.slice(0,200).map(x=>redactWebhookPayload(x,depth+1));
  if(typeof value==='object'){
    const out={};let count=0;
    for(const [key,val] of Object.entries(value)){
      if(count++>=200){out.__truncated__=true;break}
      const normalized=String(key).toLowerCase().replace(/[^a-z0-9_\-]/g,'');
      out[key]=SECRET_KEYS.has(normalized)||normalized.includes('password')||normalized.includes('secret')||normalized.includes('authorization')?'[redacted]':redactWebhookPayload(val,depth+1);
    }
    return out;
  }
  if(typeof value==='string')return value.slice(0,8000);
  return value;
}

function epochIso(value,fallback=null){
  if(value!==null&&value!==undefined&&String(value).trim()!==''){
    const raw=String(value).trim();
    if(/^\d+(?:\.\d+)?$/.test(raw)){
      const n=Number(raw);
      const ms=n>=1e12?n:n*1000;
      const d=new Date(ms);
      if(!Number.isNaN(d.getTime()))return d.toISOString();
    }
    const d=new Date(raw);
    if(!Number.isNaN(d.getTime()))return d.toISOString();
  }
  if(fallback){const d=new Date(fallback);if(!Number.isNaN(d.getTime()))return d.toISOString()}
  return null;
}

function canonicalType(value){
  const t=clean(value,40).toLowerCase();
  if(['text','audio','image','document','location','interactive','button','template','reaction'].includes(t))return t;
  if(t==='text/plain')return 'text';
  if(t==='voice'||t==='ptt'||t.startsWith('audio/'))return 'audio';
  if(t.startsWith('image/'))return 'image';
  if(t.startsWith('video/'))return 'unknown';
  if(t==='file'||t.startsWith('application/')||t.startsWith('text/'))return 'document';
  return 'unknown';
}

function textFromPapoMessage(message){
  if(typeof message?.content==='string')return clean(message.content,8000)||null;
  if(typeof message?.body==='string')return clean(message.body,8000)||null;
  if(typeof message?.text==='string')return clean(message.text,8000)||null;
  if(typeof message?.text?.body==='string')return clean(message.text.body,8000)||null;
  if(typeof message?.caption==='string')return clean(message.caption,8000)||null;
  return null;
}

function papoEventName(root,data){
  const eventObj=obj(root.event);
  return clean(eventObj.type??eventObj.name??root.event??root.event_name??root.eventName??root.type??data.event,120)||'message.received';
}

function papoLocation(message){
  const candidates=[message?.location,message?.description];
  for(const candidate of candidates){
    let value=candidate;
    if(typeof value==='string'){try{value=JSON.parse(value)}catch{continue}}
    const loc=obj(value);const latitude=Number(loc.latitude),longitude=Number(loc.longitude);
    if(Number.isFinite(latitude)&&Number.isFinite(longitude))return {name:clean(loc.name,240)||null,address:clean(loc.address,500)||null,latitude,longitude};
  }
  return null;
}

function papoMedia(message,type){
  if(!['image','audio','document'].includes(type))return null;
  return {kind:type,mime_type:clean(message?.mimetype??message?.mime_type,160)||null,filename:clean(message?.filename,260)||null,has_provider_url:Boolean(clean(message?.media_url,2000))};
}

function numericOrRaw(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)?n:clean(value,180)||null;
}

export function canonicalMessageFromPapoAi(payload,context={}){
  const root=obj(payload),data=obj(root.data),message=obj(data.message&&typeof data.message==='object'?data.message:root.message);
  const contact=obj(data.contact),conversation=obj(data.conversation),session=obj(data.session),eventObj=obj(root.event);
  const eventName=papoEventName(root,data);
  const inbound=/message[._-]?received/i.test(eventName)||eventName==='message.received';
  const outbound=/message[._-]?sent/i.test(eventName)||eventName==='message.sent';
  if(!inbound&&!outbound)return null;

  const direction=outbound?'outbound':'inbound';
  const accountId=clean(context.whatsappAccountId,80)||null;
  const phone=normalizePhone(outbound
    ? (message.phone_number_to??contact.phone??contact.telefone??data.phone??message.to??root.phone??root.telefone)
    : (message.phone_number_from??contact.phone??contact.telefone??data.phone??message.from??root.phone??root.telefone));
  const channelPhone=normalizePhone(outbound?message.phone_number_from:message.phone_number_to);
  const providerMessageId=clean(message.external_id??message.id??message.message_id??data.message_id??root.message_id,240)||null;
  const providerConversationId=clean(session.uid??conversation.id??data.conversation_id??root.conversation_id,180)||null;
  const location=papoLocation(message);
  const messageType=location?'location':canonicalType(message.type??message.mimetype??message.mime_type??data.message_type??root.message_type??(textFromPapoMessage(message)?'text':'unknown'));
  const occurredAt=epochIso(message.timestamp??data.timestamp??root.timestamp,message.created_at??eventObj.occurred_at??context.receivedAt??new Date().toISOString());
  const associable=Boolean(accountId&&phone);
  const media=papoMedia(message,messageType);
  const status=clean(message.status,40)|| (outbound?'sent':'received');
  const metadata={
    source:'papoai',
    raw_type:clean(message.type??message.mimetype??message.mime_type,160)||null,
    contact_id:clean(contact.id??session.contact_id,180)||null,
    client_message_id:clean(message.client_message_id,240)||null,
    agentbot_id:numericOrRaw(session.agentbot_id),
    session_user_id:numericOrRaw(session.user_id),
    authorship_reliable:outbound?false:null,
    ...(media?{media}:{}),
    ...(location?{location}:{})
  };

  return {
    kind:'message',provider:'papoai',associable,
    reason:associable?null:(!accountId?'account_unresolved':'phone_unresolved'),
    whatsapp_account_id:accountId,
    phone_number_id:null,
    channel_phone_e164:channelPhone,
    provider_event_id:clean(context.providerEventId??root.event_id??root.eventId,180)||providerMessageId,
    provider_message_id:providerMessageId,
    phone_e164:phone,
    event_type:outbound?'message.sent':'message.received',
    received_at:occurredAt,
    message:{
      direction,
      message_type:messageType,
      provider_conversation_id:providerConversationId,
      text_body:textFromPapoMessage(message),
      status_current:status,
      sender_kind:outbound?'unknown':'customer',
      sender_ref:null,
      ...(outbound?{sent_at:occurredAt}:{received_at:occurredAt}),
      metadata
    }
  };
}

function metaText(message,type){
  if(type==='text')return clean(message?.text?.body,8000)||null;
  if(type==='image'||type==='document'||type==='video')return clean(message?.[type]?.caption,8000)||null;
  if(type==='interactive'){const i=obj(message.interactive);return clean(i.button_reply?.title??i.list_reply?.title??i.nfm_reply?.body,8000)||null}
  if(type==='button')return clean(message?.button?.text,8000)||null;
  if(type==='reaction')return clean(message?.reaction?.emoji,80)||null;
  return null;
}

function metaMedia(message,type){
  if(!['audio','image','document','video','sticker'].includes(type))return null;
  const m=obj(message?.[type]);
  return {provider_media_id:clean(m.id,240)||null,mime_type:clean(m.mime_type,160)||null,sha256:clean(m.sha256,180)||null,filename:clean(m.filename,260)||null,voice:m.voice===true};
}

export function canonicalMessagesFromMeta(payload,accountResolver=()=>null){
  const out=[];
  for(const entry of arr(payload?.entry)){
    for(const change of arr(entry?.changes)){
      const field=clean(change?.field,80);
      const value=obj(change?.value),metadata=obj(value.metadata);
      const phoneNumberId=clean(metadata.phone_number_id,180)||null;
      const resolved=phoneNumberId?accountResolver(phoneNumberId,value,entry):null;
      const accountId=typeof resolved==='string'?resolved:clean(resolved?.id,80)||null;

      for(const message of arr(value.messages)){
        const type=canonicalType(message?.type);const phone=normalizePhone(message?.from);const providerMessageId=clean(message?.id,240)||null;
        const receivedAt=epochIso(message?.timestamp,new Date().toISOString());const media=metaMedia(message,type);const associable=Boolean(accountId&&phone&&providerMessageId);
        out.push({kind:'message',provider:'meta',associable,reason:associable?null:(!accountId?'account_unresolved':(!phone?'phone_unresolved':'message_id_missing')),whatsapp_account_id:accountId,phone_number_id:phoneNumberId,waba_id:clean(entry?.id,180)||null,provider_event_id:providerMessageId?`message:${providerMessageId}`:null,provider_message_id:providerMessageId,phone_e164:phone,event_type:'message.received',received_at:receivedAt,message:{direction:'inbound',message_type:type,provider_conversation_id:null,text_body:metaText(message,type),status_current:'received',sender_kind:'customer',sender_ref:null,received_at:receivedAt,metadata:{source:'meta',source_event:'messages',raw_type:clean(message?.type,60)||null,contact_name:clean(value.contacts?.[0]?.profile?.name,180)||null,context_message_id:clean(message?.context?.id,240)||null,button_payload:type==='button'?clean(message?.button?.payload,256)||null:null,interactive:message?.interactive?redactWebhookPayload(message.interactive):null,location:type==='location'&&message?.location?{latitude:Number(message.location.latitude),longitude:Number(message.location.longitude),name:clean(message.location.name,240)||null,address:clean(message.location.address,600)||null,url:clean(message.location.url,800)||null}:null,media}}});
      }

      if(field==='smb_message_echoes'){
        for(const message of arr(value.message_echoes)){
          const type=canonicalType(message?.type);const phone=normalizePhone(message?.to);const providerMessageId=clean(message?.id,240)||null;
          const sentAt=epochIso(message?.timestamp,new Date().toISOString());const media=metaMedia(message,type);const associable=Boolean(accountId&&phone&&providerMessageId);
          out.push({kind:'message',provider:'meta',associable,reason:associable?null:(!accountId?'account_unresolved':(!phone?'phone_unresolved':'message_id_missing')),whatsapp_account_id:accountId,phone_number_id:phoneNumberId,waba_id:clean(entry?.id,180)||null,provider_event_id:providerMessageId?`echo:${providerMessageId}`:null,provider_message_id:providerMessageId,phone_e164:phone,event_type:'message.sent',received_at:sentAt,message:{direction:'outbound',message_type:type,provider_conversation_id:null,text_body:metaText(message,type),status_current:'sent',sender_kind:'human',sender_ref:'whatsapp_business_app',sent_at:sentAt,metadata:{source:'meta',source_event:'smb_message_echoes',business_app_echo:true,raw_type:clean(message?.type,60)||null,context_message_id:clean(message?.context?.id,240)||null,interactive:message?.interactive?redactWebhookPayload(message.interactive):null,media}}});
        }
      }
    }
  }
  return out;
}

export function statusEventsFromMeta(payload){
  const out=[];
  for(const entry of arr(payload?.entry)){
    for(const change of arr(entry?.changes)){
      const value=obj(change?.value),metadata=obj(value.metadata);const phoneNumberId=clean(metadata.phone_number_id,180)||null;
      for(const status of arr(value.statuses)){
        const errors=arr(status?.errors),error=obj(errors[0]),conversation=obj(status?.conversation);const state=clean(status?.status,40).toLowerCase();
        if(!['sent','delivered','read','failed','deleted'].includes(state))continue;
        out.push({provider:'meta',phone_number_id:phoneNumberId,waba_id:clean(entry?.id,180)||null,provider_message_id:clean(status?.id,240)||null,status:state==='deleted'?'cancelled':state,occurred_at:epochIso(status?.timestamp,new Date().toISOString()),recipient_phone_e164:normalizePhone(status?.recipient_id),provider_conversation_id:clean(conversation.id,240)||null,error_code:error.code===undefined||error.code===null?null:String(error.code),error_title:clean(error.title,500)||null,error_detail:clean(error.message??error.error_data?.details,1200)||null,payload:redactWebhookPayload(status)});
      }
    }
  }
  return out;
}
