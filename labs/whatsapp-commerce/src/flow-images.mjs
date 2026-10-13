/**
 * Isolated image payload preparation for native WhatsApp Flow option thumbnails.
 * No HTTP, disk or storage. Input is already fetched/resized by a trusted
 * adapter. Real product images must be normalized before calling this module.
 */
import {Buffer} from 'node:buffer';

export const FLOW_OPTION_MAX_BYTES=100*1024;
const png=Buffer.from([137,80,78,71,13,10,26,10]);
function format(data){
  if(data.subarray(0,8).equals(png))return 'image/png';
  if(data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255)
    return 'image/jpeg';
  throw new Error('unsupported_image_format');
}
function safeAlt(value){
  return String(value||'Foto do produto').replace(/[\n\r\t]+/g,' ').trim().slice(0,100);
}
/** "image" is Base64 image data as specified by WhatsApp Flow option items. */
export function addFlowOptionImage(option,bytes,{maxBytes=FLOW_OPTION_MAX_BYTES}={}){
  if(!Buffer.isBuffer(bytes)||bytes.length<10)throw new Error('image_bytes_invalid');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<=0||maxBytes>FLOW_OPTION_MAX_BYTES)
    throw new Error('image_size_policy_invalid');
  if(bytes.length>maxBytes)throw new Error('image_exceeds_meta_option_limit');
  const mime=format(bytes);
  const alt=safeAlt(option?.title||option?.name);
  return {...option,image:bytes.toString('base64'),'alt-text':alt,
    // metadata is server-only, do not include raw URLs in Flow options.
    };
}
/** Verify untrusted Base64 strings from an internal image cache. */
export function validateFlowImageOption(option){
  if(!option?.image)return option;
  const b64=String(option.image);
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))throw new Error('image_base64_invalid');
  const bytes=Buffer.from(b64,'base64');
  if(bytes.toString('base64')!==b64)throw new Error('image_base64_not_canonical');
  if(bytes.length>FLOW_OPTION_MAX_BYTES)throw new Error('image_exceeds_meta_option_limit');
  format(bytes);
  return {...option,'alt-text':safeAlt(option['alt-text']||option.title)};
}
