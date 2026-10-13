/**
 * Parse an actual WhatsApp completion webhook shape in the LAB only.
 *
 * No HTTP server, no outbound messages, and no live order persistence. A
 * signed nfm_reply may create ONLY an in-memory / synthetic SIMULATED_ONLY order.
 * A distinct test WABA, test phone and allowlisted test recipient are required.
 */
import {Buffer} from 'node:buffer';
import {verifyMetaRequestSignature} from './meta-signature.mjs';
import {assertIsolatedMetaEnvironment} from './lab-release-gate.mjs';

const reject=(code)=>{throw new Error(code)};
const nonEmpty=s=>typeof s==='string'&&s.length>0;
export function extractSignedLabFlowCompletion({
  rawBody,signature,appSecret,configuration
}={}){
  // Only a fully separate, explicitly configured test app can reach this code.
  assertIsolatedMetaEnvironment(configuration);
  if(!verifyMetaRequestSignature(rawBody,signature,appSecret))
    reject('flow_webhook_signature_invalid');
  if(rawBody.length>1024*1024)reject('flow_webhook_too_large');
  let event;
  try{event=JSON.parse(rawBody.toString('utf8'))}
  catch{reject('flow_webhook_json_invalid')}
  if(event?.object!=='whatsapp_business_account'||!Array.isArray(event.entry))
    reject('flow_webhook_shape_invalid');
  const completions=[];
  for(const entry of event.entry){
    if(String(entry?.id)!==configuration.testWabaId)
      reject('flow_webhook_not_test_waba');
    for(const change of entry?.changes||[]){
      const value=change?.value;
      if(String(value?.metadata?.phone_number_id)!==configuration.testPhoneNumberId)
        reject('flow_webhook_not_test_phone');
      for(const message of value?.messages||[]){
        if(message?.type!=='interactive'||message.interactive?.type!=='nfm_reply')
          continue;
        if(!configuration.recipientAllowlist.includes(String(message.from)))
          reject('flow_webhook_recipient_not_allowed');
        const responseString=message.interactive.nfm_reply?.response_json;
        if(!nonEmpty(responseString)||responseString.length>8192)
          reject('flow_webhook_reply_missing');
        let response;
        try{response=JSON.parse(responseString)}
        catch{reject('flow_webhook_reply_json_invalid')}
        if(!response||typeof response!=='object'||Array.isArray(response)||
           typeof response.flow_token!=='string')
          reject('flow_webhook_token_missing');
        const id=String(message.id||'');
        if(!/^wamid\.[A-Za-z0-9._:+/=-]{4,240}$/.test(id))
          reject('flow_webhook_message_id_invalid');
        completions.push({flow_token:response.flow_token,
          sender_phone:String(message.from),message_id:id});
        if(completions.length>20)reject('flow_webhook_batch_limit');
      }
    }
  }
  return completions;
}
export function simulateSignedLabFlowCompletions({store,...payload}){
  if(!store||typeof store.confirmFromSignedReply!=='function')
    reject('lab_flow_store_missing');
  const completions=extractSignedLabFlowCompletion(payload);
  return completions.map(row=>({
    message_id:row.message_id,
    ...store.confirmFromSignedReply(row.flow_token,row.message_id,row.sender_phone)
  }));
}
