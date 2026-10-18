import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const section=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return src.slice(i,j).replaceAll(':any','').replaceAll(':string','').replaceAll(' as Error','')};
const manual=section('async function orderFiscalIssueV4(','async function orderFiscalRecoverBlingV1(').replace('async function orderFiscalIssueV4','async function');
const automatic=section('async function autoIssueFiscalAfterSeparation(','async function runSeparationPostCompletionIntegrations(').replace('async function autoIssueFiscalAfterSeparation','async function');
let calls=[],state={},providerFault=false;
let preflight={data:{ready:true}};
const db={rpc:async()=>preflight},hub=async a=>{calls.push(a);if(providerFault&&a==='fiscal_dispatch_canary_human_execute')throw new Error('mock_timeout');return {data:{accepted:true}}};
const orderFiscalStatusV4=async()=>({...state}),id=x=>x||null,tx=x=>String(x||'');
const issue=new Function('db','hub','orderFiscalStatusV4','id','tx',`return (${manual})`)(db,hub,orderFiscalStatusV4,id,tx);
const auto=new Function('db','hub','orderFiscalStatusV4',`return (${automatic})`)(db,hub,orderFiscalStatusV4);
for(const blocked of [
 {authorized:false,can_issue:false,issue_enabled:true,blockers:['invoice_generation_recovery_required'],hard_blockers:[]},
 {authorized:false,can_issue:false,issue_enabled:false,blockers:['fiscal_human_issue_not_enabled'],hard_blockers:[]},
 {authorized:false,can_issue:false,issue_enabled:true,blockers:['payment_required'],hard_blockers:['payment_required']}
]){
 state=blocked;calls=[];
 const m=await issue({id:'test-order',confirmation:'EMITIR_NFE'},{role:'owner'});
 assert.equal(m.error,'fiscal_dispatch_not_eligible');
 const a=await auto('test-order');
 assert.equal(a.attempted,false);
 assert.equal(calls.length,0,'external fiscal write invoked despite block');
}
state={authorized:true,can_issue:false,issue_enabled:true,hard_blockers:[]};calls=[];
assert.equal((await issue({id:'test-order',confirmation:'EMITIR_NFE'},{role:'owner'})).idempotent_replay,true);
assert.equal(calls.length,0);
state={authorized:false,can_issue:true,issue_enabled:true,hard_blockers:[],blockers:[]};calls=[];
assert.equal((await issue({id:'test-order',confirmation:'EMITIR_NFE'},{role:'viewer'})).error,'forbidden');
assert.equal((await issue({id:'test-order',confirmation:'wrong'},{role:'owner'})).error,'fiscal_human_confirmation_required');
assert.equal(calls.length,0);
// Preflight failures must fail closed, even if the status endpoint says issuance is allowed.
state={authorized:false,can_issue:true,issue_enabled:true,hard_blockers:[],blockers:[]};
for(const blockedPreflight of [
 {data:{ready:false,blockers:['stock_not_confirmed']}},
 {error:{message:'database temporarily unavailable'}}
]){
 preflight=blockedPreflight;calls=[];
 const m=await issue({id:'test-order',confirmation:'EMITIR_NFE'},{role:'owner'}).catch(e=>({thrown:e.message}));
 const a=await auto('test-order');
 assert.equal(a.attempted,false);
 assert.equal(calls.length,0,'Hub invoked with failed preflight');
 assert.ok(m.error||m.thrown,'manual issuance must reject preflight failure');
}
preflight={data:{ready:true}};
state={authorized:false,can_issue:true,issue_enabled:true,hard_blockers:[],blockers:[]};
providerFault=true;calls=[];
const uncertainManual=await issue({id:'test-order',confirmation:'EMITIR_NFE'},{role:'owner'});
assert.equal(uncertainManual.error,'fiscal_issue_result_uncertain');
assert.equal(uncertainManual.requires_reconciliation,true);
const uncertainAuto=await auto('test-order');
assert.equal(uncertainAuto.error,'fiscal_issue_result_uncertain');
assert.equal(uncertainAuto.requires_reconciliation,true);
assert.equal(calls.filter(x=>x==='fiscal_dispatch_canary_human_execute').length,2);
providerFault=false;
console.log('Fiscal manual/automatic runtime guards: PASS (mocked Hub; no external writes)');
