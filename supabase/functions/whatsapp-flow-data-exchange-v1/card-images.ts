import {hydrateExperienceImages,loadFlowCompatibleImageBase64,loadFlowSelectorImageBase64} from "./image.ts";

// V29 FAST: keep list media deliberately tiny. A Flow response is encrypted and
// transported over the phone's current network, so total payload matters more
// than individual image quality on compact rows.
const COMPACT_LIST_MAX_BASE64_CHARS=18_000;
const COMPACT_LIST_TOTAL_BASE64_CHARS=180_000;

function isUuid(value:string):boolean{return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}

async function mapLimited<T,R>(values:T[],limit:number,fn:(value:T,index:number)=>Promise<R>):Promise<R[]>{
 const output=new Array<R>(values.length);let cursor=0;
 const workers=Array.from({length:Math.min(limit,values.length)},async()=>{while(true){const index=cursor++;if(index>=values.length)return;output[index]=await fn(values[index],index);}});
 await Promise.all(workers);return output;
}

async function hydrateNavigationProductItems(items:unknown[],supabaseUrl:string):Promise<unknown[]>{
 let budget=COMPACT_LIST_TOTAL_BASE64_CHARS;
 // Limit concurrency to two: on a cold Edge worker this avoids 20 simultaneous
 // storage/source requests competing with the encrypted response path.
 return await mapLimited(items.slice(0,20),2,async(item)=>{
  if(!item||typeof item!=="object"||Array.isArray(item))return item;
  const row={...(item as Record<string,unknown>)};const productId=String(row.id||"").trim();
  const startRaw=row.start;if(!startRaw||typeof startRaw!=="object"||Array.isArray(startRaw))return row;
  const start={...(startRaw as Record<string,unknown>)};const imageUrl=String(start.image_url||"").trim().slice(0,2000);const existing=String(start.image||"").trim();
  delete start.image_url;delete start.src;
  if(existing&&(existing.length>COMPACT_LIST_MAX_BASE64_CHARS||existing.length>budget))delete start.image;
  if(!start.image&&imageUrl&&budget>0){const assetKey=isUuid(productId)?`products/${productId}.jpg`:null;const image=await loadFlowSelectorImageBase64(imageUrl,supabaseUrl,assetKey);if(image&&image.length<=COMPACT_LIST_MAX_BASE64_CHARS&&image.length<=budget){start.image=image;budget-=image.length;}}
  row.start=start;return row;
 });
}

export async function hydrateExperienceImagesWithCards(response:unknown,supabaseUrl:string):Promise<unknown>{
 const raw=response as Record<string,unknown>;const screen=String(raw?.screen||"");
 // CESTAS is the critical first paint. V29 FAST intentionally skips Base64
 // hydration here: names/prices arrive immediately and no image fetch can hold
 // the modal on a white spinner. The selected basket gets its full image on the
 // next screen, where only one asset is loaded.
 let hydrated=response;
 if(screen==="CESTAS"&&raw?.data&&typeof raw.data==="object"&&!Array.isArray(raw.data)){
  const data=raw.data as Record<string,unknown>;
  if(Array.isArray(data.baskets))data.baskets=(data.baskets as unknown[]).map((item)=>{if(!item||typeof item!=="object"||Array.isArray(item))return item;const option={...(item as Record<string,unknown>)};delete option.image_url;delete option.image;return option;});
 }else hydrated=await hydrateExperienceImages(response,supabaseUrl);
 if(!hydrated||typeof hydrated!=="object"||Array.isArray(hydrated))return hydrated;
 const obj=hydrated as Record<string,unknown>;if(!obj.data||typeof obj.data!=="object"||Array.isArray(obj.data))return hydrated;
 const data=obj.data as Record<string,unknown>;const current=String(obj.screen||"");
 if(/^PRODUTOS_[A-L]$/.test(current)&&Array.isArray(data.product_items)){data.product_items=await hydrateNavigationProductItems(data.product_items as unknown[],supabaseUrl);return hydrated;}
 if(/^PRODUTO_[A-L]$/.test(current)){
  const productId=String(data.product_id||data.id||"").trim();const existing=String(data.product_image_base64||"").trim();
  if(existing){data.has_product_image=true;delete data.product_image_url;delete data.product_id;return hydrated;}
  const imageUrl=String(data.product_image_url||"").trim().slice(0,2000);const assetKey=isUuid(productId)?`products/${productId}.jpg`:null;const image=imageUrl?await loadFlowCompatibleImageBase64(imageUrl,supabaseUrl,assetKey):null;
  data.product_image_base64=image||"";data.has_product_image=Boolean(image);delete data.product_image_url;delete data.product_id;return hydrated;
 }
 return hydrated;
}
