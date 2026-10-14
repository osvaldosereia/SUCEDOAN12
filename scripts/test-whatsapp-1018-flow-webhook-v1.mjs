import assert from 'node:assert/strict';
import {canonicalMessagesFromMeta,redactWebhookPayload} from '../supabase/functions/_shared/whatsapp-core-v1.mjs';
import {handle1018FlowWebhook as handle} from '../supabase/functions/_shared/ana-1018-meta-flow-webhook-v1.mjs';
const account='11111111-1111-4111-8111-111111111111';
const token='da1018_'+'x'.repeat(40);
const raw=JSON.stringify({flow_token:token,intent:'existing_order'});
const payload={entry:[{id:'1234567890',changes:[{field:'messages',value:{
  metadata:{phone_number_id:'99887766'},messages:[{
    id:'wamid.FLOW-1018-001',from:'5565999999999',timestamp:'1791900000',type:'interactive',
    interactive:{type:'nfm_reply',nfm_reply:{name:'flow',response_json:raw,body:'Sent'}}
  }]
}}]}]};
const message=canonicalMessagesFromMeta(payload,()=>account)[0];
let calls=[];
const db={rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true,replayed:false},error:null}}};
const args={enabled:true,expectedAccountId:account,expectedFlowId:'1234567890',
  canonicalMessage:message,signedPayload:payload,ingestResult:{message_id:'11111111-2222-4333-8444-555555555555'},db,signatureVerified:true};
assert.equal((await handle({...args,enabled:false})).handled,false);
assert.equal((await handle({...args,expectedAccountId:'bad-account'})).handled,false);
assert.equal((await handle({...args,signatureVerified:false})).rejected,true);
assert.equal((await handle({...args,ingestResult:{...args.ingestResult,duplicate:true}})).duplicate,true);
assert.equal(calls.length,0);
const good=await handle(args);
assert.equal(good.handled,true);
assert.equal(good.consumed,true);
assert.equal(good.allowMessageSend,false);
assert.equal(good.allowOrderMutation,false);
assert.equal(calls.length,1);
assert.equal(calls[0].name,'ops2_1018_flow_session_consume_v1');
assert.equal(calls[0].args.p_intent,'existing_order');
assert.equal(calls[0].args.p_customer_phone_e164,'+5565999999999');
assert.equal(calls[0].args.p_flow_id,'1234567890');
assert.match(calls[0].args.p_token_sha256,/^[a-f0-9]{64}$/);
assert.equal(JSON.stringify(calls).includes(token),false);
assert.equal((await handle({...args,db:{rpc:async()=>({data:{ok:false,error:'pilot_rolled_back_or_changed'}})}})).rejected,true);
assert.equal((await handle({...args,db:{rpc:async()=>({data:{ok:true,replayed:true}})}})).replayed,true);
const other={...message,message:{...message.message,metadata:{...message.message.metadata,interactive:{
 type:'nfm_reply',nfm_reply:{response_json:JSON.stringify({flow_token:'existing_flow_token',intent:'human'})}
}}}};
assert.equal((await handle({...args,canonicalMessage:other,signedPayload:{...payload,entry:[{...payload.entry[0],changes:[{...payload.entry[0].changes[0],value:{...payload.entry[0].changes[0].value,messages:[{...payload.entry[0].changes[0].value.messages[0],interactive:{type:'nfm_reply',nfm_reply:{response_json:JSON.stringify({flow_token:'existing_flow_token',intent:'human'})}}}]}}]}]}})).handled,false,'unrelated Meta Flows pass through');
const redacted=redactWebhookPayload(payload);
assert.equal(JSON.stringify(redacted).includes(token),false,'raw payload must not store the Flow token');
console.log('PASS: disabled-by-default pilot webhook gates, no raw token, no sends, no duplicate/rollback effects');
