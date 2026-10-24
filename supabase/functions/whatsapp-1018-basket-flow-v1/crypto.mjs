// Meta Flows encrypted Data Exchange transport using standards Web Crypto.
// Nothing here performs outbound messaging or changes customer/order data.
const utf8=new TextEncoder();
const fromB64=str=>Uint8Array.from(atob(str),c=>c.charCodeAt(0));
const toB64=bytes=>btoa(String.fromCharCode(...bytes));
const b64url=bytes=>toB64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromB64url=str=>fromB64(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4));
const enc=value=>utf8.encode(typeof value==='string'?value:JSON.stringify(value));
const dec=buf=>new TextDecoder().decode(buf);
export async function hmac(key,input){
 const k=await crypto.subtle.importKey('raw',enc(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',k,enc(input)));
}
export async function signState(value,key,ttlMs=45*60*1000){
 if(!key||String(key).length<32)throw Error('signing_not_configured');
 const payload={v:1,exp:Date.now()+ttlMs,data:value};
 const body=b64url(enc(payload)),signature=b64url(await hmac(key,body));
 return body+'.'+signature;
}
export async function verifyState(token,key){
 if(typeof token!=='string'||token.length>20000||!key||String(key).length<32)throw Error('invalid_state');
 const parts=token.split('.');if(parts.length!==2||!parts[0]||!parts[1])throw Error('invalid_state');
 const expected=b64url(await hmac(key,parts[0]));
 if(!timingSafeEq(expected,parts[1]))throw Error('invalid_state_signature');
 const obj=JSON.parse(dec(fromB64url(parts[0])));
 if(obj?.v!==1||!Number.isFinite(obj.exp)||obj.exp<=Date.now()||obj.exp>Date.now()+48*60*60*1000)throw Error('state_expired');
 return obj.data;
}
export function timingSafeEq(a,b){
 if(typeof a!=='string'||typeof b!=='string')return false;
 let mismatch=a.length^b.length;
 const max=Math.max(a.length,b.length);
 for(let i=0;i<max;i++)mismatch|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
 return mismatch===0;
}
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
