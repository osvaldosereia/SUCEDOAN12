import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";
import {
  normalizeExternalAgentPayload,
  stableProviderEventKey,
  isReservedLabHandoff,
  buildLabTextResponse,
  buildLabHandoffResponse,
  buildLabSilentResponse,
} from "../_shared/papoai-agent-external-contract-v1.mjs";

const PROVIDER_KEY='papoai';
const CHANNEL='whatsapp';
const RESERVED_HANDOFF_COMMAND='TESTE_HANDOFF_DONA_ANTONIA';
const LAB_GUARD={external_side_effect:false};

function jsonResponse(body:unknown,status=200,responseBearer=''){
  const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
  if(responseBearer) headers['Authorization']=`Bearer ${responseBearer}`;
  return new Response(JSON.stringify(body),{status,headers});
}

function safeEqual(a:string,b:string){
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
  if(x.length!==y.length)return false;
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}

async function requestHash(value:string){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

Deno.serve(async(req:Request)=>{
  const started=Date.now();
  const correlationId=crypto.randomUUID();
  if(req.method!=='POST')return jsonResponse({error:'method_not_allowed',correlation_id:correlationId},405);

  let body:any;
  try{body=await req.json();}
  catch{return jsonResponse({error:'invalid_json',correlation_id:correlationId},400);}

  const supabaseUrl=Deno.env.get('SUPABASE_URL');
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!supabaseUrl||!serviceKey)return jsonResponse({error:'server_config',correlation_id:correlationId},500);
  const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  const {data:expected,error:keyError}=await sb.rpc('get_papoai_agent_external_lab_key_v1');
  if(keyError||!expected)return jsonResponse({error:'webhook_not_configured',correlation_id:correlationId},503);

  const {data:responseBearer,error:responseBearerError}=await sb.rpc('get_papoai_agent_external_response_bearer_v1');
  if(responseBearerError||!responseBearer)return jsonResponse({error:'response_bearer_not_configured',correlation_id:correlationId},503);

  const suppliedValues=(req.headers.get('x-api-key')||'')
    .split(',')
    .map((value)=>value.trim())
    .filter(Boolean);
  const authorized=suppliedValues.some((value)=>safeEqual(value,String(expected)));
  if(!authorized)return jsonResponse({error:'unauthorized',correlation_id:correlationId},401);

  let normalized:any;
  try{normalized=normalizeExternalAgentPayload(body);}
  catch(error){
    const code=String((error as Error)?.message||'invalid_payload');
    return jsonResponse({error:code,correlation_id:correlationId},400);
  }

  const {data:adapter,error:adapterError}=await sb.from('channel_provider_adapters')
    .select('id,channel_account_id,status,inbound_mode,outbound_mode')
    .eq('provider_key',PROVIDER_KEY).eq('channel',CHANNEL)
    .in('status',['temporary_active','active'])
    .order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(adapterError||!adapter?.id)return jsonResponse({error:'adapter_unavailable',correlation_id:correlationId},503);

  const {data:lab,error:labError}=await sb.rpc('get_papoai_agent_external_lab_config_v1',{p_adapter_id:adapter.id});
  if(labError||!lab)return jsonResponse({error:'lab_not_configured',correlation_id:correlationId},503);

  if(lab.enabled!==true){
    return jsonResponse(buildLabSilentResponse({sessionKey:normalized.sessionKey,correlationId,reason:'lab_disabled'}),200,responseBearer);
  }

  const occurredBucket=new Date(Math.floor(Date.now()/60000)*60000).toISOString();
  const providerEventKey=await stableProviderEventKey({...normalized,occurredBucket});
  const {data:prior}=await sb.from('channel_provider_agent_lab_calls')
    .select('response_body').eq('adapter_id',adapter.id).eq('provider_event_key',providerEventKey).maybeSingle();
  if(prior?.response_body)return jsonResponse(prior.response_body,200,responseBearer);

  const {data:waAccount,error:waError}=await sb.from('whatsapp_accounts')
    .select('id').eq('is_active',true).order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(waError||!waAccount?.id)return jsonResponse({error:'whatsapp_account_unavailable',correlation_id:correlationId},503);

  const {data:ingested,error:ingestError}=await sb.rpc('ingest_channel_adapter_event_v1',{
    p_provider_key:PROVIDER_KEY,
    p_channel:CHANNEL,
    p_channel_account_id:adapter.channel_account_id,
    p_whatsapp_account_id:waAccount.id,
    p_external_user_id:normalized.phoneE164,
    p_external_contact_id:null,
    p_phone:normalized.phoneE164,
    p_display_name:normalized.displayName,
    p_external_message_id:normalized.externalMessageId,
    p_external_event_id:normalized.externalEventId,
    p_direction:'inbound',
    p_message_type:normalized.messageType||'text',
    p_body_text:normalized.messageText,
    p_media_refs:[],
    p_tags:[],
    p_provider_context:{...normalized.providerContext,agent_external:true,session_key:normalized.sessionKey},
    p_referral:{provider_adapter:PROVIDER_KEY,agent_external_lab:true},
    p_occurred_at:new Date().toISOString()
  });
  if(ingestError)return jsonResponse({error:'adapter_ingest_failed',correlation_id:correlationId},500);

  const {data:existingSession}=await sb.from('channel_provider_agent_lab_sessions')
    .select('id,status,paused_until,message_count').eq('adapter_id',adapter.id).eq('provider_session_key',normalized.sessionKey).maybeSingle();
  const sessionPayload={
    adapter_id:adapter.id,
    provider_session_key:normalized.sessionKey,
    phone_e164:normalized.phoneE164,
    conversation_id:ingested?.conversation_id||null,
    customer_id:ingested?.customer_id||null,
    message_count:Number(existingSession?.message_count||0)+1,
    last_correlation_id:correlationId,
    last_external_message_id:normalized.externalMessageId,
    last_external_event_id:normalized.externalEventId,
    last_seen_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  };
  const {data:labSession,error:sessionError}=await sb.from('channel_provider_agent_lab_sessions')
    .upsert(sessionPayload,{onConflict:'adapter_id,provider_session_key'}).select('id').single();
  if(sessionError||!labSession?.id)return jsonResponse({error:'lab_session_failed',correlation_id:correlationId},500);

  const reqSummary={
    message_length:normalized.messageText.length,
    history_count:normalized.history.length,
    has_media:Boolean(normalized.providerContext?.has_media),
    has_reply:Boolean(normalized.providerContext?.has_reply),
    phone:normalized.phoneE164,
    session_key:normalized.sessionKey,
    external_side_effect:false
  };
  const callInsert={
    correlation_id:correlationId,adapter_id:adapter.id,lab_session_id:labSession.id,
    provider_event_key:providerEventKey,external_message_id:normalized.externalMessageId,
    external_event_id:normalized.externalEventId,request_hash:await requestHash(normalized.messageText),
    processing_status:'normalized',request_summary:reqSummary
  };
  const {error:callError}=await sb.from('channel_provider_agent_lab_calls').insert(callInsert);
  if(callError){
    const {data:raced}=await sb.from('channel_provider_agent_lab_calls').select('response_body')
      .eq('adapter_id',adapter.id).eq('provider_event_key',providerEventKey).maybeSingle();
    if(raced?.response_body)return jsonResponse(raced.response_body,200,responseBearer);
    return jsonResponse({error:'lab_call_failed',correlation_id:correlationId},500);
  }

  await sb.rpc('set_channel_provider_capability_state_v1',{
    p_adapter_id:adapter.id,p_capability_key:'agent_external.request',p_state:'verified_lab',
    p_evidence_source:'lab_http',p_evidence:{correlation_id:correlationId,normalized_event_id:ingested?.normalized_event_id||null}
  });

  const {data:freshSession}=await sb.from('channel_provider_agent_lab_sessions')
    .select('id,status,paused_until,message_count').eq('adapter_id',adapter.id).eq('provider_session_key',normalized.sessionKey).maybeSingle();

  let responseBody:any;
  let processingStatus='responded';
  let responseKind='text';
  const pausedUntil=freshSession?.paused_until?new Date(freshSession.paused_until):null;
  const humanActive=freshSession?.status==='paused'&&(!pausedUntil||pausedUntil.getTime()>Date.now());
  const elapsed=Date.now()-started;
  const timeoutMs=Math.max(1000,Number(lab.response_timeout_seconds||20)*1000);

  if(humanActive){
    processingStatus='silent';responseKind='silent';
    responseBody=buildLabSilentResponse({sessionKey:normalized.sessionKey,correlationId,reason:'human_active',pausedUntil:freshSession?.paused_until||null});
  }else if(isReservedLabHandoff(normalized.messageText)&&normalized.messageText.toUpperCase()===RESERVED_HANDOFF_COMMAND){
    processingStatus='handoff';responseKind='handoff';
    responseBody=buildLabHandoffResponse({text:'Vou transferir este teste para atendimento humano.',sessionKey:normalized.sessionKey,correlationId,reason:'lab_reserved_command'});
  }else if(elapsed>=timeoutMs){
    processingStatus='handoff';responseKind='handoff';
    responseBody=buildLabHandoffResponse({text:'O teste demorou além do limite. Vou transferir para atendimento humano.',sessionKey:normalized.sessionKey,correlationId,reason:'lab_timeout'});
  }else{
    responseBody=buildLabTextResponse({text:String(lab.fixed_response_text),sessionKey:normalized.sessionKey,correlationId});
  }

  await sb.from('channel_provider_agent_lab_calls').update({
    processing_status:processingStatus,response_kind:responseKind,http_status:200,duration_ms:Date.now()-started,
    response_summary:{handoff:Boolean(responseBody?.handoff),silent:Boolean(responseBody?.silent),reason:responseBody?.reason||null,...LAB_GUARD},
    response_body:responseBody,updated_at:new Date().toISOString()
  }).eq('correlation_id',correlationId);

  return jsonResponse(responseBody,200,responseBearer);
});
