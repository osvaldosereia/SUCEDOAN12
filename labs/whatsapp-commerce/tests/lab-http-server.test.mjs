import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {
 createHmac,createCipheriv,createDecipheriv,publicEncrypt,
 generateKeyPairSync,randomBytes,constants
} from 'node:crypto';
import {createLabFlowStore} from '../src/flow-protocol.mjs';
import {createOfflineLabHttpServer,listenOfflineLab} from '../src/lab-http-server.mjs';
import {makeFakeCatalog,makeFakeStock} from '../fixtures/fake-catalog.mjs';

const phone='5565999999999',flowToken='lab-flow-http-000123456789';
const config={
 mode:'LAB_ONLY',allowProductionWrites:false,allowCustomerMessages:false,
 testWabaId:'1234567890',testPhoneNumberId:'9999999999',testAppReady:true,
 productionWabaIds:['8888888888'],productionPhoneNumberIds:['7777777777'],
 recipientAllowlist:[phone]
},secret='test-secret-for-local-only';
const keys=generateKeyPairSync('rsa',{
 modulusLength:2048,
 publicKeyEncoding:{format:'pem',type:'spki'},
 privateKeyEncoding:{format:'pem',type:'pkcs8'}
});
function fixture(){
 const catalog=makeFakeCatalog(),store=createLabFlowStore({catalog,inventory:makeFakeStock(catalog)});
 store.register(flowToken,'lab-2',1,phone);
 const server=createOfflineLabHttpServer({
  store,appSecret:secret,privateKey:keys.privateKey,metaConfiguration:config
 });
 return {server,store};
}
function sign(raw){return 'sha256='+createHmac('sha256',secret).update(raw).digest('hex')}
function encryptMessage(request){
 const key=randomBytes(16),iv=randomBytes(16);
 const aes=createCipheriv('aes-128-gcm',key,iv);
 const encrypted=Buffer.concat([aes.update(Buffer.from(JSON.stringify(request))),aes.final(),aes.getAuthTag()]);
 const rsa=publicEncrypt({key:keys.publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key);
 const body=Buffer.from(JSON.stringify({encrypted_aes_key:rsa.toString('base64'),
  encrypted_flow_data:encrypted.toString('base64'),initial_vector:iv.toString('base64')}));
 return {body,key,iv};
}
function decrypted(data,key,iv){
 const bytes=Buffer.from(data,'base64'),iv2=Buffer.from(iv.map(x=>x^0xff));
 const decipher=createDecipheriv('aes-128-gcm',key,iv2);
 decipher.setAuthTag(bytes.subarray(-16));
 return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0,-16)),decipher.final()]).toString('utf8'));
}
async function withServer(callback){
 const {server,store}=fixture();
 const addr=await listenOfflineLab(server);
 try{return await callback({base:'http://127.0.0.1:'+addr.port,server,store})}
 finally{await new Promise((r,j)=>server.close(e=>e?j(e):r()))}
}
test('Local server is reachable only on 127.0.0.1 and offers explicit test health',async()=>{
 await withServer(async({base,server})=>{
  const response=await fetch(base+'/health');
  assert.equal(response.status,200);
  const json=await response.json();
  assert.deepEqual(json,{status:'ok',lab_only:true});
  assert.equal(server.address().address,'127.0.0.1');
 });
});
test('Signed encrypted Meta Flow request completes over local HTTP without publishing',async()=>{
 await withServer(async({base})=>{
  const payload=encryptMessage({action:'data_exchange',flow_token:flowToken,
   screen:'CHOOSE_MODE',data:{task:'choose_mode',mode:'customize'}});
  const response=await fetch(base+'/flows/data',{method:'POST',
    headers:{'content-type':'application/json','x-hub-signature-256':sign(payload.body)},
    body:payload.body});
  assert.equal(response.status,200);
  const result=decrypted(await response.text(),payload.key,payload.iv);
  assert.equal(result.screen,'PRODUCT_PILOT');
  assert.equal(result.data.position_number,'1 de 23');
  assert.ok(!JSON.stringify(result).includes('hidden_adjustment'));
 });
});
test('Invalid signature cannot access the isolated HTTP endpoint',async()=>{
 await withServer(async({base,store})=>{
  const payload=encryptMessage({action:'ping'});
  const response=await fetch(base+'/flows/data',{method:'POST',
    headers:{'x-hub-signature-256':'sha256='+'0'.repeat(64)},body:payload.body});
  assert.equal(response.status,432);
  assert.equal(store.stats().simulatedOrders,0);
 });
});
test('No caller may bind the lab server to a public network address',async()=>{
 const {server}=fixture();
 await assert.rejects(()=>listenOfflineLab(server,{host:'0.0.0.0'}),/public_binding_forbidden/);
});
test('Unknown routes do not expose database, customer or Meta resources',async()=>{
 await withServer(async({base})=>{
  const response=await fetch(base+'/admin/orders');
  assert.equal(response.status,404);
  assert.equal(await response.text(),'');
 });
});
