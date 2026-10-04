import {attendanceAuthorizedFetch,attendanceJsonApi} from './attendance-auth.js?v=auth-refresh-v2';

const ADMIN_ATTENDANCE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-ops-v1';
const PRODUCT_IMAGE_MAX_BYTES=5*1024*1024;
const PRODUCT_IMAGE_MAX_DIMENSION=1600;
const PRODUCT_IMAGE_MIN_DIMENSION=640;
export const MAX_PRODUCT_BATCH=10;
export const SECURITY_STOP_ERRORS=new Set([
  'service_window_closed','human_send_not_homologated','media_provider_unavailable',
  'meta_canary_not_enabled','meta_media_canary_not_enabled','meta_canary_destination_blocked',
  'meta_transport_not_configured','meta_send_uncertain','rate_limited'
]);

const selected=new Map();
const failed=new Map();

function clean(value,max=240){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function money(value){return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function productPrice(product){return Number(product?.offer?.active?product?.offer?.price:product?.sale_price)||0}
function safeBaseName(value){return (clean(value,160)||'produto').replace(/[^\p{L}\p{N}._ -]+/gu,'_').replace(/\s+/g,'-').replace(/-+/g,'-').slice(0,120)||'produto'}
function randomPart(){return globalThis.crypto?.randomUUID?.().replace(/-/g,'').slice(0,14)||Math.random().toString(36).slice(2,16)}
function batchId(){return `product-${Date.now()}-${randomPart()}`}
function idempotencyKey(batch,productId,index,kind){return `product:${kind}:${batch}:${String(productId||index).replace(/[^A-Za-z0-9._:-]/g,'').slice(0,48)}:${index}`.slice(0,120)}
function canvas(width,height){const el=document.createElement('canvas');el.width=Math.max(1,Math.round(width));el.height=Math.max(1,Math.round(height));return el}
function fit(width,height,maxDimension){const longest=Math.max(width,height);if(longest<=maxDimension)return {width,height};const ratio=maxDimension/longest;return {width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))}}
function canvasBlob(source,quality){return new Promise((resolve,reject)=>source.toBlob(blob=>blob?resolve(blob):reject(new Error('product_image_encode_failed')),'image/jpeg',quality))}
function asError(code,payload=null){const error=new Error(code);error.code=code;error.payload=payload;return error}

export function formatAttendanceProductCaption(product){return `${clean(product?.name,180)||'Produto'} — ${money(productPrice(product))}`}
export function attendanceProductSelection(){return [...selected.values()]}
export function attendanceProductFailedSelection(){return [...failed.values()]}
export function isAttendanceProductSelected(productId){return selected.has(String(productId||''))}
export function clearAttendanceProductSelection(){selected.clear();failed.clear();return []}
export function toggleAttendanceProductSelection(product){
  const id=String(product?.id||'').trim();if(!id)return {ok:false,error:'product_id_required',items:attendanceProductSelection()};
  if(selected.has(id)){selected.delete(id);failed.delete(id);return {ok:true,selected:false,items:attendanceProductSelection()}}
  if(selected.size>=MAX_PRODUCT_BATCH)return {ok:false,error:'product_batch_limit',items:attendanceProductSelection()};
  selected.set(id,product);return {ok:true,selected:true,items:attendanceProductSelection()};
}

