import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {sendTemplateViaMeta as sendTemplateViaMetaReal} from '../supabase/functions/_shared/whatsapp-meta-transport-v1.mjs';

const workerPath='supabase/functions/whatsapp-marketing-worker-v1/index.ts';
const supportPath='supabase/migrations/20261005018000_marketing_campaign_worker_support_v1.sql';
assert.equal(fs.existsSync(workerPath),true,'worker de marketing deve existir');
assert.equal(fs.existsSync(supportPath),true,'migration de suporte/aceite Meta deve existir');
const source=fs.readFileSync(workerPath,'utf8');
const sql=fs.readFileSync(supportPath,'utf8');

assert.match(source,/sendTemplateViaMeta/,'worker deve reutilizar sendTemplateViaMeta');
assert.match(source,/MetaTransportError/,'worker deve tratar MetaTransportError');
assert.doesNotMatch(source,/graph\.facebook\.com/i,'worker não pode implementar Graph cru');
for(const rpc of ['marketing_campaign_worker_internal_key_v1','marketing_claim_dispatch_batch_v1','marketing_revalidate_dispatch_v1','marketing_issue_tracking_links_v1','marketing_finish_dispatch_v1','marketing_accept_meta_dispatch_v1']){
  assert.match(source,new RegExp(rpc),`worker deve chamar ${rpc}`);
}
assert.match(source,/DEFAULT_BATCH\s*=\s*10/,'batch padrão deve ser 10');
assert.match(source,/MAX_BATCH\s*=\s*25/,'batch máximo deve ser 25');
assert.match(source,/x-dona-antonia-marketing-worker-key/i,'worker deve exigir chave interna server-side');
assert.match(source,/campaigns_enabled/,'worker deve revalidar campaigns_enabled antes do claim');
assert.match(source,/mode[\s\S]*off/i,'worker deve no-op em mode off');
assert.match(source,/canary_recipient_not_allowed/,'canary deve bloquear destinatário externo');
assert.match(source,/0975|1018/,'canary deve ser derivado dos números oficiais');
assert.match(source,/30[\s\S]*120/,'backoff deve conter 30s e 120s');
assert.doesNotMatch(source,/destination_phone|to_phone_e164\s*[:=]\s*body|waba_id\s*[:=]\s*body|phone_number_id\s*[:=]\s*body/i,'browser/chamada não pode escolher transporte/destino');

