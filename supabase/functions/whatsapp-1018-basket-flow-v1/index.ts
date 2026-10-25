import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {flowExchange} from './engine.mjs';
import {loadProductImage} from './images.mjs';
import {decryptMetaPayload,encryptMetaResponse,verifyAppSignature,signState,verifyState} from './crypto.mjs';
import {deriveFlowSessionKey,FLOW_CANARY_RECIPIENT_E164,FLOW_CANARY_SENDER_E164} from '../_shared/whatsapp-flow-session-v1.mjs';

// Draft Flow handler. It is deployed as a guarded canary; production commercial
// atendimento and webhook remain separate and untouched.
// This handler requires encrypted Meta payloads, app signature, signed internal canary
// flow_token and strict 1018->8360 audience verification before exposing storefront data.
const STORE='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/storefront-v2';
const PRIVATE_PEM=(Deno.env.get('DA_FLOW_1018_RSA_PKCS8')||'').trim();
const META_SECRET=(Deno.env.get('META_WHATSAPP_APP_SECRET')||'').trim();
const DEMO_AUDIENCE=FLOW_CANARY_RECIPIENT_E164;
const SENDER=FLOW_CANARY_SENDER_E164;
function deny(status,error){return new Response(JSON.stringify({ok:false,error}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}
async function catalogRequest(action,params={},method='GET'){
 const url=new URL(STORE);url.searchParams.set('action',action);
 const options={method,cache:'no-store',headers:{}};
 if(method==='GET')for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
 else{options.headers['Content-Type']='application/json';options.body=JSON.stringify(params)}
 let response,body;
 try{
  response=await fetch(url, {...options,signal:AbortSignal.timeout(7200)});
  body=await response.json();
 }catch{throw Error('storefront_unavailable')}
 if(!response.ok||body?.ok!==true)throw Error('storefront_rejected');
 return body;
}
const catalog={
 async shell(){return catalogRequest('home_size_cards')},
 async basket(basketId,n){return catalogRequest('basket',{basket_id:basketId+'@'+n,lightweight:1})},
 async options(basketId,n,positions){return catalogRequest('basket_mold_options_batch',{basket_id:basketId,composition_number:n,positions},'POST')},
 async quote(basketId,n,items){return catalogRequest('basket_mold_quote',{basket_id:basketId,composition_number:n,items,lightweight:true},'POST')}
};
const deps={
 ...catalog,
 image:async url=>loadProductImage(url),
 signState:async state=>signState(state,await deriveFlowSessionKey(META_SECRET)),
 verifyState:async token=>verifyState(token,await deriveFlowSessionKey(META_SECRET))
};
function allowedCanaryClaims(value){
 return value?.type==='da-flow-1018-canary'&&value?.sender===SENDER&&value?.to===DEMO_AUDIENCE&&typeof value?.nonce==='string'&&value.nonce.length>=12;
}
Deno.serve(async req=>{
 if(req.method!=='POST')return deny(405,'method_not_allowed');
 if(!PRIVATE_PEM||META_SECRET.length<16)return deny(503,'flow_not_configured');
 const body=await req.text();
 if(body.length>90000)return deny(413,'payload_too_large');
 if(!await verifyAppSignature(body,req.headers.get('x-hub-signature-256'),META_SECRET))return deny(432,'invalid_meta_signature');
 let decoded;
 try{decoded=await decryptMetaPayload(JSON.parse(body),PRIVATE_PEM)}
 catch{return deny(421,'meta_decrypt_failed')}
 let response;
 try{
  const request=decoded.payload;
  if(request.action!=='ping'){
   const session=await verifyState(String(request.flow_token||''),await deriveFlowSessionKey(META_SECRET));
   if(!allowedCanaryClaims(session))return deny(427,'flow_token_invalid');
  }
  response=await flowExchange(request,deps);
 }catch(error){
  // No basket, price, token or raw decrypted payload in logs.
  const code=error instanceof Error?error.message:'internal_error';
  console.error('flow1018_stage_failed',code.slice(0,70));
  // Meta can display an error instead of accidentally confirming an outdated total.
  // Never infer/commit an order when the quote is unavailable.
  return deny(427,'flow_session_unavailable');
 }
 try{
  const encrypted=await encryptMetaResponse(response,decoded);
  return new Response(encrypted,{status:200,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
 }catch{return deny(503,'flow_response_encryption_failed')}
});
