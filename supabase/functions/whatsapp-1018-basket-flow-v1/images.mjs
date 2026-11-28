// Public catalog images only. The host and object paths are fixed to the two
// sources already used by products.image_url; never fetch arbitrary URLs.
export const MAX_PRODUCT_IMAGE_BYTES=27_000;
const SUPABASE_HOST='ssbesxgaijknwsjbsbcz.supabase.co';
const SUPABASE_PREFIX='/storage/v1/object/public/product-images/';
const GITHUB_HOST='raw.githubusercontent.com';
const ACCEPT='image/webp,image/png,image/jpeg';

function imageUrl(value){
 let url;
 try{url=new URL(String(value||''))}catch{return null}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash)return null;
 let path;
 try{path=decodeURIComponent(url.pathname)}catch{return null}
 if(path.includes('\\')||path.split('/').some(part=>part==='.'||part==='..'))return null;
 const ext=path.toLowerCase().slice(path.lastIndexOf('.')+1);
 if(!['webp','png','jpg','jpeg'].includes(ext))return null;
 if(url.hostname===SUPABASE_HOST){
  if(!path.startsWith(SUPABASE_PREFIX)||path.length<=SUPABASE_PREFIX.length)return null;
 }else if(url.hostname===GITHUB_HOST){
  if(!/^\/osvaldosereia\/SUCEDOAN12\/[a-f0-9]{40}\/site\/img\/produtos_[0-9]+\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:webp|png|jpe?g)$/i.test(path))return null;
 }else return null;
 if(url.hostname===SUPABASE_HOST){
  url.pathname=url.pathname.replace('/storage/v1/object/public/','/storage/v1/render/image/public/');
  url.searchParams.set('width','240');
  url.searchParams.set('height','190');
  url.searchParams.set('resize','contain');
  url.searchParams.set('quality','60');
  url.searchParams.set('format','webp');
  return {href:url.href,extension:'webp'};
 }
 return {href:url.href,extension:ext};
}

function mimeMatches(extension,contentType){
 const expected=extension==='webp'?'image/webp':extension==='png'?'image/png':'image/jpeg';
 return String(contentType||'').split(';',1)[0].trim().toLowerCase()===expected;
}

function validImageBytes(bytes,extension){
 if(extension==='webp')return bytes.length>=12&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP';
 if(extension==='png')return bytes.length>=8&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10;
 return bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
}

async function discard(response){try{await response?.body?.cancel()}catch{}}
async function readLimited(body){
 if(!body)return null;
 const reader=body.getReader(),chunks=[];let total=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>MAX_PRODUCT_IMAGE_BYTES){try{await reader.cancel()}catch{}return null}
   chunks.push(value);
  }
 }catch{return null}
 finally{try{reader.releaseLock()}catch{}}
 if(!total)return null;
 const bytes=new Uint8Array(total);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return bytes;
}

function toBase64(bytes){
 let binary='';
 for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
 return btoa(binary);
}

export async function loadProductImage(value,fetchImpl=globalThis.fetch){
 const target=imageUrl(value);
 if(!target||typeof fetchImpl!=='function')return '';
 let response;
 try{
  response=await fetchImpl(target.href,{
   method:'GET',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(1800),
   headers:{accept:ACCEPT}
  });
 }catch{return ''}
 if(!response?.ok||response.redirected||(response.url&&response.url!==target.href)){
  await discard(response);return '';
 }
 const declared=response.headers?.get('content-length')||'';
 if(/^\d+$/.test(declared)&&Number(declared)>MAX_PRODUCT_IMAGE_BYTES){await discard(response);return ''}
 if(!mimeMatches(target.extension,response.headers?.get('content-type'))){await discard(response);return ''}
 const bytes=await readLimited(response.body);
 if(!bytes||!validImageBytes(bytes,target.extension))return '';
 return toBase64(bytes);
}
