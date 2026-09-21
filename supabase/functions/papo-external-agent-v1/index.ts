import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
const clean=(value:unknown,max=1000)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const digits=(value:unknown)=>String(value??'').replace(/\D/g,'');

function safeEqual(a:string,b:string){
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
  if(x.length!==y.length)return false;
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}

function normalizePhone(value:unknown){
  let d=digits(value);
  if(d.startsWith('00'))d=d.slice(2);
  if(d.startsWith('0')&&(d.length===11||d.length===12))d=d.slice(1);
  if(d.length===10||d.length===11)d=`55${d}`;
  if(!d.startsWith('55')||(d.length!==12&&d.length!==13))return '';
  return `+${d}`;
}

function lastUserMessage(messages:unknown){
  const list=Array.isArray(messages)?messages:[];
  for(let i=list.length-1;i>=0;i--){
    const row:any=list[i];
    if(clean(row?.role,40).toLowerCase()==='user')return clean(row?.content,4000);
  }
  return '';
}

function firstName(value:unknown){
  return clean(value,160).split(/\s+/).filter(Boolean)[0]?.slice(0,40)||'';
}

async function authenticate(req:Request,sb:any,body:any){
  const {data:expected,error}=await sb.rpc('get_dona_antonia_papo_comprar_webhook_token_v1');
  if(error||!expected)return {ok:false,status:503,error:'agent_auth_unconfigured'};
  const url=new URL(req.url);
  const bearer=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const supplied=clean(
    req.headers.get('x-papo-webhook-token')||
    req.headers.get('x-dona-antonia-agent-key')||
    url.searchParams.get('webhook_token')||
    body?.webhook_token||
    bearer,
    200
  );
  if(!supplied||!safeEqual(supplied,String(expected)))return {ok:false,status:401,error:'unauthorized'};
  return {ok:true,status:200,error:null};
}

async function upsertConversation(sb:any,accountId:string,phone:string,customerId:string|null,contact:any,receivedAt:string){
  const {data:open,error:lookupError}=await sb.from('conversations')
    .select('id,customer_id,referral')
    .eq('whatsapp_account_id',accountId)
    .eq('wa_contact_e164',phone)
    .neq('status','closed')
    .order('updated_at',{ascending:false})
    .limit(1)
    .maybeSingle();
  if(lookupError)throw new Error('conversation_lookup_failed');

  const referral={
    ...((open?.referral&&typeof open.referral==='object')?open.referral:{}),
    provider:'papoai',
    papo_contact_id:clean(contact?.id,200)||null,
    papo_contact_name:clean(contact?.complete_name||contact?.name,180)||null,
    papo_external_agent:true,
    papo_last_seen_at:receivedAt
  };
  const resolvedCustomerId=customerId||open?.customer_id||null;
  if(open?.id){
    const {error}=await sb.from('conversations').update({
      customer_id:resolvedCustomerId,
      external_user_id:clean(contact?.id,200)||phone,
      referral,
      last_inbound_at:receivedAt,
      updated_at:receivedAt
    }).eq('id',open.id);
    if(error)throw new Error('conversation_update_failed');
    return {id:open.id,customerId:resolvedCustomerId};
  }

  const {data:created,error}=await sb.from('conversations').insert({
    whatsapp_account_id:accountId,
    customer_id:resolvedCustomerId,
    wa_contact_e164:phone,
    source:'organic',
    channel:'whatsapp',
    external_user_id:clean(contact?.id,200)||phone,
    last_inbound_at:receivedAt,
    referral,
    context_summary:'Contato atendido pelo agente externo PapoAI via Supabase'
  }).select('id').single();
  if(error||!created?.id)throw new Error('conversation_create_failed');
  return {id:created.id,customerId:resolvedCustomerId};
}

