import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {ANA_DRY_RUN_INSTRUCTIONS,ANA_DRY_RUN_SCHEMA,buildAnaDryRunInput,normalizeAnaDryRunResult} from '../_shared/ana-policy-v1.mjs';

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const clean=(value:unknown,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const validUuid=(value:unknown)=>{const s=String(value??'').trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const serverSecret=()=>{try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''}catch{return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''}};

function outputText(data:any){
  return (Array.isArray(data?.output)?data.output:[])
    .flatMap((item:any)=>Array.isArray(item?.content)?item.content:[])
    .filter((item:any)=>item?.type==='output_text')
    .map((item:any)=>String(item?.text||''))
    .join('')
    .trim();
}

export async function generateAnaDryRunSuggestion({
  apiKey,model,inboundText,history,fetchFn=fetch
}:{apiKey:string,model:string,inboundText:string,history:any[],fetchFn?:typeof fetch}){
  if(!apiKey)return {ok:false,error:'missing_openai_api_key'};
  const input=buildAnaDryRunInput({inboundText,history});
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

async function finish(db:any,args:any){
  const result=await db.rpc('ops2_ana_finish_dry_run_v1',args);
  if(result.error)throw new Error(`finish_failed:${result.error.message}`);
  return result.data;
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

  const generated=await generateAnaDryRunSuggestion({apiKey,model,inboundText:inbound.data.text_body,history});
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

  const serviceKey=serverSecret();
  const secretHeader=req.headers.get('apikey')||'';
  const legacyBearer=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!serviceKey||(secretHeader!==serviceKey&&legacyBearer!==serviceKey))return json({ok:false,error:'worker_not_authorized'},401);

  const supabaseUrl=Deno.env.get('SUPABASE_URL')||'';
  const apiKey=Deno.env.get('OPENAI_API_KEY')||'';
  const model=Deno.env.get('ANA_OPENAI_MODEL')||'gpt-5.6-luna';
  if(!supabaseUrl||!serviceKey)return json({ok:false,error:'worker_not_configured'},503);
  if(!apiKey)return json({ok:false,error:'openai_not_configured'},503);

  const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const body=await req.json().catch(()=>({}));
  const requestedJobId=body?.job_id;
  const jobId=requestedJobId===undefined||requestedJobId===null||requestedJobId===''?null:validUuid(requestedJobId);
  if(requestedJobId&&!jobId)return json({ok:false,error:'invalid_job_id'},400);
  const limit=Math.max(1,Math.min(3,Number(body?.limit)||1));
  const claimed=jobId
    ?await db.rpc('ops2_ana_claim_dry_run_job_v1',{p_job_id:jobId})
    :await db.rpc('ops2_ana_claim_dry_run_v1',{p_limit:limit});
  if(claimed.error)return json({ok:false,error:'claim_failed',detail:clean(claimed.error.message)},500);

  const jobs=Array.isArray(claimed.data)?claimed.data:[];
  const results=[];
  for(const job of jobs){
    try{results.push(await processJob(db,job,apiKey,model))}
    catch(error:any){
      try{results.push(await finish(db,{p_job_id:job.id,p_status:'failed',p_reason:'worker_exception',p_model:model,p_last_error:clean(error?.message,500),p_metadata:{dry_run_not_sendable:true}}))}
      catch{results.push({ok:false,job_id:job.id,error:'worker_and_finish_failed'})}
    }
  }

  return json({ok:true,dry_run:true,dry_run_not_sendable:true,claimed:jobs.length,job_id:jobId,results});
});
