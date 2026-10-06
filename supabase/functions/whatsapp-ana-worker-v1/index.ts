import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {ANA_DRY_RUN_INSTRUCTIONS,ANA_DRY_RUN_SCHEMA,buildAnaDryRunInput,normalizeAnaDryRunResult,isSimpleAnaGreeting,buildAnaCatalogWelcome} from '../_shared/ana-policy-v1.mjs';
import {shouldSendAnaLiveReply} from '../_shared/ana-live-policy-v1.mjs';
import {sendTextViaMeta,MetaTransportError} from '../_shared/whatsapp-meta-transport-v1.mjs';
import {linkedCustomerFirstName} from '../_shared/ana-customer-context-v1.mjs';

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const clean=(value:unknown,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

function outputText(data:any){
  return (Array.isArray(data?.output)?data.output:[])
    .flatMap((item:any)=>Array.isArray(item?.content)?item.content:[])
    .filter((item:any)=>item?.type==='output_text')
    .map((item:any)=>String(item?.text||''))
    .join('')
    .trim();
}

async function isSimpleGreetingForNewDay(db:any,conversationId:string,inbound:any){
  if(!isSimpleAnaGreeting(inbound?.text_body))return false;
  const current=new Date(inbound?.received_at||inbound?.created_at||'');
  if(!Number.isFinite(current.getTime()))return false;
  const parts=new Intl.DateTimeFormat('en',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(current);
  const values=Object.fromEntries(parts.filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  const dayStart=new Date(Date.UTC(Number(values.year),Number(values.month)-1,Number(values.day),4));
  const prior=await db.from('whatsapp_messages_v1').select('id').eq('conversation_id',conversationId)
    .gte('created_at',dayStart.toISOString()).lt('created_at',current.toISOString()).limit(1).maybeSingle();
  return !prior.error&&!prior.data;
}

async function personalizedCatalogWelcome(db:any,conversationId:string,phone:string,customerFirstName:string){
  const link=await db.rpc('ops2_issue_storefront_catalog_link_v1',{
    p_phone:phone,p_conversation_id:conversationId,p_source_event_key:`ana-first-greeting:${conversationId}:${new Date().toISOString().slice(0,10)}`,
    p_source:'attendance_ana',p_ttl_minutes:120
  });
  if(link.error||link.data?.ok!==true||!link.data?.catalog_path)return null;
  return buildAnaCatalogWelcome({firstName:customerFirstName,catalogPath:link.data.catalog_path})||null;
}

export async function generateAnaDryRunSuggestion({
  apiKey,model,inboundText,history,operationalContext={},fetchFn=fetch
}:{apiKey:string,model:string,inboundText:string,history:any[],operationalContext?:any,fetchFn?:typeof fetch}){
  if(!apiKey)return {ok:false,error:'missing_openai_api_key'};
  const input=buildAnaDryRunInput({inboundText,history,operationalContext});
  const started=Date.now();
  try{
    const response=await fetchFn('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,
        store:false,
        max_output_tokens:500,
        reasoning:{effort:'low'},
        instructions:ANA_DRY_RUN_INSTRUCTIONS,
        input:[{role:'user',content:[{type:'input_text',text:JSON.stringify(input)}]}],
        text:{format:{type:'json_schema',name:'ana_dry_run_suggestion',strict:true,schema:ANA_DRY_RUN_SCHEMA}}
      }),
      signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      return {ok:false,error:'openai_http_error',status:response.status,response_id:data?.id||null,latency_ms:Date.now()-started,usage:data?.usage||null};
    }
    let parsed:any={};
    try{parsed=JSON.parse(outputText(data)||'{}')}catch{return {ok:false,error:'openai_parse_error',response_id:data?.id||null,latency_ms:Date.now()-started,usage:data?.usage||null}}
    return {ok:true,result:normalizeAnaDryRunResult(parsed),response_id:data?.id||null,latency_ms:Date.now()-started,usage:data?.usage||null};
  }catch(error:any){
    return {ok:false,error:clean(error?.name||'openai_request_error'),error_message:clean(error?.message,240),latency_ms:Date.now()-started};
  }
}

async function resolveOpenAIKey(db:any){
  const direct=Deno.env.get('OPENAI_API_KEY')||'';
  if(direct)return direct;
  try{
    const result=await db.rpc('get_conversation_worker_provider_secret_v1');
    return typeof result.data==='string'?result.data.trim():'';
  }catch{return ''}
}

function operationalContext(customerFirstName=''){
  return {
    catalog_ordering:'Para consultar produtos e fazer pedido, direcione o cliente ao catálogo/site oficial. O atendimento pode orientar e oferecer atendimento humano, mas esta resposta não cria pedido.',
    human_support:'Atendimento humano está disponível quando o cliente pedir ajuda, quando faltar contexto confiável ou quando houver exceção operacional.',
    never_collect_in_chat:['CPF/CNPJ','endereço completo'],
    dynamic_data_rule:'Preço, estoque, total, composição de cesta, prazo/entrega, pagamento e dados do pedido são dinâmicos. Só afirme esses dados quando vierem explicitamente no contexto; caso contrário, encaminhe para humano ou para o catálogo/site oficial.',
    known_customer_first_name:customerFirstName
  };
}

async function aiGate(db:any,conversationId:string){
  const gate=await db.rpc('ops2_attendance_ai_gate_v1',{p_conversation_id:conversationId});
  if(gate.error)return {ok:false,allowed:false,error:'ai_gate_rpc_failed'};
  return gate.data||{ok:false,allowed:false,error:'ai_gate_empty'};
}

async function finish(db:any,args:any){
  const result=await db.rpc('ops2_ana_finish_dry_run_v1',args);
  if(result.error)throw new Error(`finish_failed:${result.error.message}`);
  return result.data;
}

async function finishLive(db:any,args:any){
  const result=await db.rpc('ops2_ana_finish_live_job_v1',args);
  if(result.error)throw new Error(`live_finish_failed:${result.error.message}`);
  return result.data;
}

async function processLiveJob(db:any,job:any,apiKey:string,model:string,meta:{accessToken:string,graphVersion:string}){
  const firstGate=await db.rpc('ops2_attendance_ai_gate_v1',{p_conversation_id:job.conversation_id});
  if(firstGate.error||firstGate.data?.allowed!==true){
    return await finishLive(db,{p_job_id:job.id,p_status:'skipped',p_decision:'handoff',p_reason:'ai_gate_closed_before_generation',p_model:model,p_metadata:{gate:firstGate.data||null}});
  }
  const inbound=await db.from('whatsapp_messages_v1').select('id,direction,message_type,text_body,provider_message_id,created_at,received_at')
    .eq('id',job.inbound_message_id).maybeSingle();
  if(inbound.error||!inbound.data||inbound.data.direction!=='inbound'||inbound.data.message_type!=='text'||!String(inbound.data.text_body||'').trim()){
    return await finishLive(db,{p_job_id:job.id,p_status:'skipped',p_decision:'handoff',p_reason:'inbound_not_supported',p_model:model});
  }
  const historyResult=await db.from('whatsapp_messages_v1').select('direction,text_body,sender_kind,created_at,received_at,sent_at')
    .eq('conversation_id',job.conversation_id).not('text_body','is',null).order('created_at',{ascending:false}).limit(12);
  if(historyResult.error)throw new Error(`history_failed:${historyResult.error.message}`);
  const history=(historyResult.data||[]).reverse();
  const customerFirstName=await linkedCustomerFirstName(db,job.conversation_id);
  let generated:any;
  if(await isSimpleGreetingForNewDay(db,job.conversation_id,inbound.data)){
    const conversation=await db.from('conversations').select('wa_contact_e164').eq('id',job.conversation_id).maybeSingle();
    const welcome=conversation.data?.wa_contact_e164?await personalizedCatalogWelcome(db,job.conversation_id,conversation.data.wa_contact_e164,customerFirstName):null;
    generated=welcome?{ok:true,result:normalizeAnaDryRunResult({decision:'suggest',confidence:0.99,response_text:welcome,reason:'first_greeting_of_day',missing_context:[]}),latency_ms:0}:null;
  }
  if(!generated)generated=await generateAnaDryRunSuggestion({apiKey,model,inboundText:inbound.data.text_body,history,operationalContext:operationalContext(customerFirstName)});
  if(!generated.ok)return await finishLive(db,{p_job_id:job.id,p_status:'failed',p_decision:'handoff',p_reason:generated.error,p_model:model,
    p_provider_response_id:generated.response_id||null,p_error:generated.error,p_metadata:{latency_ms:generated.latency_ms||null}});
  const secondGate=await db.rpc('ops2_attendance_ai_gate_v1',{p_conversation_id:job.conversation_id});
  if(secondGate.error||secondGate.data?.allowed!==true){
    return await finishLive(db,{p_job_id:job.id,p_status:'skipped',p_decision:'handoff',p_reason:'human_takeover_during_generation',p_model:model,
      p_provider_response_id:generated.response_id||null});
  }
  const result=generated.result;
  if(result.decision==='no_reply')return await finishLive(db,{p_job_id:job.id,p_status:'completed',p_decision:'no_reply',p_reason:result.reason,
    p_model:model,p_provider_response_id:generated.response_id||null,p_metadata:{missing_context:result.missing_context,latency_ms:generated.latency_ms||null}});
  if(!shouldSendAnaLiveReply({decision:result.decision,confidence:result.confidence,responseText:result.response_text})){
    return await finishLive(db,{p_job_id:job.id,p_status:'skipped',p_decision:'handoff',p_text:result.response_text,p_confidence:result.confidence,
      p_reason:'human_review_required',p_model:model,p_provider_response_id:generated.response_id||null,
      p_metadata:{source_reason:result.reason,missing_context:result.missing_context,latency_ms:generated.latency_ms||null}});
  }
  const prepared=await db.rpc('ops2_ana_begin_live_send_v1',{p_job_id:job.id,p_text:result.response_text});
  if(prepared.error||prepared.data?.ok!==true){
    return await finishLive(db,{p_job_id:job.id,p_status:'skipped',p_decision:'handoff',p_text:result.response_text,p_confidence:result.confidence,
      p_reason:prepared.data?.error||'live_send_gate_closed',p_model:model,p_provider_response_id:generated.response_id||null});
  }
  let sent:any;
  try{
    sent=await sendTextViaMeta({accessToken:meta.accessToken,phoneNumberId:prepared.data.phone_number_id,
      toE164:prepared.data.to_phone_e164,text:prepared.data.text,graphVersion:meta.graphVersion,timeoutMs:15000});
  }catch(error:any){
    const code=error instanceof MetaTransportError?error.code:clean(error?.message||'meta_send_error',180);
    await db.rpc('ops2_ana_fail_live_send_v1',{p_outbox_id:prepared.data.outbox_id,p_reason:code});
    return await finishLive(db,{p_job_id:job.id,p_status:'failed',p_decision:'handoff',p_text:result.response_text,p_confidence:result.confidence,
      p_reason:'meta_send_failed',p_model:model,p_provider_response_id:generated.response_id||null,p_error:code,
      p_metadata:{uncertain:error instanceof MetaTransportError&&error.uncertain===true}});
  }
  const acceptedAt=new Date().toISOString();
  const accepted=await db.rpc('ops2_ana_accept_live_outbound_v1',{p_outbox_id:prepared.data.outbox_id,p_provider_message_id:sent.providerMessageId,p_accepted_at:acceptedAt});
  if(accepted.error||accepted.data?.ok!==true){
    await db.rpc('ops2_ana_fail_live_send_v1',{p_outbox_id:prepared.data.outbox_id,p_reason:'meta_accepted_persist_failed'});
    return await finishLive(db,{p_job_id:job.id,p_status:'failed',p_decision:'handoff',p_reason:'meta_accepted_persist_failed',p_model:model,
      p_provider_response_id:generated.response_id||null,p_error:'meta_accepted_persist_failed',p_metadata:{provider_message_id:sent.providerMessageId}});
  }
  return await finishLive(db,{p_job_id:job.id,p_status:'completed',p_decision:'suggest',p_text:result.response_text,p_confidence:result.confidence,
    p_reason:result.reason,p_model:model,p_provider_response_id:generated.response_id||null,
    p_metadata:{outbox_id:prepared.data.outbox_id,message_id:accepted.data?.message_id,provider_message_id:sent.providerMessageId,
      missing_context:result.missing_context,latency_ms:generated.latency_ms||null}});
}

async function processJob(db:any,job:any,apiKey:string,model:string){
  const firstGate=await db.rpc('ops2_attendance_ai_gate_v1',{p_conversation_id:job.conversation_id});
  if(firstGate.error||firstGate.data?.allowed!==true){
    return await finish(db,{p_job_id:job.id,p_status:'skipped',p_reason:'human_or_ai_gate_closed_before_generation',p_model:model,p_metadata:{dry_run_not_sendable:true,gate:firstGate.data||null}});
  }

  const inbound=await db.from('whatsapp_messages_v1').select('id,conversation_id,direction,message_type,text_body,provider_message_id,created_at,received_at').eq('id',job.inbound_message_id).maybeSingle();
  if(inbound.error||!inbound.data||inbound.data.direction!=='inbound'||inbound.data.message_type!=='text'||!String(inbound.data.text_body||'').trim()){
    return await finish(db,{p_job_id:job.id,p_status:'skipped',p_reason:'inbound_not_supported',p_model:model,p_metadata:{dry_run_not_sendable:true}});
  }

  const historyResult=await db.from('whatsapp_messages_v1')
    .select('direction,text_body,sender_kind,created_at,received_at,sent_at')
    .eq('conversation_id',job.conversation_id)
    .not('text_body','is',null)
    .order('created_at',{ascending:false})
    .limit(12);
  if(historyResult.error)throw new Error(`history_failed:${historyResult.error.message}`);
  const history=(historyResult.data||[]).reverse();

  const customerFirstName=await linkedCustomerFirstName(db,job.conversation_id);
  const generated=await generateAnaDryRunSuggestion({apiKey,model,inboundText:inbound.data.text_body,history,operationalContext:operationalContext(customerFirstName)});
  if(!generated.ok){
    return await finish(db,{p_job_id:job.id,p_status:'failed',p_reason:generated.error,p_model:model,p_provider_response_id:generated.response_id||null,p_last_error:generated.error,p_metadata:{dry_run_not_sendable:true,latency_ms:generated.latency_ms||null,usage:generated.usage||null}});
  }

  const secondGate=await db.rpc('ops2_attendance_ai_gate_v1',{p_conversation_id:job.conversation_id});
  if(secondGate.error||secondGate.data?.allowed!==true){
    return await finish(db,{p_job_id:job.id,p_status:'skipped',p_reason:'human_takeover_during_generation',p_model:model,p_provider_response_id:generated.response_id||null,p_metadata:{dry_run_not_sendable:true,latency_ms:generated.latency_ms||null,usage:generated.usage||null}});
  }

  const result=generated.result;
  return await finish(db,{
    p_job_id:job.id,
    p_status:'completed',
    p_decision:result.decision,
    p_suggestion_text:result.response_text,
    p_confidence:result.confidence,
    p_reason:result.reason,
    p_model:model,
    p_provider_response_id:generated.response_id||null,
    p_metadata:{dry_run_not_sendable:true,missing_context:result.missing_context,latency_ms:generated.latency_ms||null,usage:generated.usage||null}
  });
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('',{status:204,headers:cors});
  if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);

  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const authorization=req.headers.get('authorization')||'';
  if(!serviceKey||authorization!==`Bearer ${serviceKey}`)return json({ok:false,error:'worker_not_authorized'},401);

  const supabaseUrl=Deno.env.get('SUPABASE_URL')||'';
  const model=Deno.env.get('ANA_OPENAI_MODEL')||'gpt-6-luna';
  const metaAccessToken=Deno.env.get('META_WHATSAPP_ACCESS_TOKEN')||'';
  const metaGraphVersion=Deno.env.get('META_WHATSAPP_GRAPH_VERSION')||'';
  if(!supabaseUrl||!serviceKey)return json({ok:false,error:'worker_not_configured'},503);

  const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const apiKey=await resolveOpenAIKey(db);
  if(!apiKey)return json({ok:false,error:'openai_not_configured'},503);
  const body=await req.json().catch(()=>({}));
  const limit=Math.max(1,Math.min(3,Number(body?.limit)||1));
  const live=body?.mode==='live';
  if(live&&(!metaAccessToken||!/^v\d+\.\d+$/.test(metaGraphVersion)))return json({ok:false,error:'meta_not_configured'},503);
  const claimed=await db.rpc(live?'ops2_ana_claim_live_v1':'ops2_ana_claim_dry_run_v1',{p_limit:limit});
  if(claimed.error)return json({ok:false,error:'claim_failed',detail:clean(claimed.error.message)},500);

  const jobs=Array.isArray(claimed.data)?claimed.data:[];
  const results=[];
  for(const job of jobs){
    try{results.push(await (live?processLiveJob(db,job,apiKey,model,{accessToken:metaAccessToken,graphVersion:metaGraphVersion}):processJob(db,job,apiKey,model)))}
    catch(error:any){
      try{results.push(await (live?finishLive(db,{p_job_id:job.id,p_status:'failed',p_decision:'handoff',p_reason:'worker_exception',p_model:model,p_error:clean(error?.message,500)}):finish(db,{p_job_id:job.id,p_status:'failed',p_reason:'worker_exception',p_model:model,p_last_error:clean(error?.message,500),p_metadata:{dry_run_not_sendable:true}})))}
      catch{results.push({ok:false,job_id:job.id,error:'worker_and_finish_failed'})}
    }
  }

  return json({ok:true,dry_run:!live,dry_run_not_sendable:!live,claimed:jobs.length,results});
});
