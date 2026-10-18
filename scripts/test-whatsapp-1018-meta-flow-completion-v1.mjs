import assert from 'node:assert/strict';
import {canonicalMessagesFromMeta} from '../supabase/functions/_shared/whatsapp-core-v1.mjs';
import {classify1018MetaFlowMessage} from '../supabase/functions/_shared/ana-1018-meta-flow-completion-v1.mjs';

const account='11111111-1111-4111-8111-111111111111';
const token='da1018_'+ 'A'.repeat(40);
const reply=(intent='offers',extra={})=>JSON.stringify({flow_token:token,intent,...extra});
const payload=(responseJson,phone='65984491018')=>({
 entry:[{id:'1234567890',changes:[{field:'messages',value:{metadata:{phone_number_id:'99887766',display_phone_number:phone},messages:[{id:'wamid.mock-flow-01',from:'5565999999999',timestamp:'1791900000',type:'interactive',interactive:{type:'nfm_reply',nfm_reply:{name:'flow',body:'Concluído',response_json:responseJson}}}]}}]}]
});
const canonical=canonicalMessagesFromMeta(payload(reply()),()=>account)[0];
assert.equal(canonical.message.metadata.interactive.type,'nfm_reply');
const classify=(m,phone='+5565984491018',verified=true,signedPayload=payload(reply()))=>classify1018MetaFlowMessage({canonicalMessage:m,signedPayload,channelPhone:phone,signatureVerified:verified});
assert.equal(JSON.stringify(canonical).includes(token),false,'canonical payload must not expose token');
const valid=await classify(canonical);
assert.equal(valid.ok,true);
assert.equal(valid.intent,'offers');
assert.match(valid.flowTokenSha256,/^[0-9a-f]{64}$/);
assert.equal(JSON.stringify(valid).includes(token),false,'raw flow_token must not escape');
assert.equal(valid.actionable,false,'Flow session must be consumed before any action');
assert.equal(valid.requiresSessionVerification,true);
assert.equal(valid.allowOrderMutation,false);
assert.equal(valid.allowMessageSend,false);
assert.equal((await classify(canonical,'+5565998150975')).ok,false);
assert.equal((await classify(canonical,'+5565984491018',false)).ok,false);
for(const bad of ['{broken', JSON.stringify({intent:'offers'}),JSON.stringify({flow_token:'short',intent:'offers'}),reply('human',{order_id:'1'}),reply('delete_order'),'x'.repeat(4097)]){
 assert.equal((await classify(canonicalMessagesFromMeta(payload(bad),()=>account)[0],'+5565984491018',true,payload(bad))).ok,false,bad.slice(0,70));
}
assert.equal((await classify({...canonical,provider:'papoai'})).ok,false);
assert.equal((await classify({...canonical,message:{...canonical.message,message_type:'text'}})).ok,false);
console.log('PASS: Meta nfm_reply requires opaque flow_token; exports digest only, signed 1018 response only');
