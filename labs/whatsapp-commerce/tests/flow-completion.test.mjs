import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createHmac} from 'node:crypto';
import {createLabFlowStore} from '../src/flow-protocol.mjs';
import {makeFakeCatalog,makeFakeStock} from '../fixtures/fake-catalog.mjs';
import {extractSignedLabFlowCompletion,simulateSignedLabFlowCompletions} from '../src/flow-completion.mjs';

const phone='5565999999999';
const cfg={
 mode:'LAB_ONLY',allowProductionWrites:false,allowCustomerMessages:false,
 testWabaId:'1234567890',testPhoneNumberId:'9999999999',
 productionWabaIds:['8888888888'],productionPhoneNumberIds:['7777777777'],
 recipientAllowlist:[phone],testAppReady:true
};
const secret='test-meta-hmac-secret';
const token='lab-flow-webhook-test-0123';
const msgId='wamid.HBgMNTU2NTk5ODg4Nzc3NxUCABIYFjNF+AQ==';
function signedReply({sender=phone,numberId=cfg.testPhoneNumberId,waba=cfg.testWabaId,
 id=msgId,flowToken=token,change='nfm_reply'}={}){
 const response_json=JSON.stringify({flow_token:flowToken,lab_only:'true'});
 const payload={object:'whatsapp_business_account',entry:[{
   id:waba,changes:[{field:'messages',value:{
    metadata:{phone_number_id:numberId},
    messages:[{from:sender,id,type:'interactive',
      interactive:{type:change,nfm_reply:{name:'flow',response_json}}}]
   }}]
 }]};
 const rawBody=Buffer.from(JSON.stringify(payload));
 const signature='sha256='+createHmac('sha256',secret).update(rawBody).digest('hex');
 return {rawBody,signature,appSecret:secret,configuration:cfg};
}
function readyStore({bindPhone=phone}={}){
 const catalog=makeFakeCatalog();
 const store=createLabFlowStore({catalog,inventory:makeFakeStock(catalog)});
 store.register(token,'lab-1',1,bindPhone);
 const msg=(screen,task,data)=>({action:'data_exchange',flow_token:token,screen,data:{task,...data}});
 store.handle(msg('CHOOSE_MODE','choose_mode',{mode:'ready'}));
 store.handle(msg('UPSELL','select_upsell',{extras:[]}));
 store.handle(msg('CHECKOUT','checkout',{
   name:'Cliente fictício',address:'Endereço fictício, 50, Cuiabá',payment:'pix'
 }));
 return store;
}
test('Signed and allowlisted nfm_reply creates a SIMULATED_ONLY order once',()=>{
 const store=readyStore(),input=signedReply();
 const parsed=extractSignedLabFlowCompletion(input);
 assert.equal(parsed.length,1);
 assert.equal(parsed[0].flow_token,token);
 const first=simulateSignedLabFlowCompletions({...input,store});
 assert.equal(first.length,1);
 assert.equal(first[0].order.status,'SIMULATED_ONLY');
 assert.equal(first[0].existing,false);
 const replay=simulateSignedLabFlowCompletions({...input,store});
 assert.equal(replay[0].existing,true);
 assert.equal(store.stats().simulatedOrders,1);
});
test('Wrong sender phone is rejected despite valid Meta signature',()=>{
 const store=readyStore();
 assert.throws(()=>simulateSignedLabFlowCompletions({
   ...signedReply({sender:'5565888888888'}),store
 }),/flow_webhook_recipient_not_allowed/);
});
test('Session must explicitly bind the same allowlisted phone before confirming',()=>{
 const store=readyStore({bindPhone:null});
 assert.throws(()=>simulateSignedLabFlowCompletions({
   ...signedReply(),store
 }),/lab_reply_phone_mismatch_or_unbound/);
});
test('Wrong WABA/phone cannot submit any simulated order',()=>{
 const store=readyStore();
 assert.throws(()=>simulateSignedLabFlowCompletions({
   ...signedReply({numberId:'7777777777'}),store
 }),/flow_webhook_not_test_phone/);
 assert.throws(()=>simulateSignedLabFlowCompletions({
   ...signedReply({waba:'8888888888'}),store
 }),/flow_webhook_not_test_waba/);
 assert.equal(store.stats().simulatedOrders,0);
});
test('Tampered HMAC never reaches session finalization',()=>{
 const store=readyStore(),payload=signedReply();
 payload.rawBody=Buffer.from(payload.rawBody.toString('utf8').replace('nfm_reply','button_reply'));
 assert.throws(()=>simulateSignedLabFlowCompletions({...payload,store}),/flow_webhook_signature_invalid/);
 assert.equal(store.stats().simulatedOrders,0);
});
test('Duplicate flow token with different WhatsApp message ids is not replayed as the same event',()=>{
 const store=readyStore();
 simulateSignedLabFlowCompletions({...signedReply(),store});
 const another=signedReply({id:'wamid.other.message.id.0002'});
 assert.throws(()=>simulateSignedLabFlowCompletions({...another,store}),/wrong_step/);
 assert.equal(store.stats().simulatedOrders,1);
});
test('Response JSON cannot be trusted to choose price, basket or internal adjustment',()=>{
 const store=readyStore();
 const req=signedReply();
 const body=JSON.parse(req.rawBody.toString('utf8'));
 body.entry[0].changes[0].value.messages[0].interactive.nfm_reply.response_json=
   JSON.stringify({flow_token:token,hidden_adjustment_cents:-999999,
     total_cents:1,product_id:'fake'});
 req.rawBody=Buffer.from(JSON.stringify(body));
 req.signature='sha256='+createHmac('sha256',secret).update(req.rawBody).digest('hex');
 const response=simulateSignedLabFlowCompletions({...req,store});
 assert.ok(response[0].order.total_cents>1);
 assert.equal(response[0].order.status,'SIMULATED_ONLY');
});