assert.match(sql,/create\s+table[\s\S]*marketing_campaign_worker_secret_v1/i,'secret interno deve ficar server-side');
assert.match(sql,/gen_random_bytes\s*\(/i,'secret deve nascer aleatório');
assert.match(sql,/marketing_campaign_worker_internal_key_v1/i,'getter interno deve existir');
assert.match(sql,/create\s+or\s+replace\s+function\s+public\.marketing_accept_meta_dispatch_v1\s*\(/i,'RPC de aceite Meta específica de campanha deve existir');
assert.match(sql,/wamid\\\.|\^wamid\\\./i,'aceite deve exigir WAMID');
assert.match(sql,/whatsapp_record_status_v1/i,'aceite deve registrar status canônico');
assert.match(sql,/marketing_finish_dispatch_v1/i,'aceite deve finalizar dispatch de forma atômica');
assert.match(sql,/whatsapp_messages_v1/i,'aceite deve vincular WAMID à mensagem canônica');
assert.match(sql,/revoke\s+all[\s\S]*marketing_accept_meta_dispatch_v1[\s\S]*anon[\s\S]*authenticated/i,'aceite deve ser service-role only');

// Integração real worker -> helper Meta: carousel precisa sobreviver à validação
// do transporte e chegar ao payload Graph exatamente no formato esperado.
{
  const requests=[];
  const components=[{
    type:'carousel',
    cards:[{
      card_index:0,
      components:[{
        type:'button',sub_type:'url',index:'0',
        parameters:[{type:'text',text:'0123456789abcdef0123456789abcdef0123'}],
      }],
    }],
  }];
  const sent=await sendTemplateViaMetaReal({
    accessToken:'meta-token',phoneNumberId:'945659128620084',toE164:'+5565998150975',
    templateName:'mkt_carousel_tracking_v1',languageCode:'pt_BR',components,graphVersion:'v23.0',
    fetchImpl:async(_url,init)=>{
      requests.push(JSON.parse(init.body));
      return new Response(JSON.stringify({messages:[{id:'wamid.CAROUSEL_TRANSPORT_TEST'}]}),{status:200,headers:{'content-type':'application/json'}});
    },
  });
  assert.equal(sent.providerMessageId,'wamid.CAROUSEL_TRANSPORT_TEST');
  assert.equal(requests.length,1,'carousel válido deve chegar ao transporte Meta');
  assert.deepEqual(requests[0].template.components,components,'transporte deve preservar componente carousel seguro');
}

function buildHarness({mode='live',campaignsEnabled=true,revalidate='ok',meta='ok',attemptCount=0,toPhone='+5565998150975'}={}){
  let handler;
  const calls={meta:[],finish:[],accept:[],claim:[],revalidate:[],tracking:[]};
  const accountId='308660df-72a0-4e23-b3e9-b36d7307bb20';
  const dispatchId='10000000-0000-4000-8000-000000000001';
  const expectedKey='worker-test-secret';
  const executionRows=mode==='off'?[]:[{whatsapp_account_id:accountId,mode,max_batch_size:10}];
  const account={id:accountId,phone_e164:'+5565998150975',phone_number_id:'945659128620084',is_active:true};
  const channel={whatsapp_account_id:accountId,campaigns_enabled:campaignsEnabled,send_enabled:true,outbound_provider:'meta'};

  const chain=(table)=>({
    select(){return this},in(){return Promise.resolve({data:executionRows,error:null})},eq(){return this},
    async maybeSingle(){
      if(table==='whatsapp_channel_runtime_v1')return {data:channel,error:null};
      if(table==='whatsapp_accounts')return {data:account,error:null};
      return {data:null,error:null};
    },
    then(resolve){
      if(table==='whatsapp_accounts')resolve({data:[account,{id:'20000000-0000-4000-8000-000000000002',phone_e164:'+5565984491018',phone_number_id:'1018PHONE',is_active:true}],error:null});
      else resolve({data:executionRows,error:null});
    }
  });

  const db={
    from:table=>chain(table),
    rpc:async(name,args)=>{
      if(name==='marketing_campaign_worker_internal_key_v1')return {data:expectedKey,error:null};
      if(name==='marketing_claim_dispatch_batch_v1'){
        calls.claim.push(args);
        return {data:{ok:true,mode,items:[{id:dispatchId,whatsapp_account_id:accountId,attempt_count:attemptCount}],count:1},error:null};
      }
      if(name==='marketing_revalidate_dispatch_v1'){
        calls.revalidate.push(args);
        if(revalidate==='skip')return {data:{ok:false,error:'dispatch_skipped',skip_reason:'no_consent',dispatch_id:dispatchId},error:null};
        return {data:{ok:true,dispatch_id:dispatchId,outbox_id:'30000000-0000-4000-8000-000000000003',whatsapp_account_id:accountId,to_phone_e164:toPhone,template_id:'40000000-0000-4000-8000-000000000004',template_name:'mktcatalogodonaantoniav1',language_code:'pt_BR',variable_values:{1:'Cliente',2:'Oferta'},mode},error:null};
      }
      if(name==='marketing_issue_tracking_links_v1'){
        calls.tracking.push(args);
        return {data:{ok:true,strategy_tracked:false,tracking_links:[]},error:null};
      }
      if(name==='marketing_finish_dispatch_v1'){calls.finish.push(args);return {data:{ok:true,status:args.p_status},error:null};}
      if(name==='marketing_accept_meta_dispatch_v1'){calls.accept.push(args);return {data:{ok:true,status:'accepted',provider_message_id:args.p_provider_message_id},error:null};}
      return {data:null,error:null};
    }
  };

  class MetaTransportError extends Error{constructor(code,{retryable=false,uncertain=false,httpStatus=null}={}){super(code);this.code=code;this.retryable=retryable;this.uncertain=uncertain;this.httpStatus=httpStatus;}}
  const sendTemplateViaMeta=async(args)=>{
    calls.meta.push(args);
    if(meta==='retryable')throw new MetaTransportError('meta_http_error',{retryable:true,uncertain:false,httpStatus:429});
    if(meta==='uncertain')throw new MetaTransportError('meta_timeout',{retryable:false,uncertain:true});
    if(meta==='permanent')throw new MetaTransportError('meta_invalid_request',{retryable:false,uncertain:false,httpStatus:400});
    return {ok:true,provider:'meta',providerMessageId:'wamid.TEST_MARKETING',httpStatus:200};
  };

  const env={SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'service-role',META_WHATSAPP_ACCESS_TOKEN:'meta-token',META_WHATSAPP_GRAPH_VERSION:'v23.0'};
  const sandbox={URL,Request,Response,console,Date,JSON,Math,Set,Array,Object,String,Number,Boolean,Promise,setTimeout,clearTimeout,createClient:()=>db,sendTemplateViaMeta,MetaTransportError,Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn}};
  const runnable=source.replace(/^import .*;\r?\n/gm,'');
  vm.runInNewContext(stripTypeScriptTypes(runnable),sandbox);
  const invoke=async(body={limit:10})=>{
    const response=await handler(new Request('https://database.test/worker',{method:'POST',headers:{'content-type':'application/json','x-dona-antonia-marketing-worker-key':expectedKey},body:JSON.stringify(body)}));
    return {response,body:await response.json()};
  };
  return {invoke,calls};
}

{
  const h=buildHarness({mode:'live'});const result=await h.invoke();
  assert.equal(result.response.status,200);assert.equal(h.calls.meta.length,1,'live válido deve chamar Meta exatamente uma vez');
  assert.equal(h.calls.accept.length,1,'sucesso deve aceitar WAMID pela RPC específica');
  assert.equal(h.calls.tracking.length,1,'worker deve consultar tracking antes do transporte');
  assert.equal(h.calls.accept[0].p_provider_message_id,'wamid.TEST_MARKETING');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.meta[0].components)),[{type:'body',parameters:[{type:'text',text:'Cliente'},{type:'text',text:'Oferta'}]}]);
}
{
  const h=buildHarness({mode:'off'});await h.invoke();assert.equal(h.calls.meta.length,0,'mode off deve ser no-op');assert.equal(h.calls.claim.length,0,'mode off não deve claimar');
}
{
  const h=buildHarness({revalidate:'skip'});await h.invoke();assert.equal(h.calls.meta.length,0,'skip deve ocorrer antes do transporte');assert.equal(h.calls.tracking.length,0,'skip não deve emitir tracking');
}
{
  const h=buildHarness({mode:'canary',toPhone:'+5565999999999'});await h.invoke();assert.equal(h.calls.meta.length,0,'canary externo não pode chamar Meta');assert.equal(h.calls.finish.at(-1)?.p_status,'skipped');assert.equal(h.calls.finish.at(-1)?.p_last_error,'canary_recipient_not_allowed');
}
{
  const h=buildHarness({meta:'retryable',attemptCount:0});await h.invoke();assert.equal(h.calls.finish.at(-1)?.p_status,'retry');assert.equal(h.calls.finish.at(-1)?.p_retry_after_seconds,30);
}
{
  const h=buildHarness({meta:'retryable',attemptCount:1});await h.invoke();assert.equal(h.calls.finish.at(-1)?.p_status,'retry');assert.equal(h.calls.finish.at(-1)?.p_retry_after_seconds,120);
}
{
  const h=buildHarness({meta:'retryable',attemptCount:2});await h.invoke();assert.equal(h.calls.finish.at(-1)?.p_status,'failed','terceira tentativa retryable deve encerrar');
}
{
  const h=buildHarness({meta:'uncertain'});await h.invoke();assert.equal(h.calls.finish.at(-1)?.p_status,'uncertain','erro incerto nunca deve auto-retry');
}
{
  const h=buildHarness({meta:'permanent'});await h.invoke();assert.equal(h.calls.finish.at(-1)?.p_status,'failed');
}

console.log('PASS test-whatsapp-marketing-worker-v1');