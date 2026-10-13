import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {
 generateKeyPairSync,randomBytes,publicEncrypt,createCipheriv,createDecipheriv,
 createHmac,constants
} from 'node:crypto';
import {handleSignedEncryptedLabRequest} from '../src/flow-transport.mjs';
import {createLabFlowStore} from '../src/flow-protocol.mjs';
import {makeFakeCatalog,makeFakeStock} from '../fixtures/fake-catalog.mjs';

const keys=generateKeyPairSync('rsa',{
 modulusLength:2048,
 publicKeyEncoding:{format:'pem',type:'spki'},
 privateKeyEncoding:{format:'pem',type:'pkcs8'}
});
const appSecret='isolated-meta-signature-test';
const catalog=makeFakeCatalog();
const store=createLabFlowStore({catalog,inventory:makeFakeStock(catalog)});
const token='lab-flow-transport-test-001';
store.register(token,'lab-2',1);
function request(message){
 const aesKey=randomBytes(16),iv=randomBytes(16);
 const cipher=createCipheriv('aes-128-gcm',aesKey,iv);
 const ciphertext=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(message))),cipher.final(),cipher.getAuthTag()]);
 const publicEncrypted=publicEncrypt({key:keys.publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},aesKey);
 const payload=JSON.stringify({
   encrypted_aes_key:publicEncrypted.toString('base64'),
   encrypted_flow_data:ciphertext.toString('base64'),
   initial_vector:iv.toString('base64')
 });
 const rawBody=Buffer.from(payload);
 const signature='sha256='+createHmac('sha256',appSecret).update(rawBody).digest('hex');
 return {rawBody,signature,aesKey,iv};
}
function decode(body,aesKey,iv){
 const b=Buffer.from(body,'base64'),inverted=Buffer.from(iv.map(n=>n^0xff));
 const decipher=createDecipheriv('aes-128-gcm',aesKey,inverted);
 decipher.setAuthTag(b.subarray(-16));
 return JSON.parse(Buffer.concat([decipher.update(b.subarray(0,-16)),decipher.final()]).toString('utf8'));
}
test('Meta-like signed+encrypted data exchange is processed without HTTP/network',()=>{
 const input=request({action:'data_exchange',flow_token:token,screen:'CHOOSE_MODE',
   data:{task:'choose_mode',mode:'customize'}});
 const response=handleSignedEncryptedLabRequest({...input,appSecret,privateKey:keys.privateKey,store});
 assert.equal(response.status,200);
 assert.equal(response.contentType,'text/plain');
 const result=decode(response.body,input.aesKey,input.iv);
 assert.equal(result.screen,'PRODUCT_PILOT');
 assert.equal(result.data.position_number,'1 de 23');
 assert.ok(!JSON.stringify(result).includes('hidden'));
});
test('Failed signature is rejected before payload decryption',()=>{
 const input=request({action:'ping'});
 input.signature='sha256='+'0'.repeat(64);
 const result=handleSignedEncryptedLabRequest({...input,appSecret,privateKey:keys.privateKey,store});
 assert.equal(result.status,432);
 assert.equal(result.body,'');
});
test('Wrong RSA key generates special key refresh response',()=>{
 const input=request({action:'ping'});
 const wrong=generateKeyPairSync('rsa',{
   modulusLength:2048,publicKeyEncoding:{format:'pem',type:'spki'},
   privateKeyEncoding:{format:'pem',type:'pkcs8'}
 });
 const result=handleSignedEncryptedLabRequest({...input,appSecret,privateKey:wrong.privateKey,store});
 assert.equal(result.status,421);
});
test('Unknown session is rejected after correct authentication',()=>{
 const input=request({action:'data_exchange',flow_token:'lab-flow-unknown-01234',
   screen:'CHOOSE_MODE',data:{task:'choose_mode',mode:'ready'}});
 const result=handleSignedEncryptedLabRequest({...input,appSecret,privateKey:keys.privateKey,store});
 assert.equal(result.status,427);
});
test('Business-logic error is encrypted rather than exposed in HTTP text',()=>{
 const input=request({action:'data_exchange',flow_token:token,screen:'CHOOSE_MODE',
   data:{task:'unknown_task'}});
 const result=handleSignedEncryptedLabRequest({...input,appSecret,privateKey:keys.privateKey,store});
 assert.equal(result.status,200);
 assert.notEqual(result.body,'');
 assert.ok(!result.body.includes('unknown_task'));
 const decrypted=decode(result.body,input.aesKey,input.iv);
 assert.equal(decrypted.error_message,'unknown_task');
});
