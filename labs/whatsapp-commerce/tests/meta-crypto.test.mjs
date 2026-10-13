import test from 'node:test';
import assert from 'node:assert/strict';
import {
 generateKeyPairSync,randomBytes,publicEncrypt,
 createCipheriv,createDecipheriv,constants
} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {decryptMetaFlowRequest,encryptMetaFlowResponse} from '../src/meta-crypto.mjs';

const {publicKey,privateKey}=generateKeyPairSync('rsa',{
 modulusLength:2048,
 publicKeyEncoding:{type:'spki',format:'pem'},
 privateKeyEncoding:{type:'pkcs8',format:'pem'}
});
function makeRequest(data){
 const aesKey=randomBytes(16),iv=randomBytes(16);
 const rsa=publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash:'sha256'},aesKey);
 const cipher=createCipheriv('aes-128-gcm',aesKey,iv);
 const ciphertext=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(data))),cipher.final(),cipher.getAuthTag()]);
 return {request:{encrypted_aes_key:rsa.toString('base64'),
   encrypted_flow_data:ciphertext.toString('base64'),initial_vector:iv.toString('base64')},
   aesKey,iv};
}
test('Flow encrypted request decrypts and response encrypts via inverted IV',()=>{
 const input={action:'data_exchange',screen:'PRODUCT_PILOT',
   data:{position_id:'pos-one',product_id:'product-b'},flow_token:'only-testing'};
 const {request,aesKey,iv}=makeRequest(input);
 const data=decryptMetaFlowRequest(request,{privateKey});
 assert.deepEqual(data.request,input);
 const encoded=encryptMetaFlowResponse({version:'3.0',screen:'PRODUCT_PILOT',
   data:{total_label:'R$ 175,00'}},data);
 const buffer=Buffer.from(encoded,'base64');
 const flipped=Buffer.from(iv.map(v=>v^0xff));
 const decipher=createDecipheriv('aes-128-gcm',aesKey,flipped,{authTagLength:16});
 decipher.setAuthTag(buffer.subarray(-16));
 const plain=Buffer.concat([decipher.update(buffer.subarray(0,-16)),decipher.final()]);
 const message=JSON.parse(plain.toString('utf8'));
 assert.equal(message.screen,'PRODUCT_PILOT');
 assert.equal(message.data.total_label,'R$ 175,00');
});
test('Tampered encrypted request is rejected',()=>{
 const {request}=makeRequest({action:'INIT'});
 const payload=Buffer.from(request.encrypted_flow_data,'base64');
 payload[0]^=0xff;request.encrypted_flow_data=payload.toString('base64');
 assert.throws(()=>decryptMetaFlowRequest(request,{privateKey}));
});
test('Keys and invalid initialization vectors are rejected',()=>{
 const {request}=makeRequest({action:'INIT'});
 assert.throws(()=>decryptMetaFlowRequest(request,{}),/lab_private_key_not_configured/);
 assert.throws(()=>encryptMetaFlowResponse({ok:true},{aesKey:randomBytes(16),initialVector:randomBytes(12)}),/invalid_iv_length/);
});
