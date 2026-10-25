// Shared signed state for Flow data exchange and the restricted Admin canary.
const utf8=new TextEncoder();
export const FLOW_CANARY_SENDER_E164='+5565984491018';
export const FLOW_CANARY_RECIPIENT_E164='+5565999828360';
const fromB64=str=>Uint8Array.from(atob(str),c=>c.charCodeAt(0));
const toB64=bytes=>btoa(String.fromCharCode(...bytes));
const b64url=bytes=>toB64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromB64url=str=>fromB64(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4));
const enc=value=>utf8.encode(typeof value==='string'?value:JSON.stringify(value??{}));
const dec=buf=>new TextDecoder().decode(buf);

export function timingSafeEq(a,b){
 if(typeof a!=='string'||typeof b!=='string')return false;
 let mismatch=a.length^b.length;
 const max=Math.max(a.length,b.length);
 for(let i=0;i<max;i++)mismatch|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
 return mismatch===0;
}
export async function hmac(key,input){
 const k=await crypto.subtle.importKey('raw',enc(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',k,enc(input)));
}
const FLOW_SESSION_CONTEXT='dona-antonia:whatsapp-flow:1018:session:v1';
export async function deriveFlowSessionKey(appSecret){
 const root=String(appSecret??'').trim();
 if(root.length<16)throw Error('signing_not_configured');
 const derived=await hmac(root,FLOW_SESSION_CONTEXT);
 return [...derived].map(byte=>byte.toString(16).padStart(2,'0')).join('');
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
