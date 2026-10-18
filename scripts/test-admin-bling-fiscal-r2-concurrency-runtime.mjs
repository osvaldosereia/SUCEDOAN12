import fs from 'node:fs';
import assert from 'node:assert/strict';

// Evaluate the real Hub fiscal canary function against an in-memory Supabase
// double. No network, credentials, Bling requests or SEFAZ writes.
const source=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const start=source.indexOf('async function blingHubVitrineDispatchFiscalCanary(');
const end=source.indexOf('\nasync function blingHubVitrineDispatchFiscalGate(',start);
assert.ok(start>=0&&end>start,'Hub fiscal canary implementation not found');
const actual=source.slice(start,end).replaceAll(':any','').replaceAll(':string','');
const invoice=(authorized=false)=>({id:911,numero:'FICTITIOUS',chaveAcesso:'TEST_ONLY',
  situation:{authorized,pending:!authorized,label:authorized?'Autorizada':'Pendente'}});

async function runScenario(kind){
  const generation=kind.startsWith('generation');
  const uncertain=kind.endsWith('uncertain');
  const job={id:7,status:generation?'held':'generated',attempts:generation?0:1,
    external_side_effect:!generation};
  const providerPosts=[],audit=[];
  const state={invoiceId:generation?null:911};
  function response(table,operation,values){
    const filters=[];
    const builder={
      eq(key,value){filters.push([key,'eq',value]);return builder},
      in(key,values){filters.push([key,'in',values]);return builder},
      select(){return builder},
      single(){return execute()},
      maybeSingle(){return execute()},
      then(resolve,reject){return execute().then(resolve,reject)}
    };
    async function execute(){
      if(table==='bling_hub_audit_v2'){audit.push(values);return {data:null,error:null};}
      assert.equal(table,'dispatch_fiscal_jobs','unexpected table access');
      if(operation==='select')return {data:{...job},error:null};
      if(operation==='update'){
        const match=filters.every(([key,compare,value])=>compare==='eq'?job[key]===value:value.includes(job[key]));
        if(!match)return {data:null,error:null};
        Object.assign(job,values);
        return {data:{id:job.id},error:null};
      }
      throw new Error('unexpected operation '+operation);
    }
    return builder;
  }
  const sb={from(table){return {
    update(values){return response(table,'update',values)},
    insert(values){return response(table,'insert',values)},
    select(){return response(table,'select',null)}
  }},rpc:async()=>({data:{allowed:true},error:null})};
  const preview=async()=>({
    ok:true,hard_blockers:[],source_order_id:'20000000-0000-0000-0000-000000000091',
    canonical_order_id:'20000000-0000-0000-0000-000000000091',
    external_key:'FICTITIOUS-ORDER-91',bling_order_id:321,invoice_id:state.invoiceId,
    invoice:state.invoiceId?invoice(false):null,job:{...job},
    can_generate:generation,can_authorize:!generation
  });
  const fn=new Function('blingHubVitrineDispatchFiscalPreview',
    'blingHubOauth','blingHubFindNfeByExternalKey','blingHubPostOnce',
    'blingHubGetNfe','sleep','clean','return ('+actual+')')(
    preview,async()=>'FAKE_TEST_TOKEN',
    async()=>({ok:true,status:200,matches:[]}),
    async(_sb,_token,url)=>{
      providerPosts.push(url);
      return uncertain
        ?{ok:false,uncertain:true,status:504,error:'mock_provider_timeout',data:{}}
        :{ok:true,uncertain:false,status:200,data:{idNotaFiscal:911}};
    },
    async()=>({ok:true,status:200,invoice:invoice(!uncertain&&generation)}),
    async()=>{},value=>String(value||'')
  );
  const [one,two]=await Promise.all([fn(sb,'fake'),fn(sb,'fake')]);
  const retry=await fn(sb,'fake');
  assert.equal(providerPosts.length,1,kind+': duplicate irreversible provider POST');
  if(generation){
    assert.match(providerPosts[0],/gerar-nfe/);
    assert.ok([one.error,two.error].includes('fiscal_generation_claim_conflict'));
    if(uncertain){
      assert.equal(job.status,'review_required');
      assert.equal(job.attempts,1);
      assert.equal(retry.error,'fiscal_generation_already_attempted');
    }
  }else{
    assert.match(providerPosts[0],/\/nfe\/911\/enviar/);
    assert.ok([one.error,two.error].includes('fiscal_authorization_claim_conflict'));
    assert.equal(job.status,'authorizing');
    assert.equal(retry.message,'authorization_already_sent_reconcile_later');
  }
  return {kind,posts:providerPosts.length,job_status:job.status};
}
const results=[];
for(const kind of ['generation_success','generation_uncertain','authorization_success','authorization_uncertain']){
  results.push(await runScenario(kind));
}
console.log('Hub fiscal concurrent/uncertain recovery guards PASS',JSON.stringify(results));
