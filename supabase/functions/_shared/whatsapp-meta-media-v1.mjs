const clean=(value,max=2000)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const OUTBOUND_MEDIA_MAX_BYTES=16*1024*1024;
const OUTBOUND_MEDIA_MIME=new Set([
  'image/jpeg','image/png',
  'audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg',
  'application/pdf'
]);
const M4A_BROWSER_MIME_ALIASES=new Set(['','audio/x-m4a','audio/m4a','application/octet-stream']);

export class MetaMediaError extends Error{
  constructor(code,{status=0,retryable=false}={}){super(code);this.name='MetaMediaError';this.code=code;this.status=status;this.retryable=retryable}
  toJSON(){return {name:this.name,code:this.code,status:this.status,retryable:this.retryable}}
}

function strictGraphVersion(value){const version=clean(value,20);if(!/^v\d+\.\d+$/.test(version))throw new MetaMediaError('meta_media_graph_version_invalid');return version}
function strictMediaId(value){const id=clean(value,240);if(!/^[A-Za-z0-9._:-]{3,240}$/.test(id))throw new MetaMediaError('meta_media_id_invalid');return id}
function strictPhoneNumberId(value){const id=clean(value,40);if(!/^\d{5,30}$/.test(id))throw new MetaMediaError('meta_media_phone_number_id_invalid');return id}
function normalizedMime(value){return clean(value,180).toLowerCase().split(';')[0].trim()}
function strictFilename(value){
  const filename=clean(value,240).replace(/[\\/]+/g,'_').replace(/[^\p{L}\p{N}._() -]+/gu,'_').trim();
  if(!filename||filename==='.'||filename==='..')throw new MetaMediaError('meta_media_filename_invalid');
  return filename;
}
function strictBytes(value){
  let bytes;
  if(value instanceof Uint8Array)bytes=value;
  else if(value instanceof ArrayBuffer)bytes=new Uint8Array(value);
  else if(ArrayBuffer.isView(value))bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  else throw new MetaMediaError('meta_media_bytes_invalid');
  if(bytes.byteLength<1)throw new MetaMediaError('meta_media_empty');
  if(bytes.byteLength>OUTBOUND_MEDIA_MAX_BYTES)throw new MetaMediaError('meta_media_too_large');
  return bytes;
}
function startsWithBytes(bytes,signature){
  if(bytes.byteLength<signature.length)return false;
  for(let i=0;i<signature.length;i++)if(bytes[i]!==signature[i])return false;
  return true;
}
function startsWithAscii(bytes,text){return startsWithBytes(bytes,new TextEncoder().encode(text))}

export function canonicalOutboundMetaMime(value,filename=''){
  const mime=normalizedMime(value);
  if(OUTBOUND_MEDIA_MIME.has(mime))return mime;
  const name=clean(filename,240).toLowerCase();
  if(name.endsWith('.m4a')&&M4A_BROWSER_MIME_ALIASES.has(mime))return 'audio/mp4';
  return '';
}
export function isAllowedOutboundMetaMime(value){return OUTBOUND_MEDIA_MIME.has(normalizedMime(value))}

