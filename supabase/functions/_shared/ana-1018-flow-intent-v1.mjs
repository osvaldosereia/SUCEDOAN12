// Pure classifier. A Meta Flow completion is not authorization to change an order.
const intents=Object.freeze({
  new_order:{kind:'catalog_navigation',requiresOrderLookup:false,requiresHuman:false},
  offers:{kind:'offers_navigation',requiresOrderLookup:false,requiresHuman:false},
  existing_order:{kind:'order_identity_verification',requiresOrderLookup:true,requiresHuman:true},
  human:{kind:'human_handoff',requiresOrderLookup:false,requiresHuman:true}
});
const expectedPhone='+5565984491018';
export function classify1018FlowCompletion({channelPhone,flowData,verifiedWebhook=false}={}){
  if(channelPhone!==expectedPhone)return {ok:false,reason:'not_1018'};
  if(verifiedWebhook!==true)return {ok:false,reason:'webhook_not_verified'};
  if(!flowData||typeof flowData!=='object'||Array.isArray(flowData))return {ok:false,reason:'invalid_flow_data'};
  const keys=Object.keys(flowData);
  if(keys.length!==1||keys[0]!=='intent')return {ok:false,reason:'unexpected_payload'};
  if(typeof flowData.intent!=='string'||!Object.hasOwn(intents,flowData.intent))return {ok:false,reason:'unknown_intent'};
  const rule=intents[flowData.intent];
  return {ok:true,intent:flowData.intent,kind:rule.kind,requiresOrderLookup:rule.requiresOrderLookup,
    requiresHuman:rule.requiresHuman,allowOrderMutation:false,allowCustomerMutation:false,
    allowPriceChange:false,allowInventoryChange:false,allowMessageSend:false};
}
