import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');
const start=source.indexOf('  async function bulkDispatchSelected(){');
const end=source.indexOf('\n  function paintExpeditionBody(){',start);
assert.ok(start>=0&&end>start,'bulk dispatch handler is present');
const state={orders:[{id:'order-1',status:'ready',total_cents:1200}],expeditionSelected:['order-1']};
const button={disabled:false,textContent:'Atualizar'};
const messages=[];let paints=0;
const api=async action=>{
  if(action==='order_dispatch_start_v4')return {ok:true};
  if(action==='orders')throw new Error('network offline');
  throw new Error('unexpected action '+action);
};
const handler=new Function('state','fiscalAuthorizedForDispatch','orderDisplayCode','money','confirm','$','api','currentOperator','paintExpeditionBody','toast','errorMessage',
  source.slice(start,end)+';return bulkDispatchSelected')(
    state,()=>true,()=> 'DA001',value=>String(value),()=>true,selector=>selector==='#bulkDispatchBtn'?button:null,
    api,()=> 'Expedição',()=>{paints++},message=>messages.push(message),message=>message);
await handler();
assert.equal(state.expeditionDataStale,true,'failed refresh marks expedition data stale after dispatch succeeds');
assert.ok(messages.some(message=>message.includes('lista')&&message.includes('atualizada')),'operator is told the list refresh failed');
assert.equal(paints,1,'expedition repaints into its stale-data guard');
assert.match(source,/if\(state\.expeditionDataStale\)/,'stale rows must be blocked from the operational view');
console.log('Admin expedition stale refresh contract: PASS');