export function validateOutboundMetaMediaContent(mimeType,value){
  const mime=normalizedMime(mimeType);
  if(!OUTBOUND_MEDIA_MIME.has(mime))throw new MetaMediaError('meta_media_type_not_allowed');
  const bytes=strictBytes(value);
  let valid=false;
  if(mime==='image/png')valid=startsWithBytes(bytes,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  else if(mime==='image/jpeg')valid=startsWithBytes(bytes,[0xff,0xd8,0xff]);
  else if(mime==='application/pdf')valid=startsWithAscii(bytes,'%PDF-');
  else if(mime==='audio/ogg')valid=startsWithAscii(bytes,'OggS');
  else if(mime==='audio/amr')valid=startsWithAscii(bytes,'#!AMR\n')||startsWithAscii(bytes,'#!AMR-WB\n');
  else if(mime==='audio/aac')valid=startsWithAscii(bytes,'ADIF')||(bytes.byteLength>=2&&bytes[0]===0xff&&(bytes[1]&0xf6)===0xf0);
  else if(mime==='audio/mpeg')valid=startsWithAscii(bytes,'ID3')||(bytes.byteLength>=2&&bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0);
  else if(mime==='audio/mp4')valid=bytes.byteLength>=12&&bytes[4]===0x66&&bytes[5]===0x74&&bytes[6]===0x79&&bytes[7]===0x70;
  if(!valid)throw new MetaMediaError('meta_media_content_mismatch');
  return true;
}

export function isAllowedMetaMediaUrl(value){
  try{
    const url=new URL(String(value||''));
    if(url.protocol!=='https:'||url.username!==''||url.password!=='')return false;
    const host=url.hostname.toLowerCase();
    return host==='graph.facebook.com'||host.endsWith('.facebook.com')||host==='lookaside.fbsbx.com'||host.endsWith('.fbsbx.com')||host.endsWith('.fbcdn.net')||host==='whatsapp.net'||host.endsWith('.whatsapp.net');
  }catch{return false}
}

async function safeJson(response){try{return await response.json()}catch{return {}}}

export async function fetchMetaMediaInfo({accessToken,graphVersion,mediaId,fetchFn=fetch,timeoutMs=15000}={}){
  const token=clean(accessToken,12000);if(!token)throw new MetaMediaError('meta_media_token_missing');
  const version=strictGraphVersion(graphVersion);const id=strictMediaId(mediaId);
  let response;
  try{
    response=await fetchFn(`https://graph.facebook.com/${version}/${encodeURIComponent(id)}`,{
      method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(timeoutMs)
    });
  }catch(error){if(error instanceof MetaMediaError)throw error;throw new MetaMediaError('meta_media_info_network_error',{retryable:true})}
  if(!response.ok){const body=await safeJson(response);const code=clean(body?.error?.code,40)||String(response.status);throw new MetaMediaError(`meta_media_info_http_${code}`,{status:response.status,retryable:response.status>=500})}
  const body=await safeJson(response);const url=clean(body?.url,4000);if(!isAllowedMetaMediaUrl(url))throw new MetaMediaError('meta_media_url_not_allowed');
  const resolvedId=clean(body?.id,240)||id;const fileSize=Number(body?.file_size);
  return {mediaId:resolvedId,url,mimeType:clean(body?.mime_type,180)||null,sha256:clean(body?.sha256,240)||null,fileSize:Number.isFinite(fileSize)&&fileSize>=0?fileSize:null};
}

export async function fetchMetaMediaResponse({accessToken,url,fetchFn=fetch,timeoutMs=15000}={}){
  const token=clean(accessToken,12000);if(!token)throw new MetaMediaError('meta_media_token_missing');
  const target=clean(url,4000);if(!isAllowedMetaMediaUrl(target))throw new MetaMediaError('meta_media_url_not_allowed');
  let response;
  try{
    response=await fetchFn(target,{method:'GET',headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
  }catch(error){if(error instanceof MetaMediaError)throw error;throw new MetaMediaError('meta_media_download_network_error',{retryable:true})}
  if(!response.ok)throw new MetaMediaError(`meta_media_download_http_${response.status}`,{status:response.status,retryable:response.status>=500});
  return response;
}

export async function uploadMetaMedia({accessToken,graphVersion,phoneNumberId,mimeType,filename,bytes,fetchFn=fetch,timeoutMs=20000}={}){
  const token=clean(accessToken,12000);if(!token)throw new MetaMediaError('meta_media_token_missing');
  const version=strictGraphVersion(graphVersion);const phoneId=strictPhoneNumberId(phoneNumberId);
  const safeName=strictFilename(filename);
  const mime=canonicalOutboundMetaMime(mimeType,safeName);if(!OUTBOUND_MEDIA_MIME.has(mime))throw new MetaMediaError('meta_media_type_not_allowed');
  const bodyBytes=strictBytes(bytes);
  validateOutboundMetaMediaContent(mime,bodyBytes);
  const form=new FormData();
  form.set('messaging_product','whatsapp');
  form.set('type',mime);
  form.set('file',new Blob([bodyBytes],{type:mime}),safeName);
  let response;
  try{
    response=await fetchFn(`https://graph.facebook.com/${version}/${phoneId}/media`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`},body:form,redirect:'error',signal:AbortSignal.timeout(timeoutMs)
    });
  }catch(error){if(error instanceof MetaMediaError)throw error;throw new MetaMediaError('meta_media_upload_network_error',{retryable:true})}
  if(!response.ok){const payload=await safeJson(response);const code=clean(payload?.error?.code,40)||String(response.status);throw new MetaMediaError(`meta_media_upload_http_${code}`,{status:response.status,retryable:response.status>=500||response.status===429})}
  const payload=await safeJson(response);const mediaId=clean(payload?.id,240);if(!mediaId)throw new MetaMediaError('meta_media_upload_invalid_response');
  return {ok:true,provider:'meta',mediaId,mimeType:mime,filename:safeName,sizeBytes:bodyBytes.byteLength};
}