async function synthesizeAudio(sb:any,text:string,sessionId:string){
  const [{data:key,error:keyError},{data:profile,error:profileError}]=await Promise.all([
    sb.rpc('get_conversation_worker_provider_secret_v1'),
    sb.from('ai_voice_profiles').select('id,model,voice,speed,instructions,output_format,is_active').eq('id','dona_antonia_marin_b_v1').maybeSingle()
  ]);
  if(keyError||!key||profileError||!profile?.is_active)return {audio_url:null,audio_error:'tts_unavailable'};

  const format=clean(profile.output_format||'mp3',20)||'mp3';
  const tts=await fetch('https://api.openai.com/v1/audio/speech',{
    method:'POST',
    headers:{Authorization:`Bearer ${String(key)}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      model:clean(profile.model||'gpt-4o-mini-tts',80),
      voice:clean(profile.voice||'marin',80),
      input:text.slice(0,3500),
      instructions:clean(profile.instructions,1200)||undefined,
      speed:Number(profile.speed||1),
      response_format:format
    })
  });
  if(!tts.ok)return {audio_url:null,audio_error:`tts_http_${tts.status}`};
  const bytes=new Uint8Array(await tts.arrayBuffer());
  if(!bytes.length||bytes.length>8*1024*1024)return {audio_url:null,audio_error:'tts_invalid_size'};

  const path=`papo-agent/${sessionId}/${crypto.randomUUID()}.${format}`;
  const contentType=format==='mp3'?'audio/mpeg':format==='wav'?'audio/wav':'audio/ogg';
  const upload=await sb.storage.from('shopping-room-media').upload(path,bytes,{contentType,upsert:false});
  if(upload.error)return {audio_url:null,audio_error:'audio_upload_failed'};
  const signed=await sb.storage.from('shopping-room-media').createSignedUrl(path,60*30);
  if(signed.error||!signed.data?.signedUrl)return {audio_url:null,audio_error:'audio_sign_failed'};
  return {audio_url:signed.data.signedUrl,audio_error:null};
}

Deno.serve(async(req:Request)=>{
  if(req.method==='GET')return json({ok:true,service:'papo-external-agent-v1',protocol:'conversation.message',make:false});
  if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);

  const supabaseUrl=Deno.env.get('SUPABASE_URL')||'';
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!supabaseUrl||!serviceKey)return json({ok:false,error:'server_config'},500);
  const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  let body:any={};
  try{body=await req.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  const auth=await authenticate(req,sb,body);
  if(!auth.ok)return json({ok:false,error:auth.error},auth.status);

  const event=clean(body?.event,80);
  if(event&&event!=='conversation.message')return json({ok:false,error:'unsupported_event'},400);
  const contact=body?.contact&&typeof body.contact==='object'?body.contact:{};
  const phone=normalizePhone(contact?.phone_number||contact?.phone_number_formatted);
  if(!phone)return json({ok:false,error:'invalid_phone'},400);
  const userMessage=lastUserMessage(body?.messages);
  const receivedAt=new Date().toISOString();

  const {data:lookup,error:lookupError}=await sb.rpc('lookup_customer_by_phone',{p_phone:phone});
  if(lookupError)return json({ok:false,error:'customer_lookup_failed'},500);
  const match=Array.isArray(lookup)?lookup[0]:lookup;
  const matchedCustomerId=match?.customer_id||null;

  const {data:account,error:accountError}=await sb.from('whatsapp_accounts')
    .select('id,phone_number_id').eq('is_active',true).order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(accountError||!account?.id)return json({ok:false,error:'whatsapp_account_unavailable'},503);

  let conversation;
  try{conversation=await upsertConversation(sb,account.id,phone,matchedCustomerId,contact,receivedAt)}
  catch(error){return json({ok:false,error:clean((error as Error)?.message,120)||'conversation_failed'},500)}

  const {data:room,error:roomError}=await sb.rpc('room_start_for_conversation_v1',{
    p_conversation_id:conversation.id,
    p_entry_intent:'home',
    p_entry_message:userMessage
  });
  if(roomError||!room?.session_id||!room?.url)return json({ok:false,error:'shopping_room_failed'},500);

  let customer:any=null;
  if(conversation.customerId){
    const {data}=await sb.from('customers').select('id,name,primary_whatsapp_e164,preferred_reply').eq('id',conversation.customerId).maybeSingle();
    customer=data||null;
  }
  const known=Boolean(customer?.id);
  const name=clean(customer?.name||match?.customer_name||contact?.complete_name||contact?.name,160);
  const first=firstName(name);
  const shoppingUrl=String(room.url);
  const replyText=known
    ?`${first?`Oi, ${first}! `:'Oi! '}Já reconheci seu cadastro. Para continuar sua compra sem preencher o telefone de novo, abra aqui: ${shoppingUrl}`
    :`${first?`Oi, ${first}! `:'Oi! '}Para continuar sua compra, abra aqui: ${shoppingUrl}`;

  const preferred=clean(customer?.preferred_reply||'auto',20).toLowerCase();
  const replyMode=known&&preferred==='audio'?'audio':'text';
  let audioUrl:string|null=null,audioError:string|null=null;
  if(replyMode==='audio'){
    const audio=await synthesizeAudio(sb,replyText,room.session_id);
    audioUrl=audio.audio_url;audioError=audio.audio_error;
  }

  const {data:session}=await sb.from('catalog_sessions').select('metadata').eq('id',room.session_id).maybeSingle();
  await sb.from('catalog_sessions').update({metadata:{
    ...((session?.metadata&&typeof session.metadata==='object')?session.metadata:{}),
    entry_source:'papoai_external_agent',
    papo_external_session_uid:clean(body?.session?.uid,200)||null,
    papo_external_agent_id:body?.agent?.id??null,
    papo_contact_id:clean(contact?.id,200)||null,
    papo_phone:phone,
    papo_customer_found:known,
    papo_reply_mode:replyMode,
    papo_received_at:receivedAt
  }}).eq('id',room.session_id);

  const assistantMessage={role:'assistant',content:replyText};
  return json({
    ok:true,
    response:replyText,
    message:replyText,
    content:replyText,
    messages:[assistantMessage],
    reply:{type:replyMode,text:replyText,audio_url:audioUrl},
    reply_mode:replyMode,
    audio_url:audioUrl,
    audio_error:audioError,
    shopping_url:shoppingUrl,
    customer_found:known,
    customer:known?{id:customer.id,name:customer.name,phone,preferred_reply:preferred}:null,
    contact:{id:clean(contact?.id,200)||null,name:name||null,phone},
    session:{uid:clean(body?.session?.uid,200)||null,shopping_session_id:room.session_id},
    conversation_id:conversation.id
  });
});
