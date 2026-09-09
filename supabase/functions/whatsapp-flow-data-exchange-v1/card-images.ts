import {hydrateExperienceImages,loadFlowCompatibleImageBase64,loadFlowSelectorImageBase64} from "./image.ts";

const COMPACT_LIST_MAX_BASE64_CHARS=32_000;

function isUuid(value:string):boolean{
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function mapLimited<T,R>(values:T[],limit:number,fn:(value:T,index:number)=>Promise<R>):Promise<R[]>{
  const output=new Array<R>(values.length);
  let cursor=0;
  const workers=Array.from({length:Math.min(limit,values.length)},async()=>{
    while(true){
      const index=cursor++;
      if(index>=values.length)return;
      output[index]=await fn(values[index],index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function hydratePremiumProductOptions(items:unknown[],supabaseUrl:string):Promise<unknown[]>{
  return await mapLimited(items.slice(0,20),4,async(item)=>{
    if(!item||typeof item!=="object"||Array.isArray(item))return item;
    const option={...(item as Record<string,unknown>)};
    const alreadyHydrated=String(option.image||"").trim();
    const imageUrl=String(option.image_url||"").trim().slice(0,2000);
    const productId=String(option.id||"").trim();
    delete option.image_url;
    if(alreadyHydrated){
      if(alreadyHydrated.length>COMPACT_LIST_MAX_BASE64_CHARS)delete option.image;
      return option;
    }
    if(imageUrl){
      const assetKey=isUuid(productId)?`products/${productId}.jpg`:null;
      const image=await loadFlowSelectorImageBase64(imageUrl,supabaseUrl,assetKey);
      if(image&&image.length<=COMPACT_LIST_MAX_BASE64_CHARS)option.image=image;
    }
    return option;
  });
}

async function hydrateNavigationProductItems(items:unknown[],supabaseUrl:string):Promise<unknown[]>{
  return await mapLimited(items.slice(0,20),4,async(item)=>{
    if(!item||typeof item!=="object"||Array.isArray(item))return item;
    const row={...(item as Record<string,unknown>)};
    const productId=String(row.id||"").trim();
    const startRaw=row.start;
    if(!startRaw||typeof startRaw!=="object"||Array.isArray(startRaw))return row;
    const start={...(startRaw as Record<string,unknown>)};
    const imageUrl=String(start.image_url||"").trim().slice(0,2000);
    const existing=String(start.src||start.image||"").trim();
    delete start.image_url;
    delete start.image;
    if(existing&&existing.length<=COMPACT_LIST_MAX_BASE64_CHARS)start.src=existing;
    else delete start.src;
    if(!start.src&&imageUrl){
      const assetKey=isUuid(productId)?`products/${productId}.jpg`:null;
      const image=await loadFlowSelectorImageBase64(imageUrl,supabaseUrl,assetKey);
      if(image&&image.length<=COMPACT_LIST_MAX_BASE64_CHARS)start.src=image;
    }
    row.start=start;
    return row;
  });
}

export async function hydrateExperienceImagesWithCards(response:unknown,supabaseUrl:string):Promise<unknown>{
  const hydrated=await hydrateExperienceImages(response,supabaseUrl);
  if(!hydrated||typeof hydrated!=="object"||Array.isArray(hydrated))return hydrated;
  const obj=hydrated as Record<string,unknown>;
  if(!obj.data||typeof obj.data!=="object"||Array.isArray(obj.data))return hydrated;
  const data=obj.data as Record<string,unknown>;
  const screen=String(obj.screen||"");

  // V28: NavigationList product rows. Meta Flow JSON v7.3 requires
  // NavigationList.start = {src, alt-text}. Keep at most 20 small photos.
  if(/^PRODUTOS_[A-L]$/.test(screen)&&Array.isArray(data.product_items)){
    data.product_items=await hydrateNavigationProductItems(data.product_items as unknown[],supabaseUrl);
    return hydrated;
  }

  // V28: selected product opens as one larger image/detail card.
  if(/^PRODUTO_[A-L]$/.test(screen)){
    const imageUrl=String(data.product_image_url||"").trim().slice(0,2000);
    const productId=String(data.product_id||data.id||"").trim();
    const assetKey=isUuid(productId)?`products/${productId}.jpg`:null;
    const image=imageUrl?await loadFlowCompatibleImageBase64(imageUrl,supabaseUrl,assetKey):null;
    data.product_image_base64=image||"";
    data.has_product_image=Boolean(image);
    delete data.product_image_url;
    return hydrated;
  }

  // V27 premium compatibility.
  if(/^PRODUTOS_[ABC]$/.test(screen)&&Array.isArray(data.product_options)){
    data.product_options=await hydratePremiumProductOptions(data.product_options as unknown[],supabaseUrl);
    return hydrated;
  }

  // V26 compatibility: three standalone product cards remain untouched.
  if(!/^PRODUTOS_[ABC]$/.test(screen)||Array.isArray(data.products))return hydrated;

  await Promise.all([1,2,3].map(async(index)=>{
    const prefix=`p${index}`;
    const imageUrl=String(data[`${prefix}_image_url`]||"").trim().slice(0,2000);
    const productId=String(data[`${prefix}_id`]||"").trim();
    const visible=data[`${prefix}_visible`]===true;
    let image:string|null=null;
    if(visible&&imageUrl){
      const assetKey=isUuid(productId)?`products/${productId}.jpg`:null;
      image=await loadFlowSelectorImageBase64(imageUrl,supabaseUrl,assetKey);
    }
    data[`${prefix}_image_base64`]=image||"";
    data[`${prefix}_has_image`]=Boolean(image);
    delete data[`${prefix}_image_url`];
  }));
  return hydrated;
}
