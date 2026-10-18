import assert from 'node:assert/strict';
import {create1018FlowToken,sha2561018FlowToken,build1018FlowDraftMessage} from '../supabase/functions/_shared/ana-1018-flow-outbound-v1.mjs';
import {canonicalMessagesFromMeta} from '../supabase/functions/_shared/whatsapp-core-v1.mjs';
import {classify1018MetaFlowMessage} from '../supabase/functions/_shared/ana-1018-meta-flow-completion-v1.mjs';
const account='11111111-1111-4111-8111-111111111111';
const tokens=new Set();
for(let i=0;i<12;i++)tokens.add(create1018FlowToken());
assert.equal(tokens.size,12,'tokens must be unique');
const token=[...tokens][0];
assert.match(token,/^da1018_[a-f0-9]{64}$/);
const digest=await sha2561018FlowToken(token);
assert.match(digest,/^[a-f0-9]{64}$/);
const message=build1018FlowDraftMessage({toE164:'+5565999999999',flowId:'1234567890',flowToken:token});
assert.equal(message.messaging_product,'whatsapp');
assert.equal(message.type,'interactive');
assert.equal(message.interactive.action.parameters.mode,'draft');
assert.equal(message.interactive.action.parameters.flow_cta,'Abrir opções');
assert.equal(message.interactive.action.parameters.flow_action_payload.screen,'START');
assert.equal(message.interactive.action.parameters.flow_token,token);
assert.equal(message.to,'5565999999999');
assert.throws(()=>build1018FlowDraftMessage({toE164:'+5565999999999',flowId:'1234567890',flowToken:'weak'}));
assert.throws(()=>build1018FlowDraftMessage({toE164:'abc',flowId:'1234567890',flowToken:token}));
const payload={entry:[{id:'1234567890',changes:[{field:'messages',value:{
 metadata:{phone_number_id:'99887766'},messages:[{id:'wamid.flow12345',from:'5565999999999',type:'interactive',
 interactive:{type:'nfm_reply',nfm_reply:{response_json:JSON.stringify({flow_token:token,intent:'offers'})}}}]
}}]}]};
const canonical=canonicalMessagesFromMeta(payload,()=>account)[0];
assert.equal(JSON.stringify(canonical).includes(token),false,'no raw token in canonical persistence');
const result=await classify1018MetaFlowMessage({canonicalMessage:canonical,signedPayload:payload,signatureVerified:true,channelPhone:'+5565984491018'});
assert.equal(result.ok,true,JSON.stringify(result));
assert.equal(result.flowTokenSha256,digest,'reply matches outbound token hash');
assert.equal(result.actionable,false,'no implicit permission to mutate or send');
console.log('PASS: cryptographic token, draft Meta payload and signed reply match without persistence of raw token');
