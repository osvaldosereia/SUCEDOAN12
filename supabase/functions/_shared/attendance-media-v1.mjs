const PROVIDER_MEDIA_HOSTS=new Set(['storageserver.bkpppai.me']);
const ALLOWED_MIME_TYPES=new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/x-wav',
  'video/mp4',
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip','application/octet-stream'
]);

export function normalizedAttendanceMime(value){
  return String(value??'').split(';',1)[0].trim().toLowerCase();
}

export function isAllowedAttendanceMime(value){
  return ALLOWED_MIME_TYPES.has(normalizedAttendanceMime(value));
}

export function isAllowedProviderMediaUrl(value){
  try{
    const url=new URL(String(value??''));
    return url.protocol==='https:'&&PROVIDER_MEDIA_HOSTS.has(url.hostname.toLowerCase())&&url.username===''&&url.password==='';
  }catch{return false}
}

export function safeAttendanceFilename(value){
  const raw=String(value??'').replace(/\\/g,'/').split('/').pop()?.trim()||'arquivo';
  const ascii=raw.normalize('NFKD').replace(/\p{M}+/gu,'');
  const safe=ascii.replace(/[\u0000-\u001f\u007f]/g,'').replace(/[^A-Za-z0-9._()\- ]/g,'_').replace(/\s+/g,' ').slice(0,180).trim();
  return safe||'arquivo';
}

function findMediaObject(value,depth=0){
  if(depth>7||value===null||value===undefined)return null;
  if(Array.isArray(value)){
    for(const item of value.slice(0,80)){const found=findMediaObject(item,depth+1);if(found)return found}
    return null;
  }
  if(typeof value!=='object')return null;
  const url=typeof value.media_url==='string'?value.media_url:null;
  if(url)return {media_url:url,mime_type:value.mimetype??value.mime_type??null,filename:value.filename??null};
  for(const item of Object.values(value)){const found=findMediaObject(item,depth+1);if(found)return found}
  return null;
}

export function findProviderMediaDescriptor(payload){
  const found=findMediaObject(payload);
  if(!found||!isAllowedProviderMediaUrl(found.media_url))return null;
  const mime=normalizedAttendanceMime(found.mime_type);
  if(!isAllowedAttendanceMime(mime))return null;
  return {provider_url:found.media_url,mime_type:mime,filename:safeAttendanceFilename(found.filename)};
}

export async function readBodyLimited(response,maxBytes){
  const declared=Number(response.headers.get('content-length')||0);
  if(Number.isFinite(declared)&&declared>maxBytes)throw new Error('media_too_large');
  if(!response.body){const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>maxBytes)throw new Error('media_too_large');return bytes}
  const reader=response.body.getReader();const chunks=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;if(!value)continue;total+=value.byteLength;if(total>maxBytes){try{await reader.cancel()}catch{}throw new Error('media_too_large')}chunks.push(value)}
  const out=new Uint8Array(total);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.byteLength}return out;
}
