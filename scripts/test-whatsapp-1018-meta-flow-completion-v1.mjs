import assert from 'node:assert/strict';
import {canonicalMessagesFromMeta} from '../supabase/functions/_shared/whatsapp-core-v1.mjs';
import {classify1018MetaFlowMessage} from '../supabase/functions/_shared/ana-1018-meta-flow-completion-v1.mjs';

const account='11111111-1111-4111-8111-111111111111';
const payload=(reply,phone='65984491018')=>({
 entry:[{id:'1234567890',changes:[{field:'messages',value:{metadata:{phone_number_id:'99887766',display_phone_number:phone},messages:[{id:'wamid.mock-flow-01',from:'5565999999999',timestamp:'1791900000',type:'interactive',interactive:{type:'nfm_reply',nfm_reply:{name:'flow',body:'Concluído',response_json:reply}}}]}}]}]
});
const canonical=canonicalMessagesFromMeta(payload(JSON.stringify({intent:'offers'})),()=>account)[0];
assert.equal(canonical.message.metadata.interactive.type,'nfm_reply');
const classify=(m,phone='+5565984491018',verified=true)=>classify1018MetaFlowMessage({canonicalMessage:m,channelPhone:phone,signatureVerified:verified});
const valid=classify(canonical);
assert.equal(valid.ok,true);
assert.equal(valid.intent,'offers');
assert.equal(valid.actionable,false,'no unverified Flow session may trigger real actions');
assert.equal(valid.requiresSessionVerification,true);
assert.equal(valid.allowOrderMutation,false);
assert.equal(valid.allowMessageSend,false);
assert.equal(classify(canonical,'+5565998150975').ok,false);
assert.equal(classify(canonical,'+5565984491018',false).ok,false);
assert.equal(classify(canonicalMessagesFromMeta(payload('{broken'),()=>account)[0]).ok,false);
assert.equal(classify(canonicalMessagesFromMeta(payload(JSON.stringify({intent:'human',order_id:'1'})),()=>account)[0]).ok,false);
assert.equal(classify(canonicalMessagesFromMeta(payload(JSON.stringify({intent:'delete_order'})),()=>account)[0]).ok,false);
assert.equal(classify({...canonical,provider:'papoai'}).ok,false);
assert.equal(classify({...canonical,message:{...canonical.message,message_type:'text'}}).ok,false);
assert.equal(classify(canonicalMessagesFromMeta(payload('x'.repeat(4097)),()=>account)[0]).ok,false);
console.log('PASS: canonical Meta Flow completion is signed, 1018-only, bounded and non-actionable');
