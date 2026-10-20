import assert from 'node:assert/strict';
import {runRepurchaseWorkerBatch,templateVariables} from '../supabase/functions/_shared/marketing-repurchase-worker-v1.mjs';

const dispatchId='11111111-1111-4111-8111-111111111111';
const validItem={
  id:dispatchId,
  phone_number_id:'65998150975',
  to_phone_e164:'+5565999810975',
  template_name:'recompradonaantonia28dias0975v1',
  language_code:'pt_BR',
  customer_name:'Maria Silva',
  basket_name:'Cesta Média',
  product_categories:['Alimentos'],
  template_components:[{type:'BODY',text:'Oi {{1}}, queremos saber como estão os itens da sua {{2}}.'}],
};

function makeDb({claimed=[{id:dispatchId,template_name:validItem.template_name}],validation={ok:true,item:validItem},finish={ok:true}}={}){
  const calls=[];
  return {
    calls,
    async rpc(name,args){
      calls.push({name,args});
      if(name==='marketing_repurchase_claim_due_v1')return {data:{ok:true,items:claimed}};
      if(name==='marketing_repurchase_validate_dispatch_v1')return {data:validation};
      if(name==='marketing_repurchase_finish_dispatch_v1')return {data:finish};
      throw new Error(`unexpected_rpc:${name}`);
    },
  };
}

const rows=[{type:'BODY',text:'Oi {{1}}, veja sua {{2}}.'}];
assert.deepEqual(templateVariables(rows,'Maria Silva','Cesta Média',['Alimentos'],'recompradonaantonia28dias0975v1'),[
  {type:'body',parameters:[{type:'text',text:'Maria'},{type:'text',text:'Cesta Média'}]},
]);
assert.throws(()=>templateVariables([{type:'HEADER',format:'TEXT',text:'Olá {{1}}'},{type:'BODY',text:'oi'}],'Maria','Cesta',['x'],'recompradonaantonia28dias0975v1'),/template_header_variables_not_supported/);
assert.throws(()=>templateVariables([{type:'BODY',text:'Oi {{2}}'}],'Maria','Cesta',['x'],'recompradonaantonia28dias0975v1'),/template_variables_not_supported/);

{
  const db=makeDb();
  const sent=[];
  const results=await runRepurchaseWorkerBatch({db,limit:99,accessToken:'server-token',graphVersion:'v24.0',sendTemplate:async payload=>{sent.push(payload);return {providerMessageId:'wamid.1'}}});
  assert.equal(results[0].status,'accepted');
  assert.equal(sent.length,1);
  assert.equal(sent[0].templateName,'recompradonaantonia28dias0975v1');
  assert.deepEqual(sent[0].components,templateVariables(validItem.template_components,'Maria Silva','Cesta Média',['Alimentos'],validItem.template_name));
  assert.equal(db.calls.find(call=>call.name==='marketing_repurchase_claim_due_v1').args.p_limit,25);
  assert.equal(db.calls.find(call=>call.name==='marketing_repurchase_finish_dispatch_v1').args.p_status,'accepted');
  assert.equal(db.calls.find(call=>call.name==='marketing_repurchase_finish_dispatch_v1').args.p_provider_message_id,'wamid.1');
}

{
  const db=makeDb({validation:{ok:false,error:'dispatch_not_eligible'}});
  let sendCount=0;
  const results=await runRepurchaseWorkerBatch({db,sendTemplate:async()=>{sendCount++;return {providerMessageId:'wamid.2'}}});
  assert.equal(results[0].status,'suppressed');
  assert.equal(sendCount,0);
  assert.equal(db.calls.some(call=>call.name==='marketing_repurchase_finish_dispatch_v1'),false,'RPC de validação registra supressão transacionalmente');
}

{
  const db=makeDb({validation:{ok:true,item:{...validItem,template_name:'recompradonaantonia30dias0975v1'}}});
  let sendCount=0;
  const results=await runRepurchaseWorkerBatch({db,sendTemplate:async()=>{sendCount++;return {providerMessageId:'wamid.3'}}});
  assert.equal(results[0].status,'failed');
  assert.equal(results[0].error,'repurchase_template_mismatch');
  assert.equal(sendCount,0);
}

{
  const db=makeDb({validation:{ok:true,item:{...validItem,to_phone_e164:'not-a-brazilian-phone'}}});
  let sendCount=0;
  const results=await runRepurchaseWorkerBatch({db,sendTemplate:async()=>{sendCount++;return {providerMessageId:'wamid.3b'}}});
  assert.equal(results[0].status,'failed');
  assert.equal(results[0].error,'repurchase_destination_invalid');
  assert.equal(sendCount,0);
}

{
  const db=makeDb();
  let sendCount=0;
  const results=await runRepurchaseWorkerBatch({db,sendTemplate:async()=>{sendCount++;return {providerMessageId:''}}});
  assert.equal(results[0].status,'uncertain');
  assert.equal(sendCount,1);
  assert.equal(db.calls.find(call=>call.name==='marketing_repurchase_finish_dispatch_v1').args.p_status,'uncertain');
}

{
  const db=makeDb();
  const results=await runRepurchaseWorkerBatch({db,sendTemplate:async()=>{const error=new Error('timeout');error.uncertain=true;throw error}});
  assert.equal(results[0].status,'uncertain');
  assert.equal(db.calls.find(call=>call.name==='marketing_repurchase_finish_dispatch_v1').args.p_status,'uncertain');
}

{
  const db=makeDb({finish:{ok:false,error:'write_failed'}});
  const results=await runRepurchaseWorkerBatch({db,sendTemplate:async()=>({providerMessageId:'wamid.4'})});
  assert.equal(results[0].status,'uncertain','não afirmar sucesso do ledger após envio sem persistência');
}

{
  const db=makeDb({validation:{ok:true,item:{...validItem,template_components:[{type:'BODY',text:'Oi {{3}}'}]}}});
  let sendCount=0;
  const results=await runRepurchaseWorkerBatch({db,sendTemplate:async()=>{sendCount++;return {providerMessageId:'wamid.5'}}});
  assert.equal(results[0].status,'failed');
  assert.equal(sendCount,0);
}

{
  const db=makeDb({claimed:[{id:'not-a-uuid'}]});
  let sendCount=0;
  const results=await runRepurchaseWorkerBatch({db,sendTemplate:async()=>{sendCount++;return {providerMessageId:'wamid.6'}}});
  assert.equal(results[0].status,'invalid');
  assert.equal(sendCount,0);
}

await assert.rejects(runRepurchaseWorkerBatch({db:{rpc:async()=>({error:new Error('database unavailable')})},sendTemplate:async()=>({})}),/repurchase_claim_failed/);
console.log('monthly repurchase Meta worker runtime: ok');