async function remoteImageBlob(url){
  const target=String(url||'').trim();if(!/^https:\/\//i.test(target))throw asError('product_image_unavailable');
  const response=await fetch(target,{method:'GET',mode:'cors',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
  if(!response.ok)throw asError(`product_image_http_${response.status}`);
  const blob=await response.blob();
  if(!String(blob.type||'').toLowerCase().startsWith('image/'))throw asError('product_image_invalid');
  if(blob.size<1||blob.size>20*1024*1024)throw asError('product_image_invalid');
  return blob;
}

async function productImageFile(product){
  const blob=await remoteImageBlob(product?.image_url);
  let bitmap;
  try{bitmap=await createImageBitmap(blob,{imageOrientation:'from-image'})}catch{throw asError('product_image_decode_failed')}
  try{
    let dims=fit(bitmap.width,bitmap.height,PRODUCT_IMAGE_MAX_DIMENSION);
    while(true){
      const target=canvas(dims.width,dims.height),ctx=target.getContext('2d',{alpha:false});
      if(!ctx)throw asError('product_image_encode_failed');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,target.width,target.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,target.width,target.height);
      for(const quality of [.86,.78,.70,.62,.54]){
        const encoded=await canvasBlob(target,quality);
        if(encoded.size<=PRODUCT_IMAGE_MAX_BYTES){
          return new File([encoded],`${safeBaseName(product?.name)}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
        }
      }
      const longest=Math.max(dims.width,dims.height);
      if(longest<=PRODUCT_IMAGE_MIN_DIMENSION)break;
      dims=fit(dims.width,dims.height,Math.max(PRODUCT_IMAGE_MIN_DIMENSION,Math.floor(longest*.82)));
    }
    throw asError('product_image_too_large');
  }finally{if(typeof bitmap?.close==='function')bitmap.close()}
}

async function sendMedia(conversationId,product,batch,index){
  const file=await productImageFile(product),form=new FormData();
  form.set('conversation_id',conversationId);
  form.set('idempotency_key',idempotencyKey(batch,product.id,index,'media'));
  form.set('file',file,file.name);
  form.set('caption',formatAttendanceProductCaption(product));
  const url=new URL(ADMIN_ATTENDANCE_API);url.searchParams.set('action','send_media');
  const response=await attendanceAuthorizedFetch(url,{method:'POST',body:form,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false)throw asError(data?.error||`attendance_${response.status}`,data);
  return {...data,mode:'image'};
}

async function sendText(conversationId,product,batch,index,reason='no_image'){
  const data=await attendanceJsonApi('send_text',{
    conversation_id:conversationId,
    text:formatAttendanceProductCaption(product),
    idempotency_key:idempotencyKey(batch,product.id,index,'text')
  },'POST');
  return {...data,mode:'text',fallback_reason:reason};
}

export async function sendAttendanceProduct({conversationId,product,batch,index=0}={}){
  const cid=String(conversationId||'').trim();if(!cid)throw asError('invalid_conversation_id');
  if(!product?.id)throw asError('product_id_required');
  if(!product?.image_url)return await sendText(cid,product,batch,index,'no_image');
  let prepared=true;
  try{return await sendMedia(cid,product,batch,index)}catch(error){
    const code=String(error?.code||error?.message||'');
    if(SECURITY_STOP_ERRORS.has(code)||code.startsWith('meta_')||code.startsWith('attendance_'))throw error;
    prepared=false;
    if(!prepared)return await sendText(cid,product,batch,index,'image_unavailable');
    throw error;
  }
}

export async function sendAttendanceProductBatch({conversationId,products=attendanceProductSelection(),serviceWindowOpen=false,onProgress=()=>{}}={}){
  const items=[...products].slice(0,MAX_PRODUCT_BATCH);
  if(!serviceWindowOpen)return {ok:false,error:'service_window_closed',sent:[],failed:items};
  if(!conversationId)return {ok:false,error:'invalid_conversation_id',sent:[],failed:items};
  if(!items.length)return {ok:false,error:'product_batch_empty',sent:[],failed:[]};
  const currentBatch=batchId(),sent=[],failedItems=[];
  failed.clear();
  let stoppedBy=null;
  for(const [index,product] of items.entries()){
    onProgress({phase:'sending',current:index+1,total:items.length,product,sent:sent.length,failed:failedItems.length});
    try{
      const result=await sendAttendanceProduct({conversationId,product,batch:currentBatch,index});
      sent.push({product,result});selected.delete(String(product.id));
    }catch(error){
      const code=String(error?.code||error?.message||'product_send_failed');
      const failure={product,error:code};failedItems.push(failure);failed.set(String(product.id),product);
      if(SECURITY_STOP_ERRORS.has(code)||code.startsWith('meta_send_uncertain')){
        stoppedBy=code;
        for(const remaining of items.slice(index+1)){if(!failed.has(String(remaining.id))){failed.set(String(remaining.id),remaining);failedItems.push({product:remaining,error:'not_attempted'})}}
        break;
      }
    }
  }
  onProgress({phase:'done',current:items.length,total:items.length,sent:sent.length,failed:failedItems.length,stoppedBy});
  return {ok:failedItems.length===0,sent,failed:failedItems,stopped_by:stoppedBy,batch_id:currentBatch};
}

export async function retryFailedAttendanceProducts(options={}){
  const products=attendanceProductFailedSelection();
  return await sendAttendanceProductBatch({...options,products});
}
