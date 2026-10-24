// Meta Flows encrypted Data Exchange transport using standards Web Crypto.
// Nothing here performs outbound messaging or changes customer/order data.
import {hmac,signState,verifyState,timingSafeEq} from '../_shared/whatsapp-flow-session-v1.mjs';
export {hmac,signState,verifyState,timingSafeEq};
const utf8=new TextEncoder();
const fromB64=str=>Uint8Array.from(atob(str),c=>c.charCodeAt(0));
const toB64=bytes=>btoa(String.fromCharCode(...bytes));
const enc=value=>utf8.encode(typeof value==='string'?value:JSON.stringify(value));
const dec=buf=>new TextDecoder().decode(buf);
export async function verifyAppSignature(body,header,secret){
 if(!secret||secret.length<16||!/^sha256=[0-9a-f]{64}$/i.test(String(header||'')))return false;
 const hex=Array.from(await hmac(secret,body)).map(x=>x.toString(16).padStart(2,'0')).join('');
 return timingSafeEq('sha256='+hex,String(header));
}
export async function decryptMetaPayload(envelope,privatePem){
 if(!envelope||!privatePem||typeof privatePem!=='string')throw Error('missing_private_key');
 const pem=privatePem.replace(/\\n/g,'\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g,'');
 const der=fromB64(pem);
 const key=await crypto.subtle.importKey('pkcs8',der,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
 const encryptedKey=fromB64(envelope.encrypted_aes_key||'');
 const aesBytes=await crypto.subtle.decrypt({name:'RSA-OAEP'},key,encryptedKey);
 const iv=fromB64(envelope.initial_vector||'');
 if(![12,16].includes(iv.length)||![16,24,32].includes(aesBytes.byteLength))throw Error('invalid_flow_crypto_parameters');
 const cipher=await crypto.subtle.importKey('raw',aesBytes,{name:'AES-GCM'},false,['decrypt','encrypt']);
 const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv,tagLength:128},cipher,fromB64(envelope.encrypted_flow_data||''));
 const payload=JSON.parse(dec(clear));
 if(!payload||typeof payload!=='object')throw Error('invalid_flow_payload');
 return {payload,cipher,iv};
}
export async function encryptMetaResponse(data,{cipher,iv}){
 const responseIV=Uint8Array.from(iv,x=>x^255);
 const cipherText=await crypto.subtle.encrypt({name:'AES-GCM',iv:responseIV,tagLength:128},cipher,enc(data));
 return toB64(new Uint8Array(cipherText));
}
