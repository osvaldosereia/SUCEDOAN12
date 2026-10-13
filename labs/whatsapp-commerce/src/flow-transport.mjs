/**
 * Pure HTTP-adapter boundary for an encrypted Meta Flow endpoint.
 * Does not start any server or make network requests.
 * Only wire to an HTTPS TEST receiver after separate WABA/test-number setup.
 */
import {Buffer} from 'node:buffer';
import {verifyMetaRequestSignature} from './meta-signature.mjs';
import {decryptMetaFlowRequest,encryptMetaFlowResponse} from './meta-crypto.mjs';
import {safeLabFlowScreenError} from './flow-protocol.mjs';

const noBody=(status)=>({status,contentType:'text/plain',body:''});
export function handleSignedEncryptedLabRequest({
 rawBody,signature,appSecret,privateKey,passphrase,store
}={}){
 if(!store||typeof store.handle!=='function')throw Error('lab_store_not_configured');
 // Check before decryption, so a guessed RSA payload cannot reach logic.
 if(!verifyMetaRequestSignature(rawBody,signature,appSecret))
   return noBody(432);
 let parsed;
 try{parsed=JSON.parse(rawBody.toString('utf8'))}
 catch{return noBody(400)}
 let context;
 try{context=decryptMetaFlowRequest(parsed,{privateKey,passphrase})}
 catch{return noBody(421)}
 let response;
 try{response=store.handle(context.request)}
 catch(e){
   const message=String(e?.message||'');
   if(/^(invalid_lab_flow_token|session_missing|session_expired|flow_token_required)$/.test(message))
     return noBody(427);
   try { response=safeLabFlowScreenError(e,store,context.request?.flow_token); }
   catch { return noBody(427); }
 }
 try{
   return {status:200,contentType:'text/plain',
     body:encryptMetaFlowResponse(response,context)};
 }catch{return noBody(500)}
}
