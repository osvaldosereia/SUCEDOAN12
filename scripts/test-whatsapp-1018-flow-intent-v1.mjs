import assert from 'node:assert/strict';
import {classify1018FlowCompletion as classify} from '../supabase/functions/_shared/ana-1018-flow-intent-v1.mjs';
const phone='+5565984491018';
for(const intent of ['new_order','offers','existing_order','human']){
 const result=classify({channelPhone:phone,verifiedWebhook:true,flowData:{intent}});
 assert.equal(result.ok,true,intent);
 for(const key of ['allowOrderMutation','allowCustomerMutation','allowPriceChange','allowInventoryChange','allowMessageSend'])assert.equal(result[key],false,key);
}
assert.equal(classify({channelPhone:'+5565998150975',verifiedWebhook:true,flowData:{intent:'human'}}).ok,false);
assert.equal(classify({channelPhone:phone,verifiedWebhook:false,flowData:{intent:'human'}}).ok,false);
for(const data of [null,[],{}, {intent:'delete_order'}, {intent:'new_order',order_id:'123'}, {intent:1}, {__proto__:null}]){
 assert.equal(classify({channelPhone:phone,verifiedWebhook:true,flowData:data}).ok,false,JSON.stringify(data));
}
assert.equal(classify({channelPhone:phone,verifiedWebhook:true,flowData:{intent:'existing_order'}}).requiresHuman,true);
console.log('PASS: verified 1018 Flow intents only, with no customer/order mutation or send');
