import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {verifyMetaRequestSignature} from '../src/meta-signature.mjs';
test('A valid signed encrypted request is accepted',()=>{
 const body=Buffer.from('{"encrypted_flow_data":"example"}');
 const key='lab-only-test-secret';
 const sig='sha256='+createHmac('sha256',key).update(body).digest('hex');
 assert.equal(verifyMetaRequestSignature(body,sig,key),true);
});
test('An altered body or signature is rejected',()=>{
 const body=Buffer.from('{"action":"INIT"}'),key='lab-only-test-secret';
 const sig='sha256='+createHmac('sha256',key).update(body).digest('hex');
 assert.equal(verifyMetaRequestSignature(Buffer.from('{"action":"PING"}'),sig,key),false);
 assert.equal(verifyMetaRequestSignature(body,'sha256='+'0'.repeat(64),key),false);
 assert.equal(verifyMetaRequestSignature(body,'totally-invalid',key),false);
});
test('Missing key and invalid body cannot be bypassed',()=>{
 assert.throws(()=>verifyMetaRequestSignature(Buffer.from('{}'),'sha256=00',''),/meta_app_secret_missing/);
 assert.throws(()=>verifyMetaRequestSignature('{}','sha256=00','lab-only-test-secret'),/invalid_meta_body/);
});
