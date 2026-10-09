/* DA6 — worker de uma fila privada, determinístico, sem IA e sem alterar estoque/bling.
 * Invocar apenas após autenticação de serviço no gateway canônico.
 */
import {readDA6} from './inventory-label-worker-omr.ts';
const LABEL_BUCKET='inventory-label-photos';
let magickPromise:Promise<any>|null=null;
async function magick(){
 if(!magickPromise)magickPromise=(async()=>{
  const m=await import('npm:@imagemagick/magick-wasm@0.0.44');
  const wasm=await Deno.readFile(new URL('magick.wasm',import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.44')));
  await m.initializeImageMagick(wasm);
  return m;
 })();
 try{return await magickPromise}catch(e){magickPromise=null;throw e}
}
async function rgba(bytes:Uint8Array){
 const m=await magick();
 return m.ImageMagick.read(bytes,(image:any)=>{
  const maxSide=Math.max(image.width,image.height);
  if(maxSide>1400){
   const factor=1400/maxSide;
   image.resize(Math.max(1,Math.round(image.width*factor)),Math.max(1,Math.round(image.height*factor)));
  }
  const width=image.width,height=image.height;
  if(width<300||height<300||width*height>2400000)throw Error('invalid_image_dimensions');
  const result=image.write(m.MagickFormat.Rgba,(data:Uint8Array)=>new Uint8ClampedArray(data));
  if(result.length!==width*height*4)throw Error('invalid_rgba_decode');
  return {width,height,data:result};
 });
}
// Exposto para homologação do codec PNG/JPEG/WebP no próprio Deno Edge Runtime.
export const decodeDA6ImagePixels=rgba;

async function sha256(bytes:Uint8Array){
 const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',copy.buffer));
 return [...hash].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function processPhoto(db:any,claim:any){
 const photoId=claim.photo_id,token=claim.claim_token;
 try{
  const entry=await db.from('inventory_label_photos').select('sha256,size_bytes').eq('id',photoId).single();
  if(entry.error||!entry.data)throw Error('photo_record_missing');
  const stored=await db.storage.from(LABEL_BUCKET).download(claim.storage_path);
  if(stored.error||!stored.data)throw Error('storage_read_failed');
  const bytes=new Uint8Array(await stored.data.arrayBuffer());
  if(bytes.length!==Number(entry.data.size_bytes)||bytes.length>10*1024*1024)throw Error('image_size_mismatch');
  if(await sha256(bytes)!==entry.data.sha256)throw Error('image_hash_mismatch');
  const pixels=await rgba(bytes);
  const qrModule=await import('npm:jsqr@1.4.0');
  const jsQR=(qrModule.default??qrModule) as unknown as (data:Uint8ClampedArray,width:number,height:number,options?:any)=>any;
  if(typeof jsQR!=='function')throw Error('qr_decoder_unavailable');
  const threshold=[105,90,125][Math.max(0,Math.min(2,Number(claim.attempt_no||1)-1))];
  const reading=readDA6(pixels,jsQR,threshold);
  const finished=await db.rpc('inventory_label_finish_photo',{
   p_photo_id:photoId,p_claim_token:token,
   p_product_id:reading.product_id,p_label_serial:reading.label_serial,
   p_readings:reading.readings,p_errors:reading.errors||[]
  });
  if(finished.error)throw Error('persist_reading_failed:'+finished.error.code);
  return {photo_id:photoId,status:finished.data?.status||'complete',readings:reading.readings.length};
 }catch(error){
  const reason=String(error instanceof Error?error.message:error).slice(0,200);
  const failed=await db.rpc('inventory_label_fail_photo',{
   p_photo_id:photoId,p_claim_token:token,p_error_code:reason.split(':')[0].slice(0,70),p_error_detail:reason
  });
  if(failed.error)return {photo_id:photoId,status:'error',error_code:'retry_register_failed'};
  return {photo_id:photoId,status:failed.data};
 }
}
export async function inventoryLabelWorkerTick(db:any,limit=3){
 const results=[];
 const n=Number.isFinite(Number(limit))?Math.min(4,Math.max(1,Math.floor(Number(limit)))):3;
 for(let i=0;i<n;i++){
  const claim=await db.rpc('inventory_label_claim_next');
  if(claim.error)throw Error('worker_claim_failed:'+claim.error.code);
  const item=Array.isArray(claim.data)?claim.data[0]:claim.data;
  if(!item)break;
  results.push(await processPhoto(db,item));
 }
 return {ok:true,processed:results.length,results};
}
