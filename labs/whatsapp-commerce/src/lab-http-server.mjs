/**
 * LAB-only local HTTP facade for Meta Flow contract tests.
 *
 * Hardcoded bind to 127.0.0.1; this process cannot be the public HTTPS
 * endpoint for Meta. No outgoing requests, no real messages, no Bling, no
 * external database access. Do NOT use with customer data.
 */
import {createServer} from 'node:http';
import {handleSignedEncryptedLabRequest} from './flow-transport.mjs';
import {simulateSignedLabFlowCompletions} from './flow-completion.mjs';
import {assertIsolatedMetaEnvironment} from './lab-release-gate.mjs';

const LIMIT=1024*1024;
const answer=(res,status,body='',type='text/plain')=>{
 res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'});
 res.end(body);
};
async function raw(req){
 const chunks=[];let length=0;
 for await (const chunk of req){
   length+=chunk.length;
   if(length>LIMIT)throw Error('lab_payload_too_large');
   chunks.push(chunk);
 }
 return Buffer.concat(chunks);
}
/** Create a server but do NOT listen. All dependencies must be explicitly injected. */
export function createOfflineLabHttpServer({
 store,appSecret,privateKey,passphrase,metaConfiguration
}={}){
 assertIsolatedMetaEnvironment(metaConfiguration);
 if(!store||typeof store.handle!=='function')throw Error('lab_store_missing');
 if(!privateKey||!appSecret)throw Error('lab_crypto_missing');
 return createServer(async(req,res)=>{
   if(req.method==='GET'&&req.url==='/health'){
     return answer(res,200,JSON.stringify({status:'ok',lab_only:true}),
       'application/json; charset=utf-8');
   }
   if(req.method!=='POST'||!['/flows/data','/flows/completion'].includes(req.url)){
     return answer(res,404);
   }
   try{
     const rawBody=await raw(req),signature=req.headers['x-hub-signature-256'];
     if(req.url==='/flows/data'){
       const result=handleSignedEncryptedLabRequest({
         rawBody,signature,appSecret,privateKey,passphrase,store
       });
       return answer(res,result.status,result.body,result.contentType);
     }
     const completed=simulateSignedLabFlowCompletions({
       rawBody,signature,appSecret,configuration:metaConfiguration,store
     });
     return answer(res,200,JSON.stringify({
       lab_only:true,processed:completed.length,
       simulated_order_count:store.stats().simulatedOrders
     }),'application/json; charset=utf-8');
   }catch(error){
     const e=String(error?.message||'error');
     const status=e==='lab_payload_too_large'?413:
       /signature_invalid|not_test|not_allowed|mismatch_or_unbound/.test(e)?403:400;
     // No raw data, flow token, phone or internal pricing is echoed to callers.
     return answer(res,status,JSON.stringify({lab_only:true,error:'rejected'}),
       'application/json; charset=utf-8');
   }
 });
}
/** Start only on localhost; throws if callers request an externally reachable IP. */
export async function listenOfflineLab(server,{port=0,host='127.0.0.1'}={}){
 if(host!=='127.0.0.1')throw Error('public_binding_forbidden');
 if(!Number.isSafeInteger(port)||port<0||port>65535)throw Error('invalid_lab_port');
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(port,'127.0.0.1',()=>{
    server.removeListener('error',reject);resolve();
  });
 });
 return server.address();
}
