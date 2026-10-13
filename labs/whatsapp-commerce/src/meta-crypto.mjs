/**
 * WhatsApp Flows isolated Node.js endpoint crypto prototype.
 * No server listen(), no network, no keys stored in the repo.
 * Needs authentication, replay prevention, payload validation and Meta test
 * endpoint verification before use on an Internet-facing service.
 */
import {
  privateDecrypt,createDecipheriv,createCipheriv,constants
} from 'node:crypto';
import {Buffer} from 'node:buffer';
const requiredBuffer=(v,name,min,max)=>{
 if(typeof v!=='string'||!v||!/^[A-Za-z0-9+/]+={0,2}$/.test(v))
   throw new Error('invalid_'+name);
 const b=Buffer.from(v,'base64');
 if(b.length<min||b.length>max)throw new Error('invalid_'+name);
 return b;
};
function checkKey(key){if(key.length!==16)throw new Error('invalid_aes_key_length')}
export function decryptMetaFlowRequest(payload,{privateKey,passphrase}={}){
 if(!privateKey)throw new Error('lab_private_key_not_configured');
 const keyBytes=requiredBuffer(payload?.encrypted_aes_key,'encrypted_aes_key',256,1024);
 const cipherBytes=requiredBuffer(payload?.encrypted_flow_data,'encrypted_flow_data',17,1048576);
 const iv=requiredBuffer(payload?.initial_vector,'initial_vector',12,16);
 if(iv.length!==16)throw new Error('invalid_iv_length');
 const aesKey=privateDecrypt({
  key:privateKey,passphrase,
  padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'
 },keyBytes);
 checkKey(aesKey);
 const ciphertext=cipherBytes.subarray(0,-16),tag=cipherBytes.subarray(-16);
 const decipher=createDecipheriv('aes-128-gcm',aesKey,iv,{authTagLength:16});
 decipher.setAuthTag(tag);
 const plain=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
 const request=JSON.parse(plain.toString('utf8'));
 if(!request||typeof request!=='object'||Array.isArray(request))throw new Error('invalid_flow_request');
 return {request,aesKey,initialVector:iv};
}
export function encryptMetaFlowResponse(response,{aesKey,initialVector}={}){
 if(!aesKey||!initialVector)throw new Error('flow_crypto_context_missing');
 checkKey(aesKey);
 if(initialVector.length!==16)throw new Error('invalid_iv_length');
 const flipped=Buffer.from(initialVector.map(v=>v^0xff));
 const cipher=createCipheriv('aes-128-gcm',aesKey,flipped,{authTagLength:16});
 const content=Buffer.from(JSON.stringify(response),'utf8');
 return Buffer.concat([cipher.update(content),cipher.final(),cipher.getAuthTag()]).toString('base64');
}
