/**
 * Verify Meta x-hub-signature-256 BEFORE decrypting a Flow request.
 * Offline pure helper: no secrets or network in the lab repository.
 */
import {createHmac,timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
export function verifyMetaRequestSignature(rawBody,signature,appSecret){
  if(!appSecret||typeof appSecret!=='string'||appSecret.length<8)throw Error('meta_app_secret_missing');
  if(!Buffer.isBuffer(rawBody)||rawBody.length>1048576)throw Error('invalid_meta_body');
  if(typeof signature!=='string'||!/^sha256=[0-9a-f]{64}$/i.test(signature))return false;
  const digest=createHmac('sha256',appSecret).update(rawBody).digest('hex');
  const received=Buffer.from(signature.slice(7).toLowerCase(),'hex');
  const expected=Buffer.from(digest,'hex');
  return received.length===expected.length&&timingSafeEqual(received,expected);
}
