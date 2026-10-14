import assert from 'node:assert/strict';
import {send1018PilotFlow} from '../supabase/functions/_shared/ana-1018-flow-send-v1.mjs';
import {sha2561018FlowToken} from '../supabase/functions/_shared/ana-1018-flow-outbound-v1.mjs';
const account='00000000-0000-4000-8000-000000000018';
let sends=0,calls=[],payload;
const send=async p=>{sends++;payload=p;return {messages:[{id:'wamid.1234567890'}]}};
const db={rpc:async(name,args)=>{
 calls.push({name,args});
 if(name==='ops2_1018_flow_outbox_reserve_v1'){
  assert.equal(args.p_generation,5);
  assert.match(args.p_hash,/^[0-9a-f]{64}$/);
  return {data:{ok:true,outbox_id:'outbox-123'},error:null};
 }
 assert.equal(name,'ops2_1018_flow_outbox_finalize_v1');
 assert.equal(args.p_id,'outbox-123');
 return {data:{ok:true,session_id:'session-123'},error:null};
}};
const input={enabled:true,accountId:account,expectedAccountId:account,
 customerPhone:'+5565999999999',flowId:'1234567890',
 release:{mode:'pilot',generation:5},serviceWindowVerified:true,
 sendAuthorization:{channel:'1018',accountId:account,generation:5,verified:true},send,db};
assert.equal((await send1018PilotFlow({...input,enabled:false})).reason,'disabled');
assert.equal((await send1018PilotFlow({...input,expectedAccountId:'0975'})).reason,'wrong_account');
assert.equal((await send1018PilotFlow({...input,release:{mode:'current',generation:5}})).reason,'pilot_inactive');
assert.equal((await send1018PilotFlow({...input,serviceWindowVerified:false})).reason,'service_window_unverified');
assert.equal((await send1018PilotFlow({...input,sendAuthorization:null})).reason,'authorization_missing');
assert.equal((await send1018PilotFlow({...input,sendAuthorization:{channel:'0975',accountId:account,generation:5,verified:true}})).reason,'authorization_missing');
assert.equal(sends,0);assert.equal(calls.length,0);
const good=await send1018PilotFlow(input);
assert.equal(good.ok,true);
assert.equal(good.sessionId,'session-123');
assert.equal(good.outboundMessageId,'wamid.1234567890');
assert.equal(sends,1);
assert.deepEqual(calls.map(x=>x.name),[
 'ops2_1018_flow_outbox_reserve_v1','ops2_1018_flow_outbox_finalize_v1'
]);
assert.equal(calls[1].args.p_state,'sent');
assert.equal(calls[1].args.p_wamid,'wamid.1234567890');
assert.equal(calls[0].args.p_hash,await sha2561018FlowToken(payload.interactive.action.parameters.flow_token));
assert.equal(JSON.stringify(good).includes(payload.interactive.action.parameters.flow_token),false);
calls=[];sends=0;
const blocked=await send1018PilotFlow({...input,db:{rpc:async()=>({data:{ok:false,error:'pilot_inactive'}})}});
assert.equal(blocked.reason,'reserve_failed');assert.equal(sends,0,'must not send without persisted reservation');
const uncertain=await send1018PilotFlow({...input,send:async()=>{throw Error('timeout')}});
assert.equal(uncertain.requiresReconciliation,true);
assert.equal(calls.at(-1).args.p_state,'uncertain');
const noWamid=await send1018PilotFlow({...input,send:async()=>({messages:[]})});
assert.equal(noWamid.requiresReconciliation,true);
const failed=await send1018PilotFlow({...input,db:{rpc:async(name)=>name.includes('reserve')?{data:{ok:true,outbox_id:'outbox-123'}}:{data:{ok:false,error:'pilot_rolled_back'}}}});
assert.equal(failed.reason,'finalization_failed');
console.log('PASS: reserve-before-send, atomic WAMID finalization, fail closed, uncertain send reconciliation');
