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
import {classifyCommerceIntent} from "../_shared/papoai-commerce-intent-v1.mjs";

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


function moneyBR(value:any){
  const n=Number(value||0);
  return 'R$ '+n.toFixed(2).replace('.',',');
}
function commerceTextResponse({text,mediaUrl,sessionKey,correlationId,handoff=false,reason=null}:any){
  const message:any={text:String(text||'').trim()};
  if(mediaUrl)message.media_url=String(mediaUrl);
  return {message,handoff:Boolean(handoff),reason,session_id:sessionKey,correlation_id:correlationId};
}
async function resolveOpenAiKey(sb:any){
  let key=Deno.env.get('OPENAI_API_KEY')||'';
  if(!key){try{const q=await sb.rpc('get_conversation_worker_provider_secret_v1');if(typeof q.data==='string')key=q.data}catch{}}
  return key;
}
function basketsText(items:any[]){
  const lines=(Array.isArray(items)?items:[]).map((b:any)=>`• ${b.display_name||b.name} — ${moneyBR(b.commercial_price)}`);
  return lines.length?`Estas são nossas cestas disponíveis:\n\n${lines.join('\n')}\n\nSe quiser, me diga o nome de uma delas que eu mando a lista completa do que vem.`:'Não encontrei cestas disponíveis agora.';
}
function productsText(items:any[]){
  const list=(Array.isArray(items)?items:[]).slice(0,6);
  if(!list.length)return 'Não encontrei um produto disponível que combine com esse pedido agora.';
  return list.map((p:any)=>`• ${p.name} — ${moneyBR(p.commercial_price??p.offer_price??p.regular_price)}${p.is_offer?' (oferta)':''}`).join('\n');
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

  const suppliedResponseToken=(req.headers.get('x-papo-response-token')||'')
    .trim()
    .replace(/^Bearer\s+/i,'')
    .slice(0,1000);
  const {data:storedResponseBearer}=suppliedResponseToken
    ? {data:null}
    : await sb.rpc('get_papoai_agent_external_response_bearer_v1');
  const responseBearer=suppliedResponseToken||String(storedResponseBearer||'');
  if(!responseBearer)return jsonResponse({error:'response_bearer_not_configured',correlation_id:correlationId},503);

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

  if(normalized.triggerRole!=='user'){
    return jsonResponse(buildLabSilentResponse({
      sessionKey:normalized.sessionKey,
      correlationId,
      reason:'non_user_trigger',
      handoff:false
    }),200,responseBearer);
  }

  const {data:adapter,error:adapterError}=await sb.from('channel_provider_adapters')
    .select('id,channel_account_id,status,inbound_mode,outbound_mode')
    .eq('provider_key',PROVIDER_KEY).eq('channel',CHANNEL)
    .in('status',['temporary_active','active'])
    .order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(adapterError||!adapter?.id)return jsonResponse({error:'adapter_unavailable',correlation_id:correlationId},503);

  const {data:lab,error:labError}=await sb.rpc('get_papoai_agent_external_lab_config_v1',{p_adapter_id:adapter.id});
  if(labError||!lab)return jsonResponse({error:'lab_not_configured',correlation_id:correlationId},503);

  const internalPhones=new Set(
    Array.isArray(lab?.metadata?.blocked_internal_phones)
      ? lab.metadata.blocked_internal_phones.map((value:string)=>String(value))
      : []
  );
  if(internalPhones.has(normalized.phoneE164)){
    return jsonResponse(buildLabSilentResponse({
      sessionKey:normalized.sessionKey,
      correlationId,
      reason:'internal_company_number',
      handoff:false
    }),200,responseBearer);
  }

  const {data:commerceCfg}=await sb.rpc('get_papoai_commerce_brain_config_v1');
  const commerceEnabled=commerceCfg?.enabled===true;
  if(lab.enabled!==true&&!commerceEnabled){
    return jsonResponse(buildLabSilentResponse({sessionKey:normalized.sessionKey,correlationId,reason:'all_brains_disabled',handoff:false}),200,responseBearer);
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
    responseBody=buildLabSilentResponse({sessionKey:normalized.sessionKey,correlationId,reason:'human_active',pausedUntil:freshSession?.paused_until||null,handoff:false});
  }else if(lab.enabled===true){
    if(isReservedLabHandoff(normalized.messageText)&&normalized.messageText.toUpperCase()===RESERVED_HANDOFF_COMMAND){
      processingStatus='handoff';responseKind='handoff';
      responseBody=buildLabHandoffResponse({text:'Vou transferir este teste para atendimento humano.',sessionKey:normalized.sessionKey,correlationId,reason:'lab_reserved_command'});
    }else if(elapsed>=timeoutMs){
      processingStatus='handoff';responseKind='handoff';
      responseBody=buildLabHandoffResponse({text:'O teste demorou além do limite. Vou transferir para atendimento humano.',sessionKey:normalized.sessionKey,correlationId,reason:'lab_timeout'});
    }else{
      responseBody=buildLabTextResponse({text:String(lab.fixed_response_text),sessionKey:normalized.sessionKey,correlationId});
    }
  }else{
    const historyLimit=Math.max(1,Math.min(20,Number(commerceCfg?.max_history_messages||12)));
    const apiKey=commerceCfg?.ai_enabled===true?await resolveOpenAiKey(sb):'';
    const intent=await classifyCommerceIntent({
      message:normalized.messageText,
      history:normalized.history.slice(-historyLimit),
      apiKey,
      model:(Deno.env.get('OPENAI_CONVERSATION_MODEL')||'gpt-5.6-luna')
    });
    const conversationId=ingested?.conversation_id||null;
    let result:any=null;
    let text='';

    if(intent.intent==='handoff'){
      processingStatus='handoff';responseKind='handoff';
      responseBody=commerceTextResponse({text:'Claro 😊 Vou chamar alguém da nossa equipe para continuar com você.',sessionKey:normalized.sessionKey,correlationId,handoff:true,reason:'customer_requested_human'});
    }else if(intent.intent==='list_baskets'){
      const q=await sb.rpc('get_papoai_commerce_basket_catalog_v1');
      result=q.data;
      text=basketsText(result);
    }else if(intent.intent==='basket_detail'){
      const q=await sb.rpc('format_papoai_commerce_basket_message_v1',{p_basket_query:intent.basket||intent.query});
      result=q.data;
      text=result?.message_text||'Não consegui localizar essa cesta. Me diga o nome dela que eu verifico.';
    }else if(intent.intent==='search_products'){
      const q=await sb.rpc('search_papoai_commerce_products_v1',{p_query:intent.query||normalized.messageText,p_limit:commerceCfg?.max_product_results||6});
      result=q.data;
      text=productsText(result?.items||[]);
    }else if(intent.intent==='offers'&&conversationId){
      const q=await sb.rpc('get_papoai_commerce_offers_v1',{p_conversation_id:conversationId,p_limit:4});
      result=q.data;
      text=result?.items?.length?`Separei estas ofertas para você:\n\n${productsText(result.items)}`:'Não encontrei uma oferta personalizada disponível agora.';
    }else if(intent.intent==='customer_context'&&conversationId){
      const q=await sb.rpc('get_papoai_commerce_customer_snapshot_v2',{p_conversation_id:conversationId});
      result=q.data;
      text=result?.known_customer&&result?.person_name?`Encontrei seu cadastro, ${result.person_name}. Como posso ajudar hoje?`:'Posso te ajudar com cestas, produtos e ofertas.';
    }else if(intent.intent==='cart_state'&&conversationId){
      const q=await sb.rpc('get_papoai_commerce_cart_state_v1',{p_conversation_id:conversationId});
      result=q.data;
      text=result?.has_cart?`Seu pedido está em ${moneyBR(result.total)}.`:'Você ainda não começou um pedido.';
    }else if(intent.intent==='cart_summary'&&conversationId){
      const q=await sb.rpc('execute_papoai_commerce_command_v1',{
        p_conversation_id:conversationId,p_command:{type:'cart_summary'}
      });
      if(q.error)throw q.error;
      result=q.data;
      text=result?.message_text||'Você ainda não começou um pedido.';
    }else if(intent.intent==='checkout_readiness'&&conversationId){
      const q=await sb.rpc('execute_papoai_commerce_command_v1',{
        p_conversation_id:conversationId,p_command:{type:'checkout_readiness'}
      });
      if(q.error)throw q.error;
      result=q.data;
      if(result?.ready){
        text=result?.summary?.message_text||'Seu pedido está pronto para a confirmação final.';
      }else{
        const missing=Array.isArray(result?.missing)?result.missing:[];
        if(missing.includes('cart'))text='Você ainda não começou um pedido. Posso te mostrar as cestas.';
        else if(missing.includes('delivery_address'))text='Seu pedido está montado. Antes de finalizar, preciso confirmar seus dados de entrega.';
        else text='Seu pedido ainda precisa de uma validação antes da confirmação final.';
      }
    }else if((intent.intent==='confirm_pending'||intent.intent==='cancel_pending')&&conversationId){
      const pending=await sb.rpc('get_papoai_commerce_pending_action_v1',{p_conversation_id:conversationId});
      if(!pending.data?.has_pending){
        text=intent.intent==='confirm_pending'?'Não tenho nenhuma alteração pendente para confirmar agora.':'Tudo certo. Não há nenhuma alteração pendente.';
      }else if(commerceCfg?.write_enabled!==true){
        text='A alteração está identificada, mas a gravação do pedido ainda está desativada.';
      }else{
        const q=await sb.rpc('execute_papoai_commerce_command_v1',{
          p_conversation_id:conversationId,
          p_command:{type:'confirm_pending',confirm:intent.intent==='confirm_pending'}
        });
        if(q.error)throw q.error;
        result=q.data;
        if(result?.cancelled)text='Tudo bem 😊 Não fiz a alteração.';
        else if(result?.confirmed){
          const total=result?.result?.cart?.total;
          text=`Pronto 😊 Fiz a troca. O valor atual do pedido é ${moneyBR(total)}.`;
        }else text='Não consegui confirmar essa alteração. Vou precisar que você me diga novamente o que deseja mudar.';
      }
    }else if(intent.intent==='start_basket'&&conversationId&&commerceCfg?.write_enabled===true){
      const q=await sb.rpc('execute_papoai_commerce_command_v1',{p_conversation_id:conversationId,p_command:{type:'start_basket',basket:intent.basket}});
      if(q.error)throw q.error;
      result=q.data;
      text=`Certo 😊 Comecei a ${result?.basket?.display_name||result?.basket?.name||intent.basket}. O valor atual é ${moneyBR(result?.cart?.total)}. Você quer receber assim ou personalizar algum item?`;
    }else if(intent.intent==='set_basket_quantity'&&conversationId&&commerceCfg?.write_enabled===true){
      const q=await sb.rpc('execute_papoai_commerce_command_v1',{
        p_conversation_id:conversationId,
        p_command:{type:'set_basket_quantity',source_query:intent.source_query,quantity:intent.quantity}
      });
      if(q.error)throw q.error;
      result=q.data;
      if(result?.needs_clarification){
        const names=(Array.isArray(result?.candidates)?result.candidates:[]).slice(0,3).map((x:any)=>x.name).filter(Boolean);
        text=names.length?`Encontrei mais de uma possibilidade: ${names.join(', ')}. Qual deles você quer alterar?`:'Não consegui identificar com segurança qual item você quer alterar.';
      }else{
        text=`Pronto 😊 Atualizei o item. O valor atual da cesta ficou em ${moneyBR(result?.cart?.total)}.`;
      }
    }else if(intent.intent==='set_addon_quantity'&&conversationId&&commerceCfg?.write_enabled===true){
      const q=await sb.rpc('execute_papoai_commerce_command_v1',{
        p_conversation_id:conversationId,
        p_command:{type:'set_addon_quantity',query:intent.query||normalized.messageText,quantity:intent.quantity||1}
      });
      if(q.error)throw q.error;
      result=q.data;
      if(result?.needs_clarification){
        const candidates=(Array.isArray(result?.candidates)?result.candidates:[]).slice(0,4);
        text=candidates.length?`Encontrei estas opções:\n\n${productsText(candidates)}\n\nQual delas você quer adicionar?`:'Não consegui identificar com segurança qual produto você quer adicionar.';
      }else{
        text=`Pronto 😊 Adicionei ${result?.resolved?.name||'o produto'}. O total atual é ${moneyBR(result?.cart?.total)}.`;
      }
    }else if(intent.intent==='replace_basket_item'&&conversationId&&commerceCfg?.write_enabled===true){
      const q=await sb.rpc('execute_papoai_commerce_command_v1',{
        p_conversation_id:conversationId,
        p_command:{
          type:'propose_replacement',
          source_query:intent.source_query,
          replacement_query:intent.replacement_query
        }
      });
      if(q.error)throw q.error;
      result=q.data;
      if(result?.needs_clarification){
        const candidates=(Array.isArray(result?.candidates)?result.candidates:[]).slice(0,4);
        text=candidates.length?`Encontrei estas possibilidades para a troca:\n\n${productsText(candidates)}\n\nQual delas você quer?`:'Não encontrei uma troca segura para esses produtos. Me diga com mais detalhes qual produto você quer colocar no lugar.';
      }else{
        const from=result?.source?.name||intent.source_query;
        const to=result?.replacement?.name||intent.replacement_query;
        text=`Posso trocar **${from}** por **${to}**. Quer que eu faça essa troca?`;
      }
    }else if(['set_basket_quantity','set_addon_quantity','replace_basket_item'].includes(intent.intent)){
      text='Entendi a alteração. A gravação do pedido ainda está desativada, então não vou mexer no carrinho agora.';
    }else{
      const q=await sb.rpc('search_papoai_commerce_products_v1',{p_query:intent.query||normalized.messageText,p_limit:3});
      result=q.data;
      if(result?.items?.length)text=productsText(result.items);
      else text='Posso te ajudar com nossas cestas, produtos, ofertas ou com um pedido. O que você está procurando?';
    }

    if(!responseBody){
      const mediaUrl=(result?.items?.length===1?result.items[0]?.image_url:null)||null;
      responseBody=commerceTextResponse({text,mediaUrl,sessionKey:normalized.sessionKey,correlationId});
    }
  }

  await sb.from('channel_provider_agent_lab_calls').update({
    processing_status:processingStatus,response_kind:responseKind,http_status:200,duration_ms:Date.now()-started,
    response_summary:{handoff:Boolean(responseBody?.handoff),silent:Boolean(responseBody?.silent),reason:responseBody?.reason||null,...LAB_GUARD},
    response_body:responseBody,updated_at:new Date().toISOString()
  }).eq('correlation_id',correlationId);

  return jsonResponse(responseBody,200,responseBearer);
});
